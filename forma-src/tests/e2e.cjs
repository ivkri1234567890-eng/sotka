const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const W = +(process.env.W || 1366), H = +(process.env.H || 860);
  const ctx = await b.newContext({ viewport: { width: W, height: H }, acceptDownloads: true, deviceScaleFactor: 1 });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const S = n => pg.screenshot({ path: `tests/shots/${W}-${n}.png` });
  await pg.goto('http://localhost:4173/'); await pg.waitForTimeout(2500); await S('01-home');
  await pg.click('[data-testid="m-ns-scandi"]'); await pg.waitForTimeout(1200); await S('02-editor');
  const price0 = await pg.textContent('[data-testid="price"]');
  await pg.fill('#w', '520'); await pg.press('#w', 'Enter'); await pg.waitForTimeout(400);
  const price1 = await pg.textContent('[data-testid="price"]'); console.log('price', price0, '->', price1);
  await pg.click('.tab:has-text("Материалы и цвет")'); await pg.click('[data-testid="ral-current"] >> nth=0'); await pg.fill('[aria-label="Поиск RAL"] >> nth=0', '5014'); await pg.click('[aria-label^="RAL 5014"] >> nth=0'); await pg.waitForTimeout(300);
  await pg.click('.tab:has-text("Ручки и основание")'); await pg.click('button.opt:has-text("Скоба")'); await pg.click('[aria-label="Латунь"] >> nth=0'); await pg.waitForTimeout(400);
  await pg.click('[data-testid="drawers"]'); await pg.waitForTimeout(900); await S('03-drawers');
  await pg.click('[data-testid="drawers"]'); await pg.click('[data-testid="explode"]'); await pg.waitForTimeout(900); await S('04-exploded'); await pg.click('[data-testid="explode"]');
  // выбор детали кликом в центр сцены
  const v = await pg.$('[data-testid="viewer"] canvas'); const bb = await v.boundingBox(); await pg.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.55); await pg.waitForTimeout(300);
  console.log('picked:', await pg.evaluate(() => document.querySelector('.pinfo b')?.textContent || 'none')); await S('05-pick');
  // неверная настройка: 4 ящика при малой высоте
  await pg.click('.tab:has-text("Наполнение")'); for (let i = 0; i < 3; i++) await pg.click('button:has-text("+ Зона снизу")');
  await pg.click('.tab:has-text("Размеры")'); await pg.fill('#h', '420'); await pg.press('#h', 'Enter'); await pg.waitForTimeout(300);
  console.log('error shown:', await pg.evaluate(() => [...document.querySelectorAll('.ck.error')].map(e => e.textContent).join(' | ').slice(0, 300)));
  await pg.click('[aria-label="Отменить"]'); await pg.click('[aria-label="Отменить"]'); await pg.click('[aria-label="Отменить"]'); await pg.click('[aria-label="Отменить"]'); await pg.waitForTimeout(300);
  console.log('after undo errors:', await pg.locator('.ck.error').count());
  await pg.click('[data-testid="save"]'); await pg.waitForTimeout(500);
  const cfg = await pg.evaluate(async () => new Promise(r => { const q = indexedDB.open('forma'); q.onsuccess = () => { const t = q.result.transaction('projects').objectStore('projects').getAll(); t.onsuccess = () => r(t.result.map(p => ({ name: p.name, draft: p.draft, w: p.config.size.width, ral: p.config.fronts.finish.code, h: p.config.handles }))); }; }));
  console.log('stored:', JSON.stringify(cfg));
  await pg.reload(); await pg.waitForTimeout(1500); console.log('after reload width field:', await pg.inputValue('#w').catch(() => 'n/a'));
  await pg.click('[aria-label="Назад"]'); await pg.waitForTimeout(800); await S('06-home-projects');
  await pg.click('.prow button:has-text("Открыть")'); await pg.waitForTimeout(800);
  await pg.click('[data-testid="docs"]'); await pg.waitForTimeout(1500); await S('07-docs');
  for (const t of ['Деталировка', 'Присадка', 'Раскрой', 'Смета', 'Инструкция']) { await pg.click(`.dnav button:has-text("${t}")`); await pg.waitForTimeout(t === 'Инструкция' ? 2500 : 500); await S('08-' + t); }
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 120000 }), pg.click('[data-testid="pdf"]')]); const pth = 'tests/shots/out.pdf'; await dl.saveAs(pth); console.log('pdf bytes', fs.statSync(pth).size);
  const [dz] = await Promise.all([pg.waitForEvent('download', { timeout: 180000 }), pg.click('[data-testid="zip"]')]); await dz.saveAs('tests/shots/out.zip'); console.log('zip bytes', fs.statSync('tests/shots/out.zip').size);
  const [dj] = await Promise.all([pg.waitForEvent('download'), pg.click('.exp-more summary').then(() => pg.click('[data-testid="json"]'))]); await dj.saveAs('tests/shots/out.json');
  console.log('ERRORS', errs.slice(0, 10)); await b.close();
})();
