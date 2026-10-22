/** Actions de sélection pures : aucun accès DOM, aucune normalisation ni liaison implicite. */
import * as THREE from 'three';
import {timberQuaternion,panelCorners} from './geometry.js';
const clone=value=>structuredClone(value),EPS=1e-8,AXIS={x:0,y:1,z:2};
const finite3=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const unique=values=>[...new Set(Array.isArray(values)?values:[])];
const selected=(project,ids)=>{const byId=new Map((project.freeParts||[]).map(p=>[p.id,p]));return unique(ids).map(id=>byId.get(id)).filter(Boolean)};
const requireFree=project=>{if(project.mode&&project.mode!=='free')throw new Error('Passez en construction libre pour modifier les pièces.');};
function requireSelected(project,ids,count=1){requireFree(project);const parts=selected(project,ids);if(parts.length<count)throw new Error(`Sélectionnez au moins ${count===1?'une pièce':`${count} pièces`}.`);return parts}
function axisIndex(axis){if(!Object.hasOwn(AXIS,axis))throw new Error('Choisissez un axe X, Y ou Z.');return AXIS[axis]}
function translate(part,delta){const result={...clone(part),a:part.a.map((n,i)=>n+delta[i]),b:part.b.map((n,i)=>n+delta[i])};if(part.corners)result.corners=part.corners.map(p=>p.map((n,i)=>n+delta[i]));if(part.endHeights)result.endHeights=part.endHeights.map(n=>n+delta[1]);for(const point of [result.a,result.b,...(result.corners||[])])if(!finite3(point)||point.some(n=>Math.abs(n)>100000))throw new Error('Ce déplacement dépasse les limites du projet (±100 000 mm).');return result}
function translations(project,deltas){const result=clone(project);result.freeParts=result.freeParts.map(part=>deltas.has(part.id)?translate(part,deltas.get(part.id)):part);return result}
/** Enveloppe monde réelle : section tournée du bois, quatre sommets du panneau, volume du mur. */
export function contextBounds(part){
 if(!part||!finite3(part.a)||!finite3(part.b))throw new Error('La pièce ne possède pas de coordonnées valides.');let points=[];
 if(part.kind==='panel'||part.corners||['mesh','roof'].includes(part.material))points=panelCorners(part);
 else if(Array.isArray(part.boxDim)&&part.boxDim.length===3){const c=part.a.map((n,i)=>(n+part.b[i])/2);for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])points.push(c.map((n,i)=>n+[x,y,z][i]*part.boxDim[i]/2))}
 else if(part.kind==='wall'||part.material==='wall'){const a=new THREE.Vector3(...part.a),b=new THREE.Vector3(...part.b),d=b.clone().sub(a).setY(0),span=d.length(),height=Number(part.height),width=Number(part.wallThickness||part.width);if(!(span>EPS&&height>0&&width>0))throw new Error('Le mur doit avoir une longueur, une hauteur et une épaisseur positives.');const n=new THREE.Vector3(-d.z,0,d.x).divideScalar(span);for(const p of [a,b])for(const sign of [-1,1])for(const top of [0,1])points.push(p.clone().addScaledVector(n,sign*width/2).add(new THREE.Vector3(0,top*height,0)).toArray())}
 else{if(!(part.width>0&&part.height>0)||Math.hypot(...part.b.map((n,i)=>n-part.a[i]))<EPS)throw new Error('La pièce doit avoir une longueur et une section positives.');const q=timberQuaternion(part);for(const p of [part.a,part.b])for(const x of [-1,1])for(const y of [-1,1])points.push(new THREE.Vector3(x*part.width/2,y*part.height/2,0).applyQuaternion(q).add(new THREE.Vector3(...p)).toArray())}
 if(!points.length||!points.every(finite3))throw new Error('La géométrie de cette pièce est invalide.');const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));return {min,max,center:min.map((n,i)=>(n+max[i])/2),size:min.map((n,i)=>max[i]-n),points};
}
export function groundSelection(project,ids,{individual=false}={}){const parts=requireSelected(project,ids),items=parts.map(part=>({part,min:contextBounds(part).min[1]})),lowest=Math.min(...items.map(p=>p.min));return translations(project,new Map(items.map(({part,min})=>[part.id,[0,-(individual?min:lowest),0]])))}
/** La référence est la première sélection, indépendamment de l'ordre des pièces dans le projet. */
export function alignToReference(project,ids,{axis='x',feature='center',referenceId=ids?.[0]}={}){
 const parts=requireSelected(project,ids,2),index=axisIndex(axis);if(!['center','min','max'].includes(feature))throw new Error('Choisissez le centre ou une face minimale / maximale.');const reference=parts.find(p=>p.id===referenceId);if(!reference)throw new Error('La référence doit appartenir à la sélection.');const target=contextBounds(reference)[feature][index],deltas=new Map();for(const part of parts){if(part.id===reference.id)continue;const delta=[0,0,0];delta[index]=target-contextBounds(part)[feature][index];deltas.set(part.id,delta)}return translations(project,deltas);
}
/** Répartit entre les deux éléments extrêmes, qui restent immobiles. */
export function distributeSelection(project,ids,{axis='x',spacing='axes'}={}){
 const parts=requireSelected(project,ids,3),index=axisIndex(axis);if(!['axes','faces'].includes(spacing))throw new Error('Choisissez des entraxes ou des espaces libres égaux.');const items=parts.map(part=>({part,bounds:contextBounds(part)})).sort((a,b)=>a.bounds.center[index]-b.bounds.center[index]||String(a.part.id).localeCompare(String(b.part.id))),first=items[0],last=items.at(-1),deltas=new Map();
 if(spacing==='axes'){const span=last.bounds.center[index]-first.bounds.center[index];if(span<EPS)throw new Error('Les deux éléments extrêmes se superposent sur cet axe.');for(let i=1;i<items.length-1;i++){const delta=[0,0,0];delta[index]=first.bounds.center[index]+span*i/(items.length-1)-items[i].bounds.center[index];deltas.set(items[i].part.id,delta)}}
 else{const widths=items.slice(1,-1).reduce((sum,item)=>sum+item.bounds.size[index],0),gap=(last.bounds.min[index]-first.bounds.max[index]-widths)/(items.length-1);if(gap<-EPS)throw new Error('L’espace disponible entre les extrêmes est insuffisant pour ces pièces.');let edge=first.bounds.max[index];for(let i=1;i<items.length-1;i++){const delta=[0,0,0];delta[index]=edge+Math.max(0,gap)-items[i].bounds.min[index];deltas.set(items[i].part.id,delta);edge+=Math.max(0,gap)+items[i].bounds.size[index]}}
 return translations(project,deltas);
}
/** Liaisons enregistrées et, sur demande, groupes explicites ; jamais les simples contacts. */
export function connectedSelection(project,ids,{includeGroups=false,respectUngrouped=false}={}){
 const parts=project.freeParts||[],valid=new Set(parts.map(p=>p.id)),result=unique(ids).filter(id=>valid.has(id)),seen=new Set(result),neighbors=new Map();
 const connect=(a,b)=>{if(!valid.has(a)||!valid.has(b))return;for(const [from,to]of [[a,b],[b,a]]){if(!neighbors.has(from))neighbors.set(from,[]);neighbors.get(from).push(to)}};
 const detached=new Set(parts.filter(p=>p.selectLinked===false).map(p=>p.id)),connectRelation=(a,b)=>{if(!respectUngrouped||!detached.has(a)&&!detached.has(b))connect(a,b)};
 for(const joint of project.freeJoints||[])connectRelation(joint.aPart,joint.bPart);
 for(const attachment of project.attachments||[])for(const anchor of attachment.anchors||[])connectRelation(attachment.sourceId,anchor.targetId);
 if(includeGroups){const firstByGroup=new Map();for(const part of parts){const name=part.groupName?.trim();if(!name||part.grouped===false)continue;if(firstByGroup.has(name))connect(firstByGroup.get(name),part.id);else firstByGroup.set(name,part.id)}}
 for(let i=0;i<result.length;i++)for(const id of neighbors.get(result[i])||[])if(!seen.has(id)){seen.add(id);result.push(id)}return result;
}
export function canUngroupSelection(project,ids){
 const parts=selected(project,ids);
 return parts.some(p=>p.grouped!==false&&p.groupName?.trim())||parts.some(p=>connectedSelection(project,[p.id],{respectUngrouped:true}).length>1);
}
export function selectionGroupIds(project,ids){const parts=project.freeParts||[],initial=selected(project,ids).map(p=>p.id),names=new Set(selected(project,ids).filter(p=>p.grouped!==false).map(p=>p.groupName?.trim()).filter(Boolean));return unique([...initial,...parts.filter(p=>p.grouped!==false&&names.has(p.groupName?.trim())).map(p=>p.id)])}
export function namedSelectionGroups(project){const groups=new Map();for(const part of project.freeParts||[]){const name=part.groupName?.trim();if(!name||part.grouped===false)continue;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(part.id)}return [...groups].map(([name,ids])=>({name,ids,count:ids.length})).sort((a,b)=>a.name.localeCompare(b.name,'fr'))}
function uniqueGroupName(existing,base='Groupe'){let index=1,name=`${base} ${index}`;while(existing.has(name))name=`${base} ${++index}`;return name}
export function groupSelection(project,ids,{name='',includeConnected=false}={}){
 requireSelected(project,ids);const chosen=includeConnected?connectedSelection(project,ids):selected(project,ids).map(p=>p.id),chosenSet=new Set(chosen),existing=new Set(namedSelectionGroups(project).map(g=>g.name));let label=String(name??'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,80);if(!label)label=uniqueGroupName(existing);if((project.freeParts||[]).some(p=>p.grouped!==false&&p.groupName?.trim()===label&&!chosenSet.has(p.id)))throw new Error(`Le groupe « ${label} » existe déjà. Choisissez un autre nom ou sélectionnez aussi ses pièces.`);const result=clone(project);for(const part of result.freeParts)if(chosenSet.has(part.id)){part.groupName=label;part.grouped=true;delete part.selectLinked;}return result;
}
export function ungroupSelection(project,ids){requireSelected(project,ids);const chosen=new Set(ids),result=clone(project);for(const part of result.freeParts)if(chosen.has(part.id)){part.groupName='';part.grouped=false;part.selectLinked=false;}return result}
/** À appeler sur le résultat de duplicateParts afin de séparer copie et original. */
export function separateCopiedGroups(before,after){const previous=new Set((before.freeParts||[]).map(p=>p.id)),result=clone(after),names=new Set(namedSelectionGroups(after).map(g=>g.name)),mapping=new Map();for(const part of result.freeParts||[]){if(previous.has(part.id)||part.grouped===false||!part.groupName?.trim())continue;const name=part.groupName.trim();if(!mapping.has(name)){let label=`${name} (copie)`,i=2;while(names.has(label))label=`${name} (copie ${i++})`;label=label.slice(0,80);while(names.has(label)){label=`${name.slice(0,64)} (copie ${i++})`}mapping.set(name,label);names.add(label)}part.groupName=mapping.get(name)}return result}
const namedFrames={top:{right:[1,0,0],up:[0,0,-1]},front:{right:[-1,0,0],up:[0,1,0]},side:{right:[0,0,-1],up:[0,1,0]}};
const vector=value=>value?.isVector3?value.toArray():value;
/** frame décrit les directions DROITE et HAUT de l'écran. Les noms sont les vues caméra 3D. */
export function keyboardNudge(event,frame='top',step=1){
 if(!event||event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||!(Number.isFinite(Number(step))&&Number(step)>0))return null;const target=event.target;if(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],dialog[open],[role="menu"],[role="tablist"]'))return null;
 const amount=Number(step)*(event.shiftKey?10:1)*(event.altKey ? .1 : 1);if(event.key==='PageUp')return [0,amount,0];if(event.key==='PageDown')return [0,-amount,0];if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return null;
 const basis=typeof frame==='string'?namedFrames[frame]:frame?.right&&frame?.up?frame:frame?.view?namedFrames[frame.view]:frame,axis=['ArrowLeft','ArrowRight'].includes(event.key)?'right':'up',direction=vector(basis?.[axis]);if(!finite3(direction))return null;const length=Math.hypot(...direction);if(length<EPS)return null;const sign=['ArrowLeft','ArrowDown'].includes(event.key)?-1:1;return direction.map(n=>n===0?0:n/length*amount*sign);
}
