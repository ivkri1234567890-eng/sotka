/* Convert reviewed preview coordinates to the application's existing editable room model. */
const DrawingProject=(()=>{
 const distance=DrawingReader.dist;
 function checkShape(points){
  if(!Array.isArray(points)||points.length<3||points.length>1000||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw Error('Нужен замкнутый контур из 3–1000 вершин');
  const next=i=>points[(i+1)%points.length],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const between=(a,b,c)=>Math.abs(cross(a,b,c))<1e-7&&c[0]>=Math.min(a[0],b[0])-1e-8&&c[0]<=Math.max(a[0],b[0])+1e-8&&c[1]>=Math.min(a[1],b[1])-1e-8&&c[1]<=Math.max(a[1],b[1])+1e-8;
  let area=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=next(i);
   if(distance(a,b)<1e-5)throw Error('Совпадают соседние вершины контура');
   area+=a[0]*b[1]-a[1]*b[0];
   for(let j=i+2;j<points.length;j++){
    if(!i&&j===points.length-1)continue;
    const c=points[j],d=next(j);
    if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||between(a,b,c)||between(a,b,d)||between(c,d,a)||between(c,d,b))throw Error('Контур пересекает сам себя');
   }
  }
  if(Math.abs(area)<1e-5)throw Error('Нулевая площадь контура');return Math.abs(area)/2;
 }
 function calibration(controls,unitScale){
  if(!controls.length&&!unitScale)throw Error('Укажите контрольный размер на этой странице');
  const scales=controls.map(c=>{const span=distance(c.a,c.b);if(span<2||!Number.isFinite(c.mm)||c.mm<=0)throw Error('Неверный контрольный отрезок');return c.mm/1000/span});
  const values=unitScale?[unitScale,...scales]:scales,scale=values[0];
  if(values.some(s=>!Number.isFinite(s)||s<=0||Math.abs(s/scale-1)>.02))throw Error('Контрольные размеры расходятся более чем на 2%. Проверьте единицы, точки или перспективу.');
  return scale;
 }
 function roomFrom(d){
  if(!d.name?.trim()||!(d.h>0&&Number.isFinite(d.h)&&d.h<=100))throw Error('Укажите название и фактическую высоту помещения до 100 м');
  const pts=d.points.map(p=>p.map(v=>v*d.scale));checkShape(pts);
  const heads=pts.map((a,i)=>{const b=pts[(i+1)%pts.length];return Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI});
  const walls=pts.map((a,i)=>({len:distance(a,pts[(i+1)%pts.length]),t:i?(heads[i]-heads[i-1]+540)%360-180:0}));
  if(walls.some(w=>w.len<.005||w.len>10000))throw Error('Проверьте масштаб и длины стен');
  const ops=(d.ops||[]).map(o=>({...o}));
  for(const [i,o] of ops.entries()){
   const L=walls[o.wall-1]?.len;
   if(!L||!Number.isInteger(o.wall)||!['door','window'].includes(o.type)||![o.w,o.h,o.offset,o.sill??0].every(Number.isFinite)||o.w<=0||o.h<=0||o.offset<0||o.offset+o.w>L+.0001||(o.sill||0)<0||o.h+(o.sill||0)>d.h+.0001)throw Error('Проверьте размеры, стену и высоту проёма '+(i+1));
   if(ops.slice(0,i).some(b=>b.wall===o.wall&&Math.min(b.offset+b.w,o.offset+o.w)-Math.max(b.offset,o.offset)>.0001))throw Error('Проёмы перекрываются');
  }
  const room={id:uid()+uid(),name:d.name.trim(),h:d.h,closed:true,drawingHeading:heads[0],walls,ops,fin:{},cnt:{},drawingReview:{page:d.page,method:d.method,geometry:'Подтверждено по чертежу',dimensions:'Расчётное',controls:d.controls,metersPerPixel:d.scale}};
  return {room,position:{x:Math.min(...pts.map(p=>p[0])),y:Math.min(...pts.map(p=>p[1])),rot:0}};
 }
 function validateRef(p){
  for(const r of p.rooms)if(r.drawingHeading!=null&&(!Number.isFinite(r.drawingHeading)||Math.abs(r.drawingHeading)>360))throw Error('Повреждён угол помещения');
  const ref=p.drawingSource;if(ref&&(!/^[a-zA-Z0-9_-]{1,80}$/.test(ref.id)||!['pdf','jpg','png','dxf'].includes(ref.ext)||typeof ref.name!=='string'||!Number.isSafeInteger(ref.size)||ref.size<=0||ref.size>32*1048576))throw Error('Повреждена ссылка на исходный чертёж');
 }
 async function create(name,kind,drafts,file,ext,keep){
  if(!drafts.length)throw Error('Сначала подтвердите хотя бы одно помещение');
  if(!name.trim())throw Error('Введите название объекта');
  const p={id:uid()+uid(),name:name.trim(),kind,v:DB.settings.variant||'s',date:today(),ts:Date.now(),rooms:[],layout:{},client:''},floors=new Map();
  for(const d of drafts){const {room,position}=roomFrom(d);
   if(kind==='house'){const title=d.floor?.trim();if(!title)throw Error('Укажите этаж для каждой комнаты дома');if(!floors.has(title))floors.set(title,{id:uid()+uid(),name:title});const floor=floors.get(title);if(d.level!=null){if(!Number.isFinite(d.level)||Math.abs(d.level)>1000||floor.level!=null&&Math.abs(floor.level-d.level)>.001)throw Error('Проверьте отметку пола для этажа «'+title+'»');floor.level=d.level}room.floor=floor.id}
   p.rooms.push(room);p.layout[room.id]=position;
  }
  if(kind==='house')p.floors=[...floors.values()];
  if(keep)p.drawingSource={id:uid()+uid(),name:file.name,ext,size:file.size};
  validateBackup({projects:[p],settings:DB.settings});
  if(keep)await PHDB.putAll([{id:p.drawingSource.id,source:file,projectId:p.id}]);
  try{const next={...DB,projects:[...DB.projects,p]};writeDB(next);DB.projects=next.projects}
  catch(err){if(keep)await PHDB.removeAll([p.drawingSource.id]).catch(console.warn);throw err}
  return p;
 }
 return {validateRef,checkShape,calibration,roomFrom,create};
})();