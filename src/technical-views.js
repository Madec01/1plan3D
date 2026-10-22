/** Vues techniques pures : géométrie en mm, sans mutation du projet ni de la nomenclature. */
import * as THREE from 'three';
import {timberQuaternion,panelCorners} from './geometry.js';
import {buildJointFixings,getFoundationJoints,createFixingGeometry} from './fixings.js';

const EPS=1e-7,AXES={x:0,y:1,z:2},NS='http://www.w3.org/2000/svg';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const text=v=>typeof v==='string'?v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,240):'';
const finite=(v,fallback,min=-1000000,max=1000000)=>v!==null&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
const ids=v=>Array.isArray(v)?[...new Set(v.map(text).filter(Boolean))].slice(0,2000):[];
const finite3=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1000000);
const add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]),mul=(a,s)=>a.map(n=>n*s),dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),length=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const center=points=>points.length?mul(points.reduce(add,[0,0,0]),1/points.length):[0,0,0];
const groupOf=part=>part.groupName||part.group||'ungrouped';
const uniq=points=>points.filter((p,i)=>!points.slice(0,i).some(q=>length(sub(p,q))<EPS));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Math.abs(v)<1e-10?'0':String(Number(v.toFixed(8)));
const fmt=v=>Number(v).toLocaleString('fr-FR',{maximumFractionDigits:3});
const area2=points=>Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-p[1]*q[0]},0))/2;
const area3=points=>points.length<3?0:length(points.slice(1,-1).reduce((s,p,i)=>add(s,cross(sub(p,points[0]),sub(points[i+2],points[0]))),[0,0,0]))/2;

export function normalizeTechnicalViewOptions(raw={}){
 const o=object(raw),section=object(o.section),exploded=object(o.exploded),type=['section','exploded','detail'].includes(o.type)?o.type:'section';
 const value=(key,source)=>Object.hasOwn(o,key)?o[key]:source[key],axis=text(value('axis',section)).toLowerCase();
 const used=new Set(),assemblySteps=(Array.isArray(o.assemblySteps)?o.assemblySteps:[]).slice(0,50).map((step,index)=>{
  const s=object(step);let id=text(s.id)||`step-${index+1}`;if(used.has(id)){const base=id;let n=2;while(used.has(`${base}-${n}`))n++;id=`${base}-${n}`}used.add(id);
  return {id,label:text(s.label)||`Étape ${index+1}`,partIds:ids(s.partIds),groups:ids(s.groups)};
 });
 const offsets={};for(const [key,v]of Object.entries(object(exploded.offsets)).slice(0,2000))if(text(key)&&finite3(v))Object.defineProperty(offsets,text(key),{value:v.map(n=>finite(n,0,-100000,100000)),enumerable:true,configurable:true,writable:true});
 const index=o.stepIndex===null||o.stepIndex===undefined?null:Math.round(finite(o.stepIndex,-1,-1,Math.max(-1,assemblySteps.length-1)));
 return {type,view:o.view==='normal'?'section':['section','iso','top','front','side'].includes(o.view)?o.view:type==='section'?'section':'iso',section:{axis:Object.hasOwn(AXES,axis)?axis:'y',offset:finite(value('offset',section),1000),keep:value('keep',section)==='positive'?'positive':'negative'},exploded:{distance:finite(value('distance',exploded),300,0,100000),by:value('by',exploded)==='part'?'part':'group',offsets},selectionIds:ids(o.selectionIds),jointId:text(o.jointId),assemblySteps,stepIndex:index,assembled:o.assembled===true,labels:o.labels!==false,dimensions:o.dimensions!==false,includeFixings:o.includeFixings!==false,includeInDossier:o.includeInDossier===true,includeSteps:o.includeSteps===true};
}

function boxFaces(centerPoint,axes,half){
 const faces=[];
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
  const u=(axis+1)%3,v=(axis+2)%3,c=add(centerPoint,mul(axes[axis],half[axis]*sign));
  faces.push([[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>add(add(c,mul(axes[u],a*half[u])),mul(axes[v],b*half[v]))));
 }return faces;
}
/** Faces réelles du volume rendu. Les panneaux du modèle sont des surfaces triangulées sans épaisseur implicite. */
export function technicalPartGeometry(part){
 if(!part||!finite3(part.a)||!finite3(part.b))return null;
 let faces,surface=false;
 if(part.kind==='panel'||Array.isArray(part.corners)||['mesh','roof'].includes(part.material)){
  const corners=panelCorners(part);if(corners.length!==4||!corners.every(finite3))return null;surface=true;faces=[[corners[0],corners[1],corners[2]],[corners[0],corners[2],corners[3]]];
 }else if(Array.isArray(part.boxDim)&&part.boxDim.length===3&&part.boxDim.every(n=>Number.isFinite(n)&&n>0)){
  faces=boxFaces(center([part.a,part.b]),[[1,0,0],[0,1,0],[0,0,1]],part.boxDim.map(n=>n/2));
 }else if(part.kind==='wall'||part.material==='wall'){
  const d=sub(part.b,part.a);d[1]=0;const size=length(d),height=Number(part.height),thickness=Number(part.wallThickness||part.width);if(size<EPS||![height,thickness].every(n=>Number.isFinite(n)&&n>0))return null;
  const n=[-d[2]/size,0,d[0]/size],ends=[part.a,part.b].map(p=>[-1,1].map(sign=>[add(p,mul(n,sign*thickness/2)),add(add(p,mul(n,sign*thickness/2)),[0,height,0])]));
  const a=ends[0],b=ends[1];faces=[[a[0][0],a[1][0],a[1][1],a[0][1]],[b[0][0],b[1][0],b[1][1],b[0][1]],[a[0][0],b[0][0],b[0][1],a[0][1]],[a[1][0],b[1][0],b[1][1],a[1][1]],[a[0][0],a[1][0],b[1][0],b[0][0]],[a[0][1],a[1][1],b[1][1],b[0][1]]];
 }else{
  const span=length(sub(part.b,part.a)),width=Number(part.width),height=Number(part.height);if(span<EPS||![width,height].every(n=>Number.isFinite(n)&&n>0))return null;
  const q=timberQuaternion(part),axes=[[1,0,0],[0,1,0],[0,0,1]].map(p=>new THREE.Vector3(...p).applyQuaternion(q).toArray());faces=boxFaces(center([part.a,part.b]),axes,[width/2,height/2,span/2]);
 }
 faces=faces.filter(f=>area3(f)>EPS).map(f=>f.map(p=>[...p]));if(!faces.length)return null;
 return {partId:part.id,faces,vertices:uniq(faces.flat()),surface};
}
function clippedFace(face,index,offset,keep){
 const output=[],inside=p=>keep==='positive'?p[index]>=offset-EPS:p[index]<=offset+EPS;
 for(let i=0;i<face.length;i++){
  const a=face[i],b=face[(i+1)%face.length],ia=inside(a),ib=inside(b);if(ia)output.push([...a]);
  if(ia!==ib){const t=(offset-a[index])/(b[index]-a[index]),p=a.map((v,j)=>v+t*(b[j]-v));p[index]=offset;output.push(p)}
 }return uniq(output);
}
function planeHits(face,index,offset){
 const points=[];for(let i=0;i<face.length;i++){const a=face[i],b=face[(i+1)%face.length],da=a[index]-offset,db=b[index]-offset;if(Math.abs(da)<=EPS)points.push([...a]);if(da*db<0){const t=-da/(db-da),p=a.map((v,j)=>v+t*(b[j]-v));p[index]=offset;points.push(p)}}return uniq(points);
}
/** Coupe exacte par demi-espace. Aucune substitution par une boîte alignée sur les axes. */
export function sectionTechnicalGeometry(geometry,rawSection={}){
 const section=normalizeTechnicalViewOptions({section:rawSection}).section,index=AXES[section.axis],faces=geometry.faces.map(face=>clippedFace(face,index,section.offset,section.keep)).filter(face=>face.length>=3&&area3(face)>EPS),hits=uniq(geometry.faces.flatMap(face=>planeHits(face,index,section.offset)));
 let cutPolygon=[];const cutSegments=[];
 const coordinates=geometry.vertices.map(p=>p[index]),crosses=Math.min(...coordinates)<section.offset-EPS&&Math.max(...coordinates)>section.offset+EPS;
 if(geometry.surface){for(const face of geometry.faces){const line=planeHits(face,index,section.offset);if(line.length===2&&length(sub(line[0],line[1]))>EPS)cutSegments.push(line)}}
 else if(crosses&&hits.length>=3){const c=center(hits),axes=[0,1,2].filter(i=>i!==index);cutPolygon=hits.sort((a,b)=>Math.atan2(a[axes[1]]-c[axes[1]],a[axes[0]]-c[axes[0]])-Math.atan2(b[axes[1]]-c[axes[1]],b[axes[0]]-c[axes[0]]));}
 return {...geometry,faces,vertices:uniq([...faces.flat(),...cutPolygon]),cutPolygon,cutSegments,section,cutAreaMm2:area3(cutPolygon)};
}
function projector(options){
 const view=options.view==='section'?({x:'side',y:'top',z:'front'})[options.section.axis]:options.view;
 const project=p=>view==='top'?[p[0],p[2]]:view==='front'?[p[0],-p[1]]:view==='side'?[p[2],-p[1]]:[(p[0]-p[2])/Math.sqrt(2),(p[0]+p[2])/Math.sqrt(6)-p[1]*Math.sqrt(2/3)];
 const depth=p=>options.view==='section'?p[AXES[options.section.axis]]*(options.section.keep==='negative'?1:-1):view==='top'?p[1]:view==='front'?-p[2]:view==='side'?p[0]:(p[0]+p[1]+p[2])/Math.sqrt(3);
 return {project,depth,view};
}
function boundsOf(points){
 if(!points.length)return {minX:0,minY:0,maxX:0,maxY:0,width:0,height:0};
 const minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxX=Math.max(...points.map(p=>p[0])),maxY=Math.max(...points.map(p=>p[1]));return {minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY};
}
function hull(points){
 const list=uniq(points.map(p=>[...p,0])).map(p=>p.slice(0,2)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(list.length<3)return list;const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lower=[],upper=[];
 for(const p of list){while(lower.length>1&&turn(lower.at(-2),lower.at(-1),p)<=EPS)lower.pop();lower.push(p)}for(const p of [...list].reverse()){while(upper.length>1&&turn(upper.at(-2),upper.at(-1),p)<=EPS)upper.pop();upper.push(p)}return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
function hatch(polygon,spacing){
 const values=polygon.map(p=>p[1]-p[0]),lo=Math.min(...values),hi=Math.max(...values),step=Math.max(spacing,(hi-lo)/160),lines=[];
 for(let value=Math.ceil(lo/step)*step;value<hi-EPS;value+=step){const hits=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=a[1]-a[0]-value,db=b[1]-b[0]-value;if(Math.abs(da)<EPS)hits.push(a);if(da*db<0){const t=da/(da-db);hits.push(a.map((n,j)=>n+(b[j]-n)*t))}}const points=uniq(hits.map(p=>[...p,0])).map(p=>p.slice(0,2)).sort((a,b)=>a[0]-b[0]);if(points.length>=2)lines.push([points[0],points.at(-1)])}return lines;
}
function resolveSteps(parts,options,warnings){
 const byId=new Map(parts.map(p=>[p.id,p])),groups=new Set(parts.map(groupOf)),seen=new Set();
 return options.assemblySteps.map(step=>{
  const missingIds=step.partIds.filter(id=>!byId.has(id)),missingGroups=step.groups.filter(group=>!groups.has(group));for(const id of missingIds)warnings.push(`Étape « ${step.label} » : pièce absente ${id}.`);for(const group of missingGroups)warnings.push(`Étape « ${step.label} » : groupe absent ${group}.`);
  const wanted=new Set([...step.partIds,...parts.filter(p=>step.groups.includes(groupOf(p))).map(p=>p.id)]),partIds=parts.filter(p=>wanted.has(p.id)).map(p=>p.id),newPartIds=partIds.filter(id=>!seen.has(id));partIds.forEach(id=>seen.add(id));return {...step,partIds,newPartIds,missingIds,missingGroups,cumulativePartIds:[...seen]};
 });
}
function explosion(parts,geometries,options){
 const translations=new Map(parts.map(p=>[p.id,[0,0,0]]));if(options.assembled||options.type!=='exploded')return translations;
 const groups=new Map();for(const part of parts){const key=options.exploded.by==='part'?part.id:groupOf(part);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(part)}
 const all=geometries.flatMap(g=>g.vertices),origin=center(all),fallback=[[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1],[0,-1,0]];let index=0;
 for(const [key,members]of groups){const memberIds=new Set(members.map(p=>p.id)),points=geometries.filter(g=>memberIds.has(g.partId)).flatMap(g=>g.vertices),direction=sub(center(points),origin),delta=Object.hasOwn(options.exploded.offsets,key)?options.exploded.offsets[key]:mul(length(direction)>EPS?mul(direction,1/length(direction)):fallback[index%fallback.length],options.exploded.distance);for(const part of members)translations.set(part.id,[...delta]);index++}return translations;
}
const colour=part=>part.material==='wood'?'#e0cfad':part.material==='wall'?'#d8dcd9':part.material==='concrete'?'#cfd4d1':part.material==='mesh'?'#e8f0e9':part.material==='roof'?'#dce7eb':'#d0d9de';
function addDimension(primitives,a,b,label,offset,unit){
 const horizontal=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1]),d=horizontal?[0,offset]:[offset,0],aa=a.map((n,i)=>n+d[i]),bb=b.map((n,i)=>n+d[i]),style={stroke:'#587069',strokeWidth:.22,paperStyle:true};
 for(const [p,q]of [[a,aa],[b,bb],[aa,bb]])primitives.push({type:'line',a:p,b:q,...style,role:'dimension'});
 for(const p of [aa,bb])primitives.push({type:'line',a:[p[0]-unit,p[1]-unit],b:[p[0]+unit,p[1]+unit],...style,role:'dimension'});
 primitives.push({type:'text',x:(aa[0]+bb[0])/2+(horizontal?0:-unit*1.5),y:(aa[1]+bb[1])/2-unit*1.5,text:label,fontSize:3,align:horizontal?'middle':'end',fill:'#365b50',paperStyle:true,role:'dimension'});
}
function fixingPrimitives(joints,model,selected,project,translations,warnings){
 const result=[];let count=0;
 for(const joint of joints){if(!selected.has(joint.aPart)||!selected.has(joint.bPart))continue;let instances;try{instances=buildJointFixings(joint,model)}catch{warnings.push(`Fixations indisponibles pour la liaison ${joint.id}.`);continue}
  for(const fixing of instances){if(count++>=400){warnings.push('Affichage limité à 400 fixations ; les quantités du projet sont inchangées.');return result}let geometry;
   try{geometry=createFixingGeometry(fixing.type,{recipe:fixing.recipe,...fixing.geometry});const positions=geometry.getAttribute('position'),q=new THREE.Quaternion(...fixing.quaternion),delta=translations.get(fixing.anchorPartId)||[0,0,0],points=[];
    for(let i=0;i<positions.count;i++)points.push(project(add(add(new THREE.Vector3().fromBufferAttribute(positions,i).multiplyScalar(1000).applyQuaternion(q).toArray(),fixing.position),delta)));
    const polygon=hull(points);if(polygon.length>=3)result.push({type:'polygon',points:polygon,fill:'#b8cbd3',stroke:'#426275',strokeWidth:.2,paperStyle:true,partId:fixing.anchorPartId,fixingId:fixing.id,jointId:joint.id,role:'fixing'});
   }catch{warnings.push(`Géométrie indisponible pour la fixation ${fixing.id}.`)}finally{geometry?.dispose()}
  }
 }if(result.length)warnings.push('Fixations représentées schématiquement selon les données du projet ; aucune capacité mécanique n’est calculée.');return result;
}
function primitivePoints(p,unit=1){if(p.type==='text'){const size=p.fontSize*(p.paperStyle?unit:1),width=size*.6*String(p.text).length,x=p.x-(p.align==='middle'?width/2:p.align==='end'?width:0);return [[x,p.y-size],[x+width,p.y+size*.25]]}return p.points||(p.a&&p.b?[p.a,p.b]:p.type==='circle'?[[p.cx-p.r,p.cy-p.r],[p.cx+p.r,p.cy+p.r]]:[])}
function svgPrimitive(p,unit){
 const style=`${p.fill?` fill="${esc(p.fill)}"`:''}${p.stroke?` stroke="${esc(p.stroke)}" stroke-width="${num((p.strokeWidth||.25)*(p.paperStyle?unit:1))}"`:''}${p.dash?.length?` stroke-dasharray="${p.dash.map(n=>num(n*(p.paperStyle?unit:1))).join(' ')}"`:''}`,data=`${p.partId?` data-part-id="${esc(p.partId)}"`:''}${p.role?` data-role="${esc(p.role)}"`:''}`;
 if(p.type==='line')return `<line x1="${num(p.a[0])}" y1="${num(p.a[1])}" x2="${num(p.b[0])}" y2="${num(p.b[1])}"${style}${data}/>`;
 if(p.type==='polygon'||p.type==='polyline')return `<${p.type} points="${p.points.map(v=>v.map(num).join(',')).join(' ')}"${style}${data}/>`;
 if(p.type==='text')return `<text x="${num(p.x)}" y="${num(p.y)}" font-size="${num(p.fontSize*(p.paperStyle?unit:1))}" text-anchor="${p.align||'start'}"${p.bold?' font-weight="700"':''}${style}${data}>${esc(p.text)}</text>`;
 return '';
}

export function buildTechnicalView(project={},model={},rawOptions={}){
 const options=normalizeTechnicalViewOptions(rawOptions),warnings=[],allParts=(model.parts||[]).filter(p=>p&&typeof p.id==='string'),byId=new Map(allParts.map(p=>[p.id,p])),allJoints=[...(model.joints||[]),...getFoundationJoints(model,project)],steps=resolveSteps(allParts,options,warnings);
 let chosen=allParts,joints=[];
 if(options.type==='detail'){
  if(options.jointId){const joint=allJoints.find(j=>j.id===options.jointId);if(joint){joints=[joint];const wanted=[joint.aPart,joint.bPart];chosen=wanted.map(id=>byId.get(id)).filter(Boolean);for(const id of wanted)if(!byId.has(id))warnings.push(`Liaison ${joint.id} : pièce absente ${id}.`)}else{chosen=[];warnings.push(`Liaison introuvable : ${options.jointId}.`)}}
  else{chosen=options.selectionIds.map(id=>byId.get(id)).filter(Boolean);if(chosen.length>2){warnings.push('Le détail est limité aux deux premières pièces sélectionnées.');chosen=chosen.slice(0,2)}if(chosen.length<2)warnings.push('Sélectionnez deux pièces ou une liaison pour obtenir un détail.');const wanted=new Set(chosen.map(p=>p.id));joints=allJoints.filter(j=>wanted.has(j.aPart)&&wanted.has(j.bPart))}
 }else if(options.selectionIds.length)chosen=allParts.filter(p=>options.selectionIds.includes(p.id));
 for(const id of options.selectionIds)if(!byId.has(id))warnings.push(`Pièce sélectionnée absente : ${id}.`);
 if(options.stepIndex!==null){const visible=new Set(options.stepIndex<0?[]:steps[options.stepIndex]?.cumulativePartIds||[]);chosen=chosen.filter(p=>visible.has(p.id))}
 const currentPartIds=options.stepIndex===null||options.stepIndex<0?[]:(steps[options.stepIndex]?.newPartIds||[]).filter(id=>chosen.some(p=>p.id===id));
 const sourceGeometries=[];for(const part of chosen){const geometry=technicalPartGeometry(part);if(geometry)sourceGeometries.push(geometry);else warnings.push(`Géométrie incomplète ou dégénérée : ${part.id}.`)}
 // La disposition est calculée sur toutes les pièces du sous-ensemble, avant filtrage d’étape : aucune pièce déjà montée ne saute entre deux étapes.
 const explosionParts=options.selectionIds.length?allParts.filter(p=>options.selectionIds.includes(p.id)):allParts,explosionGeometry=explosionParts.map(technicalPartGeometry).filter(Boolean),translations=explosion(explosionParts,explosionGeometry,options),{project:projectPoint,depth,view}=projector(options),worldParts=[],sections=[],faces=[],primitives=[],leaders=[];
 for(const source of sourceGeometries){
  const part=byId.get(source.partId),delta=translations.get(part.id)||[0,0,0],geometry=options.type==='section'?sectionTechnicalGeometry(source,options.section):{...source,cutPolygon:[],cutSegments:[]};if(!geometry.vertices.length)continue;
  const world={id:part.id,surface:geometry.surface,translation:[...delta],faces:geometry.faces.map(face=>face.map(p=>add(p,delta))),cutPolygon:geometry.cutPolygon.map(p=>add(p,delta)),cutSegments:geometry.cutSegments.map(line=>line.map(p=>add(p,delta))),center:add(center(geometry.vertices),delta)};worldParts.push(world);
  for(const face of world.faces)faces.push({part,points:face,depth:depth(center(face)),cut:false});if(world.cutPolygon.length){faces.push({part,points:world.cutPolygon,depth:depth(center(world.cutPolygon)),cut:true});sections.push({partId:part.id,polygon:world.cutPolygon.map(p=>[...p]),projectedPolygon:world.cutPolygon.map(projectPoint),areaMm2:geometry.cutAreaMm2})}
  if(options.type==='exploded'&&length(delta)>EPS)leaders.push({type:'line',a:projectPoint(center(source.vertices)),b:projectPoint(add(center(source.vertices),delta)),stroke:'#6d8b98',strokeWidth:.2,dash:[2,1.5],paperStyle:true,partId:part.id,role:'explosion-leader'});
 }
 const geometryBounds=boundsOf(worldParts.flatMap(p=>[...p.faces.flat(),...p.cutPolygon].map(projectPoint))),unit=Math.max(1,Math.max(geometryBounds.width,geometryBounds.height,100)/200),hatchSpacing=Math.max(2,unit*2.5);
 primitives.push(...leaders);
 for(const face of faces.sort((a,b)=>a.depth-b.depth||Number(a.cut)-Number(b.cut))){const points=face.points.map(projectPoint);if(area2(points)<EPS)continue;primitives.push({type:'polygon',points,fill:face.cut?'#fbf4df':colour(face.part),stroke:face.cut?'#293b34':'#6f7e73',strokeWidth:face.cut?.4:.2,paperStyle:true,partId:face.part.id,role:face.cut?'section':'face'});if(face.cut)for(const [a,b]of hatch(points,hatchSpacing))primitives.push({type:'line',a,b,stroke:'#746d53',strokeWidth:.16,paperStyle:true,partId:face.part.id,role:'hatch'})}
 for(const world of worldParts)for(const line of world.cutSegments)primitives.push({type:'line',a:projectPoint(line[0]),b:projectPoint(line[1]),stroke:'#2c5d62',strokeWidth:.5,paperStyle:true,partId:world.id,role:'surface-section'});
 if(options.type==='section'&&worldParts.some(p=>p.surface))warnings.push('Les panneaux sans épaisseur sont des surfaces : leurs intersections sont tracées sans hachures de matière.');
 if(options.type==='detail'&&options.includeFixings)primitives.push(...fixingPrimitives(joints,model,new Set(worldParts.map(p=>p.id)),projectPoint,translations,warnings));
 if(options.labels){const occupied=[];for(const world of worldParts){const anchor=projectPoint(world.center);let position=[anchor[0]+unit*6,anchor[1]-unit*6];for(let i=0;i<30&&occupied.some(p=>Math.abs(p[0]-position[0])<unit*20&&Math.abs(p[1]-position[1])<unit*5);i++)position[1]-=unit*5;occupied.push(position);primitives.push({type:'line',a:anchor,b:position,stroke:'#46665b',strokeWidth:.2,paperStyle:true,partId:world.id,role:'label-leader'},{type:'text',x:position[0]+unit,y:position[1]-unit,text:world.id,fontSize:3,fill:'#254b3c',paperStyle:true,partId:world.id,role:'part-label'});}}
 if(options.dimensions&&view!=='iso'&&worldParts.length){if(geometryBounds.width>EPS)addDimension(primitives,[geometryBounds.minX,geometryBounds.maxY],[geometryBounds.maxX,geometryBounds.maxY],`${fmt(geometryBounds.width)} mm`,unit*12,unit);if(geometryBounds.height>EPS)addDimension(primitives,[geometryBounds.minX,geometryBounds.minY],[geometryBounds.minX,geometryBounds.maxY],`${fmt(geometryBounds.height)} mm`,-unit*12,unit)}
 const stepLabel=options.stepIndex===null?'':options.stepIndex<0?' · Avant montage':` · ${steps[options.stepIndex]?.label||'Étape vide'}`,label=(options.type==='section'?`Coupe ${options.section.axis.toUpperCase()} = ${fmt(options.section.offset)} mm · côté ${options.section.keep==='positive'?'positif':'négatif'}`:options.type==='detail'?`Détail ${options.jointId||worldParts.map(p=>p.id).join(' / ')||'sans sélection'}`:options.assembled?'Vue de montage assemblée':`Vue éclatée · ${fmt(options.exploded.distance)} mm`)+stepLabel;
 if(!worldParts.length)warnings.push('Aucune géométrie visible avec ces paramètres.');
 const bounds=boundsOf(primitives.flatMap(p=>primitivePoints(p,unit))),margin=unit*10,viewBox=[bounds.minX-margin,bounds.minY-margin,Math.max(bounds.width,100)+margin*2,Math.max(bounds.height,100)+margin*2],uniqueWarnings=[...new Set(warnings)],legend=worldParts.map(world=>{const part=byId.get(world.id);return {id:part.id,label:part.label||part.id,group:groupOf(part),material:part.material||'',current:currentPartIds.includes(part.id)}});
 const svg=`<svg xmlns="${NS}" role="img" aria-label="${esc(label)}" viewBox="${viewBox.map(num).join(' ')}" width="100%" height="100%"><title>${esc(label)}</title><desc>${esc(uniqueWarnings.join(' '))}</desc><rect x="${num(viewBox[0])}" y="${num(viewBox[1])}" width="${num(viewBox[2])}" height="${num(viewBox[3])}" fill="#ffffff"/><g font-family="Arial, sans-serif" stroke-linejoin="round">${primitives.map(p=>svgPrimitive(p,unit)).join('')}${!worldParts.length?`<text x="${num(bounds.minX+margin)}" y="${num(bounds.minY+margin)}" font-size="${num(unit*3)}" fill="#63756a">Aucune géométrie visible</text>`:''}</g></svg>`;
 return {svg,bounds,geometryBounds,label,warnings:uniqueWarnings,options,primitives,worldParts,sections,includedPartIds:worldParts.map(p=>p.id),currentPartIds,steps,legend,scaleable:true,units:'mm',projection:options.view};
}
