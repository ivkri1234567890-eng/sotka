/* «Описи»: описи передачи документов по проданным автомобилям из отчёта «Анализ реализации а/м»
   и сквозной реестр описей. Один полный номер счёта-фактуры — одна опись со всеми его VIN. */
(function (root) {
'use strict';
const ZipLib = (typeof require === 'function' && typeof JSZip === 'undefined') ? require('jszip') : JSZip;
const G = () => root.GibddEngine || require('./gibdd-engine.js');

const clean = v => String(v ?? '').replace(/_x000D_/gi, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const headKey = v => clean(v).toLowerCase().replaceAll('ё', 'е').replace(/\s*-\s*/g, '-');
const esc = v => String(v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad = (n, w = 3) => String(n).padStart(w, '0');
const ddmmyyyy = d => d ? pad(d.getUTCDate(), 2) + '.' + pad(d.getUTCMonth() + 1, 2) + '.' + d.getUTCFullYear() : '';
const today = () => { const d = new Date(); return pad(d.getDate(), 2) + '.' + pad(d.getMonth() + 1, 2) + '.' + d.getFullYear(); };

/* ---------- исходный отчёт ---------- */
const COLS = {
  vin: { re: [/^(вин|vin)$/], need: true, label: 'ВИН' },
  invoice: { re: [/^сч[е]т-?фактура$/, /^упд$/, /^номер сч[е]т-?фактуры$/], need: true, label: 'Счет-фактура' },
  buyer: { re: [/^заявка-покупатель$/, /^покупатель$/], label: 'Заявка - Покупатель' },
  recipient: { re: [/^получатель$/], label: 'Получатель' },
  direction: { re: [/^направление реализации$/, /^направление$/], label: 'Направление реализации' },
  pps: { re: [/^дата документа ппс$/], label: 'Дата документа ППС' },
  cls: { re: [/^подробный по дивизионам/, /^класс/], label: 'Подробный по дивизионам' },
  qty: { re: [/^кол-во$/, /^количество$/], label: 'Кол-во' },
  seller: { re: [/^организация$/, /^продавец$/, /^юр\.? ?лицо$/], label: 'Организация' },
  invDate: { re: [/^дата сч[е]т-?фактуры$/, /^дата упд$/, /^дата сф$/], label: 'Дата счёт-фактуры' },
};
function matchCols(row) {
  const cols = [...row.cells.keys()], h = {};
  for (const [k, spec] of Object.entries(COLS)) {
    h[k] = 0;
    for (const re of spec.re) { const c = cols.find(c => re.test(headKey(row.get(c)))); if (c) { h[k] = c; break; } }
  }
  return h;
}
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
function parseInvoice(full) {
  const m = /\/(\d{8})$/.exec(full);
  if (!m) return null;
  const y = +m[1].slice(0, 4), mo = +m[1].slice(4, 6), d = +m[1].slice(6, 8);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 2000 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}
function excelDate(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5);
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(v)) || null;
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const i = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return i ? new Date(Date.UTC(+i[1], +i[2] - 1, +i[3])) : null;
}

async function readSales(buf, fileName = '') {
  const book = await G().readBook(buf);
  const sheets = [], lines = [], skipped = [];
  for (const sheet of book.sheets) {
    const rows = await book.rows(sheet);
    const head = rows.slice(0, 60).find(r => { const h = matchCols(r); return h.vin && h.invoice; });
    if (!head) continue;
    const h = matchCols(head);
    const title = rows.filter(r => r.n < head.n).map(r => [...r.cells.values()].map(clean).filter(Boolean).join(' ')).filter(Boolean);
    let count = 0;
    for (const r of rows) {
      if (r.n <= head.n) continue;
      const vals = [...r.cells.values()].map(clean).filter(Boolean);
      if (!vals.length) continue;
      const get = k => h[k] ? clean(r.get(h[k])) : '';
      const vin = get('vin'), invoice = get('invoice');
      if (!vin && !invoice) {
        skipped.push({ sheet: sheet.name, row: r.n, reason: vals.some(v => /итог|всего/i.test(v)) ? 'строка итогов' : 'нет VIN и счёт-фактуры', text: vals.slice(0, 4).join(' · ') });
        continue;
      }
      const qtyRaw = get('qty');
      lines.push({
        sheet: sheet.name, row: r.n, vin, invoice, buyer: get('buyer'), recipient: get('recipient'), direction: get('direction'),
        cls: get('cls'), seller: get('seller'), pps: excelDate(h.pps ? r.get(h.pps) : ''), invDate: h.invDate ? excelDate(r.get(h.invDate)) : null,
        qty: qtyRaw === '' ? 1 : Number(String(qtyRaw).replace(',', '.')),
      });
      count++;
    }
    sheets.push({ name: sheet.name, header: head.n, rows: count, title: title.slice(0, 3).join(' / '), cols: Object.fromEntries(Object.entries(h).map(([k, c]) => [k, c ? clean(head.get(c)) : ''])) });
  }
  if (!sheets.length) {
    const need = Object.values(COLS).filter(c => c.need).map(c => '«' + c.label + '»').join(' и ');
    throw Error('В файле «' + fileName + '» не нашлась таблица продаж: нет колонок ' + need + '.');
  }
  return { file: fileName, sheets, lines, skipped };
}

/* ---------- описи из строк продаж ---------- */
function groupSales(sales) {
  const issues = [];
  const add = (level, text, where) => issues.push({ level, text, where });
  for (const s of sales.skipped) add('инфо', 'Строка пропущена: ' + s.reason + (s.text ? ' (' + s.text + ')' : ''), s.sheet + ', стр. ' + s.row);
  const groups = new Map(), vinInv = new Map();
  for (const l of sales.lines) {
    const where = l.sheet + ', стр. ' + l.row;
    if (!l.invoice) { add('ошибка', 'Нет номера счёт-фактуры у VIN ' + l.vin + ' — строка не включена', where); continue; }
    if (!l.vin) { add('ошибка', 'Нет VIN в счёт-фактуре ' + l.invoice + ' — строка не включена', where); continue; }
    const key = (l.seller ? l.seller + '|' : '') + l.invoice;
    if (!groups.has(key)) groups.set(key, { key, invoice: l.invoice, seller: l.seller, lines: [], vins: [], buyers: new Set(), recipients: new Set(), directions: new Set(), qty: 0, notes: [] });
    const g = groups.get(key);
    g.lines.push(l);
    if (!g.vins.includes(l.vin)) g.vins.push(l.vin);
    if (l.buyer) g.buyers.add(l.buyer);
    if (l.recipient) g.recipients.add(l.recipient);
    g.directions.add(l.direction);
    g.qty += Number.isFinite(l.qty) ? l.qty : 0;
    if (!VIN_RE.test(l.vin)) add('внимание', 'Подозрительный VIN «' + l.vin + '» (ожидается 17 символов без I, O, Q) — оставлен как в отчёте', where);
    if (!vinInv.has(l.vin)) vinInv.set(l.vin, new Set());
    vinInv.get(l.vin).add(l.invoice);
  }
  const list = [];
  for (const g of groups.values()) {
    const where = g.lines[0].sheet + ', стр. ' + g.lines.map(l => l.row).join(', ');
    g.date = parseInvoice(g.invoice);
    const explicit = g.lines.map(l => l.invDate).find(Boolean);
    if (!g.date && explicit) g.date = explicit;
    if (!g.date) { g.notes.push('дата не распознана'); add('ошибка', 'Не удалось определить дату счёт-фактуры ' + g.invoice + ' (ожидается номер/ГГГГММДД) — укажите дату вручную', where); }
    else if (explicit && ddmmyyyy(explicit) !== ddmmyyyy(g.date)) { g.notes.push('дата не совпадает'); add('ошибка', 'Дата в номере ' + g.invoice + ' (' + ddmmyyyy(g.date) + ') не совпадает с колонкой даты (' + ddmmyyyy(explicit) + ')', where); }
    g.buyer = [...g.buyers].join('; '); g.recipient = [...g.recipients].join('; ');
    g.direction = [...g.directions].filter(Boolean).join('; ');
    if (g.buyers.size > 1) { g.notes.push('несколько покупателей'); add('ошибка', 'В счёт-фактуре ' + g.invoice + ' несколько покупателей: ' + [...g.buyers].join(' / '), where); }
    if (g.recipients.size > 1) { g.notes.push('несколько получателей'); add('ошибка', 'В счёт-фактуре ' + g.invoice + ' несколько получателей: ' + [...g.recipients].join(' / '), where); }
    if (!g.buyer) { g.notes.push('нет покупателя'); add('внимание', 'Не указан покупатель — поле останется пустым', g.invoice); }
    if (!g.recipient) { g.notes.push('нет получателя'); add('внимание', 'Не указан получатель — поле останется пустым', g.invoice); }
    if (!g.direction) add('инфо', 'Не указано направление', g.invoice);
    const neg = g.lines.some(l => l.qty < 0), zero = g.lines.every(l => l.qty === 0);
    g.kind = neg ? 'возврат' : zero ? 'корректировка' : 'продажа';
    if (neg) add('внимание', 'Счёт-фактура ' + g.invoice + ' с отрицательным количеством (возврат) — по умолчанию не включается', where);
    else if (zero) add('внимание', 'Счёт-фактура ' + g.invoice + ' с нулевым количеством (корректировка) — по умолчанию не включается', where);
    if (g.lines.length > g.vins.length) add('инфо', 'В счёт-фактуре ' + g.invoice + ' повторяется VIN — в описи он указан один раз', where);
    g.year = g.date ? g.date.getUTCFullYear() : (g.lines[0].pps ? g.lines[0].pps.getUTCFullYear() : null);
    g.source = sales.file + ' / ' + where;
    list.push(g);
  }
  for (const [vin, inv] of vinInv) if (inv.size > 1)
    add('внимание', 'VIN ' + vin + ' встречается в разных счетах-фактурах: ' + [...inv].join(', ') + ' — это отдельные описи', vin);
  list.sort(byInvoiceOrder);
  return { groups: list, issues };
}
function byInvoiceOrder(a, b) {
  const da = a.date ? a.date.getTime() : Infinity, db = b.date ? b.date.getTime() : Infinity;
  return da - db || (a.invoice.split('/')[0] < b.invoice.split('/')[0] ? -1 : a.invoice.split('/')[0] > b.invoice.split('/')[0] ? 1 : 0);
}

/* ---------- реестр ---------- */
const FIELDS = [
  ['no', '№ описи'], ['year', 'Год отгрузки'], ['invoice', 'Счёт-фактура (полный номер)'], ['date', 'Дата счёт-фактуры'],
  ['buyer', 'Покупатель'], ['recipient', 'Получатель'], ['direction', 'Направление'], ['cars', 'Кол-во автомобилей'], ['vins', 'VIN'],
  ['created', 'Дата формирования'], ['transferDate', 'Дата передачи'], ['gave', 'Передала'], ['took', 'Приняла'],
  ['poa', '№ доверенности'], ['act', '№ акта'], ['sheets', 'Кол-во листов'],
  ['hasUpd', 'УПД'], ['hasPoa', 'Доверенность'], ['hasAct', 'Акт'], ['status', 'Статус'], ['comment', 'Комментарий'],
  ['source', 'Источник (файл / лист / строки)'], ['file', 'Файл описи'], ['version', 'Версия'], ['history', 'История изменений'],
];
const STATUSES = ['сформирована', 'проверена', 'передана', 'отменена'];
const CHECK = ['не проверено', 'есть', 'нет'];
const invKey = s => clean(s).replace(/\s+/g, '');

function emptyRegistry() { return { entries: [], start: 1, updated: '' }; }
function nextNumber(reg) { return Math.max(reg.start || 1, 1 + reg.entries.reduce((m, e) => Math.max(m, e.no || 0), 0)); }

function fromJson(list) {
  return {
    start: 1, updated: today(),
    entries: list.map(x => ({
      no: x.inventory_number, year: x.year, invoice: clean(x.invoice_number_full), date: x.invoice_date || '',
      buyer: clean(x.buyer), recipient: clean(x.recipient), direction: clean(x.direction), vins: (x.vins || []).map(clean),
      created: '', transferDate: x.transfer_date || '', gave: '', took: '', poa: x.power_of_attorney_number || '', act: x.act_number || '',
      sheets: x.sheets_count || '', hasUpd: 'не проверено', hasPoa: 'не проверено', hasAct: 'не проверено', status: 'сформирована',
      comment: '', source: 'Исторический реестр', file: (x.archive ? x.archive + ' / ' : '') + (x.document_filename || ''), version: 1, history: 'Импорт исторического реестра',
    })),
  };
}
async function readRegistry(buf, fileName = '') {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0x5B || bytes[0] === 0x7B || (bytes[0] === 0xEF && bytes[3] === 0x5B)) {
    const data = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ''));
    const list = Array.isArray(data) ? data : data.entries;
    if (Array.isArray(data) && list.length && 'inventory_number' in list[0]) return check(fromJson(list));
    if (!Array.isArray(data) && data.entries) return check(data);
    throw Error('Файл JSON не похож на реестр описей.');
  }
  const book = await G().readBook(buf);
  const sheet = book.sheets.find(s => /^реестр$/i.test(s.name.trim())) || book.sheets[0];
  const rows = await book.rows(sheet);
  const head = rows.slice(0, 10).find(r => [...r.cells.values()].some(v => headKey(v) === '№ описи'));
  if (!head) throw Error('В файле «' + fileName + '» нет листа «Реестр» с колонкой «№ описи».');
  const col = {};
  for (const [k, label] of FIELDS) col[k] = [...head.cells.keys()].find(c => headKey(head.get(c)) === headKey(label)) || 0;
  const entries = [];
  for (const r of rows) {
    if (r.n <= head.n) continue;
    const g = k => col[k] ? clean(r.get(col[k])) : '';
    const no = parseInt(g('no'), 10);
    if (!Number.isFinite(no)) continue;
    const date = g('date'), dnum = Number(date);
    entries.push({
      no, year: parseInt(g('year'), 10) || '', invoice: g('invoice'),
      date: Number.isFinite(dnum) && dnum > 20000 ? ddmmyyyy(excelDate(dnum)) : date,
      buyer: g('buyer'), recipient: g('recipient'), direction: g('direction'),
      vins: String(col.vins ? r.get(col.vins) : '').split(/[\n;,]+/).map(clean).filter(Boolean),
      created: dateText(g('created')), transferDate: dateText(g('transferDate')), gave: g('gave'), took: g('took'),
      poa: g('poa'), act: g('act'), sheets: g('sheets'),
      hasUpd: g('hasUpd') || 'не проверено', hasPoa: g('hasPoa') || 'не проверено', hasAct: g('hasAct') || 'не проверено',
      status: g('status') || 'сформирована', comment: g('comment'), source: g('source'), file: g('file'),
      version: parseInt(g('version'), 10) || 1, history: String(col.history ? r.get(col.history) : ''),
    });
  }
  const startRow = rows.find(r => r.n < head.n && /следующий номер/i.test([...r.cells.values()].join(' ')));
  const start = startRow ? parseInt([...startRow.cells.values()].map(String).find(v => /^\d+$/.test(v.trim())), 10) : 1;
  return check({ entries, start: Number.isFinite(start) ? start : 1, updated: today() });
}
const dateText = v => { const n = Number(v); return Number.isFinite(n) && n > 20000 && n < 80000 ? ddmmyyyy(excelDate(n)) : v; };
function check(reg) {
  const seen = new Map();
  for (const e of reg.entries) {
    if (seen.has(e.no)) throw Error('В реестре дважды встречается № ' + e.no + ' — исправьте файл реестра.');
    seen.set(e.no, e);
  }
  reg.entries.sort((a, b) => a.no - b.no);
  return reg;
}

/* сверка новых описей с реестром */
function plan(groups, reg, opts = {}) {
  const byInv = new Map();
  for (const e of reg.entries) if (e.status !== 'отменена') byInv.set(invKey(e.invoice), e);
  const items = groups.map(g => {
    const e = byInv.get(invKey(g.invoice));
    const it = { g, entry: e || null, include: false, state: 'новая', changes: [] };
    if (e) {
      const sameVins = e.vins.length === g.vins.length && g.vins.every(v => e.vins.includes(v));
      if (!sameVins) it.changes.push('VIN: ' + e.vins.join(', ') + ' → ' + g.vins.join(', '));
      if (clean(e.buyer) !== g.buyer) it.changes.push('покупатель: «' + e.buyer + '» → «' + g.buyer + '»');
      if (clean(e.recipient) !== g.recipient) it.changes.push('получатель: «' + e.recipient + '» → «' + g.recipient + '»');
      it.state = it.changes.length ? 'изменилась' : 'уже в реестре';
      it.include = it.state === 'изменилась' && !g.notes.some(n => /дата|несколько/.test(n));
    } else it.include = g.kind === 'продажа' && !g.notes.some(n => /дата|несколько/.test(n));
    return it;
  });
  return number(items, reg, opts.start);
}
function number(items, reg, start) {
  const used = new Set(reg.entries.map(e => e.no));
  let n = Math.max(start || 0, nextNumber(reg));
  for (const it of items) {
    if (it.entry) { it.no = it.entry.no; continue; }
    if (!it.include) { it.no = null; continue; }
    while (used.has(n)) n++;
    it.no = n++;
  }
  return items;
}

const safe = s => String(s).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
function fileName(no, invoice) {
  const [num, ds] = invoice.split('/');
  return 'Opis_' + pad(no) + '_SF_' + safe(num) + (ds ? '_' + safe(ds) : '') + '.docx';
}

/* применить план: новые записи и обновления; возвращает затронутые записи */
function apply(items, reg, settings) {
  const touched = [], stamp = today();
  for (const it of items) {
    if (!it.include || !it.no) continue;
    const g = it.g, date = g.date ? ddmmyyyy(g.date) : (it.manualDate || '');
    const fname = fileName(it.no, g.invoice);
    if (it.entry) {
      const e = it.entry;
      e.history = (e.history ? e.history + '\n' : '') + stamp + ': версия ' + ((e.version || 1) + 1) + ' — ' + it.changes.join('; ');
      Object.assign(e, { vins: g.vins.slice(), buyer: g.buyer, recipient: g.recipient, direction: g.direction || e.direction,
        date: date || e.date, version: (e.version || 1) + 1, file: 'Описи/' + fname, source: g.source, created: stamp });
      touched.push(e);
    } else {
      const e = {
        no: it.no, year: g.year || '', invoice: g.invoice, date, buyer: g.buyer, recipient: g.recipient, direction: g.direction,
        vins: g.vins.slice(), created: stamp, transferDate: '', gave: settings.gave, took: settings.took, poa: '', act: '', sheets: '',
        hasUpd: 'не проверено', hasPoa: 'не проверено', hasAct: 'не проверено', status: 'сформирована', comment: g.kind !== 'продажа' ? g.kind : '',
        source: g.source, file: 'Описи/' + fname, version: 1, history: stamp + ': создана',
      };
      reg.entries.push(e); touched.push(e);
    }
  }
  reg.entries.sort((a, b) => a.no - b.no);
  reg.updated = stamp;
  return touched;
}

/* ---------- Word: опись ---------- */
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}<w:lang w:val="ru-RU"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const lines = (text, o) => String(text ?? '').split('\n').map((t, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(t, o)).join('');
function opisCell(width, content, { shade = false, center = false, bold = false } = {}) {
  const b = '<w:top w:val="single" w:sz="5" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="5" w:space="0" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="5" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="5" w:space="0" w:color="BFBFBF"/>';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcBorders>${b}</w:tcBorders>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="EAEAEA"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:before="100" w:after="100"/>${center ? '<w:jc w:val="center"/>' : ''}</w:pPr>${lines(content, { sz: 22, b: bold })}</w:p></w:tc>`;
}
function opisDocx(e, s) {
  const W = [2381, 4300, 1421];
  const head = `<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="454"/><w:jc w:val="center"/></w:trPr>${opisCell(W[0], 'Наименование', { shade: true })}${opisCell(W[1], '№ документа', { center: true })}${opisCell(W[2], 'Кол-во листов', { center: true })}</w:tr>`;
  const row = (name, val, sheets = '', bold = true, split = false) => `<w:tr><w:trPr>${split ? '' : '<w:cantSplit/>'}<w:trHeight w:val="680"/><w:jc w:val="center"/></w:trPr>${opisCell(W[0], name, { shade: true, bold })}${opisCell(W[1], val)}${opisCell(W[2], sheets, { center: true })}</w:tr>`;
  const upd = '№ ' + e.invoice + (e.date ? ' от ' + e.date : '');
  const body =
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr>${run('Опись передачи документов', { b: true, sz: 32 })}<w:r><w:br/></w:r>${run('по проданным автомобилям', { b: true, sz: 32 })}</w:p>` +
    `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run('№ ' + e.no + '                       Дата ' + (e.transferDate ? e.transferDate : '«_____» ______________ 20____ г.'))}</w:p>` +
    `<w:p><w:pPr><w:spacing w:after="200"/></w:pPr>${run(s.gave + ' передала, а ' + s.took + ' приняла документы по проданным автомобилям согласно приведённой ниже описи.')}</w:p>` +
    `<w:tbl><w:tblPr><w:tblW w:w="${W[0] + W[1] + W[2]}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    head + row('Покупатель', e.buyer) + row('Получатель', e.recipient, '', false) + row('Номер УПД (счёт-фактуры)', upd, '', false) +
    row('Автомобиль (и) VIN', e.vins.join('\n'), '', true, true) + row('Доверенность', e.poa) + row('Акт', e.act) +
    `</w:tbl>` +
    `<w:p><w:pPr><w:keepNext/><w:spacing w:before="600"/></w:pPr></w:p>` +
    `<w:p><w:pPr><w:keepLines/><w:tabs><w:tab w:val="left" w:pos="5300"/></w:tabs><w:spacing w:before="200"/></w:pPr>${run('Передала: ______________ / ' + s.gave + ' /', { sz: 22 })}<w:r><w:tab/></w:r>${run('Приняла: ______________ / ' + s.took + ' /', { sz: 22 })}</w:p>` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="907" w:right="850" w:bottom="907" w:left="850" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  if (e.sheets) { /* общее число листов — в строке УПД не дублируем */ }
  return pack(`<w:document ${W_NS}><w:body>${body}</w:body></w:document>`);
}
const DOC_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU" w:eastAsia="ru-RU" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
function pack(documentXml) {
  const z = new ZipLib();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  z.file('word/styles.xml', DOC_STYLES);
  z.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + documentXml);
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/* ---------- Word: реестр на исходящую корреспонденцию (по бланку пользователя) ---------- */
function b64(s) { if (typeof atob === 'function') { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; } return Uint8Array.from(Buffer.from(s, 'base64')); }
function topLevel(body) {
  const out = []; let pos = 0;
  while (pos < body.length) {
    const m = /^<w:(tbl|p|sectPr|bookmarkStart|bookmarkEnd)\b/.exec(body.slice(pos));
    if (!m) break;
    const tag = m[1], selfClose = new RegExp('^<w:' + tag + '\\b[^>]*/>').exec(body.slice(pos));
    let end;
    if (selfClose) end = pos + selfClose[0].length;
    else {
      const re = new RegExp('<(/?)w:' + tag + '\\b[^>]*?(/?)>', 'g'); re.lastIndex = pos; let d = 0, mm;
      while ((mm = re.exec(body))) { if (mm[2]) continue; d += mm[1] ? -1 : 1; if (d === 0) { end = mm.index + mm[0].length; break; } }
    }
    out.push({ tag, xml: body.slice(pos, end) }); pos = end;
  }
  return out;
}
const rowsOf = tbl => { const out = []; const re = /<w:tr\b[\s\S]*?<\/w:tr>/g; let m; while ((m = re.exec(tbl))) out.push(m[0]); return out; };
const cellsOf = tr => { const out = []; const re = /<w:tc>[\s\S]*?<\/w:tc>|<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g; let m; while ((m = re.exec(tr))) out.push(m[0]); return out; };
function setCellText(tc, text) {
  const paras = tc.match(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) || [];
  const first = paras[0] || '<w:p></w:p>';
  const pPr = (/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(first) || [''])[0];
  const rPr = (/<w:r\b[^>]*>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(tc) || [, ''])[1] || (/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(pPr) ? '<w:rPr>' + /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(pPr)[1] + '</w:rPr>' : '');
  const content = String(text ?? '').split('\n').map((t, i) => (i ? `<w:r>${rPr}<w:br/></w:r>` : '') + `<w:r>${rPr}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('');
  const start = tc.indexOf(paras[0]), end = paras.length ? tc.lastIndexOf(paras[paras.length - 1]) + paras[paras.length - 1].length : tc.lastIndexOf('</w:tc>');
  const newP = `<w:p>${pPr}${content}</w:p>`;
  return paras.length ? tc.slice(0, start) + newP + tc.slice(end) : tc.replace('</w:tc>', newP + '</w:tc>');
}
function replaceCells(tr, values) {
  const cells = cellsOf(tr); let out = tr;
  values.forEach((v, i) => { if (v === undefined || !cells[i]) return; out = out.replace(cells[i], setCellText(cells[i], v)); });
  return out;
}
async function registerDocx(entries, s, templateB64) {
  const zip = await ZipLib.loadAsync(b64(templateB64));
  const xml = await zip.file('word/document.xml').async('string');
  const bStart = xml.indexOf('<w:body>') + 8, bEnd = xml.lastIndexOf('</w:body>');
  const parts = topLevel(xml.slice(bStart, bEnd));
  const tbls = parts.filter(p => p.tag === 'tbl');
  if (tbls.length < 3) throw Error('Бланк реестра не распознан.');
  const two = tbls.length >= 6;                                   // в бланке два варианта: берём шапку и подписи второго (с «Дата:»)
  const T = [two ? tbls[3] : tbls[0], tbls[1], two ? tbls[5] : tbls[2]];   // таблица строк — простая, из первого
  const startIdx = parts.indexOf(T[0]);
  const block = parts.slice(startIdx).filter(p => p.tag !== 'sectPr').map(p => p === (two ? tbls[4] : null) ? T[1] : p);
  const sect = parts.find(p => p.tag === 'sectPr');
  // шапка
  const hr = rowsOf(T[0].xml);
  let hx = T[0].xml;
  const titleRow = hr.find(r => /корреспонденц/.test(r)) || hr[1];
  if (titleRow) hx = hx.replace(titleRow, replaceCells(titleRow, ['на исходящую корреспонденцию ' + s.org]));
  const sendRow = hr.find(r => /Отправитель/.test(r));
  if (sendRow) hx = hx.replace(sendRow, replaceCells(sendRow, [undefined, s.unit, 'Дата:', s.date]));
  const fioRow = hr.find(r => /Ф\.И\.О/.test(r));
  if (fioRow) hx = hx.replace(fioRow, replaceCells(fioRow, [undefined, s.sender, undefined, s.phone]));
  // строки
  const ir = rowsOf(T[1].xml), tmpl = ir[1];
  const newRows = entries.map((e, i) => replaceCells(tmpl, [String(i + 1), s.where, s.to,
    'Опись № ' + e.no + ' к УПД № ' + e.invoice + (e.date ? ' от ' + e.date : '') + (e.vins.length > 3 ? '\n' + e.vins.length + ' автомобилей' : e.vins.length ? '\nVIN: ' + e.vins.join(', ') : '')]));
  let ix = T[1].xml;
  for (const r of ir.slice(1)) ix = ix.replace(r, '');
  ix = ix.replace('</w:tbl>', newRows.join('') + '</w:tbl>');
  ix = ix.replace(ir[0], ir[0].replace('<w:trPr>', '<w:trPr><w:tblHeader/>').replace(/<w:tr\b([^>]*)>(?!<w:trPr>)/, (m, a) => /<w:trPr>/.test(ir[0]) ? m : `<w:tr${a}><w:trPr><w:tblHeader/></w:trPr>`));
  // подписи
  const sr = rowsOf(T[2].xml); let sx = T[2].xml;
  if (sr[0]) sx = sx.replace(sr[0], replaceCells(sr[0], [undefined, s.sender, undefined, undefined, s.receiver || '']));
  if (sr[2] && !/<w:t\b/.test(sr[2].replace(/<w:t[^>]*>\s*<\/w:t>/g, ''))) sx = sx.replace(sr[2], '');
  const out = [];
  for (const p of block) {
    if (p === T[0]) out.push(hx); else if (p === T[1]) out.push(ix); else if (p === T[2]) out.push(sx);
    else if (p.tag === 'p' && /w:br w:type="page"/.test(p.xml)) continue;
    else out.push(p.xml);
  }
  const doc = xml.slice(0, bStart) + out.join('') + (sect ? sect.xml : '') + xml.slice(bEnd);
  zip.file('word/document.xml', doc);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/* ---------- Excel: реестр ---------- */
const XSTYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/><charset val="204"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/><charset val="204"/></font><font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/><family val="2"/><charset val="204"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
  '<xf numFmtId="49" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
const colName = n => { let s = ''; for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
function xcell(r, c, v, s) {
  const ref = colName(c) + r;
  if (v == null || v === '') return `<c r="${ref}" s="${s}"/>`;
  if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  if (typeof v === 'object') return `<c r="${ref}" s="${s}" t="str"><f>${esc(v.f)}</f><v>${esc(v.v)}</v></c>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}
function xsheet(headers, rows, widths, { pre = [] } = {}) {
  const off = pre.length ? pre.length + 1 : 0, out = [];
  pre.forEach((line, i) => out.push(`<row r="${i + 1}">` + line.map((v, j) => xcell(i + 1, j + 1, v, j ? 0 : 5)).join('') + '</row>'));
  const h = off + 1;
  out.push(`<row r="${h}" ht="32" customHeight="1">` + headers.map((t, i) => xcell(h, i + 1, t, 1)).join('') + '</row>');
  rows.forEach((row, i) => out.push(`<row r="${h + 1 + i}">` + row.map((v, j) => { const L = v && typeof v === 'object' && v.link; return xcell(h + 1 + i, j + 1, L ? { f: `HYPERLINK("${v.link.replace(/"/g, '""')}","${v.text.replace(/"/g, '""')}")`, v: v.text } : v, L ? 4 : typeof v === 'number' ? 3 : 2); }).join('') + '</row>'));
  const last = h + rows.length;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${h}" topLeftCell="A${h + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/><cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' +
    `<sheetData>${out.join('')}</sheetData><autoFilter ref="A${h}:${colName(headers.length)}${Math.max(last, h)}"/></worksheet>`;
}
async function registryXlsx(reg, issues = []) {
  const W = { no: 9, year: 8, invoice: 20, date: 12, buyer: 36, recipient: 36, direction: 22, cars: 9, vins: 22, created: 12, transferDate: 12, gave: 16, took: 16, poa: 14, act: 12, sheets: 9, hasUpd: 13, hasPoa: 13, hasAct: 13, status: 13, comment: 24, source: 30, file: 34, version: 8, history: 40 };
  const reestr = reg.entries.map(e => FIELDS.map(([k]) => {
    if (k === 'cars') return e.vins.length;
    if (k === 'vins') return e.vins.join('\n');
    if (k === 'no' || k === 'version') return Number(e[k]) || '';
    if (k === 'year') return Number(e.year) || '';
    if (k === 'file') return /^Описи\//.test(e.file || '') ? { link: e.file, text: e.file.replace(/^Описи\//, '') } : (e.file || '');
    return e[k] ?? '';
  }));
  const cars = [];
  for (const e of reg.entries) e.vins.forEach((v, i) => cars.push([e.no, i + 1, v, e.invoice, e.date, e.buyer, e.recipient, e.direction, e.status]));
  const checks = issues.map(x => [x.level, x.text, x.where || '']);
  const next = nextNumber(reg);
  const sheets = [
    ['Реестр', xsheet(FIELDS.map(f => f[1]), reestr, FIELDS.map(([k]) => W[k]), { pre: [['Реестр описей передачи документов по проданным автомобилям'], ['Описей: ' + reg.entries.length + ', автомобилей: ' + cars.length], ['Следующий номер:', next], ['Обновлён:', reg.updated || today()]] })],
    ['Автомобили', xsheet(['№ описи', '№ VIN в описи', 'VIN', 'Счёт-фактура', 'Дата счёт-фактуры', 'Покупатель', 'Получатель', 'Направление', 'Статус'], cars, [9, 9, 22, 20, 12, 36, 36, 22, 13])],
    ['Проверки', xsheet(['Уровень', 'Что найдено', 'Где'], checks, [11, 90, 30])],
  ];
  const z = new ZipLib();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  z.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheets.map(([n], i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><definedNames>' +
    sheets.map(([n], i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${n}'!$A$1:$A$1</definedName>`).join('') + '</definedNames></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('xl/styles.xml', XSTYLES);
  sheets.forEach(([, x], i) => z.file(`xl/worksheets/sheet${i + 1}.xml`, x));
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/* ---------- комплект ---------- */
async function bundle(touched, reg, issues, settings, templateB64, onProgress) {
  const z = new ZipLib();
  for (let i = 0; i < touched.length; i++) {
    const e = touched[i];
    z.file(e.file, await opisDocx(e, settings));
    if (onProgress) onProgress(i + 1, touched.length);
  }
  if (touched.length && templateB64) z.file('Реестр передачи описей.docx', await registerDocx(touched, settings, templateB64));
  z.file('Реестр описей.xlsx', await registryXlsx(reg, issues));
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

const api = { readSales, groupSales, plan, number, apply, nextNumber, emptyRegistry, readRegistry, fromJson, opisDocx, registerDocx, registryXlsx, bundle, fileName, STATUSES, CHECK, ddmmyyyy, today };
if (typeof module === 'object' && module.exports) module.exports = api; else root.OpisiEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
