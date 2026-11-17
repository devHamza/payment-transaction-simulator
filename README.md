# Payment Transaction Simulator

Interactive, bilingual (EN/FR) web simulator of a card payment on a PCI terminal: from card tap
or chip insertion to issuer authorisation and back. All data is fictitious; all cryptographic
values are computed in the browser from public test keys.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build -> dist/index.html (single self-contained file)
npm run test:crypto  # checks DES/TDES/AES/DUKPT against published test vectors
```

Node 20+ recommended. `dist/index.html` can be opened directly or hosted anywhere as one file.

## Publish on GitHub Pages

The workflow in `.github/workflows/deploy.yml` checks the crypto test vectors, builds the site
and publishes it on every push to `main`.

1. Create a repository on GitHub and push this project:
   ```bash
   git init && git add . && git commit -m "Payment Transaction Simulator"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. On GitHub: **Settings > Pages > Build and deployment > Source = GitHub Actions**.
3. Wait for the "Deploy to GitHub Pages" run in the **Actions** tab (about a minute).
   The site is then at `https://<user>.github.io/<repo>/`.

Views can be linked directly: `#simulator`, `#crypto-lab`, `#architecture`, `#pci`.

## Structure

```
src/
  sim/                    simulation core, no React
    crypto/primitives.ts  DES/TDES/AES wrappers, XOR, ISO 9797-1 MAC alg. 3, Luhn
    crypto/dukpt.ts       TDES DUKPT (ANSI X9.24-1): IPEK, per-transaction key, variants
    crypto/pin.ts         ISO 9564 PIN block formats 0 and 4
    crypto/emv.ts         card key (Option A), session key, ARQC/TC, ARPC method 1
    emv/tlv.ts            EMV tag dictionary (EN/FR) and TLV builder/serialiser
    scenario.ts           scenario engine: Config + PIN -> ordered Step[]
    types.ts              Step, Apdu, CryptoOp, Msg, Field, actors, mechanisms
  store.ts                zustand store: playback, gates (card, PIN), config, language, mode
  i18n.ts                 bilingual string type `L` and `useT()` hook
  components/             Stage (terminal + card), Ecosystem, Narrator, Inspector, Timeline, ui
  views/                  SimView, LabView (crypto lab), ArchView, PciView
```

The UI renders the `Step[]` produced by `buildScenario()`. Animations are derived from the
current step, so play, pause, step back/forward and speed all work from one clock (`App.tsx`).

To add a scenario step, push a `Step` in `scenario.ts`; the timeline, narrator, inspector and
exchange log pick it up automatically.

## Scenarios covered

- Contactless without PIN (default for €5), contactless with online PIN
- Contact chip with online PIN (DUKPT, PIN translation in HSMs) or offline plaintext PIN (VERIFY)
- Approved (00), declined for insufficient funds (51), declined for suspected fraud (59)
- Contact flow includes EXTERNAL AUTHENTICATE and the second GENERATE AC (TC / AAC)

## Assumptions and limits of this version

- **EMV cryptogram:** generic EMV Book 2 method (TDES, MAC algorithm 3, common session key
  derivation). Real schemes use their own cryptogram versions and data sets.
- **Offline data authentication (RSA/CDA):** explained with illustrative values, not computed.
  The crypto lab has a working toy RSA (12-bit modulus) to show sign/verify.
- **ISO 8583:** field names follow ISO 8583:1987; values and the terminal-to-gateway API are
  illustrative. Each acquirer and scheme has its own dialect.
- **TLS and TR-31:** described; the TR-31 header anatomy is accurate, the wrapped key and MAC
  shown are a simplified illustration.
- **AES DUKPT, enciphered offline PIN, ARPC method 2, issuer scripts:** described, not simulated.
- **Clearing and settlement, reversals, refunds, chargebacks:** explained, not simulated.
- **ISO/IEC 14443 activation and ATR:** representative byte values.
- Card AID is the public Mastercard AID `A0000000041010` used as an example; the PAN is a
  Luhn-valid fictitious number. The BDK/KSN pair is the public ANSI X9.24 test vector.

Never enter a real PIN or real card data: this is a teaching tool.

Card scheme names are used only to describe how payments work; this project is not affiliated
with or endorsed by any card scheme, payment network or terminal manufacturer.

## License

MIT, see `LICENSE`.
