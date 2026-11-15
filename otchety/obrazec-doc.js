/* «По образцу» для Word: находит в заполненном документе значения из таблицы-источника
   и собирает такие же документы по другим строкам (ФИО, суммы, даты, прописью, таблицы-списки). */
(function(){
'use strict';
const R=window.ObrazecRead;
const {DV,toNum,filled}=R;
const GEN=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const unesc=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,d)=>String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&amp;/g,'&');
const pad=n=>String(n).padStart(2,'0');
// нормализация той же длины: регистр, ё, кавычки, неразрывные пробелы
const nm=s=>s.toLowerCase().replace(/ё/g,'е').replace(/[«»“”„"]/g,'"').replace(/[   ]/g,' ').replace(/[‐-―]/g,'-');

/* ---------- сумма прописью ---------- */
const U=[['','один','два','три','четыре','пять','шесть','семь','восемь','девять'],['','одна','две','три','четыре','пять','шесть','семь','восемь','девять']];
const TEEN=['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
const TENS=['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
const HUND=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
const plural=(n,f)=>{n=Math.abs(n)%100;const n1=n%10;if(n>10&&n<20)return f[2];if(n1>1&&n1<5)return f[1];if(n1===1)return f[0];return f[2];};
function triad(n,fem){const w=[];w.push(HUND[Math.floor(n/100)]);const t=n%100;if(t>=10&&t<20)w.push(TEEN[t-10]);else{w.push(TENS[Math.floor(t/10)]);w.push(U[fem?1:0][t%10]);}return w.filter(Boolean);}
function words(n){
 n=Math.floor(Math.abs(n));if(!n)return 'ноль';
 const G=[[null,0],[['тысяча','тысячи','тысяч'],1],[['миллион','миллиона','миллионов'],0],[['миллиард','миллиарда','миллиардов'],0]];
 const out=[];let i=0;
 while(n>0&&i<G.length){const t=n%1000;if(t){const w=triad(t,G[i][1]);if(G[i][0])w.push(plural(t,G[i][0]));out.unshift(w.join(' '));}n=Math.floor(n/1000);i++;}
 return out.join(' ');
}
const RUB=['рубль','рубля','рублей'],KOP=['копейка','копейки','копеек'];

/* ---------- форматы значений ---------- */
function numStr(v,st){
 const neg=v<0;v=Math.abs(v);
 const dec=st.dec||0;let s=v.toFixed(dec);let [ip,fp]=s.split('.');
 if(st.th)ip=ip.replace(/\B(?=(\d{3})+(?!\d))/g,st.th);
 return (neg?'-':'')+ip+(fp?st.ds+fp:'');
}
function dateStr(d,st){
 switch(st){
  case 'dmy':return pad(d.d)+'.'+pad(d.m)+'.'+d.y;
  case 'dmy2':return pad(d.d)+'.'+pad(d.m)+'.'+String(d.y).slice(2);
  case 'q':return '«'+pad(d.d)+'» '+GEN[d.m-1]+' '+d.y;
  case 'qd':return '«'+d.d+'» '+GEN[d.m-1]+' '+d.y;
  case 'long':return pad(d.d)+' '+GEN[d.m-1]+' '+d.y;
  case 'longd':return d.d+' '+GEN[d.m-1]+' '+d.y;
  case 'iso':return d.y+'-'+pad(d.m)+'-'+pad(d.d);
 }
 return d.toString();
}
const DATE_ST=['dmy','dmy2','q','qd','long','longd','iso'];
function fioForms(s){
 const w=String(s).trim().split(/\s+/);
 if(w.length!==3||!w.every(x=>/^[А-ЯЁ][а-яё-]+$/.test(x)))return [];
 return [['short',w[0]+' '+w[1][0]+'.'+w[2][0]+'.'],['shorts',w[0]+' '+w[1][0]+'. '+w[2][0]+'.'],['ini',w[1][0]+'.'+w[2][0]+'. '+w[0]],['inis',w[1][0]+'. '+w[2][0]+'. '+w[0]]];
}
/** Варианты написания значения: [{s, fmt}] */
function variants(v){
 const out=[];
 if(v==null||v==='')return out;
 if(v instanceof DV){for(const st of DATE_ST)out.push({s:dateStr(v,st),fmt:{t:'date',st}});return out;}
 const n=typeof v==='number'?v:null;
 if(n!=null){
  if(Math.abs(n)<100&&Number.isInteger(n))return out;
  const ints=Number.isInteger(n);
  for(const th of [' ','',])for(const ds of [',','.'])for(const dec of ints?[0,2]:[2,1,0]){
   if(!ints&&dec===0)continue;
   if(dec===0&&ds==='.')continue;
   out.push({s:numStr(n,{th,ds,dec}),fmt:{t:'num',th,ds,dec}});
  }
  if(Math.abs(n)>=1)out.push({s:words(n),fmt:{t:'words'}});
  return out;
 }
 const s=String(v).trim();
 if(s.length<3)return out;
 if(/^\d+$/.test(s)&&s.length<5)return out;
 out.push({s,fmt:{t:'text'}});
 for(const [st,f] of fioForms(s))out.push({s:f,fmt:{t:'fio',st}});
 return out;
}
function render(v,fmt,orig){
 if(v==null||v==='')return '';
 switch(fmt.t){
  case 'date':{let d=v instanceof DV?v:R.parseDateStr(String(v));return d?dateStr(d,fmt.st):R.display(v);}
  case 'num':{const n=toNum(v);return n==null?R.display(v):numStr(n,fmt);}
  case 'words':{const n=toNum(v);if(n==null)return R.display(v);let s=words(n);if(fmt.cap)s=s[0].toUpperCase()+s.slice(1);
   if(fmt.rub)s+=' '+plural(Math.floor(Math.abs(n)),RUB);
   if(fmt.kop){const k=Math.round((Math.abs(n)%1)*100);s+=fmt.kopSep+pad(k)+' '+(fmt.kopShort?'коп.':plural(k,KOP));}
   return s;}
  case 'fio':{const f=fioForms(v).find(x=>x[0]===fmt.st);return f?f[1]:String(v);}
  default:{const s=R.display(v);return fmt.up?s.toUpperCase():s;}
 }
}

/* ---------- разбор document.xml ---------- */
const PARTS=/^word\/(document|header\d*|footer\d*)\.xml$/;
function paragraphs(xml){
 const out=[];const re=/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;let m;
 while((m=re.exec(xml))){
  const p={start:m.index,end:m.index+m[0].length,xml:m[0],nodes:[],text:''};
  const tr=/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;let t;
  while((t=tr.exec(m[0]))){const txt=unesc(t[1]);p.nodes.push({a:p.text.length,len:txt.length,s:t.index,e:t.index+t[0].length,txt});p.text+=txt;}
  out.push(p);
 }
 return out;
}
/** Заменяет участки текста абзаца (по позициям), сохраняя оформление первого фрагмента. */
function replaceSpans(pxml,nodes,spans){
 // spans: [{a,b,s}] по возрастанию, без пересечений
 const texts=nodes.map(n=>n.txt);
 for(const sp of spans.slice().sort((x,y)=>y.a-x.a)){
  let first=true;
  for(let i=0;i<nodes.length;i++){
   const n=nodes[i],na=n.a,nb=n.a+n.len;
   if(nb<=sp.a||na>=sp.b)continue;
   const from=Math.max(sp.a,na)-na,to=Math.min(sp.b,nb)-na;
   const t=texts[i];
   texts[i]=t.slice(0,from)+(first?sp.s:'')+t.slice(to);
   first=false;
  }
 }
 let out='',last=0;
 nodes.forEach((n,i)=>{const open=pxml.slice(n.s,n.e).match(/^<w:t(?:\s[^>]*)?>/)[0];out+=pxml.slice(last,n.s)+(open.includes('xml:space')?open:'<w:t xml:space="preserve">')+esc(texts[i])+'</w:t>';last=n.e;});
 return out+pxml.slice(last);
}
function setCellText(cxml,s){
 const ps=paragraphs(cxml);if(!ps.length)return cxml;
 const p=ps[0];
 let nx;
 if(p.nodes.length)nx=replaceSpans(p.xml,p.nodes,[{a:0,b:p.text.length,s}]);
 else nx=p.xml.replace(/<\/w:p>$/,'<w:r><w:t xml:space="preserve">'+esc(s)+'</w:t></w:r></w:p>');
 let out=cxml.slice(0,p.start)+nx+cxml.slice(p.end);
 // остальные абзацы ячейки очищаем от текста
 if(ps.length>1){const rest=paragraphs(out).slice(1);for(const q of rest.reverse())if(q.nodes.length)out=out.slice(0,q.start)+replaceSpans(q.xml,q.nodes,[{a:0,b:q.text.length,s:''}])+out.slice(q.end);}
 return out;
}
/** Таблицы верхнего уровня и их строки (с учётом вложенных таблиц). */
function scanTables(xml){
 const tabs=[];const re=/<w:tbl>|<w:tbl\s[^>]*>|<\/w:tbl>/g;let m,depth=0,start=0;
 while((m=re.exec(xml))){if(m[0][1]!=='/'){if(!depth)start=m.index;depth++;}else{depth--;if(!depth)tabs.push({start,end:m.index+m[0].length});}}
 for(const t of tabs){
  const x=xml.slice(t.start,t.end);t.rows=[];
  const rr=/<w:tr(?:\s[^>]*)?>|<\/w:tr>|<w:tbl[\s>]|<\/w:tbl>/g;let d=0,tb=0,rs=0;
  while((m=rr.exec(x))){
   if(m[0].startsWith('<w:tbl'))tb++;else if(m[0]==='</w:tbl>')tb--;
   else if(tb===1){if(m[0][1]!=='/'){if(!d)rs=m.index;d++;}else{d--;if(!d)t.rows.push({start:t.start+rs,end:t.start+m.index+m[0].length});}}
  }
  for(const r of t.rows){
   const rx=xml.slice(r.start,r.end);r.cells=[];
   const cr=/<w:tc(?:\s[^>]*)?>|<\/w:tc>/g;let cd=0,cs=0,c;
   while((c=cr.exec(rx))){if(c[0][1]!=='/'){if(!cd)cs=c.index;cd++;}else{cd--;if(!cd){const cx=rx.slice(cs,c.index+c[0].length);r.cells.push({start:r.start+cs,end:r.start+c.index+c[0].length,text:paragraphs(cx).map(p=>p.text).join(' ').trim()});}}}
  }
 }
 return tabs;
}

/* ---------- обучение ---------- */
async function readDocx(bytes){
 const zip=await JSZip.loadAsync(bytes);
 const parts={};
 for(const p of Object.keys(zip.files))if(PARTS.test(p))parts[p]=await zip.file(p).async('string');
 if(!parts['word/document.xml'])throw Error('Это не документ Word (.docx).');
 return {zip,parts};
}
function learnRecordTable(tables,docText){
 const D=nm(docText);
 let best=null;
 for(const T of tables){
  const cache=new Map();const hits=T.cols.map(()=>null);
  const found=(col,v)=>{const k=col.i+'|'+R.vkey(v);if(cache.has(k))return cache.get(k);let r=null;for(const x of variants(v)){if(x.s.length>=3&&D.includes(nm(x.s))){r=x;break;}}cache.set(k,r);return r;};
  const lim=Math.min(T.n,30000);
  for(let i=0;i<lim;i++){
   let s=0,cnt=0;
   for(const col of T.cols){if(col.virt)continue;const v=col.vals[i];if(!filled(v))continue;const f=found(col,v);if(f){const rep=col.keys.get(R.vkey(v))||1;s+=1/Math.log2(1+rep);cnt++;}}
   if(cnt>=2&&(!best||s>best.s))best={T,i,s,cnt};
  }
 }
 return best;
}
/** Находит участки в абзацах для значений записи. */
function spansFor(paras,fields){
 const res=new Map();// paraIndex → spans
 const all=[];
 for(const f of fields)for(const v of f.vars){
  const needle=nm(v.s);if(needle.length<3)continue;
  paras.forEach((p,pi)=>{
   const T=nm(p.text);let k=-1;
   while((k=T.indexOf(needle,k+1))>=0){
    // границы слова для текста и чисел
    const pre=T[k-1]||' ',post=T[k+needle.length]||' ';
    if(/[\p{L}\p{N}]/u.test(pre)||/[\p{L}\p{N}]/u.test(post)&&!(v.fmt.t==='words'))continue;
    let a=k,b=k+needle.length;const fmt=Object.assign({},v.fmt);
    if(fmt.t==='words'){
     if(p.text[k]!==p.text[k].toLowerCase())fmt.cap=true;
     const rest=p.text.slice(b);const m=/^\s*\(?\s*(рубл[а-яё]*)/i.exec(rest);
     if(m){b+=m[0].length;fmt.rub=true;const k2=/^(\s*\)?\s*,?\s*)(\d{1,2})\s*(копе[а-яё]*|коп\.?)/i.exec(p.text.slice(b));if(k2){b+=k2[0].length;fmt.kop=true;fmt.kopSep=' ';fmt.kopShort=/^коп\.?$/i.test(k2[3]);}}
     if(/[\p{L}]/u.test(post)&&!m)continue;
    }
    if(fmt.t==='text'&&p.text.slice(a,b)===p.text.slice(a,b).toUpperCase()&&p.text.slice(a,b)!==String(v.s))fmt.up=true;
    all.push({pi,a,b,f:f.col,fmt,len:b-a,orig:p.text.slice(a,b)});
   }
  });
 }
 all.sort((x,y)=>y.len-x.len);
 for(const s of all){const l=res.get(s.pi)||[];if(l.some(o=>s.a<o.b&&o.a<s.b))continue;l.push(s);res.set(s.pi,l);}
 return res;
}
const DATE_RE=/«\s*(\d{1,2})\s*»\s*(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})|(?<!\d)(\d{2})\.(\d{2})\.(\d{4})(?!\d)/g;

async function learn(sample,tables){
 const {zip,parts}=await readDocx(sample.bytes);
 const docXml=parts['word/document.xml'];
 const allParas={};let docText='';
 for(const p in parts){allParas[p]=paragraphs(parts[p]);docText+=allParas[p].map(x=>x.text).join('\n')+'\n';}
 const best=learnRecordTable(tables,docText);
 if(!best)throw Error('Не нашёл в документе значений из загруженных таблиц. Нужна таблица, в которой есть строка с данными этого документа.');
 const T=best.T,row=best.i;
 // таблицы-списки в документе
 const tabs=scanTables(docXml);
 const idx=new Map();// значение ячейки → строки T
 const lists=[];
 if(tabs.length){
  for(const col of T.cols){if(col.virt)continue;for(let i=0;i<T.n;i++){const v=col.vals[i];if(!filled(v))continue;for(const x of variants(v).slice(0,8)){const k=nm(x.s).trim();if(k.length<3)continue;let a=idx.get(k);if(!a)idx.set(k,a=[]);if(a.length<400)a.push([i,col.i,x.fmt]);}}}
  tabs.forEach((tb,ti)=>{
   const matched=[];
   tb.rows.forEach((r,ri)=>{
    const votes=new Map();
    r.cells.forEach((c,ci)=>{const k=nm(c.text).trim();const hit=idx.get(k);if(!hit)return;const seen=new Set();for(const [i,col,fmt] of hit){if(seen.has(i+'|'+ci))continue;seen.add(i+'|'+ci);let e=votes.get(i);if(!e)votes.set(i,e={n:0,cells:{}});if(!e.cells[ci]){e.cells[ci]={col,fmt};e.n++;}}});
    let b=null;for(const [i,e] of votes)if(e.n>=2&&(!b||e.n>b.e.n))b={i,e};
    if(b)matched.push({ri,src:b.i,cells:b.e.cells});
   });
   if(!matched.length)return;
   // строки подряд
   const first=matched[0].ri;const run=matched.filter((m,k)=>m.ri===first+k);
   const tpl=run[0];
   // колонки шаблонной строки: самое частое сопоставление
   const cellMap={};
   for(const ci of Object.keys(tpl.cells)){const cnt=new Map();for(const m of run){const c=m.cells[ci];if(!c)continue;const k=c.col+'|'+JSON.stringify(c.fmt);cnt.set(k,(cnt.get(k)||0)+1);}let bk=null;for(const [k,c] of cnt)if(!bk||c>bk[1])bk=[k,c];const [col,fmt]=[+bk[0].split('|')[0],JSON.parse(bk[0].slice(bk[0].indexOf('|')+1))];cellMap[ci]={src:T.cols[col].name,fmt};}
   // № п/п
   const rr=tb.rows[first];rr.cells.forEach((c,ci)=>{if(!cellMap[ci]&&/^\d{1,3}\.?$/.test(c.text)&&run.every((m,k)=>(tb.rows[m.ri].cells[ci]||{}).text.replace('.','')===String(k+1)))cellMap[ci]={num:true,dot:/\.$/.test(c.text)};});
   // строка итога после списка
   let total=null;const after=tb.rows[first+run.length];
   if(after&&/итог|всего/i.test(after.cells.map(c=>c.text).join(' '))){
    total={cells:{}};
    after.cells.forEach((c,ci)=>{const map=cellMap[ci];if(!map||!map.src)return;const col=T.cols.find(x=>x.name===map.src);if(!col||col.type!=='number')return;let s=0;for(const m of run)s+=toNum(col.vals[m.src])||0;const v=variants(s).find(x=>nm(x.s)===nm(c.text).trim());if(v)total.cells[ci]={src:map.src,fmt:v.fmt};});
    if(!Object.keys(total.cells).length)total=null;
   }
   // ключ группы: колонка, значение которой одинаково у всех строк списка и есть в тексте
   const srcRows=run.map(m=>m.src);
   let key=null;
   const D=nm(docText);
   for(const col of T.cols){if(col.virt||col.type==='empty')continue;const k0=R.vkey(col.vals[srcRows[0]]);if(!k0)continue;if(!srcRows.every(i=>R.vkey(col.vals[i])===k0))continue;if(Object.values(cellMap).some(c=>c.src===col.name))continue;
    const rep=col.keys.get(k0)||1;const inText=variants(col.vals[srcRows[0]]).some(x=>D.includes(nm(x.s)));
    const sc=(inText?2:0)+(rep>=run.length?1:0)-(rep>T.n*0.5?3:0)+(rep===run.length?0.5:0)+(col.type==='text'?1:0)-(col.type==='date'?1.5:0)+(/покупат|клиент|контрагент|получат|заказчик|владел/i.test(col.name)?0.5:0);
    if(!key||sc>key.sc)key={src:col.name,sc};}
   lists.push({table:ti,firstRow:first,count:run.length,cellMap,total,key:key&&key.sc>=1?key.src:null,srcRows});
  });
 }
 // поля текста — из строки-записи
 const list=lists.sort((a,b)=>b.count-a.count)[0]||null;
 const fields=[];
 if(list&&list.srcRows.length>1)for(const col of T.cols){if(col.virt||col.type!=='number')continue;let x=0;for(const i of list.srcRows)x+=toNum(col.vals[i])||0;const vs=variants(x);if(vs.length)fields.push({col:'Σ:'+col.name,vars:vs,value:x});}
 for(const col of T.cols){if(col.virt)continue;const v=col.vals[row];const vs=variants(v);if(vs.length)fields.push({col:col.name,vars:vs,value:v});}
 // абзацы внутри строк-списка не трогаем полями текста
 const listRange=list?(()=>{const tb=tabs[list.table];return {start:tb.rows[list.firstRow].start,end:tb.rows[list.firstRow+list.count-1].end,totalRow:list.total?tb.rows[list.firstRow+list.count]:null};})():null;
 const spans={};
 for(const p in parts){
  const paras=allParas[p];
  const res=spansFor(paras,fields);
  const out=[];
  for(const [pi,l] of res){const para=paras[pi];if(p==='word/document.xml'&&listRange&&para.start>=listRange.start&&para.end<=(listRange.totalRow?listRange.totalRow.end:listRange.end))continue;for(const s of l)out.push({pi,a:s.a,b:s.b,f:s.f,fmt:s.fmt,orig:s.orig});}
  // даты документа, не взятые из данных
  paras.forEach((para,pi)=>{if(p==='word/document.xml'&&listRange&&para.start>=listRange.start&&para.end<=listRange.end)return;
   let m;DATE_RE.lastIndex=0;while((m=DATE_RE.exec(para.text))){const a=m.index,b=a+m[0].length;if(out.some(s=>s.pi===pi&&s.a<b&&a<s.b))continue;out.push({pi,a,b,f:'__date',fmt:{t:'date',st:m[1]?(m[1].length===2?'q':'qd'):'dmy'},orig:m[0]});}});
  if(out.length)spans[p]=out.sort((x,y)=>x.pi-y.pi||x.a-y.a);
 }
 const used=new Set();for(const p in spans)for(const s of spans[p])used.add(s.f);
 if(list)for(const c of Object.values(list.cellMap))if(c.src)used.add(c.src);
 const nm0=sample.name.replace(/\.docx$/i,'');
 const keyCol=list&&list.key||pickKey(T,row,used);
 return {
  kind:'doc',id:'d'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
  name:nm0.replace(/_/g,' '),templateName:sample.name,templateKind:'docx',
  main:{label:T.label,file:T.file,sheet:T.sheet,headers:T.cols.filter(c=>!c.virt).map(c=>c.name),nums:T.cols.filter(c=>c.type==='number'&&!c.virt).map(c=>c.name)},
  spans,list:list?{table:list.table,firstRow:list.firstRow,count:list.count,cellMap:list.cellMap,total:list.total,key:list.key}:null,
  group:list?list.key:null,key:keyCol,
  sample:{row:snapshotRow(T,row),fields:[...used].filter(f=>f!=='__date'&&!f.startsWith('Σ:'))},
  fileFields:fileFields(nm0,T,row),
  done:[],created:Date.now()
 };
}
function pickKey(T,row,used){
 let b=null;for(const col of T.cols){if(col.virt||!used.has(col.name))continue;const k=R.vkey(col.vals[row]);const rep=col.keys.get(k)||1;const sc=(col.type==='text'?1:0)-rep/T.n;if(rep<=2&&(!b||sc>b.sc))b={src:col.name,sc};}
 return b?b.src:null;
}
function snapshotRow(T,i){const o={};for(const c of T.cols)if(!c.virt)o[c.name]=R.display(c.vals[i]);return o;}
function fileFields(name,T,row){const out=[];const N=nm(name);for(const col of T.cols){if(col.virt)continue;for(const v of variants(col.vals[row])){const k=nm(v.s);if(k.length>=3&&N.includes(k)){out.push({src:col.name,fmt:v.fmt,s:v.s});break;}}}return out;}

/* ---------- записи для генерации ---------- */
function records(rc,tables){
 const T=window.ObrazecLearn.resolveTable(rc.main,tables);
 if(!T)throw Error('Не нашёл таблицу как «'+rc.main.label+'» среди загруженных файлов.');
 const col=n=>window.ObrazecLearn.colByName(T,n);
 const out=[];
 if(rc.group){
  const g=col(rc.group);if(!g)throw Error('Нет колонки «'+rc.group+'».');
  const k=g.vals.map(R.vkey);const map=new Map();
  for(let i=0;i<T.n;i++){if(!k[i])continue;if(!map.has(k[i]))map.set(k[i],[]);map.get(k[i]).push(i);}
  for(const [key,rows] of map)out.push({key,rows,label:R.display(g.vals[rows[0]])});
 }else{
  const kc=rc.key?col(rc.key):null;
  for(let i=0;i<T.n;i++){const lab=kc?R.display(kc.vals[i]):'Строка '+(i+1);if(kc&&!filled(kc.vals[i]))continue;out.push({key:kc?R.vkey(kc.vals[i])+'#'+i:'#'+i,rows:[i],label:lab});}
 }
 // подпись: ключ + первые поля
 const extra=rc.sample.fields.filter(f=>f!==rc.group&&f!==rc.key).slice(0,2).map(col).filter(Boolean);
 for(const r of out)r.hint=extra.map(c=>R.display(c.vals[r.rows[0]])).filter(Boolean).join(' · ');
 return {T,list:out};
}

/* ---------- генерация ---------- */
function fillPart(xml,spans,get){
 const paras=paragraphs(xml);
 const byP=new Map();for(const s of spans||[]){if(!byP.has(s.pi))byP.set(s.pi,[]);byP.get(s.pi).push(s);}
 let out='',last=0;
 paras.forEach((p,pi)=>{const l=byP.get(pi);if(!l)return;const nx=replaceSpans(p.xml,p.nodes,l.map(s=>({a:s.a,b:s.b,s:get(s)})));out+=xml.slice(last,p.start)+nx;last=p.end;});
 return out+xml.slice(last);
}
function buildList(xml,rc,T,rows){
 const L=rc.list;if(!L)return xml;
 const tabs=scanTables(xml);const tb=tabs[L.table];if(!tb)return xml;
 const tr=tb.rows[L.firstRow],lastR=tb.rows[L.firstRow+L.count-1];
 const tplXml=xml.slice(tr.start,tr.end);
 const col=n=>window.ObrazecLearn.colByName(T,n);
 const tplCells=tr.cells.map(c=>({s:c.start-tr.start,e:c.end-tr.start}));
 const mk=(fill)=>{let x=tplXml;for(let ci=tplCells.length-1;ci>=0;ci--){const v=fill(ci);if(v==null)continue;const c=tplCells[ci];x=x.slice(0,c.s)+setCellText(x.slice(c.s,c.e),v)+x.slice(c.e);}return x;};
 const rowsXml=rows.map((i,k)=>mk(ci=>{const m=L.cellMap[ci];if(!m)return null;if(m.num)return (k+1)+(m.dot?'.':'');const c=col(m.src);return c?render(c.vals[i],m.fmt):'';})).join('');
 let out=xml.slice(0,tr.start)+rowsXml+xml.slice(lastR.end);
 if(L.total){
  const tabs2=scanTables(out);const tb2=tabs2[L.table];const trow=tb2&&tb2.rows[L.firstRow+rows.length];
  if(trow){let x=out.slice(trow.start,trow.end);for(let ci=trow.cells.length-1;ci>=0;ci--){const m=L.total.cells[ci];if(!m)continue;const c=col(m.src);let s=0;for(const i of rows)s+=toNum(c&&c.vals[i])||0;const cell=trow.cells[ci];x=x.slice(0,cell.start-trow.start)+setCellText(x.slice(cell.start-trow.start,cell.end-trow.start),render(s,m.fmt))+x.slice(cell.end-trow.start);}out=out.slice(0,trow.start)+x+out.slice(trow.end);}
 }
 return out;
}
/** Один документ по записи. opt.date — DV для дат документа (null — как в образце). */
async function makeDoc(rc,template,T,rec,opt){
 const zip=await JSZip.loadAsync(template);
 const col=n=>window.ObrazecLearn.colByName(T,n);
 const i0=rec.rows[0];
 const get=s=>{
  if(s.f==='__date')return opt.date?render(opt.date,s.fmt):s.orig;
  if(rc.off&&rc.off.includes(s.f))return s.orig;
  if(s.f.startsWith('Σ:')){const c=col(s.f.slice(2));if(!c)return s.orig;let x=0;for(const i of rec.rows)x+=toNum(c.vals[i])||0;return render(x,s.fmt,s.orig);}
  const c=col(s.f);if(!c)return s.orig;
  // суммы по всей группе для числовых полей, если документ на группу
  let v=c.vals[i0];
  if(rc.group&&rec.rows.length>1&&c.type==='number'&&rc.sumFields&&rc.sumFields.includes(s.f)){let x=0;for(const i of rec.rows)x+=toNum(c.vals[i])||0;v=x;}
  return render(v,s.fmt,s.orig);
 };
 for(const p in rc.spans){
  let xml=await zip.file(p).async('string');
  xml=fillPart(xml,rc.spans[p],get);
  if(p==='word/document.xml')xml=buildList(xml,rc,T,rec.rows);
  zip.file(p,xml);
 }
 if(!rc.spans['word/document.xml']&&rc.list){let xml=await zip.file('word/document.xml').async('string');zip.file('word/document.xml',buildList(xml,rc,T,rec.rows));}
 return await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
function fileName(rc,T,rec,used){
 let n=rc.templateName.replace(/\.docx$/i,'');
 const col=x=>window.ObrazecLearn.colByName(T,x);
 let changed=false;
 for(const f of rc.fileFields||[]){const c=col(f.src);if(!c)continue;const v=render(c.vals[rec.rows[0]],f.fmt);if(v&&n.includes(f.s)){n=n.split(f.s).join(v);changed=true;}}
 if(!changed)n+=' — '+rec.label;
 n=n.replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
 let x=n,k=2;while(used.has(x.toLowerCase()))x=n+' ('+(k++)+')';used.add(x.toLowerCase());
 return x+'.docx';
}
/** Склейка документов в один для печати (каждый с новой страницы). */
async function merge(template,docs){
 const zip=await JSZip.loadAsync(template);
 let base=await zip.file('word/document.xml').async('string');
 const bodies=[];
 for(const d of docs){const z=await JSZip.loadAsync(d);const x=await z.file('word/document.xml').async('string');const m=/<w:body>([\s\S]*)<\/w:body>/.exec(x);let b=m?m[1]:'';b=b.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*$/,'');bodies.push(b);}
 const sect=(/<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*<\/w:body>/.exec(base)||[''])[0].replace(/<\/w:body>$/,'');
 const brk='<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
 base=base.replace(/<w:body>[\s\S]*<\/w:body>/,'<w:body>'+bodies.join(brk)+sect+'</w:body>');
 zip.file('word/document.xml',base);
 return await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

window.ObrazecDoc={learn,records,makeDoc,fileName,merge,words,render,variants,paragraphs,scanTables};
})();
