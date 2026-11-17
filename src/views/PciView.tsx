/** PCI education: what each standard covers, what it does not, plus a small tamper-response demo. */
import { useState } from 'react';
import { motion } from 'motion/react';
import { useT, l, type L } from '../i18n';
import { TEST } from '../sim/scenario';
import { deriveDukpt } from '../sim/crypto/dukpt';
import { sp } from '../sim/crypto/primitives';
import { Chip } from '../components/ui';

const STD: { name: string; applies: L; what: L; against: L; not: L }[] = [
  {
    name: 'PCI PTS POI',
    applies: l('A device model (the terminal hardware and its secure firmware)', 'Un modèle d’appareil (le matériel du terminal et son firmware sécurisé)'),
    what: l('A laboratory attacks the device and checks its design: tamper detection and response, protected keypad and display, secure key storage, signed firmware. An approved model is listed with an approval number and an expiry date.', 'Un laboratoire attaque l’appareil et vérifie sa conception : détection et réponse à l’intrusion, clavier et écran protégés, stockage sécurisé des clés, firmware signé. Un modèle approuvé est listé avec un numéro et une date d’expiration.'),
    against: l('PIN capture by opening, drilling or bugging the device; extraction of keys; fake PIN prompts.', 'La capture du PIN par ouverture, perçage ou pose de mouchards ; l’extraction des clés ; les fausses invites de saisie.'),
    not: l('That the device was deployed correctly, that the right keys were injected, that the payment app is sound, or that the merchant and gateway are secure.', 'Que l’appareil a été déployé correctement, que les bonnes clés ont été injectées, que l’application de paiement est saine, ni que le commerçant et la passerelle sont sécurisés.'),
  },
  {
    name: 'PCI DSS',
    applies: l('An organisation that stores, processes or transmits card numbers: merchant, gateway, acquirer, issuer', 'Une organisation qui stocke, traite ou transmet des numéros de carte : commerçant, passerelle, acquéreur, émetteur'),
    what: l('Twelve families of requirements on networks, systems, access, logging, testing and policy. Card numbers must be unreadable when stored; track data, card verification codes and PIN blocks must never be stored after authorisation.', 'Douze familles d’exigences sur les réseaux, systèmes, accès, journalisation, tests et politiques. Les numéros de carte doivent être illisibles au repos ; les données de piste, cryptogrammes visuels et blocs PIN ne doivent jamais être conservés après autorisation.'),
    against: l('Mass theft of card numbers from servers, databases, logs and backups.', 'Le vol massif de numéros de carte dans les serveurs, bases, journaux et sauvegardes.'),
    not: l('Device security or PIN key management (other standards). An assessment is a snapshot: compliance last quarter does not prove security today.', 'La sécurité des appareils ni la gestion des clés PIN (autres standards). Une évaluation est une photographie : la conformité du trimestre dernier ne prouve pas la sécurité d’aujourd’hui.'),
  },
  {
    name: 'PCI PIN Security',
    applies: l('Any organisation handling PINs or PIN keys: acquirers, processors, key-injection facilities', 'Toute organisation manipulant des PIN ou des clés PIN : acquéreurs, processeurs, centres d’injection de clés'),
    what: l('How PIN keys are generated, loaded, exchanged, stored, used and destroyed: approved devices only, HSMs, dual control, split knowledge, key blocks, unique key per terminal, documented ceremonies.', 'Comment les clés PIN sont générées, chargées, échangées, stockées, utilisées et détruites : appareils approuvés uniquement, HSM, double contrôle, connaissance partagée, blocs de clés, clé unique par terminal, cérémonies documentées.'),
    against: l('A PIN or PIN key appearing in clear anywhere outside secure hardware, and one compromised key exposing many terminals.', 'L’apparition en clair d’un PIN ou d’une clé PIN hors d’un matériel sécurisé, et l’exposition de nombreux terminaux par une seule clé compromise.'),
    not: l('Protection of card numbers (PCI DSS) or the physical resistance of the terminal (PCI PTS).', 'La protection des numéros de carte (PCI DSS) ni la résistance physique du terminal (PCI PTS).'),
  },
];

const CONCEPTS: [L, L][] = [
  [l('Secure boundary', 'Périmètre sécurisé'), l('The line inside which secrets may exist in clear: the secure processor of a terminal, the inside of an HSM, the chip of a card. Everything outside handles ciphertext only.', 'La limite à l’intérieur de laquelle des secrets peuvent exister en clair : le processeur sécurisé d’un terminal, l’intérieur d’un HSM, la puce d’une carte. Tout ce qui est dehors ne manipule que du chiffré.')],
  [l('Tamper detection and response', 'Détection et réponse à l’intrusion'), l('Switches, meshes and sensors watch the casing, temperature and voltage. On any attack the device erases its keys within moments and stops working.', 'Contacts, treillis et capteurs surveillent le boîtier, la température et la tension. À la moindre attaque, l’appareil efface ses clés en quelques instants et cesse de fonctionner.')],
  [l('Secure key storage', 'Stockage sécurisé des clés'), l('Keys live in battery-backed memory inside the secure processor, or encrypted under a key that does. Software cannot read them out.', 'Les clés résident dans une mémoire secourue par pile au sein du processeur sécurisé, ou chiffrées sous une clé qui s’y trouve. Aucun logiciel ne peut les extraire.')],
  [l('Key injection', 'Injection de clés'), l('The first key enters the terminal in a certified key-injection facility under dual control, or remotely using asymmetric cryptography (remote key injection) so no clear key ever travels.', 'La première clé entre dans le terminal dans un centre d’injection certifié sous double contrôle, ou à distance par cryptographie asymétrique (injection de clés à distance), sans qu’aucune clé en clair ne circule.')],
  [l('Key management', 'Gestion des clés'), l('Each key has one purpose, one owner and a lifetime. Keys are exchanged only as key blocks under a key-encryption key, and every operation is logged.', 'Chaque clé a un usage, un propriétaire et une durée de vie. Les clés ne s’échangent qu’en blocs de clés sous une clé de chiffrement de clés, et chaque opération est journalisée.')],
  [l('Hardware security modules', 'Modules matériels de sécurité'), l('Certified vault computers at the acquirer, network and issuer. They are the only places, besides the terminal and the card, where PINs and keys are ever in clear.', 'Des ordinateurs-coffres certifiés chez l’acquéreur, le réseau et l’émetteur. Ce sont les seuls endroits, avec le terminal et la carte, où PIN et clés existent en clair.')],
  [l('Secure communication channels', 'Canaux de communication sécurisés'), l('TLS with certificate checks between terminal and host, private circuits between banks. They protect a link; they do not replace protection of the data itself.', 'TLS avec vérification de certificats entre terminal et hôte, liaisons privées entre banques. Ils protègent un lien ; ils ne remplacent pas la protection de la donnée elle-même.')],
  [l('Cardholder data protection', 'Protection des données porteur'), l('Show at most the first six and last four digits, encrypt or tokenise what is stored, encrypt from the reader with P2PE so merchant systems never hold a usable card number.', 'N’afficher au plus que les six premiers et quatre derniers chiffres, chiffrer ou tokeniser ce qui est stocké, chiffrer dès le lecteur avec P2PE pour que les systèmes du commerçant ne détiennent jamais un numéro exploitable.')],
];

function TamperDemo() {
  const t = useT();
  const [state, setState] = useState<'ok' | 'tampered'>('ok');
  const dk = deriveDukpt(TEST.BDK, TEST.KSN);
  const keys = [['Future key 1', dk.ipek], ['Future key 2', dk.txKey], ['Future key 3', dk.macKey]];
  const bad = state === 'tampered';
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h3 className="text-[15px] font-semibold">{t(l('Try it: open the terminal', 'Essayez : ouvrez le terminal'))}</h3>
      <p className="mt-1 max-w-[70ch] text-[13px] text-muted">{t(l('The secure processor holds the terminal’s PIN keys. See what happens when someone removes the back cover.', 'Le processeur sécurisé détient les clés PIN du terminal. Voyez ce qui se passe quand quelqu’un retire le capot arrière.'))}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[220px_1fr]">
        <div className="relative h-[200px] rounded-2xl border border-[#3a4568] bg-gradient-to-b from-[#2b3350] to-[#161c30] p-3">
          <motion.div animate={bad ? { rotate: -18, x: -16, y: -10 } : { rotate: 0, x: 0, y: 0 }} style={{ transformOrigin: 'bottom left' }} className="absolute inset-0 rounded-2xl border border-[#4a567c] bg-[#222a45]/90" />
          <div className={`relative z-10 mx-auto mt-10 w-[150px] rounded-lg border-2 p-2 text-center transition-colors ${bad ? 'border-danger bg-danger/15' : 'border-ok bg-ok/10'}`}>
            <div className="text-[10px] uppercase tracking-widest text-muted">{t(l('Secure processor', 'Processeur sécurisé'))}</div>
            <div className={`mt-1 font-display text-[13px] font-semibold ${bad ? 'text-danger' : 'text-ok'}`}>{bad ? t(l('TAMPERED', 'INTRUSION')) : t(l('Sensors armed', 'Capteurs armés'))}</div>
          </div>
          <div className="absolute bottom-3 left-3 right-3 z-10 text-center text-[11px] text-muted">{bad ? t(l('Device disabled', 'Appareil hors service')) : t(l('Mesh, switches, temperature, voltage', 'Treillis, contacts, température, tension'))}</div>
        </div>
        <div className="flex flex-col gap-2">
          {keys.map(([n, v], i) => (
            <div key={n} className="rounded-lg border border-line bg-bench px-2.5 py-1.5">
              <div className="text-[10.5px] uppercase tracking-wider text-muted">{n}</div>
              <motion.div key={state} initial={{ opacity: 0.2 }} animate={{ opacity: 1 }} transition={{ delay: bad ? 0.15 * i : 0 }} className={`hex text-[12.5px] ${bad ? 'text-danger' : 'text-crypto'}`}>{bad ? sp('0'.repeat(32)) : sp(v)}</motion.div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setState('tampered')} disabled={bad} className="rounded-lg border border-danger/60 bg-danger/10 px-3 py-1.5 text-[13px] font-semibold text-danger hover:bg-danger/20">{t(l('Remove the back cover', 'Retirer le capot arrière'))}</button>
            <button onClick={() => setState('ok')} disabled={!bad} className="rounded-lg border border-line bg-bench px-3 py-1.5 text-[13px] font-semibold hover:border-data/60">{t(l('Send back for repair and re-injection', 'Renvoyer en réparation et réinjection'))}</button>
          </div>
          <p className="text-[12.5px] text-muted">{bad ? t(l('Keys are zeroised before an attacker can reach them. The terminal must return to a secure facility: it cannot be revived in the shop.', 'Les clés sont mises à zéro avant qu’un attaquant ne les atteigne. Le terminal doit retourner en centre sécurisé : impossible de le réactiver en boutique.')) : t(l('Fictitious test keys, derived from the public ANSI X9.24 test vector.', 'Clés de test fictives, dérivées du vecteur de test public ANSI X9.24.'))}</p>
        </div>
      </div>
    </section>
  );
}

export default function PciView() {
  const t = useT();
  const [open, setOpen] = useState(0);
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-4 p-4">
      <div>
        <h2 className="text-[20px] font-bold">{t(l('PCI security and compliance', 'Sécurité et conformité PCI'))}</h2>
        <p className="max-w-[80ch] text-[13px] text-muted">{t(l('Three standards from the PCI Security Standards Council cover three different things: a device, an organisation’s handling of card data, and the handling of PINs and keys. None of them alone makes a payment chain secure.', 'Trois standards du PCI Security Standards Council couvrent trois choses différentes : un appareil, le traitement des données carte par une organisation, et le traitement des PIN et des clés. Aucun ne suffit seul à sécuriser une chaîne de paiement.'))}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {STD.map((s) => (
          <section key={s.name} className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
            <h3 className="text-[16px] font-semibold">{s.name}</h3>
            <Chip tone="net">{t(l('Applies to', 'S’applique à'))}</Chip>
            <p className="text-[13px] font-medium">{t(s.applies)}</p>
            <p className="text-[13px] leading-relaxed text-ink/90">{t(s.what)}</p>
            <div className="mt-auto flex flex-col gap-2 pt-1">
              <div className="rounded-lg border border-ok/40 bg-ok/10 p-2.5"><div className="text-[11px] font-semibold uppercase tracking-wider text-ok">{t(l('Protects against', 'Protège contre'))}</div><p className="text-[12.5px]">{t(s.against)}</p></div>
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-2.5"><div className="text-[11px] font-semibold uppercase tracking-wider text-danger">{t(l('Does not guarantee', 'Ne garantit pas'))}</div><p className="text-[12.5px]">{t(s.not)}</p></div>
            </div>
          </section>
        ))}
      </div>
      <p className="border-l-2 border-net pl-3 text-[12.5px] text-muted">{t(l('Related standards: PCI P2PE (validated encryption from reader to decryption environment), PCI MPoC (payments on off-the-shelf phones), PCI HSM, PCI Card Production. A PCI-approved terminal is one strong link; the chain is only as strong as its key management, software and operations.', 'Standards associés : PCI P2PE (chiffrement validé du lecteur jusqu’à l’environnement de déchiffrement), PCI MPoC (paiement sur téléphones du commerce), PCI HSM, PCI Card Production. Un terminal approuvé PCI est un maillon solide ; la chaîne ne vaut que par sa gestion des clés, ses logiciels et son exploitation.'))}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <TamperDemo />
        <section className="rounded-xl border border-line bg-panel p-4">
          <h3 className="text-[15px] font-semibold">{t(l('Security building blocks', 'Briques de sécurité'))}</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {CONCEPTS.map(([k, v], i) => (
              <li key={i}>
                <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[13.5px] font-medium ${open === i ? 'border-data/60 bg-panel2' : 'border-line bg-bench hover:border-data/60'}`}>
                  {t(k)}<span className="text-muted" aria-hidden="true">{open === i ? '−' : '+'}</span>
                </button>
                {open === i && <p className="px-3 py-2 text-[13px] leading-relaxed text-ink/90">{t(v)}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
