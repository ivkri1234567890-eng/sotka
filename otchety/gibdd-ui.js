/* Раздел «ГИБДД по менеджерам»: распознаёт четыре исходника и формирует по файлу Excel на каждого ТП. */
const gibddRoles = [
 ['registrations','Регистрации ГИБДД','сводная «Регистрация…»: СубъектРФ · ИНН · Владелец · Итог'],
 ['clients','CRM — клиенты','выгрузка с колонкой «Ответственный»'],
 ['events','CRM — события','выгрузка с колонкой «Продавец»'],
 ['territories','Регионы ТП','справочник «Область/край/Республика» · «Торговый представитель»']
];
const gibddFiles = {};
let gibddOutput = null;
const gibddFmt = n => Number(n).toLocaleString('ru-RU');
const gibddPeriod = p => p ? cap(months[p.month-1])+' '+p.year : '';

function saveFile(name, bytes, type){
 const bridge=window.webkit?.messageHandlers?.saveReport;
 if(bridge){
  let b='';for(let i=0;i<bytes.length;i+=32768)b+=String.fromCharCode(...bytes.subarray(i,i+32768));
  bridge.postMessage({name,base64:btoa(b)});
  return;
 }
 const url=URL.createObjectURL(new Blob([bytes],{type}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
const XLSX_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function gibddSlots(){
 el('gibddSlots').replaceChildren(...gibddRoles.map(([key,label,hint])=>{
  const li=document.createElement('li'), f=gibddFiles[key];
  li.className=f?'ok':'';
  const b=document.createElement('b');b.textContent=(f?'✓ ':'○ ')+label;
  const s=document.createElement('small');s.textContent=f?f.name:hint;
  li.append(b,s);return li;
 }));
 el('gibddRun').disabled=gibddRoles.some(([k])=>!gibddFiles[k]);
}
function gibddReset(){gibddOutput=null;el('gibddResult').hidden=true;}

el('gibddFiles').onchange=async e=>{
 const list=[...e.target.files];e.target.value='';
 if(!list.length)return;
 gibddReset();
 el('gibddStatus').textContent='Определяю, где какой файл…';
 const bad=[];
 for(const file of list){
  try{
   const role=await GibddEngine.classify(await file.arrayBuffer());
   if(role)gibddFiles[role]=file;else bad.push(file.name+' — не узнал таблицу');
  }catch(err){bad.push(file.name+' — '+(err.message||'не открывается'));}
 }
 el('gibddStatus').textContent=bad.length?'Не подошли:\n'+bad.join('\n'):'';
 gibddSlots();
};

el('gibddForm').onsubmit=async e=>{
 e.preventDefault();gibddReset();
 const run=el('gibddRun');run.disabled=true;
 el('gibddStatus').textContent='Читаю исходники и формирую файлы…';
 try{
  const keys=gibddRoles.map(r=>r[0]);
  gibddOutput=await GibddEngine.build(await Promise.all(keys.map(k=>gibddFiles[k].arrayBuffer())),keys.map(k=>gibddFiles[k].name));
  const r=gibddOutput, n=r.files.length;
  el('gibddTitle').textContent='Итог'+(r.period?' за '+gibddPeriod(r.period).toLowerCase():'');
  el('gibddTiles').replaceChildren(...[[r.total,'регистраций'],[r.distributed,'распределено'],[n,'файлов']].map(([v,t])=>{
   const d=document.createElement('div'),b=document.createElement('b');d.className='tile';b.textContent=gibddFmt(v);d.append(b,t);return d;
  }));
  const notes=[];
  if(n!==8)notes.push('В справочнике менеджеров: '+n+' (ожидалось 8).');
  if(r.unknown.length)notes.push('Не попали ни к одному менеджеру:\n'+r.unknown.map(([k,v])=>'• '+k+' — '+v).join('\n'));
  if(!r.hasBrands)notes.push('Разбивки по маркам нет: «Марка» стоит в фильтре сводной. Перенесите её в строки, чтобы появились столбцы «Марка | Итог».');
  el('gibddNotes').textContent=notes.join('\n\n');
  el('gibddPeople').replaceChildren(...r.summary.map((s,i)=>{
   const tr=document.createElement('tr');
   for(const v of [s.surname,gibddFmt(s.qty),gibddFmt(s.inCrm),gibddFmt(s.knew)]){const td=document.createElement('td');td.textContent=v;tr.append(td);}
   const td=document.createElement('td'),btn=document.createElement('button');
   btn.type='button';btn.className='mini';btn.textContent='Скачать';btn.setAttribute('aria-label','Скачать '+s.file);
   btn.onclick=()=>saveFile(s.file,r.files[i].bytes,XLSX_TYPE);
   td.append(btn);tr.append(td);return tr;
  }));
  el('gibddStatus').textContent='Готово. Проверьте итоги и скачайте файлы.';
  el('gibddResult').hidden=false;
 }catch(err){el('gibddStatus').textContent=err.message||String(err);}
 finally{run.disabled=gibddRoles.some(([k])=>!gibddFiles[k]);}
};

el('gibddZip').onclick=async()=>{
 if(!gibddOutput)return;
 const r=gibddOutput;
 const extra=r.unknown.length?[{name:'Не_распределено.txt',text:r.unknown.map(([k,v])=>k+' — '+v).join('\n')}]:[];
 const bytes=await GibddEngine.bundle(r.files,extra);
 const p=r.period;
 saveFile('ГИБДД_'+(p?p.year+'-'+String(p.month).padStart(2,'0'):'отчёты')+'.zip',bytes,'application/zip');
};
gibddSlots();
