import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, ProductConfig } from '../core/schema';
import { buildModel } from '../core/engine';
import { estimate, demoPrices } from '../core/estimate';
import { Viewer } from './Viewer';
import { SizePane, StylePane, MaterialsPane, FillPane, HandlesPane, ProdPane } from './panels';
import { fmtMoney, toast } from './common';
import { parseRequest } from '../core/request';

const TABS = [['size', 'Размеры'], ['style', 'Стиль'], ['mat', 'Материалы и цвет'], ['fill', 'Наполнение'], ['base', 'Ручки и основание'], ['prod', 'Для производства']] as const;
type Tab = typeof TABS[number][0];

export function Editor({ project, onChange, onSave, onDocs, saved, onBack }: { project: Project; onChange: (p: Project) => void; onSave: () => void; onDocs: () => void; saved: boolean; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('size');
  const [mview, setMview] = useState<'model' | 'set'>('set');
  const hist = useRef<{ past: ProductConfig[]; future: ProductConfig[] }>({ past: [], future: [] });
  const [, force] = useState(0);
  const [req, setReq] = useState('');
  const c = project.config;
  const model = useMemo(() => buildModel(c), [c]);
  const est = useMemo(() => estimate(model, c, project.prices || demoPrices()), [model, project.prices]);
  const set = (f: (c: ProductConfig) => ProductConfig) => {
    const next = f(c); if (JSON.stringify(next) === JSON.stringify(c)) return;
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
      <button className="btn sec" onClick={onSave} data-testid="save" aria-label="Сохранить проект"><span className="only-d">{saved ? '✓ Сохранено' : 'Сохранить проект'}</span><span className="only-m">{saved ? '✓' : '💾'}</span></button>
      <button className="btn hide-m" onClick={onDocs} data-testid="docs">Скачать документы</button>
    </div>
    <div className={'ed' + (mview === 'model' ? ' full' : '')}>
      <Viewer model={model} config={c} />
      <div className="side">
        <div className="price">
          <div><small>Предварительная стоимость</small><b data-testid="price">{fmtMoney(est.total)}</b>
            <small>{(project.prices?.demo ?? true) ? 'по демонстрационным ставкам — замените своими в «Смете»' : 'по вашим ставкам'}{est.incomplete.length ? ` · не посчитано: ${est.incomplete.length}` : ''}</small></div>
          <div className="small muted" style={{ textAlign: 'right' }}>{model.parts.length} дет.<br />≈{model.massKg} кг</div>
        </div>
        <div className="tabs" role="tablist">{TABS.map(([k, n]) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{n}</button>)}</div>
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
          <div className="box"><h4>Описать словами</h4>
            <p className="hint">Необязательно. Распознаются простые фразы без ИИ: «ширина 500, три ящика, дуб, RAL 7044, ножки металл, ручки латунь».</p>
            <div className="ralrow"><input value={req} onChange={e => setReq(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyReq(); }} placeholder="Например: шкаф 1600, две двери и ящики" aria-label="Описание словами" /><button className="btn sm" onClick={applyReq}>Применить</button></div>
          </div>
        </div>
      </div>
    </div>
    <div className="mtabs"><button aria-pressed={mview === 'model'} onClick={() => setMview('model')}>Модель крупно</button><button aria-pressed={mview === 'set'} onClick={() => setMview('set')}>Настройки</button><button onClick={onDocs}>Документы</button></div>
  </>;
}
