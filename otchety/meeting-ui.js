for(const mode of ['batch','rating','meeting','gibdd']){
 el(mode+'Mode').onclick=()=>{
  for(const other of ['batch','rating','meeting','gibdd']){
   el(other+'View').hidden=other!==mode;
   el(other+'Mode').setAttribute('aria-pressed',String(other===mode));
  }
 };
}
months.forEach((m,i)=>el('meetingMonth').add(new Option(cap(m),i+1)));
el('meetingMonth').value=prev.getMonth()+1;
el('meetingYear').value=prev.getFullYear();
let meetingOutput, meetingName;
function resetMeeting(){
 meetingOutput=null;
 el('meetingResult').hidden=true;
 el('meetingStatus').textContent='';
}
el('meetingForm').oninput=resetMeeting;
el('meetingForm').onsubmit=e=>{e.preventDefault();runMeeting(false);};
el('meetingDemo').onclick=()=>runMeeting(true);
async function runMeeting(demo){
 resetMeeting();
 const buildButton=el('meetingBuild'), demoButton=el('meetingDemo');
 buildButton.disabled=demoButton.disabled=true;
 el('meetingStatus').textContent='Читаю файлы…';
 try{
  const template=el('meetingTemplate').files[0], source=el('meetingSource').files[0];
  if(!template||!/\.pptx$/i.test(template.name))throw Error('Выберите шаблон в формате PPTX.');
  if(!demo&&(!source||!/\.xlsx$/i.test(source.name)))throw Error('Выберите исходник в формате XLSX.');
  if(template.size>30*1024*1024||(!demo&&source.size>30*1024*1024))throw Error('Размер каждого файла должен быть до 30 МБ.');
  const month=+el('meetingMonth').value, year=+el('meetingYear').value;
  const data=demo?null:await readMeeting(await source.arrayBuffer(),month,year);
  meetingOutput=await updateMeeting(await template.arrayBuffer(),data,month,year,renderMeetingTable);
  meetingName=demo?template.name:'Оперативное_совещание_'+cap(months[month-1])+'_'+year+'.pptx';
  const [p,f,py,fy]=meetingOutput.totals;
  const pct=(a,b)=>a?' · '+Math.round(100*b/a)+'%':'';
  el('meetingTotals').textContent='Месяц: '+p+' / '+f+pct(p,f)+' | С начала года: '+py+' / '+fy+pct(py,fy);
  el('meetingStatus').textContent=demo?'Показаны цифры из встроенных таблиц шаблона.':'Презентация готова. Проверьте итоги перед скачиванием.';
  el('meetingResult').hidden=false;
 }catch(e){el('meetingStatus').textContent=e.message||String(e);}
 finally{buildButton.disabled=demoButton.disabled=false;}
}
el('meetingSave').onclick=()=>{
 if(!meetingOutput)return;
 const url=URL.createObjectURL(new Blob([meetingOutput.bytes],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));
 const a=document.createElement('a');
 a.href=url;a.download=meetingName;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
};
async function renderMeetingTable(grid,index){
 const shares=index===2?[2.9,...Array(12).fill(1)]:[2.4,1.5,1,0.85,0.9,1];
 const canvas=document.createElement('canvas');
 canvas.width=index===2?1800:1200;
 canvas.height=Math.round(canvas.width*[3192462/5356225,5622925/6537325,2285938/9845121][index]);
 const ctx=canvas.getContext('2d'), rowHeight=canvas.height/grid.length;
 const widths=shares.map(w=>w/sum(shares)*canvas.width);
 for(const [r,row] of grid.entries()){
  const header=r<(index===2?2:1), total=/итого|всего/i.test(row[0]+' '+row[1]);
  let x=0;
  for(const [c,value] of row.entries()){
   const y=r*rowHeight,w=widths[c];
   ctx.fillStyle=header?'#203750':total?'#dce7f2':r%2?'#ffffff':'#f1f5fa';
   ctx.fillRect(x,y,w,rowHeight);
   ctx.strokeStyle='#bac9da';ctx.strokeRect(x,y,w,rowHeight);
   const numeric=(index===2?c>=1:c>=2)&&!header;
   const percent=(index===2?[3,7,11].includes(c):c===4)&&numeric;
   const n=number(value);
   const label=numeric&&Number.isFinite(n)?(n===0?'':percent?Math.round(n*100)+'%':String(n)):value;
   ctx.fillStyle=header?'#ffffff':numeric&&n<0?'#a32228':'#172941';
   ctx.font=((header||total)&&!(numeric&&n<0)?'bold ':'')+Math.min(30,rowHeight*.44)+'px Arial';
   ctx.textAlign=c===0?'left':'center';ctx.textBaseline='middle';
   const lines=String(label).split('\n');
   lines.forEach((line,i)=>ctx.fillText(line,c===0?x+8:x+w/2,y+rowHeight/2+(i-(lines.length-1)/2)*rowHeight*.34,w-12));
   x+=w;
  }
 }
 return new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))).arrayBuffer());
}
