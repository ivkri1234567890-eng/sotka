/**
 * Эвристический раскрой (MaxRects, лучшая короткая сторона). Результат НЕ гарантирует оптимальность.
 * Учитывается: формат листа, пропил, обрезка кромки листа, направление декора (запрет поворота), группы материалов.
 */
import type { ManufacturingModel, Part } from './schema';
import { MATERIALS, BACKS, finishName } from './materials';

export type CutParams = { kerf: number; trim: number; sheets: Record<string, { L: number; W: number }> };
export type Placement = { id: string; name: string; x: number; y: number; w: number; h: number; rot: boolean };
export type CutSheet = { placements: Placement[]; used: number; free: { x: number; y: number; w: number; h: number }[] };
export type CutGroup = {
  key: string; title: string; material: string; thickness: number; grain: boolean;
  sheet: { L: number; W: number }; sheets: CutSheet[]; unplaced: Part[];
  partArea: number; sheetArea: number; offcuts: { w: number; h: number }[];
};

export function sheetFormat(material: string, p: CutParams): { L: number; W: number } {
  if (p.sheets[material]) return p.sheets[material];
  if ((MATERIALS as any)[material]) return (MATERIALS as any)[material].sheet;
  if ((BACKS as any)[material]) return (BACKS as any)[material].sheet;
  return { L: 2800, W: 2070 };
}
export function groupKey(p: Part) { return `${p.material}|${p.thickness}|${p.finish ? p.finish.kind + ':' + p.finish.code : 'raw'}`; }

type R = { x: number; y: number; w: number; h: number };
function pack(items: { id: string; name: string; w: number; h: number; canRot: boolean }[], SW: number, SH: number) {
  const sheets: { free: R[]; placed: Placement[] }[] = []; const unplaced: string[] = [];
  const sorted = [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
  for (const it of sorted) {
    if ((it.w > SW || it.h > SH) && (!it.canRot || it.w > SH || it.h > SW)) { unplaced.push(it.id); continue; }
    let placed = false;
    for (const s of [...sheets, null]) {
      const sh = s || { free: [{ x: 0, y: 0, w: SW, h: SH }], placed: [] };
      let best: { r: R; rot: boolean; score: number } | null = null;
      for (const f of sh.free) for (const rot of it.canRot ? [false, true] : [false]) {
        const w = rot ? it.h : it.w, h = rot ? it.w : it.h;
        if (w <= f.w && h <= f.h) { const score = Math.min(f.w - w, f.h - h); if (!best || score < best.score) best = { r: { x: f.x, y: f.y, w, h }, rot, score }; }
      }
      if (!best) continue;
      if (!s) sheets.push(sh);
      sh.placed.push({ id: it.id, name: it.name, x: best.r.x, y: best.r.y, w: best.r.w, h: best.r.h, rot: best.rot });
      // разбиение свободных прямоугольников (MaxRects)
      const nf: R[] = [];
      for (const f of sh.free) {
        const u = best.r;
        if (u.x >= f.x + f.w || u.x + u.w <= f.x || u.y >= f.y + f.h || u.y + u.h <= f.y) { nf.push(f); continue; }
        if (u.x > f.x) nf.push({ x: f.x, y: f.y, w: u.x - f.x, h: f.h });
        if (u.x + u.w < f.x + f.w) nf.push({ x: u.x + u.w, y: f.y, w: f.x + f.w - u.x - u.w, h: f.h });
        if (u.y > f.y) nf.push({ x: f.x, y: f.y, w: f.w, h: u.y - f.y });
        if (u.y + u.h < f.y + f.h) nf.push({ x: f.x, y: u.y + u.h, w: f.w, h: f.y + f.h - u.y - u.h });
      }
      sh.free = nf.filter((a, i) => !nf.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w * a.h < b.w * b.h)));
      placed = true; break;
    }
    if (!placed) unplaced.push(it.id);
  }
  return { sheets, unplaced };
}

export function cutModel(m: ManufacturingModel, p: CutParams): CutGroup[] {
  const groups = new Map<string, Part[]>();
  for (const part of m.parts.filter(x => x.sheet)) { const k = groupKey(part); groups.set(k, [...(groups.get(k) || []), part]); }
  const out: CutGroup[] = [];
  for (const [key, parts] of groups) {
    const p0 = parts[0], fmt = sheetFormat(p0.material, p), grain = parts.some(x => x.grain !== 'none');
    const SW = fmt.L - 2 * p.trim + p.kerf, SH = fmt.W - 2 * p.trim + p.kerf;
    // ось листа L = x. Деталь с текстурой по L кладётся длиной вдоль листа, поворот запрещён.
    const items = parts.map(x => ({ id: x.id, name: x.name, w: (x.grain === 'W' ? x.blankW : x.blankL) + p.kerf, h: (x.grain === 'W' ? x.blankL : x.blankW) + p.kerf, canRot: x.grain === 'none' }));
    const r = pack(items, SW, SH);
    const sheets: CutSheet[] = r.sheets.map(s => ({
      placements: s.placed.map(q => ({ ...q, x: q.x + p.trim, y: q.y + p.trim, w: q.w - p.kerf, h: q.h - p.kerf })),
      used: s.placed.reduce((a, q) => a + (q.w - p.kerf) * (q.h - p.kerf), 0),
      free: s.free.map(f => ({ x: f.x + p.trim, y: f.y + p.trim, w: Math.max(0, f.w - p.kerf), h: Math.max(0, f.h - p.kerf) })),
    }));
    const offcuts = sheets.flatMap(s => s.free).filter(f => f.w >= 200 && f.h >= 200).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 8).map(f => ({ w: Math.round(f.w), h: Math.round(f.h) }));
    const name = ((MATERIALS as any)[p0.material]?.name || (BACKS as any)[p0.material]?.name || p0.materialName);
    out.push({ key, title: `${name} ${p0.thickness} мм${p0.finish ? ', ' + finishName(p0.finish) : ''}`, material: p0.material, thickness: p0.thickness, grain,
      sheet: fmt, sheets, unplaced: parts.filter(x => r.unplaced.includes(x.id)), partArea: parts.reduce((a, x) => a + x.blankL * x.blankW, 0), sheetArea: sheets.length * fmt.L * fmt.W, offcuts });
  }
  return out;
}
