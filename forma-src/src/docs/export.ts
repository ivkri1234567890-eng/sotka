/** Таблицы, CSV, DXF, PDF и ZIP — всё из одной ManufacturingModel. */
import type { ManufacturingModel, Part, Project } from '../core/schema';
import { HW } from '../core/hardware';
import type { Estimate } from '../core/estimate';
import { finishName } from '../core/materials';

export const EDGE_RU: Record<string, string> = { none: '—', thin: 'ПВХ тонкая', thick: 'ПВХ толстая', veneer: 'шпон', paint: 'окраска' };
export const STATUS_RU: Record<string, string> = { verified: 'проверено по документу', partial: 'частично проверено', unverified: 'требует проверки', rule: 'правило программы' };

export function partsRows(m: ManufacturingModel) {
  return m.parts.filter(p => p.sheet).map(p => ({
    id: p.id, name: p.name, material: p.materialName, t: p.thickness, finish: p.finish ? finishName(p.finish) : '—',
    L: p.L, W: p.W, bL: p.blankL, bW: p.blankW, grain: p.grain === 'none' ? 'нет' : 'вдоль ' + p.grain,
    L1: EDGE_RU[p.edges.L1.kind], L2: EDGE_RU[p.edges.L2.kind], W1: EDGE_RU[p.edges.W1.kind], W2: EDGE_RU[p.edges.W2.kind],
    holes: p.holes.length, ops: p.ops.map(o => o.note).join('; '),
  }));
}
export function otherRows(m: ManufacturingModel) { return m.parts.filter(p => !p.sheet).map(p => ({ id: p.id, name: p.name, material: p.materialName, len: p.L })); }
export function hardwareRows(m: ManufacturingModel) {
  return m.hardware.map(h => { const p = HW[h.id]; return { id: h.id, name: p?.name || h.id, article: p ? `${p.maker} ${p.article}` : '', qty: h.qty, unit: p?.unit || 'шт', joints: h.joints.length, status: p ? STATUS_RU[p.status] : '', missing: p?.missing.join('; ') || '' }; });
}
const csvCell = (v: any) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function toCsv(rows: Record<string, any>[], head: Record<string, string>): string {
  const keys = Object.keys(head); return '﻿' + [keys.map(k => csvCell(head[k])).join(';'), ...rows.map(r => keys.map(k => csvCell(r[k])).join(';'))].join('\r\n');
}
export const PART_HEAD = { id: 'ID', name: 'Деталь', material: 'Материал', t: 'Толщина', finish: 'Отделка', L: 'Длина готовая', W: 'Ширина готовая', bL: 'Длина заготовки', bW: 'Ширина заготовки', grain: 'Текстура', L1: 'Кромка L1', L2: 'Кромка L2', W1: 'Кромка W1', W2: 'Кромка W2', holes: 'Отверстий', ops: 'Обработка' };
export const HW_HEAD = { name: 'Фурнитура/крепёж', article: 'Производитель, артикул', qty: 'Кол-во', unit: 'Ед.', joints: 'Соединений', status: 'Статус профиля', missing: 'Не хватает данных' };
export function holesCsv(m: ManufacturingModel) {
  const rows = m.parts.flatMap(p => p.holes.map(h => ({ part: p.id, name: p.name, face: h.face, u: h.u, v: h.v, d: h.d, depth: h.through ? 'насквозь' : h.depth, kind: h.kind, joint: h.joint, status: STATUS_RU[h.status] })));
  return toCsv(rows, { part: 'Деталь', name: 'Название', face: 'Грань', u: 'u, мм', v: 'v, мм', d: 'Ø', depth: 'Глубина', kind: 'Назначение', joint: 'Соединение', status: 'Источник' });
}
export function estimateCsv(e: Estimate, cur: string) {
  return toCsv([...e.lines.map(l => ({ ...l, price: l.price ?? 'не задана', sum: l.sum ?? 'не посчитано' })), { group: 'ИТОГО', name: '', qty: '', unit: '', price: '', sum: Math.round(e.total) }],
    { group: 'Раздел', name: 'Позиция', qty: 'Кол-во', unit: 'Ед.', price: `Цена, ${cur}`, sum: `Сумма, ${cur}`, note: 'Примечание' });
}

/** DXF R12: контур детали, отверстия (CIRCLE по слоям), пазы и фрезеровки. Только деталей из листа. */
export function partDxf(p: Part): string {
  const out: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const ln = (x1: number, y1: number, x2: number, y2: number, layer: string) => out.push('0', 'LINE', '8', layer, '10', String(x1), '20', String(y1), '30', '0', '11', String(x2), '21', String(y2), '31', '0');
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, layer: string) => out.push('0', 'ARC', '8', layer, '10', String(cx), '20', String(cy), '30', '0', '40', String(r), '50', String(a0), '51', String(a1));
  const rad = p.ops.find(o => o.type === 'radius');
  if (rad) { // скругление двух передних углов: детали столешницы — передняя кромка L2
    const r = rad.params.r, L = p.L, W = p.W;
    ln(0, 0, L, 0, 'CONTOUR'); ln(L, 0, L, W - r, 'CONTOUR'); arc(L - r, W - r, r, 0, 90, 'CONTOUR'); ln(L - r, W, r, W, 'CONTOUR'); arc(r, W - r, r, 90, 180, 'CONTOUR'); ln(0, W - r, 0, 0, 'CONTOUR');
  } else { ln(0, 0, p.L, 0, 'CONTOUR'); ln(p.L, 0, p.L, p.W, 'CONTOUR'); ln(p.L, p.W, 0, p.W, 'CONTOUR'); ln(0, p.W, 0, 0, 'CONTOUR'); }
  for (const h of p.holes.filter(h => h.face === 'A' || h.face === 'B')) out.push('0', 'CIRCLE', '8', `DRILL_${h.face}_D${h.d}_${h.through ? 'THRU' : 'Z' + h.depth}`, '10', String(h.u), '20', String(h.v), '30', '0', '40', String(h.d / 2));
  for (const o of p.ops) {
    if (o.type === 'groove') { const y0 = o.params.offset, y1 = y0 + o.params.width, L = `GROOVE_${o.face}_Z${o.params.depth}`; ln(o.params.from, y0, o.params.to, y0, L); ln(o.params.from, y1, o.params.to, y1, L); }
    if (o.type === 'mill-frame') { const i = o.params.inset, L = `MILL_${o.face}_W${o.params.width}_Z${o.params.depth}`; ln(i, i, p.L - i, i, L); ln(p.L - i, i, p.L - i, p.W - i, L); ln(p.L - i, p.W - i, i, p.W - i, L); ln(i, p.W - i, i, i, L); }
  }
  // торцевые отверстия — отдельным слоем как отметки на контуре (координата вдоль кромки)
  for (const h of p.holes.filter(h => h.face !== 'A' && h.face !== 'B')) {
    const pos = h.face === 'L1' ? [h.u, 0] : h.face === 'L2' ? [h.u, p.W] : h.face === 'W1' ? [0, h.u] : [p.L, h.u];
    out.push('0', 'POINT', '8', `EDGE_${h.face}_D${h.d}_Z${h.depth}`, '10', String(pos[0]), '20', String(pos[1]), '30', '0');
  }
  out.push('0', 'ENDSEC', '0', 'EOF'); return out.join('\r\n');
}

export function docStatus(m: ManufacturingModel) {
  const errors = m.checks.filter(c => c.level === 'error').length;
  return errors ? 'ЕСТЬ ОШИБКИ КОНСТРУКЦИИ — НЕ ДЛЯ ИЗГОТОВЛЕНИЯ' : 'ЭСКИЗ · ТРЕБУЕТ ПРОВЕРКИ ТЕХНОЛОГОМ';
}
