'use strict';
function createWorld(scene) {
  const {T,Shape,vec,random,tile,half}=VX,rng=random(934621),choose=a=>a[Math.floor(rng()*a.length)];
  const ground=new Shape(),land=new Shape(),waterMarks=new Shape();
  const arenaHalf=tile*4.5,sea=-4.6;
  scene.background=new T.Color('#98d9ea');scene.fog=new T.FogExp2('#b7dcdf',.0052);
  // Bake a seamless cloud field once. Its soft atmospheric edges stay smooth at any camera pitch.
  const W=1536,H=384,skyCanvas=document.createElement('canvas');skyCanvas.width=W;skyCanvas.height=H;
  const skyCtx=skyCanvas.getContext('2d'),pixels=skyCtx.createImageData(W,H),cloudRandom=random(4182);
  const values=Float32Array.from({length:256*256},()=>cloudRandom());
  const mix=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t);
  function noise(x,y,period){
    const a=Math.floor(x),b=Math.floor(y),u=smooth(x-a),v=smooth(y-b);
    const val=(i,j)=>values[(((b+j)&255)<<8)+(((((a+i)%period)+period)%period)&255)];
    return mix(mix(val(0,0),val(1,0),u),mix(val(0,1),val(1,1),u),v);
  }
  function cloudDensity(x,y) {return .49*noise(x,y,40)+.28*noise(x*2,y*2,80)+.14*noise(x*4,y*4,160)+.065*noise(x*8,y*8,320)+.025*noise(x*16,y*16,640);}
  for(let j=0;j<H;j++){
    const elevation=(1-j/(H-1))*1.38-.13,haze=Math.exp(-Math.max(elevation,0)*5.8);
    const blue=[mix(71,215,haze),mix(153,236,haze),mix(213,237,haze)],cy=(elevation+.1)*11;
    const cloudFade=Math.max(0,Math.min(1,(elevation+.02)*12))*smooth(Math.max(0,Math.min(1,(1.22-elevation)/.39)));
    for(let i=0;i<W;i++){
      const cx=i/W*40,density=cloudDensity(cx,cy),opacity=smooth(Math.min(1,Math.max(0,(density-.503)*5.8)))*cloudFade;
      const brightness=Math.min(1,Math.max(.1,.58+(density-cloudDensity(cx-.018,cy+.16))*4.8));
      const cloud=[mix(210,255,brightness),mix(229,254,brightness),mix(235,249,brightness)],idx=(j*W+i)*4;
      for(let k=0;k<3;k++)pixels.data[idx+k]=mix(blue[k],cloud[k],opacity);pixels.data[idx+3]=255;
    }
  }
  skyCtx.putImageData(pixels,0,0);const skyTexture=new T.CanvasTexture(skyCanvas);skyTexture.colorSpace=T.SRGBColorSpace;skyTexture.wrapS=T.RepeatWrapping;skyTexture.generateMipmaps=false;skyTexture.minFilter=T.LinearFilter;
  const sky=new T.Mesh(new T.SphereGeometry(440,48,24),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{panorama:{value:skyTexture}},
    vertexShader:'varying vec3 dir; void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec3 dir;uniform sampler2D panorama;void main(){vec3 d=normalize(dir);vec2 uv=vec2(atan(d.x,d.z)/6.2831853+0.5,clamp((asin(d.y)+0.13)/1.38,0.0,1.0));gl_FragColor=texture2D(panorama,uv);\n#include <colorspace_fragment>\n}'
  }));sky.renderOrder=-10;scene.add(sky);
  const ambient=new T.HemisphereLight(0xedf9ff,0xbec9c0,1.78);scene.add(ambient);
  const sun=new T.DirectionalLight(0xfff2d4,2.22);sun.position.set(-25,42,17);sun.target.position.set(0,0,0);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-26,right:26,top:26,bottom:-26,near:.5,far:115});sun.shadow.mapSize.set(1536,1536);sun.shadow.normalBias=.025;sun.shadow.bias=-.00018;scene.add(sun,sun.target);
  const ocean=new T.Mesh(new T.PlaneGeometry(890,890),new T.MeshLambertMaterial({color:'#36a8b4'}));ocean.rotation.x=-Math.PI/2;ocean.position.y=sea;scene.add(ocean);
  for(let i=0;i<1450;i++){
    const x=rng()*330-165,z=rng()*320-160,len=.3+rng()**2*6,depth=.035+rng()*.15;
    waterMarks.tri([x,sea+.022,z],[x+len,sea+.022,z+.05],[x+len*.73,sea+.022,z+depth],choose(['#79c7c8','#68bec3','#54acb7','#a6dcd4']));
  }
  const wm=waterMarks.mesh();wm.castShadow=false;scene.add(wm);
  // Irregular concentric ridges form the long mountain silhouettes around the bay.
  function mountain(x,z,r,h,snow) {
    const n=13,offset=rng()*2,base=[],mid=[],cap=[],summit=[x+r*(rng()-.5)*.68,sea+h,z+r*(rng()-.5)*.46];
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2+offset,d=.74+rng()*.38;
      base.push([x+Math.cos(a)*r*d,sea-.8,z+Math.sin(a)*r*d*.79]);
      mid.push([x+Math.cos(a+.13)*r*d*.54,sea+h*(.3+rng()*.20),z+Math.sin(a+.13)*r*d*.43]);
      const c=.15+rng()*.26;cap.push([summit[0]+Math.cos(a)*r*c,sea+h*(.53+rng()*.32),summit[2]+Math.sin(a)*r*c*.88]);
    }
    const baseColors=['#628d98','#72969e','#709ca4','#648a96','#80a4a7'],high=['#859fa9','#829da7','#91aab1','#7998a7'],ice=['#f6f6e9','#e2ece9','#d3e4e7','#edf1ed'];
    for(let i=0;i<n;i++){const j=(i+1)%n;
      land.tri(base[i],mid[i],base[j],choose(baseColors));land.tri(base[j],mid[i],mid[j],choose(baseColors));
      land.tri(mid[i],cap[i],mid[j],choose(high));land.tri(mid[j],cap[i],cap[j],choose(high));land.tri(cap[i],summit,cap[j],choose(snow?ice:high));
      if(snow&&i%2===0)land.tri(cap[i],mid[j].map((v,k)=>v*.28+cap[j][k]*.72),cap[j],choose(ice));
    }
  }
  for(let i=0;i<41;i++){
    const a=i/41*Math.PI*2,r=132+rng()*42;
    mountain(Math.sin(a)*r,Math.cos(a)*r,28+rng()*25,13+rng()**1.4*26,rng()>.16);
  }
  function pine(x,y,z,height) {
    const h=height,a=rng()*2;
    land.cylinder(x,y+h*.21,z,.056*h,.080*h,h*.42,5,'#72624b');
    const greens=choose([['#326f61','#41876b','#559276'],['#427b60','#51865d','#65946a'],['#376e68','#498776','#56947d']]);
    for(let j=0;j<3;j++){
      const hh=h*(.49-j*.058);
      land.cylinder(x,y+h*(.41+.20*j),z,.006,h*(.304-j*.064),hh,6,greens[j],[0,a+j*.31,0]);
    }
  }
  const islands=[];
  function island(x,z,rx,rz,h,treeCount) {
    islands.push({x,z,rx,rz});
    const n=15,base=[],coast=[],cliff=[],grass=[],top=[],angle=rng()*5;
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2+angle,k=.87+rng()*.24,dx=Math.cos(a)*rx*k,dz=Math.sin(a)*rz*k,Y=sea+h*(.73+rng()*.18);
      base.push([x+dx*1.10,sea-.35,z+dz*1.10]);coast.push([x+dx,sea+.48+rng()*.6,z+dz]);
      cliff.push([x+dx*.87,Y-.7,z+dz*.87]);grass.push([x+dx*.85,Y,z+dz*.85]);top.push([x+dx*.50,sea+h*(.95+rng()*.08),z+dz*.5]);
    }
    const green=['#88a856','#91ae5c','#809f52','#9cb866','#83a55b'],rock=['#909791','#8a918f','#a4a79a','#b5b49f','#8e9696'],sand=['#d3c496','#dacfaa','#bfbd9b'];
    for(let i=0;i<n;i++){
      const j=(i+1)%n;
      for(const [lo,hi,colors] of [[base,coast,sand],[coast,cliff,rock],[cliff,grass,green],[grass,top,green]]){
        land.tri(lo[i],hi[i],lo[j],choose(colors));land.tri(lo[j],hi[i],hi[j],choose(colors));
      }land.tri(top[i],[x,sea+h*1.05,z],top[j],choose(green));
    }
    for(let i=0;i<treeCount;i++){
      const a=rng()*2*Math.PI,d=Math.sqrt(rng())*.76;
      pine(x+Math.cos(a)*rx*d,sea+h*(1.035-d*.22),z+Math.sin(a)*rz*d,2.5+rng()**1.4*5.5);
    }
    for(let i=0;i<9;i++){
      const a=rng()*6.28,r=.9+rng()*.18,sz=.6+rng()*1.6;
      land.rock(x+Math.cos(a)*rx*r,sea+.4,z+Math.sin(a)*rz*r,sz,sz*.67,sz*.85,choose(rock),[rng(),rng()*3,0]);
    }
  }
  island(-44,-27,20,13,6.8,27);island(41,-28,22,12,8.4,33);island(-9,-65,20,8,5,18);
  island(-69,-60,25,14,11,32);island(70,-66,26,14,12,34);
  island(-43,22,14,18,7.8,23);island(45,31,21,16,8,29);island(0,62,22,12,6,28);island(88,4,18,29,9,25);island(-84,-3,21,24,9,21);
  // A small coastal beacon gives the east headland a recognizable landmark.
  const bx=39,bz=-32,by=sea+8.3;
  land.cylinder(bx,by+2.2,bz,.72,.99,4.4,8,'#eddcbc');land.cylinder(bx,by+3,bz,.81,.87,.8,8,'#d87852');
  land.cylinder(bx,by+4.45,bz,1.11,1.13,.20,8,'#415b61');land.cylinder(bx,by+5,bz,.62,.67,.90,8,'#a4dbcd');
  land.cylinder(bx,by+5.62,bz,.05,1.03,.47,8,'#c56844');
  const terrain=land.mesh();terrain.castShadow=false;scene.add(terrain);
  // Bolted, chamfered steel tiles and a luminous perimeter define the build grid.
  ground.box(0,-.69,0,arenaHalf*2+.25,1.18,arenaHalf*2+.25,'#3c5159');
  const panels=['#647b82','#687e84','#6b8185','#60767e','#6b8084'];
  for(let ix=-4;ix<=4;ix++)for(let iz=-4;iz<=4;iz++){
    const x=ix*tile,z=iz*tile,y=.001,c=.10,l=half-.025,color=choose(panels);
    const corners=[[-l+c,-l],[l-c,-l],[l,-l+c],[l,l-c],[l-c,l],[-l+c,l],[-l,l-c],[-l,-l+c]];
    for(let j=0;j<8;j++){const a=corners[j],b=corners[(j+1)%8];ground.tri([x,y,z],[x+b[0],y,z+b[1]],[x+a[0],y,z+a[1]],color);}
    for(const dx of [-1,1])for(const dz of [-1,1]){
      ground.box(x+dx*(l-.13),.009,z+dz*(l-.13),.048,.012,.048,'#465b62');
      const tx=x+dx*(l-.27),tz=z+dz*(l-.27);
      ground.box(tx,.010,tz+dz*.08,.18,.009,.021,'#839599');ground.box(tx+dx*.078,.010,tz,.021,.009,.17,'#839599');
    }
    // Fine inset scoring lines and alternating short alignment ticks.
    ground.box(x,.008,z-l+.068,tile-.37,.009,.014,'#8a9b9c');
    if((ix+iz)%3===0)for(let j=0;j<3;j++)ground.box(x-l+.22+j*.10,.012,z+l-.20,.046,.014,.17,'#9fadab',[0,.38,0]);
  }
  for(const side of [-1,1]){
    for(const axis of [0,1]){
      const pos=side*(arenaHalf+.022);
      ground.box(axis?0:pos,-.14,axis?pos:0,axis?2*arenaHalf:.14,.20,axis?.14:2*arenaHalf,'#9aa9a6');
      ground.box(axis?0:pos,-.37,axis?pos:0,axis?2*arenaHalf:.17,.102,axis?.17:2*arenaHalf,'#86ddcc');
      for(let i=-4;i<=4;i++)ground.box(axis?i*tile:pos,-.74,axis?pos:i*tile,axis?.20:.25,.85,axis?.25:.20,'#46565b');
    }
    for(let i=-7;i<=7;i++){
      ground.box(side*3.06,.012,i*1.85,.073,.013,1.02,'#d6bb71');
    }
  }
  for(const [x,z] of [[-12,-12],[12,-12],[-12,12],[12,12]]){
    ground.cylinder(x,.032,z,1.46,1.47,.06,8,'#435b65',[0,Math.PI/8,0]);
    ground.cylinder(x,.067,z,1.29,1.31,.02,8,'#a8cc98',[0,Math.PI/8,0]);ground.cylinder(x,.083,z,1.22,1.23,.02,8,'#546e77',[0,Math.PI/8,0]);
    for(let i=-1;i<=1;i++)ground.box(x+i*.20,.102,z,.075,.015,.62,'#b5c9b2',[0,.5,0]);
  }
  for(const x of [-arenaHalf-.28,arenaHalf+.28])for(const z of [-arenaHalf-.28,arenaHalf+.28]){
    ground.cylinder(x,-.23,z,.39,.52,1.9,6,'#485d62');ground.cylinder(x,.75,z,.36,.40,.20,6,'#dfb96d');
    ground.cylinder(x,1.0,z,.20,.29,.32,6,'#384c54');ground.cylinder(x,1.26,z,.15,.17,.26,6,'#a6e8d7');ground.cylinder(x,1.42,z,.20,.22,.09,6,'#677d7e');
  }
  scene.add(ground.mesh());
  const wear=document.createElement('canvas');wear.width=wear.height=512;const pen=wear.getContext('2d');
  for(let i=0;i<1100;i++){
    const x=rng()*512,y=rng()*512,len=1+rng()**3*31;pen.lineWidth=.3+rng()*.8;pen.strokeStyle=i%2?'rgba(223,237,228,.20)':'rgba(43,63,68,.12)';pen.beginPath();pen.moveTo(x,y);pen.lineTo(x+len,y-len*(.2+rng()*.1));pen.stroke();
  }
  for(let i=0;i<16;i++){const x=rng()*512,y=rng()*512,rad=15+rng()*76,gr=pen.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,'rgba(31,50,59,.065)');gr.addColorStop(1,'rgba(31,50,59,0)');pen.fillStyle=gr;pen.fillRect(x-rad,y-rad,rad*2,rad*2);}
  const wearMap=new T.CanvasTexture(wear);wearMap.wrapS=wearMap.wrapT=T.RepeatWrapping;wearMap.repeat.set(9,9);wearMap.anisotropy=4;wearMap.colorSpace=T.SRGBColorSpace;
  const patina=new T.Mesh(new T.PlaneGeometry(arenaHalf*2,arenaHalf*2),new T.MeshBasicMaterial({map:wearMap,transparent:true,depthWrite:false}));patina.rotation.x=-Math.PI/2;patina.position.y=.019;scene.add(patina);
  for(const [z,label] of [[3.8,'01'],[-7.4,'02']]){
    const marking=document.createElement('canvas');marking.width=384;marking.height=256;const m=marking.getContext('2d');
    m.fillStyle='#d7e2db';m.font='italic 900 165px Arial';m.textAlign='center';m.fillText(label,193,174);
    m.fillRect(74,194,229,6);m.fillRect(79,206,52,6);m.fillRect(140,206,22,6);
    const mt=new T.CanvasTexture(marking);mt.colorSpace=T.SRGBColorSpace;mt.anisotropy=8;
    const decal=new T.Mesh(new T.PlaneGeometry(2.9,1.95),new T.MeshBasicMaterial({map:mt,transparent:true,opacity:.59,depthWrite:false}));decal.rotation.x=-Math.PI/2;decal.position.set(-3.65,.026,z);scene.add(decal);
  }
  return {arenaHalf,islands,sky,sea,sun};
}
