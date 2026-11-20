import React, { useEffect, useState } from 'react';

export function Num(p: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; label: string; hint?: string; id?: string }) {
  const [s, setS] = useState(String(p.value));
  useEffect(() => setS(String(p.value)), [p.value]);
  const commit = (v: string) => { const n = Number(v.replace(',', '.')); if (isFinite(n) && v.trim() !== '') p.onChange(n); else setS(String(p.value)); };
  const st = p.step || 10;
  return <div className="fld">
    <label htmlFor={p.id}>{p.label}</label>
    <div className="num">
      <button type="button" aria-label={'Уменьшить: ' + p.label} onClick={() => p.onChange(Math.max(p.min ?? -1e9, p.value - st))}>−</button>
      <input id={p.id} inputMode="decimal" value={s} onChange={e => setS(e.target.value)} onBlur={e => commit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <span>{p.unit ?? 'мм'}</span>
      <button type="button" aria-label={'Увеличить: ' + p.label} onClick={() => p.onChange(Math.min(p.max ?? 1e9, p.value + st))}>+</button>
    </div>
    {p.hint && <p className="hint">{p.hint}</p>}
  </div>;
}
export function Chips<T extends string | number>(p: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return <div className="fld">{p.label && <span className="lbl">{p.label}</span>}<div className="chips" role="group" aria-label={p.label}>
    {p.options.map(([v, n]) => <button type="button" key={String(v)} className="chip" aria-pressed={p.value === v} onClick={() => p.onChange(v)}>{n}</button>)}</div></div>;
}
export function Opts<T extends string>(p: { value: T; options: { v: T; name: string; hint?: string; disabled?: boolean }[]; onChange: (v: T) => void; label?: string }) {
  return <div className="fld">{p.label && <span className="lbl">{p.label}</span>}<div className="opts">
    {p.options.map(o => <button type="button" key={o.v} className="opt" aria-pressed={p.value === o.v} disabled={o.disabled} onClick={() => p.onChange(o.v)}><b>{o.name}</b>{o.hint && <span>{o.hint}</span>}</button>)}</div></div>;
}
let toastFn: (s: string) => void = () => {};
export function toast(s: string) { toastFn(s); }
export function Toaster() {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => { let h: any; toastFn = s => { setM(s); clearTimeout(h); h = setTimeout(() => setM(null), 2800); }; }, []);
  return m ? <div className="toast" role="status">{m}</div> : null;
}
export function Modal(p: { title: string; text?: string; children?: React.ReactNode; actions: { label: string; kind?: string; onClick: () => void }[] }) {
  return <div className="modal" role="dialog" aria-modal="true"><div className="card"><b style={{ fontSize: 18 }}>{p.title}</b>{p.text && <p style={{ margin: 0 }}>{p.text}</p>}{p.children}
    <div className="chips" style={{ justifyContent: 'flex-end' }}>{p.actions.map(a => <button key={a.label} className={'btn ' + (a.kind || '')} onClick={a.onClick}>{a.label}</button>)}</div></div></div>;
}
export const fmtMoney = (v: number, cur = '₽') => Math.round(v).toLocaleString('ru-RU') + ' ' + cur;
