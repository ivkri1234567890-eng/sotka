/* «Дашборд продаж» (Пульс продаж): расчёт по загруженному Excel.
   Точный перенос engine.py модуля: один источник данных для экрана и PowerPoint. Без ИИ и внешних API. */
(function(){
'use strict';
const DIRECTIONS=['ККК','ТП','ССС'];
const MONTHS=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const MONTH_NAMES=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const EPOCH=Date.UTC(1899,11,30);

function norm(v){return String(v==null?'':v).replace(/_x000D_/g,' ').replace(/\s+/g,' ').trim();}
function direction(v){
 const t=norm(v).toUpperCase();
 if(t.includes('ККК')||t.includes('КЛЮЧЕВ')||t.includes('КОРПОРАТ'))return 'ККК';
 if(t.includes('ССС')||t.includes('ДИЛЕР'))return 'ССС';
 if(t.includes('ТП')||t.includes('РЕГИОН'))return 'ТП';
 return null;
}
function model(v){
 const t=norm(v);
 const c={'22':'В8','23':'В12','24':'В18','25':'В33','26':'В45','27':'В45'};
 if(c[t.slice(0,2)])return c[t.slice(0,2)];
 const m=/(?:Валдай\s*|[ВB]\s*)(45|33|18|12|8)/i.exec(t);
 if(!m)throw Error('Не распознана модель: '+t);
 return 'В'+m[1];
}
/* ---------- чтение книги: значения как в openpyxl (data_only) ---------- */
class XDate{constructor(y,m,d){this.y=y;this.m=m;this.d=d;}iso(){return this.y+'-'+String(this.m).padStart(2,'0')+'-'+String(this.d).padStart(2,'0');}}
function cellValue(c){
 if(!c)return null;
 if(c.t==='n'){
  if(c.z&&XLSX.SSF.is_date(c.z)){const t=new Date(EPOCH+Math.floor(c.v+1e-9)*864e5);return new XDate(t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate());}
  return c.v;
 }
 if(c.t==='s'||c.t==='str')return c.v===''?null:c.v;
 if(c.t==='b')return c.v;
 if(c.t==='d'&&c.v instanceof Date)return new XDate(c.v.getFullYear(),c.v.getMonth()+1,c.v.getDate());
 return null;
}
function readBook(buffer){
 const bytes=new Uint8Array(buffer);
 const isZip=bytes[0]===0x50&&bytes[1]===0x4b,isXls=bytes[0]===0xd0&&bytes[1]===0xcf;
 if(!isZip&&!isXls)throw Error('Нужен файл Excel (.xlsx или .xls).');
 const wb=XLSX.read(bytes,{type:'array',cellNF:true,cellDates:false,cellFormula:false,sheetStubs:false});
 return wb.SheetNames.map(name=>{
  const ws=wb.Sheets[name];const ref=ws['!ref'];
  if(!ref)return {name,rows:[]};
  const rg=XLSX.utils.decode_range(ref);
  // как openpyxl iter_rows(): строки с 1-й, колонки с A до последней
  const rows=[];const width=rg.e.c+1;
  for(let r=0;r<=rg.e.r;r++)rows.push(new Array(width).fill(null));
  for(const k in ws){if(k[0]==='!')continue;const a=XLSX.utils.decode_cell(k);if(a.r<rows.length&&a.c<width)rows[a.r][a.c]=cellValue(ws[k]);}
  return {name,rows};
 });
}
const isNum=v=>typeof v==='number'&&isFinite(v);
const repr=v=>v==null?'None':typeof v==='string'?"'"+v+"'":v instanceof XDate?v.iso():String(v);

/** Реализация: записи по строкам выгрузки. */
function loadActual(buffer){
 const sheets=readBook(buffer);
 const aliases={direction:'направление реализации',model:'подробный по дивизионам',date:'дата документа ппс',vin:'вин',manager:'матричные продажи - менеджер по сделке',dealer:'получатель',qty:'кол-во',amount:'сумма с ндс'};
 const need=['direction','model','date','manager','dealer','qty'];
 let chosen=null;
 for(const ws of sheets){
  for(let i=0;i<Math.min(20,ws.rows.length);i++){
   const headers=ws.rows[i].map(v=>norm(v).toLowerCase());
   const mapping={};for(const k in aliases){const j=headers.findIndex(t=>t.startsWith(aliases[k]));mapping[k]=j<0?null:j;}
   if(need.every(k=>mapping[k]!=null)){chosen={ws,header:i,m:mapping};break;}
  }
  if(chosen)break;
 }
 if(!chosen)throw Error('Не найден лист с направлениями, моделями, датой ППС, менеджером, получателем и Кол-во.');
 const {ws,header,m}=chosen;const records=[],warnings=[];
 for(let i=header+1;i<ws.rows.length;i++){
  const row=ws.rows[i];const line=i+1;
  const get=k=>m[k]!=null&&m[k]<row.length?row[m[k]]:null;
  const q=get('qty');
  if(q==null&&!['date','vin','model'].some(k=>get(k)))continue;
  if(!isNum(q))throw Error('Строка '+line+': Кол-во должно быть числом, получено '+repr(q)+'. Проверьте кэш формулы.');
  const dr=direction(get('direction'));
  if(!dr)throw Error('Строка '+line+': неизвестное направление '+repr(get('direction')));
  const dt=get('date');
  if(!(dt instanceof XDate))throw Error('Строка '+line+': отсутствует корректная дата документа ППС');
  const manager=norm(get('manager'))||'Не указан',dealer=norm(get('dealer'))||'Не указан';
  if(manager==='Не указан'||dealer==='Не указан')warnings.push('Строка '+line+': не заполнен менеджер или получатель');
  const am=get('amount');let amount=0;
  if(am){amount=isNum(am)?am:Number(String(am).replace(/\s/g,'').replace(',','.'));if(!isFinite(amount))throw Error('Строка '+line+': Сумма с НДС должна быть числом');}
  records.push({direction:dr,model:model(get('model')),date:dt.iso(),month:dt.m,year:dt.y,vin:norm(get('vin')),manager,dealer,qty:+q,amount});
 }
 if(!records.length)throw Error('В файле нет операций реализации');
 return {records,warnings};
}

/** Целевой план: лист «Планы», блоки направлений, строки моделей, месяцы. */
function loadPlan(buffer){
 const sheets=readBook(buffer);
 const ws=sheets.find(s=>s.name==='Планы')||sheets[0];
 const rows=ws.rows;let header=null,monthmap=new Map();
 for(let i=0;i<Math.min(25,rows.length);i++){
  const cand=new Map();
  rows[i].forEach((v,j)=>{const n=norm(v).toLowerCase();const mo=MONTH_NAMES.indexOf(n);if(mo>=0)cand.set(j,mo+1);});
  if(cand.size>=10){header=i;monthmap=cand;break;}
 }
 if(header==null)throw Error('В плане не найдены месяцы январь–октябрь');
 const plan=[];let dr=null;
 for(const row of rows.slice(header+1)){
  const a=norm(row.length?row[0]:'');
  if(a){const nd=direction(a);if(!nd&&dr)break;dr=nd;}
  if(!dr||row.length<2||!norm(row[1]).toLowerCase().startsWith('валдай'))continue;
  const md=model(row[1]);
  for(const [j,mo] of monthmap){
   const v=j<row.length?row[j]:null;
   if(v!=null&&!isNum(v))throw Error('План '+dr+'/'+md+'/'+mo+': ожидается число');
   plan.push({direction:dr,model:md,month:mo,qty:+(v||0)});
  }
 }
 if(!plan.length)throw Error('Не найдены планы по направлениям');
 return plan;
}

/* ---------- расчёт ---------- */
const cmpStr=(a,b)=>a<b?-1:a>b?1:0;
function grouped(data,key){
 const out=new Map();for(const r of data)out.set(r[key],(out.get(r[key])||0)+r.qty);
 return [...out.entries()].sort((a,b)=>b[1]-a[1]||cmpStr(a[0],b[0]));
}
const sum=a=>a.reduce((x,y)=>x+y,0);
/** Срез по фильтрам: {year, month_start, month_end, direction, model, manager, dealer} — пустое значение = без ограничения. */
function aggregate(records,plan,filters){
 const f=filters||{};
 const year=+(f.year||Math.max(...records.map(r=>r.year)));
 const inYear=records.filter(r=>r.year===year);
 const end=+(f.month_end||(inYear.length?Math.max(...inYear.map(r=>r.month)):NaN));
 const start=+(f.month_start||1);
 if(!(start>=1&&start<=end&&end<=12))throw Error('Некорректный период');
 const keys=['direction','model','manager','dealer'];
 const rr=records.filter(r=>r.year===year&&r.month>=start&&r.month<=end&&keys.every(k=>!f[k]||r[k]===f[k]));
 // План менеджера/дилера отсутствует: не сравниваем его продажи с планом всего направления.
 const pp=!f.manager&&!f.dealer?(plan||[]).filter(r=>r.month>=start&&r.month<=end&&['direction','model'].every(k=>!f[k]||r[k]===f[k])):[];
 const hasPlan=pp.length>0;
 const actual=sum(rr.map(r=>r.qty));const target=hasPlan?sum(pp.map(r=>r.qty)):null;
 const months=[];for(let m=start;m<=end;m++)months.push(m);
 const series=DIRECTIONS.filter(d=>!f.direction||f.direction===d).map(d=>({name:d,
  actual:months.map(m=>sum(rr.filter(r=>r.direction===d&&r.month===m).map(r=>r.qty))),
  plan:hasPlan?months.map(m=>sum(pp.filter(r=>r.direction===d&&r.month===m).map(r=>r.qty))):null}));
 const dealers=rr.filter(r=>r.direction==='ССС');
 const pairs=new Map();for(const r of dealers){const k=r.manager+'\u0001'+r.dealer;pairs.set(k,(pairs.get(k)||0)+r.qty);}
 const managers={};for(const d of DIRECTIONS)managers[d]=grouped(rr.filter(r=>r.direction===d),'manager');
 const opt={};for(const k of keys)opt[k]=[...new Set(inYear.map(r=>r[k]))].sort(cmpStr);
 const res={year,month_start:start,month_end:end,months:months.map(m=>MONTHS[m-1]),actual,plan:target,
  delta:target!=null?actual-target:null,fulfillment:target?actual/target*100:null,
  revenue:Math.round(sum(rr.map(r=>r.amount))*100)/100,
  directions:grouped(rr,'direction'),series,managers,dealers:grouped(dealers,'dealer'),
  pairs:[...pairs.entries()].map(([k,v])=>{const [m,d]=k.split('\u0001');return {manager:m,dealer:d,qty:v};}).sort((a,b)=>b.qty-a.qty||cmpStr(a.manager,b.manager)||cmpStr(a.dealer,b.dealer)),
  models:grouped(rr,'model'),options:opt,filters:Object.assign({},f),rows:rr.length};
 res.direction_plans={};if(hasPlan)for(const d of DIRECTIONS)res.direction_plans[d]=sum(pp.filter(r=>r.direction===d).map(r=>r.qty));
 res.detail=detail(rr,pp,hasPlan,plan,start,end,f);
 if(Math.abs(sum(res.directions.map(x=>x[1]))-actual)>1e-7)throw Error('Сверка направлений не сошлась');
 if(Math.abs(sum(DIRECTIONS.map(d=>sum(managers[d].map(x=>x[1]))))-actual)>1e-7)throw Error('Сверка менеджеров не сошлась');
 return res;
}
/** Разрезы для презентации: направление × модель, последний месяц, менеджеры дилеров. */
const modelNo=m=>+String(m).replace(/\D/g,'')||0;
function detail(rr,pp,hasPlan,planAll,start,end,f){
 const dirs=DIRECTIONS.filter(d=>!f.direction||f.direction===d);
 const last=end;
 const pick=(arr,o)=>sum(arr.filter(r=>Object.keys(o).every(k=>r[k]===o[k])).map(r=>r.qty));
 const models=[...new Set(rr.map(r=>r.model).concat(pp.map(r=>r.model)))].sort((a,b)=>modelNo(a)-modelNo(b));
 const shown=models.filter(m=>pick(rr,{model:m})!==0||pick(pp,{model:m})!==0);
 const zero=models.filter(m=>!shown.includes(m));
 const dirModel={},lastDir={},lastModel={};
 for(const d of dirs){dirModel[d]={};for(const m of models)dirModel[d][m]={fact:pick(rr,{direction:d,model:m}),plan:hasPlan?pick(pp,{direction:d,model:m}):null};
  lastDir[d]={fact:pick(rr,{direction:d,month:last}),plan:hasPlan?pick(pp,{direction:d,month:last}):null};}
 for(const m of models)lastModel[m]={fact:pick(rr,{model:m,month:last}),plan:hasPlan?pick(pp,{model:m,month:last}):null};
 const managersLast={};for(const d of dirs){managersLast[d]={};for(const r of rr)if(r.direction===d&&r.month===last)managersLast[d][r.manager]=(managersLast[d][r.manager]||0)+r.qty;}
 const dealerManagers={};
 for(const r of rr){if(r.direction!=='ССС')continue;const o=dealerManagers[r.dealer]||(dealerManagers[r.dealer]={});o[r.manager]=(o[r.manager]||0)+r.qty;}
 for(const k in dealerManagers)dealerManagers[k]=Object.entries(dealerManagers[k]).sort((a,b)=>b[1]-a[1]||cmpStr(a[0],b[0])).map(x=>x[0]);
 return {dirs,last,models,shownModels:shown,zeroModels:zero,dirModel,lastDir,lastModel,managersLast,dealerManagers};
}
/** Годы в данных — для выбора. */
const years=records=>[...new Set(records.map(r=>r.year))].sort((a,b)=>a-b);

window.SalesEngine={loadActual,loadPlan,aggregate,years,direction,model,DIRECTIONS,MONTHS};
})();
