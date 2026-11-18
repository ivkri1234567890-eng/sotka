/* «По образцу»: презентация PowerPoint из готового отчёта (Excel или Word).
   Итоги, диаграмма, таблица отчёта по слайдам, изменения к прошлому периоду. Всё — из того же результата, что и файл. */
(function(){
'use strict';
const R=window.ObrazecRead;
const INK='18233C',MUTED='62758C',VIOLET='6864EE',VIOLET_L='E5E3FF',TEAL='14B8A6',RED='D26373',GREEN='1E7B34',BG='F4F6FB',ALT='EEF0F9';
const PER=12;
const fmt=v=>{if(v==null||v==='')return '';if(v instanceof R.DV)return v.toString();if(typeof v==='number'){const r=Math.round(v*100)/100;const neg=r<0;let [a,b]=Math.abs(r).toFixed(Number.isInteger(r)?0:2).split('.');a=a.replace(/\B(?=(\d{3})+(?!\d))/g,' ');return (neg?'−':'')+a+(b?','+b:'');}return String(v);};
const MONTH_RE=/^(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)/i;

async function build(report,files,period){
 if(typeof PptxGenJS!=='function')throw Error('Модуль PowerPoint не загружен.');
 const p=new PptxGenJS();p.defineLayout({name:'WIDE',width:13.333,height:7.5});p.layout='WIDE';
 p.title=report.name;p.author='Центр отчётов';
 const per=period!=null?R.ymLabel(period):'';
 let n=0;
 const txt=(s,t,x,y,w,h,o)=>s.addText(String(t),Object.assign({x,y,w,h,fontFace:'Arial',fontSize:16,color:INK,margin:0,valign:'top',fit:'shrink'},o||{}));
 function slide(title,sub){const s=p.addSlide();n++;s.background={color:BG};txt(s,title,.57,.31,12.19,.62,{fontSize:28.5,bold:true});if(sub)txt(s,sub,.6,1.02,12.08,.52,{fontSize:15.75,color:MUTED});
  txt(s,report.name+(per?'  ·  '+per:''),.6,7.05,10.94,.26,{fontSize:11.25,color:MUTED});txt(s,String(n).padStart(2,'0'),12.19,7.03,.62,.29,{fontSize:13.5,color:MUTED,align:'right'});return s;}
 function table(s,head,rows,o){
  o=o||{};
  const body=[head.map(h=>({text:String(h),options:{bold:true,color:'FFFFFF',fill:{color:INK}}}))].concat(rows.map((r,i)=>r.cells.map(v=>({text:String(v),options:{bold:!!r.bold,color:INK,fill:{color:r.bold?'E3E6F3':i%2?ALT:'FFFFFF'}}}))));
  const cols=head.length;const w=12.12;
  s.addTable(body,{x:.6,y:o.y||1.72,w,colW:o.colW||Array(cols).fill(w/cols),fontFace:'Arial',fontSize:o.fs||(cols>6?11:13.5),rowH:.36,valign:'middle',margin:[0,.08,0,.08],border:{type:'solid',pt:1,color:INK},autoPage:false});
 }
 const main=f=>f.plan&&f.plan[0];
 const f0=files[0];
 // 1. итоги
 let s=slide(report.name,(per?per+'. ':'')+(files.length>1?'Файлов: '+files.length+'. ':'')+'Строк: '+files.reduce((a,f)=>a+f.rows,0));
 const tot=f0.totals.slice(0,4);
 if(files.length===1&&tot.length){
  tot.forEach((t,i)=>{const x=.5+3.125*i;const hero=i===0;
   s.addShape(p.ShapeType.roundRect,{x,y:1.82,w:2.95,h:1.9,rectRadius:.08,fill:{color:hero?VIOLET:'FFFFFF'},line:{color:hero?VIOLET:'FFFFFF'}});
   txt(s,t.name,x+.21,2.0,2.6,.5,{fontSize:15,color:hero?VIOLET_L:MUTED});const v=fmt(t.value);
   txt(s,v,x+.21,2.5,2.6,.8,{fontSize:v.length>9?24:v.length>6?32:40,bold:true,color:hero?'FFFFFF':INK});
   const o=f0.cmp&&f0.cmp.tot.find(x=>x.name===t.name);
   if(o&&o.old){const d=(t.value-o.old)/Math.abs(o.old)*100;txt(s,(d>=0?'+':'')+Math.round(d)+'% к прошлому периоду',x+.21,3.3,2.6,.35,{fontSize:12,color:hero?VIOLET_L:d>=0?GREEN:RED});}
  });
  if(f0.cmp){const c=f0.cmp.cnt;txt(s,'К прошлому периоду: новых строк '+c['новая']+', пропало '+c['пропала']+', изменилось '+c['изменилась']+'.',.6,4.1,12,.4,{fontSize:15,color:MUTED});}
  const iss=[...new Set(f0.issues.filter(i=>i.level!=='info').map(i=>i.text))].slice(0,4);
  if(iss.length)txt(s,'Проверить: '+iss.join(' '),.6,4.7,12,1.6,{fontSize:13,color:MUTED});
 }else if(files.length>1){
  const m=f0.totals.slice(0,3).map(t=>t.name);
  const rows=files.slice(0,PER).map(f=>({cells:[f.split?f.split.label:f.name,f.rows].concat(m.map(nm=>{const t=f.totals.find(x=>x.name===nm);return t?fmt(t.value):'';}))}));
  table(s,['Файл','Строк'].concat(m),rows,{y:1.82,colW:[12.12-1.4-1.9*m.length,1.4].concat(Array(m.length).fill(1.9))});
  if(files.length>PER)txt(s,'…и ещё '+(files.length-PER)+' файлов',.6,6.5,12,.4,{fontSize:13,color:MUTED});
 }
 // 2. диаграмма и 3. таблица — по каждому файлу (до 15)
 for(const f of files.slice(0,15)){
  const pl=main(f);if(!pl)continue;
  const {rc,res}=pl;
  const dims=rc.cols.filter(c=>c.role==='dim'),meas=rc.cols.filter(c=>c.role==='measure');
  const data=res.rows.filter(r=>r.kind==='data');
  const lab=f.split?f.split.label:'';
  if(dims.length&&meas.length&&data.length>1&&rc.mode!=='detail'){
   const m=meas[0];
   const labelOf=r=>dims.map(d=>R.display(r.vals[d.c])).join(' · ');
   const monthly=data.every(r=>MONTH_RE.test(labelOf(r)));
   const rows=monthly?data:data.slice().sort((a,b)=>(R.toNum(b.vals[m.c])||0)-(R.toNum(a.vals[m.c])||0)).slice(0,10).reverse();
   s=slide((lab?lab+': ':'')+'«'+m.name+'»',monthly?'По месяцам':'Крупнейшие строки по «'+m.name+'»'+(data.length>10?' — 10 из '+data.length:''));
   const opts={x:.6,y:1.72,w:12.12,h:5.0,chartColors:[monthly?TEAL:VIOLET],showLegend:false,catAxisLabelFontSize:11,valAxisLabelFontSize:11,catAxisLabelFontFace:'Arial',valAxisLabelFontFace:'Arial',valGridLine:{color:'E3E7F0',size:1},catGridLine:{style:'none'},showValue:true,dataLabelFontSize:11,dataLabelFormatCode:'# ##0',dataLabelPosition:monthly?'t':'outEnd'};
   if(monthly)Object.assign(opts,{lineSize:3,lineDataSymbol:'circle',lineDataSymbolSize:7});else Object.assign(opts,{barDir:'bar',barGapWidthPct:60});
   s.addChart(monthly?p.ChartType.line:p.ChartType.bar,[{name:m.name,labels:rows.map(r=>labelOf(r).slice(0,60)),values:rows.map(r=>R.toNum(r.vals[m.c])||0)}],opts);
  }
  const cols=rc.cols.filter(c=>c.role!=='formula'&&c.role!=='blank');
  const all=res.rows.concat(res.totalRow?[Object.assign({},res.totalRow,{vals:Object.assign({[cols[0].c]:'Итого'},res.totalRow.vals)})]:[]);
  let no=0;
  const rows=all.map(r=>{if(r.kind==='data')no++;return {bold:r.kind!=='data',cells:cols.map(c=>c.role==='rownum'&&r.kind==='data'?no:fmt(r.vals[c.c]))};});
  const pages=Math.ceil(rows.length/PER);
  const widths=(()=>{const w=cols.map(c=>c.role==='measure'||c.role==='rownum'?1:2.2);const sum=w.reduce((a,b)=>a+b,0);return w.map(x=>x/sum*12.12);})();
  for(let st=0;st<rows.length&&st<PER*8;st+=PER){
   s=slide((lab?lab+': ':'')+(rc.sheet&&report.kind!=='docx'&&report.kind!=='pptx'?rc.sheet:'Таблица отчёта'),pages>1?'Строки '+(st+1)+'–'+Math.min(st+PER,rows.length)+' из '+rows.length:'');
   table(s,cols.map(c=>c.name),rows.slice(st,st+PER),{colW:widths});
  }
  if(rows.length>PER*8)txt(s,'Полностью таблица — в файле отчёта ('+rows.length+' строк).',.6,6.55,12,.4,{fontSize:13,color:MUTED});
 }
 // 4. изменения
 if(files.length===1&&f0.cmp){
  const c=f0.cmp;const ch=c.rows.filter(r=>r.st!=='без изменений');
  if(ch.length){
   s=slide('Изменения к прошлому периоду','Новых '+c.cnt['новая']+', пропало '+c.cnt['пропала']+', изменилось '+c.cnt['изменилась']);
   const m=c.meas[0];
   const rows=ch.slice(0,PER).map(r=>({cells:[r.st,r.l.join(' · ')].concat(m?[fmt(r.old[0]),fmt(r.now[0])]:[])}));
   table(s,['Что','Строка'].concat(m?[m+' — было',m+' — стало']:[]),rows,{colW:m?[1.9,6.62,1.8,1.8]:[2,10.12]});
   if(ch.length>PER)txt(s,'Все изменения — на листе «Изменения» файла отчёта.',.6,6.55,12,.4,{fontSize:13,color:MUTED});
  }
 }
 return await p.write({outputType:'uint8array'});
}
window.ObrazecDeck={build};
})();
