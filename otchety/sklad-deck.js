/* ===== Презентация из отчёта (PptxGenJS) ===== */
const Deck = (() => {
  const C = { ink: '1D2321', muted: '5F6A66', line: 'DDE1DE', bg: 'F4F5F3', accent: '1F5F8B', g1: '2F7D4F', g2: 'A86A00', g3: 'B33B2E', g1s: 'E3F1E8', g2s: 'FBEFD6', g3s: 'F8E3E0', white: 'FFFFFF' };
  const F = 'Arial';
  const fmtDate = iso => iso ? iso.split('-').reverse().join('.') : '';
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const W = 13.333;
  const m0 = v => (+v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

  function frame(pptx, title, lead, page) {
    const s = pptx.addSlide();
    s.background = { color: C.white };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.accent }, line: { color: C.accent } });
    s.addText(title, { x: 0.55, y: 0.35, w: W - 1.1, h: 0.6, fontFace: F, fontSize: 26, bold: true, color: C.ink, margin: 0 });
    if (lead) s.addText(lead, { x: 0.55, y: 0.98, w: W - 1.1, h: 0.75, fontFace: F, fontSize: 14, color: C.muted, margin: 0, valign: 'top' });
    s.addText(String(page), { x: W - 0.9, y: 7.0, w: 0.5, h: 0.3, fontFace: F, fontSize: 10, color: C.muted, align: 'right', margin: 0 });
    return s;
  }

  function table(s, head, rows, opt) {
    const hdr = head.map((h, i) => ({ text: h, options: { bold: true, color: C.muted, fill: { color: C.bg }, align: i ? 'right' : 'left' } }));
    const body = rows.map(r => r.map((c, i) => {
      const o = (c && typeof c === 'object' && 'text' in c) ? c : { text: String(c == null ? '' : c) };
      return { text: o.text, options: Object.assign({ align: (opt.alignLeft || []).includes(i) || i === 0 ? 'left' : 'right', color: C.ink }, o.options || {}) };
    }));
    s.addTable([hdr, ...body], {
      x: opt.x || 0.55, y: opt.y || 1.85, w: opt.w || (W - 1.1), colW: opt.colW,
      fontFace: F, fontSize: opt.fontSize || 11, border: { type: 'solid', pt: 0.5, color: C.line },
      rowH: opt.rowH || 0.3, valign: 'middle', margin: [2, 5, 2, 5], autoPage: false
    });
  }

  /** ctx: {cur, base, rows (отфильтрованные, классифицированные), filterLabel, schemes, ev, acc, oldRows} */
  function build(PptxGenJS, ctx) {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Отчёты по складу ТС';
    pptx.title = `Склад ТС на ${fmtDate(ctx.cur.date)}`;
    const rows = ctx.rows, n = rows.length;
    const g = k => rows.filter(r => r.group === k);
    const g1 = g(1), g2 = g(2), g3 = g(3);
    const a1 = g1.filter(r => r.sub === '1а').length, b1 = g1.length - a1;
    let p = 1;

    /* 1. Титул */
    const t = pptx.addSlide();
    t.background = { color: C.accent };
    t.addText(`Склад ТС на ${fmtDate(ctx.cur.date)}`, { x: 0.8, y: 2.3, w: 11.5, h: 1, fontFace: F, fontSize: 40, bold: true, color: C.white, margin: 0 });
    t.addText(`${ctx.filterLabel} · ${n} ТС`, { x: 0.8, y: 3.35, w: 11.5, h: 0.6, fontFace: F, fontSize: 20, color: 'DCE8F1', margin: 0 });
    t.addText(ctx.base ? `Сравнение с отчётом на ${fmtDate(ctx.base.date)}` : 'Разбивка на три группы и контроль сделок', { x: 0.8, y: 4.0, w: 11.5, h: 0.5, fontFace: F, fontSize: 16, color: 'DCE8F1', margin: 0 });
    t.addText(`Сформировано ${fmtDate(new Date().toISOString().slice(0, 10))}`, { x: 0.8, y: 6.6, w: 6, h: 0.4, fontFace: F, fontSize: 12, color: 'DCE8F1', margin: 0 });

    /* 2. Три группы */
    p++;
    const s2 = frame(pptx, 'Три группы склада', `${pct(g1.length, n)} склада (${g1.length} ТС) уже в прогнозе продаж. ${g3.length} ТС сначала требуют решения по браку или доработке.`, p);
    const cards = [
      [1, g1, 'Продаётся сейчас', `${a1} — клиент или сделка указаны (1а)\n${b1} — прогноз без клиента (1б)`, C.g1, C.g1s],
      [2, g2, 'Исправны, без покупателя', 'Прогноза нет или он на 2027 год.\nНужны условия покупки: лизинг, пакет услуг, трейд-ин.', C.g2, C.g2s],
      [3, g3, 'Сначала решение', 'Брак или доработка без прогноза.\nПо каждому ВИН: ремонт под клиента, продажа «как есть» или 2027.', C.g3, C.g3s]
    ];
    cards.forEach(([k, L, name, txt, col, soft], i) => {
      const x = 0.55 + i * 4.1;
      s2.addShape(pptx.ShapeType.rect, { x, y: 2.0, w: 3.85, h: 4.3, fill: { color: soft }, line: { color: soft } });
      s2.addShape(pptx.ShapeType.rect, { x, y: 2.0, w: 0.1, h: 4.3, fill: { color: col }, line: { color: col } });
      s2.addText(String(L.length), { x: x + 0.35, y: 2.25, w: 3.3, h: 1.0, fontFace: F, fontSize: 54, bold: true, color: col, margin: 0 });
      s2.addText(`${k}. ${name}`, { x: x + 0.35, y: 3.3, w: 3.3, h: 0.45, fontFace: F, fontSize: 18, bold: true, color: C.ink, margin: 0 });
      s2.addText(`${pct(L.length, n)} склада`, { x: x + 0.35, y: 3.75, w: 3.3, h: 0.35, fontFace: F, fontSize: 13, color: C.muted, margin: 0 });
      s2.addText(txt, { x: x + 0.35, y: 4.3, w: 3.3, h: 1.8, fontFace: F, fontSize: 13, color: C.ink, margin: 0, valign: 'top' });
    });

    /* 3. По моделям */
    p++;
    const models = {};
    rows.forEach(r => { const m = models[r.model] = models[r.model] || { a: 0, b: 0, 2: 0, 3: 0, t: 0 }; if (r.group === 1) m[r.sub === '1а' ? 'a' : 'b']++; else m[r.group]++; m.t++; });
    const ml = Object.entries(models).sort((x, y) => y[1].t - x[1].t);
    const top = ml.slice(0, 13), rest = ml.slice(13);
    const mrows = top.map(([m, v]) => [m, v.a || '·', v.b || '·', { text: String(v.a + v.b || '·'), options: { bold: true, fill: { color: C.g1s } } }, v[2] || '·', v[3] || '·', { text: String(v.t), options: { bold: true } }]);
    if (rest.length) { const s = rest.reduce((o, [, v]) => { ['a', 'b', 2, 3, 't'].forEach(k => o[k] += v[k]); return o; }, { a: 0, b: 0, 2: 0, 3: 0, t: 0 }); mrows.push([`Прочие (${rest.length} мод.)`, s.a, s.b, { text: String(s.a + s.b), options: { bold: true, fill: { color: C.g1s } } }, s[2], s[3], { text: String(s.t), options: { bold: true } }]); }
    mrows.push([{ text: 'Итого', options: { bold: true } }, { text: String(a1), options: { bold: true } }, { text: String(b1), options: { bold: true } }, { text: String(g1.length), options: { bold: true, fill: { color: C.g1s } } }, { text: String(g2.length), options: { bold: true } }, { text: String(g3.length), options: { bold: true } }, { text: String(n), options: { bold: true } }]);
    const topModel = ml[0];
    const s3 = frame(pptx, 'Группы по моделям', topModel ? `Больше всего на складе ${topModel[0]}: ${topModel[1].t} ТС, из них в прогнозе ${topModel[1].a + topModel[1].b}, в группе 3 — ${topModel[1][3]}.` : '', p);
    table(s3, ['Модель', '1а', '1б', 'Итого 1', '2', '3', 'Всего'], mrows, { colW: [4.6, 1.2, 1.2, 1.4, 1.2, 1.2, 1.43], rowH: 0.3, fontSize: 11 });

    /* 4. Сигналы */
    p++;
    const sig = [
      ['«Продаётся сейчас» без менеджера', g1.filter(r => r.noMgr).length, 'не с кого спросить за сделку'],
      ['«Продаётся сейчас», но в браке', g1.filter(r => r.brak || r.rework).length, 'ремонт должен успеть к отгрузке'],
      ['Прогноз без клиента (1б)', b1, 'подтвердить, на чём основан прогноз'],
      ['Просроченный прогноз', rows.filter(r => r.overdue).length, 'месяц прогноза уже прошёл'],
      ['Больше года на складе, без покупателя', g2.filter(r => r.ageDays > 365).length, 'кандидаты на особые условия']
    ];
    const s4 = frame(pptx, 'Сигналы', 'Что требует внимания руководителя до следующего отчёта.', p);
    sig.forEach(([l, v, h], i) => {
      const y = 1.95 + i * 0.95;
      s4.addShape(pptx.ShapeType.rect, { x: 0.55, y, w: 12.2, h: 0.8, fill: { color: v ? C.g2s : C.bg }, line: { color: v ? C.g2s : C.bg } });
      s4.addText(String(v), { x: 0.75, y, w: 1.4, h: 0.8, fontFace: F, fontSize: 28, bold: true, color: v ? C.g2 : C.muted, valign: 'middle', margin: 0 });
      s4.addText([{ text: l, options: { bold: true, color: C.ink, fontSize: 16, breakLine: true } }, { text: h, options: { color: C.muted, fontSize: 12 } }], { x: 2.3, y, w: 10.2, h: 0.8, fontFace: F, valign: 'middle', margin: 0 });
    });

    /* 5. Ответственные */
    p++;
    const by = {};
    g1.forEach(r => (by[r.mgr] = by[r.mgr] || []).push(r));
    const ord = Object.keys(by).sort((x, y) => (by[x][0].noMgr - by[y][0].noMgr) || by[y].length - by[x].length);
    const named = ord.filter(m => !by[m][0].noMgr), unnamed = ord.filter(m => by[m][0].noMgr);
    const mk = m => { const L = by[m]; return [cut(m, 48), L.length, L.filter(r => r.sub === '1а').length, L.filter(r => r.sub === '1б').length || '·', L.filter(r => r.overdue).length || '·', L.filter(r => r.brak || r.rework).length || '·']; };
    const prow = named.slice(0, 11).map(mk);
    if (named.length > 11) { const L = named.slice(11).flatMap(m => by[m]); prow.push([`Другие менеджеры (${named.length - 11})`, L.length, L.filter(r => r.sub === '1а').length, L.filter(r => r.sub === '1б').length, L.filter(r => r.overdue).length, L.filter(r => r.brak || r.rework).length]); }
    if (unnamed.length) { const L = unnamed.flatMap(m => by[m]); prow.push([{ text: 'Менеджер не назначен', options: { italic: true, color: C.g2 } }, L.length, L.filter(r => r.sub === '1а').length, L.filter(r => r.sub === '1б').length, L.filter(r => r.overdue).length, L.filter(r => r.brak || r.rework).length]); }
    const noM = g1.filter(r => r.noMgr).length;
    const s5 = frame(pptx, '«Продаётся сейчас»: ответственные', noM ? `У ${noM} из ${g1.length} ТС в прогнозе не указан менеджер. Без него сорванную сделку не с кого спросить.` : `Все ${g1.length} ТС в прогнозе закреплены за менеджерами.`, p);
    table(s5, ['Ответственный', 'Всего', '1а клиент', '1б без клиента', 'Просрочено', 'Брак'], prow, { colW: [5.6, 1.3, 1.3, 1.6, 1.2, 1.23], rowH: 0.32 });

    /* 6. Другие разбивки */
    p++;
    const s6 = frame(pptx, 'Другие варианты разбивки на три группы', 'Те же машины, разные вопросы: готовность к сделке, доступность льготного лизинга, срок на складе и канал продажи.', p);
    const srows = Object.values(ctx.schemes).map(sc => { const c = { 1: 0, 2: 0, 3: 0 }; rows.forEach(r => c[sc.fn(r)]++); return [{ text: sc.name, options: { bold: true } }, { text: `${c[1]} · ${sc.groups[1]}`, options: { fill: { color: C.g1s } } }, { text: `${c[2]} · ${sc.groups[2]}`, options: { fill: { color: C.g2s } } }, { text: `${c[3]} · ${sc.groups[3]}`, options: { fill: { color: C.g3s } } }]; });
    table(s6, ['Схема', 'Группа 1', 'Группа 2', 'Группа 3'], srows, { colW: [3.4, 2.94, 2.94, 2.95], rowH: 0.55, fontSize: 12, alignLeft: [1, 2, 3] });
    const lc = ctx.leasing || {};
    const lcText = `Условия льготного лизинга в расчёте: выпуск с ${lc.dateFrom ? fmtDate(lc.dateFrom) : '—'} (по ${({ epts: 'дате ЭПТС', year: 'году ВИН', arrival: 'дате прихода' })[lc.basis] || 'дате ЭПТС'})${lc.ecoMin ? ', экокласс от ' + lc.ecoMin : ''}${lc.brands && lc.brands.length ? ', модели: ' + lc.brands.join(', ') : ''}${lc.priceMax ? ', цена до ' + m0(lc.priceMax) + ' млн руб' : ''}${lc.discountPct ? ', скидка ' + lc.discountPct + '%' + (lc.discountMax ? ' до ' + m0(lc.discountMax) + ' млн руб' : '') : ''}.${lc.source ? ' Источник: ' + lc.source + '.' : ''}`;
    s6.addText([{ text: lcText, options: { bold: true, color: C.ink, breakLine: true } }, ...Object.values(ctx.schemes).map(sc => ({ text: `${sc.name}. ${sc.about}`, options: { bullet: true, breakLine: true } }))], { x: 0.55, y: 4.85, w: 12.2, h: 2.0, fontFace: F, fontSize: 12, color: C.muted, valign: 'top', margin: 0, paraSpaceAfter: 4 });

    /* 6б. Надстройки и цены */
    p++;
    const up = ctx.unitPrice || (() => 0);
    const bb = {};
    rows.forEach(r => { const b = bb[r.bodyShort] = bb[r.bodyShort] || { n: 0, 1: 0, 2: 0, 3: 0, val: 0, priced: 0 }; b.n++; b[r.group]++; const pr = up(r); if (pr) { b.val += pr; b.priced++; } });
    const bl = Object.entries(bb).sort((x, y) => y[1].n - x[1].n);
    const totPriced = bl.reduce((s, [, v]) => s + v.priced, 0), totVal = bl.reduce((s, [, v]) => s + v.val, 0);
    const m1 = v => (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
    const brows = bl.slice(0, 14).map(([b, v]) => [b, { text: String(v.n), options: { bold: true } }, v[1] || '·', v[2] || '·', v[3] || '·', v.priced ? m1(v.val) : '—']);
    const sB = frame(pptx, 'Типы надстроек', `${bl[0] ? `Больше всего — ${bl[0][0].toLowerCase()}: ${bl[0][1].n} ТС. ` : ''}${totPriced ? `Стоимость остатка по введённым ценам — ${m1(totVal)} млн руб. (цены есть по ${totPriced} из ${n} ТС).` : 'Цены в выгрузке не указаны; их можно ввести на вкладке «Надстройки и цены».'}`, p);
    table(sB, ['Надстройка', 'ТС', 'Гр. 1', 'Гр. 2', 'Гр. 3', 'Стоимость, млн руб'], brows, { colW: [4.6, 1.4, 1.4, 1.4, 1.4, 2.03], rowH: 0.3 });

    /* 7–9. Сравнение */
    if (ctx.base && ctx.ev) {
      const ev = ctx.ev, cnt = tp => ev.filter(e => e.type === tp).length;
      const g1o = ctx.oldRows.filter(r => r.group === 1).length;
      const soldG1 = ev.filter(e => e.type === 'sold' && e.o.group === 1).length;
      const lost = ev.filter(e => ['refusal', 'unreserved', 'silent'].includes(e.type));
      p++;
      const s7 = frame(pptx, `Что изменилось с ${fmtDate(ctx.base.date)} по ${fmtDate(ctx.cur.date)}`, `Со склада убыло ${cnt('sold')} ТС, из них ${soldG1} из прогноза (${pct(soldG1, g1o)} от ${g1o}). Сорвалось ${cnt('refusal') + cnt('silent') + ev.filter(e => e.type === 'unreserved' && e.n.group !== 1).length}: отказы, снятые резервы и прогнозы без объяснения.`, p);
      const tiles = [['Убыло со склада', cnt('sold'), C.g1], ['Отказ', cnt('refusal'), C.g3], ['Снят резерв / клиент', cnt('unreserved'), C.g3], ['Снят прогноз без объяснения', cnt('silent'), C.g3], ['Перенос срока', cnt('postponed'), C.g2], ['Новые в прогнозе', cnt('newG1'), C.g1], ['Ушли в брак', cnt('toProblem'), C.g3], ['Новые на складе', cnt('arrived'), C.muted]];
      tiles.forEach(([l, v, col], i) => {
        const x = 0.55 + (i % 4) * 3.07, y = 2.1 + Math.floor(i / 4) * 2.2;
        s7.addShape(pptx.ShapeType.rect, { x, y, w: 2.9, h: 1.9, fill: { color: C.bg }, line: { color: C.bg } });
        s7.addShape(pptx.ShapeType.rect, { x, y, w: 2.9, h: 0.08, fill: { color: col }, line: { color: col } });
        s7.addText(String(v), { x: x + 0.25, y: y + 0.3, w: 2.4, h: 0.8, fontFace: F, fontSize: 36, bold: true, color: C.ink, margin: 0 });
        s7.addText(l, { x: x + 0.25, y: y + 1.15, w: 2.5, h: 0.6, fontFace: F, fontSize: 13, color: C.muted, margin: 0, valign: 'top' });
      });

      p++;
      const lrows = lost.slice(0, 14).map(e => [cut(e.o.client || '— клиент не был указан', 34), { text: ({ refusal: 'Отказ', unreserved: 'Снят резерв', silent: 'Без объяснения' })[e.type], options: { color: e.type === 'refusal' ? C.g3 : C.g2, bold: true } }, cut(e.o.model, 16), cut(e.o.mgr, 30), { text: cut(e.why || 'причина не указана', 60), options: { color: e.why ? C.muted : C.g2 } }]);
      const s8 = frame(pptx, 'Кто отказался и кто снял резерв', lost.length ? `${lost.length} ТС выпали из прогноза или потеряли клиента.${lost.length > 14 ? ' Показаны первые 14, полный список — в выгрузке Excel.' : ''}` : 'Срывов за период нет.', p);
      if (lost.length) table(s8, ['Клиент (было)', 'Что произошло', 'Модель', 'Ответственный', 'Объяснение в новом отчёте'], lrows, { colW: [2.9, 1.7, 1.6, 2.7, 3.33], rowH: 0.32, fontSize: 10, alignLeft: [1, 2, 3, 4] });

      p++;
      const acc = ctx.acc.filter(a => a.committed);
      const aNamed = acc.filter(a => !a.mgr.startsWith('—')), aUn = acc.filter(a => a.mgr.startsWith('—'));
      const ar = a => [cut(a.mgr, 44), a.committed, { text: String(a.fulfilled), options: { color: C.g1, bold: true } }, pct(a.fulfilled, a.committed), a.refusal || '·', a.unreserved || '·', { text: String(a.silent || '·'), options: a.silent ? { color: C.g3, bold: true } : {} }, a.postponed || '·', a.kept];
      const arows = aNamed.slice(0, 11).map(ar);
      if (aUn.length) { const s = aUn.reduce((o, a) => { ['committed', 'fulfilled', 'refusal', 'unreserved', 'silent', 'postponed', 'kept'].forEach(k => o[k] += a[k]); return o; }, { mgr: 'Менеджер не назначен', committed: 0, fulfilled: 0, refusal: 0, unreserved: 0, silent: 0, postponed: 0, kept: 0 }); arows.push(ar(s)); }
      const sumC = acc.reduce((s, a) => s + a.committed, 0), sumF = acc.reduce((s, a) => s + a.fulfilled, 0), sumS = acc.reduce((s, a) => s + a.silent, 0);
      const s9 = frame(pptx, 'Спрос с менеджеров', `Выполнено ${pct(sumF, sumC)} прогноза (${sumF} из ${sumC}). ${sumS ? `По ${sumS} ТС прогноз снят без объяснения — первый вопрос к ответственным.` : 'Прогнозов, снятых без объяснения, нет.'}`, p);
      table(s9, ['Ответственный', 'В прогнозе', 'Продано', 'Выполн.', 'Отказ', 'Снят резерв', 'Без объясн.', 'Перенос', 'В работе'], arows, { colW: [4.2, 1.1, 1.0, 1.0, 0.9, 1.15, 1.1, 0.9, 0.88], rowH: 0.32, fontSize: 10.5 });
    }

    /* 10. Дальше */
    p++;
    const fin = Object.values(ctx.schemes).find(s => s.name.includes('льготного')), finN = fin ? rows.filter(r => fin.fn(r) === 1).length : 0;
    const steps = [];
    if (noM) steps.push(`Назначить менеджера на ${noM} ТС из «Продаётся сейчас», где ответственный не указан.`);
    if (b1) steps.push(`Подтвердить клиента по ${b1} ТС с прогнозом без клиента (1б) или снять прогноз.`);
    const br1 = g1.filter(r => r.brak || r.rework).length;
    if (br1) steps.push(`Отремонтировать к отгрузке ${br1} ТС в прогнозе со статусом «брак» / «доработка».`);
    if (g3.length) steps.push(`Принять решение по каждому из ${g3.length} ТС группы 3: ремонт под клиента, продажа «как есть» или перенос в 2027.`);
    if (finN) steps.push(`Подготовить заявки в лизинговые компании к старту льготной программы 1 декабря: по году выпуска под неё подходят ${finN} ТС.`);
    steps.push('Зафиксировать прогноз на этой дате и сравнить со следующей выгрузкой: кто продал, кто сорвал и почему.');
    const s10 = frame(pptx, 'Что делаем до следующего отчёта', '', p);
    s10.addText(steps.map((x, i) => ({ text: x, options: { bullet: { type: 'number' }, breakLine: i < steps.length - 1 } })), { x: 0.55, y: 1.5, w: 12.2, h: 5.2, fontFace: F, fontSize: 18, color: C.ink, valign: 'top', margin: 0, paraSpaceAfter: 12 });

    return pptx;
  }
  return { build };
})();
if (typeof module !== 'undefined') module.exports = Deck;
