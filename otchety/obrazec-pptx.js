/* «По образцу» для PowerPoint: прошлая презентация + исходники Excel → новая презентация.
   Пересчитываются таблицы, диаграммы (данные и встроенная книга) и числа в тексте слайдов;
   месяцы и даты сдвигаются; оформление, анимация, картинки — как в образце. */
(function(){
'use strict';
const R=window.ObrazecRead,L=window.ObrazecLearn,Wd=window.ObrazecWord,Wr=window.ObrazecWrite;
const I=Wd._;const {topLevel,esc,unesc,parseVal}=I;
const {toNum,vkey,DV}=R;

function relsOf(xml,base){
 const m=new Map();
 for(const x of xml.matchAll(/<Relationship\b[^>]*>/g)){const id=/Id="([^"]+)"/.exec(x[0]),t=/Target="([^"]+)"/.exec(x[0]);if(id&&t)m.set(id[1],resolve(base,t[1]));}
 return m;
}
function resolve(base,t){if(t.startsWith('/'))return t.slice(1);const parts=base.split('/');parts.pop();for(const seg of t.split('/')){if(seg==='..')parts.pop();else if(seg!=='.')parts.push(seg);}return parts.join('/');}
function textA(x){
 let s='';const re=/<a:t>([\s\S]*?)<\/a:t>|<a:t\/>|<a:br\b[^>]*\/>|<\/a:p>/g;let m;
 while((m=re.exec(x))){if(m[1]!=null)s+=unesc(m[1]);else if(m[0].startsWith('<a:br'))s+='\n';else if(m[0]==='</a:p>')s+='\n';}
 return s.replace(/\n+$/,'');
}
/* ---------- диаграмма: ряды → таблица ---------- */
function ptsOf(x){const out=[];for(const m of x.matchAll(/<c:pt idx="(\d+)"[^>]*>\s*(?:<c:formatCode>[^<]*<\/c:formatCode>\s*)?<c:v>([\s\S]*?)<\/c:v>/g))out[+m[1]]=unesc(m[2]);return out;}
function parseChart(cx){
 const sers=topLevel(cx,'c:ser').map(([a,b])=>{
  const x=cx.slice(a,b);
  const tx=/<c:tx>([\s\S]*?)<\/c:tx>/.exec(x);
  const name=tx?(ptsOf(tx[1])[0]||(/<c:v>([\s\S]*?)<\/c:v>/.exec(tx[1])||[])[1]||''):'';
  const cat=/<c:(cat|xVal)>([\s\S]*?)<\/c:\1>/.exec(x);const val=/<c:(val|yVal)>([\s\S]*?)<\/c:\1>/.exec(x);
  return {a,b,name:unesc(name||''),cats:cat?ptsOf(cat[2]):[],vals:val?ptsOf(val[2]).map(v=>v==null?null:+v):[],catNum:cat?/<c:numRef>|<c:numLit>/.test(cat[2]):false};
 });
 return sers;
}
function chartGrid(sers){
 const n=Math.max(0,...sers.map(s=>Math.max(s.cats.length,s.vals.length)));
 const cats=sers[0]?sers[0].cats:[];
 const head=['Категория'].concat(sers.map((s,i)=>s.name&&s.name.trim()?s.name:'Ряд '+(i+1)));
 const grid=[head],texts=[head.slice()];
 for(let i=0;i<n;i++){const c=cats[i]!=null?cats[i]:String(i+1);const row=[parseVal(String(c))];sers.forEach(s=>row.push(s.vals[i]));grid.push(row);texts.push([String(c)].concat(sers.map(s=>s.vals[i]==null?'':String(s.vals[i]))));}
 return {grid,texts,head};
}

/** Читает pptx: слайды по порядку, таблицы, диаграммы, абзацы. */
async function readPptx(name,buffer){
 const bytes=new Uint8Array(buffer);
 const zip=await JSZip.loadAsync(bytes);
 const pres=zip.file('ppt/presentation.xml');if(!pres)throw Error('«'+name+'» — не презентация PowerPoint (.pptx).');
 const px=await pres.async('string');const prel=relsOf(await zip.file('ppt/_rels/presentation.xml.rels').async('string'),'ppt/presentation.xml');
 const order=[...px.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map(m=>prel.get(m[1])).filter(Boolean);
 const parts=[],sheets=[],paras=[];
 for(let k=0;k<order.length;k++){
  const path=order[k];const f=zip.file(path);if(!f)continue;
  const xml=await f.async('string');
  const rp=path.replace(/slides\/(slide\d+\.xml)$/,'slides/_rels/$1.rels');
  const rels=zip.file(rp)?relsOf(await zip.file(rp).async('string'),path):new Map();
  const pi=parts.length;parts.push({path,xml,rels,slide:k+1});
  const tbls=topLevel(xml,'a:tbl');
  tbls.forEach(([s,e],j)=>{
   const tx=xml.slice(s,e);const grid=[],texts=[];
   topLevel(tx,'a:tr').forEach(([a,b],r)=>{const row=[],tr=[];let col=0;
    for(const [c0,c1] of topLevel(tx,'a:tc',a,b)){const tc=tx.slice(c0,c1);const span=+((/^<a:tc\b[^>]*gridSpan="(\d+)"/.exec(tc)||[])[1]||1);const cont=/^<a:tc\b[^>]*(hMerge|vMerge)="1"/.test(tc);const t=cont?'':textA(tc);const v=parseVal(t);if(v!=null)row[col]=v;tr[col]=t;col+=span;}
    grid[r]=row;texts[r]=tr;});
   sheets.push({name:'Слайд '+(k+1)+', таблица '+(j+1),grid,formulas:[],merges:[],texts,docTable:sheets.length,ref:{kind:'table',part:pi,idx:j}});
  });
  // диаграммы
  let j=0;
  for(const m of xml.matchAll(/<c:chart\b[^>]*r:id="([^"]+)"/g)){
   const cp=rels.get(m[1]);if(!cp||!zip.file(cp))continue;
   const cx=await zip.file(cp).async('string');const sers=parseChart(cx);if(!sers.length)continue;
   const {grid,texts}=chartGrid(sers);
   sheets.push({name:'Слайд '+(k+1)+', диаграмма '+(++j),grid,formulas:[],merges:[],texts,docTable:sheets.length,ref:{kind:'chart',part:pi,path:cp,idx:j}});
  }
  // абзацы вне таблиц
  let pos=0;const segs=[];for(const [s,e] of tbls){segs.push([pos,s]);pos=e;}segs.push([pos,xml.length]);
  for(const [a,b] of segs)for(const [s,e] of topLevel(xml,'a:p',a,b)){const t=textA(xml.slice(s,e));paras.push({part:pi,s,e,text:t});}
 }
 return {name,kind:'pptx',bytes,parts,sheets,paras};
}

/* ---------- запись ---------- */
function setCellA(tc,text){
 const open=/^<a:tc\b[^>]*>/.exec(tc)[0];
 const pr=(/<a:tcPr\b[\s\S]*?(?:\/>|<\/a:tcPr>)/.exec(tc)||[''])[0];
 const body=(/<a:txBody>([\s\S]*?)<\/a:txBody>/.exec(tc)||['',''])[1];
 const bp=(/<a:bodyPr\b[\s\S]*?(?:\/>|<\/a:bodyPr>)/.exec(body)||['<a:bodyPr/>'])[0];
 const ls=(/<a:lstStyle\b[\s\S]*?(?:\/>|<\/a:lstStyle>)/.exec(body)||['<a:lstStyle/>'])[0];
 const p=(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[\s\S]*?<\/a:p>/.exec(body)||[''])[0];
 const ppr=(/<a:pPr\b[\s\S]*?(?:\/>|<\/a:pPr>)/.exec(p)||[''])[0];
 const rpr=(/<a:rPr\b[\s\S]*?(?:\/>|<\/a:rPr>)/.exec(p)||/<a:endParaRPr\b[^>]*?\/>/.exec(p)||[''])[0].replace(/^<a:endParaRPr/,'<a:rPr');
 const end=(/<a:endParaRPr\b[\s\S]*?(?:\/>|<\/a:endParaRPr>)/.exec(p)||[''])[0];
 const runs=String(text)===''?'':String(text).split('\n').map((line,i)=>(i?'<a:br>'+rpr+'</a:br>':'')+'<a:r>'+rpr+'<a:t>'+esc(line)+'</a:t></a:r>').join('').replace(/<a:br><a:rPr([^>]*)\/><\/a:br>/g,'<a:br><a:rPr$1/></a:br>');
 return open+'<a:txBody>'+bp+ls+'<a:p>'+ppr+runs+end+'</a:p></a:txBody>'+pr+'</a:tc>';
}
function replaceTextsA(x,fn){return x.replace(/(<a:t>)([\s\S]*?)(<\/a:t>)/g,(m,a,t,b)=>{const u=unesc(t);const n=fn(u);return n===u?m:a+esc(n)+b;});}
function replaceRangesA(px,ranges){
 if(!ranges.length)return px;
 const nodes=[];const re=/(<a:t>)([\s\S]*?)(<\/a:t>)|<a:br\b[^>]*\/>|<a:br\b[^>]*>[\s\S]*?<\/a:br>|<\/a:p>/g;let m,pos=0;
 while((m=re.exec(px))){if(m[2]!=null){const t=unesc(m[2]);nodes.push({s:m.index,e:m.index+m[0].length,t,from:pos});pos+=t.length;}else pos+=1;}
 const edits=nodes.map(n=>({n,t:n.t}));
 for(const r of ranges.slice().sort((a,b)=>b.start-a.start))
  for(let i=edits.length-1;i>=0;i--){const e=edits[i],a=e.n.from,b=a+e.n.t.length;if(b<=r.start||a>=r.end)continue;const ls=Math.max(0,r.start-a),le=Math.min(e.n.t.length,r.end-a);e.t=e.t.slice(0,ls)+(r.start>=a&&r.start<b?r.text:'')+e.t.slice(le);}
 let out='',last=0;for(const e of edits){out+=px.slice(last,e.n.s)+'<a:t>'+esc(e.t)+'</a:t>';last=e.n.e;}
 return out+px.slice(last);
}
function cellText(rc,c,v,rowNo){
 if(c.role==='rownum'&&rowNo)return String(rowNo);
 return I.display(v,rc.fmt&&rc.fmt[c.c]);
}
function keepOf(rc,c,row){
 const m=rc.keepVals&&rc.keepVals[c.c];if(!m)return null;
 const dk=rc.cols.filter(x=>x.role==='dim').map(x=>vkey(row.vals[x.c])).join(R.SEP);
 const v=row.kind==='data'?m[dk]:m['#'+row.kind];return v==null?null:v;
}
function rebuildTableA(tx,rc,res,replace){
 const rows=topLevel(tx,'a:tr');if(!rows.length)return {x:tx,h:null};
 const head=tx.slice(0,rows[0][0]),tail=tx.slice(rows[rows.length-1][1]);
 const trs=rows.map(([a,b])=>tx.slice(a,b));
 const d0=rc.firstRow-1,d1=rc.lastRow-1,tot=rc.totalRow!=null?rc.totalRow-1:null;
 const tplD=trs[rc.dataStyleRow-1]||trs[d0],tplS=rc.subtotal?trs[rc.subtotal.styleRow-1]||tplD:tplD;
 const fill=(tr,row,rowNo)=>{
  const cells=topLevel(tr,'a:tc');let col=0,out='',last=0;
  for(const [a,b] of cells){const tc=tr.slice(a,b);const span=+((/^<a:tc\b[^>]*gridSpan="(\d+)"/.exec(tc)||[])[1]||1);
   const c=rc.cols.find(x=>x.c===col);let v=c?row.vals[c.c]:null;if(c&&(v==null||v==='')&&c.role==='blank')v=keepOf(rc,c,row);
   out+=tr.slice(last,a)+(c?setCellA(tc,cellText(rc,c,v,rowNo)):tc);last=b;col+=span;}
  return out+tr.slice(last);
 };
 const out=[];
 trs.forEach((tr,i)=>{if(i<d0)out.push(replace?replaceTextsA(tr,replace):tr);});
 let n=0;
 const data=res.rows.length?res.rows:[{kind:'data',vals:{[rc.cols[0].c]:'Нет данных за период'}}];
 for(const r of data){if(r.kind==='data')n++;out.push(fill(r.kind==='sub'?tplS:tplD,r,r.kind==='data'?n:0));}
 trs.forEach((tr,i)=>{
  if(i<=d1)return;
  if(i===tot&&res.totalRow&&rc.total){
   const vals={};for(const c of rc.cols){const how=rc.total.cols[c.c];if(how==='sum'||how==='formula'&&c.role==='measure'){let s=0;for(const r of res.rows)if(r.kind==='data')s+=toNum(r.vals[c.c])||0;vals[c.c]=s;}}
   const cells=topLevel(tr,'a:tc');let col=0,o='',last=0;
   for(const [a,b] of cells){const tc=tr.slice(a,b);const span=+((/^<a:tc\b[^>]*gridSpan="(\d+)"/.exec(tc)||[])[1]||1);
    o+=tr.slice(last,a)+(vals[col]!=null?setCellA(tc,I.display(vals[col],rc.fmt&&rc.fmt[col])):(replace?replaceTextsA(tc,replace):tc));last=b;col+=span;}
   out.push(o+tr.slice(last));return;
  }
  out.push(replace?replaceTextsA(tr,replace):tr);
 });
 // строк стало больше — уменьшаем шрифт и высоту строк, чтобы таблица осталась на слайде
 if(out.length>trs.length){const k=Math.max(0.55,trs.length/out.length);
  const kf=Math.max(k,0.6),def=Math.max(900,Math.round(1800*kf));
  for(let i=0;i<out.length;i++)out[i]=out[i].replace(/^(<a:tr\b[^>]*\bh=")(\d+)/,(m,a,v)=>a+Math.round(+v*k))
   .replace(/(<a:(?:rPr|endParaRPr|defRPr)\b[^>]*\bsz=")(\d+)/g,(m,a,v)=>a+Math.max(800,Math.round(+v*kf)))
   .replace(/<a:(rPr|endParaRPr)\b(?![^>]*\bsz=)/g,m=>m+' sz="'+def+'"')
   .replace(/<a:r><a:t>/g,'<a:r><a:rPr lang="ru-RU" sz="'+def+'"/><a:t>');}
 const h=out.reduce((a,tr)=>a+(+((/^<a:tr\b[^>]*\bh="(\d+)"/.exec(tr)||[])[1]||0)),0);
 return {x:head+out.join('')+tail,h,rows:out.length,was:trs.length};
}
/** Новые данные диаграммы: категории + ряды; встроенная книга пересобирается. */
function chartUpdate(cx,rc,res){
 const sers=parseChart(cx);
 const rows=res.rows.filter(r=>r.kind==='data');
 const dimC=rc.cols.filter(c=>c.role==='dim');
 const catOf=r=>dimC.map(c=>R.display(r.vals[c.c])).join(' ');
 const cats=rows.map(catOf);
 const serCols=rc.cols.filter(c=>c.c>=1).sort((a,b)=>a.c-b.c);
 const vals=serCols.map(c=>rows.map(r=>{let v=r.vals[c.c];if((v==null||v==='')&&c.role==='blank')v=keepOf(rc,c,r);const n=toNum(v);return n==null?null:n;}));
 const n=cats.length;
 let sheet='Sheet1';const fm=/<c:f>([\s\S]*?)<\/c:f>/.exec(cx);if(fm){const s=unesc(fm[1]);const mm=/^(?:'((?:[^']|'')+)'|([^!]+))!/.exec(s);if(mm)sheet=(mm[1]||mm[2]).replace(/''/g,"'");}
 const sq=sheet.replace(/'/g,"''"),pre="'"+sq+"'!";
 const colL=i=>XLSX.utils.encode_col(i);
 const catNum=sers[0]&&sers[0].catNum&&cats.every(c=>toNum(c)!=null);
 const strCache=arr=>'<c:strCache><c:ptCount val="'+arr.length+'"/>'+arr.map((v,i)=>'<c:pt idx="'+i+'"><c:v>'+esc(v)+'</c:v></c:pt>').join('')+'</c:strCache>';
 const numCache=(arr,code)=>'<c:numCache><c:formatCode>'+(code||'General')+'</c:formatCode><c:ptCount val="'+arr.length+'"/>'+arr.map((v,i)=>v==null?'':'<c:pt idx="'+i+'"><c:v>'+(+(+v).toFixed(10))+'</c:v></c:pt>').join('')+'</c:numCache>';
 let out='',last=0;
 sers.forEach((s,k)=>{
  let x=cx.slice(s.a,s.b);
  const L1=colL(k+1);
  const code=(/<c:val>[\s\S]*?<c:formatCode>([\s\S]*?)<\/c:formatCode>/.exec(x)||[])[1];
  x=x.replace(/<c:(cat|xVal)>[\s\S]*?<\/c:\1>/,(m,t)=>'<c:'+t+'>'+(catNum?'<c:numRef><c:f>'+esc(pre+'$A$2:$A$'+(n+1))+'</c:f>'+numCache(cats.map(Number))+'</c:numRef>':'<c:strRef><c:f>'+esc(pre+'$A$2:$A$'+(n+1))+'</c:f>'+strCache(cats)+'</c:strRef>')+'</c:'+t+'>');
  x=x.replace(/<c:(val|yVal)>[\s\S]*?<\/c:\1>/,(m,t)=>'<c:'+t+'><c:numRef><c:f>'+esc(pre+'$'+L1+'$2:$'+L1+'$'+(n+1))+'</c:f>'+numCache(vals[k]||[],code)+'</c:numRef></c:'+t+'>');
  x=x.replace(/(<c:tx>\s*<c:strRef>\s*<c:f>)[\s\S]*?(<\/c:f>)/,(m,a,b)=>a+esc(pre+'$'+L1+'$1')+b);
  // точечные настройки отдельных точек (цвета, подписи) с прежними номерами убираем, если точек стало меньше
  x=x.replace(/<c:dPt>[\s\S]*?<\/c:dPt>/g,m=>{const i=+((/<c:idx val="(\d+)"/.exec(m)||[])[1]||0);return i<n?m:'';});
  out+=cx.slice(last,s.a)+x;last=s.b;
 });
 out+=cx.slice(last);
 const aoa=[[''].concat(sers.map((s,i)=>s.name||'Ряд '+(i+1)))].concat(cats.map((c,i)=>[catNum?Number(c):c].concat(vals.map(v=>v[i]))));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),sheet.slice(0,31));
 return {xml:out,book:new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'})),n,was:Math.max(0,...sers.map(s=>s.vals.length))};
}

function learn(sample,sources){
 const rep=Wd.learn({name:sample.name,book:sample.book},sources);
 rep.kind='pptx';rep.templateKind='pptx';
 return rep;
}

async function generate(report,template,tables,opt){
 opt=opt||{};
 const doc=await readPptx(report.templateName,template);
 const rc0=report.sheets[0];
 const splitVals=report.split&&rc0?L.splitValues(rc0,tables,report.split.src):[null];
 if(report.split&&!splitVals.length)throw Error('В новых данных нет значений «'+report.split.src+'» для разбивки.');
 const baseSplit=report.split?report.splits.find(s=>s.src===report.split.src):null;
 const files=[];
 for(const sv of splitVals){
  const issues=[],plan=[],results=[];
  for(const rc of report.sheets){
   const r2=Object.assign({},rc,{filters:sv?rc.filters.filter(f=>f.src!==report.split.src):rc.filters});
   const res=L.applySheet(r2,tables,{period:opt.period,split:sv?{src:report.split.src,key:sv.key}:null});
   plan.push({rc:r2,res});results.push(res);issues.push(...res.issues);
  }
  if(sv&&plan.length&&plan.every(p=>!p.res.rows.length))continue;
  const sub=sv?{src:report.split.src,key:sv.key}:null;
  const vals=I.computeFacts(report,tables,opt.period,results,sub);
  const prevVals=report.tokens.some(t=>t.fact&&t.fact.chg)?I.computeFacts(report,tables,opt.period-1,[],sub):null;
  const oldP=report.samplePeriod!=null?{from:rc0&&rc0.period?rc0.period.from:report.samplePeriod,to:report.samplePeriod}:null;
  const newP=opt.period!=null?(rc0?window.ObrazecCore.periodOf(rc0,opt.period):{from:opt.period,to:opt.period}):null;
  const pairs=sv&&baseSplit?I.pairsFor(baseSplit.label,sv.label):[];
  const replace=Wr.makeReplacer(oldP,newP,pairs);
  const z=await JSZip.loadAsync(template);
  const edits=doc.parts.map(()=>[]);
  const changed=[];
  // таблицы
  report.sheets.forEach((rc,t)=>{
   if(!rc.ref)return;
   const part=doc.parts[rc.ref.part];
   if(rc.ref.kind==='table'){
    const span=topLevel(part.xml,'a:tbl')[rc.ref.idx];if(!span)return;
    const r=rebuildTableA(part.xml.slice(span[0],span[1]),rc,plan[t].res,replace);
    edits[rc.ref.part].push({s:span[0],e:span[1],x:r.x});
    // высота рамки таблицы
    const fs=part.xml.lastIndexOf('<p:graphicFrame',span[0]);const xf=part.xml.indexOf('<p:xfrm',fs);
    if(fs>=0&&xf>=0&&xf<span[0]&&r.h){const em=/<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(part.xml.slice(xf,span[0]));if(em){const at=xf+em.index;edits[rc.ref.part].push({s:at,e:at+em[0].length,x:'<a:ext cx="'+em[1]+'" cy="'+r.h+'"/>'});}}
    if(r.rows>r.was)issues.push({level:'info',text:'Таблица на слайде '+part.slide+': строк стало '+(r.rows-1)+' вместо '+(r.was-1)+' — шрифт уменьшен, чтобы таблица поместилась.'});
   }
  });
  // диаграммы
  for(const [t,rc] of report.sheets.entries()){
   if(!rc.ref||rc.ref.kind!=='chart')continue;
   const cx=await z.file(rc.ref.path).async('string');
   const u=chartUpdate(cx,rc,plan[t].res);
   z.file(rc.ref.path,u.xml,{createFolders:false});
   const relp=rc.ref.path.replace(/charts\/(chart[^/]+)$/,'charts/_rels/$1.rels');
   if(z.file(relp)){const rels=relsOf(await z.file(relp).async('string'),rc.ref.path);for(const [,p] of rels)if(/embeddings\/.*\.xlsx$/i.test(p)&&z.file(p))z.file(p,u.book,{createFolders:false});}
  }
  const chartsSkipped=doc.sheets.filter(s=>s.ref.kind==='chart'&&!report.sheets.some(rc=>rc.ref&&rc.ref.kind==='chart'&&rc.ref.path===s.ref.path)).map(s=>s.name);
  if(chartsSkipped.length)issues.push({level:'warn',text:'Не пересчитаны (данные не нашлись в исходниках, оставлены как в образце): '+chartsSkipped.join('; ')+'.'});
  // абзацы
  doc.paras.forEach((p,pi)=>{
   const part=doc.parts[p.part];const px=part.xml.slice(p.s,p.e);
   const ranges=[];
   for(const t of report.tokens.filter(t=>t.p===pi&&t.fact)){
    const v=I.factValue(t.fact,vals,prevVals);
    if(v==null){issues.push({level:'warn',text:'Число «'+t.raw+'» на слайде '+part.slide+' не пересчитано: нет данных.'});continue;}
    let s=Wd.fmtNum(v/t.scale,t.fmt);if(t.pct&&!/%/.test(t.fmt.suf))s+='%';ranges.push({start:t.start,end:t.end,text:s});
    if(t.noun){const w=t.noun.forms[I.cat(v)];if(w&&w!==t.noun.word.toLowerCase())ranges.push({start:t.noun.start,end:t.noun.end,text:I.caseAs(t.noun.word,w)});}
   }
   let nx=replaceRangesA(px,ranges);nx=replaceTextsA(nx,replace);
   if(nx!==px){edits[p.part].push({s:p.s,e:p.e,x:nx});const nt=textA(nx);if(nt.trim()&&nt!==p.text)changed.push('Слайд '+part.slide+': '+nt.replace(/\n/g,' '));}
  });
  doc.parts.forEach((part,i)=>{
   const es=edits[i].sort((a,b)=>b.s-a.s);if(!es.length)return;
   let x=part.xml;for(const e of es)x=x.slice(0,e.s)+e.x+x.slice(e.e);z.file(part.path,x,{createFolders:false});
  });
  // заметки докладчика — сдвиг месяцев
  for(const p of Object.keys(z.files))if(/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)){const x=await z.file(p).async('string');z.file(p,replaceTextsA(x,replace),{createFolders:false});}
  const bytes=await z.generateAsync({type:'uint8array',compression:'DEFLATE'});
  let name=replace(report.templateName);
  if(name===report.templateName||files.some(f=>f.name===name)){const tag=[sv&&sv.label,newP&&R.ymLabel(newP.to)].filter(Boolean).join(' — ');name=name.replace(/\.pptx$/i,'')+(tag?' — '+tag:' (новый)')+'.pptx';}
  name=name.replace(/[\\/:*?"<>|]+/g,' ');
  const main=plan.find(p=>p.rc.ref&&p.rc.ref.kind==='table')||plan[0];
  const totals=main?main.rc.cols.filter(c=>c.role==='measure').map(c=>{let s=0;for(const r of main.res.rows)if(r.kind==='data')s+=toNum(r.vals[c.c])||0;return {name:c.name,value:s};}):[];
  files.push({name,bytes,kind:'pptx',split:sv,rows:main?main.res.rows.filter(r=>r.kind==='data').length:0,totals,cmp:null,issues,plan,text:changed,snapshot:main?L.snapshot(main.rc,main.res,newP?newP.to:null):null});
 }
 return files;
}

window.ObrazecPptx={readPptx,learn,generate};
})();
