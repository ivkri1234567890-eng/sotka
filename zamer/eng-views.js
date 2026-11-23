function engMarkers(p,r,map,size){
 if(!p)return '';
 return Eng.items(p).map((e,n)=>{
  const a=Eng.anchor(p,e);
  if(!a||a.r?.id!==r?.id||!Eng.visible(p,e))return '';
  const [x,y]=map(a.xy);
  return '<g data-eng-marker="'+esc(e.id)+'"><circle cx="'+x+'" cy="'+y+'" r="'+size+'" fill="'+Eng.tone(e)+'"/>'+tx27(x,y+size*.36,String(n+1),{s:size*1.1,c:'#fff',mid:1})+'</g>';
 }).join('');
}
function engElev(p,r,i,X,Y,k){
 const occupied=[];
 if(!p)return '';
 return Eng.items(p).map((e,n)=>{
  const a=Eng.anchor(p,e);
  if(!a||a.r?.id!==r.id||a.i!==i||e.height==null||!Eng.visible(p,e))return '';
  const x=X(a.offset),y=Y(e.height),w=(e.width||e.diameter||0)*k,h=(e.sizeH||e.diameter||0)*k;
  const start=e.end?physicalWallLength(r,i):0,baseX=X(start),baseY=Y(0),col=Eng.tone(e);
  let labelX=x+2,labelY=y-2;
  while(occupied.some(q=>Math.abs(q[0]-labelX)<20&&Math.abs(q[1]-labelY)<3))labelY+=3;
  occupied.push([labelX,labelY]);
  const guide='<path d="M '+baseX+' '+y+' H '+x+' V '+baseY+'" fill="none" stroke="'+col+'" stroke-width=".15" stroke-dasharray="1 1"/>';
  const text=(n+1)+' · '+Math.round(e.offset*1000)+' / '+Math.round(e.height*1000)+(e.diameter?' Ø'+Eng.formatMm(e.diameter):'');
  return guide+'<rect x="'+(x-w/2)+'" y="'+(y-h/2)+'" width="'+w+'" height="'+h+'" fill="none" stroke="'+Eng.tone(e)+'" stroke-width=".35"/><circle cx="'+x+'" cy="'+y+'" r="1.4" fill="'+Eng.tone(e)+'"/>'+tx27(labelX,labelY,text,{s:1.9,a:'start',c:col});
 }).join('');
}
function engTable(p){
 const data=Eng.items(p);
 const pages=[];
 for(let i=0;i<data.length;i+=13){
  let body=tx27(18,18,'Ведомость инженерных элементов · размеры в мм',{s:5,a:'start'});
  data.slice(i,i+13).forEach((e,j)=>{
   const a=Eng.anchor(p,e),y=31+j*19;
   body+=tx27(18,y,(i+j+1)+'. '+Eng.label(e)+' · '+(a?.r?.name||e.zone||'без привязки')+' · '+e.status+' · '+e.accuracy,{s:3.6,a:'start'});
   const dims=Object.entries({offset:'От угла',height:'Уровень',diameter:'Ø',width:'Ширина',sizeH:'Высота',depth:'Глубина',projection:'Выступ',x:'X',y:'Y'}).filter(([k])=>e[k]!=null).map(([k,v])=>v+' '+(k==='diameter'?Eng.formatMm(e[k]):Math.round(e[k]*1000)));
   body+=tx27(24,y+6,[a?.i!=null?'Стена '+(a.i+1)+(e.end?' от конца':' от начала'):e.surface,...dims,e.base].join(' · '),{s:2.8,a:'start'});
   body+=tx27(24,y+11,[Eng.groups[e.group][0],e.zone,e.slope!=null?'Уклон '+e.slope+'%':'',e.direction,e.comment].filter(Boolean).join(' · ').slice(0,160),{s:2.4,a:'start'});
  });
  pages.push({svg:wrapSheet27(body),title:'Инженерная ведомость '+(pages.length+1)});
 }
 return pages;
}
async function engPhotoSheets(p){
 const photos=p.rooms.flatMap(r=>(r.photos||[]).map(f=>({id:f.id,title:r.name+(f.wall?' · стена '+f.wall:' · общее фото')}))).concat(p.engMedia?.photos||[]),pages=[];
 for(let i=0;i<photos.length;i+=4){
  let body=tx27(16,16,'Фотофиксация объекта',{s:5,a:'start'});
  for(const [j,f] of photos.slice(i,i+4).entries()){
   const x=16+(j%2)*197,y=28+Math.floor(j/2)*127;
   const names=f.title?[f.title]:Eng.items(p).filter(e=>f.elements?.includes(e.id)).map(e=>Eng.label(e));
   const record=await PHDB.get(f.id);
   if(!record)throw Error('Отсутствует фото '+f.id);
   body+=tx27(x,y,names.join(', ').slice(0,78),{s:3.2,a:'start'});
   if(record.data&&record.data.startsWith('data:image/jpeg;base64,'))body+='<image x="'+x+'" y="'+(y+4)+'" width="185" height="112" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="'+record.data+'"/>';
   else body+=tx27(x,y+20,'Оригинал приложен в ZIP. Предпросмотр формата недоступен.',{s:2.7,a:'start'});
  }
  pages.push({svg:wrapSheet27(body),title:'Фото объекта '+(pages.length+1)});
 }
 return pages;
}
function engDxf(p,r,D,M){
 for(const e of Eng.items(p)){
  const a=Eng.anchor(p,e);
  if(!a||a.r!==r||!Eng.visible(p,e))continue;
  const layer='ENG_'+e.group.toUpperCase(),xy=M(a.xy);
  D.L(layer,4);D.circle(layer,xy,Math.max(30,(e.diameter||0)*500));D.text(layer,[xy[0]+65,xy[1]+65],65,Eng.label(e),0);
 }
}
function eng3d(T,p,grp){
 if(p.engineering3d===false)return;
 for(const e of Eng.items(p)){
  const a=Eng.anchor(p,e);
  if(!a||!Eng.visible(p,e)||e.height==null)continue;
  const q=a.r?roomGlobal(p,a.r)(a.xy):a.xy;
  const mesh=new T.Mesh(new T.BoxGeometry(e.width||e.diameter||.09,e.sizeH||e.diameter||.09,e.depth||.09),new T.MeshBasicMaterial({color:Eng.tone(e)}));
  if(a.i!=null){const t=geo(a.r).segments[a.i].tangent(.5),g=roomGlobal(p,a.r),u=g(t),o=g([0,0]);mesh.rotation.y=-Math.atan2(u[1]-o[1],u[0]-o[0])}
  mesh.position.set(q[0],e.height,q[1]);grp.add(mesh);
 }
}
document.addEventListener('change',ev=>{if(ev.target.id==='scene-floor3'){UI.viewFloor3=ev.target.value;render()}if(ev.target.id==='eng-show3d'){const p=P(),old=p.engineering3d;p.engineering3d=ev.target.checked;if(!save())p.engineering3d=old;render()}});
document.addEventListener('pointerdown',ev=>{
 const marker=ev.target.closest('[data-eng-marker]'),svg=marker?.closest('svg[data-view]');if(!svg)return;
 const p=P(),e=Eng.items(p).find(x=>x.id===marker.dataset.engMarker),r=e&&p.rooms.find(r=>r.id===e.room);if(!e)return;
 ev.stopImmediatePropagation();ev.preventDefault();svg.setPointerCapture(ev.pointerId);
 const origin=[ev.clientX,ev.clientY];
 const end=event=>{
  clear();if(Math.hypot(event.clientX-origin[0],event.clientY-origin[1])<5){Eng.editor(p,e);return}
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const transform=VIEWS28[svg.dataset.view]?.T?.[r?.id||'~site'];if(!transform){Eng.editor(p,e);return}const xy=affInv28(transform)([point.x,point.y]);
  const change={...e,accuracy:'Приблизительно'};
  if(e.surface==='Стена'){
   const wall=nearestWall23(r,xy);if(!wall)return;
   change.wallIndex=wall.wall-1;change.end=false;change.offset=wall.offset;
  }else{[change.x,change.y]=xy}
  Eng.editor(p,change);
 };
 const clear=()=>{svg.removeEventListener('pointerup',end);svg.removeEventListener('pointercancel',clear)};
 svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',clear);
},true);
