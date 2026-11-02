import React,{useRef,useEffect} from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import 'leaflet/dist/leaflet.css';

export const IDUKKI={name:'Idukki Dam',id:'KL29VH0027',PIC:'KL29VH0027',lat:9+50/60+35/3600,lon:76+58/60+35/3600};

function getUtmCrs(data){
  let epsg=Number(data?.meta?.crs_epsg||32643);
  let zone=(epsg>=32601&&epsg<=32660)?(epsg-32600):43;
  return `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;
}

export const ECCHARTS_CAPE_10=[
  '#FFFFFF', // 0: White (stable)
  '#FFFACC', // 1: Pale creamy yellow
  '#FFEB80', // 2: Light yellow
  '#FFD133', // 3: Golden yellow
  '#FFAD00', // 4: Amber gold
  '#FF8000', // 5: Pure orange
  '#FA4C00', // 6: Red-orange
  '#E61A00', // 7: Bright red
  '#BF001A', // 8: Crimson / deep red
  '#8C0033'  // 9: Dark red / wine (extreme)
];

export const HEX_BORDERS=[
  'rgba(148, 163, 184, 0.55)',
  'rgba(148, 163, 184, 0.45)',
  'rgba(255, 255, 255, 0.85)',
  'rgba(255, 255, 255, 0.85)',
  'rgba(255, 255, 255, 0.85)',
  'rgba(255, 255, 255, 0.85)',
  'rgba(255, 255, 255, 0.85)',
  'rgba(255, 255, 255, 0.85)',
  'rgba(255, 255, 255, 0.85)',
  'rgba(255, 255, 255, 0.85)'
];

export default function DamMap({view,data,slice,threshold,tool,poly,focus,selected,style='hex',dams=[],burstPolygons=[],showPolygons=true,activeDam,onSelect,onHover,onDam,onSelectDam}){
  const host=useRef(),map=useRef(),canvas=useRef(),layer=useRef(),line=useRef(),points=useRef(),props=useRef(),fade=useRef(threshold),fittedPic=useRef(null),polygonsGroup=useRef(),markersGroup=useRef();
  props.current={view,data,slice,threshold,tool,poly,selected,style,dams,burstPolygons,showPolygons,activeDam,onSelect,onHover,onDam,onSelectDam};

  useEffect(()=>{
    let m=L.map(host.current,{zoomControl:false,preferCanvas:true}).setView([20.5,78.5],5);
    map.current=m;
    L.control.zoom({position:'bottomright'}).addTo(m);
    let tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19});
    tiles.addTo(m);
    tiles.on('tileerror',()=>host.current.dataset.tileError='true');
    polygonsGroup.current=L.layerGroup().addTo(m);
    markersGroup.current=L.layerGroup().addTo(m);
    L.control.scale({imperial:false,position:'bottomright'}).addTo(m);

    const DotLayer=L.Layer.extend({
      onAdd(){
        this._c=L.DomUtil.create('canvas','zarr-map-canvas');
        this._c.style.pointerEvents='none';
        this.getPane().appendChild(this._c);
        canvas.current=this._c;
        m.on('move zoom resize moveend zoomend',draw);
        draw();
      },
      onRemove(){
        m.off('move zoom resize moveend zoomend',draw);
        this._c.remove();
      }
    });
    layer.current=new DotLayer();
    layer.current.addTo(m);

    function draw(){
      let {data,slice,view,style:renderStyle,selected:sel}=props.current,c=canvas.current;
      if(!c)return;
      let size=m.getSize(),dpr=Math.min(devicePixelRatio,2),ctx=c.getContext('2d');
      c.width=size.x*dpr;
      c.height=size.y*dpr;
      c.style.width=size.x+'px';
      c.style.height=size.y+'px';
      L.DomUtil.setPosition(c,m.containerPointToLayerPoint([0,0]));
      ctx.scale(dpr,dpr);
      if(view!=='overlay'||!data||!slice||!points.current)return;

      let activeArray = slice;
      let origin=m.getPixelOrigin(),paneOffset=m.containerPointToLayerPoint([0,0]),scale=2**m.getZoom(),ps=points.current;

      if(renderStyle==='dots'){
        let stride=Math.max(1,Math.ceil(2.8/(256*scale*10/(40075016*Math.cos(m.getCenter().lat*Math.PI/180)))));
        ctx.globalAlpha=.85;
        for(let category=0;category<10;category++){
          ctx.fillStyle=ECCHARTS_CAPE_10[category];
          ctx.beginPath();
          for(let i=0;i<activeArray.length;i++){
            if((i%600)%stride||Math.floor(i/600)%stride)continue;
            if(!Number.isFinite(activeArray[i])||!Number.isFinite(data.coherence[i])||data.coherence[i]<fade.current)continue;
            let mag=Math.abs(activeArray[i]);
            let cat=mag>=2500?9:mag>=2000?8:mag>=1750?7:mag>=1500?6:mag>=1250?5:mag>=1000?4:mag>=750?3:mag>=500?2:mag>=250?1:0;
            if(cat!==category)continue;
            let x=ps[i*2]*scale-origin.x-paneOffset.x,y=ps[i*2+1]*scale-origin.y-paneOffset.y;
            if(x<0||y<0||x>size.x||y>size.y)continue;
            ctx.moveTo(x+1,y);
            ctx.arc(x,y,1.2,0,Math.PI*2);
          }
          ctx.fill();
        }
      }else{
        let d10m=Math.abs(ps[2]-ps[0])*scale;
        let d5m=d10m*0.5;
        let step5mX=0.5;
        let step5mY=0.4330127;

        let stride=Math.max(1,Math.ceil(3.2/Math.max(d5m,0.001)));
        let R_screen=Math.max(2.2,(d5m*stride)/1.7320508);
        let gap=R_screen>=4.0?0.6:R_screen>=2.5?0.35:0.2;
        let drawR=Math.max(1.2,R_screen-gap);

        const cos30=0.8660254;
        const vx=[0,drawR*cos30,drawR*cos30,0,-drawR*cos30,-drawR*cos30];
        const vy=[-drawR,-drawR*0.5,drawR*0.5,drawR,drawR*0.5,-drawR*0.5];

        const totalCols5m=Math.floor(599/step5mX);
        const totalRows5m=Math.floor(599/step5mY);

        const paths=Array.from({length:10},()=>new Path2D());

        for(let ri=0;ri<totalRows5m;ri+=stride){
          let r_10m=ri*step5mY;
          let r0=Math.floor(r_10m),fr=r_10m-r0;
          let r1=Math.min(599,r0+1);
          let rowOffset=(ri%2)*0.5;

          for(let ci=0;ci<totalCols5m;ci+=stride){
            let c_10m=(ci+rowOffset)*step5mX;
            if(c_10m>=599)continue;
            let c0=Math.floor(c_10m),fc=c_10m-c0;
            let c1=Math.min(599,c0+1);

            let k00=r0*600+c0,k01=r0*600+c1,k10=r1*600+c0,k11=r1*600+c1;
            let wx=(1-fr)*((1-fc)*ps[k00*2]+fc*ps[k01*2])+fr*((1-fc)*ps[k10*2]+fc*ps[k11*2]);
            let wy=(1-fr)*((1-fc)*ps[k00*2+1]+fc*ps[k01*2+1])+fr*((1-fc)*ps[k10*2+1]+fc*ps[k11*2+1]);

            let sx=wx*scale-origin.x-paneOffset.x;
            let sy=wy*scale-origin.y-paneOffset.y;

            if(sx<-R_screen||sy<-R_screen||sx>size.x+R_screen||sy>size.y+R_screen)continue;

            let v00=activeArray[k00],v01=activeArray[k01],v10=activeArray[k10],v11=activeArray[k11];
            let c00=data.coherence[k00],c01=data.coherence[k01],c10=data.coherence[k10],c11=data.coherence[k11];
            let v,coh;
            if(Number.isFinite(v00)&&Number.isFinite(v01)&&Number.isFinite(v10)&&Number.isFinite(v11)){
              v=(1-fr)*((1-fc)*v00+fc*v01)+fr*((1-fc)*v10+fc*v11);
              coh=(1-fr)*((1-fc)*c00+fc*c01)+fr*((1-fc)*c10+fc*c11);
            }else{
              let nr=fr>0.5?r1:r0,nc=fc>0.5?c1:c0;
              let kn=nr*600+nc;
              v=activeArray[kn];coh=data.coherence[kn];
            }

            if(!Number.isFinite(v)||!Number.isFinite(coh)||coh<fade.current)continue;

            let mag=Math.abs(v);
            let cat=mag>=2500?9:
                mag>=2000?8:
                mag>=1750?7:
                mag>=1500?6:
                mag>=1250?5:
                mag>=1000?4:
                mag>=750 ?3:
                mag>=500 ?2:
                mag>=250 ?1:0;

            let p=paths[cat];
            p.moveTo(sx+vx[0],sy+vy[0]);
            p.lineTo(sx+vx[1],sy+vy[1]);
            p.lineTo(sx+vx[2],sy+vy[2]);
            p.lineTo(sx+vx[3],sy+vy[3]);
            p.lineTo(sx+vx[4],sy+vy[4]);
            p.lineTo(sx+vx[5],sy+vy[5]);
            p.closePath();
          }
        }

        for(let cat=0;cat<10;cat++){
          ctx.fillStyle=ECCHARTS_CAPE_10[cat];
          ctx.fill(paths[cat]);
          ctx.strokeStyle=HEX_BORDERS[cat];
          ctx.lineWidth=Math.min(1.0,Math.max(0.4,R_screen*0.08));
          ctx.stroke(paths[cat]);
        }

        if(sel&&Array.isArray(sel)){
          let [sr,sc]=sel;
          let sk=sr*600+sc;
          let sx=ps[sk*2]*scale-origin.x-paneOffset.x;
          let sy=ps[sk*2+1]*scale-origin.y-paneOffset.y;
          if(sx>=0&&sy>=0&&sx<=size.x&&sy<=size.y){
            ctx.save();
            ctx.strokeStyle='#18181b';
            ctx.lineWidth=2;
            ctx.beginPath();
            let selR=Math.max(R_screen+3,7);
            for(let k=0;k<6;k++){
              let th=k*Math.PI/3-Math.PI/2;
              let px=sx+selR*Math.cos(th),py=sy+selR*Math.sin(th);
              if(k===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    const position=event=>{
      let p=props.current;
      if(p.view!=='overlay'||!p.data)return null;
      let crs=getUtmCrs(p.data);
      let [x,y]=proj4('EPSG:4326',crs,[event.latlng.lng,event.latlng.lat]),col=Math.round((x-p.data.x[0])/10),row=Math.round((p.data.y[0]-y)/10);
      return row>=0&&row<600&&col>=0&&col<600?[row,col]:null;
    };
    m.on('click',e=>{let p=position(e);if(p)props.current.onSelect(...p)});
    let last=0;
    m.on('mousemove',e=>{if(performance.now()-last<100)return;last=performance.now();let p=position(e);if(p)props.current.onHover(...p)});
    layer.current.draw=draw;
    return()=>m.remove();
  },[]);

  // Render dam & burst polygons + dam markers (all 390 dams in 'map' view, active dam in 'overlay' view)
  useEffect(()=>{
    let m=map.current,mg=markersGroup.current,pg=polygonsGroup.current;
    if(!m||!mg||!pg)return;
    mg.clearLayers();
    pg.clearLayers();
    if(view==='map'){
      if(showPolygons&&Array.isArray(burstPolygons)&&burstPolygons.length){
        let activeBurst=activeDam?.primary_burst||activeDam?.burst_id||'';
        for(let b of burstPolygons){
          if(!Array.isArray(b.coordinates)||b.coordinates.length<3)continue;
          let latlngs=b.coordinates.map(pt=>[pt[1],pt[0]]);
          let isActiveBurst=activeBurst&&(b.burst_id===activeBurst||b.esa_burst===activeBurst);
          let isMulti=Boolean(b.is_multi_dam);
          let stroke=isActiveBurst?'#16a34a':isMulti?'#ea580c':'#2563eb';
          let polyLayer=L.polygon(latlngs,{
            color:stroke,
            weight:isActiveBurst?2.2:isMulti?1.35:1.0,
            opacity:isActiveBurst?0.9:isMulti?0.68:0.48,
            fillColor:stroke,
            fillOpacity:isActiveBurst?0.2:isMulti?0.12:0.06
          });
          polyLayer.bindTooltip(
            `<div class="dam-tip-inner"><strong>Sentinel-1 Burst ${b.esa_burst||b.burst_id}</strong><span>Track ${b.track||'—'} · Subswath ${b.subswath||'IW'} · <b>${b.dams_count||1} Dam(s)</b></span><span style="max-width:260px;white-space:normal">${b.dams_covered||''}</span></div>`,
            {sticky:true,direction:'top',className:'dam-tooltip'}
          );
          polyLayer.addTo(pg);
        }
      }
      let list=dams.length?dams:[IDUKKI];
      for(let d of list){
        if(!Number.isFinite(d.lat)||!Number.isFinite(d.lon))continue;
        let isActive=activeDam&&d.PIC===activeDam.PIC;
        let hasSbas=Boolean(d.has_sbas);
        if(showPolygons&&(hasSbas||isActive)&&Array.isArray(d.zarr_footprint_polygon)&&d.zarr_footprint_polygon.length>=4){
          let boxLatLngs=d.zarr_footprint_polygon.map(pt=>[pt[1],pt[0]]);
          L.polygon(boxLatLngs,{
            color:isActive?'#16a34a':'#c2410c',
            weight:isActive?2.0:1.2,
            dashArray:'4 3',
            fillColor:isActive?'#16a34a':'#ea580c',
            fillOpacity:isActive?0.22:0.12
          }).addTo(pg);
        }
        let cls=`dam-pin ${hasSbas?'dam-pin--sbas':'dam-pin--init'}${isActive?' dam-pin--active':''}`;
        let size=isActive?[26,26]:hasSbas?[18,18]:[12,12];
        let marker=L.marker([d.lat,d.lon],{
          icon:L.divIcon({
            className:cls,
            html:`<span>${isActive?'◆':hasSbas?'◆':'•'}</span>`,
            iconSize:size,
            iconAnchor:[size[0]/2,size[1]/2]
          }),
          zIndexOffset:isActive?1000:hasSbas?500:0
        });
        let capStr=d.capacity_mcm!=null&&Number.isFinite(Number(d.capacity_mcm))?`${Number(d.capacity_mcm).toLocaleString()} MCM`:'—';
        let typeStr=d.dam_type&&d.dam_type!=='Unspecified'?d.dam_type:'Dam';
        let riverStr=d.river?` · River: ${d.river}`:'';
        let cwcLine=(d.height_m||d.length_m||d.completion_year)
          ?`<span>${d.height_m?`H: <b>${d.height_m}m</b>`:''}${d.length_m?` · L: <b>${d.length_m}m</b>`:''}${d.completion_year?` · Built: <b>${d.completion_year}</b>`:''}</span>`
          :'';
        let burstStr=d.primary_burst||d.burst_id||'S1-IW';
        let geoSummary=hasSbas&&d.mean_velocity_mm_yr!=null
          ?`<div class="dam-tip-geo">Mean LOS Velocity: <b>${d.mean_velocity_mm_yr} mm/yr</b></div>`
          :'';
        let statusTag=hasSbas
          ?`<strong style="color:#ea580c">SBAS Zarr Layer (${d.total_acquisition_dates||d.epochs_processed||281} dates)</strong>`
          :`<span style="color:#64748b">Metadata in Zarr (Burst ${burstStr} · ${d.total_covering_bursts||1} bursts)</span>`;
        marker.bindTooltip(
          `<div class="dam-tip-inner"><strong>${d.name}</strong><span>${d.PIC} · ${d.state||'India'}${riverStr}</span><span>Capacity: <b>${capStr}</b> · ${typeStr}</span>${cwcLine}${geoSummary}${statusTag}</div>`,
          {direction:'top',offset:[0,-8],className:'dam-tooltip',permanent:isActive}
        );
        marker.on('click',()=>{
          if(props.current.onSelectDam)props.current.onSelectDam(d);
          else if(props.current.onDam)props.current.onDam();
        });
        marker.addTo(mg);
      }
    }else if(view==='overlay'&&activeDam&&Number.isFinite(activeDam.lat)&&Number.isFinite(activeDam.lon)){
      if(showPolygons){
        let aoiPoly=activeDam.zarr_footprint_polygon||data?.meta?.zarr_footprint_polygon;
        if(Array.isArray(aoiPoly)&&aoiPoly.length>=4){
          L.polygon(aoiPoly.map(pt=>[pt[1],pt[0]]),{
            color:'#475569',
            weight:1.4,
            dashArray:'6 4',
            fill:false,
            interactive:false
          }).addTo(pg);
        }
        let resPolys=activeDam.reservoir_polygons||data?.meta?.reservoir_polygons;
        if(Array.isArray(resPolys)&&resPolys.length){
          for(let ring of resPolys){
            if(!Array.isArray(ring)||ring.length<4)continue;
            L.polygon(ring.map(pt=>[pt[1],pt[0]]),{
              color:'#0284c7',
              weight:1.8,
              opacity:0.85,
              fillColor:'#38bdf8',
              fillOpacity:0.12,
              interactive:false
            }).addTo(pg);
          }
        }
      }
      let capStr=activeDam.capacity_mcm!=null&&Number.isFinite(Number(activeDam.capacity_mcm))?` · ${Number(activeDam.capacity_mcm).toLocaleString()} MCM`:'';
      L.marker([activeDam.lat,activeDam.lon],{
        icon:L.divIcon({className:'dam-marker',html:'<span>◆</span>',iconSize:[28,28],iconAnchor:[14,14]})
      })
        .addTo(mg)
        .bindTooltip(`${activeDam.name} (${activeDam.PIC}${capStr})`,{permanent:false,direction:'right',className:'dam-tooltip'})
        .on('click',()=>props.current.onDam&&props.current.onDam());
    }
  },[view,dams,burstPolygons,showPolygons,activeDam,data]);

  useEffect(()=>{
    if(!data)return;
    let a=new Float64Array(720000);
    for(let i=0;i<360000;i++){
      let lon=data.longitude[i],lat=data.latitude[i],sin=Math.sin(lat*Math.PI/180);
      a[i*2]=(lon+180)/360*256;
      a[i*2+1]=(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*256;
    }
    points.current=a;
    layer.current?.draw();
  },[data]);

  useEffect(()=>{
    let m=map.current;
    if(!m)return;
    if(view==='map'){
      if(dams&&dams.length>1){
        let lats=dams.map(d=>d.lat).filter(Number.isFinite);
        let lons=dams.map(d=>d.lon).filter(Number.isFinite);
        if(lats.length){
          m.fitBounds(
            [[Math.min(...lats),Math.min(...lons)],[Math.max(...lats),Math.max(...lons)]],
            {paddingTopLeft:[340,70],paddingBottomRight:[40,40],animate:false}
          );
        }
      }else if(activeDam){
        m.setView([activeDam.lat,activeDam.lon],11);
      }
      fittedPic.current=null;
    }else if(view==='overlay'&&data){
      let b=data.meta.wgs84_bounds;
      let curKey=`${data.pic||'default'}:${b.join(',')}`;
      if(fittedPic.current!==curKey){
        let leftPad=Math.min(690,Math.round((window.innerWidth||1440)*0.47));
        m.fitBounds([[b[1],b[0]],[b[3],b[2]]],{paddingTopLeft:[leftPad,75],paddingBottomRight:[30,235],animate:false});
        fittedPic.current=curKey;
      }
      setTimeout(()=>{
        if(map.current&&host.current)map.current.invalidateSize();
        layer.current?.draw();
      },80);
    }
    setTimeout(()=>{
      if(map.current&&host.current)map.current.invalidateSize();
    },50);
    layer.current?.draw();
  },[view,data,dams]);

  useEffect(()=>{layer.current?.draw()},[slice,style,selected]);
  useEffect(()=>{
    let id;
    function tick(){
      fade.current+=(threshold-fade.current)*.35;
      layer.current?.draw();
      if(Math.abs(threshold-fade.current)>.002)id=requestAnimationFrame(tick)
    }
    tick();
    return()=>cancelAnimationFrame(id);
  },[threshold]);

  useEffect(()=>{
    let m=map.current;
    if(!m)return;
    line.current?.remove();
    if(!data||poly.length<2)return;
    let crs=getUtmCrs(data);
    let coords=poly.map(([c,r])=>proj4(crs,'EPSG:4326',[data.x[0]+c*10,data.y[0]-r*10]).reverse());
    line.current=L.polyline(coords,{color:'#18181b',weight:1.5,dashArray:'4 4',interactive:false}).addTo(m);
  },[poly,data]);

  useEffect(()=>{
    if(!focus||!data||view!=='overlay')return;
    let crs=getUtmCrs(data);
    let [lon,lat]=proj4(crs,'EPSG:4326',[data.x[0]+focus.col*10,data.y[0]-focus.row*10]);
    map.current.flyTo([lat,lon],focus.span>5000?13:15,{duration:.7});
  },[focus]);

  useEffect(()=>{if(map.current){host.current.style.cursor=tool==='inspect'?'':'crosshair';}},[tool]);
  return <div ref={host} className="geographic-map" aria-label={view==='map'?'Dam location base map':'Georeferenced Zarr displacement overlay'}/>;
}
