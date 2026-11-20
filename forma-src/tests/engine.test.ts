import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/core/catalog';
import { buildModel } from '../src/core/engine';
import { ProductConfig } from '../src/core/schema';
describe('catalog', () => {
  for (const it2 of CATALOG) it(it2.id, () => {
    ProductConfig.parse(it2.config);
    const m = buildModel(it2.config);
    const errs = m.checks.filter(c => c.level === 'error');
    console.log(it2.id, 'parts', m.parts.length, 'joints', m.joints.length, 'holes', m.parts.reduce((s,p)=>s+p.holes.length,0), 'mass', m.massKg, 'steps', m.steps.map(s=>s.title).join(' > '));
    if (errs.length) console.log('  ERR', errs.map(e => e.msg).join(' | '));
    const w = m.checks.filter(c => c.level === 'warn'); if (w.length) console.log('  WARN', w.map(e => e.msg).join(' | ').slice(0, 600));
    expect(errs).toEqual([]);
  });
});
import { applyStyle, NIGHTSTANDS as NS } from '../src/core/catalog';
describe('style', () => { it('смена стиля подвесной тумбы не ломает корпус', () => {
  const c = applyStyle(NS[0].config, 'scandi'); const m = buildModel(c);
  expect(m.checks.filter(x => x.level === 'error')).toEqual([]); expect(m.parts.length).toBeGreaterThan(5);
}); });
import { CATALOG as ALL, STYLE_NAMES } from '../src/core/catalog';
describe('все стили для всех моделей', () => { it('без ошибок', () => {
  const bad: string[] = [];
  for (const it3 of ALL) for (const st of Object.keys(STYLE_NAMES) as any[]) { const m = buildModel(applyStyle(it3.config, st)); const e = m.checks.filter(x => x.level === 'error'); if (e.length) bad.push(`${it3.id}→${st}: ${e[0].msg}`); }
  expect(bad).toEqual([]);
}); });
