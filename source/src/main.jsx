import DamMap,{IDUKKI,ECCHARTS_CAPE_10,HEX_BORDERS} from './DamMap.jsx';
import ActivityChart from './ActivityChart.jsx';
import SeasonalChart from './SeasonalChart.jsx';
import OverviewChart from './OverviewChart.jsx';
import React,{useState,useEffect,useMemo,useRef} from 'react';import{createRoot}from'react-dom/client';import{Canvas,useThree,useFrame}from'@react-three/fiber';import*as THREE from'three';import{OrbitControls}from'three/examples/jsm/controls/OrbitControls.js';import'@fontsource/eb-garamond/400.css';import'@fontsource/eb-garamond/500.css';import'@fontsource/eb-garamond/700.css';import'@fontsource/jetbrains-mono/400.css';import'./style.css';
const worker=new Worker(new URL('./data.worker.js?v=40',import.meta.url),{type:'module'}),fmt=(v,n=1)=>Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:n,minimumFractionDigits:n}):'—';let serial=0;const send=(type,payload)=>{let id=++serial;worker.postMessage({type,payload,id});return id;};
function Chart({data=[],color='#2563eb',height=86,unit='',valueUnit='',xlabels,selected,zero=false,dates=[],isPopup=false,fillHeight=false}){
  const containerRef=useRef(null);
  const [dims,setDims]=useState({w:420,h:typeof height==='number'?height:86});
  const [hover,setHover]=useState(null);
  const rawId=Math.random().toString(36).substr(2,6);
  const gradId=`chartGrad_${rawId}`;
  const areaGradId=`chartAreaGrad_${rawId}`;

  useEffect(()=>{
    if(!containerRef.current)return;
    const ro=new ResizeObserver(entries=>{
      for(let entry of entries){
        const {width,height:h}=entry.contentRect;
        if(width>30&&h>20)setDims({w:Math.round(width),h:Math.round(h)});
      }
    });
    ro.observe(containerRef.current);
    return()=>ro.disconnect();
  },[]);

  const rawValues=Array.isArray(data)?data:[];
  const finite=rawValues.filter(Number.isFinite);
  let lo=-10,hi=10;
  if(finite.length>0){
    const sorted=[...finite].sort((a,b)=>a-b);
    const p02=sorted[Math.floor(sorted.length*0.02)];
    const p98=sorted[Math.floor(sorted.length*0.98)];
    const iqr=Math.max(4,p98-p02);
    const margin=Math.max(3,iqr*0.18);
    lo=p02-margin;hi=p98+margin;
  }
  if(zero){lo=Math.min(0,lo);hi=Math.max(0,hi);}
  if(hi<=lo){lo-=1;hi+=1;}

  const W=dims.w;
  const H=dims.h;
  const x0=isPopup?64:44;
  const x1=W-(isPopup?24:12);
  const y0=isPopup?36:22;
  const y1=H-(isPopup?26:18);
  const plotW=Math.max(10,x1-x0);
  const plotH=Math.max(10,y1-y0);

  const y=v=>y0+(1-(Math.max(lo,Math.min(hi,v))-lo)/(hi-lo))*plotH;
  const x=i=>x0+(i/Math.max(1,rawValues.length-1))*plotW;

  const densePts=[];
  let interpValues=[];
  if(rawValues.length>0&&finite.length>0){
    const interp=new Float64Array(rawValues.length);
    let lastValid=-1;
    for(let i=0;i<rawValues.length;i++){
      if(Number.isFinite(rawValues[i])){
        if(lastValid!==-1&&i-lastValid>1){
          const v0=rawValues[lastValid],v1=rawValues[i];
          for(let k=lastValid+1;k<i;k++){
            interp[k]=v0+((k-lastValid)/(i-lastValid))*(v1-v0);
          }
        }
        interp[i]=rawValues[i];
        lastValid=i;
      }
    }
    if(lastValid!==-1){
      for(let i=lastValid+1;i<rawValues.length;i++)interp[i]=rawValues[lastValid];
    }
    const firstValid=rawValues.findIndex(Number.isFinite);
    if(firstValid>0){
      for(let i=0;i<firstValid;i++)interp[i]=rawValues[firstValid];
    }
    const smoothed=new Float64Array(rawValues.length);
    for(let i=0;i<rawValues.length;i++){
      const p=interp[Math.max(0,i-1)],c=interp[i],n=interp[Math.min(rawValues.length-1,i+1)];
      smoothed[i]=0.22*p+0.56*c+0.22*n;
    }
    interpValues=smoothed;
    const step=rawValues.length>300?Math.ceil(rawValues.length/200):1;
    for(let i=0;i<rawValues.length;i+=step)densePts.push([x(i),y(smoothed[i])]);
    if((rawValues.length-1)%step!==0)densePts.push([x(rawValues.length-1),y(smoothed[rawValues.length-1])]);
  }

  let lineD='';
  if(densePts.length>=2){
    lineD=`M ${densePts[0][0].toFixed(1)},${densePts[0][1].toFixed(1)}`;
    for(let i=0;i<densePts.length-1;i++){
      const p0=densePts[Math.max(0,i-1)],p1=densePts[i],p2=densePts[i+1],p3=densePts[Math.min(densePts.length-1,i+2)];
      const cp1x=p1[0]+(p2[0]-p0[0])/5,cp1y=p1[1]+(p2[1]-p0[1])/5;
      const cp2x=p2[0]-(p3[0]-p1[0])/5,cp2y=p2[1]-(p3[1]-p1[1])/5;
      lineD+=` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
  }

  const zeroVal=Math.max(lo,Math.min(hi,0));
  const zeroY=y(zeroVal);
  const areaPath=lineD?`${lineD} L ${x1.toFixed(1)},${y1.toFixed(1)} L ${x0.toFixed(1)},${y1.toFixed(1)} Z`:'';

  const numYTicks=isPopup?5:(plotH<58?3:4);
  const yTicks=[];
  for(let t=0;t<numYTicks;t++){
    const frac=t/(numYTicks-1);
    const tickVal=lo+frac*(hi-lo);
    yTicks.push({val:tickVal,y:y(tickVal)});
  }

  let maxIdx=0,maxVal=-Infinity;
  if(interpValues.length>0){
    for(let i=0;i<interpValues.length;i++){
      if(interpValues[i]>maxVal){maxVal=interpValues[i];maxIdx=i;}
    }
  }

  const current=hover??selected;
  const hasCurrent=Number.isInteger(current)&&current>=0&&current<rawValues.length;
  const activeVal=hasCurrent&&Number.isFinite(interpValues[current])?interpValues[current]:null;
  const curX=hasCurrent?x(current):0;
  const curY=activeVal!==null?y(activeVal):0;
  const hoverDate=dates&&hasCurrent&&dates[current]?dates[current]:null;
  const valUnit=valueUnit||unit.split('·').pop().trim();

  const peakPt=Number.isFinite(maxVal)?[x(maxIdx),y(maxVal)]:null;
  const peakText=Number.isFinite(maxVal)?`${maxVal>=0?'+':''}${maxVal.toLocaleString(undefined,{maximumFractionDigits:1})} ${valUnit}`:'';
  const peakBoxW=Math.max(54,peakText.length*6.6+10);
  const peakBoxH=17;
  const peakBoxX=peakPt?Math.max(x0,Math.min(x1-peakBoxW,peakPt[0]-peakBoxW/2)):0;
  const peakBoxY=peakPt?Math.max(2,peakPt[1]-21):0;

  const hoverText=activeVal!==null?
    `${hoverDate?hoverDate+' · ':''}${activeVal>=0?'+':''}${activeVal.toLocaleString(undefined,{maximumFractionDigits:1})} ${valUnit}`:'';
  const hoverBoxW=Math.max(68,hoverText.length*6.5+14);
  const hoverBoxH=19;
  const hoverBoxX=Math.max(x0,Math.min(x1-hoverBoxW,curX-hoverBoxW/2));
  const hoverBoxY=Math.max(2,curY-23);

  const x0Label=xlabels?.[0]||(dates&&dates.length?(isPopup?dates[0]:dates[0].slice(0,4)):'2015');
  const midLabel=dates&&dates.length?(isPopup?dates[Math.floor(dates.length/2)]:dates[Math.floor(dates.length/2)].slice(0,4)):'2020';
  const x1Label=xlabels?.[1]||(dates&&dates.length?(isPopup?dates[dates.length-1]:dates[dates.length-1].slice(0,4)):'2026');

  return (
    <div
      ref={containerRef}
      className={`chart elevation-profile-chart ${isPopup?'is-popup':''}`}
      style={{
        width:'100%',
        flex:isPopup||fillHeight?'1 1 0%':undefined,
        height:isPopup||fillHeight?'100%':undefined,
        minHeight:fillHeight?0:undefined,
        display:'flex',
        flexDirection:'column',
        position:'relative'
      }}
      onMouseLeave={()=>setHover(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{flex:isPopup||fillHeight?'1 1 0%':undefined,height:isPopup||fillHeight?'100%':H,width:'100%',display:'block',cursor:'crosshair',overflow:'visible'}}
        aria-label={`${unit} time series`}
        role="img"
        onMouseMove={e=>{
          if(!rawValues.length)return;
          const rect=e.currentTarget.getBoundingClientRect();
          const mouseX=e.clientX-rect.left;
          const frac=Math.max(0,Math.min(1,(mouseX-x0)/plotW));
          const idx=Math.round(frac*(rawValues.length-1));
          setHover(Math.max(0,Math.min(rawValues.length-1,idx)));
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#38bdf8"/>
            <stop offset="25%" stopColor="#fde047"/>
            <stop offset="50%" stopColor="#f59e0b"/>
            <stop offset="75%" stopColor="#fa4c00"/>
            <stop offset="100%" stopColor="#8c0033"/>
          </linearGradient>
          <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fa4c00" stopOpacity="0.18"/>
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.06"/>
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.01"/>
          </linearGradient>
        </defs>

        {lo<0&&hi>0&&(
          <line x1={x0} y1={zeroY} x2={x1} y2={zeroY} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1"/>
        )}

        <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="#cbd5e1" strokeWidth="1"/>
        {yTicks.map((t,idx)=>(
          <g key={idx}>
            <line x1={x0-4} y1={t.y} x2={x0} y2={t.y} stroke="#94a3b8" strokeWidth="1"/>
            <text x={x0-6} y={t.y+3.5} textAnchor="end" fill="#64748b" fontSize={isPopup?'11':'9'} fontFamily="'JetBrains Mono', monospace">
              {t.val.toLocaleString(undefined,{maximumFractionDigits:1})}
            </text>
          </g>
        ))}

        <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="#cbd5e1" strokeWidth="1"/>
        <line x1={x0} y1={y1} x2={x0} y2={y1+4} stroke="#94a3b8" strokeWidth="1"/>
        <text x={x0} y={y1+14} textAnchor="start" fill="#64748b" fontSize={isPopup?'11':'9.5'} fontFamily="'JetBrains Mono', monospace">
          {x0Label}
        </text>
        <line x1={(x0+x1)/2} y1={y1} x2={(x0+x1)/2} y2={y1+4} stroke="#94a3b8" strokeWidth="1"/>
        <text x={(x0+x1)/2} y={y1+14} textAnchor="middle" fill="#64748b" fontSize={isPopup?'11':'9.5'} fontFamily="'JetBrains Mono', monospace">
          {midLabel}
        </text>
        <line x1={x1} y1={y1} x2={x1} y2={y1+4} stroke="#94a3b8" strokeWidth="1"/>
        <text x={x1} y={y1+14} textAnchor="end" fill="#64748b" fontSize={isPopup?'11':'9.5'} fontFamily="'JetBrains Mono', monospace">
          {x1Label}
        </text>

        {areaPath&&<path d={areaPath} fill={`url(#${areaGradId})`}/>}
        {lineD&&<path d={lineD} fill="none" stroke={`url(#${gradId})`} strokeWidth={isPopup?'3.5':'2.8'} strokeLinecap="round" strokeLinejoin="round"/>}

        {peakPt&&hover===null&&(
          <g>
            <rect x={peakBoxX} y={peakBoxY} width={peakBoxW} height={peakBoxH} rx="4" fill="#0f172a"/>
            <polygon points={`${peakPt[0]-3.5},${peakBoxY+peakBoxH} ${peakPt[0]+3.5},${peakBoxY+peakBoxH} ${peakPt[0]},${peakBoxY+peakBoxH+4}`} fill="#0f172a"/>
            <text x={peakBoxX+peakBoxW/2} y={peakBoxY+11.5} textAnchor="middle" fill="#ffffff" fontSize={isPopup?'10':'8.5'} fontWeight="600" fontFamily="'JetBrains Mono', monospace">
              {peakText}
            </text>
            <circle cx={peakPt[0]} cy={peakPt[1]} r={isPopup?4:3} fill="#fa4c00" stroke="#ffffff" strokeWidth="1.8"/>
          </g>
        )}

        {hover!==null&&(
          <g>
            <line x1={curX} y1={y0} x2={curX} y2={y1} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1"/>
            <rect x={hoverBoxX} y={hoverBoxY} width={hoverBoxW} height={hoverBoxH} rx="4" fill="#0f172a" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8"/>
            <polygon points={`${curX-4},${hoverBoxY+hoverBoxH} ${curX+4},${hoverBoxY+hoverBoxH} ${curX},${hoverBoxY+hoverBoxH+4.5}`} fill="#0f172a"/>
            <text x={hoverBoxX+hoverBoxW/2} y={hoverBoxY+13} textAnchor="middle" fill="#ffffff" fontSize={isPopup?'10.5':'9'} fontWeight="600" fontFamily="'JetBrains Mono', monospace">
              {hoverText}
            </text>
            <circle cx={curX} cy={curY} r={isPopup?4.5:3.5} fill="#fa4c00" stroke="#ffffff" strokeWidth="2"/>
          </g>
        )}
      </svg>
    </div>
  );
}
function Stipple({data,slice,threshold,exaggeration,selected,onSelect,onHover,tool,poly,focus}){let {camera,gl,size}=useThree(),controls=useRef(),target=useRef(null),mesh=useRef(),surf=useRef(),lastValues=useRef(null);const objects=useMemo(()=>{let geo=new THREE.PlaneGeometry(1,1),grid=new Float32Array(720000),coh=data.coherence.slice(),a=new Float32Array(360000),b=new Float32Array(360000),valid=new Float32Array(360000);for(let i=0;i<360000;i++){grid[i*2]=(i%600-299.5)*10;grid[i*2+1]=(299.5-Math.floor(i/600))*10;coh[i]=Number.isFinite(coh[i])?coh[i]:-1;}geo.setAttribute('grid',new THREE.InstancedBufferAttribute(grid,2));geo.setAttribute('d0',new THREE.InstancedBufferAttribute(a,1));geo.setAttribute('d1',new THREE.InstancedBufferAttribute(b,1));geo.setAttribute('valid',new THREE.InstancedBufferAttribute(valid,1));geo.setAttribute('coherence',new THREE.InstancedBufferAttribute(coh,1));let mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,uniforms:{uMix:{value:1},uGamma:{value:threshold},uScale:{value:exaggeration/1000},uResolution:{value:new THREE.Vector2(size.width,size.height)},uSize:{value:2},uSelect:{value:new THREE.Vector2(-9999,-9999)}},vertexShader:`attribute vec2 grid;attribute float d0,d1,valid,coherence;uniform float uMix,uGamma,uScale,uSize;uniform vec2 uResolution,uSelect;varying vec2 vUv;varying float vAlpha;varying vec3 vColor;void main(){float d=mix(d0,d1,uMix);vec3 p=vec3(grid,d*uScale);vec4 clip=projectionMatrix*modelViewMatrix*vec4(p,1.);clip.xy+=position.xy*uSize*2./uResolution*clip.w;gl_Position=clip;vUv=uv;vAlpha=valid*smoothstep(uGamma-.02,uGamma+.005,coherence);vec3 blue=vec3(.231,.51,.965),amber=vec3(.961,.620,.043),red=vec3(.937,.267,.267);vColor=mix(blue,amber,smoothstep(900.,1200.,abs(d)));vColor=mix(vColor,red,smoothstep(1800.,2200.,abs(d)));}`,fragmentShader:`varying vec2 vUv;varying float vAlpha;varying vec3 vColor;void main(){float r=length(vUv-.5);if(r>.5||vAlpha<.005)discard;gl_FragColor=vec4(vColor,vAlpha*(1.-smoothstep(.34,.5,r)));}`});let inst=new THREE.InstancedMesh(geo,mat,360000);inst.frustumCulled=false;inst.renderOrder=5;let g=new THREE.PlaneGeometry(5990,5990,60,60);return {inst,g};},[data]);
useEffect(()=>{camera.up.set(0,0,1);camera.position.set(6900,-7600,6500);camera.lookAt(0,0,0);let c=new OrbitControls(camera,gl.domElement);c.enableDamping=true;c.minDistance=700;c.maxDistance=18000;c.maxPolarAngle=Math.PI*.48;controls.current=c;return()=>{c.dispose();objects.inst.geometry.dispose();objects.inst.material.dispose();objects.g.dispose();};},[]);
useEffect(()=>{if(controls.current)controls.current.enabled=tool==='inspect';if(tool!=='inspect')target.current={pos:new THREE.Vector3(0,-.1,10500),at:new THREE.Vector3()};},[tool]);useEffect(()=>{if(!focus)return;let cx=(focus.col-299.5)*10,cy=(299.5-focus.row)*10,d=focus.span||2200;target.current={pos:new THREE.Vector3(cx+d*.7,cy-d,d*.95),at:new THREE.Vector3(cx,cy,0)};},[focus]);
useEffect(()=>{if(!slice)return;let geo=objects.inst.geometry,from=geo.attributes.d0.array,to=geo.attributes.d1.array,v=geo.attributes.valid.array;for(let i=0;i<to.length;i++){from[i]=lastValues.current&&Number.isFinite(lastValues.current[i])?lastValues.current[i]:0;to[i]=Number.isFinite(slice[i])?slice[i]:0;v[i]=Number.isFinite(slice[i])?1:0;}lastValues.current=slice;geo.attributes.d0.needsUpdate=geo.attributes.d1.needsUpdate=geo.attributes.valid.needsUpdate=true;objects.inst.material.uniforms.uMix.value=0;let pa=objects.g.attributes.position;for(let i=0;i<pa.count;i++){let c=Math.round((pa.getX(i)/10)+299.5),r=Math.round(299.5-pa.getY(i)/10),val=slice[Math.max(0,Math.min(599,r))*600+Math.max(0,Math.min(599,c))];pa.setZ(i,Number.isFinite(val)?val*exaggeration/1000-5:-5);}pa.needsUpdate=true;objects.g.computeVertexNormals();},[slice,exaggeration]);
useFrame((_,dt)=>{let u=objects.inst.material.uniforms;u.uMix.value=Math.min(1,u.uMix.value+dt*3.5);u.uGamma.value=THREE.MathUtils.damp(u.uGamma.value,threshold,12,dt);u.uScale.value=exaggeration/1000;u.uResolution.value.set(size.width,size.height);if(target.current){camera.position.lerp(target.current.pos,1-Math.exp(-dt*5));controls.current?.target.lerp(target.current.at,1-Math.exp(-dt*5));if(camera.position.distanceTo(target.current.pos)<2)target.current=null;}controls.current?.update();});
function hit(e,hover=false){e.stopPropagation();let ray=e.ray.clone(),point=new THREE.Vector3();if(!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),point))return;for(let it=0;it<3&&tool==='inspect';it++){let c=Math.max(0,Math.min(599,Math.round(point.x/10+299.5))),r=Math.max(0,Math.min(599,Math.round(299.5-point.y/10))),d=slice?.[r*600+c];if(!Number.isFinite(d))break;ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-d*exaggeration/1000),point);}let col=Math.round(point.x/10+299.5),row=Math.round(299.5-point.y/10);if(row<0||row>599||col<0||col>599)return;if(tool==='inspect'&&(!Number.isFinite(slice?.[row*600+col])||data.coherence[row*600+col]<threshold))return;(hover?onHover:onSelect)(row,col);}
let lineGeo=useMemo(()=>new THREE.BufferGeometry().setFromPoints(poly.map(([c,r])=>new THREE.Vector3((c-299.5)*10,(299.5-r)*10,40))),[poly]);let selectedZ=Number.isFinite(slice?.[selected[0]*600+selected[1]])?slice[selected[0]*600+selected[1]]*exaggeration/1000:0;
return <><hemisphereLight args={['#ffffff','#d4d4d8',2]}/><directionalLight position={[3000,-2500,9000]} intensity={1.1}/><mesh geometry={objects.g} ref={surf}><meshStandardMaterial color="white" roughness={1} flatShading side={THREE.DoubleSide}/></mesh><mesh geometry={objects.g}><meshBasicMaterial wireframe color="#a1a1aa" transparent opacity={.5}/></mesh><primitive object={objects.inst}/><mesh visible={false} onClick={e=>{if(e.delta<5)hit(e)}} onPointerMove={e=>hit(e,true)}><planeGeometry args={[6000,6000]}/><meshBasicMaterial side={THREE.DoubleSide}/></mesh><mesh position={[(selected[1]-299.5)*10,(299.5-selected[0])*10,selectedZ+12]} renderOrder={10}><ringGeometry args={[22,34,32]}/><meshBasicMaterial color="#18181b" depthTest={false} side={THREE.DoubleSide}/></mesh>{poly.length>1&&<line geometry={lineGeo} renderOrder={9}><lineBasicMaterial color="#18181b" depthTest={false}/></line>}</>}

function App(){
  let [view,setView]=useState('overlay');
  let [data,setData]=useState(null);
  let [t,setT]=useState(280);
  let [loadedT,setLoadedT]=useState(-1);
  let [slice,setSlice]=useState(null);
  let [selected,setSelected]=useState([300,300]);
  let [hover,setHover]=useState(null);
  let [gamma,setGamma]=useState(.25);
  let [analysis,setAnalysis]=useState(null);
  let [profile,setProfile]=useState(null);
  let [pending,setPending]=useState(true);
  let [progress,setProgress]=useState(0);
  let [error,setError]=useState('');
  let [tool,setTool]=useState('inspect');
  let [poly,setPoly]=useState([]);
  let [drawing,setDrawing]=useState([]);
  let [line,setLine]=useState(null);
  let [aoiName,setAoiName]=useState('Custom AOI');
  let [focus,setFocus]=useState(null);
  let [exaggeration,setExaggeration]=useState(300);
  let [methods,setMethods]=useState(false);
  let [playing,setPlaying]=useState(false);
  let [mapStyle,setMapStyle]=useState('hex');

  let defaultShift={dx:0,dy:0};
  let [shift,setShift]=useState(defaultShift);
  let [popupChart,setPopupChart]=useState(null);
  let [kinematicsChartType,setKinematicsChartType]=useState('overview');
  let [dams,setDams]=useState([]);
  let [burstPolygons,setBurstPolygons]=useState([]);
  let [showPolygons,setShowPolygons]=useState(true);
  let [activeDam,setActiveDam]=useState({
    PIC:'MH09HH1544',
    name:'Temghar',
    state:'Maharashtra',
    river:'Mutha',
    dam_type:'Gravity / Masonry',
    lat:18.4525,
    lon:73.540833,
    has_sbas:true,
    has_zarr:true,
    epochs_processed:281
  });
  let [damSearch,setDamSearch]=useState('');
  let [damFilter,setDamFilter]=useState('all'); // 'all' | 'sbas'
  let [damStateFilter,setDamStateFilter]=useState('ALL');
  const mainRef=useRef(null);

  useEffect(()=>{
    let cancelled=false;
    function loadMasterCatalog(isInitial=false){
      fetch('/zarr/zarr.json',{cache:'no-store'})
        .then(r=>{
          if(!r.ok)throw new Error('Failed to read master Zarr root');
          return r.json();
        })
        .then(zarrRoot=>{
          if(cancelled)return;
          let list=(zarrRoot?.attributes?.dams_catalog||[]).slice().sort((a,b)=>(Number(Boolean(b.has_sbas))-Number(Boolean(a.has_sbas)))||String(a.name||'').localeCompare(String(b.name||'')));
          setDams(list);
          if(Array.isArray(zarrRoot?.attributes?.burst_polygons)){
            setBurstPolygons(zarrRoot.attributes.burst_polygons);
          }
          setActiveDam(prev=>{
            let match=list.find(d=>d.PIC===(prev?.PIC||'MH09HH1544'));
            if(match)return match;
            return isInitial?(list.find(d=>d.PIC==='MH09HH1544')||list[0]||prev):prev;
          });
        })
        .catch(()=>{});
    }
    loadMasterCatalog(true);
    let timer=setInterval(()=>loadMasterCatalog(false),25000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[]);

  useEffect(()=>{
    function onKeyDown(e){
      if(e.key==='Escape')setPopupChart(null);
    }
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[]);

  const latest=useRef({}),refs=useRef({});
  refs.current={selected,gamma,t,poly,line,shift};

  function changeShift(next){
    setShift(next);
    send('realign',next);
  }
  function nudge(ddx,ddy){
    changeShift({dx:shift.dx+ddx,dy:shift.dy+ddy});
  }

  function handleSelectDam(dam){
    if(!dam)return;
    setActiveDam(dam);
    setView('overlay');
    setPlaying(false);
    if(!dam.has_sbas){
      setData(null);
      setSlice(null);
      setPending(false);
      setError(`${dam.name} (${dam.PIC} · ${dam.state||'India'}) is initialized on Sentinel-1 burst ${dam.burst_id||'IW'} (${dam.status||'INITIALIZED'}). Full SBAS raster stack is not yet generated for this site.`);
      return;
    }
    if(data?.pic===dam.PIC&&!error)return;
    setData(null);
    setSlice(null);
    setAnalysis(null);
    setProfile(null);
    setError('');
    setPending(true);
    setPoly([]);
    setLine(null);
    send('init',{pic:dam.PIC,shift:{dx:0,dy:0}});
  }

  useEffect(()=>{
    worker.onmessage=e=>{
      let {type,payload,id}=e.data;
      if(type==='ready'){
        let lastIdx=Math.max(0,(payload.dates?.length||281)-1);
        setData(payload);
        setT(lastIdx);
        setSelected(payload.selected);
        if(payload.shift)setShift(payload.shift);
        setError('');
      }
      if(type==='realigned'){
        setData(prev=>prev?{...prev,meta:payload.meta,x:payload.x,y:payload.y,latitude:payload.latitude,longitude:payload.longitude}:prev);
        if(payload.shift)setShift(payload.shift);
      }
      if(type==='slice'&&id===latest.current.slice){setSlice(payload.values);setLoadedT(payload.t);}
      if(type==='analysis'&&id===latest.current.analysis){setAnalysis(payload);setPending(false);}
      if(type==='profile'&&id===latest.current.profile)setProfile(payload);
      if(type==='progress'&&id===latest.current.analysis)setProgress(payload.value);
      if(type==='error'){setError(payload.message);setPending(false);}
    };
    send('init',{pic:'MH09HH1544',shift:{dx:0,dy:0}});
  },[]);

  useEffect(()=>{
    if(!data)return;
    let maxIdx=Math.max(0,(data.dates?.length||281)-1);
    let safeT=Math.min(t,maxIdx);
    let timer=setTimeout(()=>{
      latest.current.slice=send('slice',{t:safeT});
      latest.current.profile=send('profile',{t:safeT,row:selected[0],col:selected[1],line,threshold:gamma,poly});
    }, playing ? 0 : 50);
    return()=>clearTimeout(timer);
  },[data,t,selected,line,gamma,poly,playing]);

  useEffect(()=>{
    if(!data)return;
    setPending(true);setProgress(0);setAnalysis(null);
    let timer=setTimeout(()=>{
      latest.current.analysis=send('analysis',{row:selected[0],col:selected[1],poly,threshold:gamma});
    },160);
    return()=>clearTimeout(timer);
  },[data,selected,gamma,poly]);

  let totalEpochs=data?.dates?.length||activeDam?.epochs_processed||281;
  let maxT=Math.max(0,totalEpochs-1);

  function togglePlay(){
    if(!data)return;
    if(!playing){
      if(t>=maxT)setT(0);
      setPlaying(true);
    }else{
      setPlaying(false);
    }
  }

  useEffect(()=>{
    if(!playing)return;
    const timer=setInterval(()=>{
      setT(curr=>{
        if(curr>=maxT){
          setPlaying(false);
          return maxT;
        }
        return curr+1;
      });
    }, 200);
    return()=>clearInterval(timer);
  },[playing,maxT]);

  function select(row,col){
    if(tool==='polygon'){setDrawing(v=>[...v,[col,row]]);return;}
    if(tool==='line'){setDrawing(v=>{let a=[...v,[col,row]];if(a.length===2){setLine(a);setTool('inspect');return [];}return a});return;}
    setSelected([row,col]);setPoly([]);
  }
  function finish(){
    if(drawing.length<3)return;
    setPoly(drawing);setDrawing([]);setTool('inspect');
    let c=drawing.reduce((s,p)=>s+p[0],0)/drawing.length,r=drawing.reduce((s,p)=>s+p[1],0)/drawing.length,span=Math.max(1000,(Math.max(...drawing.map(p=>p[0]))-Math.min(...drawing.map(p=>p[0])))*17);
    setFocus({row:r,col:c,span});
  }

  let damStates=React.useMemo(()=>{
    let s=new Set();
    for(let d of dams)if(d.state)s.add(d.state);
    return ['ALL',...Array.from(s).sort()];
  },[dams]);

  let filteredDams=React.useMemo(()=>{
    let q=damSearch.trim().toLowerCase();
    return dams.filter(d=>{
      if(damFilter==='sbas'&&!d.has_sbas)return false;
      if(damStateFilter!=='ALL'&&d.state!==damStateFilter)return false;
      if(!q)return true;
      return (
        String(d.name||'').toLowerCase().includes(q)||
        String(d.PIC||'').toLowerCase().includes(q)||
        String(d.state||'').toLowerCase().includes(q)||
        String(d.district||'').toLowerCase().includes(q)||
        String(d.river||'').toLowerCase().includes(q)
      );
    });
  },[dams,damSearch,damFilter,damStateFilter]);

  let sbasCount=React.useMemo(()=>dams.filter(d=>d.has_sbas).length,[dams]);

  let selectedDisp=analysis?.series?.[t],first=analysis?.series?.find(Number.isFinite),net=Number.isFinite(selectedDisp)&&Number.isFinite(first)?selectedDisp-first:null,acc=analysis?.acceleration?.[t],warning=Number.isFinite(acc)&&acc>2,coords=data?`${fmt(data.x[selected[1]],0)} E · ${fmt(data.y[selected[0]],0)} N`:'Reading coordinates…',scope=poly.length?aoiName:`Pixel [${selected[0]}, ${selected[1]}]`,shown=slice&&data?data.coherence.reduce((s,v,i)=>s+(v>=gamma&&Number.isFinite(slice[i])?1:0),0):0;

  return <><main ref={mainRef} className={'view-'+view}>
    <div className="canvas">
      {view!=='model'?<DamMap view={view} data={data} slice={slice} threshold={gamma} tool={tool} poly={drawing.length?drawing:poly.length?[...poly,poly[0]]:line||[]} focus={focus} selected={selected} style={mapStyle} dams={filteredDams} burstPolygons={burstPolygons} showPolygons={showPolygons} activeDam={activeDam} onSelect={select} onHover={(r,c)=>setHover([r,c])} onDam={()=>setView('map')} onSelectDam={handleSelectDam}/>:<div className="model-waiting"><div className="model-outline">◇</div><div className="eyebrow">{activeDam?.name?.toUpperCase()||'DAM'} / 3D INSPECTION</div><h2>Your model will appear here.</h2><p>Waiting for the 3D file you will share.<br/>No replacement model has been generated.</p><button onClick={()=>setView('map')}>Back to dam map</button></div>}
    </div>

    {/* Unified Left Observatory Stack (Top Control Bar + Cards A, C, D) */}
    <div className={`left-dashboard-stack ${view==='overlay'?'is-overlay':'is-map-view'}`}>
      {/* 1. Unified Observatory Control Bar (Top Deck) */}
      <div className="top-control-deck">
        <div className="top-deck-upper">
          <div className="brand-group">
            <div className="eyebrow">UNIFIED ZARR OBSERVATORY · {activeDam?.PIC||'MH09HH1544'} · {dams.length||390} MONITORED DAMS</div>
            <h1>Dam Stability <i>Observatory</i></h1>
            <div className="subtitle">
              {view==='overlay'
                ?`${activeDam?.name||'Temghar'} (${activeDam?.state||'India'})${activeDam?.capacity_mcm!=null?` · ${Number(activeDam.capacity_mcm).toLocaleString()} MCM`:''}${activeDam?.dam_type&&activeDam.dam_type!=='Unspecified'?` · ${activeDam.dam_type}`:''} · ${totalEpochs} acquisitions`
                :`Single Master Zarr Store (${dams.length||390} Dams · ${sbasCount||76} Full SBAS Displacement Cubes · ${burstPolygons.length||186} Burst Polygons)`}
            </div>
          </div>
          <div className="top-deck-right">
            <nav className="view-switcher" aria-label="Dashboard view">
              <button className={view==='map'?'active':''} onClick={()=>setView('map')}>01 · Dam Map ({dams.length||390})</button>
              <button className={view==='overlay'?'active':''} onClick={()=>setView('overlay')}>02 · Zarr Overlay</button>
              <button className={view==='model'?'active':''} onClick={()=>setView('model')}>03 · 3D View</button>
            </nav>
            <button className="methods-btn" onClick={()=>setMethods(true)}>Methods ↗</button>
          </div>
        </div>
        <div className="top-deck-lower">
          <div className="workspace-tools">
            <button className={tool==='inspect'?'active':''} onClick={()=>{setTool('inspect');setDrawing([])}}>↖ Inspect</button>
            <button className={tool==='polygon'?'active':''} onClick={()=>{setTool('polygon');setDrawing([])}}>⌁ Draw AOI</button>
            <button className={tool==='line'?'active':''} onClick={()=>{setTool('line');setDrawing([])}}>╱ Transect</button>
            {view==='overlay'&&<button className={mapStyle==='hex'?'active':''} onClick={()=>setMapStyle(mapStyle==='hex'?'dots':'hex')} title="Switch between 5m Hexagonal Honeycomb and Point Dots">{mapStyle==='hex'?'⬡ 5m Hexagons':'• Point Dots'}</button>}
            <button className={showPolygons?'active':''} onClick={()=>setShowPolygons(v=>!v)} title="Toggle Sentinel-1 Burst, Zarr Cube, and Reservoir Polygons">
              {view==='map'?`⬠ Burst & Dam Polygons (${burstPolygons.length||186})`:'⬠ Dam & Reservoir Polygon'}
            </button>
            {tool==='polygon'&&<button disabled={drawing.length<3} onClick={finish}>Finish ({drawing.length})</button>}
          </div>
        </div>
      </div>

      {/* 2. Left Responsive Dashboard Deck (Cards A, C, D) */}
      {view==='overlay' && (
        <div className="left-dashboard-deck">
          <div className="cards-row-ac">
            {/* Card A: Deformation Kinematics */}
            <section className="panel kinematics">
              <div className="card-header-block">
                <div className="section-index">A / STRUCTURAL INTEGRITY</div>
                <h2>Deformation Kinematics</h2>
                <div className="kpi-group">
                  <label>Mean annual LOS velocity</label>
                  <div className="number hero">{fmt(analysis?.velocity,0)} <small>mm/yr</small></div>
                </div>
              </div>

              <div className="chart-box">
                <div className="chart-head">
                  <div className="chart-head-left">
                    <label>LOS displacement history</label>
                    <button className="chart-expand-btn" onClick={()=>setPopupChart('los')} title="Expand to center of screen">⤢ Expand</button>
                  </div>
                  <strong>{fmt(selectedDisp)} <small>mm</small></strong>
                </div>
                <ActivityChart
                  data={analysis?.series}
                  dates={data?.dates}
                  selected={t}
                  height={82}
                  fillHeight={true}
                  unit="LOS history · mm"
                  valueUnit="mm"
                />
              </div>

              <div className="inline-readout">
                <label>Cumulative net displacement</label>
                <strong>{fmt(net)} <small>mm</small></strong>
              </div>

              <div className={`chart-box acceleration ${warning?'warning':''}`}>
                <div className="chart-head">
                  <div className="chart-head-left">
                    <label>Rolling acceleration (365-day fit)</label>
                    <button className="chart-expand-btn" onClick={()=>setPopupChart('acc')} title="Expand to center of screen">⤢ Expand</button>
                  </div>
                  <strong>{fmt(acc)} <small>mm/yr²</small></strong>
                </div>
                <Chart
                  data={analysis?.acceleration}
                  dates={data?.dates}
                  selected={t}
                  height={78}
                  fillHeight={true}
                  color={warning?'#ef4444':'#71717a'}
                  unit="365-day quadratic fit · mm/yr²"
                  valueUnit="mm/yr²"
                />
                {warning&&<span className="alert">+2 mm/yr² display trigger exceeded</span>}
              </div>

              <div className="status">
                {pending?`Calculating ${Math.round(progress*100)}%`:analysis?.empty?'No observations pass this filter':`${(analysis?.count||0).toLocaleString()} spatial sample${analysis?.count===1?'':'s'} · ${scope}`}
              </div>
            </section>

            {/* Card C: Seasonal Response */}
            <section className="panel seasonal">
              <div className="card-header-block">
                <div className="section-index">C / HYDRO-MECHANICS</div>
                <h2>Seasonal Response</h2>
                <div className="kpi-group">
                  <label>Seasonal elastic amplitude</label>
                  <div className="number hero">{fmt(analysis?.amplitude)} <small>mm</small></div>
                </div>
              </div>

              <div className="chart-box">
                <div className="chart-head">
                  <div className="chart-head-left">
                    <label>Annual seasonal cycle (harmonic fit)</label>
                    <button className="chart-expand-btn" onClick={()=>setPopupChart('seasonal')} title="Expand to center of screen">⤢ Expand</button>
                  </div>
                  <strong>±{fmt(analysis?.amplitude ? analysis.amplitude / 2 : 0)} <small>mm</small></strong>
                </div>
                <SeasonalChart data={analysis?.seasonalCycle} amplitude={analysis?.amplitude} height={82} fillHeight={true}/>
              </div>

              <div className="inline-readout">
                <label>Residual deformation trend</label>
                <strong>{fmt(analysis?.residual)} <small>mm/cycle</small></strong>
              </div>

              <div className="chart-box">
                <div className="chart-head">
                  <div className="chart-head-left">
                    <label>Deseasonalized permanent drift</label>
                    <button className="chart-expand-btn" onClick={()=>setPopupChart('drift')} title="Expand to center of screen">⤢ Expand</button>
                  </div>
                  <strong>{fmt(analysis?.residual)} <small>mm/yr trend</small></strong>
                </div>
                <Chart
                  data={analysis?.series && analysis?.seasonal ? analysis.series.map((v, i) => Number.isFinite(v) && Number.isFinite(analysis.seasonal[i]) ? v - analysis.seasonal[i] : null) : []}
                  dates={data?.dates}
                  selected={t}
                  height={78}
                  fillHeight={true}
                  color="#2563eb"
                  unit="Deseasonalized LOS · mm"
                  valueUnit="mm"
                />
              </div>

              <div className="selection">
                <span>{scope}</span>
                <code>{coords}</code>
                {poly.length>0&&<input aria-label="AOI name" value={aoiName} onChange={e=>setAoiName(e.target.value)}/>}
              </div>
            </section>
          </div>

          {/* Card D: Observation Quality */}
          <section className="panel quality horizontal-governance">
            <div className="gov-col gov-col-left">
              <div className="section-index">D / DATA GOVERNANCE</div>
              <div className="gov-title-row">
                <h2>Observation Quality</h2>
                <span className="gov-badge">γ ≥ {gamma.toFixed(2)}</span>
              </div>
              <div className="gov-slider-wrap">
                <label>Coherence threshold γ</label>
                <div className="gov-slider-row">
                  <span>0.0</span>
                  <input aria-label="Coherence threshold" type="range" min="0" max="1" step=".01" value={gamma} onChange={e=>setGamma(+e.target.value)}/>
                  <span>1.0</span>
                </div>
              </div>
            </div>

            <div className="gov-divider"/>

            <div className="gov-col gov-col-mid">
              <svg width="56" height="56" viewBox="0 0 53 53" aria-label="Valid observation ratio">
                <circle cx="26.5" cy="26.5" r="22" stroke="#e4e4e7" strokeWidth="3.2" fill="none"/>
                <circle cx="26.5" cy="26.5" r="22" stroke="#16a34a" strokeWidth="3.2" fill="none" strokeDasharray={`${(analysis?.ratio||0)*138.23} 138.23`} transform="rotate(-90 26.5 26.5)"/>
                <text x="26.5" y="31" textAnchor="middle" style={{fontSize:'12.5px',fontWeight:'700',fill:'#18181b'}}>{fmt((analysis?.ratio||0)*100,0)}%</text>
              </svg>
              <div className="gov-stats">
                <label>Valid observations</label>
                <strong>{fmt((analysis?.ratio||0)*totalEpochs,0)} <small>/ {totalEpochs} per pixel</small></strong>
                <span className="gov-sub">Temporal consistency</span>
              </div>
            </div>

            <div className="gov-divider"/>

            <div className="gov-col gov-col-right">
              <div className="gov-population">
                <label>Spatial Population</label>
                <strong className="gov-pop-count">{shown.toLocaleString()}</strong>
                <span className="gov-filter-status"><span className="gov-green-dot"/> Active Coherence Filter</span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>

    {/* Map View Dam Directory (All 390 Monitored Dams) */}
    {view==='map'&&(
      <aside className="dam-directory panel">
        <div className="dam-dir-header">
          <div className="section-index">DAM REGISTRY / 01 NATIONAL DIRECTORY</div>
          <div className="dam-dir-title-row">
            <h2>Monitored Dams</h2>
            <span className="dam-count-pill">{filteredDams.length} / {dams.length||390}</span>
          </div>
          <input
            type="search"
            className="dam-search-input"
            placeholder="Search dam name, PIC, state, river…"
            value={damSearch}
            onChange={e=>setDamSearch(e.target.value)}
            aria-label="Search monitored dams"
          />
          <div className="dam-filter-row">
            <div className="dam-filter-tabs">
              <button className={damFilter==='all'?'active':''} onClick={()=>setDamFilter('all')}>All ({dams.length||390})</button>
              <button className={damFilter==='sbas'?'active':''} onClick={()=>setDamFilter('sbas')}>SBAS Zarr ({sbasCount||76})</button>
            </div>
            <select
              className="dam-state-select"
              value={damStateFilter}
              onChange={e=>setDamStateFilter(e.target.value)}
              aria-label="Filter by state"
            >
              {damStates.map(st=>(
                <option key={st} value={st}>{st==='ALL'?'All States':st}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="dam-list-scroll" role="listbox" aria-label="Monitored dams list">
          {filteredDams.map(d=>{
            let isSel=activeDam?.PIC===d.PIC;
            let capText=d.capacity_mcm!=null&&Number.isFinite(Number(d.capacity_mcm))?` · ${Number(d.capacity_mcm).toLocaleString()} MCM`:'';
            let typeText=d.dam_type&&d.dam_type!=='Unspecified'?` · ${d.dam_type}`:'';
            return (
              <button
                key={d.PIC}
                className={`dam-list-item ${isSel?'selected':''} ${d.has_sbas?'has-sbas':'is-init'}`}
                onClick={()=>handleSelectDam(d)}
                title={`Select ${d.name} (${d.PIC}) and open Zarr Overlay`}
              >
                <span className={`dam-symbol ${d.has_sbas?'sbas':'init'}`}>◆</span>
                <span className="dam-item-body">
                  <b>{d.name}</b>
                  <small>{d.PIC} · {d.district?`${d.district}, `:''}{d.state||'India'}{capText}{typeText}</small>
                </span>
                <span className={`dam-status-badge ${d.has_sbas?'sbas':'init'}`}>
                  {d.has_sbas?`${d.total_acquisition_dates||d.epochs_processed||281}d ↗`:'Meta'}
                </span>
              </button>
            );
          })}
          {filteredDams.length===0&&(
            <div className="dam-empty-state">No dams match "{damSearch}".</div>
          )}
        </div>

        {activeDam&&(
          <div className="dam-details">
            <div className="dam-details-top">
              <div>
                <label>Zarr Record · {activeDam.PIC}</label>
                <strong>{activeDam.name} ({activeDam.state||'India'})</strong>
              </div>
              <code>{Number(activeDam.lat||0).toFixed(4)}°N, {Number(activeDam.lon||0).toFixed(4)}°E</code>
            </div>
            <div className="dam-meta-grid">
              <div><label>Capacity / FRL</label><span>{activeDam.capacity_mcm!=null?`${Number(activeDam.capacity_mcm).toLocaleString()} MCM`:'—'}{activeDam.frl_m?` · ${activeDam.frl_m}m`:''}</span></div>
              <div><label>Height / Length</label><span>{activeDam.height_m?`${activeDam.height_m}m`:'—'} / {activeDam.length_m?`${activeDam.length_m}m`:'—'}</span></div>
              <div><label>Basin / River</label><span>{activeDam.basin||activeDam.river||activeDam.primary_burst||'S1-IW'}</span></div>
              <div><label>Zarr Cube</label><span>{activeDam.has_sbas?`${activeDam.total_acquisition_dates||activeDam.epochs_processed||281} dates`:`Init (${activeDam.completion_year||'CWC'})`}</span></div>
            </div>
            <button className="open-zarr-btn" onClick={()=>handleSelectDam(activeDam)}>
              Open {activeDam.name} in Zarr Overlay →
            </button>
          </div>
        )}
      </aside>
    )}

    {/* 3. Spatial Strain Profiles - Full Length Bottom Card */}
    {view==='overlay' && (
      <section className="panel profiles bottom-profiles-dock">
        <div className="profile-top">
          <div className="profile-heading">
            <div className="section-index">B / ZONAL MOVEMENT</div>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <h2>Spatial Strain Profiles</h2>
              <button className="chart-expand-btn" onClick={()=>setPopupChart('profiles')} title="Expand to center of screen">⤢ Expand</button>
            </div>
          </div>
          <div className="profile-note">{line?'User-defined transect':'East–west transect through selection'}<br/>LOS proxy · no surveyed crest line</div>
        </div>
        <OverviewChart
          profile={profile}
          dates={data?.dates}
          date={data?.dates?.[t]}
          series={analysis?.series}
          velocity={analysis?.velocity}
          acceleration={analysis?.acceleration}
          selected={t}
          onSelect={setT}
        />
      </section>
    )}

    {/* Floating LOS Displacement Map Legend & Real-Time Readout */}
    {view==='overlay' && data && (
      <div className="geomechanics-legend-card" aria-label="LOS Displacement Map Legend">
        <div className="geo-legend-top">
          <div className="geo-legend-title">
            <span className="geo-dot" style={{background:'#2563eb'}}/>
            <strong>LOS Displacement</strong>
          </div>
        </div>
        <div className="geo-ramp">
          {ECCHARTS_CAPE_10.map((c, idx) => (
            <div key={idx} className="geo-ramp-step" style={{background: c}}/>
          ))}
        </div>
        <div className="geo-ramp-ticks">
          <span>0</span><span>500</span><span>1k</span><span>1.7k</span><span>2.5k+ mm</span>
        </div>
        {/* Live cursor or selected point readout */}
        {(() => {
          let pt = hover || selected;
          if (!pt || !data) return null;
          let r = pt[0], c = pt[1], k = r * 600 + c;
          let dVal = slice?.[k];
          let coh = data.coherence?.[k];
          return (
            <div className="geo-live-readout">
              <span className="geo-readout-item">
                Disp: <b>{fmt(dVal, 1)} mm</b>
              </span>
              <span className="geo-readout-item dim">
                [{r}, {c}] · γ {fmt(coh, 2)}
              </span>
            </div>
          );
        })()}
      </div>
    )}

    {view==='overlay'&&(!data||!slice||error)&&(
      <div className="loading">
        {error?(
          <>
            <strong>{activeDam?.name||'Dam'} · Dataset Status</strong>
            <p>{error}</p>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'6px'}}>
              <button onClick={()=>setView('map')}>← Back to 390 Dam Map</button>
              <button onClick={()=>{let d=dams.find(x=>x.PIC==='KL29VH0027')||{PIC:'KL29VH0027',name:'Idukki',state:'Kerala',has_sbas:true,epochs_processed:330,lat:9.84306,lon:76.97639};handleSelectDam(d);}}>Load Idukki Dam</button>
              <button onClick={()=>{let d=dams.find(x=>x.PIC==='MH09HH1544')||{PIC:'MH09HH1544',name:'Temghar',state:'Maharashtra',has_sbas:true,epochs_processed:281,lat:18.4581,lon:73.5419};handleSelectDam(d);}}>Load Temghar Dam</button>
            </div>
          </>
        ):(
          <>
            <span className="spinner"/>
            <strong>{data?`Decoding ${activeDam?.name||''} displacement chunks…`:`Loading ${activeDam?.name||'Dam'} (${activeDam?.PIC||''}) Zarr v3 store…`}</strong>
          </>
        )}
      </div>
    )}
  </main>
  {view==='overlay'&&<footer className="timeline">
    <button className={`timeline-play-btn ${playing?'playing':''}`} onClick={togglePlay} disabled={!data} title={playing?'Pause animation':'Play satellite time series'}>{playing?'⏸':'▶'}</button>
    <div className="date"><strong>{data?.dates?.[Math.min(t,maxT)]||'2026-10-24'}</strong><span>Acquisition {Math.min(t+1,totalEpochs)} / {totalEpochs}{loadedT!==t?' · loading':''}</span></div>
    <div className="time-track"><input aria-label="Acquisition date" type="range" min="0" max={maxT} step="1" value={Math.min(t,maxT)} onChange={e=>{setPlaying(false);setT(+e.target.value)}}/><div className="years"><span>2015</span><span>2017</span><span>2019</span><span>2021</span><span>2023</span><span>2026</span></div></div>
    <span className="source-tag">SENTINEL-1 SBAS<br/>{totalEpochs} ACQUISITIONS</span>
  </footer>}
  {methods&&<div className="modal" onClick={()=>setMethods(false)}>
    <article onClick={e=>e.stopPropagation()}>
      <button className="close" onClick={()=>setMethods(false)}>Close ×</button>
      <div className="eyebrow">DATA & METHODOLOGY</div>
      <h2>A georeferenced LOS observatory</h2>
      <p>The supplied store identifies <b>Temghar Dam (MH09HH1544)</b>. The data spans 2015-03-01 to 2026-10-24, in EPSG:32643, at 10 m spacing.</p>
      <p><b>Geodetic Alignment Calibration:</b> Raw Sentinel-1 SLC data warped on ellipsoidal coordinates without high-resolution DEM back-geocoding exhibits geometric slant-range terrain layover shifts in mountainous terrain (~680m–800m elevation). The dashboard incorporates a precise geodetic calibration offset (default ΔEasting: −410 m, ΔNorthing: −110 m), perfectly aligning the water body decorrelation mask and concrete dam crest with OpenStreetMap. Users can also fine-tune the calibration using the on-screen <i>Align</i> tool.</p>
      <dl>
        <dt>Velocity & net displacement</dt>
        <dd>Velocity uses the supplied mm/year layer. Net displacement subtracts the first valid observation from the selected date. AOIs use valid per-date spatial means after coherence filtering.</dd>
        <dt>Seasonal amplitude & residual drift</dt>
        <dd>Least-squares fit: d(t) = a + bt + c sin(2πt) + e cos(2πt), using actual acquisition dates in years. Amplitude = 2√(c²+e²); residual drift = b per annual cycle. This does not establish irreversible plastic deformation.</dd>
        <dt>Acceleration</dt>
        <dd>A centred 365-day quadratic regression, requiring at least seven valid observations. Acceleration is twice the quadratic coefficient.</dd>
        <dt>Strain proxy</dt>
        <dd>Central spatial differences of LOS displacement over 20 m (two 10 m pixels), converted to μϵ. This is neither full strain nor a strain rate: LOS projection and 10 m sampling cannot resolve individual monolith joints.</dd>
      </dl>
    </article>
  </div>}
  {popupChart&&(
    <div className="chart-modal-backdrop" onClick={()=>setPopupChart(null)}>
      <div className="chart-modal-dialog" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-eyebrow">
              {popupChart==='los'&&'A / STRUCTURAL INTEGRITY · TIME-SERIES OBSERVATION'}
              {popupChart==='acc'&&'A / KINEMATICS · SECOND-ORDER RATE OF ACCELERATION'}
              {popupChart==='seasonal'&&'C / HYDRO-MECHANICS · 365-DAY ANNUAL HARMONIC FIT'}
              {popupChart==='drift'&&'C / RESIDUAL TREND · DESEASONALIZED PERMANENT DRIFT'}
              {popupChart==='profiles'&&'B / ZONAL MOVEMENT · HIGH-RESOLUTION CREST TRANSECT'}
            </span>
            <h3>
              {popupChart==='los'&&'LOS Displacement History (2014–2026)'}
              {popupChart==='acc'&&'Rolling Acceleration (365-day Quadratic Fit)'}
              {popupChart==='seasonal'&&'Annual Seasonal Response Cycle'}
              {popupChart==='drift'&&'Deseasonalized Permanent Drift (Irreversible Trend)'}
              {popupChart==='profiles'&&'Spatial Strain Profile Along Dam Crest'}
            </h3>
            <span className="modal-sub">
              {coords} · {scope} · Active Observation Date: {data?.dates[t]||'2026-10-24'}
            </span>
          </div>
          <button className="modal-close-btn" onClick={()=>setPopupChart(null)} title="Close (Esc)">✕</button>
        </div>

        <div className="modal-body">
          {popupChart==='los'&&(
            <ActivityChart
              data={analysis?.series}
              dates={data?.dates}
              selected={t}
              unit="LOS displacement history · mm"
              valueUnit="mm"
              isPopup={true}
            />
          )}
          {popupChart==='acc'&&(
            <Chart
              data={analysis?.acceleration}
              dates={data?.dates}
              selected={t}
              unit="365-day quadratic fit · mm/yr²"
              valueUnit="mm/yr²"
              isPopup={true}
            />
          )}
          {popupChart==='seasonal'&&(
            <SeasonalChart
              data={analysis?.seasonalCycle}
              amplitude={analysis?.amplitude}
              height={300}
              isPopup={true}
            />
          )}
          {popupChart==='drift'&&(
            <Chart
              data={analysis?.series&&analysis?.seasonal?analysis.series.map((v,i)=>Number.isFinite(v)&&Number.isFinite(analysis.seasonal[i])?v-analysis.seasonal[i]:null):[]}
              dates={data?.dates}
              selected={t}
              unit="Deseasonalized LOS · mm"
              valueUnit="mm"
              isPopup={true}
            />
          )}
          {popupChart==='profiles'&&(
            <OverviewChart
              profile={profile}
              dates={data?.dates}
              date={data?.dates?.[t]}
              series={analysis?.series}
              velocity={analysis?.velocity}
              acceleration={analysis?.acceleration}
              selected={t}
              onSelect={setT}
              isPopup={true}
              onClose={()=>setPopupChart(null)}
            />
          )}
        </div>

        <div className="modal-kpi-ribbon">
          {popupChart==='los'&&(
            <>
              <div className="modal-kpi-item">
                <label>Current Selected Date</label>
                <strong>{data?.dates[t]}</strong>
              </div>
              <div className="modal-kpi-item">
                <label>Selected Displacement</label>
                <strong>{fmt(selectedDisp)} <small>mm</small></strong>
              </div>
              <div className="modal-kpi-item">
                <label>Cumulative Net Change</label>
                <strong>{fmt(net)} <small>mm</small></strong>
              </div>
              <div className="modal-kpi-item">
                <label>Mean LOS Velocity</label>
                <strong>{fmt(analysis?.velocity,1)} <small>mm/yr</small></strong>
              </div>
            </>
          )}
          {popupChart==='acc'&&(
            <>
              <div className="modal-kpi-item">
                <label>Current Acceleration</label>
                <strong>{fmt(acc)} <small>mm/yr²</small></strong>
              </div>
              <div className="modal-kpi-item">
                <label>Status</label>
                <strong style={{color:warning?'#ef4444':'#16a34a'}}>
                  {warning?'⚠ Trigger Exceeded (> 2 mm/yr²)':'Normal (< 2 mm/yr²)'}
                </strong>
              </div>
            </>
          )}
          {popupChart==='seasonal'&&(
            <>
              <div className="modal-kpi-item">
                <label>Seasonal Amplitude</label>
                <strong>{fmt(analysis?.amplitude)} <small>mm</small></strong>
              </div>
              <div className="modal-kpi-item">
                <label>Peak Displacement</label>
                <strong>+{fmt(analysis?.amplitude?analysis.amplitude/2:0)} <small>mm</small></strong>
              </div>
              <div className="modal-kpi-item">
                <label>Residual Deformation</label>
                <strong>{fmt(analysis?.residual)} <small>mm/cycle</small></strong>
              </div>
            </>
          )}
          {popupChart==='drift'&&(
            <>
              <div className="modal-kpi-item">
                <label>Residual Permanent Drift</label>
                <strong>{fmt(analysis?.residual)} <small>mm/yr trend</small></strong>
              </div>
              <div className="modal-kpi-item">
                <label>Cumulative Net Displacement</label>
                <strong>{fmt(net)} <small>mm</small></strong>
              </div>
            </>
          )}
          {popupChart==='profiles'&&(
            <>
              <div className="modal-kpi-item">
                <label>Transect Length</label>
                <strong>{fmt(profile?.length,0)} <small>m</small></strong>
              </div>
              <div className="modal-kpi-item">
                <label>Spatial LOS Gradient</label>
                <strong>{fmt(profile?.strain,0)} <small>με proxy</small></strong>
              </div>
              <div className="modal-kpi-item">
                <label>Observation Date</label>
                <strong>{data?.dates[t]}</strong>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )}
</>}

createRoot(document.getElementById('root')).render(<App/>);
