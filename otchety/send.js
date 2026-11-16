/* Отправка готовых отчётов: Telegram-бот, почта (через свой Google-скрипт или «Поделиться»),
   очередь, если нет интернета. Настройки хранятся только в этом браузере. */
(function(){
'use strict';
const KEY='dpga-send';
const DEF={tgToken:'',tgTo:[],emails:'',gasUrl:'',gasKey:'',auto:false};
function get(){try{return Object.assign({},DEF,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){return Object.assign({},DEF);}}
function set(s){try{localStorage.setItem(KEY,JSON.stringify(s));}catch(e){}}
const tgOn=s=>s.tgToken&&s.tgTo.some(r=>r.on!==false);
const mailOn=s=>s.gasUrl&&s.emails.trim();

/* ---------- очередь (IndexedDB) ---------- */
function db(){return new Promise((ok,bad)=>{const r=indexedDB.open('dpga-send',1);r.onupgradeneeded=()=>r.result.createObjectStore('outbox',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}
async function tx(mode,fn){const d=await db();return new Promise((ok,bad)=>{const t=d.transaction('outbox',mode);const st=t.objectStore('outbox');const res=fn(st);t.oncomplete=()=>ok(res&&res.result!==undefined?res.result:res);t.onerror=()=>bad(t.error);});}
const queue={
 add:job=>tx('readwrite',st=>st.put(job)),
 all:()=>tx('readonly',st=>st.getAll()),
 del:id=>tx('readwrite',st=>st.delete(id))
};

/* ---------- Telegram ---------- */
async function tg(token,method,body){
 const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,body instanceof FormData?{method:'POST',body}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
 let j;try{j=await r.json();}catch(e){throw Object.assign(Error('Telegram не ответил ('+r.status+')'),{net:r.status>=500});}
 if(!j.ok){const t=j.description||'ошибка';throw Error(/chat not found/i.test(t)?'Получатель не найден: он должен сначала написать боту /start':/unauthorized/i.test(t)?'Неверный токен бота':'Telegram: '+t);}
 return j.result;
}
async function zipIfMany(files,name){
 if(files.length<=4)return files;
 const z=new JSZip();for(const f of files)z.file(f.name,f.bytes);
 return [{name:(name||'Отчёты')+'.zip',bytes:await z.generateAsync({type:'uint8array',compression:'DEFLATE'}),type:'application/zip'}];
}
async function sendTelegram(s,job){
 const files=await zipIfMany(job.files,job.zipName);
 const to=s.tgTo.filter(r=>r.on!==false);
 for(const r of to){
  const text=job.text||'';
  if(text.length>1000||files.length!==1)await tg(s.tgToken,'sendMessage',{chat_id:r.id,text:text.slice(0,4000)});
  for(let i=0;i<files.length;i++){
   const fd=new FormData();fd.append('chat_id',r.id);
   fd.append('document',new Blob([files[i].bytes],{type:files[i].type||'application/octet-stream'}),files[i].name);
   if(files.length===1&&text.length<=1000)fd.append('caption',text);
   await tg(s.tgToken,'sendDocument',fd);
  }
 }
 return to.map(r=>r.name||r.id);
}
async function findChats(token){
 const up=await tg(token,'getUpdates',{limit:100,allowed_updates:['message']});
 const seen=new Map();
 for(const u of up){const c=(u.message||u.channel_post||{}).chat;if(!c||seen.has(c.id))continue;seen.set(c.id,{id:String(c.id),name:[c.first_name,c.last_name].filter(Boolean).join(' ')||c.title||c.username||String(c.id),user:c.username||''});}
 return [...seen.values()];
}

/* ---------- почта ---------- */
function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+32768));return btoa(s);}
async function sendMail(s,job){
 const files=await zipIfMany(job.files,job.zipName);
 const body=JSON.stringify({key:s.gasKey,to:s.emails.split(/[,;\s]+/).filter(Boolean).join(','),subject:job.subject||'Отчёт',body:job.text||'',files:files.map(f=>({name:f.name,type:f.type||'application/octet-stream',b64:b64(f.bytes)}))});
 let r;
 try{r=await fetch(s.gasUrl,{method:'POST',body,headers:{'Content-Type':'text/plain;charset=utf-8'}});}
 catch(e){
  if(!navigator.onLine)throw Object.assign(Error('нет интернета'),{net:true});
  await fetch(s.gasUrl,{method:'POST',body,mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'}});
  return 'отправлено (ответ скрипта недоступен)';
 }
 let j=null;try{j=await r.json();}catch(e){}
 if(j&&j.ok===false)throw Error('Скрипт почты: '+(j.error==='key'?'неверный ключ':j.error||'ошибка'));
 return 'отправлено на '+s.emails;
}
/** Без настроенного скрипта: «Поделиться» (телефон, Windows, Mac) или письмо + скачивание. */
async function shareMail(job){
 const files=await zipIfMany(job.files,job.zipName);
 if(window.AndroidBridge){const f=files[0];window.AndroidBridge.share(f.name,f.type||'application/octet-stream',b64(f.bytes),job.text||'');return 'shared';}
 const ff=files.map(f=>new File([f.bytes],f.name,{type:f.type||'application/octet-stream'}));
 if(navigator.canShare&&navigator.canShare({files:ff})){
  try{await navigator.share({files:ff,title:job.subject||'Отчёт',text:job.text||''});return 'shared';}
  catch(e){if(e.name==='AbortError')return 'cancel';}
 }
 for(const f of files)download(f);
 const s=get();
 location.href='mailto:'+encodeURIComponent(s.emails.split(/[,;\s]+/).filter(Boolean).join(','))+'?subject='+encodeURIComponent(job.subject||'Отчёт')+'&body='+encodeURIComponent((job.text||'')+'\n\n(файл скачан — приложите его к письму)');
 return 'mailto';
}
function download(f){
 if(typeof window.saveFile==='function'&&window.saveFile.orig)return window.saveFile.orig(f.name,f.bytes,f.type);
 const url=URL.createObjectURL(new Blob([f.bytes],{type:f.type||'application/octet-stream'}));
 const a=document.createElement('a');a.href=url;a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

/* ---------- общий вход ---------- */
const listeners=new Set();
function notify(msg){for(const f of listeners)try{f(msg);}catch(e){}}
async function deliver(job){
 const s=get();const done=[],errs=[];
 for(const ch of job.channels){
  try{
   if(ch==='tg'){if(!tgOn(s))throw Error('Telegram не настроен');done.push('Telegram: '+(await sendTelegram(s,job)).join(', '));}
   if(ch==='mail'){if(!mailOn(s))throw Error('почта не настроена');done.push('Почта: '+(await sendMail(s,job)));}
  }catch(e){
   const net=e.net||e instanceof TypeError||!navigator.onLine;
   errs.push({ch,net,text:e.message||String(e)});
  }
 }
 return {done,errs};
}
/** Отправить; при отсутствии интернета — в очередь. */
async function send(job){
 job=Object.assign({id:'j'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),created:Date.now()},job);
 job.files=job.files.map(f=>({name:f.name,bytes:f.bytes instanceof Uint8Array?f.bytes:new Uint8Array(f.bytes),type:f.type||guess(f.name)}));
 const r=await deliver(job);
 const later=r.errs.filter(e=>e.net);
 if(later.length){await queue.add(Object.assign({},job,{channels:later.map(e=>e.ch)}));r.queued=true;notify('queue');}
 return r;
}
function guess(n){return /\.zip$/i.test(n)?'application/zip':/\.docx$/i.test(n)?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':/\.pptx$/i.test(n)?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';}
let flushing=false;
async function flush(){
 if(flushing||!navigator.onLine)return;
 flushing=true;
 try{for(const job of await queue.all()){const r=await deliver(job);if(!r.errs.some(e=>e.net)){await queue.del(job.id);notify('sent:'+job.subject);}}}
 catch(e){}finally{flushing=false;notify('queue');}
}
async function pending(){try{return (await queue.all()).length;}catch(e){return 0;}}
window.addEventListener('online',flush);
setTimeout(flush,3000);

const GAS='// Google Apps Script: отправка отчётов из центра отчётов на почту\n// 1) script.google.com → Новый проект → вставьте этот код, замените КЛЮЧ\n// 2) Развертывание → Новое развертывание → Веб-приложение:\n//    «Выполнять от имени: я», «Доступ: все» → скопируйте URL\nconst KEY = \'КЛЮЧ\';\nfunction doPost(e) {\n  const d = JSON.parse(e.postData.contents);\n  if (d.key !== KEY) return out({ ok: false, error: \'key\' });\n  const files = (d.files || []).map(f =>\n    Utilities.newBlob(Utilities.base64Decode(f.b64), f.type, f.name));\n  MailApp.sendEmail({ to: d.to, subject: d.subject, body: d.body, attachments: files });\n  return out({ ok: true });\n}\nfunction out(o) {\n  return ContentService.createTextOutput(JSON.stringify(o))\n    .setMimeType(ContentService.MimeType.JSON);\n}\n';

/* ---------- панель «Отправить» для любых скачанных отчётов ---------- */
function bar(files,text){
 let b=document.getElementById('sendBar');
 if(!b){b=document.createElement('div');b.id='sendBar';b.className='sendbar';document.body.append(b);}
 document.body.classList.add('has-sendbar');
 const s=get();
 b.replaceChildren();
 const t=document.createElement('span');t.textContent=files.length===1?files[0].name:'Файлов: '+files.length;
 const mk=(label,fn)=>{const x=document.createElement('button');x.type='button';x.className='mini';x.textContent=label;x.onclick=fn;return x;};
 const st=document.createElement('small');
 const go=async ch=>{st.textContent='Отправляю…';const r=await send({files,text:text||files.map(f=>f.name).join('\n'),subject:files[0].name.replace(/\.[^.]+$/,''),channels:[ch]});st.textContent=r.done.length?'✓ '+r.done.join('; '):r.queued?'Нет интернета — отправлю, когда появится':'✕ '+r.errs.map(e=>e.text).join('; ');};
 if(tgOn(s))b.append(t,mk('В Telegram',()=>go('tg')));else b.append(t);
 b.append(mk('На почту',()=>mailOn(s)?go('mail'):shareMail({files,subject:files[0].name})));
 b.append(mk('✕',()=>{b.remove();document.body.classList.remove('has-sendbar');}),st);
}
if(typeof window.saveFile==='function'){
 const orig=window.saveFile;
 window.saveFile=function(name,bytes,type){const r=orig.apply(this,arguments);try{if(!window.sendBarOff)bar([{name,bytes:bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),type}]);}catch(e){}return r;};
 window.saveFile.orig=orig;
}

window.ReportSend={get,set,send,flush,pending,findChats,shareMail,tgOn,mailOn,onChange:f=>listeners.add(f),GAS,tg,download,bar};
})();
