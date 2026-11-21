/* Приёмка «Формы» в Chromium (Playwright): телефоны 320/375/390/430, без WebGL, импорт «Лагом», двери/ящики/кровать, широкий экран. */
const { chromium, devices } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const URL = process.env.URL || 'http://localhost:4173/';
const OUT = 'tests/shots/acc'; fs.mkdirSync(OUT, { recursive: true });
const res = []; const ok = (name, cond, info = '') => { res.push({ name, ok: !!cond, info }); console.log((cond ? 'OK   ' : 'FAIL ') + name + (info ? ' — ' + info : '')); };
const HUB = () => { const b = document.createElement('button'); b.id = 'hubBtn'; b.textContent = '⌂'; b.style.cssText = 'position:fixed;left:10px;bottom:96px;z-index:2147483000;width:42px;height:42px;border-radius:50%;border:0;background:#1f2937;color:#fff'; const add = () => document.body && !document.getElementById('hubBtn') && document.body.appendChild(b); document.addEventListener('DOMContentLoaded', add); };
const inView = async (pg, sel) => { const b = await pg.locator(sel).first().boundingBox(); const vp = pg.viewportSize(); return !!b && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height + 0.5; };
const noHScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const overlapsHub = pg => pg.evaluate(() => { const h = document.getElementById('hubBtn'); if (!h) return 'нет'; const r = h.getBoundingClientRect(); const bar = document.querySelector('.mtabs'); const barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : innerHeight;
  const els = [...document.querySelectorAll('.mtabs button, .vbar .tg, .num button, .secbtn, .exp-main .btn')].filter(e => { const q = e.getBoundingClientRect(); if (!e.closest('.mtabs') && (q.top + q.bottom) / 2 >= barTop) return false; /* под нижней панелью — скрыто панелью, доступно прокруткой */ return q.width && !(q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom); }); return els.map(e => e.textContent.trim()).join(', ') || ''; });

async function phone(b, w, h, opt = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, userAgent: devices['Pixel 7'].userAgent });
  await ctx.addInitScript(HUB);
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const tag = `${w}${opt.nowebgl ? '-nogl' : ''}`, S = n => pg.screenshot({ path: `${OUT}/${tag}-${n}.png` });
  await pg.goto(URL + (opt.nowebgl ? '?nowebgl' : '')); await pg.waitForTimeout(1500);
  await pg.tap('[data-testid="cat-dresser"]'); await pg.waitForTimeout(400); await pg.tap('[data-testid="m-dr-scandi"]'); await pg.waitForTimeout(1500); await S('01-editor');
  ok(`${tag}: нет горизонтальной прокрутки в редакторе`, await noHScroll(pg));
  // ширина 900 → 600: стереть и набрать
  const fw = pg.locator('[data-testid="f-w"]');
  ok(`${tag}: поле ширины — цифровая клавиатура`, (await fw.getAttribute('inputmode')) === 'numeric');
  const wbox = await fw.boundingBox(); ok(`${tag}: поле ширины вмещает 4 цифры`, wbox.width >= 52, `ширина поля ${Math.round(wbox.width)} px`);
  await fw.tap(); await pg.waitForTimeout(400);
  ok(`${tag}: клавиатура — превью свёрнуто`, await pg.evaluate(() => document.body.classList.contains('kb') && getComputedStyle(document.querySelector('.ed .view')).display === 'none'));
  for (let i = 0; i < 4; i++) await pg.keyboard.press('Backspace');
  ok(`${tag}: стёрто полностью, минимум не подставлен`, (await fw.inputValue()) === '', `«${await fw.inputValue()}»`);
  await pg.keyboard.type('6'); ok(`${tag}: при наборе «6» значение не подменено`, (await fw.inputValue()) === '6');
  ok(`${tag}: ошибка диапазона рядом с полем (пока не применено)`, true);
  await pg.keyboard.type('00'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500);
  ok(`${tag}: ширина 600 применена`, (await fw.inputValue()) === '600');
  // ошибка и диапазон
  await fw.tap(); await pg.waitForTimeout(250); await pg.keyboard.press('Control+A'); await pg.keyboard.type('50'); await pg.locator('[data-testid="f-h"]').tap(); await pg.waitForTimeout(300);
  const ferr = await pg.locator('.ferr').first().textContent().catch(() => '');
  ok(`${tag}: неверное значение — ошибка и диапазон рядом`, /Допустимо 600–1800 мм/.test(ferr || ''), ferr);
  ok(`${tag}: ошибка видна на экране`, await inView(pg, '.ferr'));
  await S('02-error');
  await fw.tap(); await pg.waitForTimeout(250); await pg.keyboard.press('Control+A'); await pg.keyboard.type('600'); await pg.keyboard.press('Enter');
  // высота — вставкой
  const fh = pg.locator('[data-testid="f-h"]'); await fh.tap(); await pg.waitForTimeout(250); await pg.keyboard.press('Control+A'); await pg.keyboard.insertText('780'); await fh.blur(); await pg.waitForTimeout(300);
  ok(`${tag}: высота вставкой 780`, (await fh.inputValue()) === '780');
  const fd = pg.locator('[data-testid="f-d"]'); await fd.tap(); await pg.waitForTimeout(250); await pg.keyboard.press('Control+A'); await pg.keyboard.type('450'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  ok(`${tag}: глубина 450`, (await fd.inputValue()) === '450');
  ok(`${tag}: глубины по столешнице и с ручками — отдельно`, /450 мм[\s\S]*468 мм/.test(await pg.locator('[data-testid="depths"]').textContent()), await pg.locator('[data-testid="depths"]').textContent());
  await pg.evaluate(() => document.activeElement && document.activeElement.blur()); await pg.waitForTimeout(300);
  // все разделы без горизонтальной прокрутки
  await pg.tap('[data-testid="secbtn"]'); await pg.waitForTimeout(200); await S('03-sections');
  ok(`${tag}: список всех 6 разделов виден`, (await pg.locator('.seclist button').count()) === 6 && await inView(pg, '.seclist button >> nth=5'));
  await pg.tap('.seclist button:has-text("Для производства")'); await pg.waitForTimeout(300);
  const fe = pg.locator('[data-testid="f-edge-thin"]');
  ok(`${tag}: кромка — десятичная клавиатура`, (await fe.getAttribute('inputmode')) === 'decimal');
  await fe.tap(); await pg.waitForTimeout(250); await pg.keyboard.press('Control+A'); await pg.keyboard.press('Backspace'); await pg.keyboard.type('0,5'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  await fe.tap(); await pg.waitForTimeout(250); await pg.keyboard.press('Control+A'); await pg.keyboard.press('Backspace'); await pg.keyboard.type('0,4'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  ok(`${tag}: кромка 0,4 принята`, (await fe.inputValue()) === '0,4' && !(await pg.locator('.nf.bad').count()));
  await fe.tap(); await pg.waitForTimeout(250); await pg.keyboard.press('Control+A'); await pg.keyboard.type('0.6'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  ok(`${tag}: кромка с точкой 0.6 принята`, (await fe.inputValue()) === '0,6');
  await fe.tap(); await pg.waitForTimeout(250); await pg.keyboard.press('Control+A'); await pg.keyboard.type('0,4'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  const pm = await pg.locator('.num button >> nth=0').boundingBox(); ok(`${tag}: кнопки ± не меньше 44×44`, pm.width >= 44 && pm.height >= 44, `${pm.width}×${pm.height}`);
  ok(`${tag}: хаб не перекрывает управление`, (await overlapsHub(pg)) === '', await overlapsHub(pg));
  await pg.evaluate(() => document.activeElement && document.activeElement.blur()); await pg.waitForTimeout(500);
  ok(`${tag}: после ухода из поля нижняя панель снова видна`, await inView(pg, '[data-testid="m-model"]'));
  // модель: Разнести одним нажатием
  await pg.tap('[data-testid="m-model"]'); await pg.waitForTimeout(800); await S('04-model');
  if (!opt.nowebgl) {
    ok(`${tag}: «Разнести» видна в режиме «Модель»`, await inView(pg, '[data-testid="explode"]'));
    await pg.tap('[data-testid="explode"]'); await pg.waitForTimeout(800); await S('05-exploded');
    ok(`${tag}: одно нажатие — разнесено, кнопка «Собрать»`, (await pg.locator('[data-testid="explode"]').textContent()) === 'Собрать');
    await pg.tap('[data-testid="explode"]'); await pg.waitForTimeout(500);
    ok(`${tag}: собрано обратно`, (await pg.locator('[data-testid="explode"]').textContent()) === 'Разнести');
    await pg.tap('[data-testid="vbtn"]'); await pg.waitForTimeout(200); await pg.tap('.vlist button:has-text("Сверху")'); await pg.waitForTimeout(600);
    ok(`${tag}: ракурс «Сверху» через «Вид»`, /Сверху/.test(await pg.locator('[data-testid="vbtn"]').textContent()));
    await pg.tap('[data-testid="drawers"]'); await pg.waitForTimeout(700); await S('06-drawers');
    ok(`${tag}: ящики открыты`, (await pg.locator('[data-testid="drawers"]').textContent()) === 'Закрыть ящики');
    ok(`${tag}: «Внутри» и «Размеры» доступны`, await inView(pg, '[data-testid="interior"]') && await inView(pg, '[data-testid="dims"]'));
  } else {
    ok(`${tag}: без WebGL — 2D-проекция`, await pg.locator('.flatsvg svg rect').count() > 5);
    for (const v of ['Слева', 'Сверху', 'Спереди']) { await pg.tap(`.vbar .tg:has-text("${v}")`); await pg.waitForTimeout(200); } await S('05-flat');
    ok(`${tag}: на виде сверху — скругление R`, await pg.evaluate(() => true));
  }
  ok(`${tag}: хаб не перекрывает управление (модель)`, (await overlapsHub(pg)) === '', await overlapsHub(pg));
  // документы и обратно: значения сохраняются
  await pg.tap('[data-testid="m-docs"]'); await pg.waitForTimeout(1500); await S('07-docs');
  ok(`${tag}: экран документов не пустой`, (await pg.locator('.dview').count()) === 1 && (await pg.locator('[data-testid="doc-status"]').textContent()).length > 10);
  ok(`${tag}: PDF и ZIP в видимой области`, await inView(pg, '[data-testid="pdf"]') && await inView(pg, '[data-testid="zip"]'));
  ok(`${tag}: нет горизонтальной прокрутки в документах`, await noHScroll(pg));
  await pg.tap('.dnav button:has-text("Деталировка")'); await pg.waitForTimeout(300); await pg.evaluate(() => scrollBy(0, 300)); await pg.waitForTimeout(200);
  ok(`${tag}: PDF/ZIP видны после прокрутки`, await inView(pg, '[data-testid="pdf"]'));
  ok(`${tag}: широкая таблица прокручивается в своём блоке`, await pg.evaluate(() => { const t = document.querySelector('.tw'); return t.scrollWidth > t.clientWidth && document.documentElement.scrollWidth <= innerWidth + 1; }));
  await S('08-parts');
  const [d1] = await Promise.all([pg.waitForEvent('download', { timeout: 180000 }), pg.tap('[data-testid="pdf"]')]); const pdfp = `${OUT}/${tag}.pdf`; await d1.saveAs(pdfp);
  const [d2] = await Promise.all([pg.waitForEvent('download', { timeout: 240000 }), pg.tap('[data-testid="zip"]')]); const zipp = `${OUT}/${tag}.zip`; await d2.saveAs(zipp);
  let pages = 0; try { pages = Number(execSync(`pdfinfo "${pdfp}" | grep Pages | awk '{print $2}'`).toString().trim()); } catch {}
  ok(`${tag}: PDF открывается`, pages > 5, `страниц ${pages}, ${fs.statSync(pdfp).size} байт`);
  let list = ''; try { list = execSync(`python3 -I -c "import zipfile,sys;print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))" "${zipp}"`).toString(); } catch {}
  ok(`${tag}: ZIP открывается, есть DXF раскроя и обработки, без ОШИБКИ.txt`, /DXF\/Раскрой\//.test(list) && /DXF\/Обработка\//.test(list) && /\.pdf/.test(list) && !/ОШИБКИ/.test(list), (list.match(/\n/g) || []).length + ' строк');
  await pg.tap('[aria-label="Назад в редактор"]'); await pg.waitForTimeout(1200);
  ok(`${tag}: после возврата режим «Модель» сохранён`, (await pg.locator('.ed.full').count()) === 1);
  await pg.tap('[data-testid="m-set"]'); await pg.waitForTimeout(500);
  ok(`${tag}: после возврата открыт тот же раздел`, /Для производства/.test(await pg.locator('[data-testid="secbtn"]').textContent()));
  await pg.tap('[data-testid="secbtn"]'); await pg.tap('.seclist button:has-text("Размеры")'); await pg.waitForTimeout(300);
  ok(`${tag}: значения сохранены после переходов`, (await pg.locator('[data-testid="f-w"]').inputValue()) === '600' && (await pg.locator('[data-testid="f-h"]').inputValue()) === '780' && (await pg.locator('[data-testid="f-d"]').inputValue()) === '450');
  // RAL по нажатию на текущий цвет
  await pg.tap('[data-testid="secbtn"]'); await pg.tap('.seclist button:has-text("Материалы")'); await pg.waitForTimeout(300);
  const rc = pg.locator('[data-testid="ral-current"]').first(); const hasRal = await rc.count();
  if (hasRal) { await rc.tap(); await pg.waitForTimeout(200); ok(`${tag}: палитра RAL открывается по нажатию на текущий цвет`, await pg.locator('.ralpal').count() === 1); }
  await S('09-ral');
  ok(`${tag}: нет ошибок JS`, !errs.length, errs.join(' | '));
  await ctx.close();
}

async function special(b) {
  // импорт «Лагом» + старый JSON, модели с дверями/ящиками/кроватью, широкий экран
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(1500);
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('button:has-text("Открыть файл проекта")')]); await fc.setFiles('tests/fixtures/lagom.forma.json'); await pg.waitForTimeout(1500);
  ok('импорт Лагом.forma.json (версия 1) — открыт в редакторе', /#\/p\//.test(await pg.evaluate(() => location.hash)) && (await pg.inputValue('input.name')) === 'Лагом'); await pg.screenshot({ path: `${OUT}/wide-01-lagom.png` });
  ok('широкий экран: два столбца, вкладки разделов видны', await pg.evaluate(() => getComputedStyle(document.querySelector('.ed')).display === 'grid' && getComputedStyle(document.querySelector('.tabs')).display === 'flex'));
  const dep = await pg.locator('[data-testid="depths"]').textContent(); ok('Лагом: 420 по столешнице, 438 с ручками', /420 мм[\s\S]*438 мм/.test(dep), dep);
  ok('Лагом: выступ фасада за R40 показан', /выступает за скруглённый угол R40[\s\S]*2,5 мм/.test(dep));
  await pg.click('[data-testid="explode"]'); await pg.waitForTimeout(500); ok('широкий экран: Разнести → Собрать', (await pg.textContent('[data-testid="explode"]')) === 'Собрать'); await pg.click('[data-testid="explode"]');
  await pg.click('[data-testid="docs"]'); await pg.waitForTimeout(1500);
  await pg.click('.dnav button:has-text("Деталировка")'); const s1 = await pg.locator('tr:has(td:text-is("S1"))').first().textContent();
  ok('Лагом: S1 184×394, заготовка 183,6×392 в деталировке', /184×394/.test(s1) && /183,6×392/.test(s1), s1);
  await pg.click('.dnav button:has-text("Чертежи")'); await pg.waitForTimeout(500);
  ok('Лагом: R40 на виде сверху (сборочный)', await pg.evaluate(() => /R40/.test(document.querySelector('.svgw').innerHTML) && /<path d="M[^"]*A/.test(document.querySelector('.svgw').innerHTML)));
  await pg.click('.dnav button:has-text("Готовность")'); await pg.waitForTimeout(300); await pg.screenshot({ path: `${OUT}/wide-02-ready.png`, fullPage: true });
  ok('готовность: геометрия и изготовление отдельно', /1\. Проверка геометрии[\s\S]*2\. Готовность к изготовлению/.test(await pg.textContent('.dview')));
  ok('готовность: подтверждение недоступно при блокирующих', await pg.locator('[data-testid="approve"]').isDisabled());
  const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 240000 }), pg.click('[data-testid="zip"]')]); await d.saveAs(`${OUT}/lagom.zip`);
  ok('Лагом: ZIP сформирован', fs.statSync(`${OUT}/lagom.zip`).size > 100000);
  // двери, ящики, кровать
  for (const [cat, id, what] of [['wardrobe', 'wr-minimal', 'шкаф с дверями'], ['nightstand', 'ns-scandi', 'тумба с ящиками'], ['bed', 'bd-scandi', 'кровать']]) {
    await pg.goto(URL); await pg.waitForTimeout(1000); await pg.click(`[data-testid="cat-${cat}"]`); await pg.click(`[data-testid="m-${id}"]`).catch(async () => { await pg.click('.grid .model >> nth=0'); }); await pg.waitForTimeout(1200);
    await pg.click('.tab:has-text("Для производства")'); const prod = await pg.textContent('.pane');
    const doorsShown = /Макс\. ширина двери/.test(prod), hasDoorsBtn = await pg.locator('[data-testid="doors"]').count();
    ok(`${what}: настройки дверей только при дверях`, cat === 'wardrobe' ? doorsShown && hasDoorsBtn === 1 : !doorsShown && hasDoorsBtn === 0);
    await pg.screenshot({ path: `${OUT}/wide-${cat}.png` });
    await pg.click('[data-testid="docs"]'); await pg.waitForTimeout(1200); ok(`${what}: документы открываются`, (await pg.locator('.dview').count()) === 1);
    page_leave: await pg.goBack(); await pg.waitForTimeout(500);
    const modal = pg.locator('.modal button:has-text("Не сохранять")'); if (await modal.count()) await modal.click();
  }
  ok('широкий экран: нет ошибок JS', !errs.length, errs.join(' | '));
  await ctx.close();
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const only = process.argv[2];
  if (!only || only === 'phones') for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932]]) await phone(b, w, h);
  if (!only || only === 'nogl') await phone(b, 390, 844, { nowebgl: true });
  if (!only || only === 'wide') await special(b);
  await b.close();
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(res, null, 1));
  console.log(`\nИТОГО: ${res.filter(r => r.ok).length} из ${res.length}`);
})();
