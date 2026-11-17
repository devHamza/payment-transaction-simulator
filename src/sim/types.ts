import type { L } from '../i18n';

export type Actor = 'card' | 'terminal' | 'pos' | 'gateway' | 'acquirer' | 'scheme' | 'issuer' | 'hsmA' | 'hsmI';
/** Cryptographic mechanisms are never mixed: each operation belongs to exactly one lane. */
export type Mech = 'emv' | 'pin' | 'dukpt' | 'tls' | 'mac' | 'keymgmt' | 'oda';
export type Iface = 'contactless' | 'contact';
export type Outcome = 'approved' | 'funds' | 'fraud';

export interface Config {
  iface: Iface | null;
  /** Force an online PIN on a contactless payment (above the CVM limit, or issuer request). */
  clPin: boolean;
  contactPin: 'online' | 'offline';
  outcome: Outcome;
}

/** One inspectable data element: an APDU byte group, a TLV object or a message field. */
export interface Field {
  name: string;
  label?: L | string;
  value: string;
  desc?: L;
  /** std = defined by a standard; impl = implementation-specific / illustrative. */
  kind?: 'std' | 'impl';
  sensitive?: boolean;
  children?: Field[];
}

export interface Apdu {
  name: string;
  purpose: L;
  cmd: Field[];
  resp: Field[];
  sw: string;
}

export interface CryptoOp {
  mech: Mech;
  title: L;
  inputs: { label: L | string; value: string; sensitive?: boolean }[];
  key: { name: string; value: string; type: L };
  op: L;
  /** Intermediate values, shown one after another to visualise the transformation. */
  stages?: { label: L | string; value: string }[];
  by: Actor;
  output: { label: L | string; value: string };
  dest: L;
  verify: L;
  protects: L;
  notProtects: L;
  simulated?: boolean;
}

export interface Msg {
  name: string;
  protocol: L | string;
  security: L[];
  fields: Field[];
  note?: L;
}

export interface Check { label: L; detail: L; status: 'ok' | 'fail' | 'skip' }

export interface Screen { tone: 'idle' | 'busy' | 'pin' | 'ok' | 'bad'; l1: L; l2?: L }

export type StepKind = 'info' | 'apdu' | 'crypto' | 'msg' | 'decision' | 'result';

export interface Step {
  id: string;
  stage: number;
  kind: StepKind;
  title: L;
  question: L;
  beginner: L;
  expert: L;
  active: Actor[];
  from?: Actor;
  to?: Actor;
  screen: Screen;
  tags: string[];
  gate?: 'card' | 'pin';
  apdu?: Apdu;
  crypto?: CryptoOp[];
  msg?: Msg;
  checks?: Check[];
  /** Variations: where real deployments differ from this scenario. */
  notes?: L[];
  dur: number;
}

export const STAGES: L[] = [
  { en: 'Payment initiation', fr: 'Initiation du paiement' },
  { en: 'Card ↔ terminal', fr: 'Carte ↔ terminal' },
  { en: 'Cardholder verification', fr: 'Vérification du porteur' },
  { en: 'Cryptogram', fr: 'Cryptogramme' },
  { en: 'Payment ecosystem', fr: 'Écosystème de paiement' },
  { en: 'Issuer authorization', fr: 'Autorisation émetteur' },
  { en: 'Response', fr: 'Réponse' },
];

export const ACTOR_NAME: Record<Actor, L> = {
  card: { en: 'Card', fr: 'Carte' },
  terminal: { en: 'Terminal', fr: 'Terminal' },
  pos: { en: 'Merchant POS', fr: 'Caisse' },
  gateway: { en: 'Gateway', fr: 'Passerelle' },
  acquirer: { en: 'Acquirer', fr: 'Acquéreur' },
  scheme: { en: 'Card network', fr: 'Réseau carte' },
  issuer: { en: 'Issuer', fr: 'Émetteur' },
  hsmA: { en: 'Acquirer HSM', fr: 'HSM acquéreur' },
  hsmI: { en: 'Issuer HSM', fr: 'HSM émetteur' },
};

export const MECH: Record<Mech, { name: L; purpose: L }> = {
  emv: { name: { en: 'EMV cryptogram', fr: 'Cryptogramme EMV' }, purpose: { en: 'Proves the card is genuine and the transaction data is unaltered', fr: 'Prouve que la carte est authentique et que les données sont intactes' } },
  pin: { name: { en: 'PIN block encryption', fr: 'Chiffrement du bloc PIN' }, purpose: { en: 'Keeps the PIN secret from the keypad to the issuer', fr: 'Garde le PIN secret du clavier jusqu’à l’émetteur' } },
  dukpt: { name: { en: 'DUKPT key derivation', fr: 'Dérivation de clé DUKPT' }, purpose: { en: 'Gives every transaction its own key', fr: 'Donne à chaque transaction sa propre clé' } },
  tls: { name: { en: 'TLS transport', fr: 'Transport TLS' }, purpose: { en: 'Protects the whole message on one network link', fr: 'Protège le message entier sur un lien réseau' } },
  mac: { name: { en: 'Message authentication (MAC)', fr: 'Authentification de message (MAC)' }, purpose: { en: 'Detects any modification of a message', fr: 'Détecte toute modification d’un message' } },
  keymgmt: { name: { en: 'Key management', fr: 'Gestion des clés' }, purpose: { en: 'Protects keys themselves when stored or exchanged', fr: 'Protège les clés elles-mêmes, stockées ou échangées' } },
  oda: { name: { en: 'Offline data authentication (RSA)', fr: 'Authentification hors ligne (RSA)' }, purpose: { en: 'Lets the terminal check the card without calling the bank', fr: 'Permet au terminal de vérifier la carte sans appeler la banque' } },
};
