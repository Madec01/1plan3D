import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Window} from 'happy-dom';
import {Viewport} from '../src/viewport.js';
import {withCleanVisuals} from '../src/viewport-visuals.js';
import {captureViewportView,exportPlanView,exportJobs,buildViewArchive,crc32,zipFiles} from '../src/view-export.js';
import {openBatchExport} from '../src/batch-export-ui.js';
import {DEFAULT_PROJECT,normalizeProject,buildProject} from '../src/engine.js';

function unpack(bytes){
 const entries=new Map(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decode=new TextDecoder();let offset=0;
 while(view.getUint32(offset,true)===0x04034b50){
  assert.equal(view.getUint16(offset+8,true),0);assert.equal(view.getUint16(offset+6,true),0x800);
  const length=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true),name=decode.decode(bytes.slice(offset+30,offset+30+nameLength)),start=offset+30+nameLength+extraLength,data=bytes.slice(start,start+length);
  assert.equal(crc32(data),view.getUint32(offset+14,true));entries.set(name,data);offset=start+length;
 }
 assert.equal(view.getUint32(offset,true),0x02014b50);const end=bytes.length-22;assert.equal(view.getUint32(end,true),0x06054b50);assert.equal(view.getUint16(end+8,true),entries.size);assert.equal(view.getUint32(end+16,true),offset);return entries;
}
function sceneFixture(){
 const scene=new THREE.Scene(),group=new THREE.Group(),pivot=new THREE.Group();scene.add(group,pivot);
 const wood=new THREE.Mesh(new THREE.BoxGeometry(.1,2,.1),new THREE.MeshBasicMaterial());wood.position.set(-1,1,0);wood.userData.part={id:'P',material:'wood'};pivot.add(wood);
 const panel=new THREE.Mesh(new THREE.BoxGeometry(2,1,.01),new THREE.MeshBasicMaterial());panel.position.set(0,.5,0);panel.userData.part={id:'M',material:'mesh'};group.add(panel);
 const hidden=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());hidden.position.x=1000;hidden.visible=false;hidden.userData.part={id:'H',material:'wood'};group.add(hidden);
 const preview=new THREE.Mesh(new THREE.BoxGeometry(50,50,50),new THREE.MeshBasicMaterial());preview.userData.previewOnly=true;scene.add(preview);
 const helper=new THREE.Group();scene.add(helper);
 const camera=new THREE.PerspectiveCamera(50,1.4,.01,1000);camera.position.set(4,3,-6);camera.lookAt(0,1,0);camera.updateMatrixWorld();
 const renderer={size:new THREE.Vector2(800,600),ratio:2,renders:[],getSize(out){return out.copy(this.size);},getPixelRatio(){return this.ratio;},setPixelRatio(value){this.ratio=value;},setSize(w,h){this.size.set(w,h);},render(s,c){this.renders.push({camera:c,woodVisible:wood.visible,panelVisible:panel.visible,hiddenVisible:hidden.visible,previewParent:preview.parent,helperVisible:helper.visible});}};
 const viewport={scene,group,pivot,camera,renderer,canvas:{toDataURL:()=> 'data:image/png;base64,AQID'},objects:[wood,panel,hidden],transform:{getHelper:()=>helper},withCommittedTransforms(callback){return withCleanVisuals(scene,callback);},captureView:Viewport.prototype.captureView};
 return {viewport,wood,panel,hidden,preview,helper};
}
test('batch captures use independent fitted cameras, current layers and no previews, then restore scene and renderer',()=>{
 const f=sceneFixture(),v=f.viewport,before=v.camera.toJSON(),children=[...v.scene.children];
 assert.equal(v.captureView({view:'iso-front-left',style:'structure',width:1600,height:1200}),'data:image/png;base64,AQID');
 const frame=v.renderer.renders[0];assert.notEqual(frame.camera,v.camera);assert.ok(frame.camera.isOrthographicCamera);assert.equal(frame.panelVisible,false);assert.equal(frame.hiddenVisible,false);assert.equal(frame.previewParent,null);assert.equal(frame.helperVisible,false);
 v.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(f.wood);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(frame.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1);}
 assert.deepEqual(v.camera.toJSON(),before);assert.deepEqual(v.renderer.size.toArray(),[800,600]);assert.equal(v.renderer.ratio,2);assert.equal(f.panel.visible,true);assert.equal(f.hidden.visible,false);assert.equal(f.helper.visible,true);assert.deepEqual(v.scene.children,children);assert.equal(v.renderer.renders.at(-1).camera,v.camera);
 v.captureView({view:'current',style:'current',width:1024,height:768});const current=v.renderer.renders.at(-2);assert.ok(current.camera.isPerspectiveCamera);assert.deepEqual(current.camera.position.toArray(),v.camera.position.toArray());assert.deepEqual(current.camera.quaternion.toArray(),v.camera.quaternion.toArray());assert.equal(current.camera.aspect,4/3);assert.equal(current.panelVisible,true);assert.deepEqual(v.camera.toJSON(),before);
});
test('failed PNG serialization restores hidden objects, export-only previews, camera and renderer',()=>{
 const f=sceneFixture(),v=f.viewport;v.canvas.toDataURL=()=>{throw Error('PNG bloqué');};
 assert.throws(()=>captureViewportView(v,{view:'top',style:'structure'}),/PNG bloqué/);assert.equal(f.panel.visible,true);assert.equal(f.preview.parent,v.scene);assert.equal(f.helper.visible,true);assert.deepEqual(v.renderer.size.toArray(),[800,600]);assert.equal(v.renderer.ratio,2);assert.equal(v.renderer.renders.at(-1).camera,v.camera);
});
test('capture uses committed geometry during a pending move and restores the pending pose afterward',()=>{
 const f=sceneFixture(),v=f.viewport;v.withCommittedTransforms=Viewport.prototype.withCommittedTransforms;v.restoreTransform=Viewport.prototype.restoreTransform;v.updateHighlights=()=>{};
 v.pendingTransform={snapshot:{position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),scale:new THREE.Vector3(1,1,1)}};v.pivot.position.set(5,0,0);
 let during;const render=v.renderer.render.bind(v.renderer);v.renderer.render=(scene,camera)=>{scene.updateMatrixWorld(true);if(camera!==v.camera)during=f.wood.getWorldPosition(new THREE.Vector3()).toArray();render(scene,camera);};
 v.captureView({view:'front'});assert.deepEqual(during,[-1,1,0]);assert.deepEqual(v.pivot.position.toArray(),[5,0,0]);assert.ok(v.pendingTransform);
});
test('ZIP preserves UTF-8 names, binary image bytes, central offsets and CRC-32',()=>{
 assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
 const archive=zipFiles([{name:'Plans/côté.svg',data:'<svg>é</svg>'},{name:'3D/top.png',data:Uint8Array.of(0,255,1,40)}]),entries=unpack(archive);
 assert.equal(new TextDecoder().decode(entries.get('Plans/côté.svg')),'<svg>é</svg>');assert.deepEqual([...entries.get('3D/top.png')],[0,255,1,40]);assert.throws(()=>zipFiles([{name:'../bad',data:'x'}]),/invalide/);
});
test('batch selection deduplicates views, creates selected angle/style combinations and selected plans',()=>{
 const jobs=exportJobs({views:['front','front','unknown','iso-rear-right'],styles:['structure','current'],plans:['side','top','side']});
 assert.equal(jobs.length,6);assert.deepEqual(jobs.map(j=>j.name),['3D/iso-rear-right_current.png','3D/iso-rear-right_structure.png','3D/front_current.png','3D/front_structure.png','Plans/top.svg','Plans/side.svg']);
 assert.equal(exportJobs({views:['front'],styles:[]}).length,0);
});
test('batch creates real independent SVG plans, requested PNGs and escaped gallery without touching project',async()=>{
 const window=new Window(),document=window.document;const project=normalizeProject({...DEFAULT_PROJECT,name:'Enclos <script>',mode:'free',freeParts:[{id:'P',kind:'post',material:'wood',a:[0,0,0],b:[0,2000,0],width:90,height:90}]}),model=buildProject(project),before=JSON.stringify(project);const captures=[];project.name='Enclos <script>';const expectedProject=JSON.stringify(project);
 try{
  const viewport={captureView(options){captures.push(options);return 'data:image/png;base64,AQID';}};
  const result=await buildViewArchive({project,model,viewport,selection:{views:['front','top'],styles:['current','structure'],plans:['front','side']},document});const entries=unpack(result.bytes);assert.equal(result.count,6);assert.equal(entries.size,7);assert.equal(captures.length,4);
  for(const view of ['front','side']){const svg=new TextDecoder().decode(entries.get(`Plans/${view}.svg`));assert.match(svg,/data-plan-part="P"/);assert.doesNotMatch(svg,/plan-dimension-hit|data-preview/);const parsed=new window.DOMParser().parseFromString(svg,'image/svg+xml');assert.equal(parsed.querySelector('parsererror'),null);assert.match(svg,view==='front'?/Plan Face/:/Plan Côté/);}
  const gallery=new TextDecoder().decode(entries.get('index.html'));assert.match(gallery,/Enclos &lt;script&gt;/);assert.doesNotMatch(gallery,/<script>/);assert.equal(document.body.children.length,0);assert.equal(JSON.stringify(project),expectedProject);
  await assert.rejects(buildViewArchive({project,model,selection:{views:['front']},document}),/3D n’est pas disponible/);
  await assert.rejects(buildViewArchive({project,model,viewport,selection:{views:['front']},document,cancelled:()=>true}),/annulé/);
 }finally{await window.happyDOM.close();}
});
test('PNG waits for texture decoding, while SVG-only export stays independent of texture failures',async()=>{
 const window=new Window(),document=window.document,project=normalizeProject(DEFAULT_PROJECT),model=buildProject(project);
 let release,captures=0;const ready=new Promise(resolve=>{release=resolve;});
 const viewport={waitForTextures:()=>ready,captureView(){captures++;return 'data:image/png;base64,AQID';}};
 try{
  const pending=buildViewArchive({project,model,viewport,selection:{views:['front']},document});
  await Promise.resolve();assert.equal(captures,0);release();await pending;assert.equal(captures,1);
  viewport.waitForTextures=()=>Promise.reject(new Error('Texture illisible'));
  await assert.rejects(buildViewArchive({project,model,viewport,selection:{views:['front']},document}),/Texture illisible/);
  const plans=await buildViewArchive({project,model,viewport,selection:{plans:['top']},document});assert.equal(plans.count,1);assert.equal(captures,1);
 }finally{release();await window.happyDOM.close();}
});
test('batch UI remains usable for plan export when WebGL is unavailable',async()=>{
 const window=new Window(),document=window.document,dialog=document.createElement('dialog');document.body.append(dialog);let downloaded;
 const project=normalizeProject(DEFAULT_PROJECT),model=buildProject(project);try{
  const form=openBatchExport({document,project,model,viewport:null,modal(title,html){dialog.innerHTML=html;dialog.showModal();},download(...args){downloaded=args;},filename:()=> 'test'});
  assert.equal(form.querySelector('[name=view]').closest('fieldset').disabled,true);assert.equal(form.querySelector('[type=submit]').disabled,false);assert.match(form.querySelector('[data-batch-progress]').textContent,/1 fichier/);
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<30&&!downloaded;i++)await new Promise(resolve=>setTimeout(resolve,2));assert.ok(downloaded);assert.equal(downloaded[1],'test_vues.zip');assert.equal(downloaded[2],'application/zip');const entries=unpack(downloaded[0]);assert.ok(entries.has('Plans/top.svg'));assert.equal(entries.size,2);
 }finally{await window.happyDOM.close();}
});
