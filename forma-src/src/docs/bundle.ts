import JSZip from 'jszip';
import type { ManufacturingModel, Project } from '../core/schema';
import type { Estimate } from '../core/estimate';
import { buildPdf } from './pdf';
import { partsRows, hardwareRows, toCsv, PART_HEAD, HW_HEAD, holesCsv, estimateCsv, partDxf, cutDxf, docStatus } from './export';
import type { CutGroup } from '../core/cutting';
import { assemblySheet, interiorSheet } from './drawings';

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'proekt';
export function projectJson(p: Project) { return new Blob([JSON.stringify({ ...p, draft: undefined }, null, 1)], { type: 'application/json' }); }
export function csvBlob(s: string) { return new Blob([s], { type: 'text/csv;charset=utf-8' }); }
/** DXF: раскрой (листы с заготовками) и обработка (каждая деталь в готовом размере) — отдельными папками. */
export function dxfZip(m: ManufacturingModel, cut: CutGroup[]) { const z = new JSZip(); addDxf(z, m, cut); return z; }
function addDxf(z: JSZip, m: ManufacturingModel, cut: CutGroup[]) {
  const a = z.folder('Раскрой')!; cut.forEach((g, gi) => g.sheets.forEach((_, i) => a.file(`${String(gi + 1).padStart(2, '0')}_${safeName(g.material + '_' + g.thickness)}_лист${i + 1}.dxf`, cutDxf(g, i))));
  const b = z.folder('Обработка')!; for (const q of m.parts.filter(x => x.sheet)) b.file(`${q.id}_${safeName(q.name)}.dxf`, partDxf(q));
}
/** ZIP: каждый формат формируется отдельно; ошибка одного формата не отменяет остальные (список ошибок — в ОШИБКИ.txt). */
export async function buildZip(p: Project, m: ManufacturingModel, e: Estimate, onProgress?: (s: string) => void): Promise<{ blob: Blob; errors: string[] }> {
  const z = new JSZip(), n = safeName(p.name), st = docStatus(m, p.approval), errors: string[] = [];
  const add = async (label: string, f: () => any) => { try { await f(); } catch (x: any) { errors.push(`${label}: ${x?.message || x}`); } };
  await add('PDF', async () => z.file(`${n}.pdf`, await buildPdf(p, m, e, onProgress)));
  await add('JSON', () => z.file(`${n}.forma.json`, JSON.stringify({ ...p, draft: undefined }, null, 1)));
  await add('CSV деталировки', () => z.file('Деталировка.csv', toCsv(partsRows(m), PART_HEAD)));
  await add('CSV фурнитуры', () => z.file('Фурнитура.csv', toCsv(hardwareRows(m), HW_HEAD)));
  await add('CSV присадки', () => z.file('Присадка.csv', holesCsv(m)));
  await add('CSV сметы', () => z.file('Смета.csv', estimateCsv(e, p.prices?.currency || '₽')));
  await add('SVG', () => { z.file('Чертёж-сборочный.svg', assemblySheet(m, p, st)); z.file('Чертёж-корпус.svg', interiorSheet(m, p, st)); });
  await add('DXF', () => addDxf(z.folder('DXF')!, m, e.cut));
  z.file('ПРОЧТИТЕ.txt', `Проект «${p.name}», версия ${p.docVersion}, ${new Date(p.updated).toLocaleString('ru-RU')}.\r\nСтатус: ${st}.\r\nКод конфигурации: ${m.configHash}.\r\n\r\n` +
    'Все файлы построены из одной рассчитанной модели (один код конфигурации). Единицы — мм, точность — 0,1 мм.\r\n' +
    'Готовая деталь — размер после кромления. Заготовка — размер распила (готовая минус толщина кромки с каждой кромкуемой стороны, плюс припуск).\r\n\r\n' +
    'DXF/Раскрой — по листу на файл: контур листа (SHEET), заготовки (PART) с ID (PART_ID) и размерами (PART_SIZE); начало — левый нижний угол листа, X вдоль длины листа.\r\n' +
    'DXF/Обработка — по детали на файл, в ГОТОВОМ размере: контур (CONTOUR, со скруглениями R), отверстия в пласти DRILL_<грань>_D<Ø>_<THRU|Z глубина>, пазы GROOVE_*, фрезеровки MILL_*.\r\n' +
    '  База: угол W1×L1, X вдоль L, Y вдоль W, вид со стороны пласти A — так же, как u и v в Присадка.csv и в картах присадки PDF.\r\n' +
    '  Торцевые отверстия: точка на контуре + текст, слой EDGE_<торец>_D<Ø>_Z<глубина>_T<координата по толщине от пласти A>.\r\n' +
    'Отверстия выгружены только для соединений с известными параметрами фурнитуры; соединения со статусом «требует проверки» отверстий не содержат (перечень — в PDF, раздел «Готовность»).\r\n' +
    'CSV — разделитель «;», десятичная запятая, UTF-8 с BOM (открывается в Excel).\r\n' +
    (errors.length ? '\r\nНЕ СФОРМИРОВАНО: ' + errors.join('; ') + '\r\n' : ''));
  if (errors.length) z.file('ОШИБКИ.txt', errors.join('\r\n'));
  return { blob: await z.generateAsync({ type: 'blob', compression: 'DEFLATE' }), errors };
}
