/** Live map of the payment chain: highlights active actors and animates a clickable packet per exchange. */
import { motion } from 'motion/react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { ACTOR_NAME, type Actor, type Step } from '../sim/types';
import { ActorIcon } from './ui';

export const NODE: Record<Actor, { x: number; row: 0 | 1 }> = {
  card: { x: 7, row: 0 }, terminal: { x: 24, row: 0 }, gateway: { x: 42, row: 0 }, acquirer: { x: 59, row: 0 }, scheme: { x: 76, row: 0 }, issuer: { x: 93, row: 0 },
  pos: { x: 24, row: 1 }, hsmA: { x: 59, row: 1 }, hsmI: { x: 93, row: 1 },
};
const MAIN: Actor[] = ['card', 'terminal', 'gateway', 'acquirer', 'scheme', 'issuer'];
const ROW_Y = [26, 84];

export function packetTone(step: Step, outcomeOk: boolean) {
  if (step.stage === 7 && step.kind === 'msg') return outcomeOk ? 'ok' : 'danger';
  return 'data';
}

export default function Ecosystem({ onNode, selectedNode }: { onNode?: (a: Actor) => void; selectedNode?: Actor | null }) {
  const t = useT();
  const { steps, idx, set, config, playing } = useStore();
  const step = steps[idx];
  const ok = config.outcome === 'approved';
  const tone = packetTone(step, ok);
  const color = tone === 'ok' ? 'var(--color-ok)' : tone === 'danger' ? 'var(--color-danger)' : 'var(--color-data)';
  const from = step.from && NODE[step.from], to = step.to && NODE[step.to];

  return (
    <div className="relative h-[118px] w-full min-w-[520px]">
      {/* links */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
        {MAIN.slice(0, -1).map((a, i) => {
          const b = MAIN[i + 1];
          return <line key={a} x1={`${NODE[a].x}%`} x2={`${NODE[b].x}%`} y1={ROW_Y[0]} y2={ROW_Y[0]} stroke={i < 1 ? 'var(--color-data)' : 'var(--color-net)'} strokeOpacity=".45" strokeWidth="2" strokeDasharray={i === 0 && config.iface !== 'contact' ? '3 5' : undefined} />;
        })}
        {(['pos', 'hsmA', 'hsmI'] as Actor[]).map((a) => <line key={a} x1={`${NODE[a].x}%`} x2={`${NODE[a].x}%`} y1={ROW_Y[0]} y2={ROW_Y[1]} stroke="var(--color-line)" strokeWidth="2" strokeDasharray="2 4" />)}
      </svg>

      {(Object.keys(NODE) as Actor[]).map((a) => {
        const active = step.active.includes(a);
        const sub = NODE[a].row === 1;
        const cryptoPulse = active && (step.kind === 'crypto' || step.kind === 'decision');
        return (
          <button key={a} onClick={() => onNode?.(a)} disabled={!onNode} aria-pressed={selectedNode === a}
            style={{ left: `${NODE[a].x}%`, top: ROW_Y[NODE[a].row] }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center disabled:cursor-default disabled:opacity-100">
            <span className={`relative flex items-center justify-center rounded-full border-2 transition-all duration-300 ${sub ? 'h-7 w-7' : 'h-10 w-10'} ${selectedNode === a ? 'border-ink bg-panel2 text-ink' : active ? (cryptoPulse ? 'border-crypto bg-crypto/15 text-crypto' : 'border-data bg-data/15 text-data') : 'border-line bg-panel text-muted'}`}>
              {cryptoPulse && <span className="absolute inset-0 rounded-full border border-crypto" style={{ animation: 'pulse-ring 1.4s ease-out infinite' }} />}
              <ActorIcon actor={a} size={sub ? 14 : 20} />
            </span>
            <span className={`mt-1 whitespace-nowrap text-[10.5px] leading-3 ${active ? 'text-ink' : 'text-muted'}`}>{t(ACTOR_NAME[a])}</span>
          </button>
        );
      })}

      {/* packet */}
      {from && to && (
        <motion.button key={step.id} onClick={() => set({ behind: true, selected: null })}
          title={t(step.title)} aria-label={t({ en: 'Inspect this message', fr: 'Inspecter ce message' })}
          initial={{ left: `${from.x}%`, top: ROW_Y[from.row], opacity: 0 }}
          animate={playing || true ? { left: [`${from.x}%`, `${to.x}%`], top: [ROW_Y[from.row], ROW_Y[to.row]], opacity: [0, 1, 1, 0] } : undefined}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.5, ease: 'easeInOut', times: [0, 0.15, 0.85, 1] }}
          style={{ background: color, boxShadow: `0 0 14px ${color}` }}
          className="absolute z-10 h-4 w-6 -translate-x-1/2 -translate-y-1/2 rounded-[4px] border border-white/60">
          <span className="sr-only">{t(step.title)}</span>
        </motion.button>
      )}
    </div>
  );
}
