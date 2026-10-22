import * as THREE from 'three';
import {timberQuaternion} from './geometry.js';

export const DEFAULT_WORKPLANE={type:'xz',offset:0,origin:[0,0,0],normal:[0,1,0],u:[1,0,0],lock:false,visible:true};
const v=arr=>new THREE.Vector3(...arr);
const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(x=>typeof x==='number'&&Number.isFinite(x));
export function normalizeWorkplane(raw={}){
 const p={...DEFAULT_WORKPLANE};if(!raw||typeof raw!=='object')return p;
 p.type=['xz','xy','yz','face'].includes(raw.type)?raw.type:'xz';
 p.offset=Number.isFinite(Number(raw.offset))?THREE.MathUtils.clamp(Number(raw.offset),-100000,100000):0;
 p.lock=raw.lock===true;p.visible=raw.visible!==false;
 if(p.type==='face'&&finite3(raw.origin)&&finite3(raw.normal)&&finite3(raw.u)){
  const n=v(raw.normal),u=v(raw.u);if(n.length()<1e-8)return {...p,type:'xz'};n.normalize();u.addScaledVector(n,-u.dot(n));
  if(u.length()<1e-8)return {...p,type:'xz'};
  p.origin=raw.origin.map(x=>THREE.MathUtils.clamp(x,-100000,100000));p.normal=n.toArray();p.u=u.normalize().toArray();
 }else if(p.type==='face')p.type='xz';
 if(p.type!=='face'){p.origin=[0,0,0];p.normal=p.type==='xy'?[0,0,1]:p.type==='yz'?[1,0,0]:[0,1,0];p.u=p.type==='yz'?[0,0,1]:[1,0,0]}
 return p;
}
export function workplaneFrame(raw){
 const p=normalizeWorkplane(raw),normal=v(p.normal),u=v(p.u),w=u.clone().cross(normal).normalize();
 return {origin:v(p.origin).addScaledVector(normal,p.offset),normal,u,v:w,quaternion:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u,normal,w))};
}
export function planeFromPart(part,face='b'){
 if(part?.material!=='wood')throw Error('Choisissez une pièce de bois pour définir le plan par une face.');
 const choices={b:[2,1],a:[2,-1],top:[1,1],bottom:[1,-1],right:[0,1],left:[0,-1]};
 if(!choices[face])throw Error('Face inconnue.');
 const q=timberQuaternion(part),center=v(part.a).add(v(part.b)).multiplyScalar(.5),sizes=[part.width,part.height,v(part.b).distanceTo(v(part.a))];
 const [index,sign]=choices[face],axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)].map(a=>a.applyQuaternion(q));
 const normal=axes[index].clone().multiplyScalar(sign);center.addScaledVector(normal,sizes[index]/2);
 return normalizeWorkplane({...DEFAULT_WORKPLANE,type:'face',origin:center.toArray(),normal:normal.toArray(),u:axes[index===0?2:0].toArray(),lock:true});
}
export function snapMovement(delta,step=1,plane=null,lock=false,snap=true){
 const result=v(delta),frame=workplaneFrame(plane);
 if(lock)result.applyQuaternion(frame.quaternion.clone().invert());
 if(snap)result.toArray().forEach((n,i)=>result.setComponent(i,Math.round(n/step)*step));
 if(lock){result.y=0;result.applyQuaternion(frame.quaternion)}
 return result.toArray().map(x=>Math.round(x*1000)/1000);
}
export function workplaneDropDelta(parts,raw){
 if(!parts.length||parts.some(p=>p.material!=='wood'))throw Error('La pose sur le plan s’applique aux pièces de bois sélectionnées.');
 const {normal,origin}=workplaneFrame(raw);let nearest=Infinity;
 for(const p of parts){const q=timberQuaternion(p),center=v(p.a).add(v(p.b)).multiplyScalar(.5),length=v(p.a).distanceTo(v(p.b));
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const c=new THREE.Vector3(x*p.width/2,y*p.height/2,z*length/2).applyQuaternion(q).add(center);nearest=Math.min(nearest,c.sub(origin).dot(normal))}
 }
 return normal.multiplyScalar(-nearest).toArray();
}
