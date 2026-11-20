/**
 * Разбор текстового описания без ИИ: простые правила → изменения ProductConfig.
 * Координаты деталей, присадку и нагрузки текст не задаёт — их всегда считает ядро.
 */
import type { ProductConfig } from './schema';
import { RAL, WOODS, METALS, fixFinish } from './materials';
import { applyStyle, ZONE } from './catalog';

const NUMW: Record<string, number> = { 'один': 1, 'одна': 1, 'одним': 1, 'два': 2, 'две': 2, 'двумя': 2, 'три': 3, 'тремя': 3, 'четыре': 4, 'пять': 5 };
export function parseRequest(text: string, c0: ProductConfig): { config: ProductConfig; changed: string[] } {
  const t = ' ' + text.toLowerCase().replace(/ё/g, 'е') + ' ';
  let c: ProductConfig = JSON.parse(JSON.stringify(c0)); const ch: string[] = [];
  const num = (re: RegExp) => { const m = t.match(re); return m ? Number(m[1].replace(',', '.')) : null; };
  const toMm = (v: number) => v < 10 ? v * 1000 : v < 300 && v > 20 ? v * 10 : v; // 0.5 м, 50 см, 500 мм
  const w = num(/ширин\w*\s*(\d+[.,]?\d*)/) ?? num(/(?:шкаф|тумб\w*)\s+(\d{3,4})\b/); if (w) { c.size.width = toMm(w); ch.push('ширина ' + c.size.width); }
  const h = num(/высот\w*\s*(\d+[.,]?\d*)/); if (h) { c.size.height = toMm(h); ch.push('высота ' + c.size.height); }
  const d = num(/глубин\w*\s*(\d+[.,]?\d*)/); if (d) { c.size.depth = toMm(d); ch.push('глубина ' + c.size.depth); }
  const styles: [RegExp, ProductConfig['style']][] = [[/минимал/, 'minimal'], [/джапанди|японск/, 'japandi'], [/сканд/, 'scandi'], [/лофт/, 'loft'], [/неоклас|классич/, 'neoclassic'], [/современ|модерн/, 'modern']];
  for (const [re, s] of styles) if (re.test(t)) { c = applyStyle(c, s); ch.push('стиль'); break; }
  const dm = t.match(/(\d|один|одна|два|две|три|четыре)\s+ящик/); const dn = dm ? (NUMW[dm[1]] || Number(dm[1])) : null;
  if (dn && c.category === 'nightstand') { c.columns = [{ width: null, zones: Array.from({ length: Math.min(4, dn) }, () => ZONE('drawer')) }]; if (/ниш|открыт/.test(t)) c.columns[0].zones.push(ZONE('open')); ch.push(dn + ' ящ.'); }
  const doors = t.match(/(\d|одн\w*|две|двумя|три|тремя)\s+двер/); const drn = doors ? (NUMW[doors[1]] || Number(doors[1]) || 1) : null;
  if (drn && c.category === 'wardrobe') { const n = Math.max(1, Math.min(6, Math.ceil(drn / 2))); c.columns = Array.from({ length: n }, (_, i) => ({ width: null, zones: [ZONE('door', { rod: i === 0, shelves: i === 0 ? 1 : 4, doors: drn >= 2 * (i + 1) ? 'double' as const : 'auto' as const }), ...(/ящик/.test(t) && i === n - 1 ? [ZONE('drawer', { height: 180 }), ZONE('drawer', { height: 180 })] : [])] })); ch.push(drn + ' двер.'); }
  if (/подвесн|на стен/.test(t)) { c.base = { ...c.base, type: 'wall', height: 0 }; ch.push('подвесная'); }
  else if (/цокол/.test(t)) { c.base = { ...c.base, type: 'plinth', height: 80 }; ch.push('цоколь'); }
  else if (/ножк\w*\s+металл|металлическ\w*\s+(ножк|опор)/.test(t)) { c.base = { ...c.base, type: 'legs-metal', height: c.base.height || 150 }; ch.push('металлические опоры'); }
  else if (/ножк/.test(t)) { c.base = { ...c.base, type: 'legs-wood', height: c.base.height || 150 }; ch.push('деревянные ножки'); }
  const ral = t.match(/ral\s*(\d{4})/); if (ral && RAL.find(r => r.code === ral[1])) {
    for (const k of ['body', 'fronts'] as const) { if (c[k].material === 'ldsp' || c[k].material === 'mdf-veneer') { c[k] = { ...c[k], material: 'mdf-enamel', thickness: k === 'fronts' ? 19 : 16 } as any; } c[k] = { ...c[k], finish: { kind: 'ral', code: ral[1], sheen: c[k].finish.sheen } } as any; }
    ch.push('RAL ' + ral[1]);
  }
  const wood = WOODS.find(wd => t.includes(' ' + wd.name.toLowerCase().slice(0, 4)));
  if (wood && !ral) { for (const k of ['body', 'fronts'] as const) { c[k] = { ...c[k], material: 'mdf-veneer', thickness: c[k].thickness === 19 ? 19 : 16, finish: { kind: 'wood', code: wood.code, sheen: 'matte' } } as any; } ch.push('шпон ' + wood.name.toLowerCase()); }
  if (/фанер/.test(t)) { for (const k of ['body', 'fronts'] as const) c[k] = { ...c[k], material: 'plywood', thickness: 18, finish: fixFinish('plywood', { kind: 'natural', code: 'birch', sheen: 'matte' }) } as any; ch.push('фанера'); }
  if (/без ручек|нажати/.test(t)) { c.handles.type = 'push'; ch.push('без ручек'); }
  else if (/кнопк/.test(t)) { c.handles.type = 'knob'; ch.push('ручки-кнопки'); }
  else if (/скоб/.test(t)) { c.handles.type = 'bar'; ch.push('ручки-скобы'); }
  const met = METALS.find(m => t.includes(m.name.toLowerCase().slice(0, 5)) || (m.code === 'brass' && /латун/.test(t)) || (m.code === 'black' && /черн\w* ручк/.test(t)));
  if (met && /ручк|латун/.test(t)) { c.handles.color = met.code; ch.push('цвет ручек'); }
  return { config: c, changed: ch };
}
