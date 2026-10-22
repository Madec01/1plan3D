import * as THREE from 'three';
import {captureViewportView} from './view-export.js';
import {buildJointFixings,getFoundationJoints,createFixingGeometry} from './fixings.js';
import { FreeNavigation, perspectiveFromOrtho,orthographicFromPerspective,accessiblePivotPosition,gizmoSizeForPixels,keyboardCameraFrame } from './camera-navigation.js';
import {workplaneFrame, snapMovement} from './workplane.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { timberQuaternion, panelGeometry } from './geometry.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import {placePartOnWorkplane,partPlacementCorners,measurePoints,getLiveSnapSuggestion,translatedPreviewParts,correctionRespectsAxes} from './scene-interactions.js';
import {normalizeAssistance,resolveAdaptiveGrid,placementAnchor,snapDeltaToGrid,smartPlacementGuides} from './adaptive-placement.js';
import {createPlacementShadow} from './placement-shadow.js';
import {betweenMeasurements} from './between-placement.js';
import {findObjectSnap,objectSnapTranslationIsValid} from './object-snapping.js';
import {panelResizeFrame,resizePanelFromDrag,intersectPanelResizePlane,surfaceResizePatch,resizeScreenDelta} from './panel-resize.js';
import {createPartMaterial,createGroundMaterial,applyWoodGrainUV,setMaterialTextures,disposeVisualMaterial,createFocusOverlay,createFeedbackMarker,createContactFaceOverlay,withCleanVisuals} from './viewport-visuals.js';

export class Viewport {
 constructor(canvas,onSelect,onTransform,createRenderer=options=>new THREE.WebGLRenderer(options)){
  this.canvas=canvas;this.onSelect=onSelect;this.onTransform=onTransform;this.flags={mesh:true,roof:true,foundation:true,dimensions:true,joints:false,wall:true,fixings:true};this.selectedIds=[];this.tool='select';this.center=new THREE.Vector3(0,1,0);this.liveSnap=true;this.altKey=false;this.interaction=null;this.touchMode='pan';this.multiSelect=false;this.touchPointers=new Map();this.touchSequenceBlocked=false;this.lastPointerType='mouse';this.pendingTransform=null;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#f1f2ec');
  this.orbitCamera=new THREE.OrthographicCamera(-5,5,4,-4,.01,1000);this.freeCamera=new THREE.PerspectiveCamera(50,1,.005,2000);this.camera=this.orbitCamera;this.navigation='orbit';
  this.renderer=createRenderer({canvas,antialias:true,preserveDrawingBuffer:true});this.fullPixelRatio=Math.min(window.devicePixelRatio||1,2);this.renderer.setPixelRatio(this.fullPixelRatio);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.4;
  this.resetOrbitControls(this.center);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0xb7bc9e,2.2));const light=new THREE.DirectionalLight(0xfff4dd,3);light.position.set(-5,12,-4);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-15,right:15,top:15,bottom:-15});light.shadow.normalBias=.025;this.scene.add(light);
  this.textures=true;this.ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),createGroundMaterial());this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.035;this.ground.receiveShadow=true;this.scene.add(this.ground);
  this.grid=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xa0b6a9}));this.scene.add(this.grid);
  this.axes=new THREE.AxesHelper(1);this.axes.position.y=.01;this.scene.add(this.axes);
  this.group=new THREE.Group();this.scene.add(this.group);this.dimGroup=new THREE.Group();this.scene.add(this.dimGroup);this.jointGroup=new THREE.Group();this.scene.add(this.jointGroup);this.pivot=new THREE.Group();this.scene.add(this.pivot);this.fixingGroup=new THREE.Group();this.scene.add(this.fixingGroup);
  this.transform=new TransformControls(this.camera,canvas);this.transform.setSize(.8);this.scene.add(this.transform.getHelper());
  this.transform.addEventListener('dragging-changed',()=>{if(this.transform.dragging&&this.navigation==='orbit')this.resetOrbitControls(this.controls.target);this.syncNavigation()});
  this.transform.addEventListener('objectChange',()=>{
   if((this.tool!=='translate'&&!this.selectedFixing)||!this.dragStart)return;
   this.dragRawDelta=this.pivot.position.clone().sub(this.dragStart).multiplyScalar(1000).toArray();this.updateDragPosition();
  });
  this.transform.addEventListener('mouseDown',()=>{
   this.clearPrecisionTimer();this.dragTouch=this.lastPointerType==='touch';for(const point of this.touchPointers.values())point.transform=true;this.dragSnapshot={position:this.pivot.position.clone(),quaternion:this.pivot.quaternion.clone(),scale:this.pivot.scale.clone()};
   this.clear(this.panelHandleGroup);this.dragStart=this.pivot.position.clone();this.suppressClick=Date.now();this.dragIds=[...this.selectedIds];this.dragAxis=this.transform.axis||'XYZ';this.dragQuaternion=this.pivot.quaternion.toArray();this.dragParts=(this.project?.freeParts||[]).filter(p=>this.dragIds.includes(p.id)).map(p=>structuredClone(p));this.dragGrid=resolveAdaptiveGrid(this.project,this.project?.mode==='free'?this.project.freeParts:this.model.parts);this.dragAssistance=normalizeAssistance(this.project.assistance);this.dragRawDelta=[0,0,0];this.lastGridDelta=[0,0,0];this.gridBlocked=false;this.snapCandidate=null;this.guideCandidate=null;this.setHover(null);this.clear(this.selectionMeasureGroup);this.drawGrid(this.dragGrid,this.dragStart.clone().multiplyScalar(1000));
  });
  this.transform.addEventListener('mouseUp',()=>{
   this.suppressClick=Date.now();if(!this.dragStart)return;
   if(this.tool==='translate'||this.selectedFixing)this.updateDragPosition();
   let delta=this.pivot.position.clone().sub(this.dragStart).multiplyScalar(1000).toArray();
   const angle=2*Math.atan2(this.pivot.quaternion.y,this.pivot.quaternion.w)*180/Math.PI;
   const payload={delta,axis:'y',angle:this.tool==='rotate'?angle:0,pivot:this.dragStart.clone().multiplyScalar(1000).toArray(),snap:this.tool==='translate'&&this.snapCandidate?structuredClone(this.snapCandidate):null};
   const pending={ids:[...this.dragIds],fixing:this.selectedFixing,payload,snapshot:this.dragSnapshot},touch=this.dragTouch;this.clearDragState();
   if(touch&&(Math.hypot(...delta)>.001||Math.abs(payload.angle)>.001)){this.pendingTransform=pending;if(this.tool==='translate')this.showPlacementShadow(translatedPreviewParts((this.project.freeParts||[]).filter(p=>pending.ids.includes(p.id)),payload.delta),payload.snap?.localFrame,!!payload.snap);this.transform.detach();this.status('Déplacement en aperçu · Valider pour appliquer ou Annuler');this.syncNavigation()}
   else queueMicrotask(()=>this.commitTransform(pending));
  });
  this.freeNavigation=new FreeNavigation(this.freeCamera,canvas,()=>{this.suppressClick=Date.now()},{pickPoint:ray=>this.navigationPoint(ray)});
  this.previewGroup=new THREE.Group();this.scene.add(this.previewGroup);this.panelHandleGroup=new THREE.Group();this.scene.add(this.panelHandleGroup);this.installPanelInteraction();
  this.placementShadowGroup=new THREE.Group();this.placementShadowGroup.userData.previewOnly=true;this.placementShadowGroup.userData.excludeFromExport=true;this.scene.add(this.placementShadowGroup);
  this.highlightGroup=new THREE.Group();this.scene.add(this.highlightGroup);this.placementGroup=new THREE.Group();this.scene.add(this.placementGroup);this.measurementGroup=new THREE.Group();this.scene.add(this.measurementGroup);this.guideGroup=new THREE.Group();this.scene.add(this.guideGroup);this.arrangementGroup=new THREE.Group();this.scene.add(this.arrangementGroup);this.selectionMeasureGroup=new THREE.Group();this.scene.add(this.selectionMeasureGroup);
  this.orientationLabel=document.createElement('div');this.orientationLabel.className='scene-orientation';this.orientationLabel.style.cssText='position:absolute;left:14px;bottom:14px;padding:7px 10px;border-radius:8px;background:#fffffff0;color:#304c58;font:600 11px system-ui;pointer-events:none;z-index:3;box-shadow:0 1px 5px #23362418';canvas.parentElement.append(this.orientationLabel);
  this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();let start;
  this.installTouchInteraction();
  canvas.addEventListener('pointerdown',e=>{this.altKey=e.altKey;start=[e.clientX,e.clientY];if(e.button===2)this.contextGesture={id:e.pointerId,x:e.clientX,y:e.clientY,time:Date.now(),position:this.camera.position.clone(),quaternion:this.camera.quaternion.clone(),target:this.controls.target.clone()}});
  canvas.addEventListener('pointermove',e=>{this.altKey=e.altKey;if(this.contextGesture?.id===e.pointerId&&Math.hypot(e.clientX-this.contextGesture.x,e.clientY-this.contextGesture.y)>5)this.contextGesture.moved=true;if(e.pointerType==='touch'||this.transform.dragging||this.pendingTransform||this.pendingPanel||this.panelDrag)return;const resizeHandle=this.pickPanelHandle(e);if(resizeHandle){this.canvas.style.cursor='nwse-resize';this.setHover(null);return}this.canvas.style.cursor='';if(this.interaction){this.updateInteraction(e);return}this.setHover(this.pick(e)?.object||null)});
  canvas.addEventListener('pointerleave',()=>this.setHover(null));
  canvas.addEventListener('pointerup',e=>{this.altKey=e.altKey;if(e.button===2){this.finishContextClick(e);return}if(e.pointerType==='touch'){this.finishTouchTap(e);return}if(e.button!==0||Date.now()-(this.suppressClick||0)<220||!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5||this.pendingTransform)return;if(this.interaction){this.interactionClick(e);return}if(this.activateDimension(e))return;this.onSelect(this.pick(e)?.part??null,e)});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  this.modifierHandler=e=>{this.altKey=e.altKey;if(e.key==='Escape')this.cancelInteraction();if(this.dragStart&&(this.tool==='translate'||this.selectedFixing))this.updateDragPosition();if(this.interaction?.type==='placement'&&this.lastPlacementEvent)this.updateInteraction({...this.lastPlacementEvent,altKey:this.altKey})};window.addEventListener('keydown',this.modifierHandler);window.addEventListener('keyup',this.modifierHandler);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);this.resizeObserver.observe(canvas);this.resize();this.view('iso');
  this.renderer.setAnimationLoop(()=>{if(this.navigation==='orbit'&&this.controls.enabled&&!this.transform.dragging)this.controls.update();this.updateAccessibleGizmo();this.updateHighlights();this.renderer.render(this.scene,this.camera)});
 }
 resetOrbitControls(target=this.controls?.target||this.center){
  // OrbitControls mémorise camera.up et ses gestes : recréer le contrôleur purge
  // les anciens listeners, le damping et le repère de la vue précédente.
  const focus=target.clone(),position=this.orbitCamera.position.clone(),quaternion=this.orbitCamera.quaternion.clone();this.controls?.dispose();
  this.controls=new OrbitControls(this.orbitCamera,this.canvas);Object.assign(this.controls,{enableDamping:true,dampingFactor:.12,minZoom:.02,maxZoom:1000,maxPolarAngle:Math.PI-.001,screenSpacePanning:true,zoomToCursor:true});
  this.controls.target.copy(focus);this.orbitCamera.position.copy(position);this.orbitCamera.quaternion.copy(quaternion);this.controls.enableDamping=false;this.controls.update();
  if(this.transform)this.syncNavigation();return this.controls;
 }
 finishContextClick(event){
  const start=this.contextGesture;this.contextGesture=null;if(!start||start.id!==event.pointerId||start.moved||this.transform.dragging||this.panelDrag||this.pendingPanel||this.pendingTransform||this.interaction||Date.now()-start.time>700||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return false;
  this.freeNavigation.stop();this.camera.position.copy(start.position);this.camera.quaternion.copy(start.quaternion);this.camera.updateMatrixWorld();if(this.navigation==='orbit')this.resetOrbitControls(start.target);this.suppressClick=Date.now();event.preventDefault();this.onContextMenu?.(this.pick(event)?.part||null,event);return true;
 }
 getKeyboardFrame(){const plan=['top','front','side','workplane'].includes(this.currentView),normal=plan?null:workplaneFrame(this.workplane).normal;return {...keyboardCameraFrame(this.camera,{normal}),view:this.currentView||'iso',space:'world'}}
 updateAccessibleGizmo(){
  if(!this.transform?.object||this.transform.dragging||this.dragStart||this.pendingTransform||this.panelDrag||this.interaction)return;
  // Seule la translation accepte un proxy d'écran : une rotation doit toujours
  // conserver le centre naturel pour ne pas entraîner une translation parasite.
  const natural=this.naturalPivot||this.pivot.position,position=this.transform.mode==='translate'?accessiblePivotPosition(this.camera,natural,{fallbackDepth:Math.max(this.span||4,1)}):natural.clone();
  if(position.distanceToSquared(this.pivot.position)>1e-14){
   this.scene.updateMatrixWorld(true);const children=this.pivot.children.map(object=>({object,matrix:object.matrixWorld.clone()}));this.pivot.position.copy(position);this.pivot.updateMatrixWorld(true);const inverse=this.pivot.matrixWorld.clone().invert();
   for(const {object,matrix}of children){new THREE.Matrix4().multiplyMatrices(inverse,matrix).decompose(object.position,object.quaternion,object.scale);object.updateMatrixWorld(true)}
  }
  const height=this.canvas.clientHeight||this.canvas.getBoundingClientRect().height||600;this.transform.setSize(gizmoSizeForPixels(this.camera,this.pivot.position,height,this.lastPointerType==='touch'?125:105));
  this.transform.getHelper().userData.reanchored=position.distanceToSquared(natural)>1e-12;
 }
 resize(){const rect=this.canvas.getBoundingClientRect(),w=this.canvas.clientWidth||rect.width||this.canvas.parentElement.clientWidth,h=this.canvas.clientHeight||rect.height||this.canvas.parentElement.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);const span=this.span||4.7;this.orbitCamera.left=-span*w/h;this.orbitCamera.right=span*w/h;this.orbitCamera.top=span;this.orbitCamera.bottom=-span;this.orbitCamera.updateProjectionMatrix();this.freeCamera.aspect=w/h;this.freeCamera.updateProjectionMatrix()}
 status(text){this.interactionStatus=text;this.onInteractionStatus?.(text);this.onInteractionStateChange?.({canConfirm:this.canConfirmInteraction(),type:this.pendingPanel||this.panelDrag?'resize':this.pendingTransform?'transform':this.interaction?.type||null})}
 setTouchMode(mode){if(!['pan','rotate'].includes(mode))return false;this.touchMode=mode;this.freeNavigation.setTouchMode?.(mode);this.canvas.dataset.touchMode=mode;this.syncNavigation();return true}
 setMultiSelect(value){this.multiSelect=!!value;return this.multiSelect}
 canConfirmInteraction(){return !!this.pendingPanel||!!this.pendingTransform||!!(this.interaction?.type==='placement'&&this.interaction.placedPart)}
 confirmInteraction(){
  if(this.pendingPanel){const pending=this.pendingPanel;this.pendingPanel=null;pending.object.visible=pending.visible;this.clear(this.placementGroup);this.status('Dimensions appliquées');this.syncNavigation();this.onPanelResize?.(pending.part.id,pending.result.corners.map(p=>[...p]));this.configureTransform();this.refreshPanelHandles();return true}
  if(this.pendingTransform){const pending=this.pendingTransform;this.pendingTransform=null;this.clear(this.placementShadowGroup);this.status('Déplacement appliqué');this.commitTransform(pending);this.configureTransform();return true}
  if(this.interaction?.type==='placement'&&this.interaction.placedPart){const {placedPart:part,onPlace,contact:snap,supportId}=this.interaction,info={snap:snap?structuredClone(snap):null,supportId,surface:this.project?.placementSurface||'ground'};this.cancelInteraction();this.status(`${part.label||'Pièce'} placée`);onPlace?.(part,info);return true}return false;
 }
 commitTransform({ids,fixing,payload}){
  if(fixing){if(Math.hypot(...payload.delta)>.001)this.onFixingTransform?.(fixing.jointId,fixing.id,fixing.position.map((v,i)=>v+payload.delta[i]));else this.selectFixing(fixing.jointId,fixing.id);return}
  if(Math.hypot(...payload.delta)>.001||Math.abs(payload.angle)>.001)this.onTransform?.(ids,payload);else this.select(this.selectedIds);
 }
 clearDragState(){this.clear(this.placementShadowGroup);this.dragStart=null;this.dragGrid=null;this.dragParts=null;this.dragRawDelta=null;this.dragSnapshot=null;this.dragTouch=false;this.snapCandidate=null;this.guideCandidate=null;this.previewPlacement([],null);this.clear(this.guideGroup)}
 restoreTransform(snapshot){if(!snapshot)return;this.pivot.position.copy(snapshot.position);this.pivot.quaternion.copy(snapshot.quaternion);this.pivot.scale.copy(snapshot.scale);this.pivot.updateMatrixWorld(true);this.updateHighlights()}
 setTouchRendering(active){if(this.touchRendering===active)return;this.touchRendering=active;this.renderer.setPixelRatio(active?Math.min(this.fullPixelRatio,1):this.fullPixelRatio);this.syncNavigation()}
 clearPrecisionTimer(){if(this.precisionTimer){clearTimeout(this.precisionTimer);this.precisionTimer=null}}
 endPrecisionTouch(){this.clearPrecisionTimer();this.precisionTouch=null;if(this.touchCrosshair)this.touchCrosshair.hidden=true;this.syncNavigation()}
 startPrecisionTouch(id){
  this.clearPrecisionTimer();const point=this.touchPointers.get(id);if(!point||point.moved||this.touchPointers.size!==1||this.touchSequenceBlocked||this.dragStart||this.pendingTransform)return false;
  if(this.navigation==='free'&&this.freeNavigation.reserveTouch?.(id)===false)return false;
  this.precisionTouch={id};point.precision=true;this.syncNavigation();this.updatePrecisionTouch(point);return true;
 }
 updatePrecisionTouch(point){
  if(!this.precisionTouch)return;const r=this.canvas.getBoundingClientRect(),parent=this.canvas.parentElement.getBoundingClientRect(),x=THREE.MathUtils.clamp(point.x,r.left+16,r.left+r.width-16),y=THREE.MathUtils.clamp(point.y-56,r.top+16,r.top+r.height-16);
  this.precisionTouch.point={clientX:x,clientY:y,pointerType:'touch',button:0,altKey:false};
  if(!this.touchCrosshair){const element=document.createElement('div');element.className='scene-touch-crosshair';element.setAttribute('aria-hidden','true');element.style.cssText='position:absolute;pointer-events:none;z-index:8;width:28px;height:28px;border:2px solid #087aa8;border-radius:50%;background:#fffffff0;box-shadow:0 0 0 3px #ffffff90;color:#087aa8;font:32px/23px system-ui;text-align:center;transform:translate(-50%,-50%)';element.textContent='+';this.canvas.parentElement.append(element);this.touchCrosshair=element}
  this.touchCrosshair.hidden=false;this.touchCrosshair.style.left=`${x-parent.left}px`;this.touchCrosshair.style.top=`${y-parent.top}px`;
  if(this.interaction)this.updateInteraction(this.precisionTouch.point);else this.setHover(this.pick(this.precisionTouch.point)?.object||null);
 }
 installTouchInteraction(){
  const down=e=>{
   this.lastPointerType=e.pointerType||'mouse';if(e.pointerType!=='touch')return;
   if(!this.touchPointers.size)this.touchSequenceBlocked=false;this.touchPointers.set(e.pointerId,{id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false});this.setTouchRendering(true);
   this.clearPrecisionTimer();if(this.touchPointers.size>1){this.touchSequenceBlocked=true;this.endPrecisionTouch();if(this.dragStart)this.cancelInteraction();return}
   this.precisionTimer=setTimeout(()=>this.startPrecisionTouch(e.pointerId),400);
  };
  const move=e=>{
   const point=this.touchPointers.get(e.pointerId);if(!point)return;point.x=e.clientX;point.y=e.clientY;
   if(this.precisionTouch?.id===e.pointerId){e.preventDefault();this.updatePrecisionTouch(point);return}
   if(Math.hypot(point.x-point.startX,point.y-point.startY)>6){point.moved=true;this.clearPrecisionTimer()}
  };
  const end=(e,cancelled=false)=>{
   const point=this.touchPointers.get(e.pointerId);if(!point)return;point.x=e.clientX;point.y=e.clientY;
   this.touchRelease={...point,blocked:cancelled||this.touchSequenceBlocked,point:this.precisionTouch?.id===e.pointerId?this.precisionTouch.point:null};this.touchPointers.delete(e.pointerId);this.clearPrecisionTimer();if(this.precisionTouch?.id===e.pointerId)this.endPrecisionTouch();
   if(cancelled&&this.dragStart)this.cancelInteraction();if(!this.touchPointers.size)this.setTouchRendering(false);
  };
  this.touchHandlers={pointerdown:down,pointermove:move,pointerup:e=>end(e),pointercancel:e=>end(e,true),lostpointercapture:e=>end(e,true)};
  for(const [type,handler]of Object.entries(this.touchHandlers))this.canvas.addEventListener(type,handler,{capture:true,passive:false});
  this.touchBlurHandler=()=>{this.touchSequenceBlocked=true;this.touchRelease=null;this.touchPointers.clear();this.endPrecisionTouch();if(this.dragStart||this.panelDrag||this.pendingPanel)this.cancelInteraction();this.setTouchRendering(false)};this.canvas.ownerDocument.defaultView.addEventListener('blur',this.touchBlurHandler);
 }
 finishTouchTap(event){
  const point=this.touchRelease;if(!point||point.id!==event.pointerId)return;this.touchRelease=null;
  if(point.blocked||point.transform||point.moved&&!point.precision||this.pendingTransform||this.dragStart||this.freeNavigation.wasTouchGesture?.(event.pointerId))return;
  const target=point.point||event;if(this.interaction){this.interactionClick(target);return}
  const selectionEvent={originalEvent:event,pointerType:'touch',clientX:target.clientX,clientY:target.clientY,shiftKey:this.multiSelect||event.shiftKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,additive:this.multiSelect||event.shiftKey||event.ctrlKey||event.metaKey};if(this.activateDimension(target))return;this.onSelect(this.pick(target)?.part??null,selectionEvent);
 }
 syncNavigation(){
  const plan=['top','front','side','workplane'].includes(this.currentView),busy=!!this.interaction||!!this.panelDrag||!!this.pendingPanel;
  this.controls.enabled=this.navigation==='orbit'&&!this.transform.dragging&&!this.precisionTouch&&!this.panelDrag;this.controls.enableRotate=!plan&&!busy;this.controls.enableDamping=!plan&&!this.touchRendering;this.controls.mouseButtons.LEFT=busy?null:plan?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;this.controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;this.controls.touches.ONE=!plan&&!busy&&this.touchMode==='rotate'?THREE.TOUCH.ROTATE:THREE.TOUCH.PAN;this.controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  if(this.freeNavigation){this.freeNavigation.enabled=this.navigation==='free'&&!this.transform.dragging&&!this.panelDrag;this.freeNavigation.leftEnabled=!busy;this.freeNavigation.touchEnabledDuringTool=this.interaction?.type==='placement';this.freeNavigation.setTouchMode?.(this.touchMode)}
  this.renderer.shadowMap.enabled=!plan&&!this.touchRendering;this.ground.visible=!plan;this.canvas.dataset.view=this.currentView||'iso';
  if(this.orientationLabel)this.orientationLabel.textContent=(( {top:'Dessus · → X+ · ↑ Z− · mm',front:'Face · → X− · ↑ Y+ · mm',side:'Côté · → Z− · ↑ Y+ · mm',workplane:'Plan de travail · U / V · mm'})[this.currentView]||'3D · X largeur · Y hauteur · Z profondeur · mm')+(this.gridCaption?' · '+this.gridCaption:'');
 }
 pointerRay(event){const r=this.canvas.getBoundingClientRect();this.pointer.set((event.clientX-r.left)/(r.width||1)*2-1,-(event.clientY-r.top)/(r.height||1)*2+1);this.camera.updateMatrixWorld();this.scene.updateMatrixWorld(true);this.raycaster.setFromCamera(this.pointer,this.camera);return this.raycaster.ray}
 pick(event,{surfaces=false}={}){
  this.pointerRay(event);const groups=surfaces?[this.group,this.pivot,this.fixingGroup]:[this.group,this.pivot,this.jointGroup,this.fixingGroup];
  for(const hit of this.raycaster.intersectObjects(groups,true)){
   if(!hit.object.isMesh)continue;let source=hit.object,visible=true;for(let p=hit.object;p;p=p.parent){if(!p.visible)visible=false;if(p.userData.part)source=p}if(visible&&source.userData.part)return {...hit,object:source,part:source.userData.part};
  }return null;
 }
 pointOnPlane(event,workplane=this.workplane){const ray=this.pointerRay(event),frame=workplaneFrame(workplane),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(frame.normal,frame.origin.clone().multiplyScalar(.001));return ray.intersectPlane(plane,new THREE.Vector3())}
 placementSurface(event){
  this.pointerRay(event);const candidates=this.objects.filter(o=>o.visible&&['wood','wall','mesh','roof'].includes(o.userData.part.material)),hit=this.raycaster.intersectObjects(candidates,true).find(h=>h.object.isMesh&&h.face);if(!hit)return null;
  const normal=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();if(normal.dot(this.raycaster.ray.direction)>0)normal.negate();
  const u=new THREE.Vector3(1,0,0).addScaledVector(normal,-normal.x);if(u.lengthSq()<1e-8)u.set(0,0,1).addScaledVector(normal,-normal.z);u.normalize();
  hit.object.geometry.computeBoundingBox();const origin=hit.object.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(hit.object.matrixWorld);origin.addScaledVector(normal,hit.point.clone().sub(origin).dot(normal));
  return {point:hit.point,part:hit.object.userData.part,plane:{type:'face',origin:origin.multiplyScalar(1000).toArray(),normal:normal.toArray(),u:u.toArray(),offset:0,lock:true,visible:true}};
 }
 measurePoint(event){return this.pick(event,{surfaces:true})?.point||this.pointOnPlane(event)}
 setHover(object){if(this.hovered===object)return;this.hovered=object;this.rebuildHighlights();this.canvas.style.cursor=this.interaction?'crosshair':object?'pointer':''}
 rebuildHighlights(){
  if(!this.highlightGroup)return;this.clear(this.highlightGroup);const sources=[...(this.objects||[]),...(this.fixingObjects||[]),...this.jointGroup.children];
  for(const source of sources){const part=source.userData.part,selected=this.selectedIds.includes(part?.id)||this.selectedFixing?.id===part?.id,hover=source===this.hovered;if(!selected&&!hover)continue;
   const outline=createFocusOverlay(source.geometry,selected?'selected':'hover',{fill:false,occluded:true,marker:selected});outline.renderOrder=14;outline.userData.source=source;outline.userData.selected=selected;outline.matrixAutoUpdate=false;this.highlightGroup.add(outline);
  }this.updateHighlights();
 }
 updateHighlights(){if(!this.highlightGroup)return;this.scene.updateMatrixWorld(true);const active=!!(this.dragStart||this.pendingTransform||this.interaction?.type==='placement'||this.panelDrag||this.pendingPanel);this.dimGroup?.traverse(o=>{for(const material of [].concat(o.material||[])){material.transparent=active||o.isSprite;material.opacity=active?.3:1}});for(const outline of this.highlightGroup.children){const source=outline.userData.source;outline.matrix.copy(source.matrixWorld);outline.matrixWorld.copy(source.matrixWorld);outline.visible=!(this.dragStart||this.interaction?.type==='placement'||this.panelDrag||this.pendingPanel);for(let p=source;p;p=p.parent)if(!p.visible)outline.visible=false}const pixels=this.canvas.clientHeight||this.canvas.getBoundingClientRect().height||600,forward=this.camera.getWorldDirection(new THREE.Vector3());for(const group of [this.dimGroup,this.measurementGroup,this.guideGroup,this.arrangementGroup,this.selectionMeasureGroup,this.highlightGroup,this.previewGroup,this.placementGroup])for(const sprite of (()=>{const sprites=[];group?.traverse(o=>{if(o.isSprite)sprites.push(o)});return sprites})()){const depth=Math.max(.05,sprite.getWorldPosition(new THREE.Vector3()).sub(this.camera.position).dot(forward)),visibleHeight=this.camera.isOrthographicCamera?(this.camera.top-this.camera.bottom)/this.camera.zoom:2*depth*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),height=visibleHeight*(sprite.userData.feedbackState?26:38)/pixels;sprite.scale.set(height*(sprite.userData.aspect||3),height,1)}this.updatePanelHandleSizes?.()}
 beginPlacement(part,onPlace){
  this.cancelInteraction();this.clear(this.selectionMeasureGroup);this.interaction={type:'placement',part:structuredClone(part),onPlace,grid:resolveAdaptiveGrid({...this.project,workplane:this.project.placementSurface==='workplane'?this.workplane:{type:'xz'}},this.project?.mode==='free'?this.project.freeParts:this.model.parts),assistance:normalizeAssistance(this.project.assistance)};this.drawGrid(this.interaction.grid);this.transform.detach();this.setHover(null);this.syncNavigation();this.canvas.style.cursor='crosshair';this.status('Cliquez sur le plan pour poser · Alt suspend grille, guides et contacts · Échap annule');return true;
 }
 cancelPlacement(){if(this.interaction?.type==='placement')this.cancelInteraction()}
 beginMeasure(){this.cancelInteraction();this.clearMeasurement();this.interaction={type:'measure',points:[]};this.transform.detach();this.setHover(null);this.syncNavigation();this.canvas.style.cursor='crosshair';this.status('Mesure · cliquez le premier point sur une surface ou le plan')}
 clearMeasurement(){this.measurement=null;if(this.measurementGroup)this.clear(this.measurementGroup)}
 cancelInteraction(){
  const panel=this.panelDrag||this.pendingPanel;this.panelDrag=null;this.pendingPanel=null;if(panel){panel.object.visible=panel.visible;try{if(this.canvas.hasPointerCapture?.(panel.pointerId))this.canvas.releasePointerCapture(panel.pointerId)}catch{}}
  const pending=this.interaction,transform=this.pendingTransform,snapshot=transform?.snapshot||this.dragSnapshot,hadDrag=!!this.dragStart;this.interaction=null;this.pendingTransform=null;this.lastPlacementEvent=null;this.onCoordinates?.(null);this.clearPrecisionTimer();if(this.precisionTouch)this.endPrecisionTouch();
  if(snapshot){this.restoreTransform(snapshot);this.clearDragState();this.transform.dragging=false;this.transform.axis=null}
  this.clear(this.placementShadowGroup);if(this.placementGroup)this.clear(this.placementGroup);if(this.guideGroup)this.clear(this.guideGroup);if(pending?.type==='measure')this.clearMeasurement();
  if(pending||transform||hadDrag||panel){this.previewPlacement([],null);this.status('');this.canvas.style.cursor='';this.syncNavigation();if(this.selectedFixing){this.transform.attach(this.pivot);this.rebuildHighlights()}else this.configureTransform();this.showSelectionMeasurements();this.refreshPanelHandles()}return !!(pending||transform||hadDrag||panel);
 }
 updateInteraction(event){
  if(this.interaction?.type==='placement'){
   this.lastPlacementEvent={clientX:event.clientX,clientY:event.clientY,altKey:event.altKey};
   const state=this.interaction,assistance=state.assistance,strict=assistance.gridSnap&&!event.altKey;
   const surface=this.project?.placementSurface||'ground',support=surface==='face'?this.placementSurface(event):null,plane=support?.plane||(surface==='workplane'?this.workplane:{type:'xz',offset:0,lock:true}),point=surface==='face'&&!support?null:support?.point||this.pointOnPlane(event,plane);if(!point){this.clear(this.placementShadowGroup);this.interaction.placedPart=null;this.clear(this.placementGroup);this.clear(this.guideGroup);this.previewPlacement([],null);this.onCoordinates?.(null);if(surface==='face')this.status('Visez la face d’une pièce');return}
   const activeGrid=support?resolveAdaptiveGrid({...this.project,workplane:plane},this.project.freeParts):state.grid,guideGrid=activeGrid;
   let part=placePartOnWorkplane(state.part,point.clone().multiplyScalar(1000).toArray(),plane,{grid:this.project?.grid||1,snap:this.project?.snap!==false&&!event.altKey,gridFrame:strict?activeGrid:null});
   let guided=null,canSnap=false,contact=null;
   if(!event.altKey&&assistance.guides){guided=smartPlacementGuides({...this.project,workplane:plane},[part],{excludeIds:[part.id],tolerance:this.guideTolerance(),grid:guideGrid});if(guided){canSnap=assistance.guideSnap&&correctionRespectsAxes(guided.delta,plane,{lock:true})&&objectSnapTranslationIsValid([part],this.project.freeParts||[],guided.delta,{workplane:plane,lock:true});if(canSnap&&strict){const snapped=snapDeltaToGrid([part],guided.delta,activeGrid,{axis:'XYZ',space:'world',lock:true});canSnap=!!snapped&&snapped.every((n,i)=>Math.abs(n-guided.delta[i])<1e-6)}if(canSnap)part=translatedPreviewParts([part],guided.delta)[0]}}
   if(!event.altKey&&this.liveSnap){const options={...this.objectSnapOptions({axis:'XYZ',space:'world',lock:true,previousKey:state.contact?.key},strict?activeGrid:null),workplane:plane};if(options.enabled)contact=findObjectSnap([part],this.visibleSnapTargets([part.id]),options);if(contact)part=translatedPreviewParts([part],contact.delta)[0]}
   this.interaction.placedPart=part;this.interaction.guide=guided;this.interaction.guideApplied=canSnap;this.interaction.contact=contact;this.clear(this.placementGroup);this.placementGroup.add(this.ghostPart(part));this.showGuideLines(contact?.guides||guided?.lines||[]);this.previewPlacement([],contact?[0,0,0]:null,contact?.targetId,contact?.contactPoint,contact);this.drawGrid(activeGrid,new THREE.Vector3(...placementAnchor(part,plane)));this.showPlacementShadow([part],contact?.localFrame||plane,!!contact);
   state.supportId=support?.part?.id||null;const anchor=placementAnchor(part,plane);this.onCoordinates?.(anchor);
   this.status(event.altKey?'Aides suspendues (Alt)':contact?`Accrochage · ${contact.label}`:guided?`${guided.label}${canSnap?' · aimanté':' · repère visuel'}`:strict?'Pose sur la grille':`Poser · ${surface==='face'?'face visée':surface==='workplane'?'plan de travail':'sol'}`);

  }else if(this.interaction?.type==='measure'&&this.interaction.points.length){const point=this.measurePoint(event);if(point)this.showMeasurement(this.interaction.points[0],point.multiplyScalar(1000).toArray(),true)}
 }
 showPlacementShadow(parts,plane=null,contact=false){
  this.clear(this.placementShadowGroup);if(!this.placementShadowGroup||!normalizeAssistance(this.project?.assistance).placementShadow||!parts?.length)return;
  const support=plane||(this.project?.workplane?.lock?this.workplane:{type:'xz',offset:0});this.placementShadowGroup.add(createPlacementShadow(parts,support,{contact}));
 }
 ghostPart(part,color=0x1c9f88,opacity=.3){
  let geometry,position=new THREE.Vector3(),q=new THREE.Quaternion();
  if(part.kind==='panel'||part.corners)geometry=panelGeometry(part);
  else if(part.kind==='wall'||part.material==='wall'){const a=new THREE.Vector3(...part.a),b=new THREE.Vector3(...part.b);geometry=new THREE.BoxGeometry(a.distanceTo(b)/1000,part.height/1000,(part.wallThickness||part.width)/1000);position.copy(a).add(b).multiplyScalar(.0005);position.y+=part.height/2000;q.setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.atan2(b.z-a.z,b.x-a.x))}
  else{geometry=new THREE.BoxGeometry(part.width/1000,part.height/1000,new THREE.Vector3(...part.a).distanceTo(new THREE.Vector3(...part.b))/1000);position.set(...part.a.map((n,i)=>(n+part.b[i])/2000));q.copy(timberQuaternion(part))}
  const ghost=createFocusOverlay(geometry,'moving',{fill:true,occluded:true,marker:false});geometry.dispose();ghost.position.copy(position);ghost.quaternion.copy(q);ghost.userData.previewPart=part.id;return ghost;
 }
 interactionClick(event){
  const state=this.interaction;if(!state)return;
  if(state.type==='placement'){this.updateInteraction(event);if(!state.placedPart)return;if(event.pointerType==='touch'){state.touch=true;this.status('Position en aperçu · Valider pour poser ou Annuler');return}this.confirmInteraction();return}
  const point=this.measurePoint(event);if(!point){this.status('Aucune surface sous le curseur : orientez la vue vers le plan.');return}const mm=point.multiplyScalar(1000).toArray();
  if(!state.points.length){state.points.push(mm);this.status('Mesure · cliquez le deuxième point');return}
  const first=state.points[0];this.interaction=null;this.showMeasurement(first,mm);this.syncNavigation();if(this.selectedFixing)this.selectFixing(this.selectedFixing.jointId,this.selectedFixing.id);else this.configureTransform();this.canvas.style.cursor='';this.onMeasurement?.(this.measurement);
 }
 showMeasurement(a,b,preview=false){const result=measurePoints(a,b);if(!result)return;this.clear(this.measurementGroup);this.dimension(a.map(n=>n/1000),b.map(n=>n/1000),`${result.distance.toLocaleString('fr-FR',{maximumFractionDigits:1})} mm`,this.measurementGroup);if(!preview)this.measurement=result;this.status(`${preview?'Mesure en cours':'Distance'} : ${result.distance.toLocaleString('fr-FR',{maximumFractionDigits:1})} mm`)}
 guideTolerance(){
  const pixels=this.canvas.clientHeight||this.canvas.getBoundingClientRect().height||600,depth=Math.max(.1,this.camera.position.distanceTo(this.pivot.position)),height=this.camera.isOrthographicCamera?(this.camera.top-this.camera.bottom)/this.camera.zoom:2*depth*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));return Math.min(100,Math.max(2,height*1000/pixels*9));
 }
 dragOptions(){return {axis:this.dragAxis||'XYZ',space:this.transform.space,quaternion:this.dragQuaternion||this.pivot.quaternion.toArray(),lock:!!this.project.workplane?.lock}}
 updateDragPosition(){
  if(!this.dragStart)return;const delta=this.dragRawDelta||[0,0,0],strict=this.dragAssistance?.gridSnap&&!this.altKey&&!this.selectedFixing;let snapped;
  this.gridBlocked=false;
  if(strict){snapped=snapDeltaToGrid(this.dragParts,delta,this.dragGrid,this.dragOptions());if(snapped)this.lastGridDelta=snapped;else{snapped=this.lastGridDelta||[0,0,0];this.gridBlocked=true}}
  else if(this.project.snap&&!this.altKey)snapped=snapMovement(delta,this.project.grid,this.project.workplane,this.selectedFixing?false:this.project.workplane?.lock,true);
  else{const d=new THREE.Vector3(...delta);if(!this.selectedFixing&&this.project.workplane?.lock){const n=workplaneFrame(this.workplane).normal;d.addScaledVector(n,-d.dot(n))}snapped=d.toArray()}
  this.pivot.position.copy(this.dragStart).add(new THREE.Vector3(...snapped).multiplyScalar(.001));if(!this.selectedFixing)this.updateLiveSnap(snapped);
  const actual=this.pivot.position.clone().sub(this.dragStart).multiplyScalar(1000).toArray(),first=this.dragParts?.[0];if(first)this.onCoordinates?.(placementAnchor(translatedPreviewParts([first],actual)[0],this.workplane));else if(this.selectedFixing)this.onCoordinates?.(this.selectedFixing.position.map((n,i)=>n+actual[i]));
 }
 objectSnapOptions(options={},grid=null){const preferences=this.project?.objectSnap||{},tolerance=Math.min(50,Math.max(2,this.guideTolerance()));return {...options,enabled:preferences.enabled!==false,localGrid:preferences.localGrid!==false,gridStep:preferences.gridStep||10,workplane:this.workplane,tolerance,featureTolerance:Math.min(30,tolerance),strictGrid:grid}}
 visibleSnapTargets(excluded=[]){const visible=new Set((this.objects||[]).filter(o=>o.visible).map(o=>o.userData.part.id));return (this.project?.mode==='free'?this.project.freeParts:this.model?.parts||[]).filter(p=>!excluded.includes(p.id)&&visible.has(p.id))}
 updateLiveSnap(delta){
  const previousKey=this.snapCandidate?.key;this.snapCandidate=null;this.guideCandidate=null;this.guideCanSnap=false;this.clear(this.guideGroup);const assistance=this.dragAssistance||normalizeAssistance(this.project?.assistance),strict=assistance.gridSnap&&!this.altKey,parts=this.dragParts||(this.project?.freeParts||[]).filter(p=>this.selectedIds.includes(p.id)),options=this.dragOptions(),grid=this.dragGrid||this.resolvedGrid;
  if(this.altKey){this.previewPlacement([],null);this.showPlacementShadow(translatedPreviewParts(parts,delta));this.showSelectionMeasurements(translatedPreviewParts(parts,delta));this.status('Grille, guides et contacts suspendus · Alt');return}
  const moving=translatedPreviewParts(parts,delta),targets=this.visibleSnapTargets(this.dragIds||this.selectedIds),snapOptions=this.objectSnapOptions({...options,previousKey,collisionParts:(this.project.freeParts||[]).filter(p=>!this.selectedIds.includes(p.id))},strict?grid:null);
  const compatible=correction=>{if(!correctionRespectsAxes(correction,this.workplane,options))return false;if(!objectSnapTranslationIsValid(moving,targets,correction,snapOptions))return false;if(!strict)return true;const desired=delta.map((n,i)=>n+correction[i]),snapped=snapDeltaToGrid(parts,desired,grid,options);return !!snapped&&snapped.every((n,i)=>Math.abs(n-desired[i])<1e-6)};
  if(assistance.guides&&moving.length&&moving.length<=20){this.guideCandidate=smartPlacementGuides(this.project,moving,{excludeIds:this.dragIds||this.selectedIds,tolerance:this.guideTolerance(),grid});if(this.guideCandidate)this.guideCanSnap=assistance.guideSnap&&compatible(this.guideCandidate.delta)}
  if(this.liveSnap&&!this.selectedFixing&&snapOptions.enabled&&moving.length<=20)this.snapCandidate=findObjectSnap(moving,targets,snapOptions);
  const correction=this.snapCandidate?.delta||(this.guideCanSnap?this.guideCandidate?.delta:null);
  if(correction)this.pivot.position.copy(this.dragStart).add(new THREE.Vector3(...delta.map((n,i)=>n+correction[i])).multiplyScalar(.001));
  this.distanceReferenceId=this.snapCandidate?.targetId||this.guideCandidate?.referenceIds?.[0]||null;this.showSelectionMeasurements(translatedPreviewParts(parts,this.pivot.position.clone().sub(this.dragStart).multiplyScalar(1000).toArray()));this.showGuideLines(this.snapCandidate?.guides||this.guideCandidate?.lines||[]);this.previewPlacement(this.dragIds||this.selectedIds,[0,0,0],this.snapCandidate?.targetId||null,this.snapCandidate?.contactPoint||null,this.snapCandidate);this.showPlacementShadow(translatedPreviewParts(parts,this.pivot.position.clone().sub(this.dragStart).multiplyScalar(1000).toArray()),this.snapCandidate?.localFrame,!!this.snapCandidate);
  if(this.dragGrid)this.drawGrid(this.dragGrid,this.pivot.position.clone().multiplyScalar(1000));
  if(this.gridBlocked)this.status('Aucun nœud de grille sur cet axe · changez l’axe ou maintenez Alt');
  else if(this.snapCandidate)this.status(`Accrochage · ${this.snapCandidate.label}`);
  else if(this.guideCandidate)this.status(`${this.guideCandidate.label}${this.guideCanSnap?' · aimanté':' · repère visuel'}`);
  else if(this.dragStart)this.status(`Déplacement${strict?' sur la grille':''} · Alt suspend les aides`);
 }

 showGuideLines(lines,group=this.guideGroup){
  this.clear(group);let labels=0,spacing=group===this.guideGroup?(this.selectionMeasureGroup?.children.filter(o=>o.isSprite).length||0):0;
  for(const item of lines.slice(0,8)){if(!item?.a||!item?.b)continue;const color=item.kind==='spacing'?0x009caa:0xc52b9a,isSpacing=item.kind==='spacing';
   const label=isSpacing?(spacing++<2?item.label||'':''):labels++===0?item.label||'':'';
   this.dimension(item.a.map(n=>n/1000),item.b.map(n=>n/1000),label,group,color);
   group.children.forEach(o=>{if(!o.userData.guideKind)o.userData.guideKind=item.kind||'alignment';o.renderOrder=18});
  }
 }
 previewArrangement(parts,lines=[]){
  this.clearArrangementPreview();for(const part of parts||[])this.arrangementGroup.add(this.ghostPart(part,0x009caa,.4));const linesGroup=new THREE.Group();this.arrangementGroup.add(linesGroup);this.showGuideLines(lines,linesGroup);return true;
 }
 clearArrangementPreview(){if(this.arrangementGroup)this.clear(this.arrangementGroup)}
 installPanelInteraction(){
  const consume=e=>{e.preventDefault();e.stopImmediatePropagation()};
  this.canvas.addEventListener('pointerdown',event=>{
   if(this.panelDrag){if(event.pointerId!==this.panelDrag.pointerId){consume(event);this.cancelInteraction()}return}
   if(!['select','translate','resize'].includes(this.tool)||this.pendingTransform||this.transform.dragging||this.pendingPanel||this.interaction||this.project?.mode!=='free'||event.button!==0||this.touchPointers.size>1)return;
   this.pointerRay(event);const hit=this.pickPanelHandle(event);if(!hit)return;
   const handle=hit.userData.panelHandle,part=this.project.freeParts.find(p=>p.id===handle.partId),object=this.objects.find(o=>o.userData.part.id===handle.partId);if(!part||!object)return;
   const frame=panelResizeFrame(part),ray=this.raycaster.ray,start=intersectPanelResizePlane(frame,ray.origin.clone().multiplyScalar(1000).toArray(),ray.direction.toArray());
   const anchor=frame.handles.find(h=>h.id===handle.id).position,rect=this.canvas.getBoundingClientRect(),project=point=>{const p=new THREE.Vector3(...point).multiplyScalar(.001).project(this.camera);return [(p.x+1)*rect.width/2,(1-p.y)*rect.height/2]},origin=project(anchor),basis=Object.fromEntries(['u','v'].map(axis=>[axis,project(anchor.map((v,i)=>v+frame[axis][i])).map((v,i)=>v-origin[i])])),screenFallback=Math.abs(new THREE.Vector3(...frame.normal).dot(ray.direction))<.08;
   if(screenFallback&&!resizeScreenDelta(frame,handle.id,[0,0],basis)){this.status('Tournez la vue pour voir le côté à agrandir.');consume(event);return}
   consume(event);this.clearPrecisionTimer();this.freeNavigation.stop();if(this.navigation==='orbit')this.resetOrbitControls(this.controls.target);this.transform.detach();this.setHover(null);
   this.panelDrag={pointerId:event.pointerId,pointerType:event.pointerType||'mouse',part:structuredClone(part),handleId:handle.id,start:start||anchor,frame,screenStart:[event.clientX,event.clientY],basis,screenFallback,object,visible:object.visible,result:null};this.lastPointerType=event.pointerType||'mouse';this.syncNavigation();this.status('Redimensionnement en aperçu · côté opposé fixe · Alt désactive le pas');this.canvas.style.cursor='grabbing';try{this.canvas.setPointerCapture(event.pointerId)}catch{}
  },{capture:true,passive:false});
  this.canvas.addEventListener('pointermove',event=>{
   const drag=this.panelDrag;if(!drag||drag.pointerId!==event.pointerId)return;consume(event);this.pointerRay(event);const ray=this.raycaster.ray,screenDelta=drag.screenFallback?resizeScreenDelta(drag.frame,drag.handleId,[event.clientX-drag.screenStart[0],event.clientY-drag.screenStart[1]],drag.basis):null,point=drag.screenFallback?screenDelta?.map((n,i)=>n+drag.start[i]):intersectPanelResizePlane(drag.frame,ray.origin.clone().multiplyScalar(1000).toArray(),ray.direction.toArray());if(!point)return;
   const result=resizePanelFromDrag(drag.part,drag.handleId,drag.start,point,{step:this.project.grid||1,free:!!event.altKey||this.project.snap===false});if(!result.available){this.status(result.message);return}
   const resized={...drag.part,...surfaceResizePatch(drag.part,result.corners).patch};drag.result=result;drag.object.visible=false;this.clear(this.placementGroup);this.placementGroup.add(this.ghostPart(resized));this.refreshPanelHandles(resized);this.status(`${drag.part.kind==='wall'?'Mur':'Panneau'} · ${result.width.toLocaleString('fr-FR',{maximumFractionDigits:2})} × ${result.height.toLocaleString('fr-FR',{maximumFractionDigits:2})} mm${result.clamped?' · dimension minimale atteinte':''} · côté opposé fixe`);
  },{capture:true,passive:false});
  this.canvas.addEventListener('pointerup',event=>{
   const drag=this.panelDrag;if(!drag||drag.pointerId!==event.pointerId)return;consume(event);this.panelDrag=null;this.canvas.style.cursor='';this.suppressClick=Date.now();
   if(drag.result?.changed){this.pendingPanel=drag;this.clear(this.panelHandleGroup);if(drag.pointerType==='touch'){this.syncNavigation();this.status('Dimensions en aperçu · Valider pour appliquer ou Annuler')}else this.confirmInteraction()}
   else{drag.object.visible=drag.visible;this.clear(this.placementGroup);this.syncNavigation();this.configureTransform();this.refreshPanelHandles();this.status('')}
   try{if(this.canvas.hasPointerCapture?.(event.pointerId))this.canvas.releasePointerCapture(event.pointerId)}catch{}
  },{capture:true,passive:false});
  const cancel=event=>{if(this.panelDrag?.pointerId===event.pointerId){consume(event);this.cancelInteraction()}};this.canvas.addEventListener('pointercancel',cancel,{capture:true});this.canvas.addEventListener('lostpointercapture',cancel,{capture:true});
 }
 pickPanelHandle(event){
  if(!this.panelHandleGroup?.visible||this.dragStart||this.pendingTransform||this.pendingPanel||this.interaction)return null;
  const rect=this.canvas.getBoundingClientRect(),radius=event.pointerType==='touch'?22:12;
  const hits=this.panelHandleGroup.children.filter(h=>h.visible&&h.userData.panelHandle).map(handle=>{const p=handle.position.clone().project(this.camera);return {handle,depth:p.z,distance:Math.hypot(rect.left+(p.x+1)*rect.width/2-event.clientX,rect.top+(1-p.y)*rect.height/2-event.clientY)}}).filter(h=>h.depth>=-1&&h.depth<=1&&h.distance<=radius).sort((a,b)=>a.distance-b.distance||a.depth-b.depth);
  return hits[0]?.handle||null;
 }
 refreshPanelHandles(override=null){
  if(!this.panelHandleGroup)return;this.clear(this.panelHandleGroup);if(!['select','translate','resize'].includes(this.tool)||this.project?.mode!=='free'||this.selectedIds.length!==1||this.pendingPanel||this.pendingTransform||this.dragStart||this.interaction)return;
  const part=override||this.project.freeParts.find(p=>p.id===this.selectedIds[0]),object=this.objects.find(o=>o.userData.part.id===part?.id);if(!part||!object||(!object.visible&&!this.panelDrag))return;
  const frame=panelResizeFrame(part);if(!frame.available){if(this.tool==='resize')this.status(frame.message);return}
  for(const handle of frame.handles){const mesh=new THREE.Mesh(handle.kind==='corner'?new THREE.SphereGeometry(1,12,8):new THREE.BoxGeometry(1.6,1.6,1.6),new THREE.MeshBasicMaterial({color:handle.kind==='corner'?0x1976d2:0xd88018,depthTest:false,depthWrite:false,toneMapped:false}));mesh.position.set(...handle.position.map(n=>n/1000));mesh.userData.panelHandle={id:handle.id,partId:part.id};mesh.userData.previewOnly=true;mesh.userData.excludeFromExport=true;mesh.renderOrder=60;this.panelHandleGroup.add(mesh)}
  this.updatePanelHandleSizes();
 }
 updatePanelHandleSizes(){const height=this.canvas.clientHeight||this.canvas.getBoundingClientRect().height||600,forward=this.camera.getWorldDirection(new THREE.Vector3());for(const handle of this.panelHandleGroup?.children||[]){const depth=Math.max(.01,handle.position.clone().sub(this.camera.position).dot(forward)),extent=this.camera.isOrthographicCamera?(this.camera.top-this.camera.bottom)/this.camera.zoom:2*depth*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),radius=extent*(this.lastPointerType==='touch'?10:6)/height;handle.scale.setScalar(radius)}}
 setNavigation(mode){
  if(!['free','orbit'].includes(mode)||this.navigation===mode)return;
  this.cancelInteraction();this.freeNavigation.stop();
  if(mode==='free'){this.resetOrbitControls(this.controls.target);perspectiveFromOrtho(this.orbitCamera,this.freeCamera,this.controls.target);this.freeCamera.up.set(0,1,0);this.camera=this.freeCamera;this.controls.enabled=false}
  else{const rect=this.canvas.getBoundingClientRect(),target=this.freeNavigation.pointAt(rect.left+rect.width/2,rect.top+rect.height/2);orthographicFromPerspective(this.freeCamera,this.orbitCamera,target);this.camera=this.orbitCamera;this.resetOrbitControls(target)}
  this.navigation=mode;this.currentView='iso';this.transform.camera=this.camera;this.syncNavigation();this.updateAccessibleGizmo();this.canvas.dataset.navigation=mode;
 }
 navigationPoint(ray){
  this.scene.updateMatrixWorld(true);
  const picker=new THREE.Raycaster();picker.ray.copy(ray);picker.near=this.freeCamera.near*2;picker.far=this.freeCamera.far*.9;
  const visible=o=>{for(let parent=o;parent;parent=parent.parent)if(!parent.visible)return false;return true};
  // Le grillage, les cotes, les poignées et les repères ne masquent pas la structure.
  const solids=[...(this.objects||[]).filter(o=>o.userData.part.material!=='mesh'),...(this.fixingObjects||[])].filter(visible);
  const hit=picker.intersectObjects(solids,true).find(h=>h.object.isMesh&&visible(h.object));
  if(hit)return hit.point;
  const f=workplaneFrame(this.workplane),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(f.normal,f.origin.clone().multiplyScalar(.001));
  const point=ray.intersectPlane(plane,new THREE.Vector3());
  return point&&point.distanceTo(ray.origin)<this.freeNavigation.scale*20?point:null;
 }
 setWorkplane(raw){
  this.workplane=raw;const f=workplaneFrame(raw);this.resolvedGrid=resolveAdaptiveGrid(this.project||{workplane:raw},this.project?.mode==='free'?this.project.freeParts:this.model?.parts||[]);this.drawGrid(this.resolvedGrid);
  this.axes.position.copy(f.origin).multiplyScalar(.001);this.axes.quaternion.copy(f.quaternion);this.axes.visible=raw?.visible!==false;
 }
 drawGrid(frame=this.resolvedGrid,focus=null){
  if(!frame)return;const step=frame.step;if(!(step>0&&Number.isFinite(step)))return;
  const extent=Math.max(this.span||4,3)*4000,half=Math.min(99,Math.max(1,Math.ceil(extent/(2*step)))),center=(focus||this.center.clone().multiplyScalar(1000)).clone().sub(frame.origin),cu=Math.round(center.dot(frame.u)/step),cv=Math.round(center.dot(frame.v)/step),key=[step,half,cu,cv,...frame.origin.toArray(),...frame.u.toArray(),...frame.v.toArray(),this.workplane?.visible!==false].join('|');
  this.gridLimited=extent/step>198;this.gridCaption=`Grille ${step.toLocaleString('fr-FR',{maximumFractionDigits:3})} mm${this.gridLimited?' · portion de '+(2*half*step).toLocaleString('fr-FR',{maximumFractionDigits:1})+' mm affichée':''}`;
  if(this.grid?.userData.key===key)return;
  if(this.grid){this.scene.remove(this.grid);this.grid.geometry?.dispose();for(const m of [].concat(this.grid.material||[]))m.dispose()}
  const points=[],u0=(cu-half)*step,u1=(cu+half)*step,v0=(cv-half)*step,v1=(cv+half)*step;
  for(let i=-half;i<=half;i++){const n=i*step/1000,edge=half*step/1000;points.push(new THREE.Vector3(n,0,-edge),new THREE.Vector3(n,0,edge),new THREE.Vector3(-edge,0,n),new THREE.Vector3(edge,0,n))}
  this.grid=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xa0b6a9,transparent:true,opacity:.55}));this.grid.position.copy(frame.origin).addScaledVector(frame.u,cu*step).addScaledVector(frame.v,cv*step).multiplyScalar(.001).addScaledVector(frame.normal,.0005);this.grid.quaternion.copy(frame.quaternion);this.grid.visible=this.workplane?.visible!==false;this.grid.userData={key,step,linesPerDirection:half*2+1,limited:this.gridLimited,origin:frame.origin.toArray(),u:frame.u.toArray(),v:frame.v.toArray(),range:{u:[u0,u1],v:[v0,v1]}};this.scene.add(this.grid);if(this.orientationLabel)this.syncNavigation();
 }
 workplaneView(){this.cancelInteraction();const f=workplaneFrame(this.workplane),target=f.origin.clone().multiplyScalar(.001);this.setNavigation('orbit');this.currentView='workplane';this.camera.up.copy(f.v).negate();this.camera.position.copy(target).addScaledVector(f.normal,Math.max(this.span||4,4)*4);this.camera.zoom=1;this.camera.lookAt(target);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.resetOrbitControls(target);this.syncNavigation();this.updateAccessibleGizmo()}
 previewPlacement(ids,delta,targetId=null,contactPoint=null,contact=null){
  this.clear(this.previewGroup);if(!delta)return;
  this.scene.updateMatrixWorld(true);
  for(const source of this.objects.filter(o=>ids.includes(o.userData.part.id)||o.userData.part.id===targetId)){
   const moving=ids.includes(source.userData.part.id),preview=createFocusOverlay(source.geometry,moving?'moving':'target',{fill:moving,overlay:true,occluded:true,marker:false});
   source.matrixWorld.decompose(preview.position,preview.quaternion,preview.scale);if(moving)preview.position.add(new THREE.Vector3(...delta).multiplyScalar(.001));preview.renderOrder=8;this.previewGroup.add(preview);
  }
  const face=createContactFaceOverlay(contact?.targetFacePolygon||contact?.contactPolygon);if(face)this.previewGroup.add(face);
  if(contactPoint){const marker=createFeedbackMarker('contact');marker.position.set(...contactPoint.map(n=>n/1000));this.previewGroup.add(marker)}
 }

 clear(group){if(!group)return;while(group.children.length){const child=group.children[0];child.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[])){if(m.userData?.atelierVisualMaterial)disposeVisualMaterial(m);else{m.map?.dispose();m.dispose()}}});group.remove(child)}}
 release(){this.transform.detach();this.pivot.updateMatrixWorld(true);for(const child of [...this.pivot.children])(child.userData.part?.kind==='fixing'?this.fixingGroup:this.group).attach(child);this.pivot.position.set(0,0,0);this.pivot.quaternion.identity();this.pivot.updateMatrixWorld(true);this.naturalPivot=null}
 set(model,p){
  this.cancelInteraction();this.previewPlacement([],null);this.clearArrangementPreview();this.clear(this.guideGroup);this.clear(this.selectionMeasureGroup);this.hovered=null;this.clear(this.highlightGroup);this.release();this.model=model;this.project=p;this.clear(this.group);this.clear(this.dimGroup);this.clear(this.jointGroup);this.clear(this.fixingGroup);this.fixingObjects=[];this.objects=[];
  const bounds=model.bounds||{min:[-p.width/2,0,-p.depth/2],max:[p.width/2,p.height,p.depth/2],width:p.width,depth:p.depth,height:p.height};this.bounds=bounds;
  this.center.set(...bounds.min.map((v,i)=>(v+bounds.max[i])/2000));this.span=Math.max(bounds.width,bounds.depth,bounds.height*1.4,2000)/1000*.65+.6;this.resize();this.freeNavigation.scale=Math.max(1,this.span);this.setWorkplane(p.workplane);
  disposeVisualMaterial(this.ground.material);this.ground.material=createGroundMaterial({textures:this.textures,kind:p.ground==='concrete'||p.ground==='pavers'?'concrete':'grass'});
  for(const part of model.parts){let mesh;const a=new THREE.Vector3(...part.a).multiplyScalar(.001),b=new THREE.Vector3(...part.b).multiplyScalar(.001),dir=b.clone().sub(a),length=dir.length();
   if(part.material==='wood'&&part.kind==='panel'){mesh=new THREE.Mesh(panelGeometry(part),createPartMaterial(part,{species:p.material,textures:this.textures}));mesh.castShadow=true;mesh.receiveShadow=true;}else if(part.material==='wood'){
    mesh=new THREE.Mesh(new THREE.BoxGeometry(part.width/1000,part.height/1000,Math.max(length,.001)),createPartMaterial(part,{species:p.material,textures:this.textures}));mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.copy(timberQuaternion(part));mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x876e4c,transparent:true,opacity:.38})));
   }else if(part.material==='wall'){
    mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(length,.001),part.height/1000,(part.wallThickness||part.width||200)/1000),createPartMaterial(part,{textures:this.textures}));mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.position.y+=part.height/2000;mesh.rotation.y=-Math.atan2(dir.z,dir.x);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x8a8d84,transparent:true,opacity:.6})));
   }else if(part.material==='mesh'){
    if(!part.surfaceWidth||!part.surfaceHeight)continue;const tx=document.createElement('canvas');tx.width=64;tx.height=64;const c=tx.getContext('2d');c.strokeStyle='rgba(80,95,81,.68)';c.lineWidth=1.8;c.strokeRect(0,0,64,64);const tex=new THREE.CanvasTexture(tx);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(part.surfaceWidth/80,part.surfaceHeight/80);
    mesh=new THREE.Mesh(panelGeometry(part),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false,opacity:.65}));
   }else if(part.material==='roof'){
    mesh=new THREE.Mesh(panelGeometry(part),createPartMaterial(part,{textures:this.textures}));mesh.castShadow=true;
   }else if(part.material==='concrete'){
    const dims=part.boxDim||[p.footingWidth,p.footingDepth,p.footingWidth];mesh=new THREE.Mesh(new THREE.BoxGeometry(...dims.map(v=>v/1000)),createPartMaterial(part,{textures:this.textures}));mesh.position.copy(a).add(b).multiplyScalar(.5);
    const outline=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineDashedMaterial({color:0x929c8c,transparent:true,opacity:.6,depthTest:false,dashSize:.06,gapSize:.04}));outline.computeLineDistances();outline.renderOrder=2;mesh.add(outline);
   }else if(part.material==='metal'){
    const size=(part.width||p.postSection+30)/1000;mesh=new THREE.Mesh(new THREE.BoxGeometry(size,.004,size),new THREE.MeshStandardMaterial({color:0xb3bec3,metalness:.3,roughness:.46}));mesh.position.set(a.x,a.y+.002,a.z);
    for(const sign of [-1,1]){const cheek=new THREE.Mesh(new THREE.BoxGeometry(.006,.09,size),new THREE.MeshStandardMaterial({color:0xb3bec3,metalness:.3,roughness:.46}));cheek.position.set(sign*(size/2-.012),.047,0);mesh.add(cheek)}
   }
   if(mesh){if(part.material==='wood')applyWoodGrainUV(mesh.geometry,part);mesh.userData.part=part;mesh.name=part.id;mesh.visible=this.isVisible(part);this.group.add(mesh);this.objects.push(mesh)}
  }
  for(const joint of model.joints){if(!joint.position)continue;const dot=new THREE.Mesh(new THREE.SphereGeometry(.045,10,10),new THREE.MeshBasicMaterial({color:0xc48b45,depthTest:false}));dot.position.set(...joint.position.map(v=>v/1000));dot.userData.part={...joint,kind:'joint'};dot.renderOrder=5;this.jointGroup.add(dot)}this.jointGroup.visible=this.flags.joints;
  for(const joint of [...model.joints,...getFoundationJoints(model,p)])for(const fixing of buildJointFixings(joint,model)){
   const mesh=new THREE.Mesh(createFixingGeometry(fixing.type,{recipe:fixing.recipe,...fixing.geometry}),new THREE.MeshStandardMaterial({color:fixing.type==='connector'?0xb6c1c7:0x9faab1,metalness:.3,roughness:.42}));
   if(fixing.type==='connector')mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,35),new THREE.LineBasicMaterial({color:0x5b6971,transparent:true,opacity:.45})));
   mesh.position.set(...fixing.position.map(v=>v/1000));mesh.quaternion.fromArray(fixing.quaternion);mesh.userData.part={...fixing,kind:'fixing'};mesh.name=fixing.id;mesh.castShadow=true;this.fixingGroup.add(mesh);this.fixingObjects.push(mesh);
  }
  this.fixingGroup.visible=this.flags.fixings;
  const min=bounds.min.map(v=>v/1000),max=bounds.max.map(v=>v/1000),label=v=>`${v.toLocaleString('fr-FR',{maximumFractionDigits:1})} mm`;
  if(model.parts.length){this.dimension([min[0],.04,min[2]-.35],[max[0],.04,min[2]-.35],label(bounds.width));this.dimension([max[0]+.35,.04,min[2]],[max[0]+.35,.04,max[2]],label(bounds.depth));this.dimension([min[0]-.35,min[1],max[2]],[min[0]-.35,max[1],max[2]],label(bounds.height))}
  this.dimGroup.visible=this.flags.dimensions;this.select(this.selectedIds);if(!this.hasFit){this.view('iso');this.hasFit=true}
 }
 dimension(a,b,label,group=this.dimGroup,color=0x4e6454,dimensionEdit=null){if(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))<.00001)return;const points=[new THREE.Vector3(...a),new THREE.Vector3(...b)];group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,depthTest:false})));for(const pos of points){const dot=new THREE.Mesh(new THREE.SphereGeometry(.012,8,8),new THREE.MeshBasicMaterial({color,depthTest:false}));dot.position.copy(pos);group.add(dot)}
  if(!label)return null;const cv=document.createElement('canvas');cv.width=Math.max(300,Math.min(1000,String(label).length*23+50));cv.height=100;const c=cv.getContext('2d');c.fillStyle='#f8f9f3';c.beginPath();c.roundRect(18,12,cv.width-36,76,18);c.fill();c.fillStyle='#'+new THREE.Color(color).getHexString();c.font='500 38px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(label,cv.width/2,53);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),depthTest:false}));sprite.position.copy(points[0]).add(points[1]).multiplyScalar(.5);sprite.position.y+=.075;sprite.scale.set(cv.width/375,.267,1);sprite.userData.label=label;sprite.userData.aspect=cv.width/100;if(dimensionEdit)sprite.userData.dimensionEdit=structuredClone(dimensionEdit);group.add(sprite);return sprite;
 }
 pickDimension(event){if(this.dragStart||this.pendingTransform||this.panelDrag||this.pendingPanel||this.interaction)return null;this.pointerRay(event);return this.raycaster.intersectObjects(this.selectionMeasureGroup.children,true).find(hit=>hit.object.userData.dimensionEdit&&hit.object.visible&&this.selectionMeasureGroup.visible)?.object||null}
 activateDimension(event){const sprite=this.pickDimension(event);if(!sprite)return false;this.onDimensionEdit?.(structuredClone(sprite.userData.dimensionEdit));return true}
 select(ids=[]){
  if(this.transform.dragging)return;if(this.pendingTransform)this.cancelInteraction();this.release();this.selectedFixing=null;for(const o of this.fixingObjects||[])o.material.emissive?.set(0);this.selectedIds=(Array.isArray(ids)?ids:[ids]).filter(Boolean);
  const editable=this.project?.mode==='free'?this.objects.filter(o=>o.visible&&this.selectedIds.includes(o.userData.part.id)&&this.project.freeParts.some(p=>p.id===o.userData.part.id)):[];
  for(const o of this.objects){const selected=this.selectedIds.includes(o.userData.part?.id);if(o.material.emissive)o.material.emissive.set(selected?0x102b35:0)}
  if(editable.length){const box=new THREE.Box3();for(const o of editable)box.expandByObject(o);box.getCenter(this.pivot.position);this.naturalPivot=this.pivot.position.clone();if(this.tool==='translate'&&this.project.workplane?.lock)this.pivot.quaternion.copy(workplaneFrame(this.project.workplane).quaternion);this.pivot.updateMatrixWorld(true);for(const o of editable)this.pivot.attach(o);this.configureTransform()}this.rebuildHighlights();this.showSelectionMeasurements();this.refreshPanelHandles?.();
 }
 showSelectionMeasurements(moving=null){
  this.clear(this.selectionMeasureGroup);if(!normalizeAssistance(this.project?.assistance).guides)return;
  const pool=this.project?.freeParts||this.model?.parts||[];let parts,ids;
  if(!moving&&this.selectedIds.length===2){ids=[...this.selectedIds];parts=ids.map(id=>pool.find(p=>p.id===id))}
  else if((moving?.length===1||!moving&&this.selectedIds.length===1&&this.distanceReferenceId)){
   const source=moving?.[0]||pool.find(p=>p.id===this.selectedIds[0]);if(source?.material!=='wood')return;
   const targets=this.visibleSnapTargets([source.id]).filter(p=>p.material==='wood'&&p.kind!=='panel');
   let reference=targets.find(p=>p.id===this.distanceReferenceId);
   if(!reference&&moving){const frame=workplaneFrame(this.workplane),center=new THREE.Vector3(...placementAnchor(source,this.workplane)),nearby=targets.map(p=>{const delta=new THREE.Vector3(...placementAnchor(p,this.workplane)).sub(center);delta.addScaledVector(frame.normal,-delta.dot(frame.normal));return {p,d:delta.lengthSq()}}).sort((a,b)=>a.d-b.d).slice(0,16);reference=nearby.find(({p})=>{try{return betweenMeasurements(p,source,this.workplane).axisDistance>0}catch{return false}})?.p;}
   if(!reference)return;parts=[reference,source];ids=[reference.id,source.id];this.distanceReferenceId=reference.id;
  }else return;
  if(parts.some(p=>p?.material!=='wood'||p?.kind==='panel'))return;
  try{
   const measures=betweenMeasurements(parts[0],parts[1],this.workplane),offset=new THREE.Vector3(...measures.normal).cross(new THREE.Vector3(...measures.direction)).normalize().multiplyScalar(Math.max(20,this.guideTolerance()*5));
   for(const item of measures.lines.slice(0,2)){const color=item.measure==='axes'?0xc52b9a:0x009caa,d=item.measure==='faces'?offset:new THREE.Vector3(),a=new THREE.Vector3(...item.a).add(d),b=new THREE.Vector3(...item.b).add(d);this.dimension(a.toArray().map(n=>n/1000),b.toArray().map(n=>n/1000),item.label,this.selectionMeasureGroup,color,{referenceIds:ids,measure:item.measure});
    if(item.measure==='faces'){const points=[new THREE.Vector3(...item.a).multiplyScalar(.001),a.clone().multiplyScalar(.001),new THREE.Vector3(...item.b).multiplyScalar(.001),b.clone().multiplyScalar(.001)],lines=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:.5,depthTest:false}));this.selectionMeasureGroup.add(lines)}
   }this.selectionMeasureGroup.visible=true;this.updateHighlights();
  }catch{/* A coincident pair in this projection has no usable dimension. */}
 }
 selectFixing(jointId,id){
  if(this.transform.dragging)return;this.select([]);const object=this.fixingObjects?.find(o=>o.userData.part.jointId===jointId&&o.userData.part.id===id);if(!object)return;
  this.selectedFixing=object.userData.part;object.material.emissive.set(0x726424);this.fixingGroup.visible=true;this.flags.fixings=true;this.pivot.position.copy(object.position);this.naturalPivot=this.pivot.position.clone();this.pivot.updateMatrixWorld(true);this.pivot.attach(object);
  if(this.selectedFixing.type==='connector')for(const child of this.fixingObjects.filter(o=>o!==object&&o.userData.part.jointId===jointId&&o.userData.part.connectorKey===this.selectedFixing.key))this.pivot.attach(child);
  const joint=[...this.model.joints,...getFoundationJoints(this.model,this.project)].find(j=>j.id===jointId);
  if(joint?.fixingLayout?.mode==='manual'){this.transform.setMode('translate');this.transform.setSpace('world');this.transform.showX=this.transform.showY=this.transform.showZ=true;this.transform.setTranslationSnap(null);this.transform.attach(this.pivot)}
  this.rebuildHighlights();this.updateAccessibleGizmo();
 }
 setTool(tool){this.cancelInteraction();this.tool=tool;if(this.selectedFixing)this.selectFixing(this.selectedFixing.jointId,this.selectedFixing.id);else this.select(this.selectedIds)}
 configureTransform(){const tool=this.tool;this.transform.detach();if(this.interaction||this.pendingTransform||this.project?.mode!=='free'||!this.pivot.children.length||!['translate','rotate'].includes(tool))return;const locked=tool==='translate'&&this.project.workplane?.lock;this.transform.setMode(tool);this.transform.setSpace(locked?'local':'world');this.transform.showX=this.transform.showZ=tool!=='rotate';this.transform.showY=!locked;this.transform.setTranslationSnap(null);this.transform.setRotationSnap(this.project.snap?Math.PI/12:null);this.transform.attach(this.pivot);this.updateAccessibleGizmo()}

 isVisible(part){return (!this.isolatedIds||this.isolatedIds.has(part.id))&&this.flags[part.group]!==false&&!(part.material==='mesh'&&!this.flags.mesh)&&!(part.material==='wall'&&!this.flags.wall)}
 setTextures(enabled){this.textures=!!enabled;this.flags.textures=this.textures;this.scene.traverse(object=>{if(object.material)setMaterialTextures(object.material,this.textures)});return this.textures}
 layer(name,value){if(name==='textures'){this.setTextures?.(value);return}this.flags[name]=value;if(name==='dimensions')this.dimGroup.visible=value;else if(name==='joints')this.jointGroup.visible=value;else if(name==='fixings')this.fixingGroup.visible=value;else for(const o of this.objects)o.visible=this.isVisible(o.userData.part);if(!this.transform.dragging)this.select(this.selectedIds);this.updateHighlights()}
 setIsolation(ids=null){this.cancelInteraction();this.isolatedIds=Array.isArray(ids)&&ids.length?new Set(ids):null;for(const object of this.objects)object.visible=this.isVisible(object.userData.part);this.select(this.selectedIds);return this.isolatedIds?[...this.isolatedIds]:null}
 focusSelection(ids=this.selectedIds){
  this.cancelInteraction();const chosen=this.objects.filter(o=>o.visible&&(!ids?.length||ids.includes(o.userData.part.id)));if(!chosen.length)return false;this.scene.updateMatrixWorld(true);const box=new THREE.Box3();chosen.forEach(o=>box.expandByObject(o));const target=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(size.length()/2,.05),forward=this.camera.getWorldDirection(new THREE.Vector3());
  if(this.camera.isOrthographicCamera){this.camera.position.add(target.clone().sub(this.controls.target));const aspect=(this.camera.right-this.camera.left)/(this.camera.top-this.camera.bottom);this.camera.zoom=(this.camera.top-this.camera.bottom)/(radius*2.5/Math.min(1,aspect));this.camera.updateProjectionMatrix();this.resetOrbitControls(target)}
  else{const distance=radius*1.3/Math.sin(THREE.MathUtils.degToRad(this.camera.fov/2));this.camera.position.copy(target).addScaledVector(forward,-distance);this.camera.updateMatrixWorld()}
  this.updateAccessibleGizmo();return true;
 }
 view(name){this.cancelInteraction();if(['top','front','side'].includes(name))this.setNavigation('orbit');this.currentView=name;this.camera.up.set(0,name==='top'?0:1,name==='top'?-1:0);const distance=this.navigation==='free'?Math.max(this.span||4.7,(this.span||4.7)/this.freeCamera.aspect)/Math.tan(THREE.MathUtils.degToRad(this.freeCamera.fov/2)):Math.max(this.span||4.7,4)*4;const offset=name==='top'?new THREE.Vector3(0,distance,0):name==='front'?new THREE.Vector3(0,0,-distance):name==='side'?new THREE.Vector3(distance,0,0):new THREE.Vector3(.7,.55,-1).normalize().multiplyScalar(distance);this.camera.position.copy(this.center).add(offset);this.camera.zoom=1;this.camera.lookAt(this.center);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();if(this.navigation==='orbit')this.resetOrbitControls(this.center);this.syncNavigation();this.updateAccessibleGizmo()}
 zoom(delta){if(this.navigation==='free'){this.freeNavigation.zoom(delta);return}this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom*delta,.02,1000);this.camera.updateProjectionMatrix()}

 withCommittedTransforms(callback){const original=this.pendingTransform?.snapshot||this.dragSnapshot,panel=this.pendingPanel||this.panelDrag,panelVisible=panel?.object.visible,display=original?{position:this.pivot.position.clone(),quaternion:this.pivot.quaternion.clone(),scale:this.pivot.scale.clone()}:null;if(original)this.restoreTransform(original);if(panel)panel.object.visible=panel.visible;try{return withCleanVisuals(this.scene,callback)}finally{if(display)this.restoreTransform(display);if(panel)panel.object.visible=panelVisible}}
 captureView(options){return captureViewportView(this,options)}
 png(){return this.withCommittedTransforms(()=>{const hidden=[this.transform.getHelper(),this.previewGroup,this.highlightGroup,this.placementGroup,this.guideGroup,this.arrangementGroup,this.selectionMeasureGroup,this.panelHandleGroup],visibility=hidden.map(o=>o.visible);hidden.forEach(o=>o.visible=false);try{this.renderer.render(this.scene,this.camera);return this.canvas.toDataURL('image/png')}finally{hidden.forEach((o,i)=>o.visible=visibility[i])}})}
 obj(){return this.withCommittedTransforms(()=>{this.scene.updateMatrixWorld(true);const root=new THREE.Group();root.add(this.group.clone(),this.fixingGroup.clone());for(const source of this.pivot.children){const clone=source.clone();source.matrixWorld.decompose(clone.position,clone.quaternion,clone.scale);root.add(clone)}return new OBJExporter().parse(root)})}
}
