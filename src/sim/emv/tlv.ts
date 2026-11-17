import { l, type L } from '../../i18n';
import type { Field } from '../types';
import { hexByte, up } from '../crypto/primitives';

/** EMV tag dictionary (EMV Book 3, Annex A). */
export const TAGS: Record<string, { name: string; desc: L }> = {
  '6F': { name: 'FCI Template', desc: l('File Control Information: the card’s answer to SELECT.', 'File Control Information : la réponse de la carte à SELECT.') },
  '84': { name: 'DF Name', desc: l('Name of the selected directory or application.', 'Nom du répertoire ou de l’application sélectionnée.') },
  A5: { name: 'FCI Proprietary Template', desc: l('Application details inside the FCI.', 'Détails de l’application dans le FCI.') },
  BF0C: { name: 'FCI Issuer Discretionary Data', desc: l('Container for the list of applications.', 'Conteneur de la liste des applications.') },
  '61': { name: 'Application Template', desc: l('One payment application offered by the card.', 'Une application de paiement proposée par la carte.') },
  '4F': { name: 'Application Identifier (AID)', desc: l('Identifies the payment application: 5-byte registered provider ID + product extension.', 'Identifie l’application de paiement : identifiant du fournisseur (5 octets) + extension produit.') },
  '50': { name: 'Application Label', desc: l('Human-readable application name.', 'Nom lisible de l’application.') },
  '87': { name: 'Application Priority Indicator', desc: l('Order of preference when a card holds several applications.', 'Ordre de préférence quand la carte contient plusieurs applications.') },
  '77': { name: 'Response Template Format 2', desc: l('TLV-encoded response.', 'Réponse encodée en TLV.') },
  '82': { name: 'Application Interchange Profile (AIP)', desc: l('Bitmap of what the card supports: offline authentication, cardholder verification, issuer authentication.', 'Bitmap des capacités de la carte : authentification hors ligne, vérification du porteur, authentification de l’émetteur.') },
  '94': { name: 'Application File Locator (AFL)', desc: l('Tells the terminal which records to read (file, first record, last record, records signed).', 'Indique au terminal quels enregistrements lire (fichier, premier, dernier, enregistrements signés).') },
  '70': { name: 'Record Template', desc: l('Content of one record.', 'Contenu d’un enregistrement.') },
  '57': { name: 'Track 2 Equivalent Data', desc: l('PAN, separator D, expiry, service code, discretionary data. Cardholder data in PCI DSS scope.', 'PAN, séparateur D, expiration, code service, données discrétionnaires. Donnée porteur dans le périmètre PCI DSS.') },
  '5A': { name: 'Application PAN', desc: l('The card number. On a phone or watch this is a token (DPAN) instead of the real number.', 'Le numéro de carte. Sur un téléphone ou une montre, c’est un jeton (DPAN) et non le vrai numéro.') },
  '5F20': { name: 'Cardholder Name', desc: l('Often blank or generic on contactless.', 'Souvent vide ou générique en sans contact.') },
  '5F24': { name: 'Application Expiration Date', desc: l('YYMMDD.', 'AAMMJJ.') },
  '5F34': { name: 'PAN Sequence Number', desc: l('Distinguishes several cards sharing one PAN; feeds key derivation.', 'Distingue plusieurs cartes partageant un PAN ; entre dans la dérivation de clé.') },
  '8C': { name: 'CDOL1', desc: l('Card Risk Management Data Object List: the list of tags and lengths the terminal must send in GENERATE AC.', 'Liste des données (tags et longueurs) que le terminal doit envoyer dans GENERATE AC.') },
  '8E': { name: 'CVM List', desc: l('The card’s ordered rules for verifying the cardholder (online PIN, offline PIN, signature, none).', 'Règles ordonnées de la carte pour vérifier le porteur (PIN en ligne, PIN hors ligne, signature, aucune).') },
  '8F': { name: 'CA Public Key Index', desc: l('Which scheme root key the terminal must use.', 'Quelle clé racine du réseau le terminal doit utiliser.') },
  '90': { name: 'Issuer Public Key Certificate', desc: l('Issuer public key signed by the scheme CA.', 'Clé publique de l’émetteur signée par l’AC du réseau.') },
  '9F46': { name: 'ICC Public Key Certificate', desc: l('Card public key signed by the issuer.', 'Clé publique de la carte signée par l’émetteur.') },
  '9F27': { name: 'Cryptogram Information Data', desc: l('Type of cryptogram: 80 = ARQC (go online), 40 = TC (approved), 00 = AAC (declined).', 'Type de cryptogramme : 80 = ARQC (aller en ligne), 40 = TC (approuvé), 00 = AAC (refusé).') },
  '9F36': { name: 'Application Transaction Counter (ATC)', desc: l('Incremented by the card at every transaction. Makes each cryptogram unique and exposes replays.', 'Incrémenté par la carte à chaque transaction. Rend chaque cryptogramme unique et révèle les rejeux.') },
  '9F26': { name: 'Application Cryptogram', desc: l('8-byte MAC computed by the card over the transaction data.', 'MAC de 8 octets calculé par la carte sur les données de transaction.') },
  '9F10': { name: 'Issuer Application Data', desc: l('Issuer-defined data: key index, cryptogram version, card verification results. Format is scheme-specific.', 'Données définies par l’émetteur : index de clé, version du cryptogramme, résultats de vérification. Format propre au réseau.') },
  '9F37': { name: 'Unpredictable Number', desc: l('Random value from the terminal so a cryptogram cannot be pre-computed.', 'Valeur aléatoire du terminal pour empêcher tout pré-calcul du cryptogramme.') },
  '95': { name: 'Terminal Verification Results', desc: l('5 bytes of flags recording what the terminal checked and what failed.', '5 octets d’indicateurs sur ce que le terminal a vérifié et ce qui a échoué.') },
  '9A': { name: 'Transaction Date', desc: l('YYMMDD.', 'AAMMJJ.') },
  '9C': { name: 'Transaction Type', desc: l('00 = purchase.', '00 = achat.') },
  '9F02': { name: 'Amount, Authorised', desc: l('In minor units: 000000000500 = 5.00.', 'En unités mineures : 000000000500 = 5,00.') },
  '9F03': { name: 'Amount, Other', desc: l('Cashback amount.', 'Montant de cashback.') },
  '5F2A': { name: 'Transaction Currency Code', desc: l('ISO 4217: 0978 = euro.', 'ISO 4217 : 0978 = euro.') },
  '9F1A': { name: 'Terminal Country Code', desc: l('ISO 3166: 0250 = France.', 'ISO 3166 : 0250 = France.') },
  '9F34': { name: 'CVM Results', desc: l('Which cardholder verification method was performed.', 'Quelle méthode de vérification du porteur a été appliquée.') },
  '91': { name: 'Issuer Authentication Data', desc: l('ARPC + response code: the issuer’s proof for the card.', 'ARPC + code réponse : la preuve de l’émetteur destinée à la carte.') },
  '8A': { name: 'Authorisation Response Code', desc: l('Two ASCII characters: 3030 = "00" approved.', 'Deux caractères ASCII : 3030 = « 00 » approuvé.') },
};

const lenHex = (n: number) => (n < 0x80 ? hexByte(n) : n < 0x100 ? '81' + hexByte(n) : '82' + hexByte(n >> 8) + hexByte(n & 0xff));

/** Serialises a TLV tree to hex. */
export function ser(f: Field): string {
  const v = f.children ? f.children.map(ser).join('') : up(f.value);
  return f.name + lenHex(v.length / 2) + v;
}

/** Builds a TLV node, pulling its name and description from the dictionary. */
export function tlv(tag: string, value: string | Field[], extra: Partial<Field> = {}): Field {
  const t = TAGS[tag];
  const f: Field = { name: tag, label: t?.name ?? tag, desc: t?.desc, kind: 'std', value: '', ...extra };
  if (typeof value === 'string') f.value = up(value);
  else { f.children = value; f.value = value.map(ser).join(''); }
  return f;
}
