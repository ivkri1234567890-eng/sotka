import React, { useEffect, useRef, useState } from 'react';
import type { ManufacturingModel, ProductConfig } from '../core/schema';
import { FormaScene, type ViewOpts } from './scene';
import { finishName } from '../core/materials';

const EDGE_NAMES: Record<string, string> = { none: '—', thin: 'ПВХ тонкая', thick: 'ПВХ толстая', veneer: 'шпон', paint: 'окраска' };

export function Viewer({ model, config }: { model: ManufacturingModel; config: ProductConfig }) {
  const host = useRef<HTMLDivElement>(null), sc = useRef<FormaScene | null>(null);
  const [o, setO] = useState<ViewOpts>({ doors: false, drawers: false, interior: false, exploded: false, dims: true });
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    try { const s = new FormaScene(host.current!); sc.current = s; s.onSelect = setSel; s.setModel(model, config); }
    catch (e: any) { setErr('3D недоступно на этом устройстве: ' + (e?.message || e)); }
    return () => { sc.current?.dispose(); sc.current = null; };
  }, []);
  useEffect(() => { sc.current?.setModel(model, config); if (sel && !model.parts.find(p => p.id === sel)) setSel(null); }, [model]);
  useEffect(() => { sc.current?.setOpts(o); }, [o]);
  const T = (k: keyof ViewOpts, n: string) => <button className="tg" aria-pressed={o[k]} onClick={() => setO({ ...o, [k]: !o[k] })}>{n}</button>;
  const hasDoors = model.moving.some(m => m.kind === 'door'), hasDr = model.moving.some(m => m.kind === 'drawer');
  const p = sel ? model.parts.find(x => x.id === sel) : null;
  return <div className="view" ref={host} data-testid="viewer">
    {err && <div className="note" style={{ margin: 16 }}>{err}</div>}
    <div className="vbar">
      <button className="tg" onClick={() => sc.current?.view('iso')} title="Вернуть удобный ракурс">↺ Общий</button>
      <button className="tg" onClick={() => sc.current?.view('front')}>Спереди</button>
      <button className="tg" onClick={() => sc.current?.view('side')}>Сбоку</button>
      <button className="tg" onClick={() => sc.current?.view('top')}>Сверху</button>
      {hasDoors && T('doors', 'Двери')}{hasDr && T('drawers', 'Ящики')}{T('interior', 'Внутри')}{T('exploded', 'Разнести')}{T('dims', 'Размеры')}
    </div>
    {p && <div className="pinfo" role="status">
      <b>{p.name} · {p.id}</b>
      {p.geom === 'panel' || p.geom === 'panel-radius' ? <>
        Готовая деталь {p.L}×{p.W}×{p.thickness} мм · заготовка {p.blankL}×{p.blankW}<br />
        {p.materialName}{p.finish ? ', ' + finishName(p.finish) : ''}<br />
        <span className="muted small">Кромка: перед/зад {EDGE_NAMES[p.edges.L2.kind]}/{EDGE_NAMES[p.edges.L1.kind]}, торцы {EDGE_NAMES[p.edges.W1.kind]}/{EDGE_NAMES[p.edges.W2.kind]} · отверстий {p.holes.length}</span>
      </> : <>{p.materialName}, длина {p.L} мм</>}
      <button className="btn sm sec" style={{ marginTop: 6 }} onClick={() => { setSel(null); sc.current?.select(null); }}>Снять выделение</button>
    </div>}
  </div>;
}
