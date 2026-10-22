import * as THREE from 'three';
import { normalizeProject, convertToFree, makePart, addJoint } from './engine.js';
import { timberQuaternion } from './geometry.js';
const clone=p=>structuredClone(p);
export const centerOf=part=>part.a.map((v,i)=>(v+part.b[i])/2);
/** Resize a segment along its current direction, preserving the chosen anchor. */
export function resizePartLength(part,length,anchor='a'){
 if(!['a','center','b'].includes(anchor))throw new RangeError('Choisissez une extrémité ou le centre à conserver.');
 if(!Number.isFinite(length)||length<=0)throw new RangeError('La longueur doit être supérieure à zéro.');
 if(!part?.a||!part?.b||part.a.length!==3||part.b.length!==3||![...part.a,...part.b].every(Number.isFinite))throw new RangeError('Les extrémités doivent contenir trois coordonnées valides.');
 const delta=part.b.map((v,i)=>v-part.a[i]),current=Math.hypot(...delta),result=clone(part);
 if(!current)throw new RangeError('Les deux extrémités doivent être distinctes.');
 // Reapplying a displayed length must preserve every original coordinate bit for bit.
 if(Math.abs(length-current)<=Number.EPSILON*Math.max(1,current,length)*4)return result;
 const direction=delta.map(v=>v/current);
 if(anchor==='a')result.b=part.a.map((v,i)=>v+direction[i]*length);
 else if(anchor==='b')result.a=part.b.map((v,i)=>v-direction[i]*length);
 else{const center=centerOf(part);result.a=center.map((v,i)=>v-direction[i]*length/2);result.b=center.map((v,i)=>v+direction[i]*length/2)}
 if(Object.hasOwn(result,'length'))result.length=length;
 return result;
}
export function transformSelection(input,ids,{delta=[0,0,0],axis='y',angle=0,pivot}={}){
 const p=clone(input),selected=p.freeParts.filter(x=>ids.includes(x.id));if(!selected.length)return p;
 pivot ||= selected.reduce((out,x)=>out.map((v,i)=>v+centerOf(x)[i]/selected.length),[0,0,0]);
 const origin=new THREE.Vector3(...pivot),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0),angle*Math.PI/180),d=new THREE.Vector3(...delta);
 const point=arr=>!angle?arr.map((value,i)=>value+delta[i]):new THREE.Vector3(...arr).sub(origin).applyQuaternion(rotation).add(origin).add(d).toArray().map(v=>Math.round(v*1000)/1000);
 for(const part of selected){const orientation=rotation.clone().multiply(timberQuaternion(part));part.a=point(part.a);part.b=point(part.b);if(part.corners)part.corners=part.corners.map(point);if(part.material==='wood'&&angle){const q=timberQuaternion({...part,roll:0}).invert().multiply(orientation);part.roll=Math.round(THREE.MathUtils.radToDeg(2*Math.atan2(q.z,q.w))*1000)/1000}}
 return normalizeProject(p);
}
export function alignSelection(input,ids,axis,distribute=false){
 let p=clone(input);const index={x:0,y:1,z:2}[axis],items=p.freeParts.filter(x=>ids.includes(x.id));if(items.length<2)return p;
 const ordered=distribute?[...items].sort((a,b)=>centerOf(a)[index]-centerOf(b)[index]):items;
 const first=centerOf(ordered[0])[index],last=centerOf(ordered.at(-1))[index];
 for(let i=distribute?1:0;i<ordered.length-(distribute?1:0);i++){const desired=distribute?first+(last-first)*i/(ordered.length-1):first;const delta=[0,0,0];delta[index]=desired-centerOf(ordered[i])[index];p=transformSelection(p,[ordered[i].id],{delta})}return p;
}
export function snapToPoint(input,id,end,targetId,targetEnd){
 const p=input.freeParts.find(x=>x.id===id),target=input.freeParts.find(x=>x.id===targetId);if(!p||!target||id===targetId)return input;
 return transformSelection(input,[id],{delta:target[targetEnd].map((v,i)=>v-p[end][i])});
}
export function nearestEndpointSnap(input,ids,threshold){
 const selected=input.freeParts.filter(x=>ids.includes(x.id)),others=input.freeParts.filter(x=>!ids.includes(x.id));let nearest;
 for(const a of selected)for(const b of others)for(const end of ['a','b'])for(const target of ['a','b']){const delta=b[target].map((v,i)=>v-a[end][i]),distance=Math.hypot(...delta);if(distance>0.01&&distance<threshold&&(!nearest||distance<nearest.distance))nearest={distance,delta}}
 return nearest?transformSelection(input,ids,{delta:nearest.delta}):input;
}
export function createPreset(input,type){
 input={...input,workplane:{type:'xz',offset:0,lock:false,visible:true},placementSurface:'ground',attachments:[],attachmentConflicts:[]};
 if(type==='enclos')return convertToFree({...input,mode:'parametric',drawing:{},technical:{},paper:{}});
 let p=normalizeProject({...input,mode:'free',drawing:{},technical:{},paper:{},freeParts:[],freeJoints:[],jointOverrides:{},postOverrides:{},stock:{},prices:{},purchased:{},name:type==='blank'?'Mon projet libre':type==='l'?'Structure en L':type==='wall'?'Structure adossée':type==='gable'?'Toiture double pente':'Mon portique'});
 if(type==='blank')return p;
 const add=(kind,a,b,extra={})=>{const part={...makePart(p,kind),a,b,...extra};p.freeParts.push(part);p=normalizeProject(p);return part.id};
 const connect=(a,b,recipe='angle')=>{p=addJoint(p,a,b,recipe)};
 const h=2200,xy=type==='l'?[[-2000,-1500],[2000,-1500],[2000,0],[0,0],[0,1500],[-2000,1500]]:[[-1500,-1000],[1500,-1000],[1500,1000],[-1500,1000]];
 const posts=xy.map(([x,z],i)=>add('post',[x,0,z],[x,h,z],{label:`Poteau ${i+1}`,width:90,height:90}));
 const beams=[];
 for(let i=0;i<xy.length;i++){const j=(i+1)%xy.length,[x,z]=xy[i],[xx,zz]=xy[j];const dx=xx-x,dz=zz-z,len=Math.hypot(dx,dz);const id=add('beam',[x+dx/len*45,h-35,z+dz/len*45],[xx-dx/len*45,h-35,zz-dz/len*45],{label:`Traverse ${i+1}`,width:45,height:70});beams.push(id);connect(posts[i],id);connect(posts[j],id)}
 if(type==='wall'){
  const wall=add('wall',[-1900,0,1100],[1900,0,1100],{label:'Mur de référence',width:200,height:2800,wallThickness:200,wallSupport:'concrete',material:'wall'});
  const ledger=add('beam',[-1500,h,950],[1500,h,950],{label:'Muralière',width:70,height:145});connect(wall,ledger,'wall_mechanical');
  const retainedPosts=new Set(posts.slice(0,2));const removed=posts.filter(id=>!retainedPosts.has(id));p.freeParts=p.freeParts.filter(x=>!removed.includes(x.id));p.freeJoints=p.freeJoints.filter(j=>!removed.includes(j.aPart)&&!removed.includes(j.bPart));
  for(const id of beams.slice(1).filter((_,i)=>i!==1))connect(ledger,id,'hanger');
 }
 if(type==='gable'){
  const ridge=add('beam',[-1500,h+650,0],[1500,h+650,0],{label:'Faîtière',width:70,height:145,group:'roof'});
  for(const x of [-1400,0,1400])for(const sign of [-1,1]){const raf=add('beam',[x,h,sign*1000],[x,h+650,0],{label:'Chevron de pente',width:45,height:95,group:'roof'});connect(raf,ridge,'screw');connect(raf,beams[sign===-1?0:2],'angle')}
  for(const sign of [-1,1]){const corners=[[-1550,h+80,sign*1100],[1550,h+80,sign*1100],[1550,h+730,0],[-1550,h+730,0]];add('panel',corners[0],corners[2],{label:'Pan de toiture',material:'roof',corners,group:'roof',width:18,height:18})}
 }
 return normalizeProject(p);
}
