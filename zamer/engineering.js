/* Engineering survey. Coordinates and dimensions are stored in metres. */
const Eng = (() => {
  const groups = {
    water:['Водоснабжение','ХВС, ГВС, Водорозетка, Стояк, Коллектор, Кран, Счётчик, Фильтр, Насос, Ввод, Подключение техники, Скважина'],
    waste:['Канализация','Вывод, Стояк, Ревизия, Трап, Инсталляция, Септик, Наружная сеть'],
    power:['Электрика','Розетка, Выключатель, Световой вывод, Силовой вывод, Щит, Коробка, Кабель, Канал, Заземление, Ввод'],
    data:['Слаботочные сети','Интернет, ТВ, Домофон, Сигнализация, Камера, Умный дом'],
    heat:['Отопление','Радиатор, Труба, Котёл, Коллектор, Тёплый пол, Терморегулятор, Котельная'],
    air:['Вентиляция','Шахта, Отверстие, Воздуховод, Вытяжка, Кондиционер, Трасса, Дренаж, Дымоход'],
    gas:['Газ','Труба, Кран, Счётчик, Вывод, Оборудование, Ввод'],
    other:['Прочее','Люк, Короб, Ниша, Проходка, Отверстие, Неизвестный, Пользовательский']
  };
  const colors=['#137ab7','#855031','#de7914','#7855a3','#b94a40','#258675','#805c19','#586775'];
  const statuses=['Существующий','Планируемый','Демонтаж'];
  const accuracy=['Требует проверки','Измерено','Приблизительно','Расчётное'];
  const surfaces=['Стена','Пол','Потолок','Фасад','Фундамент','Участок','Без привязки'];
  const fields={offset:'От угла',height:'Высота от пола',x:'X от начала комнаты',y:'Y от начала комнаты',width:'Ширина',depth:'Глубина',sizeH:'Высота элемента',diameter:'Диаметр',projection:'Выступ'};
  const pipeButtons=[
    {group:'water',type:'ХВС',title:'Холодная вода'},
    {group:'water',type:'ГВС',title:'Горячая вода'},
    {group:'waste',type:'Вывод',title:'Канализация'},
    {group:'heat',type:'Труба',title:'Труба отопления'}
  ];
  const pipeTypes={
    water:['ХВС','ГВС','Водорозетка','Стояк','Ввод','Подключение техники'],
    waste:['Вывод','Стояк','Наружная сеть'], heat:['Труба'], gas:['Труба','Ввод','Вывод'],
    air:['Воздуховод','Дренаж','Дымоход']
  };
  const isPipe=e=>pipeTypes[e.group]?.includes(e.type);
  const typeTitle=e=>pipeButtons.find(b=>b.group===e.group&&b.type===e.type)?.title||e.type;
  const millimetres=v=>Number((v*1000).toFixed(6));
  const formatMm=v=>String(millimetres(v)).replace('.',',');
  const id=()=>uid()+uid();
  const items=p=>p.engineering||[];
  const opt=(v,t,cur)=>'<option value="'+esc(v)+'" '+(String(cur)===String(v)?'selected':'')+'>'+esc(t)+'</option>';
  const opts=(arr,cur)=>arr.map(v=>opt(v,v,cur)).join('');
  const tone=e=>colors[Object.keys(groups).indexOf(e.group)]||'#555';
  const label=e=>e.name||e.type;
  const roomOf=(p,e)=>p.rooms.find(r=>r.id===e.room);
  function anchor(p,e){
    const r=roomOf(p,e);
    if(e.surface==='Без привязки')return null;
    if(!r){
      const fid=e.floor||p.floors?.[0]?.id;
      if(e.room||!e.zone||!['Фасад','Фундамент','Участок','Пол','Потолок'].includes(e.surface)||e.x==null||e.y==null||(p.displayFloor&&p.displayFloor!==fid))return null;
      return {r:null,xy:[e.x,e.y]};
    }
    if(e.surface==='Стена'){
      const i=r.walls.findIndex(w=>w.engKey&&w.engKey===e.wallKey);
      const seg=geo(r).segments[i];
      if(!seg||e.offset==null||e.offset>seg.length||seg.length<=0)return null;
      const offset=e.end?seg.length-e.offset:e.offset;
      return {r,i,offset,xy:seg.at(offset/seg.length)};
    }
    return e.x!=null&&e.y!=null?{r,xy:[e.x,e.y]}:null;
  }
  function outside(p){return items(p).filter(e=>visible(p,e)&&anchor(p,e)?.r===null).map(e=>[e.x,e.y])}
  function visible(p,e){return e.visible!==false&&p.engineeringLayers?.[e.group]!==false}
  function validate(p){
    if(p.engineering==null&&!p.engMedia)return;
    if(p.engMedia?.photos?.length&&!p.engineering?.length)throw Error('У фото нет инженерных элементов');
    if(!Array.isArray(p.engineering)||p.engineering.length>10000)throw Error('Повреждён инженерный список');
    const ids=new Set();
    for(const e of p.engineering){
      if(!e||typeof e.id!=='string'||!/^[\w-]{1,80}$/.test(e.id)||ids.has(e.id)||!Object.hasOwn(groups,e.group)||typeof e.type!=='string')throw Error('Повреждён инженерный элемент');
      ids.add(e.id);
      for(const k of [...Object.keys(fields),'slope'])if(e[k]!=null&&!Number.isFinite(e[k]))throw Error('Повреждён инженерный размер');
    }
    if(p.engMedia){
      if(p.engMedia.id!=='~eng'||!Array.isArray(p.engMedia.photos)||p.engMedia.photos.length>2000)throw Error('Повреждены инженерные фотографии');
      const used=new Set(p.rooms.flatMap(r=>(r.photos||[]).map(f=>f.id)));
      for(const f of p.engMedia.photos){
        if(!f||typeof f.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(f.id)||used.has(f.id)||!Array.isArray(f.elements)||!f.elements.length||f.elements.some(id=>!ids.has(id)))throw Error('Повреждены связи инженерного фото');
        used.add(f.id);
      }
    }
  }
  function commit(p,fn){
    const old={engineering:p.engineering,engineeringLayers:p.engineeringLayers,engMedia:p.engMedia,engineering3d:p.engineering3d};
    fn();
    if(save())return true;
    Object.assign(p,old);return false;
  }
  let dialog, measuring, filter='', term='', onlyLoose=false;
  function list(p){
    setTimeout(fillPh27,0);
    return '<section class="card"><h3>Инженерные коммуникации</h3><button class="btn" data-eng="new">Добавить элемент</button><label class="f">Поиск<input id="eng-search" value="'+esc(term)+'"></label><label class="f">Категория<select id="eng-filter">'+opt('','Все категории',filter)+Object.entries(groups).map(([k,v])=>opt(k,v[0],filter)).join('')+'</select></label><label><input type="checkbox" id="eng-loose" '+(onlyLoose?'checked':'')+'> Без определённой привязки</label><div id="eng-results">'+rows(p)+'</div><details><summary>Слои на чертежах</summary>'+Object.entries(groups).map(([k,v])=>'<label class="eng-check"><input type="checkbox" data-layer="'+k+'" '+(p.engineeringLayers?.[k]!==false?'checked':'')+'> '+v[0]+'</label>').join('')+'</details></section>';
  }
  function rows(p){
    const matches=items(p).filter(e=>(!filter||filter===e.group)&&(!onlyLoose||!anchor(p,e))&&[label(e),e.type,e.zone,roomOf(p,e)?.name,e.comment].join(' ').toLowerCase().includes(term.toLowerCase()));
    return cards(p,matches)||'<p class="muted">Элементов по выбранным условиям пока нет.</p>';
  }
  const inRoom=(p,room)=>items(p).filter(e=>e.room===room.id);
  function roomStep(p,room,wall){
    const selected=room.walls[wall-1]?wall:0;
    const target='data-eng="new" data-room="'+esc(room.id)+'" data-wall="'+selected+'"';
    const hint=selected?'Выбрана стена '+selected+'.':'Выберите стену на плане и нажмите на нужную трубу.';
    return '<section class="card"><h3>Инженерные коммуникации</h3><p class="small muted">'+hint+'</p>'+
      '<div class="pl-grid eng-presets">'+pipeButtons.map((b,i)=>'<button class="pl-btn" '+target+' data-pipe="'+i+'">'+b.title+'</button>').join('')+'</div>'+
      '<button class="chip" '+target+'>Другая коммуникация</button>'+
      cards(p,inRoom(p,room))+'</section>';
  }
  function cards(p,entries){
    return entries.map(e=>{
      const a=anchor(p,e);
      const dimensions=[];
      if(isPipe(e)){
        if(a?.i!=null)dimensions.push('от угла '+(e.end?(a.i+1)%a.r.walls.length+1:a.i+1)+' — '+formatMm(e.offset)+' мм');
        if(e.height!=null)dimensions.push('от пола '+formatMm(e.height)+' мм');
        if(e.diameter!=null)dimensions.push('Ø '+formatMm(e.diameter)+' мм');
      }
      return '<div class="card"><b>'+esc(e.name||typeTitle(e))+'</b><p>'+esc([roomOf(p,e)?.name,e.zone,a?.i!=null?'стена '+(a.i+1):a?e.surface:'без определённой привязки',e.accuracy].filter(Boolean).join(' · '))+'</p>'+(dimensions.length?'<p class="small">'+esc(dimensions.join(' · '))+'</p>':'')+['edit','copy','photo','camera','delete'].map((k,i)=>'<button class="btn ghost" data-id="'+esc(e.id)+'" data-eng="'+k+'">'+['Изменить','Копировать','Фото из галереи','Снять фото','Удалить'][i]+'</button>').join('')+ thumbnails(p,e)+'</div>';
    }).join('');
  }
  function thumbnails(p,e){
    return (p.engMedia?.photos||[]).filter(f=>f.elements.includes(e.id)).map(f=>'<button class="chip" aria-label="Открыть инженерное фото" data-eng-photo="'+esc(f.id)+'" data-owner="'+esc(e.id)+'"><img width="72" alt="Фото элемента" data-ph27="'+esc(f.id)+'"></button>').join('');
  }
  document.addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-eng-photo]');if(!b)return;const p=P(),f=p?.engMedia?.photos.find(f=>f.id===b.dataset.engPhoto);if(!f)return;
    try{
      const record=await PHDB.get(f.id);if(!record)throw Error('Файл фотографии отсутствует на устройстве');
      const d=document.createElement('dialog');d.className='eng-dialog';const e=items(p).find(e=>e.id===b.dataset.owner);
      d.innerHTML='<h3></h3><div class="image"></div><p></p><div class="chips"><button class="chip" data-remove>Убрать из карточки</button><button class="btn" data-close>Закрыть</button></div>';
      d.querySelector('h3').textContent=label(e);d.querySelector('p').textContent=[record.name,f.ts?new Date(f.ts).toLocaleDateString('ru-RU'):''].filter(Boolean).join(' · ');
      const im=document.createElement('img');im.style.cssText='display:block;max-width:100%;max-height:55vh;object-fit:contain';im.alt='Инженерное фото';let url;
      if(record.original)url=URL.createObjectURL(record.original);
      if(record.data||url){im.src=record.data||url;d.querySelector('.image').append(im)}
      if(url){const a=document.createElement('a');a.textContent='Сохранить оригинал';a.download=record.name||'Фото';a.href=url;d.querySelector('p').append(document.createElement('br'),a)}
      d.querySelector('[data-close]').onclick=()=>d.close();d.onclose=()=>{if(url)URL.revokeObjectURL(url);d.remove()};
      d.querySelector('[data-remove]').onclick=()=>{
        if(!confirm('Убрать это фото из карточки?'))return;
        const next=p.engMedia.photos.map(x=>x.id!==f.id?x:{...x,elements:x.elements.filter(id=>id!==e.id)}).filter(x=>x.elements.length);
        if(!commit(p,()=>p.engMedia={...p.engMedia,photos:next}))return;
        if(!DB.projects.some(p=>mediaOwners(p).some(r=>r.photos?.some(ph=>ph.id===f.id))))PHDB.removeAll([f.id]).catch(storageStatus);
        d.close();render();
      };document.body.append(d);d.showModal();
    }catch(error){storageStatus(error)}
  });
  function editor(p,source,{chooseType=false,chooseRoom=false}={}){
    const e={id:id(),group:'water',type:'ХВС',surface:'Стена',room:p.rooms[0]?.id||'',status:statuses[0],accuracy:accuracy[0],base:'Чистовой',visible:true,...source};
    if(e.wallIndex==null){
      const index=roomOf(p,e)?.walls.findIndex(w=>w.engKey&&w.engKey===e.wallKey)??-1;
      e.wallIndex=index<0?'':index;
    }
    const draft={};
    const d=document.createElement('dialog');
    dialog=d;d.className='eng-dialog';d.setAttribute('aria-labelledby','eng-title');
    d.innerHTML='<form><h3 id="eng-title" tabindex="-1" autofocus></h3><div class="eng-fields"></div><div class="row eng-actions"><button class="btn" type="submit">Сохранить</button><button class="btn sec" type="button" data-close>Отмена</button></div></form>';
    document.body.append(d);const form=d.querySelector('form');
    function read(){
      for(const [k,v] of new FormData(form)){
        if(k in fields||k==='slope')draft[k]=v;
        else if(k==='ref')e.end=v==='end';
        else e[k]=v;
      }
      e.visible=form.elements.visible.checked;
    }
    const originalNumber=k=>e[k]==null?'':String(k==='slope'?e[k]:millimetres(e[k]));
    const parseNumber=v=>v.trim()===''?null:Number(v.trim().replace(',','.'));
    function draw(){
      const r=roomOf(p,e);
      const expanded=form.querySelector('details')?.open;
      const input=(k,t,v='')=>'<label class="f">'+t+'<input maxlength="600" name="'+k+'" value="'+esc(v??'')+'"></label>';
      const size=(k,t)=>'<label class="f">'+esc(t||fields[k])+(k==='slope'?', %':', мм')+'<input type="text" name="'+k+'" inputmode="decimal" value="'+esc(draft[k]??originalNumber(k))+'"></label>';
      const priority=p.kind==='house'?['Ввод','Скважина','Насос','Септик','Наружная сеть','Котёл','Котельная']:['ХВС','ГВС','Водорозетка','Вывод','Розетка','Радиатор'];
      const types=groups[e.group][1].split(', ').sort((a,b)=>Number(priority.includes(b))-Number(priority.includes(a)));
      if(!types.includes(e.type))types.push(e.type);
      const sel=(k,t,v)=>'<label class="f">'+t+'<select name="'+k+'">'+v+'</select></label>';
      const category=sel('group','Категория',Object.entries(groups).map(([k,v])=>opt(k,v[0],e.group)).join(''))+sel('type','Тип',opts(types,e.type));
      const room=sel('room','Помещение',opt('','Внешняя зона / не назначено',e.room)+p.rooms.map(r=>opt(r.id,r.name,e.room)).join(''));
      const wall=e.surface==='Стена', pipe=isPipe(e);
      let position='';
      if(wall){
        const wi=Number(e.wallIndex),corners=e.wallIndex!==''&&r?.walls[wi]?corners27(r,wi):null;
        const leftRef=corners&&leftIsStart27(r)?'start':'end',ref=e.end?'end':'start';
        const options=corners?opt(leftRef,'Левый · '+corners.left,ref)+opt(leftRef==='start'?'end':'start','Правый · '+corners.right,ref):opt('start','Начало стены',ref)+opt('end','Конец стены',ref);
        position='<div class="grid2">'+sel('wallIndex','Стена',opt('','Не выбрана',e.wallIndex)+(r?.walls||[]).map((w,i)=>opt(i,'Стена '+(i+1),e.wallIndex)).join(''))+
          sel('ref','От какого угла',options)+'</div>'+size('offset',pipe?'От угла до центра трубы':'От угла до центра');
      }else{
        position=['x','y'].map(k=>size(k,e.room?fields[k]:k.toUpperCase()+' от начала общего плана')).join('');
      }
      const extraDiameter=!pipe&&(e.diameter!=null||['water','waste','heat','gas','air'].includes(e.group));
      form.querySelector('h3').textContent=chooseType?'Инженерная коммуникация':(e.name||typeTitle(e));
      form.querySelector('.eng-fields').innerHTML=(chooseType?category:'')+(chooseRoom?room:'')+position+
        size('height',pipe?'От пола до центра трубы':'Высота от пола')+(pipe?size('diameter','Диаметр трубы'):'')+
        '<details'+(expanded?' open':'')+'><summary>Дополнительно</summary><div class="eng-fields">'+
        (chooseType?'':category)+input('name','Название',e.name)+(chooseRoom?'':room)+sel('surface','Поверхность',opts(surfaces,e.surface))+
        input('zone',p.kind==='house'?'Зона дома или участка':'Зона',e.zone)+sel('floor','Этаж зоны',opt('',e.room?'По помещению':'Первый этаж / общий уровень',e.floor)+(p.floors||[]).map(f=>opt(f.id,f.name,e.floor)).join(''))+
        ['width','sizeH','depth','projection'].map(k=>size(k)).join('')+(extraDiameter?size('diameter'):'')+
        sel('base','Уровень отсчёта',opts(['Чистовой','Черновой'],e.base))+input('direction','Направление',e.direction)+(e.group==='waste'?size('slope','Измеренный уклон'):'')+
        sel('accuracy','Точность',opts(accuracy,e.accuracy))+sel('status','Состояние',opts(statuses,e.status))+input('comment','Комментарий',e.comment)+'<label class="eng-check"><input type="checkbox" name="visible" '+(e.visible?'checked':'')+'> Показывать на чертежах</label></div></details>';
    }
    form.onchange=ev=>{
      const key=ev.target.name;
      if(!['group','type','room','surface','wallIndex','ref'].includes(key))return;
      read();
      if(key==='group')e.type=groups[e.group][1].split(', ')[0];
      if(key==='room'){e.wallIndex='';delete e.wallKey}
      if(key==='ref'&&e.wallIndex!==''&&roomOf(p,e)){
        const distance=parseNumber(draft.offset),length=millimetres(wlen(roomOf(p,e),Number(e.wallIndex)));
        if(Number.isFinite(distance)&&distance>=0&&distance<=length)draft.offset=String(Number((length-distance).toFixed(6)));
      }
      draw();
    };
    form.addEventListener('focusin',ev=>{measuring=Object.hasOwn(fields,ev.target.name)?ev.target:null});
    form.onsubmit=ev=>{
      ev.preventDefault();read();
      const record={...e};
      for(const [k,v] of Object.entries(draft)){
        if(v===originalNumber(k))continue;
        const n=parseNumber(v);
        record[k]=n==null?null:n/(k==='slope'?1:1000);
      }
      if([...Object.keys(fields),'slope'].some(k=>record[k]!=null&&(!Number.isFinite(record[k])||Math.abs(record[k])>10000||(!['x','y','slope','height'].includes(k)&&record[k]<0)))){alert('Проверьте числовые поля');return}
      const r=roomOf(p,e),wall=e.wallIndex!==''&&e.wallIndex!=null?r?.walls[Number(e.wallIndex)]:null;
      if(e.surface==='Стена'&&wall&&record.offset>wlen(r,Number(e.wallIndex))){alert('Расстояние превышает длину стены');return}
      const previousKey=wall?.engKey;
      if(e.surface==='Стена'&&wall){wall.engKey=previousKey||id();record.wallKey=wall.engKey}else delete record.wallKey;
      delete record.wallIndex;record.date=record.date||new Date().toISOString();
      if(commit(p,()=>{p.engineering=items(p).some(v=>v.id===record.id)?items(p).map(v=>v.id===record.id?record:v):items(p).concat(record)})){d.close();render()}else if(wall&&!previousKey)delete wall.engKey;
    };
    d.onclose=()=>{measuring=null;dialog=null;d.remove()};d.querySelector('[data-close]').onclick=()=>d.close();draw();d.showModal();
  }
  document.addEventListener('click',ev=>{
    const b=ev.target.closest('[data-eng]'),p=P();if(!b||!p)return;
    const e=items(p).find(x=>x.id===b.dataset.id),action=b.dataset.eng;
    if(action==='new'){
      const room=p.rooms.find(r=>r.id===b.dataset.room);
      const preset=pipeButtons[b.dataset.pipe];
      const wall=Number(b.dataset.wall)||(room&&preset?defWall28(room,'socket'):0);
      const source=room?{room:room.id,wallIndex:room.walls[wall-1]?wall-1:''}:{};
      if(preset)Object.assign(source,{group:preset.group,type:preset.type,end:!leftIsStart27(room)});
      editor(p,source,{chooseType:!preset,chooseRoom:!room});return;
    }
    if(!e)return;
    if(action==='edit'){editor(p,e);return}
    if(action==='photo'||action==='camera'){Eng.pick(p,e,action==='camera'?'camera':'gallery');return}
    if(action==='delete'&&!confirm('Удалить инженерный элемент?'))return;
    const oldPhotos=(p.engMedia?.photos||[]).map(f=>f.id);
    const copy={...e,id:id(),date:new Date().toISOString()};
    if(!commit(p,()=>{
      p.engineering=action==='copy'?items(p).concat(copy):items(p).filter(x=>x!==e);
      if(p.engMedia)p.engMedia={...p.engMedia,photos:p.engMedia.photos.map(f=>({...f,elements:action==='copy'&&f.elements.includes(e.id)?f.elements.concat(copy.id):action==='delete'?f.elements.filter(k=>k!==e.id):f.elements})).filter(f=>f.elements.length)};
    }))return;
    if(action==='delete'){const used=new Set(DB.projects.flatMap(p=>mediaOwners(p).flatMap(r=>(r.photos||[]).map(f=>f.id))));const unused=oldPhotos.filter(id=>!used.has(id));if(unused.length)PHDB.removeAll(unused).catch(storageStatus)}
    render();
  });
  document.addEventListener('input',ev=>{
    if(ev.target.id==='eng-search')term=ev.target.value;
    else if(ev.target.id==='eng-filter')filter=ev.target.value;
    else if(ev.target.id==='eng-loose')onlyLoose=ev.target.checked;
    else return;
    document.getElementById('eng-results').innerHTML=rows(P());fillPh27();
  });
  document.addEventListener('change',ev=>{
    const p=P(),k=ev.target.dataset.layer;
    if(p&&k&&Object.hasOwn(groups,k)){commit(p,()=>p.engineeringLayers={...p.engineeringLayers,[k]:ev.target.checked});render()}
  });
  function measure(v){
    if(!dialog?.open)return false;
    if(measuring===document.activeElement&&measuring&&Number.isFinite(v)&&v>0){measuring.value=String(Math.round(v*1000));toast('Замер записан в активное поле, мм')}
    else toast('Выберите поле размера в миллиметрах');
    return true;
  }
  return {groups,items,inRoom,anchor,outside,visible,label,tone,formatMm,list,roomStep,editor,measure,validate};
})();
