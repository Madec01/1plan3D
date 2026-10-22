/** Accroche géométrique commune : bois, murs et panneaux rectangulaires. Toutes les coordonnées et tolérances sont en mm. */
import * as THREE from 'three';
import {timberQuaternion} from './geometry.js';
import {workplaneFrame} from './workplane.js';
import {snapDeltaToGrid} from './adaptive-placement.js';

const EPS=1e-7,CONTACT_EPS=1e-5,PENETRATION_EPS=1e-5;
const finite3=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n));
const add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]),mul=(a,s)=>a.map(n=>n*s),dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),norm=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/norm(a));
const clean=a=>a.map(n=>Math.abs(n)<1e-10?0:n),mean=points=>mul(points.reduce(add,[0,0,0]),1/points.length),name=p=>p.label||p.id||'Pièce';
const number=(n,f,min=0,max=100)=>typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,n)):f;
const unique=points=>points.filter((p,i)=>!points.slice(0,i).some(q=>norm(sub(p,q))<EPS));
const isTimber=part=>part?.material==='wood'&&part.kind!=='panel';

/** Repère exact partagé par le placement direct, les propositions et les mesures.
 * Les panneaux sont des surfaces sans épaisseur, comme leur rendu ; un panneau
 * non rectangulaire ne reçoit jamais une boîte fictive pour l'accrochage.
 */
export function contactBox(part){
 if(!part||!finite3(part.a)||!finite3(part.b))return null;
 let axes,center,half;
 if(part.kind==='panel'||part.corners){
  if(!Array.isArray(part.corners)||part.corners.length!==4||!part.corners.every(finite3))return null;
  const [a,b,c,d]=part.corners,u=sub(b,a),v=sub(d,a),w=norm(u),h=norm(v);if(w<EPS||h<EPS)return null;
  if(Math.abs(dot(u,v))>w*h*1e-7||norm(sub(c,add(b,v)))>1e-4)return null;
  const z=unit(u),y=unit(v),x=unit(cross(y,z));axes=[x,y,z];center=mean(part.corners);half=[0,h/2,w/2];
 }else if(part.kind==='wall'||part.material==='wall'){
  const direction=sub(part.b,part.a),length=norm(direction),height=Number(part.height),width=Number(part.wallThickness||part.width);
  if(length<EPS||Math.abs(direction[1])>EPS||!Number.isFinite(height)||height<=0||!Number.isFinite(width)||width<=0)return null;
  const z=unit(direction);axes=[[-z[2],0,z[0]],[0,1,0],z];center=add(mul(add(part.a,part.b),.5),[0,height/2,0]);half=[width/2,height/2,length/2];
 }else{
  if(!isTimber(part)||!Number.isFinite(part.width)||!Number.isFinite(part.height)||part.width<=0||part.height<=0||!Number.isFinite(Number(part.roll||0)))return null;
  const length=norm(sub(part.b,part.a));if(length<EPS)return null;
  const q=timberQuaternion(part);axes=[[1,0,0],[0,1,0],[0,0,1]].map(v=>new THREE.Vector3(...v).applyQuaternion(q).toArray());center=mul(add(part.a,part.b),.5);half=[part.width/2,part.height/2,length/2];
 }
 const extent=[0,1,2].map(i=>Math.abs(axes[0][i])*half[0]+Math.abs(axes[1][i])*half[1]+Math.abs(axes[2][i])*half[2]);
 return {part,center,axes,half,minX:center[0]-extent[0],maxX:center[0]+extent[0],minY:center[1]-extent[1],maxY:center[1]+extent[1],minZ:center[2]-extent[2],maxZ:center[2]+extent[2]};
}
export function getContactBounds(part){
 const box=contactBox(part);if(!box)return null;const corners=cornersOf(box),min=[box.minX,box.minY,box.minZ],max=[box.maxX,box.maxY,box.maxZ];
 return {min,max,center:[...box.center],boxCenter:[...box.center],width:max[0]-min[0],height:max[1]-min[1],depth:max[2]-min[2],corners:corners.map(p=>[...p]),partIds:[part.id]};
}
function cornersOf(box){if(box.corners)return box.corners;const {center,axes,half}=box,corners=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push(add(add(add(center,mul(axes[0],x*half[0])),mul(axes[1],y*half[1])),mul(axes[2],z*half[2])));box.corners=corners;return corners}
function faces(box){const result=[];for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const tangents=[0,1,2].filter(i=>i!==axis),normal=mul(box.axes[axis],sign);result.push({axis,sign,normal,center:add(box.center,mul(normal,box.half[axis])),u:box.axes[tangents[0]],v:box.axes[tangents[1]],hu:box.half[tangents[0]],hv:box.half[tangents[1]],tangents})}return result}
const radius=(box,direction)=>box.axes.reduce((sum,axis,i)=>sum+Math.abs(dot(axis,direction))*box.half[i],0);
function aabbDistanceSquared(a,b,dx=0,dy=0,dz=0){const x=Math.max(0,b.minX-a.maxX-dx,a.minX+dx-b.maxX),y=Math.max(0,b.minY-a.maxY-dy,a.minY+dy-b.maxY),z=Math.max(0,b.minZ-a.maxZ-dz,a.minZ+dz-b.maxZ);return x*x+y*y+z*z}
function overlaps(a,b,delta){const axes=[...a.axes,...b.axes];for(const aa of a.axes)for(const bb of b.axes){const axis=cross(aa,bb);if(norm(axis)>EPS)axes.push(unit(axis))}const d=[a.center[0]+delta[0]-b.center[0],a.center[1]+delta[1]-b.center[1],a.center[2]+delta[2]-b.center[2]];return axes.every(axis=>radius(a,axis)+radius(b,axis)-Math.abs(dot(d,axis))>PENETRATION_EPS)}

function settings(raw={}){
 const tolerance=number(raw.tolerance,20,0,1000),featureTolerance=number(raw.featureTolerance,Math.min(12,tolerance),0,tolerance),gridStep=number(raw.gridStep??raw.grid,1,.1,10000),axis=String(raw.axis||'XYZ').toUpperCase();
 let quaternion=raw.quaternion?.isQuaternion?raw.quaternion.clone():Array.isArray(raw.quaternion)&&raw.quaternion.length===4&&raw.quaternion.every(Number.isFinite)?new THREE.Quaternion(...raw.quaternion):new THREE.Quaternion();
 if(quaternion.lengthSq()<EPS)quaternion=new THREE.Quaternion();quaternion.normalize();
 const basis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>raw.space==='local'?new THREE.Vector3(...v).applyQuaternion(quaternion).toArray():v),constraints=[];
 for(let i=0;i<3;i++)if(!axis.includes('XYZ'[i]))constraints.push({direction:basis[i],value:0});
 const plane=raw.workplane||raw.plane,lock=raw.lock??plane?.lock??false;if(lock)constraints.push({direction:workplaneFrame(plane).normal.toArray(),value:0});
 return {...raw,tolerance,featureTolerance,gridStep,gridTolerance:number(raw.gridTolerance,Math.min(3,gridStep/2,tolerance),0,Math.min(gridStep/2,tolerance)),axis,quaternion:quaternion.toArray(),space:raw.space==='local'?'local':'world',lock,workplane:plane,constraints,localGrid:raw.localGrid!==false,hysteresis:number(raw.hysteresis,2,0,10)};
}
/** Résout les équations dans le sous-espace autorisé : aucun arrondi ni projection d’un contact déjà calculé. */
function solveEquations(equations){
 const rows=[],values=[];
 for(const {direction,value}of equations){let v=[...direction],rhs=value;for(let i=0;i<rows.length;i++){const projection=dot(direction,rows[i]);v=sub(v,mul(rows[i],projection));rhs-=projection*values[i]}const size=norm(v);if(size<EPS){if(Math.abs(rhs)>CONTACT_EPS)return null;continue}rows.push(mul(v,1/size));values.push(rhs/size)}
 const result=clean(rows.reduce((sum,row,i)=>add(sum,mul(row,values[i])),[0,0,0]));return equations.every(eq=>Math.abs(dot(result,eq.direction)-eq.value)<CONTACT_EPS)?result:null;
}
function satisfies(delta,config){
 if(!finite3(delta)||config.constraints.some(eq=>Math.abs(dot(delta,eq.direction))>CONTACT_EPS))return false;
 return true;
}
function collisionNeighborhoods(moving,targets,distance){const squared=(distance+PENETRATION_EPS)**2;return moving.map(box=>targets.filter(target=>aabbDistanceSquared(box,target)<=squared))}
function collisionFree(moving,neighbors,delta){const [dx,dy,dz]=delta,epsilonSquared=PENETRATION_EPS*PENETRATION_EPS;for(let i=0;i<moving.length;i++)for(const target of neighbors[i])if(aabbDistanceSquared(moving[i],target,dx,dy,dz)<=epsilonSquared&&overlaps(moving[i],target,delta))return false;return true}
function gridCompatible(movingParts,delta,config){
 if(!config.strictGrid)return true;const snapped=snapDeltaToGrid(movingParts,delta,config.strictGrid,{axis:config.axis,space:config.space,quaternion:config.quaternion,lock:config.lock});return !!snapped&&snapped.every((n,i)=>Math.abs(n-delta[i])<CONTACT_EPS);
}
/** Vérification réutilisable pour un autre guide : contraintes entières, nœud global éventuel et absence de pénétration bois/bois. */
export function objectSnapTranslationIsValid(movingParts,targetParts,delta,options={}){
 if(!Array.isArray(movingParts)||!movingParts.length||!Array.isArray(targetParts))return false;
 const config=settings(options),moving=movingParts.map(contactBox);if(!moving.length||moving.some(box=>!box)||!/^(?:X|Y|Z|XY|XZ|YZ|XYZ)$/.test(config.axis)||!satisfies(delta,config)||!gridCompatible(movingParts,delta,config))return false;
 const excluded=new Set(movingParts.map(p=>p.id)),others=(options.collisionParts||targetParts).filter(p=>!excluded.has(p.id)).map(contactBox).filter(Boolean),[dx,dy,dz]=delta;
 // Ce validateur accepte aussi des translations supérieures à la capture : on
 // filtre à la position finale, sans supposer une distance maximale du geste.
 const neighbors=moving.map(box=>others.filter(target=>aabbDistanceSquared(box,target,dx,dy,dz)<=PENETRATION_EPS*PENETRATION_EPS));return collisionFree(moving,neighbors,delta);
}

function hull(points){const sorted=unique(points.map(p=>[...p,0])).map(p=>p.slice(0,2)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(sorted.length<3)return sorted;const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),low=[],high=[];for(const p of sorted){while(low.length>1&&turn(low.at(-2),low.at(-1),p)<=EPS)low.pop();low.push(p)}for(const p of [...sorted].reverse()){while(high.length>1&&turn(high.at(-2),high.at(-1),p)<=EPS)high.pop();high.push(p)}return [...low.slice(0,-1),...high.slice(0,-1)]}
function clipPolygon(points,index,boundary,sign){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],ia=sign*(a[index]-boundary)<=CONTACT_EPS,ib=sign*(b[index]-boundary)<=CONTACT_EPS;if(ia)out.push(a);if(ia!==ib){const t=(boundary-a[index])/(b[index]-a[index]);out.push(a.map((n,j)=>n+(b[j]-n)*t))}}return out}
function clipSegment(a,b,hu,hv){let lo=0,hi=1;for(const [axis,half]of [[0,hu],[1,hv]]){const d=b[axis]-a[axis];if(Math.abs(d)<EPS){if(Math.abs(a[axis])>half+CONTACT_EPS)return null;continue}const t=[(-half-a[axis])/d,(half-a[axis])/d].sort((x,y)=>x-y);lo=Math.max(lo,t[0]);hi=Math.min(hi,t[1]);if(lo>hi+EPS)return null}return [a.map((n,i)=>n+(b[i]-n)*lo),a.map((n,i)=>n+(b[i]-n)*hi)]}
function contactAt(support,targetFace,delta){
 const local=support.map(point=>{const p=sub(add(point,delta),targetFace.center);return [dot(p,targetFace.u),dot(p,targetFace.v)]}),polygon=hull(local);let points,area=0,dimension=0;
 if(polygon.length>=3){points=polygon;for(const [axis,boundary,sign]of [[0,targetFace.hu,1],[0,-targetFace.hu,-1],[1,targetFace.hv,1],[1,-targetFace.hv,-1]]){if(!points.length)return null;points=clipPolygon(points,axis,boundary,sign)}if(points.length<3)return null;area=Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0]},0))/2;if(area<.001){const uniquePoints=unique(points.map(p=>[...p,0])).map(p=>p.slice(0,2));if(!uniquePoints.length)return null;points=uniquePoints;dimension=points.length>1?1:0;area=0}else dimension=2;
 }else if(polygon.length===2){points=clipSegment(polygon[0],polygon[1],targetFace.hu,targetFace.hv);if(!points)return null;dimension=Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])>CONTACT_EPS?1:0;
 }else{if(!polygon.length||Math.abs(polygon[0][0])>targetFace.hu+CONTACT_EPS||Math.abs(polygon[0][1])>targetFace.hv+CONTACT_EPS)return null;points=polygon}
 const c=[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length],point=add(add(targetFace.center,mul(targetFace.u,c[0])),mul(targetFace.v,c[1]));return {point,area,dimension,polygon:points.map(p=>add(add(targetFace.center,mul(targetFace.u,p[0])),mul(targetFace.v,p[1])))};
}
function featureChoices(source,target,face,direction,targetHalf,baseDelta,config,axisName){
 const initial=dot(sub(source.center,face.center),direction),after=initial+dot(baseDelta,direction),sourceHalf=radius(source,direction),longitudinal=Math.max(Math.abs(dot(source.axes[2],direction)),Math.abs(dot(target.axes[2],direction)))>.9,choices=[null];
 const candidates=[{value:-initial,kind:longitudinal?'longitudinal-center':'transverse-center',label:longitudinal?'Centres longitudinaux proches':'Axes transversaux centrés',key:`${axisName}:center`}];
 for(const sign of [-1,1])candidates.push({value:sign*(targetHalf-sourceHalf)-initial,kind:longitudinal?'end-flush':'edge-flush',label:longitudinal?'Extrémités affleurantes':'Bords affleurants',key:`${axisName}:${sign<0?'min':'max'}`});
 for(const item of candidates){const capture=item.kind==='edge-flush'?Math.min(config.featureTolerance,6):config.featureTolerance;if(Math.abs(item.value-dot(baseDelta,direction))<=capture+EPS)choices.push({...item,direction,priority:0})}
 if(config.localGrid){const node=Math.round(after/config.gridStep)*config.gridStep,offset=node-after;if(Math.abs(offset)<=config.gridTolerance+EPS&&!choices.some(item=>item&&Math.abs(item.value-(node-initial))<EPS))choices.push({value:node-initial,direction,kind:'local-grid',label:`Grille locale ${config.gridStep.toLocaleString('fr-FR')} mm`,key:`${axisName}:grid:${node}`,priority:1,node})}
 return choices;
}
function makeCandidate(source,target,face,support,features,delta,config,contact){
 const strong=features.filter(f=>f.priority===0),grid=features.filter(f=>f.priority===1),kind=strong.some(f=>f.kind==='end-flush')?'end-flush':strong.some(f=>f.kind==='transverse-center')?'transverse-center':strong.some(f=>f.kind==='longitudinal-center')?'longitudinal-center':strong.length?'edge-flush':grid.length?'local-grid':contact.dimension===2?'face-contact':'edge-contact',description=[...new Set(features.map(f=>f.label))],baseLabel=contact.dimension===2?'Faces en contact':'Contact géométrique sans rotation';
 const normal=[...face.normal],sourcePoint=sub(contact.point,delta),sourceAxis=source.axes.findIndex(axis=>Math.abs(dot(axis,normal))>1-EPS),sourceFace=sourceAxis<0?null:{axis:sourceAxis,sign:dot(source.axes[sourceAxis],normal)>0?-1:1},key=[source.part.id,target.part.id,face.axis,face.sign,...features.map(f=>f.key)].join('|');
 const endToEnd=sourceFace?.axis===2&&face.axis===2&&Math.abs(dot(source.axes[2],target.axes[2]))>1-EPS;
 const supportType=contact.dimension===2&&sourceFace&&isTimber(source.part)&&isTimber(target.part)?Math.abs(source.axes[2][1])<EPS&&target.part.kind==='post'&&Math.abs(target.axes[2][1])>1-EPS&&normal[1]>1-EPS?'beam-on-post':source.part.kind==='post'&&Math.abs(source.axes[2][1])>1-EPS&&Math.abs(target.axes[2][1])<EPS&&normal[1]<-1+EPS?'post-under-beam':null:null;
 const contactType=endToEnd?'end-contact':supportType||'face-contact',semantic=endToEnd?'Bout à bout':kind.includes('flush')?'Affleurant':kind.includes('center')?'Centré':normal[1]>1-EPS?'Posé sur':kind==='local-grid'?'Grille locale':'En contact',label=`${semantic} · ${name(target.part)}`;
 const targetFacePolygon=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>add(add(face.center,mul(face.u,u*face.hu)),mul(face.v,v*face.hv)));
 const guides=[{a:sourcePoint,b:[...contact.point],label:baseLabel,kind:'alignment'}];
 for(const feature of features){const tangent=feature.direction,span=Math.min(500,Math.max(target.half[face.tangents[0]],target.half[face.tangents[1]],40)),center=add(source.center,delta),onPlane=sub(center,mul(normal,dot(sub(center,face.center),normal)));guides.push({a:add(onPlane,mul(tangent,-span)),b:add(onPlane,mul(tangent,span)),label:feature.label,kind:'alignment'})}
 return {key,kind,contactType,semantic,targetFacePolygon,delta:clean(delta),distance:norm(delta),priority:strong.length?0:grid.length?1:2,centerTransverseScore:strong.filter(f=>f.kind==='transverse-center').length,featureCount:strong.length,gridCount:grid.length,sourceId:source.part.id,targetId:target.part.id,sourceLabel:name(source.part),targetLabel:name(target.part),label,normal,sourceFace,targetFace:{axis:face.axis,sign:face.sign},contactPoint:[...contact.point],contactArea:contact.area,contactDimension:contact.dimension,contactPolygon:contact.polygon,anchorPoints:{source:sourcePoint,target:[...contact.point]},guides,lines:guides,referenceIds:[target.part.id],features:features.map(({kind,key,value})=>({kind,key,value})),localFrame:{origin:[...face.center],u:[...face.u],v:[...face.v],normal,step:config.gridStep},alreadyPlaced:norm(delta)<CONTACT_EPS};
}

/** Pièces déjà à leur position provisoire. Le delta renvoyé s’applique une seule fois, rigidement, à toute la sélection. */
export function getObjectSnapCandidates(movingParts,targetParts,options={}){
 if(options.alt||options.enabled===false||!Array.isArray(movingParts)||!movingParts.length||!Array.isArray(targetParts)||!targetParts.length)return [];
 const config=settings(options);if(config.tolerance<=0||!/^(?:X|Y|Z|XY|XZ|YZ|XYZ)$/.test(config.axis))return [];
 const moving=movingParts.map(contactBox);if(!moving.length||moving.some(box=>!box))return [];
 const excluded=new Set(movingParts.map(p=>p.id)),targets=targetParts.filter(p=>!excluded.has(p.id)).map(contactBox).filter(Boolean),collisions=!options.collisionParts||options.collisionParts===targetParts?targets:options.collisionParts.filter(p=>!excluded.has(p.id)).map(contactBox).filter(Boolean),neighbors=collisionNeighborhoods(moving,collisions,config.tolerance),candidates=[],captureSquared=(config.tolerance+EPS)**2;
 for(const source of moving){const nearby=targets.map(target=>({target,distance:aabbDistanceSquared(source,target)})).filter(item=>item.distance<=captureSquared).sort((a,b)=>a.distance-b.distance||String(a.target.part.id).localeCompare(String(b.target.part.id))).slice(0,64),corners=cornersOf(source);
  for(const {target}of nearby)for(const face of faces(target)){
   const values=corners.map(p=>dot(sub(p,face.center),face.normal)),minimum=Math.min(...values);if(Math.abs(minimum)>config.tolerance+EPS)continue;
   const support=corners.filter((p,i)=>Math.abs(values[i]-minimum)<CONTACT_EPS),normalEquation={direction:face.normal,value:-minimum},baseDelta=solveEquations([...config.constraints,normalEquation]);if(!baseDelta||norm(baseDelta)>config.tolerance+EPS)continue;
   // Un appui intermédiaire suit l'axe du chevron, même si le poteau
   // est tourné. La grille de la section du poteau ne décale pas sa longueur.
   const horizontalSource=isTimber(source.part)&&Math.abs(source.axes[2][1])<EPS,verticalTarget=target.part.kind==='post'&&Math.abs(target.axes[2][1])>1-EPS,horizontalTarget=isTimber(target.part)&&Math.abs(target.axes[2][1])<EPS,verticalSource=source.part.kind==='post'&&Math.abs(source.axes[2][1])>1-EPS;
   const supportBeam=horizontalSource&&verticalTarget&&face.normal[1]>1-EPS?source:verticalSource&&horizontalTarget&&face.normal[1]<-1+EPS?target:null;
   if(supportBeam){
    const long=supportBeam.axes[2],lateral=unit(cross([0,1,0],long)),value=dot(sub(target.center,source.center),lateral);
    if(Math.max(Math.abs(dot(lateral,face.u)),Math.abs(dot(lateral,face.v)))<1-EPS&&Math.abs(value-dot(baseDelta,lateral))<=config.featureTolerance+EPS){const feature={direction:lateral,value,kind:'transverse-center',label:'Centré',key:'support:center',priority:0},delta=solveEquations([...config.constraints,normalEquation,{direction:lateral,value},{direction:long,value:0}]);
     if(delta&&norm(delta)<=config.tolerance+EPS&&gridCompatible(movingParts,delta,config)){const contact=contactAt(support,face,delta);if(contact?.dimension===2){const candidate=makeCandidate(source,target,face,support,[feature],delta,config,contact);candidate.priority=-1;candidates.push(candidate)}}
    }
   }
   const uChoices=featureChoices(source,target,face,face.u,face.hu,baseDelta,config,'u'),vChoices=featureChoices(source,target,face,face.v,face.hv,baseDelta,config,'v');
   for(const u of uChoices)for(const v of vChoices){const features=[u,v].filter(Boolean),delta=solveEquations([...config.constraints,normalEquation,...features.map(f=>({direction:f.direction,value:f.value}))]);if(!delta||norm(delta)>config.tolerance+EPS)continue;const contact=contactAt(support,face,delta);if(!contact)continue;if(!gridCompatible(movingParts,delta,config))continue;candidates.push(makeCandidate(source,target,face,support,features,delta,config,contact))}
  }
 }
 // Dans la capture, l’axe transversal du chevron rejoint celui de l’appui avant
 // de chercher un bord pourtant plus proche. La longueur conserve ses règles locales.
 candidates.sort((a,b)=>a.priority-b.priority||b.centerTransverseScore-a.centerTransverseScore||b.featureCount-a.featureCount||b.gridCount-a.gridCount||b.contactDimension-a.contactDimension||a.distance-b.distance||b.contactArea-a.contactArea||a.key.localeCompare(b.key));
 const accepted=[],seen=new Set(),collisionCache=new Map();for(const candidate of candidates){const key=[candidate.sourceId,candidate.targetId,...candidate.delta.map(v=>Math.round(v*1e7))].join('|');if(seen.has(key))continue;seen.add(key);const deltaKey=candidate.delta.join(',');if(!collisionCache.has(deltaKey))collisionCache.set(deltaKey,collisionFree(moving,neighbors,candidate.delta));if(!collisionCache.get(deltaKey))continue;accepted.push(candidate);if(accepted.length>=32)break}
 if(config.previousKey&&accepted.length){const index=accepted.findIndex(c=>c.key===config.previousKey),previous=accepted[index],best=accepted[0];if(index>0&&previous.priority===best.priority&&previous.centerTransverseScore===best.centerTransverseScore&&previous.featureCount===best.featureCount&&previous.distance<=best.distance+config.hysteresis){accepted.splice(index,1);accepted.unshift(previous)}}
 return accepted;
}
export function findObjectSnap(movingParts,targetParts,options={}){return getObjectSnapCandidates(movingParts,targetParts,options)[0]||null}
