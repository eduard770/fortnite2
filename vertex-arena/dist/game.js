'use strict';
(() => {
  const {T,tile,half,rise,slope,incline,vec,Shape}=VX, $=id=>document.getElementById(id);
  const icons={
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',sound:'<path d="M4 9h4l5-4v14l-5-4H4zM16 9q3 3 0 6m2-9q6 6 0 12"/>',
    muted:'<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>',full:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
    layers:'<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',pin:'<path d="M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="9" r="2"/>',
    shield:'<path fill="currentColor" d="m12 3 8 3v5q0 6-8 10-8-4-8-10V6z"/>',plus:'<path fill="currentColor" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 15h10"/>',
    play:'<path fill="currentColor" d="m6 3 14 9-14 9z"/>',person:'<circle cx="12" cy="8" r="3" fill="currentColor"/><path d="M5 20q0-8 7-8t7 8z" fill="currentColor"/>',
    wood:'<path d="m3 14 11-9 6 2-10 10zM3 14v3l7 3 10-10V7M10 17v3m-4-5 10-9"/>',brick:'<path d="m2 11 12-6 8 4-12 7zM2 11v5l8 4 12-7V9m-12 7v4"/>',
    metal:'<path d="m3 13 12-8 6 2-12 8zM5 14v3l4 1 10-7V8m-16 9 6 3 12-8"/>'
  };
  function icon(name){return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">'+icons[name]+'</svg>';}
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  $('fullBtn').innerHTML=icon('full');
  const canvas=$('world'),area=$('arena'),scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.055,490);
  let renderer;
  try {renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}
  catch { $('error').hidden=false;$('error').textContent='A arena precisa de WebGL. Ativa a aceleração gráfica do navegador e volta a abrir o jogo.';return; }
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  const world=createWorld(scene),character=VX.avatar();scene.add(character.root);
  const actions=['axe','wall','floor','ramp','roof'],names=['Picareta','Parede','Chão','Rampa','Cone'],keyNames=['G','Z','X','C','V'];
  const materials=['Madeira','Tijolo','Metal'],matIcons=['wood','brick','metal'];
  const keyMap={KeyG:0,Digit1:0,KeyZ:1,KeyX:2,KeyC:3,KeyV:4};
  const keys=new Set(),pieces=new Map(),spatial=new Map(),visibleMeshes=[],geoCache=new Map(),ray=new T.Raycaster(),zero=new T.Vector2();
  const state={slot:0,material:0,rot:0,active:false,ever:false,menu:false,sound:true,release:true,sens:1,editing:null};
  const player={p:vec(),v:vec(0,0,0),yaw:0,pitch:0,grounded:true,phase:0,land:0};
  let renderScale=Math.min(devicePixelRatio,1.45),qualityTimer=0;
  let holding=false,painting=false,dragged=false,paintRemove=true,editBits=0,editMesh=null,ghost=null,preview=null,focus=null,savedTimer=0,toastTimer=0,audio=null;
  let swing=0,buildDelay=0,jumpBuffer=0,coyote=.1,dragX=0,dragY=0,lastWidth=0,lastHeight=0,menuWasActive=false;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),mod=(n,m)=>((n%m)+m)%m;
  function loadPrefs(){try{const p=JSON.parse(localStorage.getItem('vertex-prefs-v1'));if(p){state.sens=clamp(Number(p.sens)||1,.3,2.8);state.sound=p.sound!==false;state.release=!!p.release;}}catch{}}
  function savePrefs(){try{localStorage.setItem('vertex-prefs-v1',JSON.stringify({sens:state.sens,sound:state.sound,release:state.release}));}catch{}}
  function toast(t){$('notice').textContent=t;$('notice').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('notice').classList.remove('show'),2200);}
  function tone(f,d,type='sine',volume=.045,end=f*.5){
    if(!state.sound||!audio||audio.state!=='running')return;
    const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;
    o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(end,t+d);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+d);
  }
  function unlockAudio(){try{audio??=new AudioContext();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}}
  const idOf=p=>[p.type,p.i,p.k,p.j,p.type==='wall'?p.rot%2:0].join('/');
  function position(p){
    const pos=vec(p.i*tile,p.k*rise,p.j*tile);
    if(p.type==='wall'){if(p.rot%2)pos.x-=half;else pos.z-=half;}
    return pos;
  }
  function geometry(p) {
    const id=[p.type,p.material,p.mask].join('/');
    if(!geoCache.has(id))geoCache.set(id,VX.structure(p.type,p.material,p.mask).geometry);
    return geoCache.get(id);
  }
  function transform(mesh,p){mesh.position.copy(position(p));mesh.rotation.y=-p.rot*Math.PI/2;mesh.updateMatrixWorld(true);}
  const faces=new Map(),invisibleFace=new T.MeshBasicMaterial({visible:false,side:T.DoubleSide});
  function faceGeometry(type,mask){
    const key=type+'/'+mask;if(!faces.has(key))faces.set(key,VX.surfaceGeometry(type,mask));return faces.get(key);
  }
  function blueprintTexture(){
    const cv=document.createElement('canvas');cv.width=cv.height=256;
    const g=cv.getContext('2d');g.fillStyle='rgba(165,198,244,.33)';g.fillRect(0,0,256,256);
    for(let i=-1;i<12;i++){
      const y=i*27;g.fillStyle=i%3?'rgba(239,243,255,.24)':'rgba(216,221,248,.47)';
      g.beginPath();g.moveTo(0,y);g.lineTo(256,y-10+(i%3)*5);g.lineTo(256,y+4);g.lineTo(0,y+7);g.fill();
    }
    const tx=new T.CanvasTexture(cv);tx.colorSpace=T.SRGBColorSpace;tx.anisotropy=4;return tx;
  }
  const pane=new T.MeshBasicMaterial({map:blueprintTexture(),transparent:true,opacity:.56,side:T.DoubleSide,depthWrite:false});
  pane.forceSinglePass=true;
  const forming=pane.clone();forming.color.set('#d1efff');forming.opacity=.96;
  const freshPieces=new Map();
  function applyShape(p){
    p.mesh.geometry=geometry(p);p.face.geometry=faceGeometry(p.type,p.mask);
    renderer.shadowMap.needsUpdate=true;
  }
  function addPiece(p,placed=false) {
    const id=idOf(p);if(pieces.has(id))return;
    const mesh=new T.Mesh(geometry(p),p.material===0?VX.woodMaterial():buildSolid);mesh.receiveShadow=mesh.castShadow=true;p.mesh=mesh;mesh.userData.piece=p;
    p.face=new T.Mesh(faceGeometry(p.type,p.mask),p.material===0?(placed?forming:pane):invisibleFace);p.face.userData.piece=p;
    mesh.add(p.face);transform(mesh,p);scene.add(mesh);visibleMeshes.push(p.face);pieces.set(id,p);renderer.shadowMap.needsUpdate=true;
    if(placed&&p.material===0)freshPieces.set(p,performance.now()+155);
    const key=p.i+'/'+p.j;if(!spatial.has(key))spatial.set(key,new Set());spatial.get(key).add(p);
  }
  function removePiece(p){
    scene.remove(p.mesh);pieces.delete(idOf(p));freshPieces.delete(p);visibleMeshes.splice(visibleMeshes.indexOf(p.face),1);
    const tag=p.i+'/'+p.j,members=spatial.get(tag);members.delete(p);if(!members.size)spatial.delete(tag);renderer.shadowMap.needsUpdate=true;
  }
  function localPieces(x,z,radius=1){
    const i=Math.round(x/tile),j=Math.round(z/tile),result=[];
    for(let di=-radius;di<=radius;di++)for(let dj=-radius;dj<=radius;dj++){const batch=spatial.get((i+di)+'/'+(j+dj));if(batch)for(const p of batch){if(Math.abs(p.k*rise-player.p.y)<(radius+2)*rise)result.push(p);}}
    return result;
  }
  function snapshot(){try{localStorage.setItem('vertex-arena-v1',JSON.stringify([...pieces.values()].map(({type,i,j,k,rot,material,mask})=>({type,i,j,k,rot,material,mask}))));}catch{toast('A sessão excedeu o espaço de gravação do navegador.');}}
  function saveSoon(){clearTimeout(savedTimer);savedTimer=setTimeout(snapshot,450);}
  window.addEventListener('pagehide',snapshot);
  function initialPieces(){
    const set=[['ramp',0,0,0,0],['ramp',0,-1,0,2],['wall',-1,0,0,0],['floor',-1,-1,1,0],['wall',-1,-1,0,1]];
    set.forEach(([type,i,j,k,rot])=>addPiece({type,i,j,k,rot,material:0,mask:0}));
  }
  function restore() {
    try{const saved=JSON.parse(localStorage.getItem('vertex-arena-v1'));if(Array.isArray(saved)){
      for(const p of saved)if(actions.slice(1).includes(p.type)&&['i','j','k','rot','mask','material'].every(key=>Number.isSafeInteger(p[key]))&&p.material>=0&&p.material<3&&p.rot>=0&&p.rot<=3&&p.mask>=0&&p.mask<(p.type==='wall'?511:15))addPiece(p);return;
    }}catch{}initialPieces();
  }
  function spawn(){cameraLift=0;player.p.set(-.49*tile,.025,1.18*tile);player.v.set(0,0,0);player.yaw=.385;player.pitch=-.065;player.grounded=true;jumpBuffer=0;keys.clear();}
  function resize(){const w=area.clientWidth,h=area.clientHeight;if(w===lastWidth&&h===lastHeight)return;lastWidth=w;lastHeight=h;renderer.setPixelRatio(renderScale);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const aimDir=vec(),right=vec(),forward=vec(),pivot=vec(),desired=vec();
  const boom=vec(),eye=vec(),cameraClearance={value:3.04};
  let cameraLift=0;
  // A sight window keeps foreground structures from pushing the camera into the avatar.
  function clearForeground(material){
    material.onBeforeCompile=shader=>{
      shader.uniforms.uShoulderDepth=cameraClearance;
      shader.vertexShader='varying vec3 vBuildView;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvBuildView=mvPosition.xyz;');
      shader.fragmentShader='varying vec3 vBuildView; uniform float uShoulderDepth;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
        #include <clipping_planes_fragment>
        float depth=-vBuildView.z;
        vec2 shoulder=vec2(-0.19,-0.14)*depth;
        vec2 radius=vec2(0.48,0.65)*depth+vec2(0.22);
        if(depth<uShoulderDepth && length((vBuildView.xy-shoulder)/radius)<1.0) discard;
      `);
    };
  }
  const buildSolid=VX.surface.clone();
  [buildSolid,VX.woodMaterial(),pane,forming].forEach(clearForeground);
  function updateCamera(){
    const {yaw,pitch,p}=player;
    right.set(Math.cos(yaw),0,Math.sin(yaw));forward.set(Math.sin(yaw),0,-Math.cos(yaw));aimDir.copy(forward).multiplyScalar(Math.cos(pitch));aimDir.y=Math.sin(pitch);
    eye.copy(p);eye.y+=1.69+player.land;
    pivot.copy(eye).addScaledVector(right,.43);pivot.y-=cameraLift;
    // Pitch controls the reticle independently of the boom. Looking up at a cone
    // must not collapse the arm or bring the lens underneath the character.
    const orbitPitch=pitch>0?Math.min(pitch,.42):Math.max(pitch,-1.00);
    boom.copy(forward).multiplyScalar(-Math.cos(orbitPitch));boom.y=-Math.sin(orbitPitch);
    desired.copy(pivot).addScaledVector(boom,3.04);
    if(hasBase(desired.x,desired.z))desired.y=Math.max(.20,desired.y);
    camera.position.copy(desired);
    camera.rotation.set(pitch,-yaw,0,'YXZ');camera.updateMatrixWorld();
    // Start all build, edit and reset rays on the actual screen-centre ray.
    // Clip foreground at the same depth so the visible tile is the targeted tile.
    const depth=Math.max(.06,eye.sub(desired).dot(aimDir)-.12);
    cameraClearance.value=depth;
    pivot.copy(desired).addScaledVector(aimDir,depth);
    world.sky.position.copy(desired);
  }
  function setAimRay(){ray.set(pivot,aimDir);ray.far=tile*2.45;}
  function hitPiece(openings=false,preferReset=false){
    setAimRay();const candidates=pieces.size<40?visibleMeshes:localPieces(player.p.x,player.p.z,3).map(p=>p.face);
    const reach=tile*2.18;
    const first=list=>ray.intersectObjects(list,false).find(hit=>hit.point.distanceToSquared(player.p)<=reach*reach);
    const solid=first(candidates);
    if(!openings||(!preferReset&&solid))return solid||null;
    const edited=[];
    for(const face of candidates){
      const p=face.userData.piece;if(!p.mask)continue;
      if(!p.editProxy){p.editProxy=new T.Mesh(faceGeometry(p.type,0),invisibleFace);p.editProxy.userData.piece=p;transform(p.editProxy,p);}
      edited.push(p.editProxy);
    }
    const opening=first(edited);
    return opening&&(!solid||opening.distance<=solid.distance+.12)?opening:solid||null;
  }
  function localXZ(p,x,z) {
    const pos=position(p),dx=x-pos.x,dz=z-pos.z;
    switch(p.rot){case 1:return [dz,-dx];case 2:return [-dx,-dz];case 3:return [-dz,dx];default:return [dx,dz];}
  }
  const cellAt=(p,x,y,z)=>VX.cellIndex(p.type,x,y,z);
  function heightAt(p,x,z){
    const [lx,lz]=localXZ(p,x,z);
    return p.k*rise+VX.buildHeight(p.type,p.mask,lx,lz);
  }
  function wallsBlock(x,z,y,p) {
    if(p.type!=='wall')return false;
    const [lx,lz]=localXZ(p,x,z),rel=y-p.k*rise;
    if(Math.abs(lz)>.29||Math.abs(lx)>half+.22||rel>=rise-.008||rel+1.86<=.008)return false;
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      if(p.mask&(1<<(row*3+col)))continue;
      const bottom=row*rise/3,left=-half+col*tile/3;
      if(rel<bottom+rise/3-.008&&rel+1.86>bottom+.008&&lx+.22>left&&lx-.22<left+tile/3)return true;
    }return false;
  }
  const footprint=[[0,0],[.20,0],[-.20,0],[0,.20],[0,-.20],[.14,.14],[-.14,.14],[.14,-.14],[-.14,-.14]];
  function touchesBody(piece,x,z,feet){
    if(piece.type==='wall')return wallsBlock(x,z,feet,piece);
    return footprint.some(([dx,dz])=>{
      const h=heightAt(piece,x+dx,z+dz);
      // Allow the soles to follow a continuous slope but keep the head below its underside.
      return h>feet+.20&&h<feet+1.86+.12;
    });
  }
  function wallLedge(p,x,z,feet){
    if(p.type!=='wall')return -Infinity;
    const [lx,lz]=localXZ(p,x,z);if(Math.abs(lz)>.23||Math.abs(lx)>=half+.16)return -Infinity;
    let top=-Infinity;
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      const left=-half+col*tile/3,h=p.k*rise+(row+1)*rise/3;
      if(!(p.mask&(1<<(row*3+col)))&&lx+.16>left&&lx-.16<left+tile/3&&h<=feet+.015)top=Math.max(top,h);
    }
    return top;
  }
  function hasBase(x,z){return Math.abs(x)<world.arenaHalf+.12&&Math.abs(z)<world.arenaHalf+.12;}
  function walk(dt) {
    let dx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),
      dz=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
    const length=Math.hypot(dx,dz);if(length>1){dx/=length;dz/=length;}
    const p=player.p,v=player.v,near=localPieces(p.x,p.z),step=.19;
    const moveX=right.x*dx+forward.x*dz,moveZ=right.z*dx+forward.z*dz;
    let grade=0;
    if(player.grounded&&length){
      const under=near.find(s=>(s.type==='ramp'||s.type==='roof')&&Math.abs(heightAt(s,p.x,p.z)-p.y)<.075);
      if(under){
        if(under.type==='ramp')grade=slope*([0,1,0,-1][under.rot]*moveX+[-1,0,1,0][under.rot]*moveZ);
        else{
          const sample=heightAt(under,p.x+moveX*.03,p.z+moveZ*.03);
          if(Number.isFinite(sample))grade=(sample-heightAt(under,p.x,p.z))/.03;
        }
      }
    }
    // Ground speed is measured along the incline, so the same stride covers less horizontal ground uphill.
    const speed=tile*1.23/Math.hypot(1,grade),response=player.grounded?(length?34:43):13;
    const blend=1-Math.exp(-response*dt);
    v.x+=(speed*moveX-v.x)*blend;v.z+=(speed*moveZ-v.z)*blend;
    function blocked(x,z){
      let foot=p.y;
      if(player.grounded)for(const piece of near){const h=heightAt(piece,x,z);if(h<=p.y+step)foot=Math.max(foot,h);}
      return near.some(piece=>touchesBody(piece,x,z,foot)&&!touchesBody(piece,p.x,p.z,p.y));
    }
    if(!blocked(p.x+v.x*dt,p.z))p.x+=v.x*dt;else v.x=0;
    if(!blocked(p.x,p.z+v.z*dt))p.z+=v.z*dt;else v.z=0;
    if(player.grounded)coyote=.095;else coyote-=dt;
    if(jumpBuffer>0&&coyote>0){v.y=7.85;player.grounded=false;coyote=0;jumpBuffer=0;tone(138,.08,'sine',.023,220);}
    jumpBuffer-=dt;
    let base=hasBase(p.x,p.z)?0:-Infinity;
    for(const piece of near){const h=piece.type==='wall'?wallLedge(piece,p.x,p.z,p.y):heightAt(piece,p.x,p.z);if(h<=p.y+step)base=Math.max(base,h);}
    v.y-=24*dt;let next=p.y+v.y*dt;
    if(v.y>0)for(const piece of near){
      for(const [dx,dz] of footprint){
        const ceiling=heightAt(piece,p.x+dx,p.z+dz)-.12;
        if(ceiling>=p.y+1.86-.005&&ceiling<next+1.86){next=ceiling-1.86;v.y=0;}
      }
      if(piece.type==='wall'&&!wallsBlock(p.x,p.z,p.y,piece)&&wallsBlock(p.x,p.z,next,piece)){next=p.y;v.y=0;}
    }
    if(next<=base+.006||(player.grounded&&v.y<=0&&base>=p.y-.18)){
      if(!player.grounded&&v.y< -4){tone(94,.10,'triangle',.055);player.land=-.058;}
      p.y=base;v.y=0;player.grounded=true;
    }else{p.y=next;player.grounded=false;}
    player.land*=Math.exp(-12*dt);if(p.y< -9){cancelEdit();spawn();toast('De volta à plataforma');}
  }
  function animateBody(dt,t) {
    const motion=state.active?Math.min(1,Math.hypot(player.v.x,player.v.z)/(tile*1.23)):0;
    player.phase+=motion*dt*11.5;const stride=Math.sin(player.phase)*motion;
    character.root.position.copy(player.p);character.root.rotation.y=-player.yaw-.15*motion*(right.x*player.v.x+right.z*player.v.z)/(tile*1.23);
    character.body.position.y=Math.sin(t*2)*.008+(player.grounded?Math.abs(stride)*.032:0);
    character.body.rotation.x=motion*-.07;character.legs[0].rotation.x=player.grounded?stride*.59:-.41;character.legs[1].rotation.x=player.grounded?-stride*.59:.25;
    const building=state.slot!==0||state.editing;
    character.arms[0].rotation.x=-stride*.31+(building?.44:0);
    character.arms[1].rotation.x=building?.95+player.pitch*.32+stride*.07:stride*.23+.04+Math.sin(Math.pow(1-swing,.76)*Math.PI*2)*swing*1.9;
    character.arms[1].rotation.z=-.10+swing*.22;character.axe.visible=state.slot===0&&!state.editing;character.blueprint.visible=!character.axe.visible;
    swing=Math.max(0,swing-dt*2.6);
  }
  const ghostMat=new T.MeshBasicMaterial({color:0xa5d3ff,map:pane.map,transparent:true,opacity:.9,depthWrite:false,side:T.DoubleSide});
  const frameMat=new T.MeshBasicMaterial({color:0xc7e7ff,transparent:true,opacity:.30,depthWrite:false});
  const lineMat=new T.LineBasicMaterial({color:0xe1f5ff,transparent:true,opacity:.88});
  [ghostMat,frameMat,lineMat].forEach(clearForeground);
  const donor={};
  function shapeOverlay(type){
    if(donor[type])return donor[type];
    const group=new T.Group(),timber=geometry({type,material:0,mask:0});
    group.add(new T.Mesh(faceGeometry(type,0),ghostMat),new T.Mesh(timber,frameMat),new T.LineSegments(new T.EdgesGeometry(timber,25),lineMat));
    donor[type]=group;scene.add(group);group.visible=false;return group;
  }
  const gridX=[0,1,0,-1],gridZ=[-1,0,1,0];
  function proposal(hit){
    const type=actions[state.slot];if(type==='axe'||!state.active||state.editing)return null;
    const p=player.p,heading=mod(Math.round(player.yaw/(Math.PI/2)),4),orientation=mod(heading+state.rot,4);
    const ci=Math.round(p.x/tile),cj=Math.round(p.z/tile),floorLevel=Math.max(0,Math.floor((p.y+.19)/rise));
    // Retain the takeoff ramp through the jump and the floor placement of a 90.
    let support=null,gap=Infinity;
    for(const piece of localPieces(p.x,p.z)){
      if(piece.type!=='ramp')continue;
      const d=p.y-heightAt(piece,p.x,p.z);
      if(d>=-.16&&d<rise*.62&&d<gap){support=piece;gap=d;}
    }
    const upper=support&&p.y>=support.k*rise+rise*.48;
    const turning=support&&((orientation-support.rot)&1);
    const target=hit?.point.distanceTo(p)<tile*1.65?hit.object.userData.piece:null;
    const ahead=p.clone().addScaledVector(forward,tile*.72);
    const result=(i,j,k,rot=orientation)=>({type,i,j,k:Math.max(0,k),rot,material:state.material,mask:0});
    if(type==='wall'){
      let side=orientation,i=ci,j=cj,k=floorLevel;
      if(upper){i=support.i;j=support.j;k=support.k+1;}
      else if(target?.type==='wall'&&target.rot%2===side%2){
        const [lx]=localXZ(target,hit.point.x,hit.point.z),high=hit.point.y-target.k*rise;
        i=target.i;j=target.j;k=target.k;
        if(high>rise*.89&&player.pitch>.16)k++;
        else if(Math.abs(lx)>half*.89){if(side%2)j+=Math.sign(lx);else i+=Math.sign(lx);}
        return result(i,j,k,side%2);
      }
      if(!upper&&player.pitch>.48)k=Math.max(k,(support?.k??floorLevel)+1);
      if(side===1)i++;if(side===2)j++;return result(i,j,k,side%2);
    }
    if(type==='ramp'){
      if(turning&&upper){
        const next=result(support.i,support.j,support.k+1);
        // Beyond the high side of the new ramp, its foot belongs in the adjacent cell.
        if(heightAt(next,p.x,p.z)>p.y+1.96){next.i+=gridX[orientation];next.j+=gridZ[orientation];}
        return next;
      }
      if(support&&orientation===support.rot&&player.pitch>-.65){
        // Continue upwards or branch sideways at the same height, including a diagonal branch.
        const [lx,lz]=localXZ(support,ahead.x,ahead.z),up=lz< -half?1:0;
        const sideways=Math.abs(lx)>half+.018?Math.sign(lx):0,across=mod(orientation+1,4);
        return result(support.i+up*gridX[orientation]+sideways*gridX[across],support.j+up*gridZ[orientation]+sideways*gridZ[across],support.k+up);
      }
      if(support&&orientation!==support.rot){
        const k=support.k+(p.y-support.k*rise>rise*.49?1:0);
        const edge=p.clone().addScaledVector(forward,tile*.30);
        return result(Math.round(edge.x/tile),Math.round(edge.z/tile),k);
      }
      if(target?.type==='ramp'&&target.rot===orientation){
        const [x,z]=localXZ(target,hit.point.x,hit.point.z),up=z< -half*.63?1:0,side=Math.abs(x)>half*.85?Math.sign(x):0,across=mod(orientation+1,4);
        return result(target.i+up*gridX[orientation]+side*gridX[across],target.j+up*gridZ[orientation]+side*gridZ[across],target.k+up);
      }
      if(target?.type==='floor')return result(target.i,target.j,target.k);
      const k=Math.max(floorLevel,Math.floor((p.y+rise*.31)/rise));
      if(target?.type==='wall'){
        // The staircase starts inside the box framed by the wall the player just placed.
        const inside=hit.point.clone().addScaledVector(forward,-.22);
        return result(Math.round(inside.x/tile),Math.round(inside.z/tile),Math.min(k,target.k));
      }
      return result(Math.round(ahead.x/tile),Math.round(ahead.z/tile),k);
    }
    if(type==='floor'&&upper&&player.pitch<=.12&&(turning||!player.grounded||player.pitch<-.16)){
      return result(support.i,support.j,support.k+1);
    }
    // Floor and cone share their base. Looking up puts either piece overhead for stacked edits.
    if(target&&((type==='floor'&&target.type==='roof')||(type==='roof'&&target.type==='floor')))return result(target.i,target.j,target.k);
    let k=floorLevel;
    if(player.pitch>.10)k=Math.max(k+1,Math.ceil((p.y+1.56)/rise));
    else if(support&&p.y-support.k*rise>rise*.50)k=support.k+1;
    if(target?.type==='wall'&&player.pitch<=.10){
      k=target.k+(hit.point.y-target.k*rise>rise*.62?1:0);
      const inside=hit.point.clone().addScaledVector(forward,-.22);
      return result(Math.round(inside.x/tile),Math.round(inside.z/tile),k);
    }
    let point=ahead;
    if(Math.abs(aimDir.y)>.055){
      const distance=(k*rise-pivot.y)/aimDir.y;
      if(distance>=0)point=pivot.clone().addScaledVector(aimDir,Math.min(distance,tile*1.16));
    }
    if(target?.type===type&&Math.abs(hit.point.y-k*rise)<.18){
      const dx=hit.point.x-target.i*tile,dz=hit.point.z-target.j*tile;
      let i=target.i,j=target.j;if(Math.max(Math.abs(dx),Math.abs(dz))>half*.82){if(Math.abs(dx)>Math.abs(dz))i+=Math.sign(dx);else j+=Math.sign(dz);}
      return result(i,j,k);
    }
    return result(Math.round(point.x/tile),Math.round(point.z/tile),k);
  }
  function updateTarget(){
    if(ghost){ghost.visible=false;ghost=null;}
    if(!state.active||state.editing){preview=null;focus=null;$('focusHint').hidden=true;return;}
    const hit=hitPiece();focus=hit?.object.userData.piece||null;
    preview=proposal(hit);
    if(preview&&!pieces.has(idOf(preview))){ghost=shapeOverlay(preview.type);transform(ghost,preview);ghost.visible=true;}
    $('focusHint').hidden=!focus;
  }
  function place(){
    if(!preview||pieces.has(idOf(preview)))return;
    const p=player.p,near=localPieces(p.x,p.z);
    if(wallsBlock(p.x,p.z,p.y,preview)){
      const axis=preview.rot%2?'x':'z',plane=position(preview)[axis];
      const dir=Math.sign(p[axis]-plane)||-Math.sign(forward[axis])||1;
      const next=p.clone();next[axis]=plane+dir*.305;
      if(near.some(piece=>touchesBody(piece,next.x,next.z,p.y)&&!touchesBody(piece,p.x,p.z,p.y)))return;
      p.copy(next);
    }else if(touchesBody(preview,p.x,p.z,p.y)){
      const h=heightAt(preview,p.x,p.z),lift=h-p.y;
      if(!Number.isFinite(h)||lift<-.01||lift>1.96)return;
      if(near.some(piece=>{
        if(touchesBody(piece,p.x,p.z,h))return true;
        const ceiling=heightAt(piece,p.x,p.z)-.12;
        return ceiling>=p.y+1.85&&ceiling<h+1.86;
      }))return;
      cameraLift=Math.min(.85,cameraLift+Math.max(0,lift));p.y=h;
      // Keep jump momentum when the floor forms underneath the player's feet.
      if(player.v.y<=0){player.grounded=true;player.v.y=0;}
    }
    addPiece({...preview},true);saveSoon();tone([178,142,248][state.material],.075,'triangle',.075);buildDelay=.055;
  }
  const editEdge=new T.MeshBasicMaterial({color:'#2479ad',side:T.DoubleSide});
  const editBlue=new T.MeshBasicMaterial({color:'#24c2eb',side:T.DoubleSide});
  const editCut=new T.MeshBasicMaterial({color:'#b9d5db',transparent:true,opacity:.53,side:T.DoubleSide,depthWrite:false});
  const editCells=new Map();let lastPaint=null;
  function editGrid(p){
    const wall=p.type==='wall',ramp=p.type==='ramp',n=wall?3:2;
    const width=tile/n,height=wall?rise/n:tile/n*(ramp?Math.hypot(1,slope):1);
    if(!editCells.has(p.type))editCells.set(p.type,[
      new T.BoxGeometry(width-.023,height-.023,.055),new T.BoxGeometry(width-.108,height-.108,.061)
    ]);
    const [outer,inner]=editCells.get(p.type),g=new T.Group();g.userData.tiles=[];
    for(let row=0;row<n;row++)for(let col=0;col<n;col++){
      const cell=row*n+col,x=-half+(col+.5)*width,z=-half+(row+.5)*tile/n;
      const border=new T.Mesh(outer,editEdge),fill=new T.Mesh(inner,editBlue);
      border.position.set(x,wall?(row+.5)*height:ramp?(half-z)*slope:0,wall?0:z);
      border.rotation.x=wall?0:-Math.PI/2+(ramp?incline:0);
      fill.position.copy(border.position);fill.rotation.copy(border.rotation);
      border.userData.cell=fill.userData.cell=cell;g.add(border,fill);g.userData.tiles.push(fill);
    }
    transform(g,p);return g;
  }
  function refreshGrid(){
    editMesh.userData.tiles.forEach((m,i)=>{m.material=editBits&(1<<i)?editCut:editBlue;
      // Cut cells remain pickable even with the dark backing removed.
      editMesh.children[i*2].visible=m.material!==editCut;
    });
  }
  function beginEdit(){
    if(!state.active)return;updateCamera();const p=hitPiece(true)?.object.userData.piece;
    if(!p){toast('Aponta para a peça que queres editar');return;}
    state.editing=p;editBits=p.mask;p.mesh.visible=false;editMesh=editGrid(p);scene.add(editMesh);refreshGrid();
    lastPaint=null;painting=holding;holding=false;if(painting)paint(true);
    $('confirmKey').textContent=state.release?'Soltar rato 1':'F';$('editBar').hidden=false;tone(430,.055,'sine',.035,600);
  }
  function cancelEdit(){
    if(!state.editing)return;state.editing.mesh.visible=true;state.editing=null;scene.remove(editMesh);editMesh=null;painting=false;lastPaint=null;$('editBar').hidden=true;
  }
  function applyEdit(){
    const p=state.editing;if(!p)return;
    if(editBits===(p.type==='wall'?511:15)){toast('Mantém pelo menos uma secção da peça');return;}
    if(touchesBody({...p,mask:editBits},player.p.x,player.p.z,player.p.y)&&!touchesBody(p,player.p.x,player.p.z,player.p.y)){toast('Afasta-te da abertura para a fechar');return;}
    p.mask=editBits;applyShape(p);cancelEdit();saveSoon();tone(560,.075,'sine',.045,820);
  }
  function paint(start){
    if(!editMesh)return;setAimRay();const hit=ray.intersectObject(editMesh,true)[0];if(!hit){lastPaint=null;return;}
    const p=state.editing,v=editMesh.worldToLocal(hit.point.clone()),wall=p.type==='wall',n=wall?3:2;
    const u=(v.x+half)/tile*n,w=(wall?v.y/rise:(v.z+half)/tile)*n;
    const cell=(a,b)=>clamp(Math.floor(b),0,n-1)*n+clamp(Math.floor(a),0,n-1);
    if(start){paintRemove=!(editBits&(1<<cell(u,w)));lastPaint=null;}
    const from=lastPaint||[u,w],steps=Math.max(1,Math.ceil(Math.max(Math.abs(u-from[0]),Math.abs(w-from[1]))*5));
    let next=editBits;
    for(let i=1;i<=steps;i++){
      const bit=1<<cell(from[0]+(u-from[0])*i/steps,from[1]+(w-from[1])*i/steps);
      next=paintRemove?next|bit:next&~bit;
    }
    lastPaint=[u,w];if(next!==editBits){editBits=next;refreshGrid();tone(680,.028,'sine',.018);}
  }
  function resetEdit(){
    const p=state.editing||hitPiece(true,true)?.object.userData.piece;if(!p)return;
    if(state.editing){editBits=0;refreshGrid();}else{
      if(touchesBody({...p,mask:0},player.p.x,player.p.z,player.p.y)&&!touchesBody(p,player.p.x,player.p.z,player.p.y)){toast('Afasta-te da abertura para a fechar');return;}
      p.mask=0;applyShape(p);saveSoon();
    }
    tone(325,.055,'sine',.03,470);
  }
  function strike(){if(swing>.25)return;swing=1;const hit=hitPiece();if(hit&&hit.point.distanceTo(player.p)<4.85){removePiece(hit.object.userData.piece);saveSoon();tone(118,.12,'triangle',.09);}else tone(184,.08,'triangle',.025);}
  function chooseSlot(slot){cancelEdit();state.slot=slot;state.rot=0;document.querySelectorAll('.slot').forEach((e,i)=>{e.classList.toggle('active',i===slot);e.setAttribute('aria-pressed',i===slot);});$('selectedName').textContent=names[slot];updateTarget();if(holding&&slot)place();}
  function materialNext(){state.material=(state.material+1)%3;refreshMaterial();if(state.slot===0)chooseSlot(1);tone(295,.06,'triangle',.035);}
  function refreshMaterial(){
    $('materialName').textContent=materials[state.material];$('materialIcon').innerHTML=icon(matIcons[state.material]);
    $('slots').style.setProperty('--inventory-row',(state.material*50)+'%');
  }
  actions.forEach((action,i)=>{
    const b=document.createElement('button');b.className='slot';b.setAttribute('aria-label',names[i]+' ('+keyNames[i]+')');b.title=names[i]+' · '+keyNames[i];
    b.innerHTML='<span class="slot-art" aria-hidden="true"></span><em>'+keyNames[i]+'</em>';
    b.style.setProperty('--inventory-col',(i*25)+'%');b.onclick=()=>{chooseSlot(i);if(!state.active)start();};$('slots').appendChild(b);
  });
  const mapBase=document.createElement('canvas');mapBase.width=320;mapBase.height=254;
  function drawMapBase(){
    const c=mapBase.getContext('2d'),W=320,H=254,scale=3.50,noise=VX.random(77612);
    c.fillStyle='#478c97';c.fillRect(0,0,W,H);
    const islands=[...world.islands,{x:-28,z:-38,rx:12,rz:11},{x:23,z:40,rx:14,rz:8}];
    for(const island of islands){
      const {x,z,rx,rz}=island,ox=W/2+x*scale,oy=H/2+z*scale;
      const ring=Array.from({length:29},(_,i)=>{const a=i/29*Math.PI*2,r=.86+noise()*.22;return [Math.cos(a)*r*rx*scale,Math.sin(a)*r*rz*scale];});
      for(const [s,color] of [[1.27,'#68a6a1'],[1.12,'#a8bea3'],[1,'#c5bc8c'],[.93,'#779260'],[.77,'#809c63'],[.63,'#6b8859'],[.48,'#829565'],[.32,'#8ea173']]){
        c.beginPath();ring.forEach(([dx,dy],i)=>i?c.lineTo(ox+dx*s,oy+dy*s):c.moveTo(ox+dx*s,oy+dy*s));c.closePath();c.fillStyle=color;c.fill();c.strokeStyle='#425f563b';c.stroke();
      }
      for(let i=0;i<95;i++){const a=noise()*Math.PI*2,d=Math.sqrt(noise())*.86;c.fillStyle=noise()>.4?'#476e55':'#5e8059';c.beginPath();c.arc(ox+Math.cos(a)*rx*d*scale,oy+Math.sin(a)*rz*d*scale,1+noise()*2.5,0,7);c.fill();}
    }
    for(let x=0;x<W;x+=24){c.strokeStyle='#e6fffc24';c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();}for(let y=0;y<H;y+=24){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
    const side=world.arenaHalf*scale;c.fillStyle='#61767a';c.fillRect(W/2-side,H/2-side,side*2,side*2);c.strokeStyle='#c8dfc9';c.lineWidth=2;c.strokeRect(W/2-side,H/2-side,side*2,side*2);c.lineWidth=1;c.strokeStyle='#93a5a5';
    for(let i=-4.5;i<5;i++){const d=i*tile*scale;c.beginPath();c.moveTo(W/2+d,H/2-side);c.lineTo(W/2+d,H/2+side);c.moveTo(W/2-side,H/2+d);c.lineTo(W/2+side,H/2+d);c.stroke();}
  }
  function drawMap(){const c=$('map').getContext('2d');c.drawImage(mapBase,0,0);c.fillStyle='#c5a57a';for(const p of pieces.values()){if(p.k>8)continue;const v=position(p);c.fillRect(160+v.x*3.5-4,127+v.z*3.5-4,8,8);}
    const x=clamp(160+player.p.x*3.5,7,313),y=clamp(127+player.p.z*3.5,7,247);c.save();c.translate(x,y);c.rotate(player.yaw);c.beginPath();c.moveTo(0,-12);c.lineTo(8,8);c.lineTo(0,5);c.lineTo(-8,8);c.closePath();c.fillStyle='#e2ff9c';c.strokeStyle='#1c4748';c.lineWidth=3;c.stroke();c.fill();c.restore();
  }
  const directions=['N','NE','E','SE','S','SO','O','NO'],labels=[];
  for(let i=0;i<25;i++){const el=document.createElement('span');el.className='bearing';el.innerHTML='<span></span><b></b>';$('bearings').appendChild(el);labels.push(el);}
  function compass(){
    const deg=mod(player.yaw*180/Math.PI,360),base=Math.round(deg/15);
    labels.forEach((el,i)=>{const n=base+i-12,num=mod(n*15,360);el.style.left='calc(50% + '+((n*15-deg)*2.15)+'px)';el.children[0].textContent=num%45===0?directions[num/45]:num;el.classList.toggle('cardinal',num%45===0);});
  }
  function soundUI(){$('audioBtn').innerHTML=icon(state.sound?'sound':'muted');$('audioBtn').setAttribute('aria-label',state.sound?'Desligar som':'Ligar som');$('soundToggle').textContent=state.sound?'Ligado':'Desligado';}
  function toggleSound(){state.sound=!state.sound;soundUI();savePrefs();if(state.sound){unlockAudio();tone(400,.08);}}
  const bindings=[['Mover','W A S D / Setas'],['Saltar','Espaço'],['Picareta','G'],['Parede / chão / rampa / cone','Z / X / C / V'],['Colocar continuamente / usar picareta','Rato 1'],['Rodar peça / trocar material','R / T'],['Editar / confirmar','F'],['Selecionar secções','Premir e arrastar · Rato 1'],['Repor edição','Rato 2 + F'],['Reposição rápida','Roda para baixo'],['Mostrar atalhos / abrir menu','H / Esc']];
  bindings.forEach(([a,b])=>{const d=document.createElement('div');d.className='keyrow';const l=document.createElement('span'),k=document.createElement('kbd');l.textContent=a;k.textContent=b;d.append(l,k);$('keys').append(d);});
  // A discontinuity can arrive in the middle of pointer lock, including while a
  // mouse button is down. Validate an abrupt acceleration against the next
  // non-zero sample on that axis before applying it to aim or edit selection.
  const mouseAxes=[{},{}];
  let coalescedMotion=null;
  function resetMouseSamples(){
    coalescedMotion=null;
    for(const axis of mouseAxes)Object.assign(axis,{rate:0,lastDelta:0,last:0,pending:0,pendingTime:0});
  }
  function relativeMotion(axis,delta,time){
    if(!Number.isFinite(delta))return 0;
    const gap=time-axis.last,dt=clamp(gap,2,24);
    if(gap>65){axis.rate=0;axis.lastDelta=0;}
    if(time-axis.pendingTime>48)axis.pending=0;
    if(delta===0)return 0;
    axis.last=time;
    const amount=Math.abs(delta),pending=axis.pending;
    if(pending){
      axis.pending=0;
      const ratio=Math.abs(delta/pending);
      if(ratio>=.45&&ratio<=2.2){
        if(Math.sign(delta)!==Math.sign(pending))return 0;
        axis.rate=amount/dt;axis.lastDelta=delta;
        return pending+delta;
      }
    }
    const continuing=axis.lastDelta*delta>0;
    const expected=continuing?Math.min(axis.rate*dt,Math.abs(axis.lastDelta)*1.5):0;
    const threshold=Math.max(24,.065/(.0022*state.sens),expected*2.7+9);
    if(amount>threshold){axis.pending=delta;axis.pendingTime=time;return 0;}
    axis.rate=axis.rate*.35+.65*amount/dt;axis.lastDelta=delta;
    return delta;
  }
  resetMouseSamples();
  function clearInput(){resetMouseSamples();keys.clear();holding=painting=dragged=false;jumpBuffer=0;}
  function openMenu(){
    if(state.menu)return;menuWasActive=state.active;state.active=false;state.menu=true;clearInput();cancelEdit();if(document.pointerLockElement===canvas)document.exitPointerLock();
    $('overlay').hidden=false;$('enter').hidden=true;$('buildCount').textContent=pieces.size;$('resume').textContent=state.ever?'Continuar a treinar  ↵':'Entrar na arena  ↵';$('resetConfirm').hidden=true;$('resume').focus();
  }
  function closeMenu(resume){state.menu=false;$('overlay').hidden=true;if(resume){start();}else{$('enter').hidden=false;}}
  function start(){
    state.menu=false;state.active=true;state.ever=true;$('overlay').hidden=true;$('enter').hidden=true;clearInput();unlockAudio();
    if(document.pointerLockElement!==canvas&&canvas.requestPointerLock){try{const req=canvas.requestPointerLock();if(req?.catch)req.catch(()=>toast('Arrasta o rato para orientar a câmara'));}catch{toast('Arrasta o rato para orientar a câmara');}}
  }
  $('enter').onclick=start;$('menuBtn').onclick=openMenu;$('closeMenu').onclick=()=>closeMenu(menuWasActive);$('resume').onclick=()=>closeMenu(true);
  $('audioBtn').onclick=$('soundToggle').onclick=toggleSound;
  $('fullBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('O navegador não permite ecrã inteiro nesta vista');}};
  $('helpBtn').onclick=()=>$('controls').classList.toggle('collapsed');$('material').onclick=materialNext;
  document.querySelectorAll('.tab').forEach(el=>el.onclick=()=>{document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===el));$('keys').hidden=el.dataset.tab!=='keys';$('session').hidden=el.dataset.tab!=='session';});
  $('sens').oninput=()=>{state.sens=Number($('sens').value);$('sensOut').textContent=state.sens.toFixed(1)+'×';savePrefs();};
  $('releaseEdit').onchange=()=>{state.release=$('releaseEdit').checked;savePrefs();};
  $('respawn').onclick=()=>{spawn();closeMenu(true);toast('De volta ao início');};$('reset').onclick=()=>$('resetConfirm').hidden=false;$('cancelReset').onclick=()=>$('resetConfirm').hidden=true;
  $('doReset').onclick=()=>{for(const p of [...pieces.values()])removePiece(p);initialPieces();spawn();chooseSlot(0);snapshot();closeMenu(true);toast('Arena reiniciada');};
  window.addEventListener('keydown',e=>{
    if(state.menu){if(e.code==='Escape'){e.preventDefault();closeMenu(menuWasActive);}return;}
    if(e.target.tagName==='INPUT'||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.code==='Escape'){openMenu();return;}
    if(e.code==='Enter'&&!state.active){e.preventDefault();start();return;}
    if(e.code==='KeyH'&&!e.repeat){$('helpBtn').click();return;}
    if(!state.active)return;if([...Object.keys(keyMap),'Space','KeyR','KeyF','KeyT','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
    keys.add(e.code);if(e.repeat)return;
    if(keyMap[e.code]!==undefined){chooseSlot(keyMap[e.code]);return;}
    if(e.code==='Space')jumpBuffer=.15;
    if(e.code==='KeyF'){if(state.editing)applyEdit();else beginEdit();}
    if(e.code==='KeyR'&&state.slot&&!state.editing){state.rot=mod(state.rot+1,4);tone(320,.045);}
    if(e.code==='KeyT')materialNext();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  document.addEventListener('pointerlockchange',()=>{resetMouseSamples();if(document.pointerLockElement!==canvas&&state.active)openMenu();});
  window.addEventListener('blur',()=>{if(state.active)openMenu();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('mousedown',e=>{
    e.preventDefault();if(!state.active){if(!state.menu)start();return;}
    dragged=true;dragX=e.clientX;dragY=e.clientY;
    if(e.button===2){if(state.editing)resetEdit();return;}if(e.button!==0)return;
    if(state.editing){painting=true;paint(true);return;}holding=true;updateTarget();if(state.slot)place();else strike();
  });
  window.addEventListener('mouseup',e=>{if(e.button===0){holding=false;if(painting&&state.release)applyEdit();painting=false;}dragged=false;});
  window.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse'||document.pointerLockElement!==canvas)return;
    const samples=e.getCoalescedEvents?.();
    coalescedMotion=samples?.length>1?{time:e.timeStamp,samples}:null;
  });
  window.addEventListener('mousemove',e=>{
    if(!state.active)return;const locked=document.pointerLockElement===canvas;if(!locked&&!dragged)return;
    if(!locked&&e.buttons===0){dragged=false;holding=false;painting=false;return;}
    let dx=e.clientX-dragX,dy=e.clientY-dragY;
    if(locked){
      let samples=[e];
      // Some browsers report only a single relative delta while locked.
      // Consume hardware samples once, only if they describe this same event.
      if(coalescedMotion&&Math.abs(e.timeStamp-coalescedMotion.time)<2){
        const batch=coalescedMotion.samples;
        const x=batch.reduce((v,p)=>v+p.movementX,0),y=batch.reduce((v,p)=>v+p.movementY,0);
        if(x===e.movementX&&y===e.movementY)samples=batch;
      }
      dx=0;dy=0;
      for(const sample of samples){
        dx+=relativeMotion(mouseAxes[0],sample.movementX,sample.timeStamp);
        dy+=relativeMotion(mouseAxes[1],sample.movementY,sample.timeStamp);
      }
    }
    coalescedMotion=null;
    dragX=e.clientX;dragY=e.clientY;if(!dx&&!dy)return;
    player.yaw+=dx*.0022*state.sens;player.pitch=clamp(player.pitch-dy*.0022*state.sens,-1.48,1.48);
    updateCamera();if(painting)paint(false);
    else if(holding&&state.slot===1&&!state.editing){updateTarget();place();}
  });
  canvas.addEventListener('wheel',e=>{if(!state.active)return;e.preventDefault();if(e.deltaY>0){if(state.editing){resetEdit();applyEdit();}else resetEdit();}},{passive:false});
  loadPrefs();soundUI();$('sens').value=state.sens;$('sensOut').textContent=state.sens.toFixed(1)+'×';$('releaseEdit').checked=state.release;
  restore();spawn();resize();updateCamera();chooseSlot(0);refreshMaterial();drawMapBase();drawMap();compass();
  let last=performance.now(),mapTime=0,fpsTime=0,frames=0;
  function frame(now){
    const elapsed=(now-last)/1000,dt=Math.min(.12,elapsed);last=now;resize();
    if(state.active){const steps=Math.max(1,Math.ceil(dt/.012));for(let i=0;i<steps;i++)walk(dt/steps);}
    cameraLift*=Math.exp(-15*dt);
    animateBody(dt,now/1000);updateCamera();updateTarget();if(painting)paint(false);
    for(const [p,until] of freshPieces)if(now>=until){p.face.material=pane;freshPieces.delete(p);}
    buildDelay-=dt;if(state.active&&holding&&!state.editing){if(state.slot&&buildDelay<=0)place();else if(!state.slot&&swing===0)strike();}
    if(mapTime<=0){
      drawMap();compass();
      if(state.active){
        const p=player.p;world.sun.target.position.set(Math.round(p.x/4)*4,Math.round(p.y/4)*4,Math.round(p.z/4)*4);
        world.sun.position.copy(world.sun.target.position).add(vec(-25,42,17));renderer.shadowMap.needsUpdate=true;
      }mapTime=.10;
    }mapTime-=dt;
    fpsTime+=elapsed;qualityTimer+=elapsed;frames++;
    if(fpsTime>.75){
      const fps=Math.round(frames/fpsTime);$('fps').textContent=fps;
      if(qualityTimer>2.5&&!document.hidden){
        const max=Math.min(devicePixelRatio,1.45),min=Math.min(max,.65);
        const next=fps<37?Math.max(min,renderScale*.83):fps>57?Math.min(max,renderScale+.06):renderScale;
        if(Math.abs(next-renderScale)>.01){renderScale=next;lastWidth=0;}qualityTimer=0;
      }fpsTime=0;frames=0;
    }
    renderer.render(scene,camera);requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
})();
