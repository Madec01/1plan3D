import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Window} from 'happy-dom';
import {FreeNavigation,perspectiveFromOrtho,orthographicFromPerspective,accessiblePivotPosition,gizmoSizeForPixels,keyboardCameraFrame} from '../src/camera-navigation.js';

function setup(pickPoint,options={}){
 const window=new Window(),canvas=window.document.createElement('canvas');window.document.body.append(canvas);
 canvas.getBoundingClientRect=()=>({left:30,top:20,height:600,width:800});
 const captures=new Set();canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);
 const camera=new THREE.PerspectiveCamera(50,4/3,.005,2000);camera.position.set(0,2,8);camera.lookAt(0,2,0);camera.updateMatrixWorld();
 let moved=0;const nav=new FreeNavigation(camera,canvas,()=>moved++,{pickPoint,...options});nav.enabled=true;
 const pointer=(type,x,y,button=0,extra={})=>canvas.dispatchEvent(new window.PointerEvent(type,{clientX:x,clientY:y,button,pointerId:1,bubbles:true,cancelable:true,...extra}));
 // Happy DOM ne dérive pas encore WheelEvent de MouseEvent : fournir les champs navigateur.
 const wheel=(deltaY,x=670,y=200,extra={})=>{const e=new window.WheelEvent('wheel',{deltaY,cancelable:true,...extra});Object.assign(e,{clientX:x,clientY:y,shiftKey:false,...extra});return canvas.dispatchEvent(e)};
 return {window,canvas,camera,nav,captures,pointer,wheel,get moved(){return moved},async close(){nav.dispose();await window.happyDOM.close()}};
}
const near=(a,b,eps=1e-8)=>assert.ok(a.distanceTo(b)<eps,`${a.toArray()} ≠ ${b.toArray()}`);
const screen=(point,camera)=>point.clone().project(camera).setZ(0);
const plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);

test('caméra libre : déplacement sans rotation, clic sélection, arrêt et désactivation',async()=>{
 const t=setup(),{camera,nav,pointer,wheel,window,captures}=t;
 const q=camera.quaternion.clone(),start=camera.position.clone();pointer('pointerdown',100,100);pointer('pointermove',180,120);pointer('pointerup',180,120);
 assert.ok(camera.position.distanceTo(start)>.5);assert.ok(camera.quaternion.angleTo(q)<1e-10);assert.equal(nav.drag,null);
 const still=camera.position.clone();nav.enabled=false;wheel(-100);pointer('pointerdown',100,100,2);pointer('pointermove',200,200,2);near(camera.position,still);
 nav.enabled=true;pointer('pointerdown',100,100);pointer('pointermove',120,100);window.dispatchEvent(new window.Event('blur'));assert.equal(nav.drag,null);assert.equal(captures.size,0);
 const clicks=t.moved;pointer('pointerdown',100,100);pointer('pointermove',101,101);pointer('pointerup',101,101);assert.equal(t.moved,clicks,'un clic reste une sélection');
 await t.close();
});

test('molette : point décentré stable à l’écran, rapprochement, recul et pas de traversée',async()=>{
 let target;const t=setup(ray=>target||(target=ray.intersectPlane(plane,new THREE.Vector3()))),{camera,nav,wheel}=t;
 const p=nav.pointAt(670,200),projection=screen(p,camera),distance=camera.position.distanceTo(p),q=camera.quaternion.clone();
 wheel(-100);near(screen(p,camera),projection);assert.ok(camera.position.distanceTo(p)<distance);assert.ok(camera.position.x>0,'zoom vers le curseur à droite');assert.ok(camera.quaternion.angleTo(q)<1e-10);
 wheel(100);assert.ok(Math.abs(camera.position.distanceTo(p)-distance)<1e-8);near(screen(p,camera),projection);
 for(let i=0;i<150;i++)wheel(-100);
 assert.ok(p.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()))>=camera.near*4-1e-9,'la surface reste devant le plan proche');near(screen(p,camera),projection);
 await t.close();
});

test('clic droit : pivot au curseur, pas de recentrage, distance constante, nouveau pivot à chaque geste',async()=>{
 let picks=0;const t=setup(ray=>{picks++;return ray.intersectPlane(plane,new THREE.Vector3())}),{camera,nav,pointer}=t;
 const pos=camera.position.clone();pointer('pointerdown',670,200,2);const pivot=nav.drag.pivot.clone(),projection=screen(pivot,camera),distance=pivot.distanceTo(camera.position);
 near(camera.position,pos);pointer('pointermove',730,230,2);pointer('pointermove',740,250,2);
 assert.equal(picks,1,'le pivot est figé pendant le geste');near(screen(pivot,camera),projection);assert.ok(Math.abs(pivot.distanceTo(camera.position)-distance)<1e-8);assert.ok(camera.position.distanceTo(pos)>.1);
 pointer('pointerup',740,250,2);pointer('pointerdown',300,340,2);assert.equal(picks,2);assert.ok(nav.drag.pivot.distanceTo(pivot)>.1);pointer('pointerup',300,340,2);
 await t.close();
});

test('vide : zoom dans le rayon du curseur et rotation possible sans objet ni centre global',async()=>{
 const t=setup(),{camera,nav,pointer,wheel}=t;
 const point=nav.pointAt(670,200),ray=point.clone().sub(camera.position).normalize(),start=camera.position.clone();wheel(-100);const delta=camera.position.clone().sub(start);assert.ok(delta.normalize().dot(ray)>.999999);
 pointer('pointerdown',670,200,2);const p=nav.drag.pivot.clone(),s=screen(p,camera);pointer('pointermove',700,180,2);near(screen(p,camera),s);pointer('pointerup',700,180,2);
 for(let i=0;i<200;i++)wheel(-100);assert.ok(camera.position.toArray().every(Number.isFinite));assert.ok(camera.position.distanceTo(start)>40,'déplacement possible sans butée liée au centre du projet');
 await t.close();
});

test('Maj + molette est plus fin ; boutons zooment au centre ; Maj + clic droit déplace',async()=>{
 const t=setup(ray=>ray.intersectPlane(plane,new THREE.Vector3())),{camera,nav,wheel,pointer}=t;
 const start=camera.position.clone();wheel(-100);const normal=camera.position.distanceTo(start);camera.position.copy(start);wheel(-100,670,200,{shiftKey:true});assert.ok(camera.position.distanceTo(start)<normal*.2);
 camera.position.copy(start);nav.zoom(1.2);assert.ok(camera.position.z<start.z);assert.ok(Math.abs(camera.position.x-start.x)<1e-10);
 const q=camera.quaternion.clone();pointer('pointerdown',670,200,2,{shiftKey:true});pointer('pointermove',710,200,2,{shiftKey:true});pointer('pointerup',710,200,2);assert.ok(q.angleTo(camera.quaternion)<1e-10);
 await t.close();
});

test('passage orthographique vers libre : orientation et échelle au niveau de la structure',()=>{
 const ortho=new THREE.OrthographicCamera(-8,8,6,-6,.01,1000),persp=new THREE.PerspectiveCamera(50,4/3,.005,1000),target=new THREE.Vector3(2,1,0);
 ortho.position.set(6,5,10);ortho.lookAt(target);ortho.zoom=2;ortho.updateMatrixWorld();
 perspectiveFromOrtho(ortho,persp,target);
 assert.ok(persp.quaternion.angleTo(ortho.quaternion)<1e-7);
 const visibleHalfHeight=persp.position.distanceTo(target)*Math.tan(THREE.MathUtils.degToRad(persp.fov/2));assert.ok(Math.abs(visibleHalfHeight-3)<1e-9);
});

test('outil au clic : le bouton gauche reste réservé, tandis que molette et navigation droite fonctionnent',async()=>{
 const t=setup(ray=>ray.intersectPlane(plane,new THREE.Vector3())),{camera,nav,pointer,wheel}=t;nav.leftEnabled=false;
 const position=camera.position.clone(),q=camera.quaternion.clone();pointer('pointerdown',400,300);pointer('pointermove',450,330);pointer('pointerup',450,330);near(camera.position,position);assert.equal(nav.drag,null);
 wheel(-100);assert.ok(camera.position.distanceTo(position)>.1);pointer('pointerdown',400,300,2);pointer('pointermove',430,320,2);pointer('pointerup',430,320,2);assert.ok(camera.quaternion.angleTo(q)>.01);
 nav.leftEnabled=true;pointer('pointerdown',400,300);assert.ok(nav.drag);pointer('pointerup',400,300);await t.close();
});

const finger=(t,type,id,x,y)=>t.pointer(type,x,y,0,{pointerId:id,pointerType:'touch'});
const fingerScreen=(x,y)=>new THREE.Vector3((x-30)/800*2-1,-(y-20)/600*2+1,0);

test('tactile : un tap reste sélectionnable, un glissement déplace sans rotation ni touche clavier',async()=>{
 const calls=[],t=setup(ray=>ray.intersectPlane(plane,new THREE.Vector3()),{onGestureStart:e=>calls.push('start:'+e.pointerType),onGestureEnd:e=>calls.push('end:'+e.pointerType)});
 try{
  const {nav,camera}=t,start=camera.position.clone(),q=camera.quaternion.clone();
  finger(t,'pointerdown',11,300,250);finger(t,'pointermove',11,301,251);finger(t,'pointerup',11,301,251);
  near(camera.position,start);assert.equal(t.moved,0);assert.equal(nav.wasTouchGesture(11),false);assert.deepEqual(calls,[]);
  const anchor=nav.pointAt(300,250);
  finger(t,'pointerdown',11,300,250);assert.equal(nav.touchActive,true);
  finger(t,'pointermove',11,380,280);near(screen(anchor,camera),fingerScreen(380,280));
  assert.ok(camera.quaternion.angleTo(q)<1e-10);assert.equal(nav.touchNavigating,true);assert.equal(nav.wasTouchGesture(11),true);
  finger(t,'pointerup',11,380,280);assert.equal(nav.touchActive,false);assert.equal(nav.touchNavigating,false);assert.equal(t.captures.size,0);
  assert.deepEqual(calls,['start:touch','end:touch']);assert.ok(t.moved>=2,'la fin du geste renouvelle la suppression de sélection');
 }finally{await t.close()}
});

test('tactile : rotation explicite autour du doigt, sans recentrage au début',async()=>{
 const t=setup(ray=>ray.intersectPlane(plane,new THREE.Vector3()));
 try{
  const {nav,camera}=t;assert.equal(nav.setTouchMode('rotate'),'rotate');
  const start=camera.position.clone();finger(t,'pointerdown',12,670,200);const pivot=nav.pointAt(670,200),projection=screen(pivot,camera),distance=pivot.distanceTo(camera.position);
  near(camera.position,start);finger(t,'pointermove',12,720,230);
  near(screen(pivot,camera),projection);assert.ok(Math.abs(pivot.distanceTo(camera.position)-distance)<1e-8);
  const rotated=camera.position.clone(),q=camera.quaternion.clone();nav.setTouchMode('pan');near(camera.position,rotated);
  finger(t,'pointermove',12,740,230);assert.ok(camera.quaternion.angleTo(q)<1e-10);finger(t,'pointerup',12,740,230);
 }finally{await t.close()}
});

test('pinch : le point initial suit le centroïde pendant zoom et déplacement combinés',async()=>{
 const t=setup(ray=>ray.intersectPlane(plane,new THREE.Vector3()));
 try{
  const {nav,camera}=t,q=camera.quaternion.clone(),start=camera.position.clone(),anchor=nav.pointAt(400,250),depth=anchor.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()));
  finger(t,'pointerdown',21,300,250);finger(t,'pointerdown',22,500,250);near(camera.position,start);
  assert.equal(nav.touchNavigating,true);assert.equal(nav.wasTouchGesture(21),true);assert.equal(nav.wasTouchGesture(22),true);
  finger(t,'pointermove',22,600,300);
  near(screen(anchor,camera),fingerScreen(450,275));
  const nextDepth=anchor.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()));
  assert.ok(Math.abs(nextDepth-depth*200/Math.hypot(300,50))<1e-8);
  finger(t,'pointermove',21,250,200);near(screen(anchor,camera),fingerScreen(425,250));
  finger(t,'pointermove',21,300,250);finger(t,'pointermove',22,500,250);
  near(camera.position,start);near(screen(anchor,camera),fingerScreen(400,250));assert.ok(q.angleTo(camera.quaternion)<1e-10);
  finger(t,'pointerup',21,300,250);finger(t,'pointerup',22,500,250);
 }finally{await t.close()}
});

test('passages un → deux → trois → un doigts : aucune position rejouée ni faux tap',async()=>{
 const calls=[],t=setup(ray=>ray.intersectPlane(plane,new THREE.Vector3()),{onGestureStart:()=>calls.push('start'),onGestureEnd:()=>calls.push('end')});
 try{
  const {nav,camera}=t;
  finger(t,'pointerdown',31,300,250);finger(t,'pointermove',31,330,270);
  let position=camera.position.clone();finger(t,'pointerdown',32,550,320);near(camera.position,position);
  finger(t,'pointermove',32,580,340);position=camera.position.clone();finger(t,'pointerdown',33,650,450);near(camera.position,position);
  finger(t,'pointermove',33,680,450);near(camera.position,position);
  finger(t,'pointerup',31,330,270);near(camera.position,position);
  finger(t,'pointerup',33,680,450);near(camera.position,position);
  finger(t,'pointermove',32,580,340);near(camera.position,position);
  finger(t,'pointermove',32,590,340);assert.ok(camera.position.distanceTo(position)>0.01);
  finger(t,'pointerup',32,590,340);
  assert.deepEqual(calls,['start','end']);assert.ok([31,32,33].every(id=>nav.wasTouchGesture(id)));assert.equal(t.captures.size,0);
  const moved=t.moved;finger(t,'pointerdown',31,300,250);finger(t,'pointerup',31,300,250);assert.equal(t.moved,moved);assert.equal(nav.wasTouchGesture(31),false,'un nouveau tap ne réutilise pas le geste précédent');
 }finally{await t.close()}
});

test('deux contacts immobiles empêchent les clics même si le dernier doigt est relâché plus tard',async()=>{
 const t=setup();
 try{
  const start=t.camera.position.clone();finger(t,'pointerdown',41,300,250);finger(t,'pointerdown',42,500,250);
  assert.ok(t.moved>0);near(t.camera.position,start);
  finger(t,'pointerup',42,500,250);const moved=t.moved;
  finger(t,'pointerup',41,300,250);assert.ok(t.moved>moved);assert.ok(t.nav.wasTouchGesture(41));assert.ok(t.nav.wasTouchGesture(42));near(t.camera.position,start);
 }finally{await t.close()}
});

test('annulation tactile, perte de capture, blur et désactivation libèrent tous les pointeurs',async()=>{
 for(const reason of ['pointercancel','lostpointercapture','blur','disabled']){
  const calls=[],t=setup(undefined,{onGestureStart:()=>calls.push('start'),onGestureEnd:()=>calls.push('end')});
  try{
   finger(t,'pointerdown',51,300,250);finger(t,'pointerdown',52,500,250);finger(t,'pointermove',52,550,250);
   if(reason==='blur')t.window.dispatchEvent(new t.window.Event('blur'));
   else if(reason==='disabled')t.nav.enabled=false;
   else finger(t,reason,51,300,250);
   assert.equal(t.nav.touchActive,false,reason);assert.equal(t.nav.touchNavigating,false);assert.equal(t.captures.size,0);assert.deepEqual(calls,['start','end']);
   const stopped=t.camera.position.clone();finger(t,'pointermove',52,600,400);finger(t,'pointerup',52,600,400);near(t.camera.position,stopped);
   assert.ok(t.nav.wasTouchGesture(51));assert.ok(t.nav.wasTouchGesture(52));
  }finally{await t.close()}
 }
});

test('outil tactile : pan optionnel, longpress réservé, pinch toujours disponible',async()=>{
 const t=setup(ray=>ray.intersectPlane(plane,new THREE.Vector3()));
 try{
  const {nav,camera}=t;nav.leftEnabled=false;let start=camera.position.clone();
  finger(t,'pointerdown',61,300,250);finger(t,'pointermove',61,350,250);near(camera.position,start);finger(t,'pointerup',61,350,250);
  nav.touchEnabledDuringTool=true;finger(t,'pointerdown',61,300,250);finger(t,'pointermove',61,350,250);assert.ok(camera.position.distanceTo(start)>.1);assert.equal(nav.reserveTouch(61),false,'un geste commencé ne devient pas longpress');finger(t,'pointerup',61,350,250);
  start=camera.position.clone();finger(t,'pointerdown',61,300,250);assert.equal(nav.reserveTouch(61),true);finger(t,'pointermove',61,340,260);near(camera.position,start);
  finger(t,'pointerup',61,340,260);assert.equal(nav.wasTouchGesture(61),false,'le viseur longpress peut confirmer une sélection');
  finger(t,'pointerdown',61,340,260);assert.equal(nav.reserveTouch(61),true);
  finger(t,'pointerdown',62,550,260);near(camera.position,start);finger(t,'pointermove',62,600,260);assert.ok(camera.position.distanceTo(start)>.1);
  finger(t,'pointerup',62,600,260);finger(t,'pointerup',61,340,260);assert.ok(nav.wasTouchGesture(61));assert.ok(nav.wasTouchGesture(62));
  const still=camera.position.clone();t.pointer('pointerdown',300,250);t.pointer('pointermove',350,250);t.pointer('pointerup',350,250);near(camera.position,still);
 }finally{await t.close()}
});

test('retour orthographique : cadrage et up conservés après navigation libre',()=>{
 const perspective=new THREE.PerspectiveCamera(50,4/3,.005,2000),ortho=new THREE.OrthographicCamera(-8,8,6,-6,.01,1000);perspective.position.set(3,4,-8);perspective.lookAt(1,2,0);perspective.updateMatrixWorld();ortho.up.set(0,0,-1);
 const target=perspective.position.clone().addScaledVector(perspective.getWorldDirection(new THREE.Vector3()),7),before=perspective.quaternion.clone();orthographicFromPerspective(perspective,ortho,target);
 near(ortho.position,perspective.position);near(ortho.up,perspective.up);assert.ok(ortho.quaternion.angleTo(before)<1e-7);
 const vertical=new THREE.Vector3(0,1,0).applyQuaternion(perspective.quaternion),point=target.clone().addScaledVector(vertical,.7);near(screen(point,perspective),screen(point,ortho));
});

test('pivot accessible : hors écran ou derrière, sans modifier son point source',()=>{
 for(const camera of [new THREE.PerspectiveCamera(50,4/3,.005,2000),new THREE.OrthographicCamera(-4,4,3,-3,.01,1000)]){
  camera.position.set(0,0,8);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();
  for(const source of [new THREE.Vector3(40,25,0),new THREE.Vector3(0,0,10)]){
   const before=source.clone(),position=accessiblePivotPosition(camera,source),projected=position.clone().project(camera);near(source,before);assert.ok(Math.abs(projected.x)<=.650001&&Math.abs(projected.y)<=.650001);assert.ok(position.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()))>camera.near);
  }
 }
});

test('taille des poignées constante en pixels au zoom orthographique et en perspective',()=>{
 const ortho=new THREE.OrthographicCamera(-4,4,3,-3,.01,1000),perspective=new THREE.PerspectiveCamera(50,4/3,.005,2000),point=new THREE.Vector3(2,1,0),height=600,pixels=105;
 for(const zoom of [1,20,500]){ortho.zoom=zoom;const size=gizmoSizeForPixels(ortho,point,height,pixels),factor=(ortho.top-ortho.bottom)/zoom;near(new THREE.Vector3(factor*size/4/factor*height,0,0),new THREE.Vector3(pixels,0,0))}
 for(const distance of [.1,2,100]){perspective.position.set(0,0,distance);perspective.lookAt(0,0,0);perspective.updateMatrixWorld();const p=new THREE.Vector3(distance*.3,0,0),size=gizmoSizeForPixels(perspective,p,height,pixels),factor=p.distanceTo(perspective.position)*1.9*Math.tan(THREE.MathUtils.degToRad(25)),visible=2*distance*Math.tan(THREE.MathUtils.degToRad(25));assert.ok(Math.abs(factor*size/4/visible*height-pixels)<1e-7)}
});

test('repère clavier : axes écran des plans et déplacements 3D tangents au plan',()=>{
 const camera=new THREE.PerspectiveCamera(50,1,.01,1000);
 for(const [position,up,right,vertical] of [[[0,10,0],[0,0,-1],[1,0,0],[0,0,-1]],[[0,0,-10],[0,1,0],[-1,0,0],[0,1,0]],[[10,0,0],[0,1,0],[0,0,-1],[0,1,0]]]){
  camera.position.set(...position);camera.up.set(...up);camera.lookAt(0,0,0);const result=keyboardCameraFrame(camera);near(new THREE.Vector3(...result.right),new THREE.Vector3(...right));near(new THREE.Vector3(...result.up),new THREE.Vector3(...vertical));
 }
 camera.position.set(5,4,-8);camera.up.set(0,1,0);camera.lookAt(0,0,0);const normal=new THREE.Vector3(0,1,0),result=keyboardCameraFrame(camera,{normal});assert.ok(Math.abs(result.right[1])<1e-8&&Math.abs(result.up[1])<1e-8);assert.ok(Math.abs(new THREE.Vector3(...result.right).dot(new THREE.Vector3(...result.up)))<1e-8);
});
