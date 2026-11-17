/** Interactive architecture: pick any actor or link of the payment chain and see its role, data and controls. */
import { useState } from 'react';
import { useStore } from '../store';
import { useT, l, type L } from '../i18n';
import { ACTOR_NAME, type Actor } from '../sim/types';
import Ecosystem from '../components/Ecosystem';
import { ActorIcon, Chip } from '../components/ui';

type Info = { role: L; does: L; receives: L; sends: L; crypto: L; controls: L; links: L };
const HSM: Info = {
  role: l('A tamper-resistant computer whose only job is to hold keys and use them on request.', 'Un ordinateur inviolable dont le seul rôle est de détenir des clés et de les utiliser sur demande.'),
  does: l('Derives keys, translates and verifies PIN blocks, verifies ARQCs, generates ARPCs, wraps keys for exchange.', 'Dérive des clés, transchiffre et vérifie les blocs PIN, vérifie les ARQC, génère les ARPC, enveloppe les clés pour échange.'),
  receives: l('Commands from its host with encrypted keys and data: “translate this PIN block”, “verify this ARQC”.', 'Des commandes de son hôte avec clés et données chiffrées : « transchiffre ce bloc PIN », « vérifie cet ARQC ».'),
  sends: l('Results only: a re-encrypted block, a yes/no, a cryptogram. Never a clear key or a clear PIN.', 'Uniquement des résultats : un bloc rechiffré, un oui/non, un cryptogramme. Jamais une clé ni un PIN en clair.'),
  crypto: l('All of it: TDES/AES, DUKPT derivation, MAC, key wrapping (TR-31), RSA for remote key injection.', 'Toutes : TDES/AES, dérivation DUKPT, MAC, enveloppement de clés (TR-31), RSA pour l’injection de clés à distance.'),
  controls: l('PCI HSM or FIPS 140 validation, tamper response that erases keys, dual control, split knowledge, audited key ceremonies.', 'Validation PCI HSM ou FIPS 140, réponse à l’intrusion effaçant les clés, double contrôle, connaissance partagée, cérémonies de clés auditées.'),
  links: l('Attached to one host (acquirer, network or issuer). HSMs of different organisations share zone keys, exchanged as key blocks.', 'Rattaché à un hôte (acquéreur, réseau ou émetteur). Les HSM d’organisations différentes partagent des clés de zone, échangées en blocs de clés.'),
};
const INFO: Record<Actor, Info> = {
  card: {
    role: l('A tiny secure computer that proves it is genuine and signs each transaction.', 'Un minuscule ordinateur sécurisé qui prouve son authenticité et signe chaque transaction.'),
    does: l('Runs the EMV application, applies the issuer’s risk rules, counts transactions (ATC), checks an offline PIN if configured.', 'Exécute l’application EMV, applique les règles de risque de l’émetteur, compte les transactions (ATC), vérifie un PIN hors ligne si configuré.'),
    receives: l('APDU commands with amount, currency, date, the terminal’s random number; later the issuer’s ARPC (contact).', 'Des commandes APDU avec montant, devise, date, nombre aléatoire du terminal ; puis l’ARPC de l’émetteur (contact).'),
    sends: l('Application data (PAN, expiry, CVM list, certificates) and cryptograms (ARQC, then TC or AAC).', 'Données applicatives (PAN, expiration, liste CVM, certificats) et cryptogrammes (ARQC, puis TC ou AAC).'),
    crypto: l('Symmetric MAC for the application cryptogram; RSA signature for offline authentication.', 'MAC symétrique pour le cryptogramme applicatif ; signature RSA pour l’authentification hors ligne.'),
    controls: l('Certified secure element (Common Criteria / EMVCo): keys cannot be read out, sensors resist probing and glitching.', 'Élément sécurisé certifié (Critères Communs / EMVCo) : clés non extractibles, capteurs contre le sondage et les perturbations.'),
    links: l('Talks only to the terminal. Shares its secret key with the issuer alone.', 'Ne dialogue qu’avec le terminal. Ne partage sa clé secrète qu’avec l’émetteur.'),
  },
  terminal: {
    role: l('The trusted meeting point between card, cardholder and the payment network.', 'Le point de rencontre de confiance entre la carte, le porteur et le réseau de paiement.'),
    does: l('Runs the EMV kernels, captures and encrypts the PIN, applies terminal risk management, builds the authorisation request, shows the result.', 'Exécute les kernels EMV, capture et chiffre le PIN, applique la gestion du risque terminal, construit la demande d’autorisation, affiche le résultat.'),
    receives: l('The amount from the till, card data and cryptograms from the card, the PIN from the keypad, the response from the host.', 'Le montant de la caisse, les données et cryptogrammes de la carte, le PIN du clavier, la réponse de l’hôte.'),
    sends: l('APDUs to the card; an authorisation request with EMV data, encrypted PIN block and KSN to the gateway.', 'Des APDU à la carte ; une demande d’autorisation avec données EMV, bloc PIN chiffré et KSN à la passerelle.'),
    crypto: l('DUKPT derivation, PIN block encryption, RSA certificate verification, TLS client, optional account-data encryption (P2PE).', 'Dérivation DUKPT, chiffrement du bloc PIN, vérification de certificats RSA, client TLS, chiffrement optionnel des données de compte (P2PE).'),
    controls: l('PCI PTS POI approval, tamper-responsive secure processor, signed firmware, keys injected in a secure facility or remotely.', 'Approbation PCI PTS POI, processeur sécurisé réactif à l’intrusion, firmware signé, clés injectées en centre sécurisé ou à distance.'),
    links: l('Card on one side, merchant till and gateway on the other. Its PIN keys pair with the acquirer’s HSM.', 'La carte d’un côté, la caisse et la passerelle de l’autre. Ses clés PIN sont appairées au HSM de l’acquéreur.'),
  },
  pos: {
    role: l('The merchant’s till software: it knows what is being sold, not how it is paid.', 'Le logiciel de caisse du commerçant : il sait ce qui est vendu, pas comment c’est payé.'),
    does: l('Totals the sale, asks the terminal to collect the amount, records the result on the receipt.', 'Totalise la vente, demande au terminal d’encaisser le montant, inscrit le résultat sur le ticket.'),
    receives: l('Approved or declined, an authorisation code, a masked card number (last 4 digits).', 'Accepté ou refusé, un code d’autorisation, un numéro de carte masqué (4 derniers chiffres).'),
    sends: l('Amount, currency and a sale reference.', 'Montant, devise et une référence de vente.'),
    crypto: l('None for the payment itself.', 'Aucune pour le paiement lui-même.'),
    controls: l('Kept outside the secure boundary on purpose: it never sees the PIN, keys or (with P2PE) the full card number, which shrinks the merchant’s PCI DSS scope.', 'Volontairement hors du périmètre sécurisé : il ne voit jamais le PIN, les clés ni (avec P2PE) le numéro complet, ce qui réduit le périmètre PCI DSS du commerçant.'),
    links: l('Local link to the terminal only. On Android terminals it can be an app on the same device, isolated from the secure processor.', 'Lien local avec le terminal uniquement. Sur les terminaux Android, ce peut être une application sur le même appareil, isolée du processeur sécurisé.'),
  },
  gateway: {
    role: l('A switchboard connecting many terminals to one or several acquirers.', 'Un standard reliant de nombreux terminaux à un ou plusieurs acquéreurs.'),
    does: l('Terminates the terminal’s TLS session, translates formats, routes to the right acquirer, manages terminal configuration and often keys.', 'Termine la session TLS du terminal, convertit les formats, route vers le bon acquéreur, gère la configuration des terminaux et souvent les clés.'),
    receives: l('The terminal’s request: amount, EMV data, encrypted PIN block and KSN, possibly encrypted card data.', 'La demande du terminal : montant, données EMV, bloc PIN chiffré et KSN, éventuellement données carte chiffrées.'),
    sends: l('An ISO 8583 (or equivalent) authorisation request to the acquirer host.', 'Une demande d’autorisation ISO 8583 (ou équivalent) à l’hôte acquéreur.'),
    crypto: l('TLS on both sides, MAC on host links. With its own HSM it may translate PIN blocks; otherwise it only carries them.', 'TLS des deux côtés, MAC sur les liens hôtes. Avec son propre HSM, elle peut transchiffrer les blocs PIN ; sinon elle les transporte seulement.'),
    controls: l('PCI DSS for cardholder data; PCI PIN Security if it manages PIN keys; network segmentation, logging, access control.', 'PCI DSS pour les données porteur ; PCI PIN Security si elle gère des clés PIN ; segmentation réseau, journalisation, contrôle d’accès.'),
    links: l('Optional: some terminals connect straight to the acquirer.', 'Facultative : certains terminaux se connectent directement à l’acquéreur.'),
  },
  acquirer: {
    role: l('The merchant’s bank or processor: it gets the merchant paid.', 'La banque ou le processeur du commerçant : il fait payer le commerçant.'),
    does: l('Holds the merchant contract, submits authorisations to the card networks, later clears and settles, carries the merchant’s risk.', 'Détient le contrat commerçant, soumet les autorisations aux réseaux, compense et règle ensuite, porte le risque du commerçant.'),
    receives: l('Authorisation requests from gateways and terminals; responses from the networks.', 'Les demandes d’autorisation des passerelles et terminaux ; les réponses des réseaux.'),
    sends: l('0100 requests to the network; responses back to the gateway; clearing files at end of day.', 'Des demandes 0100 au réseau ; les réponses vers la passerelle ; des fichiers de compensation en fin de journée.'),
    crypto: l('Through its HSM: DUKPT key re-derivation and PIN translation to the network zone key; MAC verification.', 'Via son HSM : redérivation de la clé DUKPT et transchiffrement du PIN vers la clé de zone réseau ; vérification des MAC.'),
    controls: l('PCI DSS, PCI PIN Security, scheme operating rules, HSMs for every key operation.', 'PCI DSS, PCI PIN Security, règles des réseaux, HSM pour toute opération sur les clés.'),
    links: l('Member of the card networks. Cannot verify the ARQC or the PIN: only the issuer can.', 'Membre des réseaux carte. Ne peut vérifier ni l’ARQC ni le PIN : seul l’émetteur le peut.'),
  },
  scheme: {
    role: l('The card network (Visa, Mastercard, or a domestic scheme): the rulebook and the switch between all banks.', 'Le réseau carte (Visa, Mastercard ou un réseau domestique) : le règlement et le commutateur entre toutes les banques.'),
    does: l('Routes each request to the issuer by BIN, enforces rules, maps tokens to card numbers, stands in for unreachable issuers, runs clearing and settlement.', 'Route chaque demande vers l’émetteur par BIN, fait appliquer les règles, convertit les jetons en numéros de carte, se substitue aux émetteurs injoignables, opère compensation et règlement.'),
    receives: l('Authorisation requests from acquirers; responses from issuers.', 'Les demandes d’autorisation des acquéreurs ; les réponses des émetteurs.'),
    sends: l('The request to the issuer and the response back, each in its own network message format.', 'La demande à l’émetteur et la réponse en retour, chacune dans le format de message du réseau.'),
    crypto: l('PIN translation between acquirer and issuer zone keys; optional cryptogram validation on behalf of issuers; certification authority for card certificates.', 'Transchiffrement du PIN entre les clés de zone acquéreur et émetteur ; validation optionnelle des cryptogrammes pour le compte des émetteurs ; autorité de certification des certificats carte.'),
    controls: l('Private network, its own HSM estate, mandatory compliance programmes for every member.', 'Réseau privé, son propre parc de HSM, programmes de conformité obligatoires pour chaque membre.'),
    links: l('Sits between acquirers and issuers. Skipped when acquirer and issuer are the same bank (“on-us”).', 'Placé entre acquéreurs et émetteurs. Contourné quand acquéreur et émetteur sont la même banque (« on-us »).'),
  },
  issuer: {
    role: l('Your bank: it gave you the card and decides on every payment.', 'Votre banque : elle vous a remis la carte et décide de chaque paiement.'),
    does: l('Verifies the cryptogram and PIN, checks card status, scores fraud risk, checks funds, answers approve or decline, later debits the account.', 'Vérifie le cryptogramme et le PIN, contrôle l’état de la carte, évalue le risque de fraude, vérifie la provision, répond accepté ou refusé, débite ensuite le compte.'),
    receives: l('The 0100 request with field 55 (EMV data) and, for online PIN, the encrypted PIN block.', 'La demande 0100 avec le champ 55 (données EMV) et, pour le PIN en ligne, le bloc PIN chiffré.'),
    sends: l('The 0110 response: response code, approval code, ARPC for the card.', 'La réponse 0110 : code réponse, code d’approbation, ARPC pour la carte.'),
    crypto: l('Through its HSM: card key derivation, ARQC verification, ARPC generation, PIN verification.', 'Via son HSM : dérivation de la clé carte, vérification de l’ARQC, génération de l’ARPC, vérification du PIN.'),
    controls: l('PCI DSS, PCI PIN Security, PCI Card Production for personalisation, banking regulation, fraud monitoring.', 'PCI DSS, PCI PIN Security, PCI Card Production pour la personnalisation, réglementation bancaire, surveillance de la fraude.'),
    links: l('The only party sharing the card’s secret key. Often operated by an issuer processor.', 'Seule partie partageant la clé secrète de la carte. Souvent opéré par un processeur émetteur.'),
  },
  hsmA: HSM, hsmI: HSM,
};

const LINKS: { a: Actor; b: Actor; data: L; sec: L }[] = [
  { a: 'card', b: 'terminal', data: l('APDU commands and responses (ISO/IEC 7816-4) over contacts or NFC', 'Commandes et réponses APDU (ISO/IEC 7816-4) par contacts ou NFC'), sec: l('Offline card authentication (RSA); application cryptogram (MAC). The link itself is not encrypted.', 'Authentification hors ligne de la carte (RSA) ; cryptogramme applicatif (MAC). Le lien lui-même n’est pas chiffré.') },
  { a: 'pos', b: 'terminal', data: l('Sale request and result', 'Demande de vente et résultat'), sec: l('No sensitive data crosses this link by design.', 'Aucune donnée sensible ne traverse ce lien, par conception.') },
  { a: 'terminal', b: 'gateway', data: l('Authorisation request and response (gateway API, Nexo or ISO 8583)', 'Demande et réponse d’autorisation (API passerelle, Nexo ou ISO 8583)'), sec: l('TLS; PIN block under a DUKPT key; optionally P2PE for card data.', 'TLS ; bloc PIN sous clé DUKPT ; éventuellement P2PE pour les données carte.') },
  { a: 'gateway', b: 'acquirer', data: l('ISO 8583 0100 / 0110', 'ISO 8583 0100 / 0110'), sec: l('TLS or private line; message MAC.', 'TLS ou ligne privée ; MAC de message.') },
  { a: 'acquirer', b: 'scheme', data: l('Network authorisation messages; later clearing files', 'Messages d’autorisation réseau ; puis fichiers de compensation'), sec: l('Private network; PIN block under the acquirer zone key.', 'Réseau privé ; bloc PIN sous la clé de zone acquéreur.') },
  { a: 'scheme', b: 'issuer', data: l('Network authorisation messages; later settlement advices', 'Messages d’autorisation réseau ; puis avis de règlement'), sec: l('Private network; PIN block under the issuer zone key.', 'Réseau privé ; bloc PIN sous la clé de zone émetteur.') },
];

export default function ArchView() {
  const t = useT();
  const { steps, idx } = useStore();
  const [sel, setSel] = useState<Actor>('terminal');
  const info = INFO[sel];
  const rows: [L, L, string][] = [
    [l('Role', 'Rôle'), info.role, 'text-ink'], [l('Responsibilities', 'Responsabilités'), info.does, 'text-ink'],
    [l('Receives', 'Reçoit'), info.receives, 'text-data'], [l('Sends', 'Envoie'), info.sends, 'text-data'],
    [l('Cryptographic operations', 'Opérations cryptographiques'), info.crypto, 'text-crypto'],
    [l('Security controls', 'Contrôles de sécurité'), info.controls, 'text-danger'],
    [l('Relationships', 'Relations'), info.links, 'text-net'],
  ];
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-4 p-4">
      <div>
        <h2 className="text-[20px] font-bold">{t(l('Payment architecture', 'Architecture de paiement'))}</h2>
        <p className="text-[13px] text-muted">{t(l('Select a component. Highlighted ones are active in the simulator right now:', 'Sélectionnez un composant. Ceux en surbrillance sont actifs en ce moment dans le simulateur :'))} <span className="text-ink">{t(steps[idx].title)}</span></p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-bench px-4 pb-2 pt-5"><Ecosystem onNode={setSel} selectedNode={sel} /></div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-line bg-panel p-4">
          <h3 className="flex items-center gap-2 text-[17px] font-semibold"><ActorIcon actor={sel} size={22} />{t(ACTOR_NAME[sel])}</h3>
          <dl className="mt-3 flex flex-col gap-3">
            {rows.map(([k, v, c], i) => (
              <div key={i}><dt className={`text-[11.5px] font-semibold uppercase tracking-wider ${c === 'text-ink' ? 'text-muted' : c}`}>{t(k)}</dt><dd className="max-w-[70ch] text-[13.5px] leading-relaxed text-ink/90">{t(v)}</dd></div>
            ))}
          </dl>
        </section>
        <section className="rounded-xl border border-line bg-panel p-4">
          <h3 className="text-[15px] font-semibold">{t(l('Connections', 'Connexions'))}</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {LINKS.map((k) => {
              const on = k.a === sel || k.b === sel;
              return (
                <li key={k.a + k.b} className={`rounded-lg border p-2.5 transition-colors ${on ? 'border-data/60 bg-panel2' : 'border-line bg-bench'}`}>
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
                    <button onClick={() => setSel(k.a)} className="hover:text-data">{t(ACTOR_NAME[k.a])}</button><span className="text-muted">↔</span><button onClick={() => setSel(k.b)} className="hover:text-data">{t(ACTOR_NAME[k.b])}</button>
                  </div>
                  <p className="text-[12.5px] text-data">{t(k.data)}</p>
                  <p className="text-[12.5px] text-muted">{t(k.sec)}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-l-2 border-net pl-3 text-[12px] text-muted"><Chip tone="net">{t(l('Varies', 'Variable'))}</Chip> {t(l('This is the classic four-party model. Real paths differ by country, scheme and contract: no gateway, a processor acting for the bank, a domestic network, or one bank playing both roles.', 'C’est le modèle classique à quatre parties. Les parcours réels diffèrent selon le pays, le réseau et le contrat : pas de passerelle, un processeur agissant pour la banque, un réseau domestique, ou une banque jouant les deux rôles.'))}</p>
        </section>
      </div>
    </div>
  );
}
