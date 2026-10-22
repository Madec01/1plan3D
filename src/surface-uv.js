import * as THREE from 'three';
import {getFinish,normalizeSurface,partSurface} from './surface-catalog.js';

/** Coordinates in metres, independent of the bounding box dimensions. Only UVs
 * change: snapping, manufacturing dimensions and surface normals stay intact. */
export function applySurfaceUV(geometry, part, appearance){
  const surface=partSurface(part), settings=normalizeSurface(appearance,surface), finish=getFinish(settings.finish);
  const position=geometry.getAttribute('position'), normal=geometry.getAttribute('normal');
  if(!position||!finish)return geometry;
  const uv=new Float32Array(position.count*2), point=new THREE.Vector3();
  const angle=settings.rotation*Math.PI/180, cos=Math.cos(angle),sin=Math.sin(angle);
  const [tileU,tileV]=finish.size.map(n=>n*settings.scale);
  let origin,along,across;
  if(part.kind==='panel'||part.corners){
    origin=new THREE.Vector3().fromBufferAttribute(position,0);
    along=new THREE.Vector3().fromBufferAttribute(position,1).sub(origin).normalize();
    const n=new THREE.Vector3().fromBufferAttribute(normal,0).normalize();
    across=new THREE.Vector3().crossVectors(n,along).normalize();
  }
  geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox;
  for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i);
    let u,v;
    if(origin){
      point.sub(origin);
      [u,v]=surface==='wood'?(finish.grain==='u'?[point.dot(along),point.dot(across)]:[point.dot(across),point.dot(along)]):[point.dot(along),point.dot(across)];
    }else if(surface==='wood'){
      if(Math.abs(normal.getZ(i))>.5){
        // The second material uses the end-grain half of the procedural atlas.
        uv[i*2]=.505+.49*(point.x-min.x)/Math.max(max.x-min.x,.0001);
        uv[i*2+1]=.005+.99*(point.y-min.y)/Math.max(max.y-min.y,.0001);
        continue;
      }
      const across=Math.abs(normal.getX(i))>.5?point.y:point.x;
      [u,v]=finish.grain==='u'?[point.z,across]:[across,point.z];
    }else if(Math.abs(normal.getY(i))>.5){[u,v]=[point.x,-point.z];}
    else if(Math.abs(normal.getX(i))>.5){[u,v]=[-point.z,point.y];}
    else {[u,v]=[point.x,point.y];}
    // Rotate in physical space before dividing by the rectangular tile size.
    uv[i*2]=(u*cos-v*sin)/tileU;
    uv[i*2+1]=(u*sin+v*cos)/tileV;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.userData.surfaceUV='metres';
  if(surface==='wood')geometry.userData.woodGrain='longitudinal';
  return geometry;
}

export function assignTimberEndGrain(geometry){
  const normal=geometry.getAttribute('normal'),index=geometry.index;
  for(const group of geometry.groups){const vertex=index?index.getX(group.start):group.start;group.materialIndex=Math.abs(normal.getZ(vertex))>.5?1:0;}
  return geometry;
}
