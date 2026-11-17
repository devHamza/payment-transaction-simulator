/** The guide: asks the question a curious person would ask, then answers it at the chosen level. */
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../store';
import { useT, l } from '../i18n';
import { STAGES } from '../sim/types';
import { stageNames } from '../sim/scenario';
import { Chip, Panel } from './ui';

function Guide() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" className="shrink-0">
      <circle cx="26" cy="26" r="25" fill="var(--color-panel2)" stroke="var(--color-data)" strokeWidth="1.5" />
      <path d="M12 24c0-9 6-15 14-15s14 6 14 15" fill="#2c3a66" />
      <circle cx="26" cy="27" r="11" fill="#f1c9a5" />
      <g style={{ transformOrigin: '26px 26px', animation: 'blink 4.5s infinite' }}><circle cx="22" cy="26" r="1.5" fill="#1b2340" /><circle cx="30" cy="26" r="1.5" fill="#1b2340" /></g>
      <rect x="18" y="22.5" width="7.5" height="6.5" rx="2" fill="none" stroke="#1b2340" strokeWidth="1" /><rect x="26.5" y="22.5" width="7.5" height="6.5" rx="2" fill="none" stroke="#1b2340" strokeWidth="1" />
      <path d="M22.5 32c2 1.8 5 1.8 7 0" stroke="#1b2340" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M10 50c1-9 8-12 16-12s15 3 16 12" fill="var(--color-data)" />
    </svg>
  );
}

export default function Narrator() {
  const t = useT();
  const { steps, idx, mode, behind, set, config } = useStore();
  const step = steps[idx];
  const names = config.iface ? stageNames(config) : STAGES;
  const showTech = mode === 'expert';

  return (
    <Panel title={t(l('Your guide', 'Votre guide'))} right={<Chip tone="data">{t(l('Stage', 'Étape'))} {step.stage}/7 · {t(names[step.stage - 1])}</Chip>} className="h-full">
      <div className="scroll flex min-h-0 flex-1 flex-col gap-3 p-4">
        <AnimatePresence mode="wait">
          <motion.div key={step.id + mode} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Guide />
              <div className="relative rounded-xl rounded-tl-sm border border-data/40 bg-data/10 px-3 py-2">
                <p className="font-display text-[15px] font-semibold leading-snug text-ink">{t(step.question)}</p>
              </div>
            </div>
            <h3 className="text-[18px] font-semibold leading-tight">{t(step.title)}</h3>
            <p className="max-w-[60ch] text-[14.5px] leading-relaxed text-ink/90">{t(showTech ? step.expert : step.beginner)}</p>
            {showTech && (
              <details className="rounded-lg border border-line bg-bench px-3 py-2 text-[13px] text-muted">
                <summary className="cursor-pointer text-ink">{t(l('In plain words', 'En termes simples'))}</summary>
                <p className="mt-1.5">{t(step.beginner)}</p>
              </details>
            )}
            {step.gate && (
              <p className="rounded-lg border border-crypto/40 bg-crypto/10 px-3 py-2 text-[13px] text-crypto">
                {step.gate === 'card' ? t(l('Waiting for you: present the card to the terminal.', 'À vous de jouer : présentez la carte au terminal.')) : t(l('Waiting for you: enter 4 digits on the keypad, then ✓.', 'À vous de jouer : saisissez 4 chiffres au clavier, puis ✓.'))}
              </p>
            )}
            {step.notes?.map((n, i) => (
              <p key={i} className="border-l-2 border-net pl-3 text-[12.5px] text-muted"><span className="font-semibold text-net">{t(l('Varies', 'Variable'))} · </span>{t(n)}</p>
            ))}
          </motion.div>
        </AnimatePresence>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {/* Expert mode always shows the technical panel, so the toggle only exists in beginner mode. */}
          {!showTech && <button onClick={() => set({ behind: !behind })} aria-pressed={behind}
            className={`group flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left font-display text-[14px] font-semibold transition-colors ${behind ? 'border-crypto bg-crypto/15 text-crypto' : 'border-crypto/60 bg-crypto/10 text-crypto hover:bg-crypto/20'}`}>
            <span>{behind ? t(l('Hide what happens behind the scenes', 'Masquer les coulisses')) : t(l('What happens behind the scenes?', 'Que se passe-t-il en coulisses ?'))}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`transition-transform ${behind ? 'rotate-180' : ''}`} aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>}
          {(behind || showTech) && step.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{step.tags.map((x) => <Chip key={x}>{x}</Chip>)}</div>}
        </div>
      </div>
    </Panel>
  );
}
