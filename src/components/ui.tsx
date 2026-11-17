import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useT, type L } from '../i18n';
import type { Actor, Field, Mech } from '../sim/types';
import { MECH } from '../sim/types';
import { sp } from '../sim/crypto/primitives';

export const isHex = (v: string) => /^[0-9A-F]+$/i.test(v) && v.length % 2 === 0;
export const fmt = (v: string) => (isHex(v) && v.length > 4 ? sp(v) : v);

export function Chip({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'data' | 'ok' | 'crypto' | 'danger' | 'net' }) {
  const c = { muted: 'border-line text-muted', data: 'border-data/40 text-data bg-data/10', ok: 'border-ok/40 text-ok bg-ok/10', crypto: 'border-crypto/40 text-crypto bg-crypto/10', danger: 'border-danger/40 text-danger bg-danger/10', net: 'border-net/40 text-net bg-net/10' }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap ${c}`}>{children}</span>;
}

export function MechBadge({ mech }: { mech: Mech }) {
  const t = useT();
  return <Chip tone={mech === 'tls' || mech === 'keymgmt' ? 'net' : 'crypto'}>{t(MECH[mech].name)}</Chip>;
}

export function Panel({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-line bg-panel ${className}`}>
      {title && (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-[12px] font-semibold uppercase tracking-[.12em] text-muted">{title}</h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/** Expandable, recursive view of APDU parts, TLV objects and message fields. */
export function FieldTree({ fields, depth = 0 }: { fields: Field[]; depth?: number }) {
  return <ul className="flex flex-col gap-1">{fields.map((f, i) => <FieldRow key={f.name + i} f={f} depth={depth} />)}</ul>;
}

function FieldRow({ f, depth }: { f: Field; depth: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const label = f.label ? t(f.label as L) : '';
  return (
    <li style={{ marginLeft: depth ? 12 : 0 }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors hover:border-data/60 ${open ? 'border-data/60 bg-panel2' : 'border-line bg-bench'}`}>
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="mono text-[12px] font-semibold text-data">{f.name}</span>
          {label && <span className="text-[12px] text-ink">{label}</span>}
          {f.kind === 'impl' && <Chip>{t({ en: 'implementation-specific', fr: 'propre à l’implémentation' })}</Chip>}
          {f.sensitive && <Chip tone="danger">{t({ en: 'sensitive', fr: 'sensible' })}</Chip>}
        </span>
        {!f.children && f.value && <span className={`hex mt-0.5 block text-[12px] ${f.sensitive ? 'text-danger' : 'text-muted'}`}>{fmt(f.value)}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && f.desc && (
          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-2 text-[12px] text-muted">
            <span className="block py-1.5">{t(f.desc)}</span>
          </motion.p>
        )}
      </AnimatePresence>
      {f.children && <div className="mt-1 border-l border-line pl-1"><FieldTree fields={f.children} depth={depth + 1} /></div>}
    </li>
  );
}

const ICONS: Record<Actor, ReactNode> = {
  card: <><rect x="3" y="6" width="18" height="12" rx="2" /><rect x="6" y="10" width="4" height="3" rx=".5" /></>,
  terminal: <><rect x="7" y="2" width="10" height="20" rx="2" /><rect x="9" y="5" width="6" height="4" /><path d="M9.5 13h1M12 13h1M14.5 13h.5M9.5 16h1M12 16h1M14.5 16h.5" /></>,
  pos: <><rect x="3" y="4" width="18" height="11" rx="1.5" /><path d="M8 20h8M12 15v5" /></>,
  gateway: <><path d="M4 12h16M14 6l6 6-6 6" /><circle cx="5" cy="12" r="2" /></>,
  acquirer: <><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>,
  scheme: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  issuer: <><path d="M3 10l9-6 9 6M5 10v8M19 10v8M3 20h18" /><circle cx="12" cy="13" r="2" /><path d="M9 18c.5-2 5.5-2 6 0" /></>,
  hsmA: <><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M12 9v-1M12 16v-1M15 12h1M8 12h1" /></>,
  hsmI: <><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M12 9v-1M12 16v-1M15 12h1M8 12h1" /></>,
};
export function ActorIcon({ actor, size = 20 }: { actor: Actor; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[actor]}</svg>;
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-bench p-0.5">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} aria-pressed={value === o.v}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${value === o.v ? 'bg-data text-bg' : 'text-muted hover:text-ink'}`}>{o.label}</button>
      ))}
    </div>
  );
}
