/* «Дашборд продаж»: экран. Данные — только из загруженных файлов, держатся в памяти этой вкладки. */
(function(){
'use strict';
const E=window.SalesEngine,P=window.SalesPPT;
const $=id=>document.getElementById(id);
if(!$('salesView'))return;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:1});
let records=null,plan=null,warnings=[],cur=null,active='ККК',factName='',planName='';
const FK=['year','month_start','month_end','direction','manager','model','dealer'];

E.MONTHS.forEach((n,i)=>{$('sdMs').add(new Option(n,i+1));$('sdMe').add(new Option(n,i+1));});
const ids={year:'sdYear',month_start:'sdMs',month_end:'sdMe',direction:'sdDir',manager:'sdMgr',model:'sdModel',dealer:'sdDealer'};
function filters(){const f={};for(const k of FK){const v=$(ids[k]).value;f[k]=v?(/^(year|month_)/.test(k)?+v:v):'';}return f;}
function fillOptions(d){
 const yr=$('sdYear');const ys=E.years(records);yr.replaceChildren(...ys.map(y=>new Option(y,y)));yr.value=d.year;
 $('sdMs').value=d.month_start;$('sdMe').value=d.month_end;
 for(const k of ['direction','manager','dealer','model']){
  const s=$(ids[k]);const keep=s.value;const ph=s.options[0].text;
  s.replaceChildren(new Option(ph,''),...d.options[k].map(v=>new Option(v,v)));
  s.value=d.options[k].includes(keep)?keep:'';
 }
}
function status(t,err){const s=$('sdStatus');s.textContent=t||'';s.classList.toggle('err',!!err);}

/* ---------- графики ---------- */
function lineChart(d){
 const w=800,h=280,L=45,R=20,T=25,B=40,ms=d.months,n=ms.length;
 const facts=ms.map((_,i)=>d.series.reduce((a,s)=>a+s.actual[i],0));
 const plans=d.plan===null?null:ms.map((_,i)=>d.series.reduce((a,s)=>a+s.plan[i],0));
 const max=Math.max(1,...facts,...(plans||[]))*1.15;
 const x=i=>n<2?(L+w-R)/2:L+i*(w-L-R)/(n-1),y=v=>h-B-v/max*(h-T-B);
 const grid=Array.from({length:5},(_,i)=>{const v=max*i/4;return `<line x1="${L}" y1="${y(v)}" x2="${w-R}" y2="${y(v)}" class="g"/><text x="${L-12}" y="${y(v)+4}" text-anchor="end" class="ax">${Math.round(v)}</text>`;}).join('');
 const path=v=>v.map((a,i)=>(i?'L':'M')+x(i)+','+y(a)).join(' ');
 const area=n>1?path(facts)+` L${x(n-1)},${h-B} L${x(0)},${h-B} Z`:'';
 return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="План и факт продаж по месяцам"><defs><linearGradient id="sdFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7773f3" stop-opacity=".22"/><stop offset="100%" stop-color="#7773f3" stop-opacity="0"/></linearGradient></defs>${grid}${area?`<path d="${area}" fill="url(#sdFade)"/>`:''}${plans?`<path d="${path(plans)}" fill="none" stroke="#bec6d7" stroke-width="2" stroke-dasharray="5 6"/>`:''}<path d="${path(facts)}" fill="none" stroke="#6965ef" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${facts.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="#fff" stroke="#6965ef" stroke-width="2"><title>${ms[i]}: факт ${num(v)}${plans?', план '+num(plans[i]):''}</title></circle><text x="${x(i)}" y="${y(v)-12}" text-anchor="middle" class="lv">${num(v)}</text><text x="${x(i)}" y="${h-12}" text-anchor="middle" class="ax">${ms[i]}</text>`).join('')}</svg>`;
}
function rank(items,tot){
 const max=Math.max(...items.map(x=>x[1]),1);
 return items.map(([nm,q],i)=>`<div class="rank"><div class="no">${String(i+1).padStart(2,'0')}</div><div><div class="name">${esc(nm)}</div><div class="bar"><i style="width:${Math.max(0,q)/max*100}%"></i></div></div><div class="value">${num(q)}</div></div>`).join('')||'<p class="empty">Нет продаж в выбранном срезе</p>';
}
const plural=(n,a,b,c)=>{n=Math.abs(n)%100;const m=n%10;return n>10&&n<20?c:m===1?a:m>=2&&m<=4?b:c;};

function render(d){
 cur=d;
 $('sdEmpty').hidden=true;$('sdBody').hidden=false;$('sdPpt').disabled=false;
 $('sdSub').textContent=d.months[0]+(d.months.length>1?'–'+d.months[d.months.length-1]:'')+' '+d.year+' · автомобили, шт.'+(planName?'':' · без плана');
 const per=d.fulfillment;
 $('sdKpis').innerHTML=[
  ['Фактические продажи',num(d.actual),'Автомобилей за выбранный период','hero'],
  ['Целевой план',d.plan===null?'—':num(d.plan),d.plan===null?(plan?'План для этого среза отсутствует':'План не загружен'):'План за выбранный период',''],
  ['Выполнение плана',per===null?'—':Math.round(per)+'%',per===null?(d.filters.manager||d.filters.dealer?'Индивидуальный план не задан':'Сравнение недоступно'):'Доля выполненного плана',''],
  ['Отклонение',d.delta===null?'—':(d.delta>0?'+':'')+num(d.delta),d.delta===null?'Сравнение недоступно':d.delta<0?'До целевого плана':'Сверх целевого плана','']
 ].map(([l,v,c,cl])=>`<div class="kpi ${cl}"><div class="label">${l}</div><strong>${v}</strong><small>${c}</small>${l==='Выполнение плана'&&per!==null?`<div class="progress"><i style="width:${Math.min(100,Math.max(0,per))}%"></i></div>`:''}</div>`).join('');
 $('sdTrend').innerHTML=lineChart(d);
 $('sdLegendPlan').hidden=d.plan===null;
 $('sdChannels').innerHTML=d.series.map((s,i)=>{const q=s.actual.reduce((a,b)=>a+b,0),p=s.plan?s.plan.reduce((a,b)=>a+b,0):null,pc=p?q/p*100:null;
  return `<div class="channel"><b>${s.name}</b><div class="meta"><span><strong>${num(q)}</strong>${p!==null?' / '+num(p):' '+plural(q,'автомобиль','автомобиля','автомобилей')}</span><span>${pc!==null?Math.round(pc)+'% плана':'План не задан'}</span></div><div class="progress"><i style="width:${Math.min(100,Math.max(0,pc!==null?pc:q/Math.max(1,d.actual)*100))}%;background:${['#6865ef','#12b8a6','#f1ae66'][i%3]}"></i></div></div>`;}).join('');
 const dirs=d.series.map(s=>s.name);if(!dirs.includes(active))active=dirs[0]||'ККК';
 $('sdTabs').innerHTML=dirs.map(k=>`<button type="button" class="${active===k?'on':''}" data-dir="${k}" aria-pressed="${active===k}">${k}</button>`).join('');
 $('sdTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{active=b.dataset.dir;render(cur);});
 $('sdManagers').innerHTML=rank(d.managers[active]||[]);
 $('sdDealers').innerHTML=rank(d.dealers);
 const nd=d.dealers.length;$('sdDealerTotal').textContent=nd+' '+plural(nd,'дилер','дилера','дилеров')+' · '+num(d.dealers.reduce((a,x)=>a+x[1],0))+' авт.';
 $('sdPairs').innerHTML=d.pairs.length?'<div class="tw"><table><thead><tr><th>Менеджер</th><th>Дилер</th><th>Продано</th></tr></thead><tbody>'+d.pairs.map(r=>`<tr><td>${esc(r.manager)}</td><td>${esc(r.dealer)}</td><td>${num(r.qty)}</td></tr>`).join('')+'</tbody></table></div>':'<p class="empty">Нет продаж ССС в выбранном срезе</p>';
 $('sdPairsSum').textContent='ССС: все связки «менеджер — дилер» ('+d.pairs.length+')';
 $('sdModels').innerHTML=d.models.map(([k,v])=>`<span class="chipm"><b>${esc(k)}</b> ${num(v)}</span>`).join('')||'<span class="empty">—</span>';
}
function recalc(){
 if(!records)return;
 try{const d=E.aggregate(records,plan,filters());fillOptions(d);render(d);status(warnings.length?warnings.slice(0,5).join('\n')+(warnings.length>5?'\n…и ещё '+(warnings.length-5):''):'');}
 catch(e){status(e.message||String(e),true);}
}
async function loadFiles(){
 const fa=$('sdFact').files[0],fp=$('sdPlanFile').files[0];
 if(!fa&&!records){status('Выберите файл реализации.',true);return;}
 $('sdLoad').disabled=true;status('Считаю…');
 await new Promise(r=>setTimeout(r,20));
 try{
  if(fa){const r=E.loadActual(await fa.arrayBuffer());records=r.records;warnings=r.warnings;factName=fa.name;
   for(const k of FK)$(ids[k]).value='';}
  if(fp){plan=E.loadPlan(await fp.arrayBuffer());planName=fp.name;}
  $('sdFiles').textContent='Реализация: «'+factName+'», '+records.length+' '+plural(records.length,'строка','строки','строк')+'. План: '+(planName?'«'+planName+'»':'не загружен')+'.';
  $('sdClearPlan').hidden=!plan;
  $('sdFact').value='';$('sdPlanFile').value='';
  const d=E.aggregate(records,plan,{});
  fillOptions(d);render(d);
  status(warnings.length?warnings.slice(0,5).join('\n')+(warnings.length>5?'\n…и ещё '+(warnings.length-5):''):'');
  $('sdUpload').open=false;
 }catch(e){status(e.message||String(e),true);}
 finally{$('sdLoad').disabled=false;}
}
$('sdLoad').onclick=loadFiles;
$('sdClearPlan').onclick=()=>{plan=null;planName='';$('sdClearPlan').hidden=true;$('sdFiles').textContent='Реализация: «'+factName+'». План: не загружен.';recalc();};
for(const k of FK)$(ids[k]).onchange=recalc;
$('sdReset').onclick=()=>{for(const k of FK)$(ids[k]).value='';recalc();};
$('sdPpt').onclick=async()=>{
 if(!cur)return;const b=$('sdPpt');b.disabled=true;status('Готовлю PowerPoint…');
 try{
  const d=E.aggregate(records,plan,filters()); // тот же расчёт, что на экране
  const bytes=await P.build(d);
  const f=d.filters;const tag=[f.direction,f.manager,f.dealer,f.model].filter(Boolean).join(' ');
  const name='Продажи '+d.year+' '+d.months[0]+(d.months.length>1?'–'+d.months[d.months.length-1]:'')+(tag?' — '+tag:'')+'.pptx';
  saveFile(name.replace(/[\\/:*?"<>|]+/g,' '),bytes,'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  status('');
 }catch(e){status(e.message||String(e),true);}
 finally{b.disabled=false;}
};
})();
