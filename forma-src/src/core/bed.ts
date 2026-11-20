/**
 * Кровать: изголовье, изножье (или царга изножья), боковые царги, центральная балка, основание (ламели или щиты),
 * опоры, выкатные ящики. Мировые оси: X — поперёк кровати, Z — от изголовья (Z = 0) к ногам, Y — вверх.
 */
import type { ProductConfig, Part, ManufacturingModel, Check } from './schema';
import { Builder, EDGE0, edgeFor, finish, derive, fastenerPositions, partBox } from './engine';
import { MATERIALS, isWoodLike, DRAWER_BOX } from './materials';

type V3 = [number, number, number];
export const MATTRESS_W = [80, 90, 120, 140, 160, 180, 200].map(x => x * 10);
export const MATTRESS_L = [1900, 2000, 2100];
export const BED_DEFAULT: NonNullable<ProductConfig['bed']> = { mattressW: 1600, mattressL: 2000, base: 'slats', headH: 1000, head: 'flat', footboard: false, footH: 450, railH: 220, drawers: 0 };
export const LAMEL_W = 53, LAMEL_PITCH = 110, LAMEL_T = 8, SINK = 50;

/** Габариты кровати по матрасу — ими заполняется config.size. */
export function bedSize(c: ProductConfig) {
  const b = c.bed || BED_DEFAULT, t = c.body.thickness, iw = b.mattressW + 20, il = b.mattressL + 20;
  return { width: iw + 2 * t, depth: il + 2 * t, height: Math.max(b.headH, b.footboard ? b.footH : 0) };
}

export function buildBed(c: ProductConfig): ManufacturingModel {
  const b = c.bed || BED_DEFAULT, d0 = derive(c), B = new Builder(c, d0);
  const t = c.body.thickness, mat = c.body.material, fin = c.body.finish, grain = (isWoodLike(fin) || (MATERIALS[mat].grainDefault && fin.kind !== 'ral')) ? 'L' as const : 'none' as const;
  const chk = (level: Check['level'], area: string, msg: string, fix?: string) => B.checks.push({ level, area, msg, fix });
  const iw = b.mattressW + 20, il = b.mattressL + 20, W = iw + 2 * t, D = il + 2 * t;
  const bt = c.base.type, legsH = bt === 'floor' || bt === 'wall' ? 0 : c.base.height;
  const railY = legsH, railTop = legsH + b.railH, slatTop = railTop - SINK;
  const side = edgeFor(c, mat, 'side'), front = edgeFor(c, mat, 'front');
  if (bt === 'wall') chk('error', 'Основание', 'Кровать не может быть подвесной.', 'Выберите ножки, цоколь или металлокаркас.');
  if (b.railH < 120 || b.railH > 400) chk('error', 'Царги', `Высота царги ${b.railH} мм вне диапазона 120–400 мм.`, 'Обычно 180–250 мм.');
  if (b.headH < railTop + 100) chk('error', 'Изголовье', `Изголовье ${b.headH} мм ниже верха царги ${railTop} мм + 100.`, `Увеличьте изголовье до ${railTop + 100} мм и более.`);
  if (b.headH > 1600) chk('error', 'Изголовье', 'Изголовье выше 1600 мм.', 'Уменьшите высоту.');
  if (b.footboard && b.footH < railTop) chk('error', 'Изножье', `Изножье ${b.footH} мм ниже верха царги ${railTop} мм.`, `Увеличьте изножье до ${railTop} мм или уберите его.`);
  if (t < 18) chk('warn', 'Материалы', `Царги ${t} мм тонковаты для кровати.`, 'Обычно 18–25 мм.');
  if (slatTop + 200 < 380) chk('info', 'Высота', `Верх матраса ≈ ${slatTop + 200} мм от пола (при матрасе 200 мм) — низкая кровать.`);

  const panel = (id: string, name: string, role: string, L: number, Wd: number, origin: V3, axes: [any, any, any], faceA: '+' | '-', edges = { L1: side, L2: side, W1: side, W2: side }, geom: Part['geom'] = 'panel') =>
    B.add({ id, name, role, group: role.startsWith('drawer') ? 'drawers' : 'frame', geom, material: mat, materialName: MATERIALS[mat].name, thickness: t, finish: fin, L, W: Wd, edges, grain, origin, axes, faceA, sheet: true });

  // изголовье — стоит на полу, служит опорой
  const head = panel('HB', 'Изголовье', 'headboard', W, b.headH, [0, 0, 0], ['x', 'y', 'z'], '+', { L1: EDGE0, L2: front, W1: side, W2: side }, b.head === 'arch' ? 'panel-radius' : 'panel');
  if (b.head === 'arch') head.ops.push({ id: 'rHB', type: 'radius', face: 'A', params: { r: Math.min(300, W / 2), corners: 2 }, note: 'Скругление верхних углов изголовья R' + Math.min(300, W / 2) });
  if (c.fronts.design === 'milled-frame' && MATERIALS[mat].milling) head.ops.push({ id: 'mHB', type: 'mill-frame', face: 'A', params: { inset: 80, width: 8, depth: 3 }, note: 'Фрезеровка рамки изголовья' });
  // царги
  const rl = panel('RL', 'Царга левая', 'rail', il, b.railH, [0, railY, t], ['z', 'y', 'x'], '-', { L1: side, L2: side, W1: EDGE0, W2: EDGE0 });
  const rr = panel('RR', 'Царга правая', 'rail', il, b.railH, [t + iw, railY, t], ['z', 'y', 'x'], '+', { L1: side, L2: side, W1: EDGE0, W2: EDGE0 });
  const ys = (h: number) => (h <= 160 ? [h / 2] : [40, h - 40]);
  B.joint({ kind: 'bed-bolt', title: 'Царги к изголовью', parts: ['HB', 'RL', 'RR'], hardware: [{ id: 'bed-bolt', qty: 2 * ys(b.railH).length }], step: 'bed-frame', status: 'unverified', note: 'Стяжки по схеме производителя' });
  // изножье
  let footId: string;
  if (b.footboard) {
    panel('FB', 'Изножье', 'footboard', W, b.footH, [0, 0, t + il], ['x', 'y', 'z'], '+', { L1: EDGE0, L2: front, W1: side, W2: side }); footId = 'FB';
  } else {
    panel('FR', 'Царга изножья', 'rail', W, b.railH, [0, railY, t + il], ['x', 'y', 'z'], '+', { L1: side, L2: side, W1: side, W2: side }); footId = 'FR';
  }
  B.joint({ kind: 'bed-bolt', title: b.footboard ? 'Царги к изножью' : 'Царги к царге изножья', parts: [footId, 'RL', 'RR'], hardware: [{ id: 'bed-bolt', qty: 2 * ys(b.railH).length }], step: 'bed-frame', status: 'unverified' });
  // центральная балка
  const beam = iw > 1300;
  const beamH = 100;
  if (beam) {
    panel('CB', 'Центральная балка', 'beam', il, beamH, [t + iw / 2 - t / 2, slatTop - LAMEL_T - beamH, t], ['z', 'y', 'x'], '+', { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 });
    B.joint({ kind: 'bracket', title: 'Центральная балка к изголовью и изножью', parts: ['CB', 'HB', footId], hardware: [{ id: 'bracket', qty: 2 }, { id: 'screw-4x30', qty: 8 }], step: 'bed-beam', status: 'unverified' });
  }
  // основание
  const rows = beam ? 2 : 1, rowW = beam ? (iw - t) / 2 : iw;
  if (b.base === 'slats') {
    const n = Math.floor((il - 60 - LAMEL_W) / LAMEL_PITCH) + 1, z0 = t + (il - ((n - 1) * LAMEL_PITCH + LAMEL_W)) / 2;
    let k = 0;
    for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
      const x = t + 5 + r * (rowW + t), len = rowW - 10;
      B.add({ id: 'LM' + (++k), name: 'Ламель 53×8', role: 'slat', group: 'base-slats', geom: 'slat', material: 'birch', materialName: 'Гнутоклеёная берёза', thickness: LAMEL_T, finish: null,
        L: len, W: LAMEL_W, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [x, slatTop - LAMEL_T, z0 + i * LAMEL_PITCH], axes: ['x', 'z', 'y'], faceA: '+', sheet: false });
    }
    B.joint({ kind: 'slats', title: `Ламели: ${rows} ряд(а) по ${n} шт.`, parts: ['RL', 'RR', ...(beam ? ['CB'] : [])], hardware: [{ id: 'lamel', qty: k }, { id: 'lath-holder', qty: 2 * k }, { id: 'screw-4x16', qty: 4 * k }], step: 'bed-slats', status: 'unverified',
      note: `Шаг ${LAMEL_PITCH} мм, зазор ${LAMEL_PITCH - LAMEL_W} мм — правило программы; проверьте требования производителя матраса` });
    if (beam && rowW > 1000) chk('warn', 'Основание', `Ламели длиной ${Math.round(rowW)} мм — выберите ламели под такой пролёт.`);
  } else {
    const pl = Math.ceil(il / 1000), plen = il / pl;
    for (let r = 0; r < rows; r++) for (let i = 0; i < pl; i++) {
      B.add({ id: `BP${r + 1}${i + 1}`, name: 'Щит основания', role: 'base-panel', group: 'base-slats', geom: 'panel', material: 'ldsp', materialName: MATERIALS.ldsp.name, thickness: 16, finish: null,
        L: rowW - 4, W: plen - 4, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [t + 2 + r * (rowW + t), slatTop - 16, t + 2 + i * plen], axes: ['x', 'z', 'y'], faceA: '+', sheet: true });
    }
    B.joint({ kind: 'screw', title: 'Щиты основания на опорные бруски', parts: ['RL', 'RR', ...(beam ? ['CB'] : [])], hardware: [{ id: 'bar-40x30', qty: Math.round((2 + (beam ? 2 : 0)) * il / 100) / 10 }, { id: 'screw-4x30', qty: Math.ceil(il / 200) * (2 + (beam ? 2 : 0)) }], step: 'bed-slats', status: 'rule', note: 'Бруски по внутренней стороне царг на 16 мм ниже уровня основания' });
    chk('info', 'Основание', 'Сплошное основание хуже проветривает матрас, чем ламели. Уточните у производителя матраса.');
  }
  // опоры
  const legPts: [number, number][] = [];
  if (!b.footboard) legPts.push([t / 2, t + il - 40], [t + iw + t / 2, t + il - 40]);
  if (beam) legPts.push([t + iw / 2, t + il / 3], [t + iw / 2, t + 2 * il / 3]);
  if ((bt === 'legs-wood' || bt === 'legs-metal') && legsH > 0) {
    legPts.forEach(([x, z], i) => B.add({ id: 'L' + (i + 1), name: bt === 'legs-wood' ? 'Ножка деревянная' : 'Опора металлическая', role: 'leg', group: 'base', geom: 'leg', material: bt === 'legs-wood' ? 'wood' : 'metal', materialName: bt === 'legs-wood' ? 'Массив' : 'Металл', thickness: 40, finish: null,
      L: Math.abs(x - (t + iw / 2)) < 1 ? slatTop - LAMEL_T - beamH : legsH, W: 40, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [x - 20, 0, z - 20], axes: ['y', 'x', 'z'], faceA: '+', sheet: false }));
    B.joint({ kind: 'leg', title: `${legPts.length} опор`, parts: ['RL', 'RR', ...legPts.map((_, i) => 'L' + (i + 1))], hardware: [{ id: bt === 'legs-wood' ? 'leg-wood' : 'leg-metal', qty: legPts.length }, { id: 'screw-4x16', qty: 4 * legPts.length }], step: 'base', status: 'unverified' });
  } else if (bt === 'plinth' && legsH > 0) {
    const rec = c.base.plinthRecess, pt = t;
    panel('PL1', 'Подиум: боковой', 'plinth', il - 2 * rec, legsH, [rec, 0, t + rec], ['z', 'y', 'x'], '-', { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 });
    panel('PL2', 'Подиум: боковой', 'plinth', il - 2 * rec, legsH, [W - rec - pt, 0, t + rec], ['z', 'y', 'x'], '+', { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 });
    panel('PL3', 'Подиум: торцевой', 'plinth', W - 2 * rec - 2 * pt, legsH, [rec + pt, 0, t + il - rec - pt], ['x', 'y', 'z'], '+', { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 });
    if (beam) panel('PL4', 'Подиум: под балку', 'plinth', il - 2 * rec - pt, slatTop - LAMEL_T - beamH, [t + iw / 2 - t / 2, 0, t + rec], ['z', 'y', 'x'], '+', { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 });
    B.joint({ kind: 'screw', title: 'Подиум: сборка и крепление к царгам', parts: ['PL1', 'PL2', 'PL3', 'RL', 'RR'], hardware: [{ id: 'confirmat', qty: 4 }, { id: 'screw-4x30', qty: Math.ceil(2 * il / 300) }], step: 'base', status: 'rule' });
    if (b.drawers) chk('error', 'Ящики', 'Выкатные ящики не помещаются в подиум.', 'Выберите ножки высотой от 200 мм.');
  } else if (bt === 'metal-frame' && legsH > 0) {
    legPts.concat([[t / 2, t + 40], [t + iw + t / 2, t + 40]]).forEach(([x, z], i) => B.add({ id: 'M' + (i + 1), name: 'Каркас: стойка', role: 'frame', group: 'base', geom: 'tube', material: 'steel', materialName: 'Труба 20×20×1,5', thickness: 20, finish: null,
      L: legsH, W: 20, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [x - 10, 0, z - 10], axes: ['y', 'x', 'z'], faceA: '+', sheet: false }));
    B.joint({ kind: 'weld', title: 'Металлические опоры-кронштейны (изготавливаются отдельно)', parts: ['RL', 'RR'], hardware: [{ id: 'frame-bolt', qty: 4 * (legPts.length + 2) }, { id: 'frame-glide', qty: legPts.length + 2 }], step: 'base', status: 'unverified' });
  }
  // выкатные ящики справа
  if (b.drawers > 0) {
    if (!(bt === 'legs-wood' || bt === 'legs-metal' || bt === 'metal-frame') || legsH < 200) chk('error', 'Ящики', `Для выкатных ящиков нужен просвет от 200 мм под царгой (сейчас ${legsH} мм).`, 'Выберите ножки высотой 200–300 мм или уберите ящики.');
    else {
      const n = b.drawers, zFrom = t + 60, zTo = t + il - (b.footboard ? 20 : 100), len = (zTo - zFrom) / n - 10, fh = legsH - 25, dep = Math.min(600, iw / 2 - 60), bm = c.drawerBox.material, tb = c.drawerBox.thickness;
      const fMat = c.fronts.material;
      for (let i = 0; i < n; i++) {
        const z = zFrom + i * (len + 10), xF = W - c.fronts.thickness, pre = 'BD' + (i + 1), bh = fh - 50;
        const f = B.add({ id: pre + 'f', name: `Ящик ${i + 1}: фасад`, role: 'drawer-front', group: 'fronts', geom: 'panel', material: fMat, materialName: MATERIALS[fMat].name, thickness: c.fronts.thickness, finish: c.fronts.finish,
          L: len, W: fh, edges: (() => { const e = edgeFor(c, fMat, 'front'); return { L1: e, L2: e, W1: e, W2: e }; })(), grain: isWoodLike(c.fronts.finish) ? 'L' : 'none', origin: [xF, 10, z], axes: ['z', 'y', 'x'], faceA: '+', sheet: true });
        const box = (id: string, name: string, L: number, Wd: number, origin: V3, axes: [any, any, any]) => B.add({ id, name, role: 'drawer-side', group: 'drawer' + (i + 1), geom: 'panel', material: bm, materialName: DRAWER_BOX[bm].name, thickness: tb, finish: null,
          L, W: Wd, edges: { L1: EDGE0, L2: edgeFor(c, bm === 'ldsp' ? 'ldsp' : 'plywood', 'side'), W1: EDGE0, W2: EDGE0 }, grain: 'none', origin, axes, faceA: '+', sheet: true });
        const x0 = xF - dep, by = 45;
        box(pre + 'a', `Ящик ${i + 1}: стенка`, dep, bh, [x0, by, z + 10], ['x', 'y', 'z']);
        box(pre + 'b', `Ящик ${i + 1}: стенка`, dep, bh, [x0, by, z + len - 10 - tb], ['x', 'y', 'z']);
        box(pre + 'c', `Ящик ${i + 1}: задняя стенка`, len - 20 - 2 * tb, bh, [x0, by, z + 10 + tb], ['z', 'y', 'x']);
        box(pre + 'd', `Ящик ${i + 1}: передняя стенка`, len - 20 - 2 * tb, bh, [xF - tb, by, z + 10 + tb], ['z', 'y', 'x']);
        B.add({ id: pre + 'e', name: `Ящик ${i + 1}: дно`, role: 'drawer-bottom', group: 'drawer' + (i + 1), geom: 'panel', material: 'ldsp', materialName: MATERIALS.ldsp.name, thickness: 16, finish: null,
          L: dep, W: len - 20, edges: { L1: EDGE0, L2: EDGE0, W1: EDGE0, W2: EDGE0 }, grain: 'none', origin: [x0, by - 16, z + 10], axes: ['x', 'z', 'y'], faceA: '+', sheet: true });
        B.joint({ kind: 'screw', title: `Ящик ${i + 1}: короб, дно и колёса`, parts: [pre + 'a', pre + 'b', pre + 'c', pre + 'd', pre + 'e'], hardware: [{ id: 'confirmat', qty: 8 }, { id: 'screw-4x30', qty: 10 }, { id: 'caster', qty: 4 }, { id: 'screw-4x16', qty: 16 }], step: 'bed-drawers', status: 'unverified', note: 'Колёса — высота подбирается под просвет' });
        B.joint({ kind: 'screw', title: `Ящик ${i + 1}: фасад к коробу`, parts: [pre + 'f', pre + 'd'], hardware: [{ id: 'screw-4x30', qty: 4 }], step: 'bed-drawers', status: 'rule' });
        if (c.handles.type === 'knob' || c.handles.type === 'bar') {
          const hb = partBox(f), cx = (hb.min[2] + hb.max[2]) / 2, cy = hb.max[1] - 40, s2 = c.handles.type === 'bar' ? c.handles.size / 2 : 0;
          const pts: V3[] = s2 ? [[hb.max[0], cy, cx - s2], [hb.max[0], cy, cx + s2]] : [[hb.max[0], cy, cx]];
          const j = B.joint({ kind: 'handle', title: `Ручка ящика ${i + 1}`, parts: [pre + 'f'], hardware: [{ id: c.handles.type, qty: 1 }, { id: 'handle-screw', qty: pts.length }], step: 'bed-drawers', status: 'partial' });
          for (const P of pts) B.holeFace(f, P, '+', 5, 0, true, 'Ручка: сквозное Ø5', j.id, 'rule');
        }
        B.moving.push({ id: 'mv' + pre, kind: 'drawer', parts: [pre + 'f', pre + 'a', pre + 'b', pre + 'c', pre + 'd', pre + 'e'], travel: dep - 80, front: pre + 'f', axis: 'x' });
      }
    }
  }
  void rl; void rr;
  // проверка пересечений деталей
  const P = B.parts, bx = P.map(partBox), eps = 0.3;
  let bad = 0;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    if ([0, 1, 2].every(k => bx[i].min[k] < bx[j].max[k] - eps && bx[j].min[k] < bx[i].max[k] - eps)) {
      if (P[i].role === 'leg' || P[j].role === 'leg' || P[i].role === 'frame' || P[j].role === 'frame') continue;
      bad++; if (bad <= 5) chk('error', 'Пересечения', `«${P[i].name}» (${P[i].id}) и «${P[j].name}» (${P[j].id}) пересекаются.`, 'Измените размеры.');
    }
  }
  if (!bad) chk('ok', 'Пересечения', 'Недопустимых пересечений деталей нет.');
  chk('info', 'Нагрузка', 'Несущая способность каркаса, ламелей и стяжек не рассчитывается — по паспортам выбранной фурнитуры.');
  const H = Math.max(b.headH, b.footboard ? b.footH : 0);
  return finish(B, c, { ...d0, W, H, D, bodyW: W, bodyH: b.railH, bodyD: D, x0: 0, y0: legsH, z0: 0 }, {
    ghosts: [{ name: `Матрас ${b.mattressW / 10}×${b.mattressL / 10}`, min: [t + 10, slatTop, t + 10], max: [t + 10 + b.mattressW, slatTop + 200, t + 10 + b.mattressL] }],
    overall: { width: W, height: H, depth: D, includes: { base: legsH > 0, top: false, fronts: true, handles: c.handles.type === 'push' || !b.drawers }, handleProtrusion: b.drawers && (c.handles.type === 'knob' || c.handles.type === 'bar') ? (c.handles.type === 'knob' ? 28 : 32) : 0 },
  });
  void fastenerPositions;
}
