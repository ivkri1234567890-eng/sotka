import { bedSize } from '../core/bed';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, ProductConfig } from '../core/schema';
import { modelFor } from '../core/engine';
import { estimate, demoPrices } from '../core/estimate';
import { Viewer } from './Viewer';
import { SizePane, StylePane, MaterialsPane, FillPane, HandlesPane, ProdPane } from './panels';
import { fmtMoney, toast } from './common';
import { parseRequest } from '../core/request';

const TABS = [['size', 'Размеры'], ['style', 'Стиль'], ['mat', 'Материалы и цвет'], ['fill', 'Наполнение'], ['base', 'Ручки и основание'], ['prod', 'Для производства']] as const;
type Tab = typeof TABS[number][0];
/** Что помнит редактор по проекту при переходах между экранами. */
const uiMemo: Record<string, { tab: Tab; mview: 'model' | 'set'; scroll: Record<string, number> }> = {};
const isMobile = () => window.matchMedia('(max-width:860px)').matches;

export function Editor({ project, onChange, onSave, onDocs, saved, onBack, onJson }: { project: Project; onChange: (p: Project) => void; onSave: () => void; onDocs: () => void; saved: boolean; onBack: () => void; onJson: () => void }) {
  const mem = uiMemo[project.id] || (uiMemo[project.id] = { tab: 'size', mview: 'set', scroll: {} });
  const [tab, setTabS] = useState<Tab>(mem.tab);
  const [mview, setMviewS] = useState<'model' | 'set'>(mem.mview);
  const [secOpen, setSecOpen] = useState(false);
  const sideRef = useRef<HTMLDivElement>(null);
  const scrollKey = () => mview + ':' + tab;
  const saveScroll = () => { mem.scroll[scrollKey()] = isMobile() ? window.scrollY : (sideRef.current?.scrollTop || 0); };
  const restoreScroll = (k: string) => requestAnimationFrame(() => { const y = mem.scroll[k] || 0; if (isMobile()) window.scrollTo(0, y); else if (sideRef.current) sideRef.current.scrollTop = y; });
  const setTab = (t: Tab) => { saveScroll(); mem.tab = t; setTabS(t); setSecOpen(false); restoreScroll(mview + ':' + t); };
  const setMview = (v: 'model' | 'set') => { saveScroll(); mem.mview = v; setMviewS(v); restoreScroll(v + ':' + tab); };
  const goDocs = () => { saveScroll(); onDocs(); };
  useEffect(() => { restoreScroll(scrollKey()); return () => { saveScroll(); }; }, []);
  // экранная клавиатура: свернуть превью, показать активное поле над клавиатурой
  useEffect(() => {
    const side = sideRef.current; if (!side) return;
    const isField = (t: any) => t instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(t.type) || t instanceof HTMLTextAreaElement;
    let h: any;
    const fin = (e: FocusEvent) => { if (!isField(e.target) || !isMobile()) return; clearTimeout(h); document.body.classList.add('kb');
      const el = e.target as HTMLElement; setTimeout(() => { const box = el.closest('.fld') || el; box.scrollIntoView({ block: 'center', behavior: 'auto' }); }, 320); };
    const fout = (e: FocusEvent) => { if (!isField(e.target)) return; h = setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('kb'); }, 150); };
    side.addEventListener('focusin', fin); side.addEventListener('focusout', fout);
    // поле могло исчезнуть при перерисовке без события focusout — не оставлять панель скрытой
    const guard = setInterval(() => { if (document.body.classList.contains('kb') && !isField(document.activeElement)) document.body.classList.remove('kb'); }, 400);
    return () => { clearInterval(guard); side.removeEventListener('focusin', fin); side.removeEventListener('focusout', fout); document.body.classList.remove('kb'); };
  }, []);
  const hist = useRef<{ past: ProductConfig[]; future: ProductConfig[] }>({ past: [], future: [] });
  const [, force] = useState(0);
  const [req, setReq] = useState('');
  const c = project.config;
  const model = useMemo(() => modelFor(c), [c]);
  const est = useMemo(() => estimate(model, c, project.prices || demoPrices()), [model, project.prices]);
  const set = (f: (c: ProductConfig) => ProductConfig) => {
    let next = f(c); if (next.category === 'bed') next = { ...next, size: bedSize(next) };
    if (JSON.stringify(next) === JSON.stringify(c)) return;
    hist.current.past.push(c); if (hist.current.past.length > 100) hist.current.past.shift(); hist.current.future = [];
    onChange({ ...project, config: next }); force(x => x + 1);
  };
  const undo = () => { const h = hist.current, p = h.past.pop(); if (!p) return; h.future.push(c); onChange({ ...project, config: p }); force(x => x + 1); };
  const redo = () => { const h = hist.current, n = h.future.pop(); if (!n) return; h.past.push(c); onChange({ ...project, config: n }); force(x => x + 1); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  const errs = model.checks.filter(x => x.level === 'error'), warns = model.checks.filter(x => x.level === 'warn');
  const applyReq = () => { const r = parseRequest(req, c); if (!r.changed.length) { toast('Не нашёл в тексте понятных настроек. Пример: «ширина 500, три ящика, дуб, ручки латунь»'); return; } set(() => r.config); toast('Применено: ' + r.changed.join(', ')); setReq(''); };
  return <>
    <div className="top">
      <button className="icon" aria-label="Назад" onClick={onBack}>←</button>
      <input className="name" aria-label="Название проекта" value={project.name} onChange={e => onChange({ ...project, name: e.target.value })} />
      <button className="icon" aria-label="Отменить" title="Отменить (Ctrl+Z)" disabled={!hist.current.past.length} onClick={undo}>↶</button>
      <button className="icon" aria-label="Повторить" title="Повторить (Ctrl+Y)" disabled={!hist.current.future.length} onClick={redo}>↷</button>
      <button className="btn sec" onClick={onSave} data-testid="save" aria-label={saved ? 'Проект в «Мои проекты», изменения сохраняются автоматически' : 'Сохранить в «Мои проекты»'} title={saved ? 'Проект в «Мои проекты». Изменения сохраняются автоматически.' : 'Черновик сохраняется автоматически. Нажмите, чтобы оставить проект в «Мои проекты».'}>
        <span className="only-d">{saved ? '✓ В моих проектах' : 'В мои проекты'}</span><span className="only-m">{saved ? '✓' : '💾'}</span></button>
      <button className="btn hide-m" onClick={goDocs} data-testid="docs">Документы →</button>
    </div>
    <div className={'ed' + (mview === 'model' ? ' full' : '')}>
      <Viewer model={model} config={c} pid={project.id} />
      <div className="side" ref={sideRef}>
        <div className="price">
          <div><small>Предварительная стоимость</small><b data-testid="price">{fmtMoney(est.total)}</b>
            <small>{(project.prices?.demo ?? true) ? 'по демонстрационным ставкам — замените своими в «Смете»' : 'по вашим ставкам'}{est.incomplete.length ? ` · не посчитано: ${est.incomplete.length}` : ''}</small></div>
          <div className="small muted" style={{ textAlign: 'right' }}>{model.parts.length} дет.<br />≈{model.massKg} кг</div>
        </div>
        <div className="savebar small" data-testid="savestate">{saved ? '✓ Проект в «Мои проекты» · изменения сохраняются на этом устройстве автоматически' : 'Черновик · сохраняется автоматически. Чтобы оставить в «Мои проекты» — 💾'}</div>
        <div className="tabs only-dflex" role="tablist">{TABS.map(([k, n]) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{n}</button>)}</div>
        <div className="secsel only-mblock">
          <button className="secbtn" aria-expanded={secOpen} onClick={() => setSecOpen(!secOpen)} data-testid="secbtn"><span className="muted small">Раздел {TABS.findIndex(t => t[0] === tab) + 1} из {TABS.length}</span><b>{TABS.find(t => t[0] === tab)![1]}</b><span aria-hidden>▾ все разделы</span></button>
          {secOpen && <div className="seclist" role="list" ref={el => { if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' })); }}>{TABS.map(([k, n]) => <button key={k} role="listitem" aria-current={tab === k} onClick={() => setTab(k)}>{n}</button>)}</div>}
        </div>
        {tab === 'size' && <SizePane c={c} set={set} />}
        {tab === 'style' && <StylePane c={c} set={set} photos={project.photos} setPhotos={ph => onChange({ ...project, photos: ph })} />}
        {tab === 'mat' && <MaterialsPane c={c} set={set} />}
        {tab === 'fill' && <FillPane c={c} set={set} />}
        {tab === 'base' && <HandlesPane c={c} set={set} />}
        {tab === 'prod' && <ProdPane c={c} set={set} />}
        <div className="checks" aria-live="polite">
          {errs.map((x, i) => <div className="ck error" key={'e' + i}><b>{x.area}</b>{x.msg}{x.fix && <i>{x.fix}</i>}</div>)}
          {warns.map((x, i) => <div className="ck warn" key={'w' + i}><b>{x.area}</b>{x.msg}{x.fix && <i>{x.fix}</i>}</div>)}
          {!errs.length && <div className="ck ok"><b>Проверка</b>Конструкция рассчитана: размеры положительные, недопустимых пересечений нет.</div>}
        </div>
        <div className="pane" style={{ paddingTop: 0 }}>
          <div className="box"><h4>Сохранение и файлы</h4>
            <div className="small">• <b>Автосохранение</b> — проект хранится в этом браузере/приложении, ничего нажимать не нужно.{!saved && ' Сейчас это черновик: при выходе программа спросит, оставить ли его.'}</div>
            <div className="chips">{!saved && <button className="btn sm" onClick={onSave}>Сохранить в «Мои проекты»</button>}
              <button className="btn sm sec" onClick={onJson} data-testid="ed-json">Скачать файл проекта (JSON)</button>
              <button className="btn sm sec" onClick={goDocs}>Документы для мастерской →</button></div>
            <div className="small muted">JSON — копия проекта для переноса или резерва. Документы (PDF, ZIP, CSV, DXF) — на экране «Документы».</div>
          </div>
          <div className="box"><h4>Описать словами</h4>
            <p className="hint">Необязательно. Распознаются простые фразы без ИИ: «ширина 500, три ящика, дуб, RAL 7044, ножки металл, ручки латунь».</p>
            <div className="ralrow"><input value={req} onChange={e => setReq(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyReq(); }} placeholder="Например: шкаф 1600, две двери и ящики" aria-label="Описание словами" /><button className="btn sm" onClick={applyReq}>Применить</button></div>
          </div>
        </div>
      </div>
    </div>
    <nav className="mtabs" aria-label="Режим"><button aria-pressed={mview === 'model'} onClick={() => setMview('model')} data-testid="m-model">Модель</button><button aria-pressed={mview === 'set'} onClick={() => setMview('set')} data-testid="m-set">Настройки</button><button onClick={goDocs} data-testid="m-docs">Документы</button></nav>
  </>;
}
