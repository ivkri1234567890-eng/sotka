import JSZip from 'jszip';
import type { ManufacturingModel, Project } from '../core/schema';
import type { Estimate } from '../core/estimate';
import { buildPdf } from './pdf';
import { partsRows, hardwareRows, toCsv, PART_HEAD, HW_HEAD, holesCsv, estimateCsv, partDxf, docStatus } from './export';
import { assemblySheet, interiorSheet } from './drawings';

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'proekt';
export function projectJson(p: Project) { return new Blob([JSON.stringify({ ...p, draft: undefined }, null, 1)], { type: 'application/json' }); }
export function csvBlob(s: string) { return new Blob([s], { type: 'text/csv;charset=utf-8' }); }
export function dxfZip(m: ManufacturingModel) { const z = new JSZip(); for (const p of m.parts.filter(x => x.sheet)) z.file(`${p.id}_${safeName(p.name)}.dxf`, partDxf(p)); return z; }
export async function buildZip(p: Project, m: ManufacturingModel, e: Estimate, onProgress?: (s: string) => void): Promise<Blob> {
  const z = new JSZip(), n = safeName(p.name), st = docStatus(m);
  z.file(`${n}.pdf`, await buildPdf(p, m, e, onProgress));
  z.file(`${n}.forma.json`, JSON.stringify({ ...p, draft: undefined }, null, 1));
  z.file('Деталировка.csv', toCsv(partsRows(m), PART_HEAD));
  z.file('Фурнитура.csv', toCsv(hardwareRows(m), HW_HEAD));
  z.file('Присадка.csv', holesCsv(m));
  z.file('Смета.csv', estimateCsv(e, p.prices?.currency || '₽'));
  z.file('Чертёж-сборочный.svg', assemblySheet(m, p, st)); z.file('Чертёж-корпус.svg', interiorSheet(m, p, st));
  const d = z.folder('DXF')!; for (const q of m.parts.filter(x => x.sheet)) d.file(`${q.id}_${safeName(q.name)}.dxf`, partDxf(q));
  z.file('ПРОЧТИТЕ.txt', `Проект «${p.name}», версия ${p.docVersion}, ${new Date(p.updated).toLocaleString('ru-RU')}.\r\nСтатус: ${st}.\r\n\r\n` +
    'DXF: контуры деталей (слой CONTOUR), отверстия в пласти (DRILL_<грань>_D<Ø>_<глубина>), торцевые отверстия — точки EDGE_*, пазы GROOVE_*, фрезеровки MILL_*. Единицы — мм, начало — угол W1×L1.\r\n' +
    'Отверстия выгружены только для соединений с известными параметрами фурнитуры; соединения со статусом «требует проверки» отверстий не содержат.\r\n' +
    'CSV — разделитель «;», кодировка UTF-8 с BOM (открывается в Excel).\r\n');
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
