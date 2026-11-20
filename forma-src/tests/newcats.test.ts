import { describe, it, expect } from 'vitest';
import { DRESSERS, BEDS, NIGHTSTANDS, applyStyle, STYLE_NAMES } from '../src/core/catalog';
import { buildModel } from '../src/core/engine';
import { ProductConfig } from '../src/core/schema';
import { estimate, demoPrices } from '../src/core/estimate';
describe('трюмо и кровати', () => {
  for (const it2 of [...DRESSERS, ...BEDS]) it(it2.id, () => {
    ProductConfig.parse(it2.config); const m = buildModel(it2.config);
    const e = m.checks.filter(c => c.level === 'error');
    console.log(it2.id, m.overall.width + '×' + m.overall.height + '×' + m.overall.depth, 'parts', m.parts.length, 'mass', m.massKg, 'est', Math.round(estimate(m, it2.config, demoPrices()).total), e.map(x => x.msg).join('|'));
    expect(e).toEqual([]);
  });
  it('стили без ошибок', () => { const bad: string[] = [];
    for (const it3 of [...DRESSERS, ...BEDS]) for (const st of Object.keys(STYLE_NAMES) as any[]) { const m = buildModel(applyStyle(it3.config, st)); const e = m.checks.filter(x => x.level === 'error'); if (e.length) bad.push(`${it3.id}→${st}: ${e[0].msg}`); }
    expect(bad).toEqual([]); });
  it('тумба без ножек', () => { const c = { ...NIGHTSTANDS[2].config, base: { ...NIGHTSTANDS[2].config.base, type: 'floor' as const, height: 0 } }; const m = buildModel(c);
    expect(m.checks.filter(x => x.level === 'error')).toEqual([]); expect(m.parts.some(p => p.role === 'leg')).toBe(false); expect(m.body.y0).toBe(0); expect(m.hardware.some(h => h.id === 'glide')).toBe(true); });
});
