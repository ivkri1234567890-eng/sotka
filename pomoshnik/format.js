/* Оформление научных работ по стандартам: правка исходного .docx на месте (таблицы, рисунки, формулы сохраняются) */
(function (root) {
'use strict';
const Zip = () => root.JSZip || require('jszip');
const esc = v => String(v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const unxml = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e.toLowerCase()]);
const mm = v => Math.round(v * 56.6929);          // мм → twips
const cm = v => Math.round(v * 566.929);

/* ---------- стандарты ---------- */
const BASE = { font: 'Times New Roman', size: 14, spacing: 1.5, left: 30, right: 15, top: 20, bottom: 20, indent: 1.25, align: 'both',
  pageNum: 'bottom-center', noFirstNum: true, upperStructural: true, structuralCenter: true, sectionIndent: true, newPage: true,
  captions: 'gost', refStyle: 'gost100', tableSize: 12, dropEmpty: true, hanging: false };
const PRESETS = {
  gost732: { name: 'ГОСТ 7.32-2017 — ВКР, курсовые, отчёты (основа требований вузов по ФГОС)', ...BASE,
    note: 'Поля 30/15/20/20 мм, кегль не меньше 12 (вузы обычно требуют 14), интервал 1,5, абзац 1,25 см, номер внизу по центру. Выравнивание по ширине стандарт не задаёт — его требуют методички вузов.' },
  diss: { name: 'Диссертация — ГОСТ Р 7.0.11-2011', ...BASE, left: 25, right: 10, pageNum: 'top-center', upperStructural: true, sectionIndent: false,
    note: 'Поля 25/10/20/20 мм, кегль 12–14, интервал 1,5, абзац «пять знаков» (≈1,25 см), номер посередине верхнего поля, главы с новой страницы, заголовки по центру.' },
  vak: { name: 'Статья в журнал — типовые требования ВАК', ...BASE, left: 20, right: 20, top: 20, bottom: 20, pageNum: 'none', noFirstNum: false, newPage: false,
    upperStructural: false, refStyle: 'gost5', note: 'Типовой набор: поля 20 мм, кегль 14, интервал 1,5, абзац 1,25 см, список по ГОСТ Р 7.0.5-2008. У каждого журнала свои требования — загрузите их, чтобы уточнить.' },
  apa: { name: 'APA 7 — международные журналы', ...BASE, size: 12, spacing: 2, left: 25.4, right: 25.4, top: 25.4, bottom: 25.4, indent: 1.27, align: 'left',
    pageNum: 'top-right', noFirstNum: false, upperStructural: false, sectionIndent: false, newPage: false, captions: 'apa', refStyle: 'apa', tableSize: 12, hanging: true,
    note: 'Times New Roman 12, двойной интервал, поля 2,54 см, абзац 1,27 см, выравнивание по левому краю, номер вверху справа, список APA с выступом 1,27 см.' },
};

/* ---------- чтение требований из загруженного стандарта ---------- */
function num(s) { return parseFloat(String(s).replace(',', '.')); }
function parseRequirements(text) {
  const t = text.replace(/\s+/g, ' ').replaceAll('ё', 'е'), found = {}, why = {};
  const take = (k, v, m) => { if (found[k] === undefined && v !== undefined && !Number.isNaN(v)) { found[k] = v; why[k] = m.trim().slice(0, 120); } };
  const fm = /(times new roman|arial|calibri|cambria|georgia|pt serif|pt astra serif|liberation serif|verdana)/iu.exec(t);
  if (fm) take('font', fm[1].replace(/\b\p{L}/g, c => c.toUpperCase()).replace('Pt ', 'PT '), fm[0]);
  let m = /(?:кегл[ьяе]м?|размер(?:ом)?\s+шрифта|шрифт(?:ом)?[^.;]{0,40}?)\s*(?:[-–—:]\s*|не менее\s*)?(\d{1,2})(?:[,.]5)?\s*(?:пт|pt|п\.|пунктов|кегль)?(?![\d,.]*\s*(?:мм|см|%))/iu.exec(t) || /(\d{1,2})\s*(?:-?\s*(?:пт|pt|point|кегль))/iu.exec(t);
  if (m) take('size', num(m[1]), m[0]);
  m = /(?:межстрочн\p{L}*\s+)?интервал\p{L}*\s*(?:[-–—:]\s*)?(одинарн\p{L}*|полуторн\p{L}*|двойн\p{L}*|1[,.]5|1[,.]15|1[,.]0|1|2)(?![\d,.])/iu.exec(t)
    || /(одинарн\p{L}*|полуторн\p{L}*|двойн\p{L}*)\s+(?:межстрочн\p{L}*\s+)?интервал/iu.exec(t)
    || /через\s+(полтора|1[,.]5|один|два)\s+интервал/iu.exec(t)
    || /(?:line spacing|spacing)\s*(?:[-–—:]\s*)?(single|double|1[,.]5|1|2)\b|(double|single)[- ]spaced/iu.exec(t);
  if (m) { const v = (m[1] || m[2] || '').toLowerCase(); take('spacing', /одинар|single|^один|^1(?:[,.]0)?$/.test(v) ? 1 : /полтор|полутор|1[,.]5/.test(v) ? 1.5 : /двой|double|^два|^2$/.test(v) ? 2 : num(v), m[0]); }
  const side = (re, k) => { const r = new RegExp(re + '[^.;\\d]{0,25}?(\\d+(?:[,.]\\d+)?)\\s*(мм|см|mm|cm|inch|in|")', 'iu').exec(t); if (r) take(k, /см|cm/i.test(r[2]) ? num(r[1]) * 10 : /in|"/i.test(r[2]) ? num(r[1]) * 25.4 : num(r[1]), r[0]); };
  side('(?:лев\\p{L}*|left)', 'left'); side('(?:прав\\p{L}*|right)', 'right'); side('(?:верхн\\p{L}*|top)', 'top'); side('(?:нижн\\p{L}*|bottom)', 'bottom');
  const both = /верхн\p{L}* и нижн\p{L}*[^.;\d]{0,20}?(\d+(?:[,.]\d+)?)\s*(мм|см)/iu.exec(t);
  if (both) { const v = /см/i.test(both[2]) ? num(both[1]) * 10 : num(both[1]); take('top', v, both[0]); take('bottom', v, both[0]); }
  const all = /(?:все поля|поля[^.;]{0,15}?(?:со всех сторон|по))\s*[-–—:]?\s*(\d+(?:[,.]\d+)?)\s*(мм|см)|(\d+(?:[,.]\d+)?)\s*(мм|см)\s*со всех сторон|(1|one)[- ]inch margins/iu.exec(t);
  if (all) { const v = all[5] ? 25.4 : (/см/i.test(all[2] || all[4]) ? num(all[1] || all[3]) * 10 : num(all[1] || all[3])); for (const k of ['left', 'right', 'top', 'bottom']) take(k, v, all[0]); }
  m = /(?:абзацн\p{L}*\s+отступ\p{L}*|красн\p{L}*\s+строк\p{L}*|отступ\p{L}*\s+перв\p{L}*\s+строк\p{L}*|first[- ]line indent|indent)[^.;\d]{0,20}?(\d+(?:[,.]\d+)?)\s*(см|мм|cm|mm|inch|in)/iu.exec(t);
  if (m) take('indent', /мм|mm/i.test(m[2]) ? num(m[1]) / 10 : /in/i.test(m[2]) ? num(m[1]) * 2.54 : num(m[1]), m[0]);
  m = /(по ширине|justif\p{L}*|по левому краю|flush left|left[- ]aligned)/iu.exec(t);
  if (m) take('align', /ширин|justif/i.test(m[1]) ? 'both' : 'left', m[0]);
  m = /(?:номер\p{L}*\s+страниц\p{L}*|нумерац\p{L}*\s+страниц\p{L}*|страниц\p{L}*\s+нумеру\p{L}*|нумеру\p{L}*\s+страниц\p{L}*|page numbers?)[^.]{0,90}?(внизу|снизу|нижн\p{L}*|вверху|сверху|верхн\p{L}*|top|bottom)/iu.exec(t);
  if (m) { const tail = t.slice(m.index + m[0].length, m.index + m[0].length + 60); const r = /(справа|прав\p{L}*|right)/iu.test(tail) && !/(по центру|посередине|в центре|center|centre)/iu.test(tail.split(/(справа|прав|right)/iu)[0]) ? 'right' : 'center';
    take('pageNum', (/вниз|сниз|нижн|bottom/iu.test(m[1]) ? 'bottom' : 'top') + '-' + r, m[0] + tail.split(/[.;]/)[0]); }
  m = /(гост р 7\.0\.100|гост р 7\.0\.5|гост 7\.1|\bapa\b|vancouver|ванкувер)/iu.exec(t);
  if (m) take('refStyle', /7\.0\.100|7\.1/i.test(m[1]) ? 'gost100' : /7\.0\.5/i.test(m[1]) ? 'gost5' : /apa/i.test(m[1]) ? 'apa' : 'vancouver', m[0]);
  return { found, why };
}

/* ---------- разбор XML ---------- */
function children(xml) {                     // дочерние элементы верхнего уровня внутри фрагмента
  const out = []; let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i); if (lt < 0) break;
    const m = /^<([\w:]+)\b[^>]*?(\/?)>/.exec(xml.slice(lt)); if (!m) break;
    const tag = m[1];
    if (m[2]) { out.push({ tag, xml: m[0] }); i = lt + m[0].length; continue; }
    const re = new RegExp('<(/?)' + tag.replace(':', '\\:') + '\\b[^>]*?(/?)>', 'g'); re.lastIndex = lt; let d = 0, mm2, end = xml.length;
    while ((mm2 = re.exec(xml))) { if (mm2[2]) continue; d += mm2[1] ? -1 : 1; if (d === 0) { end = mm2.index + mm2[0].length; break; } }
    out.push({ tag, xml: xml.slice(lt, end) }); i = end;
  }
  return out;
}
const PPR = ['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl', 'w:numPr', 'w:suppressLineNumbers', 'w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd', 'w:snapToGrid', 'w:spacing', 'w:ind', 'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap', 'w:jc', 'w:textDirection', 'w:textAlignment', 'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr', 'w:pPrChange'];
const RPR = ['w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps', 'w:strike', 'w:dstrike', 'w:outline', 'w:shadow', 'w:emboss', 'w:imprint', 'w:noProof', 'w:snapToGrid', 'w:vanish', 'w:webHidden', 'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position', 'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath', 'w:rPrChange'];
const SECT = ['w:headerReference', 'w:footerReference', 'w:footnotePr', 'w:endnotePr', 'w:type', 'w:pgSz', 'w:pgMar', 'w:paperSrc', 'w:pgBorders', 'w:lnNumType', 'w:pgNumType', 'w:cols', 'w:formProt', 'w:vAlign', 'w:noEndnote', 'w:titlePg', 'w:textDirection', 'w:bidi', 'w:rtlGutter', 'w:docGrid', 'w:printerSettings', 'w:sectPrChange'];
function ordered(list, order) {
  const idx = t => { const i = order.indexOf(t); return i < 0 ? order.length - 1.5 : i; };
  return list.map((c, i) => [c, i]).sort((a, b) => idx(a[0].tag) - idx(b[0].tag) || a[1] - b[1]).map(x => x[0].xml).join('');
}
function setProps(container, tagName, order, remove, add) {   // container: '<w:pPr>…</w:pPr>' или ''
  const inner = container ? container.replace(new RegExp('^<' + tagName + '\\b[^>]*>'), '').replace(new RegExp('</' + tagName + '>$'), '') : '';
  const kids = children(inner).filter(c => !remove.includes(c.tag));
  const tags = new Set(add.map(a => a.tag));
  const list = kids.filter(c => !tags.has(c.tag)).concat(add);
  const body = ordered(list, order);
  return body ? `<${tagName}>${body}</${tagName}>` : '';
}

/* ---------- классификация абзацев ---------- */
const STRUCT = /^(введение|заключение|содержание|оглавление|реферат|аннотация|abstract|introduction|conclusions?|выводы|список\s+(?:использованн\w+\s+)?(?:литературы|источников)(?:\s+и\s+литературы)?|библиографический список|литература|references|bibliography|приложени[ея](?:\s+[а-яa-z0-9]+)?|термины и определения|определения|обозначения и сокращения|перечень сокращений(?:\s+и\s+обозначений)?|список сокращений|сокращения|благодарности|acknowledg(?:e)?ments?)\.?$/i;
const REFHEAD = /^(список\s+(?:использованн\w+\s+)?(?:литературы|источников)(?:\s+и\s+литературы)?|библиографический список|литература|references|bibliography)\.?$/i;
const FIG = /^(рис(?:унок|\.)?|figure|fig\.)\s*(\d+(?:\.\d+)?)\s*[.:–—-]?\s*(.*)$/i;
const TAB = /^(табл(?:ица|\.)?|table)\s*(\d+(?:\.\d+)?)\s*[.:–—-]?\s*(.*)$/i;
function classify(text, styleId, inTable, state) {
  const t = text.trim();
  if (inTable) return 'table';
  if (!t) return 'empty';
  if (STRUCT.test(t) && t.length < 80) { state.inRefs = REFHEAD.test(t); return 'struct'; }
  const hs = /^(?:heading|заголовок|title)?\s*([1-4])$/i.exec(styleId || '') || /heading\s*([1-4])|заголовок\s*([1-4])/i.exec(styleId || '');
  if (hs) { state.inRefs = false; return 'h' + (hs[1] || hs[2]); }
  if (state.inRefs) return 'ref';
  const sepAfterNum = /^\S+\s*\d+(?:\.\d+)?\s*[.:–—-]/.test(t);
  if (FIG.test(t) && (sepAfterNum || t.length < 120) && t.length < 300) return 'fig';
  if (TAB.test(t) && (sepAfterNum || t.length < 120) && t.length < 300) return 'tab';
  const nm = /^(\d{1,2})((?:\.\d{1,2}){0,3})\.?\s+(\S.*)$/.exec(t);
  if (nm && t.length < 150 && !/[.;:,]$/.test(t) && /^[\p{Lu}«"]/u.test(nm[3])) return 'h' + Math.min(3, 1 + (nm[2].match(/\./g) || []).length);
  return 'body';
}

/* ---------- библиография ---------- */
const isCyr = s => /[а-яё]/i.test(s || '');
const initials = (given, dots = true) => String(given || '').split(/\s+/).filter(Boolean).map(g => g.split('-').map(p => p[0] ? p[0].toUpperCase() + (dots ? '.' : '') : '').join('-')).join(dots ? ' ' : '');
const pages = p => String(p || '').replace(/-/g, '–');
function formatRef(m, style) {
  const ru = isCyr(m.title + m.journal), P = (m.people || []).filter(p => p.family);
  const title = (m.title || '').replace(/\s+/g, ' ').replace(/\.$/, '');
  const fam = p => p.family.replace(/\b\w/g, c => c) ;
  if (style === 'gost100') {
    const io = p => initials(p.given) + ' ' + fam(p);
    const head = P.length && P.length <= 3 ? fam(P[0]) + ', ' + initials(P[0].given) + ' ' : '';
    const resp = P.length ? ' / ' + (P.length <= 3 ? P.map(io).join(', ') : P.slice(0, 3).map(io).join(', ') + (ru ? ' [и др.]' : ' [et al.]')) : '';
    const vol = [m.volume ? (ru ? 'Т. ' : 'Vol. ') + m.volume : '', m.issue ? (ru ? '№ ' : 'No. ') + m.issue : ''].filter(Boolean).join(', ');
    const parts = [m.year, vol, m.page ? (ru ? 'С. ' : 'P. ') + pages(m.page) : '', m.doi ? 'DOI ' + m.doi : ''].filter(Boolean);
    return [{ t: head + title + resp + (m.journal ? ' // ' + m.journal : '') + (parts.length ? '. – ' + parts.join('. – ') : '') + '.' }];
  }
  if (style === 'gost5') {
    const au = P.slice(0, 3).map(p => fam(p) + ' ' + initials(p.given)).join(', ') + (P.length > 3 ? (ru ? ' и др.' : ' et al.') : '');
    const vol = [m.volume ? (ru ? 'Т. ' : 'Vol. ') + m.volume : '', m.issue ? (ru ? '№ ' : 'No. ') + m.issue : ''].filter(Boolean).join(', ');
    return [{ t: (au ? au + ' ' : '') + title + (m.journal ? ' // ' + m.journal : '') + '. ' + [m.year, vol, m.page ? (ru ? 'С. ' : 'P. ') + pages(m.page) : ''].filter(Boolean).join('. ') + '.' + (m.doi ? ' DOI: ' + m.doi : '') }];
  }
  if (style === 'apa') {
    const names = P.slice(0, 20).map(p => fam(p) + ', ' + initials(p.given));
    const au = names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1];
    const segs = [{ t: (au ? au + ' ' : '') + '(' + (m.year || 'n.d.') + '). ' + title + '. ' }];
    if (m.journal) { segs.push({ t: m.journal, i: true }); if (m.volume) { segs.push({ t: ', ' }); segs.push({ t: String(m.volume), i: true }); } segs.push({ t: (m.issue ? '(' + m.issue + ')' : '') + (m.page ? ', ' + pages(m.page) : '') + '.' }); }
    if (m.doi) segs.push({ t: ' https://doi.org/' + m.doi });
    return segs;
  }
  if (style === 'vancouver') {
    const au = P.slice(0, 6).map(p => fam(p) + ' ' + initials(p.given, false)).join(', ') + (P.length > 6 ? ', et al' : '');
    return [{ t: (au ? au + '. ' : '') + title + '. ' + (m.journal ? m.journal + '. ' : '') + (m.year || '') + (m.volume ? ';' + m.volume : '') + (m.issue ? '(' + m.issue + ')' : '') + (m.page ? ':' + String(m.page).replace(/–/g, '-') : '') + '.' + (m.doi ? ' doi:' + m.doi : '') }];
  }
  return null;
}

/* ---------- основное ---------- */
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
function textOf(p) { let t = ''; for (const m of p.replace(/<w:del\b[\s\S]*?<\/w:del>/g, '').matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)) t += m[1] != null ? unxml(m[1]) : '\t'; return t; }
function runXml(text, s, o = {}) {
  const rp = `<w:rPr><w:rFonts w:ascii="${esc(s.font)}" w:hAnsi="${esc(s.font)}" w:cs="${esc(s.font)}" w:eastAsia="${esc(s.font)}"/>${o.b ? '<w:b/><w:bCs/>' : ''}${o.i ? '<w:i/><w:iCs/>' : ''}<w:color w:val="000000"/><w:sz w:val="${o.size * 2}"/><w:szCs w:val="${o.size * 2}"/></w:rPr>`;
  return `<w:r>${rp}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
function textToDocx(paras) {
  const body = paras.map(p => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join('') + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
  const z = new (Zip())();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>`);
  return z.generateAsync({ type: 'uint8array' });
}

/* refLookup(text) → Promise<metadata|null> (Crossref) */
async function formatDocx(bytes, s, { refLookup, onProgress } = {}) {
  const z = await (Zip()).loadAsync(bytes);
  if (!z.file('word/document.xml')) throw Error('Файл не похож на документ Word.');
  let xml = await z.file('word/document.xml').async('string');
  const report = { body: 0, headings: 0, struct: 0, figs: 0, tabs: 0, tables: 0, refs: 0, refsDone: 0, refsLeft: [], emptyRemoved: 0, notes: [] };
  // позиции таблиц
  const tblSpans = []; { const re = /<(\/?)w:tbl\b[^>]*>/g; const st = []; let m; while ((m = re.exec(xml))) { if (m[1]) { const s0 = st.pop(); if (s0 != null && !st.length) tblSpans.push([s0, m.index]); } else st.push(m.index); } }
  const inTbl = pos => tblSpans.some(([a, b]) => pos > a && pos < b);
  const paras = []; { const re = /<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g; let m; while ((m = re.exec(xml))) paras.push({ start: m.index, end: m.index + m[0].length, xml: m[0] }); }
  const state = { inRefs: false };
  const items = paras.map(p => {
    const pPr = (/^<w:p\b[^>]*>(<w:pPr>[\s\S]*?<\/w:pPr>)/.exec(p.xml) || [])[1] || '';
    const styleId = (/<w:pStyle w:val="([^"]+)"/.exec(pPr) || [])[1] || '';
    const text = textOf(p.xml), hasObj = /<w:drawing|<w:pict|<m:oMath|<w:object/.test(p.xml);
    const kind = hasObj && !text.trim() ? 'object' : classify(text, styleId, inTbl(p.start), state);
    return { ...p, pPr, styleId, text, kind, hasObj, numbered: /<w:numPr>/.test(pPr) || /list|списо?к|маркир|bullet|number/i.test(styleId), sect: /<w:sectPr\b/.test(pPr) };
  });
  // переоформление списка литературы
  const refItems = items.filter(i => i.kind === 'ref' && i.text.trim().length > 15);
  report.refs = refItems.length;
  if (s.refStyle !== 'keep' && refLookup) {
    let done = 0;
    for (const it of refItems) {
      const numM = /^\s*(\[?\d{1,3}[.)\]]\s*)/.exec(it.text);
      let meta = null; try { meta = await refLookup(numM ? it.text.slice(numM[0].length) : it.text); } catch (e) { meta = null; }
      const segs = meta ? formatRef(meta, s.refStyle) : null;
      if (segs) { it.refSegs = segs; it.refPrefix = numM && !it.numbered ? numM[1].replace(/\s+$/, '') + ' ' : ''; report.refsDone++; }
      else report.refsLeft.push(it.text.slice(0, 90));
      if (onProgress) onProgress(++done, refItems.length);
    }
  }
  // сборка
  const line = Math.round(240 * s.spacing);
  let out = '', last = 0, prevEmpty = false;
  for (const it of items) {
    out += xml.slice(last, it.start); last = it.end;
    if (it.kind === 'empty' && s.dropEmpty && prevEmpty && !it.sect && !/<w:br w:type="page"/.test(it.xml)) { report.emptyRemoved++; continue; }
    prevEmpty = it.kind === 'empty';
    let size = s.size, jc = s.align, ind = '', spacing = `<w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="auto"/>`, bold = null, upper = false, extra = [], rebuild = null;
    const firstLine = `<w:ind w:left="0" w:right="0" w:firstLine="${cm(s.indent)}"/>`, noInd = '<w:ind w:left="0" w:right="0" w:firstLine="0"/>';
    switch (it.kind) {
      case 'table': size = s.tableSize; spacing = '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'; ind = noInd; jc = null; report.tables++; break;
      case 'object': jc = 'center'; ind = noInd; spacing = `<w:spacing w:before="120" w:after="0" w:line="240" w:lineRule="auto"/>`; extra.push({ tag: 'w:keepNext', xml: '<w:keepNext/>' }); break;
      case 'struct': report.struct++; bold = true; upper = s.upperStructural; jc = s.structuralCenter ? 'center' : s.align === 'both' ? 'left' : s.align; ind = noInd;
        spacing = `<w:spacing w:before="240" w:after="240" w:line="${line}" w:lineRule="auto"/>`; extra.push({ tag: 'w:keepNext', xml: '<w:keepNext/>' });
        if (s.newPage && !/^(аннотация|abstract|реферат)/i.test(it.text.trim())) extra.push({ tag: 'w:pageBreakBefore', xml: '<w:pageBreakBefore/>' });
        extra.push({ tag: 'w:outlineLvl', xml: '<w:outlineLvl w:val="0"/>' }); break;
      case 'h1': case 'h2': case 'h3': case 'h4': { report.headings++; bold = true; const lv = +it.kind[1];
        jc = s.sectionIndent ? 'left' : (lv === 1 ? 'center' : 'left'); ind = s.sectionIndent ? firstLine : noInd;
        spacing = `<w:spacing w:before="${lv === 1 ? 240 : 180}" w:after="${lv === 1 ? 240 : 120}" w:line="${line}" w:lineRule="auto"/>`;
        extra.push({ tag: 'w:keepNext', xml: '<w:keepNext/>' }, { tag: 'w:outlineLvl', xml: `<w:outlineLvl w:val="${lv - 1}"/>` });
        if (lv === 1 && s.newPage) extra.push({ tag: 'w:pageBreakBefore', xml: '<w:pageBreakBefore/>' });
        break; }
      case 'fig': { report.figs++; const m = FIG.exec(it.text.trim()); jc = 'center'; ind = noInd;
        if (s.captions !== 'keep') rebuild = [{ t: (s.captions === 'apa' && !isCyr(it.text) ? 'Figure ' + m[2] + (m[3] ? '. ' + m[3].replace(/\.$/, '') : '') : s.captions === 'apa' ? 'Рисунок ' + m[2] + (m[3] ? '. ' + m[3].replace(/\.$/, '') : '') : 'Рисунок ' + m[2] + (m[3] ? ' — ' + m[3].replace(/\.$/, '') : '')) }];
        spacing = `<w:spacing w:before="0" w:after="240" w:line="${line}" w:lineRule="auto"/>`; break; }
      case 'tab': { report.tabs++; const m = TAB.exec(it.text.trim()); jc = s.captions === 'apa' ? 'left' : 'left'; ind = noInd;
        if (s.captions !== 'keep') rebuild = [{ t: (s.captions === 'apa' && !isCyr(it.text) ? 'Table ' + m[2] + (m[3] ? '. ' + m[3].replace(/\.$/, '') : '') : s.captions === 'apa' ? 'Таблица ' + m[2] + (m[3] ? '. ' + m[3].replace(/\.$/, '') : '') : 'Таблица ' + m[2] + (m[3] ? ' — ' + m[3].replace(/\.$/, '') : '')) }];
        extra.push({ tag: 'w:keepNext', xml: '<w:keepNext/>' }); spacing = `<w:spacing w:before="240" w:after="0" w:line="${line}" w:lineRule="auto"/>`; break; }
      case 'ref': ind = s.hanging ? `<w:ind w:left="${cm(1.27)}" w:right="0" w:hanging="${cm(1.27)}"/>` : firstLine; jc = s.hanging ? 'left' : s.align;
        if (it.refSegs) rebuild = it.refPrefix ? [{ t: it.refPrefix }].concat(it.refSegs) : it.refSegs; break;
      case 'empty': ind = noInd; break;
      default: report.body++; ind = firstLine;
    }
    if (it.numbered && it.kind !== 'struct' && !/^h\d/.test(it.kind)) ind = '';          // отступы списков задаёт нумерация
    const remove = ['w:spacing', 'w:ind', 'w:jc', 'w:rPr', 'w:keepNext', 'w:pageBreakBefore', 'w:outlineLvl', 'w:contextualSpacing'];
    const add = [{ tag: 'w:spacing', xml: spacing }].concat(ind ? [{ tag: 'w:ind', xml: ind }] : [], jc ? [{ tag: 'w:jc', xml: `<w:jc w:val="${jc}"/>` }] : [], extra);
    if (/^h\d|struct/.test(it.kind)) add.push({ tag: 'w:keepLines', xml: '<w:keepLines/>' });
    const pPr = setProps(it.pPr, 'w:pPr', PPR, remove, add);
    const selfClosed = /^<w:p\b[^>]*\/>$/.test(it.xml);
    const open = selfClosed ? it.xml.replace(/\s*\/>$/, '>') : /^<w:p\b[^>]*>/.exec(it.xml)[0];
    let inner = selfClosed ? '' : it.xml.slice(open.length, it.xml.length - 6);
    if (it.pPr) inner = inner.slice(it.pPr.length);
    if (rebuild && !it.hasObj) {
      const keep = (inner.match(/<w:(?:bookmarkStart|bookmarkEnd)\b[^>]*\/>/g) || []).join('');
      inner = keep + rebuild.map(sg => runXml(sg.t, s, { size, i: sg.i, b: bold })).join('');
    } else {
      inner = inner.replace(/<w:r(?:\s[^>]*)?>(?:(<w:rPr>[\s\S]*?<\/w:rPr>))?/g, (m0, rp) => {
        const open2 = /^<w:r(?:\s[^>]*)?>/.exec(m0)[0];
        const addR = [{ tag: 'w:rFonts', xml: `<w:rFonts w:ascii="${esc(s.font)}" w:hAnsi="${esc(s.font)}" w:cs="${esc(s.font)}" w:eastAsia="${esc(s.font)}"/>` },
          { tag: 'w:color', xml: '<w:color w:val="000000"/>' }, { tag: 'w:sz', xml: `<w:sz w:val="${size * 2}"/>` }, { tag: 'w:szCs', xml: `<w:szCs w:val="${size * 2}"/>` }];
        if (bold) addR.push({ tag: 'w:b', xml: '<w:b/>' }, { tag: 'w:bCs', xml: '<w:bCs/>' });
        if (/^h\d|struct|fig|tab/.test(it.kind) && !bold) addR.push({ tag: 'w:b', xml: '<w:b w:val="0"/>' });
        if (/^h\d|struct/.test(it.kind)) addR.push({ tag: 'w:u', xml: '<w:u w:val="none"/>' });
        return open2 + setProps(rp || '', 'w:rPr', RPR, ['w:rFonts', 'w:sz', 'w:szCs', 'w:color', 'w:kern', 'w:w', 'w:spacing', 'w:highlight'].concat(bold ? ['w:b', 'w:bCs'] : []), addR);
      });
      if (upper) inner = inner.replace(/(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, (m0, a, t, b) => a + esc(unxml(t).toUpperCase()) + b);
      if (/^h\d|struct/.test(it.kind)) inner = inner.replace(/(<w:t(?:\s[^>]*)?>)([^<]*?)\.(<\/w:t>)(?![\s\S]*<w:t\b)/, '$1$2$3');   // без точки в конце заголовка
    }
    out += open + pPr + inner + '</w:p>';
  }
  out += xml.slice(last);
  xml = out;
  // страницы, поля, номера
  const rels = await z.file('word/_rels/document.xml.rels').async('string');
  const ct = await z.file('[Content_Types].xml').async('string');
  let relsOut = rels, ctOut = ct;
  const refsXml = [];
  if (s.pageNum !== 'none') {
    const [where, pos] = s.pageNum.split('-');
    const part = where === 'top' ? 'header' : 'footer';
    const fld = `<w:p><w:pPr><w:jc w:val="${pos === 'right' ? 'right' : 'center'}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${esc(s.font)}" w:hAnsi="${esc(s.font)}" w:cs="${esc(s.font)}"/><w:sz w:val="${s.size * 2}"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:rFonts w:ascii="${esc(s.font)}" w:hAnsi="${esc(s.font)}" w:cs="${esc(s.font)}"/><w:sz w:val="${s.size * 2}"/></w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const tagN = part === 'header' ? 'w:hdr' : 'w:ftr';
    z.file(`word/pom_${part}1.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${tagN} ${NS}>${fld}</${tagN}>`);
    z.file(`word/pom_${part}0.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${tagN} ${NS}><w:p/></${tagN}>`);
    relsOut = relsOut.replace('</Relationships>', `<Relationship Id="rIdPom1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${part}" Target="pom_${part}1.xml"/><Relationship Id="rIdPom0" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${part}" Target="pom_${part}0.xml"/></Relationships>`);
    const ctype = `application/vnd.openxmlformats-officedocument.wordprocessingml.${part}+xml`;
    ctOut = ctOut.replace('</Types>', `<Override PartName="/word/pom_${part}1.xml" ContentType="${ctype}"/><Override PartName="/word/pom_${part}0.xml" ContentType="${ctype}"/></Types>`);
    refsXml.push({ tag: `w:${part}Reference`, xml: `<w:${part}Reference w:type="default" r:id="rIdPom1"/>` });
    if (s.noFirstNum) refsXml.push({ tag: `w:${part}Reference`, xml: `<w:${part}Reference w:type="first" r:id="rIdPom0"/>` });
  }
  let firstSect = true;
  xml = xml.replace(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g, sp => {
    const open = /^<w:sectPr\b[^>]*?\/?>/.exec(sp)[0].replace(/\/>$/, '>');
    const inner = sp.endsWith('/>') ? '' : sp.slice(open.length, -('</w:sectPr>'.length));
    let kids = children(inner);
    const pg = kids.find(k => k.tag === 'w:pgSz');
    const land = pg && /w:orient="landscape"/.test(pg.xml);
    const part = s.pageNum.startsWith('top') ? 'w:headerReference' : 'w:footerReference';
    kids = kids.filter(k => !['w:pgMar', 'w:titlePg', 'w:pgSz'].includes(k.tag) && !(s.pageNum !== 'none' && k.tag === part));
    if (s.pageNum !== 'none') kids = kids.filter(k => !(k.tag === 'w:headerReference' || k.tag === 'w:footerReference') || !/w:type="(default|first)"/.test(k.xml) || k.tag !== part);
    kids.push({ tag: 'w:pgSz', xml: land ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>' });
    kids.push({ tag: 'w:pgMar', xml: `<w:pgMar w:top="${mm(s.top)}" w:right="${mm(s.right)}" w:bottom="${mm(s.bottom)}" w:left="${mm(s.left)}" w:header="709" w:footer="709" w:gutter="0"/>` });
    kids = kids.concat(refsXml.filter(r => !/type="first"/.test(r.xml) || firstSect));
    if (s.noFirstNum && firstSect && s.pageNum !== 'none') kids.push({ tag: 'w:titlePg', xml: '<w:titlePg/>' });
    firstSect = false;
    return open + ordered(kids, SECT) + '</w:sectPr>';
  });
  if (!/<w:sectPr\b/.test(xml)) report.notes.push('В документе не было параметров страницы — добавлены.');
  if (!/xmlns:r=/.test(xml.slice(0, 2000))) xml = xml.replace(/<w:document\b/, '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  // стили по умолчанию
  const stylesF = z.file('word/styles.xml');
  if (stylesF) {
    let st = await stylesF.async('string');
    const rDef = `<w:rPrDefault><w:rPr><w:rFonts w:ascii="${esc(s.font)}" w:hAnsi="${esc(s.font)}" w:cs="${esc(s.font)}" w:eastAsia="${esc(s.font)}"/><w:sz w:val="${s.size * 2}"/><w:szCs w:val="${s.size * 2}"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>`;
    if (/<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.test(st)) st = st.replace(/<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/, rDef);
    else if (/<w:docDefaults>/.test(st)) st = st.replace('<w:docDefaults>', '<w:docDefaults>' + rDef);
    z.file('word/styles.xml', st);
  }
  // отключить «не добавлять интервал между абзацами одного стиля» не требуется: интервалы заданы явно
  z.file('word/document.xml', xml);
  z.file('word/_rels/document.xml.rels', relsOut);
  z.file('[Content_Types].xml', ctOut);
  report.refsAll = refItems.length;
  return { bytes: await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), report };
}

const api = { PRESETS, BASE, parseRequirements, formatDocx, formatRef, textToDocx, classify };
if (typeof module === 'object' && module.exports) module.exports = api; else root.PomFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
