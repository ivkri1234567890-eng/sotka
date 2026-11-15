/* «По образцу»: интерфейс вкладки. */
(function(){
'use strict';
const R=window.ObrazecRead,L=window.ObrazecLearn,C=window.ObrazecCore,S=window.ReportSend,Dc=window.ObrazecDoc,Wd=window.ObrazecWord;
const DOCX_T='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const typeOf=n=>/\.docx$/i.test(n)?DOCX_T:/\.zip$/i.test(n)?'application/zip':XLSX_T;
const $=id=>document.getElementById(id);
const XLSX_T='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MON=R.MON,cap=s=>s[0].toUpperCase()+s.slice(1);
let items=[],report=null,template=null,saved=[],result=null,dirty=false;

/* ---------- хранилище отчётов ---------- */
function db(){return new Promise((ok,bad)=>{const r=indexedDB.open('dpga-obrazec',1);r.onupgradeneeded=()=>{r.result.createObjectStore('reports',{keyPath:'id'});r.result.createObjectStore('templates',{keyPath:'id'});};r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}
async function st(store,mode,fn){const d=await db();return new Promise((ok,bad)=>{const t=d.transaction(store,mode);const q=fn(t.objectStore(store));t.oncomplete=()=>ok(q&&'result' in q?q.result:undefined);t.onerror=()=>bad(t.error);});}
const store={
 list:()=>st('reports','readonly',s=>s.getAll()).catch(()=>[]),
 put:(rep,tpl)=>st('reports','readwrite',s=>s.put(rep)).then(()=>tpl?st('templates','readwrite',s=>s.put({id:rep.id,bytes:tpl})):null),
 tpl:id=>st('templates','readonly',s=>s.get(id)).then(x=>x&&new Uint8Array(x.bytes)),
 del:id=>st('reports','readwrite',s=>s.delete(id)).then(()=>st('templates','readwrite',s=>s.delete(id)))
};

/* ---------- файлы ---------- */
const ROLES=[['sample','Образец (готовый отчёт)'],['old','Исходник прошлого периода'],['new','Исходник нового периода'],['both','Исходник (для обоих периодов)'],['skip','Не использовать']];
async function addFiles(list){
 $('obStatus').textContent='Читаю файлы…';
 for(const f of list){
  try{
   if(/\.zip$/i.test(f.name)){
    const z=await JSZip.loadAsync(await f.arrayBuffer());
    for(const e of Object.values(z.files)){if(e.dir||!/\.(xlsx|xlsm|xls|csv|docx)$/i.test(e.name)||/(^|\/)(~\$|__MACOSX)/.test(e.name))continue;await addOne(e.name.split('/').pop(),await e.async('arraybuffer'),f.lastModified);}
   }else await addOne(f.name,await f.arrayBuffer(),f.lastModified);
  }catch(e){$('obStatus').textContent='«'+f.name+'»: '+(e.message||e);return;}
 }
 reclassify();
}
async function addOne(name,buf,lm){
 items=items.filter(x=>x.name!==name);
 if(/\.docx$/i.test(name)){items.push({id:Math.random().toString(36).slice(2),name,kind:'docx',bytes:new Uint8Array(buf),book:{kind:'docx',sheets:[]},tables:[],lastModified:lm||0,role:'sample',manual:false,why:'документ Word — образец'});return;}
 const book=R.readBook(name,buf);
 await new Promise(r=>setTimeout(r));
 const tables=R.tablesOf(book);
 items.push({id:Math.random().toString(36).slice(2),name,book,tables,lastModified:lm||0,role:null,manual:false});
}
function reclassify(){
 const xs=items.filter(x=>x.kind!=='docx');
 const cl=C.classify(xs,report&&report.saved?[report]:saved);
 cl.roles.forEach((r,i)=>{if(!xs[i].manual){xs[i].role=r.role;xs[i].why=r.why;}});
 if(items.some(x=>x.kind==='docx'&&x.role==='sample'))for(const x of xs)if(x.role==='sample'&&!x.manual){x.role='both';x.why='исходник';}
 const m=$('obMatch');
 if(cl.report&&!items.some(x=>x.role==='sample')){
  const rep=saved.find(r=>r.id===cl.report.id)||report;
  m.hidden=false;m.replaceChildren();
  const t=document.createElement('div');t.textContent='Узнал данные для «'+rep.name+'». Образец не нужен — '+(rep.kind==='doc'?'отметьте, для кого сделать документы.':'выберите период и сформируйте.');
  m.append(t);
  if(!report||report.id!==rep.id)choose(rep.id,true);
 }else m.hidden=true;
 renderFiles();
}
function renderFiles(){
 const ul=$('obList');ul.replaceChildren();
 for(const it of items){
  const li=document.createElement('li');li.className='role-'+it.role;
  const d=document.createElement('div');const b=document.createElement('b');b.textContent=it.name;
  const sm=document.createElement('small');
  const t=it.tables.slice().sort((a,b)=>b.n-a.n)[0];
  sm.textContent=it.kind==='docx'?'документ Word'+(it.why?' · '+it.why:''):t?(it.tables.length>1?it.tables.length+' таблиц, ':'')+'строк: '+t.n+', колонок: '+t.cols.filter(c=>!c.virt).length+(it.why?' · '+it.why:''):'таблица не найдена';
  d.append(b,sm);
  const sel=document.createElement('select');sel.setAttribute('aria-label','Роль файла');
  for(const [v,l] of ROLES)sel.add(new Option(l,v));sel.value=it.role||'skip';
  sel.onchange=()=>{it.role=sel.value;it.manual=true;if(sel.value==='sample')for(const o of items)if(o!==it&&o.role==='sample'){o.role='both';o.manual=true;}renderFiles();};
  const x=document.createElement('button');x.type='button';x.className='mini secondary';x.textContent='✕';x.setAttribute('aria-label','Убрать файл');x.onclick=()=>{items=items.filter(o=>o!==it);reclassify();};
  const r=document.createElement('div');r.style.cssText='display:flex;gap:6px;align-items:center';r.append(sel,x);
  li.append(d,r);ul.append(li);
 }
 const hasSample=items.some(x=>x.role==='sample');
 const hasSrc=items.some(x=>['old','new','both'].includes(x.role));
 $('obLearn').disabled=!(hasSample&&hasSrc);
 $('obLearn').hidden=!hasSample&&!!report;
 $('obStatus').textContent=!items.length?'':!hasSample&&!report?'Не вижу образца — отметьте, какой файл готовый отчёт.':!hasSrc?'Добавьте исходники.':hasSample?'Нажмите «Понять образец».':'';
 if(report&&!hasSample)showReport();
 updatePeriod();
}
const tablesBy=roles=>items.filter(x=>roles.includes(x.role)).flatMap(x=>x.tables);
function genTables(){
 let t=tablesBy(['new','both']);if(!t.length)t=tablesBy(['old']);
 // свежие таблицы: виртуальные колонки справочников добавляются при генерации, поэтому каждый раз читаем заново
 return t.map(x=>Object.assign({},x,{cols:x.cols.filter(c=>!c.virt||c.virt.kind!=='lookup')}));
}

/* ---------- обучение ---------- */
$('obLearn').onclick=async()=>{
 const sample=items.find(x=>x.role==='sample');
 let src=tablesBy(['old','both']);if(!src.length)src=tablesBy(['new']);
 $('obLearn').disabled=true;$('obStatus').textContent='Разбираю образец…';
 await new Promise(r=>setTimeout(r,30));
 if(sample.kind==='docx'){
  try{
   const t0=Date.now();
   const clean=x=>Object.assign({},x,{cols:x.cols.filter(c=>!c.virt||c.virt.kind!=='lookup')});
   let rec=null,per=null,err=null;
   try{rec=await Dc.learn({name:sample.name,bytes:sample.bytes},tablesBy(['old','both','new']));}catch(e){err=e;}
   try{const book=await Wd.readDocx(sample.name,sample.bytes);per=Wd.learn({name:sample.name,book},src.map(clean));}catch(e){err=err||e;}
   if(!rec&&!per)throw err;
   const nRec=rec?Object.values(rec.spans).reduce((a,l)=>a+l.length,0):0;
   const nPer=per?per.sheets.reduce((a,x)=>a+x.quality.ok,0)+2*per.tokens.filter(t=>t.fact).length:0;
   const usePer=!!per&&(!rec||per.sheets.some(x=>x.quality.q>=0.8&&x.quality.rows>=2)||nPer>nRec);
   report=usePer?per:rec;altReport=usePer?rec:per;template=sample.bytes;dirty=true;
   $('obStatus').textContent='Готово за '+((Date.now()-t0)/1000).toFixed(1)+' с. '+docSummary(report);
   showAlt();
   if(usePer){renderRecipe();$('obRecipe').scrollIntoView({behavior:'smooth',block:'start'});}
   else{renderDoc();$('obDoc').scrollIntoView({behavior:'smooth',block:'start'});}
  }catch(e){$('obStatus').textContent=e.message||String(e);console.error(e);}
  finally{$('obLearn').disabled=false;}
  return;
 }
 try{
  const t0=Date.now();
  const rep=C.learn(sample,src.map(x=>Object.assign({},x,{cols:x.cols.filter(c=>!c.virt||c.virt.kind!=='lookup')})));
  report=rep;template=sample.book.bytes;dirty=true;
  const q=rep.sheets.reduce((a,s)=>({ok:a.ok+s.quality.ok,cells:a.cells+s.quality.cells}),{ok:0,cells:0});
  $('obStatus').textContent='Готово за '+((Date.now()-t0)/1000).toFixed(1)+' с: '+(q.cells?'совпало '+q.ok+' из '+q.cells+' значений образца ('+Math.round(100*q.ok/q.cells)+'%).':'')+(rep.skipped.length?' Листы без изменений: '+rep.skipped.join(', ')+'.':'');
  renderRecipe();
  $('obRecipe').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){$('obStatus').textContent=e.message||String(e);}
 finally{$('obLearn').disabled=false;}
};

let altReport=null;
function docSummary(r){
 if(r.kind==='doc'){const n=Object.values(r.spans).reduce((a,l)=>a+l.length,0);return 'Режим «документ на каждую строку»: нашёл '+n+' мест для подстановки'+(r.list?' и таблицу на '+r.list.count+' строк':'')+'.';}
 const t=r.tokens.filter(x=>x.fact).length;const q=r.sheets.reduce((a,x)=>({ok:a.ok+x.quality.ok,c:a.c+x.quality.cells}),{ok:0,c:0});
 return 'Режим «справка за новый период»: '+(r.sheets.length?'таблиц: '+r.sheets.length+(q.c?' (совпало '+q.ok+' из '+q.c+')':'')+', ':'')+'чисел в тексте: '+t+' из '+r.tokens.length+'.';
}
function showAlt(){
 let b=document.getElementById('obAlt');
 if(!b){b=document.createElement('button');b.type='button';b.id='obAlt';b.className='secondary mini';b.style.marginTop='8px';$('obStatus').after(b);}
 b.hidden=!altReport;
 if(!altReport)return;
 b.textContent=altReport.kind==='doc'?'Не то? Сделать документ на каждую строку таблицы':'Не то? Сделать один документ за новый период (справку)';
 b.onclick=()=>{const t=report;report=altReport;altReport=t;dirty=true;$('obStatus').textContent=docSummary(report);showAlt();$('obResult').hidden=true;if(report.kind==='doc'){renderDoc();$('obDoc').scrollIntoView({behavior:'smooth',block:'start'});}else{renderRecipe();$('obRecipe').scrollIntoView({behavior:'smooth',block:'start'});}};
}
function headerOptions(rc){
 const set=new Set(rc.main.headers);
 for(const l of rc.lookups)set.add(l.name);
 for(const c of rc.cols){if(c.src)set.add(c.src);if(c.cond)set.add(c.cond.src);}
 for(const f of rc.filters)set.add(f.src);
 return [...set];
}
const AGG=[['count','Количество строк'],['sum','Сумма'],['dcount','Число разных'],['avg','Среднее'],['min','Минимум'],['max','Максимум']];
function colSelect(rc,col){
 const sel=document.createElement('select');sel.setAttribute('aria-label','Как получается «'+col.name+'»');
 const add=(label,val)=>sel.add(new Option(label,JSON.stringify(val)));
 add('— пусто —',{role:'blank'});
 if(col.role==='rownum'||rc.mode==='detail')add('№ по порядку',{role:'rownum'});
 if(col.tpl)add('Формула образца: ='+col.tpl,{role:'formula'});
 if(col.role==='const')add('Всегда: '+R.display(col.value),{role:'const'});
 const hs=headerOptions(rc);
 const g1=document.createElement('optgroup');g1.label='Значение колонки';
 for(const h of hs){const o=new Option('«'+h+'»',JSON.stringify({role:'dim',src:h}));g1.append(o);}
 sel.append(g1);
 if(rc.mode!=='detail'){
  const g2=document.createElement('optgroup');g2.label='Итог по строкам';
  g2.append(new Option('Количество строк'+(col.cond?' (где «'+col.cond.src+'» = '+col.cond.label+')':''),JSON.stringify({role:'measure',agg:'count',src:null,cond:col.cond||null})));
  const nums=rc.main.nums?hs.filter(h=>rc.main.nums.includes(h)||h===col.src):hs;
  for(const [a,l] of AGG.slice(1))for(const h of a==='dcount'?hs:nums)g2.append(new Option(l+' «'+h+'»'+(col.cond?' (где = '+col.cond.label+')':''),JSON.stringify({role:'measure',agg:a,src:h,cond:col.cond||null})));
  sel.append(g2);
 }
 const cur=col.role==='dim'?{role:'dim',src:col.src}:col.role==='measure'?{role:'measure',agg:col.agg,src:col.agg==='count'?null:col.src,cond:col.cond||null}:{role:col.role};
 const cv=JSON.stringify(cur);
 if(![...sel.options].some(o=>o.value===cv))add(L.measureText?describeCol(col):col.role,cur);
 sel.value=cv;
 sel.onchange=()=>{const v=JSON.parse(sel.value);if(rc.mode==='agg'&&v.role==='dim'&&col.role!=='dim'&&!confirm('Колонка станет частью группировки — строки отчёта будут разбиты и по ней. Продолжить?')){sel.value=cv;return;}Object.assign(col,v);if(v.role!=='measure'){delete col.agg;delete col.cond;}if(v.role!=='dim'&&v.role!=='measure')delete col.src;dirty=true;};
 return sel;
}
function describeCol(c){return c.role==='measure'?L.measureText(c):c.role==='dim'?'«'+c.src+'»':c.role;}
function showReport(){if(!report)return;if(report.kind==='doc'){$('obRecipe').hidden=true;$('obDoc').hidden=false;}else{$('obDoc').hidden=true;$('obRecipe').hidden=false;}}
function renderRecipe(){
 $('obRecipe').hidden=false;$('obDoc').hidden=true;
 $('obName').value=report.name;
 const box=$('obSheets');box.replaceChildren();
 for(const rc of report.sheets){
  const p=document.createElement('div');p.style.marginTop='14px';
  const h=document.createElement('h2');h.textContent=report.kind==='docx'?'Таблица '+(rc.docTable+1)+' в документе':'Лист «'+rc.sheet+'»'+(rc.block?', таблица '+rc.block+' (колонки '+XLSX.utils.encode_col(rc.c0)+'–'+XLSX.utils.encode_col(rc.c1)+')':'');p.append(h);
  const q=rc.quality;
  const info=document.createElement('p');info.className='status';
  const lines=[];
  lines.push('Источник: «'+rc.main.label+'»'+(rc.lookups.length?' + справочник «'+[...new Set(rc.lookups.map(l=>l.table.label))].join('», «')+'»':'')+'.');
  const dims=rc.cols.filter(c=>c.role==='dim');
  lines.push(rc.mode==='detail'?'Строки: по одной на каждую подходящую строку исходника.':dims.length?'Строки: по «'+dims.map(c=>c.src).join('» + «')+'».':'Одна строка-итог.');
  if(rc.period)lines.push('Период: '+(rc.period.from===rc.period.to?R.ymLabel(rc.period.to):R.ymLabel(rc.period.from)+' — '+R.ymLabel(rc.period.to))+' по «'+rc.period.base+'».');
  else if(rc.samplePeriod!=null)lines.push('Период образца: '+R.ymLabel(rc.samplePeriod)+' (по подписи или датам).');
  if(rc.sort.length)lines.push('Сортировка: '+rc.sort.map(s=>'«'+(rc.cols.find(c=>c.c===s.c)||{}).name+'» '+(s.dir==='asc'?'по возрастанию':'по убыванию')).join(', затем ')+'.');
  else if(rc.mode==='agg')lines.push('Порядок строк — как в образце, новые строки в конце.');
  if(rc.subtotal)lines.push('Промежуточные итоги: «'+rc.subtotal.tpl.replace('{v}','…')+'».');
  if(rc.total)lines.push('Строка общего итога сохраняется и пересчитывается.');
  lines.push(q.cells?'Проверка: совпало '+q.ok+' из '+q.cells+' значений образца'+(q.covered<q.rows?', найдено '+q.covered+' из '+q.rows+' строк':'')+'.':'');
  info.textContent=lines.filter(Boolean).join('\n');p.append(info);
  if(q.cells&&q.ok<q.cells){const w=document.createElement('p');w.className='warn';w.textContent='Не всё совпало с образцом — проверьте колонки ниже. Частая причина: исходник не за тот период или в образце правили цифры вручную.';p.append(w);}
  if(rc.filters.length){
   const fh=document.createElement('b');fh.textContent='Фильтры';p.append(fh);
   const ch=document.createElement('div');ch.className='chips';
   for(const f of rc.filters){const c=document.createElement('span');c.className='chip';c.textContent='«'+f.src+'» '+(f.op==='keep'?'= ':'≠ ')+f.labels.slice(0,6).join(', ')+(f.labels.length>6?' …':'');
    const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label','Убрать фильтр');x.onclick=()=>{rc.filters=rc.filters.filter(o=>o!==f);dirty=true;renderRecipe();};c.append(x);ch.append(c);}
   p.append(ch);
  }
  const ch=document.createElement('b');ch.textContent='Колонки';ch.style.display='block';ch.style.marginTop='8px';p.append(ch);
  for(const col of rc.cols){
   const row=document.createElement('div');row.className='rcol';
   const b=document.createElement('b');b.textContent=col.name;
   if(col.role==='measure'&&col.match!=null&&col.match<0.999){const s=document.createElement('small');s.className='warn';s.textContent=' совпало '+Math.round(col.match*100)+'%';b.append(s);}
   row.append(b,colSelect(rc,col));p.append(row);
  }
  for(const n of rc.notes){const w=document.createElement('p');w.className='warn';w.textContent=n;p.append(w);}
  box.append(p);
 }
 if(report.kind==='docx'){
  const p=document.createElement('div');p.style.marginTop='14px';
  const h=document.createElement('h2');h.textContent='Числа в тексте';p.append(h);
  if(!report.tokens.length){const t=document.createElement('p');t.className='tip';t.textContent='В тексте нет чисел для пересчёта — поменяются месяцы, даты и таблицы.';p.append(t);}
  for(const tk of report.tokens){
   const row=document.createElement('div');row.className='rcol';
   const b=document.createElement('span');b.style.fontSize='14px';
   const i=tk.context.indexOf(tk.raw);
   b.append('…'+tk.context.slice(0,i));const strong=document.createElement('b');strong.textContent=tk.raw;b.append(strong,tk.context.slice(i+tk.raw.length)+'…');
   if(tk.ambiguous){const w=document.createElement('small');w.className='warn';w.textContent=' (несколько вариантов — проверьте)';b.append(w);}
   const sel=document.createElement('select');sel.setAttribute('aria-label','Откуда число '+tk.raw);
   sel.add(new Option('оставить как в образце','-1'));
   tk.alts.forEach((f,k)=>sel.add(new Option(Wd.factText(f,report),String(k))));
   const cur=tk.fact?tk.alts.findIndex(f=>JSON.stringify(f)===JSON.stringify(tk.fact)):-1;
   sel.value=String(cur);
   sel.onchange=()=>{const k=+sel.value;tk.fact=k<0?null:tk.alts[k];dirty=true;};
   row.append(b,sel);p.append(row);
  }
  box.append(p);
 }
 $('obCompare').closest('label').hidden=report.kind==='docx';
 // разбивка
 const sp=report.splits[0];
 $('obSplitBox').hidden=!sp;
 if(sp){$('obSplitText').textContent='Образец сделан на одно значение «'+sp.src+'» ('+sp.label+'). Сделать такой же файл для каждого значения';$('obSplit').checked=!!report.split;}
 $('obCompare').checked=report.compare!==false;
 $('obAuto').checked=!!report.autoSend;
 updatePeriod(true);
}
$('obName').oninput=()=>{if(report){report.name=$('obName').value.trim()||report.name;dirty=true;}};
$('obSplit').onchange=()=>{report.split=$('obSplit').checked?{src:report.splits[0].src}:null;dirty=true;};
$('obCompare').onchange=()=>{report.compare=$('obCompare').checked;dirty=true;};
$('obAuto').onchange=()=>{report.autoSend=$('obAuto').checked;dirty=true;if(report.saved)store.put(strip(report));};

MON.forEach((m,i)=>$('obMonth').add(new Option(cap(m),i+1)));
function updatePeriod(force){
 if(!report||report.kind==='doc')return;
 const rc=report.sheets[0]||{period:null,main:report.main,sheet:''};
 const gt=genTables();
 const lm=gt.length?L.latestMonth(rc,gt):null;
 let ym=lm?lm.ym:null;
 const base=report.lastPeriod!=null?report.lastPeriod:report.samplePeriod;
 if(ym==null||(base!=null&&ym<=base&&!lm))ym=base!=null?base+1:null;
 if(ym==null){const d=new Date();ym=R.ymOf(d.getFullYear(),d.getMonth());}
 if(force||!$('obYear').value||!$('obMonth').dataset.touched){$('obMonth').value=ym%12+1;$('obYear').value=Math.floor(ym/12);}
 const hint=[];
 if(report.samplePeriod!=null)hint.push('Образец: '+R.ymLabel(report.samplePeriod)+'.');
 if(report.lastPeriod!=null)hint.push('Последний раз сформирован за '+R.ymLabel(report.lastPeriod)+'.');
 if(lm&&lm.all.length>1)hint.push('В новых данных есть месяцы: '+lm.all.slice(-6).map(R.ymLabel).join(', ')+'.');
 if(!rc.period)hint.push('Период по датам не фильтруется: в отчёт идут все строки новых исходников, месяц нужен для подписей.');
 $('obPeriodHint').textContent=hint.join(' ');
}
$('obMonth').onchange=$('obYear').oninput=()=>{$('obMonth').dataset.touched='1';};

/* ---------- генерация ---------- */
function strip(rep){const r=Object.assign({},rep);delete r.tmp;return r;}
$('obRun').onclick=async()=>{
 if(!report)return;
 const tables=genTables();
 if(!tables.length){$('obRunStatus').textContent='Загрузите новые исходники.';return;}
 $('obRun').disabled=true;$('obRunStatus').textContent='Собираю отчёт…';$('obResult').hidden=true;
 await new Promise(r=>setTimeout(r,30));
 try{
  if(!template)template=await store.tpl(report.id);
  if(!template)throw Error('Не найден файл образца для этого отчёта — загрузите образец заново.');
  const ym=R.ymOf(+$('obYear').value,+$('obMonth').value);
  const files=await (report.kind==='docx'?Wd.generate:C.generate)(report,template,tables,{period:ym,prev:report.prevMap||{}});
  if(!files.length)throw Error('Ничего не получилось собрать: по условиям образца нет строк.');
  result={files,period:ym};
  // запоминаем отчёт и снимок для следующего сравнения
  report.prevMap=report.prevMap||{};
  for(const f of files)if(f.snapshot&&report.sheets[0])report.prevMap[(f.split?f.split.key:'')+'|'+report.sheets[0].sheet]=f.snapshot;
  report.lastPeriod=ym;report.lastRun=Date.now();report.lastFiles=files.length;report.saved=true;
  await store.put(strip(report),template).catch(()=>{});
  dirty=false;
  await loadSaved();
  renderResult();
  $('obRunStatus').textContent='';
  toFolder(files,report.name);
  if(report.autoSend&&(S.tgOn(S.get())||S.mailOn(S.get())))sendNow([S.tgOn(S.get())&&'tg',S.mailOn(S.get())&&'mail'].filter(Boolean));
 }catch(e){$('obRunStatus').textContent=e.message||String(e);console.error(e);}
 finally{$('obRun').disabled=false;}
};
const fmt=v=>typeof v==='number'?v.toLocaleString('ru-RU',{maximumFractionDigits:2}):String(v);
function tile(v,t){const d=document.createElement('div'),b=document.createElement('b');d.className='tile';b.textContent=v;d.append(b,t);return d;}
function renderResult(){
 const {files,period}=result;
 $('obResult').hidden=false;
 const f0=files[0];
 const tl=[tile(files.length,files.length===1?'файл':'файлов'),tile(files.reduce((a,f)=>a+f.rows,0),'строк')];
 const t0=f0.totals[0];
 if(t0&&files.length===1){let s=fmt(Math.round(t0.value*100)/100);tl.push(tile(s,t0.name));}
 else if(f0.cmp){tl.push(tile(f0.cmp.cnt['новая']+' / '+f0.cmp.cnt['пропала'],'новых / пропало'));}
 $('obTiles').replaceChildren(...tl);
 // проверки
 const iss=[];const seen=new Set();
 for(const f of files)for(const i of f.issues){const k=i.level+i.text;if(seen.has(k))continue;seen.add(k);iss.push(i);}
 for(const f of files)if(f.cmp)for(const j of f.cmp.jumps.slice(0,8))iss.push({level:'info',text:(files.length>1&&f.split?f.split.label+': ':'')+'резкое изменение — '+j.l+': «'+j.m+'» '+fmt(j.old)+' → '+fmt(j.now)});
 $('obIssuesBox').hidden=!iss.length;$('obIssuesSum').textContent='Проверки: '+iss.length;
 $('obIssues').replaceChildren(...iss.map(i=>{const li=document.createElement('li');li.textContent=(i.level==='error'?'❗ ':i.level==='warn'?'⚠️ ':'')+i.text;return li;}));
 if(iss.some(i=>i.level==='error'))$('obIssuesBox').open=true;
 // файлы
 const fl=$('obFilesOut');fl.replaceChildren();
 if(files.length>1)for(const f of files){
  const r=document.createElement('div');r.className='oprow';const d=document.createElement('div');const b=document.createElement('b');b.textContent=f.name;const s=document.createElement('small');s.textContent='строк: '+f.rows+(f.totals[0]?', '+f.totals[0].name+': '+fmt(Math.round(f.totals[0].value*100)/100):'');d.append(b,s);
  const btn=document.createElement('button');btn.type='button';btn.className='mini secondary';btn.textContent='Скачать';btn.onclick=()=>save([f]);r.append(d,btn);fl.append(r);
 }
 $('obSave').textContent=files.length>1?'Скачать все файлы (ZIP)':'Скачать «'+f0.name+'»';
 preview(f0);
 $('obMsg').value=C.summary(report,files,period);
 $('obSendStatus').textContent='';
 $('obResult').scrollIntoView({behavior:'smooth',block:'start'});
}
function preview(f){
 const p=f.plan[0];const box=$('obPreview');box.replaceChildren();
 if(f.text&&f.text.length){const d=document.createElement('div');d.style.padding='8px 10px';const h=document.createElement('b');h.textContent='Текст документа (изменённые абзацы)';d.append(h);for(const t of f.text.slice(0,8)){const q=document.createElement('p');q.style.margin='6px 0';q.textContent=t;d.append(q);}box.append(d);}
 if(!p)return;
 const t=document.createElement('table');const th=document.createElement('tr');
 for(const c of p.rc.cols){const x=document.createElement('th');x.textContent=c.name;th.append(x);}
 const head=document.createElement('thead');head.append(th);t.append(head);
 const body=document.createElement('tbody');
 const rows=p.res.rows.slice(0,40).concat(p.res.totalRow?[p.res.totalRow]:[]);
 let n=0;
 for(const r of rows){const tr=document.createElement('tr');if(r.kind!=='data')tr.className='sub';else n++;
  for(const c of p.rc.cols){const td=document.createElement('td');let v=r.vals[c.c];if(c.role==='rownum'&&r.kind==='data')v=n;if(r.kind==='total'&&c===p.rc.cols[0]&&v==null)v='Итого';if(c.role==='formula'&&r.kind==='data')v='ƒ';td.textContent=typeof v==='number'?fmt(Math.round(v*100)/100):R.display(v);tr.append(td);}
  body.append(tr);}
 t.append(body);box.append(t);
 if(p.res.rows.length>40){const m=document.createElement('p');m.className='tip';m.style.padding='0 8px';m.textContent='…ещё '+(p.res.rows.length-40)+' строк в файле';box.append(m);}
}
async function packed(files){
 if(files.length===1)return {name:files[0].name,bytes:files[0].bytes,type:typeOf(files[0].name)};
 const z=new JSZip();for(const f of files)z.file(f.name,f.bytes);
 return {name:report.name+(result.period!=null?' — '+R.ymLabel(result.period):'')+'.zip',bytes:await z.generateAsync({type:'uint8array',compression:'DEFLATE'}),type:'application/zip'};
}
async function save(files){const p=await packed(files);p.type=typeOf(p.name);window.sendBarOff=true;try{saveFile(p.name,p.bytes,p.type);}finally{window.sendBarOff=false;}}
$('obSave').onclick=()=>result&&save(result.files);
async function sendNow(channels){
 const s=S.get();
 const st=$('obSendStatus');
 st.textContent='Отправляю…';
 const files=result.files.length>4?[await packed(result.files)]:result.files.map(f=>({name:f.name,bytes:f.bytes,type:typeOf(f.name)}));
 const r=await S.send({files,text:$('obMsg').value,subject:report.name+(result.period!=null?' — '+R.ymLabel(result.period):''),zipName:report.name,channels});
 st.textContent=[r.done.length?'✓ '+r.done.join('\n✓ '):'',r.queued?'Нет интернета — отправлю автоматически, когда связь появится.':'',r.errs.filter(e=>!e.net).map(e=>'✕ '+e.text).join('\n')].filter(Boolean).join('\n');
 queueInfo();
}
$('obTg').onclick=()=>{if(!S.tgOn(S.get())){$('obSendSet').open=true;$('obSendSet').scrollIntoView({behavior:'smooth'});$('sdStatus').textContent='Сначала укажите токен бота и получателей.';return;}sendNow(['tg']);};
$('obMail').onclick=async()=>{if(S.mailOn(S.get()))return sendNow(['mail']);const files=result.files.map(f=>({name:f.name,bytes:f.bytes,type:typeOf(f.name)}));const r=await S.shareMail({files,subject:report.name,text:$('obMsg').value,zipName:report.name});$('obSendStatus').textContent=r==='mailto'?'Файл скачан, открыто письмо — приложите файл. Чтобы письма уходили сами, подключите Google-скрипт в настройках отправки.':r==='shared'?'Передано в выбранное приложение.':'';};

/* ---------- сохранённые отчёты ---------- */
async function loadSaved(){
 saved=(await store.list()).sort((a,b)=>(b.lastRun||b.created)-(a.lastRun||a.created));
 const box=$('obSaved');box.replaceChildren();$('obSavedBox').hidden=!saved.length;
 for(const r of saved){
  const row=document.createElement('div');row.className='oprow';
  const d=document.createElement('div');const b=document.createElement('b');b.textContent=r.name;const s=document.createElement('small');
  s.textContent=[r.kind==='doc'?'Word':'',r.kind==='doc'&&r.lastRun?'последний раз: '+new Date(r.lastRun).toLocaleDateString('ru-RU')+(r.lastFiles?', документов: '+r.lastFiles:''):'',r.lastPeriod!=null?'последний: '+R.ymLabel(r.lastPeriod):'',r.kind!=='doc'&&r.lastFiles>1?r.lastFiles+' файлов':'',r.autoSend?'отправка включена':''].filter(Boolean).join(' · ')||'образец: '+r.templateName;
  d.append(b,s);
  const bt=document.createElement('div');bt.style.cssText='display:flex;gap:6px;flex:none';
  const mk=(t,f,cls)=>{const x=document.createElement('button');x.type='button';x.className='mini '+(cls||'');x.textContent=t;x.onclick=f;return x;};
  bt.append(mk(report&&report.id===r.id?'Выбран':'Выбрать',()=>choose(r.id)),mk('⇩',()=>exportRep(r),'secondary'),mk('✕',async()=>{if(!confirm('Удалить отчёт «'+r.name+'»?'))return;await store.del(r.id);if(report&&report.id===r.id){report=null;$('obRecipe').hidden=true;}loadSaved();},'secondary'));
  bt.children[1].title='Сохранить файл отчёта для коллеги';bt.children[1].setAttribute('aria-label','Экспорт');
  row.append(d,bt);box.append(row);
 }
}
async function choose(id,silent){
 const r=saved.find(x=>x.id===id);if(!r)return;
 report=JSON.parse(JSON.stringify(r));template=await store.tpl(id);
 items=items.filter(x=>x.role!=='sample');
 if(report.kind==='doc')renderDoc();else renderRecipe();renderFiles();loadSaved();
 if(!silent){$('obStatus').textContent='Отчёт «'+r.name+'» выбран — загрузите новые исходники, выберите месяц и нажмите «Сформировать отчёт».';$('obDrop').scrollIntoView({behavior:'smooth',block:'center'});}
}
async function exportRep(r){
 const tpl=await store.tpl(r.id);
 let s='';for(let i=0;i<tpl.length;i+=32768)s+=String.fromCharCode.apply(null,tpl.subarray(i,i+32768));
 const out=Object.assign({},r);delete out.prevMap;delete out.autoSend;
 const json=JSON.stringify({format:'dpga-obrazec',v:1,report:out,template:btoa(s)});
 window.sendBarOff=true;try{saveFile(r.name+'.json',new TextEncoder().encode(json),'application/json');}finally{window.sendBarOff=false;}
}
$('obImportBtn').onclick=()=>$('obImport').click();
$('obImport').onchange=async()=>{
 const f=$('obImport').files[0];$('obImport').value='';if(!f)return;
 try{
  const j=JSON.parse(await f.text());if(j.format!=='dpga-obrazec')throw Error('Это не файл отчёта «По образцу».');
  const rep=j.report;rep.id='r'+Date.now().toString(36);rep.saved=true;
  const bin=atob(j.template),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  await store.put(rep,bytes);await loadSaved();await choose(rep.id);
 }catch(e){$('obStatus').textContent=e.message||String(e);}
};

/* ---------- загрузка файлов ---------- */
$('obFiles').onchange=()=>{const fs=[...$('obFiles').files];$('obFiles').value='';addFiles(fs);};
const drop=$('obDrop');
['dragenter','dragover'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add('over');}));
['dragleave','drop'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove('over');}));
drop.addEventListener('drop',ev=>addFiles([...ev.dataTransfer.files]));

/* ---------- настройки отправки ---------- */
function renderSend(){
 const s=S.get();
 $('sdToken').value=s.tgToken;$('sdEmails').value=s.emails;$('sdGasUrl').value=s.gasUrl;$('sdGasKey').value=s.gasKey;
 $('sdGas').value=S.GAS;
 const box=$('sdTo');box.replaceChildren();
 for(const r of s.tgTo){
  const row=document.createElement('label');row.className='check';
  const cb=document.createElement('input');cb.type='checkbox';cb.checked=r.on!==false;cb.onchange=()=>{r.on=cb.checked;S.set(s);};
  const nm=document.createElement('input');nm.type='text';nm.value=r.name;nm.style.cssText='flex:1;min-height:34px;padding:5px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink)';nm.setAttribute('aria-label','Подпись получателя');nm.onchange=()=>{r.name=nm.value.trim()||r.id;S.set(s);};
  const del=document.createElement('button');del.type='button';del.className='mini secondary';del.textContent='✕';del.onclick=()=>{s.tgTo=s.tgTo.filter(x=>x!==r);S.set(s);renderSend();};
  const sm=document.createElement('small');sm.textContent=r.id;
  row.append(cb,nm,sm,del);box.append(row);
 }
}
const saveSend=()=>{const s=S.get();s.tgToken=$('sdToken').value.trim();s.emails=$('sdEmails').value.trim();s.gasUrl=$('sdGasUrl').value.trim();s.gasKey=$('sdGasKey').value.trim();S.set(s);};
['sdToken','sdEmails','sdGasUrl','sdGasKey'].forEach(id=>$(id).addEventListener('change',saveSend));
$('sdManual').onchange=()=>{const v=$('sdManual').value.trim();if(!/^-?\d{4,}$/.test(v)&&!/^@\w+$/.test(v)){$('sdStatus').textContent='Chat id — это число, например 123456789 (или @канал).';return;}const s=S.get();if(!s.tgTo.some(r=>r.id===v))s.tgTo.push({id:v,name:'Получатель '+v,on:true});S.set(s);$('sdManual').value='';renderSend();};
$('sdFind').onclick=async()=>{
 saveSend();const s=S.get();
 if(!s.tgToken){$('sdStatus').textContent='Укажите токен бота.';return;}
 $('sdStatus').textContent='Ищу, кто писал боту…';
 try{
  const found=await S.findChats(s.tgToken);
  let added=0;for(const c of found)if(!s.tgTo.some(r=>r.id===c.id)){s.tgTo.push({id:c.id,name:c.name+(c.user?' (@'+c.user+')':''),on:true});added++;}
  S.set(s);renderSend();
  $('sdStatus').textContent=found.length?'Найдено: '+found.length+(added?', добавлено: '+added:'')+'. Подпишите, кто есть кто (например «Маркетолог»), и снимите галочки у лишних.':'Пока никто не писал боту. Попросите маркетолога открыть бота и нажать «Старт», затем повторите.';
 }catch(e){$('sdStatus').textContent=e.message||String(e);}
};
$('sdGasCopy').onclick=async()=>{try{await navigator.clipboard.writeText(S.GAS);$('sdStatus').textContent='Код скопирован.';}catch(e){$('sdGas').select();}};
$('sdTest').onclick=async()=>{
 saveSend();const s=S.get();const ch=[S.tgOn(s)&&'tg',S.mailOn(s)&&'mail'].filter(Boolean);
 if(!ch.length){$('sdStatus').textContent='Настройте Telegram (токен и получатели) или Google-скрипт для почты.';return;}
 $('sdStatus').textContent='Отправляю…';
 const txt='Проверка: центр отчётов ДПГА будет присылать сюда готовые отчёты.';
 const r=await S.send({files:[{name:'Проверка.txt',bytes:new TextEncoder().encode(txt),type:'text/plain'}],text:txt,subject:'Проверка отправки отчётов',channels:ch});
 $('sdStatus').textContent=[r.done.map(x=>'✓ '+x).join('\n'),r.errs.map(e=>'✕ '+e.text).join('\n'),r.queued?'Нет интернета — проверка уйдёт позже.':''].filter(Boolean).join('\n');
 queueInfo();
};
async function queueInfo(){const n=await S.pending();$('sdQueue').textContent=n?'В очереди на отправку: '+n+' — уйдут, когда появится интернет.':'';}
S.onChange(m=>{queueInfo();if(String(m).startsWith('sent:'))$('obSendStatus').textContent='✓ Отправлено из очереди: '+m.slice(5);});


/* ---------- Word по образцу ---------- */
let docRecs=null;const picked=new Set();
const FMT={text:'как есть',fio:'Фамилия И.О.',num:'число',date:'дата',words:'прописью'};
function docTables(){let t=tablesBy(['new','both']);if(!t.length)t=tablesBy(['old']);return t;}
function renderDoc(){
 showReport();
 const rc=report;
 $('odName').value=rc.name;
 const n=Object.values(rc.spans).reduce((a,l)=>a+l.length,0);
 $('odInfo').textContent='Данные: «'+rc.main.label+'». Мест для подстановки: '+n+'.';
 const box=$('odFields');box.replaceChildren();
 const opts=rc.main.headers.slice();
 for(const p in rc.spans)for(const sp of rc.spans[p]){
  const row=document.createElement('div');row.className='rcol';
  const b=document.createElement('b');b.textContent=sp.orig.length>60?sp.orig.slice(0,57)+'…':sp.orig;
  const sm=document.createElement('small');sm.style.display='block';sm.className='tip';sm.textContent=(p.includes('header')?'верхний колонтитул · ':p.includes('footer')?'нижний колонтитул · ':'')+(FMT[sp.fmt.t]||'')+(sp.fmt.t==='fio'?'':'');b.append(sm);
  const sel=document.createElement('select');sel.setAttribute('aria-label','Откуда «'+sp.orig+'»');
  sel.add(new Option('— оставить как в образце —','__keep'));
  sel.add(new Option('Дата документа (настройка ниже)','__date'));
  for(const h of opts)sel.add(new Option('«'+h+'»',h));
  for(const h of rc.main.nums||[])sel.add(new Option('Сумма «'+h+'» по таблице документа','Σ:'+h));
  if(![...sel.options].some(o=>o.value===sp.f))sel.add(new Option(sp.f,sp.f));
  sel.value=sp.f;sel.onchange=()=>{sp.f=sel.value;dirty=true;};
  row.append(b,sel);box.append(row);
 }
 $('odListBox').hidden=!rc.list;
 if(rc.list){
  const cols=Object.values(rc.list.cellMap).map(c=>c.num?'№':'«'+c.src+'»');
  $('odList').textContent='Строки таблицы: '+cols.join(', ')+(rc.list.total?'; строка «Итого» пересчитывается':'')+'.';
  const g=$('odGroup');g.replaceChildren();g.add(new Option('— каждая строка данных отдельно —',''));
  for(const h of rc.main.headers)g.add(new Option('«'+h+'»',h));
  g.value=rc.group||'';
 }
 const d=new Date();$('odDate').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 $('odKeepDate').checked=!!rc.keepDate;
 picked.clear();loadRecs();
}
$('odName').oninput=()=>{if(report&&report.kind==='doc'){report.name=$('odName').value.trim()||report.name;dirty=true;}};
$('odGroup').onchange=()=>{report.group=$('odGroup').value||null;dirty=true;picked.clear();loadRecs();};
$('odKeepDate').onchange=()=>{report.keepDate=$('odKeepDate').checked;};
function loadRecs(){
 const t=docTables();
 if(!t.length){docRecs=null;$('odRecs').replaceChildren();$('odCount').textContent='Загрузите таблицу с данными (Excel или CSV).';return;}
 try{docRecs=Dc.records(report,t);}catch(e){docRecs=null;$('odCount').textContent=e.message;$('odRecs').replaceChildren();return;}
 if(docRecs.list.length<=30&&!picked.size)for(const r of docRecs.list)if(!(report.done||[]).includes(r.key))picked.add(r.key);
 drawRecs();
}
function shownRecs(){
 if(!docRecs)return [];
 const q=R.norm($('odFind').value);const done=new Set(report.done||[]);
 return docRecs.list.filter(r=>(!$('odOnlyNew').checked||!done.has(r.key))&&(!q||R.norm(r.label+' '+r.hint).includes(q)));
}
function drawRecs(){
 const box=$('odRecs');box.replaceChildren();
 const list=shownRecs();const done=new Set(report.done||[]);
 for(const r of list.slice(0,300)){
  const l=document.createElement('label');l.className='check';
  const cb=document.createElement('input');cb.type='checkbox';cb.checked=picked.has(r.key);cb.onchange=()=>{cb.checked?picked.add(r.key):picked.delete(r.key);count();};
  const t=document.createElement('span');t.textContent=r.label+(r.rows.length>1?' — строк: '+r.rows.length:'')+(r.hint?' · '+r.hint:'')+(done.has(r.key)?' (уже делали)':'');
  l.append(cb,t);box.append(l);
 }
 if(list.length>300){const m=document.createElement('p');m.className='tip';m.textContent='Показаны первые 300 из '+list.length+' — уточните поиск.';box.append(m);}
 count();
}
function count(){$('odCount').textContent=docRecs?'Отмечено: '+picked.size+' из '+docRecs.list.length:'';$('odRun').disabled=!picked.size;}
$('odFind').oninput=drawRecs;$('odOnlyNew').onchange=drawRecs;
$('odAll').onclick=()=>{for(const r of shownRecs())picked.add(r.key);drawRecs();};
$('odNone').onclick=()=>{picked.clear();drawRecs();};
$('odRun').onclick=async()=>{
 if(!report||!docRecs)return;
 const recs=docRecs.list.filter(r=>picked.has(r.key));
 if(!recs.length)return;
 $('odRun').disabled=true;$('obResult').hidden=true;
 try{
  if(!template)template=await store.tpl(report.id);
  const [y,m,d]=$('odDate').value.split('-').map(Number);
  const date=report.keepDate||!y?null:R.DV.of(y,m,d);
  const files=[],used=new Set();
  for(let k=0;k<recs.length;k++){
   if(k%5===0){$('odStatus').textContent='Документ '+(k+1)+' из '+recs.length+'…';await new Promise(r=>setTimeout(r));}
   const bytes=await Dc.makeDoc(report,template,docRecs.T,recs[k],{date});
   files.push({name:Dc.fileName(report,docRecs.T,recs[k],used),bytes,label:recs[k].label});
  }
  const extra=[];
  if($('odMerge').checked&&files.length>1)extra.push({name:report.name+' — все ('+files.length+').docx',bytes:await Dc.merge(template,files.map(f=>f.bytes))});
  if($('odReg').checked&&files.length>1)extra.push({name:report.name+' — реестр.xlsx',bytes:await docRegister(files,recs)});
  const all=files.concat(extra);
  report.done=[...new Set((report.done||[]).concat(recs.map(r=>r.key)))].slice(-20000);
  report.lastRun=Date.now();report.lastFiles=files.length;report.saved=true;
  await store.put(strip(report),template).catch(()=>{});dirty=false;await loadSaved();
  result={files:all,period:null,doc:true};
  renderDocResult(files.length);
  toFolder(all,report.name);
  $('odStatus').textContent='';
  for(const r of recs)picked.delete(r.key);drawRecs();
 }catch(e){$('odStatus').textContent=e.message||String(e);console.error(e);}
 finally{$('odRun').disabled=!picked.size;}
};
async function docRegister(files,recs){
 const W=window.ObrazecWrite;const z=W.blankBook();
 await W.putSheet(z,'Реестр',S0=>({rows:[{cells:[{v:'№',s:S0.head},{v:'Файл',s:S0.head},{v:'Кому / по чему',s:S0.head},{v:'Строк',s:S0.head},{v:'Подробнее',s:S0.head}]}].concat(files.map((f,i)=>({cells:[{v:i+1,s:S0.int},{v:f.name},{v:recs[i].label},{v:recs[i].rows.length,s:S0.int},{v:recs[i].hint||''}]}))),freeze:1,filter:'A1:E'+(files.length+1),widths:[6,50,40,8,50]}));
 return await z.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
function renderDocResult(n){
 $('obResult').hidden=false;
 $('obTiles').replaceChildren(tile(n,n===1?'документ':'документов'));
 $('obIssuesBox').hidden=true;$('obPreview').replaceChildren();
 const fl=$('obFilesOut');fl.replaceChildren();
 for(const f of result.files.slice(0,200)){const r=document.createElement('div');r.className='oprow';const d=document.createElement('div');const b=document.createElement('b');b.textContent=f.name;d.append(b);const btn=document.createElement('button');btn.type='button';btn.className='mini secondary';btn.textContent='Скачать';btn.onclick=()=>save([f]);r.append(d,btn);fl.append(r);}
 $('obSave').textContent=result.files.length>1?'Скачать все (ZIP)':'Скачать «'+result.files[0].name+'»';
 $('obMsg').value='📄 '+report.name+': документов — '+n+'\n'+result.files.slice(0,15).map(f=>'• '+(f.label||f.name)).join('\n')+(result.files.length>15?'\n…':'');
 $('obSendStatus').textContent='';
 $('obResult').scrollIntoView({behavior:'smooth',block:'start'});
}

/* ---------- папки: готовые и входящие ---------- */
const FSA=!!window.showDirectoryPicker&&!window.AndroidBridge;
function hdb(){return new Promise((ok,bad)=>{const r=indexedDB.open('dpga-folders',1);r.onupgradeneeded=()=>r.result.createObjectStore('h');r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}
async function hget(k){try{const d=await hdb();return await new Promise(ok=>{const q=d.transaction('h').objectStore('h').get(k);q.onsuccess=()=>ok(q.result||null);q.onerror=()=>ok(null);});}catch(e){return null;}}
async function hput(k,v){const d=await hdb();return new Promise(ok=>{const t=d.transaction('h','readwrite');t.objectStore('h').put(v,k);t.oncomplete=()=>ok();});}
async function allowed(h){try{if((await h.queryPermission({mode:'readwrite'}))==='granted')return true;return (await h.requestPermission({mode:'readwrite'}))==='granted';}catch(e){return false;}}
async function writeTo(dir,name,bytes){const fh=await dir.getFileHandle(name,{create:true});const w=await fh.createWritable();await w.write(bytes);await w.close();}
const safe=n=>String(n).replace(/[\\/:*?"<>|]+/g,' ').trim().slice(0,80)||'Отчёт';
async function toFolder(files,sub){
 if(!FSA)return;
 const h=await hget('out');if(!h)return;
 try{if(!await allowed(h))return;const dir=sub?await h.getDirectoryHandle(safe(sub),{create:true}):h;for(const f of files)await writeTo(dir,f.name,f.bytes);
  const st=$('obSendStatus');if(st)st.textContent='✓ Сохранено в папку «'+h.name+(sub?'/'+safe(sub):'')+'»: '+files.length+' файл(ов).';}
 catch(e){const st=$('obSendStatus');if(st)st.textContent='Не удалось записать в папку: '+(e.message||e);}
}
window.saveToFolder=async(name,bytes)=>{const h=await hget('out');if(!h||!await allowed(h))return false;try{await writeTo(h,name,bytes);return true;}catch(e){return false;}};
async function showFolders(){
 $('obFolders').hidden=!FSA;if(!FSA)return;
 const o=await hget('out'),i=await hget('in');
 $('fdOut').textContent=o?o.name:'не выбрана';$('fdIn').textContent=i?i.name:'не выбрана';
 window.outFolderReady=!!o;
}
async function pick(k){try{const h=await showDirectoryPicker({id:'dpga-'+k,mode:'readwrite'});await hput(k,h);showFolders();}catch(e){if(e.name!=='AbortError')$('fdStatus').textContent=e.message||String(e);}}
$('fdOutPick').onclick=()=>pick('out');$('fdInPick').onclick=()=>pick('in');
$('fdRun').onclick=async()=>{
 const st=$('fdStatus');
 const hi=await hget('in'),ho=await hget('out');
 if(!hi||!ho){st.textContent='Выберите обе папки.';return;}
 if(!await allowed(hi)||!await allowed(ho)){st.textContent='Нет доступа к папке — разрешите доступ.';return;}
 let doneMap={};try{doneMap=JSON.parse(localStorage.getItem('dpga-inbox')||'{}');}catch(e){}
 const fresh=[];
 for await(const [n,h] of hi.entries()){if(h.kind!=='file'||!/\.(xlsx|xlsm|xls|csv)$/i.test(n)||n.startsWith('~$'))continue;const f=await h.getFile();const k=n+'|'+f.lastModified;if(doneMap[k])continue;fresh.push({f,k});}
 if(!fresh.length){st.textContent='Новых файлов во «Входящих» нет.';return;}
 st.textContent='Читаю '+fresh.length+' файл(ов)…';
 const its=[];
 for(const {f} of fresh){try{const book=R.readBook(f.name,await f.arrayBuffer());its.push({name:f.name,book,tables:R.tablesOf(book),lastModified:f.lastModified});}catch(e){}}
 const reps=saved.filter(r=>r.kind!=='doc');const log=[];
 for(const rep of reps){
  const cl=C.classify(its,[rep]);if(!cl.report)continue;
  try{
   const tpl=await store.tpl(rep.id);const tables=its.flatMap(x=>x.tables.map(t=>Object.assign({},t,{cols:t.cols.filter(c=>!c.virt||c.virt.kind!=='lookup')})));
   const lm=L.latestMonth(rep.sheets[0]||{period:null,main:rep.main},tables);const ym=lm?lm.ym:(rep.lastPeriod!=null?rep.lastPeriod+1:null);
   const files=await (rep.kind==='docx'?Wd.generate:C.generate)(rep,tpl,tables,{period:ym,prev:rep.prevMap||{}});
   const dir=await ho.getDirectoryHandle(safe(rep.name),{create:true});
   for(const f of files)await writeTo(dir,f.name,f.bytes);
   rep.prevMap=rep.prevMap||{};for(const f of files)if(f.snapshot&&rep.sheets[0])rep.prevMap[(f.split?f.split.key:'')+'|'+rep.sheets[0].sheet]=f.snapshot;
   rep.lastPeriod=ym;rep.lastRun=Date.now();rep.lastFiles=files.length;await store.put(rep);
   log.push('✓ «'+rep.name+'»'+(ym!=null?' за '+R.ymLabel(ym):'')+': '+files.length+' файл(ов) → '+ho.name+'/'+safe(rep.name));
  }catch(e){log.push('✕ «'+rep.name+'»: '+(e.message||e));}
 }
 if(!log.length)log.push('Не узнал ни одного сохранённого отчёта по этим файлам. Сначала один раз сделайте отчёт по образцу на вкладке.');
 else for(const {k} of fresh)doneMap[k]=Date.now();
 try{localStorage.setItem('dpga-inbox',JSON.stringify(doneMap));}catch(e){}
 st.textContent=log.join('\n');loadSaved();
};
showFolders();

/* ---------- закрытый контур и Android ---------- */
if(window.CLOSED||window.AndroidBridge){
 $('obTg').hidden=true;
 for(const id of ['sdTgBox','sdGasBox','sdTest'])if($(id))$(id).hidden=true;
 $('obMail').textContent=window.AndroidBridge?'Поделиться (почта, мессенджеры)':'Письмо в Outlook / почте';
 $('obAuto').closest('label').hidden=true;
 $('obDownloads').hidden=true;
}
renderSend();queueInfo();loadSaved();
})();
