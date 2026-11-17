/**
 * Single source of truth for the simulation. Components subscribe to slices of this store;
 * the playback clock lives in App.tsx and only calls `next()`.
 */
import { create } from 'zustand';
import type { Lang } from './i18n';
import type { Config, Iface, Step } from './sim/types';
import { buildScenario } from './sim/scenario';

export type View = 'simulator' | 'crypto-lab' | 'architecture' | 'pci';
export const VIEWS: View[] = ['simulator', 'crypto-lab', 'architecture', 'pci'];

interface State {
  lang: Lang;
  mode: 'beginner' | 'expert';
  view: View;
  config: Config;
  pin: string;
  pinDone: boolean;
  steps: Step[];
  idx: number;
  playing: boolean;
  speed: number;
  behind: boolean;
  /** Step id shown in the inspector; null follows the current step. */
  selected: string | null;
  lastKeyAt: number;
  set: (p: Partial<State>) => void;
  setConfig: (p: Partial<Config>) => void;
  next: () => void;
  prev: () => void;
  goto: (i: number) => void;
  togglePlay: () => void;
  presentCard: (i: Iface) => void;
  pressKey: (k: string) => void;
  restart: () => void;
}

const initialConfig: Config = { iface: null, clPin: false, contactPin: 'online', outcome: 'approved' };
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
const recall = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

export const gateOpen = (s: Pick<State, 'steps' | 'idx' | 'config' | 'pinDone'>) => {
  const g = s.steps[s.idx]?.gate;
  return !g || (g === 'card' ? s.config.iface !== null : s.pinDone);
};

export const useStore = create<State>((set, get) => ({
  lang: recall('pts-lang') === 'fr' || (!recall('pts-lang') && typeof navigator !== 'undefined' && navigator.language?.startsWith('fr')) ? 'fr' : 'en',
  mode: recall('pts-mode') === 'expert' ? 'expert' : 'beginner',
  view: 'simulator',
  config: initialConfig,
  pin: '',
  pinDone: false,
  steps: buildScenario(initialConfig, ''),
  idx: 0,
  playing: false,
  speed: 1,
  behind: false,
  selected: null,
  lastKeyAt: 0,

  set: (p) => {
    if (p.lang) remember('pts-lang', p.lang);
    if (p.mode) remember('pts-mode', p.mode);
    set(p);
  },
  setConfig: (p) => {
    const s = get();
    const config = { ...s.config, ...p };
    const steps = buildScenario(config, s.pinDone ? s.pin : '');
    const id = s.steps[s.idx]?.id;
    const at = steps.findIndex((x) => x.id === id);
    set({ config, steps, idx: at >= 0 ? at : Math.min(s.idx, steps.length - 1), selected: null });
  },
  next: () => {
    const s = get();
    if (!gateOpen(s)) return;
    if (s.idx >= s.steps.length - 1) return set({ playing: false });
    set({ idx: s.idx + 1, selected: null });
  },
  prev: () => set((s) => ({ idx: Math.max(0, s.idx - 1), selected: null, playing: false })),
  goto: (i) => {
    const s = get();
    // Cannot jump past a gate that still needs the user's action.
    const firstClosed = s.steps.findIndex((x) => (x.gate === 'card' && s.config.iface === null) || (x.gate === 'pin' && !s.pinDone));
    const max = firstClosed < 0 ? s.steps.length - 1 : firstClosed;
    set({ idx: Math.max(0, Math.min(i, max)), selected: null, playing: false });
  },
  togglePlay: () => {
    const s = get();
    if (s.idx >= s.steps.length - 1) return get().restart();
    set({ playing: !s.playing });
  },
  presentCard: (iface) => {
    const s = get();
    if (s.config.iface !== null) return;
    const config = { ...s.config, iface };
    const steps = buildScenario(config, '');
    set({ config, steps, idx: steps.findIndex((x) => x.id === 'activate'), playing: true, selected: null });
  },
  pressKey: (k) => {
    const s = get();
    if (s.steps[s.idx]?.id !== 'pin' || s.pinDone) return;
    if (k === 'clear') return set({ pin: s.pin.slice(0, -1), lastKeyAt: Date.now() });
    if (k === 'cancel') return set({ pin: '', lastKeyAt: Date.now() });
    if (k === 'enter') {
      if (s.pin.length < 4) return;
      const steps = buildScenario(s.config, s.pin);
      return set({ pinDone: true, steps, idx: s.idx + 1, playing: true, selected: null });
    }
    if (/^\d$/.test(k) && s.pin.length < 4) set({ pin: s.pin + k, lastKeyAt: Date.now() });
  },
  restart: () => {
    const config = { ...get().config, iface: null };
    set({ config, pin: '', pinDone: false, steps: buildScenario(config, ''), idx: 0, playing: false, selected: null });
  },
}));
