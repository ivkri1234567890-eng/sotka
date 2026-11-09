/* Движок «Отчёты ГИБДД по менеджерам»: читает XLSX-исходники, раскладывает регистрации
   по территориям торговых представителей и собирает по файлу на менеджера. */
(function (root) {
'use strict';
const ZipLib = (typeof require === 'function' && typeof JSZip === 'undefined') ? require('jszip') : JSZip;
const Model = () => root.GibddModel || (typeof require === 'function' ? require('./gibdd-model.js') : null);
const Sheets = () => root.XLSX || (typeof require === 'function' ? (() => { try { return require('xlsx'); } catch (e) { return null; } })() : null);

/* Условия отчёта ГИБДД (единые для всех выгрузок): регион и марка не фильтруются. */
const FILTERS = {
  status: ['нов'],
  classes: ['HDT', 'MDT'],
  bodies: ['В18_Шасси 4х2', 'В45_Тягач 4х2', 'В33_Самосвал 6х4', 'В12_MDT1 4х2'],
};

const MONTHS = 'январь февраль март апрель май июнь июль август сентябрь октябрь ноябрь декабрь'.split(' ');
const norm = x => String(x ?? '').normalize('NFKC').toLowerCase().replaceAll('ё', 'е')
  .replace(/[–—−]/g, '-').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const LOOK = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
const canon = x => norm(x).replace(/[abcehkmoptxy]/g, c => LOOK[c]);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
const esc = v => String(v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const colNum = ref => { let n = 0; for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + c - 64; } return n; };
const colName = n => { let s = ''; for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
const textOf = xml => { let out = ''; xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (_, t) => { out += t; }); return unxml(out); };

/* ---------- чтение книги ---------- */
async function readBook(data) {
  let bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data);
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4B)) {          // не .xlsx: .xls, .csv и т.п.
    const X = Sheets();
    if (!X) throw Error('Формат файла не поддерживается. Сохраните его как .xlsx.');
    const isOle = bytes[0] === 0xD0 && bytes[1] === 0xCF;          // .xls (двоичный Excel)
    let wb;
    if (isOle || bytes[0] === 0x3C && bytes[1] === 0x3F) wb = X.read(bytes, { type: 'array', raw: true });
    else {                                                            // текст: .csv / .txt
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch (e) { text = new TextDecoder('windows-1251').decode(bytes); }
      text = text.replace(/^\uFEFF/, '');
      const first = text.split(/\r?\n/, 1)[0];
      const FS = [';', '\t', ','].sort((x, y) => first.split(y).length - first.split(x).length)[0];
      wb = X.read(text, { type: 'string', raw: true, FS });
    }
    bytes = new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
  }
  const zip = await ZipLib.loadAsync(bytes);
  const str = async p => { const f = zip.file(p); if (!f) return null; const x = await f.async('string'); return x.indexOf('<x:') >= 0 || /<\w+:(?:workbook|worksheet|sst|Relationships)\b/.test(x.slice(0, 600)) ? x.replace(/<(\/?)[A-Za-z][\w.-]*:(?=[A-Za-z])/g, '<$1') : x; };
  const wb = await str('xl/workbook.xml');
  if (!wb) throw Error('Файл не похож на книгу Excel (.xlsx).');
  const rels = (await str('xl/_rels/workbook.xml.rels')) || '';
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1], t = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    return [id, t];
  }));
  let shared = null;
  const sharedStrings = async () => {
    if (shared) return shared;
    const x = await str('xl/sharedStrings.xml');
    shared = x ? [...x.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g)].map(m => m[1] ? textOf(m[1]) : '') : [];
    return shared;
  };
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => {
    const name = unxml(/\bname="([^"]*)"/.exec(m[0])?.[1] || '');
    const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1] || /\bid="([^"]+)"/.exec(m[0])?.[1];
    let t = target.get(rid) || '';
    const path = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    return { name, path };
  });
  async function rows(sheet, limit = Infinity) {
    const xml = await str(sheet.path);
    if (!xml) return [];
    const ss = await sharedStrings();
    const out = [];
    const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m, auto = 0;
    while ((m = rowRe.exec(xml))) {
      const rn = +(/\br="(\d+)"/.exec(m[1])?.[1] || auto + 1); auto = rn;
      if (rn > limit) break;
      const cells = new Map();
      if (m[2]) {
        let c, idx = 0;
        cellRe.lastIndex = 0;
        while ((c = cellRe.exec(m[2]))) {
          const ref = /\br="([A-Z]+)\d*"/.exec(c[1])?.[1];
          const col = ref ? colNum(ref) : idx + 1; idx = col;
          const inner = c[2] || '';
          const t = /\bt="([^"]+)"/.exec(c[1])?.[1];
          let v;
          if (t === 'inlineStr') v = textOf(inner);
          else {
            const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
            if (!vm) continue;
            v = t === 's' ? (ss[+vm[1]] ?? '') : unxml(vm[1]);
          }
          if (v !== '') cells.set(col, v);
        }
      }
      out.push({ n: rn, cells, get: k => (k ? cells.get(k) ?? '' : '') });
    }
    return out;
  }
  return { sheets, rows, zip, workbookXml: wb };
}

/* ---------- распознавание таблиц ---------- */
const SPEC = {
  registrations: {
    req: {
      region: [/^субъект ?рф$/, /^регион регистрации$/, /^субъект$/, /^регион$/],
      inn: [/^инн(?: владельца)?$/],
      owner: [/^владелец$/, /^наименование владельца$/],
      count: [/^итог$/, /^сумма по столбцу кол-во$/, /^кол-во$/, /^количество(?: машин)?$/],
    },
    opt: { brand: [/^марка$/] },
  },
  clients: {
    req: { inn: [/^инн(?: клиента)?$/], manager: [/^ответственный/] },
    opt: { client: [/^клиент$/, /^наименование клиента$/] },
  },
  events: {
    req: { inn: [/^инн(?: клиента)?$/], manager: [/^продавец/, /^менеджер/] },
    opt: { client: [/^клиент$/] },
  },
  territories: {
    req: { region: [/^область ?\/ ?край ?\/ ?республика$/, /^субъект ?рф$/], manager: [/^торговый представитель(?: 1)?$/] },
    opt: { city: [/^город$/], phone: [/^телефон$/], email: [/^электронная почта$/, /^e-?mail$/], position: [/^должность$/] },
  },
};
function matchHeader(row, spec) {
  const cols = [...row.cells.keys()];
  const pick = list => { for (const re of list) { const c = cols.find(k => re.test(norm(row.get(k)))); if (c) return c; } return 0; };
  const h = {};
  for (const [k, list] of Object.entries(spec.req)) { h[k] = pick(list); if (!h[k]) return null; }
  for (const [k, list] of Object.entries(spec.opt)) h[k] = pick(list);
  return h;
}
async function detect(book) {
  const found = [];
  for (const sheet of book.sheets) {
    const head = await book.rows(sheet, 40);
    for (const role of Object.keys(SPEC)) {
      const row = head.find(r => matchHeader(r, SPEC[role]));
      if (row) found.push({ role, sheet, headerRow: row.n, h: matchHeader(row, SPEC[role]), head });
    }
    if (found.length) break;
  }
  if (!found.some(f => f.role === 'registrations') && book.zip.file('xl/model/item.data') &&
      /modelTable\b[^>]*name="[^"]*регистрац/i.test(book.workbookXml))
    found.unshift({ role: 'registrations', sheet: null, headerRow: 0, h: null, head: [] });
  return found;
}
function readPeriod(head, headerRow) {
  let month = 0, year = 0;
  for (const r of head) {
    if (r.n >= headerRow) break;
    const label = norm(r.get(1)), v = norm(r.get(2));
    if (/месяц/.test(label) && /^\d{1,2}$/.test(v)) month = +v;
    else if (/месяц/.test(label) && MONTHS.includes(v)) month = MONTHS.indexOf(v) + 1;
    if (/^\.?год/.test(label) && /^\d{4}$/.test(v)) year = +v;
  }
  return month && year ? { month, year } : null;
}

/* ---------- нормализация ---------- */
const surname = v => norm(v).split(/[\s,.(]/)[0];
const cleanInn = v => String(v ?? '').replace(/\s/g, '').replace(/\.0$/, '');
const ALIASES = new Map([
  ['удмуртская', 'удмуртия'], ['удмурдская', 'удмуртия'], ['чувашская', 'чувашия'],
  ['кабардино-балкарская', 'кабардино-балкария'], ['карачаево-черкесская', 'карачаево-черкесия'],
  ['северная осетия - алания', 'северная осетия'], ['северная осетия-алания', 'северная осетия'],
  ['еврейская ао', 'еврейская автономная область'], ['ненецкий ао', 'ненецкий автономный округ'],
  ['чукотский ао', 'чукотский автономный округ'], ['ямало-ненецкий ао', 'ямало-ненецкий автономный округ'],
  ['ханты-мансийский ао', 'ханты-мансийский автономный округ'],
  ['ханты-мансийский автономный округ - югра', 'ханты-мансийский автономный округ'],
  ['саха (якутия)', 'якутия'], ['саха', 'якутия'], ['кемеровская область - кузбасс', 'кемеровская область'],
  ['марий эл', 'марий-эл'], ['чеченская', 'чечня'], ['г. москва', 'москва'], ['г. санкт-петербург', 'санкт-петербург'],
  ['донецкая народная', 'донецкая народная республика'], ['луганская народная', 'луганская народная республика'],
  ['днр', 'донецкая народная республика'], ['лнр', 'луганская народная республика'],
]);
function regionKey(v) {
  let k = norm(v).replace(/^республика +| +республика$/g, '')
    .replace(/(^| )авт\. *(?=округ|область)/g, (_, s) => s + 'автономный ')
    .replace('еврейская автономный область', 'еврейская автономная область');
  return ALIASES.get(k) ?? k;
}
const isTotal = v => /(?:^|[ :])(?:общий итог|итог|итого|всего)$/.test(norm(v));

/* ---------- регистрации из сводной (запасной путь) ---------- */
async function pivotRecords(R, load) {
  const h = R.h, out = [];
  let last = { region: '', inn: '', owner: '' };
  for (const row of await load(R)) {
    let region = row.get(h.region).trim(), inn = cleanInn(row.get(h.inn)), owner = row.get(h.owner).trim();
    const brand = h.brand ? row.get(h.brand).trim() : '';
    if ([region, row.get(h.inn), owner, brand].some(isTotal)) continue;
    const raw = row.get(h.count);
    if (raw === '') continue;
    const qty = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(qty)) continue;
    if (!region) region = last.region;
    if (!inn && !owner && h.brand) { inn = last.inn; owner = last.owner; }
    last = { region, inn, owner };
    if (!region) continue;
    out.push({ region, inn, owner, brand, qty });
  }
  return out;
}

/* ---------- регистрации из модели данных: все строки, свои фильтры ---------- */
async function fromModel(zip, want) {
  const M = Model().openModel(await zip.file('xl/model/item.data').async('uint8array'));
  const pick = (cols) => M.tables.find(t => cols.every(c => { try { return M.has(t, c); } catch (e) { return false; } }));
  const T = pick(['Кол-во', 'Кузов-план', 'Класс наш', 'Марка']);
  const G = pick(['СубъектРФ', 'soato']);
  const O = pick(['ИНН', 'Владелец', 'id_uaip_spisok_lic_filthy']);
  if (!T || !G || !O) throw Error('в модели нет таблиц регистраций, географии или владельцев');
  const col = (t, c) => M.column(t, c);
  const mark = (c, test) => { const f = new Uint8Array(c.dict.length + 3); c.dict.forEach((v, i) => { f[i + 3] = test(v) ? 1 : 0; }); return f; };
  const status = col(T, '.нов/бу'), cls = col(T, 'Класс наш'), body = col(T, 'Кузов-план'), qtyC = col(T, 'Кол-во');
  const okStatus = mark(status, v => FILTERS.status.map(canon).includes(canon(v)));
  const okCls = mark(cls, v => FILTERS.classes.map(canon).includes(canon(v)));
  const okBody = mark(body, v => FILTERS.bodies.map(canon).includes(canon(v)));
  // период: по полю «Дата» (серийная дата Excel), иначе по «.Год операции» / «.Месяц операции»
  let ym;
  if (M.has(T, 'Дата')) {
    const d = col(T, 'Дата');
    const conv = d.dict.map(v => { const n = Number(v); if (!Number.isFinite(n)) return 0; const t = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5); return t.getUTCFullYear() * 100 + t.getUTCMonth() + 1; });
    ym = i => { const id = d.ids[i]; return id >= 3 ? conv[id - 3] : 0; };
  } else {
    const y = col(T, '.Год операции'), m = col(T, '.Месяц операции');
    ym = i => (+y.value(y.ids[i]) || 0) * 100 + (+m.value(m.ids[i]) || 0);
  }
  const n = qtyC.ids.length;
  const base = new Uint8Array(n);
  let latest = 0;
  for (let i = 0; i < n; i++) {
    if (okStatus[status.ids[i]] && okCls[cls.ids[i]] && okBody[body.ids[i]]) { base[i] = 1; const v = ym(i); if (v > latest) latest = v; }
  }
  if (!latest) throw Error('в модели нет регистраций, подходящих под условия отчёта');
  const target = want ? want.year * 100 + want.month : latest;
  const period = { month: target % 100, year: Math.floor(target / 100) };
  const soato = col(T, 'soato'), owner = col(T, 'id_uaip_spisok_lic_filthy_max'), brand = col(T, 'Марка');
  const model = M.has(T, 'Модель') ? col(T, 'Модель') : null;
  const agg = new Map();
  for (let i = 0; i < n; i++) {
    if (!base[i] || ym(i) !== target) continue;
    const k = soato.ids[i] + '|' + owner.ids[i] + '|' + brand.ids[i] + '|' + (model ? model.ids[i] : 0);
    agg.set(k, (agg.get(k) || 0) + Number(qtyC.value(qtyC.ids[i]) || 0));
  }
  if (!agg.size) {
    const l = { month: latest % 100, year: Math.floor(latest / 100) };
    throw Error('NOMONTH:В выгрузке нет регистраций за ' + MONTHS[period.month - 1] + ' ' + period.year + '. Последний месяц в данных — ' + MONTHS[l.month - 1] + ' ' + l.year + '.');
  }
  const gS = col(G, 'soato'), gR = col(G, 'СубъектРФ'), regionBySoato = new Map();
  for (let i = 0; i < gS.ids.length; i++) regionBySoato.set(String(gS.value(gS.ids[i])), gR.value(gR.ids[i]) || '');
  const need = new Set([...agg.keys()].map(k => String(owner.value(+k.split('|')[1]))));
  const oId = col(O, 'id_uaip_spisok_lic_filthy'), oInn = col(O, 'ИНН'), oName = col(O, 'Владелец'), owners = new Map();
  for (let i = 0; i < oId.ids.length; i++) {
    const key = String(oId.value(oId.ids[i]));
    if (need.has(key)) owners.set(key, [String(oInn.value(oInn.ids[i]) ?? ''), String(oName.value(oName.ids[i]) ?? '')]);
  }
  const records = [];
  for (const [k, qty] of agg) {
    const [s, o, b, md] = k.split('|').map(Number);
    const [inn, name] = owners.get(String(owner.value(o))) || ['', ''];
    records.push({ region: regionBySoato.get(String(soato.value(s))) || 'Регион не указан', inn: cleanInn(inn), owner: name.trim(), brand: String(brand.value(b) ?? '').trim(), model: model ? String(model.value(md) ?? '').trim() : '', qty });
  }
  return { records, period };
}

/* ---------- основной расчёт ---------- */
async function build(buffers, names = [], opts = {}) {
  const books = await Promise.all(buffers.map(b => readBook(b)));
  const roles = {};
  const detected = [];
  for (let i = 0; i < books.length; i++) {
    const hits = await detect(books[i]);
    const fname = norm(names[i] || '');
    let hit = hits.find(x => x.role === 'registrations') || hits.find(x => x.role === 'territories')
      || hits.find(x => x.role === 'clients') || hits.find(x => x.role === 'events');
    if (!hit) { detected.push({ name: names[i], role: null }); continue; }
    if (roles[hit.role]) throw Error('Два файла похожи на «' + ROLE_LABEL[hit.role] + '»: ' + roles[hit.role].name + ' и ' + names[i] + '. Оставьте один.');
    roles[hit.role] = { ...hit, book: books[i], name: names[i] };
    detected.push({ name: names[i], role: hit.role });
  }
  const missing = Object.keys(SPEC).filter(r => !roles[r]);
  if (missing.length) {
    const e = Error('Не хватает исходника: ' + missing.map(r => '«' + ROLE_LABEL[r] + '»').join(', ') + '.');
    e.detected = detected; throw e;
  }
  const load = async r => (await r.book.rows(r.sheet)).filter(x => x.n > r.headerRow);

  /* справочник территорий */
  const managers = new Map(), byRegion = new Map();
  for (const row of await load(roles.territories)) {
    const h = roles.territories.h;
    const who = row.get(h.manager).trim(), reg = row.get(h.region).trim();
    if (!who || !reg) continue;
    const id = surname(who);
    if (!managers.has(id)) managers.set(id, {
      id, full: who.replace(/\s+/g, ' '), surname: who.trim().split(/\s+/)[0],
      phone: row.get(h.phone).trim(), email: row.get(h.email).trim(), position: row.get(h.position).trim(),
      regions: new Map(), owners: new Map(), brands: new Map(), details: new Map(), clients: [], events: [],
    });
    const key = regionKey(reg);
    managers.get(id).regions.has(key) || managers.get(id).regions.set(key, reg);
    if (!byRegion.has(key)) byRegion.set(key, new Set());
    byRegion.get(key).add(id);
  }
  if (!managers.size) throw Error('В справочнике территорий не найдено ни одного торгового представителя.');

  /* регистрации */
  const R = roles.registrations;
  const want = opts.month && opts.year ? { month: +opts.month, year: +opts.year } : null;
  const pivotPeriod = R.h ? readPeriod(R.head, R.headerRow) : null;
  let records = null, period = null, source = 'pivot', modelNote = '';
  if (R.book.zip.file('xl/model/item.data') && Model()) {
    try {
      const res = await fromModel(R.book.zip, want || pivotPeriod);
      records = res.records; period = res.period; source = 'model';
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.startsWith('NOMONTH:')) throw Error(msg.slice(8));
      modelNote = msg;
    }
  }
  if (!records) {
    if (!R.h) throw Error('Не удалось прочитать данные из модели файла регистраций' + (modelNote ? ' (' + modelNote + ')' : '') + ', а сводной с колонками СубъектРФ · ИНН · Владелец · Итог в файле нет.');
    period = pivotPeriod;
    if (want && period && (period.month !== want.month || period.year !== want.year))
      throw Error('Сводная в файле регистраций за ' + MONTHS[period.month - 1] + ' ' + period.year + ', а выбран ' + MONTHS[want.month - 1] + ' ' + want.year + '.' + (modelNote ? ' Модель данных прочитать не удалось: ' + modelNote : ''));
    records = await pivotRecords(R, load);
  }
  const unknown = new Map(), regionTotals = new Map();
  let total = 0, distributed = 0;
  for (const { region, inn, owner, brand, model = '', qty } of records) {
    total += qty;
    const key = regionKey(region);
    regionTotals.set(key, (regionTotals.get(key) || 0) + qty);
    const ids = byRegion.get(key);
    if (!ids) { unknown.set(region, (unknown.get(region) || 0) + qty); continue; }
    distributed += qty;
    const ownerKey = inn || '|' + norm(owner);
    const label = owner || (inn === '-' || !inn ? 'ФИЗ ЛИЦО' : 'Владелец не указан');
    for (const id of ids) {
      const m = managers.get(id);
      const o = m.owners.get(ownerKey) || { inn: inn || '-', owner: label, qty: 0 };
      if (owner && o.owner === 'ФИЗ ЛИЦО') o.owner = owner;
      o.qty += qty; m.owners.set(ownerKey, o);
      if (brand) m.brands.set(brand, (m.brands.get(brand) || 0) + qty);
      if (brand) {
        const dk = o.inn + '\u0001' + brand + '\u0001' + model;
        const d = m.details.get(dk) || { key: ownerKey, inn: o.inn, brand, model, qty: 0 };
        d.qty += qty; m.details.set(dk, d);
      }
    }
  }
  if (!total) throw Error('В файле регистраций не нашлось строк с количеством.');

  /* CRM */
  const crm = async (role, field) => {
    const r = roles[role];
    for (const row of await load(r)) {
      const m = managers.get(surname(row.get(r.h.manager)));
      if (!m) continue;
      const inn = cleanInn(row.get(r.h.inn));
      if (inn) m[field].push(inn);
    }
  };
  await crm('clients', 'clients');
  await crm('events', 'events');

  /* сборка файлов */
  const files = [], summary = [];
  for (const m of managers.values()) {
    const clients = [...new Set(m.clients)], events = [...new Set(m.events)];
    const cs = new Set(clients), es = new Set(events);
    const owners = [...m.owners.values()].map(o => ({ ...o, crm: cs.has(o.inn), need: es.has(o.inn) }));
    owners.sort((a, b) => (b.crm + b.need * 2) - (a.crm + a.need * 2) || (b.need - a.need) || b.qty - a.qty || a.owner.localeCompare(b.owner, 'ru'));
    const qty = owners.reduce((s, o) => s + o.qty, 0);
    const brands = [...m.brands].sort((a, b) => b[1] - a[1]);
    const regions = [...m.regions.entries()].map(([k, label]) => ({ label, qty: regionTotals.get(k) || 0 }));
    const bytes = await managerWorkbook(m, owners, clients, events, brands, regions, { period, source, details: [...m.details.values()] });
    const fname = m.surname.replace(/[\\/:*?"<>|]/g, '_') + '.xlsx';
    files.push({ name: fname, bytes });
    summary.push({
      name: m.full, surname: m.surname, file: fname, regions, owners: owners.length, qty,
      inCrm: owners.filter(o => o.crm).reduce((s, o) => s + o.qty, 0),
      knew: owners.filter(o => o.need).reduce((s, o) => s + o.qty, 0),
      crmOnly: owners.filter(o => o.crm && !o.need).reduce((s, o) => s + o.qty, 0),
      clients: clients.length, events: events.length,
    });
  }
  return {
    files, summary, period, total, distributed, source, modelNote,
    unknown: [...unknown].sort((a, b) => b[1] - a[1]),
    hasBrands: source === 'model' || !!R.h?.brand, detected,
  };
}
const ROLE_LABEL = { registrations: 'Регистрации ГИБДД', clients: 'CRM — клиенты', events: 'CRM — события', territories: 'Регионы ТП' };

/* ---------- запись XLSX ---------- */
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
'<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>' +
'<fonts count="3"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><charset val="204"/><scheme val="minor"/></font>' +
'<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><charset val="204"/><scheme val="minor"/></font>' +
'<font><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/><charset val="204"/><scheme val="minor"/></font></fonts>' +
'<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
'<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>' +
'<fill><patternFill patternType="solid"><fgColor rgb="FFB3B3B3"/><bgColor indexed="64"/></patternFill></fill>' +
'<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
'<border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders>' +
'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
'<cellXfs count="13">' +
'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                                                  // 0
'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 1 заголовок
'<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                           // 2 текст
'<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                          // 3 число
'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +                       // 4 итог текст
'<xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 5 итог число
'<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 6 скрытый заголовок
'<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +                                           // 7 ИНН-список
'<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' + // 8 комментарий
'<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
'<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>' +
'<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
'<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                    // 9 примечание
'</cellXfs><cellStyles count="1"><cellStyle name="Обычный" xfId="0" builtinId="0"/></cellStyles>' +
'<dxfs count="1"><dxf><font><color rgb="FF006100"/></font><fill><patternFill><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf></dxfs>' +
'</styleSheet>';

function cell(ref, v, s) {
  if (v == null || v === '') return s != null ? `<c r="${ref}" s="${s}"/>` : '';
  if (typeof v === 'number') return `<c r="${ref}" s="${s ?? 0}"><v>${v}</v></c>`;
  if (typeof v === 'object') return `<c r="${ref}" s="${s ?? 0}"${v.str ? ' t="str"' : ''}><f>${esc(v.f)}</f><v>${esc(v.v)}</v></c>`;
  return `<c r="${ref}" s="${s ?? 0}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml({ rows, cols, heights = {}, freeze = 0, filter = '', cf = '', selected = false }) {
  const keys = [...rows.keys()].sort((a, b) => a - b);
  const body = keys.map(r => `<row r="${r}"${heights[r] ? ` ht="${heights[r]}" customHeight="1"` : ''}>` +
    rows.get(r).sort((a, b) => a[0] - b[0]).map(x => x[1]).join('') + '</row>').join('');
  const maxRow = keys.length ? keys[keys.length - 1] : 1;
  const maxCol = Math.max(1, ...[...rows.values()].flat().map(x => x[0]));
  const colXml = cols.map(([c, w, hid]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"${hid ? ' hidden="1"' : ''}/>`).join('');
  const pane = freeze ? `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="A1:${colName(maxCol)}${maxRow}"/>` +
    `<sheetViews><sheetView${selected ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="14.4"/>' + `<cols>${colXml}</cols><sheetData>${body}</sheetData>` +
    (filter ? `<autoFilter ref="${filter}"/>` : '') + cf +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
}
const grid = () => { const rows = new Map(); return { rows, put: (r, c, v, s) => { if (!rows.has(r)) rows.set(r, []); rows.get(r).push([c, cell(colName(c) + r, v, s)]); } }; };
const byCode = (a, b) => a < b ? -1 : a > b ? 1 : 0;             // как сортирует сводная Excel: латиница, затем кириллица

async function managerWorkbook(m, owners, clients, events, brands, regions, extra = {}) {
  const sheets = [];
  const sheetName = m.surname.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Менеджер';
  /* Лист 1 — владельцы и проверка по CRM */
  {
    const { rows, put } = grid();
    ['ИНН', 'Владелец', 'Итог', 'ИНН Клиента', 'ИНН Клиента', 'Есть в срм', 'Знали о потребности', 'Комментарий']
      .forEach((t, i) => put(1, i + 1, t, i === 3 || i === 4 ? 6 : 1));
    owners.forEach((o, i) => {
      const r = i + 2;
      put(r, 1, o.inn, 2); put(r, 2, o.owner, 2); put(r, 3, o.qty, 3);
      put(r, 6, { f: `IFERROR(VLOOKUP(A${r},D:D,1,FALSE)," ")`, v: o.crm ? o.inn : ' ', str: 1 }, 2);
      put(r, 7, { f: `IFERROR(VLOOKUP(A${r},E:E,1,FALSE)," ")`, v: o.need ? o.inn : ' ', str: 1 }, 2);
      put(r, 8, '', 8);
    });
    const lastOwner = owners.length + 1, totalRow = lastOwner + 1;
    put(totalRow, 1, 'Общий итог', 4); put(totalRow, 2, '', 4);
    put(totalRow, 3, { f: `SUBTOTAL(9,C2:C${lastOwner})`, v: owners.reduce((s, o) => s + o.qty, 0) }, 5);
    clients.forEach((inn, i) => put(i + 2, 4, inn, 7));
    events.forEach((inn, i) => put(i + 2, 5, inn, 7));
    if (brands.length) {
      put(1, 11, 'Марка', 1); put(1, 12, 'Итог', 1);
      brands.forEach(([b, q], i) => { put(i + 2, 11, b, 2); put(i + 2, 12, q, 3); });
      const br = brands.length + 2;
      put(br, 11, 'Общий итог', 4); put(br, 12, { f: `SUM(L2:L${br - 1})`, v: brands.reduce((s, x) => s + x[1], 0) }, 5);
    }
    put(1, 15, 'Регионы менеджера', 1); put(1, 16, 'Поставлено на учёт', 1);
    regions.forEach((g, i) => { put(i + 2, 15, g.label, 2); put(i + 2, 16, g.qty, 3); });
    const gr = regions.length + 2;
    put(gr, 15, 'Итого', 4); put(gr, 16, { f: `SUM(P2:P${gr - 1})`, v: regions.reduce((s, g) => s + g.qty, 0) }, 5);
    if (m.phone || m.email) put(gr + 2, 15, [m.full, m.phone, m.email].filter(Boolean).join(' · '), 9);
    sheets.push({
      name: sheetName, filterDb: owners.length ? `$A$1:$H$${lastOwner}` : '',
      xml: sheetXml({
        rows, selected: true, freeze: 1, heights: { 1: 30 },
        cols: [[1, 15], [2, 46], [3, 9], [4, 14, 1], [5, 14, 1], [6, 14], [7, 14], [8, 36], [9, 4], [10, 4], [11, 18], [12, 9], [13, 4], [14, 4], [15, 30], [16, 12]],
        filter: owners.length ? `A1:H${lastOwner}` : '',
        cf: owners.length ? `<conditionalFormatting sqref="F2:G${lastOwner}"><cfRule type="expression" dxfId="0" priority="1"><formula>LEN(TRIM(F2))&gt;0</formula></cfRule></conditionalFormatting>` : '',
      }),
    });
  }
  const details = (extra.details || []).filter(d => d.brand);
  const nameByKey = new Map(owners.map(o => [o.inn, o.owner]));
  if (details.length) {
    /* Лист 2 — сводная: ИНН → Марка → Модель, как «СВОД-Валдай» */
    const { rows, put } = grid();
    const p = extra.period;
    const cond = [
      ['.нов/бу', FILTERS.status.join(', ')], ['Класс наш', FILTERS.classes.join(', ')], ['Кузов-план', FILTERS.bodies.join(', ')],
      ['СубъектРФ', regions.map(g => g.label).join(', ')],
      ['Год операции', p ? p.year : ''], ['Месяц операции', p ? p.month + ' (' + MONTHS[p.month - 1] + ')' : ''],
    ];
    if (extra.source !== 'model') cond.splice(0, 3);
    cond.forEach(([k, v], i) => { put(i + 1, 1, k, 12); put(i + 1, 2, String(v), 0); });
    let r = cond.length + 2;
    put(r, 1, 'Сумма по столбцу Кол-во', 12); r++;
    const head = r;
    ['ИНН', 'Марка', 'Модель', 'Итог'].forEach((t, i) => put(r, i + 1, t, 1)); r++;
    const tree = new Map();
    for (const d of details) {
      if (!tree.has(d.inn)) tree.set(d.inn, new Map());
      const b = tree.get(d.inn); if (!b.has(d.brand)) b.set(d.brand, new Map());
      const mm = b.get(d.brand); mm.set(d.model, (mm.get(d.model) || 0) + d.qty);
    }
    let grand = 0;
    for (const inn of [...tree.keys()].sort(byCode)) {
      let firstInn = true;
      for (const brand of [...tree.get(inn).keys()].sort(byCode)) {
        const models = tree.get(inn).get(brand); let firstBrand = true, sub = 0;
        for (const model of [...models.keys()].sort(byCode)) {
          const q = models.get(model); sub += q;
          put(r, 1, firstInn ? inn : '', 2); put(r, 2, firstBrand ? brand : '', 2); put(r, 3, model, 2); put(r, 4, q, 3);
          firstInn = firstBrand = false; r++;
        }
        put(r, 1, '', 2); put(r, 2, brand + ' Итог', 10); put(r, 3, '', 10); put(r, 4, sub, 11); r++;
        grand += sub;
      }
    }
    put(r, 1, 'Общий итог', 4); put(r, 2, '', 4); put(r, 3, '', 4); put(r, 4, grand, 5);
    sheets.push({ name: 'Сводная', xml: sheetXml({ rows, freeze: head, cols: [[1, 16], [2, 24], [3, 22], [4, 10]] }) });

    /* Лист 3 — что поставили на учёт: контрагент · марка · модель · количество */
    const g2 = grid();
    ['Контрагент', 'ИНН', 'Марка', 'Модель', 'Количество'].forEach((t, i) => g2.put(1, i + 1, t, 1));
    const ownerTotal = new Map(owners.map(o => [o.inn, o.qty]));
    const list = details.map(d => ({ ...d, owner: nameByKey.get(d.inn) || (d.inn === '-' ? 'ФИЗ ЛИЦО' : '') }))
      .sort((a, b) => (ownerTotal.get(b.inn) || 0) - (ownerTotal.get(a.inn) || 0) || a.owner.localeCompare(b.owner, 'ru') ||
        byCode(a.inn, b.inn) || byCode(a.brand, b.brand) || b.qty - a.qty || byCode(a.model, b.model));
    list.forEach((d, i) => { const rr = i + 2; g2.put(rr, 1, d.owner, 2); g2.put(rr, 2, d.inn, 2); g2.put(rr, 3, d.brand, 2); g2.put(rr, 4, d.model, 2); g2.put(rr, 5, d.qty, 3); });
    const last = list.length + 1;
    g2.put(last + 1, 1, 'Итого', 4); [2, 3, 4].forEach(c => g2.put(last + 1, c, '', 4));
    g2.put(last + 1, 5, { f: `SUBTOTAL(9,E2:E${last})`, v: list.reduce((s, d) => s + d.qty, 0) }, 5);
    sheets.push({ name: 'Поставлено на учёт', filterDb: `$A$1:$E$${last}`,
      xml: sheetXml({ rows: g2.rows, freeze: 1, filter: `A1:E${last}`, cols: [[1, 46], [2, 15], [3, 20], [4, 22], [5, 12]] }) });
  }

  const zip = new ZipLib();
  const n = sheets.length;
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  const defs = sheets.map((sh, i) => sh.filterDb ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(sh.name)}'!${sh.filterDb}</definedName>` : '').join('');
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
    sheets.map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
    (defs ? `<definedNames>${defs}</definedNames>` : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES);
  sheets.forEach((sh, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sh.xml));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function bundle(files, extra = []) {
  const zip = new ZipLib();
  for (const f of files) zip.file(f.name, f.bytes);
  for (const f of extra) zip.file(f.name, f.text);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function classify(buf) {
  const hits = await detect(await readBook(buf));
  const order = ['registrations', 'territories', 'clients', 'events'];
  for (const r of order) if (hits.some(h => h.role === r)) return r;
  return null;
}

async function peekPeriod(buf) {
  const book = await readBook(buf);
  const hit = (await detect(book)).find(h => h.role === 'registrations' && h.h);
  return hit ? readPeriod(hit.head, hit.headerRow) : null;
}

const api = { build, classify, peekPeriod, FILTERS, bundle, MONTHS, ROLE_LABEL, regionKey, readBook };
if (typeof module === 'object' && module.exports) module.exports = api; else root.GibddEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
