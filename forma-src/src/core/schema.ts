/**
 * «Форма» — версионируемые схемы данных.
 *
 * Уровень А — ProductConfig: что выбрал пользователь (категория, модель, размеры, материалы, отделка, наполнение).
 * Уровень Б — ManufacturingModel: что рассчитало детерминированное ядро (детали, положения, соединения, операции).
 *
 * Все размеры — в миллиметрах.
 * Мировая система координат: X — вправо (ширина), Y — вверх (высота), Z — к зрителю (глубина).
 * Начало (0,0,0) — левый задний нижний угол корпуса на уровне пола (низ основания).
 */
import { z } from 'zod';

export const CONFIG_SCHEMA = 'forma/product-config';
export const CONFIG_VERSION = 1;
export const MODEL_SCHEMA = 'forma/manufacturing-model';
export const MODEL_VERSION = 1;
export const PROJECT_SCHEMA = 'forma/project';
export const PROJECT_VERSION = 1;

export const MaterialId = z.enum(['ldsp', 'mdf-enamel', 'mdf-veneer', 'plywood', 'solid']);
export const BackMaterialId = z.enum(['hdf', 'plywood-thin']);
export const FinishKind = z.enum(['ral', 'decor', 'wood', 'natural']);
export const Sheen = z.enum(['matte', 'satin', 'gloss']);

export const Finish = z.object({
  kind: FinishKind,          // ral — эмаль по RAL; decor — декор ЛДСП; wood — порода (шпон/щит/фанера); natural — без покраски
  code: z.string(),          // RAL 9003 / код декора / порода
  sheen: Sheen.default('matte'),
});

export const Zone = z.object({
  type: z.enum(['drawer', 'door', 'open']),
  height: z.number().positive().nullable().default(null), // мм внутренней высоты зоны; null — поровну из остатка
  shelves: z.number().int().min(0).max(12).default(0),     // съёмные полки внутри зоны (для door/open)
  rod: z.boolean().default(false),                        // штанга для одежды
  doors: z.enum(['auto', 'left', 'right', 'double']).default('auto'), // сторона петель
});

export const Column = z.object({
  width: z.number().positive().nullable().default(null), // мм внутренней ширины секции; null — поровну
  zones: z.array(Zone).min(1).max(8),
});

export const ProductConfig = z.object({
  schema: z.literal(CONFIG_SCHEMA),
  version: z.literal(CONFIG_VERSION),
  category: z.enum(['nightstand', 'wardrobe']),
  model: z.string(),
  style: z.enum(['minimal', 'japandi', 'scandi', 'loft', 'neoclassic', 'modern']),
  size: z.object({ width: z.number(), height: z.number(), depth: z.number() }), // ОБЩИЕ габариты изделия
  body: z.object({ material: MaterialId, thickness: z.number(), finish: Finish }),
  fronts: z.object({
    material: MaterialId, thickness: z.number(), finish: Finish,
    mount: z.enum(['overlay', 'inset']),
    design: z.enum(['flat', 'milled-frame']).default('flat'),
  }),
  back: z.object({ material: BackMaterialId, thickness: z.number(), mount: z.enum(['groove', 'overlay']) }),
  top: z.object({
    enabled: z.boolean(), material: MaterialId, thickness: z.number(), finish: Finish,
    overhangFront: z.number().min(0), overhangSides: z.number().min(0), cornerRadius: z.number().min(0),
  }),
  base: z.object({
    type: z.enum(['legs-wood', 'legs-metal', 'plinth', 'wall', 'metal-frame']),
    height: z.number().min(0),
    plinthRecess: z.number().min(0).default(40),
    metalColor: z.string().default('black'),
    wallBase: z.enum(['unknown', 'concrete', 'brick', 'aerated', 'drywall']).default('unknown'),
  }),
  handles: z.object({
    type: z.enum(['push', 'knob', 'bar', 'edge-profile']),
    size: z.number().default(128), // межцентровое для скобы
    color: z.string().default('black'),
  }),
  columns: z.array(Column).min(1).max(6),
  drawerBox: z.object({ material: z.enum(['ldsp', 'plywood']), thickness: z.number() }),
  production: z.object({
    gap: z.number().min(0).max(6).default(2),          // зазор между фасадами, мм
    edgeThin: z.number().default(0.4),
    edgeThick: z.number().default(2),
    edgeAllowance: z.number().default(0),               // припуск под форматную обработку на каждую кромленную сторону
    shelfLoadKg: z.number().min(0).default(15),         // расчётная нагрузка на полку
    maxDoorWidth: z.number().default(600),
  }),
  notes: z.string().default(''),
});
export type ProductConfig = z.infer<typeof ProductConfig>;
export type Zone = z.infer<typeof Zone>;
export type Column = z.infer<typeof Column>;
export type Finish = z.infer<typeof Finish>;
export type MaterialIdT = z.infer<typeof MaterialId>;

/* ---------------- ManufacturingModel ---------------- */
export const Axis = z.enum(['x', 'y', 'z']);
export const Edge = z.object({ kind: z.enum(['none', 'thin', 'thick', 'veneer', 'paint']), t: z.number() });
export const Hole = z.object({
  id: z.string(), face: z.enum(['A', 'B', 'L1', 'L2', 'W1', 'W2']),
  u: z.number(), v: z.number(), // A/B: u вдоль L от W1, v вдоль W от L1. Кромки L1/L2: u вдоль L, v — от грани B к A. Кромки W1/W2: u вдоль W.
  d: z.number(), depth: z.number(), through: z.boolean(),
  kind: z.string(), joint: z.string(), status: z.enum(['verified', 'partial', 'rule']),
});
export const Op = z.object({
  id: z.string(), type: z.enum(['groove', 'mill-frame', 'radius']),
  face: z.enum(['A', 'B']), params: z.record(z.number()), note: z.string(),
});
export const Part = z.object({
  id: z.string(), name: z.string(), role: z.string(), group: z.string(),
  geom: z.enum(['panel', 'panel-radius', 'tube', 'rod', 'leg', 'handle', 'profile']),
  material: z.string(), materialName: z.string(), thickness: z.number(), finish: Finish.nullable(),
  L: z.number(), W: z.number(),            // чистовые размеры (готовая деталь)
  blankL: z.number(), blankW: z.number(),  // размеры заготовки (распил)
  edges: z.object({ L1: Edge, L2: Edge, W1: Edge, W2: Edge }),
  grain: z.enum(['L', 'W', 'none']),
  origin: z.tuple([z.number(), z.number(), z.number()]), // мир: координата угла (0,0,0) детали
  axes: z.tuple([Axis, Axis, Axis]),                     // мир: направления локальных осей L, W, толщины
  faceA: z.enum(['+', '-']),                             // лицевая сторона A — по +толщине или по −толщине
  holes: z.array(Hole), ops: z.array(Op),
  sheet: z.boolean(),                                    // идёт в раскрой листа
  mass: z.number(),
});
export type Part = z.infer<typeof Part>;
export type Hole = z.infer<typeof Hole>;

export type Joint = {
  id: string; kind: string; title: string; parts: string[]; hardware: { id: string; qty: number }[];
  step: string; status: 'verified' | 'partial' | 'unverified' | 'rule'; note?: string;
};
export type Moving = { id: string; kind: 'door'; parts: string[]; hinge: [number, number, number]; axisSign: 1 | -1; front: string }
  | { id: string; kind: 'drawer'; parts: string[]; travel: number; front: string };
export type Check = { level: 'error' | 'warn' | 'info' | 'ok'; area: string; msg: string; fix?: string };
export type AssemblyStep = { id: string; title: string; text: string[]; parts: string[]; fresh: string[]; hardware: { id: string; qty: number }[]; tools: string[]; joints: string[]; show: string[] };

export type ManufacturingModel = {
  schema: typeof MODEL_SCHEMA; version: typeof MODEL_VERSION;
  configHash: string;
  overall: { width: number; height: number; depth: number; includes: { base: boolean; top: boolean; fronts: boolean; handles: boolean }; handleProtrusion: number };
  body: { x0: number; y0: number; z0: number; W: number; H: number; D: number; t: number };
  parts: Part[]; joints: Joint[]; moving: Moving[]; checks: Check[]; steps: AssemblyStep[];
  hardware: { id: string; qty: number; joints: string[] }[];
  massKg: number;
  status: 'draft' | 'needs-review';
};

export const Prices = z.object({
  currency: z.string().default('₽'),
  sheets: z.record(z.number()),       // ключ «материал|толщина» → цена листа
  edge: z.record(z.number()),         // тип кромки → ₽/м
  hardware: z.record(z.number()),     // id фурнитуры → ₽/шт
  cutPerM: z.number(), drillPerHole: z.number(), edgeWorkPerM: z.number(), millPerM: z.number(),
  paintPerM2: z.record(z.number()),   // способ отделки → ₽/м² (одна сторона)
  metalPerM: z.number(), metalWork: z.number(),
  assembly: z.number(), assemblyPerPart: z.number(), delivery: z.number(), extra: z.number(), extraNote: z.string().default(''),
  wastePct: z.number().default(0),    // используется ТОЛЬКО при расчёте по площади
  method: z.enum(['sheets', 'area']).default('sheets'),
  kerf: z.number().default(4), trim: z.number().default(10),
  sheetFormats: z.record(z.object({ L: z.number(), W: z.number() })).default({}),
  demo: z.boolean().default(true),
});
export type Prices = z.infer<typeof Prices>;

export const Project = z.object({
  schema: z.literal(PROJECT_SCHEMA), version: z.literal(PROJECT_VERSION),
  id: z.string(), name: z.string(), created: z.string(), updated: z.string(),
  config: ProductConfig, prices: Prices.nullable().default(null),
  photos: z.array(z.object({ id: z.string(), name: z.string(), dataUrl: z.string() })).default([]),
  docVersion: z.number().int().default(1),
});
export type Project = z.infer<typeof Project>;

/** Стабильный хеш конфигурации — связывает модель и документы с конкретной настройкой. */
export function hashConfig(c: ProductConfig): string {
  const s = JSON.stringify(c);
  let h1 = 0x811c9dc5, h2 = 0x1234567;
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 16777619); h2 = Math.imul(h2 ^ ch, 2246822519); }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).slice(0, 12);
}
