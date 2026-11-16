/* «По образцу»: запись результата в копию образца (стили, формулы, фильтры, диаграммы сохраняются). */
(function(){
'use strict';
const R=window.ObrazecRead;
const {DV,MON}=R;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const unesc=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,d)=>String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&amp;/g,'&');
const colN=s=>{let n=0;for(const ch of s)n=n*26+ch.charCodeAt(0)-64;return n-1;};
const colS=n=>XLSX.utils.encode_col(n);

/* ---------- ссылки в формулах и диапазонах ---------- */
// geo: {d0,d1,delta,c0,c1} — старая область данных таблицы и сдвиг; список geo — по таблицам листа
function pick(geo,col){
 if(!Array.isArray(geo))return geo;
 for(const g of geo)if(col>=g.c0&&col<=g.c1)return g;
 return geo.main||geo[0];
}
function mapRow(row,abs,end,g,rel){
 const {d0,d1,delta}=g;
 if(rel&&rel.g===g&&!abs&&row>=d0&&row<=d1)return row+rel.off;
 if(row>d1)return row+delta;
 if(end&&row===d1)return d1+delta;
 return row;
}
const REF=/(^|[^A-Za-z0-9_.$!А-Яа-яЁё])((?:'(?:[^']|'')+'|[A-Za-zА-Яа-яЁё0-9_.]+)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?::(\$?)([A-Z]{1,3})(\$?)(\d+))?(?![A-Za-z0-9_(])/g;
function sheetOf(prefix){if(!prefix)return null;let s=prefix.slice(0,-1);if(s[0]==="'")s=s.slice(1,-1).replace(/''/g,"'");return s;}
/** Пересчитывает ссылки формулы. own — лист формулы, target — лист с изменёнными строками. */
function adjustFormula(f,own,target,geo,rel){
 return f.split(/("(?:[^"]|"")*")/).map((part,i)=>i%2?part:part.replace(REF,(m,pre,sp,c1a,c1,r1a,r1,c2a,c2,r2a,r2)=>{
  const sh=sheetOf(sp)||own;if(sh!==target)return m;
  const g=pick(geo,colN(c1));
  if(r2==null)return pre+(sp||'')+c1a+c1+r1a+mapRow(+r1,!!r1a,false,g,rel);
  return pre+(sp||'')+c1a+c1+r1a+mapRow(+r1,!!r1a,false,g,rel)+':'+c2a+c2+r2a+mapRow(+r2,!!r2a,true,g,rel);
 })).join('');
}
function adjustSqref(sq,geo,drop){
 return sq.split(/\s+/).map(rg=>{
  const m=/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(rg);if(!m)return rg;
  const r1=+m[2],r2=m[4]?+m[4]:r1;const {d0,d1,delta}=pick(geo,colN(m[1]));
  if(r2<d0)return rg;
  if(r1>d1)return m[1]+(r1+delta)+(m[3]?':'+m[3]+(r2+delta):'');
  if(r1>=d0&&r2<=d1){if(drop)return null;return m[1]+d0+':'+(m[3]||m[1])+(d1+delta);}
  const nr2=r2>d1?r2+delta:d1+delta;
  return m[1]+r1+':'+(m[3]||m[1])+nr2;
 }).filter(Boolean).join(' ');
}

/* ---------- подписи периода ---------- */
const GEN=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const PREP=['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
function caseLike(src,w){if(src===src.toUpperCase()&&src.length>1)return w.toUpperCase();if(src[0]===src[0].toUpperCase())return w[0].toUpperCase()+w.slice(1);return w;}
/** Заменитель текста: месяцы и даты старого периода → новый, плюс пары «было → стало». */
function makeReplacer(oldP,newP,pairs){
 pairs=(pairs||[]).filter(p=>p.from&&p.from!==p.to).sort((a,b)=>b.from.length-a.from.length);
 const shift=oldP!=null&&newP!=null?newP.to-oldP.to:0;
 const fromShift=oldP!=null&&newP!=null?newP.from-oldP.from:0;
 const monthMap=new Map();
 if(shift||fromShift){
  const add=(oldYm,newYm)=>{if(oldYm==null||newYm==null||oldYm===newYm)return;const o=oldYm%12,n=newYm%12;
   monthMap.set(MON[o],[MON[n],Math.floor(oldYm/12),Math.floor(newYm/12)]);monthMap.set(GEN[o],[GEN[n],Math.floor(oldYm/12),Math.floor(newYm/12)]);monthMap.set(PREP[o],[PREP[n],Math.floor(oldYm/12),Math.floor(newYm/12)]);};
  if(oldP.from!==oldP.to)add(oldP.from,newP.from);
  add(oldP.to,newP.to);
 }
 const words=[...monthMap.keys()].sort((a,b)=>b.length-a.length);
 const reMon=words.length?new RegExp('(^|[^А-Яа-яЁё])('+words.join('|')+')(?![А-Яа-яЁё])(\\s*)(\\d{4})?','gi'):null;
 const lastDay=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
 return function(text){
  if(!text)return text;
  let s=text;
  for(const p of pairs)s=s.split(p.from).join(p.to);
  if(!shift&&!fromShift)return s;
  if(reMon)s=s.replace(reMon,(m,pre,w,sp,y)=>{const e=monthMap.get(w.toLowerCase());if(!e)return m;const [nw,oy,ny]=e;if(y&&+y!==oy)return m;return pre+caseLike(w,nw)+sp+(y?String(ny):'');});
  s=s.replace(/(^|\D)(\d{2})\.(\d{2})\.(\d{4})(?!\d)/g,(m,pre,d,mo,y)=>{
   const ym=R.ymOf(+y,+mo);let to=null;
   if(oldP.to===ym)to=newP.to;else if(oldP.from===ym)to=newP.from;else if(ym>=oldP.from&&ym<=oldP.to)to=ym+fromShift;
   if(to==null)return m;
   const ny=Math.floor(to/12),nm=to%12+1;let nd=+d;
   const ld=lastDay(+y,+mo);if(nd===ld)nd=lastDay(ny,nm);else nd=Math.min(nd,lastDay(ny,nm));
   return pre+String(nd).padStart(2,'0')+'.'+String(nm).padStart(2,'0')+'.'+ny;
  });
  s=s.replace(/(^|[^\d.])(\d{2})\.(\d{4})(?![\d.])/g,(m,pre,mo,y)=>{const ym=R.ymOf(+y,+mo);if(ym!==oldP.to)return m;return pre+String(newP.to%12+1).padStart(2,'0')+'.'+Math.floor(newP.to/12);});
  return s;
 };
}

/* ---------- ячейки ---------- */
function cellXml(ref,s,v,f,cached){
 const st=s!=null?' s="'+s+'"':'';
 if(f!=null)return '<c r="'+ref+'"'+st+'><f>'+esc(f)+'</f>'+(cached!=null&&isFinite(cached)?'<v>'+cached+'</v>':'')+'</c>';
 if(v==null||v==='')return '<c r="'+ref+'"'+st+'/>';
 if(v instanceof DV)return '<c r="'+ref+'"'+st+'><v>'+v.s+'</v></c>';
 if(typeof v==='number')return isFinite(v)?'<c r="'+ref+'"'+st+'><v>'+(+v.toFixed(10))+'</v></c>':'<c r="'+ref+'"'+st+'/>';
 if(typeof v==='boolean')return '<c r="'+ref+'"'+st+' t="b"><v>'+(v?1:0)+'</v></c>';
 return '<c r="'+ref+'"'+st+' t="inlineStr"><is><t xml:space="preserve">'+esc(v)+'</t></is></c>';
}
function parseRows(sd){
 const rows=[];const re=/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;let m;
 while((m=re.exec(sd))){
  const r=+/\br="(\d+)"/.exec(m[1])[1];
  const cells=[];const cre=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;let c;
  while((c=cre.exec(m[2]||''))){const ref=/\br="([A-Z]+)(\d+)"/.exec(c[1]);cells.push({col:colN(ref[1]),attrs:c[1],inner:c[2]||'',raw:c[0]});}
  rows.push({r,attrs:m[1],cells});
 }
 return rows;
}
const styleOf=a=>{const m=/\bs="(\d+)"/.exec(a);return m?+m[1]:null;};
function rowAttrs(a,r){return a.replace(/\br="\d+"/,'r="'+r+'"').replace(/\s*spans="[^"]*"/,'');}

/** Переписывает лист: новые строки каждой таблицы, сдвиг всего, что ниже, формулы, диапазоны. */
function patchSheet(xml,sheetName,list,fgrid,replace){
 const sdm=/<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/.exec(xml);
 const rows=parseRows(sdm&&sdm[1]||'');
 const byR=new Map(rows.map(r=>[r.r,r]));
 const tplStyle=tpl=>{const m=new Map();for(const c of tpl.cells)m.set(c.col,styleOf(c.attrs));return m;};
 const B=list.map(({rc,res})=>{
  const out=res.rows.length?res.rows.slice():[{kind:'data',vals:{},empty:true}];
  const d0=rc.firstRow,d1=rc.lastRow;
  const cs=rc.cols.map(c=>c.c);
  const c0=rc.c0!=null?rc.c0:Math.min(...cs),c1=rc.c1!=null?rc.c1:Math.max(...cs);
  const tplD=byR.get(rc.dataStyleRow||d0)||{attrs:'r="'+d0+'"',cells:[]};
  const tplS=rc.subtotal&&byR.get(rc.subtotal.styleRow)||tplD;
  return {rc,res,out,d0,d1,c0,c1,delta:out.length-(d1-d0+1),tplD,tplS,sD:tplStyle(tplD),sS:tplStyle(tplS)};
 });
 const main=B.slice().sort((a,b)=>(b.d1-b.d0)-(a.d1-a.d0)||a.c0-b.c0)[0];
 const geos=B.map(b=>({d0:b.d0,d1:b.d1,delta:b.delta,c0:b.c0,c1:b.c1}));
 geos.main=geos[B.indexOf(main)];
 B.forEach((b,i)=>b.geo=geos[i]);
 const owner=col=>B.find(b=>col>=b.c0&&col<=b.c1)||null;
 const formulaAt=(r,c)=>fgrid&&fgrid[r-1]&&fgrid[r-1][c];
 const cellsAt=new Map(),attrsAt=new Map();
 const put=(r,col,x)=>{let m=cellsAt.get(r);if(!m)cellsAt.set(r,m=new Map());m.set(col,x);};
 const setAttrs=(r,attrs,prio)=>{const e=attrsAt.get(r);if(!e||e.prio<prio)attrsAt.set(r,{attrs,prio});};
 const sumOf=(b,col)=>{let s=0;for(const r of b.res.rows)if(r.kind==='data')s+=R.toNum(r.vals[col])||0;return s;};
 // исходные ячейки: остаются, сдвигаются или уступают место новым строкам
 for(const row of rows){
  let mainDest=null;
  for(const c of row.cells){
   const ob=owner(c.col),b=ob||main;
   let dest;
   if(row.r<b.d0)dest=row.r;
   else if(row.r<=b.d1)continue;
   else dest=row.r+b.delta;
   const isTotal=ob&&row.r===ob.rc.totalRow;
   put(dest,c.col,fixCell(c,row.r,dest,ob,isTotal));
   if(!ob||ob===main)mainDest=dest;
  }
  if(mainDest==null){
   if(row.r<main.d0)mainDest=row.r;else if(row.r>main.d1)mainDest=row.r+main.delta;
  }
  if(mainDest!=null)setAttrs(mainDest,row.attrs,2);
  else if(row.cells.length){const ob=owner(row.cells[0].col);if(ob&&row.r>ob.d1)setAttrs(row.r+ob.delta,row.attrs,1);}
 }
 function fixCell(c,oldR,newR,ob,isTotal){
  const ref=colS(c.col)+newR;
  let attrs=c.attrs.replace(/\br="[A-Z]+\d+"/,'r="'+ref+'"');
  let inner=c.inner;
  if(/<f\b/.test(inner)){
   let f=formulaAt(oldR,c.col);
   if(f==null){const fm=/<f\b[^>]*>([\s\S]*?)<\/f>/.exec(inner);f=fm?unesc(fm[1]):null;}
   if(f!=null){
    const nf=adjustFormula(f,sheetName,sheetName,geos,null);
    let cached=null;
    if(isTotal&&/^\s*(SUM|SUMIF|SUBTOTAL\(\s*(9|109)|СУММ)/i.test(nf)){const role=ob.rc.cols.find(x=>x.c===c.col);if(role&&role.role==='measure')cached=sumOf(ob,c.col);}
    attrs=attrs.replace(/\s*t="[^"]*"/,'');
    return '<c'+attrs+'><f>'+esc(nf)+'</f>'+(cached!=null?'<v>'+(+cached.toFixed(10))+'</v>':'')+'</c>';
   }
  }
  if(isTotal&&ob.rc.total&&ob.rc.total.cols[c.col]==='sum'&&ob.res.totalRow)return cellXml(ref,styleOf(c.attrs),ob.res.totalRow.vals[c.col],null);
  if(replace&&/t="inlineStr"/.test(attrs))inner=inner.replace(/(<t\b[^>]*>)([\s\S]*?)(<\/t>)/g,(m,a,t,b)=>a+esc(replace(unesc(t)))+b);
  return inner?'<c'+attrs+'>'+inner+'</c>':'<c'+attrs+'/>';
 }
 // дополнительные ячейки шапки (например, новая колонка «Источник»)
 for(const b of B)for(const e of b.rc.extraHead||[]){
  const row=byR.get(e.r);const sc=row&&row.cells.find(x=>x.col===e.styleCol);
  put(e.r<b.d0?e.r:e.r+b.delta,e.c,cellXml(colS(e.c)+e.r,sc?styleOf(sc.attrs):null,e.text,null));
 }
 // итог: ячейки под суммы, которых не было в образце
 for(const b of B){
  if(!b.rc.total||!b.res.totalRow||!b.rc.totalRow)continue;
  const tr=b.rc.totalRow+b.delta;
  for(const c in b.rc.total.cols){if(b.rc.total.cols[c]!=='sum')continue;const ci=+c;const m=cellsAt.get(tr);if(m&&m.has(ci))continue;put(tr,ci,cellXml(colS(ci)+tr,b.sD.get(ci),b.res.totalRow.vals[c],null));}
 }
 // новые строки данных
 for(const b of B){
  const {rc}=b;
  const roleOf=new Map(rc.cols.map(c=>[c.c,c]));
  const colsSorted=[...new Set([...[...b.sD.keys()].filter(c=>c>=b.c0&&c<=b.c1),...rc.cols.map(c=>c.c)])].sort((x,y)=>x-y);
  let dataNo=0;
  b.out.forEach((x,k)=>{
   const r=b.d0+k;const tpl=x.kind==='sub'?b.tplS:b.tplD;const st=x.kind==='sub'?b.sS:b.sD;
   if(x.kind==='data')dataNo++;
   for(const c of colsSorted){
    const ref=colS(c)+r;const role=roleOf.get(c);const sf=rc.styleFrom&&rc.styleFrom[c];const s=st.get(c)!=null?st.get(c):b.sD.get(c)!=null?b.sD.get(c):sf!=null?(st.get(sf)!=null?st.get(sf):b.sD.get(sf)):null;
    let xmlc;
    if(x.empty)xmlc=cellXml(ref,s,c===colsSorted[0]?'Нет данных за период':null,null);
    else if(x.kind==='sub'){
     const how=rc.subtotal&&rc.subtotal.meas[c];
     if(how==='formula'&&x.span){const L=colS(c);const f=formulaAt(rc.subtotal.styleRow,c)||'';const fn=/SUBTOTAL/i.test(f)?'SUBTOTAL(9,':'SUM(';xmlc=cellXml(ref,s,null,fn+L+(b.d0+x.span[0])+':'+L+(b.d0+x.span[1])+')',x.vals[c]);}
     else xmlc=cellXml(ref,s,x.vals[c],null);
    }
    else if(role&&role.role==='formula')xmlc=cellXml(ref,s,null,role.tpl?adjustFormula(role.tpl,sheetName,sheetName,geos,{g:b.geo,off:r-(role.tplRow||rc.dataStyleRow)}):null,null);
    else if(role&&role.role==='rownum')xmlc=cellXml(ref,s,dataNo,null);
    else xmlc=cellXml(ref,s,x.vals[c],null);
    put(r,c,xmlc);
   }
   setAttrs(r,tpl.attrs,b===main?3:1);
  });
 }
 const allR=[...new Set([...cellsAt.keys(),...attrsAt.keys()])].sort((a,b)=>a-b);
 const parts=allR.map(r=>{
  const m=cellsAt.get(r);const at=attrsAt.get(r);
  const attrs=at?rowAttrs(at.attrs,r).trim():'r="'+r+'"';
  if(!m||!m.size)return '<row '+attrs+'/>';
  return '<row '+attrs+'>'+[...m.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]).join('')+'</row>';
 });
 let x=xml.slice(0,sdm.index)+'<sheetData>'+parts.join('')+'</sheetData>'+xml.slice(sdm.index+sdm[0].length);
 x=x.replace(/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/,(m,inner)=>{
  const out=[];inner.replace(/<mergeCell ref="([^"]+)"\s*\/>/g,(mm,ref)=>{const a=adjustSqref(ref,geos,true);if(a)out.push('<mergeCell ref="'+a+'"/>');});
  return out.length?'<mergeCells count="'+out.length+'">'+out.join('')+'</mergeCells>':'';
 });
 x=x.replace(/(<(?:conditionalFormatting|dataValidation|selection)\b[^>]*?\bsqref=")([^"]+)(")/g,(m,a,sq,b)=>a+(adjustSqref(sq,geos,false)||sq)+b);
 x=x.replace(/(<autoFilter\b[^>]*?\bref=")([^"]+)(")/,(m,a,sq,b)=>a+adjustSqref(sq,geos,false)+b);
 x=x.replace(/(<autoFilter\b[^>]*?\bref=")([A-Z]+)(\d+):([A-Z]+)(\d+)(")/,(m,a,c1,r1,c2,r2,b)=>{let mc=colN(c2);for(const bb of B)for(const e of bb.rc.extraHead||[])if(+r1===e.r&&e.c===mc+1)mc=e.c;return a+c1+r1+':'+colS(mc)+r2+b;});
 x=x.replace(/<hyperlinks>([\s\S]*?)<\/hyperlinks>/,(m,inner)=>{const keep=[];inner.replace(/<hyperlink\b[^>]*\/>/g,h=>{const ref=/ref="([^"]+)"/.exec(h);const a=ref&&adjustSqref(ref[1],geos,true);if(a)keep.push(h.replace(ref[0],'ref="'+a+'"'));});return keep.length?'<hyperlinks>'+keep.join('')+'</hyperlinks>':'';});
 x=x.replace(/<rowBreaks\b[\s\S]*?<\/rowBreaks>/,'');
 x=x.replace(/(<cfRule\b[\s\S]*?<formula>)([\s\S]*?)(<\/formula>)/g,(m,a,f,b)=>a+esc(adjustFormula(unesc(f),sheetName,sheetName,geos,null))+b);
 const last=allR.length?allR[allR.length-1]:1;
 x=x.replace(/(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)(")/,(m,a,n,b)=>a+last+b);
 return {xml:x,geo:geos};
}

/* ---------- стили для добавленных листов ---------- */
function addStyles(xml){
 const add=(tag,item)=>{let idx=0;xml=xml.replace(new RegExp('<'+tag+'(\\s[^>]*)?>([\\s\\S]*?)</'+tag+'>'),(m,attrs,inner)=>{const cnt=(inner.match(new RegExp('<'+tag.slice(0,-1)+'[\\s>/]','g'))||[]).length;idx=cnt;const a=(attrs||'').replace(/\s*count="\d+"/,'');return '<'+tag+' count="'+(cnt+1)+'"'+a+'>'+inner+item+'</'+tag+'>';});return idx;};
 if(!/<fonts\b/.test(xml)||!/<fills\b/.test(xml)||!/<cellXfs\b/.test(xml))return null;
 const fBold=add('fonts','<font><b/><sz val="11"/><name val="Calibri"/></font>');
 const fGreen=add('fonts','<font><sz val="11"/><color rgb="FF1E7B34"/><name val="Calibri"/></font>');
 const fRed=add('fonts','<font><sz val="11"/><color rgb="FFC0392B"/><name val="Calibri"/></font>');
 const fTitle=add('fonts','<font><b/><sz val="14"/><name val="Calibri"/></font>');
 const fill=add('fills','<fill><patternFill patternType="solid"><fgColor rgb="FFDDE5F0"/><bgColor indexed="64"/></patternFill></fill>');
 const xf=(num,font,fl)=>add('cellXfs','<xf numFmtId="'+num+'" fontId="'+font+'" fillId="'+fl+'" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"'+(num===0&&fl?' applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>':'/>'));
 const S={
  head:xf(0,fBold,fill),title:xf(0,fTitle,0),bold:xf(0,fBold,0),
  int:xf(3,0,0),dec:xf(4,0,0),pct:xf(10,0,0),
  up:xf(0,fGreen,0),down:xf(0,fRed,0),upInt:xf(3,fGreen,0),downInt:xf(3,fRed,0),boldInt:xf(3,fBold,0)
 };
 return {xml,S};
}
const MIN_STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

/** Простой лист из списка строк: [{cells:[{v,s,f}], h}] */
function sheetXml(rows,opt){
 opt=opt||{};
 const cols=(opt.widths||[]).map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('');
 const body=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.cells.map((c,j)=>c==null?'':cellXml(colS(j)+(i+1),c.s,c.v,c.f,c.cached)).join('')+'</row>').join('');
 const pane=opt.freeze?'<sheetViews><sheetView workbookViewId="0"><pane ySplit="'+opt.freeze+'" topLeftCell="A'+(opt.freeze+1)+'" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>':'';
 const af=opt.filter?'<autoFilter ref="'+opt.filter+'"/>':'';
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+pane+(cols?'<cols>'+cols+'</cols>':'')+'<sheetData>'+body+'</sheetData>'+af+'</worksheet>';
}

/** Лист «Изменения» из результата сравнения. */
function compareRows(cmp,S,labels){
 const rows=[];const C=(v,s)=>({v,s});
 rows.push({cells:[C('Изменения к прошлому периоду',S.title)]});
 rows.push({cells:[C((labels.now||'Новый отчёт')+' в сравнении с '+(labels.prev||'прошлым'),null)]});
 rows.push({cells:[]});
 rows.push({cells:[C('Показатель',S.head),C('Было',S.head),C('Стало',S.head),C('Разница',S.head),C('%',S.head)]});
 for(const t of cmp.tot){const d=t.now-t.old;rows.push({cells:[C(t.name,S.bold),C(t.old,S.int),C(t.now,S.int),C(d,d>0?S.upInt:d<0?S.downInt:S.int),t.old?C(d/t.old,S.pct):null]});}
 rows.push({cells:[C('Строк новых',null),null,C(cmp.cnt['новая'],S.int)]});
 rows.push({cells:[C('Строк пропало',null),null,C(cmp.cnt['пропала'],S.int)]});
 rows.push({cells:[C('Строк изменилось',null),null,C(cmp.cnt['изменилась'],S.int)]});
 rows.push({cells:[]});
 const start=rows.length+1;
 const head=[C('Что',S.head)].concat(cmp.dims.map(d=>C(d,S.head)));
 for(const m of cmp.meas)head.push(C(m+' — было',S.head),C(m+' — стало',S.head),C('Δ',S.head));
 if(!cmp.meas.length)head.push(C('Строк было',S.head),C('Строк стало',S.head));
 rows.push({cells:head});
 for(const r of cmp.rows){
  if(r.st==='без изменений')continue;
  const st=r.st==='новая'?S.up:r.st==='пропала'?S.down:null;
  const cells=[C(r.st,st)].concat(r.l.map(v=>C(v,null)));
  if(cmp.meas.length)r.now.forEach((x,t)=>{const o=r.old[t];const d=(x||0)-(o||0);cells.push(C(o,S.dec),C(x,S.dec),C(d,d>0?S.up:d<0?S.down:null));});
  else cells.push(C(r.wn||0,S.int),C(r.n||0,S.int));
  rows.push({cells});
 }
 if(rows.length===start)rows.push({cells:[C('Строки не изменились',null)]});
 const lastCol=colS(head.length-1);
 return {rows,filter:'A'+start+':'+lastCol+Math.max(start,rows.length),freeze:start,widths:[14].concat(cmp.dims.map(()=>30)).concat(Array(head.length-1-cmp.dims.length).fill(16))};
}

/** Добавляет лист в книгу (или заменяет одноимённый). */
async function putSheet(zip,name,build){
 let wb=await zip.file('xl/workbook.xml').async('string');
 let rels=await zip.file('xl/_rels/workbook.xml.rels').async('string');
 let ct=await zip.file('[Content_Types].xml').async('string');
 let styles=zip.file('xl/styles.xml')?await zip.file('xl/styles.xml').async('string'):MIN_STYLES;
 const st=addStyles(styles);if(st){styles=st.xml;zip.file('xl/styles.xml',styles);}
 const S=st?st.S:{};
 const spec=build(S);
 const xml=sheetXml(spec.rows,spec);
 const ex=new RegExp('<sheet\\b[^>]*name="'+esc(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"[^>]*r:id="([^"]+)"').exec(wb);
 if(ex){const t=new RegExp('Id="'+ex[1]+'"[^>]*Target="([^"]+)"').exec(rels)||new RegExp('Target="([^"]+)"[^>]*Id="'+ex[1]+'"').exec(rels);if(t){zip.file('xl/'+t[1].replace(/^\/?xl\//,''),xml);return;}}
 let k=1;while(zip.file('xl/worksheets/sheet'+k+'.xml'))k++;
 const path='worksheets/sheet'+k+'.xml';
 zip.file('xl/'+path,xml);
 let rid=1;while(new RegExp('Id="rId'+rid+'"').test(rels))rid++;
 rels=rels.replace('</Relationships>','<Relationship Id="rId'+rid+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="'+path+'"/></Relationships>');
 const ids=[...wb.matchAll(/sheetId="(\d+)"/g)].map(m=>+m[1]);
 wb=wb.replace('</sheets>','<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="'+esc(name)+'" sheetId="'+(Math.max(0,...ids)+1)+'" r:id="rId'+rid+'"/></sheets>');
 ct=ct.replace('</Types>','<Override PartName="/xl/'+path+'" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
 zip.file('xl/workbook.xml',wb);zip.file('xl/_rels/workbook.xml.rels',rels);zip.file('[Content_Types].xml',ct);
}

/** Пустая книга-основа (если образец не .xlsx). */
function blankBook(sheetNames){
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
 zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 zip.file('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets></sheets></workbook>');
 zip.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1000" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
 zip.file('xl/styles.xml',MIN_STYLES);
 return zip;
}
/** Лист с таблицей отчёта для образца не в .xlsx: шапка + строки + итог. */
function plainRows(rc,res,S){
 const cols=rc.cols;
 const rows=[{cells:cols.map(c=>({v:c.name,s:S.head}))}];
 const all=res.rows.concat(res.totalRow?[Object.assign({},res.totalRow,{vals:Object.assign({[cols[0].c]:'Итого'},res.totalRow.vals)})]:[]);
 let n=0;
 for(const r of all){
  if(r.kind==='data')n++;
  rows.push({cells:cols.map(c=>{
   const v=c.role==='rownum'&&r.kind==='data'?n:r.vals[c.c];
   const bold=r.kind!=='data';
   if(typeof v==='number')return {v,s:bold?S.boldInt:Number.isInteger(v)?S.int:S.dec};
   if(v instanceof DV)return {v,s:1};
   return {v,s:bold?S.bold:null};
  })});
 }
 return {rows,freeze:1,filter:'A1:'+colS(cols.length-1)+Math.max(1,rows.length),widths:cols.map(c=>Math.min(45,Math.max(10,c.name.length+2)))};
}

/** Финальная сборка книги. plan: [{rc,res}], opt: {replace, compare:{cmp,labels}|null} */
async function build(template,templateKind,plan,opt){
 opt=opt||{};
 let zip;
 if(templateKind==='xlsx'){
  zip=await JSZip.loadAsync(template);
  const tbook=R.readBook('t.xlsx',template);
  let wb=await zip.file('xl/workbook.xml').async('string');
  const rels=await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const target=id=>{const m=new RegExp('<Relationship\\b[^>]*Id="'+id+'"[^>]*>').exec(rels);const t=m&&/Target="([^"]+)"/.exec(m[0]);return t?'xl/'+t[1].replace(/^\/?xl\//,''):null;};
  const sheetPath=new Map();for(const m of wb.matchAll(/<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g))sheetPath.set(unesc(m[1]),target(m[2]));
  const geos=[];
  const bySheet=new Map();for(const x of plan){if(!bySheet.has(x.rc.sheet))bySheet.set(x.rc.sheet,[]);bySheet.get(x.rc.sheet).push(x);}
  for(const [name,list] of bySheet){
   const p=sheetPath.get(name);if(!p||!zip.file(p))continue;
   const xml=await zip.file(p).async('string');
   const sh=tbook.sheets.find(s=>s.name===name);
   const {xml:nx,geo}=patchSheet(xml,name,list,sh&&sh.formulas,opt.replace);
   zip.file(p,nx);geos.push({sheet:name,geo,path:p});
  }
  // формулы на других листах, ссылающиеся на изменённые
  for(const [name,p] of sheetPath){
   if(!p||!zip.file(p))continue;
   let xml=await zip.file(p).async('string');let ch=false;
   for(const g of geos){if(g.sheet===name)continue;
    xml=xml.replace(/<f\b([^>]*)>([\s\S]*?)<\/f>/g,(m,a,f)=>{const nf=esc(adjustFormula(unesc(f),name,g.sheet,g.geo,null));if(nf!==f)ch=true;return '<f'+a+'>'+nf+'</f>';});
   }
   if(opt.replace&&!geos.some(g=>g.sheet===name)){const nx=xml.replace(/(<is>[\s\S]*?<t\b[^>]*>)([\s\S]*?)(<\/t>)/g,(m,a,t,b)=>a+esc(opt.replace(unesc(t)))+b);if(nx!==xml){xml=nx;ch=true;}}
   if(ch)zip.file(p,xml);
  }
  // таблицы, рисунки и диаграммы листов
  for(const g of geos){
   const relp=g.path.replace(/worksheets\/(sheet[^/]+)$/,'worksheets/_rels/$1.rels');
   const rf=zip.file(relp);if(!rf)continue;
   const rx=await rf.async('string');
   for(const m of rx.matchAll(/Target="([^"]+)"/g)){
    const t=m[1].replace(/^\.\.\//,'xl/');const f=zip.file(t);if(!f)continue;
    if(/tables\/table/.test(t)){let x=await f.async('string');x=x.replace(/(<(?:table|autoFilter)\b[^>]*?\bref=")([^"]+)(")/g,(mm,a,r,b)=>a+adjustSqref(r,g.geo,false)+b);zip.file(t,x);}
    if(/drawings\/drawing/.test(t)){let x=await f.async('string');x=x.replace(/(<xdr:(?:from|to)>\s*<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>)(\d+)(<\/xdr:row>)/g,(mm,a,col,r,b)=>{const gg=pick(g.geo,+col);return a+(+r+1>gg.d1?+r+gg.delta:+r)+b;});zip.file(t,x);}
   }
  }
  for(const p of Object.keys(zip.files)){
   if(/^xl\/charts\/chart\d+\.xml$/.test(p)){let x=await zip.file(p).async('string');let ch=false;for(const g of geos)x=x.replace(/<c:f>([\s\S]*?)<\/c:f>/g,(m,f)=>{const nf=esc(adjustFormula(unesc(f),null,g.sheet,g.geo,null));if(nf!==f)ch=true;return '<c:f>'+nf+'</c:f>';});if(ch)zip.file(p,x);}
   if(/^xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/.test(p)){let x=await zip.file(p).async('string');for(const g of geos)x=x.replace(new RegExp('(<worksheetSource\\b[^>]*?ref=")([^"]+)("[^>]*?sheet="'+esc(g.sheet)+'")'),(m,a,r,b)=>a+adjustSqref(r,g.geo,false)+b);if(!/refreshOnLoad=/.test(x))x=x.replace(/<pivotCacheDefinition\b/,'<pivotCacheDefinition refreshOnLoad="1"');zip.file(p,x);}
  }
  // именованные диапазоны, пересчёт при открытии, без устаревшей цепочки вычислений
  wb=wb.replace(/(<definedName\b[^>]*>)([\s\S]*?)(<\/definedName>)/g,(m,a,f,b)=>{let x=unesc(f);for(const g of geos)x=adjustFormula(x,null,g.sheet,g.geo,null);return a+esc(x)+b;});
  if(/<calcPr\b/.test(wb))wb=wb.replace(/<calcPr\b([^>]*?)\s*fullCalcOnLoad="[^"]*"/,'<calcPr$1').replace(/<calcPr\b/,'<calcPr fullCalcOnLoad="1"');
  else{const at=wb.search(/<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/);wb=wb.slice(0,at)+'<calcPr fullCalcOnLoad="1"/>'+wb.slice(at);}
  zip.file('xl/workbook.xml',wb);
  if(zip.file('xl/calcChain.xml')){
   zip.remove('xl/calcChain.xml');
   let r2=await zip.file('xl/_rels/workbook.xml.rels').async('string');r2=r2.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/,'');zip.file('xl/_rels/workbook.xml.rels',r2);
   let ct=await zip.file('[Content_Types].xml').async('string');ct=ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/,'');zip.file('[Content_Types].xml',ct);
  }
  if(opt.replace&&zip.file('xl/sharedStrings.xml')){
   let ss=await zip.file('xl/sharedStrings.xml').async('string');
   ss=ss.replace(/(<t\b[^>]*>)([\s\S]*?)(<\/t>)/g,(m,a,t,b)=>a+esc(opt.replace(unesc(t)))+b);
   zip.file('xl/sharedStrings.xml',ss);
  }
 }else{
  zip=blankBook();
  for(const {rc,res} of plan)await putSheet(zip,rc.sheet.slice(0,31),S=>plainRows(rc,res,S));
 }
 if(opt.compare)await putSheet(zip,'Изменения',S=>compareRows(opt.compare.cmp,S,opt.compare.labels||{}));
 for(const x of opt.extraSheets||[])await putSheet(zip,x.name,x.build);
 return await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

window.ObrazecWrite={build,makeReplacer,adjustFormula,adjustSqref,sheetXml,putSheet,blankBook,compareRows};
})();
