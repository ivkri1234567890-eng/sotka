import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { migrateProject } from '../src/core/migrate';
import { buildModel, partBox } from '../src/core/engine';
import { partsRows, holesCsv, partDxf, cutDxf, toCsv, PART_HEAD } from '../src/docs/export';
import { estimate, demoPrices } from '../src/core/estimate';
import { readiness } from '../src/core/readiness';
import { assemblySheet } from '../src/docs/drawings';

const raw = JSON.parse(fs.readFileSync('tests/fixtures/lagom.forma.json', 'utf8'));
const p = migrateProject(raw);
const m = buildModel(p.config);
describe('Лагом (файл пользователя)', () => {
  it('импорт JSON версии 1', () => { expect(p.version).toBe(1); expect(p.name).toBe('Лагом'); });
  it('S1: заготовка 183,6×392, готовая 184×394', () => {
    const s = m.parts.find(q => q.id === 'S1')!;
    expect([s.L, s.W, s.blankL, s.blankW]).toEqual([184, 394, 183.6, 392]);
    const row = partsRows(m).find(r => r.id === 'S1')!;
    expect([row.L, row.W, row.bL, row.bW]).toEqual(['184', '394', '183,6', '392']);
    const dxf = partDxf(s); expect(dxf).toContain('\n184\r'); expect(dxf).toContain('S1 184x394x16 finished; blank 183.6x392');
  });
  it('глубина 420 по столешнице и 438 с ручками', () => {
    expect(m.overall.depthTop).toBe(420); expect(m.overall.depthMax).toBe(438);
  });
  it('R40: контур в DXF столешницы и на виде сверху', () => {
    const tt = m.parts.find(q => q.id === 'TT')!;
    expect(tt.geom).toBe('panel-radius');
    const dxf = partDxf(tt); expect(dxf).toMatch(/ARC[\s\S]*\r\n40\r\n40\r\n/);
    const svg = assemblySheet(m, p, 'x'); expect(svg).toMatch(/<path d="M[^"]*A/); expect(svg).toContain('R40');
  });
  it('выступ фасада за скруглённую столешницу — место и величина', () => {
    for (const q of m.protrusions || []) { expect(q.value).toBeGreaterThan(0); expect(['left', 'right']).toContain(q.side); }
    const w = m.checks.filter(c => c.area === 'Столешница' && /выступает/.test(c.msg)); expect(w.length).toBe((m.protrusions || []).length);
  });
  it('торцевые отверстия: v по толщине от пласти A, одинаково в CSV и DXF', () => {
    const t1 = m.parts.find(q => q.id === 'T1')!; const e = t1.holes.filter(h => h.face.startsWith('W'));
    expect(e.length).toBeGreaterThan(0); for (const h of e) expect(h.v).toBe(8);
    expect(holesCsv(m)).toContain('v по толщине от пласти A');
    expect(partDxf(t1)).toMatch(/EDGE_W1_D5_Z\d+(\.\d)?_T8/);
  });
  it('ручка-кнопка: винт проходит фасад и стенку ящика — полный узел', () => {
    const j = m.joints.filter(x => x.kind === 'handle');
    expect(j.length).toBe(2);
    for (const x of j) { expect(x.parts.length).toBe(3); expect(x.note).toMatch(/фасад 16 \+ передняя стенка ящика 16 = 32 мм/); expect(x.note).toMatch(/М4×40/); }
    const wall = m.parts.find(q => q.id === 'DR1c')!; expect(wall.holes.some(h => /Винт ручки/.test(h.kind))).toBe(true);
  });
  it('смета: МДФ одной толщины — один материал, эмали разных цветов — разные операции', () => {
    const e = estimate(m, p.config, demoPrices());
    const mdf = e.lines.filter(l => l.group === 'Материалы' && /МДФ/.test(l.name)); expect(mdf.length).toBe(1);
    const ldsp = e.lines.filter(l => l.group === 'Материалы' && /ЛДСП 16/.test(l.name)); expect(ldsp.length).toBe(1);
    const paint = e.lines.filter(l => l.group === 'Отделка'); expect(paint.map(l => l.name).sort()).toEqual(['Эмаль матовая · RAL 7004', 'Эмаль матовая · RAL 9016']);
  });
  it('карта раскроя DXF: у каждой детали ID и десятые', () => {
    const e = estimate(m, p.config, demoPrices());
    for (const g of e.cut) g.sheets.forEach((sh, i) => { const d = cutDxf(g, i); for (const q of sh.placements) expect(d).toContain('\r\n' + q.id + '\r\n'); });
    const g = e.cut.find(x => x.material === 'ldsp')!; expect(cutDxf(g, 0)).toContain('183.6x392');
  });
  it('геометрия и готовность — отдельно', () => {
    const r = readiness(m, null); expect(r.geometryOk).toBe(true); expect(r.status).toBe('needs-data');
    expect(r.issues.some(i => i.level === 'block' && /направляющ/i.test(i.title + i.missing.join()))).toBe(true);
    const ok = readiness(m, { by: 'Т', at: '', hash: m.configHash, note: '' }); expect(ok.status).toBe('needs-data');
  });
  it('стабильность: результат и крепление от опрокидывания указаны', () => { expect(m.stability?.checked).toBe(true); expect(m.stability?.antiTipText).toBeTruthy(); });
  it('CSV деталировки — десятичная запятая', () => { expect(toCsv(partsRows(m), PART_HEAD)).toContain('S1;Боковина левая;ЛДСП;16;декор «Белый»;184;394;183,6;392'); });
});
