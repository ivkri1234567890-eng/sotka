const scope = self.registration.scope;
const cachePrefix = 'zamer-media-export:' + scope + ':';
const cacheName = cachePrefix + '4.0-review1';
const shell = [
  './', 'index.html', 'three.min.js', 'jszip.min.js', 'media-zip.js',
  'engineering.js', 'eng-views.js', 'drawing-reader.js', 'drawing-project.js', 'drawing-dialog.js', 'pdf-local.js', 'pdf-worker.js',
  'ocr/tesseract.min.js', 'ocr/worker.min.js', 'ocr/tesseract-core-lstm.wasm.js', 'ocr/eng.traineddata.gz',
  'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  '../gate.js', '../hub.js'
];
const shellUrls = new Set(shell.map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
  // Keep the active release until all files are available and its clients close.
  const requests = [...shellUrls].map(url => new Request(url, {cache: 'reload'}));
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(requests)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const canonical = new URL(scope).pathname === '/sotka/zamer/';
    const old = (await caches.keys()).filter(key =>
      (key.startsWith(cachePrefix) && key !== cacheName) ||
      (canonical && (key === 'zamer-v28' || key === 'zamer-media-export-v1')));
    await Promise.all(old.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  url.search = '';
  if (!shellUrls.has(url.href)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    const cached = await cache.match(url.href);
    return cached || fetch(request);
  }));
});
