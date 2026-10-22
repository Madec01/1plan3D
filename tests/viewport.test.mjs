import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Window} from 'happy-dom';
import {Viewport} from '../src/viewport.js';
import {buildProject,normalizeProject,DEFAULT_PROJECT} from '../src/engine.js';
import {planeFromPart,workplaneFrame} from '../src/workplane.js';
import {placePartOnWorkplane,partPlacementCorners,measurePoints,getLiveSnapSuggestion} from '../src/scene-interactions.js';
import {resolveAdaptiveGrid,placementAnchor} from '../src/adaptive-placement.js';

// Le renderer est remplacé, mais caméra, groupes, géométrie et TransformControls
// sont les vrais objets Three. Ce test ne constitue pas un rendu WebGL.
test('intégration caméra et poignées : changement de caméra, plan tourné, aucun saut des pièces',async()=>{
 const window=new Window(),document=window.document;globalThis.document=document;globalThis.window=window;globalThis.ResizeObserver=window.ResizeObserver;
 const parent=document.createElement('div'),canvas=document.createElement('canvas');parent.append(canvas);document.body.append(parent);
 Object.defineProperties(parent,{clientWidth:{value:800},clientHeight:{value:600}});canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
 window.HTMLCanvasElement.prototype.getContext=()=>({beginPath(){},roundRect(){},fill(){},fillText(){},strokeRect(){}});
 const renderer={shadowMap:{},setPixelRatio(){},setSize(){},setAnimationLoop(fn){this.loop=fn},render(scene,camera){scene.updateMatrixWorld();camera.updateMatrixWorld()}};
 let payload;const viewport=new Viewport(canvas,()=>{},(ids,data)=>{payload={ids,...data}},()=>renderer);
 const part={id:'B',label:'Chevron tourné',kind:'beam',material:'wood',a:[0,1500,0],b:[2000,1800,500],width:45,height:95,roll:20};
 const project=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:[part],grid:1,workplane:planeFromPart(part,'top')});
 viewport.set(buildProject(project),project);viewport.scene.updateMatrixWorld(true);
 let mesh=viewport.objects.find(o=>o.userData.part.id==='B');const initial=mesh.matrixWorld.clone();
 viewport.setNavigation('free');assert.equal(viewport.camera,viewport.freeCamera);assert.equal(viewport.transform.camera,viewport.freeCamera);assert.equal(viewport.controls.enabled,false);
 viewport.select(['B']);viewport.setTool('translate');viewport.scene.updateMatrixWorld(true);
 const error=()=>Math.max(...mesh.matrixWorld.elements.map((n,i)=>Math.abs(n-initial.elements[i])));assert.ok(error()<1e-8,'rattacher au pivot du plan ne bouge pas le bois');
 assert.equal(viewport.transform.space,'local');assert.equal(viewport.transform.showY,false);
 viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});
 const start=viewport.pivot.position.clone(),f=workplaneFrame(project.workplane),worldDelta=f.u.clone().multiplyScalar(.0123).addScaledVector(f.normal,.02);
 viewport.pivot.position.add(worldDelta);viewport.transform.dispatchEvent({type:'objectChange'});
 const actual=viewport.pivot.position.clone().sub(start).multiplyScalar(1000);assert.ok(Math.abs(actual.dot(f.normal))<.001);assert.ok(Math.abs(actual.dot(f.u)-12)<.001);
 viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.deepEqual(payload.ids,['B']);assert.equal(payload.angle,0);assert.ok(Math.abs(new THREE.Vector3(...payload.delta).dot(f.normal))<.001);
 viewport.set(buildProject(project),project);mesh=viewport.objects.find(o=>o.userData.part.id==='B');viewport.setTool('rotate');viewport.scene.updateMatrixWorld(true);assert.ok(error()<1e-8,'changer vers la rotation ne laisse aucune rotation de plan sur le bois');
 viewport.setNavigation('orbit');assert.equal(viewport.camera,viewport.orbitCamera);assert.equal(viewport.transform.camera,viewport.orbitCamera);assert.equal(viewport.freeNavigation.enabled,false);
 viewport.freeNavigation.dispose();viewport.controls.dispose();viewport.transform.dispose();viewport.resizeObserver.disconnect();await window.happyDOM.close();
});

test('fixation manuelle : poignée seule, pas précis, bois immobile et export OBJ',async()=>{
 const window=new Window(),document=window.document;Object.assign(globalThis,{window,document,ResizeObserver:window.ResizeObserver});const parent=document.createElement('div'),canvas=document.createElement('canvas');parent.append(canvas);document.body.append(parent);Object.defineProperties(parent,{clientWidth:{value:800},clientHeight:{value:600}});canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};window.HTMLCanvasElement.prototype.getContext=()=>({beginPath(){},roundRect(){},fill(){},fillText(){},strokeRect(){}});
 const renderer={shadowMap:{},setPixelRatio(){},setSize(){},setAnimationLoop(){},render(){}};const viewport=new Viewport(canvas,()=>{},()=>{throw Error('Ne doit pas déplacer le bois')},()=>renderer);
 const {toManualFixingLayout,buildJointFixings}=await import('../src/fixings.js');
 let p=normalizeProject({...DEFAULT_PROJECT,mode:'free',grid:.1,freeParts:[{id:'A',kind:'beam',material:'wood',a:[0,1000,120],b:[1000,1000,120],width:45,height:95},{id:'W',kind:'wall',material:'wall',a:[-500,0,0],b:[1500,0,0],width:200,height:2500}],freeJoints:[{id:'J',aPart:'A',bPart:'W',recipe:'wall_mechanical',anchors:4}]});let m=buildProject(p);p.freeJoints[0].fixingLayout=toManualFixingLayout(m.joints[0],m);m=buildProject(p);viewport.set(m,p);viewport.scene.updateMatrixWorld(true);
 const wood=viewport.objects.find(o=>o.userData.part.id==='A'),before=wood.matrixWorld.clone(),fix=buildJointFixings(m.joints[0],m)[0];viewport.selectFixing('J',fix.id);assert.equal(viewport.pivot.children.length,1);assert.equal(viewport.pivot.children[0].userData.part.kind,'fixing');assert.equal(viewport.transform.object,viewport.pivot);
 let result;viewport.onFixingTransform=(jointId,id,position)=>{result={jointId,id,position}};viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.x+=.01234;viewport.transform.dispatchEvent({type:'objectChange'});viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.equal(result.id,fix.id);assert.ok(Math.abs(result.position[0]-fix.position[0]-12.3)<1e-6);viewport.scene.updateMatrixWorld(true);assert.deepEqual(wood.matrixWorld.elements,before.elements);
 const obj=viewport.obj();assert.match(obj,/o J:anchor:0/);assert.match(obj,/o A\n/);
 // Une équerre manuelle emporte visuellement ses vis pendant le geste, sans déplacer le bois.
 p=normalizeProject(DEFAULT_PROJECT);m=buildProject(p);const joint=m.joints[0];p.jointOverrides[joint.id]={...joint,fixingLayout:toManualFixingLayout(joint,m)};m=buildProject(p);viewport.set(m,p);
 const connector=buildJointFixings(m.joints[0],m).find(f=>f.type==='connector');viewport.selectFixing(joint.id,connector.id);assert.equal(viewport.pivot.children.length,9);
 viewport.scene.updateMatrixWorld(true);const positions=viewport.pivot.children.map(o=>o.getWorldPosition(new THREE.Vector3())),woodPositions=viewport.objects.map(o=>o.matrixWorld.clone());
 viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.x+=.02;viewport.transform.dispatchEvent({type:'objectChange'});viewport.scene.updateMatrixWorld(true);
 viewport.pivot.children.forEach((o,i)=>assert.ok(o.getWorldPosition(new THREE.Vector3()).distanceTo(positions[i].clone().add(new THREE.Vector3(.02,0,0)))<1e-8));viewport.objects.forEach((o,i)=>assert.deepEqual(o.matrixWorld.elements,woodPositions[i].elements));
 viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.equal(result.id,connector.id);
 viewport.freeNavigation.dispose();viewport.controls.dispose();viewport.transform.dispose();viewport.resizeObserver.disconnect();await window.happyDOM.close();
});

test('visée caméra : vrais solides, calques masqués exclus, grillage traversé et plan de travail en secours',async()=>{
 const window=new Window(),document=window.document;Object.assign(globalThis,{window,document,ResizeObserver:window.ResizeObserver});const parent=document.createElement('div'),canvas=document.createElement('canvas');parent.append(canvas);document.body.append(parent);Object.defineProperties(parent,{clientWidth:{value:800},clientHeight:{value:600}});canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};window.HTMLCanvasElement.prototype.getContext=()=>({beginPath(){},roundRect(){},fill(){},fillText(){},strokeRect(){}});
 const renderer={shadowMap:{},setPixelRatio(){},setSize(){},setAnimationLoop(){},render(){}};const viewport=new Viewport(canvas,()=>{},()=>{},()=>renderer);
 const p=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:[{id:'P',kind:'post',material:'wood',a:[0,0,0],b:[0,2000,0],width:100,height:100}]});viewport.set(buildProject(p),p);viewport.setNavigation('free');viewport.freeCamera.position.set(0,1,8);viewport.freeCamera.lookAt(0,1,0);viewport.freeCamera.updateMatrixWorld();
 const face=viewport.freeNavigation.pointAt(400,300);assert.ok(Math.abs(face.z-.05)<1e-6);assert.ok(Math.abs(face.y-1)<1e-6);
 // Un grillage devant le poteau et les repères de liaison ne capturent pas la visée.
 const screen=new THREE.Mesh(new THREE.BoxGeometry(1,2,.01),new THREE.MeshBasicMaterial());screen.position.set(0,1,2);screen.userData.part={material:'mesh'};viewport.group.add(screen);viewport.objects.push(screen);
 const marker=new THREE.Mesh(new THREE.SphereGeometry(.2),new THREE.MeshBasicMaterial());marker.position.set(0,1,4);viewport.jointGroup.add(marker);viewport.jointGroup.visible=true;
 assert.ok(Math.abs(viewport.freeNavigation.pointAt(400,300).z-.05)<1e-6);
 viewport.select(['P']);assert.ok(Math.abs(viewport.freeNavigation.pointAt(400,300).z-.05)<1e-6,'une pièce sélectionnée reste visable dans le groupe pivot');
 viewport.objects.find(o=>o.userData.part.id==='P').visible=false;const empty=viewport.freeNavigation.pointAt(400,300);assert.ok(Math.abs(empty.z-.05)>.1);
 const ground=viewport.navigationPoint(new THREE.Ray(new THREE.Vector3(2,4,2),new THREE.Vector3(0,-1,0)));assert.ok(Math.abs(ground.y)<1e-9);assert.equal(viewport.navigationPoint(new THREE.Ray(new THREE.Vector3(2,4,2),new THREE.Vector3(0,1,0))),null);
 viewport.transform.dragging=true;assert.equal(viewport.freeNavigation.enabled,false);viewport.transform.dragging=false;assert.equal(viewport.freeNavigation.enabled,true);
 viewport.freeNavigation.dispose();viewport.controls.dispose();viewport.transform.dispose();viewport.resizeObserver.disconnect();await window.happyDOM.close();
});

function setupInteractionViewport(parts=[]){
 const window=new Window(),document=window.document;Object.assign(globalThis,{window,document,ResizeObserver:window.ResizeObserver});const parent=document.createElement('div'),canvas=document.createElement('canvas');parent.append(canvas);document.body.append(parent);
 Object.defineProperties(parent,{clientWidth:{value:800},clientHeight:{value:600}});Object.defineProperties(canvas,{clientWidth:{value:800},clientHeight:{value:600}});canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});const captures=new Set();canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);
 window.HTMLCanvasElement.prototype.getContext=()=>({beginPath(){},roundRect(){},fill(){},fillText(){},strokeRect(){}});
 const renderer={shadowMap:{},setPixelRatio(value){this.pixelRatio=value},setSize(){},setAnimationLoop(fn){this.loop=fn},render(){}};let selected,selectionEvent,payload,status;
 const viewport=new Viewport(canvas,(part,event)=>{selected=part;selectionEvent=event},(ids,change)=>payload={ids,...change},()=>renderer);viewport.onInteractionStatus=text=>status=text;
 const p=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:parts});viewport.set(buildProject(p),p);
 const pointer=(type,x,y,button=0,extra={})=>canvas.dispatchEvent(new window.PointerEvent(type,{clientX:x,clientY:y,button,pointerType:'mouse',pointerId:1,bubbles:true,cancelable:true,...extra}));
 const click=(x,y)=>{pointer('pointerdown',x,y);pointer('pointerup',x,y)};
 const screen=mm=>{viewport.camera.updateMatrixWorld();const point=new THREE.Vector3(...mm).multiplyScalar(.001).project(viewport.camera);return [(point.x+1)*400,(1-point.y)*300]};
 return {window,canvas,viewport,p,renderer,pointer,click,screen,get selected(){return selected},get selectionEvent(){return selectionEvent},get payload(){return payload},get status(){return status},async close(){viewport.clearPrecisionTimer();window.removeEventListener('blur',viewport.touchBlurHandler);viewport.freeNavigation.dispose();viewport.controls.dispose();viewport.transform.dispose();viewport.resizeObserver.disconnect();window.removeEventListener('keydown',viewport.modifierHandler);window.removeEventListener('keyup',viewport.modifierHandler);await window.happyDOM.close()}};
}
const beam=(id,a,b,extra={})=>({id,label:id,kind:'beam',material:'wood',a,b,width:45,height:100,roll:0,foundation:'none',...extra});

test('vues de plan : pan et zoom conservent exactement orientation, ombres coupées et cotes mm',async()=>{
 const t=setupInteractionViewport([beam('post',[0,0,0],[0,2000,0],{kind:'post',width:90,height:90})]);const {viewport,pointer,canvas,window}=t;
 viewport.setNavigation('free');
 for(const view of ['top','front','side']){
  viewport.view(view);assert.equal(viewport.camera,viewport.orbitCamera);assert.equal(viewport.controls.enableRotate,false);assert.equal(viewport.renderer.shadowMap.enabled,false);assert.equal(viewport.ground.visible,false);
  const orientation=viewport.camera.quaternion.clone(),position=viewport.camera.position.clone();
  pointer('pointerdown',400,300);pointer('pointermove',450,330);pointer('pointerup',450,330);viewport.controls.update();
  assert.ok(position.distanceTo(viewport.camera.position)>.1);assert.ok(orientation.angleTo(viewport.camera.quaternion)<1e-7);
  const zoom=viewport.camera.zoom,event=new window.WheelEvent('wheel',{deltaY:-100,cancelable:true});Object.assign(event,{clientX:520,clientY:230});canvas.dispatchEvent(event);viewport.controls.update();
  assert.ok(viewport.camera.zoom>zoom);assert.ok(orientation.angleTo(viewport.camera.quaternion)<1e-7);assert.match(viewport.orientationLabel.textContent,/mm/);
 }
 assert.ok(viewport.dimGroup.children.filter(o=>o.isSprite).every(o=>o.userData.label.endsWith(' mm')));
 viewport.view('iso');assert.equal(viewport.controls.enableRotate,true);assert.equal(viewport.renderer.shadowMap.enabled,true);
 await t.close();
});

test('placement pur : base sur le plan, coordonnées mm et coins réels pour un plan tourné',()=>{
 const post=beam('new',[0,0,0],[0,2000,0],{kind:'post',width:90,height:90}),placed=placePartOnWorkplane(post,[123.4,900,456.7],{type:'xz',offset:200},{grid:1});
 assert.deepEqual(placed.a,[123,200,457]);assert.deepEqual(placed.b,[123,2200,457]);assert.deepEqual(post.a,[0,0,0]);
 const support=beam('support',[0,1500,0],[2000,1800,500],{roll:25}),plane=planeFromPart(support,'top'),frame=workplaneFrame(plane),tilted=placePartOnWorkplane(post,[100,1700,400],plane,{snap:false});
 assert.ok(Math.abs(Math.min(...partPlacementCorners(tilted).map(c=>c.sub(frame.origin).dot(frame.normal))))<1e-6);
 assert.deepEqual(tilted.b.map((n,i)=>n-tilted.a[i]),[0,2000,0]);
 const panel={...beam('panel',[0,0,0],[1000,1000,0]),kind:'panel',material:'mesh',corners:[[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0]]};
 const shifted=placePartOnWorkplane(panel,[500,0,100],{type:'xz'},{snap:false});assert.equal(shifted.corners[0][1],0);assert.equal(shifted.corners[0][2],100);
 assert.deepEqual(measurePoints([0,0,0],[3,4,12]).distance,13);
});

test('placement au clic : fantôme sur plan, callback unique et annulation sans mutation',async()=>{
 const t=setupInteractionViewport(),{viewport,pointer,click}=t;viewport.view('top');let received;
 const part=beam('new',[0,0,0],[0,2000,0],{kind:'post',width:90,height:90}),before=JSON.stringify(t.p);
 viewport.beginPlacement(part,p=>received=p);pointer('pointermove',460,340);assert.equal(viewport.placementGroup.children.length,1);assert.equal(viewport.freeNavigation.leftEnabled,false);
 click(460,340);assert.ok(received);assert.equal(received.a[1],0);assert.equal(received.b[1],2000);assert.equal(viewport.interaction,null);assert.equal(viewport.placementGroup.children.length,0);assert.equal(JSON.stringify(t.p),before);
 const original=received;viewport.beginPlacement(part,p=>received=p);pointer('pointermove',300,200);viewport.cancelPlacement();assert.equal(viewport.placementGroup.children.length,0);assert.equal(received,original);assert.equal(viewport.interaction,null);
 await t.close();
});

test('mesure deux clics sur surfaces : distance réelle, aperçu et annulation',async()=>{
 const t=setupInteractionViewport([beam('post',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100})]),{viewport,click,pointer,screen}=t;viewport.view('front');viewport.beginMeasure();
 const a=screen([0,500,-50]),b=screen([0,1500,-50]);click(...a);assert.equal(viewport.interaction.points.length,1);pointer('pointermove',...b);assert.ok(viewport.measurementGroup.children.length>0);click(...b);
 assert.equal(viewport.interaction,null);assert.ok(Math.abs(viewport.measurement.distance-1000)<1e-6);assert.match(t.status,/1.?000.*mm/);assert.equal(t.selected,undefined);
 viewport.clearMeasurement();assert.equal(viewport.measurementGroup.children.length,0);viewport.beginMeasure();click(...a);viewport.cancelInteraction();assert.equal(viewport.measurement,null);assert.equal(viewport.interaction,null);
 await t.close();
});

test('sélection et survol : contours indépendants des matériaux, calques respectés',async()=>{
 const parts=[beam('post',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100}),{id:'panel',kind:'panel',material:'mesh',a:[500,0,0],b:[1500,1000,0],corners:[[500,0,0],[1500,0,0],[1500,1000,0],[500,1000,0]],width:1,height:1}];
 const t=setupInteractionViewport(parts),{viewport,pointer,screen}=t;viewport.view('front');pointer('pointermove',...screen([0,1000,-50]));assert.equal(viewport.hovered.userData.part.id,'post');assert.equal(viewport.highlightGroup.children.length,1);
 viewport.select(['post','panel']);assert.equal(viewport.highlightGroup.children.filter(c=>c.userData.selected).length,2);
 const panel=viewport.objects.find(o=>o.userData.part.id==='panel'),color=panel.material.color.getHex();viewport.select([]);assert.equal(panel.material.color.getHex(),color);
 viewport.setHover(panel);viewport.layer('mesh',false);assert.equal(viewport.highlightGroup.children.find(o=>o.userData.source===panel).visible,false);
 await t.close();
});

test('accrochage pendant translation : cible visible puis correction exacte, Alt annule',async()=>{
 const parts=[beam('beam',[-1000,2075,20],[1000,2075,20]),beam('post',[450,0,0],[450,2000,0],{kind:'post',width:90,height:90})];
 const t=setupInteractionViewport(parts),{viewport}=t;viewport.select(['beam']);viewport.setTool('translate');viewport.transform.axis='XYZ';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.y-=.005;viewport.transform.dispatchEvent({type:'objectChange'});
 assert.equal(viewport.snapCandidate.targetId,'post');assert.ok(viewport.previewGroup.children.length>=2);assert.match(t.status,/Accrochage/);
 assert.ok(Math.abs(viewport.pivot.position.y-viewport.dragStart.y+.025)<1e-8,'la pièce est aimantée avant le relâchement');assert.ok(Math.abs(viewport.pivot.position.z-viewport.dragStart.z+.020)<1e-8);
 viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.deepEqual(t.payload.ids,['beam']);assert.ok(Math.abs(t.payload.delta[1]+25)<1e-5);assert.ok(Math.abs(t.payload.delta[2]+20)<1e-5);assert.equal(t.p.freeJoints.length,0);
 viewport.set(buildProject(t.p),t.p);viewport.select(['beam']);viewport.setTool('translate');viewport.transform.axis='Y';viewport.altKey=true;viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.y-=.0054;viewport.transform.dispatchEvent({type:'objectChange'});assert.equal(viewport.snapCandidate,null);
 viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.ok(Math.abs(t.payload.delta[1]+5.4)<1e-6);assert.equal(t.payload.delta[2],0);
 await t.close();
});

test('accrochage contraint : aucune correction hors axe ou hors plan verrouillé',()=>{
 const p=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:[beam('beam',[-1000,2075,20],[1000,2075,20]),beam('post',[450,0,0],[450,2000,0],{kind:'post',width:90,height:90})]});
 const axis=getLiveSnapSuggestion(p,['beam'],[0,-5,0],{axis:'Y'});assert.ok(axis);assert.ok(Math.abs(axis.delta[0])<.01&&Math.abs(axis.delta[2])<.01);
 assert.equal(getLiveSnapSuggestion({...p,workplane:{...p.workplane,lock:true}},['beam'],[0,-5,0]),null);
 assert.equal(getLiveSnapSuggestion(p,['beam'],[0,-5,0],{alt:true}),null);assert.equal(getLiveSnapSuggestion({...p,snap:false},['beam'],[0,-5,0]),null);
});

test('grille affichée : pas exact, repère diagonal et limite explicite sans faux grands carreaux',async()=>{
 const parts=[beam('A',[0,0,0],[0,2000,0],{kind:'post'}),beam('B',[1000,0,1000],[1000,2000,1000],{kind:'post'})],t=setupInteractionViewport(parts),{viewport,p}=t;
 try{
  p.assistance={gridMode:'adaptive',gridReference:'pair',gridA:'A',gridB:'B',gridDivisions:8,gridSnap:true};viewport.set(buildProject(p),p);
  const frame=resolveAdaptiveGrid(p),grid=viewport.grid,positions=grid.geometry.attributes.position;
  assert.equal(grid.isLineSegments,true);assert.equal(grid.userData.step,frame.step);assert.ok(grid.quaternion.angleTo(frame.quaternion)<1e-7);
  assert.ok(Math.abs((positions.getX(4)-positions.getX(0))*1000-frame.step)<.001,'deux lignes consécutives sont séparées du vrai pas');
  assert.equal(grid.userData.linesPerDirection<=199,true);
  p.assistance={gridMode:'fixed',gridStep:.1};viewport.set(buildProject(p),p);
  assert.equal(viewport.grid.userData.step,.1);assert.equal(viewport.grid.userData.linesPerDirection,199);assert.equal(viewport.grid.userData.limited,true);assert.match(viewport.orientationLabel.textContent,/portion/);
  assert.ok(Math.abs((viewport.grid.geometry.attributes.position.getX(4)-viewport.grid.geometry.attributes.position.getX(0))*1000-.1)<1e-6);
 }finally{await t.close()}
});

test('placement strict : frame prioritaire sur pas relatif et snap désactivé, plan incliné',()=>{
 const a=beam('A',[13.125,0,27.25],[13.125,2000,27.25],{kind:'post'}),b=beam('B',[1014.125,0,27.25],[1014.125,2000,27.25],{kind:'post'}),p={workplane:{type:'xz'},assistance:{gridReference:'pair',gridA:'A',gridB:'B',gridDivisions:8,gridSnap:true},freeParts:[a,b]},grid=resolveAdaptiveGrid(p);
 const moved=placePartOnWorkplane(a,[380,0,29],p.workplane,{grid:50,snap:false,gridFrame:grid});assert.ok(Math.abs(moved.a[0]-(13.125+3*125.125))<1e-9);assert.equal(moved.a[2],27.25);assert.equal(moved.a[1],0);
 const support=beam('support',[0,1500,0],[2000,1800,500],{roll:25}),plane=planeFromPart(support,'top'),tilted=resolveAdaptiveGrid({workplane:plane,assistance:{gridMode:'fixed',gridStep:37.125}}),placed=placePartOnWorkplane(a,[100,1700,400],plane,{snap:false,gridFrame:tilted}),anchor=new THREE.Vector3(...placementAnchor(placed,plane)).sub(tilted.origin);
 for(const axis of [tilted.u,tilted.v])assert.ok(Math.abs(anchor.dot(axis)/tilted.step-Math.round(anchor.dot(axis)/tilted.step))<1e-8);
 assert.ok(Math.abs(Math.min(...partPlacementCorners(placed).map(c=>c.sub(tilted.origin).dot(tilted.normal))))<1e-7);
});

test('ajout : guides d’écarts au milieu, aimant optionnel, Alt et projet inchangé',async()=>{
 const t=setupInteractionViewport([beam('A',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100}),beam('B',[1000,0,0],[1000,2000,0],{kind:'post',width:100,height:100})]),{viewport,p,pointer,screen,click}=t;
 try{
  p.assistance={guides:true,guideSnap:true,gridSnap:false};viewport.set(buildProject(p),p);viewport.view('top');const before=JSON.stringify(p),part=beam('new',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100});let result;
  viewport.beginPlacement(part,placed=>result=placed);pointer('pointermove',...screen([512,0,9]));assert.ok(viewport.interaction.guideApplied);assert.ok(viewport.guideGroup.children.length>0);assert.ok(viewport.guideGroup.children.some(o=>o.userData.guideKind==='spacing'));assert.ok(Math.abs(viewport.interaction.placedPart.a[0]-500)<1e-8);assert.ok(Math.abs(viewport.interaction.placedPart.a[2])<1e-8);
  click(...screen([512,0,9]));assert.ok(Math.abs(result.a[0]-500)<1e-8);assert.equal(JSON.stringify(p),before);assert.equal(viewport.guideGroup.children.length,0);
  p.assistance.guideSnap=false;viewport.beginPlacement(part,()=>{});pointer('pointermove',...screen([512,0,9]));assert.equal(viewport.interaction.guideApplied,false);assert.equal(viewport.interaction.placedPart.a[0],512);assert.ok(viewport.guideGroup.children.length>0);assert.match(t.status,/repère visuel/);
  pointer('pointermove',...screen([512.25,0,9.75]),0,{altKey:true});assert.equal(viewport.guideGroup.children.length,0);assert.ok(Math.abs(viewport.interaction.placedPart.a[0]-512.25)<1e-7);assert.match(t.status,/suspendues/);
 }finally{await t.close()}
});

test('drag strict : frame figée, nœuds prioritaires aux guides et aux contacts',async()=>{
 const parts=[beam('A',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100}),beam('B',[1100,0,0],[1100,2000,0],{kind:'post',width:100,height:100}),beam('M',[600,0,0],[600,2000,0],{kind:'post',width:100,height:100})],t=setupInteractionViewport(parts),{viewport,p}=t;
 try{
  p.assistance={guides:true,guideSnap:true,gridSnap:true,gridMode:'fixed',gridStep:200};viewport.set(buildProject(p),p);viewport.select(['M']);viewport.setTool('translate');viewport.transform.axis='X';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});
  const start=viewport.pivot.position.clone();p.assistance.gridStep=50;viewport.pivot.position.x+=.02;viewport.transform.dispatchEvent({type:'objectChange'});
  assert.equal(viewport.dragGrid.step,200);assert.equal(viewport.grid.userData.step,200);assert.ok(viewport.guideCandidate);assert.equal(viewport.guideCanSnap,false,'milieu 550 hors grille 200');assert.ok(viewport.pivot.position.distanceTo(start)<1e-9);
  viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.equal(t.payload,undefined,'aucun déplacement hors nœud');
  const contactParts=[beam('beam',[-1000,2075,0],[1000,2075,0]),beam('post',[450,0,33],[450,2000,33],{kind:'post',width:90,height:90})];p.freeParts=contactParts;p.assistance={gridMode:'fixed',gridStep:100,gridSnap:true,guides:true};viewport.set(buildProject(p),p);viewport.select(['beam']);viewport.setTool('translate');viewport.transform.axis='XYZ';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.y-=.005;viewport.transform.dispatchEvent({type:'objectChange'});
  assert.ok(viewport.snapCandidate,'un contact vertical reste possible sans quitter le nœud X/Z');assert.ok(Math.abs(viewport.snapCandidate.delta[2])<1e-8,'le centrage Z=33 hors grille est refusé');assert.ok(viewport.snapCandidate.contactArea>0);viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.ok(Math.abs(t.payload.delta[2])<1e-8);assert.ok(Math.abs(t.payload.delta[1]+25)<1e-8,'la face basse rejoint exactement le haut du poteau');
 }finally{await t.close()}
});

test('drag strict contraint : nœud impossible bloque, Alt libère sans changer les axes',async()=>{
 const t=setupInteractionViewport([beam('P',[10,0,25],[10,2000,25],{kind:'post'})]),{viewport,p}=t;
 try{
  p.assistance={gridMode:'fixed',gridStep:100,gridSnap:true};viewport.set(buildProject(p),p);viewport.select(['P']);viewport.setTool('translate');viewport.transform.axis='X';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});const initial=viewport.pivot.position.clone();viewport.pivot.position.x+=.1234;viewport.transform.dispatchEvent({type:'objectChange'});
  assert.equal(viewport.gridBlocked,true);assert.ok(viewport.pivot.position.distanceTo(initial)<1e-10);assert.match(t.status,/Aucun nœud/);
  viewport.altKey=true;viewport.updateDragPosition();assert.ok(Math.abs(viewport.pivot.position.x-initial.x-.1234)<1e-9);assert.equal(viewport.pivot.position.z,initial.z);assert.equal(viewport.guideGroup.children.length,0);assert.equal(viewport.snapCandidate,null);
  viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.ok(Math.abs(t.payload.delta[0]-123.4)<1e-8);assert.equal(t.payload.delta[2],0);
 }finally{await t.close()}
});

test('aperçu entre deux pièces et mesures de sélection restent temporaires',async()=>{
 const t=setupInteractionViewport([beam('A',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100}),beam('B',[1000,0,0],[1000,2000,0],{kind:'post',width:100,height:100})]),{viewport,p}=t;
 try{
  viewport.select(['A','B']);const labels=viewport.selectionMeasureGroup.children.filter(o=>o.isSprite).map(o=>o.userData.label);assert.ok(labels.some(s=>s.includes('Entraxe')&&s.includes('000')));assert.ok(labels.some(s=>s.includes('Jeu projeté')&&s.includes('900')));
  viewport.layer('dimensions',false);assert.equal(viewport.selectionMeasureGroup.visible,true);const before=JSON.stringify(p),count=viewport.objects.length;viewport.previewArrangement([beam('preview',[500,0,0],[500,2000,0],{kind:'post'})],[{a:[0,0,0],b:[500,0,0],label:'500 mm',kind:'spacing'}]);
  assert.ok(viewport.arrangementGroup.children.length>=2);assert.equal(viewport.objects.length,count);assert.equal(JSON.stringify(p),before);assert.doesNotMatch(viewport.obj(),/o preview/);viewport.clearArrangementPreview();assert.equal(viewport.arrangementGroup.children.length,0);
 }finally{await t.close()}
});

test('tactile : pan par défaut, pincement sans sélection ni placement et qualité restaurée',async()=>{
 const t=setupInteractionViewport([beam('P',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100})]),{viewport,pointer}=t;viewport.view('top');
 const touch=(type,id,x,y)=>pointer(type,x,y,0,{pointerType:'touch',pointerId:id});
 assert.equal(viewport.touchMode,'pan');assert.equal(viewport.controls.touches.ONE,THREE.TOUCH.PAN);assert.equal(viewport.controls.touches.TWO,THREE.TOUCH.DOLLY_PAN);
 viewport.view('iso');viewport.fullPixelRatio=2;viewport.renderer.setPixelRatio(2);viewport.setTouchMode('rotate');assert.equal(viewport.controls.touches.ONE,THREE.TOUCH.ROTATE);viewport.setTouchMode('pan');
 let placed=0;viewport.beginPlacement(beam('new',[0,0,0],[0,1000,0],{kind:'post'}),()=>placed++);
 touch('pointerdown',10,350,300);assert.equal(viewport.renderer.shadowMap.enabled,false);assert.equal(viewport.renderer.pixelRatio,1);
 touch('pointerdown',11,450,300);touch('pointermove',11,480,300);touch('pointerup',11,480,300);touch('pointerup',10,350,300);
 assert.equal(placed,0);assert.equal(t.selected,undefined);assert.equal(viewport.canConfirmInteraction(),false);assert.equal(viewport.placementGroup.children.length,0);assert.equal(viewport.renderer.pixelRatio,2);assert.equal(viewport.renderer.shadowMap.enabled,true);
 viewport.cancelInteraction();touch('pointerdown',12,400,300);touch('pointercancel',12,400,300);assert.equal(viewport.touchPointers.size,0);assert.equal(viewport.touchRendering,false);assert.equal(t.selected,undefined);
 touch('pointerdown',13,400,300);t.window.dispatchEvent(new t.window.Event('blur'));assert.equal(viewport.touchPointers.size,0);assert.equal(viewport.renderer.pixelRatio,2);assert.equal(viewport.touchRendering,false);
 await t.close();
});

test('tactile : pose en aperçu, validation unique et annulation sans mutation',async()=>{
 const t=setupInteractionViewport(),{viewport,pointer}=t;viewport.view('top');const before=JSON.stringify(t.p),part=beam('new',[0,0,0],[0,2000,0],{kind:'post'});let calls=0,result;
 const tap=(x,y)=>{pointer('pointerdown',x,y,0,{pointerType:'touch'});pointer('pointerup',x,y,0,{pointerType:'touch'})};
 viewport.beginPlacement(part,p=>{calls++;result=p});tap(470,330);assert.equal(calls,0);assert.equal(viewport.canConfirmInteraction(),true);assert.equal(viewport.placementGroup.children.length,1);assert.match(t.status,/Valider/);assert.equal(JSON.stringify(t.p),before);
 assert.equal(viewport.confirmInteraction(),true);assert.equal(calls,1);assert.ok(result);assert.equal(viewport.confirmInteraction(),false);assert.equal(calls,1);assert.equal(viewport.placementGroup.children.length,0);
 viewport.beginPlacement(part,()=>calls++);tap(410,320);assert.equal(viewport.canConfirmInteraction(),true);viewport.cancelInteraction();assert.equal(viewport.canConfirmInteraction(),false);assert.equal(calls,1);assert.equal(JSON.stringify(t.p),before);
 await t.close();
});

test('tactile : déplacement différé, annulation exacte du pivot et validation unique',async()=>{
 const t=setupInteractionViewport([beam('P',[.123,250.456,40.789],[1000.123,600.456,540.789],{roll:22})]),{viewport,pointer}=t;viewport.select(['P']);viewport.setTool('translate');t.p.snap=false;t.p.assistance.guides=false;viewport.scene.updateMatrixWorld(true);
 const mesh=viewport.objects[0],initial=mesh.matrixWorld.clone(),pivot=viewport.pivot.position.clone(),q=viewport.pivot.quaternion.clone(),before=JSON.stringify(t.p),objBefore=viewport.obj();let calls=0,payload;viewport.onTransform=(ids,change)=>{calls++;payload={ids,...change}};
 const move=()=>{pointer('pointerdown',40,40,0,{pointerType:'touch',pointerId:31});viewport.transform.axis='XYZ';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.x+=.1234567;viewport.pivot.position.z-=.0123456;viewport.transform.dispatchEvent({type:'objectChange'});viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;pointer('pointerup',40,40,0,{pointerType:'touch',pointerId:31})};
 move();await Promise.resolve();assert.equal(calls,0);assert.equal(viewport.canConfirmInteraction(),true);assert.ok(viewport.pendingTransform);assert.equal(JSON.stringify(t.p),before);viewport.scene.updateMatrixWorld(true);assert.notDeepEqual(mesh.matrixWorld.elements,initial.elements);const previewMatrix=mesh.matrixWorld.clone();assert.equal(viewport.obj(),objBefore,'OBJ contient seulement la position validée');assert.ok(viewport.pendingTransform);viewport.scene.updateMatrixWorld(true);assert.deepEqual(mesh.matrixWorld.elements,previewMatrix.elements);
 viewport.cancelInteraction();viewport.scene.updateMatrixWorld(true);assert.deepEqual(mesh.matrixWorld.elements,initial.elements);assert.deepEqual(viewport.pivot.position.toArray(),pivot.toArray());assert.deepEqual(viewport.pivot.quaternion.toArray(),q.toArray());assert.equal(calls,0);assert.equal(viewport.canConfirmInteraction(),false);
 move();assert.equal(viewport.confirmInteraction(),true);assert.equal(calls,1);assert.deepEqual(payload.ids,['P']);assert.ok(Math.abs(payload.delta[0]-123.4567)<1e-8);assert.ok(Math.abs(payload.delta[2]+12.3456)<1e-8);assert.equal(viewport.confirmInteraction(),false);assert.equal(calls,1);assert.equal(JSON.stringify(t.p),before);
 await t.close();
});

test('tactile : deuxième doigt annule le déplacement actif et échappement restaure une rotation',async()=>{
 const t=setupInteractionViewport([beam('P',[0,0,0],[1000,0,0])]),{viewport,pointer,window}=t;viewport.select(['P']);viewport.setTool('translate');viewport.scene.updateMatrixWorld(true);const mesh=viewport.objects[0],initial=mesh.matrixWorld.clone();
 pointer('pointerdown',40,40,0,{pointerType:'touch',pointerId:21});viewport.transform.axis='XYZ';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.x+=.5;viewport.transform.dispatchEvent({type:'objectChange'});
 pointer('pointerdown',50,50,0,{pointerType:'touch',pointerId:22});viewport.scene.updateMatrixWorld(true);assert.equal(viewport.dragStart,null);assert.deepEqual(mesh.matrixWorld.elements,initial.elements);assert.equal(viewport.canConfirmInteraction(),false);
 pointer('pointerup',50,50,0,{pointerType:'touch',pointerId:22});pointer('pointerup',40,40,0,{pointerType:'touch',pointerId:21});assert.equal(t.payload,undefined);
 viewport.setTool('rotate');pointer('pointerdown',40,40,0,{pointerType:'touch',pointerId:23});viewport.transform.axis='Y';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),.3);viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;pointer('pointerup',40,40,0,{pointerType:'touch',pointerId:23});assert.equal(viewport.canConfirmInteraction(),true);
 window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'}));viewport.scene.updateMatrixWorld(true);assert.equal(viewport.canConfirmInteraction(),false);assert.deepEqual(mesh.matrixWorld.elements,initial.elements);assert.equal(t.payload,undefined);
 await t.close();
});

test('tactile : viseur au-dessus du doigt, point sélectionné exact et multisélection explicite',async()=>{
 const t=setupInteractionViewport([beam('P',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100})]),{viewport,pointer,screen}=t;viewport.view('front');viewport.setMultiSelect(true);const target=screen([0,1000,-50]),finger=[target[0],target[1]+56];
 pointer('pointerdown',...finger,0,{pointerType:'touch',pointerId:41});await new Promise(resolve=>setTimeout(resolve,420));assert.ok(viewport.precisionTouch);assert.equal(viewport.touchCrosshair.hidden,false);assert.ok(Math.abs(viewport.precisionTouch.point.clientY-target[1])<1e-8);assert.equal(viewport.controls.enabled,false);assert.equal(viewport.hovered.userData.part.id,'P');
 const orientation=viewport.camera.quaternion.clone(),position=viewport.camera.position.clone();pointer('pointermove',finger[0],finger[1]+4,0,{pointerType:'touch',pointerId:41});assert.deepEqual(viewport.camera.position.toArray(),position.toArray());assert.deepEqual(viewport.camera.quaternion.toArray(),orientation.toArray());
 pointer('pointerup',finger[0],finger[1]+4,0,{pointerType:'touch',pointerId:41});assert.equal(t.selected.id,'P');assert.equal(t.selectionEvent.additive,true);assert.equal(t.selectionEvent.shiftKey,true);assert.ok(Math.abs(t.selectionEvent.clientY-(target[1]+4))<1e-8);assert.equal(viewport.touchCrosshair.hidden,true);assert.equal(viewport.controls.enabled,true);
 await t.close();
});

test('tactile : fixation manuelle différée, bois immobile et annulation exacte',async()=>{
 const {toManualFixingLayout,buildJointFixings}=await import('../src/fixings.js');const t=setupInteractionViewport(),{viewport,pointer}=t;
 const p=normalizeProject({...DEFAULT_PROJECT,mode:'free',grid:.1,freeParts:[beam('A',[0,1000,120],[1000,1000,120]),{id:'W',kind:'wall',material:'wall',a:[-500,0,0],b:[1500,0,0],width:200,height:2500}],freeJoints:[{id:'J',aPart:'A',bPart:'W',recipe:'wall_mechanical',anchors:4}]});let m=buildProject(p);p.freeJoints[0].fixingLayout=toManualFixingLayout(m.joints[0],m);m=buildProject(p);viewport.set(m,p);
 const fix=buildJointFixings(m.joints[0],m)[0];viewport.selectFixing('J',fix.id);viewport.scene.updateMatrixWorld(true);const object=viewport.pivot.children[0],initial=object.matrixWorld.clone(),wood=viewport.objects[0],woodInitial=wood.matrixWorld.clone();let calls=0,result;viewport.onFixingTransform=(jointId,id,position)=>{calls++;result={jointId,id,position}};
 const move=()=>{pointer('pointerdown',30,30,0,{pointerType:'touch',pointerId:71});viewport.transform.axis='X';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.x+=.01234;viewport.transform.dispatchEvent({type:'objectChange'});viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;pointer('pointerup',30,30,0,{pointerType:'touch',pointerId:71})};
 move();await Promise.resolve();assert.equal(calls,0);assert.equal(viewport.canConfirmInteraction(),true);viewport.scene.updateMatrixWorld(true);assert.deepEqual(wood.matrixWorld.elements,woodInitial.elements);viewport.cancelInteraction();viewport.scene.updateMatrixWorld(true);assert.deepEqual(object.matrixWorld.elements,initial.elements);assert.equal(calls,0);
 move();assert.equal(viewport.confirmInteraction(),true);assert.equal(calls,1);assert.equal(result.id,fix.id);assert.ok(Math.abs(result.position[0]-fix.position[0]-12.3)<1e-6);viewport.scene.updateMatrixWorld(true);assert.deepEqual(wood.matrixWorld.elements,woodInitial.elements);
 await t.close();
});

test('tactile : viseur en caméra libre réserve le doigt sans navigation ni faux rejet',async()=>{
 const t=setupInteractionViewport([beam('P',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100})]),{viewport,pointer}=t;viewport.view('front');viewport.setNavigation('free');viewport.freeCamera.position.set(0,1,-8);viewport.freeCamera.lookAt(0,1,0);viewport.freeCamera.updateMatrixWorld();
 pointer('pointerdown',400,356,0,{pointerType:'touch',pointerId:81});assert.equal(viewport.startPrecisionTouch(81),true);const before=viewport.camera.position.clone();pointer('pointermove',400,359,0,{pointerType:'touch',pointerId:81});assert.deepEqual(viewport.camera.position.toArray(),before.toArray());pointer('pointerup',400,359,0,{pointerType:'touch',pointerId:81});assert.equal(viewport.freeNavigation.wasTouchGesture(81),false);assert.equal(t.selected.id,'P');
 await t.close();
});

test('V0.19 orbite : changements de vue répétés sans listener accumulé ni inertie pendant le gizmo',async()=>{
 const t=setupInteractionViewport([beam('P',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100})]),{viewport,pointer,renderer}=t;
 try{
  const gesture=()=>{pointer('pointerdown',400,300);pointer('pointermove',430,318);pointer('pointerup',430,318)};
  viewport.view('iso');gesture();const expected=viewport.camera.position.clone();
  for(let i=0;i<6;i++){viewport.view('top');viewport.setNavigation('free');viewport.view('iso');viewport.setNavigation('orbit');viewport.view('front');viewport.view('iso')}
  gesture();assert.ok(viewport.camera.position.distanceTo(expected)<1e-7,'un seul contrôleur répond à chaque mouvement après six transitions');
  viewport.select(['P']);viewport.setTool('translate');viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});const position=viewport.camera.position.clone(),quaternion=viewport.camera.quaternion.clone();
  assert.equal(viewport.controls.enabled,false);for(let i=0;i<12;i++)renderer.loop();assert.ok(viewport.camera.position.distanceTo(position)<1e-10);assert.ok(viewport.camera.quaternion.angleTo(quaternion)<1e-7);viewport.cancelInteraction();
  viewport.view('top');const top=viewport.camera.quaternion.clone();pointer('pointerdown',400,300);pointer('pointermove',440,330);pointer('pointerup',440,330);assert.ok(viewport.camera.quaternion.angleTo(top)<1e-7);
 }finally{await t.close()}
});

test('V0.19 poignées visibles au zoom fort : réancrage sans saut et déplacement relatif exact',async()=>{
 const t=setupInteractionViewport([beam('L',[-50000,2000,0],[50000,2000,0])]),{viewport,p,renderer}=t;
 try{
  p.snap=false;p.assistance={guides:false};p.objectSnap={enabled:false};viewport.set(buildProject(p),p);viewport.view('front');viewport.camera.position.x=40;viewport.controls.target.x=40;viewport.camera.zoom=100;viewport.camera.updateProjectionMatrix();viewport.camera.updateMatrixWorld();
  viewport.scene.updateMatrixWorld(true);const mesh=viewport.objects[0],original=mesh.matrixWorld.clone(),saved=JSON.stringify(p);viewport.select(['L']);viewport.setTool('translate');renderer.loop();viewport.scene.updateMatrixWorld(true);
  assert.ok(Math.max(...mesh.matrixWorld.elements.map((n,i)=>Math.abs(n-original.elements[i])))<1e-8);let screen=viewport.pivot.position.clone().project(viewport.camera);assert.ok(Math.abs(screen.x)<=.650001&&Math.abs(screen.y)<=.650001);assert.equal(viewport.transform.getHelper().userData.reanchored,true);
  viewport.camera.position.x=45;viewport.controls.target.x=45;viewport.camera.zoom=500;viewport.camera.updateProjectionMatrix();renderer.loop();viewport.scene.updateMatrixWorld(true);screen=viewport.pivot.position.clone().project(viewport.camera);assert.ok(Math.abs(screen.x)<=.650001&&Math.abs(screen.y)<=.650001);assert.ok(Math.max(...mesh.matrixWorld.elements.map((n,i)=>Math.abs(n-original.elements[i])))<1e-8);assert.equal(JSON.stringify(p),saved);
  viewport.transform.axis='X';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.x+=.0125;viewport.transform.dispatchEvent({type:'objectChange'});viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.ok(Math.abs(t.payload.delta[0]-12.5)<1e-7);assert.equal(JSON.stringify(p),saved);
 }finally{await t.close()}
});

test('V0.19 rotation au zoom fort : centre naturel conservé, aucune translation parasite',async()=>{
 const t=setupInteractionViewport([beam('L',[-50000,2000,0],[50000,2000,0])]),{viewport,p,renderer}=t;
 try{
  p.snap=false;viewport.set(buildProject(p),p);viewport.view('front');viewport.camera.position.x=45;viewport.controls.target.x=45;viewport.camera.zoom=500;viewport.camera.updateProjectionMatrix();viewport.camera.updateMatrixWorld();
  viewport.select(['L']);viewport.setTool('translate');renderer.loop();assert.equal(viewport.transform.getHelper().userData.reanchored,true);viewport.scene.updateMatrixWorld(true);const mesh=viewport.objects[0],initial=mesh.matrixWorld.clone();
  viewport.setTool('rotate');renderer.loop();viewport.scene.updateMatrixWorld(true);assert.equal(viewport.transform.getHelper().userData.reanchored,false);assert.ok(viewport.pivot.position.distanceTo(new THREE.Vector3(0,2,0))<1e-9);assert.ok(Math.max(...mesh.matrixWorld.elements.map((n,i)=>Math.abs(n-initial.elements[i])))<1e-8);
  const center=mesh.getWorldPosition(new THREE.Vector3());viewport.transform.axis='Y';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4);viewport.scene.updateMatrixWorld(true);assert.ok(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(center)<1e-9);viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();
  assert.deepEqual(t.payload.delta,[0,0,0]);assert.deepEqual(t.payload.pivot,[0,2000,0]);assert.ok(Math.abs(t.payload.angle-45)<1e-8);
 }finally{await t.close()}
});

test('V0.19 clic droit court ouvre le menu, glissement droit navigue sans menu',async()=>{
 const t=setupInteractionViewport([beam('P',[0,0,0],[0,2000,0],{kind:'post',width:100,height:100})]),{viewport,pointer,screen}=t;let menus=[];viewport.onContextMenu=(part,event)=>menus.push({part,event});
 try{
  for(const mode of ['orbit','free']){
   viewport.view('front');if(mode==='free')viewport.setNavigation('free');const point=screen([0,1000,-50]),before=viewport.camera.position.clone();
   pointer('pointerdown',...point,2);pointer('pointermove',point[0]+2,point[1]+1,2);pointer('pointerup',point[0]+2,point[1]+1,2);assert.equal(menus.length,mode==='orbit'?1:2);assert.equal(menus.at(-1).part.id,'P');assert.ok(viewport.camera.position.distanceTo(before)<1e-9);
   const count=menus.length;pointer('pointerdown',...point,2);pointer('pointermove',point[0]+60,point[1]+30,2);pointer('pointerup',point[0]+60,point[1]+30,2);assert.equal(menus.length,count);assert.ok(viewport.camera.position.distanceTo(before)>.01);
   pointer('pointerdown',...point,2);pointer('pointermove',point[0]+60,point[1]+30,2);pointer('pointermove',...point,2);pointer('pointerup',...point,2);assert.equal(menus.length,count,'un glissement aller-retour ne devient pas un clic de menu');
  }
 }finally{await t.close()}
});

test('V0.19 cotes 3D : sprites cliquables et métadonnées des deux références',async()=>{
 const t=setupInteractionViewport([beam('A',[0,0,0],[0,2000,0],{kind:'post'}),beam('B',[1000,0,0],[1000,2000,0],{kind:'post'})]),{viewport,click}=t;let edit;
 try{viewport.view('top');viewport.select(['A','B']);viewport.onDimensionEdit=data=>edit=data;viewport.updateHighlights();const sprite=viewport.selectionMeasureGroup.children.find(o=>o.isSprite&&o.userData.dimensionEdit?.measure==='faces');assert.ok(sprite);const position=sprite.getWorldPosition(new THREE.Vector3()).project(viewport.camera);click((position.x+1)*400,(1-position.y)*300);assert.deepEqual(edit,{referenceIds:['A','B'],measure:'faces'});assert.equal(t.selected,undefined)}finally{await t.close()}
});

test('V0.23 pose explicite sur face puis plan de travail : support choisi',async()=>{
 const t=setupInteractionViewport([beam('post',[0,0,0],[0,2000,0],{kind:'post',width:150,height:150})]),{viewport,screen,p}=t;
 try{
  p.placementSurface='face';viewport.view('top');const before=JSON.stringify(p),part=beam('new',[-500,1000,0],[500,1000,0]);viewport.beginPlacement(part,()=>{});const point=screen([0,2000,0]);viewport.updateInteraction({clientX:point[0],clientY:point[1],altKey:false});const placed=viewport.interaction.placedPart;
  assert.equal(viewport.interaction.supportId,'post');assert.ok(Math.abs(Math.min(...partPlacementCorners(placed).map(c=>c.y))-2000)<1e-7);assert.equal(JSON.stringify(p),before);
  viewport.cancelInteraction();p.placementSurface='workplane';p.workplane.lock=true;viewport.set(buildProject(p),p);viewport.view('top');viewport.beginPlacement(part,()=>{});const again=screen([0,2000,0]);viewport.updateInteraction({clientX:again[0],clientY:again[1],altKey:false});assert.equal(viewport.interaction.supportId,null);assert.ok(Math.abs(Math.min(...partPlacementCorners(viewport.interaction.placedPart).map(c=>c.y)))<1e-7);
 }finally{await t.close()}
});

test('V0.19 panneau souris : huit poignées, aperçu sans mutation, application au relâchement et annulation',async()=>{
 const corners=[[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0]],panel={id:'mesh',kind:'panel',material:'mesh',a:corners[0],b:corners[2],corners,width:1,height:1};const t=setupInteractionViewport([panel]),{viewport,pointer,screen,p}=t;let calls=[];viewport.onPanelResize=(id,points)=>calls.push({id,points});
 try{
  viewport.view('front');viewport.select(['mesh']);viewport.setTool('resize');assert.equal(viewport.panelHandleGroup.children.length,8);assert.equal(viewport.transform.object,undefined);const original=JSON.stringify(p),object=viewport.objects[0],geometry=Array.from(object.geometry.attributes.position.array);
  const start=screen([1000,1000,0]),end=screen([1300,1200,0]);pointer('pointerdown',...start);assert.ok(viewport.panelDrag);pointer('pointermove',...end);assert.equal(viewport.controls.enabled,false);assert.equal(object.visible,false);assert.equal(calls.length,0);assert.equal(JSON.stringify(p),original);pointer('pointerup',...end);assert.equal(calls.length,1);assert.equal(viewport.canConfirmInteraction(),false);assert.equal(JSON.stringify(p),original);assert.deepEqual(Array.from(object.geometry.attributes.position.array),geometry);
  assert.equal(calls[0].id,'mesh');assert.deepEqual(calls[0].points,[[0,0,0],[1300,0,0],[1300,1200,0],[0,1200,0]]);assert.equal(viewport.confirmInteraction(),false);assert.equal(object.visible,true);
  viewport.refreshPanelHandles();pointer('pointerdown',...start);pointer('pointermove',...end);viewport.cancelInteraction();assert.equal(viewport.panelDrag,null);assert.equal(object.visible,true);assert.equal(viewport.canConfirmInteraction(),false);assert.equal(calls.length,1);assert.equal(JSON.stringify(p),original);
  pointer('pointerdown',...start);pointer('pointermove',...end);t.window.dispatchEvent(new t.window.Event('blur'));assert.equal(viewport.panelDrag,null);assert.equal(object.visible,true);assert.equal(calls.length,1);
 }finally{await t.close()}
});

test('V0.19 panneau tactile : aperçu à confirmer, validation unique et annulation sans mutation',async()=>{
 const corners=[[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0]],panel={id:'mesh',kind:'panel',material:'mesh',a:corners[0],b:corners[2],corners,width:1,height:1};const t=setupInteractionViewport([panel]),{viewport,pointer,screen,p}=t;let calls=0,state;viewport.onPanelResize=()=>calls++;viewport.onInteractionStateChange=value=>state=value;
 try{
  viewport.view('front');viewport.select(['mesh']);viewport.setTool('resize');const original=JSON.stringify(p),object=viewport.objects[0],start=screen([1000,1000,0]),end=screen([1300,1200,0]);
  const move=()=>{pointer('pointerdown',...start,0,{pointerType:'touch'});assert.equal(state.type,'resize');assert.equal(state.canConfirm,false);pointer('pointermove',...end,0,{pointerType:'touch'});pointer('pointerup',...end,0,{pointerType:'touch'})};
  move();assert.equal(calls,0);assert.equal(state.type,'resize');assert.equal(state.canConfirm,true);assert.equal(object.visible,false);assert.equal(JSON.stringify(p),original);assert.equal(viewport.confirmInteraction(),true);assert.equal(calls,1);assert.equal(viewport.confirmInteraction(),false);assert.equal(object.visible,true);
  move();viewport.cancelInteraction();assert.equal(calls,1);assert.equal(object.visible,true);assert.equal(viewport.canConfirmInteraction(),false);assert.equal(JSON.stringify(p),original);
 }finally{await t.close()}
});

test('V0.19 textures, isolation et clavier : actions de vue sans modification géométrique',async()=>{
 const t=setupInteractionViewport([beam('A',[0,0,0],[0,2000,0],{kind:'post'}),beam('B',[4000,0,0],[4000,2000,0],{kind:'post'})]),{viewport,p}=t;
 try{
  const original=JSON.stringify(p),wood=viewport.objects[0],sideMaterial=wood.material[0],map=sideMaterial.map,geometry=Array.from(wood.geometry.attributes.position.array);assert.ok(map?.userData.atelierPhotoTexture);assert.equal(wood.material[1].map.isDataTexture,true);assert.equal(wood.geometry.userData.woodGrain,'longitudinal');viewport.layer('textures',false);assert.equal(sideMaterial.map,null);viewport.layer('textures',true);assert.equal(sideMaterial.map,map);assert.deepEqual(Array.from(wood.geometry.attributes.position.array),geometry);
  viewport.select(['A']);viewport.setTool('translate');viewport.setIsolation(['B']);assert.equal(wood.visible,false);assert.equal(viewport.transform.object,undefined);assert.equal(viewport.objects[1].visible,true);viewport.setIsolation(null);assert.equal(wood.visible,true);assert.equal(viewport.focusSelection(['A']),true);
  viewport.view('top');let f=viewport.getKeyboardFrame();assert.ok(Math.abs(f.right[0]-1)<1e-7&&Math.abs(f.up[2]+1)<1e-7);viewport.view('front');f=viewport.getKeyboardFrame();assert.ok(Math.abs(f.right[0]+1)<1e-7&&Math.abs(f.up[1]-1)<1e-7);viewport.view('iso');f=viewport.getKeyboardFrame();assert.ok(Math.abs(f.right[1])<1e-7&&Math.abs(f.up[1])<1e-7);assert.equal(JSON.stringify(p),original);
 }finally{await t.close()}
});

test('V0.23 : Sol par défaut, face sur demande, statut court et coordonnées séparées',async()=>{
 const t=setupInteractionViewport([beam('post',[0,0,0],[0,2000,0],{kind:'post',width:150,height:150})]),{viewport,screen,p}=t;let coordinates,info,placed;
 try{
  viewport.onCoordinates=value=>coordinates=value;viewport.view('top');const part=beam('new',[-500,1000,0],[500,1000,0]),point=screen([0,2000,0]);
  viewport.beginPlacement(part,()=>{});viewport.updateInteraction({clientX:point[0],clientY:point[1],altKey:false});assert.equal(viewport.interaction.supportId,null);assert.ok(Math.abs(Math.min(...partPlacementCorners(viewport.interaction.placedPart).map(c=>c.y)))<1e-7);assert.equal(coordinates.length,3);assert.ok(!t.status.includes(' · X '));
  viewport.cancelInteraction();assert.equal(coordinates,null);p.placementSurface='face';viewport.beginPlacement(part,(piece,details)=>{placed=piece;info=details});viewport.updateInteraction({clientX:point[0],clientY:point[1],altKey:false});viewport.updateHighlights();assert.equal(viewport.dimGroup.children[0].material.opacity,.3);assert.ok(viewport.previewGroup.getObjectByName('contact-target-face'));let markers=0;viewport.previewGroup.traverse(o=>{if(o.name==='feedback-marker')markers++});assert.equal(markers,1);
  assert.equal(viewport.confirmInteraction(),true);assert.equal(info.surface,'face');assert.equal(info.supportId,'post');assert.equal(info.snap.targetId,'post');assert.ok(Math.abs(Math.min(...partPlacementCorners(placed).map(c=>c.y))-2000)<1e-7);assert.equal(viewport.confirmInteraction(),false);viewport.updateHighlights();assert.equal(viewport.dimGroup.children[0].material.opacity,1);
 }finally{await t.close()}
});

test('V0.23 : un déplacement transmet son contact et présente deux cotes temporaires au maximum',async()=>{
 const t=setupInteractionViewport([beam('A',[0,0,0],[0,2000,0],{kind:'post'}),beam('B',[1000,0,0],[1000,2000,0],{kind:'post'})]),{viewport}=t;
 try{
  viewport.view('top');viewport.select(['B']);viewport.setTool('translate');viewport.transform.axis='X';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.x+=.2;viewport.transform.dispatchEvent({type:'objectChange'});
  const labels=viewport.selectionMeasureGroup.children.filter(o=>o.isSprite);assert.equal(labels.length,2);labels.forEach(label=>assert.deepEqual(label.userData.dimensionEdit.referenceIds,['A','B']));assert.equal(viewport.pickDimension({clientX:400,clientY:300}),null,'pas d’édition pendant le geste');
  viewport.transform.dispatchEvent({type:'mouseUp'});viewport.transform.dragging=false;await Promise.resolve();assert.equal(t.payload.snap,null);assert.ok(Math.abs(t.payload.delta[0]-200)<1e-6);
  viewport.showGuideLines([{a:[0,0,0],b:[1000,0,0],label:'Centré',kind:'alignment'},{a:[0,0,0],b:[0,1000,0],label:'Aligné',kind:'alignment'},{a:[0,0,0],b:[0,0,1000],label:'Grille',kind:'alignment'}]);assert.equal(viewport.guideGroup.children.filter(o=>o.isSprite).length,1);
 }finally{await t.close()}
});


test('V0.27.1 grillage : poignées immédiates, tirage du côté sans mode spécial, caméra stable',async()=>{
 const panel={id:'M',kind:'panel',material:'mesh',a:[0,0,0],b:[1000,1000,0],width:1,height:1,corners:[[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0]]};
 const t=setupInteractionViewport([panel]),{viewport,pointer,screen}=t;let result;
 try{
  viewport.view('front');viewport.select(['M']);assert.equal(viewport.tool,'select');assert.equal(viewport.panelHandleGroup.children.length,8);
  const camera=viewport.camera.position.clone(),start=screen([1000,500,0]),end=screen([1500,500,0]);viewport.onPanelResize=(id,corners)=>result={id,corners};
  // A few pixels off the small visible handle remains easy to grab.
  pointer('pointerdown',start[0]+9,start[1]);assert.equal(viewport.panelDrag?.handleId,'edge-1');pointer('pointermove',end[0]+9,end[1]);pointer('pointerup',end[0]+9,end[1]);
  assert.deepEqual(result,{id:'M',corners:[[0,0,0],[1500,0,0],[1500,1000,0],[0,1000,0]]});assert.deepEqual(viewport.camera.position,camera);
  viewport.setTool('translate');assert.equal(viewport.panelHandleGroup.children.length,8);assert.ok(viewport.transform.object);
  pointer('pointerdown',...start);pointer('pointermove',...end);pointer('pointerup',...end);assert.ok(viewport.transform.object,'translation gizmo restored');
  viewport.setTool('rotate');assert.equal(viewport.panelHandleGroup.children.length,0);
 }finally{await t.close()}
});
test('V0.27.1 mur : longueur en vue de dessus, hauteur de face, aucune épaisseur modifiée',async()=>{
 const wall={id:'W',kind:'wall',material:'wall',a:[0,0,0],b:[2000,0,0],height:2500,width:200,wallThickness:200};
 const t=setupInteractionViewport([wall]),{viewport,pointer,screen,p}=t;let result;
 try{
  viewport.select(['W']);viewport.view('top');viewport.onPanelResize=(id,corners)=>result=corners;
  let start=screen([2000,2500,0]),end=screen([2500,2500,0]);pointer('pointerdown',...start);assert.ok(viewport.panelDrag?.screenFallback);pointer('pointermove',...end);pointer('pointerup',...end);
  assert.equal(result[1][0],2500);assert.equal(result[2][1],2500);assert.deepEqual(result[0],[0,0,0]);
  viewport.view('front');start=screen([1000,2500,0]);end=screen([1000,3000,0]);pointer('pointerdown',...start);pointer('pointermove',...end);
  const preview=viewport.placementGroup.children[0].children.find(o=>o.isMesh);preview.geometry.computeBoundingBox();assert.equal(preview.geometry.boundingBox.max.y-preview.geometry.boundingBox.min.y,3);assert.ok(Math.abs(preview.geometry.boundingBox.max.z-preview.geometry.boundingBox.min.z-.2)<1e-6);
  pointer('pointerup',...end);assert.deepEqual(result,[[0,0,0],[2000,0,0],[2000,3000,0],[0,3000,0]]);assert.equal(p.freeParts[0].height,2500);
 }finally{await t.close()}
});

test('V0.29: placement footprint follows ground and aimed face, toggles and disappears on cancel/export',async()=>{
 const t=setupInteractionViewport([beam('post',[0,0,0],[0,2000,0],{kind:'post',width:150,height:150})]),{viewport,p,screen}=t;
 try{
  viewport.view('top');const point=screen([0,2000,0]),part=beam('new',[-500,1000,0],[500,1000,0]);viewport.beginPlacement(part,()=>{});viewport.updateInteraction({clientX:point[0],clientY:point[1],altKey:true});
  assert.equal(viewport.placementShadowGroup.children.length,1);let fill=viewport.placementShadowGroup.getObjectByName('placement-shadow-fill');fill.geometry.computeBoundingBox();assert.ok(Math.abs(fill.geometry.boundingBox.min.y-.0015)<1e-6);
  viewport.withCommittedTransforms(()=>assert.equal(viewport.placementShadowGroup.parent,null));assert.equal(viewport.placementShadowGroup.parent,viewport.scene);
  viewport.cancelInteraction();assert.equal(viewport.placementShadowGroup.children.length,0);
  p.placementSurface='face';viewport.beginPlacement(part,()=>{});viewport.updateInteraction({clientX:point[0],clientY:point[1],altKey:false});fill=viewport.placementShadowGroup.getObjectByName('placement-shadow-fill');fill.geometry.computeBoundingBox();assert.ok(Math.abs(fill.geometry.boundingBox.min.y-2.0015)<1e-6);
  p.assistance.placementShadow=false;viewport.updateInteraction({clientX:point[0],clientY:point[1],altKey:false});assert.equal(viewport.placementShadowGroup.children.length,0);
 }finally{await t.close();}
});

test('V0.29: drag footprint uses final snapped position, Alt keeps it visible and commit clears it',async()=>{
 const t=setupInteractionViewport([beam('P',[0,1500,0],[1000,1500,0])]),{viewport,p}=t;
 try{
  p.assistance.guides=false;p.objectSnap.enabled=false;viewport.select(['P']);viewport.setTool('translate');viewport.transform.axis='X';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.x+=.2;viewport.transform.dispatchEvent({type:'objectChange'});
  let fill=viewport.placementShadowGroup.getObjectByName('placement-shadow-fill');fill.geometry.computeBoundingBox();assert.ok(Math.abs(fill.geometry.boundingBox.min.x-.2)<1e-6);
  viewport.altKey=true;viewport.pivot.position.x+=.123;viewport.transform.dispatchEvent({type:'objectChange'});assert.equal(viewport.placementShadowGroup.children.length,1);viewport.cancelInteraction();assert.equal(viewport.placementShadowGroup.children.length,0);
  viewport.lastPointerType='touch';viewport.transform.axis='X';viewport.transform.dragging=true;viewport.transform.dispatchEvent({type:'mouseDown'});viewport.pivot.position.x+=.4;viewport.transform.dispatchEvent({type:'objectChange'});viewport.transform.dispatchEvent({type:'mouseUp'});assert.ok(viewport.pendingTransform);assert.equal(viewport.placementShadowGroup.children.length,1);viewport.confirmInteraction();assert.equal(viewport.placementShadowGroup.children.length,0);
 }finally{await t.close();}
});
