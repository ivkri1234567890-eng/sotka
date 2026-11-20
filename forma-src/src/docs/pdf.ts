import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import type { ManufacturingModel, Project } from '../core/schema';
import type { Estimate } from '../core/estimate';
import { assemblySheet, interiorSheet, partSheet, cutSheetSvg } from './drawings';
import { partsRows, hardwareRows, docStatus, EDGE_RU, STATUS_RU } from './export';
import { HW } from '../core/hardware';
import { shot } from '../ui/offscreen';
import { STYLE_NAMES } from '../core/catalog';
import regularUrl from '../assets/fonts/Roboto-Regular.ttf?url';
import mediumUrl from '../assets/fonts/Roboto-Medium.ttf?url';

let fonts: { r: string; m: string } | null = null;
async function b64(url: string) { const b = new Uint8Array(await (await fetch(url)).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000))); return btoa(s); }
async function setupFonts(doc: jsPDF) {
  if (!fonts) fonts = { r: await b64(regularUrl), m: await b64(mediumUrl) };
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.r); doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFileToVFS('Roboto-Medium.ttf', fonts.m); doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');
}
async function svgPage(doc: jsPDF, svg: string, fmt: 'a3' | 'a4', first = false) {
  if (!first) doc.addPage(fmt, 'landscape');
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden';
  host.innerHTML = svg; document.body.appendChild(host);
  const el = host.querySelector('svg')!; const vb = el.getAttribute('viewBox')!.split(' ').map(Number);
  try { await (doc as any).svg(el, { x: 0, y: 0, width: vb[2], height: vb[3] }); } finally { host.remove(); }
}
type Col = { k: string; t: string; w: number; a?: 'r' };
function table(doc: jsPDF, title: string, cols: Col[], rows: Record<string, any>[], o: { size?: number; header?: string } = {}) {
  const fs = o.size || 7.5, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(); let y = 16;
  const head = () => { doc.setFont('Roboto', 'bold'); doc.setFontSize(12); doc.text(title, 12, y); y += 5; if (o.header) { doc.setFont('Roboto', 'normal'); doc.setFontSize(8); const ls = doc.splitTextToSize(o.header, W - 24); doc.text(ls, 12, y + 2); y += ls.length * 3.6 + 2; }
    doc.setFont('Roboto', 'bold'); doc.setFontSize(fs); let x = 12; doc.setFillColor(238, 234, 226); doc.rect(12, y, W - 24, 6, 'F'); for (const c of cols) { doc.text(c.t, c.a === 'r' ? x + c.w - 1 : x + 1, y + 4, { align: c.a === 'r' ? 'right' : 'left' }); x += c.w; } y += 7; doc.setFont('Roboto', 'normal'); };
  head();
  for (const r of rows) {
    const cells = cols.map(c => doc.splitTextToSize(String(r[c.k] ?? ''), c.w - 2) as string[]); const hh = Math.max(...cells.map(c => c.length)) * fs * 0.42 + 2;
    if (y + hh > H - 12) { doc.addPage('a4', W > H ? 'landscape' : 'portrait'); y = 16; head(); }
    if (r.__bold) doc.setFont('Roboto', 'bold');
    let x = 12; cells.forEach((cl, i) => { doc.text(cl, cols[i].a === 'r' ? x + cols[i].w - 1 : x + 1, y + fs * 0.35, { align: cols[i].a === 'r' ? 'right' : 'left' }); x += cols[i].w; });
    doc.setFont('Roboto', 'normal'); y += hh; doc.setDrawColor(225, 220, 210); doc.line(12, y - 1, W - 12, y - 1);
  }
  return y;
}
function stamp(doc: jsPDF, p: Project, status: string) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(); doc.setFont('Roboto', 'normal'); doc.setFontSize(7); doc.setTextColor(120);
    doc.text(`Форма · ${p.name} · версия ${p.docVersion} · ${new Date(p.updated).toLocaleDateString('ru-RU')} · ${status} · стр. ${i}/${n}`, W / 2, H - 5, { align: 'center' }); doc.setTextColor(0); }
}

export async function buildPdf(p: Project, m: ManufacturingModel, e: Estimate, onProgress?: (s: string) => void): Promise<Blob> {
  const status = docStatus(m), c = p.config;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }); await setupFonts(doc);
  const W = 210;
  onProgress?.('Титульный лист');
  doc.setFont('Roboto', 'bold'); doc.setFontSize(22); doc.text(p.name, 14, 24);
  doc.setFont('Roboto', 'normal'); doc.setFontSize(11);
  doc.text(`${c.category === 'nightstand' ? 'Прикроватная тумба' : 'Шкаф'} · стиль «${STYLE_NAMES[c.style]}» · ${m.overall.width}×${m.overall.height}×${m.overall.depth} мм`, 14, 32);
  doc.text(`Версия документов ${p.docVersion} · ${new Date(p.updated).toLocaleString('ru-RU')} · код конфигурации ${m.configHash}`, 14, 38);
  doc.setTextColor(154, 52, 18); doc.setFont('Roboto', 'bold'); doc.text(status, 14, 45); doc.setTextColor(0); doc.setFont('Roboto', 'normal');
  const img = shot(m, c, { w: 1200, h: 900, dims: true }); doc.addImage(img, 'PNG', 14, 50, 182, 136.5);
  doc.setFontSize(9);
  const notes = [
    'Состав: сборочный чертёж и проекции; корпус и наполнение; разнесённый вид; деталировка; карта кромления; спецификация фурнитуры и соединений; карты присадки; карты раскроя; смета; инструкция по сборке; проверки и ограничения.',
    `Габарит включает: ${m.overall.includes.base ? 'основание, ' : ''}${m.overall.includes.top ? 'столешницу, ' : ''}${m.overall.includes.fronts ? 'накладные фасады' : 'вкладные фасады'}${m.overall.handleProtrusion ? `; ручки выступают ещё на ${m.overall.handleProtrusion} мм` : ''}.`,
    'Это эскизный проект, рассчитанный программой. Он не является проверенной производственной документацией: присадка формируется только по профилям фурнитуры с известными данными, остальное помечено «требует проверки».',
    'Цвета на экране и в PDF приблизительны — перед изготовлением нужен физический образец. Декоры ЛДСП и шпон не совпадают с RAL точно.',
    e.incomplete.length ? 'Смета неполная: ' + e.incomplete.join('; ') + '.' : '', (p.prices?.demo ?? true) ? 'Смета посчитана по демонстрационным ставкам — это не рыночные цены.' : '',
  ].filter(Boolean);
  let y = 194; for (const t of notes) { const l = doc.splitTextToSize(t, W - 28); doc.text(l, 14, y); y += l.length * 4 + 1.5; }
  if (p.photos.length) { doc.addPage('a4', 'portrait'); doc.setFont('Roboto', 'bold'); doc.setFontSize(12); doc.text('Фото-образцы заказчика (только как образец, размеры по ним не определяются)', 14, 16); let yy = 22;
    for (const ph of p.photos.slice(0, 4)) { try { doc.addImage(ph.dataUrl, 'JPEG', 14, yy, 90, 65); } catch { /* */ } yy += 70; } }
  onProgress?.('Чертежи');
  doc.addPage('a3', 'landscape'); await svgPage(doc, assemblySheet(m, p, status), 'a3', true);
  await svgPage(doc, interiorSheet(m, p, status), 'a3');
  doc.addPage('a4', 'landscape'); doc.setFont('Roboto', 'bold'); doc.setFontSize(12); doc.text('Разнесённый вид', 12, 14);
  doc.addImage(shot(m, c, { w: 1400, h: 900, exploded: true }), 'PNG', 12, 18, 210, 135); doc.setFont('Roboto', 'normal'); doc.setFontSize(8);
  doc.text(doc.splitTextToSize('Детали раздвинуты от центра, чтобы были видны все элементы. Обозначения деталей — на листе «Корпус и наполнение» и в деталировке.', 50), 230, 24);
  onProgress?.('Деталировка');
  doc.addPage('a4', 'landscape');
  table(doc, 'Деталировка (готовые размеры и заготовки, мм)', [
    { k: 'id', t: 'ID', w: 14 }, { k: 'name', t: 'Деталь', w: 42 }, { k: 'material', t: 'Материал', w: 28 }, { k: 't', t: 'T', w: 8, a: 'r' }, { k: 'L', t: 'L готов.', w: 15, a: 'r' }, { k: 'W', t: 'W готов.', w: 15, a: 'r' },
    { k: 'bL', t: 'L загот.', w: 15, a: 'r' }, { k: 'bW', t: 'W загот.', w: 15, a: 'r' }, { k: 'grain', t: 'Текстура', w: 16 }, { k: 'finish', t: 'Отделка', w: 46 }, { k: 'holes', t: 'Отв.', w: 9, a: 'r' }, { k: 'ops', t: 'Обработка', w: 50 }],
    partsRows(m), { header: 'Готовая деталь — размер после кромления. Заготовка — размер распила: готовый размер минус толщина кромки ПВХ/шпона (плюс припуск, если задан). L — вдоль текстуры.' });
  const other = m.parts.filter(q => !q.sheet);
  if (other.length) { doc.addPage('a4', 'landscape'); table(doc, 'Покупные и металлические элементы', [{ k: 'id', t: 'ID', w: 16 }, { k: 'name', t: 'Элемент', w: 80 }, { k: 'material', t: 'Материал', w: 60 }, { k: 'len', t: 'Длина/высота, мм', w: 40, a: 'r' }], other.map(q => ({ id: q.id, name: q.name, material: q.materialName, len: q.L }))); }
  doc.addPage('a4', 'landscape');
  table(doc, 'Карта кромления', [{ k: 'id', t: 'ID', w: 16 }, { k: 'name', t: 'Деталь', w: 60 }, { k: 'L', t: 'Размер', w: 28 }, { k: 'L1', t: 'L1 (зад/низ)', w: 34 }, { k: 'L2', t: 'L2 (перед/верх)', w: 34 }, { k: 'W1', t: 'W1 (торец)', w: 34 }, { k: 'W2', t: 'W2 (торец)', w: 34 }, { k: 'len', t: 'Кромки, м', w: 20, a: 'r' }],
    m.parts.filter(q => q.sheet).map(q => ({ id: q.id, name: q.name, L: `${q.L}×${q.W}`, L1: EDGE_RU[q.edges.L1.kind], L2: EDGE_RU[q.edges.L2.kind], W1: EDGE_RU[q.edges.W1.kind], W2: EDGE_RU[q.edges.W2.kind],
      len: ((['L1', 'L2'] as const).filter(k => ['thin', 'thick', 'veneer'].includes(q.edges[k].kind)).length * q.L + (['W1', 'W2'] as const).filter(k => ['thin', 'thick', 'veneer'].includes(q.edges[k].kind)).length * q.W) / 1000 })),
    { header: 'L1/L2 — длинные кромки детали (вдоль L), W1/W2 — короткие торцы. Для боковин L2 — передний край, для горизонтальных деталей L2 — передний край.' });
  onProgress?.('Фурнитура');
  doc.addPage('a4', 'landscape');
  let yy = table(doc, 'Спецификация фурнитуры и крепежа', [{ k: 'name', t: 'Наименование', w: 70 }, { k: 'article', t: 'Производитель, артикул', w: 50 }, { k: 'qty', t: 'Кол-во', w: 16, a: 'r' }, { k: 'unit', t: 'Ед.', w: 12 }, { k: 'joints', t: 'Соед.', w: 14, a: 'r' }, { k: 'status', t: 'Профиль', w: 34 }, { k: 'missing', t: 'Не хватает данных', w: 77 }], hardwareRows(m),
    { header: 'Количество крепежа = сумма по соединениям (см. следующую таблицу) и совпадает с инструкцией по сборке.' });
  void yy;
  doc.addPage('a4', 'landscape');
  table(doc, 'Соединения', [{ k: 'id', t: 'ID', w: 12 }, { k: 'title', t: 'Соединение', w: 90 }, { k: 'parts', t: 'Детали', w: 60 }, { k: 'hw', t: 'Крепёж', w: 70 }, { k: 'st', t: 'Статус', w: 40 }],
    m.joints.map(j => ({ id: j.id, title: j.title + (j.note ? ' — ' + j.note : ''), parts: j.parts.join(', '), hw: j.hardware.map(h => `${HW[h.id]?.name || h.id} × ${h.qty}`).join('; ') || '—', st: STATUS_RU[j.status] })));
  onProgress?.('Присадка');
  let n = 0;
  for (const q of m.parts.filter(q => q.sheet && (q.holes.length || q.ops.length))) { n++; doc.addPage('a4', 'landscape'); await svgPage(doc, partSheet(q, p, m.checks.some(x => x.level === 'error') ? status : 'ПРИСАДКА — ТРЕБУЕТ ПРОВЕРКИ', 'П' + n), 'a4', true); }
  const unv = m.joints.filter(j => j.status === 'unverified');
  if (unv.length) { doc.addPage('a4', 'landscape'); table(doc, 'Присадка не сформирована — требует проверки', [{ k: 'title', t: 'Соединение', w: 110 }, { k: 'hw', t: 'Фурнитура', w: 80 }, { k: 'miss', t: 'Не хватает данных', w: 83 }],
    unv.map(j => ({ title: j.title, hw: j.hardware.map(h => HW[h.id]?.name || h.id).join('; '), miss: [...new Set(j.hardware.flatMap(h => HW[h.id]?.missing || []))].join('; ') }))); }
  onProgress?.('Раскрой');
  let cs = 0; for (const g of e.cut) for (let i = 0; i < g.sheets.length; i++) { cs++; doc.addPage('a4', 'landscape'); await svgPage(doc, cutSheetSvg(g, i, p, status, 'Р' + cs), 'a4', true); }
  doc.addPage('a4', 'landscape');
  table(doc, 'Сводка раскроя', [{ k: 't', t: 'Группа материала', w: 110 }, { k: 'n', t: 'Листов', w: 18, a: 'r' }, { k: 'pa', t: 'Детали, м²', w: 24, a: 'r' }, { k: 'sa', t: 'Листы, м²', w: 24, a: 'r' }, { k: 'w', t: 'Остатки, м²', w: 24, a: 'r' }, { k: 'o', t: 'Крупные остатки, мм', w: 73 }],
    e.cut.map(g => ({ t: g.title + (g.unplaced.length ? ` — НЕ ПОМЕЩАЮТСЯ: ${g.unplaced.map(u => u.id).join(', ')}` : ''), n: g.sheets.length, pa: (g.partArea / 1e6).toFixed(2), sa: (g.sheetArea / 1e6).toFixed(2), w: ((g.sheetArea - g.partArea) / 1e6).toFixed(2), o: g.offcuts.map(x => `${x.w}×${x.h}`).join(', ') })),
    { header: `Пропил ${p.prices?.kerf ?? 4} мм, обрезка кромки листа ${p.prices?.trim ?? 10} мм. Детали с текстурой не поворачиваются. Раскрой эвристический (MaxRects), не гарантированно оптимальный.` });
  onProgress?.('Смета');
  doc.addPage('a4', 'portrait');
  const cur = p.prices?.currency || '₽';
  table(doc, 'Смета', [{ k: 'group', t: 'Раздел', w: 32 }, { k: 'name', t: 'Позиция', w: 62 }, { k: 'qty', t: 'Кол-во', w: 18, a: 'r' }, { k: 'unit', t: 'Ед.', w: 12 }, { k: 'price', t: 'Цена', w: 20, a: 'r' }, { k: 'sum', t: 'Сумма', w: 22, a: 'r' }],
    [...e.lines.map(l => ({ ...l, price: l.price == null ? 'не задана' : l.price.toLocaleString('ru-RU'), sum: l.sum == null ? 'не посчитано' : l.sum.toLocaleString('ru-RU') })),
      { __bold: true, group: 'ИТОГО', name: e.incomplete.length ? 'без непосчитанных позиций' : '', qty: '', unit: '', price: '', sum: Math.round(e.total).toLocaleString('ru-RU') + ' ' + cur }],
    { header: `${(p.prices?.demo ?? true) ? 'ДЕМОНСТРАЦИОННЫЕ СТАВКИ — не рыночные цены. ' : ''}${e.method}${e.incomplete.length ? ' Не посчитано: ' + e.incomplete.join('; ') + '.' : ''}` });
  onProgress?.('Инструкция');
  doc.addPage('a4', 'portrait'); doc.setFont('Roboto', 'bold'); doc.setFontSize(14); doc.text('Инструкция по сборке', 14, 18); doc.setFont('Roboto', 'normal'); doc.setFontSize(9);
  const tools = [...new Set(m.steps.flatMap(s => s.tools))];
  let ty = 26; for (const t of [`Статус: предварительная инструкция к эскизу — не проверенная инструкция изготовления.`, `Инструмент: ${tools.join(', ') || 'шуруповёрт, ключ под конфирмат'}, рулетка, уровень.`,
    `Детали: ${m.parts.length} шт. (см. деталировку). Крепёж — по шагам, общее количество совпадает со спецификацией.`]) { const l = doc.splitTextToSize(t, 182); doc.text(l, 14, ty); ty += l.length * 4.2 + 1; }
  ty += 2; let k = 0;
  for (const s of m.steps) {
    if (ty > 200) { doc.addPage('a4', 'portrait'); ty = 16; }
    k++; const im = shot(m, c, { w: 900, h: 640, show: s.show, hl: s.fresh.length ? s.fresh : s.parts });
    doc.addImage(im, 'PNG', 14, ty, 90, 64);
    doc.setFont('Roboto', 'bold'); doc.setFontSize(11); doc.text(`Шаг ${k}. ${s.title}`, 110, ty + 5); doc.setFont('Roboto', 'normal'); doc.setFontSize(8.5);
    let yy2 = ty + 11; for (const t of [...s.text, `Детали: ${s.parts.join(', ')}`, ...s.hardware.map(h => `• ${HW[h.id]?.name || h.id} — ${h.qty} ${HW[h.id]?.unit || 'шт'}`)]) { const l = doc.splitTextToSize(t, 86); doc.text(l, 110, yy2); yy2 += l.length * 3.6 + 0.8; }
    ty = Math.max(ty + 68, yy2 + 4);
  }
  if (ty > 230) { doc.addPage('a4', 'portrait'); ty = 16; }
  doc.setFont('Roboto', 'bold'); doc.setFontSize(11); doc.text('Проверки после сборки', 14, ty + 4); doc.setFont('Roboto', 'normal'); doc.setFontSize(9);
  ty += 10; for (const t of ['Диагонали корпуса равны (разница не больше 2 мм).', 'Зазоры между фасадами ровные, двери закрываются без касания.', 'Ящики выдвигаются плавно и полностью.', 'Полки лежат на всех четырёх полкодержателях.', 'Изделие стоит устойчиво; высокий шкаф закреплён к стене от опрокидывания.']) { doc.text('☐ ' + t, 14, ty); ty += 5; }
  onProgress?.('Проверки');
  doc.addPage('a4', 'portrait');
  table(doc, 'Проверки конструкции и ограничения', [{ k: 'l', t: 'Уровень', w: 20 }, { k: 'a', t: 'Раздел', w: 32 }, { k: 'm', t: 'Сообщение', w: 134 }],
    [...m.checks.map(x => ({ l: { error: 'Ошибка', warn: 'Внимание', info: 'Сведения', ok: 'Норма' }[x.level], a: x.area, m: x.msg + (x.fix ? ' → ' + x.fix : '') })),
      ...Object.values(HW).filter(h => m.hardware.some(x => x.id === h.id)).map(h => ({ l: 'Источник', a: h.name, m: `${STATUS_RU[h.status]}. ${h.source !== 'нет' && h.source !== '—' ? 'Источник: ' + h.source + ', ' + h.sourceDate + '. ' : ''}${h.limits}` }))]);
  stamp(doc, p, status);
  return doc.output('blob');
}
