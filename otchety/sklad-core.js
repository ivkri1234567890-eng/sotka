/* ===== Ядро: разбор выгрузки, группы, сравнение отчётов ===== */
const Core = (() => {
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const clean = v => {
    if (v == null) return '';
    if (v instanceof Date) return v;
    const s = String(v).replace(/\s+/g, ' ').trim();
    return (s === '…' || s === '...' || s.toLowerCase() === 'nan') ? '' : s;
  };

  const MATCH = {
    vin: h => h === 'вин',
    status: h => h === 'статус',
    sklad: h => h === 'склад',
    skladType: h => h === 'вид склада',
    cls: h => h.startsWith('класс а/м по текущему'),
    family: h => h === 'семейство',
    body: h => h.startsWith('доработка'),
    year: h => h === 'год vin',
    eco: h => h.startsWith('эк. класс') || h.startsWith('эк.класс'),
    resName: h => h === 'резерв_наименование',
    resClient: h => h === 'резерв_клиент',
    comment: h => h === 'комментарий',
    direction: h => h === 'направление реализации',
    buyer: h => h === 'покупатель',
    holding: h => h.startsWith('холдинг'),
    dirShort: h => h.startsWith('направление / покупатель'),
    arrival: h => h.startsWith('дата прихода'),
    manager: h => h === 'менеджер',
    curator: h => h === 'куратор',
    problem: h => h.startsWith('проблематика'),
    plan: h => h.startsWith('план мероприятий'),
    fcYear: h => h.startsWith('прогноз реализации') && /20\d\d/.test(h),
    fcMonth: h => h.startsWith('прогноз реализации') && !/20\d\d/.test(h),
    product: h => h === 'товар из справочника',
    eptsDate: h => h === 'дата эптс',
    price: h => /(^|[\s(])цен[аы]|стоимост/.test(h) && !h.includes('для прайса')
  };
  const FIELDS = Object.keys(MATCH);
  const LONG = { comment: 1, problem: 1, plan: 1 };

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTH_STEMS = [['январ', 0], ['феврал', 1], ['март', 2], ['апрел', 3], ['май', 4], ['мая', 4], ['июн', 5], ['июл', 6], ['август', 7], ['сентябр', 8], ['октябр', 9], ['ноябр', 10], ['декабр', 11]];
  const monthOf = t => { const s = norm(t); for (const [stem, i] of MONTH_STEMS) if (s.includes(stem)) return i; return null; };

  const toISODate = v => {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    const m = String(v).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const m2 = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m2 ? m2[0] : '';
  };

  const isFlagHeader = c => (c instanceof Date) || /^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/.test(String(c == null ? '' : c).trim());

  function guessDate(flagHeader, filename) {
    const today = new Date();
    let d = null, m = null, y = null;
    if (flagHeader instanceof Date) return toISODate(flagHeader);
    const src = flagHeader ? String(flagHeader) : '';
    let mm = src.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
    if (!mm && filename) mm = String(filename).match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
    if (mm) { d = +mm[1]; m = +mm[2]; y = mm[3] ? (+mm[3] < 100 ? 2000 + +mm[3] : +mm[3]) : null; }
    if (!d || !m || m > 12 || d > 31) return '';
    if (!y) {
      const fy = filename && String(filename).match(/20\d\d/);
      y = fy ? +fy[0] : today.getFullYear();
      const cand = new Date(y, m - 1, d);
      if (!fy && cand - today > 31 * 864e5) y -= 1;
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /** aoa = массив строк листа; возвращает {date, rows, warnings} */
  function parseAOA(aoa, filename) {
    const warnings = [];
    let hi = -1;
    for (let i = 0; i < Math.min(aoa.length, 30); i++) {
      if ((aoa[i] || []).some(c => norm(c) === 'вин')) { hi = i; break; }
    }
    if (hi < 0) throw new Error('Не нашёл строку заголовков с колонкой «ВИН». Проверьте, что это выгрузка склада.');
    const header = aoa[hi];
    const idx = {};
    let flagIdx = -1;
    header.forEach((c, j) => {
      const h = norm(c instanceof Date ? '' : c);
      for (const f of FIELDS) if (idx[f] == null && h && MATCH[f](h)) { idx[f] = j; break; }
      if (flagIdx < 0 && isFlagHeader(c)) flagIdx = j;
    });
    ['status', 'family', 'fcMonth', 'manager'].forEach(f => { if (idx[f] == null) warnings.push(`Нет колонки «${f === 'fcMonth' ? 'прогноз реализации (месяц)' : f === 'family' ? 'Семейство' : f === 'status' ? 'Статус' : 'Менеджер'}» — часть анализа будет неполной.`); });
    const date = guessDate(flagIdx >= 0 ? header[flagIdx] : null, filename);
    let body = aoa.slice(hi + 1);
    if (flagIdx >= 0) {
      const flagged = body.filter(r => r && r[flagIdx] != null && String(r[flagIdx]).trim() !== '' && String(r[flagIdx]).trim() !== '0');
      if (flagged.length >= Math.max(10, body.length * 0.1)) body = flagged;
    }
    const seen = new Set();
    const rows = [];
    for (const r of body) {
      if (!r) continue;
      const vin = clean(r[idx.vin]);
      const status = idx.status != null ? clean(r[idx.status]) : 'н/д';
      if (!vin || !status || seen.has(String(vin))) continue;
      seen.add(String(vin));
      const o = {};
      for (const f of FIELDS) {
        if (idx[f] == null) { o[f] = ''; continue; }
        let v = r[idx[f]];
        if (f === 'arrival' || f === 'eptsDate') { o[f] = toISODate(v); continue; }
        if (f === 'price') { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); o[f] = isNaN(n) || n <= 0 ? '' : (n < 1000 ? Math.round(n * 1e6) : Math.round(n)); continue; }
        v = clean(v);
        if (v instanceof Date) v = toISODate(v);
        if (f === 'year' || f === 'fcYear' || f === 'eco') { const n = parseFloat(v); o[f] = isNaN(n) ? '' : Math.round(n); continue; }
        o[f] = LONG[f] ? String(v).slice(0, 400) : String(v);
      }
      o.vin = String(vin);
      rows.push(o);
    }
    if (!rows.length) throw new Error('В файле не нашлось ни одной строки с ВИН и статусом.');
    return { date, rows, warnings };
  }

  /* ---- классификация ---- */
  const DEAL_RE = /контракт подписан|под контракт|дкп|бронь|продан|отгружен|договор|в плане [а-яa-z]/i;
  const GENERIC_DIR = new Set(['', 'рф', 'дпга/дпрф']);
  const realBuyer = v => (v && !/условн/i.test(v)) ? v : '';
  function clientOf(r) {
    const direct = r.resClient || realBuyer(r.buyer) || r.holding;
    if (direct) return direct;
    if (!GENERIC_DIR.has(norm(r.dirShort))) return r.dirShort;
    const m = `${r.plan} ${r.problem}`.match(/бронь\s+([A-Za-zА-Яа-яЁё][^,.;\n]{1,40})/i);
    return m ? m[1].trim() : '';
  }
  function brandOf(family, cls) {
    const f = `${family} ${cls}`;
    if (/валдай/i.test(f)) return 'Валдай';
    if (/волгабас/i.test(f)) return 'Волгабас';
    if (/citymax|вектор|паз/i.test(f)) return 'ПАЗ';
    if (/газель/i.test(f)) return 'Газель';
    if (/соболь/i.test(f)) return 'Соболь';
    if (/газон/i.test(f)) return 'ГАЗон';
    if (/садко/i.test(f)) return 'Садко';
    return family || cls || 'Прочее';
  }
  const NO_MGR = '— менеджер не назначен';
  const BODY = [[/рефриж/i, 'Рефрижератор'], [/изотерм/i, 'Изотерм'], [/европромтов/i, 'Евро-промтовар'], [/промтов/i, 'Промтовар'], [/европлатф|тент|штор/i, 'Европлатформа'], [/манипулят|кму/i, 'Борт с КМУ'], [/агп|подъемник|подъёмник|вышк/i, 'АГП'], [/эвакуат/i, 'Эвакуатор'], [/самосвал/i, 'Самосвал'], [/бункер/i, 'Бункеровоз'], [/тягач/i, 'Тягач'], [/шасси/i, 'Шасси'], [/борт/i, 'Бортовой'], [/цистерн/i, 'Цистерна']];
  function bodyShort(r) {
    const b = r.body || '';
    for (const [re, name] of BODY) if (re.test(b)) return name;
    if (b) return b.length > 22 ? b.slice(0, 21) + '…' : b;
    const t = `${r.cls} ${r.product}`;
    if (/bus|автобус|паз|волгабас|citymax|вектор/i.test(t)) return 'Автобус';
    if (/фургон/i.test(t)) return 'Фургон (заводской)';
    if (/бортов|шасси/i.test(t)) return 'Борт / шасси (заводск.)';
    return 'Базовая комплектация';
  }

  function classify(rows, reportISO) {
    const rd = reportISO ? new Date(reportISO + 'T00:00:00') : new Date();
    const rKey = rd.getFullYear() * 12 + rd.getMonth();
    return rows.map(r => {
      const brak = /брак/i.test(r.status);
      const rework = /доработ/i.test(r.status);
      const monthIdx = monthOf(r.fcMonth);
      const hasMonth = !!norm(r.fcMonth);
      const client = clientOf(r);
      const deal = DEAL_RE.test(`${r.plan} ${r.problem} ${r.comment}`);
      let group = hasMonth ? 1 : ((brak || rework) ? 3 : 2);
      const sub = group === 1 ? ((client || deal) ? '1а' : '1б') : '';
      const fy = +r.fcYear || rd.getFullYear();
      const fKey = monthIdx == null ? null : fy * 12 + monthIdx;
      const overdue = group === 1 && fKey != null && fKey < rKey;
      const ageDays = r.arrival ? Math.max(0, Math.round((rd - new Date(r.arrival + 'T00:00:00')) / 864e5)) : null;
      return Object.assign({}, r, {
        group, sub, brak, rework, client, deal, monthIdx, fKey, overdue, ageDays,
        model: r.family || r.cls || 'Без модели',
        brand: brandOf(r.family, r.cls),
        bodyShort: bodyShort(r),
        mgr: r.manager || (r.curator ? r.curator + ' (куратор)' : NO_MGR + ' · ' + (r.direction || 'направление не указано')),
        noMgr: !r.manager,
        monthLabel: monthIdx == null ? (r.fcMonth || '') : MONTHS[monthIdx] + (r.fcYear && +r.fcYear !== rd.getFullYear() ? ' ' + r.fcYear : '')
      });
    });
  }

  /* ---- сравнение двух отчётов ---- */
  const EVENT = {
    sold: 'Убыло со склада (реализовано)',
    refusal: 'Выпал из прогноза: отказ',
    unreserved: 'Снят резерв / клиент',
    silent: 'Снят прогноз без объяснения',
    postponed: 'Перенос срока',
    clientChanged: 'Смена клиента',
    newG1: 'Новые в «Продаётся сейчас»',
    repaired: 'Вышли из брака/доработки',
    toProblem: 'Ушли в брак/доработку',
    arrived: 'Новые на складе'
  };
  const nc = s => norm(s).replace(/[«»"']/g, '');

  function compare(oldC, newC) {
    const nm = new Map(newC.map(r => [r.vin, r]));
    const om = new Map(oldC.map(r => [r.vin, r]));
    const ev = [];
    const push = (type, o, n, why) => ev.push({ type, vin: (o || n).vin, o, n, why: why || '' });
    for (const o of oldC) {
      const n = nm.get(o.vin);
      if (!n) { push('sold', o, null); continue; }
      const txt = `${n.problem} ${n.plan} ${n.comment}`;
      if (o.group === 1 && n.group !== 1) {
        if (/отказ/i.test(txt)) push('refusal', o, n, n.problem || n.plan);
        else if (o.client && !n.client) push('unreserved', o, n, n.problem || n.plan);
        else push('silent', o, n, n.problem || n.plan);
        continue;
      }
      if (o.group === 1 && n.group === 1) {
        if (o.fKey != null && n.fKey != null && n.fKey > o.fKey) push('postponed', o, n, n.problem || n.plan);
        if (o.client && !n.client) push('unreserved', o, n, n.problem || n.plan);
        else if (o.client && n.client && nc(o.client) !== nc(n.client)) push('clientChanged', o, n);
        continue;
      }
      if (o.group !== 1 && n.group === 1) { push('newG1', o, n); continue; }
      if (o.client && !n.client) push('unreserved', o, n, n.problem || n.plan);
      if (o.group === 3 && n.group === 2) push('repaired', o, n);
      if (o.group === 2 && n.group === 3) push('toProblem', o, n, n.status);
    }
    for (const n of newC) if (!om.has(n.vin)) push('arrived', null, n);
    return ev;
  }

  /** сводка ответственности по менеджерам (по менеджеру из базового отчёта) */
  function accountability(oldC, ev) {
    const m = new Map();
    const get = k => { if (!m.has(k)) m.set(k, { mgr: k, committed: 0, fulfilled: 0, soldExtra: 0, refusal: 0, unreserved: 0, silent: 0, postponed: 0, kept: 0 }); return m.get(k); };
    for (const o of oldC) if (o.group === 1) get(o.mgr).committed++;
    for (const e of ev) {
      const o = e.o; if (!o) continue;
      const a = get(o.mgr);
      if (e.type === 'sold') { if (o.group === 1) a.fulfilled++; else a.soldExtra++; }
      else if (e.type === 'refusal' || e.type === 'silent') a[e.type]++;
      else if (e.type === 'unreserved' && o.group === 1 && e.n && e.n.group !== 1) a.unreserved++;
      else if (e.type === 'postponed') a.postponed++;
    }
    for (const a of m.values()) a.kept = a.committed - a.fulfilled - a.refusal - a.unreserved - a.silent;
    return [...m.values()].sort((x, y) => y.committed - x.committed || x.mgr.localeCompare(y.mgr));
  }

  /* ---- альтернативные схемы разбиения на три группы ---- */
  const LEASING_DEFAULT = { dateFrom: '2024-10-01', basis: 'epts', ecoMin: '', brands: [], priceMax: '', discountPct: 10, discountMax: 500000, note: 'По умолчанию — правило 2025 г.: ТС выпуска с 01.10.2024. Проверьте условия на декабрь 2026 г.', source: '', updatedAt: '' };
  let leasing = Object.assign({}, LEASING_DEFAULT);
  const setLeasing = c => { leasing = Object.assign({}, LEASING_DEFAULT, c || {}); };
  const getLeasing = () => Object.assign({}, leasing);
  function prodDate(r, basis) {
    if (basis === 'arrival') return r.arrival || '';
    if (basis === 'year') return r.year ? `${r.year}-12-31` : '';
    return r.eptsDate || (r.year ? `${r.year}-12-31` : '');
  }
  /** соответствует ли ТС условиям льготного лизинга (без учёта брака); unit price — из файла или ручная */
  function leasingCheck(r, price) {
    const c = leasing, why = [];
    const d = prodDate(r, c.basis);
    if (c.dateFrom && (!d || d < c.dateFrom)) why.push(d ? 'выпуск раньше ' + c.dateFrom.split('-').reverse().join('.') : 'нет даты выпуска');
    const eco = +r.eco;
    if (c.ecoMin && eco >= 1 && eco <= 6 && eco < +c.ecoMin) why.push('экокласс ' + eco);
    if (c.brands && c.brands.length && !c.brands.includes(r.brand)) why.push('модель не в программе');
    if (c.priceMax && price && price > +c.priceMax) why.push('цена выше предела');
    return { ok: !why.length, why };
  }
  const leasingDiscount = price => price ? Math.min(price * (+leasing.discountPct || 0) / 100, +leasing.discountMax || Infinity) : 0;

  const GOV_RE = /минтранс|мосгортранс|государствен|госзаказ|контракт|тендер|закупк|ргс|ркс/i;
  const SCHEMES = {
    deal: {
      name: 'По готовности к сделке',
      about: 'Есть ли прогноз продажи и можно ли машину отгрузить. Основная схема: на ней строится спрос с менеджеров.',
      groups: { 1: 'Продаётся сейчас', 2: 'Исправны, без покупателя', 3: 'Сначала решение' },
      hint: { 1: 'Прогноз на месяц есть. Не сорвать сделку.', 2: 'Прогноза нет или он на 2027. Нужны условия покупки.', 3: 'Брак/доработка без прогноза. Решение по каждому ВИН.' },
      fn: r => r.group
    },
    finance: {
      name: 'По доступности льготного лизинга',
      about: 'Подходит ли исправная машина под условия льготного лизинга из панели ниже: дата выпуска, экокласс, модели, предельная цена. Условия вводятся вручную или загружаются из файла постановления.',
      groups: { 1: 'Под льготный лизинг', 2: 'Вне программы, исправны', 3: 'Брак / доработка' },
      hint: { 1: 'Готовить заявки в ЛК к 1 декабря.', 2: 'Кэптив-условия, трейд-ин, отсрочка.', 3: 'Ремонт под клиента или «как есть».' },
      fn: r => (r.brak || r.rework) ? 3 : (leasingCheck(r, r.price || r.manualPrice).ok ? 1 : 2)
    },
    age: {
      name: 'По сроку на складе',
      about: 'Сколько дней машина стоит с даты прихода на склад. Чем дольше стоит, тем дороже хранение и тем сильнее нужны особые условия.',
      groups: { 1: 'До года', 2: '1–1,5 года', 3: 'Больше 1,5 лет' },
      hint: { 1: 'Обычная работа с прайсом.', 2: 'Пакет услуг и бонус дилеру.', 3: 'Особые условия, корпоративные продажи.' },
      fn: r => r.ageDays == null ? 2 : (r.ageDays <= 365 ? 1 : r.ageDays <= 545 ? 2 : 3)
    },
    channel: {
      name: 'По каналу продажи',
      about: 'Кто покупатель: госзаказчик по контракту, корпоративный или лизинговый клиент, либо свободный склад для дилерской розницы.',
      groups: { 1: 'Госзаказ и контракты', 2: 'Корпоративные и лизинг', 3: 'Свободный склад / розница' },
      hint: { 1: 'Контроль графика приёмки и оплаты.', 2: 'Персональные КП, флотовые условия.', 3: 'Классифайды, дилеры, допнагрузка.' },
      fn: r => {
        const t = `${r.direction} ${r.dirShort} ${r.plan} ${r.problem}`;
        if (GOV_RE.test(t)) return 1;
        if (r.client || /коммерческ|лизинг/i.test(t)) return 2;
        return 3;
      }
    }
  };

  return { parseAOA, classify, compare, accountability, EVENT, MONTHS, NO_MGR, brandOf, norm, FIELDS, SCHEMES, setLeasing, getLeasing, leasingCheck, leasingDiscount, LEASING_DEFAULT, prodDate };
})();
if (typeof module !== 'undefined') module.exports = Core;
