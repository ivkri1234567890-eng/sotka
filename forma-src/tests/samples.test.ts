import { it } from 'vitest';
import fs from 'fs';
import { NIGHTSTANDS, WARDROBES } from '../src/core/catalog';
import { buildModel } from '../src/core/engine';
it('samples', () => {
  for (const [n, c] of [['nightstand', NIGHTSTANDS[2].config], ['wardrobe', WARDROBES[2].config]] as const) {
    fs.writeFileSync(`docs/sample-${n}-config.json`, JSON.stringify(c, null, 1));
    const m = buildModel(c);
    fs.writeFileSync(`docs/sample-${n}-model.json`, JSON.stringify(m, null, 1));
  }
});
