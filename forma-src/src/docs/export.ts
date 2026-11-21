/** Таблицы, CSV, DXF, PDF и ZIP — всё из одной ManufacturingModel. */
import type { ManufacturingModel, Part, Project } from '../core/schema';
import { HW } from '../core/hardware';
import type { Estimate } from '../core/estimate';
import { finishName } from '../core/materials';
import { readiness } from '../core/readiness';
import type { CutGroup } from '../core/cutting';
/** Размер в документах: до десятых мм, десятичная запятая (CSV открывается в Excel с русской локалью). */
export const n1 = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

export const EDGE_RU: Record<string, string> = { none: '—', thin: 'ПВХ тонкая', thick: 'ПВХ толстая', veneer: 'шпон', paint: 'окраска' };
export const STATUS_RU: Record<string, string> = { verified: 'проверено по документу', partial: 'частично проверено', unverified: 'требует проверки', rule: 'правило программы' };

export function partsRows(m: ManufacturingModel) {
  return m.parts.filter(p => p.sheet).map(p => ({
    id: p.id, name: p.name, material: p.materialName, t: n1(p.thickness), finish: p.finish ? finishName(p.finish) : '—',
    L: n1(p.L), W: n1(p.W), bL: n1(p.blankL), bW: n1(p.blankW), grain: p.grain === 'none' ? 'нет' : 'вдоль ' + p.grain,
    L1: edgeTxt(p.edges.L1), L2: edgeTxt(p.edges.L2), W1: edgeTxt(p.edges.W1), W2: edgeTxt(p.edges.W2),
    holes: p.holes.length, ops: p.ops.map(o => o.note).join('; '),
  }));
}
const edgeTxt = (e: { kind: string; t: number }) => EDGE_RU[e.kind] + (e.t ? ' ' + n1(e.t) : '');
export function otherRows(m: ManufacturingModel) { return m.parts.filter(p => !p.sheet).map(p => ({ id: p.id, name: p.name, material: p.materialName, len: p.L })); }
export function hardwareRows(m: ManufacturingModel) {
  return m.hardware.map(h => { const p = HW[h.id]; return { id: h.id, name: p?.name || h.id, article: p ? `${p.maker} ${p.article}` : '', qty: h.qty, unit: p?.unit || 'шт', joints: h.joints.length, status: p ? STATUS_RU[p.status] : '', missing: p?.missing.join('; ') || '' }; });
}
const csvCell = (v: any) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function toCsv(rows: Record<string, any>[], head: Record<string, string>): string {
  const keys = Object.keys(head); return '﻿' + [keys.map(k => csvCell(head[k])).join(';'), ...rows.map(r => keys.map(k => csvCell(r[k])).join(';'))].join('\r\n');
}
export const PART_HEAD = { id: 'ID', name: 'Деталь', material: 'Материал', t: 'Толщина, мм', finish: 'Отделка', L: 'Длина L готовая, мм', W: 'Ширина W готовая, мм', bL: 'Длина L заготовки, мм', bW: 'Ширина W заготовки, мм', grain: 'Текстура', L1: 'Кромка L1', L2: 'Кромка L2', W1: 'Кромка W1', W2: 'Кромка W2', holes: 'Отверстий', ops: 'Обработка' };
export const HW_HEAD = { name: 'Фурнитура/крепёж', article: 'Производитель, артикул', qty: 'Кол-во', unit: 'Ед.', joints: 'Соединений', status: 'Статус профиля', missing: 'Не хватает данных' };
export function holesCsv(m: ManufacturingModel) {
  const rows = m.parts.flatMap(p => p.holes.map(h => { const edge = h.face !== 'A' && h.face !== 'B';
    return { part: p.id, name: p.name, size: `${n1(p.L)}×${n1(p.W)}×${n1(p.thickness)}`, face: h.face, base: edge ? `торец ${h.face}: u вдоль кромки от ${h.face.startsWith('L') ? 'W1' : 'L1'}, v по толщине от пласти A` : `пласть ${h.face}: u от W1, v от L1 (вид со стороны A)`,
      u: n1(h.u), v: n1(h.v), d: n1(h.d), depth: h.through ? 'насквозь' : n1(h.depth), kind: h.kind, joint: h.joint, status: STATUS_RU[h.status] }; }));
  return toCsv(rows, { part: 'Деталь', name: 'Название', size: 'Готовая L×W×T, мм', face: 'Грань', base: 'База координат', u: 'u, мм', v: 'v, мм', d: 'Ø, мм', depth: 'Глубина, мм', kind: 'Назначение', joint: 'Соединение', status: 'Источник' });
}
export function estimateCsv(e: Estimate, cur: string) {
  return toCsv([...e.lines.map(l => ({ ...l, price: l.price ?? 'не задана', sum: l.sum ?? 'не посчитано' })), { group: 'ИТОГО', name: '', qty: '', unit: '', price: '', sum: Math.round(e.total) }],
    { group: 'Раздел', name: 'Позиция', qty: 'Кол-во', unit: 'Ед.', price: `Цена, ${cur}`, sum: `Сумма, ${cur}`, note: 'Примечание' });
}

const D = (v: number) => String(Math.round(v * 10) / 10);
function dxfDoc() {
  const out: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  return {
    out,
    ln: (x1: number, y1: number, x2: number, y2: number, layer: string) => out.push('0', 'LINE', '8', layer, '10', D(x1), '20', D(y1), '30', '0', '11', D(x2), '21', D(y2), '31', '0'),
    arc: (cx: number, cy: number, r: number, a0: number, a1: number, layer: string) => out.push('0', 'ARC', '8', layer, '10', D(cx), '20', D(cy), '30', '0', '40', D(r), '50', String(a0), '51', String(a1)),
    text: (x: number, y: number, h: number, s: string, layer: string) => out.push('0', 'TEXT', '8', layer, '10', D(x), '20', D(y), '30', '0', '40', D(h), '1', s),
    rect: function (x: number, y: number, w: number, h: number, layer: string) { this.ln(x, y, x + w, y, layer); this.ln(x + w, y, x + w, y + h, layer); this.ln(x + w, y + h, x, y + h, layer); this.ln(x, y + h, x, y, layer); },
    end: () => { out.push('0', 'ENDSEC', '0', 'EOF'); return out.join('\r\n'); },
  };
}

/**
 * DXF обработки (R12): одна деталь в готовом размере (после кромления).
 * Начало координат — угол W1×L1, X вдоль L, Y вдоль W, вид со стороны пласти A — как в CSV присадки и PDF.
 * Отверстия пласти: CIRCLE на слоях DRILL_<грань>_D<Ø>_<THRU|Z глубина>.
 * Торцевые отверстия: POINT на контуре + TEXT; слой EDGE_<торец>_D<Ø>_Z<глубина>_T<от пласти A>.
 */
export function partDxf(p: Part): string {
  const x = dxfDoc();
  const rad = p.ops.find(o => o.type === 'radius');
  if (rad) { // скругление двух углов у кромки L2 (столешница — передний край, щит зеркала — верх)
    const r = rad.params.r, L = p.L, W = p.W;
    x.ln(0, 0, L, 0, 'CONTOUR'); x.ln(L, 0, L, W - r, 'CONTOUR'); x.arc(L - r, W - r, r, 0, 90, 'CONTOUR'); x.ln(L - r, W, r, W, 'CONTOUR'); x.arc(r, W - r, r, 90, 180, 'CONTOUR'); x.ln(0, W - r, 0, 0, 'CONTOUR');
  } else x.rect(0, 0, p.L, p.W, 'CONTOUR');
  x.text(0, -12, 5, `${p.id} ${D(p.L)}x${D(p.W)}x${D(p.thickness)} finished; blank ${D(p.blankL)}x${D(p.blankW)}; origin W1xL1; view face A`, 'INFO');
  for (const h of p.holes.filter(h => h.face === 'A' || h.face === 'B')) x.out.push('0', 'CIRCLE', '8', `DRILL_${h.face}_D${D(h.d)}_${h.through ? 'THRU' : 'Z' + D(h.depth)}`, '10', D(h.u), '20', D(h.v), '30', '0', '40', D(h.d / 2));
  for (const o of p.ops) {
    if (o.type === 'groove') { const y0 = o.params.offset, y1 = y0 + o.params.width, L = `GROOVE_${o.face}_Z${D(o.params.depth)}`; x.ln(o.params.from, y0, o.params.to, y0, L); x.ln(o.params.from, y1, o.params.to, y1, L); }
    if (o.type === 'mill-frame') { const i = o.params.inset; x.rect(i, i, p.L - 2 * i, p.W - 2 * i, `MILL_${o.face}_W${D(o.params.width)}_Z${D(o.params.depth)}`); }
  }
  for (const h of p.holes.filter(h => h.face !== 'A' && h.face !== 'B')) {
    const pos = h.face === 'L1' ? [h.u, 0] : h.face === 'L2' ? [h.u, p.W] : h.face === 'W1' ? [0, h.u] : [p.L, h.u];
    const layer = `EDGE_${h.face}_D${D(h.d)}_Z${D(h.depth)}_T${D(h.v)}`;
    x.out.push('0', 'POINT', '8', layer, '10', D(pos[0]), '20', D(pos[1]), '30', '0');
    x.text(pos[0] + 2, pos[1] + 2, 3, `${h.face} D${D(h.d)} Z${D(h.depth)} T${D(h.v)}`, layer);
  }
  return x.end();
}

/** DXF раскроя (R12): лист, зона обрезки, заготовки с ID и размерами до десятых. Начало — левый нижний угол листа, X вдоль длины листа. */
export function cutDxf(g: CutGroup, i: number): string {
  const x = dxfDoc(), sh = g.sheets[i];
  x.rect(0, 0, g.sheet.L, g.sheet.W, 'SHEET');
  x.text(0, g.sheet.W + 10, 20, `${g.material} ${D(g.thickness)} mm, sheet ${i + 1}/${g.sheets.length}, ${g.sheet.L}x${g.sheet.W}${g.grain ? ', grain along X' : ''}`, 'INFO');
  for (const q of sh.placements) {
    const y = g.sheet.W - q.y - q.h; // в SVG ось Y вниз, в DXF — вверх
    x.rect(q.x, y, q.w, q.h, 'PART');
    const hgt = Math.max(6, Math.min(24, q.h / 5, q.w / 12));
    x.text(q.x + 6, y + q.h / 2 + 2, hgt, q.id, 'PART_ID');
    x.text(q.x + 6, y + q.h / 2 - hgt - 2, hgt * 0.8, `${D(q.w)}x${D(q.h)}${q.rot ? ' R' : ''}`, 'PART_SIZE');
  }
  return x.end();
}

export function docStatus(m: ManufacturingModel, approval?: Project['approval']) { return readiness(m, approval).label; }
