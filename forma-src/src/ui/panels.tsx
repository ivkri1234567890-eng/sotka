import React, { useState } from 'react';
import type { ProductConfig, Finish, Zone, MaterialIdT } from '../core/schema';
import { MATERIALS, DECORS, WOODS, RAL, METALS, SHEEN_NAMES, searchRal, fixFinish, finishName, BACKS } from '../core/materials';
import { STYLE_NAMES, applyStyle, ZONE, CATALOG } from '../core/catalog';
import { MATTRESS_W, MATTRESS_L, BED_DEFAULT } from '../core/bed';
import { derive, handleProtrusion } from '../core/engine';
import { Num, Chips, Opts, toast } from './common';
import { pickFile, readDataUrl } from '../platform/files';

type Set = (f: (c: ProductConfig) => ProductConfig, label?: string) => void;
type Photo = { id: string; name: string; dataUrl: string };

export function FinishPicker({ mat, value, onChange }: { mat: MaterialIdT; value: Finish; onChange: (f: Finish) => void }) {
  const m = MATERIALS[mat]; const [q, setQ] = useState('');
  const kinds = m.finishKinds;
  const KN: Record<string, string> = { ral: 'Эмаль RAL', decor: 'Декор плиты', wood: 'Порода дерева', natural: 'Натуральная' };
  return <div className="fld">
    {kinds.length > 1 && <Chips value={value.kind} options={kinds.map(k => [k, KN[k]] as [any, string])} onChange={(k: Finish['kind']) => onChange(k === 'ral' ? { kind: 'ral', code: '9010', sheen: value.sheen } : k === 'wood' ? { kind: 'wood', code: 'oak', sheen: value.sheen } : k === 'natural' ? { kind: 'natural', code: 'birch', sheen: value.sheen } : { kind: 'decor', code: 'W-white', sheen: 'matte' })} />}
    {value.kind === 'decor' && <div className="sw">{DECORS.map(d => <button key={d.code} className="swatch" title={d.name} aria-label={d.name} aria-pressed={value.code === d.code} style={{ background: d.hex }} onClick={() => onChange({ ...value, code: d.code })} />)}</div>}
    {value.kind === 'wood' && <div className="sw">{WOODS.map(d => <button key={d.code} className="swatch" title={d.name} aria-label={d.name} aria-pressed={value.code === d.code} style={{ background: d.hex }} onClick={() => onChange({ ...value, code: d.code })} />)}</div>}
    {value.kind === 'ral' && <>
      <div className="ralrow"><input placeholder="Поиск: код или название, например 7044 или серый" value={q} onChange={e => setQ(e.target.value)} aria-label="Поиск RAL" /></div>
      <div className="sw" style={{ maxHeight: 150, overflow: 'auto' }}>{searchRal(q).map(r => <button key={r.code} className="swatch" title={`RAL ${r.code} ${r.name}`} aria-label={`RAL ${r.code} ${r.name}`} aria-pressed={value.code === r.code} style={{ background: r.hex }} onClick={() => onChange({ ...value, code: r.code })} />)}
        {!searchRal(q).length && <p className="hint">В подборке нет такого цвета. Подборка — {RAL.length} цветов RAL Classic, не полный каталог.</p>}</div>
    </>}
    {value.kind !== 'decor' && <Chips value={value.sheen} options={(Object.keys(SHEEN_NAMES) as Finish['sheen'][]).filter(s => value.kind === 'ral' || s !== 'gloss').map(s => [s, SHEEN_NAMES[s]])} onChange={s => onChange({ ...value, sheen: s })} />}
    <p className="hint">Выбрано: {finishName(value)}</p>
  </div>;
}

function MaterialBlock({ title, mat, th, fin, onMat, onTh, onFin, extra }: { title: string; mat: MaterialIdT; th: number; fin: Finish; onMat: (m: MaterialIdT) => void; onTh: (t: number) => void; onFin: (f: Finish) => void; extra?: React.ReactNode }) {
  return <div className="box"><h4>{title}</h4>
    <Opts value={mat} options={(Object.keys(MATERIALS) as MaterialIdT[]).map(k => ({ v: k, name: MATERIALS[k].name, hint: MATERIALS[k].hint.split('.')[0] }))} onChange={onMat} />
    <Chips label="Толщина" value={th} options={MATERIALS[mat].thicknesses.map(t => [t, t + ' мм'] as [number, string])} onChange={onTh} />
    <FinishPicker mat={mat} value={fin} onChange={onFin} />{extra}</div>;
}
const setMat = (part: 'body' | 'fronts' | 'top') => (c: ProductConfig, m: MaterialIdT): ProductConfig => {
  const cur = c[part] as any, ths = MATERIALS[m].thicknesses;
  const th = ths.includes(cur.thickness) ? cur.thickness : ths.reduce((a, b) => Math.abs(b - cur.thickness) < Math.abs(a - cur.thickness) ? b : a);
  const next: any = { ...cur, material: m, thickness: th, finish: fixFinish(m, cur.finish) };
  if (part === 'fronts' && cur.design === 'milled-frame' && !MATERIALS[m].milling) { next.design = 'flat'; toast('Фрезеровка рамки доступна только на МДФ под эмаль — фасад стал гладким'); }
  return { ...c, [part]: next };
};

function BedSizePane({ c, set }: { c: ProductConfig; set: Set }) {
  const b = c.bed || BED_DEFAULT, up = (o: Partial<typeof b>) => set(x => ({ ...x, bed: { ...(x.bed || BED_DEFAULT), ...o } }), 'Кровать');
  const legs = c.base.type === 'floor' ? 0 : c.base.height;
  return <div className="pane">
    <Chips label="Ширина матраса" value={b.mattressW} options={MATTRESS_W.map(w => [w, w / 10 + ' см'] as [number, string])} onChange={v => up({ mattressW: v })} />
    <Chips label="Длина матраса" value={b.mattressL} options={MATTRESS_L.map(w => [w, w / 10 + ' см'] as [number, string])} onChange={v => up({ mattressL: v })} />
    <div className="row3">
      <Num label="Изголовье, высота" value={b.headH} min={400} max={1600} step={50} onChange={v => up({ headH: v })} />
      <Num label="Царга, высота" value={b.railH} min={120} max={400} step={10} onChange={v => up({ railH: v })} />
      <Num label="Просвет под кроватью" value={legs} min={0} max={400} step={10} onChange={v => set(x => ({ ...x, base: { ...x.base, type: v === 0 ? 'floor' : x.base.type === 'floor' ? 'legs-wood' : x.base.type, height: v } }), 'Основание')} hint="Высота ножек / подиума" />
    </div>
    <Chips label="Изножье" value={b.footboard ? 'y' : 'n'} options={[['n', 'Нет — царга'], ['y', 'Есть']]} onChange={v => up({ footboard: v === 'y' })} />
    {b.footboard && <Num label="Изножье, высота" value={b.footH} min={200} max={1000} step={50} onChange={v => up({ footH: v })} />}
    <Chips label="Изголовье, форма" value={b.head} options={[['flat', 'Прямое'], ['arch', 'Скруглённые углы']]} onChange={v => up({ head: v })} />
    <div className="box small">Габарит: {c.size.width} × {c.size.height} × {c.size.depth} мм (ширина × высота изголовья × длина). Матрас лежит на {legs + b.railH - 50} мм от пола; верх матраса 200 мм — около {legs + b.railH + 150} мм.</div>
  </div>;
}
function MirrorBox({ c, set }: { c: ProductConfig; set: Set }) {
  const m = c.mirror || { type: 'none' as const, width: 700, height: 800, mount: 'top' as const };
  const up = (o: Partial<typeof m>) => set(x => ({ ...x, mirror: { ...m, ...o } }), 'Зеркало');
  return <div className="box"><h4>Зеркало</h4>
    <Chips value={m.type} options={[['none', 'Без зеркала'], ['rect', 'Прямоугольное'], ['arch', 'Арочное']]} onChange={v => up({ type: v })} />
    {m.type !== 'none' && <>
      <div className="row2"><Num label="Ширина зеркала" value={m.width} min={300} max={c.size.width} step={50} onChange={v => up({ width: v })} /><Num label="Высота зеркала" value={m.height} min={300} max={1500} step={50} onChange={v => up({ height: v })} /></div>
      <Chips label="Установка" value={m.mount} options={[['top', 'На столешнице'], ['wall', 'На стене над трюмо']]} onChange={v => up({ mount: v })} />
      <p className="hint">Зеркало 4 мм заказывается в стекольной мастерской и клеится на щит из материала корпуса.</p></>}
  </div>;
}
export function SizePane({ c, set }: { c: ProductConfig; set: Set }) {
  if (c.category === 'bed') return <BedSizePane c={c} set={set} />;
  const d = derive(c), hp = handleProtrusion(c);
  const lim = c.category === 'nightstand' ? { w: [300, 900], h: [250, 900], d: [300, 600] } : c.category === 'dresser' ? { w: [600, 1800], h: [150, 950], d: [300, 600] } : { w: [400, 3000], h: [1000, 2700], d: [350, 800] };
  return <div className="pane">
    <div className="row3">
      <Num id="w" label="Ширина" value={c.size.width} min={lim.w[0]} max={lim.w[1]} onChange={v => set(x => ({ ...x, size: { ...x.size, width: v } }), 'Ширина')} />
      <Num id="h" label="Высота" value={c.size.height} min={lim.h[0]} max={lim.h[1]} onChange={v => set(x => ({ ...x, size: { ...x.size, height: v } }), 'Высота')} />
      <Num id="d" label="Глубина" value={c.size.depth} min={lim.d[0]} max={lim.d[1]} onChange={v => set(x => ({ ...x, size: { ...x.size, depth: v } }), 'Глубина')} />
    </div>
    <div className="box"><h4>Что входит в общие размеры</h4>
      <div className="small">{c.base.type === 'wall' ? '• Подвесная — ножек и цоколя нет' : c.base.type === 'floor' ? '• Без ножек — стоит на полу на подпятниках' : `• ${c.base.type === 'plinth' ? 'Цоколь' : c.base.type === 'metal-frame' ? 'Металлокаркас' : 'Ножки'} ${c.base.height} мм — входят в высоту ✓`}<br />
        {c.top.enabled ? `• Столешница ${c.top.thickness} мм с выносом ${c.top.overhangFront} мм вперёд и ${c.top.overhangSides} мм по бокам — входит ✓` : '• Отдельной столешницы нет'}<br />
        {c.fronts.mount === 'overlay' ? `• Накладные фасады ${c.fronts.thickness} мм — входят в глубину ✓` : '• Вкладные фасады — внутри корпуса'}<br />
        {hp ? `• Ручки выступают на ${hp} мм — НЕ входят в глубину ✗` : '• Ручки не выступают'}</div>
      <div className="small muted">Корпус: {Math.round(d.bodyW)} × {Math.round(d.bodyH)} × {Math.round(d.bodyD)} мм (без основания, столешницы и фасадов)</div>
    </div>
    {c.category === 'dresser' && <MirrorBox c={c} set={set} />}
    <p className="hint">При изменении размеров пересчитываются корпус, фасады, наполнение, зазоры, деталировка, раскрой и смета.</p>
  </div>;
}

export function StylePane({ c, set, photos, setPhotos }: { c: ProductConfig; set: Set; photos: Photo[]; setPhotos: (p: Photo[]) => void }) {
  return <div className="pane">
    <Opts label="Стиль — меняет основание, фасады, ручки и материалы; размеры и наполнение сохраняются" value={c.style}
      options={(Object.keys(STYLE_NAMES) as ProductConfig['style'][]).map(s => ({ v: s, name: STYLE_NAMES[s], hint: CATALOG.find(i => i.config.category === c.category && i.config.style === s)?.name }))}
      onChange={s => set(x => applyStyle(x, s), 'Стиль')} />
    {c.category !== 'bed' && <><Chips label="Фасады" value={c.fronts.mount} options={[['overlay', 'Накладные'], ['inset', 'Вкладные']]} onChange={v => set(x => ({ ...x, fronts: { ...x.fronts, mount: v } }), 'Тип фасадов')} />
    <p className="hint">Накладные закрывают торцы корпуса. Вкладные стоят внутри проёма — с ровным зазором по периметру.</p>
    <Chips label="Рисунок фасада" value={c.fronts.design} options={[['flat', 'Гладкий'], ['milled-frame', 'Фрезерованная рамка']]} onChange={v => set(x => ({ ...x, fronts: { ...x.fronts, design: v } }), 'Рисунок фасада')} />
    {c.fronts.design === 'milled-frame' && !MATERIALS[c.fronts.material].milling && <div className="note">Фрезеровка возможна только на МДФ под эмаль. Выберите этот материал фасадов в разделе «Материалы и цвет».</div>}</>}
    <div className="box"><h4>Фото-образец <button className="btn sm sec" onClick={async () => { const f = await pickFile('image/*'); if (!f) return; try { const u = await readDataUrl(f); setPhotos([...photos, { id: 'ph' + Date.now(), name: f.name, dataUrl: u }]); } catch (e: any) { toast(e.message); } }}>+ Фото</button></h4>
      <p className="hint">Фото хранится в проекте как образец для мастера. Программа не распознаёт по фото конструкцию и размеры.</p>
      {!!photos.length && <div className="photos">{photos.map(p => <figure key={p.id}><img src={p.dataUrl} alt={p.name} /><button aria-label="Удалить фото" onClick={() => setPhotos(photos.filter(x => x.id !== p.id))}>×</button></figure>)}</div>}
    </div>
  </div>;
}

export function MaterialsPane({ c, set }: { c: ProductConfig; set: Set }) {
  return <div className="pane">
    <div className="note">Цвет на экране приблизительный. Перед изготовлением нужен физический образец. Декоры ЛДСП и шпон не совпадают с RAL точно.</div>
    <MaterialBlock title={c.category === 'bed' ? 'Каркас (изголовье, царги)' : 'Корпус'} mat={c.body.material} th={c.body.thickness} fin={c.body.finish}
      onMat={m => set(x => setMat('body')(x, m), 'Материал корпуса')} onTh={t => set(x => ({ ...x, body: { ...x.body, thickness: t } }), 'Толщина корпуса')} onFin={f => set(x => ({ ...x, body: { ...x.body, finish: f } }), 'Цвет корпуса')} />
    {c.category === 'bed' ? <p className="hint">Фасады ящиков кровати — из материала фасадов ниже.</p> : null}
    <MaterialBlock title={c.category === 'bed' ? 'Ящики и изножье' : 'Фасады'} mat={c.fronts.material} th={c.fronts.thickness} fin={c.fronts.finish}
      onMat={m => set(x => setMat('fronts')(x, m), 'Материал фасадов')} onTh={t => set(x => ({ ...x, fronts: { ...x.fronts, thickness: t } }), 'Толщина фасадов')} onFin={f => set(x => ({ ...x, fronts: { ...x.fronts, finish: f } }), 'Цвет фасадов')}
      extra={<button className="btn sm sec" onClick={() => set(x => ({ ...x, fronts: { ...x.fronts, material: x.body.material, thickness: x.body.thickness, finish: x.body.finish, design: MATERIALS[x.body.material].milling ? x.fronts.design : 'flat' } }), 'Фасады как корпус')}>Как корпус</button>} />
    {c.category !== 'bed' && <><div className="box"><h4>Столешница <label className="small"><input type="checkbox" checked={c.top.enabled} onChange={e => set(x => ({ ...x, top: { ...x.top, enabled: e.target.checked } }), 'Столешница')} /> есть</label></h4>
      {c.top.enabled ? <>
        <Opts value={c.top.material} options={(Object.keys(MATERIALS) as MaterialIdT[]).map(k => ({ v: k, name: MATERIALS[k].name }))} onChange={m => set(x => setMat('top')(x, m), 'Материал столешницы')} />
        <Chips label="Толщина" value={c.top.thickness} options={MATERIALS[c.top.material].thicknesses.map(t => [t, t + ' мм'] as [number, string])} onChange={t => set(x => ({ ...x, top: { ...x.top, thickness: t } }), 'Толщина столешницы')} />
        <FinishPicker mat={c.top.material} value={c.top.finish} onChange={f => set(x => ({ ...x, top: { ...x.top, finish: f } }), 'Цвет столешницы')} />
        <div className="row3">
          <Num label="Вынос вперёд" value={c.top.overhangFront} min={0} max={60} step={5} onChange={v => set(x => ({ ...x, top: { ...x.top, overhangFront: v } }), 'Вынос')} />
          <Num label="Вынос по бокам" value={c.top.overhangSides} min={0} max={60} step={5} onChange={v => set(x => ({ ...x, top: { ...x.top, overhangSides: v } }), 'Вынос')} />
          <Num label="Радиус углов" value={c.top.cornerRadius} min={0} max={100} step={5} onChange={v => set(x => ({ ...x, top: { ...x.top, cornerRadius: v } }), 'Радиус')} />
        </div></> : <p className="hint">Без столешницы верх корпуса — крыша между боковинами.</p>}
    </div>
    <div className="box"><h4>Задняя стенка</h4>
      <Chips value={c.back.material} options={(Object.keys(BACKS) as (keyof typeof BACKS)[]).map(k => [k, BACKS[k].name] as [any, string])} onChange={m => set(x => ({ ...x, back: { ...x.back, material: m, thickness: (BACKS as any)[m].thicknesses[0] } }), 'Задняя стенка')} />
      <Chips label="Толщина" value={c.back.thickness} options={(BACKS as any)[c.back.material].thicknesses.map((t: number) => [t, t + ' мм'])} onChange={t => set(x => ({ ...x, back: { ...x.back, thickness: t } }), 'Задняя стенка')} />
      <Chips label="Установка" value={c.back.mount} options={[['groove', 'В паз'], ['overlay', 'Внакладку']]} onChange={v => set(x => ({ ...x, back: { ...x.back, mount: v } }), 'Задняя стенка')} />
    </div>
    </>}
  </div>;
}

const ZT: [Zone['type'], string][] = [['drawer', 'Ящик'], ['door', 'Дверь'], ['open', 'Открыто']];
export function FillPane({ c, set }: { c: ProductConfig; set: Set }) {
  if (c.category === 'bed') { const b = c.bed || BED_DEFAULT, up = (o: Partial<typeof b>) => set(x => ({ ...x, bed: { ...(x.bed || BED_DEFAULT), ...o } }), 'Кровать');
    return <div className="pane">
      <Opts label="Основание под матрас" value={b.base} options={[{ v: 'slats', name: 'Ламели', hint: 'Гнутоклеёные 53×8 на латодержателях' }, { v: 'panel', name: 'Сплошное', hint: 'Щиты ЛДСП на опорных брусках' }]} onChange={v => up({ base: v })} />
      <Chips label="Выкатные ящики сбоку" value={b.drawers} options={[[0, 'Нет'], [2, '2 ящика'], [3, '3 ящика']]} onChange={v => up({ drawers: v })} />
      {b.drawers > 0 && <p className="hint">Ящики на колёсах выкатываются из-под правой царги. Нужен просвет под кроватью от 200 мм (ножки или металлокаркас).</p>}
      <p className="hint">Для матраса шире 130 см добавляется центральная балка с опорами.</p>
      <p className="hint">Мягкое изголовье (обивка тканью) пока не рассчитывается.</p>
    </div>; }
  const updZone = (ci: number, zi: number, z: Partial<Zone>) => set(x => ({ ...x, columns: x.columns.map((col, i) => i !== ci ? col : { ...col, zones: col.zones.map((zz, j) => j !== zi ? zz : { ...zz, ...z }) }) }), 'Наполнение');
  const preset = (zones: Zone[]) => set(x => ({ ...x, columns: [{ width: null, zones }] }), 'Наполнение');
  return <div className="pane">
    {c.category === 'nightstand' && <div className="fld"><span className="lbl">Быстрый выбор</span><div className="chips">
      <button className="chip" onClick={() => preset([ZONE('drawer')])}>1 ящик</button>
      <button className="chip" onClick={() => preset([ZONE('drawer'), ZONE('drawer')])}>2 ящика</button>
      <button className="chip" onClick={() => preset([ZONE('drawer'), ZONE('drawer'), ZONE('drawer')])}>3 ящика</button>
      <button className="chip" onClick={() => preset([ZONE('drawer', { height: 140 }), ZONE('open')])}>Ящик + ниша</button>
      <button className="chip" onClick={() => preset([ZONE('door', { shelves: 1 })])}>Дверь</button>
      <button className="chip" onClick={() => preset([ZONE('open', { shelves: 1 })])}>Открытая</button>
    </div></div>}
    {c.columns.map((col, ci) => <div className="box" key={ci}>
      <h4>{c.columns.length > 1 ? `Секция ${ci + 1}` : 'Секция'}
        {c.columns.length > 1 && <button className="btn sm ghost" onClick={() => set(x => ({ ...x, columns: x.columns.filter((_, i) => i !== ci) }), 'Удалить секцию')}>Удалить</button>}</h4>
      {c.columns.length > 1 && <Chips label="Ширина секции" value={col.width ? 'fix' : 'auto'} options={[['auto', 'Поровну'], ['fix', 'Задать']]} onChange={v => set(x => ({ ...x, columns: x.columns.map((cc, i) => i !== ci ? cc : { ...cc, width: v === 'auto' ? null : 600 }) }), 'Ширина секции')} />}
      {col.width != null && <Num label="Внутренняя ширина" value={col.width} min={150} step={10} onChange={v => set(x => ({ ...x, columns: x.columns.map((cc, i) => i !== ci ? cc : { ...cc, width: v }) }), 'Ширина секции')} />}
      {col.zones.map((z, zi) => <div className="zone" key={zi}>
        <div className="zh"><b className="small">{zi === 0 ? 'Верх' : zi === col.zones.length - 1 ? 'Низ' : `Зона ${zi + 1}`}</b>
          <div className="chips">{ZT.map(([v, n]) => <button key={v} className="chip" aria-pressed={z.type === v} onClick={() => updZone(ci, zi, { type: v })}>{n}</button>)}</div>
          {col.zones.length > 1 && <button className="btn sm ghost" aria-label="Удалить зону" onClick={() => set(x => ({ ...x, columns: x.columns.map((cc, i) => i !== ci ? cc : { ...cc, zones: cc.zones.filter((_, j) => j !== zi) }) }), 'Удалить зону')}>×</button>}
        </div>
        <Chips value={z.height ? 'fix' : 'auto'} options={[['auto', 'Высота поровну'], ['fix', 'Задать высоту']]} onChange={v => updZone(ci, zi, { height: v === 'auto' ? null : 300 })} />
        {z.height != null && <Num label="Внутренняя высота зоны" value={z.height} min={80} step={10} onChange={v => updZone(ci, zi, { height: v })} />}
        {z.type !== 'drawer' && <div className="row2">
          <Num label="Полки" unit="шт" step={1} min={0} max={12} value={z.shelves} onChange={v => updZone(ci, zi, { shelves: Math.max(0, Math.min(12, Math.round(v))) })} />
          <div className="fld"><span className="lbl">Штанга для одежды</span><Chips value={z.rod ? 'y' : 'n'} options={[['n', 'Нет'], ['y', 'Есть']]} onChange={v => updZone(ci, zi, { rod: v === 'y' })} /></div>
        </div>}
        {z.type === 'door' && <Chips label="Двери" value={z.doors} options={[['auto', 'Авто'], ['left', 'Петли слева'], ['right', 'Петли справа'], ['double', 'Две двери']]} onChange={v => updZone(ci, zi, { doors: v })} />}
      </div>)}
      <button className="btn sm sec" disabled={col.zones.length >= 8} onClick={() => set(x => ({ ...x, columns: x.columns.map((cc, i) => i !== ci ? cc : { ...cc, zones: [...cc.zones, ZONE('drawer')] }) }), 'Добавить зону')}>+ Зона снизу</button>
    </div>)}
    {c.category === 'wardrobe' && <button className="btn sec" disabled={c.columns.length >= 6} onClick={() => set(x => ({ ...x, columns: [...x.columns, { width: null, zones: [ZONE('door', { shelves: 4 })] }] }), 'Добавить секцию')}>+ Секция</button>}
    <div className="box"><h4>Короба ящиков</h4>
      <Chips value={c.drawerBox.material} options={[['ldsp', 'ЛДСП 16 мм'], ['plywood', 'Фанера']]} onChange={m => set(x => ({ ...x, drawerBox: { material: m, thickness: m === 'ldsp' ? 16 : 12 } }), 'Короба ящиков')} />
      {c.drawerBox.material === 'plywood' && <Chips label="Толщина" value={c.drawerBox.thickness} options={[[12, '12 мм'], [15, '15 мм']]} onChange={t => set(x => ({ ...x, drawerBox: { ...x.drawerBox, thickness: t } }), 'Короба ящиков')} />}
    </div>
    <p className="hint">Купе не предлагается: нет проверенного профиля конкретной системы раздвижных дверей.</p>
  </div>;
}

export function HandlesPane({ c, set }: { c: ProductConfig; set: Set }) {
  return <div className="pane">
    <Opts label="Ручки" value={c.handles.type} options={[{ v: 'push', name: 'Без ручек', hint: 'Открытие нажатием' }, { v: 'knob', name: 'Кнопка', hint: '1 винт' }, { v: 'bar', name: 'Скоба', hint: '2 винта' }, { v: 'edge-profile', name: 'Профиль', hint: 'По верхней кромке' }]}
      onChange={v => set(x => ({ ...x, handles: { ...x.handles, type: v } }), 'Ручки')} />
    {c.handles.type === 'bar' && <Chips label="Межцентровое расстояние" value={c.handles.size} options={[[96, '96'], [128, '128'], [160, '160'], [192, '192']]} onChange={v => set(x => ({ ...x, handles: { ...x.handles, size: v } }), 'Ручки')} />}
    {c.handles.type !== 'push' && <div className="fld"><span className="lbl">Цвет ручек</span><div className="sw">{METALS.map(m => <button key={m.code} className="swatch" title={m.name} aria-label={m.name} aria-pressed={c.handles.color === m.code} style={{ background: m.hex }} onClick={() => set(x => ({ ...x, handles: { ...x.handles, color: m.code } }), 'Цвет ручек')} />)}</div></div>}
    {(c.category === 'nightstand' || c.category === 'dresser') && <Chips label="Ножки" value={c.base.type.startsWith('legs') ? 'y' : 'n'} options={[['y', 'Есть'], ['n', 'Нет']]}
      onChange={v => set(x => v === 'y' ? applyLegs(x) : ({ ...x, base: { ...x.base, type: 'floor', height: 0 } }), 'Ножки')} />}
    <Opts label="Основание" value={c.base.type} options={[{ v: 'legs-wood', name: 'Ножки дерево' }, { v: 'legs-metal', name: 'Опоры металл' }, { v: 'floor', name: 'Без ножек', hint: 'На пол, подпятники' }, { v: 'plinth', name: c.category === 'bed' ? 'Подиум' : 'Цоколь' }, { v: 'metal-frame', name: 'Металлокаркас', hint: 'Сварной, труба 20×20' }, ...(c.category === 'bed' ? [] : [{ v: 'wall' as const, name: 'Подвесная', hint: 'Крепление к стене' }])]}
      onChange={v => set(x => ({ ...x, base: { ...x.base, type: v, height: v === 'wall' || v === 'floor' ? 0 : x.base.height || (v === 'plinth' ? 80 : 150) } }), 'Основание')} />
    {c.base.type !== 'wall' && c.base.type !== 'floor' && <Num label="Высота основания" value={c.base.height} min={c.base.type === 'plinth' ? 60 : 40} max={400} step={10} onChange={v => set(x => ({ ...x, base: { ...x.base, height: v } }), 'Высота основания')} hint="Входит в общую высоту изделия." />}
    {c.base.type === 'plinth' && <Num label="Отступ цоколя от фасада" value={c.base.plinthRecess} min={0} max={100} step={5} onChange={v => set(x => ({ ...x, base: { ...x.base, plinthRecess: v } }), 'Цоколь')} />}
    {(c.base.type === 'legs-metal' || c.base.type === 'metal-frame') && <div className="fld"><span className="lbl">Цвет металла</span><div className="sw">{METALS.map(m => <button key={m.code} className="swatch" title={m.name} aria-label={m.name} aria-pressed={c.base.metalColor === m.code} style={{ background: m.hex }} onClick={() => set(x => ({ ...x, base: { ...x.base, metalColor: m.code } }), 'Цвет металла')} />)}</div></div>}
    {(c.base.type === 'wall' || c.mirror?.mount === 'wall' && c.mirror.type !== 'none') && <><Opts label="Материал стены — от него зависит крепёж" value={c.base.wallBase} options={[{ v: 'unknown', name: 'Не знаю' }, { v: 'concrete', name: 'Бетон' }, { v: 'brick', name: 'Кирпич' }, { v: 'aerated', name: 'Газобетон' }, { v: 'drywall', name: 'Гипсокартон' }]}
      onChange={v => set(x => ({ ...x, base: { ...x.base, wallBase: v } }), 'Стена')} />
      <div className="note">Универсального крепления к любой стене нет. Крепёж подбирается по основанию стены, массе тумбы и нагрузке — по документации производителя анкеров и навесов.</div></>}
  </div>;
}

export function ProdPane({ c, set }: { c: ProductConfig; set: Set }) {
  const P = c.production; const up = (k: keyof typeof P, v: number) => set(x => ({ ...x, production: { ...x.production, [k]: v } }), 'Для производства');
  return <div className="pane">
    <p className="hint">Параметры для мастерской. Новичку менять не нужно.</p>
    <div className="row2">
      <Num label="Зазор между фасадами" value={P.gap} step={0.5} min={0} max={6} onChange={v => up('gap', v)} />
      <Num label="Макс. ширина двери" value={P.maxDoorWidth} step={10} min={300} max={700} onChange={v => up('maxDoorWidth', v)} />
      <Num label="Кромка тонкая" value={P.edgeThin} step={0.1} min={0} max={1} onChange={v => up('edgeThin', v)} />
      <Num label="Кромка толстая" value={P.edgeThick} step={0.5} min={0} max={3} onChange={v => up('edgeThick', v)} />
      <Num label="Припуск под кромку" value={P.edgeAllowance} step={0.5} min={0} max={3} onChange={v => up('edgeAllowance', v)} hint="Добавляется к заготовке на каждую кромкуемую сторону." />
      <Num label="Нагрузка на полку" unit="кг" value={P.shelfLoadKg} step={1} min={0} max={60} onChange={v => up('shelfLoadKg', v)} hint="Для оценки прогиба." />
    </div>
    <div className="box small"><h4>Система координат</h4>
      Миллиметры. X — вправо (ширина), Y — вверх (высота), Z — к зрителю (глубина). Начало — левый задний нижний угол корпуса на уровне пола.
      У каждой детали: L — длина (направление текстуры), W — ширина, T — толщина; лицевая сторона A, обратная B; кромки L1/L2 (вдоль длины), W1/W2 (по торцам).
      Координаты отверстий на пласти — от угла детали: u вдоль L от кромки W1, v вдоль W от кромки L1.
    </div>
  </div>;
}

/** Вернуть ножки: тумба становится выше на высоту ножек, корпус не меняется. */
function applyLegs(x: ProductConfig): ProductConfig {
  const h = x.category === 'dresser' ? 560 : 150;
  return { ...x, base: { ...x.base, type: 'legs-wood', height: h }, size: { ...x.size, height: x.base.type === 'floor' || x.base.type === 'wall' ? x.size.height + h : x.size.height } };
}
