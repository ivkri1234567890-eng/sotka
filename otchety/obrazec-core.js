/* «По образцу»: роли файлов, обучение по всей книге, генерация комплекта файлов и сводки. */
(function(){
'use strict';
const R=window.ObrazecRead,L=window.ObrazecLearn,W=window.ObrazecWrite;
const {norm,normH,DV}=R;

function headerSet(t){return new Set(t.cols.filter(c=>!c.virt).map(c=>normH(c.name)).filter(x=>x&&!/^колонка /.test(x)));}
function jacc(a,b){let i=0;for(const x of a)if(b.has(x))i++;return i/Math.max(1,a.size+b.size-i);}
function maxDate(tables){let m=null;for(const t of tables)for(const c of t.cols)if(c.type==='date'&&!c.virt)for(const v of c.vals)if(v instanceof DV&&(m==null||v.s>m))m=v.s;return m;}

/** Определяет роли файлов. items: [{name, book, tables, lastModified}] */
function classify(items,saved){
 const out=items.map(it=>({name:it.name,role:'new',why:''}));
 if(!items.length)return {roles:out,report:null};
 // подходит ли сохранённый отчёт
 let report=null;
 for(const rep of saved||[]){
  const sigs=[];for(const rc of rep.sheets){sigs.push(rc.main);for(const l of rc.lookups)sigs.push(l.table);}
  let ok=0;const used=new Set();
  for(const sig of sigs){const hs=new Set(sig.headers.map(normH));let best=null;
   items.forEach((it,i)=>it.tables.forEach(t=>{const s=jacc(hs,headerSet(t));if(s>=0.6&&(!best||s>best.s))best={i,s};}));
   if(best){ok++;used.add(best.i);}}
  const score=ok/Math.max(1,sigs.length);
  if(score>=0.99&&(!report||score>report.score))report={id:rep.id,name:rep.name,score,files:[...used]};
 }
 // кандидат в образцы
 const scores=items.map((it,i)=>{
  const t=it.tables.slice().sort((a,b)=>b.n-a.n)[0];
  if(!t)return -99;
  let s=0;const nm=norm(it.name);
  if(/отч[её]т|свод|итог|образ|пример|report|summary|рейтинг|анализ по/.test(nm))s+=2;
  if(/выгруз|export|база|данн|реестр|crm|1с|1c|исход|source|реализац|регистрац|справочн/.test(nm))s-=2;
  if(t.tb.rows.some(r=>r.kind!=='data'))s+=1.5;
  if(t.tb.title.length)s+=0.5;
  if(t.cols.some(c=>c.formula))s+=0.5;
  if(t.n>3000)s-=2;else if(t.n<500)s+=0.5;
  // значения образца содержатся в других файлах, обратное — редко
  const others=new Map();
  items.forEach((o,j)=>{if(j===i)return;for(const tt of o.tables)for(const c of tt.cols){for(const k of c.keys.keys())others.set(k,1);}});
  let hit=0,tot=0;
  for(const c of t.cols){if(c.type!=='text'||c.keys.size<2)continue;for(const k of c.keys.keys()){if(!k)continue;tot++;if(others.has(k))hit++;}}
  if(tot)s+=4*hit/tot-1.5;
  return s;
 });
 {
  const pool=scores.map((s,i)=>[s,i]).filter(([s,i])=>!report||!report.files.includes(i));
  pool.sort((a,b)=>b[0]-a[0]);
  if(pool.length&&(report?pool[0][0]>-1:(items.length>1||pool[0][0]>2))){const [s,i]=pool[0];out[i].role='sample';out[i].why='похож на готовый отчёт';}
 }
 // исходники: группы по составу колонок, старее — прошлый период
 const src=items.map((it,i)=>i).filter(i=>out[i].role!=='sample');
 const groups=[];
 for(const i of src){
  const hs=items[i].tables.map(headerSet);
  let g=groups.find(gr=>gr.hs.some(a=>hs.some(b=>jacc(a,b)>=0.6)));
  if(!g)groups.push(g={hs:[],idx:[]});
  g.hs.push(...hs);g.idx.push(i);
 }
 for(const g of groups){
  if(g.idx.length<2){out[g.idx[0]].role='both';out[g.idx[0]].why=report?'исходник для «'+report.name+'»':'исходник';continue;}
  const dated=g.idx.map(i=>({i,d:maxDate(items[i].tables),m:items[i].lastModified||0})).sort((a,b)=>(a.d??-1)-(b.d??-1)||a.m-b.m);
  dated.forEach((x,k)=>{out[x.i].role=k===dated.length-1?'new':'old';out[x.i].why=k===dated.length-1?'свежее остальных':'прошлый период';});
 }
 return {roles:out,report};
}

/** Обучение по образцу: все листы с таблицами. */
function learn(sample,sourceTables){
 const sheets=[],skipped=[];
 for(const sh of sample.book.sheets){
  const tbs=R.detectTables(sh);
  if(!tbs.length){skipped.push(sh.name);continue;}
  let any=false,seed=null;
  for(const tb of tbs.slice().sort((a,b)=>b.rows.length*b.cols.length-a.rows.length*a.cols.length)){
   try{
    const rc=L.learnSheet(sample.book,sh,tb,sourceTables,seed);
    if(!seed&&rc.quality.q>=0.8&&(rc.filters.length||rc.period))seed=rc;
    if(rc.quality.q<0.2&&rc.quality.covered<rc.quality.rows*0.3)continue;
    sheets.push(rc);any=true;
   }catch(e){if(window.OB_DEBUG)console.log(e);}
  }
  if(!any)skipped.push(sh.name);
 }
 if(!sheets.length)throw Error('Не удалось понять, как образец собран из этих исходников. Проверьте, что загружены исходники именно за период образца или за период, который его включает.');
 const order=new Map(sample.book.sheets.map((s,i)=>[s.name,i]));
 sheets.sort((a,b)=>order.get(a.sheet)-order.get(b.sheet)||a.c0-b.c0);
 const sp=sheets.find(s=>s.samplePeriod!=null);
 // разбивка: фильтр «одно значение» по обычной колонке
 const splits=[];
 const where=norm([sample.name].concat(...sheets.map(rc=>rc.titleTexts||[]),sample.book.sheets.map(s=>s.name)).join(' | '));
 for(const rc of sheets)for(const f of rc.filters)if(f.op==='keep'&&f.keys.length===1&&!splits.some(s=>s.src===f.src)&&nameForms(f.labels[0]).some(x=>x.length>=3&&new RegExp('(^|[^\\p{L}\\p{N}])'+norm(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^\\p{L}\\p{N}])','u').test(where)))splits.push({src:f.src,key:f.keys[0],label:f.labels[0],sheet:rc.sheet});
 const nm=sample.name.replace(/\.(xlsx|xlsm|xls|csv)$/i,'');
 let base=nm.replace(/[_\s-]*(за\s*)?(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*([_\s-]*\d{4})?/gi,'').replace(/[_\s-]*20\d\d$/,'').replace(/_/g,' ').trim();
 if(splits[0]){for(const f of nameForms(splits[0].label))base=base.split(f).join(' ');base=base.replace(/[_\s—-]+/g,' ').trim();if(base.length<3)base='Отчёт по «'+splits[0].src.replace(/\s*\(справочник.*$/,'')+'»';}
 return {
  id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
  name:base||nm,
  templateName:sample.name,templateKind:sample.book.kind,
  sheets,skipped,splits,split:null,compare:true,
  samplePeriod:sp?sp.samplePeriod:null,
  created:Date.now()
 };
}
function periodOf(rc,ym){
 if(ym==null)return null;
 if(rc.period){const len=rc.period.to-rc.period.from;let from=ym-len;if(rc.period.year)return {from:R.ymOf(Math.floor(ym/12),1),to:R.ymOf(Math.floor(ym/12),12)};if(rc.period.from%12===0&&len>0)from=ym-(ym%12);return {from,to:ym};}
 return {from:ym,to:ym};
}
function samplePeriodOf(rc,sp){if(rc.period)return {from:rc.period.from,to:rc.period.to};const tp=rc.titlePeriod;return sp!=null?{from:tp&&tp.from!=null?tp.from:sp,to:sp}:null;}

/** Сокращения ФИО для замены в подписях: «Зайцев Игорь Владимирович» → «Зайцев И.В.», «Зайцев». */
function nameForms(full){
 const w=String(full||'').trim().split(/\s+/);
 const f=[String(full||'').trim()];
 if(w.length===3&&/^[А-ЯЁ]/.test(w[1])){f.push(w[0]+' '+w[1][0]+'.'+w[2][0]+'.',w[0]+' '+w[1][0]+'. '+w[2][0]+'.');}
 if(w.length>=2&&/^[А-ЯЁ][а-яё]+$/.test(w[0]))f.push(w[0]);
 return f;
}
function pairsFor(oldLabel,newLabel){
 const a=nameForms(oldLabel),b=nameForms(newLabel);
 return a.map((x,i)=>({from:x,to:b[Math.min(i,b.length-1)]||newLabel}));
}

/** Генерация. tables — новые исходники; opt: {period:ym, split:{src}|null, compare:bool, prev:{sheet→snapshot}} */
async function generate(report,template,tables,opt){
 opt=opt||{};
 const files=[];
 const splitVals=report.split?L.splitValues(report.sheets[0],tables,report.split.src):[null];
 if(report.split&&!splitVals.length)throw Error('В новых данных нет значений «'+report.split.src+'» для разбивки.');
 const baseSplit=report.split?report.splits.find(s=>s.src===report.split.src):null;
 for(const sv of splitVals){
  const plan=[];const issues=[];let main=null;
  for(const rc0 of report.sheets){
   const rc=Object.assign({},rc0,{filters:sv?rc0.filters.filter(f=>f.src!==report.split.src):rc0.filters});
   const res=L.applySheet(rc,tables,{period:opt.period,split:sv?{src:report.split.src,key:sv.key}:null});
   plan.push({rc,res});issues.push(...res.issues.map(x=>Object.assign({sheet:rc.sheet},x)));
   if(!main)main={rc,res};
  }
  if(sv&&plan.every(p=>!p.res.rows.length))continue;
  const oldP=samplePeriodOf(report.sheets[0],report.samplePeriod);
  const newP=opt.period!=null?periodOf(report.sheets[0],opt.period):null;
  const pairs=sv&&baseSplit?pairsFor(baseSplit.label,sv.label):[];
  const replace=W.makeReplacer(oldP,newP,pairs);
  // сравнение с прошлым
  let cmp=null;
  const prev=opt.prev&&opt.prev[(sv?sv.key:'')+'|'+main.rc.sheet]||(!sv||baseSplit&&sv.key===baseSplit.key?main.rc.prev:null);
  if(report.compare&&prev&&prev.rows&&prev.rows.length)cmp=L.compare(prev,main.rc,main.res);
  const labels={now:newP?R.ymLabel(newP.to):'Новый отчёт',prev:prev&&prev.period!=null?R.ymLabel(prev.period):'образцом'};
  const bytes=await W.build(template,report.templateKind,plan,{replace,compare:cmp?{cmp,labels}:null});
  let name=replace(report.templateName.replace(/\.(xls|csv)$/i,'.xlsx'));
  if(!/\.xlsx$/i.test(name))name+='.xlsx';
  if(name===report.templateName||files.some(f=>f.name===name)){
   const tag=[sv&&sv.label,newP&&R.ymLabel(newP.to)].filter(Boolean).join(' — ');
   name=name.replace(/\.xlsx$/i,'')+(tag?' — '+tag:' (новый)')+'.xlsx';
  }
  name=name.replace(/[\\/:*?"<>|]+/g,' ');
  const totals=main.rc.cols.filter(c=>c.role==='measure').map(c=>{let s=0;for(const r of main.res.rows)if(r.kind==='data')s+=R.toNum(r.vals[c.c])||0;return {name:c.name,value:s};});
  files.push({name,bytes,split:sv,rows:plan.reduce((a,p)=>a+p.res.rows.filter(r=>r.kind==='data').length,0),totals,cmp,issues,plan,snapshot:L.snapshot(main.rc,main.res,newP?newP.to:null),labels});
 }
 return files;
}

const fmt=v=>typeof v==='number'?(Math.abs(v)>=1000?Math.round(v).toLocaleString('ru-RU'):String(+v.toFixed(2)).replace('.',',')):String(v);
/** Короткая сводка для сообщения (Telegram/почта). */
function summary(report,files,period){
 const L1=[];
 L1.push('📊 '+report.name+(period!=null?' — '+R.ymLabel(period):''));
 if(files.length>1)L1.push('Файлов: '+files.length);
 for(const f of files.slice(0,12)){
  const head=files.length>1?(f.split?f.split.label:f.name)+': ':'';
  const t=f.totals.slice(0,3).map(t=>{let s=t.name+' '+fmt(t.value);if(f.cmp){const o=f.cmp.tot.find(x=>x.name===t.name);if(o&&o.old){const d=(t.value-o.old)/Math.abs(o.old)*100;s+=' ('+(d>=0?'+':'')+Math.round(d)+'%)';}}return s;}).join(', ');
  L1.push((files.length>1?'• ':'')+head+'строк '+f.rows+(t?', '+t:''));
  if(f.cmp&&files.length===1){const c=f.cmp.cnt;const bits=[];if(c['новая'])bits.push('новых '+c['новая']);if(c['пропала'])bits.push('пропало '+c['пропала']);if(c['изменилась'])bits.push('изменилось '+c['изменилась']);if(bits.length)L1.push('К прошлому: '+bits.join(', '));
   for(const j of f.cmp.jumps.slice(0,5))L1.push('⚠️ '+j.l+': '+j.m+' '+fmt(j.old)+' → '+fmt(j.now));}
 }
 if(files.length>12)L1.push('…и ещё '+(files.length-12));
 const errs=files.flatMap(f=>f.issues.filter(i=>i.level==='error'));
 if(errs.length)L1.push('❗ '+[...new Set(errs.map(e=>e.text))].slice(0,3).join(' '));
 return L1.join('\n');
}

window.ObrazecCore={classify,learn,generate,summary,periodOf,nameForms};
})();
