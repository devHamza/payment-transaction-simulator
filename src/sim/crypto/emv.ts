/**
 * EMV application cryptograms, generic method (EMV Book 2, Annex A1).
 * Payment schemes define their own variants (data set, key derivation option, cryptogram version);
 * this module implements the common TDES method for teaching purposes.
 */
import { retailMac, tdesEnc, xor } from './primitives';

/** Card master key from the issuer master key (Option A): diversified by PAN + sequence number. */
export function deriveCardKey(imk: string, pan: string, psn: string) {
  const y = (pan + psn).slice(-16);
  return { y, mk: tdesEnc(imk, y) + tdesEnc(imk, xor(y, 'FFFFFFFFFFFFFFFF')) };
}

/** Session key (EMV common session key derivation): diversified by the transaction counter. */
export function deriveSessionKey(mk: string, atc: string) {
  const l = atc + 'F0' + '0000000000', r = atc + '0F' + '0000000000';
  return { l, r, sk: tdesEnc(mk, l) + tdesEnc(mk, r) };
}

export const appCryptogram = (sk: string, data: string) => retailMac(sk, data);

/** ARPC method 1: the issuer proves itself to the card by encrypting ARQC xor response code. */
export function arpc1(sk: string, arqc: string, arc: string) {
  const input = xor(arqc, arc + '000000000000');
  return { input, arpc: tdesEnc(sk, input) };
}
