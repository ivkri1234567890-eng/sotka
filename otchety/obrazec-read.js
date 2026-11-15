/* «По образцу»: чтение таблиц из Excel/CSV, поиск шапки и строк данных, типы колонок. */
(function(){
'use strict';
const MON=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const SEP='\u0001';
const pad=n=>String(n).padStart(2,'0');
const EPOCH=Date.UTC(1899,11,30);

class DV{ // дата Excel (только дата, без времени)
 constructor(serial){this.s=Math.floor(serial+1e-7);const t=new Date(EPOCH+this.s*864e5);this.y=t.getUTCFullYear();this.m=t.getUTCMonth()+1;this.d=t.getUTCDate();}
 static of(y,m,d){return new DV((Date.UTC(y,m-1,d)-EPOCH)/864e5);}
 key(){return 'd:'+this.y+'-'+pad(this.m)+'-'+pad(this.d);}
 ym(){return this.y*12+this.m-1;}
 toString(){return pad(this.d)+'.'+pad(this.m)+'.'+this.y;}
}
const ymLabel=ym=>MON[ym%12]+' '+Math.floor(ym/12);
const ymOf=(y,m)=>y*12+m-1;

function norm(s){return String(s==null?'':s).replace(/_x000D_/gi,' ').replace(/[ \s]+/g,' ').replace(/[«»"“”„]/g,'').replace(/ё/g,'е').replace(/Ё/g,'Е').trim().toLowerCase();}
function normH(s){return norm(s).replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function clean(s){return String(s).replace(/_x000D_/gi,'').replace(/\r/g,'').replace(/[  \t]+/g,' ').trim();}
function parseDateStr(s){
 let m=/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T].*)?$/.exec(s);
 if(m){const d=+m[1],mo=+m[2],y=+m[3];if(mo>=1&&mo<=12&&d>=1&&d<=31)return DV.of(y,mo,d);}
 m=/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s);
 if(m)return DV.of(+m[1],+m[2],+m[3]);
 return null;
}
function toNum(v){
 if(typeof v==='number')return isFinite(v)?v:null;
 if(v==null||v instanceof DV||typeof v==='boolean')return null;
 const s=String(v).replace(/[  ]/g,'');
 if(!/^-?\d+(?:[.,]\d+)?$/.test(s))return null;
 return +s.replace(',','.');
}
function vkey(v){
 if(v==null||v==='')return '';
 if(v instanceof DV)return v.key();
 if(typeof v==='number')return 'n:'+(+v.toFixed(6));
 if(typeof v==='boolean')return v?'да':'нет';
 const s=norm(v);
 if(!s)return '';
 const n=toNum(s);if(n!=null)return 'n:'+(+n.toFixed(6));
 const d=parseDateStr(s);if(d)return d.key();
 return s;
}
function display(v){if(v==null)return '';if(v instanceof DV)return v.toString();if(typeof v==='number')return String(+v.toFixed(6)).replace('.',',');return String(v);}

function decodeText(bytes){
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(e){return new TextDecoder('windows-1251').decode(bytes);}
}
function cellValue(c){
 if(!c)return null;
 switch(c.t){
  case 'n':return c.z&&XLSX.SSF.is_date(c.z)?new DV(c.v):c.v;
  case 's':case 'str':{const s=clean(c.v);return s===''?null:s;}
  case 'b':return c.v;
  case 'd':return c.v instanceof Date?DV.of(c.v.getFullYear(),c.v.getMonth()+1,c.v.getDate()):null;
  default:return null;
 }
}
/** Читает книгу: {name, kind, bytes, sheets:[{name, grid, formulas, merges}]} */
function readBook(name,buffer){
 const bytes=new Uint8Array(buffer);
 const zip=bytes[0]===0x50&&bytes[1]===0x4b;
 const isXls=bytes[0]===0xd0&&bytes[1]===0xcf;
 let wb;
 if(zip||isXls)wb=XLSX.read(bytes,{type:'array',cellFormula:true,cellNF:true,cellDates:false,cellStyles:false,sheetStubs:true});
 else{
  let text=decodeText(bytes);if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
  const first=text.slice(0,2000).split(/\r?\n/)[0]||'';
  const FS=[';','\t',','].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  wb=XLSX.read(text,{type:'string',FS,raw:true});
 }
 const sheets=wb.SheetNames.map(sn=>{
  const ws=wb.Sheets[sn];const grid=[],formulas=[];
  for(const k in ws){
   if(k[0]==='!')continue;
   const a=XLSX.utils.decode_cell(k),c=ws[k];
   const v=cellValue(c);
   if(v!=null)(grid[a.r]||(grid[a.r]=[]))[a.c]=v;
   if(c.f)(formulas[a.r]||(formulas[a.r]=[]))[a.c]=c.f;
  }
  if(!zip&&!isXls)for(const row of grid)if(row)for(let i=0;i<row.length;i++){const s=row[i];if(typeof s==='string'){const d=parseDateStr(s);if(d)row[i]=d;else{const n=toNum(s);if(n!=null&&!/^0\d/.test(s.trim()))row[i]=n;}}}
  return {name:sn,grid,formulas,merges:ws['!merges']||[],hidden:false};
 });
 return {name,kind:zip?'xlsx':isXls?'xls':'csv',bytes,sheets};
}

const TOTAL_GRAND=/^(общий итог|итого|всего|итог|grand total|total)(\s|:|$)/i;
const TOTAL_ANY=/^(общий итог|итого|всего|итог|grand total|total)(\s|:|$)|\s(итог|итого|total)\s*$/i;
const isText=v=>typeof v==='string'&&toNum(v)==null&&!parseDateStr(v);
const filled=v=>v!=null&&v!=='';

/** Ищет таблицу на листе: строку шапки, колонки и строки данных. */
function detectTables(sheet){
 const g=sheet.grid;const nRows=g.length;
 if(!nRows)return [];
 let best=null;
 const lim=Math.min(nRows,60);
 for(let r=0;r<lim;r++){
  const row=g[r];if(!row)continue;
  let t=0,c=0,minC=1e9,maxC=-1;
  for(let i=0;i<row.length;i++)if(filled(row[i])){c++;if(isText(row[i]))t++;minC=Math.min(minC,i);maxC=Math.max(maxC,i);}
  if(t<2||t<0.6*c)continue;
  let dens=0,k=0;
  for(let j=r+1;j<=Math.min(nRows-1,r+8);j++){
   const d=g[j];k++;if(!d)continue;let f=0;for(let i=minC;i<=maxC;i++)if(filled(d[i]))f++;dens+=f/Math.max(1,t);
  }
  if(!k)continue;
  dens/=k;
  if(dens<0.25)continue;
  // текстовые строки над шапкой могут быть второй строкой шапки — смотрим и на неё
  const score=t*Math.min(1,dens)+(dens>0.5?1:0);
  if(!best||score>best.score+0.5)best={r,score,minC,maxC};
 }
 if(!best)return [];
 const hr=best.r;
 let minC=best.minC,maxC=best.maxC;
 for(let j=hr+1;j<Math.min(nRows,hr+50);j++){const d=g[j];if(!d)continue;for(let i=0;i<d.length;i++)if(filled(d[i])){if(i<minC&&i>=minC-2)minC=i;if(i>maxC&&i<=maxC+2)maxC=i;}}
 // рядом стоящие таблицы разделены пустыми колонками
 const used=[];
 for(let c=minC;c<=maxC;c++){
  if(filled((g[hr]||[])[c])){used[c]=true;continue;}
  let f=0,k=0;for(let j=hr+1;j<Math.min(nRows,hr+31);j++){k++;if(filled((g[j]||[])[c]))f++;}
  used[c]=k&&f/k>=0.3;
 }
 const blocks=[];let c0=null;
 for(let c=minC;c<=maxC+1;c++){
  if(c<=maxC&&used[c]){if(c0==null)c0=c;continue;}
  if(c0!=null){if(c-c0>=2)blocks.push([c0,c-1]);c0=null;}
 }
 const out=[];
 for(const [x0,x1] of blocks){const t=buildBlock(sheet,hr,x0,x1);if(t)out.push(t);}
 if(out.length>1)out.forEach((t,i)=>t.block=i+1);
 return out;
}
function detectTable(sheet){
 const all=detectTables(sheet);if(!all.length)return null;
 return all.slice().sort((a,b)=>b.cols.length*b.rows.length-a.cols.length*a.rows.length)[0];
}
function buildBlock(sheet,hr,minC,maxC){
 const g=sheet.grid,nRows=g.length,H=g[hr]||[];
 const up=g[hr-1]||[];
 const cols=[];
 const used=new Map();
 for(let c=minC;c<=maxC;c++){
  let name=filled(H[c])?clean(String(H[c])):'';
  if(!name&&filled(up[c])&&isText(up[c]))name=clean(up[c]);
  if(!name)name='Колонка '+XLSX.utils.encode_col(c);
  const n=used.get(name)||0;used.set(name,n+1);if(n)name+=' ('+(n+1)+')';
  cols.push({c,name,group:filled(up[c])&&isText(up[c])&&up[c]!==H[c]?clean(up[c]):''});
 }
 // строки
 const rows=[];let empty=0;
 for(let r=hr+1;r<nRows;r++){
  const d=g[r];
  let f=0,firstText=null;
  if(d)for(const col of cols){const v=d[col.c];if(filled(v)){f++;if(firstText==null&&typeof v==='string')firstText=v;}}
  if(!f){empty++;if(empty>=2&&rows.length)break;continue;}
  if(empty&&rows.length){ // после пустой строки — продолжение только если это итог или похожая строка
   const tot=firstText&&TOTAL_ANY.test(firstText.trim());
   if(!tot&&f<Math.max(2,cols.length*0.4))break;
  }
  empty=0;
  let kind='data';
  if(d)for(let i=0;i<Math.min(cols.length,4);i++){const v=d[cols[i].c];if(typeof v==='string'&&TOTAL_ANY.test(v.trim())){kind=TOTAL_GRAND.test(v.trim())?'total':'sub';break;}}
  rows.push({r,kind});
 }
 // «итог» не в последней строке считаем промежуточным
 let lastData=-1;rows.forEach((x,i)=>{if(x.kind==='data')lastData=i;});
 rows.forEach((x,i)=>{if(x.kind==='total'&&i<lastData)x.kind='sub';});
 if(!rows.some(x=>x.kind==='data'))return null;
 // заголовок над таблицей (для подписи периода)
 const title=[];for(let r=0;r<hr;r++){const d=g[r];if(d)for(const v of d)if(typeof v==='string'&&v.trim())title.push(v);}
 return {sheet:sheet.name,headerRow:hr,cols,rows,title,c0:minC,c1:maxC};
}

/** Колонки таблицы: значения, тип, справочник значений. */
function profile(sheet,tb){
 const g=sheet.grid,data=tb.rows.filter(x=>x.kind==='data');
 const n=data.length;
 const cols=tb.cols.map((col,i)=>{
  const vals=new Array(n);let num=0,dat=0,txt=0,fil=0,fml=0;
  const keys=new Map();
  for(let j=0;j<n;j++){
   const v=(g[data[j].r]||[])[col.c];vals[j]=v==null?null:v;
   if(filled(v)){fil++;if(v instanceof DV)dat++;else if(toNum(v)!=null)num++;else txt++;
    const k=vkey(v);keys.set(k,(keys.get(k)||0)+1);}
   if(sheet.formulas[data[j].r]&&sheet.formulas[data[j].r][col.c])fml++;
  }
  const type=!fil?'empty':dat>=0.85*fil?'date':num>=0.85*fil&&!txt?'number':num>=0.85*fil?'number':'text';
  return {i,c:col.c,name:col.name,group:col.group,type,vals,keys,filled:fil,formula:fml>=Math.max(1,0.5*n)};
 });
 return {label:'',cols,n,rowsR:data.map(x=>x.r)};
}

/** Все таблицы файла как источники. */
function tablesOf(book){
 const out=[];
 for(const sh of book.sheets)for(const tb of detectTables(sh)){
  const p=profile(sh,tb);
  if(p.n<1)continue;
  p.label=(book.sheets.length>1?book.name+' — '+sh.name:book.name)+(tb.block?' (таблица '+tb.block+')':'');
  p.file=book.name;p.sheet=sh.name;p.tb=tb;
  addVirtual(p);
  out.push(p);
 }
 return out;
}
/** Виртуальные колонки: месяц и год из каждой колонки дат. */
function addVirtual(t){
 const base=t.cols.slice();
 for(const col of base){
  if(col.type!=='date')continue;
  const mv=new Array(t.n),yv=new Array(t.n),mk=new Map(),yk=new Map();
  for(let j=0;j<t.n;j++){const v=col.vals[j];if(v instanceof DV){const lab=MON[v.m-1]+' '+v.y;mv[j]=lab;yv[j]=v.y;mk.set(norm(lab),(mk.get(norm(lab))||0)+1);yk.set('n:'+v.y,(yk.get('n:'+v.y)||0)+1);}else{mv[j]=null;yv[j]=null;}}
  t.cols.push({i:t.cols.length,c:-1,name:col.name+' · месяц',type:'text',vals:mv,keys:mk,filled:col.filled,virt:{kind:'month',base:col.name}});
  t.cols.push({i:t.cols.length,c:-1,name:col.name+' · год',type:'number',vals:yv,keys:yk,filled:col.filled,virt:{kind:'year',base:col.name}});
 }
}
function monthOfLabel(s){const m=/^(\S+)\s+(\d{4})$/.exec(norm(s));if(!m)return null;const i=MON.indexOf(m[1]);return i<0?null:ymOf(+m[2],i+1);}

window.ObrazecRead={DV,MON,SEP,norm,normH,clean,toNum,vkey,display,parseDateStr,readBook,detectTable,detectTables,profile,tablesOf,addVirtual,ymLabel,ymOf,monthOfLabel,filled,isText,TOTAL_ANY};
})();
