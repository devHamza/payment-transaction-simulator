/** Main simulator: guide (left), terminal + live map (centre), technical panel (right), timeline (bottom). */
import { useStore } from '../store';
import { useT, l } from '../i18n';
import type { Outcome } from '../sim/types';
import Stage from '../components/Stage';
import Ecosystem from '../components/Ecosystem';
import Narrator from '../components/Narrator';
import Inspector from '../components/Inspector';
import Timeline, { NowLine } from '../components/Timeline';
import { Seg } from '../components/ui';

function ScenarioBar() {
  const t = useT();
  const { config, setConfig } = useStore();
  const locked = config.iface !== null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5 text-[12px]">
      <span className="font-semibold uppercase tracking-[.12em] text-muted">{t(l('Scenario', 'Scénario'))}</span>
      <label className="flex items-center gap-1.5 text-muted" htmlFor="outcome">
        {t(l('Bank answer', 'Réponse de la banque'))}
        <select id="outcome" value={config.outcome} onChange={(e) => setConfig({ outcome: e.target.value as Outcome })} className="rounded-md border border-line bg-bench px-1.5 py-1 text-ink">
          <option value="approved">{t(l('Approved', 'Accepté'))}</option>
          <option value="funds">{t(l('Declined: insufficient funds', 'Refusé : provision insuffisante'))}</option>
          <option value="fraud">{t(l('Declined: suspected fraud', 'Refusé : suspicion de fraude'))}</option>
        </select>
      </label>
      <label className={`flex items-center gap-1.5 ${locked ? 'opacity-50' : ''} text-muted`} htmlFor="clpin">
        <input id="clpin" type="checkbox" checked={config.clPin} disabled={locked} onChange={(e) => setConfig({ clPin: e.target.checked })} className="accent-[var(--color-data)]" />
        {t(l('PIN on contactless', 'PIN en sans contact'))}
      </label>
      <span className={`flex items-center gap-1.5 text-muted ${locked ? 'pointer-events-none opacity-50' : ''}`}>
        {t(l('Chip PIN', 'PIN puce'))}
        <Seg label={t(l('Chip PIN type', 'Type de PIN puce'))} value={config.contactPin} onChange={(v) => setConfig({ contactPin: v })}
          options={[{ v: 'online', label: t(l('Online', 'En ligne')) }, { v: 'offline', label: t(l('Offline', 'Hors ligne')) }]} />
      </span>
      {locked && <span className="text-muted">{t(l('Restart to change the card options.', 'Recommencez pour changer les options carte.'))}</span>}
    </div>
  );
}

export default function SimView() {
  const { mode, behind } = useStore();
  const tech = mode === 'expert' || behind;
  return (
    <div className="flex min-h-full flex-col gap-3 p-3 lg:h-full lg:min-h-[680px]">
      <Timeline />
      <div className={`grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 ${tech ? 'lg:grid-cols-[minmax(270px,330px)_minmax(0,1fr)_minmax(330px,420px)]' : 'lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]'}`}>
        <div className="min-h-[260px] lg:min-h-0"><Narrator /></div>
        <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-line bg-bench">
          <ScenarioBar />
          <NowLine />
          <div className="overflow-x-auto border-b border-line px-3 pt-3"><Ecosystem /></div>
          <div className="min-h-0 flex-1 overflow-hidden p-3"><Stage /></div>
        </section>
        {tech && <div className="min-h-[420px] lg:min-h-0"><Inspector /></div>}
      </div>
    </div>
  );
}
