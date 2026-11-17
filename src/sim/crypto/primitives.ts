/**
 * Low-level primitives on upper-case hex strings.
 * crypto-js supplies DES / TDES / AES / SHA-256; everything above it is implemented here
 * so each step can be shown in the UI. TEST KEYS ONLY - never use for real payment data.
 */
import CryptoJS from 'crypto-js';

const H = CryptoJS.enc.Hex;
const cfg = { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding };

export const up = (s: string) => s.replace(/\s+/g, '').toUpperCase();
export const sp = (s: string, n = 2) => up(s).replace(new RegExp(`(.{${n}})(?=.)`, 'g'), '$1 ');
export const ascii2hex = (s: string) => Array.from(s).map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
export const byteLen = (h: string) => up(h).length / 2;
export const hexByte = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

export function xor(a: string, b: string): string {
  a = up(a); b = up(b);
  let o = '';
  for (let i = 0; i < a.length; i++) o += (parseInt(a[i], 16) ^ parseInt(b[i % b.length], 16)).toString(16);
  return o.toUpperCase();
}

export const desEnc = (key: string, data: string) => CryptoJS.DES.encrypt(H.parse(data), H.parse(key), cfg).ciphertext.toString(H).toUpperCase();
export const desDec = (key: string, data: string) =>
  CryptoJS.DES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: H.parse(data) }), H.parse(key), cfg).toString(H).toUpperCase();

/** Double-length (16-byte) key is expanded to K1 K2 K1. */
const k3 = (key: string) => (up(key).length === 32 ? up(key) + up(key).slice(0, 16) : up(key));
export const tdesEnc = (key: string, data: string) => CryptoJS.TripleDES.encrypt(H.parse(data), H.parse(k3(key)), cfg).ciphertext.toString(H).toUpperCase();
export const tdesDec = (key: string, data: string) =>
  CryptoJS.TripleDES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: H.parse(data) }), H.parse(k3(key)), cfg).toString(H).toUpperCase();

export const aesEnc = (key: string, data: string) => CryptoJS.AES.encrypt(H.parse(data), H.parse(key), cfg).ciphertext.toString(H).toUpperCase();
export const aesDec = (key: string, data: string) =>
  CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: H.parse(data) }), H.parse(key), cfg).toString(H).toUpperCase();

export const sha256 = (text: string) => CryptoJS.SHA256(text).toString(H).toUpperCase();

/** ISO/IEC 9797-1 padding method 2: append 80 then 00 up to a block boundary. */
export function pad80(data: string, block = 8): string {
  let d = up(data) + '80';
  while ((d.length / 2) % block) d += '00';
  return d;
}

/** ISO/IEC 9797-1 MAC algorithm 3 ("retail MAC") with a double-length key. Returns the 8-byte MAC and the chaining trace. */
export function retailMac(key: string, data: string) {
  const kl = up(key).slice(0, 16), kr = up(key).slice(16, 32);
  const padded = pad80(data);
  const blocks = padded.match(/.{16}/g) || [];
  let state = '0000000000000000';
  const trace: { block: string; out: string }[] = [];
  for (const b of blocks) { state = desEnc(kl, xor(state, b)); trace.push({ block: b, out: state }); }
  const mac = desEnc(kl, desDec(kr, state));
  return { mac, padded, blocks, trace };
}

/** Luhn check digit for a numeric string. */
export function luhn(digits: string): string {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = +digits[digits.length - 1 - i];
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}
