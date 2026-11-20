import React, { useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import type { Project, ProductConfig } from '../core/schema';
import { PROJECT_SCHEMA, PROJECT_VERSION } from '../core/schema';
import { CATS, blank, STYLE_NAMES, type CatalogItem } from '../core/catalog';
import { buildModel } from '../core/engine';
import { listProjects, saveProject, deleteProject, type Stored } from '../platform/store';
import { isNative, pickFile, readText, saveFile } from '../platform/files';
import { migrateProject } from '../core/migrate';
import { Editor } from './Editor';
import { Docs } from './Docs';
import { Toaster, toast, Modal } from './common';
import { thumb } from './offscreen';

export const APP_VERSION = '1.1.0';
const PIN_HASH = '3f83c39e586b757844029ad05bdde398b8df962206745d31450bb4cacee3fe1d';
async function sha(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function newProject(name: string, config: ProductConfig): Stored {
  const now = new Date().toISOString();
  return { schema: PROJECT_SCHEMA, version: PROJECT_VERSION, id: uid(), name, created: now, updated: now, config: JSON.parse(JSON.stringify(config)), prices: null, photos: [], docVersion: 1, draft: true };
}
type Route = { s: 'home' } | { s: 'edit'; id: string } | { s: 'docs'; id: string };
function parseHash(): Route { const h = location.hash.replace(/^#\/?/, '').split('/'); if (h[0] === 'p' && h[1]) return h[2] === 'docs' ? { s: 'docs', id: h[1] } : { s: 'edit', id: h[1] }; return { s: 'home' }; }

function Lock({ onOk }: { onOk: () => void }) {
  const [v, setV] = useState(''), [e, setE] = useState('');
  const go = async () => { if (await sha('forma-pin|' + v.trim()) === PIN_HASH) onOk(); else { setE('Неверный PIN'); setV(''); } };
  return <div className="lock"><div className="card">
    <div style={{ fontSize: 40 }}>🪑</div><b style={{ fontSize: 20 }}>Форма</b><span className="muted">Введите PIN для входа</span>
    <input type="password" inputMode="numeric" autoFocus value={v} onChange={x => setV(x.target.value)} onKeyDown={x => { if (x.key === 'Enter') go(); }} aria-label="PIN" data-testid="pin" />
    <button className="btn" onClick={go}>Войти</button><small style={{ color: 'var(--err)', minHeight: 18 }} role="alert">{e}</small>
    <p className="hint">Блокировка закрывает интерфейс, но не шифрует проекты на устройстве.</p>
  </div></div>;
}

function Home({ open, create, projects, reload }: { open: (id: string) => void; create: (name: string, c: ProductConfig) => void; projects: Stored[]; reload: () => void }) {
  const [cat, setCat] = useState<ProductConfig['category']>('nightstand');
  const [th, setTh] = useState<Record<string, string>>({});
  const [del, setDel] = useState<Stored | null>(null);
  const items: CatalogItem[] = CATS.find(x => x.id === cat)!.items;
  useEffect(() => { let alive = true; (async () => { for (const it of CATS.flatMap(x => x.items)) { if (!alive) return; await new Promise(r => setTimeout(r, 10)); try { const u = thumb(it.config, it.id); setTh(t => ({ ...t, [it.id]: u })); } catch { /* без превью */ } } })(); return () => { alive = false; }; }, []);
  const importJson = async () => {
    const f = await pickFile('application/json,.json'); if (!f) return;
    try { const p = migrateProject(JSON.parse(await readText(f))); const s: Stored = { ...p, id: uid(), updated: new Date().toISOString(), draft: false }; await saveProject(s); reload(); toast('Проект открыт из файла'); open(s.id); }
    catch (e: any) { toast(e instanceof SyntaxError ? 'Файл повреждён: это не JSON.' : e.message); }
  };
  const logout = () => { if (isNative()) location.reload(); else { try { sessionStorage.removeItem('sotka-gate'); } catch { /* */ } location.reload(); } };
  return <>
    <div className="top"><h1>Форма — дизайнерская мебель</h1>
      {!isNative() && <a className="btn sm sec" href="/sotka/hub/">Все приложения</a>}
      <button className="btn sm ghost" onClick={logout}>Выйти</button></div>
    <div className="wrap">
      <div className="hero"><div><h2>Выбрал → настроил → посмотрел → скачал</h2><p>Выберите модель, измените размеры, материалы и цвет — 3D-модель, чертежи, деталировка и смета пересчитаются сразу.</p></div></div>
      <div className="cats">
        {CATS.map(k => <button key={k.id} className={'cat' + (cat === k.id ? ' on' : '')} onClick={() => setCat(k.id)} data-testid={'cat-' + k.id}><i>{k.icon}</i><div><b>{k.name}</b><span>{k.items.length} моделей</span></div></button>)}
      </div>
      <div className="grid">
        {items.map(it => <button key={it.id} className="model" onClick={() => create(it.name, it.config)} data-testid={'m-' + it.id}>
          {th[it.id] ? <img className="pv" src={th[it.id]} alt={'Превью ' + it.name} /> : <span className="pv" />}
          <span className="tx"><span className="st">{STYLE_NAMES[it.config.style]}</span><br /><b>{it.name}</b><p>{it.blurb}</p><p className="small">{it.config.size.width}×{it.config.size.height}×{it.config.size.depth} мм</p></span></button>)}
        <button className="model new" onClick={() => create(({ nightstand: 'Моя тумба', wardrobe: 'Мой шкаф', dresser: 'Моё трюмо', bed: 'Моя кровать' } as const)[cat], blank(cat))} data-testid="m-new"><span className="pv">＋</span><span className="tx"><b>Создать свою модель</b><p>Пустой корпус — настройте всё сами.</p></span></button>
      </div>
      <div className="sec-h"><h3>Мои проекты</h3><button className="btn sm sec" onClick={importJson}>Открыть файл проекта</button></div>
      {!projects.length ? <p className="muted">Пока пусто. Проект сохраняется автоматически, как только вы начнёте настройку.</p> :
        <div className="plist">{projects.map(p => <div className="prow" key={p.id}>
          {th['p:' + p.id] ? <img src={th['p:' + p.id]} alt="" /> : <ThumbP p={p} onReady={u => setTh(t => ({ ...t, ['p:' + p.id]: u }))} />}
          <div className="t"><b>{p.name}</b>{p.draft && <span className="badge rv" style={{ marginLeft: 6 }}>черновик</span>}<small>{({ nightstand: 'Тумба', wardrobe: 'Шкаф', dresser: 'Трюмо', bed: 'Кровать' } as const)[p.config.category]} · {p.config.size.width}×{p.config.size.height}×{p.config.size.depth} · изменён {new Date(p.updated).toLocaleString('ru-RU')}</small></div>
          <button className="btn sm" onClick={() => open(p.id)}>Открыть</button>
          <button className="btn sm sec" aria-label="Сохранить файл проекта" onClick={() => saveFile(`${p.name}.forma.json`, new Blob([JSON.stringify({ ...p, draft: undefined }, null, 1)], { type: 'application/json' }))}>JSON</button>
          <button className="btn sm ghost" aria-label="Удалить проект" onClick={() => setDel(p)}>🗑</button></div>)}</div>}
      <p className="small muted" style={{ marginTop: 28 }}>Форма {APP_VERSION}. Работает без интернета и без ИИ. Проекты хранятся на этом устройстве; для переноса сохраните файл JSON.</p>
    </div>
    {del && <Modal title="Удалить проект?" text={`«${del.name}» будет удалён с этого устройства. Отменить нельзя.`} actions={[{ label: 'Отмена', kind: 'sec', onClick: () => setDel(null) }, { label: 'Удалить', onClick: async () => { await deleteProject(del.id); setDel(null); reload(); } }]} />}
  </>;
}
function ThumbP({ p, onReady }: { p: Stored; onReady: (u: string) => void }) {
  useEffect(() => { const h = setTimeout(() => { try { onReady(thumb(p.config, 'p:' + p.id + p.updated)); } catch { /* */ } }, 50); return () => clearTimeout(h); }, []);
  return <img alt="" />;
}

export function App() {
  const [unlocked, setUnlocked] = useState(!isNative());
  const [route, setRoute] = useState<Route>(parseHash());
  const [projects, setProjects] = useState<Stored[]>([]);
  const [cur, setCur] = useState<Stored | null>(null);
  const [leave, setLeave] = useState(false);
  const saveTimer = useRef<any>(null);
  const reload = async () => setProjects(await listProjects());
  useEffect(() => { reload(); const f = () => { setRoute(parseHash()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (route.s !== 'home') { const p = projects.find(x => x.id === route.id); if (p && (!cur || cur.id !== p.id)) setCur(p); } }, [route, projects]);
  // системная кнопка «Назад» Android
  const routeRef = useRef(route); routeRef.current = route; const curRef = useRef(cur); curRef.current = cur;
  useEffect(() => {
    if (!isNative()) return; const h = CapApp.addListener('backButton', () => {
      const r = routeRef.current;
      if (r.s === 'home') CapApp.exitApp(); else if (r.s === 'edit') requestLeave(); else history.back();
    }); return () => { h.then(x => x.remove()); };
  }, []);
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (curRef.current?.draft && routeRef.current.s !== 'home') { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f); }, []);
  const go = (h: string) => { location.hash = h; };
  const create = async (name: string, c: ProductConfig) => { const p = newProject(name, c); await saveProject(p); setCur(p); await reload(); go('/p/' + p.id); };
  const change = (p: Project) => { const s: Stored = { ...p, updated: new Date().toISOString(), draft: cur?.draft }; setCur(s); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => { saveProject(s).then(reload).catch(e => toast('Не удалось сохранить: ' + e.message)); }, 500); };
  const saveNow = async () => { if (!cur) return; const s = { ...cur, draft: false, updated: new Date().toISOString() }; setCur(s); await saveProject(s); await reload(); toast('Проект сохранён на устройстве'); };
  function requestLeave() { if (curRef.current?.draft) setLeave(true); else history.back(); }
  if (!unlocked) return <><Lock onOk={() => setUnlocked(true)} /><Toaster /></>;
  let body: React.ReactNode;
  if (route.s === 'home' || !cur || cur.id !== route.id) body = route.s !== 'home' && !projects.find(x => x.id === (route as any).id) && projects.length ? <div className="wrap"><p>Проект не найден.</p><button className="btn" onClick={() => go('/')}>На главную</button></div>
    : route.s === 'home' ? <Home open={id => go('/p/' + id)} create={create} projects={projects} reload={reload} /> : <div className="wrap">Загрузка…</div>;
  else if (route.s === 'edit') body = <EditorWrap cur={cur} change={change} saveNow={saveNow} onDocs={() => go('/p/' + cur.id + '/docs')} onBack={requestLeave} />;
  else body = <Docs project={cur} onChange={change} onBack={() => history.back()} />;
  return <>{body}
    {leave && <Modal title="Сохранить проект?" text="Проект ещё не сохранён. Сохранить его в «Мои проекты»?" actions={[
      { label: 'Отмена', kind: 'sec', onClick: () => setLeave(false) },
      { label: 'Не сохранять', kind: 'sec', onClick: async () => { setLeave(false); if (cur) await deleteProject(cur.id); await reload(); go('/'); } },
      { label: 'Сохранить', onClick: async () => { setLeave(false); await saveNow(); go('/'); } }]} />}
    <Toaster /></>;
}
function EditorWrap({ cur, change, saveNow, onDocs, onBack }: { cur: Stored; change: (p: Project) => void; saveNow: () => void; onDocs: () => void; onBack: () => void }) {
  return <Editor project={cur} onChange={change} onSave={saveNow} onDocs={onDocs} saved={!cur.draft} onBack={onBack} />;
}
export { buildModel };
