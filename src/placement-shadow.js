import * as THREE from 'three';
import {partPlacementCorners} from './scene-interactions.js';
import {workplaneFrame} from './workplane.js';

// The footprint is an orthogonal construction aid, not a light simulation.
// Input and projection stay in millimetres; only the drawn buffers use metres.
const EPS=1e-7;
const vector=p=>p?.isVector3?p.clone():new THREE.Vector3(...p);
const finite=p=>(Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))||(p?.isVector3&&p.toArray().every(Number.isFinite));
function frameFor(plane){
 if(finite(plane?.origin)&&finite(plane?.normal)&&finite(plane?.u)){
  const origin=vector(plane.origin),normal=vector(plane.normal).normalize(),u=vector(plane.u);u.addScaledVector(normal,-u.dot(normal)).normalize();
  if(normal.lengthSq()>.9&&u.lengthSq()>.9)return {origin,normal,u,v:u.clone().cross(normal).normalize()};
 }
 return workplaneFrame(plane);
}
function convexHull(points){
 const sorted=[...points].sort((a,b)=>a.u-b.u||a.v-b.v||Math.abs(b.distance)-Math.abs(a.distance)),unique=[];
 for(const point of sorted){if(!unique.length||Math.abs(point.u-unique.at(-1).u)>EPS||Math.abs(point.v-unique.at(-1).v)>EPS)unique.push(point);else if(Math.abs(point.distance)>Math.abs(unique.at(-1).distance))unique[unique.length-1]=point;}
 if(unique.length<3)return unique;
 const cross=(a,b,c)=>(b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u),lower=[],upper=[];
 for(const p of unique){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=EPS)lower.pop();lower.push(p);}
 for(const p of [...unique].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=EPS)upper.pop();upper.push(p);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}

export function projectPlacementShadow(part,plane={type:'xz'}){
 const frame=frameFor(plane),corners=partPlacementCorners(part).filter(p=>p.toArray().every(Number.isFinite));
 const projected=corners.map(source=>{const local=source.clone().sub(frame.origin),distance=local.dot(frame.normal);return {source:source.toArray(),point:source.clone().addScaledVector(frame.normal,-distance).toArray(),u:local.dot(frame.u),v:local.dot(frame.v),distance};});
 const hull=convexHull(projected);
 return {polygon:hull.map(p=>p.point),rays:hull.filter(p=>Math.abs(p.distance)>1).map(p=>({from:p.source,to:p.point})),normal:frame.normal.toArray(),origin:frame.origin.toArray()};
}

export function createPlacementShadow(parts,plane={type:'xz'},{contact=false}={}){
 const group=new THREE.Group();group.name='placement-shadow';
 const fill=[],outline=[],rays=[],color=contact?0x1b936d:0x087eaf;
 for(const part of parts){
  const projection=projectPlacementShadow(part,plane),normal=new THREE.Vector3(...projection.normal),points=projection.polygon.map(p=>new THREE.Vector3(...p).addScaledVector(normal,1.5).multiplyScalar(.001));
  for(let i=1;i+1<points.length;i++)fill.push(...points[0].toArray(),...points[i].toArray(),...points[i+1].toArray());
  if(points.length>1)for(let i=0;i<(points.length===2?1:points.length);i++)outline.push(...points[i].toArray(),...points[(i+1)%points.length].toArray());
  // Four corner rays are enough to read the height without covering the model.
  const step=Math.max(1,Math.ceil(projection.rays.length/4));
  for(let i=0;i<projection.rays.length;i+=step){const ray=projection.rays[i];rays.push(...ray.from.map(n=>n*.001),...new THREE.Vector3(...ray.to).addScaledVector(normal,1.5).multiplyScalar(.001).toArray());}
 }
 const geometry=positions=>new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 if(fill.length){const mesh=new THREE.Mesh(geometry(fill),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));mesh.name='placement-shadow-fill';mesh.renderOrder=8;group.add(mesh);}
 if(outline.length){const lines=new THREE.LineSegments(geometry(outline),new THREE.LineBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,depthTest:false}));lines.name='placement-shadow-outline';lines.renderOrder=9;group.add(lines);}
 if(rays.length){const lines=new THREE.LineSegments(geometry(rays),new THREE.LineDashedMaterial({color,transparent:true,opacity:.6,depthWrite:false,depthTest:false,dashSize:.06,gapSize:.04}));lines.computeLineDistances();lines.name='placement-shadow-rays';lines.renderOrder=9;group.add(lines);}
 group.traverse(object=>{object.userData.previewOnly=true;object.userData.excludeFromExport=true;object.raycast=()=>{};});
 return group;
}
