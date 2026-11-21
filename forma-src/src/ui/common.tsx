import React, { useEffect, useState } from 'react';

/**
 * Числовое поле. Пока пользователь набирает, значение не подставляется и не обрезается до минимума:
 * применяется при Enter или уходе из поля, если оно корректно. Ошибка и допустимый диапазон — рядом с полем.
 * Целые размеры — цифровая клавиатура; дробные (step < 1) принимают запятую и точку.
 */
export function Num(p: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; label: string; hint?: string; id?: string; testid?: string }) {
  const st = p.step || 10, int = Number.isInteger(st) && st >= 1;
  const show = (v: number) => int ? String(Math.round(v)) : String(v).replace('.', ',');
  const [s, setS] = useState(show(p.value));
  const [touched, setTouched] = useState(false);
  useEffect(() => { setS(show(p.value)); setTouched(false); }, [p.value]);
  const unit = p.unit ?? 'мм', lo = p.min ?? -Infinity, hi = p.max ?? Infinity;
  const range = `${isFinite(lo) ? show(lo) : '…'}–${isFinite(hi) ? show(hi) : '…'} ${unit}`;
  const parse = (v: string): { n?: number; err?: string } => {
    const t = v.replace(/\s|мм|шт|кг/g, '').replace(',', '.');
    if (t === '') return { err: 'Введите число' };
    if (!/^\d*\.?\d*$/.test(t) || t === '.') return { err: int ? 'Только цифры' : 'Только число, например 0,4' };
    let n = Number(t); if (int) n = Math.round(n); else n = Math.round(n * 100) / 100;
    if (n < lo || n > hi) return { n, err: `Допустимо ${range}` };
    return { n };
  };
  const r = parse(s), err = touched ? r.err : undefined, eid = (p.id || p.label) + '-err';
  const commit = () => { setTouched(true); if (r.n != null && !r.err) { if (r.n !== p.value) p.onChange(r.n); else setS(show(p.value)); } };
  const bump = (d: number) => { const base = r.n != null && !r.err ? r.n : p.value; const n = Math.min(hi, Math.max(lo, Math.round((base + d) * 100) / 100)); setTouched(false); setS(show(n)); if (n !== p.value) p.onChange(n); };
  return <div className={'fld nf' + (err ? ' bad' : '')}>
    <label htmlFor={p.id}>{p.label}{unit ? <span className="u">, {unit}</span> : null}</label>
    <div className="numrow">
      <div className="num">
        <button type="button" tabIndex={-1} aria-label={'Уменьшить: ' + p.label} onClick={() => bump(-st)}>−</button>
        <input id={p.id} data-testid={p.testid} inputMode={int ? 'numeric' : 'decimal'} pattern={int ? '[0-9]*' : undefined} enterKeyHint="done" autoComplete="off"
          aria-invalid={!!err} aria-describedby={eid} value={s}
          onChange={e => { setS(e.target.value); if (touched) setTouched(true); }}
          onFocus={e => { const el = e.currentTarget; setTimeout(() => { try { el.select(); } catch { /* */ } }, 0); }}
          onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const el = e.currentTarget; el.blur(); if (document.activeElement === el) commit(); } if (e.key === 'Escape') { setS(show(p.value)); setTouched(false); } }} />
        <button type="button" tabIndex={-1} aria-label={'Увеличить: ' + p.label} onClick={() => bump(st)}>+</button>
      </div>
    </div>
    <p id={eid} className={err ? 'ferr' : 'hint'} aria-live="polite">{err ? `${err}. Сейчас применено: ${show(p.value)} ${unit}` : (p.hint ? p.hint + ' ' : '') + (isFinite(lo) || isFinite(hi) ? `Диапазон ${range}.` : '')}</p>
  </div>;
}
/** Ловит ошибки отрисовки экрана: вместо пустой страницы — сообщение и выход. */
export class Boundary extends React.Component<{ children: React.ReactNode; onBack: () => void; what: string }, { e: string | null }> {
  state = { e: null as string | null };
  static getDerivedStateFromError(e: any) { return { e: String(e?.message || e) }; }
  render() {
    if (!this.state.e) return this.props.children;
    return <div className="wrap"><div className="ck error"><b>{this.props.what}: ошибка отображения</b>{this.state.e}<i>Проект не потерян — он сохранён на устройстве.</i></div>
      <p><button className="btn" onClick={() => { this.setState({ e: null }); this.props.onBack(); }}>Вернуться</button> <button className="btn sec" onClick={() => this.setState({ e: null })}>Попробовать снова</button></p></div>;
  }
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
