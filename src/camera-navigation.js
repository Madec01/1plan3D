import * as THREE from 'three';

// Chaque geste vise son propre point : aucun centre d'orbite permanent.
export class FreeNavigation {
 constructor(camera, element, onNavigate = () => {}, {pickPoint = () => null,onGestureStart = () => {},onGestureEnd = () => {}} = {}) {
  this.camera=camera; this.element=element; this.onNavigate=onNavigate;this.pickPoint=pickPoint;
  this.scale=4; this._enabled=false; this.drag=null;this.leftEnabled=true;this.touchEnabledDuringTool=false;
  this.touchMode='pan';this.touches=new Map();this.touchState=null;this.touchGestures=new Set();this._touchGesture=false;
  this.onGestureStart=onGestureStart;this.onGestureEnd=onGestureEnd;this.gestureType=null;
  this.handlers={
   pointerdown:e=>this.start(e), pointermove:e=>this.move(e),
   pointerup:e=>this.end(e), pointercancel:e=>this.cancel(e),
   lostpointercapture:e=>this.cancel(e), wheel:e=>this.wheel(e),
   contextmenu:e=>{if(this.enabled)e.preventDefault()}
  };
  for(const [type,fn] of Object.entries(this.handlers))element.addEventListener(type,fn,{passive:false});
  this.blur=()=>this.stop(); element.ownerDocument.defaultView.addEventListener('blur',this.blur);
 }
 get enabled(){return this._enabled}
 set enabled(value){this._enabled=!!value;if(!value)this.stop()}
 get touchActive(){return this.touches.size>0}
 get touchNavigating(){return this._touchGesture}
 wasTouchGesture(pointerId){return this.touchGestures.has(pointerId)}
 setTouchMode(mode){this.touchMode=mode==='rotate'?'rotate':'pan';if(this.touchActive)this.rebaseTouches();return this.touchMode}
 // A long press reserves one pointer for selection/placement. Pinching remains available.
 reserveTouch(pointerId){const p=this.touches.get(pointerId);if(!p||this.touches.size!==1||this._touchGesture)return false;p.reserved=true;this.touchState=null;return true}
 beginGesture(type){if(this.gestureType)return;this.gestureType=type;this.onGestureStart({pointerType:type})}
 finishGesture(){const type=this.gestureType;this.gestureType=null;if(type)this.onGestureEnd({pointerType:type})}
 markTouchGesture(){
  this._touchGesture=true;this.beginGesture('touch');
  for(const id of this.touches.keys())this.touchGestures.add(id);
  // Pointer IDs are arbitrary; retain a bounded history until an ID starts a new gesture.
  while(this.touchGestures.size>32)this.touchGestures.delete(this.touchGestures.values().next().value);
 }
 capture(id){try{this.element.setPointerCapture?.(id)}catch{}}
 release(id){try{if(this.element.hasPointerCapture?.(id))this.element.releasePointerCapture(id)}catch{}}
 pointAt(clientX,clientY){
  const r=this.element.getBoundingClientRect(),w=r.width||800,h=r.height||600;
  const pointer=new THREE.Vector2((clientX-(r.left||0))/w*2-1,-(clientY-(r.top||0))/h*2+1);
  this.camera.updateMatrixWorld();const raycaster=new THREE.Raycaster();raycaster.setFromCamera(pointer,this.camera);
  const ray=raycaster.ray,forward=this.camera.getWorldDirection(new THREE.Vector3()),point=this.pickPoint(ray.clone());
  if(point?.isVector3&&point.toArray().every(Number.isFinite)){
   const delta=point.clone().sub(ray.origin),depth=delta.dot(forward);
   if(depth>this.camera.near*2&&delta.length()<this.camera.far*.9)return point.clone();
  }
  // Sans surface, un plan de profondeur locale garde le point sous le curseur.
  const depth=Math.min(this.camera.far*.1,Math.max(this.camera.near*10,this.scale*2));
  return ray.at(depth/Math.max(.05,ray.direction.dot(forward)),new THREE.Vector3());
 }
 start(e){
  if(e.pointerType==='touch'){this.startTouch(e);return}
  if(!this.enabled||this.drag||this.touchActive||![0,1,2].includes(e.button)||e.button===0&&!this.leftEnabled)return;
  const anchor=this.pointAt(e.clientX,e.clientY);
  this.drag={depth:anchor.clone().sub(this.camera.position).dot(this.camera.getWorldDirection(new THREE.Vector3())),id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,active:false,pivot:e.button===2?anchor:null};
  this.capture(e.pointerId);
  if(e.button!==0)e.preventDefault();
 }
 move(e){
  if(this.touches.has(e.pointerId)){this.moveTouch(e);return}
  const d=this.drag;if(!this.enabled||!d||d.id!==e.pointerId)return;
  if(!d.active&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<=5)return;
  if(!d.active)this.beginGesture(e.pointerType||'mouse');d.active=true;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;
  if(d.button===2&&!e.shiftKey)this.rotateAround(d.pivot,dx,dy,e.altKey?.15:1);
  else {const delta=this.pan(dx,dy,e.altKey?.15:1,d.depth);d.pivot?.add(delta)}
  e.preventDefault();this.onNavigate();
 }
 startTouch(e){
  if(!this.enabled||this.touches.has(e.pointerId))return;
  if(this.drag)this.stop();
  this.touchGestures.delete(e.pointerId);
  this.touches.set(e.pointerId,{id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,reserved:false});
  this.capture(e.pointerId);this.rebaseTouches();
  // Even a stationary two-finger contact must never become an object tap.
  if(this.touches.size>1){this.markTouchGesture();this.onNavigate()}
  e.preventDefault();
 }
 rebaseTouches(){
  const pointers=[...this.touches.values()];
  if(!pointers.length){this.touchState=null;return}
  const pair=pointers.slice(0,2),x=pair.reduce((sum,p)=>sum+p.x,0)/pair.length,y=pair.reduce((sum,p)=>sum+p.y,0)/pair.length;
  const anchor=this.pointAt(x,y),depth=anchor.clone().sub(this.camera.position).dot(this.camera.getWorldDirection(new THREE.Vector3()));
  this.touchState={ids:pair.map(p=>p.id),x,y,anchor,depth,distance:pair.length===2?Math.max(2,Math.hypot(pair[1].x-pair[0].x,pair[1].y-pair[0].y)):0};
  // Rebase thresholds too: joining/leaving fingers never replays earlier movement.
  for(const p of pointers){p.startX=p.x;p.startY=p.y}
 }
 moveTouch(e){
  const p=this.touches.get(e.pointerId);if(!this.enabled||!p)return;
  p.x=e.clientX;p.y=e.clientY;const d=this.touchState;
  if(!d||!d.ids.includes(e.pointerId))return;
  if(d.ids.length===2){
   const [a,b]=d.ids.map(id=>this.touches.get(id));if(!a||!b)return;
   const x=(a.x+b.x)/2,y=(a.y+b.y)/2,distance=Math.max(2,Math.hypot(b.x-a.x,b.y-a.y));
   if(x===d.x&&y===d.y&&distance===d.distance)return;
   this.markTouchGesture();
   // Keep the world point picked at pinch start under the moving centroid.
   // Dolly first, then pan at its new depth; orientation is unchanged.
   const delta=d.anchor.clone().sub(this.camera.position),oldDistance=delta.length();
   const depth=delta.dot(this.camera.getWorldDirection(new THREE.Vector3()));
   if(oldDistance>0&&depth>0){
    const minimum=this.camera.near*4*oldDistance/Math.max(depth,this.camera.near);
    const next=Math.max(minimum,Math.min(Math.max(oldDistance,this.camera.far*.8),oldDistance*d.distance/distance));
    this.camera.position.addScaledVector(delta,1-next/oldDistance);this.camera.updateMatrixWorld();
   }
   const nextDepth=d.anchor.clone().sub(this.camera.position).dot(this.camera.getWorldDirection(new THREE.Vector3()));
   this.pan(x-d.x,y-d.y,1,nextDepth);d.x=x;d.y=y;d.distance=distance;
   e.preventDefault();this.onNavigate();return;
  }
  if(p.reserved||(!this.leftEnabled&&!this.touchEnabledDuringTool))return;
  if(!this._touchGesture&&Math.hypot(p.x-p.startX,p.y-p.startY)<4)return;
  const dx=p.x-d.x,dy=p.y-d.y;if(!dx&&!dy)return;
  this.markTouchGesture();
  if(this.touchMode==='rotate')this.rotateAround(d.anchor,dx,dy);
  else this.pan(dx,dy,1,d.depth);
  d.x=p.x;d.y=p.y;e.preventDefault();this.onNavigate();
 }
 endTouch(e){
  if(!this.touches.has(e.pointerId))return;
  const moved=this._touchGesture||this.touchGestures.has(e.pointerId);
  this.touches.delete(e.pointerId);this.release(e.pointerId);
  if(moved){this.touchGestures.add(e.pointerId);this.onNavigate();e.preventDefault()}
  if(this.touches.size)this.rebaseTouches();
  else {this.touchState=null;this._touchGesture=false;this.finishGesture()}
 }
 rotateAround(pivot,dx,dy,factor=1){
  const up=this.camera.up.clone().normalize();
  const yaw=new THREE.Quaternion().setFromAxisAngle(up,-dx*.004*factor);
  const orientation=yaw.clone().multiply(this.camera.quaternion);
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(orientation);
  const elevation=Math.asin(THREE.MathUtils.clamp(forward.dot(up),-1,1));
  const next=THREE.MathUtils.clamp(elevation-dy*.004*factor,-Math.PI/2+.01,Math.PI/2-.01);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(orientation);
  const rotation=new THREE.Quaternion().setFromAxisAngle(right,next-elevation).multiply(yaw);
  // La même rotation pour la position et le repère évite un saut/recentrage du point visé.
  this.camera.position.sub(pivot).applyQuaternion(rotation).add(pivot);
  this.camera.quaternion.premultiply(rotation).normalize();this.camera.updateMatrixWorld();
 }
 pan(dx,dy,factor=1,depth=this.scale*2){
  const height=this.element.getBoundingClientRect().height||600,unit=2*Math.max(this.camera.near*4,depth)*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))/height*factor;
  const delta=new THREE.Vector3(-dx*unit,dy*unit,0).applyQuaternion(this.camera.quaternion);
  this.camera.position.add(delta);this.camera.updateMatrixWorld();return delta;
 }
 zoomAt(clientX,clientY,pixels,factor=1){
  const point=this.pointAt(clientX,clientY),delta=point.clone().sub(this.camera.position),distance=delta.length();
  if(!distance)return;
  const depth=delta.dot(this.camera.getWorldDirection(new THREE.Vector3()));
  const minimum=this.camera.near*4*distance/Math.max(depth,this.camera.near);
  const next=Math.max(minimum,distance*Math.exp(THREE.MathUtils.clamp(pixels,-400,400)*.0015*factor));
  this.camera.position.addScaledVector(delta,1-next/distance);this.camera.updateMatrixWorld();this.onNavigate();
 }
 zoom(delta){const r=this.element.getBoundingClientRect();this.zoomAt((r.left||0)+(r.width||800)/2,(r.top||0)+(r.height||600)/2,-Math.log(delta)/.0015)}
 wheel(e){
  if(!this.enabled||this.touchActive)return;e.preventDefault();
  const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?(this.element.getBoundingClientRect().height||600):1);
  this.zoomAt(e.clientX,e.clientY,pixels,e.shiftKey?.15:1);
 }
 end(e){if(this.touches.has(e.pointerId)){this.endTouch(e);return}if(this.drag?.id===e.pointerId)this.stop()}
 cancel(e){if(this.touches.has(e.pointerId)||this.drag?.id===e.pointerId)this.stop()}
 stop(){
  const d=this.drag;this.drag=null;
  if(d){if(d.active)this.onNavigate();this.release(d.id)}
  const ids=[...this.touches.keys()];
  if(ids.length){for(const id of ids)this.touchGestures.add(id);while(this.touchGestures.size>32)this.touchGestures.delete(this.touchGestures.values().next().value);this.touches.clear();this.touchState=null;this._touchGesture=false;for(const id of ids)this.release(id);this.onNavigate()}
  this.finishGesture();
 }
 dispose(){this.stop();for(const [type,fn]of Object.entries(this.handlers))this.element.removeEventListener(type,fn);this.element.ownerDocument.defaultView.removeEventListener('blur',this.blur)}
}

export function perspectiveFromOrtho(ortho,perspective,target){
 perspective.quaternion.copy(ortho.quaternion);perspective.up.copy(ortho.up);
 const halfHeight=(ortho.top-ortho.bottom)/ortho.zoom/2;
 const distance=halfHeight/Math.tan(THREE.MathUtils.degToRad(perspective.fov/2));
 perspective.position.copy(target).add(ortho.getWorldDirection(new THREE.Vector3()).multiplyScalar(-distance));
 perspective.zoom=1;perspective.updateProjectionMatrix();perspective.updateMatrixWorld();
}

/** Conserve le cadrage au plan visé lors du retour en caméra orthographique. */
export function orthographicFromPerspective(perspective,ortho,target){
 const forward=perspective.getWorldDirection(new THREE.Vector3());
 const depth=Math.max(perspective.near*10,target.clone().sub(perspective.position).dot(forward));
 ortho.position.copy(perspective.position);ortho.quaternion.copy(perspective.quaternion);ortho.up.copy(perspective.up);
 ortho.zoom=(ortho.top-ortho.bottom)/(2*depth*Math.tan(THREE.MathUtils.degToRad(perspective.fov/2))/perspective.zoom);
 ortho.updateProjectionMatrix();ortho.updateMatrixWorld();return depth;
}

/** Point d'affichage du manipulateur : reste devant la caméra et dans une marge écran. */
export function accessiblePivotPosition(camera,point,{margin=.65,fallbackDepth=4}={}){
 camera.updateMatrixWorld();const forward=camera.getWorldDirection(new THREE.Vector3()),depth=point.clone().sub(camera.position).dot(forward);
 const candidate=point.clone();
 if(depth<=camera.near*4){const d=Math.max(camera.near*10,fallbackDepth);candidate.copy(camera.position).addScaledVector(forward,d)}
 const projected=candidate.clone().project(camera);if(!projected.toArray().every(Number.isFinite))return camera.position.clone().addScaledVector(forward,Math.max(1,fallbackDepth));
 projected.x=THREE.MathUtils.clamp(projected.x,-margin,margin);projected.y=THREE.MathUtils.clamp(projected.y,-margin,margin);
 return projected.unproject(camera);
}

/** Taille TransformControls pour une longueur d'axe constante en pixels CSS. */
export function gizmoSizeForPixels(camera,point,height,pixels=105){
 const h=Math.max(1,height),desired=Math.min(pixels,h*.28);
 if(camera.isOrthographicCamera)return desired*4/h;
 const offset=point.clone().sub(camera.position),distance=Math.max(camera.near,offset.length()),depth=Math.max(camera.near,offset.dot(camera.getWorldDirection(new THREE.Vector3())));
 return desired*8*depth/(1.9*h*distance);
}

/** Repère de déplacement vu à l'écran, éventuellement projeté dans le plan verrouillé. */
export function keyboardCameraFrame(camera,{normal=null}={}){
 const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).normalize(),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).normalize();
 if(normal){const n=normal.clone().normalize();right.addScaledVector(n,-right.dot(n));if(right.lengthSq()<1e-8){right.copy(up).cross(n)}right.normalize();up.copy(n).cross(right).normalize();if(up.dot(new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion))<0)up.negate();return {right:right.toArray(),up:up.toArray(),normal:n.toArray()}}
 return {right:right.toArray(),up:up.toArray(),normal:new THREE.Vector3().crossVectors(right,up).normalize().toArray()};
}
