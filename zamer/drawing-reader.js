/* Offline readers return preview-space geometry. Only confirmed paths enter a project. */
const DrawingReader=(()=>{
 const extent=1200, limit=24000;
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 function canvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c}
 function chain(paths){
  const edges=[],nodes=new Map(),out=[];
  const key=p=>p.map(x=>Math.round(x*100)).join(',');
  for(const path of paths){
   if(path.closed&&path.pts.length>=3){out.push(path);continue}
   if(path.pts.length<2)continue;
   const e={path,a:key(path.pts[0]),b:key(path.pts.at(-1))};edges.push(e);
   for(const k of [e.a,e.b]){if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(e)}
  }
  for(const e of edges){if(e.used)continue;e.used=true;const pts=e.path.pts.slice();let k=e.b;
   while(k!==e.a&&pts.length<1000){const group=nodes.get(k);if(group?.length!==2)break;
    const next=group.find(x=>!x.used);if(!next||next.path.layer!==e.path.layer)break;next.used=true;
    const forward=next.a===k,more=forward?next.path.pts:next.path.pts.slice().reverse();pts.push(...more.slice(1));k=forward?next.b:next.a;
   }
   if(k===e.a&&pts.length>=4)out.push({layer:e.path.layer,closed:true,pts:pts.slice(0,-1)});
  }
  return out.filter(x=>x.pts.length>=3&&x.pts.length<=1000).slice(0,200);
 }
 function dxf(text){
  if(text.startsWith('AutoCAD Binary'))throw Error('Нужен текстовый DXF, сохраните чертёж в ASCII DXF');
  const lines=text.replace(/\r/g,'').trimEnd().split('\n');if(lines.length>650000)throw Error('Слишком много объектов DXF');
  let entities=false,units=0,poly=null,current=null;
  const paths=[],labels=[],unknown=new Set();
  function finishPoly(){if(poly&&poly.pts.length>1&&!poly.curved)paths.push(poly);if(poly?.curved)unknown.add('POLYLINE с дугой');poly=null}
  function flush(){
   if(!current)return;const {name,tags}=current;
   const get=(k)=>tags.find(x=>x[0]===k)?.[1],n=k=>get(k)==null?NaN:Number(get(k)),pt=(a,b)=>[n(a),-n(b)];
   const layer=get(8)||'0';
   if(name==='SECTION'){entities=get(2)==='ENTITIES';return}if(name==='ENDSEC'){finishPoly();entities=false;return}if(!entities)return;
   if(name!=='VERTEX'&&name!=='SEQEND')finishPoly();
   if(name==='POLYLINE'){poly={pts:[],layer,closed:!!(n(70)&1)};return}
   if(name==='VERTEX'&&poly){poly.pts.push(pt(10,20));if(n(42))poly.curved=true;return}
   if(name==='SEQEND'){finishPoly();return}
   if(name==='LWPOLYLINE'){
    if(tags.some(([k,v])=>k===42&&Number(v))){unknown.add('LWPOLYLINE с дугой');return}
    const ys=tags.filter(x=>x[0]===20);const pts=tags.filter(x=>x[0]===10).map((x,i)=>[Number(x[1]),-Number(ys[i]?.[1])]);paths.push({layer,pts,closed:!!(n(70)&1)});
   }else if(name==='LINE')paths.push({layer,pts:[pt(10,20),pt(11,21)]});
   else if(['TEXT','MTEXT','DIMENSION'].includes(name)){const value=get(1)||get(42);if(value&&value!=='<>')labels.push({value,pt:pt(10,20),layer})}
   else unknown.add(name);
  }
  for(let i=0;i+1<lines.length;i+=2){const k=Number(lines[i]),v=lines[i+1].trim();if(k===9&&v==='$INSUNITS')units=Number(lines[i+3]);if(k===0){flush();current={name:v,tags:[]}}else if(current)current.tags.push([k,v])}flush();finishPoly();
  if(paths.length>limit||paths.reduce((s,p)=>s+p.pts.length,0)>80000)throw Error('Слишком сложный DXF. Сохраните отдельно один этаж.');
  const clean=paths.filter(p=>p.pts.length>1&&p.pts.every(q=>q.every(Number.isFinite)));
  if(!clean.length)throw Error('В DXF не найдены поддерживаемые линии или полилинии');
  const all=clean.flatMap(x=>x.pts),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
  const w=Math.max(...xs)-x,h=Math.max(...ys)-y,s=(extent-30)/Math.max(w,h,1e-9),map=q=>[15+(q[0]-x)*s,15+(q[1]-y)*s];
  const image=canvas(w*s+30,h*s+30),ctx=image.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,image.width,image.height);ctx.strokeStyle='#283743';
  for(const p of clean){p.pts=p.pts.map(map);ctx.beginPath();p.pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(p.closed)ctx.closePath();ctx.stroke()}
  ctx.font='13px sans-serif';ctx.fillStyle='#365873';for(const l of labels.slice(0,1500))if(l.pt.every(Number.isFinite))ctx.fillText(l.value.slice(0,90),...map(l.pt));
  const factors={1:.0254,2:.3048,4:.001,5:.01,6:1,7:1000,10:.9144,14:.1};
  return {image,shapes:chain(clean),scale:factors[units]?factors[units]/s:null,texts:labels.map(x=>x.value),note:'Слои: '+[...new Set(clean.map(p=>p.layer))].slice(0,20).join(', ')+'. '+(factors[units]?'Единицы взяты из $INSUNITS.':'Единицы отсутствуют или неизвестны. Нужна калибровка.')+(unknown.size?' Пропущены: '+[...unknown].slice(0,20).join(', '):'')};
 }
 const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
 function vector(ops,viewport){
  const O=pdfjsLib.OPS,stack=[],paths=[];let m=viewport.transform,cur=[],unknown=false,curved=false;
  const map=(x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  function flush(closed=false){if(!curved&&cur.length>1){if(dist(cur[0],cur.at(-1))<.03){closed=true;cur.pop()}paths.push({pts:cur,closed,layer:'PDF'})}cur=[];curved=false}
  for(let i=0;i<ops.fnArray.length&&paths.length<limit;i++){
   const f=ops.fnArray[i],a=ops.argsArray[i];if(f===O.save)stack.push(m);else if(f===O.restore)m=stack.pop()||viewport.transform;else if(f===O.transform)m=multiply(m,a);
   else if(f===O.paintFormXObjectBegin){stack.push(m);if(a?.[0])m=multiply(m,a[0])}else if(f===O.paintFormXObjectEnd)m=stack.pop()||viewport.transform;
   else if(f===O.constructPath){let j=0;for(const op of a[0]){
    const b=a[1];if(op===O.moveTo){flush();cur=[map(b[j++],b[j++])]}else if(op===O.lineTo)cur.push(map(b[j++],b[j++]));
    else if(op===O.rectangle){flush();const [x,y,w,h]=b.slice(j,j+4);j+=4;cur=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(q=>map(...q));flush(true)}
    else if(op===O.closePath)flush(true);else if([O.curveTo,O.curveTo2,O.curveTo3].includes(op)){j+=op===O.curveTo?6:4;curved=true;unknown=true}
   }}else if([O.stroke,O.fill,O.eoFill,O.fillStroke,O.eoFillStroke,O.endPath,O.closeStroke,O.closeFillStroke,O.closeEOFillStroke].includes(f))flush([O.closeStroke,O.closeFillStroke,O.closeEOFillStroke].includes(f));
  }
  flush();return {shapes:chain(paths),unknown};
 }
 function script(path){return new Promise((yes,no)=>{const el=document.createElement('script');el.src=path;el.onload=yes;el.onerror=()=>no(Error('Не удалось открыть локальный модуль PDF'));document.head.append(el)})}
 async function open(file){
  if(!file?.size||file.size>32*1048576)throw Error('Выберите непустой файл размером до 32 МБ');
  const ext=file.name.split('.').pop().toLowerCase().replace(/^jpeg$/,'jpg');
  if(ext==='pdf'){
   if(!window.pdfjsLib)await script('pdf-local.js');pdfjsLib.GlobalWorkerOptions.workerSrc=new URL('pdf-worker.js',document.baseURI).href;
   if(location.protocol==='file:'&&!window.pdfjsWorker)await script('pdf-worker.js');
   const task=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false,stopAtErrors:true,maxImageSize:24e6,useSystemFonts:true});
   const pdf=await task.promise;
   return {ext,count:pdf.numPages,close:()=>pdf.destroy(),async page(n){
    const page=await pdf.getPage(n),unit=page.getViewport({scale:1}),vp=page.getViewport({scale:extent/Math.max(unit.width,unit.height)});
    const image=canvas(vp.width,vp.height);await page.render({canvasContext:image.getContext('2d'),viewport:vp}).promise;
    const op=await page.getOperatorList(),v=vector(op,vp),labels=await page.getTextContent();page.cleanup();
    return {image,shapes:v.shapes.length?v.shapes:raster(image),texts:labels.items.map(x=>x.str).filter(Boolean),note:v.shapes.length?'Векторные контуры PDF требуют проверки.'+(v.unknown?' Кривые проверьте по подложке.':''):'Растровая подложка. Предложения по замкнутым областям приблизительны; можно обвести вручную.'};
   }};
  }
  if(ext==='dxf'){const raw=await file.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw)}catch{text=new TextDecoder('windows-1251').decode(raw)}const result=dxf(text);return {ext,count:1,page:async()=>result,close(){}}}
  if(!['jpg','png'].includes(ext))throw Error('Поддерживаются PDF, JPG, PNG и текстовый DXF');
  const url=URL.createObjectURL(file);try{const im=new Image();im.src=url;await im.decode();if(im.width*im.height>55e6)throw Error('Изображение слишком велико для обработки');
   const s=Math.min(1,extent/Math.max(im.width,im.height)),image=canvas(im.width*s,im.height*s),ctx=image.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(im,0,0,image.width,image.height);
   return {ext,count:1,page:async()=>({image,shapes:raster(image),texts:[],note:'Проверьте контуры по оригиналу. Надписи и проёмы подтвердите вручную.'}),close(){}};
  }finally{URL.revokeObjectURL(url)}
 }
 /* Find enclosed light components. Trace their actual pixel boundaries, then simplify. */
 function raster(image){
  const s=Math.min(1,400/Math.max(image.width,image.height)),c=canvas(image.width*s,image.height*s),w=c.width,h=c.height;
  const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(image,0,0,w,h);const a=cx.getImageData(0,0,w,h).data,mask=new Uint8Array(w*h),queue=new Int32Array(w*h),out=[];
  for(let i=0;i<mask.length;i++)mask[i]=Math.min(a[i*4],a[i*4+1],a[i*4+2])<195?1:0;
  for(let start=0;start<mask.length;start++){if(mask[start])continue;let tail=1,border=false;queue[0]=start;mask[start]=2;
   for(let k=0;k<tail;k++){const i=queue[k],x=i%w,y=Math.floor(i/w);if(!x||!y||x===w-1||y===h-1)border=true;
    for(const n of [x?i-1:-1,x<w-1?i+1:-1,i-w,i+w])if(n>=0&&n<mask.length&&!mask[n]){mask[n]=2;queue[tail++]=n}}
   if(border||tail<Math.max(55,w*h*.0015)||out.length>=100)continue;
   const edges=new Map(),key=(x,y)=>y*(w+1)+x,put=(x,y,a,b)=>edges.set(key(x,y),key(a,b));
   const cells=new Set(queue.subarray(0,tail));
   for(const i of cells){const x=i%w,y=Math.floor(i/w);if(!cells.has(i-w))put(x,y,x+1,y);if(!cells.has(i+1))put(x+1,y,x+1,y+1);if(!cells.has(i+w))put(x+1,y+1,x,y+1);if(!cells.has(i-1))put(x,y+1,x,y)}
   const first=edges.keys().next().value,path=[];let p=first;
   do{path.push([p%(w+1),Math.floor(p/(w+1))]);const next=edges.get(p);edges.delete(p);p=next}while(p!=null&&p!==first&&path.length<16000);
   if(p!==first||path.length<4)continue;
   const result=simplify(path.concat([path[0]]),1.8).slice(0,-1);
   if(result.length>=3&&result.length<=120)out.push({pts:result.map(([x,y])=>[x*image.width/w,y*image.height/h]),closed:true,layer:'Область скана'});
  }
  return out;
 }
 function simplify(p,tol){if(p.length<=2)return p;const a=p[0],b=p.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;let best=tol,idx=0;
  for(let i=1;i<p.length-1;i++){const t=Math.max(0,Math.min(1,((p[i][0]-a[0])*dx+(p[i][1]-a[1])*dy)/(den||1))),d=dist(p[i],[a[0]+t*dx,a[1]+t*dy]);if(d>best){best=d;idx=i}}
  return idx?[...simplify(p.slice(0,idx+1),tol).slice(0,-1),...simplify(p.slice(idx),tol)]:[a,b];
 }
 return {open,dxf,raster,dist};
})();