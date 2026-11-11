/* Вкладка «Описи»: импорт отчёта о продажах → предпросмотр → комплект описей, реестр передачи и реестр Excel. */
(() => {
const O = window.OpisiEngine;
const $ = id => document.getElementById(id);
const DEF = { gave: '', took: '', org: 'АО «ГК «СТТ»', unit: 'ДПГА', sender: '', phone: '', where: '', to: '', receiver: '' };   // имена и телефоны вводятся в настройках и хранятся только в браузере
const KEYS = Object.keys(DEF);
let reg = null, sales = null, groups = [], issues = [], items = [], showAll = false;

/* ---------- хранение реестра в браузере (IndexedDB) ---------- */
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open('dpga-opisi', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  }));
  const tx = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction('kv', mode); const q = fn(t.objectStore('kv')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
  return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)) };
})();
async function saveReg() {
  try { await idb.set('registry', JSON.stringify(reg)); return true; }
  catch (e) { $('opRegStatus').textContent = 'Не удалось сохранить реестр в этом браузере. Сохраните файл «Реестр описей.xlsx» из комплекта — его можно загрузить в следующий раз.'; return false; }
}

/* ---------- настройки ---------- */
function settings() {
  const s = {};
  for (const k of KEYS) s[k] = ($('op_' + k).value || '').trim();
  s.date = $('op_date').value ? $('op_date').value.split('-').reverse().join('.') : O.today();
  return s;
}
function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('dpga-opisi-settings') || '{}'); } catch (e) {}
  for (const k of KEYS) $('op_' + k).value = saved[k] ?? DEF[k];
  const d = new Date(); $('op_date').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  if (!$('op_gave').value || !$('op_took').value) $('opSettings').open = true;
  for (const k of KEYS) $('op_' + k).addEventListener('change', () => { try { localStorage.setItem('dpga-opisi-settings', JSON.stringify(Object.fromEntries(KEYS.map(k => [k, $('op_' + k).value])))); } catch (e) {} });
}

/* ---------- реестр ---------- */
function renderReg() {
  if (!reg) {
    $('opRegInfo').textContent = 'Реестр ещё не загружен.';
    $('opRegStatus').textContent = 'Загрузите «Реестр описей.xlsx» из последнего комплекта (или исторический existing_registry.json) — от него зависит, с какого номера продолжится нумерация.';
    $('opRegDownload').disabled = true; $('opFind').disabled = true;
  } else {
    const cars = reg.entries.reduce((s, e) => s + e.vins.length, 0);
    $('opRegInfo').textContent = 'Описей: ' + reg.entries.length.toLocaleString('ru-RU') + ' · автомобилей: ' + cars.toLocaleString('ru-RU') + ' · следующий № ' + O.nextNumber(reg) + (reg.updated ? ' · обновлён ' + reg.updated : '');
    $('opRegStatus').textContent = '';
    $('opRegDownload').disabled = false; $('opFind').disabled = false;
    if (!$('op_start').value || +$('op_start').value < O.nextNumber(reg)) $('op_start').value = O.nextNumber(reg);
  }
  $('opImport').disabled = !reg;
  $('opImportHint').hidden = !!reg;
}
$('opRegFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  $('opRegStatus').textContent = 'Читаю реестр…';
  try {
    const r = await O.readRegistry(await f.arrayBuffer(), f.name);
    if (reg && O.nextNumber(r) < O.nextNumber(reg)) {
      $('opRegStatus').textContent = 'Внимание: в загруженном реестре следующий № ' + O.nextNumber(r) + ', а в сохранённом — № ' + O.nextNumber(reg) + '. Возможно, это старая копия. Реестр заменён — если это ошибка, загрузите более новый файл.';
    }
    reg = r; await saveReg(); renderReg(); resetImport();
    if (!$('opRegStatus').textContent.startsWith('Внимание')) $('opRegStatus').textContent = 'Реестр загружен: ' + f.name;
  } catch (err) { $('opRegStatus').textContent = err.message || String(err); }
};
$('opRegDownload').onclick = async () => {
  if (!reg) return;
  saveFile('Реестр описей.xlsx', await O.registryXlsx(reg, issues), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
};

/* ---------- поиск и повторное формирование ---------- */
$('opFind').oninput = () => {
  const q = $('opFind').value.trim().toLowerCase(), box = $('opFound');
  box.replaceChildren();
  if (!reg || q.length < 2) return;
  const hit = reg.entries.filter(e => String(e.no) === q || e.invoice.toLowerCase().includes(q) || e.vins.some(v => v.toLowerCase().includes(q)) ||
    e.buyer.toLowerCase().includes(q) || e.recipient.toLowerCase().includes(q)).slice(-30).reverse();
  if (!hit.length) { const p = document.createElement('p'); p.className = 'tip'; p.textContent = 'Ничего не найдено.'; box.append(p); return; }
  for (const e of hit) {
    const row = document.createElement('div'); row.className = 'oprow';
    const t = document.createElement('div');
    const b = document.createElement('b'); b.textContent = '№ ' + e.no + ' · ' + e.invoice + (e.date ? ' от ' + e.date : '');
    const sm = document.createElement('small'); sm.textContent = [e.buyer || 'покупатель не указан', e.vins.length + ' VIN', e.status].join(' · ');
    t.append(b, sm);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'mini'; btn.textContent = 'Опись';
    btn.setAttribute('aria-label', 'Скачать опись № ' + e.no);
    btn.onclick = async () => saveFile(O.fileName(e.no, e.invoice), await O.opisDocx(e, settings()), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    row.append(t, btn); box.append(row);
  }
};

/* ---------- импорт продаж ---------- */
function resetImport() { sales = null; groups = []; issues = []; items = []; $('opPreview').hidden = true; $('opResult').hidden = true; $('opImportStatus').textContent = ''; }
$('opImport').onchange = async e => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length || !reg) return;
  resetImport();
  $('opImportStatus').textContent = 'Читаю отчёт…';
  try {
    const all = { file: files.map(f => f.name).join(', '), sheets: [], lines: [], skipped: [] };
    for (const f of files) {
      const s = await O.readSales(await f.arrayBuffer(), f.name);
      all.sheets.push(...s.sheets.map(x => ({ ...x, file: f.name }))); all.lines.push(...s.lines.map(l => ({ ...l, sheet: f.name + ' / ' + l.sheet })));
      all.skipped.push(...s.skipped.map(x => ({ ...x, sheet: f.name + ' / ' + x.sheet })));
    }
    sales = all;
    ({ groups, issues } = O.groupSales(sales));
    buildDirections();
    replan();
    $('opImportStatus').textContent = sales.sheets.map(s => '«' + s.file + '», лист «' + s.name + '»: ' + s.rows + ' строк' + (s.title ? '\n' + s.title : '')).join('\n');
    $('opPreview').hidden = false;
  } catch (err) { $('opImportStatus').textContent = err.message || String(err); }
};
function buildDirections() {
  const counts = new Map();
  for (const g of groups) { const d = g.direction || ''; counts.set(d, (counts.get(d) || 0) + 1); }
  const box = $('opDirs'); box.replaceChildren();
  [...counts].sort((a, b) => b[1] - a[1]).forEach(([d, n], i) => {
    const l = document.createElement('label'); l.className = 'check';
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = true; c.value = d; c.id = 'opdir' + i;
    c.onchange = replan;
    l.append(c, document.createTextNode((d || '(направление не указано)') + ' — ' + n)); box.append(l);
  });
}
function replan() {
  const dirs = new Set([...$('opDirs').querySelectorAll('input')].filter(c => c.checked).map(c => c.value));
  const prev = new Map(items.map(it => [it.g.key, it]));
  items = O.plan(groups.filter(g => dirs.has(g.direction || '')), reg, {});
  for (const it of items) {                      // сохранить ручные решения пользователя
    const p = prev.get(it.g.key);
    if (p && p.touched) { it.include = p.include; it.touched = true; it.manualDate = p.manualDate; }
  }
  renumber();
}
function renumber() {
  const start = parseInt($('op_start').value, 10);
  const next = O.nextNumber(reg);
  $('opStartErr').textContent = start && start < next ? 'Номера до ' + (next - 1) + ' уже заняты — нумерация начнётся с ' + next + '.' : '';
  O.number(items, reg, start || next);
  renderPreview();
}
$('op_start').oninput = () => { if (items.length) renumber(); };
$('opShowAll').onchange = e => { showAll = e.target.checked; renderPreview(); };

function renderPreview() {
  const cnt = s => items.filter(s).length;
  const fresh = items.filter(i => i.include && !i.entry), upd = items.filter(i => i.include && i.entry);
  const tiles = [[fresh.length, 'новых описей'], [upd.length, 'обновить'], [cnt(i => i.state === 'уже в реестре'), 'уже в реестре']];
  $('opTiles').replaceChildren(...tiles.map(([v, t]) => { const d = document.createElement('div'); d.className = 'tile'; const b = document.createElement('b'); b.textContent = v; d.append(b, t); return d; }));
  const nums = fresh.map(i => i.no);
  $('opRange').textContent = nums.length ? 'Номера: ' + nums[0] + (nums.length > 1 ? '–' + nums[nums.length - 1] : '') + '. Автомобилей: ' + [...fresh, ...upd].reduce((s, i) => s + i.g.vins.length, 0) + '.' : 'Новых описей нет.';
  const lv = l => issues.filter(i => i.level === l).length;
  $('opIssuesSum').textContent = 'Проверки: ошибок ' + lv('ошибка') + ', предупреждений ' + lv('внимание') + ', заметок ' + lv('инфо');
  const ul = $('opIssues'); ul.replaceChildren();
  for (const x of issues.filter(i => i.level !== 'инфо').concat(issues.filter(i => i.level === 'инфо')).slice(0, 400)) {
    const li = document.createElement('li'); li.className = x.level === 'ошибка' ? 'err' : '';
    li.textContent = (x.level === 'ошибка' ? '⚠ ' : x.level === 'внимание' ? '• ' : '· ') + x.text + (x.where ? ' — ' + x.where : '');
    ul.append(li);
  }
  const body = $('opRows'); body.replaceChildren();
  const visible = items.filter(i => showAll || i.state !== 'уже в реестре');
  for (const it of visible.slice(0, 1500)) {
    const g = it.g, tr = document.createElement('tr');
    const c0 = document.createElement('td'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = it.include;
    cb.disabled = it.state === 'уже в реестре' || (!g.date && !it.manualDate);
    cb.setAttribute('aria-label', 'Включить ' + g.invoice);
    cb.onchange = () => { it.include = cb.checked; it.touched = true; renumber(); };
    c0.append(cb);
    const c1 = document.createElement('td'); c1.textContent = it.no ? (it.entry ? '№ ' + it.no : it.no) : '—';
    const c2 = document.createElement('td');
    const inv = document.createElement('div'); inv.textContent = g.invoice; c2.append(inv);
    if (g.date) { const s = document.createElement('small'); s.textContent = O.ddmmyyyy(g.date); c2.append(s); }
    else {
      const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'дд.мм.гггг'; inp.value = it.manualDate || ''; inp.className = 'opdate';
      inp.setAttribute('aria-label', 'Дата счёт-фактуры ' + g.invoice);
      inp.onchange = () => { const ok = /^\d{2}\.\d{2}\.\d{4}$/.test(inp.value.trim()); it.manualDate = ok ? inp.value.trim() : ''; inp.classList.toggle('bad', !ok && !!inp.value); if (ok) { it.include = true; it.touched = true; } renumber(); };
      c2.append(inp);
    }
    const c3 = document.createElement('td');
    const b1 = document.createElement('div'); b1.textContent = g.buyer || '—'; const b2 = document.createElement('small'); b2.textContent = 'получатель: ' + (g.recipient || '—');
    c3.append(b1, b2);
    const c4 = document.createElement('td'); c4.textContent = g.vins.length;
    const c5 = document.createElement('td');
    const st = [it.state]; if (g.kind !== 'продажа') st.push(g.kind); st.push(...g.notes);
    c5.textContent = st.join(', ') + (it.changes.length ? '\n' + it.changes.join('\n') : '');
    if (g.notes.some(n => /несколько|дата/.test(n)) || g.kind !== 'продажа') c5.className = 'err';
    tr.append(c0, c1, c2, c3, c4, c5); body.append(tr);
  }
  $('opMore').textContent = visible.length > 1500 ? 'Показаны первые 1500 из ' + visible.length + '.' : '';
  $('opBuild').disabled = !items.some(i => i.include && i.no);
}

/* ---------- формирование ---------- */
$('opBuild').onclick = async () => {
  const chosen = items.filter(i => i.include && i.no);
  if (!chosen.length) return;
  const s = settings();
  if (!s.gave || !s.took) { $('opBuildStatus').textContent = 'Заполните в настройках внизу страницы, кто передаёт и кто принимает документы (поля «Передала» и «Приняла»).'; $('opSettings').open = true; return; }
  $('opBuild').disabled = true; $('opBuildStatus').textContent = 'Формирую…';
  const snapshot = JSON.stringify(reg);
  try {
    for (const it of chosen) if (!it.g.date && it.manualDate) {
      const [d, m, y] = it.manualDate.split('.').map(Number); it.g.date = new Date(Date.UTC(y, m - 1, d)); it.g.year = y;
    }
    const touched = O.apply(chosen, reg, s);
    const zip = await O.bundle(touched, reg, issues, s, window.OpisiBlank, (i, n) => { $('opBuildStatus').textContent = 'Описи: ' + i + ' из ' + n; });
    await saveReg();
    const freshNo = chosen.filter(i => !i.entry).map(i => i.no).sort((a, b) => a - b), updNo = chosen.filter(i => i.entry).map(i => i.no).sort((a, b) => a - b);
    const range = n => n.length ? n[0] + (n.length > 1 ? '–' + n[n.length - 1] : '') : '';
    const name = 'Описи_' + (freshNo.length ? range(freshNo).replace('–', '-') : 'обновление') + '.zip';
    lastZip = { name, zip };
    saveFile(name, zip, 'application/zip');
    $('opBuildStatus').textContent = '';
    $('opResultText').textContent = (freshNo.length ? 'Новых описей: ' + freshNo.length + ' (№ ' + range(freshNo) + ').\n' : '') +
      (updNo.length ? 'Обновлено с сохранением номера: ' + updNo.length + ' (№ ' + updNo.slice(0, 10).join(', ') + (updNo.length > 10 ? '…' : '') + ').\n' : '') +
      'В архиве: папка «Описи», «Реестр передачи описей.docx» и обновлённый «Реестр описей.xlsx». Реестр сохранён в этом браузере, следующий № ' + O.nextNumber(reg) + '.';
    $('opResult').hidden = false; $('opPreview').hidden = true;
    renderReg();
  } catch (err) {
    reg = JSON.parse(snapshot);                    // откат: номера не расходуются при сбое
    $('opBuildStatus').textContent = 'Не удалось сформировать: ' + (err.message || err) + '. Реестр не изменён.';
    $('opBuild').disabled = false;
  }
};
let lastZip = null;
$('opAgain').onclick = () => { if (lastZip) saveFile(lastZip.name, lastZip.zip, 'application/zip'); };
$('opNext').onclick = () => { resetImport(); $('opImportStatus').textContent = 'Выберите следующий отчёт.'; };

/* ---------- реестр по заполненным описям ---------- */
let filled = null;
$('opFilled').onchange = async e => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  filled = null; $('opFilledBuild').disabled = true; $('opFilledTiles').hidden = true; $('opFilledIssuesBox').hidden = true;
  $('opFilledStatus').textContent = 'Читаю описи…';
  try {
    const list = await Promise.all(files.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    filled = await O.readOpisi(list, (i, n) => { if (i % 25 === 0 || i === n) $('opFilledStatus').textContent = 'Читаю описи: ' + i + ' из ' + n; });
    const it = filled.items;
    if (!it.length) { $('opFilledStatus').textContent = 'Не найдено ни одной описи. Нужны Word-файлы описей (.docx) или ZIP с ними.'; }
    else {
      const nums = it.map(e => e.no);
      $('opFilledStatus').textContent = 'Описей: ' + it.length + ' (№ ' + nums[0] + (nums.length > 1 ? '–' + nums[nums.length - 1] : '') + ').';
      const tiles = [[it.length, 'описей'], [it.reduce((s, e) => s + e.vins.length, 0), 'автомобилей'], [it.filter(e => e.transferDate).length, 'с датой передачи'], [it.filter(e => e.poa).length, 'с доверенностью'], [it.filter(e => e.act).length, 'с актом'], [Math.round(it.reduce((s, e) => s + e.sheetsTotal, 0) * 100) / 100, 'листов']];
      $('opFilledTiles').replaceChildren(...tiles.map(([v, l]) => { const d = document.createElement('div'); d.className = 'tile'; const b = document.createElement('b'); b.textContent = v; d.append(b, l); return d; }));
      $('opFilledTiles').hidden = false;
      $('opFilledBuild').disabled = false;
    }
    const iss = filled.issues.slice();
    if (reg && it.length) {
      const byNo = new Map(reg.entries.map(e => [e.no, e]));
      const unknown = it.filter(e => !byNo.has(e.no)).map(e => e.no);
      const mism = it.filter(e => byNo.has(e.no) && e.invoice && byNo.get(e.no).invoice.replace(/\s/g, '') !== e.invoice.replace(/\s/g, '')).map(e => '№ ' + e.no + ': в описи УПД ' + e.invoice + ', в реестре ' + byNo.get(e.no).invoice);
      if (unknown.length) iss.push({ level: 'внимание', text: 'Нет в реестре описей: № ' + unknown.slice(0, 40).join(', ') + (unknown.length > 40 ? '…' : '') });
      for (const m of mism.slice(0, 50)) iss.push({ level: 'ошибка', text: 'Опись не совпадает с реестром — ' + m });
    }
    $('opFilledMerge').disabled = !reg; if (!reg) $('opFilledMerge').checked = false;
    const ul = $('opFilledIssues'); ul.replaceChildren();
    for (const x of iss) { const li = document.createElement('li'); li.className = x.level === 'ошибка' ? 'err' : ''; li.textContent = x.text + (x.where ? ' — ' + x.where : ''); ul.append(li); }
    $('opFilledIssuesSum').textContent = 'Замечания: ' + iss.length;
    $('opFilledIssuesBox').hidden = !iss.length;
  } catch (err) { $('opFilledStatus').textContent = 'Не удалось прочитать: ' + (err.message || err); }
};
$('opFilledBuild').onclick = async () => {
  if (!filled || !filled.items.length) return;
  const s = settings(), it = filled.items, nums = it.map(e => e.no);
  $('opFilledBuild').disabled = true;
  try {
    const doc = await O.registerDocx(it, s, window.OpisiBlank);
    const name = 'Реестр передачи — описи ' + nums[0] + (nums.length > 1 ? '-' + nums[nums.length - 1] : '') + '.docx';
    saveFile(name, doc, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const pl = n => n % 10 === 1 && n % 100 !== 11 ? 'опись' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'описи' : 'описей';
    let msg = 'Реестр сформирован: ' + it.length + ' ' + pl(it.length) + '.';
    if ($('opFilledMerge').checked && reg) {
      const m = O.mergeFilled(it, reg);
      await saveReg(); renderReg();
      msg += ' В реестре описей обновлено записей: ' + m.updated + '.' + (m.mismatch.length ? ' Не обновлены из-за расхождения УПД: ' + m.mismatch.length + ' (см. замечания).' : '');
    }
    $('opFilledStatus').textContent = msg;
  } catch (err) { $('opFilledStatus').textContent = 'Не удалось сформировать реестр: ' + (err.message || err); }
  finally { $('opFilledBuild').disabled = false; }
};

/* ---------- старт ---------- */
loadSettings();
idb.get('registry').then(v => { if (v) { reg = JSON.parse(v); } renderReg(); }).catch(() => renderReg());
renderReg();
})();
