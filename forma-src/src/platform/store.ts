/** Локальное хранение проектов: IndexedDB (браузер и Android WebView). Резерв — localStorage. */
import { Project } from '../core/schema';
import type { Project as P } from '../core/schema';
import { migrateProject } from '../core/migrate';

const DB = 'forma', STORE = 'projects';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const rq = fn(t.objectStore(STORE)); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
}
export type Stored = P & { draft?: boolean };
export async function listProjects(): Promise<Stored[]> {
  try { const all = await tx<any[]>('readonly', s => s.getAll()); return all.map(x => { try { return { ...migrateProject(x), draft: x.draft }; } catch { return null; } }).filter(Boolean).sort((a: any, b: any) => b.updated.localeCompare(a.updated)) as Stored[]; }
  catch { try { return JSON.parse(localStorage.getItem('forma:projects') || '[]'); } catch { return []; } }
}
export async function saveProject(p: Stored) {
  Project.parse({ ...p, draft: undefined });
  try { await tx('readwrite', s => s.put(JSON.parse(JSON.stringify(p)))); }
  catch { const all = (await listProjects()).filter(x => x.id !== p.id); localStorage.setItem('forma:projects', JSON.stringify([p, ...all])); }
}
export async function deleteProject(id: string) { try { await tx('readwrite', s => s.delete(id)); } catch { const all = (await listProjects()).filter(x => x.id !== id); localStorage.setItem('forma:projects', JSON.stringify(all)); } }
export async function getProject(id: string) { return (await listProjects()).find(p => p.id === id) || null; }
