'use strict';
const VX = (() => {
  const T = THREE, tile = 5.5, half = tile / 2, rise = 4.25;
  const slope = rise/tile, incline = Math.atan(slope);
  const surface = new T.MeshLambertMaterial({vertexColors:true, flatShading:true, side:T.DoubleSide});
  let timber;
  function woodMaterial(){
    if(timber)return timber;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const ctx=canvas.getContext('2d'),r=random(28763),grain=ctx.createImageData(512,256);
    const rings=Float32Array.from({length:256},()=>r());
    for(let y=0;y<256;y++)for(let x=0;x<512;x++){
      const warp=2.7*Math.sin(x*.014+y*.037)+1.5*Math.sin(x*.029-y*.06);
      const band=rings[(Math.floor(y+warp)+256)%256],thread=Math.sin((y+warp)*2.8);
      const tone=222+band*26+thread*6+r()*5,idx=(y*512+x)*4;
      grain.data[idx]=tone;grain.data[idx+1]=tone*.98;grain.data[idx+2]=tone*.94;grain.data[idx+3]=255;
    }
    ctx.putImageData(grain,0,0);
    for(let i=0;i<410;i++){
      const x=r()*640-100,y=r()*256,len=12+r()**1.4*134,dy=r()*4-2;
      ctx.lineWidth=.3+r()*1.25;ctx.strokeStyle='rgba(101,70,43,'+(.035+r()*.13)+')';ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+len*.36,y+dy,x+len*.75,y-dy,x+len,y+dy*.27);ctx.stroke();
    }
    for(let i=0;i<8;i++){
      const x=20+r()*472,y=12+r()*230,rad=2+r()*4;
      for(let j=1;j<=3;j++){ctx.strokeStyle='rgba(109,70,45,'+(.10/j)+')';ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(x,y,rad*j*2,rad*j*.3,.02,0,Math.PI*2);ctx.stroke();}
    }
    const tex=new T.CanvasTexture(canvas);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
    timber=surface.clone();timber.map=tex;return timber;
  }
  const primitives = new Map();
  function cached(key, create) {
    if (!primitives.has(key)) {
      const g = create();
      primitives.set(key, g.index ? g.toNonIndexed() : g);
    }
    return primitives.get(key);
  }
  const boxGeo = cached('box', () => new T.BoxGeometry(1,1,1));
  const vec = (x,y,z) => new T.Vector3(x,y,z);
  function random(seed) {
    let state = seed >>> 0;
    return () => {state = (Math.imul(1664525,state) + 1013904223) >>> 0; return state / 4294967296;};
  }
  class Shape {
    constructor() {this.positions=[]; this.colors=[];}
    tri(a,b,c,color) {
      const col = new T.Color(color);
      this.positions.push(...a,...b,...c);
      for(let i=0;i<3;i++) this.colors.push(col.r,col.g,col.b);
    }
    geo(geometry,x,y,z,sx,sy,sz,color,rotation) {
      const q = rotation?.isQuaternion ? rotation : new T.Quaternion().setFromEuler(new T.Euler(...(rotation || [0,0,0])));
      const m = new T.Matrix4().compose(vec(x,y,z),q,vec(sx,sy,sz));
      const col = new T.Color(color), p = geometry.attributes.position, v = vec();
      for(let i=0;i<p.count;i++) {
        v.fromBufferAttribute(p,i).applyMatrix4(m);
        this.positions.push(v.x,v.y,v.z); this.colors.push(col.r,col.g,col.b);
      }
    }
    box(x,y,z,w,h,d,color,rot) {this.geo(boxGeo,x,y,z,w,h,d,color,rot);}
    rock(x,y,z,w,h,d,color,rot,detail=0) {
      this.geo(cached('rock'+detail,()=>new T.IcosahedronGeometry(1,detail)),x,y,z,w,h,d,color,rot);
    }
    cylinder(x,y,z,rTop,rBottom,h,sides,color,rot) {
      const ratio=rBottom===0?0:rTop/rBottom;
      const g=cached('c'+ratio.toFixed(4)+'/'+sides,()=>new T.CylinderGeometry(ratio,1,1,sides));
      this.geo(g,x,y,z,rBottom,h,rBottom,color,rot);
    }
    beam(a,b,width,depth,color) {
      const v=vec(...b).sub(vec(...a)), q=new T.Quaternion().setFromUnitVectors(vec(0,1,0),v.clone().normalize());
      this.box((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,width,v.length(),depth,color,q);
    }
    mesh(material=surface) {
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(this.positions,3));g.setAttribute('color',new T.Float32BufferAttribute(this.colors,3));g.computeVertexNormals();g.computeBoundingSphere();
      const m=new T.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;return m;
    }
  }
  // A ring defines each change of silhouette in the character's clothes and equipment.
  function rings(s,levels,n,colors,offset=Math.PI/8) {
    const layers=levels.map(([x,y,z,rx,rz])=>Array.from({length:n},(_,i)=>[x+rx*Math.cos(i*2*Math.PI/n+offset),y,z+rz*Math.sin(i*2*Math.PI/n+offset)]));
    for(let j=0;j<layers.length-1;j++)for(let i=0;i<n;i++){
      const a=layers[j][i],b=layers[j][(i+1)%n],c=layers[j+1][(i+1)%n],d=layers[j+1][i];
      const color=colors[j%colors.length];s.tri(a,d,b,color);s.tri(b,d,c,color);
    }
    for(const row of [layers[0],layers[layers.length-1]])for(let i=1;i<n-1;i++)s.tri(row[0],row[i],row[i+1],colors[0]);
  }
  function pickaxe() {
    const s=new Shape();
    s.beam([-.015,-.56,0],[.06,.55,0],.067,.07,'#323f4b');
    for(let i=0;i<8;i++)s.box(-.005+i*.002,-.5+i*.048,0,.077,.027,.078,i%2?'#2a363b':'#636e70',[0,0,-.065]);
    s.box(.053,.41,0,.091,.18,.09,'#f3aa4c',[0,0,-.065]);
    const edge=[[-.62,.25],[-.44,.53],[-.17,.68],[.06,.66],[.21,.60],[.43,.39],[.52,.22],[.24,.38],[.06,.45],[-.18,.48],[-.40,.40]];
    const colors=['#79f4e2','#86d5d4','#437b8a','#334e60','#354956','#4e8c99','#9bffed','#6debdc','#a0fff0','#61d0c9','#75e5db'];
    for(let i=0;i<edge.length;i++){
      const a=edge[i],b=edge[(i+1)%edge.length];
      s.tri([a[0],a[1],.032],[b[0],b[1],.032],[-.02,.55,.093],colors[i]);
      s.tri([a[0],a[1],-.032],[-.02,.55,-.08],[b[0],b[1],-.032],colors[i]);
      s.tri([...a,.032],[...b,-.032],[...b,.032],'#284454');s.tri([...a,.032],[...a,-.032],[...b,-.032],'#486475');
    }
    s.box(.05,.51,0,.146,.14,.18,'#33424d',[0,0,-.09]);
    s.beam([-.60,.268,.035],[-.40,.40,.036],.014,.012,'#b0fff2');s.beam([-.40,.40,.036],[-.17,.483,.036],.012,.01,'#a5ffed');return s.mesh();
  }
  function avatar() {
    const root=new T.Group(), body=new T.Group();root.add(body);
    const torso=new Shape();
    rings(torso,[[0,.86,0,.21,.145],[0,1.00,0,.215,.15],[0,1.25,-.015,.278,.177],[0,1.43,-.02,.29,.17],[0,1.51,-.025,.185,.13]],8,['#292f38','#e37b31','#fa903c','#e77a30']);
    rings(torso,[[0,.86,.005,.21,.144],[0,.94,.005,.222,.155],[0,.97,.005,.217,.15]],8,['#263039','#45474a']);
    for(const side of [-1,1]){
      torso.beam([side*.18,1.44,.132],[side*.145,1.01,.145],.071,.046,'#2e3b42');
      torso.beam([side*.18,1.45,-.13],[side*.13,1.00,-.139],.060,.044,'#384047');
      torso.box(side*.213,.92,.035,.083,.125,.12,'#45505b',[0,0,side*.12]);
      torso.box(side*.213,.945,.098,.082,.035,.018,'#5e6a6b');
    }
    // Rolled hood and a compact climbing pack.
    torso.rock(0,1.49,.085,.238,.112,.162,'#ff9f41',[.1,0,0],1);
    rings(torso,[[0,1.02,.172,.135,.055],[0,1.08,.203,.17,.083],[0,1.34,.21,.158,.088],[0,1.41,.183,.115,.066]],8,['#26333c','#374854','#465963']);
    torso.box(0,1.145,.282,.224,.131,.044,'#475861',[-.08,0,0]);torso.box(0,1.195,.31,.216,.021,.014,'#819393');
    torso.beam([-.074,1.326,.291],[0,1.243,.304],.024,.012,'#a6ebc2');torso.beam([0,1.243,.304],[.074,1.326,.291],.024,.012,'#a6ebc2');
    torso.box(-.145,1.19,.235,.032,.17,.045,'#d68d48');torso.box(.145,1.19,.235,.032,.17,.045,'#d68d48');
    for(const side of [-1,1]){
      torso.box(side*.162,1.34,.175,.054,.054,.032,'#819296',[.04,0,side*.1]);
      torso.box(side*.162,1.34,.197,.033,.023,.009,'#273840');
      torso.box(side*.095,1.05,.250,.032,.072,.032,'#25323a');torso.box(side*.095,1.069,.269,.035,.022,.012,'#aeb4a2');
    }
    // A faceted racing helmet, with a continuous visor and side fasteners.
    rings(torso,[[0,1.50,-.023,.09,.085],[0,1.565,-.023,.111,.10]],8,['#303940']);
    rings(torso,[[0,1.555,-.025,.132,.122],[0,1.63,-.03,.168,.157],[0,1.73,-.026,.181,.171],[0,1.814,-.02,.163,.154],[0,1.872,-.016,.091,.091],[0,1.879,-.016,.058,.056]],10,['#37434c','#e57b30','#f79b43','#ffa649','#f3953c']);
    torso.rock(0,1.676,-.145,.153,.088,.081,'#253b49',[0,0,0],1);
    torso.beam([-.12,1.70,-.179],[.12,1.70,-.179],.014,.014,'#72c9c5');
    for(const side of [-1,1]){
      torso.rock(side*.163,1.675,-.009,.04,.071,.067,'#35444c');torso.rock(side*.183,1.68,-.006,.024,.041,.044,'#667475');
    }
    torso.box(0,1.73,.139,.073,.053,.013,'#49545a',[.09,0,0]);
    for(const side of [-1,1]){
      torso.beam([side*.06,1.835,.103],[side*.108,1.751,.124],.025,.009,'#dc782f');
      torso.beam([side*.109,1.752,.124],[side*.147,1.723,.072],.025,.009,'#dc782f');
    }
    for(let i=0;i<3;i++)torso.box((i-1)*.024,1.73,.15,.013,.019,.008,'#aab9aa');
    body.add(torso.mesh());
    const legs=[],arms=[];
    for(const side of [-1,1]){
      const leg=new T.Group();leg.position.set(side*.13,.905,side*.042);leg.rotation.z=side*.047;leg.rotation.y=-side*.061;const l=new Shape();
      rings(l,[[0,-.44,0,.092,.102],[side*.014,-.32,.005,.11,.117],[0,-.11,.018,.13,.138],[0,.006,.005,.12,.12]],7,['#354651','#34434e','#3e4b53']);
      l.box(side*.083,-.21,.055,.073,.146,.137,'#4d5a60',[0,0,side*.06]);l.box(side*.09,-.164,.07,.08,.031,.125,'#627071');
      l.box(0,-.32,.031,.209,.042,.189,'#27333d',[.04,0,side*.04]);
      rings(l,[[0,-.775,.024,.075,.078],[0,-.67,.028,.085,.099],[0,-.50,.023,.103,.108],[0,-.42,.006,.09,.104]],7,['#25333e','#34424b','#3c4b54']);
      l.rock(0,-.43,-.082,.084,.10,.06,'#55636a');l.box(0,-.67,.113,.101,.026,.014,'#ef963e');
      rings(l,[[0,-.888,-.025,.105,.178],[0,-.847,-.027,.105,.179],[0,-.797,-.018,.099,.154],[0,-.742,.016,.076,.09]],8,['#272f36','#586166','#343e47']);
      leg.add(l.mesh());body.add(leg);legs.push(leg);
      const arm=new T.Group();arm.position.set(side*.264,1.412,-.002);const a=new Shape();
      const elbow=[side*.083,-.27,.002],wrist=[side*.14,-.432,-.145];
      a.rock(side*.02,-.081,0,.122,.157,.122,'#f7973f',[0,0,side*.19],1);
      a.beam([side*.029,-.11,0],elbow,.156,.169,'#d97b32');
      a.beam([side*.067,-.207,0],[side*.077,-.235,0],.158,.172,'#4c585b');
      a.rock(...elbow,.083,.085,.088,'#35434c');a.beam(elbow,wrist,.126,.136,'#364550');
      a.beam([side*.093,-.304,-.036],[side*.127,-.392,-.112],.139,.147,'#50606a');
      a.beam([side*.119,-.378,-.095],[side*.126,-.4,-.114],.14,.138,'#ee983f');
      a.rock(...wrist,.081,.097,.087,'#28343d',[.37,0,0],1);
      arm.add(a.mesh());body.add(arm);arms.push(arm);
    }
    const axe=pickaxe();axe.position.set(.154,-.19,-.179);axe.rotation.set(-.48,-.13,-.62);arms[1].add(axe);
    const plan=new Shape();plan.box(0,0,0,.48,.015,.34,'#286baf');
    for(let i=0;i<8;i++)plan.box(-.21+i*.06,.01,0,.002,.003,.31,'#75b4d8');
    for(let i=0;i<6;i++)plan.box(0,.01,-.15+i*.06,.45,.003,.002,'#75b4d8');
    for(const x of [-.15,0,.15])plan.box(x,.014,0,.007,.003,.21,'#c5e9ef');
    for(const z of [-.105,.105])plan.box(0,.014,z,.30,.003,.007,'#c5e9ef');
    const blueprint=plan.mesh();blueprint.position.set(.075,-.36,-.25);blueprint.rotation.set(1.08,-.13,.08);arms[1].add(blueprint);blueprint.visible=false;
    return {root,body,legs,arms,axe,blueprint};
  }
  const wood=['#a57548','#bb8750','#a77544','#ca955d','#96633b','#b6814b','#b7814c'];
  const boards=['#c48b72','#ab7563','#b77e69'], steel=['#829aa4','#6f8893','#96adb1'];
  function cellIndex(type,x,y,z){
    const bin=(v,n)=>Math.min(n-1,Math.max(0,Math.floor(v*n)));
    return type==='wall'?bin(y/rise,3)*3+bin((x+half)/tile,3):(z>=0?2:0)+(x>=0?1:0);
  }
  function roofHeight(x,z){
    return rise*.65*(1-Math.max(Math.abs(x),Math.abs(z))/half);
  }
  function roofQuarter(mask,visit){
    for(let row=0;row<2;row++)for(let col=0;col<2;col++){
      if(!(mask&(1<<(row*2+col))))visit(col?1:-1,row?1:-1);
    }
  }
  function buildHeight(type,mask,x,z){
    if(Math.abs(x)>half+.003||Math.abs(z)>half+.003||type==='wall')return -Infinity;
    if(mask&(1<<cellIndex(type,x,0,z)))return -Infinity;
    if(type==='roof')return roofHeight(x,z);
    return type==='ramp'?(half-z)*slope:0;
  }
  // These faces are shared by the blueprint, targeting and the material between the slats.
  function surfaceGeometry(type,mask=0){
    const s=new Shape(),white='#ffffff';
    function quad(a,b,c,d,ac=true){
      if(ac){s.tri(a,b,c,white);s.tri(a,c,d,white);}else{s.tri(a,b,d,white);s.tri(b,c,d,white);}
    }
    if(type==='roof'){
      roofQuarter(mask,(sx,sz)=>{
        quad([0,roofHeight(0,0),0],[sx*half,0,0],[sx*half,0,sz*half],[0,0,sz*half]);
      });
    }else{
      const wall=type==='wall',n=wall?3:2;
      for(let row=0;row<n;row++)for(let col=0;col<n;col++){
        if(mask&(1<<(row*n+col)))continue;
        const x0=-half+col*tile/n,x1=x0+tile/n,z0=-half+row*tile/n,z1=z0+tile/n;
        if(wall){const y0=row*rise/n,y1=(row+1)*rise/n;quad([x0,y0,0],[x1,y0,0],[x1,y1,0],[x0,y1,0]);}
        else{const y=z=>type==='ramp'?(half-z)*slope:0;quad([x0,y(z0),z0],[x1,y(z0),z0],[x1,y(z1),z1],[x0,y(z1),z1]);}
      }
    }
    const g=s.mesh().geometry,pos=g.attributes.position,uv=[];
    for(let i=0;i<pos.count;i++)uv.push(pos.getX(i)/tile+.5,type==='wall'?pos.getY(i)/rise:pos.getZ(i)/tile+.5);
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));return g;
  }
  function structure(type,material=0,mask=0){
    const s=new Shape(),wall=type==='wall',timber=material===0,palette=timber?wood:material===1?boards:steel;
    const color=i=>palette[i%palette.length],trim=timber?'#996b40':material===1?'#966856':'#57717d';
    if(wall){
      const w=tile/3,h=rise/3,filled=(row,col)=>row>=0&&row<3&&col>=0&&col<3&&!(mask&(1<<(row*3+col)));
      for(let col=0;col<3;col++){
        const left=-half+col*w;
        for(let row=0;row<3;row++){
          if(!filled(row,col))continue;
          const bottom=row*h;
          if(!timber){
            const courses=material===1?3:1;
            for(let i=0;i<courses;i++)for(let j=0;j<2;j++)s.box(left+(j+.5)*w/2,bottom+(i+.5)*h/courses,0,w/2-.025,h/courses-.023,.13,color(col+j+row+i));
          }
          if(!filled(row-1,col))s.box(left+w*.5,bottom+.055,.014,w,.12,.15,trim);
          if(!filled(row+1,col))s.box(left+w*.5,bottom+h-.065,.014,w,.14,.15,color(col+2));
          if(!filled(row,col-1))s.box(left+.055,bottom+h*.5,0,.12,h,.15,trim);
          if(!filled(row,col+1))s.box(left+w-.055,bottom+h*.5,0,.12,h,.15,trim);
          if(!timber||filled(row-1,col))continue;
          let end=row+1;while(filled(end,col))end++;
          const top=end*h;
          for(let j=0;j<3;j++){
            const seed=col*3+j,x=left+w*[[.12,.42,.80],[.14,.55,.75],[.10,.31,.83]][col][j],lean=[.07,-.045,.025,-.065,.06][seed%5];
            s.beam([x-lean,bottom+.04,0],[x+lean,top-.045,0],tile*[.035,.054,.039,.048][seed%4],.115,color(seed));
          }
        }
      }
    }else if(type==='floor'||type==='ramp'){
      const ramp=type==='ramp',angle=ramp?incline:0,length=ramp?Math.hypot(1,slope):1,y=z=>ramp?(half-z)*slope:0;
      // Long planks span the full width. Edits break them only at a removed quadrant.
      for(let i=0;i<10;i++){
        const z=(-.483+i*.1074+[0,.006,-.013,.009,-.004][i%5])*tile,row=z<0?0:1;
        for(let col=0;col<2;col++){
          if(mask&(1<<(row*2+col)))continue;
          const start=-half+col*half;
          if(col===0&&!(mask&(1<<(row*2+1))))col++;
          const end=-half+(col+1)*half;
          const width=end-start,depth=timber?tile*[.028,.035,.050,.032,.029][i%5]:tile*.104;
          s.box((start+end)/2,y(z)-.052,z,width-.012,.105,depth*length,color(i+row),[angle,0,timber?(i%3-1)*.004:0]);
        }
      }
      for(let row=0;row<2;row++)for(let col=0;col<2;col++){
        if(mask&(1<<(row*2+col)))continue;
        const z0=-half+row*half,z1=z0+half,x0=-half+col*half;
        for(const x of [x0+.055,x0+half-.055])s.beam([x,y(z0)-.15,z0],[x,y(z1)-.15,z1],.09,.12,trim);
        const a=col===0?.85:.15,b=col===0?.26:.74;
        s.beam([x0+half*(a+(b-a)*row*.5),y(z0)-.17,z0],[x0+half*(a+(b-a)*(row+1)*.5),y(z1)-.17,z1],.09,.10,color(row+col));
      }
    }else{
      const beam=(x0,z0,x1,z1,w,c)=>s.beam([x0,roofHeight(x0,z0)-.045,z0],[x1,roofHeight(x1,z1)-.045,z1],w,.12,c);
      roofQuarter(mask,(sx,sz)=>{
        for(let i=0;i<6;i++){
          const d=half*(1-i*.174),x=sx*d,z=sz*d,w=i===0?.17:.15;
          beam(0,z,x,z,w,color(i));beam(x,z,x,0,w,color(i+1));
        }
        beam(sx*half,sz*half,0,0,.13,trim);
      });
      if(!timber){
        const face=surfaceGeometry(type,mask);s.geo(face,0,-.075,0,1,1,1,color(0));face.dispose();
      }
    }
    const mesh=s.mesh(timber?woodMaterial():surface);
    if(timber){
      const g=mesh.geometry,pos=g.attributes.position,normal=g.attributes.normal,uv=[];
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
        if(wall)uv.push(y*.53,x*1.3+z*.6);else uv.push(x*.6+z*.05,(Math.abs(normal.getY(i))<.3?y:z)*1.35);
      }g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    }
    return mesh;
  }
  return {T,tile,half,rise,slope,incline,vec,Shape,random,avatar,structure,pickaxe,surface,woodMaterial,surfaceGeometry,buildHeight,cellIndex};
})();
