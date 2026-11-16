/* «По образцу» → «Объединить файлы»: несколько файлов одной формы → один файл в оформлении первого.
   Два способа: «сложить» (одинаковые строки суммируются — формы филиалов) и
   «друг под другом» (строки всех файлов подряд — списки менеджеров). */
(function(){
'use strict';
const R=window.ObrazecRead,L=window.ObrazecLearn,W=window.ObrazecWrite;
const {norm,normH,toNum,vkey,filled,DV}=R;
const colS=n=>XLSX.utils.encode_col(n);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const unesc=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,d)=>String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&amp;/g,'&');
const AVG_RE=/%|процент|доля|средн|цена|курс|ставк|коэф|рентаб|маржин/i;

function tablesOf(book){
 const out=[];
 for(const sh of book.sheets){
  R.detectTables(sh).forEach((tb,bi)=>{const prof=R.profile(sh,tb);out.push({sh,tb,prof,key:sh.name+'#'+bi,heads:new Set(tb.cols.map(c=>normH(c.name)))});});
 }
 return out;
}
function jacc(a,b){let i=0;for(const x of a)if(b.has(x))i++;return i/Math.max(1,a.size+b.size-i);}
function mapCols(rt,ot){
 const m=new Map();const used=new Set();
 for(const c of rt.tb.cols){
  let hit=ot.tb.cols.find(x=>!used.has(x.c)&&normH(x.name)===normH(c.name));
  if(!hit){let best=null;for(const x of ot.tb.cols){if(used.has(x.c))continue;const s=L.nameSim(c.name,x.name);if(s>=0.7&&(!best||s>best.s))best={x,s};}hit=best&&best.x;}
  if(hit){m.set(c.c,hit.c);used.add(hit.c);}
 }
 return m;
}
const rowsOf=(t,kinds)=>t.tb.rows.filter(x=>kinds.includes(x.kind));
const val=(t,r,c)=>c==null?null:(t.sh.grid[r]||[])[c];
function rowKey(t,r,cols,cm){
 return cols.map(c=>{const v=val(t,r,cm?cm.get(c):c);return filled(v)?vkey(v):'';}).join('\u0001');
}
/** Ключи строк с номером повтора: «в том числе» встречается несколько раз. */
function keyed(t,rows,cols,cm){
 const seen=new Map();
 return rows.map(x=>{const k=rowKey(t,x.r,cols,cm);const n=(seen.get(k)||0)+1;seen.set(k,n);return {r:x.r,kind:x.kind,key:k+'#'+n};});
}
/** Общая часть имён файлов: «Форма1_Пермь», «Форма1_Казань» → отличающиеся слова. */
function nameTokens(names){
 const toks=names.map(n=>n.replace(/\.[^.]+$/,'').split(/[_\s.,()-]+/).filter(Boolean));
 return toks.map((t,i)=>t.filter(w=>w.length>=3&&toks.every((o,j)=>j===i||!o.includes(w))));
}

/** Разбор: какая таблица с какой совпадает, способ объединения, колонки. */
function analyze(items,refIdx){
 refIdx=refIdx||0;
 const files=items.map(it=>({name:it.name,book:it.book,tables:tablesOf(it.book)}));
 const ref=files[refIdx];
 if(!ref||!ref.tables.length)throw Error('В первом файле не нашлось таблицы.');
 const groups=[];const notes=[];
 for(const rt of ref.tables){
  const parts=[{f:refIdx,t:rt,cm:new Map(rt.tb.cols.map(c=>[c.c,c.c]))}];
  files.forEach((f,i)=>{
   if(i===refIdx)return;
   let best=null;
   for(const ot of f.tables){const s=jacc(rt.heads,ot.heads)+(ot.key===rt.key?0.15:0);if(!best||s>best.s)best={ot,s};}
   if(!best||best.s<0.5){notes.push({level:'warn',text:'«'+f.name+'»: не нашёл таблицу как «'+rt.sh.name+'» в первом файле — файл пропущен.'});return;}
   const cm=mapCols(rt,best.ot);
   const miss=rt.tb.cols.filter(c=>!cm.has(c.c)).map(c=>c.name);
   if(miss.length)notes.push({level:'warn',text:'«'+f.name+'»: нет колонок '+miss.map(x=>'«'+x+'»').join(', ')+' — они останутся пустыми.'});
   parts.push({f:i,t:best.ot,cm});
  });
  // ключевые колонки: текст; числа, одинаковые во всех файлах (коды строк), тоже ключ
  const textCols=rt.prof.cols.filter(c=>c.type==='text'||c.type==='date').map(c=>c.c);
  const numCols=rt.prof.cols.filter(c=>c.type==='number').map(c=>c.c);
  const rows0=rowsOf(rt,['data','sub','total']);
  const k0=keyed(rt,rows0,textCols);
  const set0=new Set(k0.map(x=>x.key));
  let ov=0,cnt=0;
  for(const p of parts.slice(1)){const kk=keyed(p.t,rowsOf(p.t,['data','sub','total']),textCols,p.cm);let h=0;for(const x of kk)if(set0.has(x.key))h++;ov+=kk.length?h/kk.length:0;cnt++;}
  const overlap=cnt?ov/cnt:0;
  const auto=cnt&&overlap>=0.7?'sum':'stack';
  const keyNums=numCols.filter(c=>{
   if(/^(код|№|номер|n|no|строка|код строки)$/i.test(normH(rt.tb.cols.find(x=>x.c===c).name)))return true;
   // одинаковы во всех файлах по ключу
   const ref1=new Map(k0.map(x=>[x.key,toNum(val(rt,x.r,c))]));let same=0,tot=0;
   for(const p of parts.slice(1)){for(const x of keyed(p.t,rowsOf(p.t,['data','sub','total']),textCols,p.cm)){if(!ref1.has(x.key))continue;const a=ref1.get(x.key),b=toNum(val(p.t,x.r,p.cm.get(c)));if(a==null&&b==null)continue;tot++;if(a===b)same++;}}
   return tot>=3&&same===tot;
  });
  const meas=numCols.filter(c=>!keyNums.includes(c)).map(c=>{const col=rt.prof.cols.find(x=>x.c===c);return {c,name:col.name,how:col.formula?'formula':AVG_RE.test(col.name)?'avg':'sum'};});
  groups.push({rt,parts,mode:auto,auto,overlap,textCols,keyNums,meas,title:rt.sh.name+(rt.tb.block?' (таблица '+rt.tb.block+')':'')});
 }
 const toks=nameTokens(files.map(f=>f.name));
 return {files,refIdx,groups,notes,tokens:toks};
}

/* ---------- сложение «в ячейки» первого файла ---------- */
function parseRowsXml(sd){
 const rows=[];const re=/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;let m;
 while((m=re.exec(sd))){const r=+/\br="(\d+)"/.exec(m[1])[1];const cells=[];const cre=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;let c;
  while((c=cre.exec(m[2]||''))){const ref=/\br="([A-Z]+)(\d+)"/.exec(c[1]);cells.push({col:XLSX.utils.decode_col(ref[1]),attrs:c[1],inner:c[2]||'',raw:c[0]});}
  rows.push({r,attrs:m[1],cells,raw:m[0]});}
 return rows;
}
function patchValues(xml,edits){
 // edits: Map(rowNumber → Map(col → number|null))
 return xml.replace(/(<sheetData\b[^>]*>)([\s\S]*?)(<\/sheetData>)/,(m,a,sd,b)=>{
  const rows=parseRowsXml(sd);
  const out=rows.map(row=>{
   const e=edits.get(row.r);
   const cells=row.cells.map(c=>{
    let x=c.raw;
    if(/<f\b/.test(c.inner))x=x.replace(/<v>[\s\S]*?<\/v>/,''); // формулы пересчитает Excel
    if(e&&e.has(c.col)&&!/<f\b/.test(c.inner)){const v=e.get(c.col);const st=/\bs="(\d+)"/.exec(c.attrs);const ref=colS(c.col)+row.r;x=v==null?'<c r="'+ref+'"'+(st?' s="'+st[1]+'"':'')+'/>':'<c r="'+ref+'"'+(st?' s="'+st[1]+'"':'')+'><v>'+(+v.toFixed(10))+'</v></c>';e.delete(c.col);}
    return {col:c.col,x};
   });
   if(e)for(const [col,v] of e){if(v==null)continue;cells.push({col,x:'<c r="'+colS(col)+row.r+'"><v>'+(+v.toFixed(10))+'</v></c>'});}
   cells.sort((p,q)=>p.col-q.col);
   return '<row'+row.attrs.replace(/\s*spans="[^"]*"/,'')+(cells.length?'>'+cells.map(c=>c.x).join('')+'</row>':'/>');
  });
  return a+out.join('')+b;
 });
}

/** Итог по файлу для листа «Сверка». */
function fileTotals(t,cm,meas){
 const rows=rowsOf(t,['data']);
 return meas.map(m=>{let s=0,n=0;for(const x of rows){const v=toNum(val(t,x.r,cm.get(m.c)));if(v!=null){s+=v;n++;}}return n?s:null;});
}

async function build(an,opt){
 opt=opt||{};
 const ref=an.files[an.refIdx];
 const refTok=an.tokens[an.refIdx]||[];
 const label=i=>{const t=an.tokens[i];return t&&t.length?t.join(' '):an.files[i].name.replace(/\.[^.]+$/,'');};
 const allLab=an.files.map((f,i)=>label(i));
 const joined=allLab.length<=4?allLab.join(', '):'сводно, '+allLab.length+' файлов';
 const pairs=refTok.map(t=>({from:t,to:joined}));
 // «Абакумов Андрей Сергеевич», «Абакумов А.С.» — заменяем вместе с именем и отчеством
 const reTok=refTok.length?new RegExp('('+refTok.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?:\\s+[А-ЯЁ]\\.\\s?[А-ЯЁ]\\.|(?:\\s+[А-ЯЁ][а-яё]+){1,2}(?=$|[\\s,.;:)»"]))?','g'):null;
 const replace=t=>reTok?t.replace(reTok,joined):t;
 const issues=an.notes.slice();
 const plan=[];const sumEdits=new Map();
 const check=[];
 for(const g of an.groups){
  const {rt}=g;
  if(g.mode==='sum'){
   const rows0=keyed(rt,rowsOf(rt,['data','sub','total']),g.textCols.concat(g.keyNums));
   const byKey=g.parts.map(p=>new Map(keyed(p.t,rowsOf(p.t,['data','sub','total']),g.textCols.concat(g.keyNums),p.cm).map(x=>[x.key,x.r])));
   const ed=sumEdits.get(rt.sh.name)||new Map();sumEdits.set(rt.sh.name,ed);
   for(const x of rows0){
    for(const m of g.meas){
     if(m.how==='formula'||m.how==='keep')continue;
     if((rt.sh.formulas[x.r]||[])[m.c])continue;
     let s=0,n=0;
     g.parts.forEach((p,i)=>{const r=byKey[i].get(x.key);if(r==null)return;const v=toNum(val(p.t,r,p.cm.get(m.c)));if(v!=null){s+=v;n++;}});
     const v=m.how==='clear'?null:!n?null:m.how==='avg'?s/n:s;
     if(!ed.has(x.r+1))ed.set(x.r+1,new Map());ed.get(x.r+1).set(m.c,v);
    }
   }
   g.parts.slice(1).forEach((p,i)=>{const miss=[...byKey[i+1].keys()].filter(k=>!rows0.some(x=>x.key===k));if(miss.length)issues.push({level:'warn',text:'«'+an.files[p.f].name+'»: '+miss.length+' строк нет в форме первого файла — они не вошли в свод.'});});
   const avg=g.meas.filter(m=>m.how==='avg').map(m=>'«'+m.name+'»');
   if(avg.length)issues.push({level:'info',text:'Колонки '+avg.join(', ')+' не складываются — взято среднее по файлам. Если нужно иначе, выберите способ для колонки.'});
  }else{
   // друг под другом: строки всех файлов подряд, итог пересчитывается
   const prof=rt.prof;
   const firstData=rt.tb.rows.find(x=>x.kind==='data');
   let lastRow=rt.tb.rows[0].r;for(const x of rt.tb.rows)if(x.kind!=='total')lastRow=x.r;
   const totalR=rt.tb.rows.find(x=>x.kind==='total');
   const cols=prof.cols.map(col=>{
    if(col.formula)return {c:col.c,name:col.name,role:'formula',tpl:(rt.sh.formulas[firstData.r]||[])[col.c]||'',tplRow:firstData.r+1};
    if(col.type==='number'){let k=0;col.vals.forEach((v,j)=>{if(toNum(v)===j+1)k++;});if(prof.n>=2&&k>=0.9*prof.n)return {c:col.c,name:col.name,role:'rownum'};}
    return {c:col.c,name:col.name,role:'dim'};
   });
   const srcC=opt.sourceCol?rt.tb.c1+1:null;
   if(srcC!=null)cols.push({c:srcC,name:'Источник',role:'dim'});
   const out=[];
   g.parts.forEach(p=>{
    const rows=rowsOf(p.t,['data']);const lab=label(p.f);const start=out.length;
    for(const x of rows){const vals={};for(const col of cols){if(col.c===srcC){vals[col.c]=lab;continue;}if(col.role!=='dim')continue;const v=val(p.t,x.r,p.cm.get(col.c));vals[col.c]=v==null?null:v;}out.push({kind:'data',vals,key:''});}
    if(opt.perFile&&rows.length){const sub={kind:'sub',vals:{}};const tc=cols.find(c=>c.role==='dim'&&rt.prof.cols.find(x=>x.c===c.c&&x.type==='text'))||cols[0];sub.vals[tc.c]='Итого: '+lab;for(const col of cols){const pc=rt.prof.cols.find(x=>x.c===col.c);if(pc&&pc.type==='number'&&col.role==='dim'){let s=0;for(let k=start;k<out.length;k++)s+=toNum(out[k].vals[col.c])||0;sub.vals[col.c]=s;}}out.push(sub);}
   });
   let total=null,totalRow=null;
   if(totalR){
    const tcols={};const f=rt.sh.formulas[totalR.r]||[];const row=rt.sh.grid[totalR.r]||[];
    totalRow={kind:'total',vals:{}};
    for(const col of cols){if(f[col.c]){tcols[col.c]='formula';continue;}const v=row[col.c];if(typeof v==='number'){tcols[col.c]='sum';let s=0;for(const r of out)if(r.kind==='data')s+=toNum(r.vals[col.c])||0;totalRow.vals[col.c]=s;}else tcols[col.c]=filled(v)?'label':'blank';}
    total={row:totalR.r+1,cols:tcols};
   }
   const rc={sheet:rt.sh.name,block:rt.tb.block||0,c0:rt.tb.c0,c1:srcC!=null?srcC:rt.tb.c1,headerRow:rt.tb.headerRow+1,firstRow:rt.tb.rows[0].r+1,lastRow:lastRow+1,dataStyleRow:firstData.r+1,totalRow:totalR?totalR.r+1:null,cols,total,subtotal:null,
    extraHead:srcC!=null?[{r:rt.tb.headerRow+1,c:srcC,text:'Источник',styleCol:rt.tb.c1}]:null,styleFrom:srcC!=null?{[srcC]:rt.tb.c1}:null};
   plan.push({rc,res:{rows:out,totalRow,issues:[]}});
  }
  // сверка
  const meas=g.mode==='sum'?g.meas.filter(m=>m.how!=='formula'):rt.prof.cols.filter(c=>c.type==='number'&&!c.formula).map(c=>({c:c.c,name:c.name}));
  check.push({g,meas,rows:g.parts.map(p=>({file:an.files[p.f].name,rows:rowsOf(p.t,['data']).length,tot:fileTotals(p.t,p.cm,meas)}))});
 }
 let bytes;
 const extraSheets=opt.check===false?[]:[{name:'Сверка',build:S=>checkSheet(check,an,issues,S)}];
 if(ref.book.kind==='xlsx'){
  let tpl=ref.book.bytes;
  if(sumEdits.size){
   const zip=await JSZip.loadAsync(tpl);
   const wb=await zip.file('xl/workbook.xml').async('string');const rels=await zip.file('xl/_rels/workbook.xml.rels').async('string');
   for(const [name,ed] of sumEdits){
    const m=new RegExp('<sheet\\b[^>]*?name="'+esc(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"[^>]*?r:id="([^"]+)"').exec(wb);if(!m)continue;
    const t=new RegExp('<Relationship\\b[^>]*Id="'+m[1]+'"[^>]*>').exec(rels);const p='xl/'+/Target="([^"]+)"/.exec(t[0])[1].replace(/^\/?xl\//,'');
    let x=await zip.file(p).async('string');x=patchValues(x,ed);
    zip.file(p,x);
   }
   tpl=await zip.generateAsync({type:'uint8array'});
  }
  bytes=await W.build(tpl,'xlsx',plan,{replace:pairs.length?replace:null,extraSheets});
 }else{
  // образец не .xlsx: сложение выводим строками
  for(const g of an.groups)if(g.mode==='sum'){
   const rt=g.rt;const rows=keyed(rt,rowsOf(rt,['data','sub','total']),g.textCols.concat(g.keyNums));const ed=sumEdits.get(rt.sh.name)||new Map();
   const cols=rt.prof.cols.map(c=>({c:c.c,name:c.name,role:'dim'}));
   plan.push({rc:{sheet:rt.sh.name,block:0,cols},res:{rows:rows.map(x=>{const vals={};for(const c of cols){const e=ed.get(x.r+1);vals[c.c]=e&&e.has(c.c)?e.get(c.c):val(rt,x.r,c.c);}return {kind:x.kind==='data'?'data':'sub',vals};}),totalRow:null}});
  }
  bytes=await W.build(null,ref.book.kind,plan,{extraSheets});
 }
 let name=ref.name.replace(/\.(xls|csv)$/i,'.xlsx');for(const t of refTok)name=name.split(t).join('Свод');
 if(name===ref.name.replace(/\.(xls|csv)$/i,'.xlsx'))name='Свод — '+name;
 if(!/\.xlsx$/i.test(name))name+='.xlsx';
 name=name.replace(/[\\/:*?"<>|]+/g,' ');
 const rowsTotal=check.reduce((a,c)=>a+(c.g.mode==='sum'?rowsOf(c.g.rt,['data']).length:c.rows.reduce((x,y)=>x+y.rows,0)),0);
 return {name,bytes,issues,check,rows:rowsTotal};
}
function checkSheet(check,an,issues,S){
 const rows=[];const C=(v,s)=>({v,s});
 rows.push({cells:[C('Сверка объединения',S.title)]});
 rows.push({cells:[C('Файлов: '+an.files.length+'. Основа оформления: «'+an.files[an.refIdx].name+'».',null)]});
 rows.push({cells:[]});
 let w=[34,12];
 for(const c of check){
  rows.push({cells:[C(c.g.title+' — '+(c.g.mode==='sum'?'сложено построчно':'строки друг под другом'),S.bold)]});
  rows.push({cells:[C('Файл',S.head),C('Строк',S.head)].concat(c.meas.map(m=>C(m.name,S.head)))});
  const tot=c.meas.map(()=>0),cnt=c.meas.map(()=>0);
  for(const r of c.rows){rows.push({cells:[C(r.file,null),C(r.rows,S.int)].concat(r.tot.map((v,i)=>{if(v!=null){tot[i]+=v;cnt[i]++;}return C(v,Number.isInteger(v)?S.int:S.dec);}))});}
  rows.push({cells:[C('Всего',S.bold),C(c.rows.reduce((a,r)=>a+r.rows,0),S.boldInt)].concat(tot.map((v,i)=>c.meas[i].how==='avg'?C(cnt[i]?v/cnt[i]:null,S.dec):C(v,S.boldInt)))});
  if(c.meas.some(m=>m.how==='avg'))rows.push({cells:[C('Для колонок со средним в строке «Всего» — среднее по файлам.',null)]});
  rows.push({cells:[]});
  w=w.concat(c.meas.map(()=>16));
 }
 if(issues.length){rows.push({cells:[C('Замечания',S.bold)]});for(const i of issues)rows.push({cells:[C(i.text,null)]});}
 return {rows,widths:w.slice(0,30)};
}

/* ---------- интерфейс ---------- */
function ui(){
 const $=id=>document.getElementById(id);
 if(!$('mgView'))return;
 let items=[],an=null,res=null,refIdx=0;
 const view=$('obrazecView');
 const setMode=m=>{view.classList.toggle('mg-mode',m==='merge');$('segObrazec').setAttribute('aria-pressed',m!=='merge');$('segMerge').setAttribute('aria-pressed',m==='merge');};
 $('segObrazec').onclick=()=>setMode('obrazec');$('segMerge').onclick=()=>setMode('merge');
 async function add(list){
  $('mgStatus').textContent='Читаю файлы…';
  for(const f of list){
   try{
    if(/\.zip$/i.test(f.name)){const z=await JSZip.loadAsync(await f.arrayBuffer());for(const e of Object.values(z.files)){if(e.dir||!/\.(xlsx|xlsm|xls|csv)$/i.test(e.name)||/(^|\/)(~\$|__MACOSX)/.test(e.name))continue;const n=e.name.split('/').pop();items=items.filter(x=>x.name!==n);items.push({name:n,book:R.readBook(n,await e.async('arraybuffer'))});}}
    else{items=items.filter(x=>x.name!==f.name);items.push({name:f.name,book:R.readBook(f.name,await f.arrayBuffer())});}
   }catch(e){$('mgStatus').textContent='«'+f.name+'»: '+(e.message||e);}
   await new Promise(r=>setTimeout(r));
  }
  refIdx=Math.min(refIdx,Math.max(0,items.length-1));
  reanalyze();
 }
 function reanalyze(){
  res=null;$('mgResult').hidden=true;
  if(items.length<2){an=null;render();$('mgStatus').textContent=items.length?'Добавьте ещё файлы той же формы.':'';return;}
  try{an=analyze(items,refIdx);$('mgStatus').textContent='';}catch(e){an=null;$('mgStatus').textContent=e.message||String(e);}
  render();
 }
 function render(){
  const ul=$('mgList');ul.replaceChildren();
  items.forEach((it,i)=>{
   const li=document.createElement('li');li.className=i===refIdx?'role-sample':'role-both';
   const d=document.createElement('div');const b=document.createElement('b');b.textContent=it.name;const sm=document.createElement('small');
   const g=an&&an.groups[0];const part=g&&g.parts.find(p=>p.f===i);
   sm.textContent=(i===refIdx?'основа оформления · ':'')+(part?'строк: '+rowsOf(part.t,['data']).length:an?'не подходит к форме':'');
   d.append(b,sm);
   const r=document.createElement('div');r.style.cssText='display:flex;gap:6px';
   if(i!==refIdx){const m=document.createElement('button');m.type='button';m.className='mini secondary';m.textContent='Сделать основой';m.onclick=()=>{refIdx=i;reanalyze();};r.append(m);}
   const x=document.createElement('button');x.type='button';x.className='mini secondary';x.textContent='✕';x.setAttribute('aria-label','Убрать файл');x.onclick=()=>{items.splice(i,1);if(refIdx>=items.length)refIdx=0;else if(i<refIdx)refIdx--;reanalyze();};r.append(x);
   li.append(d,r);ul.append(li);
  });
  const box=$('mgGroups');box.replaceChildren();
  $('mgOptions').hidden=!an;$('mgRun').disabled=!an;
  if(!an)return;
  for(const g of an.groups){
   const p=document.createElement('div');p.style.marginTop='10px';
   const h=document.createElement('b');h.textContent=g.title;p.append(h);
   const sel=document.createElement('select');sel.setAttribute('aria-label','Способ объединения для '+g.title);
   sel.add(new Option('Сложить: одинаковые строки суммируются'+(g.auto==='sum'?' (подходит)':''),'sum'));
   sel.add(new Option('Друг под другом: строки всех файлов подряд'+(g.auto==='stack'?' (подходит)':''),'stack'));
   sel.value=g.mode;sel.onchange=()=>{g.mode=sel.value;render();};p.append(sel);
   const t=document.createElement('p');t.className='tip';
   t.textContent=g.mode==='sum'?'Строки совпадают с первым файлом на '+Math.round(g.overlap*100)+'%. Числа складываются в ячейки формы, формулы пересчитаются при открытии.':'Строки из всех файлов идут подряд, итог пересчитывается.';
   p.append(t);
   if(g.mode==='sum')for(const m of g.meas){
    if(m.how==='formula')continue;
    const row=document.createElement('div');row.className='rcol';const nb=document.createElement('span');nb.textContent=m.name;
    const s2=document.createElement('select');s2.setAttribute('aria-label','Как объединять «'+m.name+'»');
    [['sum','сложить'],['avg','среднее по файлам'],['keep','как в первом файле'],['clear','оставить пустым']].forEach(([v,l])=>s2.add(new Option(l,v)));
    s2.value=m.how;s2.onchange=()=>{m.how=s2.value;};row.append(nb,s2);p.append(row);
   }
   box.append(p);
  }
  const stack=an.groups.some(g=>g.mode==='stack');
  $('mgSrcBox').hidden=!stack;$('mgPerBox').hidden=!stack;
  const n=an.notes.length;$('mgNotes').textContent=n?an.notes.map(x=>'⚠️ '+x.text).join('\n'):'';
 }
 $('mgFiles').onchange=()=>{const fs=[...$('mgFiles').files];$('mgFiles').value='';add(fs);};
 const drop=$('mgDrop');
 ['dragenter','dragover'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add('over');}));
 ['dragleave','drop'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove('over');}));
 drop.addEventListener('drop',ev=>add([...ev.dataTransfer.files]));
 $('mgRun').onclick=async()=>{
  if(!an)return;$('mgRun').disabled=true;$('mgStatus').textContent='Объединяю…';
  await new Promise(r=>setTimeout(r,20));
  try{
   res=await build(an,{sourceCol:$('mgSrc').checked,perFile:$('mgPer').checked,check:$('mgCheck').checked});
   $('mgResult').hidden=false;$('mgStatus').textContent='';
   $('mgSum').textContent='Готово: «'+res.name+'». Файлов: '+an.files.length+', строк: '+res.rows+'.'+(res.issues.length?'\n'+res.issues.map(i=>'• '+i.text).join('\n'):'');
   $('mgSave').textContent='Скачать «'+res.name+'»';
   $('mgResult').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){$('mgStatus').textContent=e.message||String(e);console.error(e);}
  finally{$('mgRun').disabled=false;}
 };
 $('mgSave').onclick=()=>{if(res)saveFile(res.name,res.bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ui);else ui();
window.ObrazecMerge={analyze,build};
})();
