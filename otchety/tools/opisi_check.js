// Регрессии заполненных описей и переноса листов в Word/Excel.
// node --test otchety/tools/opisi_check.js
// OPISI_OFFLINE=1 запускает те же проверки на встроенном коде офлайн-HTML.
// Только синтетические документы, зависимости берутся из приложения.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const context = vm.createContext({ console, Buffer, Uint8Array, ArrayBuffer, TextDecoder, setTimeout, clearTimeout, setImmediate });
context.window = context;
context.self = context;
const offline = process.env.OPISI_OFFLINE ? fs.readFileSync(path.join(root, 'offline', 'Отчёты.html'), 'utf8') : null;
for (const name of ['jszip.min.js', 'xlsx.full.min.js', 'gibdd-engine.js', 'opisi-blank.js', 'opisi-engine.js']) {
  let code = fs.readFileSync(path.join(root, name), 'utf8');
  if (offline) {
    const marker = '<script>/* ' + name + ' */\n';
    const start = offline.indexOf(marker);
    assert.ok(start >= 0, name + ' включён в офлайн-сборку');
    code = offline.slice(start + marker.length, offline.indexOf('</script>', start));
    assert.equal(code.trim(), fs.readFileSync(path.join(root, name), 'utf8').replaceAll('\r\n', '\n').replaceAll('</script', '<\\/script').trim(), name + ' совпадает с исходником');
  }
  vm.runInContext(code, context, { filename: name });
}
const O = context.OpisiEngine;
const Zip = context.JSZip;
const settings = { gave: 'Тест Передала', took: 'Тест Приняла', org: 'Тест', unit: 'Отдел', date: '27.11.2026', sender: 'Отправитель', phone: '', where: 'Отдел', to: 'Получатель', receiver: '' };
const escapeXml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cell = value => '<w:tc><w:p><w:r><w:t>' + escapeXml(value) + '</w:t></w:r></w:p></w:tc>';
const row = values => '<w:tr>' + values.map(cell).join('') + '</w:tr>';
const header = ['Наименование', '№ документа', 'Кол-во листов'];
const invoice = 'TEST-000087/20261120';
const vin = 'XTEST000000000001';
const documents = (upd, poa, act, extra = []) => [
  ['Номер УПД (счёт-фактуры)', '№ ' + invoice + ' от 20.11.2026', upd],
  ...(poa == null ? [] : [['Доверенность', '№ Д-34 от 19.11.2026', poa]]),
  ['Акт', '№ А-56 от 20.11.2026', act],
  ...extra,
];

async function fixture(rows, { no = 47, cars = 1, tables } = {}) {
  const entry = { no, invoice, date: '20.11.2026', buyer: 'Тестовый покупатель', recipient: 'Тестовый получатель', vins: [vin], poa: '', act: '', transferDate: '27.11.2026' };
  const zip = await Zip.loadAsync(await O.opisDocx(entry, settings));
  const xml = await zip.file('word/document.xml').async('string');
  const vins = Array.from({ length: cars }, (_, i) => 'XTEST' + String(i + 1).padStart(12, '0'));
  const content = tables || '<w:tbl>' + [header,
    ['Покупатель', entry.buyer, '100'],
    ['Получатель', entry.recipient, '200'],
    ['Автомобиль / VIN', vins.join(' '), '300'],
    ...rows].map(row).join('') + '</w:tbl>';
  zip.file('word/document.xml', xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, content));
  return zip.generateAsync({ type: 'uint8array' });
}

const cases = [
  ['одна машина и паспорт', documents(1, 1, 1, [['Ксерокопия паспорта', '', 2]]), 5, 1],
  ['несколько машин и фактические девять листов актов', documents(1, 1, 9, [['Ксерокопия паспорта', '', 2]]), 13, 9],
  ['без доверенности и паспорта', documents(1, null, 1), 2, 1],
  ['произвольное приложение', documents(2, null, 1, [['Приложение', '№ 7', 3]]), 6, 1],
  ['пустые значения', documents('', ' ', 1, [['Приложение', '', ''], ['', '', 50]]), 1, 1],
  ['несколько дополнительных документов', documents(2, null, 1, [['Сертификат', '', 4], ['Фото', '', 3], ['Копия паспорта', '', 2]]), 12, 4],
  ['все значения пустые', documents('', '', '', [['Приложение', '', '']]), 0, 1],
  ['число листов не выводится из количества VIN', documents(2, null, 4), 6, 12],
  ['девять отдельных актов', [...documents(1, 1, 1), ...Array.from({ length: 8 }, (_, i) => ['Акт', '№ А-' + (i + 2), 1]), ['Ксерокопия паспорта', '', 2]], 13, 9],
  ['повтор заголовка и итоговая строка', [...documents(1, 1, 1), header, ['Ксерокопия паспорта', '', 2], ['Итого', '', 5], ['Всего листов', '', 5]], 5, 1],
  ['промежуточные и общие итоги', [...documents(2, null, 1), ['Промежуточный итог', '', 3], ['Приложение', '', 3], ['Общий итог', '', 6], ['Сумма', '', 6], ['Общее количество листов', '', 6], ['Количество листов всего', '', 6], ['Итого по УПД', '99', 6]], 6, 1],
  ['числовые значения с запятой и единицей', documents('2,5', '1 л.', '1 лист', [['Приложение', '', '3 листа']]), 7.5, 1],
  ['посторонний текст в колонке листов', documents('2?', '-', '1/2', [['Приложение', '', 'нет'], ['Фото', '', '0']]), 0, 1],
  ['название дополнительного документа содержит слово итог', documents(1, null, 1, [['Протокол итогов проверки', '', 3]]), 5, 1],
];

for (const [name, rows, expected, cars] of cases) {
  test(name, async () => {
    // Разные номера исключают зависимость результата от конкретной описи.
    for (const no of [12, 847, 12036]) {
      const parsed = await O.parseOpis(await fixture(rows, { no, cars }), 'Опись.docx');
      assert.equal(parsed.no, no);
      assert.equal(parsed.sheetsTotal, expected);
      assert.equal(parsed.invoice, invoice);
      assert.equal(parsed.date, '20.11.2026');
      assert.equal(parsed.vins.length, cars);
      assert.equal(parsed.buyer, 'Тестовый покупатель');
      assert.equal(parsed.recipient, 'Тестовый получатель');
      assert.equal(parsed.transferDate, '27.11.2026');
      assert.equal(parsed.gave, settings.gave);
      assert.equal(parsed.took, settings.took);
    }
  });
}

test('сохраняются полные реквизиты УПД, доверенности, акта и VIN', async () => {
  const parsed = await O.parseOpis(await fixture(documents(2, 1, 3)), 'Опись.docx');
  assert.equal(parsed.invoice, invoice);
  assert.equal(parsed.poa, 'Д-34 от 19.11.2026');
  assert.equal(parsed.act, 'А-56 от 20.11.2026');
  assert.equal(parsed.vins[0], vin);
  assert.equal(parsed.sheets.upd, '2');
  assert.equal(parsed.sheets.poa, '1');
  assert.equal(parsed.sheets.act, '3');
});

test('колонка листов определяется по заголовку, итоги с объединением исключены', async () => {
  const rows = [
    ['№ п/п', 'Наименование документа', 'Кол-во\nлистов', '№ документа'],
    ['1', 'УПД', '2', '№ ' + invoice],
    ['2', 'Акт', '1', '№ А-56'],
    ['3', 'Приложение', '3', ''],
    ['4', 'Всего', '6', ''],
  ];
  const merged = '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Итого</w:t></w:r></w:p></w:tc>' + cell('6') + cell('') + '</w:tr>';
  const parsed = await O.parseOpis(await fixture([], { tables: '<w:tbl>' + rows.map(row).join('') + merged + '</w:tbl>' }), 'Опись.docx');
  assert.equal(parsed.sheetsTotal, 6);
  assert.equal(parsed.invoice, invoice);
  assert.equal(parsed.act, 'А-56');
});

test('старые таблицы без заголовка и продолжение в отдельной таблице', async () => {
  const tables = '<w:tbl>' + documents(2, null, 1).map(row).join('') + '</w:tbl><w:tbl>' + row(['Фото', '', 3]) + '</w:tbl>';
  assert.equal((await O.parseOpis(await fixture([], { tables }), 'Опись.docx')).sheetsTotal, 6);
});

test('ZIP с несколькими описями, Word и Excel содержат одинаковые суммы', async () => {
  const zip = new Zip();
  const expected = [5, 13, 2, 6, 0];
  const rows = [...cases.slice(0, 4).map(c => c[1]), documents('', '', '')];
  for (let i = 0; i < rows.length; i++) zip.file('Описи/Opis_' + (100 + i) + '.docx', await fixture(rows[i], { no: 100 + i }));
  const result = await O.readOpisi([{ name: 'Описи.zip', bytes: await zip.generateAsync({ type: 'uint8array' }) }]);
  assert.equal(result.items.length, 5);
  assert.equal(result.issues.length, 0);
  assert.deepEqual(Array.from(result.items, e => e.sheetsTotal), expected);

  const reg = { start: 105, entries: result.items.map(e => ({ ...e, sheets: '99', year: 2026, version: 4, status: 'передана', history: 'Ранее' })) };
  assert.equal(O.mergeFilled(result.items, reg).updated, 5);
  const history = reg.entries.map(e => e.history);
  assert.equal(O.mergeFilled(result.items, reg).updated, 0);
  assert.deepEqual(reg.entries.map(e => e.history), history);
  assert.equal(O.nextNumber(reg), 105);
  assert.ok(reg.entries.every(e => e.version === 4 && e.status === 'передана'));

  const word = await Zip.loadAsync(await O.registerDocx(result.items, settings, context.OpisiBlank));
  const xml = await word.file('word/document.xml').async('string');
  assert.deepEqual(Array.from(xml.matchAll(/листов: ([\d.]+)/g), m => Number(m[1])), expected);
  const xlsx = await O.registryXlsx(reg);
  const reread = await O.readRegistry(xlsx, 'Реестр.xlsx');
  assert.deepEqual(Array.from(reread.entries, e => Number(e.sheets)), expected);
  assert.deepEqual(Array.from(reread.entries, e => e.no), [100, 101, 102, 103, 104]);
  assert.ok(reread.entries.every(e => e.invoice === invoice));
  // Повторное создание Word из сохранённого Excel также использует сохранённую сумму.
  const fromExcel = await Zip.loadAsync(await O.registerDocx(reread.entries, settings, context.OpisiBlank));
  assert.deepEqual(Array.from((await fromExcel.file('word/document.xml').async('string')).matchAll(/листов: ([\d.]+)/g), m => Number(m[1])), expected);
});

test('сверка не переносит данные в чужой УПД и не создаёт новых номеров', async () => {
  const parsed = await O.parseOpis(await fixture(documents(1, 1, 1)), 'Опись.docx');
  const reg = { entries: [{ no: parsed.no, invoice: 'ДРУГОЙ/20261120', sheets: '8' }] };
  const result = O.mergeFilled([parsed, { ...parsed, no: 999 }], reg);
  assert.equal(result.updated, 0);
  assert.equal(result.mismatch.length, 1);
  assert.equal(result.unknown[0], 999);
  assert.equal(reg.entries[0].sheets, '8');
  assert.equal(reg.entries.length, 1);
});
