import React, { useEffect, useRef, useState } from 'react';
import type { ManufacturingModel, ProductConfig } from '../core/schema';
import { FormaScene, type ViewOpts } from './scene';
import { finishName } from '../core/materials';
import { viewSvg, mm } from '../docs/drawings';
import { webglAvailable } from './offscreen';

const EDGE_NAMES: Record<string, string> = { none: '—', thin: 'ПВХ тонкая', thick: 'ПВХ толстая', veneer: 'шпон', paint: 'окраска' };
type V = 'iso' | 'front' | 'side' | 'top';
const VIEWS: [V, string][] = [['iso', 'Общий'], ['front', 'Спереди'], ['side', 'Сбоку'], ['top', 'Сверху']];
/** Состояние просмотра по проекту: ракурс, переключатели — сохраняется при переходах «Модель / Настройки / Документы». */
const memo: Record<string, { o: ViewOpts; cam?: { p: number[]; t: number[] }; v: V; flat: 'front' | 'left' | 'top' }> = {};

export function Viewer({ model, config, pid }: { model: ManufacturingModel; config: ProductConfig; pid: string }) {
  const host = useRef<HTMLDivElement>(null), sc = useRef<FormaScene | null>(null);
  const st = memo[pid] || (memo[pid] = { o: { doors: false, drawers: false, interior: false, exploded: false, dims: true }, v: 'iso', flat: 'front' });
  const [o, setOst] = useState<ViewOpts>(st.o);
  const setO = (x: ViewOpts) => { st.o = x; setOst(x); };
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(webglAvailable() ? null : 'WebGL недоступен');
  const [menu, setMenu] = useState(false);
  const [v, setV] = useState<V>(st.v);
  const [flat, setFlat] = useState(st.flat);
  useEffect(() => {
    if (err) return;
    try { const s = new FormaScene(host.current!); sc.current = s; s.onSelect = setSel; s.setModel(model, config); s.setOpts(o); if (st.cam) s.setCam(st.cam); }
    catch (e: any) { setErr(String(e?.message || e)); }
    return () => { if (sc.current) st.cam = sc.current.getCam(); sc.current?.dispose(); sc.current = null; };
  }, []);
  useEffect(() => { sc.current?.setModel(model, config); if (sel && !model.parts.find(p => p.id === sel)) setSel(null); }, [model]);
  useEffect(() => { sc.current?.setOpts(o); }, [o]);
  const pick = (k: V) => { setV(k); st.v = k; sc.current?.view(k); setMenu(false); };
  const T = (k: keyof ViewOpts, on: string, off = on, tid?: string) => <button className="tg" aria-pressed={o[k]} data-testid={tid} onClick={() => setO({ ...o, [k]: !o[k] })}>{o[k] ? off : on}</button>;
  const hasDoors = model.moving.some(m => m.kind === 'door'), hasDr = model.moving.some(m => m.kind === 'drawer');
  const p = sel ? model.parts.find(x => x.id === sel) : null;
  if (err) {
    // резервный 2D-просмотр: проекции спереди, слева, сверху
    const ov = model.overall, dM = ov.depthMax || ov.depth, pad = 60;
    const box = flat === 'front' ? [ov.width, ov.height] : flat === 'left' ? [dM, ov.height] : [ov.width, dM];
    const W = box[0] + 2 * pad, H = box[1] + 2 * pad;
    const body = flat === 'top' ? viewSvg(model, 'top', pad, pad, 1, { labels: true }) : viewSvg(model, flat, pad, pad + ov.height, 1, { labels: true, skip: q => o.interior && (q.group === 'fronts' || q.group === 'handles') });
    return <div className="view flatview" data-testid="viewer">
      <div className="vbar">
        {(['front', 'left', 'top'] as const).map(k => <button key={k} className="tg" aria-pressed={flat === k} onClick={() => { setFlat(k); st.flat = k; }}>{k === 'front' ? 'Спереди' : k === 'left' ? 'Слева' : 'Сверху'}</button>)}
        {flat === 'front' && T('interior', 'Без фасадов', 'С фасадами')}
      </div>
      <div className="flatsvg" role="img" aria-label="2D-проекция изделия" dangerouslySetInnerHTML={{ __html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><g transform="scale(1)">${body.replace(/stroke-width="([\d.]+)"/g, (_, w) => `stroke-width="${Number(w) * Math.max(3, box[0] / 150)}"`).replace(/font-size="([\d.]+)"/g, (_, f) => `font-size="${Number(f) * Math.max(3, box[0] / 150)}"`)}</g></svg>` }} />
      <div className="flatnote small">3D недоступно в этом браузере (WebGL), показана 2D-проекция. Документы формируются. {ov.width}×{ov.height}×{mm(ov.depthTop ?? ov.depth)} мм{dM > (ov.depthTop ?? ov.depth) + 0.05 ? `, с ручками ${mm(dM)}` : ''}</div>
    </div>;
  }
  return <div className="view" ref={host} data-testid="viewer">
    <div className="vbar">
      <div className="vmenu">
        <button className="tg" aria-expanded={menu} aria-haspopup="menu" data-testid="vbtn" onClick={() => setMenu(!menu)}>Вид: {VIEWS.find(x => x[0] === v)![1]} ▾</button>
        {menu && <div className="vlist" role="menu">{VIEWS.map(([k, n]) => <button key={k} role="menuitemradio" aria-checked={v === k} onClick={() => pick(k)}>{n}</button>)}</div>}
      </div>
      {T('exploded', 'Разнести', 'Собрать', 'explode')}
      {hasDr && T('drawers', 'Открыть ящики', 'Закрыть ящики', 'drawers')}
      {hasDoors && T('doors', 'Открыть двери', 'Закрыть двери', 'doors')}
      {T('interior', 'Внутри', 'Внутри', 'interior')}
      {T('dims', 'Размеры', 'Размеры', 'dims')}
    </div>
    {p && <div className="pinfo" role="status">
      <b>{p.name} · {p.id}</b>
      {p.geom === 'panel' || p.geom === 'panel-radius' ? <>
        Готовая деталь {mm(p.L)}×{mm(p.W)}×{mm(p.thickness)} мм · заготовка {mm(p.blankL)}×{mm(p.blankW)}<br />
        {p.materialName}{p.finish ? ', ' + finishName(p.finish) : ''}<br />
        <span className="muted small">Кромка: перед/зад {EDGE_NAMES[p.edges.L2.kind]}/{EDGE_NAMES[p.edges.L1.kind]}, торцы {EDGE_NAMES[p.edges.W1.kind]}/{EDGE_NAMES[p.edges.W2.kind]} · отверстий {p.holes.length}</span>
      </> : <>{p.materialName}, длина {mm(p.L)} мм</>}
      <button className="btn sm sec" style={{ marginTop: 6 }} onClick={() => { setSel(null); sc.current?.select(null); }}>Снять выделение</button>
    </div>}
  </div>;
}
