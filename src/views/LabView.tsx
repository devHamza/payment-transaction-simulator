/**
 * Visual cryptography lab. Every result on this page is computed live in the browser from
 * fictitious test keys, so changing an input shows the real effect on the output.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useT, l, type L } from '../i18n';
import { MECH, type CryptoOp, type Mech } from '../sim/types';
import { TEST } from '../sim/scenario';
import { aesDec, aesEnc, ascii2hex, pad80, retailMac, sha256, sp, tdesEnc, xor } from '../sim/crypto/primitives';
import { deriveDukpt, ksnWithCounter } from '../sim/crypto/dukpt';
import { pinBlock0, pinBlock4 } from '../sim/crypto/pin';
import { appCryptogram, deriveCardKey, deriveSessionKey } from '../sim/crypto/emv';
import { CryptoView } from '../components/Inspector';
import { NODE } from '../components/Ecosystem';
import { ActorIcon, Chip, Panel } from '../components/ui';
import { ACTOR_NAME, type Actor } from '../sim/types';

const AES_KEY = '000102030405060708090A0B0C0D0E0F';
const input = 'rounded-md border border-line bg-bench px-2 py-1.5 mono text-[13px] text-ink w-full';
const Lbl = ({ children, htmlFor }: { children: ReactNode; htmlFor: string }) => <label htmlFor={htmlFor} className="mb-1 block text-[11.5px] uppercase tracking-wider text-muted">{children}</label>;
const P = ({ children }: { children: ReactNode }) => <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink/90">{children}</p>;
const Val = ({ label, value, tone = 'data' }: { label: string; value: string; tone?: 'data' | 'crypto' | 'ok' | 'danger' }) => (
  <div className="rounded-lg border border-line bg-bench px-2.5 py-1.5">
    <div className="text-[10.5px] uppercase tracking-wider text-muted">{label}</div>
    <div className={`hex text-[12.5px] ${{ data: 'text-data', crypto: 'text-crypto', ok: 'text-ok', danger: 'text-danger' }[tone]}`}>{value}</div>
  </div>
);

/* ------------------------------------------------------------------ 1. mechanism map */
const LANES: { mech: Mech; spans: [Actor, Actor][]; key: L; who: L; no: L }[] = [
  { mech: 'emv', spans: [['card', 'issuer']], key: l('Card key shared by chip and issuer only (symmetric)', 'Clé carte partagée par la puce et l’émetteur seulement (symétrique)'), who: l('Only the issuer HSM can verify it. Everyone in between just carries it.', 'Seul le HSM émetteur peut le vérifier. Tous les intermédiaires ne font que le transporter.'), no: l('Hides nothing. It authenticates; it does not encrypt.', 'Ne cache rien. Il authentifie ; il ne chiffre pas.') },
  { mech: 'oda', spans: [['card', 'terminal']], key: l('RSA key pair in the chip, certified by issuer and scheme (asymmetric)', 'Paire de clés RSA dans la puce, certifiée par l’émetteur et le réseau (asymétrique)'), who: l('Any terminal holding the scheme’s public keys', 'Tout terminal détenant les clés publiques du réseau'), no: l('Says nothing about the account or the balance.', 'Ne dit rien du compte ni du solde.') },
  { mech: 'pin', spans: [['terminal', 'acquirer'], ['acquirer', 'scheme'], ['scheme', 'issuer']], key: l('A different PIN key on every segment: DUKPT key, then zone keys', 'Une clé PIN différente sur chaque segment : clé DUKPT, puis clés de zone'), who: l('Only HSMs decrypt, and only to re-encrypt or verify', 'Seuls les HSM déchiffrent, uniquement pour rechiffrer ou vérifier'), no: l('Does not prove the card is genuine.', 'Ne prouve pas que la carte est authentique.') },
  { mech: 'dukpt', spans: [['terminal', 'acquirer']], key: l('Base Derivation Key in the acquirer HSM; derived keys in the terminal', 'Base Derivation Key dans le HSM acquéreur ; clés dérivées dans le terminal'), who: l('Terminal and acquirer HSM compute the same one-time key', 'Le terminal et le HSM acquéreur calculent la même clé à usage unique'), no: l('Produces keys only; another mechanism uses them.', 'Ne produit que des clés ; un autre mécanisme les utilise.') },
  { mech: 'tls', spans: [['terminal', 'gateway'], ['gateway', 'acquirer']], key: l('Session keys negotiated per connection with certificates', 'Clés de session négociées par connexion avec des certificats'), who: l('The two ends of one link. It ends at each server.', 'Les deux extrémités d’un lien. Il s’arrête à chaque serveur.'), no: l('Does not protect data once it is inside a server.', 'Ne protège plus les données une fois dans un serveur.') },
  { mech: 'mac', spans: [['gateway', 'acquirer'], ['acquirer', 'scheme'], ['scheme', 'issuer']], key: l('MAC key shared by the two hosts of a link', 'Clé MAC partagée par les deux hôtes d’un lien'), who: l('The receiving host recomputes and compares', 'L’hôte destinataire recalcule et compare'), no: l('Not confidential, and not end to end.', 'Pas de confidentialité, et pas de bout en bout.') },
  { mech: 'keymgmt', spans: [['acquirer', 'scheme'], ['scheme', 'issuer']], key: l('Key-encryption keys wrap other keys in TR-31 key blocks', 'Des clés de chiffrement de clés enveloppent les autres clés en blocs TR-31'), who: l('HSMs, under dual control and split knowledge', 'Les HSM, sous double contrôle et connaissance partagée'), no: l('Protects keys, never transaction data.', 'Protège des clés, jamais les données de transaction.') },
];
const MAIN: Actor[] = ['card', 'terminal', 'gateway', 'acquirer', 'scheme', 'issuer'];

function MapTab() {
  const t = useT();
  const [sel, setSel] = useState<Mech>('emv');
  const lane = LANES.find((x) => x.mech === sel)!;
  return (
    <div className="flex flex-col gap-4">
      <P>{t(l('Six different mechanisms protect one payment. They use different keys, cover different stretches of the journey and solve different problems. Select a lane.', 'Six mécanismes différents protègent un paiement. Ils utilisent des clés différentes, couvrent des portions différentes du trajet et résolvent des problèmes différents. Sélectionnez une ligne.'))}</P>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="relative ml-[190px] h-12">
            {MAIN.map((a) => (
              <div key={a} style={{ left: `${NODE[a].x}%` }} className="absolute flex -translate-x-1/2 flex-col items-center text-muted">
                <ActorIcon actor={a} size={18} /><span className="text-[10.5px]">{t(ACTOR_NAME[a])}</span>
              </div>
            ))}
          </div>
          {LANES.map((ln) => (
            <button key={ln.mech} onClick={() => setSel(ln.mech)} aria-pressed={sel === ln.mech}
              className={`flex w-full items-center rounded-lg border py-2 text-left transition-colors ${sel === ln.mech ? 'border-crypto bg-crypto/10' : 'border-transparent hover:bg-panel2'}`}>
              <span className="w-[190px] shrink-0 px-2 text-[12.5px] font-medium">{t(MECH[ln.mech].name)}</span>
              <span className="relative h-4 flex-1">
                {ln.spans.map(([a, b], i) => (
                  <span key={i} style={{ left: `${NODE[a].x}%`, width: `${NODE[b].x - NODE[a].x}%` }}
                    className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-full ${ln.mech === 'tls' || ln.mech === 'keymgmt' ? 'bg-net' : 'bg-crypto'} ${i % 2 ? 'opacity-60' : ''}`}>
                    <span className="absolute -left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-bg bg-inherit" />
                    <span className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-bg bg-inherit" />
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
      <dl className="grid gap-x-4 gap-y-2 rounded-xl border border-line bg-bench p-4 text-[13px] sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">{t(l('Purpose', 'Rôle'))}</dt><dd className="font-semibold">{t(MECH[sel].purpose)}</dd>
        <dt className="text-muted">{t(l('Key', 'Clé'))}</dt><dd>{t(lane.key)}</dd>
        <dt className="text-muted">{t(l('Who can check or open it', 'Qui peut vérifier ou ouvrir'))}</dt><dd>{t(lane.who)}</dd>
        <dt className="text-danger">{t(l('What it does not do', 'Ce qu’il ne fait pas'))}</dt><dd>{t(lane.no)}</dd>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ 2. PIN block */
function Nibbles({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[86px] shrink-0 text-[11.5px] text-muted">{label}</span>
      <span className="flex flex-wrap gap-0.5">{value.split('').map((c, i) => <span key={i} className={`mono flex h-6 w-[18px] items-center justify-center rounded-sm text-[12px] ${tone}`}>{c}</span>)}</span>
    </div>
  );
}

function PinTab() {
  const t = useT();
  const [pin, setPin] = useState('2468');
  const [counter, setCounter] = useState(8);
  const [fmt4, setFmt4] = useState(false);
  const [rnd, setRnd] = useState('5F3A9C1E7B20D468');
  const ok = /^\d{4,6}$/.test(pin);
  const pb = pinBlock0(ok ? pin : '0000', TEST.PAN);
  const ksn = ksnWithCounter(TEST.KSN, counter);
  const dk = useMemo(() => deriveDukpt(TEST.BDK, ksn), [ksn]);
  const enc = tdesEnc(dk.pinKey, pb.clear);
  const p4 = pinBlock4(ok ? pin : '0000', TEST.PAN, rnd, AES_KEY);
  const op: CryptoOp = {
    mech: 'pin', by: 'terminal', title: l('Encrypt the PIN block', 'Chiffrer le bloc PIN'),
    inputs: [{ label: l('Clear PIN block', 'Bloc PIN en clair'), value: pb.clear, sensitive: true }],
    key: { name: `DUKPT PIN key #${counter}`, value: dk.pinKey, type: l('Single-use symmetric key', 'Clé symétrique à usage unique') },
    op: l('TDES-ECB encrypt', 'Chiffrement TDES-ECB'), output: { label: l('Encrypted PIN block', 'Bloc PIN chiffré'), value: enc },
    dest: l('Acquirer HSM, with the KSN', 'HSM acquéreur, avec le KSN'), verify: l('HSM derives the same key and decrypts', 'Le HSM dérive la même clé et déchiffre'),
    protects: l('PIN confidentiality in transit', 'La confidentialité du PIN en transit'), notProtects: l('Card authenticity', 'L’authenticité de la carte'),
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <P>{t(l('Type a made-up PIN. Watch it get bound to the card number, then encrypted. Change one digit or the transaction counter: the whole result changes.', 'Tapez un PIN inventé. Regardez-le se lier au numéro de carte, puis être chiffré. Changez un chiffre ou le compteur de transaction : tout le résultat change.'))}</P>
        <div className="grid grid-cols-2 gap-3">
          <div><Lbl htmlFor="lab-pin">{t(l('Fictitious PIN (4–6 digits)', 'PIN fictif (4 à 6 chiffres)'))}</Lbl><input id="lab-pin" className={`${input} ${ok ? '' : 'border-danger'}`} value={pin} maxLength={6} inputMode="numeric" onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />{!ok && <p className="mt-1 text-[12px] text-danger">{t(l('Enter 4 to 6 digits.', 'Saisissez 4 à 6 chiffres.'))}</p>}</div>
          <div><Lbl htmlFor="lab-ctr">{t(l('Transaction counter', 'Compteur de transaction'))}: {counter}</Lbl><input id="lab-ctr" type="range" min={1} max={40} value={counter} onChange={(e) => setCounter(+e.target.value)} className="w-full accent-[var(--color-crypto)]" /></div>
        </div>
        <label className="flex items-center gap-2 text-[13px]" htmlFor="lab-f4"><input id="lab-f4" type="checkbox" checked={fmt4} onChange={(e) => setFmt4(e.target.checked)} className="accent-[var(--color-crypto)]" />{t(l('Show ISO 9564 format 4 (AES) instead', 'Afficher plutôt le format 4 ISO 9564 (AES)'))}</label>
        {!fmt4 ? (
          <div className="flex flex-col gap-1.5 overflow-x-auto rounded-xl border border-line bg-bench p-3">
            <div className="text-[12px] font-semibold text-ink">{t(l('Format 0: PIN field XOR PAN field', 'Format 0 : champ PIN XOR champ PAN'))}</div>
            <Nibbles label={t(l('PIN field', 'Champ PIN'))} value={pb.pinField} tone="bg-danger/15 text-danger" />
            <Nibbles label={t(l('PAN field', 'Champ PAN'))} value={pb.panField} tone="bg-data/15 text-data" />
            <div className="ml-[94px] text-[11px] text-crypto">⊕ XOR</div>
            <Nibbles label={t(l('Clear block', 'Bloc en clair'))} value={pb.clear} tone="bg-crypto/15 text-crypto" />
            <p className="mt-1 text-[12px] text-muted">{t(l('The PIN field is: 0, PIN length, the digits, then F padding. The first four nibbles of the result still show the length and the first two digits: XOR alone is not encryption.', 'Le champ PIN contient : 0, la longueur, les chiffres, puis un bourrage F. Les quatre premiers quartets du résultat montrent encore la longueur et les deux premiers chiffres : le XOR seul n’est pas un chiffrement.'))}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-bench p-3">
            <div className="flex items-center justify-between"><span className="text-[12px] font-semibold">{t(l('Format 4: two AES operations', 'Format 4 : deux opérations AES'))}</span>
              <button onClick={() => setRnd(Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase())} className="rounded-md border border-line px-2 py-0.5 text-[12px] text-data hover:border-data/60">{t(l('New random padding', 'Nouvel aléa'))}</button></div>
            <Val label={t(l('PIN field (4, length, PIN, A padding, 8 random bytes)', 'Champ PIN (4, longueur, PIN, bourrage A, 8 octets aléatoires)'))} value={sp(p4.pinField)} tone="danger" />
            <Val label={t(l('A = AES(key, PIN field)', 'A = AES(clé, champ PIN)'))} value={sp(p4.a)} tone="crypto" />
            <Val label={t(l('PAN field', 'Champ PAN'))} value={sp(p4.panField)} />
            <Val label="B = A ⊕ PAN" value={sp(p4.b)} tone="crypto" />
            <Val label={t(l('Encrypted PIN block = AES(key, B)', 'Bloc PIN chiffré = AES(clé, B)'))} value={sp(p4.out)} tone="ok" />
            <p className="text-[12px] text-muted">{t(l('The random half makes two encryptions of the same PIN look unrelated. The PAN is mixed in between two encryptions, so it is never recoverable from the block.', 'La moitié aléatoire rend deux chiffrements du même PIN sans rapport apparent. Le PAN est mêlé entre deux chiffrements : il n’est jamais récupérable depuis le bloc.'))}</p>
          </div>
        )}
      </div>
      {!fmt4 && <CryptoView op={op} animateKey={enc} />}
    </div>
  );
}

/* ------------------------------------------------------------------ 3. DUKPT */
function DukptTab() {
  const t = useT();
  const [counter, setCounter] = useState(11);
  const ksn = ksnWithCounter(TEST.KSN, counter);
  const dk = useMemo(() => deriveDukpt(TEST.BDK, ksn), [ksn]);
  const bits = counter.toString(2).padStart(8, '0');
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <P>{t(l('Move the counter as if the terminal had done more payments. Each 1 bit of the counter triggers one one-way derivation, so key number 11 cannot be turned back into key number 10.', 'Déplacez le compteur comme si le terminal avait réalisé d’autres paiements. Chaque bit à 1 du compteur déclenche une dérivation à sens unique : la clé n° 11 ne permet pas de retrouver la clé n° 10.'))}</P>
        <div><Lbl htmlFor="dk-ctr">{t(l('Payments made by this terminal', 'Paiements réalisés par ce terminal'))}: {counter}</Lbl><input id="dk-ctr" type="range" min={1} max={255} value={counter} onChange={(e) => setCounter(+e.target.value)} className="w-full accent-[var(--color-crypto)]" /></div>
        <div className="rounded-xl border border-line bg-bench p-3">
          <div className="text-[11.5px] uppercase tracking-wider text-muted">Key Serial Number</div>
          <div className="mono mt-1 flex flex-wrap gap-x-1 text-[13px]">
            <span className="text-net" title="Key set ID">{ksn.slice(0, 6)}</span><span className="text-data" title="Device ID">{ksn.slice(6, 15)}</span><span className="text-crypto" title="Counter">{ksn.slice(15)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px]"><span className="text-net">■ {t(l('key set', 'jeu de clés'))}</span><span className="text-data">■ {t(l('device', 'appareil'))}</span><span className="text-crypto">■ {t(l('counter (21 bits)', 'compteur (21 bits)'))}</span></div>
          <div className="mt-3 text-[11.5px] uppercase tracking-wider text-muted">{t(l('Counter, low 8 bits', 'Compteur, 8 bits de poids faible'))}</div>
          <div className="mt-1 flex gap-1">{bits.split('').map((b, i) => <span key={i} className={`mono flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-semibold ${b === '1' ? 'bg-crypto text-bg' : 'bg-panel2 text-muted'}`}>{b}</span>)}</div>
          <p className="mt-2 text-[12px] text-muted">{dk.steps.length} {t(l('derivation(s) from the initial key', 'dérivation(s) depuis la clé initiale'))}</p>
        </div>
        <div className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-[13px]">
          <div className="font-semibold text-ok">{t(l('Acquirer HSM, same computation', 'HSM acquéreur, même calcul'))}</div>
          <p className="text-ink/90">{t(l('It receives only the KSN. From its Base Derivation Key it derives the initial key, replays the derivations and lands on the same key:', 'Il ne reçoit que le KSN. Depuis sa Base Derivation Key il dérive la clé initiale, rejoue les dérivations et obtient la même clé :'))}</p>
          <div className="hex mt-1 text-[12.5px] text-ok">{sp(deriveDukpt(TEST.BDK, ksn).pinKey)} ✓</div>
        </div>
      </div>
      <CryptoView animateKey={ksn} op={{
        mech: 'dukpt', by: 'terminal', title: l('Derive the key for this payment', 'Dériver la clé de ce paiement'),
        inputs: [{ label: 'KSN', value: ksn }],
        key: { name: 'IPEK = f(BDK, KSN)', value: dk.ipek, type: l('Initial key. The BDK itself (public test value here) stays in the HSM.', 'Clé initiale. La BDK elle-même (valeur de test publique ici) reste dans le HSM.') },
        op: l('One-way derivation per set bit', 'Dérivation à sens unique par bit à 1'),
        stages: dk.steps.map((s) => ({ label: l(`bit ${s.bit}`, `bit ${s.bit}`), value: s.key })),
        output: { label: l('PIN key variant', 'Variante clé PIN'), value: dk.pinKey },
        dest: l('Encrypts one PIN block, then is erased', 'Chiffre un bloc PIN, puis est effacée'), verify: l('Matches the ANSI X9.24-1 test vectors', 'Conforme aux vecteurs de test ANSI X9.24-1'),
        protects: l('Past transactions if a terminal is compromised', 'Les transactions passées si un terminal est compromis'), notProtects: l('Future transactions of that same terminal', 'Les transactions futures de ce même terminal'),
      }} />
    </div>
  );
}

/* ------------------------------------------------------------------ 4. EMV cryptogram */
function EmvTab() {
  const t = useT();
  const [amt, setAmt] = useState(500);
  const [seen, setSeen] = useState(500);
  const [atc, setAtc] = useState(30);
  const data = (a: number) => String(a).padStart(12, '0') + '000000000000' + '0250' + '0000000000' + '0978' + '261116' + '00' + TEST.UN + '1980' + atc.toString(16).toUpperCase().padStart(4, '0');
  const ck = deriveCardKey(TEST.IMK_AC, TEST.PAN, TEST.PSN);
  const sk = deriveSessionKey(ck.mk, atc.toString(16).toUpperCase().padStart(4, '0'));
  const card = appCryptogram(sk.sk, data(amt));
  const bank = appCryptogram(sk.sk, data(seen));
  const match = card.mac === bank.mac;
  const eur = (c: number) => (c / 100).toFixed(2);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <P>{t(l('Play the attacker. The card signs one amount. Change the amount the bank receives and see whether the bank notices. Then run another transaction and compare cryptograms.', 'Jouez l’attaquant. La carte signe un montant. Modifiez le montant reçu par la banque et voyez si elle s’en aperçoit. Lancez ensuite une autre transaction et comparez les cryptogrammes.'))}</P>
        <div className="grid grid-cols-2 gap-3">
          <div><Lbl htmlFor="emv-a">{t(l('Amount the card signs (cents)', 'Montant signé par la carte (centimes)'))}</Lbl><input id="emv-a" type="number" min={1} max={999999} className={input} value={amt} onChange={(e) => { const v = Math.max(0, Math.min(999999, +e.target.value || 0)); setAmt(v); setSeen(v); }} /></div>
          <div><Lbl htmlFor="emv-b">{t(l('Amount the bank receives (cents)', 'Montant reçu par la banque (centimes)'))}</Lbl><input id="emv-b" type="number" min={1} max={999999} className={`${input} ${match ? '' : 'border-danger'}`} value={seen} onChange={(e) => setSeen(Math.max(0, Math.min(999999, +e.target.value || 0)))} /></div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setAtc(atc + 1)} className="rounded-lg border border-crypto/60 bg-crypto/10 px-3 py-1.5 text-[13px] font-semibold text-crypto hover:bg-crypto/20">{t(l('Next transaction (ATC + 1)', 'Transaction suivante (ATC + 1)'))}</button>
          <span className="mono text-[13px] text-muted">ATC = {atc}</span>
        </div>
        <Val label={`ARQC ${t(l('from the card for', 'de la carte pour'))} €${eur(amt)}`} value={sp(card.mac)} tone="crypto" />
        <Val label={`${t(l('Recomputed by the bank for', 'Recalculé par la banque pour'))} €${eur(seen)}`} value={sp(bank.mac)} tone={match ? 'ok' : 'danger'} />
        <div className={`rounded-xl border p-3 text-[13.5px] font-semibold ${match ? 'border-ok/50 bg-ok/10 text-ok' : 'border-danger/50 bg-danger/10 text-danger'}`}>
          {match ? t(l('Match: genuine card, untouched data.', 'Identiques : carte authentique, données intactes.')) : t(l('Mismatch: the data was altered or the card is fake. The bank declines.', 'Différents : données modifiées ou fausse carte. La banque refuse.'))}
        </div>
        <p className="text-[12px] text-muted">{t(l('Same amount, next ATC: a completely different cryptogram. A recorded transaction cannot be replayed.', 'Même montant, ATC suivant : un cryptogramme totalement différent. Une transaction enregistrée ne peut pas être rejouée.'))}</p>
      </div>
      <CryptoView animateKey={card.mac} op={{
        mech: 'emv', by: 'card', title: l('ARQC = MAC over transaction data', 'ARQC = MAC sur les données de transaction'),
        inputs: [{ label: l('Amount, country, TVR, currency, date, type, UN, AIP, ATC', 'Montant, pays, TVR, devise, date, type, UN, AIP, ATC'), value: data(amt) }],
        key: { name: 'SK-AC = f(MK-AC, ATC)', value: sk.sk, type: l('Session key, new for every ATC', 'Clé de session, nouvelle à chaque ATC') },
        op: l('ISO/IEC 9797-1 MAC algorithm 3', 'MAC ISO/IEC 9797-1 algorithme 3'),
        stages: card.trace.map((x, i) => ({ label: l(`block ${i + 1}`, `bloc ${i + 1}`), value: x.out })),
        output: { label: 'ARQC', value: card.mac },
        dest: l('Issuer, inside field 55', 'Émetteur, dans le champ 55'), verify: l('Issuer HSM recomputes with the same derived key', 'Le HSM émetteur recalcule avec la même clé dérivée'),
        protects: l('Authenticity and integrity', 'Authenticité et intégrité'), notProtects: l('Confidentiality: the amount is readable', 'Confidentialité : le montant reste lisible'),
      }} />
    </div>
  );
}

/* ------------------------------------------------------------------ 5. hash vs encrypt vs MAC */
const toHex = (s: string) => ascii2hex(s.replace(/[^\x20-\x7E]/g, '?'));
const fromHex = (h: string) => (h.match(/../g) || []).map((b) => String.fromCharCode(parseInt(b, 16))).join('');

function CompareTab() {
  const t = useT();
  const [msg, setMsg] = useState('PAY 5.00 EUR TO CAFE DEMO');
  const [got, setGot] = useState('PAY 5.00 EUR TO CAFE DEMO');
  const [key2, setKey2] = useState(false);
  const pt = pad80(toHex(msg), 16);
  const ct = aesEnc(AES_KEY, pt);
  const back = fromHex(aesDec(AES_KEY, ct).replace(/80(00)*$/, ''));
  const mac = retailMac(TEST.MACK, toHex(msg)).mac;
  const mac2 = retailMac(key2 ? TEST.AWK : TEST.MACK, toHex(got)).mac;
  const rows: [L, string, string, string][] = [
    [l('Needs a key?', 'Besoin d’une clé ?'), '✕', '✓', '✓'],
    [l('Can you get the message back?', 'Peut-on retrouver le message ?'), '✕', '✓', '✕'],
    [l('Hides the content?', 'Cache le contenu ?'), '—', '✓', '✕'],
    [l('Detects tampering by an attacker?', 'Détecte une modification par un attaquant ?'), '✕', '✕', '✓'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <P>{t(l('Three tools that people often confuse. Type a message and compare what each one produces and what it is good for.', 'Trois outils que l’on confond souvent. Tapez un message et comparez ce que chacun produit et ce à quoi il sert.'))}</P>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Lbl htmlFor="cmp-m">{t(l('Message sent', 'Message envoyé'))}</Lbl><input id="cmp-m" className={input} value={msg} maxLength={60} onChange={(e) => { setMsg(e.target.value); setGot(e.target.value); }} /></div>
        <div><Lbl htmlFor="cmp-g">{t(l('Message received (edit to tamper)', 'Message reçu (modifiez pour falsifier)'))}</Lbl><input id="cmp-g" className={`${input} ${got === msg ? '' : 'border-danger'}`} value={got} maxLength={60} onChange={(e) => setGot(e.target.value)} /></div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title={t(l('Hash (SHA-256)', 'Hachage (SHA-256)'))}>
          <div className="flex flex-col gap-2 p-3">
            <Val label={t(l('Fingerprint of the sent message', 'Empreinte du message envoyé'))} value={sp(sha256(msg).slice(0, 32)) + ' …'} />
            <Val label={t(l('Fingerprint of the received message', 'Empreinte du message reçu'))} value={sp(sha256(got).slice(0, 32)) + ' …'} tone={got === msg ? 'ok' : 'danger'} />
            <p className="text-[12.5px] text-muted">{t(l('No key, one way. Anyone can recompute it, so an attacker who changes the message simply recomputes the hash too.', 'Sans clé, à sens unique. N’importe qui peut le recalculer : un attaquant qui modifie le message recalcule aussi le haché.'))}</p>
          </div>
        </Panel>
        <Panel title={t(l('Encryption (AES-128)', 'Chiffrement (AES-128)'))}>
          <div className="flex flex-col gap-2 p-3">
            <Val label={t(l('Ciphertext', 'Texte chiffré'))} value={sp(ct)} tone="crypto" />
            <Val label={t(l('Decrypted with the key', 'Déchiffré avec la clé'))} value={back} tone="ok" />
            <p className="text-[12.5px] text-muted">{t(l('Hides the content and is reversible with the key. On its own it does not tell you whether the ciphertext was altered.', 'Cache le contenu et est réversible avec la clé. Seul, il ne dit pas si le texte chiffré a été altéré.'))}</p>
          </div>
        </Panel>
        <Panel title={t(l('Authentication (MAC)', 'Authentification (MAC)'))}>
          <div className="flex flex-col gap-2 p-3">
            <Val label={t(l('MAC sent with the message', 'MAC envoyé avec le message'))} value={sp(mac)} tone="crypto" />
            <Val label={t(l('MAC recomputed by the receiver', 'MAC recalculé par le destinataire'))} value={sp(mac2) + (mac === mac2 ? '  ✓' : '  ✕')} tone={mac === mac2 ? 'ok' : 'danger'} />
            <label className="flex items-center gap-2 text-[12.5px]" htmlFor="cmp-k"><input id="cmp-k" type="checkbox" checked={key2} onChange={(e) => setKey2(e.target.checked)} className="accent-[var(--color-crypto)]" />{t(l('Receiver has the wrong key', 'Le destinataire a une mauvaise clé'))}</label>
            <p className="text-[12.5px] text-muted">{t(l('The message stays readable, but without the key nobody can produce a valid MAC. This is what an EMV cryptogram is.', 'Le message reste lisible, mais sans la clé personne ne peut produire un MAC valide. C’est ce qu’est un cryptogramme EMV.'))}</p>
          </div>
        </Panel>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead><tr className="text-left text-[11.5px] uppercase tracking-wider text-muted"><th className="py-1.5 pr-3 font-medium"></th><th className="px-3 font-medium">{t(l('Hash', 'Hachage'))}</th><th className="px-3 font-medium">{t(l('Encryption', 'Chiffrement'))}</th><th className="px-3 font-medium">MAC</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-3">{t(r[0])}</td>{r.slice(1).map((c, k) => <td key={k} className={`px-3 font-semibold ${c === '✓' ? 'text-ok' : c === '✕' ? 'text-danger' : 'text-muted'}`}>{c as string}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 6. asymmetric */
const modpow = (b: bigint, e: bigint, m: bigint) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
const N = 3233n, E = 17n, D = 2753n;

function AsymTab() {
  const t = useT();
  const [msg, setMsg] = useState('CARD 5413...0018 ATC 30');
  const [forge, setForge] = useState(false);
  const digest = BigInt(parseInt(sha256(msg).slice(0, 6), 16)) % N;
  const sig = forge ? (modpow(digest, 1234n, N)) : modpow(digest, D, N);
  const rec = modpow(sig, E, N);
  const ok = rec === digest;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <P>{t(l('With symmetric cryptography both sides hold the same secret. With asymmetric cryptography the card keeps a private key and anyone may hold the matching public key. That lets a terminal check a card it shares no secret with.', 'En cryptographie symétrique, les deux côtés détiennent le même secret. En asymétrique, la carte garde une clé privée et n’importe qui peut détenir la clé publique associée. Un terminal peut ainsi vérifier une carte avec laquelle il ne partage aucun secret.'))}</P>
        <div><Lbl htmlFor="as-m">{t(l('Data the card signs', 'Données signées par la carte'))}</Lbl><input id="as-m" className={input} value={msg} maxLength={50} onChange={(e) => setMsg(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-[13px]" htmlFor="as-f"><input id="as-f" type="checkbox" checked={forge} onChange={(e) => setForge(e.target.checked)} className="accent-[var(--color-danger)]" />{t(l('Counterfeit card: signs with a wrong private key', 'Carte contrefaite : signe avec une mauvaise clé privée'))}</label>
        <div className="grid grid-cols-2 gap-2">
          <Val label={t(l('Private key (in the chip)', 'Clé privée (dans la puce)'))} value={`d = ${forge ? 1234 : D}, n = ${N}`} tone="danger" />
          <Val label={t(l('Public key (in the certificate)', 'Clé publique (dans le certificat)'))} value={`e = ${E}, n = ${N}`} tone="data" />
          <Val label={t(l('Digest of the data', 'Condensé des données'))} value={`h = ${digest}`} />
          <Val label={t(l('Signature = h^d mod n', 'Signature = h^d mod n'))} value={`s = ${sig}`} tone="crypto" />
        </div>
        <div className={`rounded-xl border p-3 text-[13.5px] ${ok ? 'border-ok/50 bg-ok/10 text-ok' : 'border-danger/50 bg-danger/10 text-danger'}`}>
          <span className="mono">s^e mod n = {String(rec)}</span> {ok ? '=' : '≠'} <span className="mono">h = {String(digest)}</span>
          <div className="font-semibold">{ok ? t(l('Signature valid: the card holds the private key.', 'Signature valide : la carte détient la clé privée.')) : t(l('Signature invalid: counterfeit card.', 'Signature invalide : carte contrefaite.'))}</div>
        </div>
        <p className="text-[12px] text-muted">{t(l('Toy RSA with a 12-bit modulus so the arithmetic is readable. Real EMV keys are 1024 to 1984 bits; EMV is adding elliptic-curve keys.', 'RSA jouet avec un module de 12 bits pour que l’arithmétique reste lisible. Les vraies clés EMV font 1024 à 1984 bits ; EMV introduit des clés à courbes elliptiques.'))}</p>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-[14px] font-semibold">{t(l('Why trust the card’s public key? The certificate chain', 'Pourquoi faire confiance à la clé publique de la carte ? La chaîne de certificats'))}</h3>
        {([
          [l('Card network CA', 'AC du réseau carte'), l('Its public key is loaded into every terminal. Its private key signs issuer certificates.', 'Sa clé publique est chargée dans chaque terminal. Sa clé privée signe les certificats émetteurs.'), 'net'],
          [l('Issuer', 'Émetteur'), l('Certificate in tag 90. The issuer’s private key signs each card’s certificate.', 'Certificat dans le tag 90. La clé privée de l’émetteur signe le certificat de chaque carte.'), 'net'],
          [l('Card (ICC)', 'Carte (ICC)'), l('Certificate in tag 9F46. The card’s private key signs dynamic data for this transaction.', 'Certificat dans le tag 9F46. La clé privée de la carte signe des données dynamiques pour cette transaction.'), 'crypto'],
          [l('This transaction', 'Cette transaction'), l('Signed Dynamic Application Data, tag 9F4B: includes the terminal’s random number.', 'Signed Dynamic Application Data, tag 9F4B : inclut le nombre aléatoire du terminal.'), 'data'],
        ] as [L, L, 'net' | 'crypto' | 'data'][]).map(([a, b, tone], i) => (
          <div key={i} className="flex flex-col items-start gap-1">
            {i > 0 && <span className="ml-5 text-[11px] text-muted">↓ {t(l('signs', 'signe'))}</span>}
            <div className="w-full rounded-xl border border-line bg-bench p-3"><Chip tone={tone}>{t(a)}</Chip><p className="mt-1 text-[12.5px] text-ink/90">{t(b)}</p></div>
          </div>
        ))}
        <table className="mt-1 w-full border-collapse text-[12.5px]">
          <thead><tr className="text-left text-[11.5px] uppercase tracking-wider text-muted"><th className="py-1 pr-2 font-medium"></th><th className="px-2 font-medium">{t(l('Symmetric', 'Symétrique'))}</th><th className="px-2 font-medium">{t(l('Asymmetric', 'Asymétrique'))}</th></tr></thead>
          <tbody>
            {([[l('Keys', 'Clés'), l('One shared secret', 'Un secret partagé'), l('Private + public pair', 'Paire privée + publique')], [l('Speed', 'Vitesse'), l('Very fast', 'Très rapide'), l('Slow', 'Lent')], [l('In a payment', 'Dans un paiement'), l('ARQC, PIN encryption, DUKPT, MAC', 'ARQC, chiffrement PIN, DUKPT, MAC'), l('Offline card authentication, TLS handshake, remote key injection', 'Authentification hors ligne de la carte, négociation TLS, injection de clés à distance')]] as L[][]).map((r, i) => (
              <tr key={i} className="border-t border-line align-top">{r.map((c, k) => <td key={k} className={`py-1.5 ${k ? 'px-2' : 'pr-2 text-muted'}`}>{t(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 7. keys */
const kcv = (k: string) => tdesEnc(k, '0000000000000000').slice(0, 6);
const TR31: [string, L][] = [
  ['B', l('Version: B = TDES key-derivation binding method. D = AES.', 'Version : B = méthode de liaison par dérivation de clé TDES. D = AES.')],
  ['0080', l('Total length of the key block in characters.', 'Longueur totale du bloc de clé en caractères.')],
  ['P0', l('Key usage: P0 = PIN encryption key. B0 = BDK, K0 = key-encryption key, M3 = MAC key.', 'Usage : P0 = clé de chiffrement PIN. B0 = BDK, K0 = clé de chiffrement de clés, M3 = clé MAC.')],
  ['T', l('Algorithm of the wrapped key: T = TDES, A = AES.', 'Algorithme de la clé enveloppée : T = TDES, A = AES.')],
  ['E', l('Mode of use: E = encrypt only. D = decrypt only, B = both, X = derive.', 'Mode d’usage : E = chiffrement seul. D = déchiffrement seul, B = les deux, X = dérivation.')],
  ['00', l('Key version number.', 'Numéro de version de la clé.')],
  ['N', l('Exportability: N = not exportable. E = exportable under a KEK.', 'Exportabilité : N = non exportable. E = exportable sous une KEK.')],
  ['00', l('Number of optional header blocks.', 'Nombre de blocs d’en-tête optionnels.')],
  ['00', l('Reserved.', 'Réservé.')],
];

function KeysTab() {
  const t = useT();
  const [sel, setSel] = useState(2);
  const [c1, setC1] = useState('A1B2C3D4E5F60718293A4B5C6D7E8F90');
  const c2 = xor(c1.padEnd(32, '0').slice(0, 32), TEST.AWK);
  const dk = deriveDukpt(TEST.BDK, TEST.KSN);
  const ck = deriveCardKey(TEST.IMK_AC, TEST.PAN, TEST.PSN);
  const sk = deriveSessionKey(ck.mk, TEST.ATC);
  const wrapped = tdesEnc(TEST.MACK, TEST.AWK.slice(0, 16)) + tdesEnc(TEST.MACK, TEST.AWK.slice(16));
  const Tree = ({ title, tone, nodes }: { title: string; tone: string; nodes: [string, string, L][] }) => (
    <div className="rounded-xl border border-line bg-bench p-3">
      <h3 className={`text-[13px] font-semibold ${tone}`}>{title}</h3>
      <ol className="mt-2 flex flex-col">
        {nodes.map(([name, val, where], i) => (
          <li key={i} style={{ marginLeft: i * 14 }} className="border-l-2 border-line py-1 pl-3">
            <div className="flex flex-wrap items-baseline gap-x-2"><span className="mono text-[12.5px] font-semibold">{name}</span><span className="text-[11.5px] text-muted">{t(where)}</span></div>
            <div className="hex text-[11.5px] text-crypto">{sp(val)}</div>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <P>{t(l('Keys form families. A master key at the top never leaves an HSM; every level below is derived for a narrower job: one terminal, one card, one transaction. The values below are computed from the test keys used by the simulator.', 'Les clés forment des familles. Une clé maître au sommet ne quitte jamais un HSM ; chaque niveau inférieur est dérivé pour un usage plus étroit : un terminal, une carte, une transaction. Les valeurs ci-dessous sont calculées à partir des clés de test du simulateur.'))}</P>
      <div className="grid gap-3 lg:grid-cols-2">
        <Tree title={t(l('Acquirer side: PIN protection', 'Côté acquéreur : protection du PIN'))} tone="text-crypto" nodes={[
          ['BDK', TEST.BDK, l('acquirer HSM only', 'HSM acquéreur uniquement')],
          ['IPEK', dk.ipek, l('injected once into one terminal', 'injectée une fois dans un terminal')],
          [`Transaction key #${dk.counter}`, dk.txKey, l('derived in the terminal, used once', 'dérivée dans le terminal, usage unique')],
          ['PIN key variant', dk.pinKey, l('encrypts one PIN block', 'chiffre un bloc PIN')],
        ]} />
        <Tree title={t(l('Issuer side: EMV cryptograms', 'Côté émetteur : cryptogrammes EMV'))} tone="text-crypto" nodes={[
          ['IMK-AC', TEST.IMK_AC, l('issuer HSM only', 'HSM émetteur uniquement')],
          ['MK-AC', ck.mk, l('unique per card, written into the chip', 'unique par carte, écrite dans la puce')],
          ['SK-AC', sk.sk, l('unique per transaction (ATC)', 'unique par transaction (ATC)')],
        ]} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-bench p-3">
          <h3 className="text-[13px] font-semibold text-net">{t(l('TR-31 key block: how a key travels between HSMs', 'Bloc de clé TR-31 : comment une clé voyage entre HSM'))}</h3>
          <p className="mt-1 text-[12.5px] text-muted">{t(l('The header states what the key is allowed to do, and a MAC binds the header to the encrypted key so its usage cannot be changed. Select a header field.', 'L’en-tête indique ce que la clé a le droit de faire, et un MAC lie l’en-tête à la clé chiffrée : son usage ne peut pas être modifié. Sélectionnez un champ.'))}</p>
          <div className="mt-2 flex flex-wrap gap-0.5">
            {TR31.map(([v], i) => <button key={i} onClick={() => setSel(i)} aria-pressed={sel === i} className={`mono rounded px-1.5 py-1 text-[13px] ${sel === i ? 'bg-net text-bg' : 'bg-panel2 text-net hover:bg-net/30'}`}>{v}</button>)}
            <span className="mono rounded bg-crypto/15 px-1.5 py-1 text-[13px] text-crypto" title="encrypted key">{wrapped.slice(0, 16)}…</span>
            <span className="mono rounded bg-ok/15 px-1.5 py-1 text-[13px] text-ok" title="MAC">{retailMac(TEST.MACK, wrapped).mac.slice(0, 8)}</span>
          </div>
          <p className="mt-2 rounded-md bg-panel2 px-2.5 py-1.5 text-[12.5px]">{t(TR31[sel][1])}</p>
          <p className="mt-2 text-[11.5px] text-muted">{t(l('Header per ANSI X9.143 (TR-31). The encrypted part and MAC shown here are a simplified illustration, not the full key-block binding method.', 'En-tête selon ANSI X9.143 (TR-31). La partie chiffrée et le MAC affichés sont une illustration simplifiée, pas la méthode de liaison complète.'))}</p>
        </div>
        <div className="rounded-xl border border-line bg-bench p-3">
          <h3 className="text-[13px] font-semibold text-net">{t(l('Key ceremony: split knowledge', 'Cérémonie de clés : connaissance partagée'))}</h3>
          <p className="mt-1 text-[12.5px] text-muted">{t(l('No single person ever knows a clear key. Two custodians each enter one component into the HSM, which combines them. Edit component 1: on its own it reveals nothing about the key.', 'Personne ne connaît jamais seul une clé en clair. Deux porteurs saisissent chacun une composante dans le HSM, qui les combine. Modifiez la composante 1 : seule, elle ne révèle rien de la clé.'))}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <div><Lbl htmlFor="kc-1">{t(l('Component 1 (custodian A)', 'Composante 1 (porteur A)'))}</Lbl><input id="kc-1" className={input} value={c1} maxLength={32} onChange={(e) => setC1(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))} /></div>
            <Val label={t(l('Component 2 (custodian B)', 'Composante 2 (porteur B)'))} value={sp(c2)} />
            <Val label={t(l('Key inside the HSM = component 1 ⊕ component 2', 'Clé dans le HSM = composante 1 ⊕ composante 2'))} value={sp(xor(c1.padEnd(32, '0').slice(0, 32), c2))} tone="crypto" />
            <Val label={t(l('Key check value (first 3 bytes of the key encrypting zeros)', 'Valeur de contrôle (3 premiers octets du chiffrement de zéros)'))} value={sp(kcv(TEST.AWK))} tone="ok" />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-line bg-bench p-3 text-[13px]">
        <h3 className="font-semibold">{t(l('Key rotation', 'Rotation des clés'))}</h3>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-ink/90">
          <li>{t(l('DUKPT rotates by design: a new key per transaction, and the terminal must be re-injected before its counter runs out (about one million transactions).', 'DUKPT tourne par conception : une nouvelle clé par transaction, et le terminal doit être réinjecté avant l’épuisement du compteur (environ un million de transactions).'))}</li>
          <li>{t(l('EMV session keys change with every ATC; card master keys change when the card is reissued.', 'Les clés de session EMV changent à chaque ATC ; les clés maîtres carte changent au renouvellement de la carte.'))}</li>
          <li>{t(l('Zone keys between hosts are replaced on a schedule set by PCI PIN Security and scheme rules, or at once if compromise is suspected.', 'Les clés de zone entre hôtes sont remplacées selon un calendrier fixé par PCI PIN Security et les règles des réseaux, ou immédiatement en cas de suspicion de compromission.'))}</li>
        </ul>
      </div>
    </div>
  );
}

const TABS: [string, L, () => ReactNode][] = [
  ['map', l('Who protects what', 'Qui protège quoi'), () => <MapTab />],
  ['pin', l('PIN block', 'Bloc PIN'), () => <PinTab />],
  ['dukpt', l('DUKPT', 'DUKPT'), () => <DukptTab />],
  ['emv', l('EMV cryptogram', 'Cryptogramme EMV'), () => <EmvTab />],
  ['cmp', l('Hash, encrypt or MAC?', 'Hacher, chiffrer ou MAC ?'), () => <CompareTab />],
  ['asym', l('Symmetric vs asymmetric', 'Symétrique ou asymétrique'), () => <AsymTab />],
  ['keys', l('Keys and HSMs', 'Clés et HSM'), () => <KeysTab />],
];

export default function LabView() {
  const t = useT();
  const [tab, setTab] = useState('map');
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-4 p-4">
      <div>
        <h2 className="text-[20px] font-bold">{t(l('Visual cryptography lab', 'Laboratoire visuel de cryptographie'))}</h2>
        <p className="text-[13px] text-muted">{t(l('Everything here is computed live with fictitious test keys. Change an input and watch the output.', 'Tout est calculé en direct avec des clés de test fictives. Modifiez une entrée et observez la sortie.'))}</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${tab === id ? 'border-crypto bg-crypto/15 text-crypto' : 'border-line bg-panel text-muted hover:text-ink'}`}>{t(name)}</button>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-panel p-4">{TABS.find((x) => x[0] === tab)![2]()}</div>
    </div>
  );
}
