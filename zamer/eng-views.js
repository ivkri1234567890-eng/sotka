function engMarkers(p,r,map,size){
 if(!p)return '';
 return Eng.items(p).map((e,n)=>{
  const a=Eng.anchor(p,e);
  if(!a||a.r.id!==r.id||!Eng.visible(p,e))return '';
  const [x,y]=map(a.xy);
  return '<g data-eng-marker="'+esc(e.id)+'"><circle cx="'+x+'" cy="'+y+'" r="'+size+'" fill="'+Eng.tone(e)+'"/>'+tx27(x,y+size*.36,String(n+1),{s:size*1.1,c:'#fff',mid:1})+'</g>';
 }).join('');
}
function engElev(p,r,i,X,Y,k){
 if(!p)return '';
 return Eng.items(p).map((e,n)=>{
  const a=Eng.anchor(p,e);
  if(!a||a.r.id!==r.id||a.i!==i||e.height==null||!Eng.visible(p,e))return '';
  const x=X(a.offset),y=Y(e.height),w=(e.width||e.diameter||0)*k,h=(e.sizeH||e.diameter||0)*k;
  return '<rect x="'+(x-w/2)+'" y="'+(y-h/2)+'" width="'+w+'" height="'+h+'" fill="none" stroke="'+Eng.tone(e)+'" stroke-width=".35"/><circle cx="'+x+'" cy="'+y+'" r="1.4" fill="'+Eng.tone(e)+'"/>'+tx27(x+2,y-1,String(n+1),{s:2,a:'start'});
 }).join('');
}
function engTable(p){
 const data=Eng.items(p);
 const pages=[];
 for(let i=0;i<data.length;i+=13){
  let body=tx27(18,18,'Ведомость инженерных элементов · размеры в мм',{s:5,a:'start'});
  data.slice(i,i+13).forEach((e,j)=>{
   const a=Eng.anchor(p,e),y=31+j*19;
   body+=tx27(18,y,(i+j+1)+'. '+Eng.label(e)+' · '+(a?.r.name||e.zone||'без привязки')+' · '+e.status+' · '+e.accuracy,{s:3.6,a:'start'});
   const dims=Object.entries({offset:'От угла',height:'Уровень',diameter:'Ø',width:'Ширина',sizeH:'Высота',depth:'Глубина'}).filter(([k])=>e[k]!=null).map(([k,v])=>v+' '+Math.round(e[k]*1000));
   body+=tx27(24,y+7,[a?.i!=null?'Стена '+(a.i+1):e.surface,...dims,e.base].join(' · '),{s:3,a:'start'});
  });
  pages.push({svg:wrapSheet27(body),title:'Инженерная ведомость '+(pages.length+1)});
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
  const q=roomGlobal(p,a.r)(a.xy);
  const mesh=new T.Mesh(new T.BoxGeometry(e.width||e.diameter||.09,e.sizeH||e.diameter||.09,e.depth||.09),new T.MeshBasicMaterial({color:Eng.tone(e)}));
  mesh.position.set(q[0],e.height,q[1]);grp.add(mesh);
 }
}
document.addEventListener('change',ev=>{if(ev.target.id==='eng-show3d'){const p=P(),old=p.engineering3d;p.engineering3d=ev.target.checked;if(!save())p.engineering3d=old;render()}});
document.addEventListener('pointerdown',ev=>{
 const marker=ev.target.closest('[data-eng-marker]'),svg=marker?.closest('svg[data-view="room"]');if(!svg)return;
 const p=P(),e=Eng.items(p).find(x=>x.id===marker.dataset.engMarker),r=RM();if(!r||!e)return;
 ev.stopImmediatePropagation();ev.preventDefault();svg.setPointerCapture(ev.pointerId);
 const origin=[ev.clientX,ev.clientY];
 const end=event=>{
  clear();if(Math.hypot(event.clientX-origin[0],event.clientY-origin[1])<5){Eng.editor(p,e);return}
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const view=planPrims(r,600,440,46),xy=[(point.x-view.ox)/view.s,(point.y-view.oy)/view.s];
  const change={...e,accuracy:'Приблизительно'};
  if(e.surface==='Стена'){
   const wall=nearestWall23(r,xy);if(!wall)return;
   if(!r.walls[wall.wall-1].engKey)r.walls[wall.wall-1].engKey=uid()+uid();
   change.wallKey=r.walls[wall.wall-1].engKey;change.end=false;change.offset=wall.offset;
  }else{[change.x,change.y]=xy}
  Eng.editor(p,change);
 };
 const clear=()=>{svg.removeEventListener('pointerup',end);svg.removeEventListener('pointercancel',clear)};
 svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',clear);
},true);