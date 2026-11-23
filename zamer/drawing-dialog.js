/* A single draft lives in the dialog until the user explicitly creates the project. */
document.addEventListener('click',event=>{if(event.target.closest('[data-drawing-start]'))openDrawingDialog()});
function openDrawingDialog(){
 if(document.querySelector('dialog.drawing-dialog'))return;
 const d=document.createElement('dialog');d.className='drawing-dialog';
 d.innerHTML='<header><h2>Создать проект из чертежа</h2><button type="button" class="chip" data-do="cancel">Закрыть</button></header>'+
 '<label class="f">Чертёж до 32 МБ<input type="file" accept=".pdf,.dxf,.png,.jpg,.jpeg" data-el="file"></label><p role="status" data-el="status">Выберите PDF, DXF, JPG или PNG.</p>'+
 '<section data-el="work" hidden><div class="eng-fields"><label class="f">Название объекта<input data-el="name"></label><label class="f">Тип объекта<select data-el="kind"><option value="flat">Квартира</option><option value="house">Дом</option></select></label><label class="f">Страница<select data-el="page"></select></label></div>'+
 '<p data-el="note"></p><details><summary>Подписи чертежа и возможные размеры</summary><p data-el="texts"></p><button class="chip" data-do="ocr">Прочитать цифры на скане</button></details>'+
 '<div class="chips"><button data-do="zoom" class="chip">Увеличить / уменьшить</button><label>Поворот, ° <input type="number" data-el="angle" value="90" style="width:78px"></label><button data-do="rotate" class="chip">Повернуть</button></div>'+
 '<div class="drawing-view"><canvas data-el="preview" aria-label="Подложка чертежа"></canvas></div><p data-el="hint" aria-live="polite"></p>'+
 '<h3>1. Масштаб страницы</h3><div data-el="guesses" hidden><label class="f">Возможная связь надписи и стены<select data-el="guess"></select></label><button class="chip" data-do="useGuess">Подтвердить подсвеченный отрезок и размер</button><p>Число без обозначения единиц предложено в мм. Сверьте подпись и оба конца на чертеже.</p></div><label class="f">Известная длина, мм<input inputmode="decimal" data-el="length" placeholder="Например, 4000"></label>'+
 '<div class="chips"><button class="chip" data-do="calibrate">Указать две точки</button><button class="chip" data-do="uncal">Убрать последний размер</button></div><p data-el="scale"></p>'+
 '<h3>2. Контур помещения</h3><label class="f">Предложенные контуры<select data-el="candidate"></select></label><div class="chips"><button class="chip" data-do="select">Проверить выбранный контур</button><button class="chip" data-do="trace">Обвести вручную</button><button class="chip" data-do="move">Переместить вершину</button><button class="chip" data-do="undo">Убрать последнюю вершину</button></div>'+
 '<label class="f">Имя помещения<input data-el="room" placeholder="Например, кухня"></label><label class="f" data-el="floorLabel">Этаж дома<input data-el="floor" placeholder="Например, 2 этаж"></label><label class="f" data-el="levelLabel">Отметка пола этажа относительно нуля здания, мм (если известна)<input inputmode="decimal" data-el="level"></label><label class="f">Фактическая высота помещения, мм<input inputmode="decimal" data-el="height"></label>'+
 '<details><summary>Стены и проёмы</summary><div data-el="opHints" hidden><label class="f">Возможные проёмы по слоям и подписям<select data-el="opHint"></select></label><button class="chip" data-do="pickOp">Перенести на выбранную стену для проверки</button></div><label class="f">Стена<select data-el="wall"></select></label><label class="f">Уточнить длину стены, мм<input data-el="wallLength" inputmode="decimal"></label><button class="chip" data-do="changeWall">Переместить конечную вершину</button>'+
 '<label class="f">Проём<select data-el="opening"><option value="door">Дверь</option><option value="window">Окно</option></select></label>'+
 ['offset|От начала стены, мм','width|Ширина, мм','opheight|Высота проёма, мм','sill|Подоконник от пола, мм (для окна)'].map(s=>{const [k,t]=s.split('|');return '<label class="f">'+t+'<input inputmode="decimal" data-el="'+k+'"></label>'}).join('')+
 '<button class="chip" data-do="addOp">Добавить проём</button><div data-el="ops"></div></details>'+
 '<button class="btn sec" data-do="confirmRoom">Подтвердить помещение</button><p data-el="summary"></p><div data-el="rooms"></div>'+
 '<h3>3. Сохранение</h3><label class="eng-check"><input type="checkbox" data-el="keep"> Сохранить исходный файл на устройстве</label><p data-el="size"></p><button class="btn" data-do="create">Создать проект</button></section>';
 document.body.append(d);d.showModal();
 const el=k=>d.querySelector('[data-el="'+k+'"]'),say=t=>el('status').textContent=t,hint=t=>el('hint').textContent=t;
 const norm=t=>Number(String(t).trim().replace(',','.')),num=k=>el(k).value.trim()?norm(el(k).value):NaN;
 const button=k=>d.querySelector('[data-do="'+k+'"]');
 let ocr,guesses=[],proposals=[];
 let file,reader,pg,sheet,pageNum=1,job=0,busy=false,writing=false,dirty=false,mode='trace',pin=null,vertex=-1,points=[],ops=[],method='',editing=null;
 const perPage=new Map(),rooms=[];
 const safeScale=()=>{try{return DrawingProject.calibration(pg.controls,pg.scale)}catch{return null}};
 function setBusy(value){busy=value;el('work').inert=value;button('create').disabled=value||!rooms.length}
 function fresh(){points=[];ops=[];editing=null;dirty=false;pin=null;vertex=-1;mode='trace';method='Ручная обводка';el('room').value='';el('height').value='';hint('Выберите контур из списка или укажите вершины по порядку.')}
 function paint(){
  if(!sheet)return;const c=el('preview');c.width=sheet.image.width;c.height=sheet.image.height;const g=c.getContext('2d');g.drawImage(sheet.image,0,0);
  const k=Math.max(c.width,c.height)/550;
  function line(path,col,closed,dots){if(!path.length)return;g.strokeStyle=col;g.lineWidth=2*k;g.beginPath();path.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));if(closed)g.closePath();g.stroke();
   if(dots)path.forEach(([x,y],i)=>{g.fillStyle=col;g.beginPath();g.arc(x,y,3*k,0,Math.PI*2);g.fill();g.font='bold '+(10*k)+'px sans-serif';g.fillText(i+1,x+4*k,y-4*k)})}
  rooms.filter(r=>r.page===pageNum&&r!==editing).forEach(r=>line(r.points,'#0b8755',true,false));
  const suggested=sheet.shapes[+el('candidate').value];if(el('candidate').value!==''&&suggested)line(suggested.pts,'#bc820c',true,false);
  const op=proposals[el('opHint').value];if(op)line([op.a,op.b],'#943482',false,true);
  const guess=guesses[el('guess').value];if(guess)line([guess.a,guess.b],'#d12251',false,true);
  pg.controls.forEach(c=>line([c.a,c.b],'#9d29a8',false,false));if(pin)line([pin],'#9d29a8',false,true);line(points,'#006cc0',points.length>2,true);
  const scl=safeScale(),sel=el('wall').value;el('wall').replaceChildren(...points.map((q,i)=>new Option('Стена '+(i+1)+(scl?' · '+Math.round(DrawingReader.dist(q,points[(i+1)%points.length])*scl*1000)+' мм':''),i+1)));if(sel&&+sel<=points.length)el('wall').value=sel;
  try{const s=DrawingProject.calibration(pg.controls,pg.scale);el('scale').textContent=(s*1000).toFixed(3)+' мм/пикс. Контрольных размеров: '+pg.controls.length+'. Можно добавить ещё один.'}catch(e){el('scale').textContent=e.message}
  el('summary').textContent='Подтверждено помещений: '+rooms.length+'. Синие вершины ещё можно изменить.';el('floorLabel').hidden=el('levelLabel').hidden=el('kind').value!=='house';
  const row=(txt,actions)=>{const box=document.createElement('div');box.append(document.createTextNode(txt+' '));for(const [title,act] of actions){const b=document.createElement('button');b.className='chip';b.textContent=title;b.onclick=act;box.append(b)}return box};
  el('ops').replaceChildren(...ops.map((o,i)=>row((o.type==='door'?'Дверь':'Окно')+' · стена '+o.wall+' · '+Math.round(o.w*1000)+' мм',[['Удалить',()=>{ops.splice(i,1);dirty=true;paint()}]])));
  el('rooms').replaceChildren(...rooms.map(r=>row(r.name+' · стр. '+r.page+(r.floor?' · '+r.floor:''),[['Изменить',async()=>{if(!discard())return;await showPage(r.page);if(!d.open||pageNum!==r.page)return;editing=r;points=r.points.map(q=>q.slice());ops=r.ops.map(o=>({...o}));method=r.method;el('room').value=r.name;el('height').value=r.h*1000;el('floor').value=r.floor;el('level').value=r.level==null?'':r.level*1000;paint()}],['Убрать',()=>{rooms.splice(rooms.indexOf(r),1);if(editing===r)fresh();paint()}]])));
  button('create').disabled=busy||!rooms.length;
 }
 const discard=()=>!dirty||confirm('Отбросить неподтверждённые изменения контура?');
 function suggestions(){proposals=DrawingReader.openings(sheet.labels||[],sheet.lines);el('opHint').replaceChildren(new Option('Выберите обозначение',''),...proposals.map((o,i)=>new Option(o.value+' · '+(o.type==='door'?'дверь':'окно'),i)));el('opHints').hidden=!proposals.length;guesses=DrawingReader.suggest(sheet.labels||[],sheet.shapes);el('guess').replaceChildren(new Option('Выберите подпись',''),...guesses.map((g,i)=>new Option(g.value+' → '+g.mm+' мм',i)));el('guesses').hidden=!guesses.length}
 el('guess').onchange=paint;el('opHint').onchange=paint;
 async function showPage(n){
  const token=++job;setBusy(true);say('Читаю страницу '+n+'…');
  try{const next=await reader.page(n);if(!d.open||job!==token)return;
   if(n!==pageNum){el('floor').value='';el('level').value=''}pageNum=n;el('page').value=String(n);pg=perPage.get(n)||{controls:[],scale:next.scale||null,angles:[]};perPage.set(n,pg);sheet={...next,lines:(next.lines||[]).map(l=>({...l,pts:l.pts.slice()})),labels:(pg.ocrLabels||next.labels||[]).map(l=>({...l,pt:l.pt.slice()})),shapes:next.shapes.map(p=>({...p,pts:p.pts.map(q=>q.slice())}))};for(const a of pg.angles)rotate(a,false);
   el('candidate').replaceChildren(new Option('Выберите или обведите вручную',''),...sheet.shapes.map((p,i)=>new Option((i+1)+'. '+p.layer+' · '+p.pts.length+' вершин',i)));
   el('texts').textContent=(sheet.texts||[]).slice(0,120).join(' · ')||'Извлечённых текстовых подписей нет.';el('note').textContent=sheet.note;
   suggestions();fresh();paint();say('Страница '+n+' готова к проверке.');el('work').hidden=false;
  }catch(e){if(job===token){say('Ошибка чтения: '+e.message);el('page').value=String(pageNum)}}
  finally{if(job===token)setBusy(false)}
 }
 el('file').onchange=async()=>{
  const next=el('file').files[0];if(!next||writing)return;
  if((rooms.length||dirty)&&!confirm('Заменить чертёж и очистить черновик?'))return;
  const token=++job;setBusy(true);el('work').hidden=true;say('Читаю файл на устройстве…');
  try{const newer=await DrawingReader.open(next);if(!d.open||token!==job){await newer.close();return}await reader?.close();reader=newer;file=next;perPage.clear();rooms.length=0;
   el('name').value=file.name.replace(/\.[^.]+$/,'');el('size').textContent='Размер исходника '+(file.size/1048576).toFixed(2)+' МБ. При экспорте ZIP его можно исключить.';
   el('page').replaceChildren(...Array.from({length:reader.count},(_,i)=>new Option(String(i+1),i+1)));await showPage(1);
  }catch(e){if(token===job){say('Ошибка: '+e.message);setBusy(false)}}
 };
 el('page').onchange=()=>{if(discard())showPage(+el('page').value);else el('page').value=pageNum};el('candidate').onchange=paint;el('kind').onchange=paint;
 d.addEventListener('input',e=>{if(['room','height','floor','level'].includes(e.target.dataset.el)&&points.length)dirty=true});
 function rotate(deg,keep){
  const rad=deg*Math.PI/180,cs=Math.cos(rad),sn=Math.sin(rad),im=sheet.image,w=im.width,h=im.height;
  const nw=Math.ceil(Math.abs(w*cs)+Math.abs(h*sn)-1e-7),nh=Math.ceil(Math.abs(w*sn)+Math.abs(h*cs)-1e-7);
  if(nw*nh>6e6)throw Error('Слишком большая подложка после поворота');
  const dst=document.createElement('canvas');dst.width=nw;dst.height=nh;const g=dst.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,nw,nh);g.translate(nw/2,nh/2);g.rotate(rad);g.drawImage(im,-w/2,-h/2);
  const map=([x,y])=>[(x-w/2)*cs-(y-h/2)*sn+nw/2,(x-w/2)*sn+(y-h/2)*cs+nh/2];sheet.image=dst;sheet.lines.forEach(l=>l.pts=l.pts.map(map));sheet.labels=sheet.labels.map(l=>({...l,pt:map(l.pt)}));sheet.shapes.forEach(s=>s.pts=s.pts.map(map));
  if(keep){pg.angles.push(deg);points=points.map(map);pin=pin?map(pin):null;pg.controls.forEach(c=>{c.a=map(c.a);c.b=map(c.b)});for(const r of rooms.filter(r=>r.page===pageNum)){r.points=r.points.map(map);r.controls=structuredClone(pg.controls)}}
 }
 el('preview').onclick=e=>{
  if(busy)return;const c=e.currentTarget,b=c.getBoundingClientRect(),q=[(e.clientX-b.left)*c.width/b.width,(e.clientY-b.top)*c.height/b.height];
  if(mode==='cal'){
   if(!pin){pin=q;hint('Укажите второй конец контрольного отрезка.')}else{if(DrawingReader.dist(pin,q)<2){hint('Точки слишком близки. Укажите второй конец.');return}
    pg.controls.push({a:pin,b:q,mm:num('length')});pin=null;mode='trace';hint('Контрольный размер добавлен. Проверьте масштаб ниже.')}
  }else if(mode==='move'){if(!points.length)return;if(vertex<0){vertex=points.reduce((best,x,i)=>DrawingReader.dist(x,q)<DrawingReader.dist(points[best],q)?i:best,0);hint('Укажите новое место вершины '+(vertex+1)+'.')}else{points[vertex]=q;vertex=-1;dirty=true;mode='trace';hint('Вершина перемещена. Проверьте соседние стены.')}}
  else{if(points.length>=1000)return;points.push(q);dirty=true}paint();
 };
 d.onclick=async ev=>{
  const act=ev.target.closest('[data-do]')?.dataset.do;if(!act)return;
  if(act==='cancel'){if(!writing&&(!(rooms.length||dirty)||confirm('Закрыть без создания проекта?')))d.close();return}
  if(busy||!sheet)return;
  try{
   if(act==='ocr'){
    setBusy(true);el('file').disabled=true;ocr=new AbortController();const token=job;
    try{const labels=await DrawingReader.digits(sheet.image,ocr.signal,v=>{if(job===token)say('Распознаю цифры на устройстве: '+v+'%')});
     if(!d.open||token!==job)return;sheet.labels=labels;el('texts').textContent=labels.map(l=>l.value).join(' · ')||'Уверенно прочитанных цифр нет.';suggestions();say('Чтение завершено. Сверьте предложенные цифры с чертежом.');
    }finally{setBusy(false);el('file').disabled=false;ocr=null}
   }
   if(act==='useGuess'){const g=guesses[el('guess').value];if(!g)throw Error('Выберите подпись');if(rooms.some(r=>r.page===pageNum))throw Error('Масштаб подтверждённых помещений уже зафиксирован');pg.controls.push({a:g.a.slice(),b:g.b.slice(),mm:g.mm});el('guess').value=''}
   if(act==='zoom'){el('preview').classList.toggle('zoom');return}
   if(act==='rotate'){const a=num('angle');if(!Number.isFinite(a)||!a||Math.abs(a)>360)throw Error('Укажите угол поворота от −360 до 360°');rotate(a,true);suggestions()}
   if(act==='calibrate'||act==='uncal'){
    if(rooms.some(r=>r.page===pageNum))throw Error('Перед изменением масштаба удалите подтверждённые комнаты этой страницы. Они перечислены ниже.');
    if(act==='calibrate'){if(!(num('length')>0))throw Error('Введите известную длину в миллиметрах');mode='cal';pin=null;hint('Укажите первый конец известного отрезка на плане.')}else{pg.controls.pop();mode='trace';pin=null}
   }
   if(act==='select'||act==='trace'){if(!discard())return;fresh();if(act==='select'){const s=sheet.shapes[el('candidate').value];if(!s)throw Error('Выберите предложенный контур');points=s.pts.map(q=>q.slice());method='Распознанный контур, проверен вручную';dirty=true}hint('Проверьте вершины, введите имя и фактическую высоту.')}
   if(act==='move'){mode='move';vertex=-1;hint('Коснитесь вершины, затем укажите её новое положение.')}
   if(act==='undo'){points.pop();dirty=true}
   if(act==='changeWall'){const scale=DrawingProject.calibration(pg.controls,pg.scale),i=+el('wall').value-1,L=num('wallLength')/1000;if(i<0||!(L>0))throw Error('Выберите стену и введите её длину');const a=points[i],j=(i+1)%points.length,b=points[j],len=DrawingReader.dist(a,b);if(!len)throw Error('Совпадают вершины');points[j]=a.map((v,k)=>v+(b[k]-v)*L/scale/len);dirty=true}
   if(act==='pickOp'){
    const o=proposals[el('opHint').value],i=+el('wall').value-1;if(!o||i<0)throw Error('Выберите контур помещения, стену и возможный проём');
    const s=DrawingProject.calibration(pg.controls,pg.scale),a=points[i],b=points[(i+1)%points.length],len=DrawingReader.dist(a,b);
    const proj=q=>((q[0]-a[0])*(b[0]-a[0])+(q[1]-a[1])*(b[1]-a[1]))/len;
    const from=proj(o.a),to=proj(o.b),gap=q=>Math.abs((q[0]-a[0])*(b[1]-a[1])-(q[1]-a[1])*(b[0]-a[0]))/len*s;
    if(Math.min(from,to)<-.01||Math.max(from,to)>len+.01||Math.max(gap(o.a),gap(o.b))>.35||Math.abs(to-from)*s<.05)throw Error('Обозначение не совпало с выбранной стеной. Введите размеры по чертежу вручную.');
    el('opening').value=o.type;el('offset').value=Math.round(Math.max(0,Math.min(from,to))*s*1000);el('width').value=Math.round(Math.abs(to-from)*s*1000);el('opheight').value='';el('sill').value='';hint('Проверьте расчётные ширину и отступ, укажите фактическую высоту и добавьте проём.');
   }
   if(act==='addOp'){
    const t=el('opening').value,o={type:t,wall:+el('wall').value,offset:num('offset')/1000,w:num('width')/1000,h:num('opheight')/1000};if(t==='window')o.sill=num('sill')/1000;
    if(!o.wall||!Object.values(o).filter(x=>typeof x==='number').every(Number.isFinite))throw Error('Введите размеры проёма и выберите стену');ops.push(o);dirty=true;
   }
   if(act==='confirmRoom'){
    const scale=DrawingProject.calibration(pg.controls,pg.scale),draft={page:pageNum,points:points.map(q=>q.slice()),scale,controls:structuredClone(pg.controls),method,h:num('height')/1000,name:el('room').value,floor:el('floor').value.trim(),level:el('level').value.trim()?num('level')/1000:null,ops:ops.map(o=>({...o}))};
    if(el('kind').value==='house'&&!draft.floor)throw Error('Назначьте этаж помещения');DrawingProject.roomFrom(draft);
    if(editing)rooms.splice(rooms.indexOf(editing),1,draft);else rooms.push(draft);fresh();say('Помещение подтверждено.');
   }
   if(act==='create'){
    if(dirty)throw Error('Подтвердите текущее помещение или отмените его разметку.');
    setBusy(true);writing=true;el('file').disabled=true;say('Сохраняю проект…');
    try{const p=await DrawingProject.create(el('name').value,el('kind').value,rooms,file,reader.ext,el('keep').checked);d.close();go('project',{pid:p.id,tab:'plan'});toast('Проект создан. Помещения доступны для редактирования.');return}
    finally{writing=false;el('file').disabled=false;setBusy(false)}
   }
   paint();
  }catch(e){say(e.message);hint(e.message);d.querySelector('[role=status]').scrollIntoView({block:'nearest'})}
 };
 d.oncancel=e=>{if(writing||((dirty||rooms.length)&&!confirm('Закрыть без создания проекта?')))e.preventDefault()};
 d.onclose=()=>{job++;ocr?.abort();reader?.close();d.remove()};
}