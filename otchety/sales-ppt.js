/* «Дашборд продаж»: PowerPoint по образцу «Пульс продаж» (Modern_Presentation).
   Все цифры, фамилии, дилеры, месяцы и выводы — из результата SalesEngine.aggregate() по загруженному Excel.
   Диаграммы — настоящие диаграммы PowerPoint со встроенными данными, таблицы редактируемые,
   длинные списки разбиваются на слайды без обрезки. */
(function(){
'use strict';
const INK='18233C',MUTED='62758C',VIOLET='6864EE',VIOLET_L='E5E3FF',TEAL='14B8A6',GREY='C4C9D9',RED='D26373',BG='F4F6FB',ALT='EEF0F9',LINE='D6DBE8';
const MON_FULL=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MON_GEN=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const cap=s=>s[0].toUpperCase()+s.slice(1);
const plural=(n,a,b,c)=>{n=Math.abs(Math.round(n))%100;const m=n%10;return n>10&&n<20?c:m===1?a:m>=2&&m<=4?b:c;};
const fmt=n=>n==null?'—':(n<0?'−':'')+String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
const sig=n=>n==null?'—':n>0?'+'+fmt(n):fmt(n);
const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
const share=(a,b)=>b?(a/b*100).toFixed(1)+'%':'—';
const auto=n=>fmt(n)+' '+plural(n,'автомобиль','автомобиля','автомобилей');
const surname=s=>String(s).trim().split(/\s+/)[0];

async function build(data){
 if(typeof PptxGenJS!=='function')throw Error('Модуль PowerPoint не загружен.');
 const D=data.detail;
 const p=new PptxGenJS();
 p.defineLayout({name:'WIDE',width:13.333,height:7.5});p.layout='WIDE';
 p.author='Центр отчётов';p.title='Пульс продаж '+data.year;
 const ms=data.month_start,me=data.month_end,nM=me-ms+1;
 const period=(nM===1?cap(MON_FULL[me-1]):cap(MON_FULL[ms-1])+'–'+MON_FULL[me-1])+' '+data.year;
 const periodLow=nM===1?MON_FULL[me-1]+' '+data.year:MON_FULL[ms-1]+'–'+MON_FULL[me-1];
 const nMon=nM===1?'месяц':nM+' '+plural(nM,'месяц','месяца','месяцев');
 const lastName=cap(MON_FULL[me-1]);
 const F=data.filters||{};
 const filt=[F.direction&&'направление '+F.direction,F.manager&&'менеджер '+F.manager,F.dealer&&'получатель '+F.dealer,F.model&&'модель '+F.model].filter(Boolean);
 const hasPlan=data.plan!=null;
 // фамилии — если фамилия не повторяется у разных людей; иначе полностью
 const allMgr=[...new Set(data.options.manager)];
 const sn=new Map();for(const m of allMgr){const k=surname(m);sn.set(k,(sn.get(k)||0)+1);}
 const who=m=>sn.get(surname(m))===1&&m!=='Не указан'?surname(m):m;
 let n=0;
 const txt=(s,t,x,y,w,h,o)=>s.addText(String(t),Object.assign({x,y,w,h,fontFace:'Arial',fontSize:16,color:INK,margin:0,valign:'top',fit:'shrink'},o||{}));
 function slide(title,subtitle){
  const s=p.addSlide();n++;s.background={color:BG};
  txt(s,title,.57,.31,12.19,.62,{fontSize:28.5,bold:true});
  if(subtitle)txt(s,subtitle,.6,1.02,12.08,.52,{fontSize:15.75,color:MUTED});
  txt(s,period+'  ·  автомобили, шт.'+(filt.length?'  ·  '+filt.join(', '):''),.6,7.05,10.94,.26,{fontSize:11.25,color:MUTED});
  txt(s,String(n).padStart(2,'0'),12.19,7.03,.62,.29,{fontSize:13.5,color:MUTED,align:'right'});
  return s;
 }
 const note=(s,t,y,o)=>t&&txt(s,t,.6,y,12.12,.6,Object.assign({fontSize:13.5,color:MUTED},o||{}));
 function table(s,head,rows,o){
  o=o||{};
  const body=[head.map(h=>({text:String(h),options:{bold:true,color:'FFFFFF',fill:{color:INK}}}))]
   .concat(rows.map((r,i)=>r.map(v=>{const cell=typeof v==='object'&&v!==null?v:{text:String(v)};return {text:String(cell.text),options:Object.assign({color:INK,fill:{color:i%2?ALT:'FFFFFF'}},cell.options||{})};})));
  s.addTable(body,{x:.6,y:o.y||1.82,w:12.12,colW:o.colW,fontFace:'Arial',fontSize:o.fontSize||16.5,rowH:o.rowH||.45,valign:'middle',margin:[0,.1,0,.1],border:{type:'solid',pt:1,color:INK},autoPage:false});
 }
 function chart(s,labels,series,kind,o){
  const box=Object.assign({x:.6,y:1.88,w:12.12,h:4.17},o||{});
  const opts=Object.assign({},box,{
   chartColors:series.map(x=>x.color),showLegend:series.length>1,legendPos:'b',legendFontSize:11,legendFontFace:'Arial',
   catAxisLabelFontSize:11,valAxisLabelFontSize:11,catAxisLabelFontFace:'Arial',valAxisLabelFontFace:'Arial',catAxisLabelColor:'333333',valAxisLabelColor:'333333',
   valGridLine:{color:'E3E7F0',size:1},catGridLine:{style:'none'},valAxisLineShow:false,
   showValue:true,dataLabelFontSize:11,dataLabelColor:'222222',dataLabelFormatCode:'0',dataLabelFontFace:'Arial'});
  if(kind==='line')Object.assign(opts,{lineSize:3,lineDataSymbol:'circle',lineDataSymbolSize:7,dataLabelPosition:'t'});
  else Object.assign(opts,{barDir:kind==='horizontal'?'bar':'col',barGapWidthPct:kind==='horizontal'?60:80,dataLabelPosition:'outEnd'});
  s.addChart(kind==='line'?p.ChartType.line:p.ChartType.bar,series.map(x=>({name:x.name,labels,values:x.values})),opts);
 }
 const dirRow=(d,f,pl)=>[d,pl==null?'—':fmt(pl),fmt(f),pl?pct(f,pl):'—',pl==null?'—':{text:fmt(f-pl),options:{color:f-pl<0?INK:INK}}];

 // 1. Итоги
 let s=slide('Пульс продаж',period+'. План, результат и вклад команды');
 const kpi=[['Факт',fmt(data.actual),true],['План',hasPlan?fmt(data.plan):'—'],['Выполнение',hasPlan?pct(data.actual,data.plan):'—'],['Отклонение',hasPlan?fmt(data.delta):'—',false,data.delta<0]];
 kpi.forEach(([l,v,hero,neg],i)=>{const x=.5+3.125*i;
  s.addShape(p.ShapeType.roundRect,{x,y:1.82,w:2.95,h:1.72,rectRadius:.08,fill:{color:hero?VIOLET:'FFFFFF'},line:{color:hero?VIOLET:'FFFFFF'}});
  txt(s,l,x+.21,2.03,2.6,.42,{fontSize:17.25,color:hero?VIOLET_L:MUTED});
  txt(s,v,x+.21,2.54,2.6,.94,{fontSize:v.length>7?34:43.5,bold:true,color:hero?'FFFFFF':neg?RED:INK});});
 const dirs=D.dirs;
 table(s,['Направление','План','Факт','Исполнение','Отклонение'],dirs.map(d=>{const f=(data.directions.find(x=>x[0]===d)||[0,0])[1];const pl=hasPlan?data.direction_plans[d]:null;return dirRow(d,f,pl);}),{y:3.91,colW:[3.54,1.98,1.98,2.4,2.22],rowH:.585});
 if(!hasPlan)note(s,data.filters.manager||data.filters.dealer?'Индивидуальный план для выбранного менеджера или получателя в источнике не задан — сравнение с планом не делается.':'Целевой план не загружен — показан только факт.',6.45);

 // 2. Исполнение по направлениям
 const facts=dirs.map(d=>(data.directions.find(x=>x[0]===d)||[0,0])[1]);
 let sub2='';
 if(data.actual){const i=facts.indexOf(Math.max(...facts));const d=dirs[i];sub2=d+' даёт '+Math.round(facts[i]/data.actual*100)+'% объёма продаж';
  if(hasPlan&&data.delta<0){const gap=facts[i]-data.direction_plans[d];if(gap<0)sub2+=' и '+Math.round(gap/data.delta*100)+'% общего отставания от плана';}}
 s=slide('Исполнение плана по направлениям',sub2||'Нет продаж в выбранном срезе');
 const ser2=[{name:'Факт '+nMon,values:facts,color:TEAL}];
 if(hasPlan)ser2.unshift({name:'План '+nMon,values:dirs.map(d=>data.direction_plans[d]),color:GREY});
 chart(s,dirs,ser2,'bar');

 // 3. Динамика по месяцам
 const mf=data.months.map((m,i)=>data.series.reduce((a,se)=>a+se.actual[i],0));
 const mp=hasPlan?data.months.map((m,i)=>data.series.reduce((a,se)=>a+se.plan[i],0)):null;
 s=slide('Динамика продаж по месяцам',(hasPlan?'Помесячный план и факт из загруженных файлов':'Помесячный факт из загруженного файла')+'. Всего '+auto(data.actual));
 chart(s,data.months,(mp?[{name:'План',values:mp,color:GREY}]:[]).concat([{name:'Факт',values:mf,color:TEAL}]),'line',{h:3.95});
 if(hasPlan)note(s,'Целевой план за '+nMon+': '+fmt(data.plan)+'. Факт: '+fmt(data.actual)+'. '+(data.delta<0?'Недовыполнение: '+auto(-data.delta):data.delta>0?'Перевыполнение: '+auto(data.delta):'План выполнен точно')+'.',6.0);

 // 4. Последний месяц
 if(nM>1){
  const lf=dirs.reduce((a,d)=>a+D.lastDir[d].fact,0),lp=hasPlan?dirs.reduce((a,d)=>a+D.lastDir[d].plan,0):null;
  s=slide(lastName+': план и факт',auto(lf)+(hasPlan?' при плане '+fmt(lp)+'. Выполнение '+pct(lf,lp)+', отклонение '+fmt(lf-lp):''));
  table(s,['Направление','План','Факт','Исполнение','Отклонение'],dirs.map(d=>dirRow(d,D.lastDir[d].fact,hasPlan?D.lastDir[d].plan:null)).concat([dirRow('Всего',lf,lp)]),{y:1.82,colW:[3.54,1.98,1.98,2.4,2.22],rowH:.6});
  if(hasPlan&&lf-lp<0){
   let worst=null;for(const m of D.models){const x=D.lastModel[m];const dv=x.fact-x.plan;if(!worst||dv<worst.dv)worst={m,dv,x};}
   if(worst&&worst.dv<0)note(s,worst.m+': '+fmt(worst.x.fact)+' из '+fmt(worst.x.plan)+' '+plural(worst.x.plan,'автомобиля','автомобилей','автомобилей')+' по плану. Отклонение '+fmt(worst.dv)+', или '+Math.round(worst.dv/(lf-lp)*100)+'% общего недовыполнения '+MON_GEN[me-1]+'.',5.4,{fontSize:16.5,bold:true,color:INK});
  }
 }

 // 5. Модели
 const mods=D.shownModels;
 const modelTot=m=>dirs.reduce((a,d)=>a+D.dirModel[d][m].fact,0);
 let sub5='';if(data.actual&&mods.length){const top=mods.slice().sort((a,b)=>modelTot(b)-modelTot(a))[0];sub5=top+': '+auto(modelTot(top))+', '+Math.round(modelTot(top)/data.actual*100)+'% общего результата';}
 s=slide('Структура продаж по моделям',sub5);
 const mw=Math.min(1.6,8.6/Math.max(1,mods.length+1));
 table(s,['Направление'].concat(mods,['Всего']),dirs.map(d=>[d].concat(mods.map(m=>fmt(D.dirModel[d][m].fact)),[fmt(mods.reduce((a,m)=>a+D.dirModel[d][m].fact,0))])).concat([['Всего'].concat(mods.map(m=>fmt(modelTot(m))),[fmt(data.actual)])]),{y:1.82,colW:[12.12-mw*(mods.length+1)].concat(Array(mods.length+1).fill(mw)),rowH:.66});
 const notes5=[];if(D.models.some(m=>m==='В45'))notes5.push('В45 включает В45 Про.');
 if(D.zeroModels.length)notes5.push(D.zeroModels.join(', ')+': '+(hasPlan?'целевой план и факт равны':'факт равен')+' нулю во всех направлениях.');
 note(s,notes5.join(' '),5.35);

 // 6–8. Направления: динамика и модели
 for(const se of data.series){
  const d=se.name,f=se.actual.reduce((a,b)=>a+b,0),pl=se.plan?se.plan.reduce((a,b)=>a+b,0):null;
  s=slide(d+': динамика выполнения плана',pl!=null?'План '+fmt(pl)+', факт '+fmt(f)+', выполнение '+pct(f,pl):'Факт '+fmt(f)+'. План для этого среза не задан');
  chart(s,data.months,(se.plan?[{name:'План',values:se.plan,color:GREY}]:[]).concat([{name:'Факт',values:se.actual,color:TEAL}]),'line',{y:1.72,h:3.45});
  const rows=[];
  if(se.plan)rows.push(['План'].concat(mods.map(m=>fmt(D.dirModel[d][m].plan))));
  rows.push(['Факт'].concat(mods.map(m=>fmt(D.dirModel[d][m].fact))));
  if(se.plan)rows.push(['Отклонение'].concat(mods.map(m=>fmt(D.dirModel[d][m].fact-D.dirModel[d][m].plan))));
  const w=(12.12-2.2)/Math.max(1,mods.length);
  table(s,['За '+nMon].concat(mods),rows,{y:5.32,colW:[2.2].concat(Array(mods.length).fill(w)),rowH:.3,fontSize:13.5});
 }

 // 9–10. Менеджеры направлений (кроме ССС — там отдельный слайд)
 for(const d of dirs.filter(x=>x!=='ССС')){
  const list=data.managers[d]||[];if(!list.length)continue;
  const tot=list.reduce((a,x)=>a+x[1],0);
  for(let st=0;st<list.length;st+=11){
   s=slide(d+': продажи по менеджерам'+(list.length>11?' ('+(st/11+1)+')':''),'Фамилии и количество автомобилей. Индивидуальных планов в сводном источнике нет');
   const head=['Менеджер',nM>1?nMon:lastName];if(nM>1)head.push(lastName);head.push('Доля');
   const part=list.slice(st,st+11);
   table(s,head,part.map(([m,q])=>{const r=[who(m),fmt(q)];if(nM>1)r.push(fmt(D.managersLast[d][m]||0));r.push(share(q,tot));return r;}),{y:1.73,colW:nM>1?[5.77,2.19,2.08,2.08]:[7.96,2.08,2.08],rowH:part.length>6?.36:.68,fontSize:part.length>6?13.5:16.5});
   note(s,'Факт из выгрузки: суммарное количество автомобилей по менеджеру за '+periodLow+'. '+(list.some(x=>x[0]==='Не указан')?'Часть продаж без менеджера — «Не указан».':'Все продажи распределены.'),6.49);
  }
 }

 // 11–16. ССС
 const sss=data.managers['ССС']||[];
 const dl=data.dealers;
 if(dirs.includes('ССС')&&(sss.length||dl.length)){
  const tot=sss.reduce((a,x)=>a+x[1],0);
  s=slide('ССС: результат менеджеров',(sss.some(x=>x[0]==='Не указан')||dl.some(x=>x[0]==='Не указан')?'Часть продаж без менеджера или получателя':'Все '+auto(tot)+' распределены по менеджерам и дилерам'));
  table(s,['Менеджер','Продано по детализации'],sss.slice(0,11).map(([m,q])=>[who(m),fmt(q)]),{y:1.82,colW:[8.36,3.76],rowH:sss.length>6?.4:.62});
  const multi=Object.entries(D.dealerManagers).filter(([k,v])=>v.length>1);
  note(s,multi.length?'Дилеров у нескольких менеджеров: '+multi.length+' ('+multi.slice(0,4).map(([k,v])=>k+' — '+v.map(who).join(', ')).join('; ')+(multi.length>4?'…':'')+').':'Каждый дилер закреплён за одним менеджером.',sss.length>6?6.45:4.55);
  if(sss.length>11)for(let st=11;st<sss.length;st+=11){s=slide('ССС: результат менеджеров (продолжение)','');table(s,['Менеджер','Продано по детализации'],sss.slice(st,st+11).map(([m,q])=>[who(m),fmt(q)]),{colW:[8.36,3.76],rowH:.4});}
  if(dl.length){
   s=slide('Топ дилеров по объёму продаж','Рейтинг по количеству автомобилей за '+periodLow);
   const top=dl.slice(0,8).reverse();
   chart(s,top.map(x=>x[0]),[{name:'Продано',values:top.map(x=>x[1]),color:VIOLET}],'horizontal',{h:4.3});
   note(s,'Рейтинг отражает реализацию получателям ССС по выгрузке. Продажи дилеров конечным клиентам источник не раскрывает.',6.45);
   for(let st=0;st<dl.length;st+=11){
    const part=dl.slice(st,st+11);
    s=slide('Рейтинг дилеров: '+(st+1)+'–'+(st+part.length),'От большего объёма к меньшему. При равном количестве место условное');
    table(s,['№','Дилер','Продано','Менеджеры'],part.map(([nm,q],i)=>[st+i+1,nm,fmt(q),(D.dealerManagers[nm]||[]).map(who).join(', ')]),{y:1.72,colW:[.73,5.62,1.56,4.21],rowH:.39});
   }
   const pr=data.pairs;const PER=12;const parts=Math.ceil(pr.length/PER);
   for(let st=0;st<pr.length;st+=PER){
    s=slide('ССС: менеджер и дилер','Детализация продаж за '+(nM>1?nMon:MON_FULL[me-1])+(parts>1?', часть '+(st/PER+1):''));
    table(s,['Менеджер / дилер','Продано'],pr.slice(st,st+PER).map(r=>[who(r.manager)+' / '+r.dealer,fmt(r.qty)]),{y:1.72,colW:[10.12,2],rowH:.36,fontSize:13.5});
   }
  }
 }

 // 17. Выводы
 s=slide('Результаты за '+(nM>1?nMon:MON_FULL[me-1]),auto(data.actual)+(hasPlan?' при целевом плане '+fmt(data.plan)+'. Выполнение '+pct(data.actual,data.plan):''));
 const res=[];
 for(const d of dirs){const f=(data.directions.find(x=>x[0]===d)||[0,0])[1];const pl=hasPlan?data.direction_plans[d]:null;res.push([d,pl!=null?fmt(f)+' из '+fmt(pl)+'. Отклонение '+fmt(f-pl):fmt(f)+(hasPlan?'':', план не задан')]);}
 for(const d of dirs){const list=data.managers[d]||[];if(!list.length)continue;const tot=list.reduce((a,x)=>a+x[1],0);
  if(d==='ССС'){res.push(['Лидер ССС',who(list[0][0])+' '+auto(list[0][1])]);continue;}
  const lead=list.filter((x,i)=>i===0||x[1]/tot>=0.05).slice(0,3);res.push(['Лидеры '+d,lead.map(([m,q])=>who(m)+' '+fmt(q)).join(', ')]);}
 if(dl.length)res.push(['Топ-3 дилеров',dl.slice(0,3).map(([k,v])=>k+' '+fmt(v)).join(', ')]);
 table(s,['Показатель','Результат'],res,{y:1.82,colW:[2.6,9.52],rowH:.42,fontSize:res.length>8?13.5:15});
 if(dl.length){const t3=dl.slice(0,3).reduce((a,x)=>a+x[1],0),ts=dl.reduce((a,x)=>a+x[1],0);note(s,(dl.length>=3?'Три крупнейших дилера дают ':'Крупнейшие дилеры дают ')+auto(t3)+', или '+Math.round(t3/ts*100)+'% объёма ССС.',Math.min(6.4,1.82+.42*(res.length+1)+.25));}
 return await p.write({outputType:'uint8array'});
}
window.SalesPPT={build};
})();
