/* A deterministic film: every visual is a function of the narration clock. */
(async function () {
  'use strict';
  const query = new URLSearchParams(location.search);
  const portrait = query.get('format') === 'portrait';
  const W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080;
  const canvas = document.getElementById('film');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d', { alpha: false });
  const D = await (await fetch('manifest.json')).json();
  const loadImage = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
  const [earth, aquiferImage, preparednessImage, urbanImage, ...fields] = await Promise.all([
    loadImage('earth.jpg'), loadImage('aquifer-cinematic.png'), loadImage('preparedness-cinematic.png'), loadImage('urban-water-cinematic.png'),
    ...D.pacific.months.map(m => loadImage('../../' + m.file)),
  ]);
  const WHITE = '#f4f7fa', MINT = '#89e2cf', WARM = '#ff9679', BLUE = D.design.seq.dark[1], MUTED = '#b3c5d5';
  const month = date => new Date(date+'-01T00:00:00Z').toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'});
  const monthWindow = D.rain.months.split('-').map(m=>month(D.season.year+'-'+m)).join('–');
  const signed = value => (value>0?'+':value<0?'−':'')+Math.abs(value);
  const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
  const ease = x => { x=clamp(x); return x*x*(3-2*x); };
  const mix = (a,b,t) => a+(b-a)*t;
  const noise = i => { const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x); };
  const margin = portrait ? 64 : 100;
  let overflow = [], geography = [];
  function font(size,weight=400){c.font=`${weight} ${size}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`;}
  function text(str,x,y,size=30,color=WHITE,weight=400,align='left'){
    font(size,weight);c.fillStyle=color;c.textAlign=align;c.fillText(str,x,y);c.textAlign='left';
    const width=c.measureText(str).width;
    if((align==='left'&&(x+width>W-18||x<0))||(align==='center'&&(x-width/2<0||x+width/2>W))||(align==='right'&&(x-width<0||x>W))||y>H||y-size<0) overflow.push(str);
  }
  function wrapped(str,x,y,width,size=32,color=WHITE,weight=400,lineHeight=size*1.4,align='left'){
    font(size,weight);const words=str.split(' ');let line='',lines=[];
    for(const word of words){const next=line?line+' '+word:word;if(c.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);
    lines.forEach((line,i)=>text(line,x,y+i*lineHeight,size,color,weight,align));return lines.length*lineHeight;
  }
  function line(x1,y1,x2,y2,color,width=2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  function dot(x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
  function arrow(x1,y1,x2,y2,color=WHITE,width=3){line(x1,y1,x2,y2,color,width);const a=Math.atan2(y2-y1,x2-x1);line(x2,y2,x2-15*Math.cos(a-.45),y2-15*Math.sin(a-.45),color,width);line(x2,y2,x2-15*Math.cos(a+.45),y2-15*Math.sin(a+.45),color,width);}
  function background(){
    const g=c.createLinearGradient(0,0,W,H);D.design.band.forEach((color,i)=>g.addColorStop([0,.58,1][i],color));c.fillStyle=g;c.fillRect(0,0,W,H);
  }
  function header(scene,index,p){
    dot(margin,57,6,MINT);text('AP / GROUNDWATER INTELLIGENCE',margin+22,66,portrait?23:22,MUTED,600);
    text(String(index+1).padStart(2,'0')+' / '+String(D.scenes.length).padStart(2,'0'),W-margin,66,22,MUTED,500,'right');
    if(!D.review.publishApproved)text('REVIEW CUT / TEMPORARY VOICE',portrait?margin:W-margin-160,portrait?101:65,16,WARM,500,portrait?'left':'right');
    c.save();c.globalAlpha=ease(p*10);const dy=18*(1-ease(p*10));
    text(scene.chapter.toUpperCase(),margin,portrait?166+dy:147+dy,portrait?25:22,MINT,600);
    const size=portrait?70:60;
    scene.title.split('\n').forEach((s,i)=>text(s,margin,(portrait?250:222)+i*size*1.1+dy,size,WHITE,600));
    c.restore();
  }
  function footer(scene,t,index){
    const fadeHeight=portrait?325:255;
    const g=c.createLinearGradient(0,H-fadeHeight,0,H);g.addColorStop(0,'#06101a00');g.addColorStop(.34,'#06101aee');g.addColorStop(1,'#06101a');
    c.fillStyle=g;c.fillRect(0,H-fadeHeight,W,fadeHeight);
    const sentences=scene.voice.split(/(?<=[.!?])\s+(?=[A-Z])/).map(s=>s.trim());
    const weights=sentences.map(s=>s.length);const all=weights.reduce((a,b)=>a+b,0);
    let upto=0,caption=sentences[sentences.length-1];
    const fraction=clamp((t-scene.start-.35)/scene.speechDuration);
    for(let i=0;i<sentences.length;i++){upto+=weights[i]/all;if(fraction<=upto){caption=sentences[i];break;}}
    if(scene.captionCues)caption=[...scene.captionCues].reverse().find(cue=>t-scene.start>=cue.time)?.text||scene.captionCues[0].text;
    wrapped(caption,W/2,H-(portrait?267:210),W-margin*2,portrait?35:30,WHITE,400,portrait?49:42,'center');
    wrapped(scene.source,margin,H-102,W-margin*2,portrait?19:20,MUTED,400,25);
    const x=margin,y=H-39,width=W-margin*2,gap=8,unit=(width-gap*(D.scenes.length-1))/D.scenes.length;
    D.scenes.forEach((s,i)=>{c.fillStyle='#2d404b';c.fillRect(x+i*(unit+gap),y,unit,3);c.fillStyle=MINT;c.fillRect(x+i*(unit+gap),y,unit*clamp((t-s.start)/s.duration),3);});
  }

  // Earth and aquifer share a WebGL renderer; the finished frame is composited on Canvas.
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setSize(1200,1200);renderer.setPixelRatio(1);renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.setClearColor(0x000000,0);
  const scene3=new THREE.Scene();
  const texture=new THREE.Texture(earth);texture.needsUpdate=true;texture.encoding=THREE.sRGBEncoding;texture.anisotropy=8;
  const planet=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.MeshPhongMaterial({map:texture,shininess:0,specular:0x000000}));scene3.add(planet);
  scene3.add(new THREE.AmbientLight(0xffffff,.85));const sunlight=new THREE.DirectionalLight(0xfff2de,.65);scene3.add(sunlight);
  const fieldTextures=fields.map(img=>{
    const cn=document.createElement('canvas');cn.width=2048;cn.height=1024;const cx=cn.getContext('2d');
    const split=(180-62)/230,y=(90-42)/180*1024,h=84/180*1024;
    cx.drawImage(img,0,0,img.width*split,img.height,(62+180)/360*2048,y,118/360*2048,h);
    cx.drawImage(img,img.width*split,0,img.width*(1-split),img.height,0,y,112/360*2048,h);
    const fade=cx.createLinearGradient(0,y,0,y+h);fade.addColorStop(0,'#ffffff00');fade.addColorStop(.06,'#ffffff');fade.addColorStop(.94,'#ffffff');fade.addColorStop(1,'#ffffff00');cx.globalCompositeOperation='destination-in';cx.fillStyle=fade;cx.fillRect(0,0,2048,1024);
    const tex=new THREE.CanvasTexture(cn);tex.encoding=THREE.sRGBEncoding;return tex;
  });
  const sstGlobe=new THREE.Mesh(new THREE.SphereGeometry(1.005,96,64),new THREE.MeshBasicMaterial({transparent:true,opacity:.86,depthWrite:false}));sstGlobe.visible=false;scene3.add(sstGlobe);
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.027,80,60),new THREE.ShaderMaterial({
    uniforms:{},vertexShader:'varying vec3 n; varying vec3 v; void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }',
    fragmentShader:'varying vec3 n; varying vec3 v; void main(){ float f=pow(1.0-abs(dot(normalize(n),normalize(v))),4.0); gl_FragColor=vec4(0.16,0.65,0.94,f*.5); }',
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.FrontSide}));scene3.add(atmosphere);
  const camera=new THREE.PerspectiveCamera(42,1,.01,100);
  const pos=(lon,lat,r=1)=>new THREE.Vector3(r*Math.cos(lat*Math.PI/180)*Math.cos(lon*Math.PI/180),r*Math.sin(lat*Math.PI/180),-r*Math.cos(lat*Math.PI/180)*Math.sin(lon*Math.PI/180));
  const apGlobe=new THREE.Group();scene3.add(apGlobe);apGlobe.visible=false;
  D.shapes.forEach(m=>m.rings.forEach(r=>{
    const shape=new THREE.Shape(r.map(v=>new THREE.Vector2(v[0],v[1]))),geometry=new THREE.ShapeGeometry(shape);
    const vertices=geometry.attributes.position;
    for(let i=0;i<vertices.count;i++){const v=pos(vertices.getX(i),vertices.getY(i),1.013);vertices.setXYZ(i,v.x,v.y,v.z);}
    geometry.computeVertexNormals();
    apGlobe.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:new THREE.Color('#39d5b0').convertSRGBToLinear(),side:THREE.DoubleSide,transparent:true,opacity:.96,depthWrite:false})));
  }));
  D.districtShapes.forEach(d=>d.rings.forEach(r=>apGlobe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(r.map(v=>pos(v[0],v[1],1.018))),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.34})))));
  let globeView;
  function globe(lon,lat,t,{x,y,size},ap=false){
    if(renderer.domElement.width!==1200||renderer.domElement.height!==1200)renderer.setSize(1200,1200);
    camera.position.copy(pos(lon,lat,3.0));camera.lookAt(0,0,0);sunlight.position.copy(camera.position).add(new THREE.Vector3(-1.8,2,1));
    apGlobe.visible=ap;renderer.render(scene3,camera);c.drawImage(renderer.domElement,x-size/2,y-size/2,size,size);
    globeView={x,y,size};
    if(ap){const p=projectGeo(80.6,16.4);const point=pos(80.6,16.4);if(point.dot(camera.position.clone().normalize())>.36){
      geography.push({label:'ANDHRA PRADESH',x:p.x,y:p.y,visible:true,inFrame:p.x>20&&p.x<W-20&&p.y>100&&p.y<H-330});
      c.strokeStyle='#89e2cf';c.lineWidth=2.5;c.beginPath();c.arc(p.x,p.y,20+12*(t%1),0,Math.PI*2);c.stroke();dot(p.x,p.y,5,WHITE);
      const lx=Math.min(W-340,p.x+(portrait?95:100)),ly=p.y-95;
      line(p.x,p.y,lx,ly,MINT,2.4);line(lx,ly,lx+289,ly,MINT,2.4);
      c.fillStyle='#052b2be8';c.fillRect(lx-8,ly-75,306,69);
      text('ANDHRA PRADESH',lx+7,ly-42,portrait?27:26,WHITE,600);text('INDIA / EAST COAST',lx+7,ly-17,18,MINT,500);
    }}
  }
  function projectGeo(lon,lat,r=1.02){const v=pos(lon,lat,r).project(camera);return{x:globeView.x+v.x*globeView.size/2,y:globeView.y-v.y*globeView.size/2};}
  function regionLabel(label,lon,lat,detail,t){
    const q=projectGeo(lon,lat),visible=pos(lon,lat).dot(camera.position.clone().normalize())>.36;
    const inFrame=q.x>24&&q.x<W-24&&q.y>120&&q.y<H-340;
    geography.push({label,x:q.x,y:q.y,visible,inFrame});
    if(!visible||!inFrame)return;
    dot(q.x,q.y,5,WHITE);c.strokeStyle=MINT;c.lineWidth=2;c.beginPath();c.arc(q.x,q.y,13+(t%1)*9,0,Math.PI*2);c.stroke();
    font(portrait?20:18,500);const width=Math.max(314,c.measureText(detail).width+24);
    const lx=clamp(q.x+35,portrait?50:830,W-width-24),ly=clamp(q.y-74,portrait?460:330,portrait?1110:725);
    line(q.x,q.y,lx,ly,MINT,2);c.fillStyle='#061b26ec';c.fillRect(lx-12,ly-57,width,68);
    text(label,lx,ly-28,portrait?27:25,WHITE,600);text(detail,lx,ly-3,portrait?20:18,MINT,500);
  }
  function geoArc(lon1,lat1,lon2,lat2,lift,t,color){
    const a=pos(lon1,lat1),b=pos(lon2,lat2);let last;
    for(let i=0;i<=80;i++){const p=i/80;const v=a.clone().lerp(b,p).normalize().multiplyScalar(1.03+Math.sin(p*Math.PI)*lift);
      if(v.clone().normalize().dot(camera.position.clone().normalize())<.08){last=null;continue;}
      const q=v.clone().project(camera),xy={x:globeView.x+q.x*globeView.size/2,y:globeView.y-q.y*globeView.size/2};
      if(last)line(last.x,last.y,xy.x,xy.y,color,2);last=xy;
    }
    for(let k=0;k<7;k++){const p=(t*.11+k/7)%1;const v=a.clone().lerp(b,p).normalize().multiplyScalar(1.03+Math.sin(p*Math.PI)*lift);if(v.clone().normalize().dot(camera.position.clone().normalize())<.08)continue;v.project(camera);dot(globeView.x+v.x*globeView.size/2,globeView.y-v.y*globeView.size/2,4,color);}
  }
  function oceanFlow(t,{east=false,strength=1,opacity=1}={}){
    const lanes=east?4:7;
    for(let lane=0;lane<lanes;lane++){
      const latitude=east?-13+lane*3.5:-11+lane*4.2;
      const sample=s=>{
        const lon=east?mix(143,264,s):mix(259,132,s);
        const lat=latitude+Math.sin(s*Math.PI*2.2+lane*.48)*4.6+Math.sin(s*Math.PI*5+lane*.6)*.65;
        const xyz=pos(lon,lat,1.027);
        if(xyz.dot(camera.position.clone().normalize())<.34)return null;
        return projectGeo(lon,lat,1.027);
      };
      for(let j=0;j<4;j++){
        const head=(t*(east?.045:.055)*strength+j/4+lane*.082)%1;
        const trail=[];
        for(let k=0;k<=28;k++){
          const s=head-.21+k*.21/28;
          if(s<0||s>1)continue;const q=sample(s);if(q)trail.push(q);
        }
        if(trail.length>1){
          const first=trail[0],last=trail[trail.length-1],gradient=c.createLinearGradient(first.x,first.y,last.x,last.y);
          gradient.addColorStop(0,east?'#ffb68800':'#e0f3fa00');gradient.addColorStop(1,east?'#ffb688':'#e0f3fa');
          c.save();c.lineCap='round';c.lineJoin='round';c.beginPath();trail.forEach((q,i)=>i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y));
          c.strokeStyle=gradient;c.globalAlpha=opacity*.16;c.lineWidth=east?12:9;c.stroke();
          c.globalAlpha=opacity*.92;c.lineWidth=east?3.1:2.5;c.stroke();c.restore();
        }
        const a=sample(head-.012),b=sample(head);
        if(a&&b){const angle=Math.atan2(b.y-a.y,b.x-a.x),sz=east?10:9;c.save();c.globalAlpha=opacity*.9;c.fillStyle=east?'#ffc193':WHITE;c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x-sz*Math.cos(angle-.4),b.y-sz*Math.sin(angle-.4));c.lineTo(b.x-sz*Math.cos(angle+.4),b.y-sz*Math.sin(angle+.4));c.closePath();c.fill();c.restore();}
      }
    }
  }
  function pacificSection(x,y,w,h,shift,t){
    text('EQUATORIAL PACIFIC / SCHEMATIC',x,y-31,portrait?22:20,MUTED,500);
    const top=y+20,left=y+mix(h*.77,h*.49,shift),right=y+mix(h*.25,h*.51,shift);
    const cold=c.createLinearGradient(0,y,0,y+h);cold.addColorStop(0,'#246e86');cold.addColorStop(1,'#0d2f44');c.fillStyle=cold;c.fillRect(x,top,w,h-20);
    const wave=(u,phase=0)=>Math.sin(u*21-t*1.9+phase)*3.6+Math.sin(u*39-t*2.8+phase)*1.25;
    c.beginPath();c.moveTo(x,top);for(let i=0;i<=100;i++)c.lineTo(x+i*w/100,top+wave(i/100));
    c.lineTo(x+w,right);c.bezierCurveTo(x+w*.7,right,x+w*.35,left,x,left);c.closePath();
    const heat=c.createLinearGradient(x,0,x+w,0);heat.addColorStop(0,'#ea805bdc');heat.addColorStop(.45,'#d99458c0');heat.addColorStop(1,shift>.4?'#e99860cf':'#37869365');c.fillStyle=heat;c.fill();
    c.save();c.beginPath();c.rect(x,top-7,w,h+7);c.clip();
    for(let j=0;j<4;j++){
      c.beginPath();for(let i=0;i<=100;i++){const xx=x+i*w/100,yy=top+wave(i/100,j*.35)+j*4;i?c.lineTo(xx,yy):c.moveTo(xx,yy);}
      c.strokeStyle=['#d3faffcf','#8fd9e266','#77c9dc44','#74bbd033'][j];c.lineWidth=j?1:2;c.stroke();
    }
    for(let k=0;k<23;k++){const u=(noise(k*17)+t*.027)%1,xx=x+w*u,yy=top+wave(u)+2;line(xx,yy,xx+5,yy,'#edffff96',1);}
    c.restore();
    c.beginPath();c.moveTo(x,left);c.bezierCurveTo(x+w*.35,left,x+w*.7,right,x+w,right);c.strokeStyle='#f6d3a5';c.lineWidth=2;c.stroke();
    text('WARM SURFACE',x+18,top+34,portrait?23:20,'#fff1da',500);
    text('COLDER DEEP WATER',x+w*.40,y+h-25,portrait?23:20,'#83c6e0',500);
    text('INDONESIA / WEST',x,y+h+33,portrait?21:19,MUTED,500);
    text('S. AMERICA / EAST',x+w,y+h+33,portrait?21:19,MUTED,500,'right');
    for(let i=0;i<12;i++){
      const f=(t*.1+i/12)%1,xx=x+w*(shift>.5?f:1-f),yy=top+12;
      line(xx,yy,xx+(shift>.5?13:-13),yy,WHITE,1.7);
    }
    if(shift<.65){
      const xx=x+w*.93;arrow(xx,y+h*.8,xx,y+h*.27,BLUE,2.5);
      for(let i=0;i<4;i++){const f=(t*.45+i/4)%1;dot(xx,y+h*.8-f*h*.5,2.3,BLUE);}
    }
  }
  function globeShot(id,p,t){
    const v=portrait?{x:W*.5,y:H*.51,size:W*1.22}:{x:W*.70,y:H*.5,size:H*1.14};
    const scene=D.scenes.find(s=>s.id===id),local=t-scene.start;
    const cues=scene.locationCues;
    const travel=cues?ease((local-(cues[0].time+.55))/(cues[1].time-.3-cues[0].time-.55)):0;
    const lon=id==='india'?mix(102,82,ease(p)):id==='close'?mix(87,78,p):mix(96,195,travel);
    if(id==='india'){v.size*=1+ease(p)*.075;}
    globe(lon,id==='india'||id==='close'?20:13,t,v,id==='india'||id==='close'||(id==='connection'&&travel<.5));
    if(id==='connection'){
      oceanFlow(t,{opacity:.3,strength:.6});
      if(travel>.6)regionLabel('PACIFIC OCEAN',195,0,'THE OCEAN CONNECTION',t);
      const x=portrait?margin:margin,y=portrait?H*.77:580;
      text('PACIFIC',x,y,portrait?28:26,MINT,600);line(x,y+28,x+(portrait?W-2*margin:430),y+28,'#486673');
      text('INDIA',x,y+78,portrait?28:26,MUTED,500);text('ANDHRA PRADESH',x,y+131,portrait?28:26,WHITE,600);
    }
    if(id==='india'){
      geoArc(148,-5,75,21,.25,t,MINT);
      text('ATMOSPHERIC CIRCULATION',portrait?W/2:W*.71,portrait?H*.76:780,portrait?24:22,MINT,500,'center');
      if(!portrait){wrapped('A weaker summer monsoon becomes more likely. The outcome still varies.',margin,540,510,31,MUTED,400,45);}
    }
    if(id==='close'){
      const y=portrait?H*.66:471;
      [['01','VERIFY','Local readings and source dates'],['02','PRIORITISE','Drinking-water supply and stressed areas'],['03','ASSIGN','Owners, actions and review dates']].forEach((row,i)=>{
        const yy=y+i*(portrait?103:100);text(row[0],margin,yy,22,MINT,600);text(row[1],margin+48,yy,portrait?28:26,WHITE,600);
        text(row[2],margin+48,yy+37,portrait?24:21,MUTED);
      });
    }
  }

  function pacificShot(id,p,t){
    const v=portrait?{x:W*.5,y:857,size:W*1.02}:{x:W*.72,y:H*.46,size:H*1.11};
    if(id==='nino'){
      const first=Math.max(0,fields.length-7),frame=Math.min(fields.length-1,first+Math.floor(p*(fields.length-first)));sstGlobe.material.map=fieldTextures[frame];sstGlobe.material.needsUpdate=true;sstGlobe.visible=true;
      globe(-168+p*14,8,t,v);sstGlobe.visible=false;
      oceanFlow(t,{strength:mix(.55,.25,p),opacity:.38});oceanFlow(t,{east:true,strength:.8,opacity:.85});
      const windLabel=projectGeo(194,20);text('WEAKER TRADE WINDS',windLabel.x,windLabel.y-22,portrait?25:24,WHITE,600,'center');
      const m=D.pacific.months[frame],xx=margin,yy=portrait?1220:396;
      text(m.month+' / MONTHLY NIÑO 3.4',xx,yy,portrait?24:23,MUTED,500);
      text((m.nino34C>0?'+':'')+m.nino34C.toFixed(2)+'°C',xx,yy+(portrait?75:87),portrait?71:81,m.nino34C<0?BLUE:WARM,600);
      if(portrait)pacificSection(margin,1381,W-margin*2,154,ease(p*2),t);else pacificSection(margin,615,590,144,ease(p*2),t);
      const a=projectGeo(190,5),b=projectGeo(240,5),d=projectGeo(190,-5),e=projectGeo(240,-5);
      c.setLineDash([7,7]);line(a.x,a.y,b.x,b.y,'#ffffffdd',2);line(d.x,d.y,e.x,e.y,'#ffffffdd',2);line(a.x,a.y,d.x,d.y,'#ffffffdd',2);line(b.x,b.y,e.x,e.y,'#ffffffdd',2);c.setLineDash([]);
      text('NIÑO 3.4',Math.min(W-220,b.x),a.y-35,portrait?25:23,WHITE,600);
      text('WARM WATER → EAST',portrait?W/2:W*.74,portrait?1155:786,portrait?25:24,WARM,600,'center');
    }else{
      const normal=D.scenes.find(s=>s.id==='normal'),local=t-normal.start,cues=normal.locationCues;
      const travel=ease((local-cues[0].time-.55)/(cues[1].time-.35-cues[0].time-.55));
      globe(mix(140,264,travel),mix(7,-5,travel),t,v);oceanFlow(t);
      text('TRADE WINDS  ←  WEST',portrait?W/2:W*.72,portrait?453:337,portrait?26:25,WHITE,600,'center');
      if(travel<.48)regionLabel('INDONESIA',120,-3,'WESTERN PACIFIC / WARM POOL',t);
      else regionLabel('SOUTH AMERICA',-78,-8,'PERU COAST / COLD UPWELLING',t);
      const x=margin,y=portrait?1260:430;
      text(travel>.72?'COLD WATER RISES IN THE EAST':'WARM WATER PILES UP IN THE WEST',x,y,portrait?27:25,travel>.72?BLUE:MINT,600);
      pacificSection(x,portrait?1360:554,portrait?W-margin*2:590,portrait?180:194,0,t);
    }
  }
  function historyShot(p,t){
    globe(-150+p*16,12,t,portrait?{x:W*.64,y:870,size:1240}:{x:W*.73,y:480,size:1150});
    c.fillStyle='#06101a55';c.fillRect(0,0,W,H);
    const y=portrait?H*.57:570;
    const x=margin,span=portrait?W-margin*2:960;
    line(x,y,x+span,y,'#40616f',3);line(x,y,x+span*ease(p*1.7),y,WARM,4);
    [[.16,'1997–98'],[.75,'2015–16']].forEach(([f,label],i)=>{
      const xx=x+span*f,show=ease((p-i*.25)*5);c.save();c.globalAlpha=show;
      dot(xx,y,10,WARM);text(label,xx,y-40,portrait?54:66,WHITE,600,'center');text('MAJOR EL NIÑO',xx,y+52,portrait?22:24,MUTED,500,'center');c.restore();
    });
    text('A recurring ocean–atmosphere pattern',margin,portrait?y+177:y+147,portrait?31:30,MINT,500);
  }
  function rainShot(p,t){
    const r=D.rain,delta=Math.abs(r.anomalyPct),negative=r.anomalyPct<0;
    const x=margin,y=portrait?520:460;
    text(signed(r.anomalyPct)+'%',x,y,portrait?157:142,WARM,600);
    text(negative?'RAINFALL BELOW AVERAGE':'RAINFALL ABOVE AVERAGE',x,y+57,portrait?26:25,MUTED,500);
    const bx=portrait?margin:900,by=portrait?850:405,bw=portrait?W-2*margin:820,max=Math.max(r.mm,r.normalMm)*1.07;
    const labels=['Historical average','This season'];const amounts=[r.normalMm,r.mm];
    amounts.forEach((v,i)=>{
      const yy=by+i*(portrait?220:177),len=bw*v/max*ease((p-i*.1)*2.5);
      text(labels[i],bx,yy,portrait?31:28,MUTED,500);text(v+' mm',bx+bw,yy,portrait?34:32,WHITE,600,'right');
      c.fillStyle='#173240';c.fillRect(bx,yy+26,bw,portrait?100:71);
      const grad=c.createLinearGradient(bx,0,bx+bw,0);grad.addColorStop(0,i?'#b34e40':'#237783');grad.addColorStop(1,i?WARM:MINT);c.fillStyle=grad;c.fillRect(bx,yy+26,len,portrait?100:71);
      c.save();c.beginPath();c.rect(bx,yy+26,len,portrait?100:71);c.clip();
      for(let k=0;k<100;k++){const xx=bx+noise(k*3)*bw,yd=yy+26+((noise(k*7)+t*.2)%1)*(portrait?100:71);line(xx,yd,xx+2,yd+12,'#ffffff40',2);}
      c.restore();
    });
    text(monthWindow.toUpperCase()+' '+D.season.year,margin,portrait?1330:650,portrait?29:27,MINT,600);
    text(D.rain.product.split(' monthly')[0]+' · Andhra Pradesh',margin,portrait?1385:702,portrait?29:27,MUTED);
    text('RANK '+r.rankDriest+' DRIEST / '+r.ofYears+' YEARS',margin,portrait?1460:764,portrait?29:26,WHITE,600);
    if(r.notYetPublished?.length)text('September rainfall not yet published in this snapshot',portrait?margin:900,portrait?1510:770,portrait?25:23,MUTED);
  }

  function apHistoryShot(p,t){
    const h=D.history,xx=margin,yy=portrait?490:490;
    text(h.elNinoBelowNormal+' / '+h.elNinoYears,xx,yy,portrait?134:116,WARM,600);
    text('EL NIÑO SUMMER MONSOONS',xx,yy+55,portrait?26:25,MUTED,500);
    text('had below-average AP rainfall',xx,yy+107,portrait?30:28,WHITE,500);
    text(signed(h.elNinoAnomalyPct)+'% mean anomaly',xx,yy+164,portrait?32:30,WARM,600);
    const x=portrait?margin:820,y=portrait?870:460,width=portrait?W-margin*2:975,height=portrait?390:235;
    const rows=h.elNinoYearDetail,band=width/rows.length;
    [10,20,30,40].forEach(n=>{const gy=y+height*n/40;line(x,gy,x+width,gy,'#34515d65',1);});
    line(x,y,x+width,y,'#75939f',2);text('AVERAGE',x+width,y-25,20,MUTED,500,'right');
    rows.forEach((r,i)=>{
      const v=r.anomalyPct,bh=Math.abs(v)/40*height*ease((p-i*.025)*2.6),bx=x+i*band+band*.18;
      const by=v<0?y:y-bh;c.fillStyle=v<0?WARM:MINT;c.fillRect(bx,by,band*.63,bh);
      text(r.year,bx+band*.315,y+height+48,portrait?22:22,MUTED,500,'center');
      text((v>0?'+':'')+v+'%',bx+band*.315,v<0?y+bh+31:y-bh-18,portrait?21:22,WHITE,600,'center');
    });
    const fy=portrait?1450:725;
    text(h.firstYear+'–'+h.lastYear+'  /  JUNE–SEPTEMBER',margin,fy,portrait?25:24,MINT,600);
    text('Individual years: '+h.elNinoRangePct[0]+'% to +'+h.elNinoRangePct[1]+'%',margin,fy+48,portrait?27:26,MUTED);
  }
  function districtShot(p,t){
    const rows=[...D.districts].sort((a,b)=>b.shortfallM-a.shortfallM).slice(0,3);
    const viewport=portrait?{x:20,y:375,w:1040,h:680}:{x:35,y:290,w:820,h:510};
    drawAPMap(p,t,viewport,rows.map(r=>r.district.toUpperCase()));
    rows.forEach((r,i)=>{
      const shape=D.districtShapes.find(d=>d.district===r.district.toUpperCase());
      if(!shape)return;const point=mapPoint(shape.center,viewport),offset=[[-50,-15],[-85,-33],[63,30]][i],bx=point.x+offset[0],by=point.y+offset[1];
      line(point.x,point.y,bx,by,MINT,1.5);dot(point.x,point.y,4,WHITE);
      dot(bx,by,20,'#102832');text(String(i+1),bx,by+8,24,WHITE,600,'center');
    });
    const x=portrait?margin:940,y=portrait?1110:375,width=portrait?W-margin*2:860,step=portrait?155:148;
    rows.forEach((r,i)=>{
      const yy=y+i*step,progress=ease((p-i*.12)*3);
      text('0'+(i+1),x,yy,22,MINT,600);text(r.district,x+49,yy,portrait?36:32,WHITE,600);
      text(r.shortfallM+' m',x+width,yy,portrait?39:38,WARM,600,'right');
      c.fillStyle='#1d333e';c.fillRect(x,yy+20,width,7);c.fillStyle=WARM;c.fillRect(x,yy+20,width*r.shortfallM/rows[0].shortfallM*progress,7);
      text(r.mandals+' mandals monitored  ·  '+r.shortMandals+' flagged',x,yy+61,portrait?24:22,MUTED);
      const h=D.history.byDistrict.find(h=>h.district===r.district.toUpperCase());
      if(h)text('Historical El Niño rain: '+signed(h.elNinoAnomalyPct)+'% mean',x,yy+97,portrait?24:22,MINT);
    });
    text('LARGEST MEDIAN WATER-LEVEL SHORTFALLS',x,portrait?1057:322,portrait?22:21,MINT,600);
    if(!portrait)text('Rain history: '+D.history.elNinoYears+' El Niño seasons · '+D.history.firstYear+'–'+D.history.lastYear,margin,799,23,MUTED);
  }

  // The illustration supplies texture, not measurements. Observed depths use a separate scale.
  const fractures=[[[.24,.63],[.38,.57],[.4,.63],[.45,.69],[.50,.73],[.58,.72],[.65,.79],[.738,.735]],[[.26,.64],[.29,.74],[.34,.77],[.47,.72]],[[.57,.72],[.53,.84],[.63,.81],[.738,.735]]];
  // Sample by travelled distance, so short fracture segments do not accelerate the water.
  function flowPath(source,xy,t,count,color=MINT){
    const points=source.map(xy),lengths=[0];
    for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
    const total=lengths[lengths.length-1];
    const sample=f=>{const d=clamp(f)*total,j=Math.max(1,lengths.findIndex(v=>v>=d)),a=points[j-1],b=points[j],u=(d-lengths[j-1])/(lengths[j]-lengths[j-1]);return{x:mix(a.x,b.x,u),y:mix(a.y,b.y,u)};};
    const alpha=c.globalAlpha;c.save();c.lineCap='round';c.lineJoin='round';c.strokeStyle=color;c.globalAlpha=alpha*.27;c.lineWidth=1.6;
    c.beginPath();points.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.stroke();
    for(let i=0;i<count;i++){
      const f=(t*.12+i/count)%1,q=sample(f),tail=sample(Math.max(0,f-.055));
      c.globalAlpha=alpha*.7;c.shadowColor=color;c.shadowBlur=7;line(tail.x,tail.y,q.x,q.y,color,2.3);dot(q.x,q.y,2.2,'#dbfff5');
    }c.restore();
  }
  function callout(label,x,y,px,py,color=MINT){
    font(portrait?25:22,600);const width=c.measureText(label).width;
    line(px,py,x-12,y-9,color,1.4);dot(px,py,4,color);
    c.fillStyle='#06151de8';c.fillRect(x-10,y-30,width+24,43);text(label,x,y,portrait?25:22,color,600);
  }
  function aquiferShot(id,p,t){
    const w=portrait?1710+p*95:1430+p*65,h=w*aquiferImage.height/aquiferImage.width;
    const x=portrait?-460-p*50:520-p*35,y=portrait?455-p*24:154-p*18;
    c.drawImage(aquiferImage,x,y,w,h);
    const xy=([a,b])=>({x:x+a*w,y:y+b*h});
    if(!portrait){const fade=c.createLinearGradient(430,0,950,0);fade.addColorStop(0,'#06101a');fade.addColorStop(.45,'#06101ac9');fade.addColorStop(1,'#06101a00');c.fillStyle=fade;c.fillRect(0,110,950,800);}
    const top=c.createLinearGradient(0,y-10,0,y+150);top.addColorStop(0,'#06101a');top.addColorStop(1,'#06101a00');c.fillStyle=top;c.fillRect(0,y-10,W,160);
    const pumping=id!=='recharge';
    c.save();c.globalCompositeOperation='screen';c.globalAlpha=id==='recharge'?ease((p-.2)*4):1;
    fractures.forEach((points,i)=>flowPath(points,xy,t+i*1.7,id==='outlook'?2:5));
    if(pumping)flowPath([[.738,.735],[.739,.60],[.739,.43],[.739,.305]],xy,t,6,BLUE);
    c.restore();
    if(id==='recharge'||id==='outlook'){
      const count=id==='outlook'?9:54;
      for(let i=0;i<count;i++){
        const a=.28+noise(i*7)*.64,surface=.345+(a-.5)*.13,f=(noise(i*9)+t*.39)%1,q=xy([a,surface-.22+f*.22]);
        line(q.x,q.y,q.x-2,q.y+10,'#c0eaf28a',1.5);
        if(f>.90){const hit=xy([a,surface]);c.save();c.strokeStyle='#b8ede77a';c.lineWidth=1;c.beginPath();c.ellipse(hit.x,hit.y,(f-.9)*75,1+(f-.9)*12,0,0,Math.PI*2);c.stroke();c.restore();}
      }
      c.save();c.globalAlpha=id==='outlook'?.25:ease((p-.1)*5);
      [[[.43,.335],[.44,.395],[.43,.455],[.40,.57]],[[.56,.355],[.55,.42],[.57,.51],[.58,.72]],[[.65,.365],[.645,.435],[.655,.54],[.65,.79]]].forEach((path,i)=>flowPath(path,xy,t+i*1.3,id==='outlook'?1:3,'#75cfc4'));
      c.restore();
    }
    if(id==='recharge'){
      const soil=xy([.5,.4]),rock=xy([.58,.7]);
      callout('INFILTRATION',portrait?90:980,portrait?850:420,soil.x,soil.y);
      callout('WATER IN FRACTURES',portrait?450:1330,portrait?1230:750,rock.x,rock.y);
      text('RAIN → SOIL → FRACTURED ROCK',margin,portrait?1440:468,portrait?26:23,MINT,600);
      wrapped('Groundwater is held in pores and fractures, not an underground lake.',margin,portrait?1500:530,portrait?W-margin*2:435,portrait?34:31,MUTED,400,45);
    }else if(id==='well'){
      const before=D.example.beforeDepthM,after=D.example.latestDepthM;
      const sx=margin+30,sy=portrait?1380:449,sh=portrait?165:280,sw=portrait?W-margin*2-60:460;
      text(D.example.mandal.toUpperCase()+' / DEPTH BELOW GROUND',margin,portrait?1335:395,portrait?25:23,MINT,600);
      if(portrait){
        const max=35;line(sx,sy,sx+sw,sy,'#91a6ac',2);
        for(let n=0;n<=35;n+=5){const xx=sx+sw*n/max;line(xx,sy-5,xx,sy+8,MUTED);text(n+' m',xx,sy+37,23,MUTED,400,'center');}
        [[before,'MAY',MINT],[after,month(D.season.latestMonth).toUpperCase(),WARM]].forEach(([v,label,col],i)=>{const xx=sx+sw*v/max;dot(xx,sy,8,col);text(label+'  '+v+' m',sx+i*sw*.53,sy+103,32,col,600);});
        text('Typical seasonal rise: '+Math.abs(D.example.typicalM).toFixed(2)+' m',margin,sy+166,25,MUTED);
      }else{
        line(sx,sy,sx,sy+sh,'#759199',2);
        for(let n=0;n<=35;n+=5){const yy=sy+sh*n/35;line(sx-6,yy,sx+7,yy,MUTED);text(String(n),sx-17,yy+7,20,MUTED,400,'right');}
        [[before,'MAY',MINT],[after,month(D.season.latestMonth).toUpperCase(),WARM]].forEach(([v,label,col])=>{const yy=sy+sh*v/35;line(sx,yy,sx+310,yy,col,2);dot(sx+310,yy,6,col);text(label+'  '+v+' m',sx+20,yy-14,28,col,600);});
        arrow(sx+350,sy+sh*before/35,sx+350,sy+sh*mix(before,after,ease(p*2))/35,WARM,3);
        text('Typical seasonal rise: '+Math.abs(D.example.typicalM).toFixed(2)+' m',margin,799,25,MUTED);
      }
      text('SEASONAL DEEPENING  '+D.example.thisSeasonM+' m',portrait?margin:940,portrait?1280:794,portrait?26:25,WARM,600);
      const well=xy([.738,.63]);callout('BOREWELL / ILLUSTRATIVE',portrait?470:1330,portrait?1130:735,well.x,well.y,WHITE);
    }else{
      const yy=portrait?1405:443;
      const labels=['LESS INFILTRATION','LOWER RECHARGE','MORE PUMPING PRESSURE'];
      labels.forEach((label,i)=>{
        const yy2=yy+i*(portrait?63:100);dot(margin+7,yy2-8,5,i===2?WARM:MINT);text(label,margin+29,yy2,portrait?29:25,i===2?WARM:WHITE,500);
        if(i<2)line(margin+7,yy2+9,margin+7,yy2+(portrait?43:76),'#4b7478',1.5);
      });
      if(!portrait)text('IF LOW RAINFALL AND PUMPING PERSIST',margin,787,21,WARM,600);
      const q=xy([.74,.69]);callout('PUMPING CONTINUES',portrait?420:1350,portrait?1220:759,q.x,q.y,WARM);
    }
  }

  const mapScene=new THREE.Scene(),mapCamera=new THREE.PerspectiveCamera(36,1,.1,100);
  mapScene.add(new THREE.AmbientLight(0xffffff,.8));
  const mapLight=new THREE.DirectionalLight(0xffffff,.45);mapLight.position.set(-3,4,10);mapScene.add(mapLight);
  const [lo,la,hi,ha]=D.bbox,cx=(lo+hi)/2,cy=(la+ha)/2;
  const mapXYZ=([lon,lat],z=.055)=>new THREE.Vector3((lon-cx)*Math.cos(cy*Math.PI/180),(lat-cy),z);
  const sequential = f => '#'+new THREE.Color(D.design.seq.dark[0]).lerp(new THREE.Color(D.design.seq.dark[1]),clamp(f)).getHexString();
  const mapColors=[0,.25,.5,.75,1].map(sequential).concat('#536372');
  const colorFor=v=>v===null?mapColors[5]:v<=0?mapColors[0]:v<1?mapColors[1]:v<2?mapColors[2]:v<4?mapColors[3]:mapColors[4];
  const mapMeshes=D.shapes.map(m=>{
    const shapes=m.rings.map(r=>new THREE.Shape(r.map(v=>{const p=mapXYZ(v);return new THREE.Vector2(p.x,p.y);})));
    const material=new THREE.MeshStandardMaterial({color:colorFor(m.shortfall),roughness:.72,metalness:.12});
    const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shapes,{depth:.05,bevelEnabled:false}),material);mapScene.add(mesh);
    m.rings.forEach(r=>{
      const edge=new THREE.Line(new THREE.BufferGeometry().setFromPoints(r.map(v=>mapXYZ(v,.058))),new THREE.LineBasicMaterial({color:0x163138,transparent:true,opacity:.7}));mapScene.add(edge);
    });
    return{mesh,data:m};
  });
  D.districtShapes.forEach(d=>d.rings.forEach(r=>{
    const line3=new THREE.Line(new THREE.BufferGeometry().setFromPoints(r.map(v=>mapXYZ(v,.066))),new THREE.LineBasicMaterial({color:0xe1eee3,transparent:true,opacity:.55}));mapScene.add(line3);
  }));
  function mapPoint(coords,v){const q=mapXYZ(coords,.085).project(mapCamera);return{x:v.x+(q.x+1)*v.w/2,y:v.y+(1-q.y)*v.h/2};}
  function drawAPMap(p,t,v,districts=[],zoom=1,mode='shortfall'){
    renderer.setSize(1200,Math.round(1200*v.h/v.w));
    mapCamera.aspect=v.w/v.h;mapCamera.position.set(.2-Math.sin(p*.8)*.2,-1.7,(12.4-p*.22)/zoom);mapCamera.lookAt(0,0,0);mapCamera.updateProjectionMatrix();
    mapMeshes.forEach(({mesh,data})=>{
      const focus=districts.includes(data.district);
      const fill=mode==='drought'?D.design.drought[data.drought].color:mode==='summer'?
        (data.summer===null?mapColors[5]:data.summer.tier==='beyond'?BLUE:'#27445e'):
        districts.length?(focus?BLUE:'#234750'):colorFor(data.shortfall);
      mesh.material.color.set(fill).convertSRGBToLinear();
      mesh.material.emissive.set(data.example&&!districts.length&&mode==='shortfall'?'#164d4b':'#000000');
    });
    renderer.render(mapScene,mapCamera);c.drawImage(renderer.domElement,v.x,v.y,v.w,v.h);
    const nx=v.x+v.w-46,ny=v.y+65;arrow(nx,ny+43,nx,ny+4,MINT,2);text('N',nx,ny-10,22,MINT,600,'center');
    text('BAY OF BENGAL',v.x+v.w*.71,v.y+v.h*.79,portrait?20:21,'#648c9a',500,'center');
  }
  function mapShot(p,t){
    const v=portrait?{x:0,y:585,w:1080,h:840}:{x:540,y:58,w:1320,h:690};
    drawAPMap(p,t,v,[],portrait?1.02:1.09);
    const xx=margin,yy=portrait?466:441;
    text(D.recharge.fallingPct+'%',xx,yy,portrait?113:120,WARM,600);
    text('OF MONITORED MANDALS',xx,yy+49,portrait?25:23,MUTED,500);
    wrapped('had deeper water levels than in May.',xx,yy+105,portrait?900:440,portrait?32:32,WHITE,400,44);
    const selected=D.shapes.find(m=>m.example),ring=selected.rings[0];
    const coords=ring.reduce((a,v)=>[a[0]+v[0]/ring.length,a[1]+v[1]/ring.length],[0,0]);
    const point=mapPoint(coords,v);
    c.strokeStyle=WHITE;c.lineWidth=2;c.beginPath();c.arc(point.x,point.y,11+4*Math.sin(t*2),0,Math.PI*2);c.stroke();
    const lx=portrait?point.x+75:point.x-140,ly=point.y-80;
    callout(D.example.mandal.toUpperCase(),lx,ly,point.x,point.y,WHITE);
    text(D.recharge.falling+' of '+D.recharge.mandals+' · May–'+month(D.season.latestMonth)+' '+D.season.year,margin,portrait?1390:647,portrait?25:24,MUTED);
    text(D.recharge.shortOfNormalPct+'% short of own 10-year normal',margin,portrait?1555:704,portrait?26:24,MINT,600);
    const legendX=portrait?margin:820,legendY=portrait?1456:749;
    text('WATER-LEVEL SHORTFALL AGAINST OWN NORMAL / m',legendX,legendY,portrait?22:20,MUTED,500);
    const labels=['≤ 0','0–1','1–2','2–4','≥ 4','No match'];
    mapColors.forEach((col,i)=>{const x=legendX+i*(portrait?155:154);c.fillStyle=col;c.fillRect(x,legendY+23,portrait?136:134,8);text(labels[i],x,legendY+61,portrait?23:21,MUTED);});
  }
  function oceanShot(p,t){
    const o=D.ocean,x=margin,y=portrait?445:420;
    globe(193+5*p,8,t,portrait?{x:915,y:470,size:650}:{x:1710,y:385,size:690});
    text('OBSERVED / ONI',x,y,25,MINT,600);
    text(signed(D.enso.oniC)+'°C',x,y+105,portrait?112:108,WHITE,600);
    text('Jul–Sep '+D.season.year+' · '+D.enso.strength,x,y+155,27,MUTED);
    const fx=portrait?margin:695,fy=portrait?725:y;
    text('NOAA FORECAST / RONI',fx,fy,25,BLUE,600);
    text(signed(o.peak.medianC)+'°C',fx,fy+105,portrait?112:108,WHITE,600);
    text(o.peak.label+' · median peak',fx,fy+155,27,MUTED);
    const gx=portrait?margin:100,gy=portrait?1080:660,gw=portrait?952:1030,gh=portrait?270:130;
    const rows=o.outlook,X=i=>gx+i*gw/(rows.length-1),Y=v=>gy+gh*(1-v/3.5);
    [0,1,2,3].forEach(value=>{line(gx,Y(value),gx+gw,Y(value),'#58779255',1);text(value+'°',gx-12,Y(value)+6,18,MUTED,400,'right');});
    c.beginPath();rows.forEach((r,i)=>i?c.lineTo(X(i),Y(r.p85)):c.moveTo(X(i),Y(r.p85)));
    [...rows].reverse().forEach((r,j)=>c.lineTo(X(rows.length-1-j),Y(r.p15)));c.closePath();c.fillStyle='#3fc1dc29';c.fill();
    c.beginPath();rows.forEach((r,i)=>i?c.lineTo(X(i),Y(r.p50)):c.moveTo(X(i),Y(r.p50)));c.strokeStyle=BLUE;c.lineWidth=3;c.stroke();
    rows.forEach((r,i)=>{dot(X(i),Y(r.p50),i===1?7:3,i===1?WHITE:BLUE);text(r.season,X(i),gy+gh+30,20,MUTED,500,'center');});
    const marker=p*(rows.length-1),i=Math.min(rows.length-2,Math.floor(marker)),f=marker-i;
    dot(mix(X(i),X(i+1),f),mix(Y(rows[i].p50),Y(rows[i+1].p50),f),5,WHITE);
    text('RONI MEDIAN / 15TH–85TH PERCENTILE BAND',gx,gy-25,20,BLUE,600);
    const tx=portrait?margin:1225,ty=portrait?1475:662;
    text('>83%',tx,ty,portrait?68:66,WHITE,600);
    wrapped('Strong to very strong through Jan–Mar 2027',tx,ty+44,portrait?900:520,27,MUTED,400,37);
    text('Issued '+o.issued,tx,portrait?1583:ty+135,24,MINT,500);
  }
  function northeastShot(p,t){
    const n=D.northeast,x=margin,y=portrait?500:480;
    text(signed(n.elNinoAnomalyPct)+'%',x,y,portrait?144:130,WARM,600);
    text('HISTORICAL EL NIÑO MEAN',x,y+57,25,MUTED,600);
    text(n.elNinoBelowNormal+' / '+n.elNinoYears+' seasons below normal',x,y+112,portrait?36:31,WHITE,500);
    const tx=portrait?margin:860,ty=portrait?815:400,tw=portrait?952:920;
    ['OCTOBER','NOVEMBER','DECEMBER'].forEach((m,i)=>{
      const xx=tx+i*tw/3;line(xx,ty,xx+tw/3-18,ty,i? '#466884':BLUE,4);
      text(m,xx,ty+44,portrait?24:23,i?MUTED:WHITE,600);
    });
    text('2026 / SEASON JUST BEGUN',tx,ty+109,26,MINT,600);
    wrapped('Too early to infer this season’s outcome.',tx,ty+155,tw,portrait?32:30,WHITE,400,42);
    const rows=n.byDistrict.slice(0,3),bx=portrait?margin:860,by=portrait?1110:662;
    text('NORTH COAST / HISTORICAL MEAN',bx,by-44,22,MUTED,600);
    rows.forEach((r,i)=>{
      const yy=by+i*(portrait?139:64),bar=Math.abs(r.elNinoAnomalyPct)/20*tw*ease(p*2);
      text(r.district,bx,yy,portrait?27:24,WHITE,500);text(signed(r.elNinoAnomalyPct)+'%',bx+tw,yy,28,WARM,600,'right');
      line(bx,yy+20,bx+tw,yy+20,'#29455f',4);line(bx,yy+20,bx+bar,yy+20,WARM,4);
    });
    if(!portrait)wrapped('History is context, not a rainfall forecast.',margin,695,585,29,MINT,500,42);
  }
  function stateWellShot(p,t){
    const s=D.stateWells.state,x=margin,y=portrait?470:441;
    text(s.currentM+' m',x,y,portrait?135:120,WHITE,600);
    text('BELOW GROUND / '+s.date,x,y+54,25,MUTED,600);
    text(s.stations.toLocaleString('en-IN')+' STATIONS',x,y+114,31,MINT,600);
    text('+'+s.vsYearAgoM+' m deeper year on year',x,y+166,portrait?33:29,WARM,600);
    const rows=[...D.stateWells.districts].sort((a,b)=>a.currentM-b.currentM);
    const bx=portrait?margin:790,by=portrait?820:385,bw=portrait?952:1030,bh=portrait?430:310,max=30,unit=bw/rows.length;
    [0,10,20,30].forEach(v=>{const yy=by+bh*v/max;line(bx,yy,bx+bw,yy,'#58779255',1);text(v+' m',bx-10,yy+6,20,MUTED,400,'right');});
    rows.forEach((r,i)=>{
      const xx=bx+i*unit,h=bh*r.currentM/max*ease(p*2);
      const g=c.createLinearGradient(0,by,0,by+bh);g.addColorStop(0,D.design.seq.dark[0]);g.addColorStop(1,BLUE);
      c.fillStyle=g;c.fillRect(xx+3,by,unit-6,h);line(xx+3,by+h,xx+unit-3,by+h,BLUE,2);
    });
    const marker=by+bh*s.currentM/max;c.setLineDash([5,7]);line(bx,marker,bx+bw,marker,WHITE,2);c.setLineDash([]);
    text('STATE AGGREGATE '+s.currentM+' m',bx+bw,marker-15,21,WHITE,600,'right');
    text('DISTRICT DEPTHS / SHALLOWER → DEEPER',bx,by+bh+40,22,MUTED,500);
    const ly=portrait?1385:766;
    text('Latest-reading aggregate, not a monthly mean.',margin,ly,portrait?31:28,MUTED);
    text('Separate from the mandal seasonal-change series.',margin,ly+48,portrait?31:28,MUTED);
    if(portrait)text('Measured network / not satellite-model depth',margin,ly+105,27,MINT,500);
  }
  function summerShot(p,t){
    const s=D.summer,b=s.backtest,v=portrait?{x:50,y:745,w:980,h:590}:{x:800,y:185,w:1050,h:515};
    drawAPMap(p,t,v,[],1.08,'summer');
    const y=portrait?462:450;
    text(String(s.summary.beyond),margin,y,portrait?123:120,WHITE,600);
    text('MANDALS / BEYOND THEIR DEEPEST MAY',margin,y+49,portrait?24:23,MUTED,600);
    text(s.summary.beyondDeep+' already deeper than '+s.deepM+' m',margin,y+114,portrait?36:32,WARM,600);
    text(s.people.beyondDeep.toLocaleString('en-IN'),margin,y+192,portrait?54:51,WHITE,600);
    text('people / WorldPop '+s.people.year+' estimate',margin,y+233,portrait?26:24,MUTED);
    const ty=portrait?1390:761;
    text('TRACK RECORD  '+b.pastRecordPct.beyond+'%',margin,ty,portrait?38:32,MINT,600);
    text('of “beyond” calls broke the historical record',margin,ty+46,portrait?30:27,WHITE);
    text(b.anchorMonth+' starts · '+b.years[0]+'–'+b.years.at(-1)+' · median error '+b.typicalErrorM+' m',portrait?margin:1000,portrait?ty+96:ty,portrait?26:22,MUTED);
    text('This projection starts in '+month(s.anchor)+' '+s.anchor.slice(0,4),portrait?margin:1000,portrait?ty+141:ty+42,portrait?26:22,MUTED);
    const legendY=portrait?v.y+v.h-10:718;
    text('BEYOND',v.x+65,legendY,20,BLUE,600);text('OTHER COMPARED',v.x+195,legendY,20,MUTED,500);
    text('NO MATCH',v.x+415,legendY,20,mapColors[5],500);
  }
  function droughtShot(p,t){
    const d=D.drought,s=d.state,v=portrait?{x:20,y:775,w:1040,h:590}:{x:780,y:205,w:1080,h:540};
    drawAPMap(p,t,v,[],1.05,'drought');
    const y=portrait?475:456;
    text(String(s.trigger1),margin,y,portrait?143:125,WHITE,600);
    text('MANDALS / RAINFALL TRIGGER',margin,y+57,25,MUTED,600);
    const colors=D.design.drought;
    [['severe','SEVERE'],['moderate','MODERATE']].forEach(([key,label],i)=>{
      const x=margin+i*(portrait?445:327);line(x,y+100,x+220,y+100,colors[key].color,5);
      text(String(s.counts[key]),x,y+191,84,WHITE,600);text(label,x,y+232,25,MUTED,600);
    });
    const lx=margin,ly=portrait?1435:768,width=portrait?952:1720,entries=Object.entries(colors),unit=width/entries.length;
    entries.forEach(([key,meta],i)=>{
      const xx=portrait?lx+(i%3)*327:lx+i*unit,yy=portrait?ly+Math.floor(i/3)*64:ly;
      c.fillStyle=meta.color;c.fillRect(xx,yy-21,7,32);
      const label=key==='moderate|severe'?'Mod / severe':key==='normal|moderate'?'Normal / mod':meta.label;
      text(s.counts[key]+' · '+label,xx+17,yy,portrait?22:21,WHITE,500);
    });
    if(!portrait)text('Full screening: '+s.assessed+' assessed / '+s.mandals+' boundaries · uncertain categories retained',margin,820,23,MUTED);
  }
  function preparednessShot(p,t,urban=false){
    const img=urban?urbanImage:preparednessImage;
    const w=portrait?1530+p*65:W*(1+p*.035),h=w*img.height/img.width;
    const x=portrait?-220-p*33:-p*W*.018,y=portrait?396-p*20:-125-p*15;
    c.drawImage(img,x,y,w,h);
    if(!portrait){
      const top=c.createLinearGradient(0,0,0,400);top.addColorStop(0,'#06101afa');top.addColorStop(.63,'#06101ab8');top.addColorStop(1,'#06101a00');c.fillStyle=top;c.fillRect(0,0,W,400);
    }
    const bottom=c.createLinearGradient(0,portrait?1170:620,0,portrait?1390:810);bottom.addColorStop(0,'#06101a00');bottom.addColorStop(1,'#06101a');c.fillStyle=bottom;c.fillRect(0,portrait?1170:620,W,H);
    const steps=urban?[
      {title:'REPAIR MAINS',detail:'Find leaks. Reduce supply losses.',point:[.17,.82]},
      {title:'REUSE SAFELY',detail:'Treated water for non-drinking needs.',point:[.81,.49]},
      {title:'PROTECT SOURCES',detail:'Lakes, catchments and rainwater systems.',point:[.47,.32]},
      {title:'PLAN SUPPLIES',detail:'Essential services. Local teams and triggers.',point:[.52,.66]},
    ]:[
      {title:'FIX LEAKS',detail:'Protect drinking-water supplies.',point:[.16,.68]},
      {title:'CATCH RAIN SAFELY',detail:'Maintain collection. Treat before drinking.',point:[.265,.74]},
      {title:'IRRIGATE CAREFULLY',detail:'Suitable drip, mulch and crop advice.',point:[.73,.7]},
      {title:'PLAN TOGETHER',detail:'Track wells and storage. Agree a local plan.',point:[.408,.433]},
    ];
    const active=urban?(p<.43?0:p<.66?1:p<.81?2:3):(p<.27?0:p<.40?1:p<.69?2:3);
    const point=steps[active].point,px=x+point[0]*w,py=y+point[1]*h;
    if(urban&&active===1){
      flowPath([[.81,.49],[.84,.54],[.865,.595],[.88,.70]],([a,b])=>({x:x+a*w,y:y+b*h}),t,4,BLUE);
    }
    c.strokeStyle=MINT;c.lineWidth=2.2;c.beginPath();c.arc(px,py,23+(t%1)*12,0,Math.PI*2);c.stroke();
    dot(px,py,15,'#072525');text(String(active+1),px,py+7,21,WHITE,600,'center');
    steps.forEach((step,i)=>{
      const sx=portrait?margin+(i%2)*495:margin+i*435,sy=portrait?1350+Math.floor(i/2)*119:732,sw=portrait?456:390;
      c.fillStyle=i===active?MINT:'#507278';c.fillRect(sx,sy-30,sw,3);
      text('0'+(i+1)+' / '+step.title,sx,sy+7,portrait?24:23,i===active?MINT:WHITE,600);
      wrapped(step.detail,sx,sy+47,sw,portrait?24:22,MUTED,400,31);
    });
  }
  window.renderFilm = function(t){
    t=clamp(t,0,D.duration-.001);overflow=[];geography=[];
    const index=D.scenes.findIndex(s=>t>=s.start&&t<s.start+s.duration);const s=D.scenes[Math.max(0,index)];const p=(t-s.start)/s.duration;
    background();
    if(['connection','india','close'].includes(s.id))globeShot(s.id,p,t);
    else if(['normal','nino'].includes(s.id))pacificShot(s.id,p,t);
    else if(s.id==='history')historyShot(p,t);
    else if(s.id==='rain')rainShot(p,t);
    else if(s.id==='ap-history')apHistoryShot(p,t);
    else if(s.id==='ocean')oceanShot(p,t);
    else if(s.id==='northeast')northeastShot(p,t);
    else if(s.id==='state-wells')stateWellShot(p,t);
    else if(s.id==='summer')summerShot(p,t);
    else if(s.id==='drought')droughtShot(p,t);
    else if(s.id==='districts')districtShot(p,t);
    else if(['recharge','well','outlook'].includes(s.id))aquiferShot(s.id,p,t);
    else if(s.id==='mandals')mapShot(p,t);
    else if(s.id==='prepare')preparednessShot(p,t);
    else if(s.id==='cities')preparednessShot(p,t,true);
    header(s,index,p);footer(s,t,index);
    // Very short dip between chapters makes a spatial change legible without a long dissolve.
    const fade=1-ease(clamp((t-s.start)/.32));if(index>0&&fade>0){c.fillStyle=`rgba(3,9,15,${fade*.8})`;c.fillRect(0,0,W,H);}
    return {id:s.id,time:t,overflow:[...new Set(overflow)],geography};
  };
  window.filmManifest=D;window.filmReady=true;
  const audio=new Audio('narration.m4a'),button=document.getElementById('play'),scrub=document.getElementById('scrub');scrub.max=D.duration;
  let playing=false;
  button.onclick=async()=>{if(playing){audio.pause();playing=false;button.textContent='Play';}else{await audio.play();playing=true;button.textContent='Pause';}};
  scrub.oninput=()=>{audio.currentTime=Number(scrub.value);window.renderFilm(Number(scrub.value));};
  audio.onended=()=>{playing=false;button.textContent='Replay';};
  function loop(){if(playing){const t=audio.currentTime;window.renderFilm(t);scrub.value=t;document.getElementById('time').textContent=Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}requestAnimationFrame(loop);}
  if(query.has('capture'))document.body.classList.add('capture');else loop();
  const initial=clamp(Number(query.get('t')||2),0,D.duration-.001);
  audio.currentTime=initial;scrub.value=initial;
  document.getElementById('time').textContent=Math.floor(initial/60)+':'+String(Math.floor(initial%60)).padStart(2,'0');
  window.renderFilm(initial);
})();
