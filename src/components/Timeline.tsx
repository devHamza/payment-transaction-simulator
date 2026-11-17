/** Playback controls + stage timeline (one compact bar at the top), and the "now" line shown above the map. */
import { gateOpen, useStore } from '../store';
import { useT, l } from '../i18n';
import { ACTOR_NAME, STAGES } from '../sim/types';
import { stageNames } from '../sim/scenario';

const Ico = ({ d }: { d: string }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>;

/** What is happening at this instant: who talks to whom, and which message. */
export function NowLine() {
  const t = useT();
  const s = useStore();
  const step = s.steps[s.idx];
  const waiting = !gateOpen(s);
  return (
    <div className="flex min-w-0 items-baseline gap-2 border-b border-line px-4 py-2 text-[12.5px]">
      <span className="truncate">
        <span className="text-muted">{t(l('Now', 'En cours'))} · </span>
        <span className="font-semibold">{step.from && step.to ? `${t(ACTOR_NAME[step.from])} → ${t(ACTOR_NAME[step.to])}` : step.active.map((a) => t(ACTOR_NAME[a])).join(' + ')}</span>
        <span className="text-muted"> · {step.apdu?.name ?? step.msg?.name ?? t(step.title)}</span>
      </span>
      {waiting && <span className="shrink-0 text-crypto">{t(l('waiting for you', 'en attente de votre action'))}</span>}
    </div>
  );
}

export default function Timeline() {
  const t = useT();
  const s = useStore();
  const { steps, idx, playing, speed, config } = s;
  const step = steps[idx];
  const names = config.iface ? stageNames(config) : STAGES;
  const waiting = !gateOpen(s);
  const done = idx === steps.length - 1;
  const btn = 'flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-bench text-ink hover:border-data/60';

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-panel px-3 py-2">
      <div className="flex shrink-0 items-center gap-1.5">
        <button className={btn} onClick={s.restart} aria-label={t(l('Restart', 'Recommencer'))} title={t(l('Restart', 'Recommencer'))}><Ico d="M12 5V2L7 6l5 4V7a5 5 0 11-5 5H5a7 7 0 107-7z" /></button>
        <button className={btn} onClick={s.prev} disabled={idx === 0} aria-label={t(l('Previous step', 'Étape précédente'))} title={t(l('Previous step', 'Étape précédente'))}><Ico d="M6 5h2v14H6zM20 5v14l-10-7z" /></button>
        <button onClick={s.togglePlay} disabled={waiting && !done} aria-label={playing ? t(l('Pause', 'Pause')) : t(l('Play', 'Lecture'))}
          className="flex h-8 min-w-[112px] items-center justify-center gap-1.5 rounded-lg bg-data px-3 font-semibold text-bg hover:brightness-110">
          <Ico d={done ? 'M12 5V2L7 6l5 4V7a5 5 0 11-5 5H5a7 7 0 107-7z' : playing ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M7 4v16l13-8z'} />
          <span className="text-[13px]">{done ? t(l('Replay', 'Rejouer')) : playing ? t(l('Pause', 'Pause')) : idx === 0 ? t(l('Start', 'Démarrer')) : t(l('Resume', 'Reprendre'))}</span>
        </button>
        <button className={btn} onClick={s.next} disabled={waiting || done} aria-label={t(l('Next step', 'Étape suivante'))} title={t(l('Next step', 'Étape suivante'))}><Ico d="M16 5h2v14h-2zM4 5v14l10-7z" /></button>
        <label className="ml-1 flex items-center gap-1.5 text-[12px] text-muted" htmlFor="speed">
          {t(l('Speed', 'Vitesse'))}
          <select id="speed" value={speed} onChange={(e) => s.set({ speed: +e.target.value })} className="rounded-md border border-line bg-bench px-1.5 py-1 text-ink">
            <option value={0.4}>0.4×</option><option value={0.7}>0.7×</option><option value={1}>1×</option><option value={1.8}>1.8×</option>
          </select>
        </label>
      </div>

      <ol className="grid min-w-0 flex-1 basis-[420px] gap-1.5" style={{ gridTemplateColumns: names.map((_, i) => (i + 1 === step.stage ? 'minmax(0,2.6fr)' : 'minmax(0,1fr)')).join(' ') }} aria-label={t(l('Transaction timeline', 'Chronologie de la transaction'))}>
        {names.map((n, i) => {
          const st = i + 1;
          const mine = steps.map((x, k) => ({ x, k })).filter(({ x }) => x.stage === st);
          const state = step.stage > st ? 'done' : step.stage === st ? 'now' : 'next';
          return (
            <li key={i} className="min-w-0" aria-current={state === 'now' ? 'step' : undefined}>
              <button onClick={() => mine[0] && s.goto(mine[0].k)} className="block w-full text-left" title={t(n)}>
                <span className={`flex items-center gap-1.5 text-[11.5px] ${state === 'now' ? 'font-semibold text-ink' : state === 'done' ? 'text-ok' : 'text-muted'}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold ${state === 'done' ? 'bg-ok text-bg' : state === 'now' ? 'bg-data text-bg' : 'border border-line'}`}>{state === 'done' ? '✓' : st}</span>
                  {/* Current stage always named; the others only on wide screens (full name in the tooltip). */}
                  <span className={`truncate ${state === 'now' ? 'hidden sm:inline' : 'hidden 2xl:inline'}`}>{t(n)}</span>
                </span>
              </button>
              <span className="mt-1 flex gap-0.5">
                {mine.map(({ x, k }) => (
                  <button key={x.id} onClick={() => s.goto(k)} title={t(x.title)} aria-label={t(x.title)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    {k < idx && <span className="block h-full bg-ok" />}
                    {k === idx && <span key={`${idx}-${playing}-${speed}`} className="block h-full origin-left bg-data" style={playing && !waiting ? { animation: `progress ${x.dur / speed}ms linear forwards` } : undefined} />}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ol>

      <span className="mono shrink-0 text-[12px] text-muted" aria-label={t(l('Step', 'Étape'))}>{idx + 1}/{steps.length}</span>
    </div>
  );
}
