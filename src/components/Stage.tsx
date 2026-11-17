/**
 * The payment terminal and the bank card. The terminal is driven entirely by the current
 * simulation step: its screen, LEDs, keypad state and the card position are derived, not scripted.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../store';
import { useT, l } from '../i18n';
import { TEST } from '../sim/scenario';
import { sp } from '../sim/crypto/primitives';

const W = 540, H = 640;

function Contactless({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 9c1.5 2 1.5 4 0 6M10 6.5c3 3.5 3 7.5 0 11M14 4c4.5 5 4.5 11 0 16" />
    </svg>
  );
}

export default function Stage() {
  const t = useT();
  const { steps, idx, config, pin, pinDone, presentCard, pressKey, lastKeyAt } = useStore();
  const step = steps[idx];
  const wrap = useRef<HTMLDivElement>(null);
  const nfc = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [boxH, setBoxH] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // Desktop: the stage has a fixed slot, so fit both width and height.
    // Narrow screens: the page scrolls, so fit the width and size the slot from it.
    const fit = () => {
      const lg = window.matchMedia('(min-width: 1024px)').matches;
      const s = Math.max(0.3, Math.min(el.clientWidth / W, lg ? el.clientHeight / H : Infinity, 1.2));
      setScale(s);
      setBoxH(lg ? null : Math.ceil(s * H));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Physical keyboard drives the PIN pad too.
  const pinActive = step.id === 'pin' && !pinDone;
  useEffect(() => {
    if (!pinActive) return;
    const on = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pressKey(e.key);
      else if (e.key === 'Enter') pressKey('enter');
      else if (e.key === 'Backspace') pressKey('clear');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [pinActive, pressKey]);

  const at = (id: string) => steps.findIndex((s) => s.id === id);
  const pos: 'rest' | 'tap' | 'slot' =
    config.iface === null ? 'rest'
      : config.iface === 'contactless' ? (idx <= at('arqc') ? 'tap' : 'rest')
        : idx < at('result') ? 'slot' : 'rest';
  const canPresent = config.iface === null;
  const reading = pos === 'tap';
  const leds = step.screen.tone === 'ok' ? 4 : reading ? Math.min(4, 1 + Math.floor(((idx - at('activate')) / Math.max(1, at('arqc') - at('activate'))) * 3.99)) : canPresent ? 1 : 0;
  const tone = step.screen.tone;

  const drop = (x: number, y: number) => {
    const hit = (el: HTMLElement | null, pad: number) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad;
    };
    if (hit(nfc.current, 30)) presentCard('contactless');
    else if (hit(slot.current, 60)) presentCard('contact');
  };

  const keys = ['1', '2', '3', 'cancel', '4', '5', '6', 'clear', '7', '8', '9', 'enter', '', '0', ''];

  return (
    <div ref={wrap} style={boxH ? { height: boxH } : undefined} className="relative h-full w-full overflow-hidden">
      <div style={{ width: W, height: H, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }} className="absolute left-1/2 top-0">
        {/* ---------- terminal ---------- */}
        <div className="absolute left-5 top-0 z-10 h-[540px] w-[270px] rounded-[28px] border border-[#3a4568] bg-gradient-to-b from-[#2b3350] to-[#161c30] p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,.8),inset_0_1px_0_rgba(255,255,255,.12)]">
          {/* contactless zone */}
          <div ref={nfc} className={`relative flex h-[92px] flex-col items-center justify-center rounded-t-[18px] rounded-b-md border border-dashed transition-colors ${canPresent ? 'border-data/60 text-data' : 'border-[#4a567c] text-muted'}`}>
            <div className="absolute top-2 flex gap-2" aria-label={`${leds}/4 LED`}>
              {[1, 2, 3, 4].map((n) => <span key={n} className={`h-1.5 w-5 rounded-full transition-colors duration-300 ${n <= leds ? (tone === 'bad' ? 'bg-danger' : 'bg-ok shadow-[0_0_8px_var(--color-ok)]') : 'bg-[#0c1122]'}`} />)}
            </div>
            <span className="relative mt-3">
              {canPresent && <span className="absolute inset-0 rounded-full border border-data" style={{ animation: 'pulse-ring 1.8s ease-out infinite' }} />}
              <Contactless size={34} />
            </span>
            <span className="text-[10px] uppercase tracking-widest">{t(l('Tap here', 'Sans contact'))}</span>
          </div>

          {/* screen */}
          <div aria-live="polite" className={`mt-2.5 flex h-[104px] flex-col items-center justify-center rounded-md border-2 border-[#070b16] px-3 text-center transition-colors duration-500 ${tone === 'ok' ? 'bg-[#0f3d2c]' : tone === 'bad' ? 'bg-[#4a1620]' : 'bg-[#0d2238]'}`}>
            <AnimatePresence mode="wait">
              <motion.div key={step.screen.l1.en + (step.screen.l2?.en ?? '')} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <div className={`font-display text-[17px] font-semibold tracking-wide ${tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-danger' : 'text-[#cfe6ff]'}`}>{t(step.screen.l1)}</div>
                {tone === 'pin'
                  ? <div className="mono mt-1.5 text-[22px] tracking-[.5em] text-[#cfe6ff]" aria-label={`${pin.length} / 4`}>{'✱'.repeat(pin.length).padEnd(4, '·')}</div>
                  : step.screen.l2 && <div className="mt-1 text-[13px] text-[#8fb3d9]">{t(step.screen.l2)}</div>}
                {tone === 'busy' && <div className="mx-auto mt-2 h-1 w-24 overflow-hidden rounded bg-[#07101d]"><motion.div className="h-full w-8 rounded bg-data" animate={{ x: [-32, 96] }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }} /></div>}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* keypad */}
          <div className={`mt-3 grid grid-cols-4 gap-2 rounded-xl p-2 transition-shadow ${pinActive ? 'shadow-[0_0_0_2px_var(--color-danger)]' : ''}`}>
            {keys.map((k, i) => {
              if (!k) return <span key={i} />;
              const fn = k.length > 1;
              const cls = k === 'cancel' ? 'bg-[#b23a48] text-white' : k === 'clear' ? 'bg-[#c9a227] text-[#221a00]' : k === 'enter' ? 'bg-[#2f9e6e] text-white row-span-2' : 'bg-[#e9edf6] text-[#141a2c]';
              const label = k === 'cancel' ? '✕' : k === 'clear' ? '←' : k === 'enter' ? '✓' : k;
              const aria = k === 'cancel' ? t(l('Cancel', 'Annuler')) : k === 'clear' ? t(l('Correct', 'Corriger')) : k === 'enter' ? t(l('Validate', 'Valider')) : k;
              return (
                <motion.button key={k} whileTap={{ scale: 0.92, y: 2 }} disabled={!pinActive || (k === 'enter' && pin.length < 4)} onClick={() => pressKey(k)} aria-label={aria}
                  className={`h-[46px] rounded-lg text-[17px] font-semibold shadow-[0_3px_0_rgba(0,0,0,.45)] disabled:opacity-60 ${cls} ${fn ? 'text-[15px]' : 'mono'}`}>{label}</motion.button>
              );
            })}
          </div>

          {/* secure processor marker */}
          <div className="absolute bottom-[52px] left-3 right-3 flex items-center justify-between text-[9px] uppercase tracking-widest text-[#6f7da6]">
            <span>PCI PTS POI</span>
            <span className={`flex items-center gap-1 ${pinActive ? 'text-danger' : ''}`}><span className={`h-1.5 w-1.5 rounded-full ${pinActive ? 'bg-danger' : 'bg-[#6f7da6]'}`} />{t(l('Secure processor', 'Processeur sécurisé'))}</span>
          </div>

          {/* chip slot */}
          <div ref={slot} className={`absolute bottom-3 left-10 right-10 flex h-[30px] items-center justify-center rounded-md border border-dashed text-[10px] uppercase tracking-widest transition-colors ${canPresent ? 'border-data/60 text-data' : 'border-[#4a567c] text-muted'}`}>
            <span className="absolute inset-x-6 top-1/2 h-[5px] -translate-y-1/2 rounded bg-[#05070f]" />
            <span className="relative bg-[#1a2036] px-2">{t(l('Insert chip', 'Insérer la puce'))}</span>
          </div>
        </div>

        {/* ---------- card ---------- */}
        <motion.div
          drag={canPresent} dragSnapToOrigin dragElastic={0.15} dragMomentum={false}
          whileDrag={{ scale: 1.06, cursor: 'grabbing' }}
          onDragEnd={(e) => { const p = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0] : (e as MouseEvent); drop(p.clientX, p.clientY); }}
          animate={pos === 'tap' ? { x: -262, y: -160, rotate: -6, scale: 0.88 } : pos === 'slot' ? { x: -262, y: 326, rotate: 90, scale: 1 } : { x: 0, y: 0, rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
          style={{ zIndex: pos === 'slot' ? 5 : 30, touchAction: 'none' }}
          className={`absolute left-[335px] top-[160px] h-[112px] w-[178px] select-none rounded-xl bg-gradient-to-br from-[#3b2f7a] via-[#5a3fa8] to-[#2a6fb0] p-3 shadow-[0_14px_30px_-10px_rgba(0,0,0,.8)] ${canPresent ? 'cursor-grab' : ''}`}
          aria-label={t(l('Demo bank card', 'Carte bancaire de démonstration'))}>
          <div className="flex items-start justify-between">
            <span className="font-display text-[11px] font-semibold tracking-wider text-white/90">DEMO BANK</span>
            <span className="text-white/80"><Contactless size={18} /></span>
          </div>
          <div className="mt-2 h-[22px] w-[30px] rounded-[4px] bg-gradient-to-br from-[#f3d98b] to-[#b8923a] shadow-inner">
            <div className="mx-auto h-full w-px bg-[#8a6a22]/60" />
          </div>
          <div className="mono mt-2 text-[12px] tracking-wider text-white">{sp(TEST.PAN, 4)}</div>
          <div className="mt-0.5 flex justify-between text-[9px] uppercase tracking-wider text-white/70"><span>Cardholder / Demo</span><span>12/29</span></div>
        </motion.div>

        {/* ---------- right column under the card ---------- */}
        <div className="absolute left-[310px] top-[300px] w-[225px]">
          <AnimatePresence mode="wait">
            {canPresent && (
              <motion.div key="present" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
                <p className="text-[12px] text-muted">{t(l('Drag the card onto the terminal, or use a button:', 'Faites glisser la carte sur le terminal, ou utilisez un bouton :'))}</p>
                <div className="flex gap-2">
                  <button onClick={() => presentCard('contactless')} className="flex-1 rounded-lg border border-data/60 bg-data/10 px-3 py-2 text-[13px] font-semibold text-data hover:bg-data/20">{t(l('Tap card', 'Sans contact'))}</button>
                  <button onClick={() => presentCard('contact')} className="flex-1 rounded-lg border border-data/60 bg-data/10 px-3 py-2 text-[13px] font-semibold text-data hover:bg-data/20">{t(l('Insert card', 'Insérer'))}</button>
                </div>
              </motion.div>
            )}
            {step.id === 'pin' && (
              <motion.div key="boundary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-danger/50 bg-bench p-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-danger">{t(l('Inside the secure boundary', 'Dans le périmètre sécurisé'))}</div>
                <div className="mt-1.5 flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="mono relative flex h-9 w-9 items-center justify-center rounded-md border border-danger/50 bg-danger/10 text-[16px] font-semibold text-danger">
                      <AnimatePresence>{pin[i] && <motion.span key={pin[i] + i} initial={{ y: -14, opacity: 0, scale: 1.6 }} animate={{ y: 0, opacity: 1, scale: 1 }}>{pin[i]}</motion.span>}</AnimatePresence>
                    </span>
                  ))}
                </div>
                <div className="my-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted"><span className="h-px flex-1 border-t border-dashed border-danger/60" />{t(l('boundary', 'frontière'))}<span className="h-px flex-1 border-t border-dashed border-danger/60" /></div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">{t(l('What the payment app sees', 'Ce que voit l’application de paiement'))}</div>
                <div className="mt-1.5 flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => <span key={i} className="mono flex h-9 w-9 items-center justify-center rounded-md border border-line bg-panel text-[14px] text-muted">{pin[i] ? '✱' : ''}</span>)}
                </div>
                <p key={lastKeyAt} className="mt-2 text-[11px] text-muted">{pin.length < 4 ? t(l('Type 4 made-up digits.', 'Tapez 4 chiffres inventés.')) : pinDone ? t(l('PIN captured.', 'Code saisi.')) : t(l('Press the green key to validate.', 'Appuyez sur la touche verte pour valider.'))}</p>
              </motion.div>
            )}
            {!canPresent && step.id !== 'pin' && pos !== 'rest' && (
              <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-muted">
                {pos === 'tap' ? t(l('Card in the radio field: about 4 cm from the antenna.', 'Carte dans le champ radio : à environ 4 cm de l’antenne.')) : t(l('Card inserted: chip contacts connected until the end.', 'Carte insérée : contacts de la puce connectés jusqu’à la fin.'))}
              </motion.p>
            )}
            {!canPresent && step.id !== 'pin' && pos === 'rest' && step.kind !== 'result' && config.iface === 'contactless' && (
              <motion.p key="gone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-muted">
                {t(l('The card is back in your hand. Everything from here happens without it.', 'La carte est de retour dans votre main. Tout se passe désormais sans elle.'))}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
