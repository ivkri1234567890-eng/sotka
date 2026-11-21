/** Общий внеэкранный рендер: превью каталога, иллюстрации документов и инструкции. Без WebGL возвращает null — вызывающий код рисует 2D. */
import { FormaScene } from './scene';
import { buildModel } from '../core/engine';
import type { ProductConfig, ManufacturingModel } from '../core/schema';
import { viewSvg } from '../docs/drawings';
/** 2D-превью (вид спереди) — когда 3D недоступно. */
export function flatThumb(m: ManufacturingModel): string {
  const o = m.overall, pad = Math.max(o.width, o.height) * 0.08, W = o.width + 2 * pad, H = o.height + 2 * pad;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ece7de"/>${viewSvg(m, 'front', pad, pad + o.height, 1).replace(/stroke-width="([\d.]+)"/g, (_, w) => `stroke-width="${Number(w) * Math.max(4, o.width / 120)}"`)}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
let sc: FormaScene | null = null, failed: string | null = null, probe: boolean | null = null;
const cache = new Map<string, string>();
/** Есть ли WebGL в этом браузере (проверка один раз). ?nowebgl в адресе — принудительно без 3D (для проверки). */
export function webglAvailable(): boolean {
  if (probe != null) return probe;
  try {
    if (/[?&#]nowebgl\b/.test(location.href)) return (probe = false);
    const cv = document.createElement('canvas');
    probe = !!(cv.getContext('webgl2') || cv.getContext('webgl'));
  } catch { probe = false; }
  return probe;
}
export function webglError() { return failed; }
function off(): FormaScene | null {
  if (sc) return sc;
  if (failed || !webglAvailable()) { failed = failed || 'WebGL недоступен'; return null; }
  try { sc = new FormaScene(document.createElement('div'), { preserve: true, offscreen: { w: 960, h: 720 } }); return sc; }
  catch (e: any) { failed = String(e?.message || e); return null; }
}
export function thumb(c: ProductConfig, key: string): string {
  if (cache.has(key)) return cache.get(key)!;
  const s = off(); if (!s) { const u = flatThumb(buildModel(c)); cache.set(key, u); return u; }
  try { const m = buildModel(c); s.setModel(m, c, false); const u = s.snapshot({ w: 480, h: 360, dims: false }); cache.set(key, u); return u; } catch (e: any) { failed = String(e?.message || e); const u = flatThumb(buildModel(c)); cache.set(key, u); return u; }
}
export function shot(m: ManufacturingModel, c: ProductConfig, o: Parameters<FormaScene['snapshot']>[0]): string | null {
  const s = off(); if (!s) return null;
  try { s.setModel(m, c, false); return s.snapshot(o); } catch (e: any) { failed = String(e?.message || e); return null; }
}
