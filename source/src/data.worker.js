import {decompress} from 'fzstd';
import {kinematics,inside,gradient,finite} from './metrics.mjs';
import proj4 from 'proj4';

let utmCrs='+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs';
let currentPic='MH09HH1544',root='/zarr/dams/MH09HH1544',meta,dates,rawX,rawY,x,y,latitude,longitude,velocity,coherence;
let numDates=281,chunkT=35;
let cache=new Map(),maxCache=32,currentSlice=null,currentT=-1,analysisEpoch=0;
let currentShift={dx:0,dy:0},currentMeta=null;

const send=(type,payload,id,transfer=[])=>postMessage({type,payload,id},transfer);
async function raw(path,allowMissing=false){let res=await fetch(root+'/'+path,{headers:{Range:'bytes=0-'}});if(res.status===404&&allowMissing)return null;if(!res.ok)throw Error(path+': HTTP '+res.status);return new Uint8Array(await res.arrayBuffer());}
async function chunk(name,key){let id=currentPic+'/'+name+'/'+key;if(cache.has(id)){let q=cache.get(id);cache.delete(id);cache.set(id,q);return q;}let bytes=await raw(name+'/c/'+key,true),a;if(!bytes){a=new Float32Array(name==='displacement'?chunkT*22500:22500);a.fill(NaN);}else{let out=decompress(bytes).slice();a=new Float32Array(out.buffer,out.byteOffset,out.byteLength/4);}cache.set(id,a);while(cache.size>maxCache)cache.delete(cache.keys().next().value);return a;}
async function small(name){let b=decompress(await raw(name+'/c/0')).slice();return new Float64Array(b.buffer,b.byteOffset,b.byteLength/8);}
async function map(name){let a=new Float32Array(360000);a.fill(NaN);await Promise.all(Array.from({length:16},async(_,k)=>{let r=Math.floor(k/4),c=k%4,b=await chunk(name,r+'/'+c);for(let i=0;i<150;i++)a.set(b.subarray(i*150,(i+1)*150),(r*150+i)*600+c*150);}));return a;}
async function slice(t){if(t===currentT&&currentSlice)return currentSlice;let a=new Float32Array(360000);a.fill(NaN);let group=Math.floor(t/chunkT),offset=t%chunkT;await Promise.all(Array.from({length:16},async(_,k)=>{let r=Math.floor(k/4),c=k%4,b=await chunk('displacement',group+'/'+r+'/'+c),base=offset*22500;for(let i=0;i<150;i++)a.set(b.subarray(base+i*150,base+(i+1)*150),(r*150+i)*600+c*150);}));currentSlice=a;currentT=t;return a;}

function applyShift(dx,dy){
  currentShift={dx,dy};
  x=new Float64Array(600);
  y=new Float64Array(600);
  for(let c=0;c<600;c++)x[c]=rawX[c]+dx;
  for(let r=0;r<600;r++)y[r]=rawY[r]+dy;

  const step=60;
  let gridLon=[],gridLat=[];
  for(let gi=0;gi<=10;gi++){
    gridLon[gi]=[];gridLat[gi]=[];
    let curY=y[0]-gi*step*10;
    for(let gj=0;gj<=10;gj++){
      let curX=x[0]+gj*step*10;
      let [lon,lat]=proj4(utmCrs,'EPSG:4326',[curX,curY]);
      gridLon[gi][gj]=lon;
      gridLat[gi][gj]=lat;
    }
  }

  latitude=new Float64Array(360000);
  longitude=new Float64Array(360000);
  for(let r=0;r<600;r++){
    let gi=Math.min(9,Math.floor(r/step)),fy=(r-gi*step)/step;
    for(let c=0;c<600;c++){
      let gj=Math.min(9,Math.floor(c/step)),fx=(c-gj*step)/step;
      let lon=(1-fy)*((1-fx)*gridLon[gi][gj]+fx*gridLon[gi][gj+1])+fy*((1-fx)*gridLon[gi+1][gj]+fx*gridLon[gi+1][gj+1]);
      let lat=(1-fy)*((1-fx)*gridLat[gi][gj]+fx*gridLat[gi][gj+1])+fy*((1-fx)*gridLat[gi+1][gj]+fx*gridLat[gi+1][gj+1]);
      let k=r*600+c;
      longitude[k]=lon;
      latitude[k]=lat;
    }
  }

  let [minLon,minLat]=proj4(utmCrs,'EPSG:4326',[x[0],y[599]]);
  let [maxLon,maxLat]=proj4(utmCrs,'EPSG:4326',[x[599],y[0]]);
  currentMeta={
    ...meta.attributes,
    wgs84_bounds:[minLon,minLat,maxLon,maxLat],
    utm_bounds:[x[0],y[599],x[599],y[0]],
    geotransform:[x[0]-5,10.0,0.0,y[0]+5,0.0,-10.0],
    alignment_offset:currentShift
  };
  return currentMeta;
}

async function init(payload){
  let pic=payload?.pic||'MH09HH1544';
  currentPic=pic;
  root='/zarr/dams/'+pic;
  cache.clear();
  currentSlice=null;
  currentT=-1;
  analysisEpoch++;

  meta=await (await fetch(root+'/zarr.json')).json();
  let dm=await(await fetch(root+'/displacement/zarr.json')).json();
  if(dm.shape[1]!==600||dm.shape[2]!==600||dm.data_type!=='float32')throw Error('Unsupported displacement layout; update the reader configuration.');
  numDates=dm.shape[0];
  chunkT=dm.chunk_grid?.configuration?.chunk_shape?.[0]||35;
  let epsg=Number(meta?.attributes?.crs_epsg||32643);
  let zone=(epsg>=32601&&epsg<=32660)?(epsg-32600):43;
  utmCrs=`+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;

  let b=decompress(await raw('time/c/0')),dv=new DataView(b.buffer,b.byteOffset,b.byteLength),count=dv.getUint32(0,true),offset=4;
  dates=[];
  for(let i=0;i<count;i++){let l=dv.getUint32(offset,true);offset+=4;dates.push(new TextDecoder().decode(b.subarray(offset,offset+l)));offset+=l;}
  [rawX,rawY,velocity,coherence]=await Promise.all([
    small('x'),
    small('y'),
    map('velocity'),
    map('temporal_coherence')
  ]);
  let initShift=payload?.shift||{dx:0,dy:0};
  let updatedMeta=applyShift(initShift.dx,initShift.dy);

  let best=-1,score=-Infinity,valid=0,maxGamma=0;
  for(let i=0;i<360000;i++){
    if(finite(velocity[i])){
      valid++;
      maxGamma=Math.max(maxGamma,coherence[i]);
      let s=coherence[i]-.0002*Math.hypot(i%600-300,Math.floor(i/600)-300);
      if(s>score){score=s;best=i;}
    }
  }
  send('ready',{pic,meta:updatedMeta,dates,x,y,latitude,longitude,velocity,coherence,selected:[Math.floor(best/600),best%600],valid,maxGamma,shift:currentShift});
}

async function analysis({row,col,poly,threshold},id){
  let epoch=++analysisEpoch;
  let indices=[];
  if(poly?.length>=3){
    for(let r=0;r<600;r++)for(let c=0;c<600;c++)if(inside(c,r,poly)&&finite(coherence[r*600+c])&&coherence[r*600+c]>=threshold)indices.push(r*600+c);
  }else if(coherence[row*600+col]>=threshold)indices=[row*600+col];
  if(!indices.length){send('analysis',{series:Array(numDates).fill(null),empty:true,count:0,velocity:null,ratio:0},id);return;}
  let tiles=new Map();
  for(let i of indices){
    let r=Math.floor(i/600),c=i%600,key=Math.floor(r/150)+'/'+Math.floor(c/150);
    if(!tiles.has(key))tiles.set(key,[]);
    tiles.get(key).push((r%150)*150+c%150);
  }
  let numGroups=Math.ceil(numDates/chunkT);
  let sum=new Float64Array(numDates),counts=new Uint32Array(numDates),done=0,total=tiles.size*numGroups;
  for(let [key,local] of tiles)for(let group=0;group<numGroups;group++){
    if(epoch!==analysisEpoch)return;
    let b=await chunk('displacement',group+'/'+key);
    for(let ti=0;ti<chunkT&&group*chunkT+ti<numDates;ti++){
      let t=group*chunkT+ti,base=ti*22500;
      for(let index of local){
        let v=b[base+index];
        if(finite(v)){sum[t]+=v;counts[t]++;}
      }
    }
    send('progress',{value:++done/total},id);
  }
  if(epoch!==analysisEpoch)return;
  let series=Array.from(sum,(v,t)=>counts[t]?v/counts[t]:null),vels=indices.filter(k=>finite(velocity[k])),avgVel=vels.length?vels.reduce((s,k)=>s+velocity[k],0)/vels.length:null,metrics=kinematics(dates,series);
  send('analysis',{...metrics,series,velocity:avgVel,count:indices.length,empty:false,ratio:counts.reduce((s,v)=>s+v,0)/(numDates*indices.length),gamma:indices.reduce((s,k)=>s+coherence[k],0)/indices.length},id);
}

onmessage=async e=>{
  let {type,payload,id}=e.data;
  try{
    if(type==='init')await init(payload);
    if(type==='realign'){
      let updatedMeta=applyShift(payload.dx,payload.dy);
      send('realigned',{meta:updatedMeta,x,y,latitude,longitude,shift:currentShift},id);
    }
    if(type==='slice'){let a=await slice(payload.t);let copy=a.slice();send('slice',{t:payload.t,values:copy},id,[copy.buffer]);}
    if(type==='analysis')await analysis(payload,id);
    if(type==='profile'){
      let a=await slice(payload.t),line=payload.line||[[0,payload.row],[599,payload.row]],dx=line[1][0]-line[0][0],dy=line[1][1]-line[0][1],length=Math.hypot(dx,dy)*10,n=Math.ceil(length/10),values=[];
      for(let i=0;i<=n;i++){let f=n?i/n:0,r=Math.max(0,Math.min(599,Math.round(line[0][1]+dy*f))),c=Math.max(0,Math.min(599,Math.round(line[0][0]+dx*f))),k=r*600+c;values.push({x:length*f,y:coherence[k]>=payload.threshold&&finite(a[k])?a[k]:null});}
      let strain=gradient(a,payload.row,payload.col,600,600);
      if(payload.poly?.length){let sums=0,count=0;for(let r=1;r<599;r++)for(let c=1;c<599;c++)if(inside(c,r,payload.poly)&&coherence[r*600+c]>=payload.threshold){let g=gradient(a,r,c,600,600);if(g!==null){sums+=g;count++;}}strain=count?sums/count:null;}
      send('profile',{values,strain,length},id);
    }
  }catch(error){send('error',{message:error.message},id);}
};
