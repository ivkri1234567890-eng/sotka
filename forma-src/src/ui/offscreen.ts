/** Общий внеэкранный рендер: превью каталога, иллюстрации документов и инструкции. */
import { FormaScene } from './scene';
import { buildModel } from '../core/engine';
import type { ProductConfig, ManufacturingModel } from '../core/schema';
let sc: FormaScene | null = null;
const cache = new Map<string, string>();
export function off(): FormaScene { if (!sc) sc = new FormaScene(document.createElement('div'), { preserve: true, offscreen: { w: 960, h: 720 } }); return sc; }
export function thumb(c: ProductConfig, key: string): string {
  if (cache.has(key)) return cache.get(key)!;
  const s = off(), m = buildModel(c); s.setModel(m, c, false); const u = s.snapshot({ w: 480, h: 360, dims: false }); cache.set(key, u); return u;
}
export function shot(m: ManufacturingModel, c: ProductConfig, o: Parameters<FormaScene['snapshot']>[0]): string { const s = off(); s.setModel(m, c, false); return s.snapshot(o); }
