/** Éditeur de plan SVG. Toutes les données sont en mm ; les gestes ne modifient jamais le projet. */
import * as THREE from 'three';
import {timberQuaternion,panelCorners} from './geometry.js';
import {getPlanDimensions} from './plan-dimensions.js';
import {normalizeAssistance,resolveAdaptiveGrid,snapPointToGrid,snapDeltaToGrid,placementAnchor,smartPlacementGuides} from './adaptive-placement.js';

const NS='http://www.w3.org/2000/svg',EPS=1e-7;
const VIEWS={top:{name:'Dessus',hidden:1,plane:'xz',axes:'X → · Z ↓'},front:{name:'Face',hidden:2,plane:'xy',axes:'X → · Y ↑'},side:{name:'Côté',hidden:0,plane:'yz',axes:'Z → · Y ↑'}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite3=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n));
const copy=value=>structuredClone(value);
const fmt=value=>Number(value).toLocaleString('fr-FR',{maximumFractionDigits:3});
const minus=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
let editorSequence=0;
export function projectPlanPoint(point,view='top'){if(!finite3(point))return null;return view==='front'?[point[0],-point[1]]:view==='side'?[point[2],-point[1]]:[point[0],point[2]]}
export function unprojectPlanPoint(point,depth=0,view='top'){return view==='front'?[point[0],-point[1],depth]:view==='side'?[depth,-point[1],point[0]]:[point[0],depth,point[1]]}
function hull(points){const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(sorted.length<3)return sorted;const l=[],u=[];for(const p of sorted){while(l.length>1&&cross(l.at(-2),l.at(-1),p)<=EPS)l.pop();l.push(p)}for(const p of [...sorted].reverse()){while(u.length>1&&cross(u.at(-2),u.at(-1),p)<=EPS)u.pop();u.push(p)}return [...l.slice(0,-1),...u.slice(0,-1)]}
function cornersOf(part){
 if(!part||!finite3(part.a)||!finite3(part.b))return [];
 if(part.kind==='panel'||Array.isArray(part.corners)||['mesh','roof'].includes(part.material))return panelCorners(part).filter(finite3);
 if(part.boxDim?.length===3){const c=part.a.map((v,i)=>(v+part.b[i])/2),points=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])points.push(c.map((v,i)=>v+[x,y,z][i]*part.boxDim[i]/2));return points}
 if(part.kind==='wall'||part.material==='wall'){const a=new THREE.Vector3(...part.a),b=new THREE.Vector3(...part.b),d=b.clone().sub(a).setY(0).normalize(),n=new THREE.Vector3(-d.z,0,d.x),points=[];for(const p of [a,b])for(const sign of [-1,1])for(const top of [0,1])points.push(p.clone().addScaledVector(n,sign*(part.wallThickness||part.width||1)/2).add(new THREE.Vector3(0,top*part.height,0)).toArray());return points}
 const q=timberQuaternion(part),points=[];for(const p of [part.a,part.b])for(const x of [-1,1])for(const y of [-1,1])points.push(new THREE.Vector3(x*(part.width||1)/2,y*(part.height||1)/2,0).applyQuaternion(q).add(new THREE.Vector3(...p)).toArray());return points;
}
export function projectPlanPart(part,view='top'){
 const corners=cornersOf(part),polygon=hull(corners.map(p=>projectPlanPoint(p,view)).filter(Boolean));if(!polygon.length)return null;
 const center=part.a.map((v,i)=>(v+part.b[i])/2),depth=(view==='front'?-1:1)*center[VIEWS[view]?.hidden??1];
 return {part,polygon,center:projectPlanPoint(center,view),depth,min:[0,1].map(i=>Math.min(...polygon.map(p=>p[i]))),max:[0,1].map(i=>Math.max(...polygon.map(p=>p[i])))};
}
function pointInside(point,polygon){let inside=false;if(polygon.length<3)return false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(((a[1]>point[1])!==(b[1]>point[1]))&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
function distanceToSegment(point,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)):0;return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy)}
function areaOf(points){return Math.abs(points.reduce((sum,p,i)=>sum+p[0]*points[(i+1)%points.length][1]-p[1]*points[(i+1)%points.length][0],0))/2}
function translated(parts,delta){return parts.map(part=>({...copy(part),a:part.a.map((n,i)=>n+delta[i]),b:part.b.map((n,i)=>n+delta[i]),...(part.corners?{corners:part.corners.map(p=>p.map((n,i)=>n+delta[i]))}:{})}))}
function checkParts(parts){if(parts.some(part=>[part.a,part.b,...(part.corners||[])].some(p=>!finite3(p)||p.some(n=>Math.abs(n)>100000))))throw new Error('La proposition dépasse les limites du projet (±100 000 mm).');}
const pathOf=polygon=>polygon.map(p=>p.join(',')).join(' ');
function partMarkup(item,{selected=false,preview=false,faded=false,label=false,unit=1}={}){
 const p=item.part,color=preview?'#108c83':selected?'#087aa8':'#596b62',fill=preview?'#a9ded4':p.kind==='wall'?'#c8cfca':p.material==='mesh'?'#e4eee5':p.material==='roof'?'#dbe4e8':p.material==='wood'?'#d6cec0':'#c9cecc';
 return `<g class="plan-part${selected?' plan-part-selected':''}${preview?' plan-preview-part':''}" data-plan-part="${esc(p.id)}" opacity="${faded?.3:1}"><title>${esc(p.id)} · ${esc(p.label||p.kind)}</title><${item.polygon.length<3?'polyline':'polygon'} points="${pathOf(item.polygon)}" fill="${item.polygon.length<3?'none':fill}" fill-opacity="${p.material==='mesh'?.42:preview?.52:.8}" stroke="${color}" stroke-width="${selected||preview?2:1}" vector-effect="non-scaling-stroke"${preview?' stroke-dasharray="6 3"':''}/>${label?`<text class="plan-part-label" x="${item.center[0]}" y="${item.center[1]-8*unit}" font-size="${12*unit}" text-anchor="middle" fill="${color}" stroke="#fafbf7" stroke-width="${3*unit}" paint-order="stroke" pointer-events="none">${esc(p.id)}</text>`:''}</g>`;
}
// Évite que les cotes de deux rangées distinctes deviennent illisibles en projection.
// Seul le décalage graphique varie ; sourcePoints et valeurs ne sont jamais changés.
function planBounds(items){const points=items.flatMap(item=>item.polygon);return points.length?{min:[0,1].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1].map(i=>Math.max(...points.map(p=>p[i])))}:null;}
function layoutDimensions(dimensions,view,unit,bounds=null){
 const occupied=[],result=[];
 for(const dimension of [...dimensions.filter(d=>d.type!=='overall'),...dimensions.filter(d=>d.type==='overall')]){
  if(!finite3(dimension.a)||!finite3(dimension.b))continue;
  const a=projectPlanPoint(dimension.a,view),b=projectPlanPoint(dimension.b,view),source=(dimension.sourcePoints||[]).filter(finite3).map(p=>projectPlanPoint(p,view)),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],horizontal=Math.abs(b[1]-a[1])<EPS,vertical=Math.abs(b[0]-a[0])<EPS;
  if(Math.hypot(...minus(a,b))<EPS)continue;
  const label=dimension.label||`${fmt(dimension.value)} ${dimension.unit||'mm'}`,halfWidth=(Math.max(54,label.length*6.8)/2+6)*unit,halfHeight=13*unit;
  let direction=horizontal?[0,-1]:[1,0],shift=[0,0];
  if(bounds&&(horizontal||vertical)){
   const axis=horizontal?1:0,sourceMid=source.length?(source[0][axis]+source.at(-1)[axis])/2:mid[axis],center=(bounds.min[axis]+bounds.max[axis])/2;
   const sign=dimension.type==='overall'?(horizontal?-1:1):sourceMid<=center?-1:1;direction=horizontal?[0,sign]:[sign,0];
   let edge=sign<0?bounds.min[axis]:bounds.max[axis];
   if(dimension.type==='overall')for(const previous of result){const otherHorizontal=Math.abs(previous.b[view==='top'?2:1]-previous.a[view==='top'?2:1])<EPS;if(otherHorizontal!==horizontal)continue;const p=projectPlanPoint(previous.a,view)[axis]+previous._planShift[axis];edge=sign<0?Math.min(edge,p):Math.max(edge,p);}
   const gap=(dimension.type==='overall'?70:42)*unit+(vertical?halfWidth:0);shift[axis]=(sign<0?edge-gap:edge+gap)-mid[axis];
  }
  let box;
  for(let lane=0;lane<100;lane++){
   const x=mid[0]+shift[0],y=mid[1]+shift[1]-15*unit;box={left:x-halfWidth,right:x+halfWidth,top:y-halfHeight,bottom:y+halfHeight};
   if(!occupied.some(p=>box.left<p.right&&box.right>p.left&&box.top<p.bottom&&box.bottom>p.top))break;
   const step=vertical?halfWidth*2+16*unit:34*unit;shift=shift.map((n,i)=>n+direction[i]*step);
  }
  occupied.push(box);result.push({...dimension,_planShift:shift,_planTextBox:box});
 }
 return result;
}
function dimensionMarkup(dimension,view,unit,{interactive=true}={}){
 if(!finite3(dimension.a)||!finite3(dimension.b))return '';
 const a=projectPlanPoint(dimension.a,view),b=projectPlanPoint(dimension.b,view),source=(dimension.sourcePoints||[]).filter(finite3).map(p=>projectPlanPoint(p,view)),label=dimension.label||`${fmt(dimension.value)} ${dimension.unit||'mm'}`,mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
 let shift=[0,0];
 if(source.length>=2){const sourceMid=[(source[0][0]+source[1][0])/2,(source[0][1]+source[1][1])/2],dx=mid[0]-sourceMid[0],dy=mid[1]-sourceMid[1],offset=Math.hypot(dx,dy),minimum=(26+Math.max(0,Number(dimension.lane)||0)*25)*unit;if(offset>EPS&&offset<minimum)shift=[dx/offset*(minimum-offset),dy/offset*(minimum-offset)];}
 if(dimension._planShift)shift=dimension._planShift;
 const aa=a.map((v,i)=>v+shift[i]),bb=b.map((v,i)=>v+shift[i]),center=[(aa[0]+bb[0])/2,(aa[1]+bb[1])/2],dx=bb[0]-aa[0],dy=bb[1]-aa[1],length=Math.hypot(dx,dy),normal=length?[-dy/length,dx/length]:[0,1],tick=4*unit,stroke=dimension.automatic?'#687f72':'#176c68';
 const lines=(dimension.lines?.length?dimension.lines:[{a:dimension.a,b:dimension.b,role:'dimension'}]).filter(line=>finite3(line.a)&&finite3(line.b)).map(line=>{let p=projectPlanPoint(line.a,view),q=projectPlanPoint(line.b,view);if(line.role==='dimension'||line.role==='angle'){p=p.map((v,i)=>v+shift[i]);q=q.map((v,i)=>v+shift[i]);}else{if(Math.hypot(q[0]-a[0],q[1]-a[1])<1e-4||Math.hypot(q[0]-b[0],q[1]-b[1])<1e-4)q=q.map((v,i)=>v+shift[i]);if(Math.hypot(p[0]-a[0],p[1]-a[1])<1e-4||Math.hypot(p[0]-b[0],p[1]-b[1])<1e-4)p=p.map((v,i)=>v+shift[i]);}return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${stroke}" stroke-width="1" vector-effect="non-scaling-stroke"/>`}).join('');
 const labelWidth=Math.max(54,label.length*6.8)*unit,hitWidth=Math.max(labelWidth,64*unit),labelY=center[1]-9*unit;
 return `<g class="plan-dimension" data-plan-dimension="${esc(dimension.id)}"${interactive?' role="button" tabindex="0"':''} aria-label="${esc(label)}${dimension.automatic?' · cote automatique':''}"><title>${esc(label)} · ${dimension.automatic?'Cote automatique':'Cote enregistrée'}</title>${lines}${[aa,bb].map(p=>`<line x1="${p[0]-normal[0]*tick}" y1="${p[1]-normal[1]*tick}" x2="${p[0]+normal[0]*tick}" y2="${p[1]+normal[1]*tick}" stroke="${stroke}" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('')}<rect x="${center[0]-labelWidth/2-3*unit}" y="${labelY-12*unit}" width="${labelWidth+6*unit}" height="${17*unit}" rx="${3*unit}" fill="#ffffff" stroke="none"/><text x="${center[0]}" y="${labelY}" font-size="${12*unit}" fill="${stroke}" stroke="none" text-anchor="middle">${esc(label)}</text>${interactive?`<rect class="plan-dimension-hit" x="${center[0]-hitWidth/2}" y="${labelY-25*unit}" width="${hitWidth}" height="${44*unit}" fill="transparent" stroke="none" pointer-events="all"/>`:''}</g>`;
}

export class PlanEditor{
 constructor(container,callbacks={}){
  if(!container?.ownerDocument)throw new Error('Un conteneur DOM est nécessaire pour ouvrir le plan.');
  this.container=container;this.callbacks=callbacks;this.document=container.ownerDocument;this.window=this.document.defaultView;this.view='top';this.tool='select';this.multi=false;this.selectedIds=[];this.project={};this.model={parts:[]};this.items=[];this.dimensions=[];this.cameraByView=new Map();this.viewBox={x:-2000,y:-1500,width:4000,height:3000};this.pointers=new Map();this.preview=[];this.pending=null;this.guides=[];this.id=++editorSequence;
  this.svg=this.document.createElementNS(NS,'svg');this.svg.classList.add('plan-editor-svg');this.svg.setAttribute('xmlns',NS);this.svg.setAttribute('role','application');this.svg.setAttribute('aria-label','Plan interactif : glisser pour naviguer, toucher une pièce pour sélectionner');this.svg.setAttribute('tabindex','0');this.svg.setAttribute('preserveAspectRatio','none');this.svg.style.cssText='width:100%;height:100%;display:block;touch-action:none;user-select:none;background:#ffffff;stroke:none;fill:none;outline-offset:-3px';
  this.svg.setAttribute('font-family','Arial,sans-serif');this.svg.innerHTML='<g data-plan-layer="grid"></g><g data-plan-layer="parts"></g><g data-plan-layer="preview"></g><g data-plan-layer="guides"></g><g data-plan-layer="dimensions"></g>';
  this.layers=Object.fromEntries([...this.svg.querySelectorAll('[data-plan-layer]')].map(node=>[node.dataset.planLayer,node]));
  this.caption=this.document.createElement('div');this.caption.className='plan-editor-caption';this.caption.style.cssText='position:absolute;left:9px;bottom:8px;max-width:calc(100% - 18px);padding:5px 8px;background:#fafbf7e8;color:#53695e;font:11px system-ui;pointer-events:none;border-radius:5px';container.append(this.svg,this.caption);
  this.handlers={pointerdown:event=>this.pointerDown(event),pointermove:event=>this.pointerMove(event),pointerup:event=>this.pointerUp(event),pointercancel:event=>this.pointerCancel(event),lostpointercapture:event=>{if(this.pointers.has(event.pointerId))this.pointerCancel(event)},wheel:event=>{event.preventDefault();this.zoom(Math.exp(-event.deltaY*.0015),[event.clientX,event.clientY])},keydown:event=>this.keyDown(event),contextmenu:event=>event.preventDefault()};
  for(const [name,handler]of Object.entries(this.handlers))this.svg.addEventListener(name,handler,{passive:false});
  this.blurHandler=()=>this.pointerCancel();this.window?.addEventListener('blur',this.blurHandler);
  this.resizeObserver=this.window?.ResizeObserver?new this.window.ResizeObserver(()=>this.resize()):null;this.resizeObserver?.observe(container);this.resize();this.updateCaption();
 }
 size(){const r=this.svg.getBoundingClientRect(),c=this.container.getBoundingClientRect();return {left:r.left||c.left||0,top:r.top||c.top||0,width:r.width||c.width||this.container.clientWidth||800,height:r.height||c.height||this.container.clientHeight||600}}
 unit(){return this.viewBox.width/this.size().width}
 status(message){this.lastStatus=message;this.callbacks.onStatus?.(message)}
 set(project,model,selectedIds=[]){
  if(this.project!==project&&(this.pending||this.placement||this.gesture?.mode==='move'))this.clearPreview();
  this.project=project||{};this.model=model||{parts:[]};this.selectedIds=[...new Set(selectedIds||[])];
  const savedView=this.project.drawing?.view;if(VIEWS[savedView]&&savedView!==this.view){this.setView(savedView);this.hasFit=true;return this}this.cacheScene();
  if(!this.hasFit){this.fit();this.hasFit=true}else this.render();return this;
 }
 cacheScene(){
  this.items=(this.model.parts||[]).filter(p=>p.group!=='foundation'&&p.kind!=='footing'&&p.material!=='metal'&&(!this.project.drawing?.structureOnly||!['mesh','roof'].includes(p.material))).slice(0,1000).map(p=>projectPlanPart(p,this.view)).filter(Boolean).sort((a,b)=>a.depth-b.depth||String(a.part.id).localeCompare(String(b.part.id)));
  this.dimensions=this.project.drawing?.showDimensions===false?[]:getPlanDimensions(this.project,this.model,{view:this.view,automatic:true,limit:48});
 }
 setView(view){if(!VIEWS[view]||view===this.view)return;this.clearPreview();this.cameraByView.set(this.view,{...this.viewBox});this.view=view;this.cacheScene();const saved=this.cameraByView.get(view);if(saved){this.viewBox={...saved};this.resize()}else this.fit();this.updateCaption();return this}
 setTool(tool){if(tool==='editMove')tool='move';if(!['select','pan','move'].includes(tool))throw new Error('Outil de plan inconnu.');this.clearPreview();this.tool=tool;this.svg.style.cursor=tool==='move'?'move':tool==='pan'?'grab':'default';this.updateCaption();this.status(tool==='move'?'Déplacer : faites glisser les pièces sélectionnées, puis validez l’aperçu.':'Un doigt ou le bouton gauche déplace le plan. Touchez une pièce pour la sélectionner.');return this}
 setMulti(value){this.multi=!!value;return this}
 selectMulti(value){return this.setMulti(value)}
 select(ids){this.selectedIds=[...new Set(ids||[])];this.renderParts();return this}
 plane(depth=0){return {type:VIEWS[this.view].plane,offset:depth,lock:true,visible:true}}
 gridProject(depth=0){return {...this.project,workplane:this.plane(depth),freeParts:this.project.mode==='free'?this.project.freeParts||[]:this.model.parts||[]}}
 gestureSettings(depth=0){const project=this.gridProject(depth);return {project,grid:resolveAdaptiveGrid(project,project.freeParts),assistance:normalizeAssistance(this.project.assistance),step:Number.isFinite(this.project.grid)&&this.project.grid>0?this.project.grid:1}}
 fittedViewBox(){
  const points=[...this.items.flatMap(item=>item.polygon),...this.dimensions.flatMap(d=>(d.lines||[]).flatMap(line=>[line.a,line.b]).filter(finite3).map(p=>projectPlanPoint(p,this.view)))];
  let min=[-1500,-1000],max=[1500,1000];if(points.length){min=[0,1].map(i=>Math.min(...points.map(p=>p[i])));max=[0,1].map(i=>Math.max(...points.map(p=>p[i])))}
  const {width,height}=this.size(),w=Math.max(400,max[0]-min[0]),h=Math.max(400,max[1]-min[1]),worldPerPixel=Math.max(w/(Math.max(1,width-160)),h/(Math.max(1,height-160))),vw=worldPerPixel*width,vh=worldPerPixel*height;
  return {x:(min[0]+max[0]-vw)/2,y:(min[1]+max[1]-vh)/2,width:vw,height:vh};
 }
 fit(){this.viewBox=this.fittedViewBox();this.fitAnnotations();this.cameraByView.set(this.view,{...this.viewBox});this.render();return this}
 fitAnnotations(){
  const {width,height}=this.size();for(let i=0;i<(this.dimensions.length<=20?16:4);i++){const unit=this.viewBox.width/width,dims=layoutDimensions(this.dimensions,this.view,unit,planBounds(this.items)),boxes=dims.map(d=>d._planTextBox).filter(Boolean),v=this.viewBox;if(!boxes.length)return;
   const min=[Math.min(v.x,...boxes.map(b=>b.left-20*unit)),Math.min(v.y,...boxes.map(b=>b.top-20*unit))],max=[Math.max(v.x+v.width,...boxes.map(b=>b.right+20*unit)),Math.max(v.y+v.height,...boxes.map(b=>b.bottom+20*unit))];
   if(min[0]>=v.x-1e-5&&min[1]>=v.y-1e-5&&max[0]<=v.x+v.width+1e-5&&max[1]<=v.y+v.height+1e-5)break;
   const scale=Math.max((max[0]-min[0])/width,(max[1]-min[1])/height);this.viewBox={x:(min[0]+max[0]-scale*width)/2,y:(min[1]+max[1]-scale*height)/2,width:scale*width,height:scale*height};
  }
 }
 resize(){const {width,height}=this.size(),center=[this.viewBox.x+this.viewBox.width/2,this.viewBox.y+this.viewBox.height/2],span=this.viewBox.height;this.viewBox={x:center[0]-span*width/height/2,y:center[1]-span/2,width:span*width/height,height:span};this.render()}
 applyViewBox(){this.svg.setAttribute('viewBox',`${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);this.cameraByView.set(this.view,{...this.viewBox})}
 clientToPlan(x,y){if(typeof x==='object'){y=x.clientY;x=x.clientX}const r=this.size();return [this.viewBox.x+(x-r.left)/r.width*this.viewBox.width,this.viewBox.y+(y-r.top)/r.height*this.viewBox.height]}
 planToClient(point){const r=this.size();return [r.left+(point[0]-this.viewBox.x)/this.viewBox.width*r.width,r.top+(point[1]-this.viewBox.y)/this.viewBox.height*r.height]}
 zoom(factor,client){if(!Number.isFinite(factor)||factor<=0)return;const r=this.size(),screen=client||[r.left+r.width/2,r.top+r.height/2],at=this.clientToPlan(...screen),newWidth=Math.min(400000,Math.max(2,this.viewBox.width/factor)),ratio=newWidth/this.viewBox.width;this.viewBox={x:at[0]+(this.viewBox.x-at[0])*ratio,y:at[1]+(this.viewBox.y-at[1])*ratio,width:newWidth,height:this.viewBox.height*ratio};this.render();return this}
 updateCaption(){this.caption.textContent=`Vue de ${VIEWS[this.view].name.toLowerCase()} · ${VIEWS[this.view].axes} · mm${this.gridInfo?.limited?' · grille partielle : zoomez pour la voir':''}${this.project.drawing?.structureOnly?' · structure seule':''}`;}
 render(){this.applyViewBox();this.renderGrid();this.renderParts();this.renderPreview();this.renderDimensions();this.updateCaption()}
 renderGrid(){
  const state=this.gesture?.settings||this.placement?.settings||this.gestureSettings(),grid=state.grid,unit=this.unit();let step=grid.step;
  if(!(step>0)||this.project.drawing?.showGrid!==true){this.gridInfo={step,limited:false};this.layers.grid.innerHTML='';return}
  const visible=Math.hypot(this.viewBox.width,this.viewBox.height),center=unprojectPlanPoint([this.viewBox.x+this.viewBox.width/2,this.viewBox.y+this.viewBox.height/2],0,this.view),origin=grid.origin.clone(),relative=new THREE.Vector3(...center).sub(origin),u=relative.dot(grid.u),v=relative.dot(grid.v),half=Math.min(60,Math.ceil(visible/step/2)),limited=visible/step>120;
  const centerU=Math.round(u/step),centerV=Math.round(v/step),extent=half*step,lines=[];
  for(let i=-half;i<=half;i++)for(const axis of [0,1]){const along=axis?grid.v:grid.u,across=axis?grid.u:grid.v,c=axis?centerV:centerU,other=axis?centerU:centerV,a=origin.clone().addScaledVector(along,(c+i)*step).addScaledVector(across,other*step-extent),b=a.clone().addScaledVector(across,2*extent),p=projectPlanPoint(a.toArray(),this.view),q=projectPlanPoint(b.toArray(),this.view);lines.push(`<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#e3e9e0" stroke-width=".6" vector-effect="non-scaling-stroke"/>`)}
  this.gridInfo={step,limited};this.layers.grid.innerHTML=`<g pointer-events="none">${lines.join('')}</g>`;
 }
 renderParts(){const selected=new Set(this.selectedIds),replaced=new Set(this.pending?.kind==='move'?this.pending.ids:[]),unit=this.unit();this.layers.parts.innerHTML=this.items.map(item=>partMarkup(item,{selected:selected.has(item.part.id),faded:replaced.has(item.part.id),label:selected.has(item.part.id)&&selected.size<=20,unit})).join('')}
 renderPreview(){const unit=this.unit();this.layers.preview.innerHTML=this.preview.map(p=>projectPlanPart(p,this.view)).filter(Boolean).map(item=>partMarkup(item,{preview:true,label:this.preview.length<=10,unit})).join('')+(this.placement?.first?`<circle cx="${projectPlanPoint(this.placement.first,this.view)[0]}" cy="${projectPlanPoint(this.placement.first,this.view)[1]}" r="${4*unit}" fill="#108c83"/>`:'');this.layers.preview.setAttribute('pointer-events','none');this.layers.guides.innerHTML=this.guides.filter(l=>finite3(l.a)&&finite3(l.b)).slice(0,12).map(l=>{const a=projectPlanPoint(l.a,this.view),b=projectPlanPoint(l.b,this.view);return `<g pointer-events="none"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#15957e" stroke-width="1" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/><text x="${(a[0]+b[0])/2}" y="${(a[1]+b[1])/2-5*unit}" font-size="${11*unit}" text-anchor="middle" fill="#13745f">${esc(l.label||'')}</text></g>`}).join('')}
 renderDimensions(){const unit=this.unit();this.layers.dimensions.innerHTML=layoutDimensions(this.dimensions,this.view,unit,planBounds(this.items)).map(d=>dimensionMarkup(d,this.view,unit)).join('')}
 hitTest(point,pointerType='mouse'){
  const inside=[...this.items].reverse().filter(item=>pointInside(point,item.polygon));if(inside.length)return inside[0].part;
  const tolerance=(pointerType==='touch'?8:5)*this.unit(),near=this.items.filter(item=>item.polygon.length<3||areaOf(item.polygon)<this.unit()*this.unit()).map(item=>({item,distance:Math.min(...item.polygon.map((p,i)=>distanceToSegment(point,p,item.polygon[(i+1)%item.polygon.length])))})).filter(item=>item.distance<=tolerance).sort((a,b)=>a.distance-b.distance||b.item.depth-a.item.depth);return near[0]?.item.part||null;
 }
 selectionEvent(event){return {shiftKey:!!event.shiftKey,ctrlKey:!!event.ctrlKey,metaKey:!!event.metaKey,additive:this.multi||!!event.shiftKey||!!event.ctrlKey||!!event.metaKey,pointerType:event.pointerType||'mouse',originalEvent:event}}
 emitSelect(part,event){const details=this.selectionEvent(event);this.selectedIds=part?(details.additive?(this.selectedIds.includes(part.id)?this.selectedIds.filter(id=>id!==part.id):[...this.selectedIds,part.id]):[part.id]):details.additive?this.selectedIds:[];this.callbacks.onSelect?.(part,details);this.renderParts()}
 pointerDown(event){
  if(event.button!==0&&event.button!==1&&event.button!==2)return;event.preventDefault();this.svg.focus({preventScroll:true});const point=this.clientToPlan(event),dimension=event.target?.closest?.('[data-plan-dimension]')?.getAttribute('data-plan-dimension');this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});try{this.svg.setPointerCapture(event.pointerId)}catch{}
  if(this.pointers.size>=2){if(this.gesture?.mode==='move'&&this.pending?.kind==='move')this.clearPreview();const points=[...this.pointers.values()].slice(0,2);this.gesture={mode:'pinch',distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),center:[(points[0].x+points[1].x)/2,(points[0].y+points[1].y)/2],box:{...this.viewBox},moved:true};this.suppressTap=true;return}
  const hit=this.hitTest(point,event.pointerType),selected=this.selectedIds.includes(hit?.id);let mode='pan';
  if(this.tool==='move'&&event.button===0&&hit&&!dimension&&!this.pending){if(!selected)this.emitSelect(hit,event);mode='move'}
  const moving=(this.project.freeParts||[]).filter(p=>this.selectedIds.includes(p.id));if(mode==='move'&&!moving.length){mode='pan';this.status('Passez le projet en construction libre pour déplacer ses pièces.');}
  this.gesture={pointerId:event.pointerId,mode,startClient:[event.clientX,event.clientY],startPoint:point,startBox:{...this.viewBox},dimension,hit,moved:false,moving:copy(moving),ids:moving.map(p=>p.id),settings:this.gestureSettings()};
 }
 pointerMove(event){
  if(this.pointers.has(event.pointerId))this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const gesture=this.gesture;
  if(gesture?.mode==='pinch'&&this.pointers.size>=2){const points=[...this.pointers.values()].slice(0,2),center=[(points[0].x+points[1].x)/2,(points[0].y+points[1].y)/2],distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),r=this.size(),ratio=Math.max(.02,Math.min(50,gesture.distance/Math.max(1,distance))),world=[gesture.box.x+(gesture.center[0]-r.left)/r.width*gesture.box.width,gesture.box.y+(gesture.center[1]-r.top)/r.height*gesture.box.height],w=Math.min(400000,Math.max(2,gesture.box.width*ratio)),h=w*r.height/r.width;this.viewBox={x:world[0]-(center[0]-r.left)/r.width*w,y:world[1]-(center[1]-r.top)/r.height*h,width:w,height:h};this.render();return}
  if(gesture&&this.pointers.has(event.pointerId)){const dx=event.clientX-gesture.startClient[0],dy=event.clientY-gesture.startClient[1];if(Math.hypot(dx,dy)>4)gesture.moved=true;if(!gesture.moved)return;
   if(gesture.mode==='pan'){const r=this.size();this.viewBox={...gesture.startBox,x:gesture.startBox.x-dx/r.width*gesture.startBox.width,y:gesture.startBox.y-dy/r.height*gesture.startBox.height};this.applyViewBox();this.renderGrid();return}
   if(gesture.mode==='move'){const point=this.clientToPlan(event),raw=minus(unprojectPlanPoint(point,0,this.view),unprojectPlanPoint(gesture.startPoint,0,this.view));this.updateMove(gesture.ids,gesture.moving,raw,gesture.settings,event.altKey);return}
  }
  if(this.placement&&!this.pending)this.updatePlacement(this.clientToPlan(event),event.altKey);
 }
 pointerUp(event){
  const gesture=this.gesture;this.pointers.delete(event.pointerId);try{this.svg.releasePointerCapture(event.pointerId)}catch{}
  if(this.suppressTap||gesture?.mode==='pinch'){if(!this.pointers.size){this.suppressTap=false;this.gesture=null}return}
  if(!gesture||gesture.pointerId!==event.pointerId)return;this.gesture=null;
  if(gesture.moved){if(gesture.mode==='move'&&this.pending)this.status('Déplacement en aperçu : validez pour appliquer, ou annulez.');return}
  if(event.button!==0)return;
  if(this.placement&&!this.pending){this.placementClick(this.clientToPlan(event),event.altKey);return}
  if(gesture.dimension){this.callbacks.onDimension?.(gesture.dimension);return}
  if(this.tool!=='pan'&&this.tool!=='move')this.emitSelect(gesture.hit,event);else if(this.tool==='move'&&gesture.hit&&!this.selectedIds.includes(gesture.hit.id))this.emitSelect(gesture.hit,event);
 }
 pointerCancel(){const ids=[...this.pointers.keys()];this.pointers.clear();this.gesture=null;this.suppressTap=false;for(const id of ids)try{this.svg.releasePointerCapture(id)}catch{}if(this.pending?.kind==='move')this.clearPreview();}
 keyDown(event){const dimension=event.target?.closest?.('[data-plan-dimension]');if(dimension&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopPropagation();this.callbacks.onDimension?.(dimension.getAttribute('data-plan-dimension'));return}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.clearPreview();this.status('Aperçu annulé.');return}if(event.key==='Enter'&&this.pending){event.preventDefault();event.stopPropagation();this.confirmPreview();return}if(['+','=','-','Home'].includes(event.key)){event.preventDefault();event.stopPropagation();event.key==='Home'?this.fit():this.zoom(event.key==='-'?1/1.2:1.2);return}if(this.tool==='move'&&this.selectedIds.length&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();const step=(Number(this.project.grid)||1)*(event.shiftKey?10:1),v=[event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0,event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0],delta=unprojectPlanPoint(v,0,this.view).map((n,i)=>n+(this.pending?.kind==='move'?this.pending.delta[i]:0));this.previewMove(this.selectedIds,delta,{alt:event.altKey});}}
 updateMove(ids,parts,raw,settings,alt=false){
  let delta=[...raw];this.guides=[];
  if(!alt&&settings.assistance.gridSnap){delta=snapDeltaToGrid(parts,delta,settings.grid,{lock:true});if(!delta){this.status('Aucun nœud de grille compatible avec ce plan. Alt suspend les aides.');return}}
  else if(!alt&&this.project.snap!==false)delta=delta.map(n=>Math.round(n/settings.step)*settings.step);
  let moved=translated(parts,delta);const guided=this.guideProposal(moved,settings,ids,alt);if(guided?.apply){delta=delta.map((n,i)=>n+guided.delta[i]);moved=translated(parts,delta)}
  try{checkParts(moved)}catch(error){this.status(error.message);return}
  this.pending={kind:'move',ids:[...ids],delta,parts:moved};this.preview=moved;this.callbacks.onPreviewChange?.(this.getPending());this.renderParts();this.renderPreview();this.status(`Aperçu · ΔX ${fmt(delta[0])} · ΔY ${fmt(delta[1])} · ΔZ ${fmt(delta[2])} mm${alt?' · aides suspendues':''}`);
 }
 previewMove(ids,delta,{alt=false}={}){if(!finite3(delta)||Math.abs(delta[VIEWS[this.view].hidden])>EPS)throw new Error('Le déplacement du plan doit conserver sa profondeur.');const selected=(this.project.freeParts||[]).filter(p=>ids.includes(p.id));if(!selected.length)throw new Error('Sélectionnez une pièce libre à déplacer.');this.updateMove(selected.map(p=>p.id),selected,delta,this.gestureSettings(),alt);return this.getPending()}
 guideProposal(parts,settings,excludeIds,alt){
  if(alt||!settings.assistance.guides||parts.length>20)return null;const result=smartPlacementGuides(settings.project,parts,{excludeIds,tolerance:Math.min(150,8*this.unit()),grid:settings.grid});if(!result)return null;this.guides=result.lines||[];let apply=settings.assistance.guideSnap&&Math.abs(result.delta[VIEWS[this.view].hidden])<EPS;
  if(apply&&settings.assistance.gridSnap){const allowed=snapDeltaToGrid(parts,result.delta,settings.grid,{lock:true});apply=!!allowed&&allowed.every((n,i)=>Math.abs(n-result.delta[i])<1e-6)}return {...result,apply};
 }
 beginPlacement(template,{mode,depth}={}){
  if(!template||!finite3(template.a)||!finite3(template.b))throw new Error('Pièce à placer invalide.');this.clearPreview();const chosen=mode||(['beam','brace'].includes(template.kind)?'two-points':'point');if(!['point','two-points'].includes(chosen))throw new Error('Mode de placement inconnu.');if(chosen==='two-points'&&!['beam','brace'].includes(template.kind))throw new Error('Le tracé par deux points concerne les chevrons et diagonales.');
  const baseDepth=Number.isFinite(Number(depth))&&depth!==''&&depth!==null?Number(depth):null,settings=this.gestureSettings(baseDepth??0),anchor=placementAnchor(template,settings.grid)||template.a;
  this.placement={template:copy(template),mode:chosen,depth:baseDepth??anchor[VIEWS[this.view].hidden],explicitDepth:baseDepth!==null,settings,first:null};this.tool='place';this.svg.style.cursor='crosshair';this.status(chosen==='two-points'?'Tracé : touchez le premier point, puis le second. La profondeur est conservée.':'Pose : touchez le plan, puis validez l’aperçu. La profondeur est conservée.');return this;
 }
 placementPoint(point,alt=false){const state=this.placement,world=unprojectPlanPoint(point,state.depth,this.view);if(alt)return world;if(state.settings.assistance.gridSnap)return snapPointToGrid(world,state.settings.grid);if(this.project.snap!==false){const p=[...point];return unprojectPlanPoint(p.map(n=>Math.round(n/state.settings.step)*state.settings.step),state.depth,this.view)}return world}
 updatePlacement(point,alt=false){
  const state=this.placement;if(!state)return;state.candidate=null;const target=this.placementPoint(point,alt);if(!target){this.preview=[];this.renderPreview();return}this.guides=[];let part;
  if(state.mode==='two-points'){if(!state.first){this.preview=[];return}part={...copy(state.template),a:[...state.first],b:[...target]};if(!state.explicitDepth)part.b[VIEWS[this.view].hidden]=state.template.b[VIEWS[this.view].hidden];if(Math.hypot(...minus(projectPlanPoint(part.a,this.view),projectPlanPoint(part.b,this.view)))<EPS){this.preview=[];this.renderPreview();return}}
  else{const anchor=placementAnchor(state.template,state.settings.grid)||state.template.a;part=translated([state.template],minus(target,anchor))[0];const guided=this.guideProposal([part],state.settings,[state.template.id],alt);if(guided?.apply)part=translated([part],guided.delta)[0]}
  try{checkParts([part])}catch(error){this.preview=[];this.renderPreview();this.status(error.message);return}state.candidate=part;this.preview=[part];this.renderPreview();
 }
 placementClick(point,alt=false){const state=this.placement;if(!state)return;if(state.mode==='two-points'&&!state.first){state.first=this.placementPoint(point,alt);if(!state.first){this.status('Aucun nœud de grille compatible avec ce plan.');return}if(!state.explicitDepth)state.first[VIEWS[this.view].hidden]=state.template.a[VIEWS[this.view].hidden];this.status('Premier point posé. Touchez le second point, puis validez la pièce.');this.renderPreview();return}this.updatePlacement(point,alt);if(!state.candidate){this.status('Choisissez deux points distincts et dans les limites du projet.');return}this.pending={kind:'placement',part:copy(state.candidate),parts:[copy(state.candidate)]};this.preview=this.pending.parts;this.callbacks.onPreviewChange?.(this.getPending());this.renderPreview();this.status('Pièce en aperçu : validez pour l’ajouter, ou annulez.');}
 previewParts(parts=[]){this.preview=copy(parts);checkParts(this.preview);this.renderPreview();return this}
 getPending(){return this.pending?copy(this.pending):null}
 confirmPreview(){const pending=this.getPending();if(!pending)return false;const result=pending.kind==='move'?this.callbacks.onMove?.(pending.ids,pending.delta):this.callbacks.onPlace?.(pending.part);if(result===false)return false;this.clearPreview();return true}
 clearPreview(){const had=!!this.pending||!!this.placement;this.pending=null;this.preview=[];this.guides=[];this.placement=null;if(this.tool==='place')this.tool='select';if(this.gesture?.mode==='move')this.gesture=null;this.layers?.preview?.replaceChildren();this.layers?.guides?.replaceChildren();if(this.layers)this.renderParts();this.svg.style.cursor=this.tool==='move'?'move':this.tool==='pan'?'grab':'default';if(had)this.callbacks.onPreviewChange?.(null);return this}
 exportSVG(){
  const {width,height}=this.size(),base=this.fittedViewBox(),unit=base.width/width,dimensions=layoutDimensions(this.dimensions,this.view,unit,planBounds(this.items)),points=[[base.x,base.y],[base.x+base.width,base.y+base.height]];
  // Le cadrage inclut les décalages graphiques ET les textes ; aucun libellé n'est tronqué.
  for(const d of dimensions){if(!d._planTextBox)continue;const box=d._planTextBox;points.push([box.left-12*unit,box.top-12*unit],[box.right+12*unit,box.bottom+12*unit]);for(const p of [d.a,d.b])points.push(projectPlanPoint(p,this.view).map((n,i)=>n+d._planShift[i]));}
  const min=[0,1].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1].map(i=>Math.max(...points.map(p=>p[i]))),scale=Math.max((max[0]-min[0])/width,(max[1]-min[1])/height),v={x:(min[0]+max[0]-scale*width)/2,y:(min[1]+max[1]-scale*height)/2,width:scale*width,height:scale*height};
  return `<svg xmlns="${NS}" role="img" aria-label="Plan ${VIEWS[this.view].name}" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="${v.x} ${v.y} ${v.width} ${v.height}"><title>${esc(this.project.name||'Atelier')} · ${VIEWS[this.view].name} · cotes en millimètres</title><desc>Projection orthographique sans suppression des éléments masqués. Les coordonnées et valeurs sont liées au projet, sans les aperçus non validés.</desc><rect x="${v.x}" y="${v.y}" width="${v.width}" height="${v.height}" fill="#fafbf7"/><g font-family="Arial,sans-serif">${this.items.map(item=>partMarkup(item)).join('')}${dimensions.map(d=>dimensionMarkup(d,this.view,unit,{interactive:false})).join('')}</g></svg>`
 }
 dispose(){for(const [name,handler]of Object.entries(this.handlers))this.svg.removeEventListener(name,handler);this.window?.removeEventListener('blur',this.blurHandler);this.resizeObserver?.disconnect();this.pointers.clear();this.svg.remove();this.caption.remove()}
}
