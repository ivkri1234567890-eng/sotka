/* «По образцу» для Word: таблицы документа и числа в тексте учатся по исходникам,
   новый документ собирается в копии образца (оформление сохраняется). */
(function(){
'use strict';
const R=window.ObrazecRead,L=window.ObrazecLearn,Wr=window.ObrazecWrite;
const {DV,SEP,norm,toNum,vkey,filled}=R;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const unesc=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,d)=>String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&amp;/g,'&');
const eq=(a,t)=>Math.abs(a-t)<0.0051+1e-9*Math.abs(t);

/* ---------- разбор XML ---------- */
function topLevel(xml,tag,from,to){
 from=from||0;to=to==null?xml.length:to;
 const re=new RegExp('<'+tag+'(?=[ >/])[^>]*?(/?)>|</'+tag+'>','g');re.lastIndex=from;
 const out=[];let depth=0,st=0,m;
 while((m=re.exec(xml))&&m.index<to){
  if(m[0][1]==='/'){if(--depth===0)out.push([st,m.index+m[0].length]);}
  else if(m[1]==='/'){if(depth===0)out.push([m.index,m.index+m[0].length]);}
  else{if(depth++===0)st=m.index;}
 }
 return out;
}
function textOf(x){
 let s='';const re=/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<\/w:p>/g;let m;
 while((m=re.exec(x))){if(m[1]!=null)s+=unesc(m[1]);else if(m[0]==='<w:tab/>')s+='\t';else s+='\n';}
 return s.replace(/\n+$/,'');
}
function parseVal(s){
 s=s.trim();if(!s)return null;
 const d=R.parseDateStr(s);if(d)return d;
 const m=/^([-−+]?)(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?\s*(%?)$/.exec(s);
 if(m)return (m[1]==='-'||m[1]==='−'?-1:1)*+(m[2].replace(/[   ]/g,'')+(m[3]?'.'+m[3]:''));
 return s;
}
/** Формат числа по тексту: группы, знаков после запятой, приставки. */
function inferFmt(texts){
 let best=null;
 for(const s0 of texts){
  const s=String(s0||'').trim();
  const m=/^(\D*?)([-−+]?)(\d{1,3}(?:([   .])\d{3})+|\d+)(?:([.,])(\d+))?(\D*)$/.exec(s);
  if(!m)continue;
  const v=+m[3].replace(/\D/g,'');
  if(!best||v>best.v)best={v,pre:m[1],group:m[4]||(m[3].length>=4?'':null),ds:m[5]||',',dec:m[6]?m[6].length:0,suf:m[7],plus:m[2]==='+'};
 }
 if(!best)return null;
 if(best.group==null)best.group=' ';
 delete best.v;return best;
}
function fmtNum(v,f){
 if(v==null||!isFinite(v))return '';
 f=f||{group:' ',ds:',',dec:Number.isInteger(v)?0:2,pre:'',suf:''};
 const neg=v<0;let s=Math.abs(v).toFixed(f.dec);
 let [ip,dp]=s.split('.');
 if(f.group)ip=ip.replace(/\B(?=(\d{3})+(?!\d))/g,f.group);
 return (f.pre||'')+(neg?'-':f.plus&&v>0?'+':'')+ip+(dp?f.ds+dp:'')+(f.suf||'');
}
function display(v,f){
 if(v==null||v==='')return '';
 if(v instanceof DV)return v.toString();
 if(typeof v==='number')return fmtNum(v,f);
 return String(v);
}

/** Читает docx: таблицы как листы и абзацы вне таблиц. */
async function readDocx(name,buffer){
 const bytes=new Uint8Array(buffer);
 const zip=await JSZip.loadAsync(bytes);
 const f=zip.file('word/document.xml');if(!f)throw Error('«'+name+'» — не документ Word (.docx).');
 const xml=await f.async('string');
 const tbls=topLevel(xml,'w:tbl');
 const sheets=tbls.map(([s,e],i)=>{
  const tx=xml.slice(s,e);const grid=[],texts=[];
  topLevel(tx,'w:tr').forEach(([a,b],r)=>{
   const row=[],trow=[];let col=0;
   for(const [c0,c1] of topLevel(tx,'w:tc',a,b)){
    const tc=tx.slice(c0,c1);const span=+((/<w:gridSpan w:val="(\d+)"/.exec(tc)||[])[1]||1);
    const cont=/<w:vMerge(?: w:val="continue")?\/>/.test(tc);
    const t=cont?'':textOf(tc);
    const v=parseVal(t);if(v!=null)row[col]=v;trow[col]=t;
    col+=span;
   }
   grid[r]=row;texts[r]=trow;
  });
  return {name:'Таблица '+(i+1),grid,formulas:[],merges:[],texts,docTable:i};
 });
 const paras=[];
 let pos=0;const segs=[];for(const [s,e] of tbls){segs.push([pos,s]);pos=e;}segs.push([pos,xml.length]);
 for(const [a,b] of segs)for(const [s,e] of topLevel(xml,'w:p',a,b))paras.push({s,e,text:textOf(xml.slice(s,e))});
 return {name,kind:'docx',bytes,xml,tbls,paras,sheets};
}

/* ---------- числа в тексте ---------- */
const NUM=/(^|[^\d.,\p{L}№/-])([-−+]?)(\d{1,3}(?:[   ]\d{3})+|\d+)(?:([.,])(\d+))?(\s?%|\s?(?:тыс\.?|млн\.?|млрд\.?)(?=[\s.,;:)]|$))?/gu;
function tokensOf(text){
 const out=[];let m;NUM.lastIndex=0;
 while((m=NUM.exec(text))){
  const start=m.index+m[1].length,end=m.index+m[0].length;
  const raw=text.slice(start,end);
  const before=text.slice(Math.max(0,start-12),start),after=text.slice(end,end+12);
  const intPart=m[3].replace(/\D/g,'');
  const v=+(intPart+(m[5]?'.'+m[5]:''))*(m[2]==='-'||m[2]==='−'?-1:1);
  const unit=(m[6]||'').trim().replace('.','');
  // год, даты, номера документов — не трогаем
  if(!m[4]&&!unit&&/^(19|20)\d\d$/.test(intPart))continue;
  if(/[.\/]\d*$/.test(before)&&/^\d/.test(intPart)&&/\d[.\/]$/.test(before))continue;
  if(/^[.\/]\d/.test(after))continue;
  if(/№\s*$/.test(before))continue;
  const scale=unit==='тыс'?1e3:unit==='млн'?1e6:unit==='млрд'?1e9:1;
  out.push({start,end,raw,v,dec:m[5]?m[5].length:0,scale,pct:unit==='%',group:/[   ]/.exec(m[3])?.[0]||(intPart.length>=4?'':' '),ds:m[4]||',',plus:m[2]==='+',unitText:m[6]||''});
 }
 return out;
}

/* ---------- согласование слова с числом: 1 автомобиль, 2 автомобиля, 5 автомобилей ---------- */
const NOUNS=[['автомобиль','автомобиля','автомобилей'],['машина','машины','машин'],['штука','штуки','штук'],['единица','единицы','единиц'],['договор','договора','договоров'],['клиент','клиента','клиентов'],['сделка','сделки','сделок'],['заявка','заявки','заявок'],['рубль','рубля','рублей'],['позиция','позиции','позиций'],['документ','документа','документов'],['раз','раза','раз'],['человек','человека','человек'],['менеджер','менеджера','менеджеров'],['покупатель','покупателя','покупателей'],['контрагент','контрагента','контрагентов'],['заказ','заказа','заказов'],['продажа','продажи','продаж'],['отгрузка','отгрузки','отгрузок'],['день','дня','дней'],['месяц','месяца','месяцев'],['год','года','лет'],['тягач','тягача','тягачей'],['самосвал','самосвала','самосвалов'],['шасси','шасси','шасси'],['опись','описи','описей'],['счёт','счёта','счетов'],['счет','счета','счетов'],['единица техники','единицы техники','единиц техники'],['процент','процента','процентов'],['регистрация','регистрации','регистраций'],['владелец','владельца','владельцев'],['обращение','обращения','обращений'],['звонок','звонка','звонков'],['встреча','встречи','встреч'],['тонна','тонны','тонн'],['километр','километра','километров']];
const cat=n=>{n=Math.abs(Math.round(n));const a=n%100,b=n%10;if(a>=11&&a<=14)return 2;if(b===1)return 0;if(b>=2&&b<=4)return 1;return 2;};
function nounForms(w,c){
 const l=w.toLowerCase();
 for(const f of NOUNS)if(f[c]===l)return f;
 if(c===2&&/[^аеёиоуыэюя]ей$/.test(l)){const b=l.slice(0,-2);return [b+'ь',b+'я',l];}
 if(c===2&&/[бвгдзклмнпрстфхцчшщ]ов$/.test(l)){const b=l.slice(0,-2);return [b,b+'а',l];}
 if(c===0&&/[бвгдзклмнпрстфхчшщ]$/.test(l)&&l.length>3)return [l,l+'а',l+'ов'];
 return null;
}
function caseAs(src,w){return src===src.toUpperCase()&&src.length>1?w.toUpperCase():src[0]===src[0].toUpperCase()?w[0].toUpperCase()+w.slice(1):w;}
function nounAfter(text,tk){
 if(tk.pct||tk.scale!==1||tk.dec)return null;
 const m=/^(\s+)([А-Яа-яЁё]+)/.exec(text.slice(tk.end));if(!m)return null;
 const c=cat(tk.v);const f=nounForms(m[2],c);if(!f)return null;
 return {start:tk.end+m[1].length,end:tk.end+m[1].length+m[2].length,word:m[2],forms:f};
}

/* ---------- факты: из таблиц и из исходников ---------- */
function mainTableOf(report,tables){
 const rc=report.sheets[0];
 if(rc)return L.resolveTable(rc.main,tables);
 if(report.main)return L.resolveTable(report.main,tables);
 return tables.slice().sort((a,b)=>b.n-a.n)[0]||null;
}
function dateColName(report,T){
 const rc=report.sheets[0];if(rc&&rc.period)return rc.period.base;
 const c=T.cols.find(c=>c.type==='date'&&!c.virt);return c?c.name:null;
}
/** Все «простые» итоги по исходнику за период: всего и по одному значению колонки. */
function sourceFacts(T,dateName,ym,baseFilters,splitSub){
 const facts=[];
 const dcol=dateName?L.colByName(T,dateName):null;
 const nums=T.cols.filter(c=>c.type==='number'&&!c.virt&&c.keys.size>1);
 const cats=T.cols.filter(c=>c.type==='text'&&c.keys.size>=2&&c.keys.size<=30&&!(c.virt&&c.virt.kind==='month'));
 const base=new Uint8Array(T.n).fill(1);
 for(const f of baseFilters||[]){const col=L.colByName(T,f.src);if(!col)continue;let keys=f.keys;if(splitSub&&f.src===splitSub.src)keys=[splitSub.key];const set=new Set(keys);const k=col.rk||(col.rk=col.vals.map(vkey));for(let i=0;i<T.n;i++)if(set.has(k[i])!==(f.op==='keep'))base[i]=0;}
 const periods=dcol&&ym!=null?[['month',ym,ym],['ytd',ym-ym%12,ym]]:[['all',-1e9,1e9]];
 for(const [pk,from,to] of periods){
  const acc=new Map();
  const add=(key,i)=>{let a=acc.get(key);if(!a)acc.set(key,a={n:0,s:new Float64Array(nums.length)});a.n++;nums.forEach((c,j)=>{const v=toNum(c.vals[i]);if(v!=null)a.s[j]+=v;});};
  for(let i=0;i<T.n;i++){
   if(!base[i])continue;
   if(dcol){const v=dcol.vals[i];if(!(v instanceof DV))continue;const y=v.ym();if(y<from||y>to)continue;}
   add('',i);
   for(const c of cats){const k=(c.rk||(c.rk=c.vals.map(vkey)))[i];if(k)add(c.name+SEP+k,i);}
  }
  for(const [key,a] of acc){
   const [col,k]=key?key.split(SEP):[null,null];
   const lab=col?R.display(T.cols.find(c=>c.name===col).vals[(T.cols.find(c=>c.name===col).rk).indexOf(k)]):null;
   const filt=col?{src:col,key:k,label:lab}:null;
   facts.push({kind:'src',period:pk,filter:filt,agg:'count',value:a.n});
   nums.forEach((c,j)=>facts.push({kind:'src',period:pk,filter:filt,agg:'sum',col:c.name,value:a.s[j]}));
  }
 }
 return facts;
}
function tableFacts(report,results){
 const facts=[];
 report.sheets.forEach((rc,t)=>{
  const res=results[t];if(!res)return;
  const data=res.rows.filter(r=>r.kind==='data');
  facts.push({kind:'tbl',t,what:'rows',value:data.length});
  for(const c of rc.cols){
   if(c.role!=='measure')continue;
   let s=0;for(const r of data)s+=toNum(r.vals[c.c])||0;
   facts.push({kind:'tbl',t,what:'total',c:c.c,value:s});
   if(data.length<=60)for(const r of data){const v=toNum(r.vals[c.c]);if(v!=null)facts.push({kind:'tbl',t,what:'cell',c:c.c,key:r.key,label:rc.cols.filter(x=>x.role==='dim').map(x=>R.display(r.vals[x.c])).join(' · '),value:v});}
  }
 });
 return facts;
}
const factKey=f=>f.kind==='tbl'?['tbl',f.t,f.what,f.c,f.key].join('|'):['src',f.period,f.filter?f.filter.src+'='+f.filter.key:'',f.agg,f.col||''].join('|');
function factText(f,report){
 if(!f)return 'оставить как есть';
 if(f.chg)return 'изменение к прошлому месяцу, %: '+factText(f.chg,report);
 if(f.kind==='tbl'){const rc=report.sheets[f.t];const tn='табл. '+(f.t+1);const cn=f.c!=null?'«'+(rc.cols.find(x=>x.c===f.c)||{}).name+'»':'';
  return f.what==='rows'?'число строк, '+tn:f.what==='total'?'итог '+cn+', '+tn:cn+' для «'+f.label+'», '+tn;}
 const p=f.period==='month'?'за месяц':f.period==='ytd'?'с начала года':'всего';
 return (f.agg==='count'?'количество строк':'сумма «'+f.col+'»')+' '+p+(f.filter?', где «'+f.filter.src+'» = '+f.filter.label:'')+' (исходник)';
}

/** Значения фактов для периода. */
function computeFacts(report,tables,ym,results,splitSub){
 const T=mainTableOf(report,tables);
 const out=new Map();
 for(const f of tableFacts(report,results))out.set(factKey(f),f.value);
 if(T){
  const dn=dateColName(report,T);
  const bf=report.sheets[0]?report.sheets[0].filters:[];
  for(const f of sourceFacts(T,dn,ym,bf,splitSub))out.set(factKey(f),f.value);
 }
 return out;
}

/* ---------- обучение ---------- */
function learn(sample,sources){
 const doc=sample.book;
 const ctxText=doc.paras.slice(0,15).map(p=>p.text).filter(Boolean);
 const sheets=[];let seed=null;
 doc.sheets.forEach(sh=>{
  for(const tb of R.detectTables(sh)){
   tb.title=ctxText.concat(tb.title||[]);
   try{
    const rc=L.learnSheet({name:doc.name,sheets:doc.sheets},sh,tb,sources,seed);
    if(rc.quality.q<0.5&&rc.quality.covered<rc.quality.rows*0.5)continue;
    // форматы чисел колонок — по тексту ячеек образца
    rc.fmt={};
    for(const c of rc.cols){const rows=tb.rows.filter(x=>x.kind==='data');const nums=rows.filter(x=>typeof (sh.grid[x.r]||[])[c.c]==='number').length;if(nums<0.6*rows.length)continue;const f=inferFmt(rows.map(x=>(sh.texts[x.r]||[])[c.c]));if(f)rc.fmt[c.c]=f;}
    rc.docTable=sh.docTable;if(sh.ref)rc.ref=sh.ref;
    // значения колонок, которые не удалось пересчитать: сохраняем по строке, чтобы не стирать
    const dimC=rc.cols.filter(c=>c.role==='dim').map(c=>c.c);
    rc.keepVals={};
    for(const c of rc.cols){if(c.role!=='blank')continue;const m={};let any=false;
     for(const x of tb.rows){const v=(sh.grid[x.r]||[])[c.c];if(v==null)continue;const k=x.kind==='data'?dimC.map(d=>R.vkey((sh.grid[x.r]||[])[d])).join(R.SEP):'#'+x.kind;m[k]=v instanceof R.DV?v.toString():v;any=true;}
     if(any)rc.keepVals[c.c]=m;}
    sheets.push(rc);
    if(!seed&&rc.quality.q>=0.8&&(rc.filters.length||rc.period))seed=rc;
    break; // одна таблица отчёта на таблицу Word
   }catch(e){if(window.OB_DEBUG)console.log(e);}
  }
 });
 const tp=L.periodFromText(ctxText.concat([doc.name]));
 let sp=sheets.find(s=>s.samplePeriod!=null);
 const samplePeriod=sp?sp.samplePeriod:tp?tp.ym:null;
 const kind=doc.kind==='pptx'?'pptx':'docx';
 const report={kind,sheets,samplePeriod,templateName:sample.name,templateKind:kind,compare:true,created:Date.now(),skipped:[]};
 // числа в тексте
 const results=sheets.map(rc=>{try{return L.applySheet(rc,sources,{period:rc.period?rc.samplePeriod:null});}catch(e){return null;}});
 const facts=tableFacts(report,results);
 const T=mainTableOf(report,sources);
 if(T)report.main={label:T.label,file:T.file,sheet:T.sheet,headers:T.cols.filter(c=>!c.virt).map(c=>c.name),nums:T.cols.filter(c=>c.type==='number'&&!c.virt).map(c=>c.name)};
 if(T)facts.push(...sourceFacts(T,dateColName(report,T),samplePeriod,sheets[0]?sheets[0].filters:[]));
 // изменения к прошлому месяцу (для процентов)
 let prevFacts=null;
 if(T&&samplePeriod!=null){prevFacts=new Map();for(const f of sourceFacts(T,dateColName(report,T),samplePeriod-1,sheets[0]?sheets[0].filters:[]))prevFacts.set(factKey(f),f.value);}
 const tokens=[];
 doc.paras.forEach((p,pi)=>{
  for(const tk of tokensOf(p.text)){
   const tol=0.5*Math.pow(10,-tk.dec)+1e-9;
   const match=f=>Math.abs(f/tk.scale-tk.v)<=tol;
   let cands=[];
   if(tk.pct){
    if(prevFacts)for(const f of facts){if(f.kind!=='src'||f.period!=='month')continue;const pv=prevFacts.get(factKey(f));if(!pv)continue;const ch=(f.value-pv)/Math.abs(pv)*100;if(match(Math.abs(ch))||match(ch))cands.push({chg:f,abs:match(Math.abs(ch))&&!match(ch)});}
   }else cands=facts.filter(f=>f.value!==0&&match(f.value));
   const rank=f=>{const x=f.chg||f;return (x.kind==='tbl'?(x.what==='cell'?2:0):10+(x.period==='month'?0:x.period==='ytd'?1:2)+(x.filter?3:0)+(x.agg==='count'?0:1));};
   cands.sort((a,b)=>rank(a)-rank(b));
   const ambiguous=cands.length>1&&rank(cands[0])===rank(cands[1])&&Math.abs(tk.v)<100;
   const pick=cands.length&&!(ambiguous&&Math.abs(tk.v)<10)?cands[0]:null;
   tokens.push({p:pi,start:tk.start,end:tk.end,raw:tk.raw,noun:nounAfter(p.text,tk),fmt:{group:tk.group,ds:tk.ds,dec:tk.dec,pre:'',suf:tk.unitText,plus:tk.plus},scale:tk.scale,pct:tk.pct,
    fact:pick?strip(pick):null,alts:cands.slice(0,6).map(strip),ambiguous,context:p.text.slice(Math.max(0,tk.start-40),Math.min(p.text.length,tk.end+40))});
  }
 });
 report.tokens=tokens;
 // разбивка
 const splits=[];
 const where=norm(ctxText.concat([doc.name]).join(' | '));
 for(const rc of sheets)for(const f of rc.filters)if(f.op==='keep'&&f.keys.length===1&&!splits.some(s=>s.src===f.src)&&window.ObrazecCore.nameForms(f.labels[0]).some(x=>x.length>=3&&new RegExp('(^|[^\\p{L}\\p{N}])'+norm(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^\\p{L}\\p{N}])','u').test(where)))splits.push({src:f.src,key:f.keys[0],label:f.labels[0]});
 report.splits=splits;report.split=null;
 const nm=sample.name.replace(/\.(docx|pptx)$/i,'');
 let base=nm.replace(/[_\s-]*(за\s*)?(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*([_\s-]*\d{4})?/gi,'').replace(/[_\s-]*20\d\d$/,'').replace(/_/g,' ').trim();
 if(splits[0]){for(const f of window.ObrazecCore.nameForms(splits[0].label))base=base.split(f).join(' ');base=base.replace(/[_\s—-]+/g,' ').trim();if(base.length<3)base=(kind==='pptx'?'Презентация по «':'Документ по «')+splits[0].src.replace(/\s*\(справочник.*$/,'')+'»';}
 report.name=base||nm;
 report.id='r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
 if(!sheets.length&&!tokens.some(t=>t.fact))throw Error('Не удалось связать документ с исходниками: в таблицах и тексте не нашлось чисел, которые получаются из этих данных. Проверьте, что исходники за период документа.');
 return report;
}
function strip(f){const x=f.chg?{chg:strip(f.chg),abs:f.abs}:Object.assign({},f);delete x.value;return x;}

/* ---------- сборка документа ---------- */
function setCellText(tc,text){
 const pr=(/<w:tcPr>[\s\S]*?<\/w:tcPr>/.exec(tc)||[''])[0];
 const p=(/<w:p\b[\s\S]*?<\/w:p>/.exec(tc)||[''])[0];
 const ppr=(/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p)||[''])[0];
 const rpr=(/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(p.replace(ppr,''))||[''])[0];
 const body=String(text).split('\n').map((line,i)=>(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+esc(line)+'</w:t>').join('');
 return '<w:tc>'+pr+'<w:p>'+ppr+(text===''?'':'<w:r>'+rpr+body+'</w:r>')+'</w:p></w:tc>';
}
function replaceTexts(x,fn){return x.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,(m,a,t,b)=>{const n=fn(unesc(t));return n===unesc(t)?m:'<w:t xml:space="preserve">'+esc(n)+b;});}
/** Замена участков текста абзаца с сохранением прогонов. */
function replaceRanges(px,ranges){
 if(!ranges.length)return px;
 const nodes=[];const re=/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)|<w:tab\/>|<w:br\/>|<\/w:p>/g;let m,pos=0;
 while((m=re.exec(px))){if(m[2]!=null){const t=unesc(m[2]);nodes.push({s:m.index,e:m.index+m[0].length,t,from:pos});pos+=t.length;}else pos+=1;}
 const edits=nodes.map(n=>({n,t:n.t}));
 for(const r of ranges.slice().sort((a,b)=>b.start-a.start)){
  let first=true;
  for(let i=edits.length-1;i>=0;i--){
   const e=edits[i],a=e.n.from,b=a+e.n.t.length;
   if(b<=r.start||a>=r.end)continue;
   const ls=Math.max(0,r.start-a),le=Math.min(e.n.t.length,r.end-a);
   const isStart=r.start>=a&&r.start<b;
   e.t=e.t.slice(0,ls)+(isStart?r.text:'')+e.t.slice(le);
   first=false;
  }
 }
 let out='',last=0;
 for(const e of edits){out+=px.slice(last,e.n.s)+'<w:t xml:space="preserve">'+esc(e.t)+'</w:t>';last=e.n.e;}
 return out+px.slice(last);
}
function rebuildTable(tx,rc,res,replace){
 const rows=topLevel(tx,'w:tr');
 if(!rows.length)return tx;
 const head=tx.slice(0,rows[0][0]),tail=tx.slice(rows[rows.length-1][1]);
 const trs=rows.map(([a,b])=>tx.slice(a,b));
 const d0=rc.firstRow-1,d1=rc.lastRow-1,tot=rc.totalRow!=null?rc.totalRow-1:null;
 const tplD=trs[rc.dataStyleRow-1]||trs[d0];
 const tplS=rc.subtotal?trs[rc.subtotal.styleRow-1]||tplD:tplD;
 const fmtOf=c=>rc.fmt&&rc.fmt[c];
 const fill=(tr,vals,rowNo)=>{
  const cells=topLevel(tr,'w:tc');let col=0;let out=tr.slice(0,cells.length?cells[0][0]:tr.length);let last=cells.length?cells[0][0]:0;
  for(const [a,b] of cells){
   const tc=tr.slice(a,b);const span=+((/<w:gridSpan w:val="(\d+)"/.exec(tc)||[])[1]||1);
   const c=rc.cols.find(x=>x.c===col);
   let v=c?vals[c.c]:null;if(c&&c.role==='rownum'&&rowNo)v=rowNo;
   out+=tr.slice(last,a)+setCellText(tc,c?display(v,fmtOf(c.c)):'');
   last=b;col+=span;
  }
  return out+tr.slice(last);
 };
 const outRows=[];
 trs.forEach((tr,i)=>{if(i<d0)outRows.push(replace?replaceTexts(tr,replace):tr);});
 let n=0;
 const data=res.rows.length?res.rows:[{kind:'data',vals:{[rc.cols[0].c]:'Нет данных за период'}}];
 for(const r of data){if(r.kind==='data')n++;outRows.push(fill(r.kind==='sub'?tplS:tplD,r.vals,r.kind==='data'?n:0));}
 trs.forEach((tr,i)=>{
  if(i<=d1)return;
  if(i===tot&&res.totalRow&&rc.total){
   const vals={};for(const c of rc.cols){const how=rc.total.cols[c.c];if(how==='sum'||how==='formula'&&c.role==='measure'){let s=0;for(const r of res.rows)if(r.kind==='data')s+=toNum(r.vals[c.c])||0;vals[c.c]=s;}}
   const cells=topLevel(tr,'w:tc');let col=0,out='',last=0;
   for(const [a,b] of cells){const tc=tr.slice(a,b);const span=+((/<w:gridSpan w:val="(\d+)"/.exec(tc)||[])[1]||1);
    out+=tr.slice(last,a)+(vals[col]!=null?setCellText(tc,display(vals[col],fmtOf(col))):(replace?replaceTexts(tc,replace):tc));last=b;col+=span;}
   outRows.push(out+tr.slice(last));return;
  }
  outRows.push(replace?replaceTexts(tr,replace):tr);
 });
 return head+outRows.join('')+tail;
}
function factValue(f,vals,prevVals){
 if(!f)return null;
 if(f.chg){const k=factKey(f.chg);const cur=vals.get(k),pv=prevVals&&prevVals.get(k);if(cur==null||!pv)return null;const ch=(cur-pv)/Math.abs(pv)*100;return f.abs?Math.abs(ch):ch;}
 const v=vals.get(factKey(f));
 if(v==null&&f.kind==='tbl'&&f.what==='cell')return 0;
 return v==null?null:v;
}

async function generate(report,template,tables,opt){
 opt=opt||{};
 const doc=await readDocx(report.templateName,template);
 const zip=await JSZip.loadAsync(template);
 const rc0=report.sheets[0];
 const splitVals=report.split&&rc0?L.splitValues(rc0,tables,report.split.src):[null];
 if(report.split&&!splitVals.length)throw Error('В новых данных нет значений «'+report.split.src+'» для разбивки.');
 const baseSplit=report.split?report.splits.find(s=>s.src===report.split.src):null;
 const files=[];
 for(const sv of splitVals){
  const issues=[];const plan=[];const results=[];
  for(const rc of report.sheets){
   const r2=Object.assign({},rc,{filters:sv?rc.filters.filter(f=>f.src!==report.split.src):rc.filters});
   const res=L.applySheet(r2,tables,{period:opt.period,split:sv?{src:report.split.src,key:sv.key}:null});
   plan.push({rc:r2,res});results.push(res);issues.push(...res.issues);
  }
  if(sv&&plan.length&&plan.every(p=>!p.res.rows.length))continue;
  const sub=sv?{src:report.split.src,key:sv.key}:null;
  const vals=computeFacts(report,tables,opt.period,results,sub);
  const prevVals=report.tokens.some(t=>t.fact&&t.fact.chg)?computeFacts(report,tables,opt.period-1,[],sub):null;
  const oldP=report.samplePeriod!=null?{from:rc0&&rc0.period?rc0.period.from:report.samplePeriod,to:report.samplePeriod}:null;
  const newP=opt.period!=null?(rc0?window.ObrazecCore.periodOf(rc0,opt.period):{from:opt.period,to:opt.period}):null;
  const pairs=sv&&baseSplit?pairsFor(baseSplit.label,sv.label):[];
  const replace=Wr.makeReplacer(oldP,newP,pairs);
  // правки документа: таблицы и абзацы, с конца
  const edits=[];
  report.sheets.forEach((rc,t)=>{const span=doc.tbls[rc.docTable];if(span)edits.push({s:span[0],e:span[1],x:rebuildTable(doc.xml.slice(span[0],span[1]),rc,plan[t].res,replace)});});
  const changed=[];
  doc.paras.forEach((p,pi)=>{
   const px=doc.xml.slice(p.s,p.e);
   const toks=report.tokens.filter(t=>t.p===pi&&t.fact);
   const ranges=[];
   for(const t of toks){const v=factValue(t.fact,vals,prevVals);if(v==null){issues.push({level:'warn',text:'Число «'+t.raw+'» в тексте не пересчитано: нет данных ('+factText(t.fact,report)+').'});continue;}
    let s=fmtNum(v/t.scale,t.fmt);if(t.pct&&!/%/.test(t.fmt.suf))s+='%';ranges.push({start:t.start,end:t.end,text:s,old:t.raw});
    if(t.noun){const w=t.noun.forms[cat(v)];if(w&&w!==t.noun.word.toLowerCase())ranges.push({start:t.noun.start,end:t.noun.end,text:caseAs(t.noun.word,w)});}}
   let nx=replaceRanges(px,ranges);
   nx=replaceTexts(nx,replace);
   if(nx!==px){edits.push({s:p.s,e:p.e,x:nx});const nt=textOf(nx);if(nt.trim()&&nt!==p.text)changed.push(nt);}
  });
  edits.sort((a,b)=>b.s-a.s);
  let xml=doc.xml;for(const e of edits)xml=xml.slice(0,e.s)+e.x+xml.slice(e.e);
  const z=await JSZip.loadAsync(template);
  z.file('word/document.xml',xml);
  for(const p of Object.keys(z.files))if(/^word\/(header|footer)\d*\.xml$/.test(p)){const x=await z.file(p).async('string');z.file(p,replaceTexts(x,replace));}
  const bytes=await z.generateAsync({type:'uint8array',compression:'DEFLATE'});
  let name=replace(report.templateName);
  if(name===report.templateName||files.some(f=>f.name===name)){const tag=[sv&&sv.label,newP&&R.ymLabel(newP.to)].filter(Boolean).join(' — ');name=name.replace(/\.docx$/i,'')+(tag?' — '+tag:' (новый)')+'.docx';}
  name=name.replace(/[\\/:*?"<>|]+/g,' ');
  const main=plan[0];
  const totals=main?main.rc.cols.filter(c=>c.role==='measure').map(c=>{let s=0;for(const r of main.res.rows)if(r.kind==='data')s+=toNum(r.vals[c.c])||0;return {name:c.name,value:s};}):[];
  let cmp=null;
  const prev=opt.prev&&main&&opt.prev[(sv?sv.key:'')+'|'+main.rc.sheet]||(main&&(!sv||baseSplit&&sv.key===baseSplit.key)?main.rc.prev:null);
  if(main&&prev&&prev.rows&&prev.rows.length)cmp=L.compare(prev,main.rc,main.res);
  files.push({name,bytes,kind:'docx',split:sv,rows:main?main.res.rows.filter(r=>r.kind==='data').length:0,totals,cmp,issues,plan,text:changed,snapshot:main?L.snapshot(main.rc,main.res,newP?newP.to:null):null});
 }
 return files;
}
function pairsFor(a,b){const A=window.ObrazecCore.nameForms(a),B=window.ObrazecCore.nameForms(b);return A.map((x,i)=>({from:x,to:B[Math.min(i,B.length-1)]||b}));}

window.ObrazecWord={readDocx,learn,generate,factText,tokensOf,inferFmt,fmtNum,
 _:{topLevel,esc,unesc,parseVal,display,nounAfter,cat,caseAs,mainTableOf,dateColName,sourceFacts,tableFacts,factKey,computeFacts,strip,factValue,pairsFor}};
})();
