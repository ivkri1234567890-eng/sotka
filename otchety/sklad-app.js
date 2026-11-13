/* ===== Интерфейс ===== */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = iso => iso ? iso.split('-').reverse().join('.') : 'дата не определена';
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const GROUP_NAME = { 1: 'Продаётся сейчас', 2: 'Исправны, без покупателя', 3: 'Сначала решение' };
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };

  const state = {
    cur: null, base: null,
    f: Object.assign({ model: '', mgr: '', q: '', group: '', signal: '', scheme: 'deal', sg: '' }, LS.get('stock-filters') || {}),
    sort: { key: 'group', dir: 1 },
    db: null, downloads: null, sample: null, snaps: [], prices: LS.get('stock-prices') || {}, leasingShared: false, docExtract: null
  };

  function mkReport(raw, label, source) {
    return { label, date: raw.date, source, raw: raw.rows, rows: Core.classify(raw.rows, raw.date) };
  }

  /* ---------- фильтры ---------- */
  function rowPass(r, ignoreGroup) {
    const f = state.f;
    if (f.model) {
      const [k, v] = [f.model.slice(0, 2), f.model.slice(2)];
      if (k === 'b:' && r.brand !== v) return false;
      if (k === 'm:' && r.model !== v) return false;
    }
    if (f.mgr && r.mgr !== f.mgr) return false;
    if (!ignoreGroup && f.group) {
      if (f.group === '1а' || f.group === '1б') { if (r.sub !== f.group) return false; }
      else if (String(r.group) !== f.group) return false;
    }
    if (!ignoreGroup && f.signal && !SIGNALS[f.signal].test(r)) return false;
    if (!ignoreGroup && f.sg && Core.SCHEMES[f.scheme] && String(Core.SCHEMES[f.scheme].fn(r)) !== f.sg) return false;
    if (f.q) {
      const q = Core.norm(f.q);
      const hay = Core.norm([r.vin, r.client, r.sklad, r.model, r.body, r.mgr, r.plan, r.problem].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  const filtered = (rows, ig) => rows.filter(r => rowPass(r, ig));

  const SIGNALS = {
    nomgr: { label: '«Продаётся сейчас» без менеджера', hint: 'не с кого спросить за сделку', test: r => r.group === 1 && r.noMgr },
    brak1: { label: '«Продаётся сейчас», но в браке', hint: 'ремонт должен успеть к отгрузке', test: r => r.group === 1 && (r.brak || r.rework) },
    nocl: { label: 'Прогноз без клиента (1б)', hint: 'спросить, на чём основан прогноз', test: r => r.sub === '1б' },
    overdue: { label: 'Просроченный прогноз', hint: 'месяц прогноза уже прошёл', test: r => r.overdue },
    old: { label: 'Больше года на складе, без покупателя', hint: 'кандидаты на особые условия', test: r => r.group === 2 && r.ageDays != null && r.ageDays > 365 }
  };

  function saveFilters() { LS.set('stock-filters', state.f); }

  function buildFilterOptions() {
    const rows = state.cur.rows;
    const brands = {}, models = {};
    rows.forEach(r => { brands[r.brand] = (brands[r.brand] || 0) + 1; (models[r.brand] = models[r.brand] || {})[r.model] = ((models[r.brand] || {})[r.model] || 0) + 1; });
    let html = `<option value="">Все модели (${rows.length})</option>`;
    Object.keys(brands).sort((a, b) => brands[b] - brands[a]).forEach(b => {
      const ms = Object.keys(models[b]).sort((x, y) => models[b][y] - models[b][x]);
      if (ms.length > 1 || ms[0] !== b) html += `<option value="b:${esc(b)}">Все ${esc(b)} (${brands[b]})</option>`;
      ms.forEach(m => { html += `<option value="m:${esc(m)}"> ${esc(m)} (${models[b][m]})</option>`; });
    });
    $('#f-model').innerHTML = html;
    const mg = {};
    rows.forEach(r => { mg[r.mgr] = (mg[r.mgr] || 0) + 1; });
    $('#f-mgr').innerHTML = `<option value="">Все ответственные</option>` + Object.keys(mg).sort((a, b) => (a.startsWith('—') - b.startsWith('—')) || a.localeCompare(b, 'ru')).map(m => `<option value="${esc(m)}">${esc(m)} (${mg[m]})</option>`).join('');
    if (![...$('#f-model').options].some(o => o.value === state.f.model)) state.f.model = '';
    if (![...$('#f-mgr').options].some(o => o.value === state.f.mgr)) state.f.mgr = '';
    $('#f-model').value = state.f.model; $('#f-mgr').value = state.f.mgr; $('#f-q').value = state.f.q;
  }

  function activeChips() {
    const c = [];
    if (state.f.group) c.push(['group', state.f.group.length > 1 ? 'Подгруппа ' + state.f.group : 'Группа ' + state.f.group + ' · ' + GROUP_NAME[state.f.group]]);
    if (state.f.signal) c.push(['signal', SIGNALS[state.f.signal].label]);
    if (state.f.sg && Core.SCHEMES[state.f.scheme]) c.push(['sg', Core.SCHEMES[state.f.scheme].name + ': ' + Core.SCHEMES[state.f.scheme].groups[state.f.sg]]);
    $('#chips').innerHTML = c.map(([k, t]) => `<button class="chip" data-clear="${k}">${esc(t)} <span aria-hidden="true">×</span></button>`).join('');
  }

  /* ---------- вкладки ---------- */
  const TABS = ['groups', 'pipeline', 'compare', 'bodies', 'list'];
  function currentTab() { const h = location.hash.replace('#', ''); return TABS.includes(h) ? h : 'groups'; }
  function render() {
    $('#empty').hidden = !!state.cur;
    document.querySelector('main').hidden = !state.cur;
    document.querySelectorAll('.need-data').forEach(x => x.hidden = !state.cur);
    if (!state.cur) return;
    const t = currentTab();
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
    document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== 'p-' + t);
    $('#cur-label').textContent = `${state.cur.label} · ${state.cur.rows.length} ТС`;
    activeChips();
    applyPrices();
    ({ groups: renderGroups, pipeline: renderPipeline, compare: renderCompare, bodies: renderBodies, list: renderList })[t]();
  }
  function go(tab, patch) { if (patch) { Object.assign(state.f, patch); saveFilters(); } if (location.hash !== '#' + tab) location.hash = tab; else render(); }

  /* ---------- 1. Три группы ---------- */
  function renderGroups() {
    const rows = filtered(state.cur.rows, true);
    const n = rows.length;
    const g = k => rows.filter(r => r.group === k);
    const g1 = g(1), g2 = g(2), g3 = g(3);
    const a = g1.filter(r => r.sub === '1а').length, b = g1.length - a;
    const card = (k, list, sub) => `
      <button class="gcard g${k}" data-go-group="${k}">
        <span class="gnum">${list.length}</span>
        <span class="gname">${k}. ${GROUP_NAME[k]}</span>
        <span class="gshare">${pct(list.length, n)} склада</span>
        <span class="gsub">${sub}</span>
      </button>`;
    const sig = Object.entries(SIGNALS).map(([k, s]) => {
      const c = rows.filter(s.test).length;
      return `<li><button class="sig${c ? '' : ' zero'}" data-go-signal="${k}"><b>${c}</b><span>${esc(s.label)}<small>${esc(s.hint)}</small></span></button></li>`;
    }).join('');
    const models = {};
    rows.forEach(r => { const m = models[r.model] = models[r.model] || { '1а': 0, '1б': 0, 2: 0, 3: 0, t: 0, brand: r.brand }; m[r.group === 1 ? r.sub : r.group]++; m.t++; });
    const cell = (m, k, v) => v ? `<button class="num" data-go-model="${esc(m)}" data-go-g="${k}">${v}</button>` : '<span class="dim">·</span>';
    const mrows = Object.entries(models).sort((x, y) => y[1].t - x[1].t).map(([m, v]) => `<tr><th scope="row">${esc(m)}</th><td>${cell(m, '1а', v['1а'])}</td><td>${cell(m, '1б', v['1б'])}</td><td class="g1tot">${cell(m, '1', v['1а'] + v['1б'])}</td><td>${cell(m, '2', v[2])}</td><td>${cell(m, '3', v[3])}</td><td class="tot">${v.t}</td></tr>`).join('');
    const sc = Core.SCHEMES[state.f.scheme] || Core.SCHEMES.deal;
    const switcher = `<div class="schemes" role="radiogroup" aria-label="Схема разбиения">${Object.entries(Core.SCHEMES).map(([k, v]) => `<button class="seg" role="radio" aria-checked="${k === (Core.SCHEMES[state.f.scheme] ? state.f.scheme : 'deal')}" data-scheme="${k}">${esc(v.name)}</button>`).join('')}</div><p class="note scheme-about">${esc(sc.about)}</p>`;
    const allT = `<section><h2>Все схемы рядом</h2><div class="scroll"><table class="schemes-t"><thead><tr><th>Схема</th><th>Группа 1</th><th>Группа 2</th><th>Группа 3</th></tr></thead><tbody>${Object.entries(Core.SCHEMES).map(([k, v]) => { const c = { 1: 0, 2: 0, 3: 0 }; rows.forEach(r => c[v.fn(r)]++); return `<tr><th scope="row"><button class="sort" data-scheme="${k}">${esc(v.name)}</button></th>${[1, 2, 3].map(i => `<td class="sg${i}"><b>${c[i]}</b> ${esc(v.groups[i])}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div></section>`;
    if (state.f.scheme && state.f.scheme !== 'deal' && Core.SCHEMES[state.f.scheme]) {
      const G = { 1: [], 2: [], 3: [] }; rows.forEach(r => G[sc.fn(r)].push(r));
      const mm = {}; rows.forEach(r => { const m = mm[r.model] = mm[r.model] || { 1: 0, 2: 0, 3: 0, t: 0 }; m[sc.fn(r)]++; m.t++; });
      const c2 = (m, k, v) => v ? `<button class="num" data-go-sg="${k}" data-go-sg-model="${esc(m)}">${v}</button>` : '<span class="dim">·</span>';
      $('#p-groups').innerHTML = switcher + `
        ${state.f.scheme === 'finance' ? leasingPanel(rows) : ''}
        <div class="cards">${[1, 2, 3].map(k => `<button class="gcard g${k}" data-go-sg="${k}"><span class="gnum">${G[k].length}</span><span class="gname">${k}. ${esc(sc.groups[k])}</span><span class="gshare">${pct(G[k].length, n)} склада · в прогнозе ${G[k].filter(r => r.group === 1).length}</span><span class="gsub">${esc(sc.hint[k])}</span></button>`).join('')}</div>
        <section><h2>По моделям</h2><div class="scroll"><table class="matrix"><thead><tr><th>Модель</th>${[1, 2, 3].map(k => `<th>${esc(sc.groups[k])}</th>`).join('')}<th>Всего</th></tr></thead><tbody>${Object.entries(mm).sort((x, y) => y[1].t - x[1].t).map(([m, v]) => `<tr><th scope="row">${esc(m)}</th><td>${c2(m, 1, v[1])}</td><td>${c2(m, 2, v[2])}</td><td>${c2(m, 3, v[3])}</td><td class="tot">${v.t}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Итого</th><td>${G[1].length}</td><td>${G[2].length}</td><td>${G[3].length}</td><td class="tot">${n}</td></tr></tfoot></table></div><p class="note">Нажмите на число, чтобы открыть список машин.</p></section>${allT}`;
      return;
    }
    $('#p-groups').innerHTML = switcher + `
      <div class="cards">
        ${card(1, g1, `${a} — сделка или клиент указаны (1а) · ${b} — прогноз без клиента (1б)`)}
        ${card(2, g2, 'Прогноза нет или он на 2027 год. Нужны условия покупки: лизинг, пакет услуг, трейд-ин.')}
        ${card(3, g3, 'Брак или доработка без прогноза. По каждому ВИН: ремонт под клиента, продажа «как есть» или 2027.')}
      </div>
      <div class="two">
        <section><h2>Сигналы</h2><ul class="sigs">${sig}</ul></section>
        <section><h2>По моделям</h2>
          <div class="scroll"><table class="matrix"><thead><tr><th>Модель</th><th title="Продаётся сейчас: клиент указан">1а</th><th title="Продаётся сейчас: без клиента">1б</th><th class="g1tot" title="Продаётся сейчас: 1а + 1б">Итого 1</th><th>2</th><th>3</th><th>Всего</th></tr></thead><tbody>${mrows || '<tr><td colspan="7">Нет машин под фильтр</td></tr>'}</tbody><tfoot><tr><th scope="row">Итого</th><td>${a}</td><td>${b}</td><td class="g1tot">${g1.length}</td><td>${g2.length}</td><td>${g3.length}</td><td class="tot">${n}</td></tr></tfoot></table></div>
          <p class="note">Нажмите на число, чтобы открыть список машин.</p>
        </section>
      </div>${allT}`;
  }

  /* ---------- 2. Продаётся сейчас: по менеджерам ---------- */
  function renderPipeline() {
    const rows = filtered(state.cur.rows, true).filter(r => r.group === 1);
    const by = {};
    rows.forEach(r => (by[r.mgr] = by[r.mgr] || []).push(r));
    const months = [...new Set(rows.map(r => r.monthLabel).filter(Boolean))].sort((x, y) => Core.MONTHS.indexOf(x.split(' ')[0]) - Core.MONTHS.indexOf(y.split(' ')[0]));
    const order = Object.keys(by).sort((x, y) => (by[x][0].noMgr - by[y][0].noMgr) || by[y].length - by[x].length);
    const body = order.map((m, i) => {
      const L = by[m];
      const c = f => L.filter(f).length;
      const det = L.sort((x, y) => (x.fKey || 0) - (y.fKey || 0)).map(r => `<tr><td class="mono">${esc(r.vin)}</td><td>${esc(r.model)}${r.body ? '<small>' + esc(r.body) + '</small>' : ''}</td><td>${r.client ? esc(r.client) : '<span class="warn">клиент не указан</span>'}</td><td>${esc(r.monthLabel)}${r.overdue ? ' <span class="pill red">просрочен</span>' : ''}</td><td>${(r.brak || r.rework) ? '<span class="pill red">' + (r.brak ? 'брак' : 'доработка') + '</span>' : ''}</td><td class="clip">${esc(r.plan || r.problem)}</td></tr>`).join('');
      return `<tbody class="mgr${L[0].noMgr ? ' nomgr' : ''}"><tr class="mrow" data-toggle="${i}"><th scope="row"><span class="caret" aria-hidden="true">▸</span>${esc(m)}</th><td>${L.length}</td><td>${c(r => r.sub === '1а')}</td><td class="${c(r => r.sub === '1б') ? 'warn' : ''}">${c(r => r.sub === '1б')}</td>${months.map(mo => `<td>${c(r => r.monthLabel === mo) || '<span class="dim">·</span>'}</td>`).join('')}<td class="${c(r => r.overdue) ? 'warn' : ''}">${c(r => r.overdue)}</td><td class="${c(r => r.brak || r.rework) ? 'warn' : ''}">${c(r => r.brak || r.rework)}</td></tr>
        <tr class="det" data-det="${i}" hidden><td colspan="${6 + months.length}"><div class="scroll"><table class="inner"><thead><tr><th>ВИН</th><th>Модель</th><th>Клиент</th><th>Месяц</th><th></th><th>План / проблема</th></tr></thead><tbody>${det}</tbody></table></div></td></tr></tbody>`;
    }).join('');
    const noMgr = rows.filter(r => r.noMgr).length;
    $('#p-pipeline').innerHTML = `
      <div class="bar">
        <p class="lead"><b>${rows.length}</b> ТС в группе «Продаётся сейчас» под фильтром. ${noMgr ? `<span class="warn">${noMgr} без менеджера</span> — ответственным показан куратор или направление.` : ''}</p>
        <div class="actions">
          <button class="btn primary" id="fix-btn" ${(state.db || LOCAL) ? '' : 'disabled title="Хранилище недоступно в этом окне"'}>Зафиксировать прогноз на ${esc(fmtDate(state.cur.date))}</button>
          <button class="btn" data-export="pipeline">Выгрузить в Excel</button>
        </div>
      </div>
      <p class="note">Фиксация сохраняет этот отчёт как точку отсчёта. При следующей выгрузке вкладка «Сравнение» покажет по каждому менеджеру: что продано, что сорвалось и почему.</p>
      <div class="scroll"><table class="pipe"><thead><tr><th>Ответственный</th><th>Всего</th><th>1а клиент</th><th>1б без клиента</th>${months.map(m => `<th>${esc(m)}</th>`).join('')}<th>Просрочено</th><th>Брак</th></tr></thead>${body || '<tbody><tr><td colspan="9">Нет машин под фильтр</td></tr></tbody>'}</table></div>
      <p id="fix-msg" class="note" role="status"></p>`;
  }

  /* ---------- 3. Сравнение ---------- */
  function evPass(e) { const r = e.n || e.o; return rowPass(r, true); }
  function renderCompare() {
    const el = $('#p-compare');
    const snapOpts = state.snaps.map(s => `<option value="${esc(s.id)}">${esc(s.label)} · ${s.count} ТС</option>`).join('');
    const head = `
      <div class="cmp-src">
        <div><span class="lbl">Было (база)</span><b>${state.base ? esc(state.base.label) : 'не выбрано'}</b></div>
        <div><span class="lbl">Стало</span><b>${esc(state.cur.label)}</b></div>
        <div class="actions">
          <label class="btn">Загрузить два отчёта<input type="file" id="two-files" accept=".xlsx,.xls,.xlsm" multiple hidden></label>
          <label class="btn">Выбрать базу файлом<input type="file" id="base-file" accept=".xlsx,.xls,.xlsm" hidden></label>
 ${(state.db || LOCAL) ? `<select id="snap-sel" aria-label="Сохранённые фиксации"><option value="">Сохранённые фиксации…</option>${snapOpts}</select>` : ''}
        </div>
      </div>`;
    if (!state.base) {
      el.innerHTML = head + `<div class="empty"><p>Чтобы увидеть, кто отказался и кто снял резерв, нужен второй отчёт.</p><p>Загрузите два отчёта разом, или выберите базу: более ранний файл или сохранённую фиксацию. Новый отчёт, загруженный кнопкой вверху, автоматически сравнивается с предыдущим.</p></div>`;
      return;
    }
    let [o, n] = [state.base, state.cur];
    const evAll = Core.compare(o.rows, n.rows);
    const ev = evAll.filter(evPass);
    const oldF = filtered(o.rows, true);
    const cnt = t => ev.filter(e => e.type === t).length;
    const g1o = oldF.filter(r => r.group === 1).length;
    const soldG1 = ev.filter(e => e.type === 'sold' && e.o.group === 1).length;
    const dropped = ['refusal', 'silent'].reduce((s, t) => s + cnt(t), 0) + ev.filter(e => e.type === 'unreserved' && e.o.group === 1 && e.n.group !== 1).length;
    const tiles = [['sold', 'good'], ['refusal', 'bad'], ['unreserved', 'bad'], ['silent', 'bad'], ['postponed', 'warn'], ['clientChanged', 'warn'], ['newG1', 'good'], ['repaired', 'good'], ['toProblem', 'bad'], ['arrived', '']]
      .map(([t, tone]) => `<a class="tile ${tone}" href="#ev-${t}"><b>${cnt(t)}</b><span>${esc(Core.EVENT[t])}</span></a>`).join('');
    const acc = Core.accountability(oldF, ev).filter(a => a.committed || a.soldExtra);
    const accRows = acc.map(a => `<tr${a.mgr.startsWith('—') ? ' class="nomgr"' : ''}><th scope="row">${esc(a.mgr)}</th><td>${a.committed}</td><td class="good">${a.fulfilled}</td><td>${pct(a.fulfilled, a.committed)}</td><td class="${a.refusal ? 'bad' : ''}">${a.refusal}</td><td class="${a.unreserved ? 'bad' : ''}">${a.unreserved}</td><td class="${a.silent ? 'bad' : ''}">${a.silent}</td><td>${a.postponed}</td><td>${a.kept}</td><td>${a.soldExtra}</td></tr>`).join('');
    const lost = ev.filter(e => ['refusal', 'unreserved', 'silent'].includes(e.type));
    const lostRows = lost.map(e => `<tr><td>${e.o.client ? esc(e.o.client) : '<span class="dim">клиент не был указан</span>'}</td><td><span class="pill ${e.type === 'refusal' ? 'red' : e.type === 'unreserved' ? 'amber' : 'grey'}">${esc(Core.EVENT[e.type])}</span></td><td class="mono">${esc(e.vin)}</td><td>${esc(e.o.model)}</td><td>${esc(e.o.mgr)}</td><td>${esc(e.o.monthLabel)} → ${e.n.group === 1 ? esc(e.n.monthLabel) : 'группа ' + e.n.group}</td><td class="clip">${esc(e.why) || '<span class="warn">причина не указана</span>'}</td></tr>`).join('');
    const detail = ['sold', 'postponed', 'clientChanged', 'newG1', 'repaired', 'toProblem', 'arrived'].map(t => {
      const L = ev.filter(e => e.type === t);
      if (!L.length) return '';
      return `<details id="ev-${t}"><summary>${esc(Core.EVENT[t])} · ${L.length}</summary><div class="scroll"><table class="inner"><thead><tr><th>ВИН</th><th>Модель</th><th>Ответственный</th><th>Было</th><th>Стало</th></tr></thead><tbody>${L.map(e => `<tr><td class="mono">${esc(e.vin)}</td><td>${esc((e.n || e.o).model)}</td><td>${esc((e.o || e.n).mgr)}</td><td>${e.o ? 'гр. ' + e.o.group + (e.o.monthLabel ? ' · ' + esc(e.o.monthLabel) : '') + (e.o.client ? ' · ' + esc(e.o.client) : '') : '—'}</td><td>${e.n ? 'гр. ' + e.n.group + (e.n.monthLabel ? ' · ' + esc(e.n.monthLabel) : '') + (e.n.client ? ' · ' + esc(e.n.client) : '') : 'нет на складе'}</td></tr>`).join('')}</tbody></table></div></details>`;
    }).join('');
    el.innerHTML = head + `
      <p class="lead">С ${esc(fmtDate(o.date))} по ${esc(fmtDate(n.date))}: со склада убыло <b>${cnt('sold')}</b> ТС, из них <b>${soldG1}</b> из «Продаётся сейчас» (${pct(soldG1, g1o)} от ${g1o} в прогнозе). Сорвалось <b>${dropped}</b>: отказов ${cnt('refusal')}, снятых резервов ${ev.filter(e => e.type === 'unreserved').length}, без объяснения ${cnt('silent')}. Срок перенесён у ${cnt('postponed')}.</p>
      <div class="tiles">${tiles}</div>
      <section><h2 id="ev-refusal">Кто отказался и кто снял резерв · ${lost.length}</h2>
        ${lost.length ? `<div class="scroll"><table class="list"><thead><tr><th>Клиент (было)</th><th>Что произошло</th><th>ВИН</th><th>Модель</th><th>Ответственный</th><th>Прогноз</th><th>Объяснение в новом отчёте</th></tr></thead><tbody>${lostRows}</tbody></table></div>` : '<p class="note">Срывов нет.</p>'}
        <span id="ev-unreserved"></span><span id="ev-silent"></span>
      </section>
      <section><h2>Спрос с менеджеров</h2>
        <div class="scroll"><table class="acc"><thead><tr><th>Ответственный (по базе)</th><th>В прогнозе</th><th>Продано</th><th>Выполнение</th><th>Отказ</th><th>Снят резерв</th><th>Без объяснения</th><th>Перенос</th><th>Ещё в работе</th><th>Продано сверх прогноза</th></tr></thead><tbody>${accRows || '<tr><td colspan="10">Нет данных под фильтр</td></tr>'}</tbody></table></div>
        <p class="note">«Ещё в работе» — машины из прогноза базы, которые остались в «Продаётся сейчас». «Без объяснения» — прогноз сняли, а в проблематике и плане нет ни отказа, ни снятого резерва: это первый вопрос к менеджеру.</p>
      </section>
      <section><h2>Подробно</h2>${detail || '<p class="note">Других изменений нет.</p>'}</section>
      <div class="actions"><button class="btn" data-export="compare">Выгрузить сравнение в Excel</button></div>`;
  }

  /* ---------- 4. Список ---------- */
  const COLS = [
    ['group', 'Группа', r => r.group + (r.sub ? r.sub.slice(1) : '')],
    ['vin', 'ВИН', r => r.vin], ['model', 'Модель', r => r.model], ['body', 'Надстройка', r => r.body], ['year', 'Год', r => r.year],
    ['status', 'Статус', r => r.status], ['client', 'Клиент', r => r.client], ['monthLabel', 'Прогноз', r => r.fKey || 0],
    ['mgr', 'Ответственный', r => r.mgr], ['sklad', 'Склад', r => r.sklad], ['ageDays', 'Дней на складе', r => r.ageDays || 0], ['plan', 'План / проблема', r => r.plan || r.problem]
  ];
  function renderList() {
    const rows = filtered(state.cur.rows).slice();
    const col = COLS.find(c => c[0] === state.sort.key) || COLS[0];
    rows.sort((a, b) => { const x = col[2](a), y = col[2](b); return (x > y ? 1 : x < y ? -1 : 0) * state.sort.dir; });
    const gp = r => `<span class="pill g${r.group}">${r.group}${r.sub ? r.sub.slice(1) : ''}</span>`;
    const tr = rows.map(r => `<tr><td>${gp(r)}</td><td class="mono">${esc(r.vin)}</td><td>${esc(r.model)}</td><td>${esc(r.body)}</td><td>${esc(r.year)}</td><td>${(r.brak || r.rework) ? '<span class="pill red">' + (r.brak ? 'брак' : 'доработка') + '</span>' : '<span class="dim">в продаже</span>'}</td><td>${esc(r.client)}</td><td>${esc(r.monthLabel)}${r.overdue ? ' <span class="pill red">просрочен</span>' : ''}</td><td class="${r.noMgr ? 'dim' : ''}">${esc(r.mgr)}</td><td class="clip s">${esc(r.sklad)}</td><td class="r">${r.ageDays == null ? '' : r.ageDays}</td><td class="clip">${esc(r.plan || r.problem)}</td></tr>`).join('');
    $('#p-list').innerHTML = `
      <div class="bar"><p class="lead"><b>${rows.length}</b> ТС под фильтром.</p><div class="actions"><button class="btn" data-export="list">Выгрузить в Excel</button></div></div>
      <div class="scroll"><table class="list"><thead><tr>${COLS.map(c => `<th><button class="sort" data-sort="${c[0]}">${c[1]}${state.sort.key === c[0] ? (state.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead><tbody>${tr || '<tr><td colspan="12">Нет машин под фильтр</td></tr>'}</tbody></table></div>`;
  }

  /* ---------- загрузка файлов ---------- */
  async function readFile(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    let best = null;
    for (const name of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
      try { const p = Core.parseAOA(aoa, file.name); if (!best || p.rows.length > best.rows.length) best = p; } catch (e) { if (!best && name === wb.SheetNames[wb.SheetNames.length - 1]) throw e; }
    }
    if (!best) throw new Error('Не удалось прочитать файл.');
    if (!best.date) best.date = new Date().toISOString().slice(0, 10);
    return mkReport(best, `${fmtDate(best.date)} · ${file.name}`, 'file');
  }
  function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = bad ? 'bad show' : 'show'; clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 6000); }

  async function loadMain(file) {
    try {
      const r = await readFile(file);
      if (state.cur && state.cur.date <= r.date) state.base = state.cur;
      state.cur = r;
      if (LOCAL) { try { localStorage.setItem('sklad-last', JSON.stringify({ date: r.date, label: r.label, rows: r.raw })); } catch (e) { } }
      buildFilterOptions(); render();
      toast(`Загружен отчёт на ${fmtDate(r.date)}: ${r.rows.length} ТС.${state.base ? ' Сравнение с ' + fmtDate(state.base.date) + ' — на вкладке «Сравнение».' : ''}`);
    } catch (e) { toast(e.message, true); }
  }
  async function loadTwo(files) {
    try {
      if (files.length !== 2) throw new Error('Выберите ровно два файла: старый и новый отчёт.');
      const rs = await Promise.all([...files].map(readFile));
      rs.sort((a, b) => a.date < b.date ? -1 : 1);
      if (rs[0].date === rs[1].date) toast('У обоих отчётов одна дата — проверьте, что выбраны разные выгрузки.', true);
      [state.base, state.cur] = rs;
      buildFilterOptions(); go('compare');
    } catch (e) { toast(e.message, true); }
  }
  async function loadBase(file) {
    try { const r = await readFile(file); if (!state.cur) { state.cur = r; buildFilterOptions(); render(); return; } if (r.date > state.cur.date) { state.base = state.cur; state.cur = r; buildFilterOptions(); } else state.base = r; go('compare'); }
    catch (e) { toast(e.message, true); }
  }

  /* ---------- сохранение файла: claude.ai, приложение iOS или обычный браузер ---------- */
  const LOCAL = !window.claude;
  async function saveFile(name, bytes) {
    if (state.downloads) return state.downloads.save({ filename: name, data: bytes });
    const bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.saveReport;
    if (bridge) { let b = ''; for (let i = 0; i < bytes.length; i += 32768) b += String.fromCharCode(...bytes.subarray(i, i + 32768)); bridge.postMessage({ name, base64: btoa(b) }); return; }
    if (!LOCAL) throw { code: 'unavailable', message: 'скачивание недоступно в этом окне' };
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  /* ---------- экспорт ---------- */
  function sheetRows(rows) {
    return rows.map(r => ({ 'Группа': r.group + (r.sub ? ' (' + r.sub + ')' : ''), 'Группа: название': GROUP_NAME[r.group], 'ВИН': r.vin, 'Модель': r.model, 'Класс': r.cls, 'Надстройка': r.body, 'Год': r.year, 'Статус': r.status, 'Клиент': r.client, 'Прогноз (месяц)': r.monthLabel, 'Прогноз просрочен': r.overdue ? 'да' : '', 'Ответственный': r.mgr, 'Склад': r.sklad, 'Дней на складе': r.ageDays, 'Проблематика': r.problem, 'План мероприятий': r.plan }));
  }
  async function exportXlsx(kind) {
    const wb = XLSX.utils.book_new();
    let name;
    if (kind === 'list') { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows(filtered(state.cur.rows))), 'Список'); name = `Склад ТС ${fmtDate(state.cur.date)}.xlsx`; }
    if (kind === 'pipeline') {
      const rows = filtered(state.cur.rows, true).filter(r => r.group === 1).sort((a, b) => a.mgr.localeCompare(b.mgr, 'ru'));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows(rows)), 'Продаётся сейчас'); name = `Продаётся сейчас ${fmtDate(state.cur.date)}.xlsx`;
    }
    if (kind === 'compare' && state.base) {
      const ev = Core.compare(state.base.rows, state.cur.rows).filter(evPass);
      const data = ev.map(e => ({ 'Событие': Core.EVENT[e.type], 'ВИН': e.vin, 'Модель': (e.n || e.o).model, 'Ответственный (база)': e.o ? e.o.mgr : '', 'Клиент было': e.o ? e.o.client : '', 'Клиент стало': e.n ? e.n.client : '', 'Группа было': e.o ? e.o.group : '', 'Группа стало': e.n ? e.n.group : '', 'Прогноз было': e.o ? e.o.monthLabel : '', 'Прогноз стало': e.n ? e.n.monthLabel : '', 'Объяснение': e.why }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'События');
      const acc = Core.accountability(filtered(state.base.rows, true), ev).map(a => ({ 'Ответственный': a.mgr, 'В прогнозе': a.committed, 'Продано': a.fulfilled, 'Выполнение, %': a.committed ? Math.round(a.fulfilled / a.committed * 100) : '', 'Отказ': a.refusal, 'Снят резерв': a.unreserved, 'Без объяснения': a.silent, 'Перенос': a.postponed, 'Ещё в работе': a.kept, 'Продано сверх прогноза': a.soldExtra }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(acc), 'Менеджеры');
      name = `Сравнение ${fmtDate(state.base.date)} - ${fmtDate(state.cur.date)}.xlsx`;
    }
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    try { await saveFile(name, new Uint8Array(data)); }
    catch (e) { if (e && e.code !== 'declined') toast('Не удалось сохранить файл: ' + (e.message || e.code), true); }
  }


  /* ---------- цены ---------- */
  const priceKey = r => r.model + '|' + r.bodyShort;
  function applyPrices() {
    for (const rep of [state.cur, state.base]) if (rep) rep.rows.forEach(r => { r.manualPrice = state.prices[priceKey(r)] || ''; });
  }
  const unitPrice = r => r.price || r.manualPrice || 0;
  const mln = v => v ? (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '';
  const MARKET = {
    'Валдай 8': '4,4–4,8 (2024 г.в.); 5,05–5,1 (2026)', 'Валдай Next': '4,4–5,1', 'Валдай 12': '5,15–6,77', 'Валдай 18': '8,47–8,73', 'Валдай 45': '—',
    'Газон Next': '4,76–6,42', 'Газель Next': '2,68–3,74', 'Газель NN': '3,1–4,19', 'Газель City': '5,11–5,24', 'Газель БИЗНЕС': '2,28–2,78',
    'Соболь': '1,83–2,14', 'Соболь NN': '—', 'Соболь-Баргузин': '—', 'Садко Next': '6,41', 'Садко 9': '—',
    'Вектор NEXT': '6,91–7,9', 'CITYMAX 9': '12,56 (с лиз. скидкой)', 'ПАЗ Classic': '5,04–5,85', 'ВОЛГАБАС': '9,5–11,5 (по файлу)'
  };
  let priceT;
  function savePrices() {
    LS.set('stock-prices', state.prices);
    clearTimeout(priceT);
    priceT = setTimeout(async () => {
      if (!state.db) { $('#price-msg') && ($('#price-msg').textContent = LOCAL ? 'Цены сохранены на этом устройстве.' : ''); return; }
      try { await state.db.doc('settings/prices').set({ map: state.prices, updatedAt: new Date().toISOString() }); $('#price-msg') && ($('#price-msg').textContent = 'Цены сохранены и видны всем, у кого есть доступ к странице.'); }
      catch (e) { $('#price-msg') && ($('#price-msg').textContent = 'Цены сохранены только в этом браузере: нет прав на запись в общее хранилище.'); }
    }, 800);
  }

  /* ---------- 5. Надстройки и цены ---------- */
  function renderBodies() {
    const rows = filtered(state.cur.rows, true);
    const fin = Core.SCHEMES.finance.fn;
    const byBody = {};
    rows.forEach(r => { const b = byBody[r.bodyShort] = byBody[r.bodyShort] || { n: 0, 1: 0, 2: 0, 3: 0, models: new Set(), val: 0, priced: 0 }; b.n++; b[r.group]++; b.models.add(r.model); const p = unitPrice(r); if (p) { b.val += p; b.priced++; } });
    const bodyRows = Object.entries(byBody).sort((x, y) => y[1].n - x[1].n).map(([b, v]) => `<tr><th scope="row">${esc(b)}</th><td>${v.n}</td><td>${v[1] || '<span class="dim">·</span>'}</td><td>${v[2] || '<span class="dim">·</span>'}</td><td>${v[3] || '<span class="dim">·</span>'}</td><td>${v.models.size}</td><td>${v.priced ? mln(v.val) : '<span class="dim">—</span>'}</td></tr>`).join('');
    const cells = {};
    rows.forEach(r => {
      const k = priceKey(r);
      const c = cells[k] = cells[k] || { model: r.model, body: r.bodyShort, brand: r.brand, rows: [] };
      c.rows.push(r);
    });
    const list = Object.values(cells).sort((x, y) => x.brand.localeCompare(y.brand, 'ru') || x.model.localeCompare(y.model, 'ru') || y.rows.length - x.rows.length);
    let totVal = 0, totPriced = 0, totN = 0, totDisc = 0;
    const det = list.map(c => {
      const L = c.rows, n = L.length; totN += n;
      const filePrices = L.map(r => r.price).filter(Boolean);
      const filePrice = filePrices.length ? filePrices.reduce((a, b) => a + b, 0) / filePrices.length : 0;
      const manual = state.prices[c.model + '|' + c.body] || '';
      const price = filePrice || manual;
      const ages = L.map(r => r.ageDays).filter(v => v != null).sort((a, b) => a - b);
      const med = ages.length ? ages[Math.floor(ages.length / 2)] : '';
      const elig = L.filter(r => fin(r) === 1).length;
      const disc = price ? Core.leasingDiscount(price) : 0;
      if (price) { totVal += price * n; totPriced += n; totDisc += disc * elig; }
      const g = k => L.filter(r => r.group === k).length || '<span class="dim">·</span>';
      const priceCell = filePrice ? `<span title="Средняя цена из файла">${mln(filePrice)}</span>` : `<input class="price" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Цена за единицу, млн руб: ${esc(c.model)}, ${esc(c.body)}" data-price="${esc(c.model + '|' + c.body)}" value="${manual ? (manual / 1e6) : ''}" placeholder="млн">`;
      return `<tr><th scope="row">${esc(c.model)}</th><td class="l">${esc(c.body)}</td><td>${n}</td><td>${g(1)}</td><td>${g(2)}</td><td>${g(3)}</td><td>${med}</td><td>${elig || '<span class="dim">·</span>'}</td><td>${priceCell}</td><td>${price ? mln(price * n) : '<span class="dim">—</span>'}</td><td>${disc ? mln(disc) : '<span class="dim">—</span>'}</td><td class="l dim">${esc(MARKET[c.model] || '—')}</td></tr>`;
    }).join('');
    const hasFile = rows.some(r => r.price);
    $('#p-bodies').innerHTML = `
      <p class="lead">${hasFile ? 'Цены взяты из колонки с ценой в выгрузке; где её нет, цену можно ввести вручную.' : 'В выгрузке нет колонки с ценой. Введите цену за единицу в млн руб — она сохранится и подставится в следующие отчёты, или загрузите выгрузку с колонкой «Цена».'} Стоимость остатка: <b>${totPriced ? mln(totVal) + ' млн руб.' : 'не рассчитана'}</b>${totPriced && totPriced < totN ? ` (цены есть по ${totPriced} из ${totN} ТС)` : ''}.${totDisc ? ` Скидка по льготному лизингу на подходящие ТС: до <b>${mln(totDisc)} млн руб.</b>` : ''}</p>
      <section><h2>Типы надстроек</h2>
        <div class="scroll"><table class="matrix"><thead><tr><th>Надстройка</th><th>ТС</th><th>Гр. 1</th><th>Гр. 2</th><th>Гр. 3</th><th>Моделей</th><th>Стоимость, млн руб</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="7">Нет машин под фильтр</td></tr>'}</tbody></table></div>
      </section>
      <section><h2>Модель × надстройка</h2>
        <div class="scroll"><table class="matrix prices"><thead><tr><th>Модель</th><th class="l">Надстройка</th><th>ТС</th><th>Гр. 1</th><th>Гр. 2</th><th>Гр. 3</th><th title="Медиана">Дней на складе</th><th title="По условиям в панели льготного лизинга">Под льг. лизинг</th><th>Цена за ед., млн руб</th><th>Стоимость остатка, млн</th><th title="По условиям в панели льготного лизинга">Скидка лизинга на ед., млн</th><th class="l">Рыночный ориентир, млн руб</th></tr></thead><tbody>${det}</tbody>
        <tfoot><tr><th scope="row">Итого</th><td></td><td>${totN}</td><td colspan="6"></td><td>${totPriced ? mln(totVal) : ''}</td><td colspan="2"></td></tr></tfoot></table></div>
        <p class="note">Рыночный ориентир — цены новых ТС в объявлениях дилеров на Авто.ру, Дроме и Autospot (октябрь–ноябрь 2026, с НДС), без учёта надстройки и года выпуска. Это не ваш прайс.</p>
        <p class="note" id="price-msg" role="status"></p>
      </section>`;
  }

  /* ---------- условия льготного лизинга ---------- */
  function leasingPanel(rows) {
    const c = Core.getLeasing();
    const brands = [...new Set(state.cur.rows.map(r => r.brand))].sort((a, b) => a.localeCompare(b, 'ru'));
    const reasons = {};
    rows.filter(r => !(r.brak || r.rework)).forEach(r => { const k = Core.leasingCheck(r, unitPrice(r)); k.why.forEach(w => reasons[w] = (reasons[w] || 0) + 1); });
    const rs = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([w, n]) => `<li><b>${n}</b> ${esc(w)}</li>`).join('');
    const ex = state.docExtract;
    return `<details class="leasing" ${state.leasingOpen ? 'open' : ''} id="leasing-box"><summary>Условия льготного лизинга <span class="dim">· выпуск с ${esc(c.dateFrom ? c.dateFrom.split('-').reverse().join('.') : '—')}${c.ecoMin ? ', экокласс от ' + esc(c.ecoMin) : ''}${c.brands.length ? ', модели: ' + esc(c.brands.join(', ')) : ''}${c.priceMax ? ', цена до ' + mln(+c.priceMax) + ' млн' : ''}${c.source ? ' · источник: ' + esc(c.source) : ''}</span></summary>
      <form id="leasing-form" class="lform">
        <label>Выпуск не ранее<input type="date" id="l-date" value="${esc(c.dateFrom)}"></label>
        <label>Дату выпуска брать из<select id="l-basis"><option value="epts"${c.basis === 'epts' ? ' selected' : ''}>Дата ЭПТС</option><option value="year"${c.basis === 'year' ? ' selected' : ''}>Год ВИН</option><option value="arrival"${c.basis === 'arrival' ? ' selected' : ''}>Дата прихода на склад</option></select></label>
        <label>Экокласс не ниже<select id="l-eco">${['', '2', '3', '4', '5'].map(v => `<option value="${v}"${String(c.ecoMin) === v ? ' selected' : ''}>${v || 'любой'}</option>`).join('')}</select></label>
        <label>Предельная цена ТС, млн руб<input type="number" id="l-pmax" min="0" step="0.1" value="${c.priceMax ? +c.priceMax / 1e6 : ''}" placeholder="нет"></label>
        <label>Скидка, %<input type="number" id="l-pct" min="0" max="100" step="0.5" value="${esc(c.discountPct)}"></label>
        <label>Скидка не более, млн руб<input type="number" id="l-dmax" min="0" step="0.05" value="${c.discountMax ? +c.discountMax / 1e6 : ''}" placeholder="нет"></label>
        <fieldset><legend>Модели в программе <span class="dim">(ничего не отмечено — все)</span></legend>${brands.map(b => `<label class="cb"><input type="checkbox" class="l-brand" value="${esc(b)}"${c.brands.includes(b) ? ' checked' : ''}>${esc(b)}</label>`).join('')}</fieldset>
        <label class="wide">Источник и примечание<input type="text" id="l-note" value="${esc(c.note)}" placeholder="Номер и дата постановления, особые условия"></label>
        <div class="actions wide">
          <button class="btn primary" type="submit">Применить условия</button>
          <button class="btn" type="button" id="l-reset">Вернуть по умолчанию</button>
          <label class="btn">Загрузить постановление (PDF, DOCX, TXT)<input type="file" id="l-file" accept=".pdf,.docx,.txt" hidden></label>
        </div>
      </form>
      <div id="l-doc" class="ldoc" role="status">${ex ? ex : ''}</div>
      ${rs ? `<div class="lwhy"><span class="lbl">Почему исправные ТС не подходят</span><ul>${rs}</ul></div>` : ''}
      <p class="note">${state.leasingShared ? 'Условия общие: их видят все, у кого есть доступ к странице.' : (LOCAL ? 'Условия сохраняются на этом устройстве.' : 'Условия сохраняются в этом браузере; общими станут, когда страница откроется с правом записи.')}${c.updatedAt ? ' Изменены ' + esc(c.updatedAt.slice(0, 10).split('-').reverse().join('.')) + '.' : ''}</p>
    </details>`;
  }
  async function saveLeasing(c) {
    c.updatedAt = new Date().toISOString();
    Core.setLeasing(c);
    LS.set('stock-leasing', Core.getLeasing());
    state.leasingOpen = true;
    render();
    if (!state.db) return;
    try { await state.db.doc('settings/leasing').set(Core.getLeasing()); state.leasingShared = true; render(); }
    catch (e) { toast('Условия сохранены только в этом браузере: нет прав на запись в общее хранилище.', true); }
  }
  function readLeasingForm() {
    const v = id => $(id).value;
    return {
      dateFrom: v('#l-date'), basis: v('#l-basis'), ecoMin: v('#l-eco'),
      priceMax: v('#l-pmax') ? Math.round(+v('#l-pmax') * 1e6) : '', discountPct: v('#l-pct') === '' ? '' : +v('#l-pct'),
      discountMax: v('#l-dmax') ? Math.round(+v('#l-dmax') * 1e6) : '', note: v('#l-note'),
      brands: [...document.querySelectorAll('.l-brand:checked')].map(x => x.value), source: Core.getLeasing().source
    };
  }
  const loadScript = src => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить ' + src)); document.head.appendChild(s); });
  async function docText(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.txt')) return await file.text();
    if (name.endsWith('.docx')) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
      const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return r.value;
    }
    if (name.endsWith('.pdf')) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
      const lib = window.pdfjsLib;
      const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      const out = [];
      for (let i = 1; i <= Math.min(doc.numPages, 80); i++) { const pg = await doc.getPage(i); const tc = await pg.getTextContent(); out.push(tc.items.map(t => t.str).join(' ')); }
      return out.join('\n');
    }
    throw new Error('Поддерживаются PDF, DOCX и TXT. Файл .doc сохраните как .docx.');
  }
  async function readDecree(file) {
    const box = () => $('#l-doc');
    const show = h => { state.docExtract = h; if (box()) box().innerHTML = h; };
    state.leasingOpen = true;
    show(`<p>Читаю «${esc(file.name)}»…</p>`);
    let text;
    try { text = (await docText(file)).replace(/\s+/g, ' ').trim(); }
    catch (e) { show(`<p class="bad">${esc(e.message || e)}</p>`); return; }
    if (text.length < 200) { show('<p class="bad">В файле почти нет текста. Если это скан, введите условия вручную.</p>'); return; }
    const excerpt = esc(text.slice(0, 1500));
    if (!state.sample) { show(`<p>Текст прочитан (${text.length.toLocaleString('ru-RU')} знаков), но разбор условий через Claude в этом окне недоступен. Перенесите условия в поля выше вручную.</p><details><summary>Начало текста</summary><p class="quote">${excerpt}…</p></details>`); return; }
    show(`<p>Текст прочитан (${text.length.toLocaleString('ru-RU')} знаков). Claude ищет условия программы… Это может занять до минуты.</p>`);
    const prompt = `Ты помогаешь отделу продаж коммерческой техники в России. Ниже текст нормативного документа о программе льготного лизинга (постановление, правила или письмо). Найди условия, которые относятся к грузовым автомобилям и автобусам (категории N1–N3, M2–M3).
Ответь только JSON такого вида:
{"dateFrom":"YYYY-MM-DD — ТС должно быть выпущено не ранее этой даты, иначе пустая строка","ecoMin":"минимальный экологический класс числом 1-6 или пустая строка","priceMax":"предельная стоимость одного ТС в рублях числом или пустая строка","discountPct":"размер скидки в процентах числом или пустая строка","discountMax":"максимальный размер скидки в рублях числом или пустая строка","scope":"какие категории ТС входят в программу, одной фразой","period":"срок действия программы, одной фразой","other":["другие условия, важные для продажи, до 6 коротких пунктов"],"quotes":["до 3 коротких дословных цитат из документа, на которых основаны цифры"]}
Если у разных категорий ТС разные условия, бери условия для грузовых автомобилей и отметь различия в other. Если условия в тексте нет — пустая строка. Ничего не придумывай.

Текст документа:
${text.slice(0, 120000)}`;
    try {
      const j = await state.sample.json(prompt, { modelTier: 'default' });
      const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? '' : n; };
      const f = Object.assign(readLeasingForm(), {
        dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(j.dateFrom || '') ? j.dateFrom : readLeasingForm().dateFrom,
        ecoMin: num(j.ecoMin) ? String(num(j.ecoMin)) : readLeasingForm().ecoMin,
        priceMax: num(j.priceMax) || '', discountPct: num(j.discountPct) !== '' ? num(j.discountPct) : readLeasingForm().discountPct,
        discountMax: num(j.discountMax) || readLeasingForm().discountMax,
        note: [file.name, j.scope, j.period].filter(Boolean).join(' · ').slice(0, 300)
      });
      const li = a => (a || []).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('');
      state.pendingLeasing = Object.assign(f, { source: file.name });
      show(`<div class="found"><p><b>Claude нашёл в документе</b> (проверьте по тексту, прежде чем применять):</p>
        <ul><li>Выпуск не ранее: <b>${esc(j.dateFrom || 'не указано')}</b></li><li>Экокласс: <b>${esc(j.ecoMin || 'не указан')}</b></li><li>Предельная цена: <b>${num(j.priceMax) ? mln(num(j.priceMax)) + ' млн руб' : 'не указана'}</b></li><li>Скидка: <b>${num(j.discountPct) !== '' ? num(j.discountPct) + '%' : 'не указана'}${num(j.discountMax) ? ', не более ' + mln(num(j.discountMax)) + ' млн руб' : ''}</b></li><li>Категории ТС: ${esc(j.scope || '—')}</li><li>Срок: ${esc(j.period || '—')}</li></ul>
        ${li(j.other) ? `<p><b>Другие условия</b></p><ul>${li(j.other)}</ul>` : ''}
        ${li(j.quotes) ? `<p><b>Цитаты</b></p><ul class="quote">${li(j.quotes)}</ul>` : ''}
        <div class="actions"><button class="btn primary" type="button" id="l-accept">Перенести в условия и применить</button><button class="btn" type="button" id="l-dismiss">Не применять</button></div></div>`);
    } catch (e) {
      const msg = { not_granted: 'Разбор через Claude не разрешён в этом окне.', rate_limited: 'Слишком много запросов, попробуйте позже.', invalid_json: 'Claude не смог вернуть условия в нужном виде. Попробуйте ещё раз или введите вручную.', prompt_too_large: 'Документ слишком большой. Загрузите только нужный раздел.' }[e && e.code] || 'Не удалось разобрать документ' + (e && e.message ? ': ' + e.message : '.');
      show(`<p class="bad">${esc(msg)}</p><details><summary>Начало текста</summary><p class="quote">${excerpt}…</p></details>`);
    }
  }
  async function loadSettings() {
    if (!state.db) return;
    try {
      const [l, p] = await Promise.all([state.db.doc('settings/leasing').get(), state.db.doc('settings/prices').get()]);
      if (l.exists) { Core.setLeasing(l.data()); state.leasingShared = true; }
      if (p.exists && p.data().map) state.prices = Object.assign({}, state.prices, p.data().map);
      render();
    } catch (e) { /* без хранилища */ }
  }

  /* ---------- презентация ---------- */
  function filterLabel() {
    const parts = [];
    if (state.f.model) parts.push(state.f.model.startsWith('b:') ? 'Все ' + state.f.model.slice(2) : state.f.model.slice(2));
    if (state.f.mgr) parts.push(state.f.mgr);
    if (state.f.q) parts.push('поиск «' + state.f.q + '»');
    return parts.length ? parts.join(' · ') : 'Все модели';
  }
  async function makeDeck() {
    const btn = $('#deck-btn');
    if (typeof PptxGenJS === 'undefined') { toast('Библиотека презентаций не загрузилась. Обновите страницу.', true); return; }
    btn.disabled = true; btn.textContent = 'Собираю…';
    try {
      const rows = filtered(state.cur.rows, true);
      let ev = null, acc = null, oldRows = null;
      if (state.base) { ev = Core.compare(state.base.rows, state.cur.rows).filter(evPass); oldRows = filtered(state.base.rows, true); acc = Core.accountability(oldRows, ev); }
      const pptx = Deck.build(PptxGenJS, { cur: state.cur, base: state.base, rows, oldRows, ev, acc, filterLabel: filterLabel(), schemes: Core.SCHEMES, leasing: Core.getLeasing(), unitPrice });
      const data = await pptx.write({ outputType: 'arraybuffer' });
      const name = `Склад ТС ${fmtDate(state.cur.date)}${state.f.model ? ' ' + filterLabel().replace(/[\\/:*?"<>|]/g, '') : ''}.pptx`;
      await saveFile(name, new Uint8Array(data));
    } catch (e) { if (!e || e.code !== 'declined') toast('Не удалось собрать презентацию: ' + ((e && (e.message || e.code)) || e), true); }
    finally { btn.disabled = false; btn.textContent = 'Скачать презентацию'; }
  }

  /* ---------- фиксации в хранилище ---------- */
  const PART = 120;
  async function listSnaps() {
    if (!state.db) { state.snaps = LOCAL ? (LS.get('sklad-snaps') || []) : []; return; }
    try {
      const q = await state.db.collection('snapshots').orderBy('savedAt', 'desc').limit(60).get();
      state.snaps = q.docs.map(d => Object.assign({ id: d.id }, d.data()));
      if (currentTab() === 'compare') render();
    } catch (e) { /* хранилище недоступно — работаем без него */ }
  }
  async function saveSnap() {
    const msg = $('#fix-msg'), btn = $('#fix-btn');
    btn.disabled = true; msg.textContent = 'Сохраняю…';
    try {
      const id = 's-' + state.cur.date + '-' + Date.now();
      const raw = state.cur.raw;
      if (!state.db) {
        const g1l = state.cur.rows.filter(r => r.group === 1).length;
        const meta = { id, label: `Фиксация ${fmtDate(state.cur.date)} (в прогнозе ${g1l})`, date: state.cur.date, count: raw.length, g1: g1l, parts: 0, savedAt: new Date().toISOString() };
        try { localStorage.setItem('sklad-snap-' + id, JSON.stringify(raw)); } catch (e) { throw { message: 'на устройстве не хватает места для фиксации — удалите старые в настройках браузера' }; }
        const list = [meta, ...(LS.get('sklad-snaps') || [])].slice(0, 12);
        (LS.get('sklad-snaps') || []).slice(11).forEach(m => { try { localStorage.removeItem('sklad-snap-' + m.id); } catch (e) { } });
        LS.set('sklad-snaps', list); state.snaps = list;
        msg.textContent = `Прогноз на ${fmtDate(state.cur.date)} зафиксирован на этом устройстве: ${g1l} ТС в «Продаётся сейчас». Он доступен в «Сравнении» как база.`;
        return;
      }
      const parts = Math.ceil(raw.length / PART);
      const ref = state.db.doc('snapshots/' + id);
      for (let i = 0; i < parts; i++) await ref.collection('parts').doc('p' + i).set({ rows: raw.slice(i * PART, (i + 1) * PART) });
      const g1 = state.cur.rows.filter(r => r.group === 1).length;
      await ref.set({ label: `Фиксация ${fmtDate(state.cur.date)} (в прогнозе ${g1})`, date: state.cur.date, count: raw.length, g1, parts, savedAt: new Date().toISOString() });
      msg.textContent = `Прогноз на ${fmtDate(state.cur.date)} зафиксирован: ${g1} ТС в «Продаётся сейчас». Он доступен в «Сравнении» как база.`;
      listSnaps();
    } catch (e) {
      msg.textContent = e && e.code === 'quota_exceeded' ? 'Хранилище заполнено: удалите старые фиксации.' : 'Не удалось сохранить: ' + ((e && (e.message || e.code)) || e) + '. Нужны права участника (Contributor) или выше.';
    } finally { btn.disabled = false; }
  }
  async function loadSnap(id) {
    const meta = state.snaps.find(s => s.id === id);
    if (!meta) return;
    try {
      toast('Загружаю фиксацию…');
      if (!state.db) {
        const rows = JSON.parse(localStorage.getItem('sklad-snap-' + id) || '[]');
        const r = mkReport({ date: meta.date, rows }, meta.label, 'snap');
        if (r.date > state.cur.date) { state.base = state.cur; state.cur = r; buildFilterOptions(); } else state.base = r;
        render(); toast('База сравнения: ' + meta.label); return;
      }
      const ref = state.db.doc('snapshots/' + id);
      const parts = await Promise.all(Array.from({ length: meta.parts }, (_, i) => ref.collection('parts').doc('p' + i).get()));
      const rows = parts.flatMap(p => (p.exists && p.data().rows) || []);
      const r = mkReport({ date: meta.date, rows }, meta.label, 'snap');
      if (r.date > state.cur.date) { state.base = state.cur; state.cur = r; buildFilterOptions(); } else state.base = r;
      render(); toast('База сравнения: ' + meta.label);
    } catch (e) { toast('Не удалось загрузить фиксацию.', true); }
  }

  /* ---------- события ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-toggle], a.tile');
    if (!t) return;
    if (t.matches('.tab')) return go(t.dataset.tab);
    if (t.dataset.goGroup) return go('list', { group: t.dataset.goGroup, signal: '', sg: '' });
    if (t.dataset.goSg) return go('list', { sg: t.dataset.goSg, group: '', signal: '', model: t.dataset.goSgModel ? 'm:' + t.dataset.goSgModel : state.f.model }), $('#f-model').value = state.f.model;
    if (t.dataset.scheme) { state.f.scheme = t.dataset.scheme; state.f.sg = ''; saveFilters(); return render(); }
    if (t.id === 'deck-btn') return makeDeck();
    if (t.dataset.goSignal) return go('list', { signal: t.dataset.goSignal, group: '', sg: '' });
    if (t.dataset.goModel) return go('list', { model: 'm:' + t.dataset.goModel, group: t.dataset.goG, signal: '', sg: '' }), $('#f-model').value = state.f.model;
    if (t.dataset.clear) { state.f[t.dataset.clear] = ''; saveFilters(); return render(); }
    if (t.dataset.sort) { state.sort = { key: t.dataset.sort, dir: state.sort.key === t.dataset.sort ? -state.sort.dir : 1 }; return render(); }
    if (t.dataset.export) return exportXlsx(t.dataset.export);
    if (t.id === 'fix-btn') return saveSnap();
    if (t.id === 'l-reset') { state.docExtract = null; return saveLeasing(Object.assign({}, Core.LEASING_DEFAULT)); }
    if (t.id === 'l-accept' && state.pendingLeasing) { const c = state.pendingLeasing; state.pendingLeasing = null; state.docExtract = null; return saveLeasing(c); }
    if (t.id === 'l-dismiss') { state.pendingLeasing = null; state.docExtract = null; return render(); }
    if (t.id === 'f-reset') { state.f = { model: '', mgr: '', q: '', group: '', signal: '', scheme: state.f.scheme || 'deal', sg: '' }; saveFilters(); buildFilterOptions(); return render(); }
    if (t.dataset.toggle != null) {
      const d = document.querySelector(`[data-det="${t.dataset.toggle}"]`);
      d.hidden = !d.hidden; t.classList.toggle('open', !d.hidden);
    }
    if (t.matches('a.tile')) { const tgt = document.querySelector(t.getAttribute('href')); if (tgt) { e.preventDefault(); if (tgt.tagName === 'DETAILS') tgt.open = true; tgt.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'f-model') { state.f.model = t.value; saveFilters(); render(); }
    if (t.id === 'f-mgr') { state.f.mgr = t.value; saveFilters(); render(); }
    if ((t.id === 'main-file' || t.id === 'main-file2') && t.files[0]) { loadMain(t.files[0]); t.value = ''; }
    if ((t.id === 'two-files' || t.id === 'two-files0') && t.files.length) { loadTwo(t.files); t.value = ''; }
    if (t.id === 'base-file' && t.files[0]) { loadBase(t.files[0]); t.value = ''; }
    if (t.id === 'snap-sel' && t.value) loadSnap(t.value);
    if (t.id === 'l-file' && t.files[0]) { readDecree(t.files[0]); t.value = ''; }
    if (t.dataset && t.dataset.price != null) { const v = parseFloat(String(t.value).replace(',', '.')); if (v > 0) state.prices[t.dataset.price] = Math.round(v * 1e6); else delete state.prices[t.dataset.price]; savePrices(); render(); }
  });
  let qT;
  document.addEventListener('input', e => { if (e.target.id === 'f-q') { clearTimeout(qT); qT = setTimeout(() => { state.f.q = e.target.value; saveFilters(); render(); }, 200); } });
  window.addEventListener('hashchange', render);
  document.addEventListener('submit', e => { if (e.target.id === 'leasing-form') { e.preventDefault(); saveLeasing(readLeasingForm()); } });
  document.addEventListener('toggle', e => { if (e.target.id === 'leasing-box') state.leasingOpen = e.target.open; }, true);
  const drop = $('#drop');
  ['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('on'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || e.target === drop) drop.classList.remove('on'); }));
  document.addEventListener('drop', e => { const fs = [...(e.dataTransfer && e.dataTransfer.files || [])]; if (fs.length === 2) loadTwo(fs); else if (fs[0]) loadMain(fs[0]); });

  /* ---------- старт ---------- */
  Core.setLeasing(LS.get('stock-leasing'));
  const embedded = JSON.parse(document.getElementById('base-data').textContent);
  if (embedded) state.cur = mkReport(embedded, `${fmtDate(embedded.date)} · выгрузка «01.11свод»`, 'embedded');
  else if (LOCAL) { const last = LS.get('sklad-last'); if (last && last.rows) state.cur = mkReport(last, last.label || fmtDate(last.date), 'file'); }
  if (LOCAL) listSnaps();
  if (state.cur) buildFilterOptions();
  render();

  if (window.claude && window.claude.use) {
    window.claude.use('downloads').then(d => { state.downloads = d; }).catch(() => { });
    window.claude.use('db').then(db => { state.db = db; if (db) { listSnaps(); loadSettings(); if (currentTab() === 'pipeline') render(); } }).catch(() => { });
    window.claude.use('sample').then(sm => { state.sample = sm; }).catch(() => { });
  }
})();
