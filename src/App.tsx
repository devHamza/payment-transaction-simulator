import { useEffect } from 'react';
import { gateOpen, useStore, VIEWS, type View } from './store';
import { useT, l } from './i18n';
import SimView from './views/SimView';
import LabView from './views/LabView';
import ArchView from './views/ArchView';
import PciView from './views/PciView';
import { Seg } from './components/ui';

const NAV: Record<View, ReturnType<typeof l>> = {
  simulator: l('Simulator', 'Simulateur'),
  'crypto-lab': l('Crypto lab', 'Labo crypto'),
  architecture: l('Architecture', 'Architecture'),
  pci: l('PCI security', 'Sécurité PCI'),
};

export default function App() {
  const t = useT();
  const s = useStore();
  const { view, playing, idx, speed, steps, lang, mode } = s;
  const open = gateOpen(s);

  // Playback clock: the only place that advances the simulation automatically.
  useEffect(() => {
    if (!playing || !open || view !== 'simulator') return;
    const id = setTimeout(() => useStore.getState().next(), steps[idx].dur / speed);
    return () => clearTimeout(id);
  }, [playing, open, idx, speed, view, steps]);

  // Views are addressable by a plain #name.
  useEffect(() => {
    const read = () => { const h = location.hash.slice(1) as View; if (VIEWS.includes(h)) useStore.getState().set({ view: h }); };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const go = (v: View) => { s.set({ view: v }); try { history.replaceState(null, '', '#' + v); } catch { /* sandboxed */ } };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-bench px-4 py-2.5">
        <div className="mr-auto">
          <h1 className="text-[16px] font-bold leading-tight">{t(l('Payment Transaction Simulator', 'Simulateur de transaction de paiement'))}</h1>
          <p className="text-[11.5px] text-muted">{t(l('From card tap to bank authorisation', 'De la carte à l’autorisation bancaire'))}</p>
        </div>
        <nav className="flex gap-1" aria-label="Views">
          {VIEWS.map((v) => (
            <button key={v} onClick={() => go(v)} aria-current={view === v ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${view === v ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'}`}>{t(NAV[v])}</button>
          ))}
        </nav>
        <Seg label={t(l('Explanation level', 'Niveau d’explication'))} value={mode} onChange={(v) => s.set({ mode: v })}
          options={[{ v: 'beginner', label: t(l('Beginner', 'Débutant')) }, { v: 'expert', label: t(l('Expert', 'Expert')) }]} />
        <Seg label="Language" value={lang} onChange={(v) => s.set({ lang: v })} options={[{ v: 'en', label: 'EN' }, { v: 'fr', label: 'FR' }]} />
      </header>
      <main className="scroll min-h-0 flex-1">
        {view === 'simulator' && <SimView />}
        {view === 'crypto-lab' && <LabView />}
        {view === 'architecture' && <ArchView />}
        {view === 'pci' && <PciView />}
      </main>
    </div>
  );
}
