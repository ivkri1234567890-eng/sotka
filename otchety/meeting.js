const meetingModels = [8,12,18,33,45];
const direction = s => {
 const k=norm(s);
 if (/дилер|ссс/.test(k)) return 0;
 if (/ключев|корпоратив|ккк/.test(k)) return 1;
 if (/регион|^га\s*-\s*тп$/.test(k)) return 2;
 return -1;
};
const modelNumber = s => {
 const m=norm(s).match(/^(?:валдай\s*)?(8|12|18|33|45)(?:\s*(?:про|pro))?$/);
 return m ? Number(m[1]) : 0;
};
const sum = a => a.reduce((total,value)=>total+value,0);
async function readMeeting(data,month,year) {
 const book=await workbook(data);
 const output=[];
 for(const name of ['планы','отгрузки']){
  const meta=book.sheets.find(s=>norm(s.name)===name);
  if(!meta) throw Error('В книге нужен лист «'+cap(name)+'».');
  const sheet=await book.sheet(meta);
  const header=sheet.rows.find(r=>isDir(r.get(1))&&norm(r.get(2))==='модель');
  const periods=sheet.rows.find(r=>r.n===header?.n+1);
  if(!periods)throw Error('На листе «'+meta.name+'» не найдена строка месяцев.');
  const sourceYear=sheet.rows.filter(r=>r.n<header.n).map(r=>r.get(1)).join(' ').match(/\b20\d{2}\b/);
  if(sourceYear&&+sourceYear[0]!==year)throw Error('Год на листе «'+meta.name+'» отличается от выбранного.');
  const cols=months.slice(0,month).map(m=>[...periods.cells.keys()].find(c=>norm(periods.get(c))===m));
  if(cols.some(c=>!c))throw Error('На листе «'+meta.name+'» есть пропуск в заголовках месяцев.');
  const cumulativeCol=[...periods.cells.keys()].find(c=>new RegExp('^(?:(?:итого|факт|план) +)*'+month+' *(?:мес\\.?|месяцев)$').test(norm(periods.get(c))));
  const monthly=Array.from({length:3},()=>meetingModels.map(()=>0));
  const cumulative=Array.from({length:3},()=>meetingModels.map(()=>0));
  const groupCumulative=Array.from({length:3},()=>[null,null]);
  const present=new Set(), selected=cols.at(-1);
  let d=-1, hasMonth=false;
  function read(r,c){
   const v=r.get(c).trim(), cell=r.cells.get(c);
   if(!v){
    if(child(cell,'f'))throw Error('Пересчитайте и сохраните книгу в Excel: '+meta.name+'!'+letters(c)+r.n+'.');
    return null;
   }
   if(!Number.isInteger(number(v)))throw Error('Ожидалось целое число: '+meta.name+'!'+letters(c)+r.n+'.');
   return number(v);
  }
  for(const r of sheet.rows.filter(r=>r.n>periods.n)){
   const label=norm(r.get(1)), desc=norm(r.get(2));
   if(desc==='наз'||desc==='нга'||label==='наз'||label==='нга'||isDir(label)||desc==='всего')break;
   if(label){
    d=direction(label);
    if(d<0)throw Error('Неизвестное направление на листе «'+meta.name+'»: '+r.get(1)+'.');
   }
   if(d<0||!desc)continue;
   if(cumulativeCol&&/^итого.*(?:наз|нга)$/.test(desc)){
    groupCumulative[d][desc.endsWith('нга')?1:0]=read(r,cumulativeCol);
   }
   if(/^итого/.test(desc))continue;
   const i=meetingModels.indexOf(modelNumber(desc));
   if(i<0)throw Error('Неизвестная модель на листе «'+meta.name+'»: '+r.get(2)+'.');
   const key=d+'|'+desc.replace(/валдай|\s/g,'').replace('pro','про');
   if(present.has(key))throw Error('Модель повторяется в одном направлении: '+r.get(2)+'.');
   present.add(key);
   const current=read(r,selected);
   hasMonth ||= current!==null;
   monthly[d][i]+=current??0;
   cumulative[d][i]+=sum(cols.map(c=>read(r,c)??0));
  }
  if(new Set([...present].map(k=>k.split('|')[0])).size!==3||!hasMonth)
   throw Error('На листе «'+meta.name+'» нет полного набора направлений или месяц ещё не заполнен.');
  output.push({monthly,ytd:cumulative.map((row,i)=>[
   groupCumulative[i][0]??sum(row.slice(0,2)),groupCumulative[i][1]??sum(row.slice(2))
  ])});
 }
 return output;
}

const embedding = i=>'ppt/embeddings/Microsoft_Excel_Worksheet'+(i||'')+'.xlsx';
async function updateMeeting(data,source,month,year,preview) {
 const pack=await Zip.loadAsync(data);
 const [plan,fact]=source??[];
 const grids=[];
 for(let i=0;i<3;i++){
  const path=embedding(i), original=pack.file(path);
  if(!original)throw Error('Выберите согласованный двухслайдовый шаблон к оперативному совещанию.');
  const book=await workbook(await original.async('uint8array'));
  const sheet=await book.sheet(book.sheets[0]);
  if(sheet.rows.length!==[9,26,6][i])throw Error('Структура встроенных таблиц отличается от шаблона.');
  const width=i===2?13:6;
  const values=sheet.rows.map(r=>Array.from({length:width},(_,j)=>r.get(j+1)));
  function put(r,c,v){
   const row=sheet.rows[r-1];
   let cell=row.cells.get(c);
   if(!cell){
    cell=elem('c',{r:letters(c)+r});
    row.e.elements.push(cell);
    row.cells.set(c,cell);
   }
   cell.elements=(cell.elements??[]).filter(x=>!['v','is'].includes(x.name));
   if(typeof v==='number')delete cell.attributes.t;
   else cell.attributes.t='str';
   cell.elements.push(elem('v',{},[tx(v)]));
   values[r-1][c-1]=String(v);
  }
  if(source){
   const p=plan.monthly, f=fact.monthly;
   const offsets=[2,3,5,6,7];
   if(i===0)offsets.forEach((r,j)=>{put(r,3,sum(p.map(a=>a[j])));put(r,4,sum(f.map(a=>a[j])));});
   if(i===1)p.forEach((row,d)=>offsets.forEach((r,j)=>{put(r+d*8,3,row[j]);put(r+d*8,4,f[d][j]);}));
   if(i===2)plan.ytd.forEach((row,d)=>row.forEach((v,g)=>{put(d+3,2+g*4,v);put(d+3,3+g*4,fact.ytd[d][g]);}));
   function calculate(ref,stack=new Set()){
    if(stack.has(ref))throw Error('Цикл в формулах шаблона.');
    const r=Number(ref.match(/\d+/)[0]), c=col(ref);
    const formulaNode=child(sheet.rows[r-1].cells.get(c),'f');
    const sharedTotal=i===2&&r>=3&&r<=5&&(c===10||c===11)&&formulaNode?.attributes?.t==='shared';
    const formula=sharedTotal?'SUM('+letters(c-8)+r+','+letters(c-4)+r+')':content(formulaNode);
    if(!formula)return Number(values[r-1][c-1]||0);
    const next=new Set([...stack,ref]);
    const val=k=>calculate(k,next);
    let m;
    if((m=formula.match(/^SUM\((.*)\)$/i))){
     return sum(m[1].split(',').flatMap(part=>{
      const [a,b]=part.split(':');
      if(!b)return [val(a)];
      const first=+a.match(/\d+/)[0], last=+b.match(/\d+/)[0];
      return Array.from({length:last-first+1},(_,n)=>val(letters(col(a))+(first+n)));
     }));
    }
    if((m=formula.match(/^([A-Z]+\d+)-([A-Z]+\d+)$/)))return val(m[1])-val(m[2]);
    if((m=formula.match(/^IF\(([A-Z]+\d+)=0,"[^"]*",([A-Z]+\d+)\/([A-Z]+\d+)\)$/i)))return val(m[1])===0?'—':val(m[2])/val(m[3]);
    throw Error('В шаблоне найдена неподдерживаемая формула '+formula+'.');
   }
   for(const r of sheet.rows){
    const ratios=i===2?[4,8,12]:[5];
    for(const c of ratios){
     const start=i===2?3:2;
     if(r.n<start)continue;
     const cell=r.cells.get(c);
     if(!child(cell,'f')&&i!==2) {
      put(r.n,c,'—');
      const newCell=r.cells.get(c);
      newCell.elements.unshift(elem('f',{},[tx('IF(C'+r.n+'=0,"—",D'+r.n+'/C'+r.n+')')]));
      r.e.elements.sort((a,b)=>col(a.attributes.r)-col(b.attributes.r));
     }
    }
    for(const [c,cell] of r.cells) if(child(cell,'f'))put(r.n,c,calculate(letters(c)+r.n));
   }
   book.zip.file(sheet.path,XML.js2xml(sheet.doc));
   pack.file(path,await book.zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));
  }
  grids.push(values);
 }
 const totals=[...grids[0].at(-1).slice(2,4),...grids[2].at(-1).slice(9,11)].map(Number);
 if(!source)return {totals,bytes:data};
 for(const [i,grid] of grids.entries()){
  const basename='image'+(9+i);
  pack.file('ppt/media/'+basename+'.png',await preview(grid,i));
  const parts=Object.keys(pack.files).filter(n=>n.endsWith('.rels'));
  for(const part of parts){
   const xml=await pack.file(part).async('string');
   if(xml.includes(basename+'.emf'))pack.file(part,xml.replaceAll(basename+'.emf',basename+'.png'));
  }
 }
 const monthTitle=months[month-1];
 for(const slide of [1,2]){
  const path='ppt/slides/slide'+slide+'.xml';
  let xml=await pack.file(path).async('string');
  if(slide===1)xml=xml.replace('>октябрь<','>'+monthTitle+'<').replace('> 2026 <','> '+year+' <');
  else xml=xml.replace('Исполнение плановых показателей за октябрь 2026 года','Исполнение плановых показателей за '+month+' мес. '+year+' года');
  pack.file(path,xml);
 }
 return {totals,bytes:await pack.generateAsync({type:'uint8array',compression:'DEFLATE'})};
}
