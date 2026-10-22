import * as THREE from 'three';
import {PlanEditor} from './plan-editor.js';

export const EXPORT_VIEWS=[
 {id:'current',label:'Angle actuel'},
 {id:'iso-front-left',label:'3D · avant gauche',direction:[-1,.75,-1]},
 {id:'iso-front-right',label:'3D · avant droit',direction:[1,.75,-1]},
 {id:'iso-rear-left',label:'3D · arrière gauche',direction:[-1,.75,1]},
 {id:'iso-rear-right',label:'3D · arrière droit',direction:[1,.75,1]},
 {id:'top',label:'Dessus',direction:[0,1,0]},
 {id:'front',label:'Face',direction:[0,0,-1]},
 {id:'side',label:'Côté',direction:[1,0,0]}
];
export const EXPORT_STYLES=[{id:'current',label:'Calques actuels'},{id:'structure',label:'Structure seule'}];
const PLAN_VIEWS=['top','front','side'];
const encoder=new TextEncoder();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const visible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};

/** Exporte sans changer la caméra de travail, la sélection ni les calques. */
export function captureViewportView(viewport,{view='current',style='current',width=1600,height=Math.round(width*.75)}={}){
 const preset=EXPORT_VIEWS.find(item=>item.id===view);
 if(!preset||!EXPORT_STYLES.some(item=>item.id===style))throw new Error('Vue ou affichage inconnu.');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>4096||height>4096)throw new Error('Dimensions d’image invalides.');
 const {renderer,scene,canvas}=viewport,oldSize=renderer.getSize(new THREE.Vector2()).clone(),oldRatio=renderer.getPixelRatio();
 const changed=new Map(),hide=object=>{if(object&&!changed.has(object)){changed.set(object,object.visible);object.visible=false;}};
 try{
  return viewport.withCommittedTransforms(()=>{
   for(const object of [viewport.transform?.getHelper(),viewport.previewGroup,viewport.highlightGroup,viewport.placementGroup,viewport.guideGroup,viewport.arrangementGroup,viewport.selectionMeasureGroup,viewport.panelHandleGroup,viewport.placementShadowGroup,viewport.measurementGroup,viewport.grid,viewport.axes])hide(object);
   if(style==='structure'){
    for(const object of viewport.objects||[])if(['mesh','roof'].includes(object.userData.part?.material))hide(object);
    hide(viewport.fixingGroup);hide(viewport.jointGroup);
    for(const object of viewport.pivot?.children||[])if(object.userData.part?.kind==='fixing')hide(object);
   }
   scene.updateMatrixWorld(true);
   const aspect=width/height;let camera;
   if(view==='current'){
    camera=viewport.camera.clone();
    if(camera.isPerspectiveCamera)camera.aspect=aspect;
    else{const center=(camera.left+camera.right)/2,half=(camera.top-camera.bottom)*aspect/2;camera.left=center-half;camera.right=center+half;}
   }else{
    const box=new THREE.Box3();
    for(const object of viewport.objects||[])if(visible(object))box.expandByObject(object);
    if(viewport.dimGroup&&visible(viewport.dimGroup))box.expandByObject(viewport.dimGroup);
    if(box.isEmpty())box.set(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2,1));
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),distance=Math.max(size.length()*2,5);
    camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,distance*4+10);
    camera.up.set(0,view==='top'?0:1,view==='top'?-1:0);
    camera.position.copy(center).addScaledVector(new THREE.Vector3(...preset.direction).normalize(),distance);camera.lookAt(center);camera.updateMatrixWorld(true);
    const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
    const halfX=Math.max(...corners.map(p=>Math.abs(p.x))),halfY=Math.max(...corners.map(p=>Math.abs(p.y))),half=Math.max(halfY,halfX/aspect,.05)*1.15;
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
   }
   camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
   renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.render(scene,camera);
   return canvas.toDataURL('image/png');
  });
 }finally{
  for(const [object,state]of changed)object.visible=state;
  renderer.setPixelRatio(oldRatio);renderer.setSize(oldSize.x,oldSize.y,false);
  renderer.render(scene,viewport.camera);
 }
}

/** L’éditeur d’export indépendant ne touche pas au cadrage du plan ouvert. */
export function exportPlanView(project,model,view,{document:doc=globalThis.document,width=1600,height=1200}={}){
 if(!PLAN_VIEWS.includes(view))throw new Error('Vue de plan inconnue.');
 const container=doc.createElement('div');container.style.cssText=`position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;visibility:hidden;pointer-events:none`;
 container.setAttribute('aria-hidden','true');doc.body.append(container);let editor;
 try{editor=new PlanEditor(container);editor.set({...project,drawing:{...project.drawing,view}},model,[]);return editor.exportSVG();}
 finally{editor?.dispose();container.remove();}
}

export function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
const join=chunks=>{const bytes=new Uint8Array(chunks.reduce((sum,chunk)=>sum+chunk.length,0));let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;};

/** ZIP sans compression : les PNG sont déjà compressés, aucun service externe. */
export function zipFiles(files){
 const chunks=[],directory=[];let offset=0;
 for(const file of files){
  if(!file.name||file.name.startsWith('/')||file.name.split('/').includes('..'))throw new Error('Nom de fichier ZIP invalide.');
  const name=encoder.encode(file.name),data=typeof file.data==='string'?encoder.encode(file.data):file.data;
  if(!(data instanceof Uint8Array)||name.length>65535)throw new Error('Contenu ZIP invalide.');
  const crc=crc32(data),local=new Uint8Array(30),lh=new DataView(local.buffer);
  lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x800,true);lh.setUint16(12,0x21,true);lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,name.length,true);
  const central=new Uint8Array(46),ch=new DataView(central.buffer);ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x800,true);ch.setUint16(14,0x21,true);ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,name.length,true);ch.setUint32(42,offset,true);
  chunks.push(local,name,data);directory.push(central,name);offset+=local.length+name.length+data.length;
 }
 const central=join(directory),end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);view.setUint32(12,central.length,true);view.setUint32(16,offset,true);
 return join([...chunks,central,end]);
}
export function exportJobs({views=[],styles=['current'],plans=[]}={}){
 const validViews=EXPORT_VIEWS.filter(item=>views.includes(item.id)),validStyles=EXPORT_STYLES.filter(item=>styles.includes(item.id));
 return [...validViews.flatMap(view=>validStyles.map(style=>({kind:'image',view:view.id,style:style.id,label:`${view.label} · ${style.label}`,name:`3D/${view.id}_${style.id}.png`}))),...PLAN_VIEWS.filter(view=>plans.includes(view)).map(view=>({kind:'plan',view,label:`Plan · ${EXPORT_VIEWS.find(item=>item.id===view).label}`,name:`Plans/${view}.svg`}))];
}
function pngBytes(url){if(!/^data:image\/png;base64,/.test(url))throw new Error('Le navigateur n’a pas produit une image PNG.');return Uint8Array.from(atob(url.slice(url.indexOf(',')+1)),c=>c.charCodeAt(0));}
export async function buildViewArchive({project,model,viewport,selection,width=1600,document:doc=globalThis.document,onProgress=()=>{},cancelled=()=>false}){
 const jobs=exportJobs(selection);if(!jobs.length)throw new Error('Choisissez au moins une vue et son affichage, ou un plan.');
 if(jobs.some(job=>job.kind==='image')&&!viewport?.captureView)throw new Error('La 3D n’est pas disponible. Vous pouvez exporter les plans.');
 if(jobs.some(job=>job.kind==='image')&&viewport?.waitForTextures)await viewport.waitForTextures();
 const files=[];
 for(const [index,job]of jobs.entries()){
  if(cancelled())throw new Error('Export annulé.');onProgress(index,jobs.length,job.label);
  await new Promise(resolve=>setTimeout(resolve,0));if(cancelled())throw new Error('Export annulé.');
  files.push({name:job.name,data:job.kind==='image'?pngBytes(viewport.captureView({...job,width,height:Math.round(width*.75)})):exportPlanView(project,model,job.view,{document:doc,width,height:Math.round(width*.75)})});
 }
 const title=esc(project.name||'Atelier · Sur mesure');
 files.push({name:'index.html',data:`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Vues exportées</title><style>body{font:16px system-ui;color:#253c32;background:#f4f5f1;margin:0;padding:24px}main{max-width:1200px;margin:auto}h1{font-size:28px}article{background:white;padding:16px;margin:24px 0;border:1px solid #dce1da;border-radius:12px}h2{font-size:18px}img{display:block;width:100%;height:auto}a{color:#27634b}@media print{body{background:white;padding:0}article{break-inside:avoid;border:0}}</style><main><h1>${title}</h1><p>${jobs.length} vues · Extraire le ZIP, puis ouvrir ce fichier. Les plans sont en SVG et leurs cotes en millimètres. Les images PNG ne constituent pas des plans à l’échelle.</p>${jobs.map(job=>`<article><h2>${esc(job.label)}</h2><a href="${job.name}" download>Télécharger ce fichier</a><img src="${job.name}" alt="${esc(job.label)}"></article>`).join('')}</main></html>`});
  onProgress(jobs.length,jobs.length,'Archive prête');return {bytes:zipFiles(files),files:files.map(file=>file.name),count:jobs.length};
}
