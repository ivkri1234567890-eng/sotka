/* Excel parts outside the selected rating sheet are preserved as-is. */
const Zip = typeof require === 'function' ? require('jszip') : JSZip;
const XML = typeof require === 'function' ? require('xml-js') : window;
const months = 'январь февраль март апрель май июнь июль август сентябрь октябрь ноябрь декабрь'.split(' ');
const cumulative = ['', 'один','два','три','четыре','пять','шесть','семь','восемь','девять','десять','одиннадцать','двенадцать'];
const norm = x => String(x??'').normalize('NFKC').toLowerCase().replaceAll('ё','е').replace(/[–—−]/g,'-').replace(/\s+/g,' ').trim();
const children = (e,n) => (e?.elements||[]).filter(x=>x.type==='element'&&(!n||x.name.split(':').pop()===n));
const child = (e,n) => children(e,n)[0];
const content = e => (e?.elements||[]).map(x=>x.type==='text'?x.text:content(x)).join('');
const elem = (name,attributes={},elements=[]) => ({type:'element',name,attributes,elements});
const tx = s => ({type:'text',text:String(s)});
const number = x => /^-?\d+(?:[.,]\d+)?$/.test(String(x).trim()) ? Number(String(x).replace(',','.')) : NaN;
function col(s) { return [...s.match(/^[A-Z]+/)[0]].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0); }
function letters(n) { let s=''; for(;n;n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; }
function group(s) {
 const k=norm(s).replace(/\s/g,'');
 if (/^(?:(?:22ldt|23mdt)?валдай(?:next\/валдай)?|[вvb])?(?:8|12)$/.test(k)) return 1;
 if (/^(?:(?:(?:24|26|27)hdt)?валдай|[вvb])?(?:18|45)(?:про|pro)?(?:шасси|тягач)?$/.test(k)) return 0;
 return -1;
}
async function workbook(data) {
 const zip=await Zip.loadAsync(data);
 async function parse(p) {
  const f=zip.file(p); if(!f) throw Error('В книге отсутствует '+p);
  return XML.xml2js(await f.async('string'));
 }
 const wb=await parse('xl/workbook.xml');
 const root=children(wb)[0];
 const rs=children(children(await parse('xl/_rels/workbook.xml.rels'))[0],'Relationship');
 const targets=new Map(rs.map(e=>[e.attributes.Id,e.attributes.Target]));
 const ss=zip.file('xl/sharedStrings.xml')?children(children(await parse('xl/sharedStrings.xml'))[0],'si').map(content):[];
 const sheets=children(child(root,'sheets'),'sheet').map(e=>{
  const t=targets.get(e.attributes['r:id']);
  return {name:e.attributes.name,path:t?.startsWith('/')?t.slice(1):'xl/'+t};
 });
 async function sheet(meta) {
  const doc=await parse(meta.path), root=children(doc)[0], data=child(root,'sheetData');
  const rows=children(data,'row').map(e=>{
   const cells=new Map(children(e,'c').map(c=>[col(c.attributes.r),c]));
   function get(n) {
    const c=cells.get(n); if (!c) return '';
    const type=c.attributes.t, v=content(child(c,'v'));
    if(type==='s')return ss[Number(v)]??'';
    if(type==='inlineStr')return content(child(c,'is'));
    return v;
   }
   return {n:Number(e.attributes.r),e,cells,get};
  });
  return {doc,root,data,rows,...meta};
 }
 return {zip,root,wb,sheets,sheet};
}
const isDir = s => norm(s).startsWith('направление');
function headings(row, kind) {
 const h={};
 for (const k of row.cells.keys()) {
  const v=norm(row.get(k));
  if(isDir(v))h.dir=k;
  if(kind==='forecast'&&v==='менеджер'||kind==='actual'&&v.includes('менеджер по сделке'))h.name=k;
  if(v==='модель'||v.startsWith('подробный по дивизионам'))h.model=k;
  if(/^(кол-во|количество)(,?\s*шт\.?)?$/.test(v))h.qty=k;
  if(v==='месяц'||v.includes('дата документа'))h.period=k;
  if(v==='вин'||v==='vin')h.vin=k;
 }
 return ['dir','name','model','qty','period'].every(k=>h[k])?h:null;
}
function inMonth(x,month,year) {
 const s=norm(x);
 if(months.includes(s))return s===months[month-1];
 const m=s.match(/^(\d\d?)\.(\d\d?)\.(\d{4})(?: |$)/);
 if(m)return +m[2]===month&&+m[3]===year;
 const iso=s.match(/^(\d{4})-(\d\d)-\d\d/);
 if(iso)return +iso[2]===month&&+iso[1]===year;
 if(/^\d{5}(\.\d+)?$/.test(s)){
  const d=new Date(Date.UTC(1899,11,30)+Number(s)*86400000);
  return d.getUTCMonth()+1===month&&d.getUTCFullYear()===year;
 }
 return null;
}
async function scan(w,kind,month,year,resolve) {
 const options=[];
 for(const meta of w.sheets){
  const s=await w.sheet(meta);
  for(const r of s.rows.slice(0,35)){
   const h=headings(r,kind);
   if(h){options.push({s,h,r,score:s.rows.length-r.n});break;}
  }
 }
 options.sort((a,b)=>b.score-a.score);
 if(!options.length)throw Error('Не найдена таблица '+(kind==='actual'?'факта':'прогноза')+' с менеджером, моделью, количеством и периодом.');
 if(options.length>1&&options[0].score===options[1].score)throw Error('В исходнике несколько одинаково подходящих листов. Оставьте один лист с основной выгрузкой.');
 const {s,h,r}=options[0], totals=new Map(), notes=new Map(), seen=new Set();
 let found=0, quantity=0, excluded=0;
 for(const row of s.rows.filter(x=>x.n>r.n)){
  const dir=norm(row.get(h.dir)).replace(/\s/g,'');
  if(dir!==(kind==='actual'?'га-тп':'тп'))continue;
  const period=inMonth(row.get(h.period),month,year);
  if(period===false)continue;
  if(period===null)throw Error(s.name+'!'+row.n+': не распознан период.');
  const qty=number(row.get(h.qty)), g=group(row.get(h.model));
  if(!Number.isSafeInteger(qty)||qty<0)throw Error(s.name+'!'+row.n+': проверьте количество.');
  if(g<0)throw Error(s.name+'!'+row.n+': неизвестная модель «'+row.get(h.model)+'».');
  if(h.vin){
   const vin=norm(row.get(h.vin));
   if(!vin)throw Error(s.name+'!'+row.n+': отсутствует VIN.');
   if(seen.has(vin))throw Error(s.name+'!'+row.n+': повтор VIN '+vin+'.');
   seen.add(vin);
  }
  const name=resolve(row.get(h.name));
  if(!name){
   const label=row.get(h.name)||'Менеджер не указан';
   excluded+=qty;notes.set(label,(notes.get(label)||0)+qty);found++;continue;
  }
  const v=totals.get(name)||[0,0];v[g]+=qty;totals.set(name,v);
  found++;quantity+=qty;
 }
 return {found,quantity,excluded,totals,notes,sheet:s.name};
}
function setCell(row,c,value,style,formula){
 const old=row.cells.get(c);
 const name=old?.name||children(row.e,'c')[0]?.name||'c', p=name.includes(':')?name.split(':')[0]+':':'';
 const a={r:letters(c)+row.n};
 const st=style??old?.attributes?.s; if(st!==undefined)a.s=st;
 const n=elem(name,a);
 if(formula)n.elements.push(elem(p+'f',{},[tx(formula)]));
 if(typeof value==='number')n.elements.push(elem(p+'v',{},[tx(value)]));
 else if(typeof value==='string'&&value!==''){a.t='inlineStr';n.elements.push(elem(p+'is',{},[elem(p+'t',{},[tx(value)])]));}
 row.cells.set(c,n);
}
function commit(row){
 const others=(row.e.elements||[]).filter(x=>x.type==='element'&&x.name.split(':').pop()!=='c');
 row.e.elements=[...[...row.cells.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v),...others];
 delete row.e.attributes.spans;
}
async function build(files,month,year,allowExcluded=false,allowEmpty=false) {
 if(!Number.isInteger(month)||month<1||month>12||!Number.isInteger(year)||year<2000||year>2100)throw Error('Укажите месяц и год.');
 const [t,f,a]=await Promise.all(files.map(workbook));
 let s,h2,h3,names=[];
 for(const meta of t.sheets){
  const sh=await t.sheet(meta);
  const h=sh.rows.find(r=>norm(r.get(3))==='фио');
  if(h){s=sh;h2=h;h3=sh.rows.find(r=>r.n===h.n+1);break;}
 }
 if(!s||!h3)throw Error('Не найден лист рейтинга с колонкой «ФИО» в C.');
 const header=s.rows.find(r=>/рейтинг/.test(norm(r.get(3))))?.get(3)||'';
 if(!String(header).includes(String(year)))throw Error('Год в заголовке шаблона рейтинга должен совпадать с выбранным годом.');
 const total=s.rows.find(r=>r.n>h3.n&&norm(r.get(3))==='итого');
 if(!total)throw Error('В столбце C нет строки «Итого».');
 names=s.rows.filter(r=>r.n>h3.n&&r.n<total.n&&norm(r.get(3)));
 if(!names.length)throw Error('В шаблоне нет сотрудников.');
 const full=new Map(), surnames=new Map(), pairs=new Map();
 for(const r of names){
  const n=norm(r.get(3)), parts=n.split(' ');
  if(full.has(n))throw Error('Повтор ФИО в шаблоне: '+r.get(3));
  full.set(n,r.n);
  for(const [map,key] of [[surnames,parts[0]],[pairs,parts.slice(0,2).join(' ')]])map.set(key,map.has(key)?null:r.n);
 }
 const resolve=x=>{
  const n=norm(x), p=n.split(' ');
  return full.get(n)??(p.length===1?surnames.get(n):pairs.get(p.slice(0,2).join(' ')));
 };
 const [forecast,actual]=await Promise.all([scan(f,'forecast',month,year,resolve),scan(a,'actual',month,year,resolve)]);
 const issues=[...['Прогноз','Факт'].flatMap((n,i)=>[...(i?actual:forecast).notes].map(([who,q])=>n+' · '+who+' — '+q+' шт.'))];
 if(issues.length&&!allowExcluded)throw Error('В шаблоне рейтинга не найдены или неоднозначны сотрудники:\n'+issues.join('\n')+'\nУточните ФИО в файлах или подтвердите исключение этих строк.');
 if((!actual.found||!forecast.found)&&!allowEmpty)throw Error('В одном из исходников нет записей за выбранный месяц. Проверьте период или явно разрешите пустой факт/прогноз.');
 const block=m=>[...h2.cells.keys()].find(c=>norm(h2.get(c))==='прогноз '+months[m-1]&&norm(h2.get(c+3))==='факт '+months[m-1]&&norm(h2.get(c+6)).startsWith('отклонение')&&norm(h2.get(c+9)).startsWith('итого'));
 const all=months.map((_,i)=>block(i+1)).filter(Boolean);
 if(!all.length)throw Error('В шаблоне нет ни одного стандартного блока рейтинга из 12 столбцов.');
 let start=block(month), append=!start;
 const latest=Math.max(...all);
 if(start&&start!==latest)throw Error('Для пересчёта этого месяца загрузите шаблон, где он последний, чтобы не оставить последующие итоги устаревшими.');
 if(append){
  if(month<2||block(month-1)!==latest)throw Error('Для нового месяца нужен шаблон с предыдущим месяцем как последним блоком.');
  start=latest+12;
  if(s.rows.some(r=>r.n>=h2.n&&r.n<=total.n&&[...Array(12)].some((_,i)=>r.get(start+i))))throw Error('Справа от последнего блока уже есть данные. Освободите 12 столбцов в пределах таблицы.');
 }
 const previous=[start-3,start-2];
 if(month>1&&(!norm(h2.get(previous[0])).includes('итого')||!norm(h3.get(previous[1]))))throw Error('Перед выбранным месяцем не найден предыдущий нарастающий итог.');
 const history=new Map();
 for(const r of names){
  const values=month===1?[0,0]:previous.map(c=>{
   const cell=r.cells.get(c), val=r.get(c);
   if(val===''&&!child(cell,'f')&&cell?.attributes?.t!=='e')return 0;
   return number(val);
  });
  if(values.some(v=>!Number.isFinite(v)))throw Error('Нет числового предыдущего итога для '+r.get(3)+'. Откройте шаблон в Excel, пересчитайте и сохраните его.');
  history.set(r.n,values);
 }
 const headings2=['Прогноз '+months[month-1],'Факт '+months[month-1],'Отклонение '+months[month-1],month===12?'Итого год НИ':'Итого '+cumulative[month]+' мес. НИ'];
 const headings3=['В18+В45\n(Про)','В8+В12','Итого'];
 const sourceStyle=(r,i)=>r.cells.get((append?latest:start)+i)?.attributes.s;
 for(let i=0;i<12;i++){
  setCell(h2,start+i,i%3===0?headings2[i/3]:'',sourceStyle(h2,i));
  setCell(h3,start+i,headings3[i%3],sourceStyle(h3,i));
 }
 const totals=Array(12).fill(0), valuesByRow=[];
 for(const r of names){
  const [p0,p1]=forecast.totals.get(r.n)||[0,0], [f0,f1]=actual.totals.get(r.n)||[0,0], [y0,y1]=history.get(r.n);
  const v=[p0,p1,p0+p1,f0,f1,f0+f1,f0-p0,f1-p1,f0+f1-p0-p1,y0+f0,y1+f1,y0+y1+f0+f1];
  const c=i=>letters(start+i)+r.n, prev=i=>letters(previous[i])+r.n;
  const formula=[null,null,'SUM('+c(0)+':'+c(1)+')',null,null,'SUM('+c(3)+':'+c(4)+')',c(3)+'-'+c(0),c(4)+'-'+c(1),c(5)+'-'+c(2),month===1?c(3):'SUM('+prev(0)+','+c(3)+')',month===1?c(4):'SUM('+prev(1)+','+c(4)+')','SUM('+c(9)+':'+c(10)+')'];
  v.forEach((x,i)=>{setCell(r,start+i,x,sourceStyle(r,i),formula[i]);totals[i]+=x;});
  valuesByRow.push({name:r.get(3),plan:v[2],fact:v[5],ytd:v[11]});
 }
 totals.forEach((v,i)=>{
  const l=letters(start+i);setCell(total,start+i,v,sourceStyle(total,i),'SUM('+l+(h3.n+1)+':'+l+(total.n-1)+')');
 });
 [h2,h3,...names,total].forEach(commit);
 if(append){
  const merged=child(s.root,'mergeCells');
  if(!merged)throw Error('В шаблоне отсутствует оформление объединённых заголовков.');
  for(let i=0;i<12;i+=3)merged.elements.push(elem(child(merged,'mergeCell')?.name||'mergeCell',{ref:letters(start+i)+h2.n+':'+letters(start+i+2)+h2.n}));
  merged.attributes.count=children(merged,'mergeCell').length;
  const dim=child(s.root,'dimension');
  if(dim){
   const parts=dim.attributes.ref.split(':');
   const end=parts.at(-1);
   if(col(end)<start+11)dim.attributes.ref=parts[0]+':'+letters(start+11)+end.match(/\d+$/)[0];
  }
 }
 t.zip.file(s.path,XML.js2xml(s.doc));
 const calc=child(t.root,'calcPr');
 if(calc){calc.attributes??={};calc.attributes.fullCalcOnLoad='1'; t.zip.file('xl/workbook.xml',XML.js2xml(t.wb));}
 return {bytes:await t.zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),totals,issues,valuesByRow,forecast,actual};
}
if(typeof module==='object')module.exports={build,months};
