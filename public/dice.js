// Нижний Край: 3D-кубики на столе лича. three.js r128 + cannon.js 0.6.2 (классические скрипты).
// window.NKDice.init(canvas, onResult) → { DICE, select(i), selected(), chargeStart(), chargeEnd(), throwNow(power), step(now, dt), busy() }
(function(){
'use strict';
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var charging=false,chargeT0=0,power=0,selIdx=5,dice3d=null,onDieResult=function(){},onPower=function(){};
var PHI=(1+Math.sqrt(5))/2;
function v3sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function v3dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function v3cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function v3len(a){return Math.sqrt(v3dot(a,a))}
function v3nrm(a){var l=v3len(a)||1;return [a[0]/l,a[1]/l,a[2]/l]}
function hullFaces(V){
  var faces=[],eps=1e-4,n=V.length;
  for(var i=0;i<n;i++)for(var j=i+1;j<n;j++)for(var k=j+1;k<n;k++){
    var nm=v3cross(v3sub(V[j],V[i]),v3sub(V[k],V[i])); if(v3len(nm)<eps) continue; nm=v3nrm(nm);
    var d=v3dot(nm,V[i]),pos=0,neg=0,on=[];
    for(var m=0;m<n;m++){var s=v3dot(nm,V[m])-d; if(s>eps)pos++; else if(s<-eps)neg++; else on.push(m);}
    if(pos&&neg) continue; if(pos){nm=[-nm[0],-nm[1],-nm[2]];}
    if(faces.some(function(f){return v3dot(f.n,nm)>0.9999})) continue;
    var c=[0,0,0]; on.forEach(function(q){c[0]+=V[q][0]/on.length;c[1]+=V[q][1]/on.length;c[2]+=V[q][2]/on.length;});
    var u=v3nrm(v3sub(V[on[0]],c)), w=v3cross(nm,u);
    (function(c,u,w){ on.sort(function(a,b){var pa=v3sub(V[a],c),pb=v3sub(V[b],c);return Math.atan2(v3dot(pa,w),v3dot(pa,u))-Math.atan2(v3dot(pb,w),v3dot(pb,u));}); })(c,u,w);
    faces.push({idx:on,n:nm,c:c});
  }
  return faces;
}
var SH={};
SH.d4=[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]];
SH.d6=[];[-1,1].forEach(function(x){[-1,1].forEach(function(y){[-1,1].forEach(function(z){SH.d6.push([x,y,z])})})});
SH.d8=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
SH.d10=[];(function(){var h=1-2/Math.sqrt(5);for(var i=0;i<10;i++){var a=i*Math.PI/5;SH.d10.push([Math.cos(a),h*(i%2?1:-1),Math.sin(a)]);}SH.d10.push([0,1,0],[0,-1,0]);})();
SH.d12=SH.d6.slice();[-1,1].forEach(function(a){[-1,1].forEach(function(b){SH.d12.push([0,a/PHI,b*PHI],[a/PHI,b*PHI,0],[a*PHI,0,b/PHI])})});
SH.d20=[];[-1,1].forEach(function(a){[-1,1].forEach(function(b){SH.d20.push([0,a,b*PHI],[a,b*PHI,0],[a*PHI,0,b])})});
var DICE=[
 {id:'d4', sides:4, r:1.25,color:'#1b1613'},
 {id:'d6', sides:6, r:1.15,color:'#1b1613'},
 {id:'d8', sides:8, r:1.15,color:'#1b1613'},
 {id:'d10',sides:10,r:1.2, color:'#1b1613'},
 {id:'d12',sides:12,r:1.15,color:'#1b1613'},
 {id:'d20',sides:20,r:1.25,color:'#1b1613'}
];
function initDice(glc){
  if(typeof THREE==='undefined'||typeof CANNON==='undefined') return null;
  var renderer;
  try{ renderer=new THREE.WebGLRenderer({canvas:glc,alpha:true,antialias:true}); }catch(e){ return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  var scene=new THREE.Scene();
  var cam=new THREE.PerspectiveCamera(40,1440/1075,0.1,100);
  cam.position.set(0,11,12); cam.lookAt(0,3.8,0);
  scene.add(new THREE.HemisphereLight(0xcfc6ff,0x2a1a12,0.75));
  var sun=new THREE.DirectionalLight(0xffd9a0,0.75); sun.position.set(7,13,5); sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left=-10; sun.shadow.camera.right=10; sun.shadow.camera.top=8; sun.shadow.camera.bottom=-8; sun.shadow.camera.far=40;
  scene.add(sun);
  var rim=new THREE.PointLight(0x62ecd0,0.5,30); rim.position.set(-6,5,4); scene.add(rim);
  var floor=new THREE.Mesh(new THREE.PlaneGeometry(40,20),new THREE.ShadowMaterial({opacity:0.45}));
  floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);

  var world=new CANNON.World(); world.gravity.set(0,-34,0); world.allowSleep=true; world.solver.iterations=14;
  var mDie=new CANNON.Material('die'), mFloor=new CANNON.Material('floor');
  world.addContactMaterial(new CANNON.ContactMaterial(mFloor,mDie,{friction:0.32,restitution:0.38}));
  function plane(px_,py,pz,axis,ang){
    var b=new CANNON.Body({mass:0,material:mFloor}); b.addShape(new CANNON.Plane());
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(axis[0],axis[1],axis[2]),ang); b.position.set(px_,py,pz); world.addBody(b);
  }
  plane(0,0,0,[1,0,0],-Math.PI/2);          // стол
  plane(-4.4,0,0,[0,1,0],Math.PI/2);        // левая стенка
  plane(5.4,0,0,[0,1,0],-Math.PI/2);        // правая
  plane(0,0,-1.3,[0,1,0],0);                // дальняя
  plane(0,0,2.0,[0,1,0],Math.PI);           // ближняя

  var texCache={};
  function tex(t){
    if(texCache[t]) return texCache[t];
    var c=document.createElement('canvas'); c.width=c.height=128; var x=c.getContext('2d');
    x.font='bold 84px "Trebuchet MS", Verdana, Arial, sans-serif'; x.textAlign='center'; x.textBaseline='middle';
    x.lineWidth=10; x.strokeStyle='rgba(20,10,30,.85)'; x.strokeText(t,64,66);
    x.fillStyle='#f3ecd4'; x.fillText(t,64,66);
    if(t==='6'||t==='9'){ x.fillRect(40,112,48,9); }
    var tx=new THREE.CanvasTexture(c); tx.anisotropy=4; texCache[t]=tx; return tx;
  }
  function label(group,text,size,center,n,up){
    var m=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshBasicMaterial({map:tex(String(text)),transparent:true,depthWrite:false}));
    var N=new THREE.Vector3(n[0],n[1],n[2]), U=new THREE.Vector3(up[0],up[1],up[2]).normalize(), R=new THREE.Vector3().crossVectors(U,N);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(R,U,N));
    m.position.set(center[0]+n[0]*0.015,center[1]+n[1]*0.015,center[2]+n[2]*0.015);
    group.add(m);
  }
  var built={};
  function build(def){
    if(built[def.id]) return built[def.id];
    var raw=SH[def.id], R0=0; raw.forEach(function(v){R0=Math.max(R0,v3len(v))});
    var V=raw.map(function(v){return [v[0]/R0*def.r,v[1]/R0*def.r,v[2]/R0*def.r]});
    var F=hullFaces(V), k=1;
    F.forEach(function(f){ if(f.num) return; f.num=k; var op=null; F.forEach(function(g2){ if(v3dot(g2.n,f.n)<-0.999) op=g2; }); if(op) op.num=def.sides+1-k; k++; });
    var pos=[];
    F.forEach(function(f){ for(var i=1;i<f.idx.length-1;i++){ [f.idx[0],f.idx[i],f.idx[i+1]].forEach(function(q){pos.push(V[q][0],V[q][1],V[q][2])}); } });
    var geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.computeVertexNormals();
    var group=new THREE.Group();
    var mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:def.color,flatShading:true,roughness:0.6,metalness:0.05,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
    mesh.castShadow=true; group.add(mesh);
    var edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo,1),new THREE.LineBasicMaterial({color:0xfff2d0,transparent:true,opacity:0.22}));
    group.add(edges);
    F.forEach(function(f){
      var inr=1e9; for(var i=0;i<f.idx.length;i++){ var a=V[f.idx[i]], b=V[f.idx[(i+1)%f.idx.length]], e=v3nrm(v3sub(b,a)), ca=v3sub(f.c,a); inr=Math.min(inr,v3len(v3sub(ca,[e[0]*v3dot(ca,e),e[1]*v3dot(ca,e),e[2]*v3dot(ca,e)]))); }
      if(def.id==='d4'){
        f.idx.forEach(function(q){ var dir=v3sub(V[q],f.c); label(group,q+1,inr*0.95,[f.c[0]+dir[0]*0.5,f.c[1]+dir[1]*0.5,f.c[2]+dir[2]*0.5],f.n,dir); });
      }else{
        var top=f.idx[0]; if(def.id==='d10'){ f.idx.forEach(function(q){ if(Math.abs(V[q][1])>Math.abs(V[top][1])) top=q; }); }
        var up=v3sub(V[top],f.c); if(def.id==='d10') up=[-up[0],-up[1],-up[2]];
        label(group,f.num,inr*(def.sides>=10?1.25:1.3),f.c,f.n,up);
      }
    });
    var shape=new CANNON.ConvexPolyhedron(V.map(function(v){return new CANNON.Vec3(v[0],v[1],v[2])}),F.map(function(f){return f.idx.slice()}));
    built[def.id]={def:def,V:V,F:F,group:group,shape:shape};
    return built[def.id];
  }

  var cur3=null, body=null, api={rolling:false}, rollT0=0, restPos=new THREE.Vector3(3.4,0,0.5);
  api.show=function(def){
    if(cur3) scene.remove(cur3.group);
    if(body){ world.remove(body); body=null; }
    cur3=build(def); scene.add(cur3.group);
    cur3.group.position.set(restPos.x,def.r+0.25,restPos.z);
    cur3.group.rotation.set(0.5,0.6,0.2);
    api.rolling=false; api.idle=true;
  };
  api.throwDie=function(p){
    if(!cur3) return;
    if(body){ world.remove(body); }
    body=new CANNON.Body({mass:1,material:mDie}); body.addShape(cur3.shape);
    body.position.set(4.0,2.8+p*1.2,-0.2+Math.random()*1.2);
    var q=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random()*6,Math.random()*6,Math.random()*6));
    body.quaternion.set(q.x,q.y,q.z,q.w);
    body.velocity.set(-(6+15*p),2.5+3.5*p,(Math.random()-0.5)*5);
    var sp=9+18*p; body.angularVelocity.set((Math.random()-0.5)*2*sp,(Math.random()-0.5)*2*sp,(Math.random()-0.5)*2*sp);
    body.allowSleep=true; body.sleepSpeedLimit=0.3; body.sleepTimeLimit=0.35;
    body.linearDamping=0.08; body.angularDamping=0.12;
    world.addBody(body);
    api.rolling=true; api.idle=false; rollT0=performance.now();
  };
  function readResult(){
    var q=cur3.group.quaternion, best=-2, val=1, v=new THREE.Vector3();
    if(cur3.def.id==='d4'){
      cur3.V.forEach(function(p,i){ v.set(p[0],p[1],p[2]).applyQuaternion(q); if(v.y>best){best=v.y;val=i+1;} });
    }else{
      cur3.F.forEach(function(f){ v.set(f.n[0],f.n[1],f.n[2]).applyQuaternion(q); if(v.y>best){best=v.y;val=f.num;} });
    }
    return val;
  }
  var lastW=0,lastH=0;
  api.step=function(now,dt){
    var w=glc.clientWidth,h=glc.clientHeight;
    if(w&&h&&(w!==lastW||h!==lastH)){ lastW=w;lastH=h; renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); }
    if(!cur3) return;
    if(charging){
      var sh=0.04+power*0.16;
      cur3.group.position.set(4.6+(Math.random()-0.5)*sh,2.8+power*1.2+(Math.random()-0.5)*sh,1.1+(Math.random()-0.5)*sh);
      cur3.group.rotation.x+=dt*(2+power*14); cur3.group.rotation.y+=dt*(3+power*10);
    }else if(api.rolling&&body){
      world.step(1/60,dt,4);
      cur3.group.position.set(body.position.x,body.position.y,body.position.z);
      cur3.group.quaternion.set(body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w);
      var slow=body.velocity.length()<0.08&&body.angularVelocity.length()<0.12;
      if(now-rollT0>500&&(body.sleepState===CANNON.Body.SLEEPING||(slow&&now-rollT0>900)||now-rollT0>7000)){
        api.rolling=false; onDieResult(cur3.def,readResult());
      }
    }else if(api.idle&&!reduce){
      cur3.group.rotation.y+=dt*0.5;
    }
    renderer.render(scene,cam);
  };
  api._debug=function(){ return {rolling:api.rolling,y:body?body.position.y:null}; };
  return api;
}

window.NKDice={
  DICE:DICE,
  init:function(canvas,cb,powerCb){
    onDieResult=cb||onDieResult; onPower=powerCb||onPower;
    try{ dice3d=initDice(canvas); }catch(e){ dice3d=null; }
    if(dice3d) dice3d.show(DICE[selIdx]);
    return !!dice3d;
  },
  selected:function(){ return selIdx; },
  busy:function(){ return charging||!!(dice3d&&dice3d.rolling); },
  select:function(i){
    if(this.busy()) return false;
    selIdx=((i%DICE.length)+DICE.length)%DICE.length;
    if(dice3d) dice3d.show(DICE[selIdx]);
    return true;
  },
  chargeStart:function(){ if(this.busy()) return; charging=true; chargeT0=performance.now(); },
  chargeEnd:function(){ if(!charging) return; charging=false; var p=power; power=0; onPower(0); this.throwNow(p); },
  throwNow:function(p){
    var def=DICE[selIdx];
    if(dice3d) dice3d.throwDie(Math.max(0,Math.min(1,p)));
    else setTimeout(function(){ onDieResult(def,1+Math.floor(Math.random()*def.sides)); },500);
  },
  step:function(now,dt){
    if(charging){ var tt=(now-chargeT0)/1000*1.1, ph=tt%2; power=ph<1?ph:2-ph; onPower(power); }
    if(dice3d) dice3d.step(now,dt);
  }
};
})();
