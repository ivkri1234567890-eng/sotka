/* Переключатель проектов «Сотка» + заметки для улучшений. Подключается на каждой странице: <script src="/sotka/hub.js" defer></script> */
(function(){
 if(window.__hub)return;window.__hub=1;
 var BASE='https://ivkri1234567890-eng.github.io';
 var P=[
  {k:'ege',n:'Тренажёр ЕГЭ «Сотка»',i:'🎓',u:'/sotka/'},
  {k:'otchety',n:'Центр отчётов',i:'📊',u:'/sotka/otchety/',apk:'/sotka/otchety/android/Otchety.apk'},
  {k:'zamer',n:'Замер и смета',i:'📐',u:'/sotka/zamer/',apk:'/sotka/zamer/android/ZamerSmeta-2.8.apk'},
  {k:'priemka',n:'Приёмка квартиры',i:'🏠',u:'/sotka/priemka/',apk:'/sotka/priemka/android/Priemka-1.2.apk'},
  {k:'sarkoidoz',n:'Саркоидоз — дневник',i:'🫁',u:'/sotka/sarkoidoz/',apk:'/sotka/sarkoidoz/android/Sarkoidoz-1.0.apk'},
  {k:'scan',n:'3D Сканер',i:'🧊',u:'/sotka/scan/'},
  {k:'pomoshnik',n:'Помощник',i:'🤖',u:'/sotka/pomoshnik/'},
  {k:'forma',n:'Форма — дизайнерская мебель',i:'🪑',u:'/sotka/forma/',apk:'/sotka/forma/android/Forma-1.1.0.apk',d:'Тумбы, шкафы, трюмо с зеркалом и кровати: выбор модели, размеры, материалы и RAL, 3D-модель, чертежи, деталировка, раскрой и смета.'},
  {k:'smu',n:'СМУ ERP',i:'🏗️',u:'/smu-erp/'}
 ];
 window.HUB_PROJECTS=P;
 var path=location.pathname,cur=null;
 P.slice().sort(function(a,b){return b.u.length-a.u.length}).some(function(p){if(path.indexOf(p.u)>=0){cur=p;return true}});
 if(/\/sotka\/hub\//.test(path))cur={k:'hub',n:'Все проекты'};
 var LS={get:function(){try{return JSON.parse(localStorage.getItem('hub:notes')||'{}')}catch(e){return{}}},set:function(o){try{localStorage.setItem('hub:notes',JSON.stringify(o))}catch(e){}}};
 window.HUB_NOTES=LS;
 var css='#hubBtn{position:fixed;left:10px;bottom:96px;z-index:2147483000;width:42px;height:42px;border-radius:50%;border:0;background:#1f2937;color:#fff;font:600 19px system-ui;box-shadow:0 4px 14px #0004;cursor:pointer;opacity:.86;touch-action:none}'+
 '#hubBtn i{position:absolute;top:-3px;right:-3px;width:12px;height:12px;border-radius:50%;background:#f59e0b;display:none}#hubBtn.has i{display:block}'+
 '#hubBack{position:fixed;inset:0;background:#0006;z-index:2147483001}#hubPan{position:fixed;left:0;right:0;bottom:0;z-index:2147483002;max-width:560px;margin:0 auto;background:#fff;color:#111;border-radius:18px 18px 0 0;padding:14px 16px calc(14px + env(safe-area-inset-bottom));max-height:86vh;overflow:auto;font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 -8px 30px #0004}'+
 '#hubPan h3{margin:0 0 8px;font-size:17px}#hubPan .g{display:grid;grid-template-columns:1fr 1fr;gap:8px}#hubPan a.p{display:flex;gap:8px;align-items:center;padding:10px;border:1px solid #e5e7eb;border-radius:12px;color:inherit;text-decoration:none;font-weight:600;font-size:14px}'+
 '#hubPan a.p.on{border-color:#e0620d;background:#fff4ec}#hubPan a.p b{font-size:20px}#hubPan a.p small{display:block;font-weight:400;color:#888;font-size:11px}#hubPan textarea{width:100%;min-height:110px;border:1px solid #d1d5db;border-radius:12px;padding:10px;font:15px system-ui;box-sizing:border-box;margin-top:6px}'+
 '#hubPan .r{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}#hubPan button.b,#hubPan a.b{border:0;border-radius:10px;padding:10px 14px;background:#e0620d;color:#fff;font:600 14px system-ui;cursor:pointer;text-decoration:none}#hubPan .b.s{background:#f3f4f6;color:#111}#hubPan .m{color:#6b7280;font-size:12px}'+
 '@media (prefers-color-scheme:dark){#hubPan{background:#1f2125;color:#eee}#hubPan a.p{border-color:#3a3d42}#hubPan a.p.on{background:#3a2a1f}#hubPan textarea{background:#16181b;color:#eee;border-color:#3a3d42}#hubPan .b.s{background:#2c2f34;color:#eee}}';
 function el(t,a,h){var e=document.createElement(t);for(var k in a)e.setAttribute(k,a[k]);if(h!=null)e.innerHTML=h;return e}
 function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}
 function init(){if(document.getElementById('hubBtn'))return;document.head.appendChild(el('style',{},css));
  var b=el('button',{id:'hubBtn','aria-label':'Мои проекты и заметки',title:'Мои проекты и заметки'},'⇄<i></i>');document.body.appendChild(b);mark();
  b.onclick=function(){if(b.dataset.moved){delete b.dataset.moved;return}open()};
  /* the button can be moved out of the way; position is remembered */
  try{var pos=JSON.parse(localStorage.getItem('hub:pos')||'null');if(pos){b.style.left=pos.x+'px';b.style.top=pos.y+'px';b.style.bottom='auto'}}catch(e){}
  var d=null;b.addEventListener('pointerdown',function(e){d={x:e.clientX,y:e.clientY,l:b.offsetLeft,t:b.offsetTop,id:e.pointerId}});
  window.addEventListener('pointermove',function(e){if(!d||e.pointerId!==d.id)return;var dx=e.clientX-d.x,dy=e.clientY-d.y;if(!d.m&&Math.hypot(dx,dy)<8)return;d.m=1;b.style.left=Math.max(0,Math.min(innerWidth-44,d.l+dx))+'px';b.style.top=Math.max(0,Math.min(innerHeight-44,d.t+dy))+'px';b.style.bottom='auto'});
  window.addEventListener('pointerup',function(){if(d&&d.m){b.dataset.moved=1;try{localStorage.setItem('hub:pos',JSON.stringify({x:b.offsetLeft,y:b.offsetTop}))}catch(e){}}d=null})}
 function mark(){var b=document.getElementById('hubBtn');if(!b||!cur)return;var n=LS.get()[cur.k];b.classList.toggle('has',!!(n&&n.t&&n.t.trim()))}
 function open(){var notes=LS.get(),k=cur&&cur.k;var back=el('div',{id:'hubBack'}),pan=el('div',{id:'hubPan',role:'dialog'});
  var h='<div class="r" style="justify-content:space-between;margin:0 0 8px"><h3>Мои проекты</h3><button class="b s" data-x="close" aria-label="Закрыть">✕</button></div><div class="g">'+
   P.map(function(p){var n=notes[p.k]&&notes[p.k].t&&notes[p.k].t.trim();return'<a class="p'+(k===p.k?' on':'')+'" href="'+BASE+p.u+'"><b>'+p.i+'</b><span>'+esc(p.n)+(n?'<small>📝 есть заметки</small>':'')+'</span></a>'}).join('')+'</div>';
  if(cur&&cur.k!=='hub'){var t=(notes[k]||{}).t||'';h+='<h3 style="margin-top:16px">📝 Что улучшить: '+esc(cur.n)+'</h3><textarea id="hubTxt" placeholder="Идеи, ошибки, что доделать — чтобы не забыть">'+esc(t)+'</textarea><div class="r"><span class="m" id="hubSaved">'+((notes[k]||{}).ts?'Сохранено '+new Date(notes[k].ts).toLocaleString('ru-RU'):'Сохраняется автоматически')+'</span></div>'}
  h+='<div class="r" style="margin-top:14px"><a class="b s" href="'+BASE+'/sotka/hub/">Все проекты и заметки</a></div><p class="m" style="margin:10px 0 0">Заметки хранятся в этом браузере. Чтобы перенести на другое устройство — на странице «Все проекты» есть «Скопировать» и «Вставить».</p>';
  pan.innerHTML=h;document.body.appendChild(back);document.body.appendChild(pan);
  var close=function(){back.remove();pan.remove();mark()};back.onclick=close;pan.querySelector('[data-x="close"]').onclick=close;
  var ta=pan.querySelector('#hubTxt');if(ta){var tm;ta.oninput=function(){clearTimeout(tm);tm=setTimeout(function(){var o=LS.get();o[k]={t:ta.value,ts:Date.now()};LS.set(o);var s=pan.querySelector('#hubSaved');if(s)s.textContent='Сохранено '+new Date().toLocaleTimeString('ru-RU')},300)}}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
