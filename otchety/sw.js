// Центр отчётов: работа без интернета. Сначала сеть (всегда свежая версия), при отсутствии связи — сохранённая копия.
const C='otchety-v8';
const F=['./','index.html','jszip.min.js','xml-js.min.js','engine.js','xlsx.full.min.js','gibdd-model.js','gibdd-engine.js','meeting.js','meeting-ui.js','opisi-blank.js','opisi-engine.js','gibdd-ui.js','opisi-ui.js','batch.js','send.js','obrazec-read.js','obrazec-learn.js','obrazec-write.js','obrazec-core.js','obrazec-doc.js','obrazec-word.js','obrazec-merge.js','pptxgen.min.js','sales-engine.js','sales-ppt.js','sales-ui.js','obrazec-pptx.js','obrazec-deck.js','obrazec-ui.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(F.map(f=>c.add(f).catch(()=>null)))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('otchety-')&&x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin||!u.pathname.includes('/otchety/'))return;
 e.respondWith(fetch(e.request,{cache:e.request.mode==='navigate'||/\.html?$|\/$/.test(u.pathname)?'no-cache':'default'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));}return r;})
  .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||(e.request.mode==='navigate'?caches.match('index.html',{ignoreSearch:true}):undefined))));
});
