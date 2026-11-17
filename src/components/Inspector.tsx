/**
 * Technical panel ("behind the scenes"): shows the real structure of whatever the current step
 * exchanged or computed, plus a log of every exchange so far.
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { useStore } from '../store';
import { useT, l, type L } from '../i18n';
import { ACTOR_NAME, type Apdu, type Check, type CryptoOp, type Field, type Msg, type Step } from '../sim/types';
import { ser } from '../sim/emv/tlv';
import { ActorIcon, Chip, FieldTree, MechBadge, Panel, fmt } from './ui';

const Illustrative = () => {
  const t = useT();
  return <Chip tone="net">{t(l('fictitious test data', 'données de test fictives'))}</Chip>;
};

function Box({ label, value, tone, sensitive }: { label: string; value: string; tone: 'data' | 'crypto' | 'ok'; sensitive?: boolean }) {
  const c = sensitive ? 'border-danger/50 bg-danger/10' : tone === 'data' ? 'border-data/40 bg-data/10' : tone === 'ok' ? 'border-ok/50 bg-ok/10' : 'border-crypto/50 bg-crypto/10';
  const tc = sensitive ? 'text-danger' : tone === 'data' ? 'text-data' : tone === 'ok' ? 'text-ok' : 'text-crypto';
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${c}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-muted">{label}</div>
      {value && <div className={`hex text-[12px] ${tc}`}>{fmt(value)}</div>}
    </div>
  );
}

const Arrow = () => <div className="flex justify-center text-crypto" aria-hidden="true"><svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 1v13M2 9l5 5 5-5" /></svg></div>;

/** One cryptographic operation drawn as a pipeline: inputs → keyed operation → stages → output. */
export function CryptoView({ op, animateKey }: { op: CryptoOp; animateKey?: string }) {
  const t = useT();
  const [more, setMore] = useState(false);
  const item = (i: number) => ({ initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.25 * i, duration: 0.3 } });
  let n = 0;
  return (
    <div key={animateKey} className="flex flex-col gap-1.5 rounded-xl border border-line bg-bench p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-[13.5px] font-semibold">{t(op.title)}</h4>
        <span className="flex gap-1"><MechBadge mech={op.mech} />{op.simulated && <Chip tone="net">{t(l('not computed', 'non calculé'))}</Chip>}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted"><ActorIcon actor={op.by} size={14} />{t(l('Performed by', 'Réalisé par'))} <span className="text-ink">{t(ACTOR_NAME[op.by])}</span></div>

      {op.inputs.map((x, i) => <motion.div key={i} {...item(n++)}><Box label={t(x.label)} value={x.value} tone="data" sensitive={x.sensitive} /></motion.div>)}
      <motion.div {...item(n++)}><Arrow /></motion.div>
      <motion.div {...item(n++)} className="rounded-lg border-2 border-crypto bg-crypto/10 px-2.5 py-2">
        <div className="text-[12.5px] font-semibold text-crypto">{t(op.op)}</div>
        {op.key.value && (
          <div className="mt-1 flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-crypto)" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l3 3" /></svg>
            <div><div className="text-[11.5px] text-ink">{op.key.name}</div><div className="hex text-[11.5px] text-crypto/90">{fmt(op.key.value)}</div></div>
          </div>
        )}
        <div className="mt-1 text-[11.5px] text-muted">{t(op.key.type)}</div>
      </motion.div>
      {op.stages?.map((s, i) => (
        <motion.div key={i} {...item(n++)} className="ml-3 border-l-2 border-crypto/40 pl-2.5">
          <div className="hex text-[10.5px] text-muted">{t(s.label)}</div>
          <div className="hex text-[11.5px] text-crypto">{fmt(s.value)}</div>
        </motion.div>
      ))}
      <motion.div {...item(n++)}><Arrow /></motion.div>
      <motion.div {...item(n++)}><Box label={t(op.output.label)} value={op.output.value} tone="ok" /></motion.div>

      <button onClick={() => setMore(!more)} aria-expanded={more} className="mt-1 self-start text-[12px] text-data underline-offset-2 hover:underline">
        {more ? t(l('Hide details', 'Masquer les détails')) : t(l('Destination, verification, what it protects', 'Destination, vérification, ce que cela protège'))}
      </button>
      {more && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
          {([[l('Destination', 'Destination'), op.dest], [l('Verification', 'Vérification'), op.verify], [l('Protects', 'Protège'), op.protects], [l('Does not protect', 'Ne protège pas'), op.notProtects]] as [L, L][]).map(([k, v], i) => (
            <div key={i} className="contents"><dt className={i === 3 ? 'text-danger' : i === 2 ? 'text-ok' : 'text-muted'}>{t(k)}</dt><dd className="text-ink/90">{t(v)}</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ApduView({ a }: { a: Apdu }) {
  const t = useT();
  const [sel, setSel] = useState(1);
  const raw = a.cmd.map((f) => f.value).join('');
  const cur = a.cmd[sel];
  const respHex = a.resp.map(ser).join('');
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted"><span className="text-data">C-APDU</span> {t(l('terminal → card', 'terminal → carte'))} · {raw.length / 2} {t(l('bytes', 'octets'))}</div>
        <div className="flex flex-wrap gap-1">
          {a.cmd.map((f, i) => (
            <button key={f.name} onClick={() => setSel(i)} aria-pressed={sel === i}
              className={`rounded-md border px-1.5 py-1 text-left transition-colors ${sel === i ? 'border-data bg-data/20' : 'border-line bg-bench hover:border-data/60'}`}>
              <span className="block text-[9.5px] uppercase tracking-wider text-muted">{f.name}</span>
              <span className={`hex block max-w-[250px] text-[12px] ${f.sensitive ? 'text-danger' : 'text-data'}`}>{fmt(f.value)}</span>
            </button>
          ))}
        </div>
        {cur && <p className="mt-1.5 rounded-md bg-panel2 px-2.5 py-1.5 text-[12.5px] text-ink/90"><span className="mono font-semibold text-data">{cur.name} </span>{t(cur.desc)}</p>}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted"><span className="text-ok">R-APDU</span> {t(l('card → terminal', 'carte → terminal'))} · {respHex.length / 2 + 2} {t(l('bytes', 'octets'))}</div>
        {a.resp.length > 0 ? <FieldTree fields={a.resp} /> : <p className="text-[12.5px] text-muted">{t(l('No data: status only.', 'Pas de données : statut seul.'))}</p>}
        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-ok/40 bg-ok/10 px-2 py-1.5">
          <span className="mono text-[12px] font-semibold text-ok">SW1 SW2 = {fmt(a.sw)}</span>
          <span className="text-[12px] text-muted">{t(l('9000 = command executed successfully', '9000 = commande exécutée avec succès'))}</span>
        </div>
      </div>
    </div>
  );
}

function MsgView({ m, step }: { m: Msg; step: Step }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2.5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-muted">{t(l('Message', 'Message'))}</dt><dd className="font-semibold">{m.name}</dd>
        {step.from && step.to && <><dt className="text-muted">{t(l('Route', 'Trajet'))}</dt><dd>{t(ACTOR_NAME[step.from])} → {t(ACTOR_NAME[step.to])}</dd></>}
        <dt className="text-muted">{t(l('Protocol', 'Protocole'))}</dt><dd>{t(m.protocol as L)}</dd>
        <dt className="text-muted">{t(l('Security', 'Sécurité'))}</dt>
        <dd><ul className="flex flex-col gap-0.5">{m.security.map((s, i) => <li key={i} className="flex gap-1.5"><span className="text-net" aria-hidden="true">▸</span>{t(s)}</li>)}</ul></dd>
      </dl>
      <FieldTree fields={m.fields} />
      {m.note && <p className="border-l-2 border-net pl-3 text-[12px] text-muted">{t(m.note)}</p>}
    </div>
  );
}

function ChecksView({ checks, stepId }: { checks: Check[]; stepId: string }) {
  const t = useT();
  return (
    <ol key={stepId} className="flex flex-col gap-1.5">
      {checks.map((c, i) => (
        <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 * i }}
          className={`flex gap-2.5 rounded-lg border px-3 py-2 ${c.status === 'ok' ? 'border-ok/40 bg-ok/10' : c.status === 'fail' ? 'border-danger/50 bg-danger/10' : 'border-line bg-bench opacity-60'}`}>
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-bg ${c.status === 'ok' ? 'bg-ok' : c.status === 'fail' ? 'bg-danger' : 'bg-muted'}`}>{c.status === 'ok' ? '✓' : c.status === 'fail' ? '✕' : '–'}</span>
          <span><span className="block text-[13px] font-semibold">{t(c.label)}</span><span className="block text-[12px] text-muted">{t(c.detail)}</span></span>
        </motion.li>
      ))}
    </ol>
  );
}

export function StepDetail({ step }: { step: Step }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-auto text-[15px] font-semibold">{step.apdu?.name ?? step.msg?.name ?? t(step.title)}</h3>
        <Illustrative />
      </div>
      {step.apdu && <><p className="text-[12.5px] text-muted">{t(step.apdu.purpose)}</p><ApduView key={step.id} a={step.apdu} /></>}
      {step.msg && <MsgView m={step.msg} step={step} />}
      {step.crypto?.map((op, i) => <CryptoView key={step.id + i} op={op} />)}
      {step.checks && <ChecksView checks={step.checks} stepId={step.id} />}
      {!step.apdu && !step.msg && !step.crypto && !step.checks && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] leading-relaxed text-ink/90">{t(step.expert)}</p>
          <div className="flex flex-wrap gap-1.5">{step.tags.map((x) => <Chip key={x} tone="data">{x}</Chip>)}</div>
        </div>
      )}
    </div>
  );
}

const kindLabel = (s: Step) => (s.apdu ? 'APDU' : s.msg ? 'MSG' : s.crypto ? 'CRYPTO' : s.checks ? 'RULES' : 'INFO');

export default function Inspector() {
  const t = useT();
  const { steps, idx, selected, set } = useStore();
  const [tab, setTab] = useState<'step' | 'log'>('step');
  const shown = steps.find((s) => s.id === selected) ?? steps[idx];
  const log = steps.slice(0, idx + 1).filter((s) => s.apdu || s.msg || s.crypto || s.checks);

  return (
    <Panel className="h-full" title={t(l('Behind the scenes', 'En coulisses'))}
      right={
        <div className="flex gap-1">
          {(['step', 'log'] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={`rounded-md px-2 py-0.5 text-[12px] ${tab === k ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'}`}>
              {k === 'step' ? t(l('This step', 'Cette étape')) : `${t(l('Exchange log', 'Journal'))} (${log.length})`}
            </button>
          ))}
        </div>
      }>
      <div className="scroll min-h-0 flex-1 p-4">
        {tab === 'step' ? (
          <>
            {selected && selected !== steps[idx].id && (
              <button onClick={() => set({ selected: null })} className="mb-2 text-[12px] text-data hover:underline">← {t(l('Back to the current step', 'Revenir à l’étape en cours'))}</button>
            )}
            <StepDetail step={shown} />
          </>
        ) : (
          <ol className="flex flex-col gap-1">
            {log.length === 0 && <li className="text-[13px] text-muted">{t(l('Nothing exchanged yet.', 'Aucun échange pour l’instant.'))}</li>}
            {log.map((s) => (
              <li key={s.id}>
                <button onClick={() => { set({ selected: s.id }); setTab('step'); }}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left hover:border-data/60 ${s.id === steps[idx].id ? 'border-data/60 bg-panel2' : 'border-line bg-bench'}`}>
                  <span className={`mono w-[52px] shrink-0 text-[10px] font-semibold ${s.crypto ? 'text-crypto' : s.checks ? 'text-ok' : 'text-data'}`}>{kindLabel(s)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{s.apdu?.name ?? s.msg?.name ?? t(s.title)}</span>
                  <span className="shrink-0 text-[11px] text-muted">{s.from && s.to ? `${t(ACTOR_NAME[s.from])} → ${t(ACTOR_NAME[s.to])}` : t(ACTOR_NAME[s.active[0]])}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}

export type { Field };
