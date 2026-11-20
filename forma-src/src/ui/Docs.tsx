import React, { useMemo, useState } from 'react';
import type { Project, Prices } from '../core/schema';
import { buildModel } from '../core/engine';
import { estimate, demoPrices, PAINT_NAMES } from '../core/estimate';
import { HW } from '../core/hardware';
import { assemblySheet, interiorSheet, partSheet, cutSheetSvg, edgeIcon } from '../docs/drawings';
import { partsRows, hardwareRows, docStatus, EDGE_RU, STATUS_RU, toCsv, PART_HEAD, HW_HEAD, estimateCsv } from '../docs/export';
import { buildPdf } from '../docs/pdf';
import { buildZip, projectJson, csvBlob, dxfZip, safeName } from '../docs/bundle';
import { saveFile, shareFile, isNative } from '../platform/files';
import { shot } from './offscreen';
import { fmtMoney, toast } from './common';

const SECTIONS = [['draw', 'Чертежи'], ['parts', 'Деталировка'], ['edges', 'Кромление'], ['hw', 'Фурнитура'], ['drill', 'Присадка'], ['cut', 'Раскрой'], ['est', 'Смета'], ['guide', 'Инструкция'], ['checks', 'Проверки']] as const;
type Sec = typeof SECTIONS[number][0];

export function Docs({ project, onChange, onBack }: { project: Project; onChange: (p: Project) => void; onBack: () => void }) {
  const [sec, setSec] = useState<Sec>('draw');
  const [busy, setBusy] = useState<string | null>(null);
  const [drillI, setDrillI] = useState(0);
  const m = useMemo(() => buildModel(project.config), [project.config]);
  const prices = project.prices || demoPrices();
  const e = useMemo(() => estimate(m, project.config, prices), [m, prices]);
  const errors = m.checks.filter(x => x.level === 'error');
  const status = docStatus(m), name = safeName(project.name);
  const unv = m.joints.filter(j => j.status === 'unverified').length;
  const badge: Record<Sec, [string, string]> = {
    draw: ['rv', 'эскиз'], parts: ['ok', 'рассчитано'], edges: ['ok', 'рассчитано'], hw: [unv ? 'rv' : 'ok', unv ? 'требует проверки' : 'проверено'],
    drill: ['rv', 'требует проверки'], cut: ['ok', 'эвристика'], est: [e.incomplete.length || prices.demo ? 'rv' : 'ok', prices.demo ? 'демо-ставки' : e.incomplete.length ? 'неполная' : 'ваши ставки'],
    guide: ['rv', 'предварительная'], checks: [errors.length ? 'no' : 'ok', errors.length ? `ошибок ${errors.length}` : 'норма'],
  };
  const run = async (label: string, f: () => Promise<void>) => { if (busy) return; setBusy(label); try { await f(); } catch (x: any) { toast('Ошибка: ' + (x?.message || x)); } finally { setBusy(null); } };
  const out = async (fname: string, blob: Blob, share = false) => {
    if (share) { const r = await shareFile(fname, blob, project.name); if (r === 'downloaded') toast('Файл сохранён'); return; }
    const ok = await saveFile(fname, blob); if (ok) toast(isNative() ? 'Файл сохранён в выбранную папку' : 'Файл скачан: ' + fname);
  };
  const setPrices = (f: (p: Prices) => Prices) => onChange({ ...project, prices: { ...f(prices), demo: false } });
  const bumpVersion = () => onChange({ ...project, docVersion: project.docVersion + 1 });
  const pdf = (share: boolean) => run('PDF', async () => out(`${name}.pdf`, await buildPdf(project, m, e, s => setBusy('PDF: ' + s)), share));
  const zip = (share: boolean) => run('ZIP', async () => out(`${name}.zip`, await buildZip(project, m, e, s => setBusy('ZIP: ' + s)), share));
  const drillParts = m.parts.filter(q => q.sheet && (q.holes.length || q.ops.length));
  return <>
    <div className="top"><button className="icon" aria-label="Назад" onClick={onBack}>←</button><h1>Документы: {project.name}</h1></div>
    <div className="wrap">
      {errors.length > 0 && <div className="ck error" style={{ marginBottom: 12 }}><b>Есть ошибки конструкции</b>Документы формируются с пометкой «не для изготовления». Исправьте: {errors.map(x => x.msg).join(' ')}</div>}
      <div className="exp">
        <button className="btn" onClick={() => pdf(false)} disabled={!!busy} data-testid="pdf">⬇ PDF</button>
        <button className="btn warm" onClick={() => zip(false)} disabled={!!busy} data-testid="zip">⬇ Всё одним ZIP</button>
        <button className="btn sec" onClick={() => run('CSV', async () => out(`${name}-деталировка.csv`, csvBlob(toCsv(partsRows(m), PART_HEAD))))} disabled={!!busy}>CSV деталировка</button>
        <button className="btn sec" onClick={() => run('CSV', async () => out(`${name}-фурнитура.csv`, csvBlob(toCsv(hardwareRows(m), HW_HEAD))))} disabled={!!busy}>CSV фурнитура</button>
        <button className="btn sec" onClick={() => run('DXF', async () => out(`${name}-DXF.zip`, await dxfZip(m).generateAsync({ type: 'blob' })))} disabled={!!busy}>DXF деталей</button>
        <button className="btn sec" onClick={() => run('JSON', async () => out(`${name}.forma.json`, projectJson(project)))} disabled={!!busy} data-testid="json">JSON проекта</button>
        <button className="btn sec" onClick={() => pdf(true)} disabled={!!busy}>Поделиться PDF</button>
        <button className="btn sec" onClick={() => zip(true)} disabled={!!busy}>Поделиться ZIP</button>
        <button className="btn ghost" onClick={bumpVersion} title="Увеличить номер версии документов">Версия {project.docVersion} ＋</button>
      </div>
      {busy && <div className="note" role="status" style={{ marginBottom: 12 }}>Готовлю {busy}…</div>}
      <div className="docs">
        <nav className="dnav">{SECTIONS.map(([k, n]) => <button key={k} aria-selected={sec === k} onClick={() => setSec(k)}><span>{n}</span><span className={'badge ' + badge[k][0]}>{badge[k][1]}</span></button>)}</nav>
        <div className="dview">
          <p className="small muted" style={{ marginTop: 0 }}>Статус: <b>{status}</b> · версия {project.docVersion} · код конфигурации {m.configHash}</p>
          {sec === 'draw' && <>
            <div dangerouslySetInnerHTML={{ __html: assemblySheet(m, project, status) }} />
            <div style={{ height: 12 }} /><div dangerouslySetInnerHTML={{ __html: interiorSheet(m, project, status) }} />
            <h3>Разнесённый вид</h3><img alt="Разнесённый вид" style={{ width: '100%', borderRadius: 12 }} src={shot(m, project.config, { w: 1200, h: 760, exploded: true })} />
          </>}
          {sec === 'parts' && <>
            <p className="small">Готовая деталь — размер после кромления. Заготовка — размер распила.</p>
            <table className="t"><thead><tr><th>ID</th><th>Деталь</th><th>Материал</th><th>T</th><th>Готовая L×W</th><th>Заготовка</th><th>Текстура</th><th>Отделка</th></tr></thead>
              <tbody>{partsRows(m).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.material}</td><td className="n">{r.t}</td><td className="n">{r.L}×{r.W}</td><td className="n">{r.bL}×{r.bW}</td><td>{r.grain}</td><td>{r.finish}</td></tr>)}</tbody></table>
            {m.parts.some(q => !q.sheet) && <><h4>Покупные и металлические элементы</h4><table className="t"><tbody>{m.parts.filter(q => !q.sheet).map(q => <tr key={q.id}><td>{q.id}</td><td>{q.name}</td><td>{q.materialName}</td><td className="n">{q.L} мм</td></tr>)}</tbody></table></>}
          </>}
          {sec === 'edges' && <table className="t"><thead><tr><th>ID</th><th>Схема</th><th>Деталь</th><th>L1 (зад/низ)</th><th>L2 (перед/верх)</th><th>W1</th><th>W2</th></tr></thead>
            <tbody>{m.parts.filter(q => q.sheet).map(q => <tr key={q.id}><td>{q.id}</td><td dangerouslySetInnerHTML={{ __html: edgeIcon(q) }} /><td>{q.name} {q.L}×{q.W}</td>{(['L1', 'L2', 'W1', 'W2'] as const).map(k => <td key={k}>{EDGE_RU[q.edges[k].kind]}{q.edges[k].t ? ` ${q.edges[k].t}` : ''}</td>)}</tr>)}</tbody></table>}
          {sec === 'hw' && <>
            <table className="t"><thead><tr><th>Наименование</th><th>Артикул</th><th>Кол-во</th><th>Соединений</th><th>Профиль</th></tr></thead>
              <tbody>{hardwareRows(m).map(r => <tr key={r.id}><td>{r.name}</td><td>{r.article}</td><td className="n">{r.qty} {r.unit}</td><td className="n">{r.joints}</td><td>{r.status}{r.missing && <div className="small muted">не хватает: {r.missing}</div>}</td></tr>)}</tbody></table>
            <h4>Соединения и крепёж</h4>
            <table className="t"><tbody>{m.joints.map(j => <tr key={j.id}><td>{j.id}</td><td>{j.title}</td><td>{j.parts.join(', ')}</td><td>{j.hardware.map(h => `${HW[h.id]?.name || h.id} × ${h.qty}`).join('; ') || '—'}</td><td>{STATUS_RU[j.status]}</td></tr>)}</tbody></table>
          </>}
          {sec === 'drill' && <>
            <p className="small">Отверстия формируются только по известным данным фурнитуры; источник каждого параметра указан. Соединения без проверенного профиля ({unv}) — без отверстий, «требует проверки».</p>
            <div className="chips" style={{ marginBottom: 10 }}>{drillParts.map((q, i) => <button key={q.id} className="chip" aria-pressed={drillI === i} onClick={() => setDrillI(i)}>{q.id}</button>)}</div>
            {drillParts[drillI] && <div dangerouslySetInnerHTML={{ __html: partSheet(drillParts[drillI], project, 'ПРИСАДКА — ТРЕБУЕТ ПРОВЕРКИ', 'П' + (drillI + 1)) }} />}
          </>}
          {sec === 'cut' && <>
            <div className="row3" style={{ maxWidth: 520, marginBottom: 10 }}>
              <label className="fld small">Пропил, мм<input className="pricein" value={prices.kerf} onChange={x => setPrices(p => ({ ...p, kerf: Number(x.target.value) || 0 }))} /></label>
              <label className="fld small">Обрезка края листа, мм<input className="pricein" value={prices.trim} onChange={x => setPrices(p => ({ ...p, trim: Number(x.target.value) || 0 }))} /></label>
            </div>
            <p className="small">Раскрой эвристический (MaxRects) — не гарантированно оптимальный. Детали с текстурой не поворачиваются.</p>
            {e.cut.map(g => <div key={g.key} className="box" style={{ marginBottom: 12 }}><h4>{g.title}</h4>
              <div className="small">Листов: {g.sheets.length} · детали {(g.partArea / 1e6).toFixed(2)} м² · листы {(g.sheetArea / 1e6).toFixed(2)} м² · остатки {((g.sheetArea - g.partArea) / 1e6).toFixed(2)} м²{g.offcuts.length ? ` · крупные остатки: ${g.offcuts.map(o => o.w + '×' + o.h).join(', ')}` : ''}</div>
              {g.unplaced.length > 0 && <div className="ck error">Не помещаются на лист {g.sheet.L}×{g.sheet.W}: {g.unplaced.map(u => `${u.id} (${u.blankL}×${u.blankW})`).join(', ')}</div>}
              <div className="row2" style={{ maxWidth: 360 }}>
                <label className="fld small">Лист L<input className="pricein" value={g.sheet.L} onChange={x => setPrices(p => ({ ...p, sheetFormats: { ...p.sheetFormats, [g.material]: { L: Number(x.target.value) || g.sheet.L, W: g.sheet.W } } }))} /></label>
                <label className="fld small">Лист W<input className="pricein" value={g.sheet.W} onChange={x => setPrices(p => ({ ...p, sheetFormats: { ...p.sheetFormats, [g.material]: { L: g.sheet.L, W: Number(x.target.value) || g.sheet.W } } }))} /></label>
              </div>
              {g.sheets.map((_, i) => <div key={i} dangerouslySetInnerHTML={{ __html: cutSheetSvg(g, i, project, status, 'Р' + (i + 1)) }} />)}
            </div>)}
          </>}
          {sec === 'est' && <EstimateView project={project} prices={prices} setPrices={setPrices} e={e} reset={() => onChange({ ...project, prices: null })} />}
          {sec === 'guide' && <>
            <div className="note">Предварительная инструкция к эскизу. Это не проверенная инструкция изготовления.</div>
            <p className="small">Инструмент: {[...new Set(m.steps.flatMap(s => s.tools))].join(', ') || '—'}; рулетка, уровень.</p>
            {m.steps.map((s, i) => <div className="step" key={s.id}>
              <img alt={'Шаг ' + (i + 1)} src={shot(m, project.config, { w: 720, h: 520, show: s.show, hl: s.fresh.length ? s.fresh : s.parts })} />
              <div><b>Шаг {i + 1}. {s.title}</b><ul>{s.text.map((t, j) => <li key={j}>{t}</li>)}</ul>
                <div className="small">Детали шага: {s.parts.join(', ')}</div>
                <div className="small">{s.hardware.map(h => `${HW[h.id]?.name || h.id} — ${h.qty} ${HW[h.id]?.unit || 'шт'}`).join('; ')}</div></div>
            </div>)}
          </>}
          {sec === 'checks' && <div className="checks" style={{ padding: 0 }}>
            {m.checks.map((x, i) => <div key={i} className={'ck ' + x.level}><b>{x.area}</b>{x.msg}{x.fix && <i>{x.fix}</i>}</div>)}
          </div>}
        </div>
      </div>
    </div>
  </>;
}

function EstimateView({ project, prices, setPrices, e, reset }: { project: Project; prices: Prices; setPrices: (f: (p: Prices) => Prices) => void; e: ReturnType<typeof estimate>; reset: () => void }) {
  const cur = prices.currency;
  const P = (k: keyof Prices) => <input className="pricein" value={String(prices[k] ?? '')} onChange={x => setPrices(p => ({ ...p, [k]: Number(x.target.value) || 0 }))} />;
  const R = (obj: 'sheets' | 'edge' | 'hardware' | 'paintPerM2', key: string) => <input className="pricein" value={(prices as any)[obj][key] ?? ''} placeholder="—" onChange={x => setPrices(p => ({ ...p, [obj]: { ...(p as any)[obj], [key]: x.target.value === '' ? undefined : Number(x.target.value) } }))} />;
  return <>
    {prices.demo && <div className="note">Демонстрационные ставки — не рыночные цены. Впишите свои цены: смета пересчитается сразу.</div>}
    <div className="chips" style={{ margin: '10px 0' }}>
      <button className="chip" aria-pressed={prices.method === 'sheets'} onClick={() => setPrices(p => ({ ...p, method: 'sheets' }))}>Материал по листам</button>
      <button className="chip" aria-pressed={prices.method === 'area'} onClick={() => setPrices(p => ({ ...p, method: 'area' }))}>По площади + % отходов</button>
      {prices.method === 'area' && <label className="small">Отходы, % {P('wastePct')}</label>}
      <button className="btn sm ghost" onClick={reset}>Сбросить к демо-ставкам</button>
    </div>
    <p className="small">{e.method}</p>
    <table className="t"><thead><tr><th>Раздел</th><th>Позиция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>
      {e.lines.map((l, i) => <tr key={i}><td>{l.group}</td><td>{l.name}{l.note && <div className="small muted">{l.note}</div>}</td><td className="n">{l.qty} {l.unit}</td><td className="n">{l.price == null ? <span style={{ color: 'var(--err)' }}>не задана</span> : l.price.toLocaleString('ru-RU')}</td><td className="n">{l.sum == null ? '—' : l.sum.toLocaleString('ru-RU')}</td></tr>)}
      <tr><td colSpan={4}><b>Итого{e.incomplete.length ? ' (без непосчитанного)' : ''}</b></td><td className="n"><b data-testid="total">{fmtMoney(e.total, cur)}</b></td></tr></tbody></table>
    {e.incomplete.length > 0 && <div className="ck warn" style={{ marginTop: 10 }}><b>Не посчитано</b>{e.incomplete.join('; ')}</div>}
    <h4>Ставки</h4>
    <div className="box small">
      <b>Листы, {cur}/лист</b><div className="chips">{e.cut.map(g => <label key={g.key}>{g.title.split(',')[0]} {R('sheets', `${g.material}|${g.thickness}`)}</label>)}</div>
      <b>Кромка, {cur}/м</b><div className="chips"><label>ПВХ тонкая {R('edge', 'thin')}</label><label>ПВХ толстая {R('edge', 'thick')}</label><label>Шпон {R('edge', 'veneer')}</label></div>
      <b>Отделка, {cur}/м²</b><div className="chips">{Object.keys(PAINT_NAMES).map(k => <label key={k}>{PAINT_NAMES[k]} {R('paintPerM2', k)}</label>)}</div>
      <b>Работы</b><div className="chips"><label>Распил, /м {P('cutPerM')}</label><label>Кромление, /м {P('edgeWorkPerM')}</label><label>Отверстие {P('drillPerHole')}</label><label>Фрезеровка, /м {P('millPerM')}</label>
        <label>Сборка, база {P('assembly')}</label><label>Сборка, за деталь {P('assemblyPerPart')}</label><label>Доставка {P('delivery')}</label><label>Металл, /м {P('metalPerM')}</label><label>Сварка и окраска каркаса {P('metalWork')}</label></div>
      <b>Дополнительно</b><div className="chips"><label>Сумма {P('extra')}</label><label>Что входит <input className="pricein" style={{ width: 200 }} value={prices.extraNote} onChange={x => setPrices(p => ({ ...p, extraNote: x.target.value }))} /></label></div>
      <b>Фурнитура, {cur}/ед.</b><div className="chips">{Object.keys(HW).filter(k => project && true).map(k => <label key={k}>{HW[k].name} {R('hardware', k)}</label>)}<label>Штанга, /м {R('hardware', 'rod-m')}</label></div>
    </div>
    <button className="btn sec" style={{ marginTop: 10 }} onClick={async () => { const ok = await saveFile(`${safeName(project.name)}-смета.csv`, csvBlob(estimateCsv(e, cur))); if (ok) toast('Смета сохранена'); }}>CSV сметы</button>
  </>;
}
