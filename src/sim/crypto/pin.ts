/** ISO 9564-1 PIN blocks. Format 0 (TDES era) and format 4 (AES). */
import { aesEnc, tdesEnc, xor } from './primitives';

export function pinBlock0(pin: string, pan: string) {
  const pinField = ('0' + pin.length.toString(16) + pin).padEnd(16, 'F').toUpperCase();
  const panField = '0000' + pan.slice(-13, -1); // 12 right-most digits, check digit excluded
  return { pinField, panField, clear: xor(pinField, panField) };
}
export const encryptPinBlock0 = (key: string, clear: string) => tdesEnc(key, clear);

/** Format 4: two AES operations; the random half makes every block unique even for the same PIN. */
export function pinBlock4(pin: string, pan: string, random16: string, aesKey: string) {
  const pinField = (('4' + pin.length.toString(16) + pin).padEnd(16, 'A') + random16).toUpperCase();
  const m = Math.max(0, pan.length - 12);
  const panField = (m.toString(16) + pan.padStart(12, '0')).padEnd(32, '0').toUpperCase();
  const a = aesEnc(aesKey, pinField);
  const b = xor(a, panField);
  const out = aesEnc(aesKey, b);
  return { pinField, panField, a, b, out };
}
