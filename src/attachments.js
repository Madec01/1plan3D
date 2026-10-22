/** Persistent geometric attachments. Millimetres, explicit dependencies, no fixing recipe implied. */
import * as THREE from 'three';
import {timberQuaternion} from './geometry.js';
import {contactBox} from './object-snapping.js';

const EPS = 1e-5, POSE_EPS = .002, LIMIT = 100000;
const clone = value => structuredClone(value);
const vec = value => Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= LIMIT * 4);
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
const add = (a,b) => a.map((n,i) => n+b[i]);
const sub = (a,b) => a.map((n,i) => n-b[i]);
const mean = points => points.reduce((out,p) => out.map((v,i) => v+p[i]/points.length),[0,0,0]);
const distance = (a,b) => Math.hypot(...sub(a,b));
const vector = value => new THREE.Vector3(...value);
const geometry = part => JSON.stringify([part.a,part.b,part.corners||null,part.roll||0,part.width,part.height]);
const samePoints = (a,b) => a.length === b.length && a.every((p,i) => distance(p,b[i]) < POSE_EPS);
const face = raw => raw && [0,1,2].includes(raw.axis) && [-1,1].includes(raw.sign) ? {axis:raw.axis,sign:raw.sign} : null;
const quaternion = raw => Array.isArray(raw) && raw.length === 4 && raw.every(Number.isFinite) && Math.hypot(...raw) > EPS ? Math.abs(Math.hypot(...raw)-1)<1e-12?[...raw]:new THREE.Quaternion(...raw).normalize().toArray() : null;

export function attachmentFrame(part) {
  if (!part || !vec(part.a) || !vec(part.b)) throw new Error('Pièce de référence invalide.');
  let origin = mean([part.a,part.b]), orientation;
  if (part.corners?.length === 4) {
    const x=vector(sub(part.corners[1],part.corners[0])).normalize();
    const z=new THREE.Vector3().crossVectors(x,vector(sub(part.corners[3],part.corners[0]))).normalize();
    if (x.lengthSq()<EPS || z.lengthSq()<EPS) throw new Error('Le panneau de référence est dégénéré.');
    const y=new THREE.Vector3().crossVectors(z,x).normalize();
    orientation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
    origin=mean(part.corners);
  } else {
    if(distance(part.a,part.b)<EPS) throw new Error('La référence doit avoir une longueur non nulle.');
    orientation=timberQuaternion(part);
    if(part.kind==='wall') origin[1]+=part.height/2;
  }
  return {origin,orientation,half:[part.width/2,part.height/2,distance(part.a,part.b)/2]};
}
function localPoint(part,point) { const frame=attachmentFrame(part);return vector(sub(point,frame.origin)).applyQuaternion(frame.orientation.clone().invert()).toArray(); }
function worldPoint(part,point) { const frame=attachmentFrame(part);return vector(point).applyQuaternion(frame.orientation).add(vector(frame.origin)).toArray(); }
function localFaceNormal(part,targetFace) { const box=contactBox(part);if(!box||!targetFace)return null;return vector(box.axes[targetFace.axis]).multiplyScalar(targetFace.sign).applyQuaternion(attachmentFrame(part).orientation.clone().invert()).toArray(); }
const pointsOf = part => part.corners?.length===4 ? part.corners : [part.a,part.b];
const dimensionsOf = part => part.corners?.length===4 ? [[0,1],[1,2],[2,3],[3,0],[0,2],[1,3]].map(([a,b])=>distance(part.corners[a],part.corners[b])) : [distance(part.a,part.b),part.width,part.height];
function area(part) { if(!part.corners)return 0;const [a,b,c,d]=part.corners.map(vector);return new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).length()/2e6+new THREE.Vector3().crossVectors(c.clone().sub(a),d.clone().sub(a)).length()/2e6; }
function validPanel(corners) {
  if (!Array.isArray(corners)||corners.length!==4||!corners.every(vec)) return false;
  const p=corners.map(vector),normal=new THREE.Vector3().crossVectors(p[1].clone().sub(p[0]),p[2].clone().sub(p[0]));
  if(normal.length()<EPS) return false;normal.normalize();
  if(Math.abs(normal.dot(p[3].clone().sub(p[0])))>.1) return false;
  // Convex, ordered quadrilateral: no crossing, inverted edge or collapsed corner.
  return p.every((point,i)=>new THREE.Vector3().crossVectors(p[(i+1)%4].clone().sub(point),p[(i+2)%4].clone().sub(p[(i+1)%4])).dot(normal)>EPS);
}
function rollFor(part,desiredQuaternion) {
  const base=timberQuaternion({...part,roll:0}).invert().multiply(desiredQuaternion);
  return THREE.MathUtils.radToDeg(2*Math.atan2(base.z,base.w));
}
function dependencyCycle(attachments) {
  const adjacency=new Map();
  for(const item of attachments) adjacency.set(item.sourceId,item.anchors.map(a=>a.targetId));
  const seen=new Set(),active=new Set();
  const visit=id=>{if(active.has(id))return true;if(seen.has(id))return false;active.add(id);for(const target of adjacency.get(id)||[])if(visit(target))return true;active.delete(id);seen.add(id);return false;};
  return [...adjacency.keys()].some(visit);
}

/** Closed import schema. Legacy projects simply receive an empty attachment list. */
export function normalizeAttachments(raw,parts,{warnings=[]}={}) {
  const byId=new Map(parts.map(p=>[p.id,p])),result=[],ids=new Set(),sources=new Set();
  const items=Array.isArray(raw)?raw:[];
  if(items.length>1000)throw new Error('Maximum 1 000 attaches géométriques par projet.');
  for(const item of items) {
    let invalid=!item||!safeId(item.id)||ids.has(item.id)||!byId.has(item.sourceId)||sources.has(item.sourceId)||!['fixed','beam','panel'].includes(item.type);
    const anchors=Array.isArray(item?.anchors)?item.anchors.map(a=>({targetId:a?.targetId,local:a?.local})):[];
    const required=item?.type==='panel'?4:item?.type==='beam'?2:1;
    invalid ||= anchors.length!==required||anchors.some(a=>!byId.has(a.targetId)||a.targetId===item.sourceId||!vec(a.local));
    if(item?.type==='beam') invalid ||= byId.get(item.sourceId)?.material!=='wood'||byId.get(item.sourceId)?.kind==='panel'||anchors[0]?.targetId===anchors[1]?.targetId;
    if(item?.type==='panel') invalid ||= byId.get(item.sourceId)?.kind!=='panel';
    const localPoints=Array.isArray(item?.localPoints)?item.localPoints:[],orientation=quaternion(item?.orientation);
    if(item?.type==='fixed') invalid ||= localPoints.length!==(byId.get(item.sourceId)?.kind==='panel'?4:2)||!localPoints.every(vec)||!orientation;
    if(!invalid)try{attachmentFrame(byId.get(item.sourceId));anchors.forEach(a=>attachmentFrame(byId.get(a.targetId)));}catch{invalid=true;}
    if(invalid){warnings.push('Une attache géométrique invalide ou privée de support a été retirée ; ses pièces restent en place.');continue;}
    const attachment={id:item.id,type:item.type,sourceId:item.sourceId,anchors:anchors.map(a=>({targetId:a.targetId,local:[...a.local]}))};
    if(item.type==='fixed'){
      const target=byId.get(anchors[0].targetId),targetFace=face(item.targetFace);
      Object.assign(attachment,{targetId:anchors[0].targetId,localPoints:localPoints.map(p=>[...p]),orientation,sourceFace:face(item.sourceFace),targetFace,referenceHalf:vec(item.referenceHalf)?[...item.referenceHalf]:(contactBox(target)?.half||attachmentFrame(target).half),targetNormal:vec(item.targetNormal)?[...item.targetNormal]:localFaceNormal(target,targetFace)});
    }
    if(item.type==='beam'){
      attachment.intermediateIds=[...new Set(Array.isArray(item.intermediateIds)?item.intermediateIds:[])].filter(id=>byId.has(id)&&id!==item.sourceId&&!anchors.some(a=>a.targetId===id)).slice(0,1000);
      attachment.intermediateContacts=attachment.intermediateIds.map(targetId=>{const saved=(Array.isArray(item.intermediateContacts)?item.intermediateContacts:[]).find(c=>c?.targetId===targetId&&vec(c.local));return {targetId,local:saved?[...saved.local]:localPoint(byId.get(item.sourceId),attachmentFrame(byId.get(targetId)).origin)};});
    }
    if(dependencyCycle([...result,attachment])){warnings.push('Une dépendance géométrique circulaire a été retirée ; les liaisons physiques sont conservées.');continue;}
    result.push(attachment);ids.add(item.id);sources.add(item.sourceId);
  }
  return result;
}
function requireParts(project,sourceId,targetIds) {
  if(project.mode!=='free')throw new Error('Les attaches nécessitent la construction libre.');
  const byId=new Map(project.freeParts.map(p=>[p.id,p])),source=byId.get(sourceId),targets=targetIds.map(id=>byId.get(id));
  if(!source||targets.some(p=>!p)||targetIds.includes(sourceId))throw new Error('Choisissez une pièce et des supports distincts existants.');
  return {source,targets};
}
function saveAttachment(project,item,{replace=false}={}) {
  const p=clone(project),existing=(p.attachments||[]).find(a=>a.sourceId===item.sourceId);
  if(existing&&!replace)throw new Error('Cette pièce possède déjà une attache. Détachez-la ou modifiez explicitement son adaptation.');
  p.attachments=(p.attachments||[]).filter(a=>a.sourceId!==item.sourceId);
  let n=1;while(p.attachments.some(a=>a.id===`A-${String(n).padStart(6,'0')}`))n++;
  item.id=existing?.id||`A-${String(n).padStart(6,'0')}`;
  if(dependencyCycle([...p.attachments,item]))throw new Error('Cette attache créerait une dépendance circulaire. Les liaisons physiques restent autorisées.');
  p.attachments.push(item);p.attachmentConflicts=(p.attachmentConflicts||[]).filter(c=>c.sourceId!==item.sourceId);
  return p;
}
export function createFixedAttachment(project,sourceId,targetId,options={}) {
  const {source,targets:[target]}=requireParts(project,sourceId,[targetId]),targetFrame=attachmentFrame(target),sourceFrame=attachmentFrame(source);
  const orientation=targetFrame.orientation.clone().invert().multiply(sourceFrame.orientation).toArray();
  const targetFace=face(options.targetFace);
  return saveAttachment(project,{type:'fixed',sourceId,targetId,anchors:[{targetId,local:localPoint(target,sourceFrame.origin)}],localPoints:pointsOf(source).map(point=>localPoint(target,point)),orientation,sourceFace:face(options.sourceFace),targetFace,referenceHalf:contactBox(target)?.half||targetFrame.half,targetNormal:localFaceNormal(target,targetFace)});
}
export function configureBeamAttachment(project,sourceId,targetIds,{intermediateIds=[]}={}) {
  if(!Array.isArray(targetIds)||targetIds.length!==2||targetIds[0]===targetIds[1])throw new Error('Choisissez deux supports d’extrémité différents.');
  const {source,targets}=requireParts(project,sourceId,targetIds);
  if(source.material!=='wood'||source.kind==='panel'||source.kind==='wall')throw new Error('L’adaptation entre deux supports concerne une pièce de bois linéaire.');
  const supportIds=[...new Set(intermediateIds)].filter(id=>project.freeParts.some(p=>p.id===id)&&id!==sourceId&&!targetIds.includes(id));
  const p=saveAttachment(project,{type:'beam',sourceId,anchors:targets.map((target,i)=>({targetId:target.id,local:localPoint(target,i?source.b:source.a)})),intermediateIds:supportIds,intermediateContacts:supportIds.map(targetId=>({targetId,local:localPoint(source,attachmentFrame(project.freeParts.find(p=>p.id===targetId)).origin)}))},{replace:true});
  const part=p.freeParts.find(p=>p.id===sourceId);part.lengthLocked=false;part.adaptation='beam';return p;
}
export function configurePanelAttachment(project,sourceId,targetIds) {
  if(!Array.isArray(targetIds)||targetIds.length!==4)throw new Error('Choisissez un support pour chacun des quatre coins, dans leur ordre.');
  const {source,targets}=requireParts(project,sourceId,targetIds);
  if(source.kind!=='panel'||!validPanel(source.corners))throw new Error('L’adaptation nécessite un panneau plat à quatre coins ordonnés.');
  const p=saveAttachment(project,{type:'panel',sourceId,anchors:targets.map((target,i)=>({targetId:target.id,local:localPoint(target,source.corners[i])}))},{replace:true});
  const part=p.freeParts.find(p=>p.id===sourceId);part.lengthLocked=false;part.adaptation='panel';return p;
}
export function detachAttachment(project,idOrSourceId) {
  const p=clone(project),removed=(p.attachments||[]).filter(a=>a.id===idOrSourceId||a.sourceId===idOrSourceId),ids=new Set(removed.map(a=>a.sourceId));
  p.attachments=(p.attachments||[]).filter(a=>!removed.includes(a));
  for(const part of p.freeParts)if(ids.has(part.id)){part.adaptation='fixed';part.lengthLocked=true;}
  p.attachmentConflicts=(p.attachmentConflicts||[]).filter(c=>!ids.has(c.sourceId));return p;
}
function desiredPart(attachment,source,byId) {
  const next=clone(source);
  if(attachment.type==='fixed') {
    const target=byId.get(attachment.anchors[0].targetId),frame=attachmentFrame(target);let shift=[0,0,0];
    if(attachment.targetFace){const {axis}=attachment.targetFace,box=contactBox(target);if(!box||!attachment.targetNormal)throw new Error('La face du support a changé de forme ; vérifiez le contact.');shift=attachment.targetNormal.map(n=>n*(box.half[axis]-attachment.referenceHalf[axis]));}
    const points=attachment.localPoints.map(p=>worldPoint(target,add(p,shift)));
    if(source.kind==='panel'){next.corners=points;next.a=[...points[0]];next.b=[...points[2]];}else{[next.a,next.b]=points;if(source.material==='wood')next.roll=rollFor(next,frame.orientation.clone().multiply(new THREE.Quaternion(...attachment.orientation)));}
  } else if(attachment.type==='beam') {
    [next.a,next.b]=attachment.anchors.map(a=>worldPoint(byId.get(a.targetId),a.local));
  } else {
    next.corners=attachment.anchors.map(a=>worldPoint(byId.get(a.targetId),a.local));next.a=[...next.corners[0]];next.b=[...next.corners[2]];
    if(!validPanel(next.corners))throw new Error('Les supports ne forment plus un cadre plat et convexe ; le panneau est conservé.');
  }
  if(pointsOf(next).some(p=>!vec(p)||p.some(n=>Math.abs(n)>LIMIT))||distance(next.a,next.b)<.1)throw new Error('La position calculée est hors limites ou produit une pièce dégénérée.');
  const lengthsChanged=Math.abs(distance(next.a,next.b)-distance(source.a,source.b))>POSE_EPS;
  const shapeChanged=source.corners&&source.corners.some((p,i)=>source.corners.some((q,j)=>Math.abs(distance(p,q)-distance(next.corners[i],next.corners[j]))>POSE_EPS));
  if(source.lengthLocked!==false&&(lengthsChanged||shapeChanged))throw new Error('Dimensions verrouillées : les supports demandent un redimensionnement. Activez l’adaptation ou corrigez les supports.');
  return next;
}

/** Reconciles after a user command. Explicitly moved dependents are never overwritten. */
export function reconcileAttachments(before,draft) {
  const project=clone(draft),byId=new Map((project.freeParts||[]).map(p=>[p.id,p])),previous=new Map((before.freeParts||[]).map(p=>[p.id,p]));
  const warnings=[],attachments=normalizeAttachments(project.attachments,project.freeParts||[],{warnings}),conflicts=[],changes=[],finished=new Set(),blocked=new Set();
  project.attachments=attachments;
  // Deleting a support releases its dependents in place. The whole command remains one undo item.
  const dropped=(draft.attachments||[]).filter(a=>!attachments.some(b=>b.id===a.id));
  for(const a of dropped){const part=byId.get(a.sourceId);if(part){part.adaptation='fixed';part.lengthLocked=true;}}
  const bySource=new Map(attachments.map(a=>[a.sourceId,a]));
  const conflict=(a,message)=>{conflicts.push({attachmentId:a.id,sourceId:a.sourceId,message});blocked.add(a.sourceId);};
  function visit(a) {
    if(finished.has(a.id))return;
    for(const anchor of a.anchors){const parent=bySource.get(anchor.targetId);if(parent)visit(parent);}
    finished.add(a.id);
    if(a.anchors.some(x=>blocked.has(x.targetId))){conflict(a,'Un support possède une attache en conflit ; corrigez-le avant de poursuivre.');return;}
    const source=byId.get(a.sourceId),old=previous.get(a.sourceId);
    try {
      const desired=desiredPart(a,source,byId),sourcePoints=pointsOf(source),desiredPoints=pointsOf(desired);
      const poseSame=samePoints(sourcePoints,desiredPoints)&&(source.material!=='wood'||Math.abs((source.roll||0)-(desired.roll||0))<POSE_EPS||Math.abs(Math.abs((source.roll||0)-(desired.roll||0))-360)<POSE_EPS);
      if(poseSame)return;
      const directlyEdited=old&&geometry(old)!==geometry(source);
      if(directlyEdited){conflict(a,'La pièce déplacée ne correspond plus à son attache. Annulez ce déplacement, déplacez le support ou détachez explicitement la pièce.');return;}
      // An unresolved manual edit stays a conflict until a support changes or it is explicitly fixed.
      const oldConflict=(before.attachmentConflicts||[]).some(c=>c.sourceId===a.sourceId);
      const supportChanged=a.anchors.some(anchor=>!previous.has(anchor.targetId)||geometry(previous.get(anchor.targetId))!==geometry(byId.get(anchor.targetId)));
      const unlocked=old?.lengthLocked!==false&&source.lengthLocked===false;
      if(oldConflict&&!supportChanged&&!unlocked){conflict(a,'La pièce reste décalée de son attache ; corrigez sa position ou détachez-la.');return;}
      const fromLength=distance(source.a,source.b),toLength=distance(desired.a,desired.b),fromArea=area(source),toArea=area(desired),fromDimensions=dimensionsOf(source),toDimensions=dimensionsOf(desired);
      Object.assign(source,desired);
      changes.push({partId:source.id,attachmentId:a.id,kind:a.type,fromLength,toLength,fromArea,toArea,fromDimensions,toDimensions,dimensionsChanged:fromDimensions.some((n,i)=>Math.abs(n-toDimensions[i])>POSE_EPS)});
    } catch(error){conflict(a,error.message);}
  }
  for(const a of attachments)visit(a);
  // A support in the middle only verifies its original contact. It never drives endpoints.
  for(const a of attachments.filter(a=>a.type==='beam')) {
    const source=byId.get(a.sourceId);
    if(blocked.has(a.sourceId))continue;
    for(const contact of a.intermediateContacts||[]) {
      const support=byId.get(contact.targetId);if(!support)continue;
      const actual=localPoint(source,attachmentFrame(support).origin),half=distance(source.a,source.b)/2;
      if(Math.hypot(actual[0]-contact.local[0],actual[1]-contact.local[1])>.1||Math.abs(actual[2])>half){conflicts.push({attachmentId:a.id,sourceId:a.sourceId,message:`Support intermédiaire ${contact.targetId} : contact à revoir ; il ne pilote pas la longueur.`});break;}
    }
  }
  project.attachmentConflicts=conflicts;
  return {project,conflicts,changes,needsConfirmation:changes.some(c=>c.dimensionsChanged)};
}
export const previewAttachmentChanges=reconcileAttachments;

/** Duplicates only fully selected relationships; copied pieces never follow an uncopied original. */
export function duplicateAttachments(attachments,idMap,delta=[0,0,0]) {
  const result=clone(attachments||[]),used=new Set(result.map(a=>a.id));let n=1;
  for(const a of attachments||[]) {
    if(!idMap.has(a.sourceId)||!a.anchors.every(anchor=>idMap.has(anchor.targetId)))continue;
    while(used.has(`A-${String(n).padStart(6,'0')}`))n++;
    const copy=clone(a);copy.id=`A-${String(n++).padStart(6,'0')}`;used.add(copy.id);copy.sourceId=idMap.get(a.sourceId);copy.anchors=copy.anchors.map(anchor=>({...anchor,targetId:idMap.get(anchor.targetId)}));
    if(copy.targetId)copy.targetId=idMap.get(copy.targetId);
    if(copy.intermediateIds)copy.intermediateIds=copy.intermediateIds.filter(id=>idMap.has(id)).map(id=>idMap.get(id));
    if(copy.intermediateContacts)copy.intermediateContacts=copy.intermediateContacts.filter(c=>idMap.has(c.targetId)).map(c=>({...c,targetId:idMap.get(c.targetId)}));
    result.push(copy);
  }
  return result;
}
