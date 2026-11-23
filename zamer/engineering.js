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
  const id=()=>uid()+uid();
  const items=p=>p.engineering||[];
  const opt=(v,t,cur)=>'<option value="'+esc(v)+'" '+(String(cur)===String(v)?'selected':'')+'>'+esc(t)+'</option>';
  const opts=(arr,cur)=>arr.map(v=>opt(v,v,cur)).join('');
  const tone=e=>colors[Object.keys(groups).indexOf(e.group)]||'#555';
  const label=e=>e.name||e.type;
  const roomOf=(p,e)=>p.rooms.find(r=>r.id===e.room);
  function anchor(p,e){
    const r=roomOf(p,e);
    if(!r||e.surface==='Без привязки')return null;
    if(e.surface==='Стена'){
      const i=r.walls.findIndex(w=>w.engKey&&w.engKey===e.wallKey);
      const seg=geo(r).segments[i];
      if(!seg||e.offset==null||e.offset>seg.length||seg.length<=0)return null;
      const offset=e.end?seg.length-e.offset:e.offset;
      return {r,i,offset,xy:seg.at(offset/seg.length)};
    }
    return e.x!=null&&e.y!=null?{r,xy:[e.x,e.y]}:null;
  }
  function visible(p,e){return e.visible!==false&&p.engineeringLayers?.[e.group]!==false}
  function validate(p){
    if(p.engineering==null&&!p.engMedia)return;
    if(!Array.isArray(p.engineering)||p.engineering.length>10000)throw Error('Повреждён инженерный список');
    const ids=new Set();
    for(const e of p.engineering){
      if(!e||typeof e.id!=='string'||!/^[\w-]{1,80}$/.test(e.id)||ids.has(e.id)||!Object.hasOwn(groups,e.group)||typeof e.type!=='string')throw Error('Повреждён инженерный элемент');
      ids.add(e.id);
      for(const k of [...Object.keys(fields),'slope'])if(e[k]!=null&&!Number.isFinite(e[k]))throw Error('Повреждён инженерный размер');
    }
    if(p.engMedia && (p.engMedia.id!=='~eng'||!Array.isArray(p.engMedia.photos)||p.engMedia.photos.some(f=>!f||!Array.isArray(f.elements)||typeof f.id!=='string')))throw Error('Повреждены связи инженерных фотографий');
  }
  function commit(p,fn){
    const old={engineering:p.engineering,engineeringLayers:p.engineeringLayers,engMedia:p.engMedia,engineering3d:p.engineering3d};
    fn();
    if(save())return true;
    Object.assign(p,old);return false;
  }
  let dialog, measuring, filter='', term='', onlyLoose=false;
  function list(p){
    return '<section class="card"><h3>Инженерные коммуникации</h3><button class="btn" data-eng="new">Добавить элемент</button><label class="f">Поиск<input id="eng-search" value="'+esc(term)+'"></label><label class="f">Категория<select id="eng-filter">'+opt('','Все категории',filter)+Object.entries(groups).map(([k,v])=>opt(k,v[0],filter)).join('')+'</select></label><label><input type="checkbox" id="eng-loose" '+(onlyLoose?'checked':'')+'> Без определённой привязки</label><div id="eng-results">'+rows(p)+'</div><details><summary>Слои на чертежах</summary>'+Object.entries(groups).map(([k,v])=>'<label class="eng-check"><input type="checkbox" data-layer="'+k+'" '+(p.engineeringLayers?.[k]!==false?'checked':'')+'> '+v[0]+'</label>').join('')+'</details></section>';
  }
  function rows(p){
    return items(p).filter(e=>(!filter||filter===e.group)&&(!onlyLoose||!anchor(p,e))&&[label(e),e.type,e.zone,roomOf(p,e)?.name,e.comment].join(' ').toLowerCase().includes(term.toLowerCase())).map(e=>{
      const a=anchor(p,e);
      return '<div class="card"><b>'+esc(label(e))+'</b><p>'+esc([roomOf(p,e)?.name,e.zone,a?.i!=null?'стена '+(a.i+1):a?e.surface:'без определённой привязки',e.accuracy].filter(Boolean).join(' · '))+'</p>'+['edit','copy','photo','delete'].map((k,i)=>'<button class="btn ghost" data-id="'+esc(e.id)+'" data-eng="'+k+'">'+['Изменить','Копировать','Фото','Удалить'][i]+'</button>').join('')+ thumbnails(p,e)+'</div>';
    }).join('')||'<p class="muted">Элементов по выбранным условиям пока нет.</p>';
  }
  function thumbnails(p,e){
    return (p.engMedia?.photos||[]).filter(f=>f.elements.includes(e.id)).map(f=>'<img width="72" alt="Фото элемента" data-ph27="'+esc(f.id)+'">').join('');
  }
  function editor(p,source){
    const e={id:id(),group:'water',type:'ХВС',surface:'Стена',room:p.rooms[0]?.id||'',status:statuses[0],accuracy:accuracy[0],base:'Чистовой',visible:true,...source};
    dialog=document.createElement('dialog');dialog.className='eng-dialog';
    dialog.innerHTML='<form><h3>Инженерный элемент</h3><div class="eng-fields"></div><div class="row"><button class="btn" type="submit">Сохранить</button><button class="btn sec" type="button" data-close>Отмена</button></div></form>';
    document.body.append(dialog);const d=dialog,form=d.querySelector('form');
    function read(){
      for(const [k,v] of new FormData(form)){
        if(k in fields||k==='slope')e[k]=v===''?null:Number(String(v).replace(',','.'))/(k==='slope'?1:1000);
        else e[k]=v;
      }
      if(form.elements.visible)e.visible=form.elements.visible.checked;
      if(form.elements.ref)e.end=form.elements.ref.value==='end';
    }
    function draw(){
      const r=roomOf(p,e);
      const input=(k,t,v='')=>'<label class="f">'+t+'<input maxlength="600" name="'+k+'" value="'+esc(v??'')+'"></label>';
      const sel=(k,t,v)=>'<label class="f">'+t+'<select name="'+k+'">'+v+'</select></label>';
      const nums=[...(e.surface==='Стена'?['offset']:['x','y']),'height','width','sizeH','depth','projection',...(['water','waste','heat','gas','air'].includes(e.group)?['diameter']:[])];
      form.querySelector('.eng-fields').innerHTML=sel('group','Категория',Object.entries(groups).map(([k,v])=>opt(k,v[0],e.group)).join(''))+sel('type','Тип',opts(groups[e.group][1].split(', '),e.type))+input('name','Название',e.name)+
        sel('room','Помещение',opt('','Внешняя зона / не назначено',e.room)+p.rooms.map(r=>opt(r.id,r.name,e.room)).join(''))+input('zone',p.kind==='house'?'Зона дома или участка':'Зона',e.zone)+sel('floor','Этаж зоны',opt('','По помещению',e.floor)+(p.floors||[]).map(f=>opt(f.id,f.name,e.floor)).join(''))+
        sel('surface','Поверхность',opts(surfaces,e.surface))+(e.surface==='Стена'?sel('wallIndex','Стена',opt('','Не определена',e.wallIndex)+(r?.walls||[]).map((w,i)=>opt(i,'Стена '+(i+1),e.wallIndex??(w.engKey&&w.engKey===e.wallKey?i:''))).join(''))+sel('ref','Опорный угол',opt('start','Начало стены',e.end?'end':'start')+opt('end','Конец стены',e.end?'end':'start')):'')+
        nums.map(k=>'<label class="f">'+fields[k]+', мм<input name="'+k+'" inputmode="decimal" value="'+(e[k]==null?'':Math.round(e[k]*10000)/10)+'"></label>').join('')+
        sel('base','Уровень отсчёта',opts(['Чистовой','Черновой'],e.base))+input('direction','Направление',e.direction)+(e.group==='waste'?input('slope','Измеренный уклон, %',e.slope):'')+sel('accuracy','Точность',opts(accuracy,e.accuracy))+sel('status','Состояние',opts(statuses,e.status))+input('comment','Комментарий',e.comment)+'<label class="eng-check"><input type="checkbox" name="visible" '+(e.visible?'checked':'')+'> Показывать на чертежах</label>';
    }
    form.onchange=ev=>{if(['group','room','surface'].includes(ev.target.name)){read();if(ev.target.name==='group')e.type=groups[e.group][1].split(', ')[0];if(ev.target.name==='room'){delete e.wallIndex;delete e.wallKey}draw()}};
    form.onfocusin=ev=>{measuring=Object.hasOwn(fields,ev.target.name)?ev.target:null};
    form.onsubmit=ev=>{
      ev.preventDefault();read();
      if([...Object.keys(fields),'slope'].some(k=>e[k]!=null&&(!Number.isFinite(e[k])||Math.abs(e[k])>10000||(!['x','y','slope','height'].includes(k)&&e[k]<0)))){alert('Проверьте числовые поля');return}
      const r=roomOf(p,e),wall=e.wallIndex!==''&&e.wallIndex!=null?r?.walls[Number(e.wallIndex)]:null;
      if(wall&&e.offset>wlen(r,Number(e.wallIndex))){alert('Расстояние превышает длину стены');return}
      if(e.surface==='Стена'&&wall){wall.engKey=wall.engKey||id();e.wallKey=wall.engKey}else delete e.wallKey;
      delete e.wallIndex;delete e.ref;e.date=e.date||new Date().toISOString();
      if(commit(p,()=>{p.engineering=items(p).filter(v=>v.id!==e.id).concat(e)})){d.close();render()}
    };
    d.onclose=()=>{measuring=null;dialog=null;d.remove()};d.querySelector('[data-close]').onclick=()=>d.close();draw();d.showModal();
  }
  document.addEventListener('click',ev=>{
    const b=ev.target.closest('[data-eng]'),p=P();if(!b||!p)return;
    const e=items(p).find(x=>x.id===b.dataset.id),action=b.dataset.eng;
    if(action==='new'||action==='edit'){editor(p,e);return}
    if(!e)return;
    if(action==='photo'){Eng.pick(p,e);return}
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
    if(measuring&&Number.isFinite(v)&&v>0){measuring.value=String(Math.round(v*1000));toast('Замер записан в активное поле, мм')}
    else toast('Выберите поле размера в миллиметрах');
    return true;
  }
  return {groups,items,anchor,visible,label,tone,list,editor,measure,validate};
})();