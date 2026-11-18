/* «По образцу»: понимает, как образец собран из исходников (колонки, группировка, фильтры,
   период, справочники, сортировка, итоги), и собирает тот же отчёт по новым данным. */
(function(){
'use strict';
const R=window.ObrazecRead;
const {DV,SEP,norm,normH,toNum,vkey,filled,MON}=R;

/* ---------- сходство названий ---------- */
const SYN=[['кол во','количество','шт','штук','qty','кол'],['сумма','sum','стоимость','выручка'],['менеджер','тп','торговый представитель','ответственный','продавец'],['марка','бренд','brand'],['модель','model'],['клиент','контрагент','покупатель','заказчик','владелец'],['дата','date'],['регион','область','субъект']];
const stem=w=>w.length>5?w.slice(0,5):w;
function canon(s){let t=' '+normH(s)+' ';for(const g of SYN)for(const w of g.slice(1))t=t.split(' '+w+' ').join(' '+g[0]+' ');return t.trim();}
function nameSim(a,b){
 const x=canon(a),y=canon(b);if(!x||!y)return 0;if(x===y)return 1;
 if((' '+x+' ').includes(' '+y+' ')||(' '+y+' ').includes(' '+x+' '))return 0.8;
 const A=new Set(x.split(' ').map(stem)),B=new Set(y.split(' ').map(stem));
 let i=0;for(const w of A)if(B.has(w))i++;
 return i/(A.size+B.size-i)*0.9;
}
function contain(rc,sc){
 if(!rc.keys.size||!sc.keys.size)return 0;
 let hit=0,tot=0;for(const [k] of rc.keys){if(k==='')continue;tot++;if(sc.keys.has(k))hit++;}
 return tot?hit/tot:0;
}
function rowKeys(col){return col.rk||(col.rk=col.vals.map(vkey));}
function numVals(col){
 if(col.nv)return col.nv;
 const a=new Float64Array(col.vals.length);for(let i=0;i<a.length;i++){const n=toNum(col.vals[i]);a[i]=n==null?NaN:n;}
 return col.nv=a;
}
const eq=(a,t)=>Math.abs(a-t)<0.0051+1e-9*Math.abs(t);

/* ---------- справочники: подтягиваем колонки других таблиц по ключу ---------- */
function findJoin(main,B){
 let best=null;
 for(const mk of main.cols){
  if(mk.virt||mk.type==='empty'||mk.keys.size<2)continue;
  for(const bk of B.cols){
   if(bk.virt||bk.type==='empty'||bk.keys.size<2)continue;
   if(bk.keys.size<0.8*bk.filled&&bk.keys.size<B.n*0.5)continue; // ключ справочника почти уникален
   const c=contain(mk,bk);if(c<0.6)continue;
   const sc=c+0.2*nameSim(mk.name,bk.name);
   if(!best||sc>best.score)best={mk,bk,score:sc,cont:c};
  }
 }
 return best;
}
function addLookup(main,B,mkName,bkName,targetName,vname){
 const mk=main.cols.find(c=>c.name===mkName),bk=B.cols.find(c=>c.name===bkName),bt=B.cols.find(c=>c.name===targetName);
 if(!mk||!bk||!bt)return null;
 const map=new Map(),bkk=rowKeys(bk);
 for(let j=0;j<B.n;j++){const k=bkk[j];if(k&&!map.has(k)&&filled(bt.vals[j]))map.set(k,bt.vals[j]);}
 const mkk=rowKeys(mk),vals=new Array(main.n),keys=new Map();let fil=0,miss=0;
 for(let i=0;i<main.n;i++){const v=mkk[i]?map.get(mkk[i]):undefined;vals[i]=v==null?null:v;if(v!=null){fil++;const k=vkey(v);keys.set(k,(keys.get(k)||0)+1);}else if(mkk[i])miss++;}
 const col={i:main.cols.length,c:-1,name:vname,type:bt.type,vals,keys,filled:fil,virt:{kind:'lookup',mainKey:mkName,table:B.label,key:bkName,target:targetName},miss};
 main.cols.push(col);
 return col;
}
function lookupName(B,target,mk){return target+' (справочник «'+B.label.replace(/\.(xlsx|xls|csv)$/i,'')+'»)';}

/* ---------- подгонка: группировка + меры + жадный поиск фильтров ---------- */
function fit(T,rep,dims,meas,mode,base){
 const Rn=rep.n,n=T.n;
 const gid=new Map();let G=0;const repG=new Int32Array(Rn);
 const rk=dims.map(d=>rep.cols[d.rc].vals.map(vkey));
 for(let j=0;j<Rn;j++){const k=rk.map(a=>a[j]).join(SEP);let g=gid.get(k);if(g==null){g=G++;gid.set(k,g);}repG[j]=g;}
 const nRepG=G;
 const sk=dims.map(d=>rowKeys(T.cols[d.sc]));
 const rowG=new Int32Array(n);
 for(let i=0;i<n;i++){const k=sk.map(a=>a[i]).join(SEP);let g=gid.get(k);if(g==null){g=G++;gid.set(k,g);}rowG[i]=g;}
 // цели
 const M=mode==='detail'||!meas.length?1:meas.length;
 const tgt=[];
 if(mode==='detail'||!meas.length){
  const t=new Float64Array(nRepG);for(let j=0;j<Rn;j++)t[repG[j]]+=1;tgt.push(t);
 }else for(const m of meas){
  const t=new Float64Array(nRepG).fill(NaN),vals=rep.cols[m.rc].vals;
  for(let j=0;j<Rn;j++){const v=toNum(vals[j]);const x=v==null?0:v;const g=repG[j];t[g]=isNaN(t[g])?x:t[g]+x;}
  tgt.push(t);
 }
 const pos=mode!=='detail'&&!meas.length; // список уникальных сочетаний: важно лишь «есть строки»
 // кандидаты мер (аддитивные)
 const numCols=T.cols.filter(c=>c.type==='number'&&!(c.virt&&c.virt.kind==='year')&&c.filled>0);
 const cands=[{agg:'count'}];
 const pairs=[];// по мерам: индексы кандидатов
 if(mode==='detail'||!meas.length)pairs.push([0]);
 else{
  const rankNum=m=>numCols.slice().sort((a,b)=>nameSim(rep.cols[m.rc].name,b.name)-nameSim(rep.cols[m.rc].name,a.name)).slice(0,10);
  const cache=new Map();const add=c=>{const k=JSON.stringify(c);if(!cache.has(k)){cache.set(k,cands.length);cands.push(c);}return cache.get(k);};
  for(const m of meas){
   const list=[0];
   for(const nc of rankNum(m))list.push(add({agg:'sum',col:nc.i}));
   // перекрёстная таблица: заголовок колонки = значение какой-то колонки источника
   const hk=vkey(rep.cols[m.rc].name);
   if(hk)for(const F of T.cols){if(F.keys.size>300||!F.keys.has(hk))continue;
    list.push(add({agg:'count',cond:{col:F.i,key:hk}}));
    for(const nc of rankNum(m).slice(0,3))list.push(add({agg:'sum',col:nc.i,cond:{col:F.i,key:hk}}));
   }
   pairs.push(list);
  }
 }
 const C=cands.length;
 const cNum=cands.map(c=>c.agg==='sum'?numVals(T.cols[c.col]):null);
 const cCond=cands.map(c=>c.cond?{k:rowKeys(T.cols[c.cond.col]),v:c.cond.key}:null);
 const contrib=new Float64Array(C);
 function rowContrib(i){
  for(let c=0;c<C;c++){
   const cd=cCond[c];if(cd&&cd.k[i]!==cd.v){contrib[c]=0;continue;}
   if(c===0||cands[c].agg==='count')contrib[c]=1;else{const v=cNum[c][i];contrib[c]=v===v?v:0;}
  }
 }
 // фильтруемые колонки
 const fcols=[];
 for(const F of T.cols){
  if(F.type==='empty')continue;
  const d=F.keys.size+(F.filled<n?1:0);
  if(d>60||F.type==='number'&&!F.virt&&F.keys.size>12||F.type==='date'&&!F.virt){
   // много разных значений: проверяем только правило «без пустых»
   if(F.filled<n&&F.filled>0&&!F.virt){const k=rowKeys(F),vi=new Int16Array(n);for(let i=0;i<n;i++)vi[i]=k[i]?1:0;fcols.push({F,vi,vals:['','\u0002заполнено']});}
   continue;
  }
  if(d<2)continue;
  const k=rowKeys(F),idx=new Map(),vi=new Int16Array(n),vals=[];
  for(let i=0;i<n;i++){let x=idx.get(k[i]);if(x==null){x=vals.length;idx.set(k[i],x);vals.push(k[i]);}vi[i]=x;}
  fcols.push({F,vi,vals});
  if(fcols.length>=40)break;
 }
 const inc=base?base.slice():new Uint8Array(n).fill(1);
 const A=cands.map(()=>new Float64Array(G));
 function recompute(){for(const a of A)a.fill(0);for(let i=0;i<n;i++){if(!inc[i])continue;rowContrib(i);const g=rowG[i];for(let c=0;c<C;c++)A[c][g]+=contrib[c];}}
 const P=[];pairs.forEach((list,m)=>list.forEach(c=>P.push({m,c})));
 const cmp=(p,a,g)=>{const t=tgt[p.m][g];if(t!==t)return 0;return pos?((a>0)===(t>0)?1:0):(eq(a,t)?1:0);};
 // оценка для поиска: точные совпадения + корреляция с цифрами образца (видна даже до всех нужных фильтров)
 const init=new Float64Array(G);
 const exs=(a0,g)=>a0<=0?1:0.5*Math.max(0,1-a0/init[g]);
 const NP=P.length;
 const Nt=new Float64Array(NP),St=new Float64Array(NP),Stt=new Float64Array(NP);
 for(let q=0;q<NP;q++){const t=tgt[P[q].m];for(let g=0;g<nRepG;g++){const x=t[g];if(x!==x)continue;Nt[q]++;St[q]+=x;Stt[q]+=x*x;}}
 const lam=pos?0:0.6;
 const cur=new Float64Array(NP),Sa=new Float64Array(NP),Saa=new Float64Array(NP),Sat=new Float64Array(NP);
 const corr=(q,sa,saa,sat)=>{const N=Nt[q];const den=(N*saa-sa*sa)*(N*Stt[q]-St[q]*St[q]);if(!(den>0))return 0;const r=(N*sat-sa*St[q])/Math.sqrt(den);return r>0?r:0;};
 function evalCur(){for(let q=0;q<NP;q++){const p=P[q],a=A[p.c],t=tgt[p.m];let s=0,sa=0,saa=0,sat=0;for(let g=0;g<nRepG;g++){const x=t[g];if(x!==x)continue;const v=a[g];s+=cmp(p,v,g);sa+=v;saa+=v*v;sat+=v*x;}cur[q]=s;Sa[q]=sa;Saa[q]=saa;Sat[q]=sat;}}
 const zero=new Float64Array(NP);for(let q=0;q<NP;q++){let s=0;for(let g=0;g<nRepG;g++)s+=cmp(P[q],0,g);zero[q]=s;}
 const extraTot=G-nRepG;
 const wx=0.5*Math.max(1,M);
 function extraZero(){let z=0;const a=A[0];for(let g=nRepG;g<G;g++)if(a[g]===0)z++;return z;}
 function extraSoft(){let z=0;const a=A[0];for(let g=nRepG;g<G;g++)z+=exs(a[g],g);return z;}
 const best0=new Float64Array(M);
 function total(ex,sa,saa,sat,ez){best0.fill(-1);for(let q=0;q<NP;q++){const m=P[q].m;const v=ex[q]+(lam?lam*Nt[q]*corr(q,sa[q],saa[q],sat[q]):0);if(v>best0[m])best0[m]=v;}let s=0;for(const b of best0)s+=Math.max(0,b);return s+wx*ez;}
 function exactTotal(){best0.fill(-1);for(let q=0;q<NP;q++){const m=P[q].m;if(cur[q]>best0[m])best0[m]=cur[q];}let s=0;for(const b of best0)s+=Math.max(0,b);return s+wx*extraZero();}
 recompute();A[0].forEach((v,g)=>init[g]=v);
 evalCur();
 let curScore=total(cur,Sa,Saa,Sat,extraSoft());
 let ops=[];
 const buf=new Float64Array(Math.max(1,n)*C);
 const ex=new Float64Array(NP),xa=new Float64Array(NP),xaa=new Float64Array(NP),xat=new Float64Array(NP);
 const kx=new Float64Array(NP),ka=new Float64Array(NP),kaa=new Float64Array(NP),kat=new Float64Array(NP);
 for(let iter=0;iter<14;iter++){
  let best=null;
  const ez0=extraSoft();
  for(const fc of fcols){
   const map=new Map();let used=0;const ent=[];
   for(let i=0;i<n;i++){
    if(!inc[i])continue;
    const v=fc.vi[i],g=rowG[i],key=v*G+g;
    let off=map.get(key);
    if(off==null){off=used++*C;map.set(key,off);buf.fill(0,off,off+C);(ent[v]||(ent[v]=[])).push(g,off);}
    rowContrib(i);for(let c=0;c<C;c++)buf[off+c]+=contrib[c];
   }
   const present=ent.filter(Boolean).length;
   for(let v=0;v<ent.length;v++){
    const e=ent[v];if(!e)continue;
    ex.set(cur);xa.set(Sa);xaa.set(Saa);xat.set(Sat);
    kx.set(zero);ka.fill(0);kaa.fill(0);kat.fill(0);
    let dxz=0,kz=0;
    for(let t=0;t<e.length;t+=2){
     const g=e[t],off=e[t+1];
     if(g<nRepG){for(let q=0;q<NP;q++){const p=P[q],tv=tgt[p.m][g];if(tv!==tv)continue;const a=A[p.c][g],b=buf[off+p.c],na=a-b;
      ex[q]+=cmp(p,na,g)-cmp(p,a,g);xa[q]-=b;xaa[q]+=na*na-a*a;xat[q]-=b*tv;
      kx[q]+=cmp(p,b,g)-cmp(p,0,g);ka[q]+=b;kaa[q]+=b*b;kat[q]+=b*tv;}}
     else{const a0=A[0][g],b0=buf[off];dxz+=exs(a0-b0,g)-exs(a0,g);kz+=1-exs(b0,g);}
    }
    const sx=total(ex,xa,xaa,xat,ez0+dxz)-curScore;
    if(!best||sx>best.gain+1e-9)best={gain:sx,fc,v,op:'exclude'};
    if(present>1){
     const sk2=total(kx,ka,kaa,kat,extraTot-kz)-curScore;
     if(sk2>best.gain+1e-9)best={gain:sk2,fc,v,op:'keep'};
    }
   }
  }
  if(!best||best.gain<0.25)break;
  const {fc,v,op}=best;
  for(let i=0;i<n;i++)if(inc[i]&&((fc.vi[i]===v)===(op==='exclude')))inc[i]=0;
  ops.push({fc,v,op,col:fc.F.i,key:fc.vals[v]});if(window.OB_DEBUG)console.log('op',op,fc.F.name,fc.vals[v],best.gain.toFixed(2));
  recompute();evalCur();curScore=total(cur,Sa,Saa,Sat,extraSoft());
 }
 // лишние фильтры убираем: оставляем только те, без которых точных совпадений меньше
 const applyOps=list=>{if(base)inc.set(base);else inc.fill(1);for(const o of list)for(let i=0;i<n;i++)if(inc[i]&&((o.fc.vi[i]===o.v)===(o.op==='exclude')))inc[i]=0;recompute();evalCur();return exactTotal();};
 let exact=applyOps(ops);
 for(let changed=true;changed&&ops.length;){
  changed=false;
  for(let k=ops.length-1;k>=0;k--){const rest=ops.filter((o,j)=>j!==k);const s2=applyOps(rest);if(s2>=exact-1e-9){ops=rest;exact=s2;changed=true;break;}}
 }
 applyOps(ops);
 // выбор меры: аддитивные + неаддитивные кандидаты на отфильтрованных строках
 const measOut=[];
 if(mode!=='detail'&&meas.length){
  const extra=[];
  const per=(m)=>{const t=tgt[m];let s=0,c=0;return {t};};
  for(let m=0;m<meas.length;m++){
   let best=null;
   for(const ci of pairs[m]){const p={m,c:ci};let s=0;for(let g=0;g<nRepG;g++)s+=cmp(p,A[ci][g],g);if(!best||s>best.s)best={s,cand:cands[ci]};}
   measOut.push({rc:meas[m].rc,cand:best.cand,match:best.s});
  }
  // неаддитивные: число различных, среднее, мин, макс
  const need=measOut.some(x=>x.match<nRepG);
  if(need){
   const alt=[];
   for(const col of T.cols){if(col.type==='empty'||col.virt&&col.virt.kind!=='lookup')continue;alt.push({agg:'dcount',col:col.i});if(col.type==='number')alt.push({agg:'avg',col:col.i},{agg:'min',col:col.i},{agg:'max',col:col.i});if(alt.length>80)break;}
   const vals=alt.map(a=>aggregate(T,inc,rowG,G,a));
   measOut.forEach((mo,m)=>{
    for(let a=0;a<alt.length;a++){let s=0;const arr=vals[a];for(let g=0;g<nRepG;g++){const t=tgt[m][g];if(t===t&&eq(arr[g],t))s++;}if(s>mo.match+0.5){mo.match=s;mo.cand=alt[a];}}
   });
  }
 }
 // покрытие строк образца
 let covered=0;for(let g=0;g<nRepG;g++)if(A[0][g]>0)covered++;
 let extraLeft=0;for(let g=nRepG;g<G;g++)if(A[0][g]>0)extraLeft++;
 let cells=0,ok=0;
 if(mode==='detail'||!meas.length){const p={m:0,c:0};for(let g=0;g<nRepG;g++){cells++;ok+=cmp(p,A[0][g],g);}}
 else for(const mo of measOut){cells+=nRepG;ok+=mo.match;}
 const q=cells?ok/cells:0;
 return {mode,dims,meas:measOut,ops,inc,quality:q,covered,nRepG,extraLeft,G,ok,cells,score:q*(covered/Math.max(1,nRepG))-0.2*extraLeft/Math.max(1,G)};
}

/** Неаддитивная агрегация по группам. */
function aggregate(T,inc,rowG,G,a){
 const out=new Float64Array(G);
 const col=T.cols[a.col];
 const cond=a.cond?{k:rowKeys(T.cols[a.cond.col]),v:a.cond.key}:null;
 if(a.agg==='dcount'){const k=rowKeys(col);const sets=new Map();for(let i=0;i<T.n;i++){if(!inc[i]||!k[i])continue;if(cond&&cond.k[i]!==cond.v)continue;let s=sets.get(rowG[i]);if(!s)sets.set(rowG[i],s=new Set());s.add(k[i]);}for(const [g,s] of sets)out[g]=s.size;return out;}
 if(a.agg==='count'||a.agg==='sum'){const nv=a.agg==='sum'?numVals(col):null;for(let i=0;i<T.n;i++){if(!inc[i])continue;if(cond&&cond.k[i]!==cond.v)continue;if(nv){const v=nv[i];if(v===v)out[rowG[i]]+=v;}else out[rowG[i]]+=1;}return out;}
 const nv=numVals(col);const cnt=new Float64Array(G);
 if(a.agg!=='avg')out.fill(NaN);
 for(let i=0;i<T.n;i++){if(!inc[i])continue;if(cond&&cond.k[i]!==cond.v)continue;const v=nv[i];if(v!==v)continue;const g=rowG[i];
  if(a.agg==='avg'){out[g]+=v;cnt[g]++;}else if(a.agg==='min'){if(!(out[g]<=v))out[g]=v;}else if(!(out[g]>=v))out[g]=v;}
 if(a.agg==='avg')for(let g=0;g<G;g++)out[g]=cnt[g]?out[g]/cnt[g]:0;
 else for(let g=0;g<G;g++)if(out[g]!==out[g])out[g]=0;
 return out;
}

/* ---------- сортировка ---------- */
const coll=new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
function cmpVals(a,b){
 const ea=!filled(a),eb=!filled(b);if(ea||eb)return ea===eb?0:ea?1:-1;
 if(a instanceof DV&&b instanceof DV)return a.s-b.s;
 const x=toNum(a),y=toNum(b);if(x!=null&&y!=null)return x-y;
 return coll.compare(String(a),String(b));
}
function inferSort(rep,colIdx){
 let groups=[[...Array(rep.n).keys()]];const keys=[];
 for(let round=0;round<3;round++){
  let best=null;
  for(const ci of colIdx){
   if(keys.some(k=>k.rc===ci))continue;
   const vals=rep.cols[ci].vals;let dir=0,ok=true,info=0;
   for(const gr of groups){
    for(let t=1;t<gr.length;t++){const c=cmpVals(vals[gr[t-1]],vals[gr[t]]);if(!c)continue;info++;const d=c<0?1:-1;if(!dir)dir=d;else if(d!==dir){ok=false;break;}}
    if(!ok)break;
   }
   if(ok&&info&&(!best||info>best.info))best={rc:ci,dir:dir>0?'asc':'desc',info};
  }
  if(!best)break;
  keys.push({rc:best.rc,dir:best.dir});
  const vals=rep.cols[best.rc].vals,ng=[];
  for(const gr of groups){let cur=[gr[0]];for(let t=1;t<gr.length;t++){if(cmpVals(vals[gr[t-1]],vals[gr[t]])===0)cur.push(gr[t]);else{ng.push(cur);cur=[gr[t]];}}ng.push(cur);}
  groups=ng.filter(g=>g.length>1);
  if(!groups.length)break;
 }
 return keys;
}

/* ---------- период образца по заголовку ---------- */
const MON_FORMS=MON.map((m,i)=>{const st=['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'][i];return st;});
function periodFromText(texts){
 for(const t of texts){
  const s=norm(t);
  let m=/(\d{2})\.(\d{2})\.(\d{4})\s*(?:-|–|—|по|до)\s*(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  if(m)return {ym:R.ymOf(+m[6],+m[5]),from:R.ymOf(+m[3],+m[2])};
  const re=/(?:^|[^а-я])(январ|феврал|март|апрел|ма[йяе]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*\s*(\d{4})?/g;let x;const found=[];
  const yr=/(20\d{2})/.exec(s);
  while((x=re.exec(s))){let i=MON_FORMS.findIndex(st=>x[1].startsWith(st));if(x[1].startsWith('ма'))i=4;if(i<0)continue;const y=x[2]?+x[2]:yr?+yr[1]:null;if(y)found.push(R.ymOf(y,i+1));}
  if(found.length)return {ym:found[found.length-1],from:found[0]};
 }
 return null;
}

/* ---------- обучение одного листа ---------- */
function learnSheet(book,sheet,tb,sources,seed){
 const rep=R.profile(sheet,tb);
 const notes=[];
 const roles=rep.cols.map(()=>null);
 const firstR=rep.rowsR[0];
 rep.cols.forEach((col,i)=>{
  if(col.formula){roles[i]={role:'formula',tpl:sheet.formulas[firstR]&&sheet.formulas[firstR][col.c]||'',tplRow:firstR+1};return;}
  if(col.type==='empty'){roles[i]={role:'blank'};return;}
  if(col.type==='number'&&rep.n>=2){let k=0;for(let j=0;j<rep.n;j++)if(toNum(col.vals[j])===j+1)k++;if(k>=0.9*rep.n){roles[i]={role:'rownum'};return;}}
 });
 const open=rep.cols.filter((c,i)=>!roles[i]);
 if(!sources.length)throw Error('Нет исходников, по которым можно понять образец.');
 // главная таблица
 let main=null;
 for(const T of sources){
  let s=0;
  for(const rc of open){let b=0;for(const sc of T.cols){const v=(rc.type==='number'?0.3*nameSim(rc.name,sc.name):contain(rc,sc)+0.15*nameSim(rc.name,sc.name));if(v>b)b=v;}s+=b;}
  s+=Math.min(0.5,T.n/20000);
  if(!main||s>main.s)main={T,s};
 }
 const T=main.T;
 // справочники
 const lookups=[];
 const others=sources.filter(x=>x!==T);
 for(const B of others){
  if(B.n>20000)continue;
  const j=findJoin(T,B);if(!j)continue;
  for(const bc of B.cols){
   if(bc===j.bk||bc.virt||bc.type==='empty')continue;
   if(bc.keys.size>2000)continue;
   const name=lookupName(B,bc.name,j.mk.name);
   if(T.cols.some(c=>c.name===name))continue;
   const col=addLookup(T,B,j.mk.name,j.bk.name,bc.name,name);
   if(col)col.virt.sig=sigOf(B);
  }
 }
 for(const c of T.cols)if(c.virt&&c.virt.kind==='lookup'&&c.virt.sig)lookups.push({name:c.name,table:c.virt.sig,mainKey:c.virt.mainKey,key:c.virt.key,target:c.virt.target});
 // сопоставление колонок
 const match=open.map(rc=>{
  let best=null;
  for(const sc of T.cols){
   const ct=rc.type==='number'&&sc.type==='number'&&!sc.virt?contain(rc,sc)*0.9:contain(rc,sc);
   const v=ct+0.15*nameSim(rc.name,sc.name);
   if(!best||v>best.v)best={sc:sc.i,cont:ct,v};
  }
  return {rc:rc.i,...best};
 });
 const dimsA=[],measA=[],dimsD=[],measD=[];
 for(const mt of match){
  const rc=rep.cols[mt.rc],sc=T.cols[mt.sc];
  const isNumRc=rc.type==='number';
  if(!isNumRc){
   if(mt.cont>=0.5){dimsA.push({rc:mt.rc,sc:mt.sc});dimsD.push({rc:mt.rc,sc:mt.sc});}
   else if(rc.keys.size===1){roles[mt.rc]={role:'const',value:rc.vals.find(filled)};}
   else{roles[mt.rc]={role:'blank'};notes.push('Не нашёл в исходниках, откуда берётся колонка «'+rc.name+'» — она останется пустой. Её можно выбрать вручную.');}
  }else{
   const idLike=sc.type!=='number'||(nameSim(rc.name,sc.name)>=0.6&&rc.keys.size>=0.5*rc.filled&&mt.cont>=0.9);
   if(mt.cont>=0.8&&idLike){dimsA.push({rc:mt.rc,sc:mt.sc});dimsD.push({rc:mt.rc,sc:mt.sc});}
   else{measA.push({rc:mt.rc});if(mt.cont>=0.6)dimsD.push({rc:mt.rc,sc:mt.sc});else measD.push({rc:mt.rc});}
  }
 }
 const baseMask=seed?seedMask(T,seed):null;
 const tries=[];
 for(const bm of baseMask?[null,baseMask]:[null]){
  const t=[];
  t.push(fit(T,rep,dimsA,measA,'agg',bm));
  if(dimsD.length&&(measA.length===0||dimsD.length>dimsA.length))t.push(fit(T,rep,dimsD,[],'detail',bm));
  if(!measA.length&&dimsA.length)t.push(fit(T,rep,dimsA,[],'detail',bm));
  for(const x of t){x.seeded=!!bm;tries.push(x);}
 }
 tries.sort((a,b)=>b.score-a.score||(b.seeded?1:0)-(a.seeded?1:0));
 const F=tries[0];
 // роли колонок
 for(const d of F.dims){const vs=rep.cols[d.rc].vals.filter(filled);const asText=vs.length&&vs.filter(v=>typeof v==='string'&&toNum(v)!=null).length>=0.8*vs.length;roles[d.rc]={role:'dim',src:T.cols[d.sc].name,asText:asText||undefined};}
 if(F.mode==='agg')for(const m of F.meas){
  const minOk=F.nRepG?m.match/F.nRepG:0;
  const cand=m.cand;
  const mc=rep.cols[m.rc],blankZero=mc.filled<rep.n&&!mc.vals.some(v=>toNum(v)===0);
  roles[m.rc]={role:'measure',blankZero,agg:cand.agg,src:cand.col!=null?T.cols[cand.col].name:null,cond:cand.cond?{src:T.cols[cand.cond.col].name,key:cand.cond.key,label:R.display(rep.cols[m.rc].name)}:null,match:minOk};
  if(minOk<0.5)notes.push('Колонку «'+rep.cols[m.rc].name+'» удалось повторить только для '+Math.round(minOk*100)+'% строк — проверьте, как она считается.');
 }else for(const m of measD)roles[m.rc]={role:'blank'};
 // перекрёстная таблица: пустые в образце колонки-«соседи» считаем так же
 const crossRole=roles.find(r=>r&&r.role==='measure'&&r.cond);
 if(crossRole){const cc=T.cols.find(c=>c.name===crossRole.cond.src);
  rep.cols.forEach((col,i)=>{const r=roles[i];if(r&&r.role!=='blank')return;const hk=vkey(col.name);if(hk&&cc&&cc.keys.has(hk))roles[i]={role:'measure',blankZero:crossRole.blankZero,agg:crossRole.agg,src:crossRole.src,cond:{src:crossRole.cond.src,key:hk,label:col.name},match:1};});}
 for(let i=0;i<roles.length;i++)if(!roles[i])roles[i]={role:'blank'};
 // фильтры
 const filters=[];let period=null;
 const byCol=new Map();for(const o of F.ops){if(!byCol.has(o.col))byCol.set(o.col,[]);byCol.get(o.col).push(o);}
 for(const [ci,ops] of byCol){
  const col=T.cols[ci],k=rowKeys(col);
  if(ops.every(o=>o.key===''||o.key==='\u0002заполнено')){filters.push({src:col.name,op:'exclude',keys:[''],labels:['(пусто)'],known:null});continue;}
  const kept=new Set(),all=new Map();
  for(let i=0;i<T.n;i++){all.set(k[i],col.vals[i]);if(F.inc[i])kept.add(k[i]);}
  if(col.virt&&col.virt.kind==='month'){
   const yms=[...kept].map(R.monthOfLabel).filter(x=>x!=null).sort((a,b)=>a-b);
   if(yms.length&&yms[yms.length-1]-yms[0]===yms.length-1){period={base:col.virt.base,from:yms[0],to:yms[yms.length-1]};continue;}
  }
  if(col.virt&&col.virt.kind==='year'){const ys=[...kept].map(x=>+String(x).slice(2));if(ys.length===1){period={base:col.virt.base,from:R.ymOf(ys[0],1),to:R.ymOf(ys[0],12),year:true};continue;}}
  const excl=[...all.keys()].filter(x=>!kept.has(x));
  const lab=x=>x===''?'(пусто)':R.display(all.get(x));
  const known=all.size<=300?[...all.keys()]:null;
  if(kept.size<=excl.length)filters.push({src:col.name,op:'keep',keys:[...kept],labels:[...kept].map(lab),known});
  else filters.push({src:col.name,op:'exclude',keys:excl,labels:excl.map(lab),known});
 }
 if(F.seeded){
  for(const f of seed.filters)if(!filters.some(x=>x.src===f.src))filters.unshift(JSON.parse(JSON.stringify(f)));
  if(seed.period&&!period)period=Object.assign({},seed.period);
 }
 // период образца
 let samplePeriod=period?period.to:null;
 const tp=periodFromText(tb.title.concat([book.name]));
 if(samplePeriod==null&&tp)samplePeriod=tp.ym;
 if(samplePeriod==null){ // по датам отобранных строк
  const dc=T.cols.find(c=>c.type==='date'&&!c.virt);
  if(dc){const cnt=new Map();for(let i=0;i<T.n;i++){const v=dc.vals[i];if(F.inc[i]&&v instanceof DV)cnt.set(v.ym(),(cnt.get(v.ym())||0)+1);}let b=null;for(const [ym,c] of cnt)if(!b||c>b[1])b=[ym,c];if(b)samplePeriod=b[0];}
 }
 // сортировка
 const sortable=rep.cols.map((c,i)=>i).filter(i=>roles[i].role==='dim'||roles[i].role==='measure');
 const sort=inferSort(rep,sortable).map(k=>({c:rep.cols[k.rc].c,dir:k.dir}));
 // промежуточные итоги и общий итог
 const subtotal=inferSubtotal(sheet,tb,rep,roles);
 const total=inferTotal(sheet,tb,rep,roles);
 const recipe={
  sheet:sheet.name,block:tb.block||0,c0:tb.c0,c1:tb.c1,headerRow:tb.headerRow+1,
  firstRow:tb.rows[0].r+1,dataStyleRow:tb.rows.find(x=>x.kind==='data').r+1,
  lastRow:(()=>{let l=tb.rows[0].r;for(const x of tb.rows)if(x.kind!=='total')l=x.r;return l+1;})(),
  totalRow:(()=>{const t=tb.rows.find(x=>x.kind==='total');return t?t.r+1:null;})(),
  cols:rep.cols.map((c,i)=>({c:c.c,name:c.name,...roles[i]})),
  mode:F.mode,main:sigOf(T),lookups:lookups.filter(l=>usedName(l.name,roles,filters)),
  filters,period,samplePeriod,titlePeriod:tp,titleTexts:tb.title.slice(0,8),sort,subtotal,total,
  sampleOrder:F.mode==='agg'?rep.cols.length?orderKeys(rep,roles):[]:[],
  quality:{cells:F.cells,ok:F.ok,rows:F.nRepG,covered:F.covered,extra:F.extraLeft,q:F.quality},
  notes
 };
 recipe.prev=snapshotFromSample(rep,recipe,samplePeriod);
 return recipe;
}
function usedName(name,roles,filters){return roles.some(r=>r.src===name||r.cond&&r.cond.src===name)||filters.some(f=>f.src===name);}
function sigOf(T){return {label:T.label,file:T.file,sheet:T.sheet,headers:T.cols.filter(c=>!c.virt).map(c=>c.name),nums:T.cols.filter(c=>c.type==='number'&&!(c.virt&&c.virt.kind!=='lookup')).map(c=>c.name)};}
function orderKeys(rep,roles){
 const di=rep.cols.map((c,i)=>i).filter(i=>roles[i].role==='dim');
 return [...Array(rep.n).keys()].map(j=>di.map(i=>vkey(rep.cols[i].vals[j])).join(SEP));
}
function snapshotFromSample(rep,recipe,period){
 const di=recipe.cols.map((c,i)=>i).filter(i=>recipe.cols[i].role==='dim');
 const mi=recipe.cols.map((c,i)=>i).filter(i=>recipe.cols[i].role==='measure');
 const rows=[];
 for(let j=0;j<rep.n;j++)rows.push({k:di.map(i=>vkey(rep.cols[i].vals[j])).join(SEP),l:di.map(i=>R.display(rep.cols[i].vals[j])),v:mi.map(i=>toNum(rep.cols[i].vals[j])||0)});
 return {period,dims:di.map(i=>recipe.cols[i].name),meas:mi.map(i=>recipe.cols[i].name),rows,source:'образец'};
}
function inferSubtotal(sheet,tb,rep,roles){
 const subs=tb.rows.filter(x=>x.kind==='sub');if(!subs.length)return null;
 const g=sheet.grid;
 const dimIdx=rep.cols.map((c,i)=>i).filter(i=>roles[i].role==='dim');
 const s=subs[0],row=g[s.r]||[];
 let labelCol=null,text='';
 for(const c of rep.cols){const v=row[c.c];if(typeof v==='string'&&R.TOTAL_ANY.test(v.trim())){labelCol=c;text=v.trim();break;}}
 if(!labelCol)return null;
 const base=text.replace(/\s*(итого|итог|total)\s*$/i,'').replace(/^(итого|итог)\s*(по\s*)?/i,'').trim();
 // строка данных перед итогом
 const idx=tb.rows.indexOf(s);let prev=null,next=null;
 for(let t=idx-1;t>=0;t--)if(tb.rows[t].kind==='data'){prev=tb.rows[t];break;}
 for(let t=idx+1;t<tb.rows.length;t++)if(tb.rows[t].kind==='data'){next=tb.rows[t];break;}
 let dim=null,position='after';
 for(const di of dimIdx){const c=rep.cols[di].c;
  if(prev&&base&&vkey((g[prev.r]||[])[c])===vkey(base)){dim=di;position='after';break;}
  if(next&&base&&vkey((g[next.r]||[])[c])===vkey(base)){dim=di;position='before';break;}
 }
 if(dim==null){if(base)return null;dim=dimIdx[0];if(dim==null)return null;}
 const tpl=base?text.replace(base,'{v}'):text;
 const meas={};for(const c of rep.cols){const r=roles[c.i];if(r.role==='measure'||r.role==='formula'&&filled(row[c.c]))meas[c.c]=sheet.formulas[s.r]&&sheet.formulas[s.r][c.c]?'formula':'sum';}
 return {dimC:rep.cols[dim].c,labelC:labelCol.c,tpl,position,meas,styleRow:s.r+1};
}
function inferTotal(sheet,tb,rep,roles){
 const t=tb.rows.find(x=>x.kind==='total');if(!t)return null;
 const row=sheet.grid[t.r]||[],f=sheet.formulas[t.r]||[];
 const cols={};
 for(const c of rep.cols){
  const r=roles[c.i];
  if(f[c.c]){cols[c.c]='formula';continue;}
  if(typeof row[c.c]==='string'){cols[c.c]='label';continue;}
  if(r.role==='measure'||r.role==='dim'&&rep.cols[c.i].type==='number'){
   const v=toNum(row[c.c]);if(v==null){cols[c.c]='blank';continue;}
   let s=0;for(const x of rep.cols[c.i].vals)s+=toNum(x)||0;
   cols[c.c]=eq(s,v)?'sum':(r.role==='measure'&&r.agg==='dcount'?'dcount':'sum');
  }else cols[c.c]=filled(row[c.c])?'label':'blank';
 }
 return {row:t.r+1,cols};
}

/** Маска строк по фильтрам и периоду другой таблицы того же листа. */
function seedMask(T,seed){
 const m=new Uint8Array(T.n).fill(1);
 for(const f of seed.filters){const col=colByName(T,f.src);if(!col)return null;const set=new Set(f.keys),k=rowKeys(col);for(let i=0;i<T.n;i++)if(set.has(k[i])!==(f.op==='keep'))m[i]=0;}
 if(seed.period){const col=colByName(T,seed.period.base);if(!col)return null;for(let i=0;i<T.n;i++){const v=col.vals[i];if(!(v instanceof DV)||v.ym()<seed.period.from||v.ym()>seed.period.to)m[i]=0;}}
 return m;
}
/* ---------- применение к новым данным ---------- */
function resolveTable(sig,tables,exclude){
 let best=null;
 for(const T of tables){
  if(exclude&&exclude.includes(T))continue;
  const hs=T.cols.filter(c=>!c.virt).map(c=>normH(c.name));
  let hit=0;for(const h of sig.headers)if(hs.includes(normH(h)))hit++;
  const s=hit/Math.max(1,sig.headers.length)+(normH(T.sheet)===normH(sig.sheet)?0.05:0)+(T.file===sig.file?0.05:0);
  if(!best||s>best.s)best={T,s};
 }
 return best&&best.s>=0.5?best.T:null;
}
function colByName(T,name){
 let c=T.cols.find(x=>x.name===name);if(c)return c;
 const n=normH(name);c=T.cols.find(x=>normH(x.name)===n);if(c)return c;
 let best=null;for(const x of T.cols){const s=nameSim(name,x.name);if(s>=0.7&&(!best||s>best.s))best={x,s};}
 return best?best.x:null;
}
/** Главная таблица новых данных с подтянутыми справочниками. */
function prepare(rc,tables,issues){
 const T=resolveTable(rc.main,tables);
 if(!T)throw Error('Не нашёл среди новых исходников таблицу как «'+rc.main.label+'» (колонки: '+rc.main.headers.slice(0,6).join(', ')+'…).');
 for(const l of rc.lookups){
  if(T.cols.some(c=>c.name===l.name))continue;
  const B=resolveTable(l.table,tables,[T]);
  if(!B){if(issues)issues.push({level:'error',text:'Нет справочника «'+l.table.label+'» — колонка «'+l.target+'» не заполнится.'});continue;}
  const col=addLookup(T,B,l.mainKey,l.key,l.target,l.name);
  if(col&&col.miss&&issues)issues.push({level:'warn',text:'В справочнике «'+B.label+'» не нашлось '+col.miss+' строк по «'+l.mainKey+'»: '+missList(T,col,l.mainKey)+' — возможно, справочник надо дополнить.'});
 }
 return T;
}
function missList(T,col,mk){const k=T.cols.find(c=>c.name===mk);const s=new Set();for(let i=0;i<T.n&&s.size<6;i++)if(col.vals[i]==null&&filled(k.vals[i]))s.add(R.display(k.vals[i]));return [...s].join(', ');}
/** Строит строки отчёта. period — новый период (ym), split — {src, key} или null. */
function applySheet(rc,tables,opt){
 opt=opt||{};
 const issues=[];
 const T=prepare(rc,tables,issues);
 const need=n=>{const c=colByName(T,n);if(!c)throw Error('В новом исходнике нет колонки «'+n+'».');return c;};
 const inc=new Uint8Array(T.n).fill(1);
 for(const f of rc.filters){
  const col=colByName(T,f.src);if(!col){issues.push({level:'warn',text:'Фильтр по «'+f.src+'» пропущен: колонки нет в новых данных.'});continue;}
  const set=new Set(f.keys),k=rowKeys(col);
  for(let i=0;i<T.n;i++)if(inc[i]&&(set.has(k[i])!==(f.op==='keep')))inc[i]=0;
  if(f.known){const kn=new Set(f.known);const seen=new Set(k);const fresh=[...seen].filter(x=>x&&!kn.has(x));if(fresh.length&&fresh.length<=5)issues.push({level:'info',text:'В «'+f.src+'» появились новые значения — они '+(f.op==='keep'?'не попали':'попали')+' в отчёт: '+fresh.map(x=>R.display(col.vals[k.indexOf(x)])).join(', ')+'.'});}
 }
 let periodUsed=null;
 if(rc.period&&opt.period!=null){
  const base=need(rc.period.base);
  let to=opt.period,from=to-(rc.period.to-rc.period.from);
  if(rc.period.year){from=R.ymOf(Math.floor(to/12),1);to=R.ymOf(Math.floor(to/12),12);}
  else if(rc.period.from%12===0&&rc.period.to-rc.period.from>0)from=to-(to%12); // с начала года
  for(let i=0;i<T.n;i++){if(!inc[i])continue;const v=base.vals[i];if(!(v instanceof DV)||v.ym()<from||v.ym()>to)inc[i]=0;}
  periodUsed={from,to};
 }
 if(opt.split){const col=need(opt.split.src),k=rowKeys(col);for(let i=0;i<T.n;i++)if(inc[i]&&k[i]!==opt.split.key)inc[i]=0;}
 let nInc=0;for(let i=0;i<T.n;i++)nInc+=inc[i];
 // группировка
 const dimCols=rc.cols.filter(c=>c.role==='dim');
 const ds=dimCols.map(c=>need(c.src));
 const dk=ds.map(rowKeys);
 const gid=new Map(),first=[];const rowG=new Int32Array(T.n).fill(-1);
 const groupRows=[];
 for(let i=0;i<T.n;i++){
  if(!inc[i])continue;
  let g;
  if(rc.mode==='detail'){g=first.length;first.push(i);}
  else{const k=dk.map(a=>a[i]).join(SEP);g=gid.get(k);if(g==null){g=first.length;gid.set(k,g);first.push(i);}}
  rowG[i]=g;
 }
 const G=first.length;
 const measVals={};
 for(const c of rc.cols){
  if(c.role!=='measure')continue;
  const a={agg:c.agg};
  if(c.src){const sc=colByName(T,c.src);if(!sc){issues.push({level:'error',text:'Нет колонки «'+c.src+'» для «'+c.name+'».'});continue;}a.col=sc.i;}
  else a.col=0;
  if(c.cond){const cc=colByName(T,c.cond.src);if(cc)a.cond={col:cc.i,key:c.cond.key};}
  measVals[c.c]=aggregate(T,inc,rowG,G,a);
 }
 // строки
 let rows=[];
 for(let g=0;g<G;g++){
  const i=first[g];const vals={};
  rc.cols.forEach(c=>{
   if(c.role==='dim'){const col=ds[dimCols.indexOf(c)];let v=col.vals[i];if(c.asText&&typeof v==='number')v=String(v);vals[c.c]=v;}
   else if(c.role==='measure'){const v=measVals[c.c]?measVals[c.c][g]:null;vals[c.c]=c.blankZero&&v===0?null:v;}
   else if(c.role==='const')vals[c.c]=c.value;
  });
  rows.push({kind:'data',vals,key:dimCols.map((c,t)=>dk[t][i]).join(SEP)});
 }
 // сортировка
 if(rc.sort&&rc.sort.length){
  rows.sort((a,b)=>{for(const s of rc.sort){const x=cmpVals(a.vals[s.c],b.vals[s.c]);if(x)return s.dir==='asc'?x:-x;}return 0;});
 }else if(rc.sampleOrder&&rc.sampleOrder.length){
  const pos=new Map();rc.sampleOrder.forEach((k,t)=>{if(!pos.has(k))pos.set(k,t);});
  rows.sort((a,b)=>(pos.has(a.key)?pos.get(a.key):1e9)-(pos.has(b.key)?pos.get(b.key):1e9));
 }
 if(rc.subtotal){
  const st=rc.subtotal;
  const firstSort=rc.sort&&rc.sort[0];
  if(!firstSort||firstSort.c!==st.dimC){
   const order=new Map();rows.forEach(r=>{const k=vkey(r.vals[st.dimC]);if(!order.has(k))order.set(k,order.size);});
   rows=rows.map((r,t)=>({r,t})).sort((a,b)=>order.get(vkey(a.r.vals[st.dimC]))-order.get(vkey(b.r.vals[st.dimC]))||a.t-b.t).map(x=>x.r);
  }
  const out=[];let t=0;
  while(t<rows.length){
   const k=vkey(rows[t].vals[st.dimC]);let e=t;while(e<rows.length&&vkey(rows[e].vals[st.dimC])===k)e++;
   const sub={kind:'sub',vals:{}};
   sub.vals[st.labelC]=st.tpl.replace('{v}',R.display(rows[t].vals[st.dimC]));
   for(const c in st.meas){if(st.meas[c]==='sum'){let s=0;for(let q=t;q<e;q++)s+=toNum(rows[q].vals[c])||0;sub.vals[c]=s;}}
   sub.span=[out.length+(st.position==='before'?1:0),0];
   if(st.position==='before')out.push(sub);
   const startIdx=out.length;
   for(let q=t;q<e;q++)out.push(rows[q]);
   sub.span=[startIdx,out.length-1];
   if(st.position!=='before')out.push(sub);
   t=e;
  }
  rows=out;
 }
 // общий итог
 let totalRow=null;
 if(rc.total){
  totalRow={kind:'total',vals:{}};
  for(const c in rc.total.cols){const how=rc.total.cols[c];
   if(how==='sum'){let s=0;for(const r of rows)if(r.kind==='data')s+=toNum(r.vals[c])||0;totalRow.vals[c]=s;}
  }
 }
 if(!G)issues.push({level:'error',text:'По условиям образца не нашлось ни одной строки'+(periodUsed?' за '+R.ymLabel(periodUsed.to):'')+'. Проверьте период и исходники.'});
 const blanks=rc.cols.filter(c=>c.role==='dim').map(c=>{let e=0;for(const r of rows)if(r.kind==='data'&&!filled(r.vals[c.c]))e++;return [c.name,e];}).filter(x=>x[1]);
 for(const [n,e] of blanks)issues.push({level:'warn',text:'«'+n+'» пусто в '+e+' стр.'});
 return {rows,totalRow,used:nInc,sourceRows:T.n,source:T.label,periodUsed,issues};
}

/** Какой период взять для новых данных по умолчанию: последний месяц в колонке периода. */
function latestMonth(rc,tables){
 const T=resolveTable(rc.main,tables);if(!T)return null;
 const name=rc.period?rc.period.base:null;
 const col=name?colByName(T,name):T.cols.find(c=>c.type==='date'&&!c.virt);
 if(!col)return null;
 const cnt=new Map();for(const v of col.vals)if(v instanceof DV)cnt.set(v.ym(),(cnt.get(v.ym())||0)+1);
 const yms=[...cnt.keys()].sort((a,b)=>a-b);
 if(!yms.length)return null;
 // самый поздний месяц с заметным числом строк
 const avg=[...cnt.values()].reduce((a,b)=>a+b,0)/yms.length;
 for(let t=yms.length-1;t>=0;t--)if(cnt.get(yms[t])>=Math.max(1,avg*0.15))return {ym:yms[t],all:yms};
 return {ym:yms[yms.length-1],all:yms};
}

/** Значения колонки для разбивки на файлы. */
function splitValues(rc,tables,src,opt){
 let T;try{T=prepare(rc,tables,null);}catch(e){return [];}
 const col=colByName(T,src);if(!col)return [];
 const cp=Object.assign({},rc,{cols:rc.cols});
 const k=rowKeys(col),seen=new Map();
 for(let i=0;i<T.n;i++){if(!k[i])continue;if(!seen.has(k[i]))seen.set(k[i],{key:k[i],label:R.display(col.vals[i]),n:0});seen.get(k[i]).n++;}
 return [...seen.values()].sort((a,b)=>coll.compare(a.label,b.label));
}

/** Сравнение с прошлым снимком. */
function compare(prev,rc,res){
 const di=rc.cols.filter(c=>c.role==='dim'),mi=rc.cols.filter(c=>c.role==='measure');
 const now=new Map();
 for(const r of res.rows){if(r.kind!=='data')continue;const k=r.key;const e=now.get(k)||{l:di.map(c=>R.display(r.vals[c.c])),v:mi.map(()=>0),n:0};mi.forEach((c,t)=>e.v[t]+=toNum(r.vals[c.c])||0);e.n++;now.set(k,e);}
 const was=new Map();for(const r of prev.rows){const e=was.get(r.k)||{l:r.l,v:r.v.map(()=>0),n:0};r.v.forEach((x,t)=>e.v[t]+=x);e.n++;was.set(r.k,e);}
 const mIdx=mi.map(c=>prev.meas.indexOf(c.name));
 const out=[];
 for(const [k,e] of now){const w=was.get(k);
  if(!w){out.push({st:'новая',l:e.l,old:mi.map(()=>null),now:e.v,n:e.n});continue;}
  const old=mIdx.map(t=>t<0?null:w.v[t]);
  const ch=e.v.some((x,t)=>old[t]!=null&&!eq(x,old[t]))||(!mi.length&&e.n!==w.n);
  out.push({st:ch?'изменилась':'без изменений',l:e.l,old,now:e.v,n:e.n,wn:w.n});
 }
 for(const [k,w] of was)if(!now.has(k))out.push({st:'пропала',l:w.l,old:mIdx.map(t=>t<0?null:w.v[t]),now:mi.map(()=>null),n:0});
 const tot=mi.map((c,t)=>{let a=0,b=0;for(const r of out){a+=r.old[t]||0;b+=r.now[t]||0;}return {name:c.name,old:a,now:b};});
 const cnt={новая:0,пропала:0,изменилась:0,'без изменений':0};for(const r of out)cnt[r.st]++;
 const ord={пропала:0,новая:1,изменилась:2,'без изменений':3};
 out.sort((a,b)=>ord[a.st]-ord[b.st]||coll.compare(a.l.join(' '),b.l.join(' ')));
 // резкие изменения
 const jumps=[];
 for(const r of out){if(r.st!=='изменилась')continue;r.now.forEach((x,t)=>{const o=r.old[t];if(o&&Math.abs(x-o)/Math.abs(o)>=0.5&&Math.abs(x-o)>=Math.max(2,Math.abs(tot[t].old)*0.02))jumps.push({l:r.l.join(' · '),m:mi[t].name,old:o,now:x});});}
 return {dims:di.map(c=>c.name),meas:mi.map(c=>c.name),rows:out,tot,cnt,jumps,prevPeriod:prev.period,prevSource:prev.source};
}
function snapshot(rc,res,period){
 const di=rc.cols.filter(c=>c.role==='dim'),mi=rc.cols.filter(c=>c.role==='measure');
 return {period,dims:di.map(c=>c.name),meas:mi.map(c=>c.name),source:'прошлый запуск',rows:res.rows.filter(r=>r.kind==='data').map(r=>({k:r.key,l:di.map(c=>R.display(r.vals[c.c])),v:mi.map(c=>toNum(r.vals[c.c])||0)}))};
}

/** Описание рецепта человеческим языком. */
function describe(rc){
 const AGG={count:'количество строк',sum:'сумма',dcount:'число разных',avg:'среднее',min:'минимум',max:'максимум'};
 const lines=[];
 lines.push('Источник: «'+rc.main.label+'».');
 const dims=rc.cols.filter(c=>c.role==='dim');
 lines.push(rc.mode==='detail'?'Строки: по одной на каждую подходящую строку исходника.':dims.length?'Строки: по сочетанию «'+dims.map(c=>c.src).join('» + «')+'».':'Одна итоговая строка.');
 return lines;
}
function measureText(c){
 const AGG={count:'количество строк',sum:'сумма',dcount:'число разных',avg:'среднее',min:'минимум',max:'максимум'};
 let s=AGG[c.agg]||c.agg;
 if(c.agg!=='count'&&c.src)s+=' «'+c.src+'»';
 if(c.cond)s+=', где «'+c.cond.src+'» = '+c.cond.label;
 return s;
}

window.ObrazecLearn={learnSheet,applySheet,latestMonth,splitValues,compare,snapshot,describe,measureText,nameSim,resolveTable,colByName,cmpVals,periodFromText};
})();
