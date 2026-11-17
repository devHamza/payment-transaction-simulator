// Checks the crypto core against published test vectors (ANSI X9.24-1 Annex, NIST DES).
import { desEnc, tdesEnc, aesEnc } from '../src/sim/crypto/primitives';
import { deriveDukpt } from '../src/sim/crypto/dukpt';
import { pinBlock0, encryptPinBlock0 } from '../src/sim/crypto/pin';

const eq = (name: string, got: string, want: string) => {
  console.log(`${got === want ? 'PASS' : 'FAIL'}  ${name}  ${got}${got === want ? '' : '  (want ' + want + ')'}`);
  if (got !== want) process.exitCode = 1;
};
eq('DES', desEnc('0123456789ABCDEF', '4E6F772069732074'), '3FA40E8A984D4815');
eq('TDES 2-key', tdesEnc('0123456789ABCDEFFEDCBA9876543210', '0000000000000000'), tdesEnc('0123456789ABCDEFFEDCBA98765432100123456789ABCDEF', '0000000000000000'));
eq('AES-128', aesEnc('000102030405060708090A0B0C0D0E0F', '00112233445566778899AABBCCDDEEFF'), '69C4E0D86A7B0430D8CDB78070B4C55A');
const d = deriveDukpt('0123456789ABCDEFFEDCBA9876543210', 'FFFF9876543210E00001');
eq('DUKPT IPEK', d.ipek, '6AC292FAA1315B4D858AB3A3D7D5933A');
eq('DUKPT PIN key #1', d.pinKey, '042666B49184CF5C68DE9628D0397B36');
eq('DUKPT PIN block #1', encryptPinBlock0(d.pinKey, pinBlock0('1234', '4012345678909').clear), '1B9C1845EB993A7A');
const d2 = deriveDukpt('0123456789ABCDEFFEDCBA9876543210', 'FFFF9876543210E00002');
eq('DUKPT PIN block #2', encryptPinBlock0(d2.pinKey, pinBlock0('1234', '4012345678909').clear), '10A01C8D02C69107');
