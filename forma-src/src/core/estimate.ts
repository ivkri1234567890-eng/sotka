/**
 * Смета. Все ставки редактирует пользователь. Встроенные значения — ДЕМОНСТРАЦИОННЫЕ, не рыночные цены.
 * Материал считается либо по фактически занятым листам (без дополнительного процента отходов),
 * либо по площади деталей с процентом отходов — выбирается пользователем.
 */
import type { ManufacturingModel, Prices, Part, ProductConfig } from './schema';
import { cutModel, type CutGroup } from './cutting';
import { MATERIALS } from './materials';
import { HW } from './hardware';

export function demoPrices(): Prices {
  return {
    currency: '₽',
    sheets: { 'ldsp|16': 5200, 'ldsp|18': 5600, 'ldsp|22': 7200, 'ldsp|25': 8200, 'mdf-enamel|16': 6400, 'mdf-enamel|19': 7300, 'mdf-enamel|22': 8600,
      'mdf-veneer|16': 16500, 'mdf-veneer|19': 18500, 'plywood|12': 3600, 'plywood|15': 4300, 'plywood|18': 5000, 'plywood|21': 5900,
      'solid|18': 3900, 'solid|20': 4300, 'solid|28': 5900, 'solid|40': 7900, 'hdf|3': 900, 'hdf|4': 1100, 'plywood-thin|4': 1500, 'plywood-thin|6': 1900 },
    edge: { thin: 18, thick: 38, veneer: 85 },
    hardware: { confirmat: 4, 'confirmat-cap': 2, 'shelf-pin': 6, 'hinge-blum': 520, 'hinge-plate': 140, slide: 650, 'push-open': 450, 'screw-4x16': 1, 'screw-4x25': 1.5, 'screw-4x30': 1.5,
      'back-nail': 0.5, 'handle-screw': 3, knob: 280, bar: 420, 'edge-profile': 900, 'leg-wood': 450, 'leg-metal': 520, 'plinth-foot': 90, 'rod-holder': 70, 'wall-hanger': 900, 'frame-bolt': 3, 'frame-glide': 25, 'rod-m': 350 },
    cutPerM: 35, drillPerHole: 12, edgeWorkPerM: 25, millPerM: 180,
    paintPerM2: { 'enamel-matte': 3200, 'enamel-satin': 3500, 'enamel-gloss': 5200, lacquer: 1900, 'rod': 0 },
    metalPerM: 260, metalWork: 3500,
    assembly: 1500, assemblyPerPart: 60, delivery: 1500, extra: 0, extraNote: '',
    wastePct: 20, method: 'sheets', kerf: 4, trim: 10, sheetFormats: {}, demo: true,
  };
}

export type Line = { group: string; name: string; qty: number; unit: string; price: number | null; sum: number | null; note?: string };
export type Estimate = { lines: Line[]; total: number; incomplete: string[]; cut: CutGroup[]; method: string };

const edgeLen = (p: Part) => (['L1', 'L2', 'W1', 'W2'] as const).map(k => ({ k, kind: p.edges[k].kind, len: k.startsWith('L') ? p.L : p.W }));
export function paintMethod(p: Part): string | null {
  if (!p.finish) return null;
  const m = (MATERIALS as any)[p.material];
  if (p.finish.kind === 'ral' && m?.paint) return 'enamel-' + p.finish.sheen;
  if (p.finish.kind === 'wood' || p.finish.kind === 'natural') return 'lacquer';
  return null;
}
export const PAINT_NAMES: Record<string, string> = { 'enamel-matte': 'Эмаль матовая', 'enamel-satin': 'Эмаль сатиновая', 'enamel-gloss': 'Эмаль глянцевая', lacquer: 'Лак / масло' };

export function estimate(m: ManufacturingModel, c: ProductConfig, pr: Prices): Estimate {
  const lines: Line[] = [], inc: string[] = [];
  const add = (group: string, name: string, qty: number, unit: string, price: number | null | undefined, note?: string) => {
    const p = price == null || isNaN(price) ? null : price;
    if (p == null) inc.push(`${group}: ${name} — цена не задана`);
    lines.push({ group, name, qty: Math.round(qty * 100) / 100, unit, price: p, sum: p == null ? null : Math.round(qty * p), note });
  };
  const cut = cutModel(m, { kerf: pr.kerf, trim: pr.trim, sheets: pr.sheetFormats });
  // материалы
  for (const g of cut) {
    const key = `${g.material}|${g.thickness}`, price = pr.sheets[key];
    const sheetM2 = g.sheet.L * g.sheet.W / 1e6, partM2 = g.partArea / 1e6;
    if (g.unplaced.length) inc.push(`${g.title}: ${g.unplaced.length} дет. не помещаются на лист ${g.sheet.L}×${g.sheet.W}`);
    if (pr.method === 'sheets') add('Материалы', g.title, g.sheets.length, 'лист', price, `деталей ${partM2.toFixed(2)} м² из ${(g.sheets.length * sheetM2).toFixed(2)} м²; остатки ${(g.sheets.length * sheetM2 - partM2).toFixed(2)} м²`);
    else add('Материалы', g.title, partM2 * (1 + pr.wastePct / 100), 'м²', price == null ? null : price / sheetM2, `площадь деталей ${partM2.toFixed(2)} м² + отходы ${pr.wastePct}%`);
  }
  // кромка
  const eByKind = new Map<string, number>(); let edgeTotal = 0;
  for (const p of m.parts) for (const e of edgeLen(p)) if (['thin', 'thick', 'veneer'].includes(e.kind)) { eByKind.set(e.kind, (eByKind.get(e.kind) || 0) + e.len / 1000); edgeTotal += e.len / 1000; }
  const EN: Record<string, string> = { thin: `Кромка ПВХ ${c.production.edgeThin} мм`, thick: `Кромка ПВХ ${c.production.edgeThick} мм`, veneer: 'Кромка шпон 0,6 мм' };
  for (const [k, v] of eByKind) add('Кромка', EN[k], v * 1.1, 'м', pr.edge[k], '+10% на торцовку концов');
  // фурнитура
  for (const h of m.hardware) { const hp = HW[h.id]; add('Фурнитура и крепёж', hp ? hp.name : h.id, h.qty, hp?.unit || 'шт', pr.hardware[h.id], hp && hp.status !== 'verified' && hp.status !== 'partial' ? 'модель не выбрана — цена ориентировочная' : undefined); }
  // работы
  const cutLen = m.parts.filter(p => p.sheet).reduce((s, p) => s + 2 * (p.blankL + p.blankW) / 1000, 0);
  add('Работы', 'Распил', cutLen, 'м', pr.cutPerM, 'по периметру заготовок');
  if (edgeTotal) add('Работы', 'Кромление', edgeTotal, 'м', pr.edgeWorkPerM);
  const holes = m.parts.reduce((s, p) => s + p.holes.length, 0);
  add('Работы', 'Присадка (сверление)', holes, 'отв.', pr.drillPerHole, 'только сформированные отверстия');
  const unv = m.joints.filter(j => j.status === 'unverified').length;
  if (unv) inc.push(`Присадка: ${unv} соединений без проверенного профиля — отверстия не посчитаны`);
  let millM = 0;
  for (const p of m.parts) for (const o of p.ops) {
    if (o.type === 'groove') millM += (o.params.to - o.params.from) / 1000;
    if (o.type === 'mill-frame') millM += 2 * (p.L + p.W - 4 * o.params.inset) / 1000;
    if (o.type === 'radius') millM += (Math.PI / 2 * o.params.r * o.params.corners) / 1000 + 0.2;
  }
  if (millM) add('Работы', 'Фрезеровка (пазы, рамки, радиусы)', millM, 'м', pr.millPerM);
  // окраска / отделка
  const paint = new Map<string, number>();
  for (const p of m.parts) { const pm = paintMethod(p); if (!pm) continue; const a = (2 * p.L * p.W + 2 * (p.L + p.W) * p.thickness) / 1e6; paint.set(pm, (paint.get(pm) || 0) + a); }
  for (const [k, a] of paint) add('Отделка', PAINT_NAMES[k] || k, a, 'м²', pr.paintPerM2[k], 'обе пласти и торцы');
  // металл
  const tubeM = m.parts.filter(p => p.geom === 'tube').reduce((s, p) => s + p.L / 1000, 0);
  if (tubeM) { add('Металлокаркас', 'Труба 20×20×1,5', tubeM * 1.05, 'м', pr.metalPerM, '+5% на рез'); add('Металлокаркас', 'Сварка и порошковая окраска каркаса', 1, 'компл', pr.metalWork); }
  const rodM = m.parts.filter(p => p.geom === 'rod').reduce((s, p) => s + p.L / 1000, 0);
  if (rodM) add('Фурнитура и крепёж', 'Штанга Ø25', rodM, 'м', pr.hardware['rod-m']);
  // сборка, доставка
  add('Сборка и доставка', 'Сборка', 1, 'компл', pr.assembly + pr.assemblyPerPart * m.parts.length, `${pr.assembly} + ${pr.assemblyPerPart} × ${m.parts.length} дет.`);
  add('Сборка и доставка', 'Доставка', 1, 'рейс', pr.delivery);
  if (pr.extra) add('Дополнительно', pr.extraNote || 'Дополнительные работы', 1, 'компл', pr.extra);
  if (c.base.type === 'wall') inc.push('Монтаж на стену и анкерный крепёж — по месту, не посчитаны');
  const total = lines.reduce((s, l) => s + (l.sum || 0), 0);
  return { lines, total, incomplete: inc, cut, method: pr.method === 'sheets' ? 'Материал — по числу фактически занятых листов (отходы уже внутри листов, процент не добавляется).' : `Материал — по площади деталей + ${pr.wastePct}% отходов.` };
}
