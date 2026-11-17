/**
 * Scenario engine: turns a configuration (interface, CVM, outcome, PIN) into an ordered list of steps.
 * Every hex value shown in the UI is computed here from fictitious test keys - nothing is hard-coded ciphertext.
 * The UI only renders this list; it contains no payment logic.
 */
import { l, type L } from '../i18n';
import { STAGES, type Check, type Config, type CryptoOp, type Field, type Msg, type Step } from './types';
import { ascii2hex, byteLen, hexByte, luhn, retailMac, tdesDec, tdesEnc, xor } from './crypto/primitives';
import { deriveDukpt, ksnWithCounter } from './crypto/dukpt';
import { pinBlock0 } from './crypto/pin';
import { appCryptogram, arpc1, deriveCardKey, deriveSessionKey } from './crypto/emv';
import { ser, tlv } from './emv/tlv';

/** Fictitious test material. The BDK/KSN pair is the public ANSI X9.24 test vector. */
export const TEST = {
  BDK: '0123456789ABCDEFFEDCBA9876543210',
  KSN: ksnWithCounter('FFFF9876543210E00000', 8),
  IMK_AC: '9E15204313F7318ACB79B90BD986AD29',
  AWK: '1A2B3C4D5E6F70818293A4B5C6D7E8F9', // zone PIN key acquirer <-> network
  IWK: 'F1E2D3C4B5A69788796A5B4C3D2E1F00', // zone PIN key network <-> issuer
  MACK: '5B7C9D1E3F5A7B9C1D3E5F7A9B1C3D5E',
  PAN: '541333008900001' + luhn('541333008900001'),
  PSN: '01',
  EXP: '291231',
  ATC: '001E',
  UN: '9A3F1C27',
  AID: 'A0000000041010',
  TID: 'DEMO0042',
  MID: 'CAFE00000000001',
  STAN: '004217',
  AMOUNT: '000000000500',
};

const now = new Date();
const p2 = (n: number) => String(n).padStart(2, '0');
const YYMMDD = p2(now.getFullYear() % 100) + p2(now.getMonth() + 1) + p2(now.getDate());
const HHMMSS = p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds());
const RRN = YYMMDD.slice(1, 2) + '321' + p2(now.getHours()) + TEST.STAN;

const A = (c: Partial<Field> & { name: string; value: string }): Field => ({ kind: 'std', ...c });

/** Splits a command APDU into its inspectable parts (ISO/IEC 7816-4). */
function cmd(cla: string, ins: string, insName: string, p1: string, p1d: L, p2v: string, p2d: L, data?: { value: string; desc: L; sensitive?: boolean }, le = true): Field[] {
  const f: Field[] = [
    A({ name: 'CLA', value: cla, desc: cla === '00' ? l('Class byte 00: inter-industry command defined by ISO/IEC 7816-4.', 'Octet de classe 00 : commande inter-industrie définie par ISO/IEC 7816-4.') : l('Class byte 80: command defined by the EMV specification.', 'Octet de classe 80 : commande définie par la spécification EMV.') }),
    A({ name: 'INS', value: ins, desc: l(`Instruction: ${insName}.`, `Instruction : ${insName}.`) }),
    A({ name: 'P1', value: p1, desc: p1d }),
    A({ name: 'P2', value: p2v, desc: p2d }),
  ];
  if (data) {
    f.push(A({ name: 'Lc', value: hexByte(byteLen(data.value)), desc: l(`Length of the data field: ${byteLen(data.value)} bytes.`, `Longueur du champ de données : ${byteLen(data.value)} octets.`) }));
    f.push(A({ name: 'Data', value: data.value, desc: data.desc, sensitive: data.sensitive }));
  }
  if (le) f.push(A({ name: 'Le', value: '00', desc: l('Expected response length: 00 = as much as available.', 'Longueur de réponse attendue : 00 = tout ce qui est disponible.') }));
  return f;
}

export function pinModeOf(c: Config): 'none' | 'online' | 'offline' {
  if (c.iface === 'contact') return c.contactPin;
  return c.clPin ? 'online' : 'none';
}

/** Stage names in the order this configuration runs them. */
export function stageNames(c: Config): L[] {
  const n = [...STAGES];
  if (c.iface !== 'contact' && c.clPin) [n[2], n[3]] = [n[3], n[2]];
  return n;
}

export function buildScenario(config: Config, pinEntered: string): Step[] {
  const iface = config.iface ?? 'contactless';
  const cl = iface === 'contactless';
  const pinMode = pinModeOf({ ...config, iface });
  const pin = pinEntered || '0000';
  const approved = config.outcome === 'approved';
  const rc = approved ? '00' : config.outcome === 'funds' ? '51' : '59';
  const arc = ascii2hex(rc);
  const steps: Step[] = [];

  // ---------- computed transaction data ----------
  const aip = cl ? '1980' : '3D00';
  const tvr = pinMode === 'online' ? '0000040000' : '0000000000';
  const cdol = TEST.AMOUNT + '000000000000' + '0250' + tvr + '0978' + YYMMDD + '00' + TEST.UN;
  const ck = deriveCardKey(TEST.IMK_AC, TEST.PAN, TEST.PSN);
  const sk = deriveSessionKey(ck.mk, TEST.ATC);
  const acData = cdol + aip + TEST.ATC;
  const ac = appCryptogram(sk.sk, acData);
  const arqc = ac.mac;
  const iad = '0110A04003220000000000000000000000FF';
  const arpc = arpc1(sk.sk, arqc, arc);
  const tc = appCryptogram(sk.sk, acData + arc).mac;
  const cvmRes = pinMode === 'online' ? '420300' : pinMode === 'offline' ? '410302' : '1F0302';
  const track2 = TEST.PAN + 'D' + TEST.EXP.slice(0, 4) + '2010000000000F';

  const pb = pinBlock0(pin, TEST.PAN);
  const dk = deriveDukpt(TEST.BDK, TEST.KSN);
  const encPin = tdesEnc(dk.pinKey, pb.clear);
  const pinAwk = tdesEnc(TEST.AWK, tdesDec(dk.pinKey, encPin));
  const pinIwk = tdesEnc(TEST.IWK, tdesDec(TEST.AWK, pinAwk));

  const f55 = [
    tlv('9F26', arqc), tlv('9F27', '80'), tlv('9F10', iad), tlv('9F37', TEST.UN), tlv('9F36', TEST.ATC),
    tlv('95', tvr), tlv('9A', YYMMDD), tlv('9C', '00'), tlv('9F02', TEST.AMOUNT), tlv('5F2A', '0978'),
    tlv('82', aip), tlv('9F1A', '0250'), tlv('9F34', cvmRes),
  ];
  const f55hex = f55.map(ser).join('');

  const amountScreen = { tone: 'idle' as const, l1: l('AMOUNT  €5.00', 'MONTANT  5,00 €'), l2: l('Present card', 'Présentez la carte') };
  const busy = (l1: L, l2?: L) => ({ tone: 'busy' as const, l1, l2 });
  const procScreen = busy(l('Reading card…', 'Lecture carte…'), l('Do not remove', 'Ne pas retirer'));
  const onlineScreen = busy(l('Authorising…', 'Autorisation…'), l('Please wait', 'Veuillez patienter'));

  const S = (s: Omit<Step, 'dur' | 'tags' | 'active'> & Partial<Pick<Step, 'dur' | 'tags' | 'active'>>) =>
    steps.push({ dur: 5200, tags: [], active: [s.from, s.to].filter(Boolean) as Step['active'], ...s });

  // ================= STAGE 1 =================
  S({
    id: 'amount', stage: 1, kind: 'msg', from: 'pos', to: 'terminal', screen: amountScreen,
    title: l('The merchant enters €5.00', 'Le commerçant saisit 5,00 €'),
    question: l('How does a payment begin?', 'Comment commence un paiement ?'),
    beginner: l('You are buying a coffee for €5. The merchant types the amount on the till, which passes it to the payment terminal. The terminal wakes up and waits for your card.', 'Vous achetez un café à 5 €. Le commerçant saisit le montant sur sa caisse, qui le transmet au terminal de paiement. Le terminal se réveille et attend votre carte.'),
    expert: l('The merchant POS sends a sale request to the terminal over a local link (USB, serial, Bluetooth, LAN or an on-device intent on Android terminals). It carries amount, currency and a reference. The POS application sits outside the secure boundary: it never handles PIN or keys.', 'La caisse envoie une demande de vente au terminal via un lien local (USB, série, Bluetooth, LAN, ou un intent sur les terminaux Android). Elle contient le montant, la devise et une référence. L’application de caisse est hors du périmètre sécurisé : elle ne manipule ni PIN ni clés.'),
    tags: ['ECR protocol', 'ISO 4217', 'Secure boundary'],
    msg: {
      name: 'Sale request', protocol: l('ECR ↔ terminal protocol (vendor-specific)', 'Protocole caisse ↔ terminal (propre au fournisseur)'),
      security: [l('Local link; no cardholder data in this message', 'Lien local ; aucune donnée porteur dans ce message')],
      fields: [
        A({ name: 'type', value: 'SALE', kind: 'impl', desc: l('Operation requested by the till.', 'Opération demandée par la caisse.') }),
        A({ name: 'amount', value: '500', kind: 'impl', desc: l('Minor units: 500 cents.', 'Unités mineures : 500 centimes.') }),
        A({ name: 'currency', value: '978 (EUR)', kind: 'impl', desc: l('ISO 4217 numeric code.', 'Code numérique ISO 4217.') }),
        A({ name: 'reference', value: 'TICKET-0113', kind: 'impl', desc: l('Lets the till match the result to its receipt.', 'Permet à la caisse de rattacher le résultat à son ticket.') }),
      ],
      note: l('There is no universal standard here: Nexo Retailer, OPI, ZVT and many vendor APIs coexist.', 'Pas de standard universel ici : Nexo Retailer, OPI, ZVT et de nombreuses API fournisseurs coexistent.'),
    },
  });

  S({
    id: 'present', stage: 1, kind: 'info', gate: 'card', active: ['card', 'terminal'], screen: amountScreen,
    title: l('Present your card', 'Présentez votre carte'),
    question: l('Tap or insert: what is the difference?', 'Sans contact ou insertion : quelle différence ?'),
    beginner: l('Your turn. Drag the card onto the contactless zone to tap, or into the slot to insert it. Tapping talks to the chip by radio over a few centimetres. Inserting touches the chip’s gold contacts. It is the same chip and the same security idea either way.', 'À vous. Faites glisser la carte sur la zone sans contact, ou dans la fente pour l’insérer. Le sans contact dialogue avec la puce par radio sur quelques centimètres. L’insertion touche les contacts dorés de la puce. C’est la même puce et le même principe de sécurité.'),
    expert: l('Contact uses ISO/IEC 7816 (T=0/T=1) and the EMV contact kernel. Contactless uses ISO/IEC 14443 at 13.56 MHz and a scheme-specific kernel (EMV Contactless Book C-2 for Mastercard, C-3 for Visa…). Contactless is optimised for speed: fewer exchanges, the card leaves the field before the online response, so there is no second GENERATE AC.', 'Le contact utilise ISO/IEC 7816 (T=0/T=1) et le kernel EMV contact. Le sans contact utilise ISO/IEC 14443 à 13,56 MHz et un kernel propre au réseau (EMV Contactless Book C-2 pour Mastercard, C-3 pour Visa…). Le sans contact est optimisé pour la vitesse : moins d’échanges, la carte quitte le champ avant la réponse en ligne, donc pas de second GENERATE AC.'),
    tags: ['ISO/IEC 7816', 'ISO/IEC 14443', 'EMV kernel'],
  });

  // ================= STAGE 2 =================
  S({
    id: 'activate', stage: 2, kind: 'msg', from: 'terminal', to: 'card', screen: procScreen,
    title: cl ? l('The radio field wakes the card', 'Le champ radio réveille la carte') : l('The chip powers up', 'La puce est mise sous tension'),
    question: cl ? l('What happens when you tap your card?', 'Que se passe-t-il quand vous approchez la carte ?') : l('What happens when you insert your card?', 'Que se passe-t-il quand vous insérez la carte ?'),
    beginner: cl
      ? l('Your card has no battery. The terminal’s radio field powers the chip, like a wireless charger. The chip wakes up and says “I am here”.', 'Votre carte n’a pas de pile. Le champ radio du terminal alimente la puce, comme un chargeur sans fil. La puce se réveille et dit « je suis là ».')
      : l('The terminal’s contacts touch the chip and give it power. The chip starts and introduces itself.', 'Les contacts du terminal touchent la puce et l’alimentent. La puce démarre et se présente.'),
    expert: cl
      ? l('ISO/IEC 14443 Type A activation: the reader polls with REQA, the card answers ATQA, anticollision returns the UID, SELECT returns SAK, then RATS/ATS opens the ISO-DEP channel that carries APDUs. Many payment cards use a random UID.', 'Activation ISO/IEC 14443 Type A : le lecteur interroge avec REQA, la carte répond ATQA, l’anticollision renvoie l’UID, SELECT renvoie SAK, puis RATS/ATS ouvre le canal ISO-DEP qui transporte les APDU. Beaucoup de cartes de paiement utilisent un UID aléatoire.')
      : l('ISO/IEC 7816-3 cold reset: VCC, clock, then RST. The card returns its Answer To Reset (ATR), announcing protocol (T=0 or T=1) and timing parameters.', 'Reset à froid ISO/IEC 7816-3 : VCC, horloge, puis RST. La carte renvoie son Answer To Reset (ATR), qui annonce le protocole (T=0 ou T=1) et les paramètres de timing.'),
    tags: cl ? ['NFC', 'ISO/IEC 14443-A', 'ISO-DEP', '13.56 MHz'] : ['ISO/IEC 7816-3', 'ATR', 'T=0 / T=1'],
    msg: cl
      ? { name: 'Type A activation', protocol: 'ISO/IEC 14443-3 / -4', security: [l('No cryptography at this layer: radio range is the only limit', 'Aucune cryptographie à ce niveau : la portée radio est la seule limite')], fields: [
          A({ name: 'REQA →', value: '26', desc: l('7-bit “anyone there?” request.', 'Requête 7 bits « il y a quelqu’un ? ».') }),
          A({ name: '← ATQA', value: '0400', desc: l('Answer to request: card type and UID size.', 'Réponse : type de carte et taille de l’UID.') }),
          A({ name: 'ANTICOLL →', value: '9320', desc: l('Asks for the UID; resolves collisions if several cards are present.', 'Demande l’UID ; résout les collisions si plusieurs cartes sont présentes.') }),
          A({ name: '← UID', value: '08A1B2C3', desc: l('Starts with 08: random UID, changes at every tap.', 'Commence par 08 : UID aléatoire, change à chaque présentation.') }),
          A({ name: '← SAK', value: '20', desc: l('Bit 6 set: the card supports ISO/IEC 14443-4.', 'Bit 6 à 1 : la carte supporte ISO/IEC 14443-4.') }),
          A({ name: 'RATS →', value: 'E080', desc: l('Request for Answer To Select: opens the transport protocol.', 'Request for Answer To Select : ouvre le protocole de transport.') }),
          A({ name: '← ATS', value: '0578807002', desc: l('Frame size and timing the card supports.', 'Taille de trame et timings supportés par la carte.') }),
        ] }
      : { name: 'Answer To Reset', protocol: 'ISO/IEC 7816-3', security: [l('Physical contact inside the tamper-protected reader', 'Contact physique dans un lecteur protégé contre l’intrusion')], fields: [
          A({ name: 'TS', value: '3B', desc: l('Direct convention.', 'Convention directe.') }),
          A({ name: 'T0', value: '6E', desc: l('Which interface bytes follow; 14 historical bytes.', 'Quels octets d’interface suivent ; 14 octets historiques.') }),
          A({ name: 'TB1 TC1', value: '0000', desc: l('Programming voltage (unused) and extra guard time.', 'Tension de programmation (inutilisée) et temps de garde.') }),
          A({ name: 'Historical bytes', value: '80318066B0840C016E0183009000', kind: 'impl', desc: l('Card manufacturer information.', 'Informations du fabricant de la carte.') }),
        ] },
  });

  if (cl) {
    const ppse = ascii2hex('2PAY.SYS.DDF01');
    const resp = [tlv('6F', [tlv('84', ppse), tlv('A5', [tlv('BF0C', [tlv('61', [tlv('4F', TEST.AID), tlv('50', ascii2hex('MASTERCARD')), tlv('87', '01')])])])])];
    S({
      id: 'ppse', stage: 2, kind: 'apdu', from: 'terminal', to: 'card', screen: procScreen,
      title: l('“Which payment apps do you hold?”', '« Quelles applications de paiement avez-vous ? »'),
      question: l('How does the terminal know what kind of card this is?', 'Comment le terminal sait-il de quelle carte il s’agit ?'),
      beginner: l('The terminal asks the card for its menu of payment applications. The card answers with the brands it carries.', 'Le terminal demande à la carte la liste de ses applications de paiement. La carte répond avec les marques qu’elle embarque.'),
      expert: l('SELECT by name on the Proximity Payment System Environment “2PAY.SYS.DDF01”. The FCI lists Application Templates (tag 61), each with an AID and a priority. The terminal intersects this list with the AIDs it is configured for.', 'SELECT par nom sur le Proximity Payment System Environment « 2PAY.SYS.DDF01 ». Le FCI liste des Application Templates (tag 61), chacun avec un AID et une priorité. Le terminal croise cette liste avec les AID de sa configuration.'),
      tags: ['APDU', 'SELECT', 'PPSE', 'AID', 'FCI'],
      apdu: { name: 'SELECT PPSE', purpose: l('Discover the card’s payment applications', 'Découvrir les applications de paiement de la carte'), sw: '9000', resp,
        cmd: cmd('00', 'A4', 'SELECT', '04', l('Select by DF name.', 'Sélection par nom de DF.'), '00', l('First or only occurrence.', 'Première ou unique occurrence.'), { value: ppse, desc: l('ASCII “2PAY.SYS.DDF01”.', 'ASCII « 2PAY.SYS.DDF01 ».') }) },
    });
  }

  S({
    id: 'select', stage: 2, kind: 'apdu', from: 'terminal', to: 'card', screen: procScreen,
    title: l('Selecting the payment application', 'Sélection de l’application de paiement'),
    question: l('What is an AID?', 'Qu’est-ce qu’un AID ?'),
    beginner: l('The terminal picks one application and opens it, like choosing an app on a phone. From now on it talks to that application only.', 'Le terminal choisit une application et l’ouvre, comme on choisit une appli sur un téléphone. À partir de là, il ne parle plus qu’à elle.'),
    expert: cl
      ? l(`SELECT AID ${TEST.AID}. The first 5 bytes (RID A000000004) identify the scheme, the rest (PIX 1010) the product. Visa credit/debit would be A0000000031010. Some kernels receive a PDOL (tag 9F38) here listing what GET PROCESSING OPTIONS must carry.`, `SELECT AID ${TEST.AID}. Les 5 premiers octets (RID A000000004) identifient le réseau, le reste (PIX 1010) le produit. Visa crédit/débit serait A0000000031010. Certains kernels reçoivent ici un PDOL (tag 9F38) listant ce que GET PROCESSING OPTIONS doit transporter.`)
      : l(`On contact the terminal builds its candidate list either through the PSE “1PAY.SYS.DDF01” or by trying each AID it supports (shown here), then issues the final SELECT on ${TEST.AID}. RID A000000004 identifies the scheme, PIX 1010 the product.`, `En contact, le terminal construit sa liste de candidats soit via le PSE « 1PAY.SYS.DDF01 », soit en essayant chaque AID supporté (cas présenté), puis émet le SELECT final sur ${TEST.AID}. Le RID A000000004 identifie le réseau, le PIX 1010 le produit.`),
    tags: ['SELECT', 'AID', 'RID / PIX', 'PDOL'],
    apdu: { name: 'SELECT AID', purpose: l('Open the chosen payment application', 'Ouvrir l’application de paiement choisie'), sw: '9000',
      resp: [tlv('6F', [tlv('84', TEST.AID), tlv('A5', [tlv('50', ascii2hex('MASTERCARD')), tlv('87', '01')])])],
      cmd: cmd('00', 'A4', 'SELECT', '04', l('Select by DF name.', 'Sélection par nom de DF.'), '00', l('First or only occurrence.', 'Première ou unique occurrence.'), { value: TEST.AID, desc: l('The Application Identifier.', 'L’identifiant d’application.') }) },
  });

  const afl = '08010100' + '10010101';
  S({
    id: 'gpo', stage: 2, kind: 'apdu', from: 'terminal', to: 'card', screen: procScreen,
    title: l('Starting the transaction', 'Démarrage de la transaction'),
    question: l('How does the card say what it can do?', 'Comment la carte annonce-t-elle ses capacités ?'),
    beginner: l('The terminal says “let’s start a payment”. The card replies with its capabilities and tells the terminal where to find its data.', 'Le terminal dit « commençons un paiement ». La carte répond avec ses capacités et indique où trouver ses données.'),
    expert: l('GET PROCESSING OPTIONS returns the Application Interchange Profile (what the card supports) and the Application File Locator (which records to read). The card increments its ATC for this transaction.', 'GET PROCESSING OPTIONS renvoie l’Application Interchange Profile (ce que la carte supporte) et l’Application File Locator (quels enregistrements lire). La carte incrémente son ATC pour cette transaction.'),
    tags: ['GET PROCESSING OPTIONS', 'AIP', 'AFL', 'ATC'],
    apdu: { name: 'GET PROCESSING OPTIONS', purpose: l('Initiate the transaction inside the card', 'Initier la transaction dans la carte'), sw: '9000',
      resp: [tlv('77', [tlv('82', aip), tlv('94', afl)])],
      cmd: cmd('80', 'A8', 'GET PROCESSING OPTIONS', '00', l('Always 00.', 'Toujours 00.'), '00', l('Always 00.', 'Toujours 00.'), { value: '8300', desc: l('Tag 83 with the PDOL data. Empty here: this card asked for none.', 'Tag 83 avec les données du PDOL. Vide ici : cette carte n’en demande pas.') }) },
  });

  const rec = (id: string, sfi: number, body: Field[], title: L, beginner: L, expert: L, tags: string[]) =>
    S({
      id, stage: 2, kind: 'apdu', from: 'terminal', to: 'card', screen: procScreen, title,
      question: l('What does the terminal read from the card?', 'Que lit le terminal sur la carte ?'),
      beginner, expert, tags, dur: 4600,
      apdu: { name: `READ RECORD (SFI ${sfi}, #1)`, purpose: l('Read one record named by the AFL', 'Lire un enregistrement désigné par l’AFL'), sw: '9000', resp: [tlv('70', body)],
        cmd: cmd('00', 'B2', 'READ RECORD', '01', l('Record number 1.', 'Enregistrement numéro 1.'), hexByte((sfi << 3) | 4), l(`Short File Identifier ${sfi} in the 5 high bits; low bits 100 = “P1 is a record number”.`, `Short File Identifier ${sfi} dans les 5 bits de poids fort ; bits faibles 100 = « P1 est un numéro d’enregistrement ».`)) },
    });
  rec('read1', 1, [tlv('57', track2, { sensitive: true }), tlv('5A', TEST.PAN, { sensitive: true }), tlv('5F24', TEST.EXP), tlv('5F34', TEST.PSN), tlv('5F20', ascii2hex('CARDHOLDER/DEMO'))],
    l('Reading the card number', 'Lecture du numéro de carte'),
    l('The terminal reads the card number and expiry date. This is the same information printed on the card. It is not secret enough to pay with on its own here, which is why the card will add a one-time security code later.', 'Le terminal lit le numéro de carte et la date d’expiration. Ce sont les informations imprimées sur la carte. Elles ne suffisent pas à payer ici : la carte ajoutera plus loin un code de sécurité à usage unique.'),
    l('Record 1 holds Track 2 Equivalent Data, PAN, expiry and PAN sequence number. This is cardholder data: PCI DSS governs where it may be stored and how it is displayed (masked) once it leaves the terminal. With a wallet, 5A carries a device token (DPAN) that the scheme’s token service maps back to the real PAN.', 'L’enregistrement 1 contient Track 2 Equivalent Data, PAN, expiration et numéro de séquence. Ce sont des données porteur : PCI DSS encadre leur stockage et leur affichage (masqué) dès qu’elles quittent le terminal. Avec un wallet, 5A porte un jeton d’appareil (DPAN) que le service de tokenisation du réseau reconvertit en PAN réel.'),
    ['READ RECORD', 'PAN', 'Track 2', 'Tokenisation', 'PCI DSS']);
  rec('read2', 2, [tlv('8C', '9F02069F03069F1A0295055F2A029A039C019F3704'), tlv('8E', '000000000000000042031E031F03'), tlv('8F', 'F1'), tlv('90', 'A1B2C3D4…'), tlv('9F46', '5E6F7A8B…')],
    l('Reading the card’s rules', 'Lecture des règles de la carte'),
    l('The card also hands over its house rules: how the cardholder should be verified, and certificates that prove which bank issued it.', 'La carte fournit aussi son règlement intérieur : comment vérifier le porteur, et des certificats qui prouvent quelle banque l’a émise.'),
    l('Record 2 carries CDOL1 (the exact data the card wants in GENERATE AC), the CVM List (here: online PIN, then signature, then no CVM) and the RSA certificate chain for offline data authentication. Certificates are truncated in this view.', 'L’enregistrement 2 porte le CDOL1 (les données exactes attendues dans GENERATE AC), la CVM List (ici : PIN en ligne, puis signature, puis aucune CVM) et la chaîne de certificats RSA pour l’authentification hors ligne. Les certificats sont tronqués dans cette vue.'),
    ['CDOL1', 'CVM List', 'Certificates']);

  S({
    id: 'oda', stage: 2, kind: 'crypto', active: ['terminal', 'card'], screen: procScreen,
    title: l('Is this card genuine?', 'Cette carte est-elle authentique ?'),
    question: l('How does the terminal know that your card is genuine?', 'Comment le terminal sait-il que votre carte est authentique ?'),
    beginner: l('The terminal checks a chain of signatures, like checking a passport: the card network vouches for the bank, and the bank vouches for the card. A copied card cannot produce the right signature.', 'Le terminal vérifie une chaîne de signatures, comme pour un passeport : le réseau carte se porte garant de la banque, et la banque de la carte. Une carte copiée ne peut pas produire la bonne signature.'),
    expert: l('Offline data authentication uses RSA. The terminal holds the scheme CA public keys; it recovers the issuer public key from tag 90, then the ICC public key from tag 9F46. With CDA the card signs dynamic data together with the application cryptogram, so the check completes during GENERATE AC. This lane is asymmetric and is independent of the symmetric ARQC.', 'L’authentification hors ligne utilise RSA. Le terminal détient les clés publiques de l’AC du réseau ; il recouvre la clé publique émetteur depuis le tag 90, puis la clé publique de la carte depuis 9F46. En CDA, la carte signe des données dynamiques avec le cryptogramme applicatif : la vérification s’achève pendant GENERATE AC. Cette voie est asymétrique et indépendante de l’ARQC symétrique.'),
    tags: ['RSA', 'CA public key', 'SDA / DDA / CDA', 'Certificate chain'],
    crypto: [{
      mech: 'oda', simulated: true, by: 'terminal',
      title: l('Certificate chain recovery', 'Recouvrement de la chaîne de certificats'),
      inputs: [{ label: l('Issuer certificate (tag 90)', 'Certificat émetteur (tag 90)'), value: 'A1B2C3D4…' }, { label: l('ICC certificate (tag 9F46)', 'Certificat carte (tag 9F46)'), value: '5E6F7A8B…' }],
      key: { name: 'CA PK #F1', value: 'RSA 1984-bit public', type: l('Scheme CA public key, loaded in the terminal', 'Clé publique de l’AC du réseau, chargée dans le terminal') },
      op: l('RSA public-key recovery, twice, then SHA-1 hash comparison', 'Recouvrement RSA par clé publique, deux fois, puis comparaison de hachés SHA-1'),
      stages: [{ label: l('Recover issuer public key', 'Recouvrer la clé publique émetteur'), value: '6A 02 541333 … BC ✓' }, { label: l('Recover ICC public key', 'Recouvrer la clé publique carte'), value: '6A 04 5413330089… BC ✓' }],
      output: { label: l('ICC public key (trusted)', 'Clé publique carte (de confiance)'), value: 'RSA 1408-bit' },
      dest: l('Kept in the terminal to verify the card’s dynamic signature', 'Conservée dans le terminal pour vérifier la signature dynamique de la carte'),
      verify: l('Each certificate must decrypt to a well-formed block whose hash matches', 'Chaque certificat doit se déchiffrer en un bloc bien formé dont le haché correspond'),
      protects: l('Detects counterfeit and cloned cards without going online', 'Détecte les cartes contrefaites ou clonées sans aller en ligne'),
      notProtects: l('Says nothing about the account: balance, blocked status, stolen card', 'Ne dit rien du compte : solde, opposition, carte volée'),
    }],
    notes: [l('Values are illustrative: no real RSA key is used in this step. The crypto lab has a working toy RSA.', 'Valeurs illustratives : aucune vraie clé RSA n’est utilisée à cette étape. Le labo crypto contient un RSA jouet fonctionnel.'), l('Online-only terminals may skip offline authentication.', 'Les terminaux uniquement en ligne peuvent omettre l’authentification hors ligne.')],
  });

  const cvmBlock = (st: number) => {
  // ================= STAGE 3 =================
  if (pinMode === 'none') {
    S({
      id: 'nocvm', stage: st, kind: 'info', active: ['terminal'], screen: procScreen,
      title: l('No PIN needed this time', 'Pas de PIN cette fois'),
      question: l('Why did the terminal not ask for my PIN?', 'Pourquoi le terminal n’a-t-il pas demandé mon PIN ?'),
      beginner: l('€5 is a small amount, so the terminal does not ask for your PIN. Above a limit set by your country and bank (often €50 in Europe), it would. Switch on “PIN on contactless” in the settings to see that path.', '5 € est un petit montant : le terminal ne demande pas le PIN. Au-delà d’un plafond fixé par le pays et la banque (souvent 50 € en Europe), il le ferait. Activez « PIN en sans contact » dans les réglages pour voir ce parcours.'),
      expert: l('The amount is below the reader CVM required limit, so the kernel selects “No CVM” and records it in CVM Results (9F34 = 1F0302). The issuer still sees this and can decline or request a step-up: in Europe, strong customer authentication counters force a PIN after a cumulative amount or number of taps. Phones and watches use on-device verification (CDCVM) instead.', 'Le montant est sous le seuil CVM du lecteur : le kernel choisit « No CVM » et l’inscrit dans CVM Results (9F34 = 1F0302). L’émetteur le voit et peut refuser ou exiger un renforcement : en Europe, les compteurs d’authentification forte imposent un PIN après un cumul de montants ou de paiements. Téléphones et montres utilisent la vérification sur l’appareil (CDCVM).'),
      tags: ['CVM limit', 'CVM Results', 'SCA / PSD2', 'CDCVM'],
    });
  } else {
    const pinScreen = { tone: 'pin' as const, l1: l('ENTER PIN', 'SAISIR CODE'), l2: l('€5.00', '5,00 €') };
    S({
      id: 'pin', stage: st, kind: 'info', gate: 'pin', active: ['terminal'], screen: pinScreen,
      title: l('Enter your PIN', 'Saisissez votre code'),
      question: l('Does the terminal actually read your secret PIN?', 'Le terminal lit-il vraiment votre code secret ?'),
      beginner: l('Type any 4-digit code on the keypad, then press the green key. Each key press goes straight into a sealed security chip. The screen shows only stars. The merchant, the till and the payment app never see the digits.', 'Tapez un code à 4 chiffres sur le clavier, puis la touche verte. Chaque appui va directement dans une puce de sécurité scellée. L’écran n’affiche que des étoiles. Le commerçant, la caisse et l’application de paiement ne voient jamais les chiffres.'),
      expert: l('The keypad is wired to the secure processor of the PIN Entry Device (PCI PTS POI). While PIN entry is active the secure firmware owns the keypad and display; the application processor receives only “key pressed” events, never key values. Tamper sensors erase the keys if the casing is opened or drilled.', 'Le clavier est relié au processeur sécurisé du PIN Entry Device (PCI PTS POI). Pendant la saisie, le firmware sécurisé contrôle clavier et écran ; le processeur applicatif ne reçoit que des événements « touche appuyée », jamais leur valeur. Des capteurs d’intrusion effacent les clés si le boîtier est ouvert ou percé.'),
      tags: ['PCI PTS POI', 'Secure PED', 'Tamper response', 'Secure boundary'],
      notes: [l('Use a made-up code. Never type a real PIN into a simulator.', 'Utilisez un code inventé. Ne tapez jamais un vrai PIN dans un simulateur.')],
    });

    if (pinMode === 'offline') {
      S({
        id: 'verify', stage: st, kind: 'apdu', from: 'terminal', to: 'card', screen: busy(l('Checking PIN…', 'Vérification code…')),
        title: l('The card checks the PIN itself', 'La carte vérifie le code elle-même'),
        question: l('Who checks the PIN?', 'Qui vérifie le code ?'),
        beginner: l('Here the chip itself knows your PIN. The terminal hands the code to the chip, and the chip answers yes or no. The PIN never leaves the terminal.', 'Ici, la puce connaît elle-même votre code. Le terminal le lui transmet et la puce répond oui ou non. Le code ne quitte jamais le terminal.'),
        expert: l('Offline PIN: VERIFY carries an ISO 9564 format 2 PIN block. P2 = 80 sends it in plaintext over the contact interface, inside the tamper-protected reader. P2 = 88 enciphers it with the card’s RSA PIN encipherment key after GET CHALLENGE. The card replies 9000, or 63Cx with x tries left. Offline PIN is not available on contactless cards.', 'PIN hors ligne : VERIFY transporte un bloc PIN ISO 9564 format 2. P2 = 80 l’envoie en clair sur l’interface contact, à l’intérieur du lecteur protégé. P2 = 88 le chiffre avec la clé RSA de chiffrement PIN de la carte après GET CHALLENGE. La carte répond 9000, ou 63Cx avec x essais restants. Le PIN hors ligne n’existe pas en sans contact carte.'),
        tags: ['VERIFY', 'ISO 9564 format 2', 'Offline PIN', 'PIN try counter'],
        apdu: { name: 'VERIFY', purpose: l('Let the chip compare the PIN', 'Laisser la puce comparer le code'), sw: '9000', resp: [],
          cmd: cmd('00', '20', 'VERIFY', '00', l('Always 00.', 'Toujours 00.'), '80', l('80 = plaintext PIN block. 88 = enciphered PIN.', '80 = bloc PIN en clair. 88 = PIN chiffré.'), { value: ('2' + pin.length + pin).padEnd(16, 'F'), sensitive: true, desc: l('Format 2 PIN block: control nibble 2, PIN length, PIN digits, F padding. Exists only inside the secure reader.', 'Bloc PIN format 2 : quartet de contrôle 2, longueur, chiffres du PIN, bourrage F. N’existe que dans le lecteur sécurisé.') }, false) },
        notes: [l('Offline PIN is common on contact cards in France and the UK; many other markets use online PIN only.', 'Le PIN hors ligne est courant en contact en France et au Royaume-Uni ; beaucoup d’autres marchés n’utilisent que le PIN en ligne.')],
      });
    } else {
      S({
        id: 'pinblock', stage: st, kind: 'crypto', active: ['terminal'], screen: busy(l('PIN OK', 'Code saisi'), l('Securing…', 'Sécurisation…')),
        title: l('Locking the PIN to this card', 'Le code est lié à cette carte'),
        question: l('What is a PIN block?', 'Qu’est-ce qu’un bloc PIN ?'),
        beginner: l('Inside the security chip, your PIN is mixed with your card number. That way the protected code is only valid for this card and cannot be reused with another one.', 'Dans la puce de sécurité, votre code est mélangé à votre numéro de carte. Ainsi le code protégé ne vaut que pour cette carte et ne peut pas être réutilisé avec une autre.'),
        expert: l('ISO 9564-1 format 0: the PIN field (0, length, digits, F padding) is XORed with the PAN field (0000 + the 12 rightmost PAN digits without the check digit). The result is still clear text: the XOR binds PIN to PAN, it does not encrypt. Format 4 (AES) adds random padding and is replacing format 0.', 'ISO 9564-1 format 0 : le champ PIN (0, longueur, chiffres, bourrage F) est combiné par XOR au champ PAN (0000 + les 12 chiffres de droite du PAN hors clé de contrôle). Le résultat est encore en clair : le XOR lie le PIN au PAN, il ne chiffre pas. Le format 4 (AES) ajoute un aléa et remplace progressivement le format 0.'),
        tags: ['ISO 9564-1', 'Format 0', 'XOR', 'Secure processor'],
        crypto: [{
          mech: 'pin', by: 'terminal', title: l('PIN block construction (ISO 9564 format 0)', 'Construction du bloc PIN (ISO 9564 format 0)'),
          inputs: [{ label: l('PIN field', 'Champ PIN'), value: pb.pinField, sensitive: true }, { label: l('PAN field', 'Champ PAN'), value: pb.panField }],
          key: { name: '—', value: '', type: l('No key: this is formatting, not encryption', 'Aucune clé : c’est du formatage, pas du chiffrement') },
          op: l('XOR', 'XOR'),
          output: { label: l('Clear PIN block', 'Bloc PIN en clair'), value: pb.clear },
          dest: l('Stays inside the secure processor', 'Reste dans le processeur sécurisé'),
          verify: l('The issuer HSM reverses the XOR with the same PAN', 'Le HSM émetteur inverse le XOR avec le même PAN'),
          protects: l('Ties the PIN to one card number', 'Lie le PIN à un seul numéro de carte'),
          notProtects: l('Not confidential yet: must never leave the secure boundary', 'Pas encore confidentiel : ne doit jamais sortir du périmètre sécurisé'),
        }],
      });
      S({
        id: 'dukpt', stage: st, kind: 'crypto', active: ['terminal'], screen: busy(l('PIN OK', 'Code saisi'), l('Securing…', 'Sécurisation…')),
        title: l('A brand-new key for this payment', 'Une clé neuve pour ce paiement'),
        question: l('Where does the cryptographic key come from?', 'D’où vient la clé cryptographique ?'),
        beginner: l('The terminal makes a fresh key for every payment and destroys it afterwards. Even someone who stole today’s key could not unlock yesterday’s PINs. The first key was loaded into the terminal in a secure room before it ever reached the shop.', 'Le terminal fabrique une clé neuve à chaque paiement et la détruit ensuite. Même en volant la clé d’aujourd’hui, on ne pourrait pas ouvrir les codes d’hier. La première clé a été chargée dans le terminal dans une salle sécurisée, avant son arrivée en boutique.'),
        expert: l(`DUKPT (ANSI X9.24-1): the terminal holds future keys derived from an Initial Key (IPEK), injected in a PCI PIN key-loading facility or by remote key injection. The Key Serial Number carries the key-set ID, device ID and a 21-bit counter (here ${dk.counter}). Each set bit of the counter drives one one-way derivation. The acquirer HSM recomputes the same key from its Base Derivation Key and the KSN. The BDK never leaves an HSM.`, `DUKPT (ANSI X9.24-1) : le terminal détient des clés futures dérivées d’une clé initiale (IPEK), injectée dans un centre de chargement de clés PCI PIN ou par injection à distance. Le Key Serial Number porte l’identifiant du jeu de clés, celui de l’appareil et un compteur de 21 bits (ici ${dk.counter}). Chaque bit à 1 du compteur déclenche une dérivation à sens unique. Le HSM acquéreur recalcule la même clé à partir de sa Base Derivation Key et du KSN. La BDK ne quitte jamais un HSM.`),
        tags: ['DUKPT', 'ANSI X9.24', 'KSN', 'IPEK', 'BDK', 'Key injection'],
        crypto: [{
          mech: 'dukpt', by: 'terminal', title: l('Per-transaction key derivation', 'Dérivation de la clé de transaction'),
          inputs: [{ label: l('Key Serial Number', 'Key Serial Number'), value: TEST.KSN }],
          key: { name: 'IPEK → future keys', value: dk.ipek, type: l('Initial key derived from the BDK; replaced in the terminal by future keys', 'Clé initiale dérivée de la BDK ; remplacée dans le terminal par des clés futures') },
          op: l('One-way TDES derivation per set counter bit, then PIN variant', 'Dérivation TDES à sens unique par bit du compteur, puis variante PIN'),
          stages: [...dk.steps.map((s) => ({ label: l(`Counter bit ${s.bit}`, `Bit compteur ${s.bit}`), value: s.key })), { label: l('XOR PIN variant mask', 'XOR masque variante PIN'), value: dk.pinKey }],
          output: { label: l('PIN encryption key (one use)', 'Clé de chiffrement PIN (usage unique)'), value: dk.pinKey },
          dest: l('Used once in the secure processor, then erased', 'Utilisée une fois dans le processeur sécurisé, puis effacée'),
          verify: l('Acquirer HSM derives the same key from BDK + KSN', 'Le HSM acquéreur dérive la même clé depuis BDK + KSN'),
          protects: l('Forward secrecy: a compromised terminal reveals no past key', 'Confidentialité persistante : un terminal compromis ne révèle aucune clé passée'),
          notProtects: l('Does not encrypt anything by itself: it only produces a key', 'Ne chiffre rien en soi : produit seulement une clé'),
        }],
        notes: [l('AES DUKPT (X9.24-3) replaces TDES on recent terminals. Some acquirers use a fixed master/session key scheme instead of DUKPT.', 'Le DUKPT AES (X9.24-3) remplace le TDES sur les terminaux récents. Certains acquéreurs utilisent un schéma master/session au lieu de DUKPT.')],
      });
      S({
        id: 'pinenc', stage: st, kind: 'crypto', active: ['terminal'], screen: busy(l('PIN OK', 'Code saisi'), l('Securing…', 'Sécurisation…')),
        title: l('The PIN is encrypted', 'Le code est chiffré'),
        question: l('What leaves the security chip?', 'Qu’est-ce qui sort de la puce de sécurité ?'),
        beginner: l('The security chip locks the code with the fresh key. What comes out is a scrambled value that means nothing to the merchant, the till or anyone listening.', 'La puce de sécurité verrouille le code avec la clé neuve. Il en sort une valeur brouillée qui ne signifie rien pour le commerçant, la caisse ou quiconque écoute.'),
        expert: l('The clear PIN block is TDES-encrypted under the DUKPT PIN key. Only the encrypted block and the KSN cross the secure boundary to the payment application. PCI PIN Security requires the PIN to be encrypted from the PED to the issuer, translated only inside HSMs.', 'Le bloc PIN en clair est chiffré en TDES sous la clé PIN DUKPT. Seuls le bloc chiffré et le KSN franchissent le périmètre sécurisé vers l’application de paiement. PCI PIN Security exige que le PIN soit chiffré du PED jusqu’à l’émetteur, et transchiffré uniquement dans des HSM.'),
        tags: ['TDES', 'Encrypted PIN block', 'PCI PIN Security'],
        crypto: [{
          mech: 'pin', by: 'terminal', title: l('PIN block encryption', 'Chiffrement du bloc PIN'),
          inputs: [{ label: l('Clear PIN block', 'Bloc PIN en clair'), value: pb.clear, sensitive: true }],
          key: { name: 'DUKPT PIN key', value: dk.pinKey, type: l('Symmetric, single-use PIN encryption key', 'Clé symétrique de chiffrement PIN à usage unique') },
          op: l('TDES-ECB encrypt (one 8-byte block)', 'Chiffrement TDES-ECB (un bloc de 8 octets)'),
          output: { label: l('Encrypted PIN block', 'Bloc PIN chiffré'), value: encPin },
          dest: l('Payment app → gateway → acquirer, with the KSN', 'Application de paiement → passerelle → acquéreur, avec le KSN'),
          verify: l('Decrypted only inside an HSM, then re-encrypted for the next hop', 'Déchiffré uniquement dans un HSM, puis rechiffré pour le saut suivant'),
          protects: l('Confidentiality of the PIN outside secure hardware', 'La confidentialité du PIN hors du matériel sécurisé'),
          notProtects: l('Does not prove the card is genuine: that is the EMV cryptogram’s job', 'Ne prouve pas que la carte est authentique : c’est le rôle du cryptogramme EMV'),
        }],
      });
    }
  }

  };

  const cryptogramBlock = (st: number) => {
  // ================= STAGE 4 =================
  const genResp = [tlv('77', [tlv('9F27', '80'), tlv('9F36', TEST.ATC), tlv('9F26', arqc), tlv('9F10', iad)])];
  S({
    id: 'genac', stage: st, kind: 'apdu', from: 'terminal', to: 'card', screen: procScreen,
    title: l('The card signs the transaction', 'La carte signe la transaction'),
    question: l('What is the card’s one-time security code?', 'Quel est le code de sécurité à usage unique de la carte ?'),
    beginner: l('The terminal sends the payment details to the card: amount, date, a random number. The card answers with a security code that is valid for this payment only. Change one cent and the code no longer matches.', 'Le terminal envoie à la carte les détails du paiement : montant, date, un nombre aléatoire. La carte répond par un code de sécurité valable pour ce seul paiement. Changez un centime et le code ne correspond plus.'),
    expert: l('After terminal risk management and action analysis, the terminal requests an ARQC (P1 = 80) with the CDOL1 data. The card runs its own risk management, then returns CID 80 (go online), the ATC, the 8-byte Application Cryptogram and Issuer Application Data.', 'Après la gestion du risque et l’analyse d’action du terminal, celui-ci demande un ARQC (P1 = 80) avec les données du CDOL1. La carte exécute sa propre gestion du risque, puis renvoie CID 80 (aller en ligne), l’ATC, le cryptogramme applicatif de 8 octets et les Issuer Application Data.'),
    tags: ['GENERATE AC', 'ARQC', 'CDOL1', 'ATC', 'TVR', 'Unpredictable Number'],
    apdu: { name: 'GENERATE AC (1)', purpose: l('Ask the card for an application cryptogram', 'Demander à la carte un cryptogramme applicatif'), sw: '9000', resp: genResp,
      cmd: cmd('80', 'AE', 'GENERATE APPLICATION CRYPTOGRAM', '80', l('Reference control: 80 = ARQC requested, 40 = TC, 00 = AAC.', 'Contrôle de référence : 80 = ARQC demandé, 40 = TC, 00 = AAC.'), '00', l('Always 00.', 'Toujours 00.'),
        { value: cdol, desc: l('CDOL1 data, concatenated without tags: amount, other amount, country, TVR, currency, date, type, unpredictable number.', 'Données du CDOL1, concaténées sans tags : montant, autre montant, pays, TVR, devise, date, type, nombre imprévisible.') }) },
    notes: [l('If the terminal cannot go online it may ask for an offline approval (TC) within floor limits; many markets are online-only.', 'Si le terminal ne peut pas aller en ligne, il peut demander une approbation hors ligne (TC) sous les plafonds ; beaucoup de marchés sont exclusivement en ligne.')],
  });

  const acOps: CryptoOp[] = [
    {
      mech: 'emv', by: 'card', title: l('Session key derivation', 'Dérivation de la clé de session'),
      inputs: [{ label: l('ATC + diversifier', 'ATC + diversifiant'), value: sk.l + ' | ' + sk.r }],
      key: { name: 'MK-AC', value: ck.mk, type: l('Card master key, unique per card, derived by the issuer from IMK-AC + PAN + PSN and personalised into the chip', 'Clé maître de la carte, unique par carte, dérivée par l’émetteur depuis IMK-AC + PAN + PSN et personnalisée dans la puce') },
      op: l('TDES encrypt each half (EMV common session key derivation)', 'Chiffrement TDES de chaque moitié (dérivation commune de clé de session EMV)'),
      output: { label: l('Session key SK-AC', 'Clé de session SK-AC'), value: sk.sk },
      dest: l('Used inside the chip for this transaction only', 'Utilisée dans la puce pour cette seule transaction'),
      verify: l('Issuer HSM repeats: IMK-AC → MK-AC → SK-AC', 'Le HSM émetteur refait : IMK-AC → MK-AC → SK-AC'),
      protects: l('Limits each key to one transaction', 'Limite chaque clé à une transaction'),
      notProtects: l('Not shared with the terminal, gateway or acquirer: they cannot verify the ARQC', 'Non partagée avec le terminal, la passerelle ou l’acquéreur : ils ne peuvent pas vérifier l’ARQC'),
    },
    {
      mech: 'emv', by: 'card', title: l('ARQC computation', 'Calcul de l’ARQC'),
      inputs: [{ label: l('CDOL1 data + AIP + ATC', 'Données CDOL1 + AIP + ATC'), value: acData }],
      key: { name: 'SK-AC', value: sk.sk, type: l('Symmetric session key', 'Clé de session symétrique') },
      op: l('ISO/IEC 9797-1 MAC algorithm 3 (CBC-MAC with DES, final TDES), padding method 2', 'MAC ISO/IEC 9797-1 algorithme 3 (CBC-MAC DES, TDES final), bourrage méthode 2'),
      stages: ac.trace.map((t, i) => ({ label: l(`Block ${i + 1}: ${t.block}`, `Bloc ${i + 1} : ${t.block}`), value: t.out })),
      output: { label: 'ARQC', value: arqc },
      dest: l('Terminal → field 55 of the authorisation request → issuer', 'Terminal → champ 55 de la demande d’autorisation → émetteur'),
      verify: l('Issuer recomputes the MAC and compares', 'L’émetteur recalcule le MAC et compare'),
      protects: l('Card authenticity and integrity of amount, currency, date, counters', 'Authenticité de la carte et intégrité du montant, de la devise, de la date, des compteurs'),
      notProtects: l('Hides nothing: the data travels readable next to the cryptogram', 'Ne cache rien : les données voyagent lisibles à côté du cryptogramme'),
    },
  ];
  S({
    id: 'arqc', stage: st, kind: 'crypto', active: ['card'], screen: procScreen,
    title: l('Inside the chip: making the cryptogram', 'Dans la puce : fabrication du cryptogramme'),
    question: l('How can 8 bytes prove a card is real?', 'Comment 8 octets prouvent-ils qu’une carte est vraie ?'),
    beginner: l('The chip holds a secret key that only your bank also knows. It blends that key with the payment details to produce the code. Nobody else can make the same code, and the bank can redo the calculation to check it.', 'La puce détient une clé secrète que seule votre banque connaît aussi. Elle la combine aux détails du paiement pour produire le code. Personne d’autre ne peut fabriquer ce code, et la banque peut refaire le calcul pour le vérifier.'),
    expert: l('Two steps, both symmetric. A session key is derived from the card master key and the ATC. Then a MAC is computed over the transaction data. The ARQC is a MAC, not encryption. The exact data set and cryptogram version are scheme-specific (Mastercard M/Chip, Visa CVN 10/18/22…); this simulator implements the generic EMV Book 2 method.', 'Deux étapes, toutes deux symétriques. Une clé de session est dérivée de la clé maître de la carte et de l’ATC. Puis un MAC est calculé sur les données de transaction. L’ARQC est un MAC, pas un chiffrement. Le jeu de données exact et la version du cryptogramme dépendent du réseau (Mastercard M/Chip, Visa CVN 10/18/22…) ; ce simulateur implémente la méthode générique d’EMV Book 2.'),
    tags: ['MAC', 'TDES', 'Session key', 'IMK → MK → SK', 'EMV Book 2'],
    crypto: acOps, dur: 7000,
  });

  };

  // On contactless the card is read completely (including GENERATE AC) before an online PIN is captured;
  // on contact, cardholder verification comes before the cryptogram.
  if (cl && pinMode === 'online') { cryptogramBlock(3); cvmBlock(4); } else { cvmBlock(3); cryptogramBlock(4); }

  // ================= STAGE 5 =================
  const de = (n: string, label: string, value: string, desc: L, extra: Partial<Field> = {}) => A({ name: 'DE ' + n, label, value, desc, ...extra });
  const iso = (mti: string, zonePin?: string, resp = false): Field[] => {
    const f: Field[] = [
      A({ name: 'MTI', label: 'Message Type Indicator', value: mti, desc: mti === '0100' ? l('01xx = authorisation, xx00 = request.', '01xx = autorisation, xx00 = demande.') : l('0110 = authorisation response.', '0110 = réponse d’autorisation.') }),
      de('2', 'Primary Account Number', TEST.PAN, l('Card number: routes the message to the right issuer via its first digits (BIN).', 'Numéro de carte : route le message vers le bon émetteur grâce à ses premiers chiffres (BIN).'), { sensitive: true }),
      de('3', 'Processing Code', '000000', l('00 = purchase, from default account.', '00 = achat, depuis le compte par défaut.')),
      de('4', 'Amount, Transaction', TEST.AMOUNT, l('€5.00 in minor units.', '5,00 € en unités mineures.')),
      de('7', 'Transmission Date & Time', YYMMDD.slice(2) + HHMMSS, l('MMDDhhmmss, UTC.', 'MMJJhhmmss, UTC.')),
      de('11', 'System Trace Audit Number', TEST.STAN, l('Sequence number matching request and response.', 'Numéro de séquence reliant demande et réponse.')),
    ];
    if (!resp) f.push(
      de('14', 'Expiration Date', TEST.EXP.slice(0, 4), l('YYMM.', 'AAMM.')),
      de('18', 'Merchant Category Code', '5814', l('Fast food / coffee shop.', 'Restauration rapide / café.')),
      de('22', 'POS Entry Mode', cl ? '071' : '051', cl ? l('07 = contactless chip; 1 = PIN entry capability.', '07 = puce sans contact ; 1 = capacité de saisie PIN.') : l('05 = contact chip; 1 = PIN entry capability.', '05 = puce contact ; 1 = capacité de saisie PIN.')),
      de('23', 'Card Sequence Number', '0' + TEST.PSN, l('From tag 5F34; needed to derive the card key.', 'Issu du tag 5F34 ; nécessaire pour dériver la clé carte.')),
      de('35', 'Track 2 Data', track2.replace('D', '='), l('From tag 57.', 'Issu du tag 57.'), { sensitive: true }),
    );
    f.push(de('37', 'Retrieval Reference Number', RRN, l('Reference used later for clearing, refunds and disputes.', 'Référence utilisée ensuite pour la compensation, les remboursements et les litiges.')));
    if (resp) {
      if (approved) f.push(de('38', 'Authorisation ID Response', '7R4K2P', l('Approval code printed on the receipt.', 'Code d’approbation imprimé sur le ticket.')));
      f.push(de('39', 'Response Code', rc, approved ? l('00 = approved.', '00 = approuvé.') : rc === '51' ? l('51 = insufficient funds.', '51 = provision insuffisante.') : l('59 = suspected fraud.', '59 = suspicion de fraude.')));
    }
    f.push(
      de('41', 'Terminal ID', TEST.TID, l('Identifies this terminal at the acquirer.', 'Identifie ce terminal chez l’acquéreur.')),
      de('42', 'Merchant ID', TEST.MID, l('Identifies the merchant contract.', 'Identifie le contrat commerçant.')),
      de('49', 'Currency Code', '978', l('Euro.', 'Euro.')),
    );
    if (!resp && zonePin) f.push(de('52', 'PIN Data', zonePin, l('Encrypted PIN block. Its value changes at every hop because each HSM re-encrypts it under the next zone key.', 'Bloc PIN chiffré. Sa valeur change à chaque saut car chaque HSM le rechiffre sous la clé de zone suivante.'), { sensitive: true }));
    f.push(resp
      ? de('55', 'ICC Data', ser(tlv('91', arpc.arpc + arc)), l('Issuer Authentication Data for the card.', 'Issuer Authentication Data destinées à la carte.'), { children: [tlv('91', arpc.arpc + arc)] })
      : de('55', 'ICC Data', f55hex, l('EMV data in TLV, passed through untouched to the issuer. Contains the ARQC.', 'Données EMV en TLV, transmises telles quelles à l’émetteur. Contient l’ARQC.'), { children: f55 }));
    return f;
  };
  const mk8583 = (name: string, fields: Field[], security: L[], note?: L): Msg => {
    const macIn = fields.map((x) => x.value).join('').replace(/[^0-9A-F]/gi, '');
    const mac = retailMac(TEST.MACK, macIn.length % 2 ? macIn + '0' : macIn).mac;
    return { name, protocol: 'ISO 8583 (illustrative)', security, note,
      fields: [...fields, de('64', 'Message Authentication Code', mac, l('MAC over the message under a key shared by the two ends of this link. Used on many, not all, host links.', 'MAC du message sous une clé partagée par les deux extrémités du lien. Utilisé sur beaucoup de liens, pas tous.'))] };
  };
  const dialectNote = l('ISO 8583 is a framework: each acquirer and scheme defines its own dialect (field usage, private fields, encoding). Field names follow ISO 8583:1987; values are illustrative.', 'ISO 8583 est un cadre : chaque acquéreur et réseau définit son dialecte (usage des champs, champs privés, encodage). Les noms suivent ISO 8583:1987 ; les valeurs sont illustratives.');
  const tls = l('TLS 1.2+ with mutual authentication or a private circuit', 'TLS 1.2+ avec authentification mutuelle ou liaison privée');

  S({
    id: 'to-gw', stage: 5, kind: 'msg', from: 'terminal', to: 'gateway', screen: onlineScreen,
    title: l('The request leaves the shop', 'La demande quitte la boutique'),
    question: l('Does the payment gateway receive your PIN?', 'La passerelle de paiement reçoit-elle votre PIN ?'),
    beginner: pinMode === 'online'
      ? l('The terminal sends the request over the internet through an encrypted tunnel. The gateway carries the scrambled PIN but cannot read it: it has no key for it.', 'Le terminal envoie la demande par internet dans un tunnel chiffré. La passerelle transporte le code brouillé mais ne peut pas le lire : elle n’en a pas la clé.')
      : l('The terminal sends the request over the internet through an encrypted tunnel. It contains the payment details and the card’s one-time code. No PIN travels in this scenario.', 'Le terminal envoie la demande par internet dans un tunnel chiffré. Elle contient les détails du paiement et le code à usage unique de la carte. Aucun PIN ne circule dans ce scénario.'),
    expert: l('Three independent protections stack up here. TLS protects this link only and ends at the gateway. The encrypted PIN block (if any) is protected end to end between HSMs, whatever the transport. The ARQC is verifiable by the issuer alone. Many terminals also encrypt the PAN and track data with a separate DUKPT data key (point-to-point encryption).', 'Trois protections indépendantes se superposent. TLS protège ce lien uniquement et s’arrête à la passerelle. Le bloc PIN chiffré (s’il existe) est protégé de bout en bout entre HSM, quel que soit le transport. L’ARQC n’est vérifiable que par l’émetteur. Beaucoup de terminaux chiffrent aussi le PAN et la piste avec une clé DUKPT de données distincte (chiffrement point à point).'),
    tags: ['TLS', 'P2PE', 'Field 55', 'KSN'],
    msg: {
      name: 'Authorisation request', protocol: 'HTTPS / JSON (gateway API, illustrative)',
      security: [tls, l('Certificate pinning on the terminal', 'Épinglage de certificat sur le terminal'), ...(pinMode === 'online' ? [l('PIN block already encrypted under a DUKPT key', 'Bloc PIN déjà chiffré sous une clé DUKPT')] : [])],
      note: l('Gateway APIs are proprietary. Some terminals speak ISO 8583 or Nexo Acquirer directly to the acquirer with no gateway at all.', 'Les API de passerelle sont propriétaires. Certains terminaux parlent ISO 8583 ou Nexo Acquirer directement à l’acquéreur, sans passerelle.'),
      fields: [
        A({ name: 'terminalId', value: TEST.TID, kind: 'impl', desc: l('Which terminal is asking.', 'Quel terminal fait la demande.') }),
        A({ name: 'amount', value: '500 EUR', kind: 'impl', desc: l('Amount and currency.', 'Montant et devise.') }),
        A({ name: 'entryMode', value: cl ? 'CONTACTLESS_EMV' : 'CONTACT_EMV', kind: 'impl', desc: l('How the card was read.', 'Comment la carte a été lue.') }),
        A({ name: 'pan', value: TEST.PAN, kind: 'impl', sensitive: true, desc: l('Card number. Often encrypted separately (P2PE) so the gateway handles ciphertext only.', 'Numéro de carte. Souvent chiffré séparément (P2PE) pour que la passerelle ne manipule que du chiffré.') }),
        A({ name: 'emvData', value: f55hex, kind: 'std', desc: l('The EMV TLV block that becomes field 55.', 'Le bloc TLV EMV qui deviendra le champ 55.'), children: f55 }),
        ...(pinMode === 'online' ? [
          A({ name: 'pinBlock', value: encPin, kind: 'std', sensitive: true, desc: l('ISO 9564 format 0 block, TDES-encrypted. Unreadable without the acquirer HSM.', 'Bloc ISO 9564 format 0, chiffré TDES. Illisible sans le HSM acquéreur.') }),
          A({ name: 'ksn', value: TEST.KSN, kind: 'std', desc: l('Key Serial Number: tells the HSM which key to re-derive. Not secret.', 'Key Serial Number : indique au HSM quelle clé redériver. Non secret.') }),
        ] : []),
      ],
    },
  });

  S({
    id: 'to-acq', stage: 5, kind: 'msg', from: 'gateway', to: 'acquirer', screen: onlineScreen,
    title: l('To the merchant’s bank', 'Vers la banque du commerçant'),
    question: l('Who is the acquirer?', 'Qui est l’acquéreur ?'),
    beginner: l('The gateway reformats the request and passes it to the acquirer: the bank or processor that holds the merchant’s contract and will collect the money for the shop.', 'La passerelle reformate la demande et la transmet à l’acquéreur : la banque ou le processeur qui détient le contrat du commerçant et encaissera l’argent pour la boutique.'),
    expert: l('The gateway maps its API to the acquirer’s host protocol, here an ISO 8583 0100. It adds merchant data (MCC, merchant ID) and routes by acquirer contract. The gateway is in PCI DSS scope because it sees cardholder data.', 'La passerelle convertit son API vers le protocole hôte de l’acquéreur, ici un ISO 8583 0100. Elle ajoute les données commerçant (MCC, identifiant) et route selon le contrat acquéreur. La passerelle est dans le périmètre PCI DSS car elle voit des données porteur.'),
    tags: ['ISO 8583', 'MTI 0100', 'Bitmap', 'MCC'],
    msg: mk8583('0100 Authorisation Request', iso('0100', pinMode === 'online' ? encPin : undefined), [tls, l('MAC on the host link', 'MAC sur le lien hôte')], dialectNote),
  });

  if (pinMode === 'online') {
    S({
      id: 'pintrans', stage: 5, kind: 'crypto', active: ['acquirer', 'hsmA'], screen: onlineScreen,
      title: l('The PIN changes locks inside a vault', 'Le code change de serrure dans un coffre'),
      question: l('How does the PIN cross several companies safely?', 'Comment le PIN traverse-t-il plusieurs entreprises en sécurité ?'),
      beginner: l('The acquirer owns a hardened vault computer called an HSM. Inside it, the PIN is unlocked and immediately locked again with a key shared with the next company. No person and no ordinary server sees the PIN at any moment.', 'L’acquéreur possède un ordinateur-coffre renforcé appelé HSM. À l’intérieur, le code est déverrouillé puis aussitôt reverrouillé avec une clé partagée avec l’entreprise suivante. Aucune personne et aucun serveur ordinaire ne voit le code, à aucun moment.'),
      expert: l('PIN translation: the HSM derives the DUKPT key from BDK + KSN, decrypts the PIN block and re-encrypts it under the zone PIN key shared with the network (acquirer working key). Clear PIN exists only inside the HSM’s tamper-responsive boundary (FIPS 140 / PCI HSM). Zone keys are exchanged as TR-31 key blocks under a key-encryption key. The network repeats the translation towards the issuer.', 'Transchiffrement du PIN : le HSM dérive la clé DUKPT depuis BDK + KSN, déchiffre le bloc PIN et le rechiffre sous la clé de zone partagée avec le réseau (acquirer working key). Le PIN en clair n’existe que dans le périmètre inviolable du HSM (FIPS 140 / PCI HSM). Les clés de zone sont échangées en blocs TR-31 sous une clé de chiffrement de clés. Le réseau répète l’opération vers l’émetteur.'),
      tags: ['HSM', 'PIN translation', 'Zone PIN key', 'TR-31', 'PCI PIN Security'],
      crypto: [{
        mech: 'pin', by: 'hsmA', title: l('PIN translation', 'Transchiffrement du PIN'),
        inputs: [{ label: l('PIN block under DUKPT key', 'Bloc PIN sous clé DUKPT'), value: encPin }, { label: 'KSN', value: TEST.KSN }],
        key: { name: 'BDK → DUKPT key, then AWK', value: TEST.AWK, type: l('Zone PIN key shared by acquirer and network, stored encrypted under the HSM master key', 'Clé PIN de zone partagée entre acquéreur et réseau, stockée chiffrée sous la clé maître du HSM') },
        op: l('Decrypt under the derived key, re-encrypt under the zone key, in one HSM command', 'Déchiffrer sous la clé dérivée, rechiffrer sous la clé de zone, en une seule commande HSM'),
        stages: [{ label: l('Re-derive DUKPT PIN key from BDK + KSN', 'Redériver la clé PIN DUKPT depuis BDK + KSN'), value: dk.pinKey }, { label: l('Clear PIN block (inside HSM only)', 'Bloc PIN en clair (dans le HSM uniquement)'), value: '•• •• •• •• •• •• •• ••' }],
        output: { label: l('PIN block under zone key', 'Bloc PIN sous clé de zone'), value: pinAwk },
        dest: l('Field 52 of the message to the network', 'Champ 52 du message vers le réseau'),
        verify: l('The next HSM can decrypt with the same zone key', 'Le HSM suivant peut déchiffrer avec la même clé de zone'),
        protects: l('PIN confidentiality across organisations that share no terminal key', 'La confidentialité du PIN entre organisations ne partageant aucune clé de terminal'),
        notProtects: l('The acquirer cannot verify the PIN: it does not know the right value', 'L’acquéreur ne peut pas vérifier le PIN : il ne connaît pas la bonne valeur'),
      }],
    });
  }

  S({
    id: 'to-net', stage: 5, kind: 'msg', from: 'acquirer', to: 'scheme', screen: onlineScreen,
    title: l('Onto the card network', 'Sur le réseau carte'),
    question: l('How does Visa or Mastercard communicate with your bank?', 'Comment Visa ou Mastercard communique-t-il avec votre banque ?'),
    beginner: l('The acquirer hands the request to the card network. Think of it as a postal sorting centre: it reads the first digits of the card number to find which bank issued the card.', 'L’acquéreur confie la demande au réseau carte. Imaginez un centre de tri postal : il lit les premiers chiffres du numéro de carte pour trouver la banque émettrice.'),
    expert: l('The acquirer host forwards the 0100 to the scheme network (Mastercard Network, VisaNet, or a domestic scheme such as CB in France) over a private connection. The network routes by BIN, applies its own checks, may detokenise a wallet token, and can stand in for an unreachable issuer.', 'L’hôte acquéreur transmet le 0100 au réseau (Mastercard Network, VisaNet, ou un réseau domestique comme CB en France) par une liaison privée. Le réseau route par BIN, applique ses propres contrôles, peut détokeniser un jeton de wallet et peut se substituer à un émetteur injoignable.'),
    tags: ['BIN routing', 'Scheme network', 'Stand-in', 'Token service'],
    msg: mk8583('0100 Authorisation Request', iso('0100', pinMode === 'online' ? pinAwk : undefined), [l('Private network link with scheme-managed encryption', 'Liaison réseau privée, chiffrement géré par le réseau'), ...(pinMode === 'online' ? [l('PIN block now under the acquirer zone key', 'Bloc PIN désormais sous la clé de zone acquéreur')] : [])], dialectNote),
    notes: [l('Routing depends on the scheme and the country: co-badged cards may go to a domestic network, and “on-us” transactions never leave the bank.', 'Le routage dépend du réseau et du pays : une carte co-badgée peut passer par un réseau domestique, et une transaction « on-us » ne quitte pas la banque.')],
  });

  S({
    id: 'to-iss', stage: 5, kind: 'msg', from: 'scheme', to: 'issuer', screen: onlineScreen,
    title: l('Arriving at your bank', 'Arrivée chez votre banque'),
    question: l('What does your bank receive?', 'Que reçoit votre banque ?'),
    beginner: l('The request reaches the bank that gave you the card. It has travelled through four companies in a fraction of a second.', 'La demande atteint la banque qui vous a remis la carte. Elle a traversé quatre entreprises en une fraction de seconde.'),
    expert: l('The issuer host (often an issuer processor) receives the 0100. Field 55 is untouched since the terminal. Field 52, if present, has been translated to the issuer zone key by the network’s HSM.', 'L’hôte émetteur (souvent un processeur émetteur) reçoit le 0100. Le champ 55 est intact depuis le terminal. Le champ 52, s’il existe, a été transchiffré vers la clé de zone émetteur par le HSM du réseau.'),
    tags: ['Issuer host', 'Field 52', 'Field 55'],
    msg: mk8583('0100 Authorisation Request', iso('0100', pinMode === 'online' ? pinIwk : undefined), [l('Private network link', 'Liaison réseau privée'), ...(pinMode === 'online' ? [l('PIN block now under the issuer zone key', 'Bloc PIN désormais sous la clé de zone émetteur')] : [])], dialectNote),
  });

  // ================= STAGE 6 =================
  S({
    id: 'arqc-verify', stage: 6, kind: 'crypto', active: ['issuer', 'hsmI'], screen: onlineScreen,
    title: l('The bank redoes the card’s calculation', 'La banque refait le calcul de la carte'),
    question: l('How does the bank know the code is right?', 'Comment la banque sait-elle que le code est bon ?'),
    beginner: l('Your bank has the same secret key as your chip. It repeats the chip’s calculation on the payment details it received. If its result equals the code from the card, the card is genuine and nothing was changed on the way.', 'Votre banque possède la même clé secrète que votre puce. Elle refait le calcul de la puce sur les détails reçus. Si son résultat égale le code de la carte, la carte est authentique et rien n’a été modifié en route.'),
    expert: l('The issuer HSM derives MK-AC from the Issuer Master Key with PAN and PSN, derives SK-AC with the ATC, recomputes the MAC over the field 55 data and compares it with tag 9F26. It also checks the ATC against the last one seen to catch replays and cloned counters.', 'Le HSM émetteur dérive MK-AC depuis la clé maître émetteur avec le PAN et le PSN, dérive SK-AC avec l’ATC, recalcule le MAC sur les données du champ 55 et le compare au tag 9F26. Il contrôle aussi l’ATC par rapport au dernier vu pour détecter rejeux et compteurs clonés.'),
    tags: ['HSM', 'IMK-AC', 'ARQC verification', 'ATC check'],
    crypto: [
      { mech: 'emv', by: 'hsmI', title: l('Card key derivation', 'Dérivation de la clé carte'),
        inputs: [{ label: l('PAN + PSN (16 rightmost digits)', 'PAN + PSN (16 chiffres de droite)'), value: ck.y }],
        key: { name: 'IMK-AC', value: TEST.IMK_AC, type: l('Issuer master key for application cryptograms; lives only in the issuer HSM', 'Clé maître émetteur pour les cryptogrammes ; ne vit que dans le HSM émetteur') },
        op: l('TDES encrypt Y and its complement (EMV Option A)', 'Chiffrement TDES de Y et de son complément (EMV Option A)'),
        output: { label: 'MK-AC', value: ck.mk },
        dest: l('Stays in the HSM', 'Reste dans le HSM'), verify: l('Must equal the key personalised in the chip', 'Doit égaler la clé personnalisée dans la puce'),
        protects: l('One master key serves millions of cards without storing each card key', 'Une clé maître sert des millions de cartes sans stocker chaque clé'), notProtects: l('If the IMK leaks, every card of that range is exposed: hence the HSM', 'Si l’IMK fuit, toutes les cartes de la plage sont exposées : d’où le HSM') },
      { mech: 'emv', by: 'hsmI', title: l('ARQC verification', 'Vérification de l’ARQC'),
        inputs: [{ label: l('Data from field 55', 'Données du champ 55'), value: acData }, { label: l('ARQC received', 'ARQC reçu'), value: arqc }],
        key: { name: 'SK-AC', value: sk.sk, type: l('Session key re-derived with the ATC', 'Clé de session redérivée avec l’ATC') },
        op: l('Recompute MAC algorithm 3, compare', 'Recalcul du MAC algorithme 3, comparaison'),
        output: { label: l('Recomputed', 'Recalculé'), value: arqc + '  ✓' },
        dest: l('Result goes to the authorisation engine', 'Résultat transmis au moteur d’autorisation'), verify: l('Equal = genuine card, intact data', 'Égal = carte authentique, données intactes'),
        protects: l('Counterfeit cards, altered amounts, replayed transactions', 'Cartes contrefaites, montants modifiés, transactions rejouées'), notProtects: l('A genuine stolen card passes this check: that is what the PIN and risk rules are for', 'Une vraie carte volée passe ce contrôle : c’est le rôle du PIN et des règles de risque') },
    ],
    dur: 7000,
  });

  const fraud = config.outcome === 'fraud', funds = config.outcome === 'funds';
  const checks: Check[] = [
    { label: l('Card and account status', 'État de la carte et du compte'), detail: l('Card exists, is active, not expired, not reported lost or stolen.', 'La carte existe, est active, non expirée, non déclarée perdue ou volée.'), status: 'ok' },
    { label: l('Cryptogram (ARQC) and counter', 'Cryptogramme (ARQC) et compteur'), detail: l(`ARQC matches. ATC ${parseInt(TEST.ATC, 16)} is higher than the last one seen.`, `L’ARQC correspond. L’ATC ${parseInt(TEST.ATC, 16)} est supérieur au dernier observé.`), status: 'ok' },
    pinMode === 'online'
      ? { label: l('PIN verification', 'Vérification du PIN'), detail: l('The HSM decrypts the PIN block and compares it with the reference (PVV, IBM 3624 offset, or stored encrypted PIN). It answers only yes or no.', 'Le HSM déchiffre le bloc PIN et le compare à la référence (PVV, offset IBM 3624, ou PIN chiffré stocké). Il répond seulement oui ou non.'), status: 'ok' }
      : { label: l('Cardholder verification', 'Vérification du porteur'), detail: pinMode === 'offline' ? l('CVM Results say the chip verified the PIN offline; the cryptogram covers that statement.', 'Les CVM Results indiquent que la puce a vérifié le PIN hors ligne ; le cryptogramme couvre cette déclaration.') : l('No CVM. Accepted for this amount; contactless counters are within limits.', 'Aucune CVM. Accepté pour ce montant ; les compteurs sans contact sont sous les plafonds.'), status: 'ok' },
    { label: l('Fraud and risk scoring', 'Score de fraude et de risque'), detail: fraud ? l('Unusual pattern: three countries in one hour. Score above the decline threshold.', 'Schéma inhabituel : trois pays en une heure. Score au-dessus du seuil de refus.') : l('Usual merchant type, usual place, small amount. Low score.', 'Type de commerce habituel, lieu habituel, petit montant. Score faible.'), status: fraud ? 'fail' : 'ok' },
    { label: l('Available funds or credit', 'Provision ou crédit disponible'), detail: fraud ? l('Not evaluated.', 'Non évalué.') : funds ? l('Available balance €3.20 is below €5.00.', 'Solde disponible 3,20 € inférieur à 5,00 €.') : l('Balance covers €5.00. The amount is reserved (not yet debited).', 'Le solde couvre 5,00 €. Le montant est réservé (pas encore débité).'), status: fraud ? 'skip' : funds ? 'fail' : 'ok' },
  ];
  S({
    id: 'checks', stage: 6, kind: 'decision', active: ['issuer'], screen: onlineScreen,
    title: l('Your bank decides', 'Votre banque décide'),
    question: l('How does the bank decide whether to approve the transaction?', 'Comment la banque décide-t-elle d’approuver la transaction ?'),
    beginner: l('Your bank runs through its checklist in a few milliseconds: is the card valid, is the code right, does this look like you, is there enough money?', 'Votre banque parcourt sa liste de contrôles en quelques millisecondes : la carte est-elle valide, le code est-il bon, cela vous ressemble-t-il, y a-t-il assez d’argent ?'),
    expert: l(`The authorisation engine combines the cryptographic results with account status, velocity and fraud rules, and the open-to-buy. Outcome: response code ${rc}. An approval places a hold on the funds; the actual debit comes with clearing.`, `Le moteur d’autorisation combine les résultats cryptographiques avec l’état du compte, les règles de vélocité et de fraude, et le disponible. Résultat : code réponse ${rc}. Une approbation place une réserve sur les fonds ; le débit réel viendra avec la compensation.`),
    tags: ['Authorisation engine', 'Risk scoring', 'Open-to-buy', 'Response code'],
    checks, dur: 7500,
  });

  S({
    id: 'arpc', stage: 6, kind: 'crypto', active: ['issuer', 'hsmI'], screen: onlineScreen,
    title: l('The bank signs its answer', 'La banque signe sa réponse'),
    question: l('How does the card know the answer really comes from the bank?', 'Comment la carte sait-elle que la réponse vient bien de la banque ?'),
    beginner: l('The bank adds its own security code to the answer, made with the same shared secret. The chip can check that the answer truly comes from its bank and not from an impostor.', 'La banque ajoute à sa réponse son propre code de sécurité, fabriqué avec le même secret partagé. La puce peut vérifier que la réponse vient bien de sa banque et non d’un imposteur.'),
    expert: l('ARPC method 1: the 2-byte Authorisation Response Code is padded, XORed with the ARQC and TDES-encrypted under SK-AC. ARPC + ARC travel in tag 91. Method 2 uses a MAC over ARQC, Card Status Update and proprietary data. Contactless cards usually never see the ARPC because they have left the field.', 'ARPC méthode 1 : le code réponse sur 2 octets est complété, combiné par XOR à l’ARQC et chiffré TDES sous SK-AC. ARPC + ARC voyagent dans le tag 91. La méthode 2 utilise un MAC sur l’ARQC, le Card Status Update et des données propriétaires. Les cartes sans contact ne voient en général jamais l’ARPC car elles ont quitté le champ.'),
    tags: ['ARPC', 'Issuer authentication', 'Tag 91', 'ARC'],
    crypto: [{
      mech: 'emv', by: 'hsmI', title: l('ARPC generation (method 1)', 'Génération de l’ARPC (méthode 1)'),
      inputs: [{ label: 'ARQC', value: arqc }, { label: l('Response code (ARC), padded', 'Code réponse (ARC), complété'), value: arc + '000000000000' }],
      key: { name: 'SK-AC', value: sk.sk, type: l('Same session key as the ARQC', 'Même clé de session que l’ARQC') },
      op: l('XOR, then TDES encrypt', 'XOR, puis chiffrement TDES'),
      stages: [{ label: 'ARQC ⊕ ARC', value: arpc.input }],
      output: { label: 'ARPC', value: arpc.arpc },
      dest: l('Field 55 (tag 91) of the response, back to the card', 'Champ 55 (tag 91) de la réponse, retour vers la carte'),
      verify: l('The chip recomputes it with its own SK-AC', 'La puce le recalcule avec sa propre SK-AC'),
      protects: l('The card against fake approvals; lets the issuer update card counters safely', 'La carte contre les fausses approbations ; permet à l’émetteur de mettre à jour les compteurs'),
      notProtects: l('The terminal cannot check it and relies on the secured host link', 'Le terminal ne peut pas le vérifier et s’appuie sur le lien hôte sécurisé'),
    }],
  });

  // ================= STAGE 7 =================
  const respMsg = mk8583('0110 Authorisation Response', iso('0110', undefined, true), [tls, l('MAC on the host link', 'MAC sur le lien hôte')], dialectNote);
  const back = (id: string, from: Step['from'], to: Step['to'], title: L, beginner: L, expert: L) =>
    S({ id, stage: 7, kind: 'msg', from, to, screen: onlineScreen, title, question: l('How does the answer come back?', 'Comment la réponse revient-elle ?'), beginner, expert, tags: ['MTI 0110', 'DE 39', 'DE 38'], msg: respMsg, dur: 3400 });
  back('r-net', 'issuer', 'scheme', l('The answer starts its way back', 'La réponse repart'),
    l(approved ? 'The bank says yes. The answer takes the same road in reverse.' : 'The bank says no. The answer takes the same road in reverse.', approved ? 'La banque dit oui. La réponse emprunte le même chemin en sens inverse.' : 'La banque dit non. La réponse emprunte le même chemin en sens inverse.'),
    l(`0110 with DE 39 = ${rc}${approved ? ', an approval code in DE 38' : ''} and tag 91 in DE 55. STAN and RRN echo the request so every hop can match it.`, `0110 avec DE 39 = ${rc}${approved ? ', un code d’approbation en DE 38' : ''} et le tag 91 en DE 55. STAN et RRN reprennent ceux de la demande pour que chaque saut puisse l’apparier.`));
  back('r-acq', 'scheme', 'acquirer', l('Through the network', 'À travers le réseau'),
    l('The network logs the decision: it will need it later to move the money between banks.', 'Le réseau enregistre la décision : il en aura besoin plus tard pour déplacer l’argent entre banques.'),
    l('The scheme records the authorisation for later clearing and for its fraud and dispute systems, then forwards the 0110.', 'Le réseau enregistre l’autorisation pour la compensation ultérieure et ses systèmes de fraude et de litiges, puis transmet le 0110.'));
  back('r-gw', 'acquirer', 'gateway', l('Back to the acquirer and gateway', 'Retour à l’acquéreur et à la passerelle'),
    l('The merchant’s bank notes that this payment is promised to the shop.', 'La banque du commerçant note que ce paiement est promis à la boutique.'),
    l('The acquirer stores the authorisation against the merchant batch and maps the response to the gateway API.', 'L’acquéreur enregistre l’autorisation dans le lot du commerçant et convertit la réponse vers l’API de la passerelle.'));
  back('r-term', 'gateway', 'terminal', l('Back in the shop', 'Retour en boutique'),
    l('The answer reaches the terminal, about one second after you presented your card.', 'La réponse atteint le terminal, environ une seconde après la présentation de la carte.'),
    l('The gateway returns the result over the same TLS session. If no answer arrives in time, the terminal sends a reversal (0400) so the issuer releases any hold.', 'La passerelle renvoie le résultat dans la même session TLS. Sans réponse dans les temps, le terminal envoie une annulation (0400) pour que l’émetteur libère toute réserve.'));

  if (!cl) {
    S({
      id: 'extauth', stage: 7, kind: 'apdu', from: 'terminal', to: 'card', screen: procScreen,
      title: l('The chip checks the bank’s signature', 'La puce vérifie la signature de la banque'),
      question: l('Why is the card still in the terminal?', 'Pourquoi la carte est-elle encore dans le terminal ?'),
      beginner: l('This is why you keep a chip card inserted until the end. The terminal passes the bank’s code to the chip, which checks it really comes from its bank.', 'C’est pour cela qu’on laisse la carte insérée jusqu’à la fin. Le terminal transmet à la puce le code de la banque, et la puce vérifie qu’il vient bien de sa banque.'),
      expert: l('EXTERNAL AUTHENTICATE carries Issuer Authentication Data (ARPC + ARC). The chip recomputes the ARPC with SK-AC. Cards that do not support this command receive tag 91 in the second GENERATE AC instead.', 'EXTERNAL AUTHENTICATE transporte les Issuer Authentication Data (ARPC + ARC). La puce recalcule l’ARPC avec SK-AC. Les cartes qui ne supportent pas cette commande reçoivent le tag 91 dans le second GENERATE AC.'),
      tags: ['EXTERNAL AUTHENTICATE', 'ARPC', 'Issuer authentication'],
      apdu: { name: 'EXTERNAL AUTHENTICATE', purpose: l('Let the card authenticate the issuer', 'Laisser la carte authentifier l’émetteur'), sw: '9000', resp: [],
        cmd: cmd('00', '82', 'EXTERNAL AUTHENTICATE', '00', l('Always 00.', 'Toujours 00.'), '00', l('Always 00.', 'Toujours 00.'), { value: arpc.arpc + arc, desc: l('ARPC (8 bytes) + Authorisation Response Code (2 bytes).', 'ARPC (8 octets) + code réponse d’autorisation (2 octets).') }, false) },
    });
    S({
      id: 'genac2', stage: 7, kind: 'apdu', from: 'terminal', to: 'card', screen: procScreen,
      title: l('The chip gives its final word', 'La puce donne son dernier mot'),
      question: l('What is a transaction certificate?', 'Qu’est-ce qu’un certificat de transaction ?'),
      beginner: approved
        ? l('The chip confirms the payment with a final code. The merchant keeps it as proof that a genuine card agreed to this payment.', 'La puce confirme le paiement par un dernier code. Le commerçant le conserve comme preuve qu’une vraie carte a accepté ce paiement.')
        : l('The chip records that the payment was refused and produces a refusal code.', 'La puce enregistre le refus du paiement et produit un code de refus.'),
      expert: approved
        ? l('Second GENERATE AC with P1 = 40 requests a Transaction Certificate. The TC goes into the clearing record as evidence. The card may also receive issuer scripts (tags 71/72) here to update its parameters.', 'Le second GENERATE AC avec P1 = 40 demande un Transaction Certificate. Le TC entre dans l’enregistrement de compensation comme preuve. La carte peut aussi recevoir ici des scripts émetteur (tags 71/72) pour mettre à jour ses paramètres.')
        : l('Second GENERATE AC with P1 = 00 requests an Application Authentication Cryptogram: the card’s record of a decline.', 'Le second GENERATE AC avec P1 = 00 demande un Application Authentication Cryptogram : la trace du refus côté carte.'),
      tags: ['GENERATE AC (2)', approved ? 'TC' : 'AAC', 'CDOL2', 'Issuer scripts'],
      apdu: { name: 'GENERATE AC (2)', purpose: l('Final card decision', 'Décision finale de la carte'), sw: '9000',
        resp: [tlv('77', [tlv('9F27', approved ? '40' : '00'), tlv('9F36', TEST.ATC), tlv('9F26', tc), tlv('9F10', iad)])],
        cmd: cmd('80', 'AE', 'GENERATE APPLICATION CRYPTOGRAM', approved ? '40' : '00', l('40 = TC requested (approve). 00 = AAC (decline).', '40 = TC demandé (approbation). 00 = AAC (refus).'), '00', l('Always 00.', 'Toujours 00.'), { value: arc + cdol.slice(-8), desc: l('CDOL2 data: response code and unpredictable number.', 'Données CDOL2 : code réponse et nombre imprévisible.') }) },
    });
  }

  S({
    id: 'result', stage: 7, kind: 'result', active: ['terminal'],
    screen: approved ? { tone: 'ok', l1: l('PAYMENT APPROVED', 'PAIEMENT ACCEPTÉ'), l2: l('€5.00', '5,00 €') } : { tone: 'bad', l1: l('PAYMENT DECLINED', 'PAIEMENT REFUSÉ'), l2: rc === '51' ? l('Code 51', 'Code 51') : l('Code 59', 'Code 59') },
    title: approved ? l('Payment approved', 'Paiement accepté') : l('Payment declined', 'Paiement refusé'),
    question: approved ? l('Has the money moved?', 'L’argent a-t-il bougé ?') : l('Why was it declined?', 'Pourquoi ce refus ?'),
    beginner: approved
      ? l('Enjoy your coffee. Your bank has promised the €5 to the shop and set it aside on your account. The money itself has not moved yet: that happens overnight.', 'Bon café. Votre banque a promis les 5 € à la boutique et les a mis de côté sur votre compte. L’argent lui-même n’a pas encore bougé : cela se fait dans la nuit.')
      : rc === '51'
        ? l('Your bank refused because the account does not hold enough money. The terminal only shows “declined”: the merchant is not told why.', 'Votre banque a refusé car le compte ne contient pas assez d’argent. Le terminal affiche seulement « refusé » : le commerçant n’en connaît pas la raison.')
        : l('Your bank refused because the payment looked unusual. The card itself passed every technical check. The terminal only shows “declined”.', 'Votre banque a refusé car le paiement semblait inhabituel. La carte a pourtant passé tous les contrôles techniques. Le terminal affiche seulement « refusé ».'),
    expert: approved
      ? l('Authorisation is a promise, not a transfer. The terminal stores the transaction (with the TC on contact) in its batch. Later the acquirer submits clearing records to the scheme, which nets positions between banks; settlement then moves the funds, typically at D+1. Interchange and scheme fees are computed at clearing.', 'L’autorisation est une promesse, pas un transfert. Le terminal conserve la transaction (avec le TC en contact) dans son lot. L’acquéreur soumet ensuite les enregistrements de compensation au réseau, qui calcule les positions nettes entre banques ; le règlement déplace alors les fonds, en général à J+1. L’interchange et les frais de réseau sont calculés à la compensation.')
      : l(`Response code ${rc}. No hold is placed and nothing is cleared. ${cl ? '' : 'The chip produced an AAC. '}The terminal prints a decline receipt without the reason; the cardholder must ask the issuer.`, `Code réponse ${rc}. Aucune réserve n’est posée et rien n’est compensé. ${cl ? '' : 'La puce a produit un AAC. '}Le terminal imprime un ticket de refus sans motif ; le porteur doit s’adresser à son émetteur.`),
    tags: ['Authorisation vs clearing', 'Settlement', 'Batch', 'Interchange'],
    notes: [l('This simulator stops at authorisation. Clearing, settlement, refunds and chargebacks are explained, not simulated.', 'Ce simulateur s’arrête à l’autorisation. Compensation, règlement, remboursements et litiges sont expliqués, non simulés.')],
    dur: 9000,
  });

  return steps;
}
