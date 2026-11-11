/* Научные тексты: список литературы, проверка источников (Crossref, OpenAlex), ссылки в тексте, признаки ИИ-стиля */
(function (root) {
'use strict';
const CY = new Date().getFullYear();
const words = s => (String(s).toLowerCase().replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) || []);
const sig = s => words(s).filter(w => w.length >= 3);

/* ---------- список литературы ---------- */
const HEAD = /^(?:\d+[.)]?\s*)?(?:список\s+(?:использованн(?:ой|ых)\s+)?(?:литературы|источников)(?:\s+и\s+литературы)?|литература|использованная литература|библиографический список|библиография|references|bibliography|literature cited|works cited|источники)\s*[:.]?$/i;
const STOP = /^(?:приложени[ея]|appendix|сведения об авторах|information about the authors?|author contributions|funding|благодарности|acknowledg)/i;
function splitEntries(paras) {
  const out = [];
  for (const p of paras) {
    const all = [...p.matchAll(/(?:^|\s)(\d{1,3})[.)]\s+(?=[\p{Lu}"«])/gu)];
    const marks = [];
    if (all.length && all[0].index === 0) { let next = +all[0][1]; for (const m of all) if (+m[1] === next) { marks.push(m); next++; } }
    if (marks.length > 1) {
      for (let i = 0; i < marks.length; i++) {
        const s = marks[i].index + (marks[i][0].startsWith(' ') ? 1 : 0), e = i + 1 < marks.length ? marks[i + 1].index : p.length;
        out.push(p.slice(s, e).trim());
      }
    } else out.push(p);
  }
  return out.filter(e => sig(e).length >= 3);
}
function findReferences(paras) {
  let idx = -1;
  for (let i = paras.length - 1; i >= 0; i--) if (HEAD.test(paras[i].trim()) || /^(список литературы|references)\b/i.test(paras[i].trim()) && paras[i].length < 60) { idx = i; break; }
  if (idx < 0) return { body: paras, entries: [], heading: null };
  let end = paras.length;
  for (let i = idx + 1; i < paras.length; i++) if (STOP.test(paras[i].trim())) { end = i; break; }
  const entries = splitEntries(paras.slice(idx + 1, end)).map((text, i) => parseEntry(text, i + 1));
  return { body: paras.slice(0, idx), entries, heading: paras[idx] };
}
function parseEntry(text, pos) {
  const numM = /^\s*\[?(\d{1,3})[.)\]]\s*/.exec(text);
  const num = numM ? +numM[1] : pos;
  const t = numM ? text.slice(numM[0].length) : text;
  const doiM = /\b(10\.\d{4,9}\/[^\s"<>]+)/i.exec(t.replace(/https?:\/\/(dx\.)?doi\.org\//gi, ''));
  const doi = doiM ? doiM[1].replace(/[.,;)\]]+$/, '') : '';
  const years = [...t.matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)].map(m => +m[1]);
  const year = years.find(y => y <= CY + 1) || null;
  const auth = /^([\p{Lu}][\p{L}'’-]+)/u.exec(t);
  const url = (/(https?:\/\/[^\s<>"]+)/i.exec(t) || [])[1] || '';
  const kind = /(федеральн[а-яё]* закон|кодекс[а-яё]* (?:российской|рф)|постановлени[а-яё]* (?:правительства|пленума)|приказ[а-яё]* (?:мин|фед)|указ[а-яё]* президента|\bгост\b|\bсп \d|снип|санпин|конституци[а-яё]* (?:российской|рф))/i.test(t) ? 'норматив'
    : (!doi && url && (/дата обращения|accessed|retrieved|режим доступа/i.test(t) || !/\/\//.test(t.replace(url, '')))) ? 'сайт' : 'публикация';
  return { num, text: t.trim(), doi, year, years, author: auth ? auth[1] : '', url, kind };
}

/* ---------- ссылки в тексте ---------- */
function citations(body, entries) {
  const cited = new Map();
  const add = (n, where) => { if (!cited.has(n)) cited.set(n, where); };
  body.forEach((p, i) => {
    for (const m of p.matchAll(/\[([^\]]{1,80})\]/g)) {
      const inner = m[1];
      if (!/^\s*\d/.test(inner)) continue;
      for (const part of inner.split(/[;,]/)) {
        const r = /^\s*(\d{1,3})\s*(?:[-–—]\s*(\d{1,3}))?\s*(?:$|с\.|c\.|p\.|pp\.|стр|рис|табл|\s)/i.exec(part);
        if (!r) continue;
        const a = +r[1], b = r[2] ? +r[2] : a;
        if (b >= a && b - a < 50) for (let n = a; n <= b; n++) add(n, i);
      }
    }
  });
  const nums = new Set(entries.map(e => e.num));
  const missing = [...cited.keys()].filter(n => !nums.has(n)).sort((a, b) => a - b);
  const unused = entries.filter(e => !cited.has(e.num)).map(e => e.num);
  const order = [...cited.keys()];
  const outOfOrder = order.some((n, i) => i && n < order[i - 1] && !cited.has(n - 1)) ? true : false;
  return { cited: cited.size, missing, unused, any: cited.size > 0, outOfOrder };
}

/* ---------- проверка источников ---------- */
function titleCoverage(title, entry) {
  const T = sig(title), E = new Set(sig(String(entry).split(/\s\/\/\s|\s\/\/|\/\/\s/)[0]));
  if (!T.length) return 0;
  return T.filter(w => E.has(w)).length / T.length;
}
const strip = s => String(s || '').replace(/<[^>]+>/g, '');
function score(entry, cand) {
  const cov = titleCoverage(cand.title, entry.text);
  const fam = (cand.authors || []).map(a => a.toLowerCase().replaceAll('ё', 'е'));
  const authorOk = !!entry.author && fam.some(f => f && (f === entry.author.toLowerCase().replaceAll('ё', 'е') || f.startsWith(entry.author.toLowerCase().slice(0, 5))));
  const yearOk = !!cand.year && entry.years.includes(cand.year);
  return { cov, authorOk, yearOk, val: cov + (authorOk ? 0.25 : 0) + (yearOk ? 0.15 : 0) };
}
function fromCrossref(it) {
  return {
    title: strip((it.title || [])[0] || ''), doi: it.DOI || '', year: ((it.issued || it['published-print'] || it['published-online'] || {})['date-parts'] || [[null]])[0][0],
    authors: (it.author || []).map(a => a.family || a.name || ''), journal: strip((it['container-title'] || [])[0] || ''), source: 'Crossref',
    people: (it.author || []).map(a => ({ family: a.family || a.name || '', given: a.given || '' })),
    volume: it.volume || '', issue: it.issue || '', page: it.page || '', type: it.type || '', publisher: it.publisher || '',
  };
}
function fromOpenAlex(w) {
  return { title: w.title || w.display_name || '', doi: (w.doi || '').replace('https://doi.org/', ''), year: w.publication_year,
    authors: (w.authorships || []).map(a => ((a.author || {}).display_name || '').split(' ').pop()), journal: ((w.primary_location || {}).source || {}).display_name || '', source: 'OpenAlex' };
}
async function getJson(url, signal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (r.status === 404) return { notFound: true };
    if (r.status === 429) { if (/openalex/.test(url)) return { limited: true }; await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
    if (!r.ok) throw Error('HTTP ' + r.status);
    return r.json();
  }
  return { limited: true };
}
async function checkEntry(entry, { signal, openAlex = true } = {}) {
  const res = { status: '', note: '', match: null };
  if (entry.kind !== 'публикация' && !entry.doi) {
    res.status = 'вручную'; res.note = entry.kind === 'норматив' ? 'Нормативный документ — сверьте по «Консультант» или «Гарант».' : 'Ссылка на сайт — откройте и проверьте, что страница существует.';
    return res;
  }
  if (entry.doi) {
    const j = await getJson('https://api.crossref.org/works/' + encodeURIComponent(entry.doi), signal);
    if (j.notFound) {
      const oa = openAlex ? await getJson('https://api.openalex.org/works/doi:' + encodeURIComponent(entry.doi), signal).catch(() => ({})) : {};
      if (oa && oa.id) { res.match = fromOpenAlex(oa); }
      else { res.status = 'не существует'; res.note = 'DOI ' + entry.doi + ' не зарегистрирован — такой публикации по этому DOI нет.'; return res; }
    } else if (j.message) res.match = fromCrossref(j.message);
    if (res.match) {
      const s = score(entry, res.match);
      if (s.cov >= 0.6) { res.status = 'найден'; res.note = 'DOI верный' + (s.yearOk ? '' : ', год в ссылке не совпадает (' + res.match.year + ')') + '.'; }
      else { res.status = 'расхождение'; res.note = 'DOI существует, но ведёт на другую работу: «' + res.match.title + '» (' + (res.match.authors[0] || '') + ', ' + (res.match.year || '') + ').'; }
      return res;
    }
  }
  const q = entry.text.replace(/https?:\/\/\S+/g, '').slice(0, 300);
  let best = null, bestS = null, limited = false;
  const cr = await getJson('https://api.crossref.org/works?rows=5&select=DOI,title,author,issued,container-title,volume,issue,page,type,publisher&query.bibliographic=' + encodeURIComponent(q), signal);
  for (const it of ((cr.message || {}).items || [])) { const c = fromCrossref(it), s = score(entry, c); if (!bestS || s.val > bestS.val) { best = c; bestS = s; } }
  if ((!bestS || bestS.cov < 0.75) && openAlex) {
    const oa = await getJson('https://api.openalex.org/works?per-page=5&select=id,doi,title,display_name,publication_year,authorships,primary_location&search=' + encodeURIComponent(q.slice(0, 200)), signal).catch(() => ({}));
    if (oa.limited) limited = true;
    for (const w of (oa.results || [])) { const c = fromOpenAlex(w), s = score(entry, c); if (!bestS || s.val > bestS.val) { best = c; bestS = s; } }
  }
  res.match = best;
  if (bestS && bestS.cov >= 0.75 && (bestS.authorOk || bestS.yearOk)) {
    res.status = 'найден';
    const diff = [];
    if (!bestS.yearOk && best.year) diff.push('год в базе ' + best.year);
    if (!bestS.authorOk && best.authors[0]) diff.push('первый автор в базе ' + best.authors[0]);
    res.note = (diff.length ? 'Найдено, но ' + diff.join(', ') + '.' : 'Найдено в ' + best.source + '.') + (best.doi ? ' DOI: ' + best.doi : '');
  } else if (bestS && bestS.cov >= 0.6) {
    res.status = 'похоже'; res.note = 'Найдена похожая работа: «' + best.title + '» (' + (best.authors[0] || '') + ', ' + (best.year || '') + '). Сверьте вручную.';
  } else {
    res.status = 'не найден';
    res.note = 'Нет в Crossref' + (openAlex && !limited ? ' и OpenAlex' : '') + '. Источник может не существовать или просто не индексироваться (часто книги и российские журналы без DOI) — проверьте по ссылкам поиска.' + (limited ? ' Лимит OpenAlex на сегодня исчерпан.' : '');
  }
  return res;
}
const searchLinks = e => {
  const q = encodeURIComponent(e.text.slice(0, 200));
  return [['Google Академия', 'https://scholar.google.com/scholar?q=' + q], ['КиберЛенинка', 'https://cyberleninka.ru/search?q=' + q], ['eLIBRARY', 'https://www.elibrary.ru/querybox.asp']];
};

/* ---------- признаки ИИ-стиля (без «процента ИИ») ---------- */
const MARKERS_RU = ['важно отметить', 'стоит отметить', 'следует отметить', 'необходимо отметить', 'важно подчеркнуть', 'стоит подчеркнуть', 'в заключение', 'таким образом', 'кроме того', 'более того', 'в свою очередь', 'играет ключевую роль', 'играет важную роль', 'играют ключевую роль', 'в современном мире', 'в современных условиях', 'в целом', 'комплексный подход', 'является важным аспектом', 'ключевым аспектом', 'неотъемлемой частью', 'позволяет не только', 'не только', 'в контексте', 'данный подход', 'данное исследование', 'открывает новые возможности', 'широкий спектр', 'значительный вклад', 'актуальность темы', 'подводя итог', 'резюмируя', 'в рамках данной', 'рассмотрим подробнее', 'давайте рассмотрим', 'на сегодняшний день', 'учитывая вышеизложенное', 'нельзя не отметить', 'многогранн', 'всесторонн', 'инновационн', 'синерги', 'трансформаци'];
const MARKERS_EN = ['delve', 'it is important to note', 'it is worth noting', 'in conclusion', 'plays a crucial role', 'plays a pivotal role', 'a key role', 'in today\'s', 'landscape', 'tapestry', 'multifaceted', 'furthermore', 'moreover', 'additionally', 'notably', 'underscore', 'pivotal', 'intricate', 'nuanced', 'robust', 'leverage', 'seamless', 'holistic', 'paradigm', 'shed light', 'in the realm of', 'navigate the', 'not only', 'comprehensive', 'overall,'];
function aiSignals(paras) {
  const text = paras.join('\n');
  const sentences = text.replace(/\n+/g, ' ').split(/(?<=[.!?…])\s+(?=[\p{Lu}«"(])/u).map(s => s.trim()).filter(s => words(s).length >= 3);
  const W = words(text), n = W.length;
  if (n < 150) return { tooShort: true, words: n };
  const lens = sentences.map(s => words(s).length), mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length), cv = sd / mean;
  // разнообразие лексики: средняя доля уникальных слов в окнах по 100 слов
  let mattr = 0, win = 0; for (let i = 0; i + 100 <= n; i += 50) { mattr += new Set(W.slice(i, i + 100)).size / 100; win++; } mattr = win ? mattr / win : new Set(W).size / n;
  const low = text.toLowerCase().replaceAll('ё', 'е');
  const hits = [];
  for (const m of MARKERS_RU.concat(MARKERS_EN)) { const re = new RegExp('(^|[^\\p{L}])' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu'); const c = (low.match(re) || []).length; if (c) hits.push([m, c]); }
  hits.sort((a, b) => b[1] - a[1]);
  const markerRate = hits.reduce((s, h) => s + h[1], 0) / n * 1000;
  const starts = new Map(); for (const s of sentences) { const k = words(s).slice(0, 2).join(' '); if (k) starts.set(k, (starts.get(k) || 0) + 1); }
  const repeatStarts = [...starts].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const dashes = (text.match(/ — /g) || []).length / Math.max(1, sentences.length);
  const triads = (text.match(/[\p{L}-]+, [\p{L}-]+ и [\p{L}-]+|[\p{L}-]+, [\p{L}-]+,? and [\p{L}-]+/gu) || []).length / Math.max(1, sentences.length);
  const items = [
    { name: 'Шаблонные связки и «ИИ-слова»', value: markerRate.toFixed(1) + ' на 1000 слов', flag: markerRate > 6 ? 2 : markerRate > 3 ? 1 : 0, hint: 'Обороты вроде «важно отметить», «играет ключевую роль», «в заключение». В живых научных текстах их обычно меньше 3 на 1000 слов.' },
    { name: 'Однородность длины предложений', value: 'разброс ' + cv.toFixed(2) + ' (средняя длина ' + mean.toFixed(0) + ' слов)', flag: cv < 0.35 ? 2 : cv < 0.45 ? 1 : 0, hint: 'Генераторы часто пишут предложениями одинаковой длины. У человека разброс обычно выше 0,45.' },
    { name: 'Разнообразие слов', value: (mattr * 100).toFixed(0) + '% уникальных в окне 100 слов', flag: mattr < 0.62 ? 1 : 0, hint: 'Низкое разнообразие бывает и у ИИ, и у сухого технического текста.' },
    { name: 'Повторяющиеся начала предложений', value: repeatStarts.length ? repeatStarts.map(([k, c]) => '«' + k + '…» ×' + c).join(', ') : 'нет', flag: repeatStarts.length >= 3 ? 1 : 0, hint: 'Однотипные зачины («Кроме того…», «Таким образом…») — частая черта сгенерированного текста.' },
    { name: 'Перечисления по три', value: (triads * 100).toFixed(0) + ' на 100 предложений', flag: triads > 0.25 ? 1 : 0, hint: 'Привычка ИИ перечислять ровно три пункта: «A, B и C».' },
    { name: 'Тире между частями предложения', value: (dashes * 100).toFixed(0) + ' на 100 предложений', flag: dashes > 0.5 ? 1 : 0, hint: 'Сам по себе слабый признак: зависит от автора и редактуры.' },
  ];
  const total = items.reduce((s, i) => s + i.flag, 0);
  const level = total >= 5 ? 'высокий' : total >= 3 ? 'средний' : 'низкий';
  const marked = sentences.map(s => ({ s, m: hits.filter(([m]) => s.toLowerCase().replaceAll('ё', 'е').includes(m)).map(h => h[0]) })).filter(x => x.m.length >= 2).slice(0, 15);
  return { words: n, sentences: sentences.length, items, level, hits: hits.slice(0, 15), marked };
}

const api = { findReferences, splitEntries, parseEntry, citations, checkEntry, searchLinks, aiSignals, titleCoverage };
if (typeof module === 'object' && module.exports) module.exports = api; else root.PomRefs = api;
})(typeof window !== 'undefined' ? window : globalThis);
