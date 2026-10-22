import * as THREE from 'three';
import {timberQuaternion,panelCorners} from './geometry.js';
import {workplaneFrame} from './workplane.js';
import {findObjectSnap} from './object-snapping.js';
import {snapPointToGrid,placementAnchor,resolveAdaptiveGrid} from './adaptive-placement.js';

const validPoint=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const vector=a=>new THREE.Vector3(...a);
export function partPlacementCorners(part){
 if(part.kind==='panel'||part.corners)return panelCorners(part).map(vector);
 const a=vector(part.a),b=vector(part.b),result=[];
 if(part.material==='wall'||part.kind==='wall'){
  const n=b.clone().sub(a).setY(0).normalize();n.set(-n.z,0,n.x);
  for(const p of [a,b])for(const side of [-1,1])for(const up of [0,1])result.push(p.clone().addScaledVector(n,side*(part.wallThickness||part.width)/2).add(new THREE.Vector3(0,up*part.height,0)));
 }else{
  const center=a.clone().add(b).multiplyScalar(.5),q=timberQuaternion(part),length=a.distanceTo(b);
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])result.push(new THREE.Vector3(x*part.width/2,y*part.height/2,z*length/2).applyQuaternion(q).add(center));
 }
 return result;
}

/** Translation seule : base du poteau, centre des autres pièces, face basse sur le plan. */
export function placePartOnWorkplane(part,point,plane,{grid=1,snap=true,gridFrame=null}={}){
 if(!part||!validPoint(part.a)||!validPoint(part.b)||!validPoint(point))throw new Error('Coordonnées de placement invalides.');
 const frame=workplaneFrame(plane),target=vector(point).sub(frame.origin),step=Number.isFinite(grid)&&grid>0?grid:1;
 const u=target.dot(frame.u),v=target.dot(frame.v);target.copy(frame.origin).addScaledVector(frame.u,snap&&!gridFrame?Math.round(u/step)*step:u).addScaledVector(frame.v,snap&&!gridFrame?Math.round(v/step)*step:v);
 if(gridFrame)target.fromArray(snapPointToGrid(target.toArray(),gridFrame));
 const corners=partPlacementCorners(part);if(!corners.length||corners.some(p=>!p.toArray().every(Number.isFinite)))throw new Error('Géométrie de placement invalide.');
 const anchor=vector(placementAnchor(part,frame));
 const delta=target.clone().sub(anchor),distance=Math.min(...corners.map(p=>p.clone().add(delta).sub(frame.origin).dot(frame.normal)));delta.addScaledVector(frame.normal,-distance);
 const move=p=>vector(p).add(delta).toArray(),result=structuredClone(part);result.a=move(part.a);result.b=move(part.b);if(part.corners)result.corners=part.corners.map(move);
 return result;
}

export function translatedPreviewParts(parts,delta){
 return parts.map(part=>({...part,a:part.a.map((n,i)=>n+delta[i]),b:part.b.map((n,i)=>n+delta[i]),...(part.corners?{corners:part.corners.map(p=>p.map((n,i)=>n+delta[i]))}:{})}));
}

/** Keep a proposed correction whole: projection would destroy its exact alignment. */
export function correctionRespectsAxes(delta,plane,{axis='XYZ',space='world',quaternion=[0,0,0,1],lock=plane?.lock}={}){
 if(!validPoint(delta))return false;
 const d=vector(delta),frame=workplaneFrame(plane);
 if(lock&&Math.abs(d.dot(frame.normal))>1e-6)return false;
 if(space==='local')d.applyQuaternion(new THREE.Quaternion(...quaternion).invert());
 return ['X','Y','Z'].every((name,i)=>axis.includes(name)||Math.abs(d.getComponent(i))<1e-6);
}

export function measurePoints(a,b){
 if(!validPoint(a)||!validPoint(b))return null;
 const delta=b.map((n,i)=>n-a[i]);return {a:[...a],b:[...b],delta,distance:Math.hypot(...delta)};
}

/** Une correction est acceptée entière, jamais projetée en perdant le vrai contact. */
export function getLiveSnapSuggestion(project,ids,delta,{axis='XYZ',space='world',quaternion=[0,0,0,1],alt=false,tolerance=50}={}){
 if(alt||!project?.snap||project.mode!=='free'||!Array.isArray(ids)||!ids.length||ids.length>20||!validPoint(delta))return null;
 const selected=new Set(ids),virtual={...project,freeParts:project.freeParts.map(p=>selected.has(p.id)?{...p,a:p.a.map((n,i)=>n+delta[i]),b:p.b.map((n,i)=>n+delta[i]),...(p.corners?{corners:p.corners.map(c=>c.map((n,i)=>n+delta[i]))}:{})}:p)};
 const moving=virtual.freeParts.filter(p=>selected.has(p.id)),targets=virtual.freeParts.filter(p=>!selected.has(p.id));
 return findObjectSnap(moving,targets,{axis,space,quaternion,tolerance,featureTolerance:Math.min(30,tolerance),workplane:project.workplane,lock:!!project.workplane?.lock,enabled:project.objectSnap?.enabled!==false,localGrid:project.objectSnap?.localGrid!==false,gridStep:project.objectSnap?.gridStep||10,strictGrid:project.assistance?.gridSnap?resolveAdaptiveGrid(project):null});
}
