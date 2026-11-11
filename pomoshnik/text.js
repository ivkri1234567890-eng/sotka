/* Извлечение текста по абзацам из .docx, .odt, .pdf, .rtf, .txt, .md */
(function (root) {
'use strict';
const Zip = () => root.JSZip || require('jszip');
const unxml = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e.toLowerCase()]);

function decodeText(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1251').decode(bytes); }
}
const splitPlain = t => t.replace(/\r\n?/g, '\n').split(/\n/).map(s => s.replace(/\s+$/, '')).reduce((out, line) => {
  if (!line.trim()) { if (out.length && out[out.length - 1] !== '') out.push(''); return out; }
  out.push(line.trim()); return out;
}, []).filter(Boolean);

/* .docx: абзацы и ячейки таблиц по порядку, с номерами списков */
async function fromDocx(bytes) {
  const z = await Zip().loadAsync(bytes);
  const f = z.file('word/document.xml');
  if (!f) throw Error('Файл не похож на документ Word (.docx).');
  const xml = await f.async('string');
  const body = xml.slice(xml.indexOf('<w:body'), xml.lastIndexOf('</w:body>'));
  const paras = [];
  for (const m of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const p = m[1] || '';
    if (/<w:pPr>[\s\S]*?<w:rPr>[\s\S]*?<w:del\b/.test(p) && !/<w:t\b/.test(p.replace(/<w:del\b[\s\S]*?<\/w:del>/g, ''))) continue;
    let t = '';
    const clean = p.replace(/<w:del\b[\s\S]*?<\/w:del>/g, '').replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/g, '');
    for (const r of clean.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<w:noBreakHyphen\/>/g)) {
      if (r[0].startsWith('<w:tab')) t += '\t'; else if (r[0].startsWith('<w:br')) t += '\n'; else if (r[0].startsWith('<w:noBreak')) t += '-'; else t += unxml(r[1]);
    }
    t = t.replace(/[ \t]+/g, ' ').trim();
    if (t) paras.push(t);
  }
  return paras;
}
async function fromOdt(bytes) {
  const z = await Zip().loadAsync(bytes);
  const xml = await z.file('content.xml').async('string');
  const out = [];
  for (const m of xml.matchAll(/<text:(p|h)\b[^>]*?(?:\/>|>([\s\S]*?)<\/text:\1>)/g)) {
    const t = unxml((m[2] || '').replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n').replace(/<text:s(?: text:c="(\d+)")?\/>/g, (x, n) => ' '.repeat(+n || 1)).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}
function fromRtf(bytes) {
  let s = new TextDecoder('latin1').decode(bytes);
  const cp = /\\ansicpg(\d+)/.exec(s); const dec = new TextDecoder(cp && cp[1] === '1251' ? 'windows-1251' : 'windows-1252');
  s = s.replace(/\{\\\*[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '').replace(/\{\\(fonttbl|colortbl|stylesheet|info)[\s\S]*?\}\}/g, '');
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const m = /^\\('([0-9a-f]{2})|u(-?\d+)\??|([a-z]+)(-?\d+)? ?|[\\{}])/i.exec(s.slice(i));
      if (!m) { i++; continue; }
      if (m[2]) out += dec.decode(new Uint8Array([parseInt(m[2], 16)]));
      else if (m[3]) { let n = +m[3]; if (n < 0) n += 65536; out += String.fromCharCode(n); if (s[i + m[0].length] && s[i + m[0].length] !== '\\') i++; }
      else if (m[4]) { if (/^(par|line)$/.test(m[4])) out += '\n'; else if (m[4] === 'tab') out += '\t'; }
      else out += m[1];
      i += m[0].length;
    } else if (c === '{' || c === '}' || c === '\r' || c === '\n') i++;
    else { out += c; i++; }
  }
  return splitPlain(out);
}
/* PDF: строки по координатам → абзацы по отступам/пустым промежуткам */
async function fromPdf(bytes) {
  const lib = root.pdfjsLib;
  if (!lib) throw Error('Чтение PDF недоступно.');
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent({ disableCombineTextItems: true });
    const items = tc.items.filter(it => 'str' in it && it.str.trim() !== '').map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 10, w: it.width || 0 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const pageLines = [];
    for (const it of items) {
      const L = pageLines.find(l => Math.abs(l.y - it.y) <= Math.max(l.h, it.h) * 0.45);
      if (L) L.items.push(it); else pageLines.push({ y: it.y, h: it.h, items: [it] });
    }
    pageLines.sort((a, b) => b.y - a.y);
    for (const L of pageLines) {
      L.items.sort((a, b) => a.x - b.x);
      let text = '', end = null;
      for (const it of L.items) {
        const gap = end == null ? 0 : it.x - end;
        if (end != null && gap > L.h * 0.1 && !text.endsWith(' ') && !it.s.startsWith(' ')) text += ' ';
        text += it.s; end = Math.max(end ?? -1e9, it.x + it.w);
      }
      text = text.replace(/\s+/g, ' ');
      lines.push({ y: L.y, x: Math.min(...L.items.map(i => i.x)), h: L.h, text: text.replace(/\s+([.,;:!?»)])/g, '$1').replace(/([«(])\s+/g, '$1').trim(), page: p });
    }
  }
  const paras = []; let buf = '', prev = null;
  for (const l of lines) {
    const t = l.text.replace(/\s+/g, ' ').trim();
    if (!t) { if (buf) { paras.push(buf); buf = ''; } prev = null; continue; }
    const gap = prev && prev.page === l.page ? prev.y - l.y : 0;
    const newPara = !prev || gap > prev.h * 1.8 || l.x > prev.x + 12 || /[.!?:;]$/.test(buf) && l.x > prev.x + 2 || /^(\d+[.)]|[-•–])\s/.test(t);
    if (newPara && buf) { paras.push(buf); buf = ''; }
    buf = buf ? (buf.endsWith('-') ? buf.slice(0, -1) + t : buf + ' ' + t) : t;
    prev = l;
  }
  if (buf) paras.push(buf);
  return paras;
}

async function extract(bytes, name = '') {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ext = (name.split('.').pop() || '').toLowerCase();
  const head = String.fromCharCode(...bytes.subarray(0, 5));
  if (head.startsWith('%PDF')) return fromPdf(bytes);
  if (head.startsWith('{\\rtf')) return fromRtf(bytes);
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    const z = await Zip().loadAsync(bytes);
    if (z.file('word/document.xml')) return fromDocx(bytes);
    if (z.file('content.xml')) return fromOdt(bytes);
    throw Error('«' + name + '»: архив не похож на документ Word или OpenOffice.');
  }
  if (bytes[0] === 0xD0 && bytes[1] === 0xCF) throw Error('«' + name + '» — старый формат Word (.doc). Сохраните его как .docx и загрузите снова.');
  if (ext && !/^(txt|md|csv|text|log|html?)$/.test(ext) && bytes.subarray(0, 512).some(b => b === 0)) throw Error('«' + name + '»: формат не поддерживается. Подходят .docx, .pdf, .odt, .rtf, .txt.');
  let t = decodeText(bytes);
  if (/^html?$/.test(ext)) t = unxml(t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|h\d|li|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
  return splitPlain(t);
}

const api = { extract, decodeText, splitPlain };
if (typeof module === 'object' && module.exports) module.exports = api; else root.PomText = api;
})(typeof window !== 'undefined' ? window : globalThis);
