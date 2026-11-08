/* Чтение встроенной модели данных Excel (Power Pivot, xl/model/item.data) прямо в браузере.
   Формат: резервная копия Analysis Services (ABF) → файлы со сжатием Xpress8 (Plain LZ77, MS-XCA)
   → столбцы VertiPaq: словари (в т.ч. сжатые кодом Хаффмана, MS-XLDM) и RLE/bit-packed идентификаторы. */
(function (root) {
'use strict';

const td16 = new TextDecoder('utf-16le'), td8 = new TextDecoder('utf-8');
const u32 = (b, i) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0;
const u64 = (b, i) => u32(b, i) + u32(b, i + 4) * 4294967296;
const unxml = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))
  : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e.toLowerCase()]);
const text = b => (b[0] === 0xFF && b[1] === 0xFE) ? td16.decode(b.subarray(2)) : (b.length > 1 && b[1] === 0) ? td16.decode(b) : td8.decode(b);
const tag = (xml, name) => { const m = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>').exec(xml); return m ? m[1] : null; };

/* ---------- Xpress8: куски [u16 размер после распаковки][u16 размер в файле] + Plain LZ77 ---------- */
function lz77(src, s, e, out, o, outEnd) {
  let flags = 0, fc = 0, half = -1;
  while (o < outEnd) {
    if (fc === 0) { flags = u32(src, s); s += 4; fc = 32; }
    fc--;
    const isMatch = flags & 0x80000000; flags = (flags << 1) >>> 0;
    if (!isMatch) { out[o++] = src[s++]; continue; }
    const tok = src[s] | src[s + 1] << 8; s += 2;
    const off = (tok >> 3) + 1;
    let len = tok & 7;
    if (len === 7) {
      if (half < 0) { len = src[s] & 15; half = s; s++; } else { len = src[half] >> 4; half = -1; }
      if (len === 15) {
        len = src[s++];
        if (len === 255) {
          len = src[s] | src[s + 1] << 8; s += 2;
          if (len === 0) { len = u32(src, s); s += 4; }
          len -= 22;
        }
        len += 15;
      }
      len += 7;
    }
    len += 3;
    for (let k = 0; k < len; k++, o++) out[o] = out[o - off];
  }
  if (s > e + 4) throw Error('Повреждённый блок модели данных.');
}
function xpress8(raw, expected) {
  const out = new Uint8Array(expected);
  let i = 0, o = 0;
  while (i < raw.length && o < expected) {
    const ul = raw[i] | raw[i + 1] << 8, cl = raw[i + 2] | raw[i + 3] << 8; i += 4;
    if (cl === ul) out.set(raw.subarray(i, i + cl), o);
    else lz77(raw, i, i + cl, out, o, o + ul);
    i += cl; o += ul;
  }
  if (o !== expected) throw Error('Размер распакованного файла модели не совпал.');
  return out;
}

/* ---------- ABF: заголовок, виртуальный каталог, журнал ---------- */
function openAbf(buf) {
  const head = td16.decode(buf.subarray(72, 4096)).replace(/\0+$/, '');
  if (!/<BackupLog/.test(head)) throw Error('Модель данных в файле не распознана.');
  const num = n => +tag(head, n);
  const errorCode = tag(head, 'ErrorCode') === 'true', compressed = tag(head, 'ApplyCompression') === 'true';
  const vdOff = num('m_cbOffsetHeader'), vdSize = num('DataSize');
  const vd = text(buf.subarray(vdOff, vdOff + vdSize));
  const vfiles = [...vd.matchAll(/<BackupFile>([\s\S]*?)<\/BackupFile>/g)].map(m => ({
    path: unxml(tag(m[1], 'Path')), size: +tag(m[1], 'Size'), offset: +tag(m[1], 'm_cbOffsetHeader'),
  }));
  const byStorage = new Map(vfiles.map(f => [f.path, f]));
  const logRef = vfiles[vfiles.length - 1];
  let logBytes = buf.subarray(logRef.offset, logRef.offset + logRef.size - (errorCode ? 4 : 0));
  const log = text(logBytes);
  const groups = [...log.matchAll(/<FileGroup>([\s\S]*?)<\/FileGroup>/g)].map(m => m[1]);
  const persistRoot = unxml(tag(groups[1] || '', 'PersistLocationPath') || '') + '\\';
  const files = new Map();
  for (const g of groups) for (const m of g.matchAll(/<BackupFile>([\s\S]*?)<\/BackupFile>/g)) {
    const path = unxml(tag(m[1], 'Path') || ''), storage = unxml(tag(m[1], 'StoragePath') || '');
    const v = byStorage.get(storage);
    if (!v) continue;
    const rel = path.startsWith(persistRoot) ? path.slice(persistRoot.length) : path;
    const name = rel.split('\\').pop();
    files.set(name, { offset: v.offset, size: v.size, full: +tag(m[1], 'Size') });
  }
  function read(name) {
    const f = files.get(name);
    if (!f) throw Error('В модели нет файла ' + name + '.');
    const raw = buf.subarray(f.offset, f.offset + f.size - (errorCode ? 4 : 0));
    return compressed ? xpress8(raw, f.full) : raw;
  }
  return { files, read };
}

/* ---------- Словарь столбца ---------- */
function huffTable(enc) {
  const len = new Uint8Array(256);
  for (let i = 0; i < 128; i++) { len[2 * i] = enc[i] & 15; len[2 * i + 1] = enc[i] >> 4; }
  let max = 0; const count = new Uint32Array(17);
  for (let s = 0; s < 256; s++) if (len[s]) { count[len[s]]++; if (len[s] > max) max = len[s]; }
  if (!max) return { max: 0 };
  const first = new Uint32Array(17); let code = 0;
  for (let L = 1; L <= max; L++) { code = (code + count[L - 1]) << 1; first[L] = code; }
  const next = first.slice(), table = new Uint16Array(1 << max);
  for (let s = 0; s < 256; s++) {
    const L = len[s]; if (!L) continue;
    const c = next[L]++, pad = max - L, base = c << pad;
    table.fill((s << 8) | L, base, base + (1 << pad));
  }
  return { max, table };
}
function readDictionary(b) {
  const type = u32(b, 0) | 0; let p = 4 + 24;
  if (type === 0 || type === 1) {               // числа
    const n = u64(b, p); p += 8; const size = u32(b, p); p += 4;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), vals = new Array(n);
    for (let i = 0; i < n; i++, p += size)
      vals[i] = size === 4 ? dv.getInt32(p, true) : type === 1 ? dv.getFloat64(p, true) : Number(dv.getBigInt64(p, true));
    return vals;
  }
  if (type !== 2) throw Error('Неизвестный тип словаря в модели.');
  p += 8; p += 1; p += 8; const pages = u64(b, p); p += 8;
  const store = [];
  for (let pg = 0; pg < pages; pg++) {
    p += 8 + 1 + 8; const count = u64(b, p); p += 8; const comp = b[p]; p += 1;
    if (u32(b, p) !== 0xAABBCCDD) throw Error('Повреждён словарь модели.'); p += 4;
    if (!comp) {
      p += 8; const used = u64(b, p); p += 8; const alloc = u64(b, p); p += 8;
      const text = td16.decode(b.subarray(p, p + used * 2)); p += alloc;
      store.push({ comp: 0, strings: text.split('\0').slice(0, -1), count });
    } else {
      const totalBits = u32(b, p); p += 4; const cs = u32(b, p); p += 4; const blen = u64(b, p); p += 8;
      let charset = 0; if (cs === 0xABA91) { charset = b[p]; p += 1; }
      p += 4; const enc = b.subarray(p, p + 128); p += 128; p += 8;
      const data = b.subarray(p, p + blen); p += blen;
      store.push({ comp: 1, general: cs === 0xABA92, charset, totalBits, enc, data, count });
    }
    if (u32(b, p) !== 0xABCDABCD) throw Error('Повреждён словарь модели.'); p += 4;
  }
  const nh = u64(b, p); p += 8 + 4;
  const handles = new Map();
  for (let i = 0; i < nh; i++, p += 8) {
    const off = u32(b, p), pid = u32(b, p + 4);
    if (!handles.has(pid)) handles.set(pid, []);
    handles.get(pid).push(off);
  }
  const out = [];
  store.forEach((pg, pid) => {
    if (!pg.comp) { for (const s of pg.strings) out.push(s); return; }
    const offs = handles.get(pid); if (!offs) return;
    const { max, table } = huffTable(pg.enc);
    const sw = new Uint8Array(pg.data.length + 4);
    for (let i = 0; i + 1 < pg.data.length; i += 2) { sw[i] = pg.data[i + 1]; sw[i + 1] = pg.data[i]; }
    if (pg.data.length & 1) sw[pg.data.length - 1] = pg.data[pg.data.length - 1];
    const mask = (1 << max) - 1;
    const single = !pg.general && pg.charset !== 0, latin = !pg.general && pg.charset === 0;
    for (let k = 0; k < offs.length; k++) {
      let bit = offs[k]; const end = k + 1 < offs.length ? offs[k + 1] : pg.totalBits;
      const codes = [];
      while (bit < end && max) {
        const i = bit >>> 3, w = (sw[i] << 16 | sw[i + 1] << 8 | sw[i + 2]) >>> 0;
        const e = table[(w >>> (24 - (bit & 7) - max)) & mask], L = e & 255;
        if (!L) throw Error('Повреждена строка в словаре модели.');
        codes.push(e >> 8); bit += L;
      }
      if (single) out.push(String.fromCharCode(...codes.map(c => c | pg.charset << 8)));
      else if (latin) out.push(String.fromCharCode(...codes));
      else { const n = codes.length & ~1, u = new Uint8Array(codes.slice(0, n)); out.push(td16.decode(u)); }
    }
  });
  return out;
}

/* ---------- Идентификаторы строк (RLE + bit-packing) ---------- */
function readIds(b, segs, rows) {
  const ids = new Uint32Array(rows);
  let p = 0, pos = 0;
  for (const meta of segs) {
    const np = u64(b, p); p += 8;
    const entries = [];
    for (let i = 0; i < np; i++, p += 8) entries.push([u32(b, p), u32(b, p + 4)]);
    const ns = u64(b, p); p += 8; const sub = p; p += ns * 8;
    const bw = meta.bitWidth, base = meta.hasNulls ? 2 : meta.min;
    const per = bw ? Math.floor(64 / bw) : 0, mask = bw >= 32 ? 0xFFFFFFFF : (1 << bw) - 1;
    const allMin = ns === 1 && u32(b, sub) === 0 && u32(b, sub + 4) === 0;
    const packed = k => {
      if (allMin) return base;
      const w = Math.floor(k / per), sh = (k % per) * bw, q = sub + w * 8;
      const lo = u32(b, q), hi = u32(b, q + 4);
      let v;
      if (sh + bw <= 32) v = (lo >>> sh) & mask;
      else if (sh >= 32) v = (hi >>> (sh - 32)) & mask;
      else v = ((lo >>> sh) | (hi << (32 - sh))) & mask;
      return (v >>> 0) + base;
    };
    let acc = 0, bpo = 0;
    for (const [val, rep] of entries) {
      if (meta.records && acc >= meta.records) break;
      let n = rep; if (meta.records && acc + n > meta.records) n = meta.records - acc;
      if (val + bpo === 0xFFFFFFFF) { for (let k = 0; k < n; k++) ids[pos++] = packed(bpo + k); bpo += n; }
      else { ids.fill(val, pos, pos + n); pos += n; }
      acc += n;
    }
  }
  return pos === rows ? ids : ids.subarray(0, pos);
}

/* ---------- Модель целиком ---------- */
function openModel(itemData) {
  const abf = openAbf(itemData);
  const names = [...abf.files.keys()];
  const dims = new Map();       // имя таблицы → {id, attrs: имя столбца → внутреннее имя}
  for (const n of names.filter(n => /\.dim\.xml$/.test(n))) {
    const x = text(abf.read(n));
    const dim = /<Dimension>\s*<Name>([\s\S]*?)<\/Name>\s*<ID>([\s\S]*?)<\/ID>/.exec(x);
    if (!dim) continue;
    const attrs = new Map();
    for (const m of x.matchAll(/<Attribute>\s*<Name>([\s\S]*?)<\/Name>\s*<ID>([\s\S]*?)<\/ID>/g)) attrs.set(unxml(m[1]), unxml(m[2]));
    dims.set(unxml(dim[1]), { id: unxml(dim[2]), attrs });
  }
  const tblCache = new Map();
  function tableXml(dimId) {
    if (tblCache.has(dimId)) return tblCache.get(dimId);
    const esc = dimId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const n = names.find(f => new RegExp('^' + esc + '\\.\\d+\\.tbl\\.xml$').test(f));
    const x = n ? text(abf.read(n)) : null;
    tblCache.set(dimId, x); return x;
  }
  function column(table, col) {
    const dim = dims.get(table);
    if (!dim) throw Error('В модели нет таблицы «' + table + '».');
    const storage = dim.attrs.get(col);
    if (!storage) throw Error('В таблице «' + table + '» нет столбца «' + col + '».');
    const x = tableXml(dim.id);
    if (!x) throw Error('Не найдено описание таблицы «' + table + '».');
    const start = x.indexOf('class="XMRawColumn" name="' + storage.replace(/&/g, '&amp;') + '"');
    if (start < 0) throw Error('Нет данных столбца «' + col + '».');
    const nextCol = x.indexOf('class="XMRawColumn"', start + 20);
    const cx = x.slice(start, nextCol < 0 ? undefined : nextCol);
    const rows = +(/<RowCount[^>]*>(\d+)</.exec(cx) || [])[1];
    const segsXml = cx.slice(cx.indexOf('<Name>Segments</Name>'));
    const segs = [];
    for (const m of segsXml.matchAll(/<XMObject class="XMColumnSegment"[^>]*><Properties><Records[^>]*>(\d+)<\/Records>[\s\S]*?<Name>SubSegment<\/Name><XMObject class="XMColumnSegment"[^>]*><Properties><Records[^>]*>(\d+)<\/Records>[\s\S]*?<Name>CompressionInfo<\/Name><XMObject class="([^"]+)"[^>]*>(?:<Properties><Min[^>]*>(-?\d+)<\/Min>)?[\s\S]*?<HasNulls[^>]*>(true|false)</g)) {
      const bws = [...unxml(m[3]).matchAll(/<(\d+)>/g)];
      segs.push({ records: +m[1], packed: +m[2], bitWidth: bws.length ? +bws[bws.length - 1][1] : 0, min: +(m[4] || 0), hasNulls: m[5] === 'true' });
    }
    if (!segs.length) throw Error('Не прочитаны сегменты столбца «' + col + '».');
    const total = segs.reduce((s, g) => s + g.records, 0);
    const pre = '.' + dim.id + '.' + storage + '.';
    const idfName = names.find(f => f.endsWith(pre + '0.idf') && /^\d+\./.test(f));
    const dictName = names.find(f => f.endsWith(pre + 'dictionary') && /^\d+\./.test(f));
    if (!idfName || !dictName) throw Error('Столбец «' + col + '» хранится в неподдерживаемом виде.');
    const ids = readIds(abf.read(idfName), segs, total || rows);
    const dict = readDictionary(abf.read(dictName));
    return { ids, dict, value: id => id >= 3 ? dict[id - 3] : null };
  }
  const has = (table, col) => !!dims.get(table)?.attrs.has(col);
  return { tables: [...dims.keys()], column, has };
}

const api = { openModel, xpress8, readDictionary };
if (typeof module === 'object' && module.exports) module.exports = api; else root.GibddModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
