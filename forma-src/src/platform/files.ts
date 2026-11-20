/** Файлы: сохранение, «Поделиться», открытие. В Android — системный выбор папки (SAF) и меню «Поделиться». */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

type FormaFilesPlugin = { saveAs(o: { name: string; mime: string; path: string }): Promise<{ uri: string; saved: boolean }> };
const FormaFiles = registerPlugin<FormaFilesPlugin>('FormaFiles');
export const isNative = () => Capacitor.isNativePlatform();

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CH)));
  return btoa(s);
}
/** Сохранить файл: Android — диалог выбора папки и имени; браузер — загрузка. Возвращает false, если пользователь отменил. */
export async function saveFile(name: string, data: Blob): Promise<boolean> {
  if (isNative()) {
    const tmp = 'export-' + Date.now() + '.bin';
    const w = await Filesystem.writeFile({ path: tmp, data: await blobToBase64(data), directory: Directory.Cache });
    const r = await FormaFiles.saveAs({ name, mime: data.type || 'application/octet-stream', path: w.uri.replace(/^file:\/\//, '') });
    return r.saved;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return true;
}
export async function shareFile(name: string, data: Blob, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (isNative()) {
    const w = await Filesystem.writeFile({ path: name, data: await blobToBase64(data), directory: Directory.Cache });
    try { await Share.share({ title, files: [w.uri], dialogTitle: 'Отправить файл' }); return 'shared'; } catch { return 'cancelled'; }
  }
  const file = new File([data], name, { type: data.type });
  const nav: any = navigator;
  if (nav.canShare && nav.canShare({ files: [file] })) { try { await nav.share({ files: [file], title }); return 'shared'; } catch { return 'cancelled'; } }
  await saveFile(name, data); return 'downloaded';
}
/** Выбор файла через системный интерфейс (в Android WebView Capacitor открывает системный выбор). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
    i.onchange = () => { res(i.files && i.files[0] ? i.files[0] : null); i.remove(); };
    (i as any).oncancel = () => { res(null); i.remove(); };
    document.body.appendChild(i); i.click();
  });
}
export const readText = (f: File) => f.text();
export function readDataUrl(f: File, maxSide = 1400): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => { const k = Math.min(1, maxSide / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не удалось прочитать изображение')); }; img.src = url;
  });
}
