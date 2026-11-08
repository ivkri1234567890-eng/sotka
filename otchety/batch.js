const batchReports = [
 {
  title:'Рейтинг ТП',
  fields:[
   ['batchRatingTemplate','xlsx','шаблон рейтинга'],
   ['batchForecast','xlsx','согласованный прогноз'],
   ['batchActual','xlsx','анализ реализации']
  ],
  async create(files,month,year){
   const report=await build(files,month,year,false,false);
   return {bytes:report.bytes,name:'Рейтинг_ТП_'+cap(months[month-1])+'_'+year+'.xlsx'};
  }
 },
 {
  title:'Презентация к оперативному совещанию',
  fields:[
   ['batchMeetingTemplate','pptx','шаблон PowerPoint'],
   ['batchMeetingSource','xlsx','планы и отгрузки']
  ],
  async create([template,source],month,year){
   const data=await readMeeting(source,month,year);
   const report=await updateMeeting(template,data,month,year,renderMeetingTable);
   return {bytes:report.bytes,name:'Оперативное_совещание_'+cap(months[month-1])+'_'+year+'.pptx'};
  }
 },
 {
  title:'ГИБДД по менеджерам',
  inputs(){
   const files=[...el('batchGibdd').files], issues=[];
   if(!files.length)issues.push('добавьте четыре исходника');
   else if(files.length!==4)issues.push('нужно 4 файла, выбрано '+files.length);
   else if(files.some(f=>!/\.(xlsx|xls|csv)$/i.test(f.name)))issues.push('подходят только .xlsx, .xls и .csv');
   return {files,issues};
  },
  async create(files,month,year){
   const r=await GibddEngine.build(files,[...el('batchGibdd').files].map(f=>f.name),{month,year});
   const out=r.files.map(f=>({name:'ГИБДД_по_менеджерам/'+f.name,bytes:f.bytes}));
   if(r.unknown.length)out.push({name:'ГИБДД_по_менеджерам/Не_распределено.txt',bytes:r.unknown.map(([k,v])=>k+' — '+v).join('\n')});
   return out;
  }
 }
];

function batchInputs(report){
 if(report.inputs)return report.inputs();
 const files=[],issues=[];
 for(const [id,extension,label] of report.fields){
  const file=el(id).files[0];
  if(!file)issues.push('добавьте '+label);
  else if(!file.name.toLowerCase().endsWith('.'+extension))issues.push(label+' — нужен '+extension.toUpperCase());
  else if(file.size>30*1024*1024)issues.push(label+' — файл больше 30 МБ');
  else files.push(file);
 }
 return {files,issues};
}

function showBatchReadiness(){
 const inputs=batchReports.map(batchInputs);
 el('batchReady').replaceChildren(...batchReports.map((report,i)=>{
  const item=document.createElement('li');
  const {issues}=inputs[i];
  item.textContent=report.title+' — '+(issues.length?issues.join(', '):'исходники загружены');
  return item;
 }));
 el('batchBuild').disabled=inputs.every(input=>input.issues.length);
}

months.forEach((month,i)=>el('batchMonth').add(new Option(cap(month),i+1)));
el('batchMonth').value=prev.getMonth()+1;
el('batchYear').value=prev.getFullYear();
el('batchForm').oninput=()=>{
 el('batchStatus').textContent='';
 showBatchReadiness();
};
el('batchForm').onsubmit=async event=>{
 event.preventDefault();
 const month=+el('batchMonth').value,year=+el('batchYear').value;
 const controls=[...el('batchForm').querySelectorAll('input,select,button')];
 controls.forEach(control=>{control.disabled=true;});
 el('batchStatus').textContent='Проверяю исходники и собираю отчёты…';
 const zip=new JSZip(), messages=[];
 let done=0;
 try{
  for(const report of batchReports){
   const {files,issues}=batchInputs(report);
   if(issues.length){
    messages.push(report.title+' — пропущен ('+issues.join(', ')+').');
    continue;
   }
   try{
    const data=await Promise.all(files.map(file=>file.arrayBuffer()));
    const made=await report.create(data,month,year);
    for(const {name,bytes} of [].concat(made))zip.file(name,bytes);
    done++;
    messages.push(report.title+' — в архиве.');
   }catch(error){
    messages.push(report.title+' — '+(error.message||String(error)));
   }
  }
  if(done){
   const archive=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
   saveFile('Отчёты_ДПГА_'+year+'-'+String(month).padStart(2,'0')+'.zip',archive,'application/zip');
  }
  el('batchStatus').textContent=(done?'Отчётов в архиве: '+done+'.':'Готовых отчётов нет.')+'\n'+messages.join('\n');
 }catch(error){
  el('batchStatus').textContent='Не удалось сохранить архив. '+(error.message||String(error));
 }finally{
  controls.forEach(control=>{control.disabled=false;});
  showBatchReadiness();
 }
};
showBatchReadiness();
el('batchMode').click();
