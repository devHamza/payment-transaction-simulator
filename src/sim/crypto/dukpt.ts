/**
 * TDES DUKPT (ANSI X9.24-1:2009). Derives a unique key per transaction from a
 * Base Derivation Key (held only in HSMs) and the Key Serial Number sent with each message.
 * AES DUKPT (X9.24-3) follows the same idea with a different derivation function; it is described, not implemented.
 */
import { desEnc, tdesEnc, xor, up } from './primitives';

const C0 = 'C0C0C0C000000000C0C0C0C000000000';
const big = (h: string) => BigInt('0x' + h);
const h16 = (n: bigint) => n.toString(16).toUpperCase().padStart(16, '0');

/** Initial PIN Encryption Key - the key injected into the terminal in a secure facility. */
export function deriveIpek(bdk: string, ksn: string): string {
  const ksn8 = h16((big(up(ksn)) & big('FFFFFFFFFFFFFFE00000')) >> 16n);
  return tdesEnc(bdk, ksn8) + tdesEnc(xor(bdk, C0), ksn8);
}

function nrkg(key: string, reg: string): string {
  const half = (k: string) => { const kl = k.slice(0, 16), kr = k.slice(16); return xor(desEnc(kl, xor(reg, kr)), kr); };
  return half(xor(key, C0)) + half(key);
}

export interface DukptTrace { ipek: string; counter: number; steps: { bit: number; reg: string; key: string }[]; txKey: string; pinKey: string; macKey: string }

/** Walks the set bits of the 21-bit transaction counter, deriving one key per bit. */
export function deriveDukpt(bdk: string, ksn: string): DukptTrace {
  const k = big(up(ksn));
  const counter = Number(k & 0x1FFFFFn);
  const ipek = deriveIpek(bdk, ksn);
  let reg = (k & big('FFFFFFFFFFE00000')) & big('FFFFFFFFFFFFFFFF');
  let key = ipek;
  const steps: DukptTrace['steps'] = [];
  for (let shift = 0x100000; shift > 0; shift >>= 1) {
    if (counter & shift) {
      reg |= BigInt(shift);
      key = nrkg(key, h16(reg));
      steps.push({ bit: shift, reg: h16(reg), key });
    }
  }
  return {
    ipek, counter, steps, txKey: key,
    pinKey: xor(key, '00000000000000FF00000000000000FF'),
    macKey: xor(key, '000000000000FF00000000000000FF00'),
  };
}

export function ksnWithCounter(ksnBase: string, counter: number): string {
  const k = (big(up(ksnBase)) & big('FFFFFFFFFFFFFFE00000')) | BigInt(counter & 0x1FFFFF);
  return k.toString(16).toUpperCase().padStart(20, '0');
}
