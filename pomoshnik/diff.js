/* Сравнение версий: выравнивание абзацев (Myers), пословные правки, перемещения, экспорт в Word с исправлениями */
(function (root) {
'use strict';
const Zip = () => root.JSZip || require('jszip');

/* Myers O((N+M)D): операции '=' / '-' / '+' */
function myers(a, b) {
  const n = a.length, m = b.length, max = n + m, off = max + 1;
  let v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) return back(trace, a, b, d);
    }
  }
  return [];
}
function back(trace, a, b, D) {
  const ops = []; let x = a.length, y = b.length;
  for (let d = D; d > 0; d--) {
    const v = trace[d], get = k => v[k + d + 1];
    const k = x - y;
    const prevK = (k === -d || (k !== d && get(k - 1) < get(k + 1))) ? k + 1 : k - 1;
    const prevX = get(prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push(['=', --x, --y]); }
    if (x === prevX) ops.push(['+', null, --y]); else ops.push(['-', --x, null]);
  }
  while (x > 0 && y > 0) ops.push(['=', --x, --y]);
  return ops.reverse();
}
function diffSeq(a, b, key) {
  if (key) { const ka = a.map(key), kb = b.map(key); return diffSeq(ka, kb); }
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const mid = myers(a.slice(s, a.length - e), b.slice(s, b.length - e)).map(([o, i, j]) => [o, i == null ? null : i + s, j == null ? null : j + s]);
  const head = Array.from({ length: s }, (_, i) => ['=', i, i]);
  const tail = Array.from({ length: e }, (_, i) => ['=', a.length - e + i, b.length - e + i]);
  return head.concat(mid, tail);
}

const norm = s => s.replace(/\s+/g, ' ').trim();
const tokens = s => s.match(/\s+|[\p{L}\p{N}]+(?:[.,][\p{N}]+)*|[^\s\p{L}\p{N}]/gu) || [];
const words = s => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
function similarity(a, b) {
  const A = words(a), B = words(b);
  if (!A.length && !B.length) return 1;
  const m = new Map(); for (const w of A) m.set(w, (m.get(w) || 0) + 1);
  let common = 0; for (const w of B) { const c = m.get(w); if (c) { common++; m.set(w, c - 1); } }
  return 2 * common / (A.length + B.length);
}
function wordDiff(a, b, loose) {
  let A = tokens(a), B = tokens(b); const segs = [];
  if (loose) { const keep = t => /[\p{L}\p{N}]/u.test(t); A = A.filter(keep).flatMap((t, i) => i ? [' ', t] : [t]); B = B.filter(keep).flatMap((t, i) => i ? [' ', t] : [t]); }
  const push = (t, s) => { const last = segs[segs.length - 1]; if (last && last.t === t) last.s += s; else segs.push({ t, s }); };
  for (const [o, i, j] of diffSeq(A, B, loose ? t => t.toLowerCase().replaceAll('ё', 'е') : null)) push(o, o === '+' ? B[j] : (o === '=' ? B[j] : A[i]));
  // пробел между двумя правками — внутрь правки, чтобы читалось целыми фразами
  for (let i = 1; i < segs.length - 1; i++) if (segs[i].t === '=' && !segs[i].s.trim() && segs[i - 1].t !== '=' && segs[i + 1].t !== '=') {
    segs[i - 1].s += segs[i].s; segs[i].t = segs[i + 1].t; }
  const out = []; for (const s of segs) { const l = out[out.length - 1]; if (l && l.t === s.t) l.s += s.s; else out.push({ ...s }); }
  return out;
}

/* сравнение двух версий: список блоков в порядке новой версии */
function compare(oldP, newP, opts = {}) {
  const loose = !!opts.loose;
  const key = loose ? (p => words(p).join(' ')) : norm;
  const A = oldP.map(key), B = newP.map(key);
  const ops = diffSeq(A, B), blocks = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i][0] === '=') { blocks.push({ t: '=', text: newP[ops[i][2]], oi: ops[i][1], ni: ops[i][2] }); i++; continue; }
    const dels = [], ins = [];
    while (i < ops.length && ops[i][0] !== '=') { if (ops[i][0] === '-') dels.push(ops[i][1]); else ins.push(ops[i][2]); i++; }
    // пары «изменённый абзац» по сходству, с сохранением порядка
    const pairs = []; let from = 0;
    for (const d of dels) {
      let best = -1, bs = 0.45;
      for (let k = from; k < ins.length; k++) { const s = similarity(A[d], B[ins[k]]); if (s > bs) { bs = s; best = k; } }
      if (best >= 0) { pairs.push([d, ins[best]]); from = best + 1; }
    }
    const pairedD = new Set(pairs.map(p => p[0])), pairedI = new Map(pairs.map(p => [p[1], p[0]]));
    let pd = 0;
    const flushDel = upto => { while (pd < dels.length && (upto == null || dels[pd] < upto)) { const d = dels[pd++]; if (!pairedD.has(d)) blocks.push({ t: '-', text: oldP[d], oi: d }); } };
    for (const n of ins) {
      if (pairedI.has(n)) { const d = pairedI.get(n); flushDel(d); pd = Math.max(pd, dels.indexOf(d) + 1); blocks.push({ t: '~', oi: d, ni: n, old: oldP[d], text: newP[n], segs: wordDiff(oldP[d], newP[n], loose) }); }
      else { flushDel(null); blocks.push({ t: '+', text: newP[n], ni: n }); }
    }
    flushDel(null);
  }
  // перемещения: удалённый и добавленный абзацы с одинаковым текстом
  const delBy = new Map();
  for (const b of blocks) if (b.t === '-') { const k = key(b.text); if (k.length > 20) delBy.set(k, b); }
  for (const b of blocks) if (b.t === '+') { const d = delBy.get(key(b.text)); if (d) { b.t = '>'; d.t = '<'; delBy.delete(key(b.text)); } }
  // перемещённые и при этом изменённые абзацы
  const restD = blocks.filter(b => b.t === '-' && words(b.text).length >= 4);
  for (const b of blocks) {
    if (b.t !== '+' || words(b.text).length < 4) continue;
    let best = null, bs = 0.6;
    for (const d of restD) { if (d.t !== '-') continue; const sv = similarity(d.text, b.text); if (sv > bs) { bs = sv; best = d; } }
    if (best) { b.t = '>'; b.old = best.text; b.segs = wordDiff(best.text, b.text, loose); best.t = '<'; }
  }
  const st = { same: 0, added: 0, removed: 0, changed: 0, moved: 0, wordsAdded: 0, wordsRemoved: 0, wordsOld: 0, wordsNew: 0 };
  for (const p of oldP) st.wordsOld += words(p).length;
  for (const p of newP) st.wordsNew += words(p).length;
  for (const b of blocks) {
    if (b.t === '=') st.same++;
    else if (b.t === '+') { st.added++; st.wordsAdded += words(b.text).length; }
    else if (b.t === '-') { st.removed++; st.wordsRemoved += words(b.text).length; }
    else if (b.t === '>') { st.moved++; if (b.segs) for (const s of b.segs) { if (s.t === '+') st.wordsAdded += words(s.s).length; if (s.t === '-') st.wordsRemoved += words(s.s).length; } }
    else if (b.t === '~') { st.changed++; for (const s of b.segs) { if (s.t === '+') st.wordsAdded += words(s.s).length; if (s.t === '-') st.wordsRemoved += words(s.s).length; } }
  }
  st.percent = Math.round(100 * (st.wordsAdded + st.wordsRemoved) / Math.max(1, st.wordsOld + st.wordsNew) * 10) / 10;
  return { blocks, stats: st };
}

/* ---------- Word с исправлениями ---------- */
const esc = v => String(v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
async function redlineDocx(result, { author = 'Сравнение версий', title = '' } = {}) {
  const date = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let id = 1;
  const rt = s => `<w:r><w:t xml:space="preserve">${esc(s)}</w:t></w:r>`;
  const ins = s => `<w:ins w:id="${id++}" w:author="${esc(author)}" w:date="${date}"><w:r><w:t xml:space="preserve">${esc(s)}</w:t></w:r></w:ins>`;
  const del = s => `<w:del w:id="${id++}" w:author="${esc(author)}" w:date="${date}"><w:r><w:delText xml:space="preserve">${esc(s)}</w:delText></w:r></w:del>`;
  const mark = t => `<w:pPr><w:rPr><w:${t} w:id="${id++}" w:author="${esc(author)}" w:date="${date}"/></w:rPr></w:pPr>`;
  const body = [];
  if (title) body.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${rt(title)}</w:p>`);
  for (const b of result.blocks) {
    if (b.t === '=') body.push(`<w:p>${rt(b.text)}</w:p>`);
    else if (b.t === '+' || b.t === '>') body.push(`<w:p>${mark('ins')}${ins(b.text)}</w:p>`);
    else if (b.t === '-' || b.t === '<') body.push(`<w:p>${mark('del')}${del(b.text)}</w:p>`);
    else body.push(`<w:p>${b.segs.map(s => s.t === '=' ? rt(s.s) : s.t === '+' ? ins(s.s) : del(s.s)).join('')}</w:p>`);
  }
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>';
  const settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:trackRevisions/></w:settings>';
  const z = new (Zip())();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>');
  z.file('word/styles.xml', styles); z.file('word/settings.xml', settings); z.file('word/document.xml', doc);
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/* простой Word: [{h}|{p}|{table:[[...],...]}] */
async function simpleDocx(blocks) {
  const run = (t, b) => `<w:r>${b ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const cell = (t, b, w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${b ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EEF7"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="left"/></w:pPr>${String(t ?? '').split('\n').map((x, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(x, b)).join('')}</w:p></w:tc>`;
  const xml = blocks.map(b => {
    if (b.h) return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${esc(b.h)}</w:t></w:r></w:p>`;
    if (b.p != null) return `<w:p><w:pPr><w:jc w:val="left"/></w:pPr>${run(b.p)}</w:p>`;
    const cols = b.table[0].length, total = 9600, ws = b.widths || Array(cols).fill(Math.floor(total / cols));
    const brd = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(x => `<w:${x} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`).join('') + '</w:tblBorders>';
    return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${brd}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${ws.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
      b.table.map((r, i) => `<w:tr>${i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${r.map((c, j) => cell(c, i === 0, ws[j])).join('')}</w:tr>`).join('') + '</w:tbl><w:p/>';
  }).join('');
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + xml +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const z = new (Zip())();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  z.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
  z.file('word/document.xml', doc);
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

const api = { compare, wordDiff, diffSeq, similarity, redlineDocx, simpleDocx, words };
if (typeof module === 'object' && module.exports) module.exports = api; else root.PomDiff = api;
})(typeof window !== 'undefined' ? window : globalThis);
