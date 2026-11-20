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
