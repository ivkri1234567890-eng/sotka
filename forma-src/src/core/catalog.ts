import { CONFIG_SCHEMA, CONFIG_VERSION } from './schema';
import type { ProductConfig, Zone, Column } from './schema';

export const STYLE_NAMES: Record<ProductConfig['style'], string> = {
  minimal: 'Минимализм', japandi: 'Джапанди', scandi: 'Скандинавский', loft: 'Лофт', neoclassic: 'Неоклассика', modern: 'Современный',
};
const Z = (type: Zone['type'], o: Partial<Zone> = {}): Zone => ({ type, height: null, shelves: 0, rod: false, doors: 'auto', ...o });
const C = (zones: Zone[], width: number | null = null): Column => ({ width, zones });

function base(cat: ProductConfig['category']): ProductConfig {
  return {
    schema: CONFIG_SCHEMA, version: CONFIG_VERSION, category: cat, model: 'custom-' + cat, style: 'modern',
    size: cat === 'nightstand' ? { width: 450, height: 550, depth: 400 } : { width: 1200, height: 2200, depth: 600 },
    body: { material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'W-white', sheen: 'matte' } },
    fronts: { material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'W-white', sheen: 'matte' }, mount: 'overlay', design: 'flat' },
    back: { material: 'hdf', thickness: 3, mount: 'groove' },
    top: { enabled: false, material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'W-white', sheen: 'matte' }, overhangFront: 0, overhangSides: 0, cornerRadius: 0 },
    base: { type: 'plinth', height: 80, plinthRecess: 40, metalColor: 'black', wallBase: 'unknown' },
    handles: { type: 'bar', size: 128, color: 'black' },
    columns: cat === 'nightstand' ? [C([Z('drawer'), Z('drawer')])] : [C([Z('door', { shelves: 4 })]), C([Z('door', { rod: true, shelves: 1 })])],
    drawerBox: { material: 'ldsp', thickness: 16 },
    production: { gap: 2, edgeThin: 0.4, edgeThick: 2, edgeAllowance: 0, shelfLoadKg: 15, maxDoorWidth: 600 },
    notes: '',
  };
}
type Over = Partial<Omit<ProductConfig, 'body' | 'fronts' | 'top' | 'base' | 'handles' | 'back'>> & {
  body?: Partial<ProductConfig['body']>; fronts?: Partial<ProductConfig['fronts']>; top?: Partial<ProductConfig['top']>;
  base?: Partial<ProductConfig['base']>; handles?: Partial<ProductConfig['handles']>; back?: Partial<ProductConfig['back']>;
};
function make(cat: ProductConfig['category'], o: Over): ProductConfig {
  const b = base(cat);
  return { ...b, ...o, body: { ...b.body, ...o.body }, fronts: { ...b.fronts, ...o.fronts }, top: { ...b.top, ...o.top }, base: { ...b.base, ...o.base },
    handles: { ...b.handles, ...o.handles }, back: { ...b.back, ...o.back }, production: { ...b.production, ...(o.production || {}) } } as ProductConfig;
}

export type CatalogItem = { id: string; name: string; blurb: string; config: ProductConfig };

export const NIGHTSTANDS: CatalogItem[] = [
  { id: 'ns-float', name: 'Парящая', blurb: 'Подвесная, два ящика без ручек — открытие нажатием.', config: make('nightstand', {
    model: 'ns-float', style: 'minimal', size: { width: 450, height: 300, depth: 350 },
    body: { material: 'mdf-enamel', thickness: 16, finish: { kind: 'ral', code: '9003', sheen: 'matte' } },
    fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '9003', sheen: 'matte' } },
    base: { type: 'wall', height: 0 }, handles: { type: 'push' }, columns: [C([Z('drawer'), Z('drawer')])] }) },
  { id: 'ns-japandi', name: 'Сэн', blurb: 'Ящик и открытая ниша на дубовых ножках, столешница со скруглением.', config: make('nightstand', {
    model: 'ns-japandi', style: 'japandi', size: { width: 480, height: 560, depth: 400 },
    body: { material: 'mdf-veneer', thickness: 16, finish: { kind: 'wood', code: 'oak', sheen: 'matte' } },
    fronts: { material: 'mdf-veneer', thickness: 16, finish: { kind: 'wood', code: 'oak', sheen: 'matte' } },
    top: { enabled: true, material: 'solid', thickness: 20, finish: { kind: 'wood', code: 'oak', sheen: 'matte' }, overhangFront: 10, overhangSides: 10, cornerRadius: 30 },
    base: { type: 'legs-wood', height: 160 }, handles: { type: 'knob', color: 'black' }, columns: [C([Z('drawer', { height: 140 }), Z('open')])] }) },
  { id: 'ns-scandi', name: 'Хюгге', blurb: 'Два ящика, эмаль цвета «шёлково-серый», ножки из бука.', config: make('nightstand', {
    model: 'ns-scandi', style: 'scandi', size: { width: 450, height: 560, depth: 400 },
    body: { material: 'mdf-enamel', thickness: 16, finish: { kind: 'ral', code: '7044', sheen: 'satin' } },
    fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '7044', sheen: 'satin' } },
    top: { enabled: true, material: 'solid', thickness: 20, finish: { kind: 'wood', code: 'beech', sheen: 'matte' }, overhangFront: 0, overhangSides: 0, cornerRadius: 0 },
    base: { type: 'legs-wood', height: 180 }, handles: { type: 'knob', color: 'white' }, columns: [C([Z('drawer'), Z('drawer')])] }) },
  { id: 'ns-loft', name: 'Цех', blurb: 'Фанера на чёрном металлокаркасе: ящик и полка.', config: make('nightstand', {
    model: 'ns-loft', style: 'loft', size: { width: 500, height: 560, depth: 400 },
    body: { material: 'plywood', thickness: 18, finish: { kind: 'natural', code: 'birch', sheen: 'matte' } },
    fronts: { material: 'plywood', thickness: 18, finish: { kind: 'natural', code: 'birch', sheen: 'matte' } },
    back: { material: 'plywood-thin', thickness: 4, mount: 'groove' },
    base: { type: 'metal-frame', height: 160, metalColor: 'black' }, handles: { type: 'bar', size: 96, color: 'black' }, drawerBox: { material: 'plywood', thickness: 12 },
    columns: [C([Z('drawer', { height: 140 }), Z('open', { shelves: 0 })])] }) },
  { id: 'ns-neo', name: 'Прованс', blurb: 'Три ящика с фрезерованной рамкой, латунные ручки, цоколь.', config: make('nightstand', {
    model: 'ns-neo', style: 'neoclassic', size: { width: 500, height: 640, depth: 420 },
    body: { material: 'mdf-enamel', thickness: 16, finish: { kind: 'ral', code: '1013', sheen: 'satin' } },
    fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '1013', sheen: 'satin' }, design: 'milled-frame' },
    top: { enabled: true, material: 'mdf-enamel', thickness: 22, finish: { kind: 'ral', code: '1013', sheen: 'satin' }, overhangFront: 20, overhangSides: 20, cornerRadius: 0 },
    base: { type: 'plinth', height: 80, plinthRecess: 30 }, handles: { type: 'knob', color: 'brass' }, columns: [C([Z('drawer'), Z('drawer'), Z('drawer')])] }) },
  { id: 'ns-modern', name: 'Контур', blurb: 'Дверь и полка внутри, глянец графит, тонкие металлические опоры.', config: make('nightstand', {
    model: 'ns-modern', style: 'modern', size: { width: 450, height: 600, depth: 400 },
    body: { material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'G-anth', sheen: 'matte' } },
    fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '7024', sheen: 'gloss' } },
    base: { type: 'legs-metal', height: 150, metalColor: 'chrome' }, handles: { type: 'edge-profile', color: 'chrome' },
    columns: [C([Z('door', { shelves: 1, doors: 'left' })])] }) },
];

export const WARDROBES: CatalogItem[] = [
  { id: 'wr-minimal', name: 'Монолит', blurb: 'Две секции с распашными дверями без ручек, белая эмаль, цоколь.', config: make('wardrobe', {
    model: 'wr-minimal', style: 'minimal', size: { width: 1200, height: 2300, depth: 600 },
    body: { material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'W-white', sheen: 'matte' } },
    fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '9016', sheen: 'matte' } },
    base: { type: 'plinth', height: 100, plinthRecess: 50 }, handles: { type: 'push' },
    columns: [C([Z('door', { shelves: 1, rod: true, doors: 'left' })]), C([Z('door', { shelves: 5, doors: 'right' })])] }) },
  { id: 'wr-japandi', name: 'Ки', blurb: 'Шпон дуба, открытая секция с полками и две двери, высокие ножки.', config: make('wardrobe', {
    model: 'wr-japandi', style: 'japandi', size: { width: 1500, height: 2000, depth: 550 },
    body: { material: 'mdf-veneer', thickness: 19, finish: { kind: 'wood', code: 'oak', sheen: 'matte' } },
    fronts: { material: 'mdf-veneer', thickness: 19, finish: { kind: 'wood', code: 'oak', sheen: 'matte' } },
    base: { type: 'legs-wood', height: 150 }, handles: { type: 'knob', color: 'black' },
    columns: [C([Z('door', { rod: true, shelves: 1, doors: 'double' })], 900), C([Z('open', { shelves: 4 })])] }) },
  { id: 'wr-scandi', name: 'Фьорд', blurb: 'Двери и два ящика снизу, эмаль «пастельно-синий», ножки.', config: make('wardrobe', {
    model: 'wr-scandi', style: 'scandi', size: { width: 1000, height: 2000, depth: 580 },
    body: { material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'W-white', sheen: 'matte' } },
    fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '5024', sheen: 'satin' } },
    base: { type: 'legs-wood', height: 120 }, handles: { type: 'knob', color: 'white' },
    columns: [C([Z('door', { rod: true, shelves: 1, doors: 'double' }), Z('drawer', { height: 200 }), Z('drawer', { height: 200 })])] }) },
  { id: 'wr-loft', name: 'Склад', blurb: 'Открытый шкаф из фанеры на металлокаркасе: штанга и полки.', config: make('wardrobe', {
    model: 'wr-loft', style: 'loft', size: { width: 1200, height: 1900, depth: 500 },
    body: { material: 'plywood', thickness: 18, finish: { kind: 'natural', code: 'birch', sheen: 'matte' } },
    fronts: { material: 'plywood', thickness: 18, finish: { kind: 'natural', code: 'birch', sheen: 'matte' } },
    back: { material: 'plywood-thin', thickness: 4, mount: 'groove' }, drawerBox: { material: 'plywood', thickness: 12 },
    base: { type: 'metal-frame', height: 200, metalColor: 'black' }, handles: { type: 'bar', size: 160, color: 'black' },
    columns: [C([Z('open', { rod: true, shelves: 1 })]), C([Z('open', { shelves: 3 }), Z('drawer', { height: 200 })])] }) },
  { id: 'wr-neo', name: 'Версаль', blurb: 'Три секции с фрезерованными дверями и ящиками, латунь, цоколь и карниз.', config: make('wardrobe', {
    model: 'wr-neo', style: 'neoclassic', size: { width: 1800, height: 2400, depth: 620 },
    body: { material: 'mdf-enamel', thickness: 16, finish: { kind: 'ral', code: '9001', sheen: 'satin' } },
    fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '9001', sheen: 'satin' }, design: 'milled-frame' },
    top: { enabled: true, material: 'mdf-enamel', thickness: 22, finish: { kind: 'ral', code: '9001', sheen: 'satin' }, overhangFront: 30, overhangSides: 30, cornerRadius: 0 },
    base: { type: 'plinth', height: 100, plinthRecess: 30 }, handles: { type: 'bar', size: 160, color: 'brass' },
    columns: [C([Z('door', { rod: true, shelves: 1 })]), C([Z('door', { shelves: 4 }), Z('drawer', { height: 180 }), Z('drawer', { height: 180 })]), C([Z('door', { rod: true, shelves: 1 })])] }) },
  { id: 'wr-modern', name: 'Ритм', blurb: 'Четыре секции: двери, открытая секция с полками, ящики, профиль-ручка.', config: make('wardrobe', {
    model: 'wr-modern', style: 'modern', size: { width: 2000, height: 2200, depth: 600 },
    body: { material: 'ldsp', thickness: 18, finish: { kind: 'decor', code: 'D-walnut', sheen: 'matte' } },
    fronts: { material: 'ldsp', thickness: 18, finish: { kind: 'decor', code: 'G-anth', sheen: 'matte' } },
    base: { type: 'plinth', height: 80, plinthRecess: 40 }, handles: { type: 'edge-profile', color: 'graphite' },
    columns: [C([Z('door', { rod: true, shelves: 1 })]), C([Z('door', { shelves: 5 })]), C([Z('open', { shelves: 4 }), Z('drawer', { height: 160 }), Z('drawer', { height: 160 })]), C([Z('door', { rod: true, shelves: 1 })])] }) },
];

export const CATALOG = [...NIGHTSTANDS, ...WARDROBES];
export function blank(cat: ProductConfig['category']): ProductConfig { return base(cat); }
export const ZONE = Z;

/** Смена стиля меняет конструкцию и отделку (основание, фасады, ручки, столешница, материалы), сохраняя размеры и наполнение. */
export function applyStyle(c: ProductConfig, style: ProductConfig['style']): ProductConfig {
  const src = CATALOG.find(i => i.config.category === c.category && i.config.style === style);
  if (!src) return { ...c, style };
  const s = src.config;
  const next: ProductConfig = { ...c, style, body: { ...s.body }, fronts: { ...s.fronts }, top: { ...s.top }, base: { ...s.base, wallBase: c.base.wallBase }, handles: { ...s.handles }, back: { ...s.back }, drawerBox: { ...s.drawerBox } };
  // новое основание или столешница не должны «съесть» корпус: при нехватке высоты берём высоту образца стиля
  const baseH = next.base.type === 'wall' ? 0 : next.base.height, topT = next.top.enabled ? next.top.thickness : 0;
  const zones = Math.max(...next.columns.map(col => col.zones.length));
  if (next.size.height - baseH - topT < 2 * next.body.thickness + 140 * zones) next.size = { ...next.size, height: Math.max(next.size.height, s.size.height) };
  return next;
}
