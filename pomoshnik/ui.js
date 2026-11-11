/* Помощник: сравнение версий и научный текст */
(() => {
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmt = n => Number(n).toLocaleString('ru-RU');
function saveFile(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = document.querySelector('script[src^="pdf.min.js"]').src.replace('pdf.min.js', 'pdf.worker.min.js');

/* ---------- вкладки ---------- */
const tabs = ['diff', 'sci', 'fmt'];
function show(t) {
  for (const x of tabs) { $(x + 'Tab').setAttribute('aria-pressed', x === t); $(x + 'View').hidden = x !== t; }
  try { localStorage.setItem('pom-tab', t); } catch (e) {}
}
for (const t of tabs) $(t + 'Tab').onclick = () => show(t);
try { show(localStorage.getItem('pom-tab') || 'diff'); } catch (e) { show('diff'); }

/* ================= Сравнение версий ================= */
let versions = [], results = [];
function renderVersions() {
  const ul = $('verList'); ul.replaceChildren();
  versions.forEach((v, i) => {
    const li = el('li', 'ver');
    const t = el('div'); t.append(el('b', '', 'Версия ' + (i + 1) + ': ' + v.name), el('small', '', fmt(v.paras.length) + ' абзацев · ' + fmt(PomDiff.words(v.paras.join(' ')).length) + ' слов'));
    const btns = el('div', 'verbtns');
    const mk = (txt, lbl, fn, dis) => { const b = el('button', 'mini', txt); b.type = 'button'; b.setAttribute('aria-label', lbl); b.disabled = dis; b.onclick = fn; return b; };
    btns.append(mk('↑', 'Выше', () => { [versions[i - 1], versions[i]] = [versions[i], versions[i - 1]]; renderVersions(); }, i === 0),
      mk('↓', 'Ниже', () => { [versions[i + 1], versions[i]] = [versions[i], versions[i + 1]]; renderVersions(); }, i === versions.length - 1),
      mk('✕', 'Убрать ' + v.name, () => { versions.splice(i, 1); renderVersions(); }, false));
    li.append(t, btns); ul.append(li);
  });
  $('diffRun').disabled = versions.length < 2;
  $('verHint').textContent = versions.length < 2 ? 'Добавьте минимум две версии. Порядок — от старой к новой, его можно поменять стрелками.' : 'Порядок — от старой к новой.';
  $('diffOut').hidden = true;
}
$('verFiles').onchange = async e => {
  const files = [...e.target.files]; e.target.value = '';
  $('diffStatus').textContent = 'Читаю файлы…';
  const bad = [];
  files.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
  for (const f of files) {
    try { const paras = await PomText.extract(new Uint8Array(await f.arrayBuffer()), f.name); if (!paras.length) throw Error('в файле нет текста'); versions.push({ name: f.name, paras }); }
    catch (err) { bad.push(f.name + ': ' + (err.message || err)); }
  }
  $('diffStatus').textContent = bad.join('\n');
  renderVersions();
};
$('diffRun').onclick = () => {
  const base = $('diffMode').value === 'base';
  results = [];
  for (let i = 1; i < versions.length; i++) {
    const a = base ? 0 : i - 1;
    results.push({ a, b: i, r: PomDiff.compare(versions[a].paras, versions[i].paras, { loose: $('loose').checked }) });
  }
  const sel = $('pairSel'); sel.replaceChildren();
  results.forEach((x, i) => sel.add(new Option('Версия ' + (x.a + 1) + ' → версия ' + (x.b + 1) + ' (' + x.r.stats.percent + '% правок)', i)));
  sel.value = results.length - 1;
  const tb = $('pairTable'); tb.replaceChildren();
  for (const x of results) {
    const s = x.r.stats, tr = el('tr');
    for (const v of [(x.a + 1) + ' → ' + (x.b + 1), s.changed, s.added, s.removed, s.moved, s.percent + '%']) tr.append(el('td', '', String(v)));
    tb.append(tr);
  }
  $('pairSummary').hidden = results.length < 2;
  $('diffOut').hidden = false;
  renderPair();
};
$('pairSel').onchange = renderPair;
$('onlyChanges').onchange = renderPair;
function segSpan(s) { const sp = el(s.t === '+' ? 'ins' : s.t === '-' ? 'del' : 'span', '', s.s); return sp; }
function renderPair() {
  const x = results[+$('pairSel').value]; if (!x) return;
  const s = x.r.stats;
  $('diffTiles').replaceChildren(...[[s.changed, 'изменено'], [s.added, 'добавлено'], [s.removed, 'удалено'], [s.moved, 'перемещено'], [s.percent + '%', 'объём правок']].map(([v, t]) => { const d = el('div', 'tile'); d.append(el('b', '', String(v)), t); return d; }));
  const box = $('diffDoc'); box.replaceChildren();
  const only = $('onlyChanges').checked, B = x.r.blocks;
  const show = B.map((b, i) => !only || b.t !== '=' || (B[i - 1] && B[i - 1].t !== '=') || (B[i + 1] && B[i + 1].t !== '='));
  let gap = false, nchg = 0;
  B.forEach((b, i) => {
    if (!show[i]) { if (!gap) { box.append(el('div', 'gap', '…')); gap = true; } return; }
    gap = false;
    const p = el('p', 'blk blk-' + ({ '=': 'same', '+': 'add', '-': 'del', '~': 'chg', '>': 'mvin', '<': 'mvout' })[b.t]);
    if (b.t !== '=') { p.id = 'chg' + nchg++; p.tabIndex = -1; }
    const tag = { '+': 'добавлен', '-': 'удалён', '>': 'перемещён сюда' + (b.segs ? ' и изменён' : ''), '<': 'перемещён отсюда' }[b.t];
    if (tag) p.append(el('span', 'tag', tag));
    if (b.segs) b.segs.forEach(sg => p.append(segSpan(sg)));
    else p.append(document.createTextNode(b.text));
    box.append(p);
  });
  if (!nchg) box.replaceChildren(el('p', 'tip', 'Версии совпадают по тексту.'));
  navIdx = -1; $('navInfo').textContent = nchg ? 'Изменений: ' + nchg : '';
  $('navPrev').disabled = $('navNext').disabled = !nchg;
}
let navIdx = -1;
function nav(d) {
  const all = $('diffDoc').querySelectorAll('[id^="chg"]'); if (!all.length) return;
  navIdx = (navIdx + d + all.length) % all.length;
  all.forEach(e => e.classList.remove('cur')); all[navIdx].classList.add('cur');
  all[navIdx].scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('navInfo').textContent = 'Изменение ' + (navIdx + 1) + ' из ' + all.length;
}
$('navPrev').onclick = () => nav(-1); $('navNext').onclick = () => nav(1);
$('diffWord').onclick = async () => {
  const x = results[+$('pairSel').value]; if (!x) return;
  const A = versions[x.a].name, Bn = versions[x.b].name;
  saveFile('Сравнение_' + (x.a + 1) + '-' + (x.b + 1) + '_' + Bn.replace(/\.[^.]+$/, '') + '.docx', await PomDiff.redlineDocx(x.r, { author: 'Сравнение: ' + A }), DOCX);
};
$('diffClear').onclick = () => { versions = []; results = []; renderVersions(); $('diffStatus').textContent = ''; };
renderVersions();

/* ================= Научный текст ================= */
let sci = null, checks = [], ctrl = null;
$('sciFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  $('sciStatus').textContent = 'Читаю файл…';
  try { const p = await PomText.extract(new Uint8Array(await f.arrayBuffer()), f.name); $('sciText').value = p.join('\n\n'); $('sciStatus').textContent = 'Загружено: ' + f.name; analyze(); }
  catch (err) { $('sciStatus').textContent = err.message || String(err); }
};
$('sciRun').onclick = analyze;
function analyze() {
  if (ctrl) ctrl.abort();
  const paras = PomText.splitPlain($('sciText').value);
  if (!paras.length) { $('sciStatus').textContent = 'Вставьте текст статьи или загрузите файл.'; return; }
  const refs = PomRefs.findReferences(paras);
  const cit = PomRefs.citations(refs.body, refs.entries);
  const ai = PomRefs.aiSignals(refs.body.length ? refs.body : paras);
  sci = { paras, refs, cit, ai };
  checks = refs.entries.map(() => null);
  $('sciOut').hidden = false;
  renderCit(); renderAi(); renderRefs();
  if (refs.entries.length) runChecks(); else $('refProgress').textContent = 'Список литературы не найден. Он должен начинаться с заголовка «Список литературы», «Литература» или «References».';
}
function renderCit() {
  const { cit, refs } = sci, ul = $('citList'); ul.replaceChildren();
  const add = (t, bad) => ul.append(el('li', bad ? 'bad' : '', t));
  if (!refs.entries.length) { add('Список литературы не найден — сверка ссылок невозможна.', true); return; }
  add('Источников в списке: ' + refs.entries.length + '. Ссылок в тексте вида [n]: ' + (cit.any ? cit.cited : 'не найдено') + '.');
  if (cit.any) {
    add(cit.missing.length ? 'В тексте есть ссылки на номера, которых нет в списке: ' + cit.missing.map(n => '[' + n + ']').join(', ') + '.' : 'Все номера из текста есть в списке.', cit.missing.length);
    add(cit.unused.length ? 'Источники, на которые нет ссылок в тексте: № ' + cit.unused.join(', ') + '.' : 'На все источники есть ссылки в тексте.', cit.unused.length);
  }
}
function renderAi() {
  const a = sci.ai, box = $('aiBox'); box.replaceChildren();
  if (a.tooShort) { box.append(el('p', 'tip', 'Текст слишком короткий для оценки стиля (нужно от 150 слов).')); return; }
  const head = el('p', 'level lv-' + ({ 'низкий': 0, 'средний': 1, 'высокий': 2 })[a.level]);
  head.append(el('b', '', 'Признаков ИИ-стиля: ' + a.level), el('span', '', ' · ' + fmt(a.words) + ' слов, ' + fmt(a.sentences) + ' предложений'));
  box.append(head);
  const ul = el('ul', 'ai');
  for (const it of a.items) { const li = el('li', it.flag ? 'warn' + it.flag : ''); li.append(el('b', '', it.name + ': '), document.createTextNode(it.value), el('small', '', it.hint)); ul.append(li); }
  box.append(ul);
  if (a.hits.length) box.append(el('p', 'tip', 'Чаще всего: ' + a.hits.slice(0, 8).map(([m, c]) => '«' + m + '» ×' + c).join(', ')));
  if (a.marked.length) {
    const d = el('details'); d.append(el('summary', '', 'Предложения с несколькими шаблонными оборотами (' + a.marked.length + ')'));
    for (const m of a.marked) d.append(el('p', 'quote', m.s));
    box.append(d);
  }
}
const STAT = { 'найден': ['ok', 'Найден'], 'похоже': ['warn', 'Похожая работа'], 'расхождение': ['bad', 'DOI ведёт на другую работу'], 'не существует': ['bad', 'DOI не существует'], 'не найден': ['bad', 'Не найден'], 'вручную': ['muted', 'Проверить вручную'], 'ошибка': ['muted', 'Ошибка сети'] };
function renderRefs() {
  const tb = $('refRows'); tb.replaceChildren();
  const filter = $('refFilter').value;
  sci.refs.entries.forEach((e, i) => {
    const c = checks[i];
    if (filter === 'problems' && c && (c.status === 'найден')) return;
    const tr = el('tr'); tr.append(el('td', '', String(e.num)));
    const td = el('td'); const [cls, label] = c ? STAT[c.status] || ['muted', c.status] : ['muted', 'проверяется…'];
    td.append(el('span', 'chip ' + cls, label), el('div', 'reftext', e.text));
    if (c && c.note) td.append(el('small', '', c.note));
    if (c && /не найден|похоже|вручную/.test(c.status) && e.kind === 'публикация') {
      const links = el('small', 'links');
      for (const [n, u] of PomRefs.searchLinks(e)) { const a = el('a', '', n); a.href = u; a.target = '_blank'; a.rel = 'noopener'; links.append(a); }
      td.append(links);
    }
    if (e.url && c && c.status === 'вручную') { const a = el('a', '', 'открыть ссылку'); a.href = e.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; const s = el('small'); s.append(a); td.append(s); }
    tr.append(td); tb.append(tr);
  });
  const done = checks.filter(Boolean), cnt = s => done.filter(c => c.status === s).length;
  $('refTiles').replaceChildren(...[[cnt('найден'), 'найдено'], [cnt('похоже') + cnt('вручную'), 'проверить'], [cnt('не найден') + cnt('расхождение') + cnt('не существует'), 'проблемных']].map(([v, t]) => { const d = el('div', 'tile'); d.append(el('b', '', String(v)), t); return d; }));
}
$('refFilter').onchange = renderRefs;
async function runChecks() {
  ctrl = new AbortController(); const my = ctrl, E = sci.refs.entries;
  let next = 0, done = 0;
  $('refProgress').textContent = 'Проверяю источники в Crossref и OpenAlex: 0 из ' + E.length;
  $('refStop').hidden = false; $('sciReport').disabled = true;
  const worker = async () => {
    while (next < E.length && !my.signal.aborted) {
      const i = next++;
      try { checks[i] = await PomRefs.checkEntry(E[i], { signal: my.signal }); }
      catch (err) { if (my.signal.aborted) return; checks[i] = { status: 'ошибка', note: 'Не удалось связаться с базой: ' + (err.message || err) + '. Проверьте интернет и повторите.' }; }
      done++; if (my === ctrl) { $('refProgress').textContent = 'Проверено ' + done + ' из ' + E.length; renderRefs(); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (my !== ctrl) return;
  $('refStop').hidden = true; $('sciReport').disabled = false;
  $('refProgress').textContent = my.signal.aborted ? 'Проверка остановлена: ' + done + ' из ' + E.length + '.' : 'Готово. «Не найден» не всегда значит «не существует»: книги, сборники и журналы без DOI часто не индексируются — сверьте их по ссылкам поиска.';
}
$('refStop').onclick = () => { if (ctrl) ctrl.abort(); };
$('sciReport').onclick = async () => {
  if (!sci) return;
  const blocks = [{ h: 'Проверка научного текста' }, { p: 'Дата проверки: ' + new Date().toLocaleDateString('ru-RU') }, { h: 'Ссылки в тексте и список литературы' }];
  for (const li of $('citList').children) blocks.push({ p: li.textContent });
  if (sci.refs.entries.length) blocks.push({ h: 'Источники' }, { widths: [600, 5200, 1500, 2300], table: [['№', 'Источник', 'Результат', 'Пояснение']].concat(sci.refs.entries.map((e, i) => [String(e.num), e.text, checks[i] ? (STAT[checks[i].status] || [, checks[i].status])[1] : 'не проверен', checks[i] ? checks[i].note : ''])) });
  blocks.push({ h: 'Признаки ИИ-стиля' });
  if (sci.ai.tooShort) blocks.push({ p: 'Текст слишком короткий для оценки.' });
  else { blocks.push({ p: 'Уровень признаков: ' + sci.ai.level + '. Это не доказательство авторства: признаки встречаются и в текстах людей.' }, { widths: [3200, 2600, 3800], table: [['Признак', 'Значение', 'Что это значит']].concat(sci.ai.items.map(i => [i.name, i.value, i.hint])) }); }
  saveFile('Проверка_научного_текста.docx', await PomDiff.simpleDocx(blocks), DOCX);
};

/* ================= Оформление по стандарту ================= */
const F = window.PomFormat, P = F.PRESETS;
const FIELDS = ['font', 'size', 'spacing', 'indent', 'left', 'right', 'top', 'bottom', 'align', 'pageNum', 'refStyle', 'captions', 'tableSize'];
const CHECKS = ['noFirstNum', 'upperStructural', 'newPage', 'sectionIndent', 'hanging', 'dropEmpty'];
let fmtFile = null, fmtOut = null, custom = null;
for (const [k, v] of Object.entries(P)) $('fmtPreset').add(new Option(v.name, k));
$('fmtPreset').add(new Option('Свои параметры (по загруженным требованиям)', 'custom'));
function fill(s) {
  for (const k of FIELDS) { const e = $('f_' + k); if (e && s[k] !== undefined) e.value = String(s[k]); }
  for (const k of CHECKS) $('f_' + k).checked = !!s[k];
}
function current() {
  const s = { ...F.BASE };
  for (const k of FIELDS) { const e = $('f_' + k), v = e.value; s[k] = e.type === 'number' || k === 'spacing' ? parseFloat(String(v).replace(',', '.')) : v; }
  for (const k of CHECKS) s[k] = $('f_' + k).checked;
  s.structuralCenter = true;
  return s;
}
$('fmtPreset').onchange = () => {
  const k = $('fmtPreset').value;
  if (k === 'custom') { fill(custom || current()); $('fmtNote').textContent = 'Параметры из загруженных требований — проверьте их в разделе «Параметры оформления».'; $('fmtParams').open = true; }
  else { fill(P[k]); $('fmtNote').textContent = P[k].note; }
  try { localStorage.setItem('pom-fmt', k); } catch (e) {}
};
try { const k = localStorage.getItem('pom-fmt'); if (k && P[k]) $('fmtPreset').value = k; } catch (e) {}
$('fmtPreset').onchange();
const LABEL = { font: 'Шрифт', size: 'Кегль', spacing: 'Интервал', left: 'Поле левое, мм', right: 'Поле правое, мм', top: 'Поле верхнее, мм', bottom: 'Поле нижнее, мм', indent: 'Абзацный отступ, см', align: 'Выравнивание', pageNum: 'Номер страницы', refStyle: 'Список литературы' };
const SHOW = { both: 'по ширине', left: 'по левому краю', 'bottom-center': 'внизу по центру', 'bottom-right': 'внизу справа', 'top-center': 'вверху по центру', 'top-right': 'вверху справа', gost100: 'ГОСТ Р 7.0.100-2018', gost5: 'ГОСТ Р 7.0.5-2008', apa: 'APA', vancouver: 'Vancouver' };
$('fmtReqFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { $('fmtReqText').value = (await PomText.extract(new Uint8Array(await f.arrayBuffer()), f.name)).join('\n'); readReq(); }
  catch (err) { $('fmtFound').replaceChildren(el('li', 'bad', err.message || String(err))); }
};
$('fmtReqRun').onclick = readReq;
function readReq() {
  const txt = $('fmtReqText').value.trim(); const ul = $('fmtFound'); ul.replaceChildren();
  if (!txt) { ul.append(el('li', 'bad', 'Вставьте текст требований или загрузите файл.')); return; }
  const { found, why } = F.parseRequirements(txt);
  const keys = Object.keys(found);
  if (!keys.length) { ul.append(el('li', 'bad', 'Не нашёл в тексте параметров оформления. Задайте их вручную в разделе «Параметры оформления».')); return; }
  custom = { ...current(), ...found };
  if (found.refStyle === 'apa') Object.assign(custom, { hanging: true, captions: 'apa' });
  for (const k of keys) { const li = el('li'); li.append(el('b', '', (LABEL[k] || k) + ': ' + (SHOW[found[k]] || String(found[k]).replace('.', ','))), el('small', '', '«…' + why[k] + '…»')); ul.append(li); }
  const miss = ['font', 'size', 'spacing', 'left', 'indent', 'pageNum'].filter(k => !(k in found));
  if (miss.length) ul.append(el('li', 'bad', 'Не найдено: ' + miss.map(k => LABEL[k].toLowerCase()).join(', ') + ' — оставлены значения выбранного стандарта.'));
  $('fmtPreset').value = 'custom'; $('fmtPreset').onchange();
}
$('fmtFile').onchange = e => { fmtFile = e.target.files[0] || null; e.target.value = ''; $('fmtRun').disabled = !fmtFile; $('fmtDownload').hidden = true; $('fmtReport').replaceChildren(); $('fmtStatus').textContent = fmtFile ? 'Файл: ' + fmtFile.name : ''; };
$('fmtRun').onclick = async () => {
  if (!fmtFile) return;
  const s = current(); $('fmtRun').disabled = true; $('fmtDownload').hidden = true; $('fmtReport').replaceChildren();
  $('fmtStatus').textContent = 'Оформляю…';
  try {
    let bytes = new Uint8Array(await fmtFile.arrayBuffer());
    const isDocx = bytes[0] === 0x50 && bytes[1] === 0x4B && (await JSZip.loadAsync(bytes)).file('word/document.xml');
    if (!isDocx) bytes = await F.textToDocx(await PomText.extract(bytes, fmtFile.name));
    const lookup = async text => { const e = PomRefs.parseEntry(text, 1); if (e.kind !== 'публикация') return null; const r = await PomRefs.checkEntry(e, { openAlex: false }); return r.status === 'найден' && r.match && r.match.people ? r.match : null; };
    const { bytes: out, report: r } = await F.formatDocx(bytes, s, { refLookup: s.refStyle === 'keep' ? null : lookup, onProgress: (i, n) => { $('fmtStatus').textContent = 'Список литературы: ищу данные источников в Crossref — ' + i + ' из ' + n; } });
    fmtOut = { name: fmtFile.name.replace(/\.[^.]+$/, '') + ' — оформлено.docx', bytes: out };
    const ul = $('fmtReport'); const add = (t, bad) => ul.append(el('li', bad ? 'bad' : '', t));
    add('Страница: A4, поля ' + [s.left, s.right, s.top, s.bottom].map(v => String(v).replace('.', ',')).join(' / ') + ' мм; ' + s.font + ' ' + s.size + ' пт, интервал ' + String(s.spacing).replace('.', ',') + ', абзац ' + String(s.indent).replace('.', ',') + ' см.');
    add('Абзацев текста: ' + r.body + '; заголовков разделов: ' + r.headings + '; структурных элементов («Введение», «Заключение»…): ' + r.struct + '.');
    if (r.figs || r.tabs) add('Подписей рисунков: ' + r.figs + ', таблиц: ' + r.tabs + (s.captions !== 'keep' ? ' — приведены к единому виду.' : '.'));
    if (r.tables) add('Абзацев в таблицах: ' + r.tables + ' (кегль ' + s.tableSize + ', одинарный интервал).');
    if (r.emptyRemoved) add('Убрано лишних пустых строк: ' + r.emptyRemoved + '.');
    if (r.refsAll) {
      add(s.refStyle === 'keep' ? 'Список литературы: ' + r.refsAll + ' записей, оформление не менялось.' : 'Список литературы: переоформлено ' + r.refsDone + ' из ' + r.refsAll + ' по ' + (SHOW[s.refStyle] || s.refStyle) + ' (по данным Crossref).');
      if (r.refsLeft.length) add('Не найдены в Crossref, оставлены как были — оформите вручную: ' + r.refsLeft.map(x => '«' + x + '…»').join('; '), true);
    } else add('Список литературы не найден (нужен заголовок «Список литературы», «Литература» или «References»).', true);
    if (!isDocx) add('Исходник не в формате Word: собран новый документ только из текста.', true);
    for (const n of r.notes) add(n);
    $('fmtStatus').textContent = 'Готово. Откройте файл и проверьте титульный лист и заголовки — их распознавание автоматическое.';
    $('fmtDownload').hidden = false;
  } catch (err) { $('fmtStatus').textContent = 'Не удалось оформить: ' + (err.message || err); }
  finally { $('fmtRun').disabled = !fmtFile; }
};
$('fmtDownload').onclick = () => { if (fmtOut) saveFile(fmtOut.name, fmtOut.bytes, DOCX); };
})();
