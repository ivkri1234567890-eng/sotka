const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const S = n => pg.screenshot({ path: `tests/shots/n-${n}.png` });
  await pg.goto('http://localhost:4173/'); await pg.waitForTimeout(3500); await S('01-home');
  // тумба: ножки нет/есть
  await pg.click('[data-testid="m-ns-scandi"]'); await pg.waitForTimeout(1200);
  await pg.click('.tab:has-text("Ручки и основание")'); await pg.click('.chip:has-text("Нет") >> nth=0').catch(async () => { await pg.click('button:has-text("Нет")'); });
  await pg.waitForTimeout(800); await S('02-ns-nolegs'); console.log('ns nolegs h', await pg.textContent('[data-testid="price"]'));
  await pg.click('[aria-label="Назад"]'); await pg.waitForTimeout(800);
  const leave = await pg.$('.modal button:has-text("Не сохранять"), button:has-text("Не сохранять")'); if (leave) await leave.click(); await pg.waitForTimeout(800);
  // трюмо
  await pg.click('[data-testid="cat-dresser"]'); await pg.waitForTimeout(2500); await S('03-dressers');
  await pg.click('[data-testid="m-dr-neo"]'); await pg.waitForTimeout(1500); await S('04-dresser');
  console.log('dresser errors:', await pg.locator('.ck.error').count());
  await pg.click('button:has-text("Арочное")').catch(() => {}); await pg.waitForTimeout(800); await S('05-dresser-arch');
  await pg.click('[data-testid="docs"]'); await pg.waitForTimeout(2000); await S('06-dresser-docs');
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 120000 }), pg.click('[data-testid="pdf"]')]); await dl.saveAs('tests/shots/dresser.pdf'); console.log('dresser pdf', fs.statSync('tests/shots/dresser.pdf').size);
  await pg.goto('http://localhost:4173/'); await pg.waitForTimeout(2000);
  // кровать
  await pg.click('[data-testid="cat-bed"]'); await pg.waitForTimeout(2500); await S('07-beds');
  await pg.click('[data-testid="m-bd-scandi"]'); await pg.waitForTimeout(1500); await S('08-bed');
  console.log('bed errors:', await pg.locator('.ck.error').count(), await pg.evaluate(() => [...document.querySelectorAll('.ck.error')].map(e => e.textContent).join(' | ').slice(0, 300)));
  await pg.click('button:has-text("180 см")'); await pg.waitForTimeout(800); await S('09-bed-180');
  await pg.click('.tab:has-text("Наполнение")'); await pg.click('button:has-text("2 ящика")'); await pg.waitForTimeout(800); await S('10-bed-drawers');
  console.log('bed drawers checks:', await pg.evaluate(() => [...document.querySelectorAll('.ck')].map(e => e.textContent).join(' | ').slice(0, 400)));
  await pg.click('.tg:has-text("Разнести")'); await pg.waitForTimeout(900); await S('11-bed-exploded'); await pg.click('.tg:has-text("Разнести")');
  await pg.click('[data-testid="docs"]'); await pg.waitForTimeout(2000); await S('12-bed-docs');
  for (const t of ['Деталировка', 'Раскрой', 'Смета', 'Инструкция']) { await pg.click(`.dnav button:has-text("${t}")`); await pg.waitForTimeout(t === 'Инструкция' ? 2500 : 600); await S('13-bed-' + t); }
  const [d2] = await Promise.all([pg.waitForEvent('download', { timeout: 120000 }), pg.click('[data-testid="pdf"]')]); await d2.saveAs('tests/shots/bed.pdf'); console.log('bed pdf', fs.statSync('tests/shots/bed.pdf').size);
  const [dz] = await Promise.all([pg.waitForEvent('download', { timeout: 180000 }), pg.click('[data-testid="zip"]')]); await dz.saveAs('tests/shots/bed.zip'); console.log('bed zip', fs.statSync('tests/shots/bed.zip').size);
  console.log('ERRORS', errs.slice(0, 10)); await b.close();
})();
