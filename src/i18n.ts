import { useStore } from './store';

/** A bilingual string. Every user-facing text in the app is one of these. */
export interface L { en: string; fr: string }
export const l = (en: string, fr: string): L => ({ en, fr });
export type Lang = 'en' | 'fr';

/** Hook returning a translator bound to the current language. */
export function useT() {
  const lang = useStore((s) => s.lang);
  return (s: L | string | undefined) => (s == null ? '' : typeof s === 'string' ? s : s[lang]);
}
