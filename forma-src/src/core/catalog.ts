import { CONFIG_SCHEMA, CONFIG_VERSION } from './schema';
import type { ProductConfig, Zone, Column } from './schema';
import { BED_DEFAULT, bedSize } from './bed';

export const STYLE_NAMES: Record<ProductConfig['style'], string> = {
  minimal: 'Минимализм', japandi: 'Джапанди', scandi: 'Скандинавский', loft: 'Лофт', neoclassic: 'Неоклассика', modern: 'Современный',
};
const Z = (type: Zone['type'], o: Partial<Zone> = {}): Zone => ({ type, height: null, shelves: 0, rod: false, doors: 'auto', ...o });
const C = (zones: Zone[], width: number | null = null): Column => ({ width, zones });

function base(cat: ProductConfig['category']): ProductConfig {
  return {
    schema: CONFIG_SCHEMA, version: CONFIG_VERSION, category: cat, model: 'custom-' + cat, style: 'modern',
    size: cat === 'nightstand' ? { width: 450, height: 550, depth: 400 } : cat === 'dresser' ? { width: 1000, height: 760, depth: 420 } : cat === 'bed' ? { width: 1676, height: 1000, depth: 2056 } : { width: 1200, height: 2200, depth: 600 },
    body: { material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'W-white', sheen: 'matte' } },
    fronts: { material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'W-white', sheen: 'matte' }, mount: 'overlay', design: 'flat' },
    back: { material: 'hdf', thickness: 3, mount: 'groove' },
    top: { enabled: cat === 'dresser', material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'W-white', sheen: 'matte' }, overhangFront: 0, overhangSides: 0, cornerRadius: 0 },
    base: cat === 'dresser' ? { type: 'legs-wood', height: 560, plinthRecess: 40, metalColor: 'black', wallBase: 'unknown' } : cat === 'bed' ? { type: 'legs-wood', height: 150, plinthRecess: 60, metalColor: 'black', wallBase: 'unknown' } : { type: 'plinth', height: 80, plinthRecess: 40, metalColor: 'black', wallBase: 'unknown' },
    handles: { type: 'bar', size: 128, color: 'black' },
    columns: cat === 'nightstand' ? [C([Z('drawer'), Z('drawer')])] : cat === 'dresser' ? [C([Z('drawer')]), C([Z('drawer')])] : cat === 'bed' ? [C([Z('open')])] : [C([Z('door', { shelves: 4 })]), C([Z('door', { rod: true, shelves: 1 })])],
    ...(cat === 'dresser' ? { mirror: { type: 'rect' as const, width: 700, height: 800, mount: 'top' as const } } : {}),
    ...(cat === 'bed' ? { bed: { ...BED_DEFAULT } } : {}),
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
  const r = { ...b, ...o, body: { ...b.body, ...o.body }, fronts: { ...b.fronts, ...o.fronts }, top: { ...b.top, ...o.top }, base: { ...b.base, ...o.base },
    handles: { ...b.handles, ...o.handles }, back: { ...b.back, ...o.back }, production: { ...b.production, ...(o.production || {}) } } as ProductConfig;
  if (r.category === 'bed') r.size = bedSize(r);
  return r;
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

const M = (type: 'rect' | 'arch', width: number, height: number, mount: 'top' | 'wall' = 'top') => ({ type, width, height, mount });
export const DRESSERS: CatalogItem[] = [
  { id: 'dr-minimal', name: 'Линия', blurb: 'Комод-трюмо: три ящика без ручек, прямоугольное зеркало, цоколь.', config: make('dresser', {
    model: 'dr-minimal', style: 'minimal', size: { width: 1000, height: 820, depth: 450 },
    body: { material: 'mdf-enamel', thickness: 16, finish: { kind: 'ral', code: '9003', sheen: 'matte' } }, fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '9003', sheen: 'matte' } },
    top: { enabled: false }, base: { type: 'plinth', height: 60, plinthRecess: 30 }, handles: { type: 'push' }, columns: [C([Z('drawer'), Z('drawer'), Z('drawer')])], mirror: M('rect', 800, 600) }) },
  { id: 'dr-japandi', name: 'Ханами', blurb: 'Консоль из дуба на ножках: ящик, арочное зеркало, столешница со скруглением.', config: make('dresser', {
    model: 'dr-japandi', style: 'japandi', size: { width: 1000, height: 760, depth: 400 },
    body: { material: 'mdf-veneer', thickness: 16, finish: { kind: 'wood', code: 'oak', sheen: 'matte' } }, fronts: { material: 'mdf-veneer', thickness: 16, finish: { kind: 'wood', code: 'oak', sheen: 'matte' } },
    top: { enabled: true, material: 'solid', thickness: 20, finish: { kind: 'wood', code: 'oak', sheen: 'matte' }, overhangFront: 15, overhangSides: 15, cornerRadius: 30 },
    base: { type: 'legs-wood', height: 570 }, handles: { type: 'knob', color: 'black' }, columns: [C([Z('drawer')])], mirror: M('arch', 600, 900) }) },
  { id: 'dr-scandi', name: 'Лагом', blurb: 'Туалетный столик на буковых ножках, два ящика, зеркало на столешнице.', config: make('dresser', {
    model: 'dr-scandi', style: 'scandi', size: { width: 900, height: 760, depth: 420 },
    body: { material: 'mdf-enamel', thickness: 16, finish: { kind: 'ral', code: '7044', sheen: 'satin' } }, fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '7044', sheen: 'satin' } },
    top: { enabled: true, material: 'solid', thickness: 20, finish: { kind: 'wood', code: 'beech', sheen: 'matte' }, overhangFront: 10, overhangSides: 10, cornerRadius: 0 },
    base: { type: 'legs-wood', height: 560 }, handles: { type: 'knob', color: 'white' }, columns: [C([Z('drawer')]), C([Z('drawer')])], mirror: M('rect', 600, 800) }) },
  { id: 'dr-loft', name: 'Мастерская', blurb: 'Фанера на чёрном металлокаркасе, два ящика, большое зеркало на стену.', config: make('dresser', {
    model: 'dr-loft', style: 'loft', size: { width: 1100, height: 760, depth: 420 },
    body: { material: 'plywood', thickness: 18, finish: { kind: 'natural', code: 'birch', sheen: 'matte' } }, fronts: { material: 'plywood', thickness: 18, finish: { kind: 'natural', code: 'birch', sheen: 'matte' } },
    back: { material: 'plywood-thin', thickness: 4, mount: 'groove' }, drawerBox: { material: 'plywood', thickness: 12 }, top: { enabled: false },
    base: { type: 'metal-frame', height: 580, metalColor: 'black', wallBase: 'concrete' }, handles: { type: 'bar', size: 96, color: 'black' }, columns: [C([Z('drawer')]), C([Z('drawer')])], mirror: M('rect', 900, 1000, 'wall') }) },
  { id: 'dr-neo', name: 'Бель', blurb: 'Неоклассическое трюмо: фрезерованные ящики, латунь, арочное зеркало.', config: make('dresser', {
    model: 'dr-neo', style: 'neoclassic', size: { width: 1100, height: 780, depth: 450 },
    body: { material: 'mdf-enamel', thickness: 16, finish: { kind: 'ral', code: '1013', sheen: 'satin' } }, fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '1013', sheen: 'satin' }, design: 'milled-frame' },
    top: { enabled: true, material: 'mdf-enamel', thickness: 22, finish: { kind: 'ral', code: '1013', sheen: 'satin' }, overhangFront: 20, overhangSides: 20, cornerRadius: 0 },
    base: { type: 'legs-wood', height: 500 }, handles: { type: 'knob', color: 'brass' }, columns: [C([Z('drawer')]), C([Z('drawer')]), C([Z('drawer')])], mirror: M('arch', 800, 1000) }) },
  { id: 'dr-modern', name: 'Грань', blurb: 'Подвесная консоль с двумя ящиками и прямоугольным зеркалом над ней.', config: make('dresser', {
    model: 'dr-modern', style: 'modern', size: { width: 1100, height: 220, depth: 400 },
    body: { material: 'ldsp', thickness: 16, finish: { kind: 'decor', code: 'G-anth', sheen: 'matte' } }, fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '7024', sheen: 'gloss' } },
    top: { enabled: false }, base: { type: 'wall', height: 0, wallBase: 'concrete' }, handles: { type: 'edge-profile', color: 'graphite' }, columns: [C([Z('drawer')]), C([Z('drawer')])], mirror: M('rect', 1000, 800, 'wall') }) },
];
const BD = (o: Partial<typeof BED_DEFAULT>) => ({ ...BED_DEFAULT, ...o });
export const BEDS: CatalogItem[] = [
  { id: 'bd-minimal', name: 'Тишина', blurb: '160×200 на скрытом подиуме — кровать будто парит. Ламели.', config: make('bed', {
    model: 'bd-minimal', style: 'minimal', body: { material: 'ldsp', thickness: 22, finish: { kind: 'decor', code: 'W-white', sheen: 'matte' } },
    base: { type: 'plinth', height: 120, plinthRecess: 120 }, handles: { type: 'push' }, bed: BD({ mattressW: 1600, headH: 900, railH: 200 }) }) },
  { id: 'bd-japandi', name: 'Татами', blurb: 'Низкая платформа 160×200 из дуба, невысокое изголовье.', config: make('bed', {
    model: 'bd-japandi', style: 'japandi', body: { material: 'solid', thickness: 28, finish: { kind: 'wood', code: 'oak', sheen: 'matte' } },
    base: { type: 'legs-wood', height: 60 }, handles: { type: 'knob', color: 'black' }, bed: BD({ mattressW: 1600, headH: 700, railH: 180 }) }) },
  { id: 'bd-scandi', name: 'Норд', blurb: '140×200 на буковых ножках, арочное изголовье, два выкатных ящика.', config: make('bed', {
    model: 'bd-scandi', style: 'scandi', body: { material: 'mdf-enamel', thickness: 22, finish: { kind: 'ral', code: '9010', sheen: 'satin' } },
    fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '7044', sheen: 'satin' } },
    base: { type: 'legs-wood', height: 240 }, handles: { type: 'knob', color: 'white' }, bed: BD({ mattressW: 1400, headH: 1000, head: 'arch', railH: 180, drawers: 2 }) }) },
  { id: 'bd-loft', name: 'Арсенал', blurb: '160×200 из фанеры на металлических опорах, высокое изголовье.', config: make('bed', {
    model: 'bd-loft', style: 'loft', body: { material: 'plywood', thickness: 21, finish: { kind: 'natural', code: 'birch', sheen: 'matte' } },
    base: { type: 'metal-frame', height: 280, metalColor: 'black' }, handles: { type: 'bar', size: 128, color: 'black' }, bed: BD({ mattressW: 1600, headH: 1100, railH: 200 }) }) },
  { id: 'bd-neo', name: 'Граф', blurb: '180×200: высокое арочное изголовье с фрезерованной рамкой и изножье.', config: make('bed', {
    model: 'bd-neo', style: 'neoclassic', body: { material: 'mdf-enamel', thickness: 22, finish: { kind: 'ral', code: '1013', sheen: 'satin' } },
    fronts: { material: 'mdf-enamel', thickness: 19, finish: { kind: 'ral', code: '1013', sheen: 'satin' }, design: 'milled-frame' },
    base: { type: 'legs-wood', height: 120 }, handles: { type: 'knob', color: 'brass' }, bed: BD({ mattressW: 1800, headH: 1300, head: 'arch', footboard: true, footH: 550, railH: 220 }) }) },
  { id: 'bd-modern', name: 'Горизонт', blurb: '180×200: орех и антрацит, тонкие металлические опоры, сплошное основание.', config: make('bed', {
    model: 'bd-modern', style: 'modern', body: { material: 'ldsp', thickness: 22, finish: { kind: 'decor', code: 'D-walnut', sheen: 'matte' } },
    base: { type: 'legs-metal', height: 150, metalColor: 'graphite' }, handles: { type: 'edge-profile', color: 'graphite' }, bed: BD({ mattressW: 1800, headH: 1050, railH: 220, base: 'panel' }) }) },
];
export const CATALOG = [...NIGHTSTANDS, ...WARDROBES, ...DRESSERS, ...BEDS];
export const CATS: { id: ProductConfig['category']; name: string; icon: string; items: CatalogItem[] }[] = [
  { id: 'nightstand', name: 'Прикроватные тумбы', icon: '🛏️', items: NIGHTSTANDS }, { id: 'wardrobe', name: 'Шкафы', icon: '🚪', items: WARDROBES },
  { id: 'dresser', name: 'Трюмо', icon: '🪞', items: DRESSERS }, { id: 'bed', name: 'Кровати', icon: '🛌', items: BEDS },
];
export function blank(cat: ProductConfig['category']): ProductConfig { return base(cat); }
export const ZONE = Z;

/** Смена стиля меняет конструкцию и отделку (основание, фасады, ручки, столешница, материалы), сохраняя размеры и наполнение. */
export function applyStyle(c: ProductConfig, style: ProductConfig['style']): ProductConfig {
  const src = CATALOG.find(i => i.config.category === c.category && i.config.style === style);
  if (!src) return { ...c, style };
  const s = src.config;
  const next: ProductConfig = { ...c, style, body: { ...s.body }, fronts: { ...s.fronts }, top: { ...s.top }, base: { ...s.base, wallBase: c.base.wallBase }, handles: { ...s.handles }, back: { ...s.back }, drawerBox: { ...s.drawerBox } };
  if (c.category === 'bed' && c.bed && s.bed) {
    next.bed = { ...c.bed, head: s.bed.head, headH: s.bed.headH, railH: s.bed.railH };
    if (next.bed.drawers > 0) { if (next.base.type === 'legs-wood' || next.base.type === 'legs-metal' || next.base.type === 'metal-frame') next.base = { ...next.base, height: Math.max(next.base.height, 240) }; else next.bed = { ...next.bed, drawers: 0 }; }
    next.size = bedSize(next); return next;
  }
  if (c.category === 'dresser' && s.mirror) next.mirror = { ...s.mirror, width: Math.min(s.mirror.width, c.size.width) };
  // новое основание или столешница не должны «съесть» корпус: при нехватке высоты берём высоту образца стиля
  const baseH = next.base.type === 'wall' ? 0 : next.base.height, topT = next.top.enabled ? next.top.thickness : 0;
  const zones = Math.max(...next.columns.map(col => col.zones.length)), need = 2 * next.body.thickness + 150 * zones + 20;
  if (next.size.height - baseH - topT < need && baseH > 0) { // сначала опускаем основание
    const minB = next.base.type === 'plinth' ? 60 : next.base.type === 'metal-frame' ? 100 : 80;
    next.base = { ...next.base, height: Math.max(minB, next.size.height - topT - need) };
  }
  const baseH2 = next.base.type === 'wall' || next.base.type === 'floor' ? 0 : next.base.height;
  if (next.size.height - baseH2 - topT < need) next.size = { ...next.size, height: Math.max(next.size.height, s.size.height, baseH2 + topT + need) };
  return next;
}
