/** Векторные чертежи (SVG, единицы листа — мм). Строятся из ManufacturingModel. */
import type { ManufacturingModel, Part, Project } from '../core/schema';
import { partBox } from '../core/engine';
import type { CutGroup } from '../core/cutting';
import { finishName, MATERIALS, BACKS } from '../core/materials';
import { groupKey } from '../core/cutting';

type Box = { min: number[]; max: number[] };
const F = (v: number) => (Math.round(v * 100) / 100).toString();
/** Размер для подписи: до десятых, десятичная запятая. */
export const mm = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = 'font-family="Roboto, Arial, sans-serif"';
export const txt = (x: number, y: number, s: string, o: { size?: number; anchor?: string; bold?: boolean; fill?: string; rot?: number } = {}) =>
  `<text x="${F(x)}" y="${F(y)}" ${FONT} font-size="${o.size || 3}" text-anchor="${o.anchor || 'middle'}"${o.bold ? ' font-weight="bold"' : ''} fill="${o.fill || '#111'}"${o.rot ? ` transform="rotate(${o.rot} ${F(x)} ${F(y)})"` : ''}>${esc(s)}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, w = 0.2, c = '#111', dash = '') => `<line x1="${F(x1)}" y1="${F(y1)}" x2="${F(x2)}" y2="${F(y2)}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
/** Размерная линия: точки a,b на объекте, off — вынос (знак задаёт сторону). */
export function dim(ax: number, ay: number, bx: number, by: number, off: number, label: string, size = 2.6) {
  const hz = Math.abs(ay - by) < 1e-6; let s = '';
  if (hz) { const y = ay + off; s += line(ax, ay, ax, y + Math.sign(off) * 1.5, 0.15) + line(bx, by, bx, y + Math.sign(off) * 1.5, 0.15) + line(ax, y, bx, y, 0.18);
    s += line(ax - 1, y + 1, ax + 1, y - 1, 0.3) + line(bx - 1, y + 1, bx + 1, y - 1, 0.3) + txt((ax + bx) / 2, y - 1, label, { size }); }
  else { const x = ax + off; s += line(ax, ay, x + Math.sign(off) * 1.5, ay, 0.15) + line(bx, by, x + Math.sign(off) * 1.5, by, 0.15) + line(x, ay, x, by, 0.18);
    s += line(x - 1, ay + 1, x + 1, ay - 1, 0.3) + line(x - 1, by + 1, x + 1, by - 1, 0.3) + txt(x - 1, (ay + by) / 2, label, { size, rot: -90 }); }
  return s;
}
export function frame(W: number, H: number, title: string, p: Project, status: string, sheet: string) {
  const tb = { w: 185, h: 32 }, x = W - 10 - tb.w, y = H - 10 - tb.h, date = new Date(p.updated).toLocaleDateString('ru-RU');
  return `<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#111" stroke-width="0.5"/>` +
    `<rect x="${x}" y="${y}" width="${tb.w}" height="${tb.h}" fill="#fff" stroke="#111" stroke-width="0.4"/>` + line(x, y + 11, x + tb.w, y + 11, 0.25) + line(x, y + 22, x + tb.w, y + 22, 0.25) + line(x + 120, y + 11, x + 120, y + tb.h, 0.25) +
    txt(x + 3, y + 7.5, title, { size: 4.2, anchor: 'start', bold: true }) +
    txt(x + 3, y + 18, `Проект: ${p.name}`, { size: 3, anchor: 'start' }) + txt(x + 123, y + 18, `Версия ${p.docVersion} · ${date}`, { size: 3, anchor: 'start' }) +
    txt(x + 3, y + 29, status, { size: 3, anchor: 'start', bold: true, fill: '#9a3412' }) + txt(x + 123, y + 29, `Лист ${sheet} · мм`, { size: 3, anchor: 'start' });
}
const fillOf = (p: Part) => p.group === 'fronts' ? '#f6efe4' : p.geom === 'tube' || p.geom === 'handle' || p.geom === 'profile' || p.geom === 'leg' ? '#d8d8d8' : p.role === 'back' ? '#efe9dd' : '#ffffff';

type View = 'front' | 'left' | 'top';
function project(b: Box, v: View): [number, number, number, number, number] { // [u0,v0,u1,v1,depthKey]
  if (v === 'front') return [b.min[0], b.min[1], b.max[0], b.max[1], b.max[2]];
  if (v === 'left') return [b.min[2], b.min[1], b.max[2], b.max[1], -b.min[0]];
  return [b.min[0], b.min[2], b.max[0], b.max[2], b.max[1]];
}
/** Проекция всех деталей (алгоритм художника: дальние рисуются первыми, белая заливка скрывает невидимое). */
export function viewSvg(m: ManufacturingModel, v: View, ox: number, oy: number, k: number, o: { skip?: (p: Part) => boolean; labels?: boolean } = {}) {
  const items = m.parts.filter(p => !(o.skip && o.skip(p))).map(p => ({ p, r: project(partBox(p), v) })).sort((a, b) => a.r[4] - b.r[4]);
  let s = ''; const vb = v === 'top' ? 1 : -1; // в плане глубина растёт вниз; во фронтальных видах Y вверх
  for (const { p, r } of items) {
    const x = ox + r[0] * k, w = (r[2] - r[0]) * k, y = vb > 0 ? oy + r[1] * k : oy - r[3] * k, h = (r[3] - r[1]) * k;
    const rad = p.ops.find(op => op.type === 'radius');
    const rr = rad ? radiusShape(p, v, rad.params.r * k) : null;
    if (rr) { s += `<path d="${roundRect(x, y, w, h, rr.r, rr.where)}" fill="${fillOf(p)}" stroke="#111" stroke-width="0.25"/>`; if (o.labels && w > 12 && h > 6 && p.sheet) s += txt(x + w / 2, y + h / 2 + 1, p.id, { size: Math.min(3, h * 0.45) }); continue; }
    if (p.geom === 'leg' || p.geom === 'rod') s += `<rect x="${F(x)}" y="${F(y)}" width="${F(w)}" height="${F(h)}" rx="${F(Math.min(w, h) / 2)}" fill="${fillOf(p)}" stroke="#111" stroke-width="0.18"/>`;
    else s += `<rect x="${F(x)}" y="${F(y)}" width="${F(w)}" height="${F(h)}" fill="${fillOf(p)}" stroke="#111" stroke-width="${p.group === 'fronts' ? 0.3 : 0.2}"/>`;
    if (v === 'front' && p.ops.some(op => op.type === 'mill-frame')) { const ins = (p.ops.find(op => op.type === 'mill-frame')!.params.inset) * k; if (w > 2 * ins && h > 2 * ins) s += `<rect x="${F(x + ins)}" y="${F(y + ins)}" width="${F(w - 2 * ins)}" height="${F(h - 2 * ins)}" fill="none" stroke="#666" stroke-width="0.15"/>`; }
    if (o.labels && w > 12 && h > 6 && p.sheet) s += txt(x + w / 2, y + h / 2 + 1, p.id, { size: Math.min(3, h * 0.45) });
  }
  return s;
}

/** Где на проекции лежат скруглённые углы (у кромки L2 детали). null — скругление в этом виде не видно. */
function radiusShape(p: Part, v: View, r: number): { r: number; where: 'top' | 'bottom' } | null {
  const plane = v === 'front' ? ['x', 'y'] : v === 'left' ? ['z', 'y'] : ['x', 'z'];
  if (!plane.includes(p.axes[0]) || !plane.includes(p.axes[1])) return null;
  const wAx = p.axes[1];
  if (v === 'top') return wAx === 'z' ? { r, where: 'bottom' } : null;   // в плане глубина растёт вниз; L2 — передний край
  return wAx === 'y' ? { r, where: 'top' } : null;                      // во фронтальных видах Y вверх; L2 — верх
}
function roundRect(x: number, y: number, w: number, h: number, r: number, where: 'top' | 'bottom') {
  r = Math.min(r, w / 2, h);
  if (where === 'bottom') return `M${F(x)} ${F(y)}H${F(x + w)}V${F(y + h - r)}A${F(r)} ${F(r)} 0 0 1 ${F(x + w - r)} ${F(y + h)}H${F(x + r)}A${F(r)} ${F(r)} 0 0 1 ${F(x)} ${F(y + h - r)}Z`;
  return `M${F(x)} ${F(y + h)}V${F(y + r)}A${F(r)} ${F(r)} 0 0 1 ${F(x + r)} ${F(y)}H${F(x + w - r)}A${F(r)} ${F(r)} 0 0 1 ${F(x + w)} ${F(y + r)}V${F(y + h)}Z`;
}
/** Отметки выступа фасада за скруглённую столешницу на виде сверху. */
function protrusionMarks(m: ManufacturingModel, ox: number, oy: number, k: number) {
  let s = '';
  for (const q of m.protrusions || []) { const x = ox + q.x * k, y = oy + q.z * k;
    s += `<circle cx="${F(x)}" cy="${F(y)}" r="2.2" fill="none" stroke="#b3261e" stroke-width="0.4"/>` + txt(x + (q.side === 'left' ? -3 : 3), y + 5, `выступ ${mm(q.value)}`, { size: 2.2, anchor: q.side === 'left' ? 'end' : 'start', fill: '#b3261e' }); }
  return s;
}
/** Три проекции (спереди, сбоку, сверху) в одном SVG — для экрана без WebGL и для PDF вместо 3D-изображения. */
export function projectionsSvg(m: ManufacturingModel, o2: { exploded?: boolean; title?: string } = {}): string {
  const o = m.overall, dTop = o.depthMax || o.depth;
  const Wd = o.width + dTop + 260, Hd = o.height + dTop + 260, k = 1;
  const fx = 60, fy = 60 + o.height, lx = fx + o.width + 140, tx = fx, ty = fy + 120;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F(Wd)} ${F(Hd)}" width="100%"><rect width="${F(Wd)}" height="${F(Hd)}" fill="#fff"/>`;
  const fs = Math.max(26, Math.max(o.width, o.height) / 22);
  s += viewSvg(m, 'front', fx, fy, k) + txt(fx + o.width / 2, 36, 'Спереди', { size: fs, bold: true });
  s += viewSvg(m, 'left', lx, fy, k) + txt(lx + dTop / 2, 36, 'Слева', { size: fs, bold: true });
  s += viewSvg(m, 'top', tx, ty, k) + protrusionMarks(m, tx, ty, k) + txt(tx + o.width / 2, ty - 14, 'Сверху', { size: fs, bold: true });
  s += txt(fx, Hd - 20, `${o.width} × ${o.height} × ${mm(o.depthTop ?? o.depth)} мм${o.depthMax && o.depthMax > (o.depthTop ?? o.depth) ? ` · с ручками ${mm(o.depthMax)} мм` : ''}`, { size: fs * 0.8, anchor: 'start' });
  return s + '</svg>';
}

export function assemblySheet(m: ManufacturingModel, p: Project, status: string): string {
  const W = 420, H = 297, o = m.overall;
  const dM0 = o.depthMax ?? o.depth;
  const k = Math.min(170 / o.width, 205 / (o.height + dM0 + 8), 120 / dM0); // общий масштаб: спереди + сверху помещаются по высоте листа
  const sc = [5, 10, 15, 20, 25, 40, 50].find(s => 1 / s <= k) || 50, kk = 1 / sc;
  const fx = 35, fy = 30 + o.height * kk, lx = fx + o.width * kk + 45 + m.body.z0 * kk, tx = fx, ty = fy + 25;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  s += viewSvg(m, 'front', fx, fy, kk) + txt(fx + o.width * kk / 2, 22, 'Вид спереди', { size: 3.5, bold: true });
  s += dim(fx, fy, fx + o.width * kk, fy, 8, `${o.width}`) + dim(fx + o.width * kk, fy, fx + o.width * kk, fy - o.height * kk, 8, `${o.height}`);
  if (m.body.y0 > 0) s += dim(fx, fy, fx, fy - m.body.y0 * kk, -6, `${m.body.y0}`);
  const zOff = -Math.min(0, ...m.parts.map(q => partBox(q).min[2]));
  s += viewSvg(m, 'left', lx + zOff * kk, fy, kk) + txt(lx + o.depth * kk / 2, 22, 'Вид слева', { size: 3.5, bold: true });
  const dT = o.depthTop ?? o.depth, dM = o.depthMax ?? o.depth;
  s += dim(lx, fy, lx + dT * kk, fy, 8, `${mm(dT)}${o.includes.top ? ' по столешнице' : ''}`, 2.4);
  if (dM > dT + 0.05) s += dim(lx, fy, lx + dM * kk, fy, 14, `${mm(dM)} с ручками`, 2.4);
  s += viewSvg(m, 'top', tx, ty + zOff * kk, kk) + protrusionMarks(m, tx, ty + zOff * kk, kk) + txt(tx + o.width * kk / 2, ty - 3, 'Вид сверху', { size: 3.5, bold: true });
  const tt = m.parts.find(q => q.role === 'tabletop' && q.ops.some(op => op.type === 'radius'));
  if (tt) s += txt(tx + o.width * kk + 3, ty + zOff * kk + dT * kk - 2, `R${tt.ops.find(op => op.type === 'radius')!.params.r}`, { size: 2.6, anchor: 'start' });
  // перечень материалов
  const mats = new Map<string, string>(); for (const q of m.parts) if (q.sheet) { const nm = (MATERIALS as any)[q.material]?.name || (BACKS as any)[q.material]?.name || q.materialName; mats.set(groupKey(q) + (q.finish?.kind === 'ral' ? q.finish.code : ''), `${nm} ${q.thickness} мм${q.finish ? ' — ' + finishName(q.finish) : ''}`); }
  const mx = Math.max(245, lx + o.depth * kk + 30); let my = 200; s += txt(mx, my, 'Материалы и отделка', { size: 3.4, anchor: 'start', bold: true });
  for (const v of [...mats.values()].slice(0, 9)) { my += 5; s += txt(mx, my, '• ' + v, { size: 2.7, anchor: 'start' }); }
  s += txt(mx, 50, `Масштаб 1:${sc}`, { size: 3, anchor: 'start' }) + txt(mx, 56, `Габариты ${o.width}×${o.height}×${mm(dT)} мм${dM > dT + 0.05 ? `; максимальная глубина с ручками ${mm(dM)} мм` : ''}`, { size: 3, anchor: 'start' }) + txt(mx, 62, `Масса ≈ ${m.massKg} кг без содержимого`, { size: 3, anchor: 'start' });
  return s + frame(W, H, 'Сборочный чертёж', p, status, '1') + '</svg>';
}

export function interiorSheet(m: ManufacturingModel, p: Project, status: string): string {
  const W = 420, H = 297, o = m.overall;
  const k = Math.min(250 / o.width, 220 / o.height); const sc = [5, 10, 15, 20, 25, 40, 50].find(s => 1 / s <= k) || 50, kk = 1 / sc;
  const fx = 40, fy = 35 + o.height * kk;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  s += viewSvg(m, 'front', fx, fy, kk, { skip: q => q.group === 'fronts' || q.group === 'handles', labels: true }) + txt(fx + o.width * kk / 2, 25, 'Вид спереди без фасадов — обозначения деталей', { size: 3.5, bold: true });
  // ширины секций и высоты зон
  const b = m.body; const parts = m.parts.filter(q => q.role === 'partition').map(q => partBox(q));
  const xs = [b.x0 + b.t, ...parts.flatMap(q => [q.min[0], q.max[0]]), b.x0 + b.W - b.t].sort((a, c) => a - c);
  for (let i = 0; i < xs.length; i += 2) s += dim(fx + xs[i] * kk, fy, fx + xs[i + 1] * kk, fy, 8 + (i % 4) * 2, `${Math.round(xs[i + 1] - xs[i])}`, 2.4);
  const hs = m.parts.filter(q => q.role === 'divider' || q.role === 'top' || q.role === 'bottom').map(q => partBox(q)).filter(q => q.min[0] <= xs[0] + 1);
  const ys = [...new Set(hs.flatMap(q => [Math.round(q.min[1]), Math.round(q.max[1])]))].sort((a, c) => a - c);
  for (let i = 1; i + 1 < ys.length; i += 2) s += dim(fx, fy - ys[i] * kk, fx, fy - ys[i + 1] * kk, -7, `${ys[i + 1] - ys[i]}`, 2.4);
  s += dim(fx, fy, fx + o.width * kk, fy, 18, `${o.width}`);
  // спецификация деталей
  let ty = 30; const tx = 300; s += txt(tx, ty, 'Обозначения', { size: 3.4, anchor: 'start', bold: true });
  const seen = new Map<string, string[]>(); for (const q of m.parts) seen.set(q.name, [...(seen.get(q.name) || []), q.id]);
  for (const [n, ids] of seen) { ty += 4.6; if (ty > 250) { s += txt(tx, ty, '… полный перечень — в деталировке', { size: 2.5, anchor: 'start' }); break; } s += txt(tx, ty, `${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '…' : ''} — ${n}`, { size: 2.5, anchor: 'start' }); }
  s += txt(fx, H - 20, `Масштаб 1:${sc}. Размеры секций и зон — внутренние.`, { size: 2.8, anchor: 'start' });
  return s + frame(W, H, 'Корпус и наполнение', p, status, '2') + '</svg>';
}

/** Карта присадки одной детали: пласти A/B, торцы, пазы, фрезеровки. */
export function partSheet(q: Part, p: Project, status: string, sheetNo: string): string {
  const W = 297, H = 210;
  const k = Math.min(220 / q.L, 95 / q.W, 1), sc = Math.ceil(1 / k); const kk = 1 / sc;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  const ox = 30, oy = 30;
  const faces = ['A', 'B'].filter(f => q.holes.some(h => h.face === f) || q.ops.some(o => o.face === f));
  const face = faces[0] || 'A';
  const w = q.L * kk, h = q.W * kk;
  // деталь (вид на пласть ${face}); начало координат — левый нижний угол (W1 × L1)
  const P = (u: number, v: number) => [ox + u * kk, oy + h - v * kk];
  s += `<rect x="${ox}" y="${oy}" width="${F(w)}" height="${F(h)}" fill="#fff" stroke="#111" stroke-width="0.35"/>`;
  const edgeLine: Record<string, [number, number, number, number]> = { L1: [ox, oy + h, ox + w, oy + h], L2: [ox, oy, ox + w, oy], W1: [ox, oy, ox, oy + h], W2: [ox + w, oy, ox + w, oy + h] };
  for (const e of ['L1', 'L2', 'W1', 'W2'] as const) { const ed = q.edges[e]; if (ed.kind === 'none') continue; const [a, b, c, d] = edgeLine[e]; s += line(a, b, c, d, ed.kind === 'thick' ? 1.1 : 0.7, ed.kind === 'paint' ? '#2563eb' : '#c2410c'); }
  for (const o of q.ops) {
    if (o.type === 'groove') { const [x1, y1] = P(o.params.from, o.params.offset), [x2, y2] = P(o.params.to, o.params.offset + o.params.width); s += `<rect x="${F(Math.min(x1, x2))}" y="${F(Math.min(y1, y2))}" width="${F(Math.abs(x2 - x1))}" height="${F(Math.abs(y2 - y1))}" fill="#bbb" stroke="#111" stroke-width="0.15"/>`; }
    if (o.type === 'mill-frame') { const i = o.params.inset * kk; s += `<rect x="${F(ox + i)}" y="${F(oy + i)}" width="${F(w - 2 * i)}" height="${F(h - 2 * i)}" fill="none" stroke="#111" stroke-width="${F(Math.max(0.3, o.params.width * kk))}"/>`; }
    if (o.type === 'radius') s += txt(ox + w - 2, oy + 4, `R${o.params.r} (2 угла по L2)`, { size: 2.4, anchor: 'end' });
  }
  const hs = q.holes.filter(x => x.face === face);
  for (const x of hs) { const [cx, cy] = P(x.u, x.v); s += `<circle cx="${F(cx)}" cy="${F(cy)}" r="${F(Math.max(0.6, x.d / 2 * kk))}" fill="${x.through ? '#111' : '#fff'}" stroke="#111" stroke-width="0.2"/>`; }
  s += dim(ox, oy + h, ox + w, oy + h, 7, mm(q.L)) + dim(ox, oy + h, ox, oy, -7, mm(q.W));
  s += txt(ox, oy - 8, `${q.id} — ${q.name}. Пласть ${face}${faces.length > 1 ? ' (отверстия пласти B — в таблице)' : ''}. Начало координат — левый нижний угол (кромки W1 и L1).`, { size: 3, anchor: 'start', bold: true });
  s += txt(ox, oy - 3, `${q.materialName} ${q.thickness} мм. Готовая деталь ${mm(q.L)}×${mm(q.W)}, заготовка ${mm(q.blankL)}×${mm(q.blankW)}. Текстура: ${q.grain === 'L' ? 'вдоль L' : q.grain === 'W' ? 'вдоль W' : 'нет'}. Масштаб 1:${sc}`, { size: 2.6, anchor: 'start' });
  // таблица отверстий
  let ty = oy + h + 20; const cols = [ox, ox + 12, ox + 24, ox + 42, ox + 60, ox + 72, ox + 88, ox + 150];
  const hd = ['№', 'Грань', 'u', 'v', 'Ø', 'Глуб.', 'Назначение', 'Статус'];
  hd.forEach((t, i) => { s += txt(cols[i], ty, t, { size: 2.5, anchor: 'start', bold: true }); }); s += line(ox, ty + 1.2, W - 20, ty + 1.2, 0.2);
  const all = q.holes; let n = 0;
  for (const x of all) { ty += 4; if (ty > H - 50) { s += txt(ox, ty, `… ещё ${all.length - n} отверстий — в CSV/DXF`, { size: 2.4, anchor: 'start' }); break; } n++;
    [String(n), x.face, mm(x.u), mm(x.v), mm(x.d), x.through ? 'насквозь' : mm(x.depth), x.kind, x.status === 'verified' ? 'по документу' : x.status === 'partial' ? 'частично' : 'правило программы'].forEach((t, i) => { s += txt(cols[i], ty, t, { size: 2.4, anchor: 'start' }); }); }
  s += txt(ox, H - 45, 'Кромка: оранжевая линия — ПВХ (толстая — 2 мм), синяя — окраска торца. Пласть: u — вдоль L от кромки W1, v — вдоль W от кромки L1 (вид со стороны пласти A). Торец: u — вдоль кромки, v — по толщине от пласти A.', { size: 2.3, anchor: 'start' });
  return s + frame(W, H, 'Карта присадки', p, status, sheetNo) + '</svg>';
}

export function cutSheetSvg(g: CutGroup, i: number, p: Project, status: string, sheetNo: string): string {
  const W = 297, H = 210, sh = g.sheets[i], k = Math.min(255 / g.sheet.L, 118 / g.sheet.W), ox = 22, oy = 32;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  s += txt(ox, 20, `${g.title} — лист ${i + 1} из ${g.sheets.length}, формат ${g.sheet.L}×${g.sheet.W}`, { size: 3.4, anchor: 'start', bold: true });
  s += txt(ox, 26, `Занято ${(sh.used / (g.sheet.L * g.sheet.W) * 100).toFixed(1)}%. ${g.grain ? 'Направление текстуры — вдоль длинной стороны листа (поворот деталей запрещён).' : 'Без текстуры — поворот разрешён.'} Раскрой эвристический, не гарантированно оптимальный.`, { size: 2.5, anchor: 'start' });
  s += `<rect x="${ox}" y="${oy}" width="${F(g.sheet.L * k)}" height="${F(g.sheet.W * k)}" fill="#f2efe9" stroke="#111" stroke-width="0.3"/>`;
  if (g.grain) for (let y = 6; y < g.sheet.W * k; y += 8) s += line(ox + 2, oy + y, ox + g.sheet.L * k - 2, oy + y, 0.08, '#c9b79c');
  for (const q of sh.placements) {
    s += `<rect x="${F(ox + q.x * k)}" y="${F(oy + q.y * k)}" width="${F(q.w * k)}" height="${F(q.h * k)}" fill="#fff" stroke="#111" stroke-width="0.25"/>`;
    // ID подписывается у каждой детали; размеры заготовки — с десятыми (вдоль листа × поперёк)
    const lab = `${q.id}${q.rot ? ' ↻' : ''}`, dims = `${mm(q.w)}×${mm(q.h)}`, fs = Math.max(1.4, Math.min(2.6, q.h * k * 0.32, q.w * k / Math.max(lab.length, dims.length) * 1.7));
    const cx = ox + (q.x + q.w / 2) * k, cy = oy + (q.y + q.h / 2) * k;
    if (q.h * k > fs * 2.6) s += txt(cx, cy - fs * 0.15, lab, { size: fs, bold: true }) + txt(cx, cy + fs * 1.05, dims, { size: fs * 0.9 });
    else s += txt(cx, cy + fs * 0.35, `${lab} ${dims}`, { size: Math.min(fs, q.h * k * 0.7) });
  }
  // перечень деталей листа: ID, размер заготовки, название — для мелких деталей, где подпись на карте мелкая
  let ly = oy + g.sheet.W * k + 6; const colW = 88; let col = 0;
  s += txt(ox, ly, 'Детали листа (заготовка: вдоль листа × поперёк, мм)', { size: 2.5, anchor: 'start', bold: true });
  sh.placements.forEach((q, i) => { const yy = ly + 4 + Math.floor(i / 3) * 3.6; col = i % 3; if (yy > H - 46) return;
    s += txt(ox + col * colW, yy, `${q.id} — ${mm(q.w)}×${mm(q.h)}${q.rot ? ' (повёрнута)' : ''} — ${q.name}`.slice(0, 58), { size: 2.2, anchor: 'start' }); });
  return s + frame(W, H, 'Карта раскроя', p, status, sheetNo) + '</svg>';
}

/** Мини-схема кромки для таблицы. */
export function edgeIcon(q: Part): string {
  const k = 40 / Math.max(q.L, q.W), w = q.L * k, h = q.W * k, c = (e: string) => q.edges[e as 'L1'].kind === 'none' ? '#ddd' : q.edges[e as 'L1'].kind === 'paint' ? '#2563eb' : '#c2410c', sw = (e: string) => q.edges[e as 'L1'].kind === 'thick' ? 2.5 : 1.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${F(w + 6)}" height="${F(h + 6)}" viewBox="-3 -3 ${F(w + 6)} ${F(h + 6)}"><rect width="${F(w)}" height="${F(h)}" fill="#fff" stroke="#999" stroke-width=".5"/>${line(0, h, w, h, sw('L1'), c('L1'))}${line(0, 0, w, 0, sw('L2'), c('L2'))}${line(0, 0, 0, h, sw('W1'), c('W1'))}${line(w, 0, w, h, sw('W2'), c('W2'))}</svg>`;
}
