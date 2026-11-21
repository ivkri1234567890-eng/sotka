/**
 * Детерминированное геометрическое ядро: ProductConfig → ManufacturingModel.
 * Не зависит от интерфейса, сервера и ИИ. Одинаково работает в браузере, в Android-приложении и в тестах (Node).
 *
 * Детали — прямоугольные пластины/тела, повёрнутые кратно 90°. Локальные оси детали:
 *   L — длина (направление текстуры по умолчанию), W — ширина, T — толщина.
 *   origin — мировая координата локальной точки (0,0,0); axes — мировые оси, вдоль которых идут L, W, T.
 *   Лицевая сторона A — грань при T = толщина (faceA '+') или при T = 0 (faceA '−').
 *   Кромки: L1 — вдоль L при W = 0, L2 — при W = W, W1 — вдоль W при L = 0, W2 — при L = L.
 * Координаты отверстий на пласти: u — вдоль L от кромки W1, v — вдоль W от кромки L1.
 */
import { MODEL_SCHEMA, MODEL_VERSION, hashConfig } from './schema';
import type { ProductConfig, Part, Hole, ManufacturingModel, Joint, Moving, Check, AssemblyStep, Finish } from './schema';
import { MATERIALS, BACKS, DRAWER_BOX, isWoodLike } from './materials';
import { HW } from './hardware';
import { buildBed } from './bed';

type Ax = 'x' | 'y' | 'z';
type V3 = [number, number, number];
const AX: Record<Ax, number> = { x: 0, y: 1, z: 2 };
const r1 = (v: number) => Math.round(v * 10) / 10;

export const SLIDE_LENGTHS = [250, 300, 350, 400, 450, 500, 550];
export const SLIDE_SIDE_GAP = 12.5;      // правило программы (см. профиль slide — требует проверки)
export const HINGE_K = 5;                // расстояние от края фасада до чашки, мм (документ: 3…7)
export const BACK_GROOVE_OFFSET = 10;    // паз под заднюю стенку от заднего края, мм
export const DRAWER_TOP_CLEAR = 25, DRAWER_BOTTOM_CLEAR = 15;
export const TUBE = 20;                  // профильная труба 20×20 для металлокаркаса
export const HANDLE_THREAD = 8;          // ввинчивание винта М4 в ручку — правило программы
export const SCREW_M4 = [16, 20, 22, 25, 30, 35, 40, 45, 50];
export const DRAWER_LOAD_KG = 10;        // расчётная загрузка ящика для проверки опрокидывания — правило программы

export function hingeCount(h: number) { return h <= 900 ? 2 : h <= 1600 ? 3 : h <= 2000 ? 4 : 5; }
export function handleProtrusion(c: ProductConfig) { return c.handles.type === 'knob' ? 28 : c.handles.type === 'bar' ? 32 : 0; }

export type Derived = {
  W: number; H: number; D: number; t: number; tf: number; tb: number; tt: number;
  baseH: number; bodyW: number; bodyH: number; bodyD: number; x0: number; y0: number; z0: number;
  frontAdd: number; topD: number; inset: boolean;
};

export function derive(c: ProductConfig): Derived {
  const t = c.body.thickness, tf = c.fronts.thickness, tb = c.back.thickness, tt = c.top.enabled ? c.top.thickness : 0;
  const inset = c.fronts.mount === 'inset';
  const baseH = c.base.type === 'wall' || c.base.type === 'floor' ? 0 : c.base.height;
  const frontAdd = inset ? 0 : tf;
  const backAdd = c.back.mount === 'overlay' ? tb : 0;
  const ovS = c.top.enabled ? c.top.overhangSides : 0, ovF = c.top.enabled ? c.top.overhangFront : 0;
  const bodyW = c.size.width - 2 * ovS;
  const bodyH = c.size.height - baseH - tt;
  const bodyD = c.size.depth - frontAdd - ovF - backAdd;
  return { W: c.size.width, H: c.size.height, D: c.size.depth, t, tf, tb, tt, baseH, bodyW, bodyH, bodyD,
    x0: ovS, y0: baseH, z0: backAdd, frontAdd, topD: c.size.depth, inset };
}

/* ---------- работа с деталью ---------- */
function partBox(p: Part): { min: V3; max: V3 } {
  const min: V3 = [...p.origin] as V3, max: V3 = [...p.origin] as V3;
  const dims = [p.L, p.W, p.thickness];
  p.axes.forEach((a, i) => { max[AX[a]] += dims[i]; });
  return { min, max };
}
export { partBox };
function local(p: Part, P: V3): V3 { return [P[AX[p.axes[0]]] - p.origin[AX[p.axes[0]]], P[AX[p.axes[1]]] - p.origin[AX[p.axes[1]]], P[AX[p.axes[2]]] - p.origin[AX[p.axes[2]]]]; }
/** dir — сторона, с которой входит инструмент: '+x' — инструмент со стороны +X. */
function faceOf(p: Part, sign: '+' | '-'): 'A' | 'B' { return sign === p.faceA ? 'A' : 'B'; }

export class Builder {
  parts: Part[] = []; joints: Joint[] = []; checks: Check[] = []; moving: Moving[] = [];
  hid = 0; jid = 0;
  constructor(public c: ProductConfig, public d: Derived) {}
  add(p: Omit<Part, 'holes' | 'ops' | 'blankL' | 'blankW' | 'mass'> & { holes?: Hole[] }): Part {
    const e = p.edges, allow = this.c.production.edgeAllowance;
    const sub = (a: { kind: string; t: number }) => (a.kind === 'thin' || a.kind === 'thick' || a.kind === 'veneer') ? a.t - allow : 0;
    const blankL = p.sheet ? r1(p.L - sub(e.W1) - sub(e.W2)) : p.L;
    const blankW = p.sheet ? r1(p.W - sub(e.L1) - sub(e.L2)) : p.W;
    const full: Part = { ...p, L: r1(p.L), W: r1(p.W), blankL, blankW, holes: p.holes || [], ops: [], mass: 0 } as Part;
    full.mass = massOf(full);
    this.parts.push(full); return full;
  }
  get(id: string) { const p = this.parts.find(x => x.id === id); if (!p) throw Error('нет детали ' + id); return p; }
  joint(j: Omit<Joint, 'id'>): Joint { const jj = { ...j, id: 'J' + (++this.jid) }; this.joints.push(jj); return jj; }
  holeFace(p: Part, P: V3, dir: '+' | '-', d: number, depth: number, through: boolean, kind: string, joint: string, status: Hole['status']) {
    const l = local(p, P);
    p.holes.push({ id: 'h' + (++this.hid), face: faceOf(p, dir), u: r1(l[0]), v: r1(l[1]), d, depth: through ? p.thickness : depth, through, kind, joint, status });
  }
  holeEdge(p: Part, P: V3, axis: Ax, dir: '+' | '-', d: number, depth: number, kind: string, joint: string, status: Hole['status']) {
    const l = local(p, P), vA = r1(p.faceA === '+' ? p.thickness - l[2] : l[2]); // по толщине — от пласти A
    if (p.axes[1] === axis) p.holes.push({ id: 'h' + (++this.hid), face: dir === '-' ? 'L1' : 'L2', u: r1(l[0]), v: vA, d, depth, through: false, kind, joint, status });
    else if (p.axes[0] === axis) p.holes.push({ id: 'h' + (++this.hid), face: dir === '-' ? 'W1' : 'W2', u: r1(l[1]), v: vA, d, depth, through: false, kind, joint, status });
  }
}

function massOf(p: Part): number {
  if (p.geom === 'tube') return p.L / 1000 * 0.83;               // труба 20×20×1,5 ≈ 0,83 кг/м
  if (p.geom === 'rod') return p.L / 1000 * 0.6;
  if (p.geom === 'leg') return 0.25;
  if (p.geom === 'handle') return 0.06;
  if (p.geom === 'profile') return p.L / 1000 * 0.4;
  if (p.geom === 'mirror') return p.L * p.W * p.thickness * 1e-9 * 2500;
  if (p.geom === 'slat') return p.L / 1000 * 0.3;
  const dens = (MATERIALS as any)[p.material]?.density || (BACKS as any)[p.material]?.density || 700;
  return p.L * p.W * p.thickness * 1e-9 * dens;
}

export const EDGE0 = { kind: 'none' as const, t: 0 };
export function edgeFor(c: ProductConfig, mat: string, visible: 'front' | 'side' | 'hidden') {
  if (visible === 'hidden') return EDGE0;
  const m = (MATERIALS as any)[mat];
  if (!m) return EDGE0;
  if (m.edge === 'pvc') return visible === 'front' ? { kind: 'thick' as const, t: c.production.edgeThick } : { kind: 'thin' as const, t: c.production.edgeThin };
  if (m.edge === 'veneer') return { kind: 'veneer' as const, t: 0.6 };
  if (m.edge === 'paint') return { kind: 'paint' as const, t: 0 };
  return EDGE0;
}

/* ---------- позиции крепежа по длине соединения (правило программы) ---------- */
export function fastenerPositions(len: number, edge = 50, pitch = 300): number[] {
  if (len <= 2 * edge + 10) return [len / 2];
  const n = Math.max(2, Math.ceil((len - 2 * edge) / pitch) + 1);
  return Array.from({ length: n }, (_, i) => r1(edge + (len - 2 * edge) * i / (n - 1)));
}

/** Одна рассчитанная модель на конфигурацию: редактор, документы и экспорт берут один и тот же объект. */
const mcache = new Map<string, ManufacturingModel>();
export function modelFor(c: ProductConfig): ManufacturingModel {
  const k = JSON.stringify(c); let m = mcache.get(k);
  if (!m) { m = buildModel(c); mcache.set(k, m); if (mcache.size > 12) mcache.delete(mcache.keys().next().value as string); }
  return m;
}
export function buildModel(c: ProductConfig): ManufacturingModel {
  if (c.category === 'bed') return buildBed(c);
  const d = derive(c), B = new Builder(c, d);
  const { t, tf, tb, x0, y0, z0, bodyW, bodyH, bodyD, inset } = d;
  const body = c.body, matB = body.material, fin = body.finish, wood = isWoodLike(fin) || MATERIALS[matB].grainDefault && fin.kind !== 'ral';
  const grain = (w: boolean) => (w ? 'L' : 'none') as Part['grain'];
  const chk = (level: Check['level'], area: string, msg: string, fix?: string) => B.checks.push({ level, area, msg, fix });

  /* ---- базовые проверки размеров ---- */
  const LIM = { nightstand: [300, 900, 250, 900], wardrobe: [400, 3000, 1000, 2700], dresser: [600, 1800, 150, 950], bed: [0, 9999, 0, 9999] }[c.category];
  const minW = LIM[0], maxW = LIM[1], minH = LIM[2], maxH = LIM[3];
  if (c.size.width < minW || c.size.width > maxW) chk('error', 'Размеры', `Ширина ${c.size.width} мм вне диапазона ${minW}–${maxW} мм.`, `Укажите ширину от ${minW} до ${maxW} мм.`);
  if (c.size.height < minH || c.size.height > maxH) chk('error', 'Размеры', `Высота ${c.size.height} мм вне диапазона ${minH}–${maxH} мм.`, `Укажите высоту от ${minH} до ${maxH} мм.`);
  if (bodyD < 250 || bodyD > 750) chk('error', 'Размеры', `Глубина корпуса ${r1(bodyD)} мм вне диапазона 250–750 мм.`, 'Измените общую глубину или вынос столешницы.');
  if (!MATERIALS[matB].thicknesses.includes(t)) chk('warn', 'Материалы', `Толщина корпуса ${t} мм нестандартна для «${MATERIALS[matB].name}».`, `Выберите ${MATERIALS[matB].thicknesses.join(', ')} мм.`);
  if (c.fronts.design === 'milled-frame' && !MATERIALS[c.fronts.material].milling) chk('error', 'Фасады', `Фрезеровка рамки невозможна на материале «${MATERIALS[c.fronts.material].name}».`, 'Выберите фасады из МДФ под эмаль или гладкий фасад.');
  if (c.fronts.design === 'milled-frame' && tf < 19) chk('error', 'Фасады', `Для фрезеровки рамки нужен фасад от 19 мм (сейчас ${tf} мм).`, 'Увеличьте толщину фасада до 19 или 22 мм.');
  if (c.base.type !== 'wall' && c.base.type !== 'metal-frame' && c.base.height < (c.base.type === 'plinth' ? 60 : 80) && c.base.height > 0) chk('warn', 'Основание', `Низкое основание ${c.base.height} мм — уборка под мебелью затруднена.`, 'Обычно 80–150 мм.');
  if (bodyW < 2 * t + 100 || bodyH < 2 * t + 100 || bodyD < 200) {
    chk('error', 'Размеры', 'Корпус слишком мал для выбранных толщин.', 'Увеличьте размеры изделия.');
    return finish(B, c, d);
  }

  /* ---- корпус ---- */
  const sideEdges = (front: boolean) => ({
    L1: EDGE0,                                                        // задний край
    L2: edgeFor(c, matB, front ? 'front' : 'side'),                   // передний край
    W1: edgeFor(c, matB, c.base.type === 'wall' || c.base.type.startsWith('legs') || c.base.type === 'metal-frame' ? 'side' : 'hidden'), // низ (без ножек — на полу, не видно)
    W2: edgeFor(c, matB, c.top.enabled ? 'hidden' : 'side'),          // верх
  });
  const sL = B.add({ id: 'S1', name: 'Боковина левая', role: 'side', group: 'body', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
    L: bodyH, W: bodyD, edges: sideEdges(true), grain: grain(wood), origin: [x0, y0, z0], axes: ['y', 'z', 'x'], faceA: '-', sheet: true });
  const sR = B.add({ id: 'S2', name: 'Боковина правая', role: 'side', group: 'body', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
    L: bodyH, W: bodyD, edges: sideEdges(true), grain: grain(wood), origin: [x0 + bodyW - t, y0, z0], axes: ['y', 'z', 'x'], faceA: '+', sheet: true });
  const hEdges = { L1: EDGE0, L2: edgeFor(c, matB, 'front'), W1: EDGE0, W2: EDGE0 };
  const top = B.add({ id: 'T1', name: 'Крыша корпуса', role: 'top', group: 'body', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
    L: bodyW - 2 * t, W: bodyD, edges: hEdges, grain: grain(wood), origin: [x0 + t, y0 + bodyH - t, z0], axes: ['x', 'z', 'y'], faceA: '+', sheet: true });
  const bot = B.add({ id: 'B1', name: 'Дно корпуса', role: 'bottom', group: 'body', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
    L: bodyW - 2 * t, W: bodyD, edges: hEdges, grain: grain(wood), origin: [x0 + t, y0, z0], axes: ['x', 'z', 'y'], faceA: '-', sheet: true });

  // конфирмат «пласть → торец»: face — деталь, которую сверлят насквозь; edge — деталь с отверстием в торце.
  const confirmat = (face: Part, edge: Part, axis: Ax, dir: '+' | '-', pts: V3[], title: string, step: string) => {
    const j = B.joint({ kind: 'confirmat', title, parts: [face.id, edge.id], hardware: [{ id: 'confirmat', qty: pts.length }, { id: 'confirmat-cap', qty: pts.length }], step, status: 'partial' });
    const depth = Math.max(10, 50 - face.thickness + 3);
    for (const P of pts) {
      const Pf: V3 = [...P] as V3; Pf[AX[axis]] += dir === '-' ? -face.thickness : face.thickness; // точка на наружной пласти
      B.holeFace(face, Pf, dir, 7, 0, true, 'Конфирмат: сквозное Ø7', j.id, 'verified');
      B.holeEdge(edge, P, axis, dir === '-' ? '-' : '+', 5, depth, 'Конфирмат: в торец Ø5', j.id, 'rule');
    }
    return j;
  };
  const zPts = (zA: number, zB: number) => fastenerPositions(zB - zA).map(v => zA + v);
  // крыша и дно к боковинам
  const zFrom = c.back.mount === 'groove' ? z0 : z0;
  for (const [pnl, yc] of [[top, y0 + bodyH - t / 2], [bot, y0 + t / 2]] as [Part, number][]) {
    confirmat(sL, pnl, 'x', '-', zPts(zFrom, z0 + bodyD).map(z => [x0 + t, yc, z] as V3), `${pnl.name} — боковина левая`, 'body');
    confirmat(sR, pnl, 'x', '+', zPts(zFrom, z0 + bodyD).map(z => [x0 + bodyW - t, yc, z] as V3), `${pnl.name} — боковина правая`, 'body-close');
  }

  /* ---- задняя стенка ---- */
  const backMat = c.back.material, backName = BACKS[backMat].name;
  let backFrontZ = z0; // передняя плоскость задней стенки
  if (c.back.mount === 'groove') {
    const gd = Math.min(8, Math.floor(t / 2)), gw = tb + 1, gz = z0 + BACK_GROOVE_OFFSET;
    const bk = B.add({ id: 'BK', name: 'Задняя стенка', role: 'back', group: 'back', geom: 'panel', material: backMat, materialName: backName, thickness: tb, finish: null,
      L: bodyH - 2 * t + 2 * (gd - 1), W: bodyW - 2 * t + 2 * (gd - 1), edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none',
      origin: [x0 + t - (gd - 1), y0 + t - (gd - 1), gz], axes: ['y', 'x', 'z'], faceA: '+', sheet: true });
    for (const p of [sL, sR, top, bot]) {
      const inner = p === sL ? '+' : p === sR ? '-' : p === top ? '-' : '+';
      p.ops.push({ id: 'g' + p.id, type: 'groove', face: faceOf(p, inner as any), params: { offset: BACK_GROOVE_OFFSET, width: gw, depth: gd, from: 0, to: p.L }, note: `Паз под заднюю стенку ${gw}×${gd} мм в ${BACK_GROOVE_OFFSET} мм от заднего края` });
    }
    B.joint({ kind: 'groove', title: 'Задняя стенка в паз', parts: ['BK', 'S1', 'S2', 'T1', 'B1'], hardware: [], step: 'back', status: 'rule', note: 'Вставляется в паз до установки правой боковины' });
    backFrontZ = gz + tb + 1;
    if (t < 16) chk('error', 'Задняя стенка', `Паз под заднюю стенку не помещается в плиту ${t} мм.`, 'Выберите заднюю стенку внакладку.');
    void bk;
  } else {
    const L = bodyH - 2, W = bodyW - 2;
    B.add({ id: 'BK', name: 'Задняя стенка', role: 'back', group: 'back', geom: 'panel', material: backMat, materialName: backName, thickness: tb, finish: null,
      L, W, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [x0 + 1, y0 + 1, z0 - tb], axes: ['y', 'x', 'z'], faceA: '-', sheet: true });
    const n = Math.ceil(2 * (L + W) / 150);
    B.joint({ kind: 'nail', title: 'Задняя стенка внакладку', parts: ['BK', 'S1', 'S2', 'T1', 'B1'], hardware: [{ id: 'back-nail', qty: n }], step: 'back', status: 'rule', note: 'Шаг 150 мм по периметру' });
    backFrontZ = z0;
  }
  const zFront = z0 + bodyD;                    // передняя плоскость корпуса
  const innerFront = inset ? zFront - tf : zFront;

  /* ---- секции (колонки) ---- */
  const nCol = c.columns.length, innerW = bodyW - 2 * t - (nCol - 1) * t;
  const fixedW = c.columns.reduce((s, col) => s + (col.width || 0), 0), autoN = c.columns.filter(col => !col.width).length;
  const autoW = autoN ? (innerW - fixedW) / autoN : 0;
  if (autoN && autoW < 150) chk('error', 'Секции', 'Ширины секций не помещаются в корпус.', 'Уменьшите заданные ширины секций или увеличьте ширину шкафа.');
  if (!autoN && Math.abs(fixedW - innerW) > 1) chk('error', 'Секции', `Сумма ширин секций ${fixedW} мм не равна внутренней ширине ${r1(innerW)} мм.`, 'Оставьте одну секцию с автоматической шириной.');
  const cols: { x: number; w: number }[] = []; let cx = x0 + t;
  c.columns.forEach((col, i) => { const w = col.width || autoW; cols.push({ x: cx, w }); cx += w + t; void i; });
  const partDepthZ = c.back.mount === 'groove' ? backFrontZ : z0;
  // перегородки
  for (let i = 1; i < nCol; i++) {
    const px = cols[i].x - t;
    const p = B.add({ id: 'P' + i, name: `Перегородка ${i}`, role: 'partition', group: 'body', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
      L: bodyH - 2 * t, W: zFront - partDepthZ, edges: { L1: EDGE0, L2: edgeFor(c, matB, 'front'), W1: EDGE0, W2: EDGE0 }, grain: grain(wood),
      origin: [px, y0 + t, partDepthZ], axes: ['y', 'z', 'x'], faceA: '+', sheet: true });
    confirmat(top, p, 'y', '+', zPts(partDepthZ, zFront).map(z => [px + t / 2, y0 + bodyH - t, z] as V3), `Перегородка ${i} — крыша`, 'partitions');
    confirmat(bot, p, 'y', '-', zPts(partDepthZ, zFront).map(z => [px + t / 2, y0 + t, z] as V3), `Перегородка ${i} — дно`, 'partitions');
  }
  const leftOf = (i: number) => i === 0 ? sL : B.get('P' + i);
  const rightOf = (i: number) => i === nCol - 1 ? sR : B.get('P' + (i + 1));

  /* ---- зоны, фасады, наполнение ---- */
  const g = c.production.gap, fMat = c.fronts.material, fFin = c.fronts.finish, fWood = isWoodLike(fFin);
  const fEdges = () => { const e = edgeFor(c, fMat, 'front'); return { L1: e, L2: e, W1: e, W2: e }; };
  let fIdx = 0, shIdx = 0, divIdx = 0, drIdx = 0, rodIdx = 0, hIdx = 0;
  const innerH = bodyH - 2 * t;
  const fronts: { id: string; kind: 'door' | 'drawer'; hingeLeft?: boolean; col: number }[] = [];
  const handleFor = (front: Part, kind: 'door' | 'drawer', hingeLeft: boolean | undefined, step: string, boxWall?: Part) => {
    const ht = c.handles.type; const box = partBox(front);
    const fx0 = box.min[0], fx1 = box.max[0], fy0 = box.min[1], fy1 = box.max[1], fz = box.max[2];
    if (ht === 'push') {
      B.joint({ kind: 'push', title: `Толкатель для ${front.name.toLowerCase()}`, parts: [front.id], hardware: [{ id: 'push-open', qty: 1 }], step, status: 'unverified' });
      return;
    }
    if (ht === 'edge-profile') {
      const id = 'H' + (++hIdx);
      B.add({ id, name: 'Профиль-ручка', role: 'handle', group: 'handles', geom: 'profile', material: 'alu', materialName: 'Алюминий', thickness: 20, finish: null,
        L: fx1 - fx0, W: 20, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [fx0, fy1 - 20, fz], axes: ['x', 'y', 'z'], faceA: '+', sheet: false });
      B.joint({ kind: 'handle', title: `Профиль-ручка на ${front.name.toLowerCase()}`, parts: [front.id, id], hardware: [{ id: 'edge-profile', qty: r1((fx1 - fx0) / 1000) }, { id: 'screw-4x16', qty: Math.max(2, Math.ceil((fx1 - fx0) / 250)) }], step, status: 'unverified' });
      return;
    }
    let hx: number, hy: number, vertical = false;
    if (kind === 'drawer') { hx = (fx0 + fx1) / 2; hy = fy1 - Math.min(60, (fy1 - fy0) / 2); }
    else {
      hx = hingeLeft ? fx1 - 40 : fx0 + 40; vertical = c.handles.type === 'bar';
      hy = c.category === 'wardrobe' ? Math.min(fy1 - 120, Math.max(fy0 + 120, 1050)) : fy1 - 70;
    }
    const id = 'H' + (++hIdx), len = ht === 'bar' ? c.handles.size + 24 : 30;
    B.add({ id, name: ht === 'bar' ? `Ручка-скоба ${c.handles.size}` : 'Ручка-кнопка', role: 'handle', group: 'handles', geom: 'handle', material: 'metal', materialName: 'Металл', thickness: handleProtrusion(c), finish: null,
      L: len, W: ht === 'bar' ? 12 : 30, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none',
      origin: vertical ? [hx - 6, hy - len / 2, fz] : (ht === 'bar' ? [hx - len / 2, hy - 6, fz] : [hx - 15, hy - 15, fz]), axes: vertical ? ['y', 'x', 'z'] : ['x', 'y', 'z'], faceA: '+', sheet: false });
    const pts: V3[] = ht === 'bar' ? (vertical ? [[hx, hy - c.handles.size / 2, fz], [hx, hy + c.handles.size / 2, fz]] : [[hx - c.handles.size / 2, hy, fz], [hx + c.handles.size / 2, hy, fz]]) : [[hx, hy, fz]];
    // винт ручки: проходит фасад и — если попадает в переднюю стенку короба ящика — её тоже
    const wb = boxWall ? partBox(boxWall) : null;
    const through = !!wb && pts.every(P => P[0] - 2.5 >= wb.min[0] && P[0] + 2.5 <= wb.max[0] && P[1] - 2.5 >= wb.min[1] && P[1] + 2.5 <= wb.max[1]);
    const partly = !!wb && !through && pts.some(P => P[0] + 2.5 > wb.min[0] && P[0] - 2.5 < wb.max[0] && P[1] + 2.5 > wb.min[1] && P[1] - 2.5 < wb.max[1]);
    const pack = tf + (through ? boxWall!.thickness : 0), need = pack + HANDLE_THREAD, scr = SCREW_M4.find(L => L >= need) || SCREW_M4[SCREW_M4.length - 1];
    const parts = through ? [front.id, id, boxWall!.id] : [front.id, id];
    const note = `Винт М4×${scr}: ${through ? `фасад ${tf} + передняя стенка ящика ${boxWall!.thickness} = ${pack} мм` : `фасад ${tf} мм`}, ввинчивание в ручку ≥ ${HANDLE_THREAD} мм — правило программы, проверить по паспорту ручки. ` +
      (through ? 'Головка винта — внутри ящика, доступна при выдвинутом ящике. Ручку ставят после крепления фасада к коробу (сверление Ø5 насквозь через фасад и стенку по месту или по карте присадки).' : 'Головка винта — с обратной стороны фасада. Ручку ставят до навески фасада или при открытой двери.');
    const j = B.joint({ kind: 'handle', title: `Ручка на ${front.name.toLowerCase()} ${front.id}`, parts, hardware: [{ id: ht, qty: 1 }, { id: 'handle-screw', qty: pts.length }], step, status: 'partial', note });
    for (const P of pts) B.holeFace(front, P, '+', 5, 0, true, 'Ручка: сквозное Ø5', j.id, 'rule');
    if (through) for (const P of pts) { const Q: V3 = [P[0], P[1], wb!.max[2]]; B.holeFace(boxWall!, Q, '+', 5, 0, true, `Винт ручки ${id}: сквозное Ø5`, j.id, 'rule'); }
    B.checks.push({ level: partly ? 'error' : 'info', area: 'Ручки', part: front.id, joint: j.id,
      msg: partly ? `Винт ручки ${id} на ${front.id} попадает в край передней стенки ящика ${boxWall!.id}: отверстие Ø5 выходит за стенку.` : `Ручка ${id} на ${front.id}: ${note}`,
      fix: partly ? 'Сместите ручку или измените высоту ящика.' : undefined });
  };

  c.columns.forEach((col, ci) => {
    const { x: cxL, w: cw } = cols[ci];
    const zones = col.zones;
    const divAfter = zones.map((z, i) => i < zones.length - 1 && !(z.type === 'drawer' && zones[i + 1].type === 'drawer'));
    const nDiv = divAfter.filter(Boolean).length;
    const avail = innerH - nDiv * t;
    const fixedH = zones.reduce((s, z) => s + (z.height || 0), 0), autoZ = zones.filter(z => !z.height).length;
    const autoH = autoZ ? (avail - fixedH) / autoZ : 0;
    if (autoZ && autoH < 80) chk('error', `Секция ${ci + 1}`, 'Зоны секции не помещаются по высоте.', 'Уменьшите заданные высоты зон или количество ящиков.');
    if (!autoZ && Math.abs(fixedH - avail) > 1) chk('error', `Секция ${ci + 1}`, `Сумма высот зон ${fixedH} мм не равна доступной высоте ${r1(avail)} мм.`, 'Оставьте одну зону с автоматической высотой.');
    // сверху вниз
    let yTop = y0 + bodyH - t;
    const zr: { y0: number; y1: number; divBelow: boolean }[] = [];
    zones.forEach((z, zi) => { const h = z.height || autoH; zr.push({ y0: yTop - h, y1: yTop, divBelow: divAfter[zi] }); yTop -= h + (divAfter[zi] ? t : 0); });
    // неподвижные полки-разделители
    zr.forEach((r, zi) => {
      if (!r.divBelow) return;
      const yD = r.y0 - t, id = 'D' + (++divIdx);
      const dv = B.add({ id, name: 'Полка неподвижная', role: 'divider', group: 'body', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
        L: cw, W: innerFront - partDepthZ, edges: { L1: EDGE0, L2: edgeFor(c, matB, 'front'), W1: EDGE0, W2: EDGE0 }, grain: grain(wood),
        origin: [cxL, yD, partDepthZ], axes: ['x', 'z', 'y'], faceA: '+', sheet: true });
      confirmat(leftOf(ci), dv, 'x', '-', zPts(partDepthZ, innerFront).map(z => [cxL, yD + t / 2, z] as V3), `Полка неподвижная — ${leftOf(ci).name.toLowerCase()}`, 'dividers');
      confirmat(rightOf(ci), dv, 'x', '+', zPts(partDepthZ, innerFront).map(z => [cxL + cw, yD + t / 2, z] as V3), `Полка неподвижная — ${rightOf(ci).name.toLowerCase()}`, 'dividers');
      void zi;
    });
    // габариты фасадной сетки
    const outerL = ci === 0 ? x0 : cxL - t / 2, outerR = ci === nCol - 1 ? x0 + bodyW : cxL + cw + t / 2;
    zones.forEach((z, zi) => {
      const r = zr[zi];
      const oTop = zi === 0 ? y0 + bodyH : (zr[zi - 1].divBelow ? r.y1 + t / 2 : r.y1);
      const oBot = zi === zones.length - 1 ? y0 : (r.divBelow ? r.y0 - t / 2 : r.y0);
      const zh = r.y1 - r.y0;
      const frontRect = inset ? { x0: cxL + g, x1: cxL + cw - g, y0: r.y0 + g, y1: r.y1 - g, z: zFront - tf }
        : { x0: outerL + g / 2, x1: outerR - g / 2, y0: oBot + g / 2, y1: oTop - g / 2, z: zFront };
      if (z.type === 'door') {
        const fw = frontRect.x1 - frontRect.x0;
        const dbl = z.doors === 'double' || (z.doors === 'auto' && fw > c.production.maxDoorWidth);
        const leaves = dbl ? [{ x0: frontRect.x0, x1: (frontRect.x0 + frontRect.x1) / 2 - g / 2, left: true }, { x0: (frontRect.x0 + frontRect.x1) / 2 + g / 2, x1: frontRect.x1, left: false }]
          : [{ x0: frontRect.x0, x1: frontRect.x1, left: z.doors === 'left' ? true : z.doors === 'right' ? false : ci < nCol / 2 || nCol === 1 ? !(ci === nCol - 1 && nCol > 1) : false }];
        if (!dbl && fw > c.production.maxDoorWidth + 1) chk('warn', 'Фасады', `Дверь шириной ${r1(fw)} мм шире рекомендуемых ${c.production.maxDoorWidth} мм.`, 'Выберите «Две двери» или уменьшите ширину секции.');
        for (const lf of leaves) {
          const id = 'F' + (++fIdx), fh = frontRect.y1 - frontRect.y0, fwid = lf.x1 - lf.x0;
          const f = B.add({ id, name: 'Фасад двери', role: 'door', group: 'fronts', geom: 'panel', material: fMat, materialName: MATERIALS[fMat].name, thickness: tf, finish: fFin,
            L: fh, W: fwid, edges: fEdges(), grain: grain(fWood), origin: [lf.x0, frontRect.y0, frontRect.z], axes: ['y', 'x', 'z'], faceA: '+', sheet: true });
          if (c.fronts.design === 'milled-frame') f.ops.push({ id: 'm' + id, type: 'mill-frame', face: 'A', params: { inset: 60, width: 8, depth: 3 }, note: 'Фрезеровка декоративной рамки: отступ 60, ширина 8, глубина 3 мм' });
          // петли
          const n = hingeCount(fh), pos = Array.from({ length: n }, (_, i) => fh <= 300 ? 60 + (fh - 120) * i / (n - 1) : 100 + (fh - 200) * i / (n - 1));
          const carc = lf.left ? leftOf(ci) : rightOf(ci);
          const hj = B.joint({ kind: 'hinge', title: `Петли: ${f.name.toLowerCase()} ${id}`, parts: [id, carc.id], hardware: [{ id: 'hinge-blum', qty: n }, { id: 'hinge-plate', qty: n }, { id: 'screw-4x16', qty: 2 * n }], step: 'doors', status: 'partial',
            note: 'Чашки петель по документу Blum; ответные планки — требуют проверки' });
          const cupX = lf.left ? lf.x0 + HINGE_K + 17.5 : lf.x1 - HINGE_K - 17.5;
          for (const p of pos) B.holeFace(f, [cupX, frontRect.y0 + p, frontRect.z], '-', 35, 13, false, 'Чашка петли Ø35×13', hj.id, 'verified');
          if (tf < 16) chk('error', 'Фасады', `Чашка петли глубиной 13 мм не помещается в фасад ${tf} мм.`, 'Фасад от 16 мм.');
          const hingeX = lf.left ? lf.x0 : lf.x1;
          B.moving.push({ id: 'mv' + id, kind: 'door', parts: [id], hinge: [hingeX, 0, frontRect.z], axisSign: lf.left ? -1 : 1, front: id });
          fronts.push({ id, kind: 'door', hingeLeft: lf.left, col: ci });
          handleFor(f, 'door', lf.left, 'handles');
          if (c.handles.type === 'push') chk('warn', 'Фурнитура', 'Push-to-open с петлями: нужна петля без доводчика и толкатель — профиль не выбран.', 'Выберите ручку или согласуйте систему открывания.');
        }
        // наполнение за дверью
        addFill(z, ci, r, zh);
      } else if (z.type === 'drawer') {
        const id = 'F' + (++fIdx), fh = frontRect.y1 - frontRect.y0, fw = frontRect.x1 - frontRect.x0;
        const f = B.add({ id, name: 'Фасад ящика', role: 'drawer-front', group: 'fronts', geom: 'panel', material: fMat, materialName: MATERIALS[fMat].name, thickness: tf, finish: fFin,
          L: fw, W: fh, edges: fEdges(), grain: grain(fWood), origin: [frontRect.x0, frontRect.y0, frontRect.z], axes: ['x', 'y', 'z'], faceA: '+', sheet: true });
        if (c.fronts.design === 'milled-frame' && fh >= 160) f.ops.push({ id: 'm' + id, type: 'mill-frame', face: 'A', params: { inset: 40, width: 8, depth: 3 }, note: 'Фрезеровка декоративной рамки: отступ 40, ширина 8, глубина 3 мм' });
        const dn = ++drIdx; let boxWall: Part | undefined;
        // короб
        const depthAvail = innerFront - backFrontZ - 10;
        const slide = [...SLIDE_LENGTHS].reverse().find(s => s <= depthAvail);
        const boxH = zh - DRAWER_TOP_CLEAR - DRAWER_BOTTOM_CLEAR;
        const nDr = zones.filter(q => q.type === 'drawer').length;
        if (!slide) chk('error', 'Ящики', `Глубины корпуса недостаточно для направляющих (нужно от ${SLIDE_LENGTHS[0] + 10} мм внутри, есть ${r1(depthAvail + 10)} мм).`, 'Увеличьте глубину изделия.');
        if (boxH < 60) chk('error', 'Ящики', `Для ${nDr} ящ. недостаточно высоты: короб ящика получается ${r1(boxH)} мм (нужно от 60 мм).`, `Увеличьте высоту корпуса или выберите ${Math.max(1, nDr - 1)} ящ.`);
        if (slide && boxH >= 60) {
          const tbx = c.drawerBox.thickness, bm = c.drawerBox.material, bmName = DRAWER_BOX[bm].name, bw = cw - 2 * SLIDE_SIDE_GAP;
          const bx = cxL + SLIDE_SIDE_GAP, by = r.y0 + DRAWER_BOTTOM_CLEAR, bz = innerFront - slide - 2;
          const boxFin: Finish | null = bm === 'ldsp' ? { kind: 'decor', code: 'W-white', sheen: 'matte' } : null; // короб ящика — ЛДСП белая (тот же артикул, что белый корпус)
          const pre = `DR${dn}`, be = (vis: boolean) => vis ? edgeFor(c, bm === 'ldsp' ? 'ldsp' : 'plywood', 'side') : EDGE0;
          const sd1 = B.add({ id: pre + 'a', name: `Ящик ${dn}: боковина`, role: 'drawer-side', group: 'drawer' + dn, geom: 'panel', material: bm, materialName: bmName, thickness: tbx, finish: boxFin,
            L: slide, W: boxH, edges: { L1: EDGE0, L2: be(true), W1: be(true), W2: be(true) }, grain: 'none', origin: [bx, by + 0, bz], axes: ['z', 'y', 'x'], faceA: '-', sheet: true });
          const sd2 = B.add({ id: pre + 'b', name: `Ящик ${dn}: боковина`, role: 'drawer-side', group: 'drawer' + dn, geom: 'panel', material: bm, materialName: bmName, thickness: tbx, finish: boxFin,
            L: slide, W: boxH, edges: { L1: EDGE0, L2: be(true), W1: be(true), W2: be(true) }, grain: 'none', origin: [bx + bw - tbx, by, bz], axes: ['z', 'y', 'x'], faceA: '+', sheet: true });
          const fr = B.add({ id: pre + 'c', name: `Ящик ${dn}: передняя стенка`, role: 'drawer-front-wall', group: 'drawer' + dn, geom: 'panel', material: bm, materialName: bmName, thickness: tbx, finish: boxFin,
            L: bw - 2 * tbx, W: boxH, edges: { L1: EDGE0, L2: be(true), W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [bx + tbx, by, bz + slide - tbx], axes: ['x', 'y', 'z'], faceA: '+', sheet: true });
          const bk = B.add({ id: pre + 'd', name: `Ящик ${dn}: задняя стенка`, role: 'drawer-back-wall', group: 'drawer' + dn, geom: 'panel', material: bm, materialName: bmName, thickness: tbx, finish: boxFin,
            L: bw - 2 * tbx, W: boxH, edges: { L1: EDGE0, L2: be(true), W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [bx + tbx, by, bz], axes: ['x', 'y', 'z'], faceA: '-', sheet: true });
          const btm = B.add({ id: pre + 'e', name: `Ящик ${dn}: дно`, role: 'drawer-bottom', group: 'drawer' + dn, geom: 'panel', material: 'hdf', materialName: BACKS.hdf.name, thickness: 4, finish: null,
            L: slide, W: bw, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [bx, by - 4, bz], axes: ['z', 'x', 'y'], faceA: '-', sheet: true });
          // соединения короба
          const ys = boxH <= 120 ? [boxH / 2] : [Math.min(30, boxH / 4), boxH - Math.min(30, boxH / 4)];
          if (bm === 'ldsp' && tbx >= 16) {
            for (const [wallP, zc] of [[fr, bz + slide - tbx / 2], [bk, bz + tbx / 2]] as [Part, number][]) {
              confirmat(sd1, wallP, 'x', '-', ys.map(y => [bx + tbx, by + y, zc] as V3), `Ящик ${dn}: ${wallP.name.split(': ')[1]} — боковина`, 'drawers');
              confirmat(sd2, wallP, 'x', '+', ys.map(y => [bx + bw - tbx, by + y, zc] as V3), `Ящик ${dn}: ${wallP.name.split(': ')[1]} — боковина`, 'drawers');
            }
          } else {
            B.joint({ kind: 'screw', title: `Ящик ${dn}: сборка короба на саморезы и клей`, parts: [sd1.id, sd2.id, fr.id, bk.id], hardware: [{ id: 'screw-4x30', qty: 4 * ys.length }], step: 'drawers', status: 'rule', note: 'Фанера: саморез с предварительным сверлением Ø2,5 + клей ПВА' });
          }
          B.joint({ kind: 'nail', title: `Ящик ${dn}: дно`, parts: [btm.id, sd1.id, sd2.id, fr.id, bk.id], hardware: [{ id: 'back-nail', qty: Math.ceil(2 * (slide + bw) / 100) }], step: 'drawers', status: 'rule' });
          B.joint({ kind: 'slide', title: `Ящик ${dn}: направляющие ${slide} мм`, parts: [sd1.id, sd2.id, leftOf(ci).id, rightOf(ci).id], hardware: [{ id: 'slide', qty: 1 }, { id: 'screw-4x16', qty: 12 }], step: 'drawers-in', status: 'unverified',
            note: `Длина ${slide} мм; зазор ${SLIDE_SIDE_GAP} мм на сторону — правило программы` });
          boxWall = fr;
          // саморез фасад → короб: проходит стенку и входит в фасад, не выходя на лицевую сторону (остаток ≥ 3 мм)
          const sOk = [30, 25, 20, 16].find(L => L - tbx <= tf - 3 && L - tbx >= 6);
          B.joint({ kind: 'screw', title: `Ящик ${dn}: фасад к коробу`, parts: [id, fr.id], hardware: [{ id: sOk === 30 ? 'screw-4x30' : sOk === 25 ? 'screw-4x25' : 'screw-4x16', qty: fw > 500 ? 6 : 4 }], step: 'drawers-in', status: 'rule',
            note: sOk ? `Саморез 4×${sOk}: стенка ${tbx} мм + ${sOk - tbx} мм в фасад ${tf} мм (до лица остаётся ${tf - (sOk - tbx)} мм)` : 'Подходящей длины самореза нет' });
          if (!sOk) chk('error', 'Ящики', `Фасад ${id} ${tf} мм и стенка ящика ${tbx} мм: нет самореза, который держит фасад и не выходит на лицевую сторону.`, 'Увеличьте толщину фасада.');
          B.moving.push({ id: 'mv' + id, kind: 'drawer', parts: [id, sd1.id, sd2.id, fr.id, bk.id, btm.id], travel: slide - 30, front: id });
        }
        fronts.push({ id, kind: 'drawer', col: ci });
        handleFor(f, 'drawer', undefined, 'handles', boxWall);
        if (c.handles.type === 'push') chk('warn', 'Фурнитура', 'Push-to-open для ящиков требует направляющих с толкателем — профиль не выбран.', 'Выберите ручку или систему направляющих с push-to-open.');
      } else {
        addFill(z, ci, r, zh);
      }
    });

    function addFill(z: ProductConfig['columns'][0]['zones'][0], ci: number, r: { y0: number; y1: number }, zh: number) {
      const L = leftOf(ci), R = rightOf(ci), { x: cxL2, w: cw2 } = cols[ci];
      const rodY = z.rod ? r.y1 - 60 : null;
      const shelfD = innerFront - backFrontZ - (inset ? 2 : 20);
      const nS = z.shelves;
      if (nS > 0) {
        const lower = r.y0, upper = rodY ? Math.min(r.y1, rodY - 350) : r.y1;
        if (rodY && upper - lower < 300 * nS) chk('warn', `Секция ${ci + 1}`, 'Полки под штангой оставляют мало места для одежды.', 'Уменьшите число полок или уберите штангу.');
        for (let k = 1; k <= nS; k++) {
          const yS = lower + (upper - lower) * k / (nS + 1) - t / 2;
          if (yS + t > (rodY ?? r.y1) - 20) { chk('warn', `Секция ${ci + 1}`, 'Не все полки помещаются в зону.', 'Уменьшите число полок.'); break; }
          const id = 'SH' + (++shIdx);
          const sh = B.add({ id, name: 'Полка съёмная', role: 'shelf', group: 'shelves', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
            L: cw2 - 2, W: shelfD, edges: { L1: EDGE0, L2: edgeFor(c, matB, 'front'), W1: EDGE0, W2: EDGE0 }, grain: grain(wood),
            origin: [cxL2 + 1, yS, backFrontZ + 2], axes: ['x', 'z', 'y'], faceA: '+', sheet: true });
          const j = B.joint({ kind: 'shelf-pin', title: `${sh.name} ${id}`, parts: [id, L.id, R.id], hardware: [{ id: 'shelf-pin', qty: 4 }], step: 'shelves', status: 'partial' });
          const yP = yS - 6;
          for (const zz of [backFrontZ + 2 + 37, backFrontZ + 2 + shelfD - 37]) {
            B.holeFace(L, [cxL2, yP, zz], '+', 5, 10, false, 'Полкодержатель Ø5', j.id, 'rule');
            B.holeFace(R, [cxL2 + cw2, yP, zz], '-', 5, 10, false, 'Полкодержатель Ø5', j.id, 'rule');
          }
          shelfCheck(cw2 - 2, shelfD, ci);
        }
      }
      if (z.rod && rodY) {
        if (zh < 900) chk('warn', `Секция ${ci + 1}`, `Высота под штангу ${r1(zh)} мм мала для одежды на плечиках.`, 'Обычно нужно от 1000 мм (короткая одежда) до 1600 мм (длинная).');
        const id = 'R' + (++rodIdx);
        B.add({ id, name: 'Штанга Ø25', role: 'rod', group: 'shelves', geom: 'rod', material: 'steel', materialName: 'Сталь хромированная', thickness: 25, finish: null,
          L: cw2 - 4, W: 25, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [cxL2 + 2, rodY - 12.5, (backFrontZ + innerFront) / 2 - 12.5], axes: ['x', 'y', 'z'], faceA: '+', sheet: false });
        B.joint({ kind: 'rod', title: `Штанга ${id}`, parts: [id, L.id, R.id], hardware: [{ id: 'rod-holder', qty: 2 }, { id: 'screw-4x16', qty: 4 }], step: 'shelves', status: 'unverified' });
        if (cw2 > 1000) chk('warn', `Секция ${ci + 1}`, `Штанга длиной ${r1(cw2)} мм без промежуточной опоры может прогибаться.`, 'Разделите секцию перегородкой.');
      }
    }
  });

  function shelfCheck(span: number, depth: number, ci: number) {
    const m = MATERIALS[matB]; const q = c.production.shelfLoadKg * 9.81 / span; // Н/мм
    const I = depth * Math.pow(t, 3) / 12;
    const w = 5 * q * Math.pow(span, 4) / (384 * m.E * I) * m.creep;
    const lim = span / 300;
    if (c.production.shelfLoadKg > 0) chk(w > lim ? 'warn' : 'info', `Полки, секция ${ci + 1}`,
      `Оценка прогиба полки ${r1(span)} мм из «${m.name}» ${t} мм при ${c.production.shelfLoadKg} кг: ≈ ${r1(w)} мм с учётом ползучести (ориентир программы — не более ${r1(lim)} мм). ` +
      'Это оценка по формуле балки на двух опорах со справочным модулем упругости; проверенной методикой расчёта и гарантией несущей способности она не является.',
      w > lim ? 'Уменьшите пролёт перегородкой, увеличьте толщину или выберите более жёсткий материал.' : undefined);
  }

  /* ---- столешница ---- */
  if (c.top.enabled) {
    const tm = c.top.material, tt = c.top.thickness, tWood = isWoodLike(c.top.finish);
    const e = edgeFor(c, tm, 'front'), es = edgeFor(c, tm, 'side');
    const tp = B.add({ id: 'TT', name: 'Столешница', role: 'tabletop', group: 'top', geom: c.top.cornerRadius > 0 ? 'panel-radius' : 'panel', material: tm, materialName: MATERIALS[tm].name, thickness: tt, finish: c.top.finish,
      L: d.W, W: d.topD, edges: { L1: c.back.mount === 'overlay' ? EDGE0 : es, L2: e, W1: es, W2: es }, grain: grain(tWood), origin: [0, y0 + bodyH, 0], axes: ['x', 'z', 'y'], faceA: '+', sheet: true });
    if (c.top.cornerRadius > 0) {
      tp.ops.push({ id: 'rTT', type: 'radius', face: 'A', params: { r: c.top.cornerRadius, corners: 2 }, note: `Скругление двух передних углов R${c.top.cornerRadius} — фрезеровка по шаблону` });
      if (MATERIALS[tm].edge === 'pvc' && c.top.cornerRadius < 30) chk('warn', 'Столешница', `Радиус R${c.top.cornerRadius} мал для кромки ПВХ 2 мм.`, 'Увеличьте радиус до 30 мм и более.');
    }
    const n = 4 + 2 * Math.max(0, Math.ceil((bodyW - 600) / 600)), sc = t + tt * 2 / 3 >= 30 ? 'screw-4x30' : 'screw-4x25';
    B.joint({ kind: 'screw', title: 'Столешница к крыше корпуса', parts: ['TT', 'T1'], hardware: [{ id: sc, qty: n }], step: 'top', status: 'rule', note: 'Саморезы изнутри корпуса через крышу; длина — не более толщины крыши + 2/3 столешницы' });
    { const L = sc === 'screw-4x30' ? 30 : 25, pen = L - t; if (pen > tt - 3) chk('error', 'Столешница', `Саморез 4×${L} через крышу ${t} мм входит в столешницу ${tt} мм на ${pen} мм — до лица остаётся ${r1(tt - pen)} мм.`, 'Выберите столешницу толще или саморез короче.');
      else chk('info', 'Столешница', `Крепление столешницы: саморез 4×${L} через крышу ${t} мм, в столешницу ${pen} мм из ${tt} мм; ${n} шт. изнутри корпуса.`); }
    // скруглённые углы и выступающие фасады
    if (c.top.cornerRadius > 0) {
      const R = c.top.cornerRadius, D = d.topD, Wt = d.W;
      const edgeZ = (x: number) => x < 0 || x > Wt ? -Infinity : x < R ? D - R + Math.sqrt(R * R - (R - x) ** 2) : x > Wt - R ? D - R + Math.sqrt(R * R - (x - (Wt - R)) ** 2) : D;
      for (const f of B.parts.filter(q => q.group === 'fronts')) {
        const b = partBox(f), fz = b.max[2];
        for (const [x, side] of [[b.min[0], 'left'], [b.max[0], 'right']] as [number, 'left' | 'right'][]) {
          const v = r1(fz - edgeZ(x));
          if (v > 0.05) { (B as any).prot = [...((B as any).prot || []), { part: f.id, x: r1(x), z: r1(fz), value: v, side }];
            chk('warn', 'Столешница', `Фасад ${f.id} выступает за скруглённый угол R${R} столешницы у ${side === 'left' ? 'левого' : 'правого'} края на ${String(v).replace('.', ',')} мм (точка x = ${r1(x)} мм от левого края изделия).`, `Увеличьте вынос столешницы по бокам до ${Math.ceil(R - Math.sqrt(Math.max(0, R * R - (R - (D - fz)) ** 2)) + 0)} мм или уменьшите радиус.`); }
        }
      }
      void tp;
    }
  }

  /* ---- основание ---- */
  const bt = c.base.type;
  if (bt === 'legs-wood' || bt === 'legs-metal') {
    const hwId = bt === 'legs-wood' ? 'leg-wood' : 'leg-metal';
    const xs = bodyW > 1200 ? [x0 + 50, x0 + bodyW / 2, x0 + bodyW - 50] : [x0 + 50, x0 + bodyW - 50];
    const zs = [z0 + 50, zFront - 50];
    let k = 0;
    for (const x of xs) for (const z of zs) {
      const id = 'L' + (++k);
      B.add({ id, name: bt === 'legs-wood' ? 'Ножка деревянная' : 'Опора металлическая', role: 'leg', group: 'base', geom: 'leg', material: bt === 'legs-wood' ? 'wood' : 'metal', materialName: bt === 'legs-wood' ? 'Массив' : 'Металл', thickness: 40, finish: null,
        L: d.baseH, W: 40, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [x - 20, 0, z - 20], axes: ['y', 'x', 'z'], faceA: '+', sheet: false });
    }
    B.joint({ kind: 'leg', title: `${k} опор к дну`, parts: ['B1', ...Array.from({ length: k }, (_, i) => 'L' + (i + 1))], hardware: [{ id: hwId, qty: k }, { id: 'screw-4x16', qty: 4 * k }], step: 'base', status: 'unverified' });
    if (d.baseH < 40) chk('error', 'Основание', 'Высота ножек меньше 40 мм.', 'Выберите цоколь или ножки от 80 мм.');
  } else if (bt === 'plinth') {
    const ph = d.baseH, rec = c.base.plinthRecess, pz1 = zFront - rec - t, pz0 = z0 + 30;
    const pf = B.add({ id: 'PL1', name: 'Цоколь передний', role: 'plinth', group: 'base', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
      L: bodyW - 2 * 20, W: ph, edges: { L1: EDGE0, L2: EDGE0, W1: edgeFor(c, matB, 'side'), W2: edgeFor(c, matB, 'side') }, grain: grain(wood), origin: [x0 + 20, 0, pz1], axes: ['x', 'y', 'z'], faceA: '+', sheet: true });
    const pb = B.add({ id: 'PL2', name: 'Цоколь задний', role: 'plinth', group: 'base', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
      L: bodyW - 2 * 20, W: ph, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: grain(wood), origin: [x0 + 20, 0, pz0], axes: ['x', 'y', 'z'], faceA: '-', sheet: true });
    const sideLen = pz1 - (pz0 + t);
    const ps1 = B.add({ id: 'PL3', name: 'Цоколь боковой', role: 'plinth', group: 'base', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
      L: sideLen, W: ph, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: grain(wood), origin: [x0 + 20, 0, pz0 + t], axes: ['z', 'y', 'x'], faceA: '-', sheet: true });
    const ps2 = B.add({ id: 'PL4', name: 'Цоколь боковой', role: 'plinth', group: 'base', geom: 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: fin,
      L: sideLen, W: ph, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: grain(wood), origin: [x0 + bodyW - 20 - t, 0, pz0 + t], axes: ['z', 'y', 'x'], faceA: '+', sheet: true });
    const yy = ph <= 90 ? [ph / 2] : [25, ph - 25];
    confirmat(pf, ps1, 'z', '+', yy.map(y => [x0 + 20 + t / 2, y, pz1] as V3), 'Цоколь: передний — боковой', 'base');
    confirmat(pf, ps2, 'z', '+', yy.map(y => [x0 + bodyW - 20 - t / 2, y, pz1] as V3), 'Цоколь: передний — боковой', 'base');
    confirmat(pb, ps1, 'z', '-', yy.map(y => [x0 + 20 + t / 2, y, pz0 + t] as V3), 'Цоколь: задний — боковой', 'base');
    confirmat(pb, ps2, 'z', '-', yy.map(y => [x0 + bodyW - 20 - t / 2, y, pz0 + t] as V3), 'Цоколь: задний — боковой', 'base');
    const xsB = fastenerPositions(bodyW - 2 * 20 - 2 * t, 60, 400).map(v => x0 + 20 + t + v);
    confirmat(bot, pf, 'y', '+', xsB.map(x => [x, ph, pz1 + t / 2] as V3), 'Дно — цоколь передний', 'base-attach');
    confirmat(bot, pb, 'y', '+', xsB.map(x => [x, ph, pz0 + t / 2] as V3), 'Дно — цоколь задний', 'base-attach');
    B.joint({ kind: 'foot', title: 'Регулируемые опоры цоколя', parts: ['PL1', 'PL2'], hardware: [{ id: 'plinth-foot', qty: 4 }], step: 'base', status: 'unverified' });
    void ps2;
  } else if (bt === 'metal-frame') {
    const fh = d.baseH, x1 = x0 + bodyW, z1 = zFront; let k = 0;
    const tube = (name: string, L: number, origin: V3, axes: [Ax, Ax, Ax]) => B.add({ id: 'M' + (++k), name, role: 'frame', group: 'base', geom: 'tube', material: 'steel', materialName: 'Труба 20×20×1,5', thickness: TUBE, finish: null,
      L, W: TUBE, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin, axes, faceA: '+', sheet: false });
    for (const [x, z] of [[x0, z0], [x1 - TUBE, z0], [x0, z1 - TUBE], [x1 - TUBE, z1 - TUBE]] as [number, number][]) tube('Каркас: стойка', fh, [x, 0, z], ['y', 'x', 'z']);
    for (const z of [z0, z1 - TUBE]) tube('Каркас: продольная', bodyW - 2 * TUBE, [x0 + TUBE, fh - TUBE, z], ['x', 'y', 'z']);
    for (const x of [x0, x1 - TUBE]) tube('Каркас: поперечная', bodyD - 2 * TUBE, [x, fh - TUBE, z0 + TUBE], ['z', 'y', 'x']);
    B.joint({ kind: 'weld', title: 'Металлокаркас сварной (изготавливается отдельно)', parts: Array.from({ length: k }, (_, i) => 'M' + (i + 1)), hardware: [{ id: 'frame-glide', qty: 4 }], step: 'base', status: 'unverified', note: 'Сварка и порошковая окраска — по чертежу каркаса, у металлиста' });
    B.joint({ kind: 'screw', title: 'Корпус к каркасу', parts: ['B1', 'M5', 'M6'], hardware: [{ id: 'frame-bolt', qty: 4 + 2 * Math.max(0, Math.ceil((bodyW - 800) / 600)) }], step: 'base-attach', status: 'unverified' });
    if (fh < 100) chk('warn', 'Основание', 'Каркас ниже 100 мм — выбран как подиум.', undefined);
  } else if (bt === 'floor') {
    B.joint({ kind: 'glide', title: 'Подпятники на дно (без ножек)', parts: ['B1', 'S1', 'S2'], hardware: [{ id: 'glide', qty: bodyW > 1200 ? 6 : 4 }], step: 'base-attach', status: 'unverified' });
  } else if (bt === 'wall') {
    B.joint({ kind: 'wall', title: 'Крепление к стене', parts: ['BK', 'T1'], hardware: [{ id: 'wall-hanger', qty: 1 }], step: 'install', status: 'unverified' });
    const wb = c.base.wallBase;
    if (wb === 'unknown') chk('warn', 'Подвес', 'Не указано основание стены — крепление не подобрано.', 'Укажите материал стены в разделе «Ручки и основание».');
    if (wb === 'drywall') chk('error', 'Подвес', 'Гипсокартон без закладной не держит подвесную тумбу с нагрузкой.', 'Предусмотрите закладную (брус/фанера) в стене или выберите напольное исполнение.');
    if (wb === 'aerated') chk('warn', 'Подвес', 'Газобетон: нужны специальные дюбели для ячеистого бетона; несущая способность проверяется по их документации.', undefined);
  }

  /* ---- зеркало трюмо ---- */
  if (c.category === 'dresser' && c.mirror && c.mirror.type !== 'none') addMirror(B, c, d);

  /* ---- устойчивость ---- */
  stabilityCheck(B, c, d);

  /* ---- пересечения и движения ---- */
  collide(B, c);
  return finish(B, c, d);
}

/** Устойчивость с выдвинутыми ящиками: опрокидывание вперёд относительно передней линии опоры. Упрощённая статика. */
function stabilityCheck(B: Builder, c: ProductConfig, d: Derived) {
  const P = B.parts, bt = c.base.type;
  if (bt === 'wall') { (B as any).stab = { checked: false, ok: true, text: 'Подвесное изделие — устойчивость определяется креплением к стене.', antiTip: true, antiTipText: 'Крепление к стене — основное (см. «Подвес»).' }; return; }
  // передняя граница опоры
  let zs: number;
  const legs = P.filter(p => p.role === 'leg' || p.role === 'plinth' || p.role === 'frame');
  if (legs.length) zs = Math.max(...legs.map(p => partBox(p).max[2]));
  else zs = d.z0 + d.bodyD - (bt === 'floor' ? 30 : 0);
  const cz = (p: Part, dz = 0) => { const b = partBox(p); return (b.min[2] + b.max[2]) / 2 + dz; };
  const drawers = B.moving.filter(m => m.kind === 'drawer' && (m.axis || 'z') === 'z');
  const com = (load: number) => {
    let M = 0, Mz = 0;
    for (const p of P) { const mv = drawers.find(m => m.parts.includes(p.id)); const dz = mv && mv.kind === 'drawer' ? mv.travel : 0; M += p.mass; Mz += p.mass * cz(p, dz); }
    if (load) for (const m of drawers) { if (m.kind !== 'drawer') continue; const box = m.parts.slice(1).map(id => partBox(B.get(id))); const z = box.length ? (Math.min(...box.map(b => b.min[2])) + Math.max(...box.map(b => b.max[2]))) / 2 + m.travel : 0; M += load; Mz += load * z; }
    return Mz / Math.max(M, 0.001);
  };
  const z0e = com(0), z1 = com(DRAWER_LOAD_KG), okE = z0e < zs - 5, okL = z1 < zs - 5;
  const tall = d.H >= 1200 || c.category === 'wardrobe' || (c.category === 'dresser' && !!c.mirror && c.mirror.type !== 'none' && c.mirror.mount === 'top');
  const f = (v: number) => String(r1(v)).replace('.', ',');
  const text = drawers.length ? `Все ящики (${drawers.length}) выдвинуты полностью. Передняя граница опоры — ${f(zs)} мм от задней плоскости. Пустые ящики: центр масс ${f(z0e)} мм — ${okE ? 'не опрокидывается' : 'ОПРОКИДЫВАЕТСЯ'}. С загрузкой по ${DRAWER_LOAD_KG} кг: центр масс ${f(z1)} мм — ${okL ? 'не опрокидывается' : 'опрокидывается'}. Упрощённая статика по массам деталей, без толчков, наклона пола и нагрузки на столешницу.`
    : 'Ящиков нет — проверка опрокидывания при выдвижении не требуется.';
  const need = tall || !okL;
  const antiTipText = need ? `Не предусмотрено — ${!okL ? 'по расчёту изделие с загруженными ящиками опрокидывается, ' : ''}нужно крепление к стене от опрокидывания (уголок или ремень, подбор по основанию стены — монтажник).` : 'Не предусмотрено; по расчёту не обязательно, рекомендуется при детях в доме.';
  (B as any).stab = { checked: drawers.length > 0, ok: okE && okL, okEmpty: okE, need, text, antiTip: false, antiTipText };
  if (drawers.length) B.checks.push({ level: !okE || !okL ? 'warn' : 'info', area: 'Устойчивость', msg: text, fix: okE && okL ? undefined : 'Закрепите изделие к стене, уменьшите выдвижение или увеличьте глубину опоры.' });
  B.checks.push({ level: need ? 'warn' : 'info', area: 'Устойчивость', msg: 'Крепление от опрокидывания: ' + antiTipText });
}

/** Зеркало: щит из материала корпуса + зеркальное стекло 4 мм на клею со страховочными держателями. */
function addMirror(B: Builder, c: ProductConfig, d: Derived) {
  const mr = c.mirror!, t = d.t, mw = Math.min(mr.width, d.W), mh = mr.height, arch = mr.type === 'arch';
  const onTop = mr.mount === 'top', y0 = onTop ? d.H : d.H + 150, x0 = (d.W - mw) / 2, z0 = 0;
  const r = arch ? Math.min(mw / 2, mh) : 0, matB = c.body.material, e = edgeFor(c, matB, 'side');
  const board = B.add({ id: 'MR1', name: 'Щит зеркала', role: 'mirror-board', group: 'mirror', geom: arch ? 'panel-radius' : 'panel', material: matB, materialName: MATERIALS[matB].name, thickness: t, finish: c.body.finish,
    L: mw, W: mh, edges: { L1: e, L2: e, W1: e, W2: e }, grain: isWoodLike(c.body.finish) ? 'W' : 'none', origin: [x0, y0, z0], axes: ['x', 'y', 'z'], faceA: '+', sheet: true });
  if (arch) board.ops.push({ id: 'rMR1', type: 'radius', face: 'A', params: { r, corners: 2 }, note: `Верх щита по дуге R${Math.round(r)} — фрезеровка по шаблону` });
  const gl = B.add({ id: 'MR2', name: 'Зеркало 4 мм (заказ в стекольной мастерской)', role: 'mirror', group: 'mirror', geom: 'mirror', material: 'glass', materialName: 'Зеркало 4 мм, полированная кромка', thickness: 4, finish: null,
    L: mw - 40, W: mh - 40, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [x0 + 20, y0 + 20, z0 + t], axes: ['x', 'y', 'z'], faceA: '+', sheet: false });
  if (arch) gl.ops.push({ id: 'rMR2', type: 'radius', face: 'A', params: { r: Math.max(0, r - 20), corners: 2 }, note: 'Резка зеркала по дуге — в стекольной мастерской' });
  B.joint({ kind: 'glue', title: 'Зеркало на щит: клей и страховочные держатели', parts: ['MR2', 'MR1'], hardware: [{ id: 'mirror-glue', qty: 1 }, { id: 'mirror-clip', qty: 4 }], step: 'mirror', status: 'unverified' });
  if (onTop) {
    B.joint({ kind: 'screw', title: 'Щит зеркала к корпусу трюмо', parts: ['MR1', c.top.enabled ? 'TT' : 'T1', 'BK'], hardware: [{ id: 'mirror-bracket', qty: 2 }, { id: 'screw-4x16', qty: 8 }], step: 'mirror', status: 'unverified' });
    if (mh > 1.2 * mw && mh > 900) B.checks.push({ level: 'warn', area: 'Зеркало', msg: 'Высокое узкое зеркало на столешнице может раскачиваться.', fix: 'Закрепите щит к стене или выберите зеркало на стену.' });
  } else {
    B.joint({ kind: 'wall', title: 'Зеркало на стену', parts: ['MR1'], hardware: [{ id: 'wall-hanger', qty: 1 }], step: 'install', status: 'unverified' });
    if (c.base.wallBase === 'unknown') B.checks.push({ level: 'warn', area: 'Зеркало', msg: 'Не указано основание стены — крепление зеркала не подобрано.', fix: 'Укажите материал стены в разделе «Ручки и основание».' });
  }
  if (mw > d.W) B.checks.push({ level: 'error', area: 'Зеркало', msg: 'Зеркало шире трюмо.', fix: `Уменьшите ширину зеркала до ${d.W} мм.` });
  if (mh < 300) B.checks.push({ level: 'warn', area: 'Зеркало', msg: 'Зеркало ниже 300 мм неудобно.', fix: 'Обычно 600–1000 мм.' });
}

/** Пересечения: недопустимые коллизии отделяются от предусмотренных сопряжений (паз, касание). */
function collide(B: Builder, c: ProductConfig) {
  const P = B.parts, boxes = P.map(partBox), eps = 0.2;
  const allowed = (a: Part, b: Part) => {
    const s = new Set([a.role, b.role]);
    if (s.has('back') && c.back.mount === 'groove' && (s.has('side') || s.has('top') || s.has('bottom'))) return 'паз';
    if (s.has('handle') || s.has('leg') || s.has('frame')) return 'касание';
    return '';
  };
  const ov = (A: { min: V3; max: V3 }, Bx: { min: V3; max: V3 }) => [0, 1, 2].every(i => A.min[i] < Bx.max[i] - eps && Bx.min[i] < A.max[i] - eps);
  let bad = 0;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    if (!ov(boxes[i], boxes[j])) continue;
    const why = allowed(P[i], P[j]);
    if (why) continue;
    bad++; if (bad <= 6) B.checks.push({ level: 'error', area: 'Пересечения', msg: `Детали «${P[i].name}» (${P[i].id}) и «${P[j].name}» (${P[j].id}) пересекаются.`, fix: 'Измените размеры или наполнение секции.' });
  }
  if (!bad) B.checks.push({ level: 'ok', area: 'Пересечения', msg: 'Недопустимых пересечений деталей нет (паз задней стенки — предусмотренное сопряжение).' });
  // движение ящиков: короб и фасад при полном выдвижении не задевают неподвижные детали
  for (const m of B.moving) {
    const own = new Set(m.parts);
    if (m.kind === 'drawer') {
      const hit = P.filter(p => !own.has(p.id) && p.role !== 'handle' && !B.moving.some(o => o !== m && o.parts.includes(p.id))).find(p => m.parts.some(id => {
        const a = partBox(B.get(id)), k = m.axis === 'x' ? 0 : 2, mv = { min: [...a.min] as V3, max: [...a.max] as V3 }; mv.min[k] += m.travel; mv.max[k] += m.travel;
        return ov(mv, partBox(p));
      }));
      if (hit) B.checks.push({ level: 'error', area: 'Движение', msg: `Ящик (${m.front}) при выдвижении задевает «${hit.name}».`, fix: 'Проверьте зазоры и столешницу.' });
    } else {
      const f = partBox(B.get(m.front)), w = f.max[0] - f.min[0];
      const sw = { min: [m.axisSign < 0 ? f.min[0] : f.max[0] - (f.max[2] - f.min[2]), f.min[1], f.max[2]] as V3, max: [m.axisSign < 0 ? f.min[0] + (f.max[2] - f.min[2]) : f.max[0], f.max[1], f.max[2] + w] as V3 };
      const hit = P.filter(p => (p.role === 'door' || p.role === 'drawer-front' || p.role === 'tabletop') && p.id !== m.front).find(p => ov(sw, partBox(p)));
      if (hit) B.checks.push({ level: 'warn', area: 'Движение', msg: `Дверь ${m.front} при открывании на 90° может задеть «${hit.name}».`, fix: 'Увеличьте зазор или вынос столешницы.' });
    }
  }
  B.checks.push({ level: 'ok', area: 'Движение', msg: 'Проверено: ящики при полном выдвижении, двери при открывании на 90° (упрощённо, по габаритам деталей).' });
  // отверстия: в пределах детали и глубина меньше толщины
  let hb = 0;
  for (const p of P) for (const h of p.holes) {
    const inPlane = h.face === 'A' || h.face === 'B';
    const [U, V] = inPlane ? [p.L, p.W] : h.face.startsWith('L') ? [p.L, p.thickness] : [p.W, p.thickness];
    const r = h.d / 2;
    if (h.u - r < -0.01 || h.u + r > U + 0.01 || h.v - r < -0.01 || h.v + r > V + 0.01) { hb++; B.checks.push({ level: 'error', area: 'Присадка', msg: `Отверстие Ø${h.d} на детали ${p.id} выходит за границы.`, fix: 'Измените размеры.' }); }
    if (inPlane && !h.through && h.depth >= p.thickness - 2) { hb++; B.checks.push({ level: 'error', area: 'Присадка', msg: `Глухое отверстие Ø${h.d}×${h.depth} на детали ${p.id} (${p.thickness} мм) почти сквозное.`, fix: 'Увеличьте толщину детали.' }); }
    if (!inPlane && h.depth > (h.face.startsWith('L') ? p.W : p.L)) { hb++; B.checks.push({ level: 'error', area: 'Присадка', msg: `Отверстие в торце детали ${p.id} глубже детали.`, fix: 'Увеличьте размер детали.' }); }
  }
  if (!hb) B.checks.push({ level: 'ok', area: 'Присадка', msg: 'Все отверстия в пределах деталей, глухие отверстия не выходят на лицевую сторону.' });
}

export function finish(B: Builder, c: ProductConfig, d: Derived, extra: { ghosts?: ManufacturingModel['ghosts']; overall?: ManufacturingModel['overall'] } = {}): ManufacturingModel {
  // спецификация фурнитуры = сумма по соединениям
  const hw = new Map<string, { id: string; qty: number; joints: string[] }>();
  for (const j of B.joints) for (const h of j.hardware) { const e = hw.get(h.id) || { id: h.id, qty: 0, joints: [] }; e.qty = r1(e.qty + h.qty); e.joints.push(j.id); hw.set(h.id, e); }
  const seen = new Set<string>(); B.checks = B.checks.filter(x => { const k = x.level + x.msg; if (seen.has(k)) return false; seen.add(k); return true; });
  const steps = buildSteps(B, c);
  const mass = B.parts.reduce((s, p) => s + p.mass, 0) + [...hw.values()].reduce((s, h) => s + (HW[h.id]?.massG || 0) * h.qty / 1000, 0);
  // статусы фурнитуры
  for (const h of hw.values()) {
    const p = HW[h.id];
    if (p && p.status === 'unverified' && p.missing.length) B.checks.push({ level: 'warn', area: 'Фурнитура', msg: `«${p.name}»: профиль не проверен — отверстия не формируются.`, fix: 'Не хватает: ' + p.missing.join('; ') + '.' });
  }
  if (c.base.type === 'wall') B.checks.push({ level: 'info', area: 'Подвес', msg: `Масса тумбы ≈ ${r1(mass)} кг без содержимого. Крепление подбирается по основанию стены, массе и нагрузке.` });
  const ht = handleProtrusion(c);
  return {
    schema: MODEL_SCHEMA, version: MODEL_VERSION, configHash: hashConfig(c),
    overall: extra.overall || (() => { const mt = c.category === 'dresser' && c.mirror && c.mirror.type !== 'none' && c.mirror.mount === 'top';
      const zMax = B.parts.length ? r1(Math.max(...B.parts.map(q => partBox(q).max[2]))) : d.D;
      return { width: d.W, height: d.H + (mt ? c.mirror!.height : 0), depth: d.D, depthTop: c.top.enabled ? d.topD : d.D, depthMax: Math.max(d.D, zMax), includes: { base: c.base.type !== 'wall' && c.base.type !== 'floor', top: c.top.enabled, fronts: !d.inset, handles: ht === 0, mirror: mt }, handleProtrusion: ht }; })(),
    ghosts: extra.ghosts,
    protrusions: (B as any).prot, stability: (B as any).stab,
    body: { x0: d.x0, y0: d.y0, z0: d.z0, W: d.bodyW, H: d.bodyH, D: d.bodyD, t: d.t },
    parts: B.parts, joints: B.joints, moving: B.moving, checks: B.checks, steps,
    hardware: [...hw.values()], massKg: Math.round(mass * 10) / 10,
    status: B.joints.some(j => j.status !== 'verified' && j.status !== 'rule') ? 'needs-review' : 'draft',
  };
}

const STEP_ORDER: { key: string; title: string; text: (B: Builder) => string[] }[] = [
  { key: 'base', title: 'Основание', text: () => ['Соберите основание и установите опоры.'] },
  { key: 'body', title: 'Крыша и дно к левой боковине', text: () => ['Положите левую боковину наружной стороной вниз на чистую мягкую поверхность.', 'Приставьте крышу и дно кромкой к боковине, совместите отверстия и закрутите конфирматы.'] },
  { key: 'partitions', title: 'Перегородки', text: () => ['Установите перегородки между крышей и дном и закрепите конфирматами через крышу и дно.'] },
  { key: 'dividers', title: 'Неподвижные полки', text: () => ['Установите неподвижные полки между боковинами и перегородками, закрепите конфирматами.'] },
  { key: 'back', title: 'Задняя стенка', text: (B) => [B.c.back.mount === 'groove' ? 'Вставьте заднюю стенку в пазы боковины, крыши и дна гладкой стороной внутрь корпуса.' : 'Задняя стенка крепится после установки второй боковины — переходите к следующему шагу.'] },
  { key: 'body-close', title: 'Правая боковина', text: (B) => ['Наденьте правую боковину на крышу и дно, закрутите конфирматы.', 'Измерьте диагонали корпуса — они должны совпадать (±2 мм).', ...(B.c.back.mount === 'overlay' ? ['Прибейте заднюю стенку с шагом 150 мм, выровняв корпус по диагоналям.'] : [])] },
  { key: 'base-attach', title: 'Корпус на основание', text: () => ['Поставьте корпус на основание и закрепите.'] },
  { key: 'top', title: 'Столешница', text: () => ['Положите столешницу с равными выносами и закрепите саморезами изнутри корпуса.'] },
  { key: 'drawers', title: 'Сборка ящиков', text: () => ['Соберите короб каждого ящика: боковины, переднюю и заднюю стенки.', 'Выставьте прямой угол и прибейте дно.'] },
  { key: 'drawers-in', title: 'Направляющие и фасады ящиков', text: () => ['Закрепите направляющие на корпусе и коробах по инструкции производителя направляющих.', 'Вставьте ящики, приложите фасад с равными зазорами и закрепите саморезами изнутри короба.'] },
  { key: 'doors', title: 'Двери', text: () => ['Вставьте петли в чашки фасадов, закрепите ответные планки на боковинах по инструкции производителя.', 'Навесьте двери и отрегулируйте зазоры винтами петель.'] },
  { key: 'shelves', title: 'Полки и штанги', text: () => ['Вставьте полкодержатели и положите полки.', 'Закрепите штангодержатели и установите штангу.'] },
  { key: 'handles', title: 'Ручки', text: () => ['Закрепите ручки винтами изнутри фасадов.'] },
  { key: 'bed-frame', title: 'Каркас кровати', text: () => ['Положите изголовье лицевой стороной вниз на мягкую поверхность.', 'Присоедините боковые царги к изголовью кроватными стяжками, затем изножье или царгу изножья. Не затягивайте до конца.', 'Выставьте прямые углы (диагонали равны) и затяните стяжки.'] },
  { key: 'bed-beam', title: 'Центральная балка', text: () => ['Установите центральную балку по оси кровати и закрепите уголками к изголовью и изножью.'] },
  { key: 'bed-slats', title: 'Основание под матрас', text: () => ['Закрепите латодержатели (или опорные бруски) на внутренней стороне царг и балки на одной высоте.', 'Вставьте ламели или уложите щиты основания.'] },
  { key: 'bed-drawers', title: 'Выкатные ящики', text: () => ['Соберите короба ящиков, прикрутите колёса к дну и фасад к коробу.'] },
  { key: 'mirror', title: 'Зеркало', text: () => ['Приклейте зеркало к щиту клеем для зеркал, поставьте страховочные держатели и дайте клею высохнуть по его инструкции.', 'Закрепите щит зеркала кронштейнами к корпусу трюмо.'] },
  { key: 'install', title: 'Установка на стену', text: () => ['Крепление к стене выполняет монтажник после выбора крепежа по основанию стены и массе изделия.'] },
];

function buildSteps(B: Builder, c: ProductConfig): AssemblyStep[] {
  const steps: AssemblyStep[] = []; const shown = new Set<string>();
  // основание ставится первым только для цоколя и каркаса; ножки — после корпуса
  const order = [...STEP_ORDER];
  if (c.base.type.startsWith('legs')) { const i = order.findIndex(s => s.key === 'base'); const [s] = order.splice(i, 1); order.splice(order.findIndex(s2 => s2.key === 'base-attach'), 0, { ...s, title: 'Опоры', text: () => ['Переверните корпус на крышу (подложите мягкий материал) и прикрутите опоры к дну.'] }); }
  for (const s of order) {
    const js = B.joints.filter(j => j.step === s.key);
    if (!js.length) continue;
    const parts = [...new Set(js.flatMap(j => j.parts))];
    const hwm = new Map<string, number>(); for (const j of js) for (const h of j.hardware) hwm.set(h.id, (hwm.get(h.id) || 0) + h.qty);
    const tools = [...new Set([...hwm.keys()].flatMap(h => (HW_TOOLS[h] || [])))];
    const fresh = parts.filter(p => !shown.has(p));
    parts.forEach(p => shown.add(p));
    const extra: string[] = [];
    if (js.some(j => j.status === 'unverified')) extra.push('Крепёж этого шага не имеет проверенного профиля — следуйте инструкции производителя выбранной фурнитуры.');
    steps.push({ id: 'st' + (steps.length + 1), title: s.title, text: [...s.text(B), ...extra], parts, fresh, hardware: [...hwm].map(([id, qty]) => ({ id, qty: Math.round(qty * 10) / 10 })), tools, joints: js.map(j => j.id), show: [...shown] });
  }
  return steps;
}
import { HARDWARE_TOOLS as HW_TOOLS } from './hardware';
export type { Finish };
