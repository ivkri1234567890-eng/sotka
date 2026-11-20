/** Материалы, декоры и подборка RAL. Значения плотности и модуля упругости — ориентировочные справочные, для оценок. */
import type { Finish, MaterialIdT } from './schema';

export type MaterialInfo = {
  id: MaterialIdT; name: string; short: string; hint: string;
  thicknesses: number[]; sheet: { L: number; W: number }; // формат листа по умолчанию
  density: number;            // кг/м³, ориентир
  E: number;                  // модуль упругости при изгибе, МПа, ориентир
  creep: number;              // множитель длительной ползучести для оценки прогиба
  finishKinds: Finish['kind'][];
  edge: 'pvc' | 'veneer' | 'paint' | 'none';  // чем закрываются торцы
  grainDefault: boolean;      // есть направление рисунка
  milling: boolean;           // допускает фрезеровку фасадов
  paint: boolean;             // окраска эмалью
};

export const MATERIALS: Record<MaterialIdT, MaterialInfo> = {
  ldsp: { id: 'ldsp', name: 'ЛДСП', short: 'ЛДСП', hint: 'Ламинированная плита: недорого, готовый декор, торцы закрываются кромкой ПВХ.',
    thicknesses: [16, 18, 22, 25], sheet: { L: 2800, W: 2070 }, density: 680, E: 2800, creep: 2.5,
    finishKinds: ['decor'], edge: 'pvc', grainDefault: true, milling: false, paint: false },
  'mdf-enamel': { id: 'mdf-enamel', name: 'МДФ под эмаль', short: 'МДФ эмаль', hint: 'Окраска в любой цвет RAL, возможна фрезеровка фасадов. Торцы окрашиваются.',
    thicknesses: [16, 19, 22], sheet: { L: 2800, W: 2070 }, density: 750, E: 3200, creep: 2.2,
    finishKinds: ['ral'], edge: 'paint', grainDefault: false, milling: true, paint: true },
  'mdf-veneer': { id: 'mdf-veneer', name: 'МДФ со шпоном', short: 'МДФ шпон', hint: 'Натуральный шпон на МДФ, покрытие лаком. Торцы — шпонированная кромка.',
    thicknesses: [16, 19], sheet: { L: 2800, W: 2070 }, density: 760, E: 3300, creep: 2.2,
    finishKinds: ['wood'], edge: 'veneer', grainDefault: true, milling: false, paint: false },
  plywood: { id: 'plywood', name: 'Фанера', short: 'Фанера', hint: 'Берёзовая фанера: прочная, видимый слоистый торец. Лак или эмаль.',
    thicknesses: [12, 15, 18, 21], sheet: { L: 1525, W: 1525 }, density: 650, E: 7000, creep: 1.6,
    finishKinds: ['natural', 'ral'], edge: 'none', grainDefault: true, milling: false, paint: true },
  solid: { id: 'solid', name: 'Мебельный щит', short: 'Щит', hint: 'Клеёный массив (ламели). Масло, лак или эмаль. Торцы — массив.',
    thicknesses: [18, 20, 28, 40], sheet: { L: 2000, W: 600 }, density: 600, E: 9000, creep: 1.6,
    finishKinds: ['wood', 'ral'], edge: 'none', grainDefault: true, milling: false, paint: true },
};

export const BACKS = {
  hdf: { name: 'ХДФ (оргалит)', thicknesses: [3, 4], sheet: { L: 2800, W: 2070 }, density: 850 },
  'plywood-thin': { name: 'Фанера тонкая', thicknesses: [4, 6], sheet: { L: 1525, W: 1525 }, density: 650 },
} as const;

export const DRAWER_BOX = {
  ldsp: { name: 'ЛДСП белая', thicknesses: [16], density: 680 },
  plywood: { name: 'Фанера', thicknesses: [12, 15], density: 650 },
} as const;

/** Декоры ЛДСП — условные названия программы, не артикулы конкретного производителя плиты. */
export const DECORS = [
  { code: 'W-white', name: 'Белый', hex: '#f1f0ec', wood: false },
  { code: 'W-cream', name: 'Кашемир', hex: '#d9d0c1', wood: false },
  { code: 'G-grey', name: 'Серый камень', hex: '#9b9a96', wood: false },
  { code: 'G-anth', name: 'Антрацит', hex: '#3d3f42', wood: false },
  { code: 'B-black', name: 'Чёрный', hex: '#1c1c1c', wood: false },
  { code: 'D-oak-nat', name: 'Дуб натуральный', hex: '#c49a6c', wood: true },
  { code: 'D-oak-sonoma', name: 'Дуб светлый', hex: '#d8bd94', wood: true },
  { code: 'D-walnut', name: 'Орех', hex: '#7a5338', wood: true },
  { code: 'D-ash', name: 'Ясень серый', hex: '#a8a092', wood: true },
];
export const WOODS = [
  { code: 'oak', name: 'Дуб', hex: '#c8a273' }, { code: 'oak-smoked', name: 'Дуб тонированный', hex: '#8a6748' },
  { code: 'walnut', name: 'Американский орех', hex: '#6f4a32' }, { code: 'ash', name: 'Ясень', hex: '#d5c3a1' },
  { code: 'birch', name: 'Берёза', hex: '#e2cfa8' }, { code: 'pine', name: 'Сосна', hex: '#e6c48f' }, { code: 'beech', name: 'Бук', hex: '#d6a87a' },
];

/**
 * Ограниченная подборка RAL Classic (48 цветов) — НЕ полный каталог.
 * Экранные цвета приблизительны (sRGB-ориентиры); перед изготовлением нужен физический образец.
 */
export const RAL: { code: string; name: string; hex: string }[] = [
  ['1013', 'Жемчужно-белый', '#e3d9c6'], ['1014', 'Слоновая кость', '#ddc49a'], ['1015', 'Светлая слоновая кость', '#e6d2b5'], ['1019', 'Серо-бежевый', '#9e9287'],
  ['1001', 'Бежевый', '#d0b084'], ['1002', 'Песочно-жёлтый', '#d2aa6d'], ['1011', 'Коричнево-бежевый', '#8a6642'], ['1036', 'Перламутрово-золотой', '#927549'],
  ['2001', 'Красно-оранжевый', '#ba481c'], ['3009', 'Оксидно-красный', '#6d342d'], ['3012', 'Бежево-красный', '#c6846d'], ['3014', 'Розовый антик', '#cb7375'],
  ['3015', 'Светло-розовый', '#d8a0a6'], ['3022', 'Лососево-красный', '#cf6955'], ['4009', 'Пастельно-фиолетовый', '#9d8692'], ['5000', 'Фиолетово-синий', '#354d73'],
  ['5003', 'Сапфирово-синий', '#1f3855'], ['5011', 'Стальной синий', '#1a2b3c'], ['5014', 'Голубино-синий', '#637d96'], ['5024', 'Пастельно-синий', '#5d9bbe'],
  ['6003', 'Оливковый', '#50533c'], ['6005', 'Зелёный мох', '#0f4336'], ['6011', 'Резедово-зелёный', '#6c7c59'], ['6013', 'Тростниковый зелёный', '#7c765a'],
  ['6019', 'Бело-зелёный', '#b9ceac'], ['6021', 'Бледно-зелёный', '#8a9977'], ['6028', 'Сосновый зелёный', '#2d5546'], ['6034', 'Пастельно-бирюзовый', '#7faeb2'],
  ['7001', 'Серебристо-серый', '#8c969d'], ['7004', 'Сигнальный серый', '#9ea0a1'], ['7016', 'Антрацитово-серый', '#383e42'], ['7021', 'Чёрно-серый', '#2e3234'],
  ['7024', 'Графитовый серый', '#45494e'], ['7030', 'Каменно-серый', '#939388'], ['7035', 'Светло-серый', '#cbd0cc'], ['7036', 'Платиново-серый', '#9a9697'],
  ['7037', 'Пыльно-серый', '#7a7b7a'], ['7039', 'Кварцевый серый', '#6b685e'], ['7044', 'Шёлково-серый', '#cac4b0'], ['7047', 'Телегрей 4', '#d0d0d0'],
  ['8017', 'Шоколадно-коричневый', '#45302b'], ['8019', 'Серо-коричневый', '#3d3635'], ['8025', 'Бледно-коричневый', '#755847'], ['9001', 'Кремово-белый', '#e9e0d2'],
  ['9002', 'Светло-серый (белый)', '#d7d5cb'], ['9003', 'Сигнальный белый', '#ecece7'], ['9005', 'Чёрный янтарь', '#0e0e10'], ['9010', 'Чистый белый', '#f1ede1'],
  ['9016', 'Транспортный белый', '#f1f1ea'],
].map(([code, name, hex]) => ({ code, name, hex }));

export const METALS = [
  { code: 'black', name: 'Чёрный матовый', hex: '#222222' }, { code: 'brass', name: 'Латунь', hex: '#b08d57' },
  { code: 'chrome', name: 'Хром', hex: '#c8ccd0' }, { code: 'graphite', name: 'Графит', hex: '#4a4c50' }, { code: 'white', name: 'Белый', hex: '#efefef' },
];

export const SHEEN_NAMES = { matte: 'Матовый', satin: 'Сатиновый', gloss: 'Глянцевый' } as const;

export function finishHex(f: Finish | null | undefined): string {
  if (!f) return '#cccccc';
  if (f.kind === 'ral') return (RAL.find(r => r.code === f.code) || { hex: '#cccccc' }).hex;
  if (f.kind === 'decor') return (DECORS.find(d => d.code === f.code) || { hex: '#cccccc' }).hex;
  if (f.kind === 'wood') return (WOODS.find(d => d.code === f.code) || { hex: '#c8a273' }).hex;
  return '#dcc8a6'; // натуральная фанера
}
export function finishName(f: Finish | null | undefined): string {
  if (!f) return '—';
  const sh = SHEEN_NAMES[f.sheen] || '';
  if (f.kind === 'ral') { const r = RAL.find(x => x.code === f.code); return `RAL ${f.code}${r ? ' «' + r.name + '»' : ''}, ${sh.toLowerCase()}`; }
  if (f.kind === 'decor') { const d = DECORS.find(x => x.code === f.code); return `декор «${d ? d.name : f.code}»`; }
  if (f.kind === 'wood') { const d = WOODS.find(x => x.code === f.code); return `${d ? d.name : f.code}, лак ${sh.toLowerCase()}`; }
  return `натуральная, лак ${sh.toLowerCase()}`;
}
export function isWoodLike(f: Finish | null | undefined): boolean {
  if (!f) return false;
  if (f.kind === 'wood' || f.kind === 'natural') return true;
  if (f.kind === 'decor') return !!DECORS.find(d => d.code === f.code)?.wood;
  return false;
}
/** Проверка, что отделка совместима с материалом; при несовместимости — подходящая замена. */
export function fixFinish(mat: MaterialIdT, f: Finish): Finish {
  const m = MATERIALS[mat];
  if (m.finishKinds.includes(f.kind)) return f;
  const k = m.finishKinds[0];
  if (k === 'ral') return { kind: 'ral', code: '9010', sheen: f.sheen };
  if (k === 'decor') return { kind: 'decor', code: 'W-white', sheen: 'matte' };
  if (k === 'wood') return { kind: 'wood', code: 'oak', sheen: f.sheen };
  return { kind: 'natural', code: 'birch', sheen: f.sheen };
}
export function searchRal(q: string) {
  const s = q.trim().toLowerCase().replace(/^ral\s*/, '');
  if (!s) return RAL;
  return RAL.filter(r => r.code.includes(s) || r.name.toLowerCase().includes(s));
}
