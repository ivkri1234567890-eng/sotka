/* «Дашборд продаж»: PowerPoint текущего среза. Диаграммы — настоящие диаграммы PowerPoint
   со встроенными данными (редактируются), таблицы — редактируемые, длинные списки разбиваются по 11 строк.
   Источник данных — тот же результат SalesEngine.aggregate(), что и на экране. */
(function(){
'use strict';
const INK='15243F',MUTED='738099',VIOLET='6564EE',VIOLET2='8D75F6',TEAL='14B8A6',BG='F4F6FB',GREY='B8C2D8',AMBER='F1AE66',LINE='E3E7F0';
const PER=11;
const fmt=n=>n==null?'Нет плана':(n<0?'-':'')+String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
const pct=n=>n==null?'Нет плана':Math.round(n)+'%';

async function build(data){
 if(typeof PptxGenJS!=='function')throw Error('Модуль PowerPoint не загружен.');
 const p=new PptxGenJS();
 p.defineLayout({name:'WIDE',width:13.333,height:7.5});p.layout='WIDE';
 p.author='Центр отчётов';p.title='Продажи '+data.year;
 const period=data.year+' · '+data.months[0]+(data.months.length>1?'–'+data.months[data.months.length-1]:'')+' · автомобили, шт.';
 const filt=[];const F=data.filters||{};
 if(F.direction)filt.push('направление '+F.direction);if(F.manager)filt.push('менеджер '+F.manager);if(F.dealer)filt.push('получатель '+F.dealer);if(F.model)filt.push('модель '+F.model);
 let n=0;
 const txt=(s,t,x,y,w,h,o)=>s.addText(String(t),Object.assign({x,y,w,h,fontFace:'Arial',fontSize:20,color:INK,margin:0,valign:'top',fit:'shrink'},o||{}));
 function slide(title,subtitle){
  const s=p.addSlide();n++;s.background={color:BG};
  s.addShape(p.ShapeType.rect,{x:0,y:0,w:0.16,h:7.5,fill:{color:VIOLET},line:{color:VIOLET}});
  txt(s,title,.6,.35,12.1,.65,{fontSize:29,bold:true});
  if(subtitle)txt(s,subtitle,.62,1.05,12,.5,{fontSize:14,color:MUTED});
  txt(s,period+(filt.length?' · '+filt.join(', '):''),.62,7.08,11,.28,{fontSize:10,color:MUTED});
  txt(s,String(n),12.2,7.05,.5,.3,{fontSize:11,color:MUTED,align:'right'});
  return s;
 }
 function card(s,x,y,w,h,fill){s.addShape(p.ShapeType.roundRect,{x,y,w,h,rectRadius:0.12,fill:{color:fill||'FFFFFF'},line:{color:fill||LINE,width:0.75}});}
 function chart(s,labels,series,kind,o){
  const multi=series.length>1;
  const colors=multi?series.map((x,i)=>x.color||[GREY,VIOLET,TEAL][i%3]):[series[0].color||VIOLET];
  const box=Object.assign({x:.65,y:1.85,w:12,h:4.85},o||{});
  card(s,box.x-.15,box.y-.15,box.w+.3,box.h+.3);
  const type=kind==='line'?p.ChartType.line:p.ChartType.bar;
  s.addChart(type,series.map(x=>({name:x.name,labels,values:x.values.map(v=>Math.round(v*100)/100)})),Object.assign({},box,{
   barDir:kind==='horizontal'?'bar':'col',chartColors:colors,
   showLegend:multi,legendPos:'b',legendFontSize:11,legendFontFace:'Arial',
   catAxisLabelFontSize:11,valAxisLabelFontSize:11,catAxisLabelFontFace:'Arial',valAxisLabelFontFace:'Arial',
   catAxisLabelColor:MUTED,valAxisLabelColor:MUTED,catAxisLineShow:false,valAxisLineShow:false,
   valGridLine:{color:LINE,size:1},catGridLine:{style:'none'},
   lineSize:kind==='line'?3:undefined,lineDataSymbol:kind==='line'?'circle':undefined,lineDataSymbolSize:7,
   showValue:true,dataLabelFontSize:10,dataLabelColor:INK,dataLabelFormatCode:'# ##0',dataLabelPosition:kind==='line'?'t':'outEnd',
   barGapWidthPct:60
  }));
 }
 function table(s,head,rows,widths,aligns){
  const nrows=rows.length+1;const fs=nrows>11?13:16;
  const body=[head.map((h,j)=>({text:String(h),options:{bold:true,color:'FFFFFF',fill:{color:INK},align:aligns&&aligns[j]||'left'}}))]
   .concat(rows.map((r,i)=>r.map((v,j)=>({text:String(v),options:{color:INK,fill:{color:i%2?'EDEFF8':'FFFFFF'},align:aligns&&aligns[j]||'left'}}))));
  s.addTable(body,{x:.65,y:1.85,w:12,colW:widths,fontFace:'Arial',fontSize:fs,rowH:.39,valign:'middle',margin:[0,0.12,0,0.12],border:{type:'solid',pt:0.5,color:LINE},autoPage:false});
 }
 // 1. Итоги
 let s=slide('Продажи. Итоги периода','Дашборд по направлениям и результатам команды');
 const metrics=[['Продано',fmt(data.actual),true],['Целевой план',fmt(data.plan)],['Выполнение',pct(data.fulfillment)],['Отклонение',data.delta==null?'Нет плана':(data.delta>0?'+':'')+fmt(data.delta)]];
 metrics.forEach(([l,v,hero],i)=>{const x=.65+3.1*i;card(s,x,1.85,2.9,2.05,hero?VIOLET:'FFFFFF');txt(s,l,x+.3,2.1,2.4,.4,{fontSize:15,color:hero?'E6E2FF':MUTED});txt(s,v,x+.3,2.7,2.4,.9,{fontSize:v.length>8?26:38,bold:true,color:hero?'FFFFFF':VIOLET});});
 const dirs=data.directions;
 dirs.forEach(([d,v],i)=>{const x=.65+4.13*i;card(s,x,4.35,3.93,1.9);txt(s,d,x+.3,4.6,3.3,.4,{fontSize:16,color:MUTED,bold:true});
  const pl=data.direction_plans&&data.direction_plans[d];
  txt(s,fmt(v),x+.3,5.05,3.3,.7,{fontSize:32,bold:true,color:[VIOLET,TEAL,'D9822B'][i%3]});
  txt(s,pl?'план '+fmt(pl)+' · '+Math.round(v/pl*100)+'%':'план не задан',x+.3,5.75,3.3,.35,{fontSize:12,color:MUTED});});
 if(!dirs.length)txt(s,'Нет продаж в выбранном срезе',.65,4.6,12,.6,{fontSize:22,color:MUTED});
 // 2. Динамика
 s=slide('Динамика план–факт','По месяцам выбранного периода');
 const facts=data.months.map((m,i)=>data.series.reduce((a,se)=>a+se.actual[i],0));
 const ser=[{name:'Факт',values:facts,color:VIOLET}];
 if(data.plan!=null)ser.unshift({name:'План',values:data.months.map((m,i)=>data.series.reduce((a,se)=>a+se.plan[i],0)),color:GREY});
 chart(s,data.months,ser,'line');
 for(const se of data.series){
  s=slide(se.name+': динамика продаж',se.plan!=null?'Помесячное сравнение с целевым планом':'План для выбранного менеджера или дилера отсутствует');
  const ss=[{name:'Факт',values:se.actual,color:VIOLET}];if(se.plan!=null)ss.unshift({name:'План',values:se.plan,color:GREY});
  chart(s,data.months,ss,'line');
  const rows=data.managers[se.name]||[];
  for(let st=0;st<rows.length;st+=PER){
   s=slide(se.name+': продажи менеджеров',rows.length>PER?'Фамилии менеджеров и количество автомобилей · места '+(st+1)+'–'+Math.min(st+PER,rows.length):'Фамилии менеджеров и количество автомобилей');
   table(s,['Менеджер','Продано'],rows.slice(st,st+PER).map(([nm,q])=>[nm,fmt(q)]),[9,3],['left','right']);
  }
 }
 const dl=data.dealers;
 if(dl.length){
  s=slide('Топ дилеров','Реализация дилерам, автомобили');
  const top=dl.slice(0,8).reverse();
  chart(s,top.map(a=>a[0]),[{name:'Продано',values:top.map(a=>a[1]),color:TEAL}],'horizontal');
  for(let st=0;st<dl.length;st+=PER){
   s=slide('Рейтинг дилеров','Места '+(st+1)+'–'+Math.min(st+PER,dl.length)+' из '+dl.length);
   table(s,['№','Дилер','Продано'],dl.slice(st,st+PER).map(([nm,v],i)=>[st+i+1,nm,fmt(v)]),[.7,9.3,2],['center','left','right']);
  }
  for(let st=0;st<data.pairs.length;st+=PER){
   s=slide('ССС: менеджер и дилер','Подтверждённые продажи по получателям'+(data.pairs.length>PER?' · '+(st+1)+'–'+Math.min(st+PER,data.pairs.length)+' из '+data.pairs.length:''));
   table(s,['Менеджер','Дилер','Продано'],data.pairs.slice(st,st+PER).map(r=>[r.manager,r.dealer,fmt(r.qty)]),[4.5,6,1.5],['left','left','right']);
  }
 }
 const md=data.models;
 for(let st=0;st<Math.max(1,md.length);st+=PER){
  s=slide('Структура по моделям','В45 объединяет Валдай 45 и Валдай 45 Про');
  table(s,['Модель','Продано'],md.slice(st,st+PER).map(([k,v])=>[k,fmt(v)]),[9,3],['left','right']);
 }
 return await p.write({outputType:'uint8array'});
}
window.SalesPPT={build};
})();
