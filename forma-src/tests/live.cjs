const { chromium, devices } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const ctx = await b.newContext({ ...devices['Pixel 7'], ignoreHTTPSErrors: true, acceptDownloads: true });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const S = n => pg.screenshot({ path: `tests/shots/live-${n}.png` });
  // 1) каталог → карточка «Формы»
  await pg.goto('https://ivkri1234567890-eng.github.io/sotka/hub/', { waitUntil: 'networkidle' });
  console.log('gate shown on hub:', await pg.locator('#sotkaGate').count());
  await pg.fill('#sotkaGate input', '0000'); await pg.press('#sotkaGate input', 'Enter'); await pg.waitForTimeout(800); console.log('wrong pw still locked:', await pg.locator('#sotkaGate').count());
  await pg.fill('#sotkaGate input', '171291'); await pg.press('#sotkaGate input', 'Enter'); await pg.waitForTimeout(1200);
  const card = pg.locator('.c:has-text("Форма — дизайнерская мебель")'); console.log('card:', await card.count(), (await card.innerText()).replace(/\n/g, ' | ').slice(0, 260));
  const apkHref = await card.locator('a:has-text("Скачать для Android")').getAttribute('href'); console.log('apk href', apkHref);
  await card.scrollIntoViewIfNeeded(); await S('01-hub-card');
  await card.locator('a:has-text("Открыть")').click(); await pg.waitForLoadState('networkidle'); await pg.waitForTimeout(3000);
  console.log('opened url', pg.url(), 'gate again?', await pg.locator('#sotkaGate:visible').count()); await S('02-forma');
  await pg.tap('[data-testid="m-ns-japandi"]'); await pg.waitForTimeout(2000); await S('03-editor');
  console.log('price', await pg.textContent('[data-testid="price"]'));
  console.log('sw scope', await pg.evaluate(async () => { const r = await navigator.serviceWorker.getRegistrations(); return r.map(x => x.scope); }));
  await pg.tap('[aria-label="Назад"]'); await pg.waitForTimeout(500); await pg.tap('.modal button:has-text("Сохранить")'); await pg.waitForTimeout(800);
  await pg.tap('a:has-text("Все приложения")'); await pg.waitForLoadState('networkidle'); await pg.waitForTimeout(800); console.log('back at', pg.url(), 'gate?', await pg.locator('#sotkaGate:visible').count());
  // другие приложения открываются
  for (const u of ['zamer/', 'priemka/', 'otchety/', '']) { const r = await pg.goto('https://ivkri1234567890-eng.github.io/sotka/' + u, { waitUntil: 'domcontentloaded' }); console.log('other app', u || '(root)', r.status(), await pg.title()); }
  // офлайн: повторное открытие «Формы» без сети (кэш SW)
  await pg.goto('https://ivkri1234567890-eng.github.io/sotka/forma/', { waitUntil: 'networkidle' }); await pg.waitForTimeout(1500);
  await ctx.setOffline(true); await pg.reload().catch(() => {}); await pg.waitForTimeout(2500); console.log('offline reload ok:', await pg.locator('[data-testid="m-new"]').count() > 0 || await pg.locator('#sotkaGate').count() > 0); await S('04-offline');
  await ctx.setOffline(false);
  console.log('ERRORS', errs.filter(e => !/favicon/.test(e)).slice(0, 8)); await b.close();
})();
