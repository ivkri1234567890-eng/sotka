import React, { useMemo, useState } from 'react';
import type { Project, Prices, ManufacturingModel } from '../core/schema';
import { modelFor } from '../core/engine';
import { estimate, demoPrices, PAINT_NAMES } from '../core/estimate';
import { readiness } from '../core/readiness';
import { HW } from '../core/hardware';
import { assemblySheet, interiorSheet, partSheet, cutSheetSvg, edgeIcon, projectionsSvg, mm } from '../docs/drawings';
import { partsRows, hardwareRows, docStatus, EDGE_RU, STATUS_RU, toCsv, PART_HEAD, HW_HEAD, estimateCsv, holesCsv } from '../docs/export';
import { buildPdf } from '../docs/pdf';
import { buildZip, projectJson, csvBlob, dxfZip, safeName } from '../docs/bundle';
import { saveFile, shareFile, isNative } from '../platform/files';
import { shot, webglAvailable } from './offscreen';
import { fmtMoney, toast } from './common';

const SECTIONS = [['ready', 'Готовность'], ['draw', 'Чертежи'], ['parts', 'Деталировка'], ['edges', 'Кромление'], ['hw', 'Фурнитура'], ['drill', 'Присадка'], ['cut', 'Раскрой'], ['est', 'Смета'], ['guide', 'Инструкция']] as const;
type Sec = typeof SECTIONS[number][0];
const lastSec: Record<string, Sec> = {};

/** 3D-снимок или, если WebGL недоступен, 2D-проекции. */
function Pic({ m, project, o, alt, sub }: { m: ManufacturingModel; project: Project; o: Parameters<typeof shot>[2]; alt: string; sub?: ManufacturingModel }) {
  const src = useMemo(() => shot(m, project.config, o), [m, JSON.stringify(o)]);
  if (src) return <img alt={alt} style={{ width: '100%', borderRadius: 12 }} src={src} />;
  return <div className="flat" role="img" aria-label={alt + ' (2D-проекции)'} dangerouslySetInnerHTML={{ __html: projectionsSvg(sub || m) }} />;
}
const TW = ({ children }: { children: React.ReactNode }) => <div className="tw">{children}</div>;

export function Docs({ project, onChange, onBack }: { project: Project; onChange: (p: Project) => void; onBack: () => void }) {
  const [sec, setSecS] = useState<Sec>(lastSec[project.id] || 'ready');
  const setSec = (k: Sec) => { lastSec[project.id] = k; setSecS(k); };
  const [busy, setBusy] = useState<string | null>(null);
  const [fmtErr, setFmtErr] = useState<Record<string, string>>({});
  const [drillI, setDrillI] = useState(0);
  const [who, setWho] = useState('');
  const m = useMemo(() => modelFor(project.config), [project.config]);
  const prices = project.prices || demoPrices();
  const e = useMemo(() => estimate(m, project.config, prices), [m, prices]);
  const rd = readiness(m, project.approval);
  const status = docStatus(m, project.approval), name = safeName(project.name);
  const unv = m.joints.filter(j => j.status === 'unverified').length;
  const badge: Record<Sec, [string, string]> = {
    ready: [rd.status === 'ready' ? 'ok' : rd.status === 'geometry-errors' ? 'no' : 'rv', rd.status === 'ready' ? 'готово' : rd.status === 'geometry-errors' ? `ошибок ${rd.geometryErrors.length}` : rd.status === 'needs-data' ? `блокирует ${rd.blockers}` : 'ждёт технолога'],
    draw: ['rv', 'эскиз'], parts: ['ok', 'рассчитано'], edges: ['ok', 'рассчитано'], hw: [unv ? 'rv' : 'ok', unv ? 'требует проверки' : 'проверено'],
    drill: ['rv', unv ? 'неполная' : 'требует проверки'], cut: ['ok', 'эвристика'], est: [e.incomplete.length || prices.demo ? 'rv' : 'ok', prices.demo ? 'демо-ставки' : e.incomplete.length ? 'неполная' : 'ваши ставки'],
    guide: ['rv', 'предварительная'],
  };
  /** Каждый формат — отдельно: ошибка одного не мешает остальным. */
  const run = async (label: string, f: () => Promise<void>) => {
    if (busy) return; setBusy(label); setFmtErr(x => { const y = { ...x }; delete y[label]; return y; });
    try { await f(); } catch (x: any) { const msg = String(x?.message || x); setFmtErr(y => ({ ...y, [label]: msg })); toast(`${label}: не удалось сформировать`); } finally { setBusy(null); }
  };
  const out = async (fname: string, blob: Blob, share = false) => {
    if (share) { const r = await shareFile(fname, blob, project.name); if (r === 'downloaded') toast('Файл сохранён'); return; }
    const ok = await saveFile(fname, blob); if (ok) toast(isNative() ? 'Файл сохранён в выбранную папку' : 'Файл скачан: ' + fname);
  };
  const setPrices = (f: (p: Prices) => Prices) => onChange({ ...project, prices: { ...f(prices), demo: false } });
  const bumpVersion = () => onChange({ ...project, docVersion: project.docVersion + 1 });
  const pdf = (share: boolean) => run('PDF', async () => out(`${name}.pdf`, await buildPdf(project, m, e, s => setBusy('PDF: ' + s)), share));
  const zip = (share: boolean) => run('ZIP', async () => { const r = await buildZip(project, m, e, s => setBusy('ZIP: ' + s)); if (r.errors.length) setFmtErr(y => ({ ...y, 'ZIP (частично)': 'В архив не вошло: ' + r.errors.join('; ') })); await out(`${name}.zip`, r.blob, share); });
  const drillParts = m.parts.filter(q => q.sheet && (q.holes.length || q.ops.length));
  const approve = () => { if (rd.blockers || !rd.geometryOk) return; if (!who.trim()) { toast('Укажите, кто подтверждает'); return; } onChange({ ...project, approval: { by: who.trim(), at: new Date().toISOString(), hash: m.configHash, note: '' } }); toast('Подтверждено технологом'); };
  const errs = Object.entries(fmtErr);
  return <>
    <div className="top"><button className="icon" aria-label="Назад в редактор" onClick={onBack}>←</button><h1>Документы: {project.name}</h1></div>
    <div className="wrap docs-page">
      <div className={'status-line st-' + rd.status} data-testid="doc-status"><b>{status}</b><span className="small">Геометрия: {rd.geometryOk ? 'ошибок нет' : `ошибок ${rd.geometryErrors.length}`} · к изготовлению: {rd.status === 'ready' ? 'готово' : rd.blockers ? `блокирующих замечаний ${rd.blockers}` : 'нужно подтверждение технолога'} · <button className="linkbtn" onClick={() => setSec('ready')}>подробнее</button></span></div>
      <div className="exp-main">
        <button className="btn" onClick={() => pdf(false)} disabled={!!busy} data-testid="pdf">Скачать PDF</button>
        <button className="btn warm" onClick={() => zip(false)} disabled={!!busy} data-testid="zip">Всё одним ZIP</button>
      </div>
      {busy && <div className="note" role="status" style={{ marginBottom: 8 }}>Готовлю {busy}…</div>}
      {errs.length > 0 && <div className="ck error" role="alert" style={{ marginBottom: 10 }}><b>Не сформировано</b>{errs.map(([k, v]) => <div key={k}>{k}: {v}</div>)}<i>Остальные форматы доступны. <button className="linkbtn" onClick={onBack}>Вернуться в редактор</button></i></div>}
      <details className="exp-more"><summary>Другие форматы и отправка</summary>
        <div className="exp">
          <button className="btn sec" onClick={() => run('CSV деталировки', async () => out(`${name}-деталировка.csv`, csvBlob(toCsv(partsRows(m), PART_HEAD))))} disabled={!!busy}>CSV деталировка</button>
          <button className="btn sec" onClick={() => run('CSV присадки', async () => out(`${name}-присадка.csv`, csvBlob(holesCsv(m))))} disabled={!!busy}>CSV присадка</button>
          <button className="btn sec" onClick={() => run('CSV фурнитуры', async () => out(`${name}-фурнитура.csv`, csvBlob(toCsv(hardwareRows(m), HW_HEAD))))} disabled={!!busy}>CSV фурнитура</button>
          <button className="btn sec" onClick={() => run('DXF', async () => out(`${name}-DXF.zip`, await dxfZip(m, e.cut).generateAsync({ type: 'blob' })))} disabled={!!busy} data-testid="dxf">DXF раскрой + обработка</button>
          <button className="btn sec" onClick={() => run('SVG', async () => out(`${name}-сборочный.svg`, new Blob([assemblySheet(m, project, status)], { type: 'image/svg+xml' })))} disabled={!!busy}>SVG чертёж</button>
          <button className="btn sec" onClick={() => run('JSON', async () => out(`${name}.forma.json`, projectJson(project)))} disabled={!!busy} data-testid="json">Файл проекта (JSON)</button>
          <button className="btn sec" onClick={() => pdf(true)} disabled={!!busy}>Поделиться PDF</button>
          <button className="btn sec" onClick={() => zip(true)} disabled={!!busy}>Поделиться ZIP</button>
          <button className="btn ghost" onClick={bumpVersion} title="Увеличить номер версии документов">Версия {project.docVersion} ＋</button>
        </div>
        <p className="hint">Проект сохраняется в этом браузере автоматически. «Файл проекта (JSON)» — копия для переноса на другое устройство; документы для мастерской — PDF, ZIP, CSV, DXF.</p>
      </details>
      {!webglAvailable() && <div className="note" style={{ margin: '8px 0' }}>3D недоступно в этом браузере (WebGL). Вместо 3D показаны проекции спереди, слева и сверху; все документы формируются.</div>}
      <div className="docs">
        <nav className="dnav" aria-label="Разделы документов">{SECTIONS.map(([k, n]) => <button key={k} aria-selected={sec === k} onClick={() => setSec(k)}><span>{n}</span><span className={'badge ' + badge[k][0]}>{badge[k][1]}</span></button>)}</nav>
        <div className="dview">
          <p className="small muted" style={{ marginTop: 0 }}>Версия {project.docVersion} · код конфигурации {m.configHash}</p>
          {sec === 'ready' && <Ready m={m} rd={rd} project={project} who={who} setWho={setWho} approve={approve} revoke={() => onChange({ ...project, approval: null })} />}
          {sec === 'draw' && <>
            <div className="svgw" dangerouslySetInnerHTML={{ __html: assemblySheet(m, project, status) }} />
            <div style={{ height: 12 }} /><div className="svgw" dangerouslySetInnerHTML={{ __html: interiorSheet(m, project, status) }} />
            <h3>Разнесённый вид</h3><Pic m={m} project={project} o={{ w: 1200, h: 760, exploded: true }} alt="Разнесённый вид" />
          </>}
          {sec === 'parts' && <>
            <p className="small">Готовая деталь — размер после кромления. Заготовка — размер распила. Размеры в мм, до десятых.</p>
            <TW><table className="t"><thead><tr><th>ID</th><th>Деталь</th><th>Материал</th><th>T</th><th>Готовая L×W</th><th>Заготовка</th><th>Кромки L1/L2/W1/W2</th><th>Текстура</th><th>Отделка</th></tr></thead>
              <tbody>{partsRows(m).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.material}</td><td className="n">{r.t}</td><td className="n">{r.L}×{r.W}</td><td className="n">{r.bL}×{r.bW}</td><td className="small">{r.L1} / {r.L2} / {r.W1} / {r.W2}</td><td>{r.grain}</td><td>{r.finish}</td></tr>)}</tbody></table></TW>
            {m.parts.some(q => !q.sheet) && <><h4>Покупные и металлические элементы</h4><TW><table className="t"><tbody>{m.parts.filter(q => !q.sheet).map(q => <tr key={q.id}><td>{q.id}</td><td>{q.name}</td><td>{q.materialName}</td><td className="n">{mm(q.L)} мм</td></tr>)}</tbody></table></TW></>}
          </>}
          {sec === 'edges' && <TW><table className="t"><thead><tr><th>ID</th><th>Схема</th><th>Деталь</th><th>L1 (зад/низ)</th><th>L2 (перед/верх)</th><th>W1</th><th>W2</th></tr></thead>
            <tbody>{m.parts.filter(q => q.sheet).map(q => <tr key={q.id}><td>{q.id}</td><td dangerouslySetInnerHTML={{ __html: edgeIcon(q) }} /><td>{q.name} {mm(q.L)}×{mm(q.W)}</td>{(['L1', 'L2', 'W1', 'W2'] as const).map(k => <td key={k}>{EDGE_RU[q.edges[k].kind]}{q.edges[k].t ? ` ${mm(q.edges[k].t)}` : ''}</td>)}</tr>)}</tbody></table></TW>}
          {sec === 'hw' && <>
            <TW><table className="t"><thead><tr><th>Наименование</th><th>Артикул</th><th>Кол-во</th><th>Соединений</th><th>Профиль</th></tr></thead>
              <tbody>{hardwareRows(m).map(r => <tr key={r.id}><td>{r.name}</td><td>{r.article}</td><td className="n">{r.qty} {r.unit}</td><td className="n">{r.joints}</td><td>{r.status}{r.missing && <div className="small muted">не хватает: {r.missing}</div>}</td></tr>)}</tbody></table></TW>
            <h4>Соединения и крепёж</h4>
            <TW><table className="t"><tbody>{m.joints.map(j => <tr key={j.id}><td>{j.id}</td><td>{j.title}{j.note && <div className="small muted">{j.note}</div>}</td><td>{j.parts.join(', ')}</td><td>{j.hardware.map(h => `${HW[h.id]?.name || h.id} × ${h.qty}`).join('; ') || '—'}</td><td>{STATUS_RU[j.status]}</td></tr>)}</tbody></table></TW>
          </>}
          {sec === 'drill' && <>
            <p className="small">Отверстия формируются только по известным данным фурнитуры. Соединения без проверенного профиля ({unv}) — без отверстий, перечень — в разделе «Готовность». Координаты: пласть — u от W1, v от L1 (вид со стороны A); торец — u вдоль кромки, v по толщине от пласти A. Так же в CSV и DXF.</p>
            <div className="chips" style={{ marginBottom: 10 }}>{drillParts.map((q, i) => <button key={q.id} className="chip" aria-pressed={drillI === i} onClick={() => setDrillI(i)}>{q.id}</button>)}</div>
            {drillParts[drillI] && <div className="svgw" dangerouslySetInnerHTML={{ __html: partSheet(drillParts[drillI], project, rd.geometryOk ? 'ПРИСАДКА — ТРЕБУЕТ ПРОВЕРКИ' : status, 'П' + (drillI + 1)) }} />}
          </>}
          {sec === 'cut' && <>
            <div className="row2" style={{ maxWidth: 420, marginBottom: 10 }}>
              <label className="fld small">Пропил, мм<input className="pricein" inputMode="decimal" defaultValue={prices.kerf} onBlur={x => setPrices(p => ({ ...p, kerf: Number(x.target.value.replace(',', '.')) || 0 }))} /></label>
              <label className="fld small">Обрезка края листа, мм<input className="pricein" inputMode="decimal" defaultValue={prices.trim} onBlur={x => setPrices(p => ({ ...p, trim: Number(x.target.value.replace(',', '.')) || 0 }))} /></label>
            </div>
            <p className="small">Раскрой эвристический (MaxRects) — не гарантированно оптимальный. Детали с текстурой не поворачиваются. На карте у каждой детали — ID и размер заготовки с десятыми.</p>
            {e.cut.map(g => <div key={g.key} className="box" style={{ marginBottom: 12 }}><h4>{g.title}</h4>
              <div className="small">Листов: {g.sheets.length} · детали {(g.partArea / 1e6).toFixed(2)} м² · листы {(g.sheetArea / 1e6).toFixed(2)} м² · остатки {((g.sheetArea - g.partArea) / 1e6).toFixed(2)} м²</div>
              {g.unplaced.length > 0 && <div className="ck error">Не помещаются на лист {g.sheet.L}×{g.sheet.W}: {g.unplaced.map(u => `${u.id} (${mm(u.blankL)}×${mm(u.blankW)})`).join(', ')}</div>}
              {g.sheets.map((_, i) => <div key={i} className="svgw" dangerouslySetInnerHTML={{ __html: cutSheetSvg(g, i, project, status, 'Р' + (i + 1)) }} />)}
            </div>)}
          </>}
          {sec === 'est' && <EstimateView project={project} prices={prices} setPrices={setPrices} e={e} reset={() => onChange({ ...project, prices: null })} />}
          {sec === 'guide' && <>
            <div className="note">Предварительная инструкция к эскизу. Это не проверенная инструкция изготовления.</div>
            <p className="small">Инструмент: {[...new Set(m.steps.flatMap(s => s.tools))].join(', ') || '—'}; рулетка, уровень.</p>
            {m.steps.map((s, i) => { const shown = new Set(s.show); return <div className="step" key={s.id}>
              <Pic m={m} project={project} o={{ w: 720, h: 520, show: s.show, hl: s.fresh.length ? s.fresh : s.parts }} alt={'Шаг ' + (i + 1)} sub={{ ...m, parts: m.parts.filter(q => shown.has(q.id)), protrusions: [] }} />
              <div><b>Шаг {i + 1}. {s.title}</b><ul>{s.text.map((t, j) => <li key={j}>{t}</li>)}</ul>
                <div className="small">Детали шага: {s.parts.join(', ')}</div>
                <div className="small">{s.hardware.map(h => `${HW[h.id]?.name || h.id} — ${h.qty} ${HW[h.id]?.unit || 'шт'}`).join('; ')}</div></div>
            </div>; })}
          </>}
        </div>
      </div>
    </div>
  </>;
}

function Ready({ m, rd, project, who, setWho, approve, revoke }: { m: ManufacturingModel; rd: ReturnType<typeof readiness>; project: Project; who: string; setWho: (s: string) => void; approve: () => void; revoke: () => void }) {
  const st = m.stability;
  return <>
    <h3 style={{ marginTop: 0 }}>1. Проверка геометрии</h3>
    {rd.geometryOk ? <div className="ck ok"><b>Норма</b>Размеры в диапазоне, недопустимых пересечений нет, ящики и двери не задевают детали, отверстия в пределах деталей.</div>
      : rd.geometryErrors.map((x, i) => <div key={i} className="ck error"><b>{x.area}{x.part ? ' · ' + x.part : ''}{x.joint ? ' · ' + x.joint : ''}</b>{x.msg}{x.fix && <i>{x.fix}</i>}</div>)}
    {m.checks.filter(x => x.level === 'warn').map((x, i) => <div key={'w' + i} className="ck warn" style={{ marginTop: 6 }}><b>{x.area}{x.part ? ' · ' + x.part : ''}</b>{x.msg}{x.fix && <i>{x.fix}</i>}</div>)}
    <h3>2. Готовность к изготовлению</h3>
    <p className="small">Эскиз можно выгружать всегда — со статусом в каждом документе. «Готово к изготовлению» — только когда нет блокирующих замечаний и технолог подтвердил именно эту конфигурацию (код {m.configHash}).</p>
    {st && <div className={'ck ' + (st.checked ? (st.ok ? 'ok' : 'error') : 'info')}><b>Устойчивость</b>{st.text}<i>Крепление от опрокидывания: {st.antiTipText}</i></div>}
    <TW><table className="t"><thead><tr><th>Замечание</th><th>Деталь</th><th>Соединение</th><th>Не хватает данных</th><th>Операции присадки</th></tr></thead><tbody>
      {rd.issues.map((x, i) => <tr key={i} className={x.level === 'block' ? 'row-block' : ''}><td><b className={'badge ' + (x.level === 'block' ? 'no' : 'rv')}>{x.level === 'block' ? 'блокирует' : 'проверить'}</b> {x.title}</td><td>{x.part || '—'}</td><td>{x.joint || '—'}</td><td>{x.missing.join('; ') || '—'}</td><td>{x.ops.join('; ') || '—'}</td></tr>)}
      {!rd.issues.length && <tr><td colSpan={5}>Замечаний нет.</td></tr>}
    </tbody></table></TW>
    <div className="box" style={{ marginTop: 12 }}><h4>Подтверждение технолога</h4>
      {project.approval && !rd.approvalStale && <div className="ck ok"><b>Подтверждено</b>{project.approval.by}, {new Date(project.approval.at).toLocaleString('ru-RU')}. <button className="linkbtn" onClick={revoke}>Отозвать</button></div>}
      {rd.approvalStale && <div className="ck warn"><b>Подтверждение устарело</b>Конфигурация изменилась после подтверждения ({project.approval!.by}). Нужна новая проверка.</div>}
      {(!project.approval || rd.approvalStale) && <>
        {(rd.blockers > 0 || !rd.geometryOk) && <p className="small">Подтверждение недоступно: устраните блокирующие замечания ({rd.blockers}).</p>}
        <div className="ralrow"><input aria-label="Кто подтверждает" placeholder="Фамилия технолога" value={who} onChange={e => setWho(e.target.value)} disabled={rd.blockers > 0 || !rd.geometryOk} />
          <button className="btn sm" onClick={approve} disabled={rd.blockers > 0 || !rd.geometryOk} data-testid="approve">Подтвердить</button></div>
      </>}
    </div>
  </>;
}

function EstimateView({ project, prices, setPrices, e, reset }: { project: Project; prices: Prices; setPrices: (f: (p: Prices) => Prices) => void; e: ReturnType<typeof estimate>; reset: () => void }) {
  const cur = prices.currency;
  const P = (k: keyof Prices) => <input className="pricein" value={String(prices[k] ?? '')} onChange={x => setPrices(p => ({ ...p, [k]: Number(x.target.value) || 0 }))} />;
  const R = (obj: 'sheets' | 'edge' | 'hardware' | 'paintPerM2', key: string) => <input className="pricein" inputMode="decimal" value={(prices as any)[obj][key] ?? ''} placeholder="—" onChange={x => setPrices(p => ({ ...p, [obj]: { ...(p as any)[obj], [key]: x.target.value === '' ? undefined : Number(x.target.value) } }))} />;
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
