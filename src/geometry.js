import * as THREE from 'three';

// Repère stable : l'épaisseur est normale à la face, même sur les diagonales.
export function timberQuaternion(part) {
  const z = new THREE.Vector3(...part.b).sub(new THREE.Vector3(...part.a)).normalize();
  let x = new THREE.Vector3(-z.z, 0, z.x);
  if (x.lengthSq() < 1e-10) x.set(0, 0, 1);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if(part.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Number(part.roll)*Math.PI/180));
  return q;
}

export function panelCorners(part) {
  if (part.corners) return part.corners;
  const [a,b] = [part.a,part.b];
  const [h1,h2] = part.endHeights || [b[1],b[1]];
  return [[a[0],a[1],a[2]],[b[0],a[1],b[2]],[b[0],h2,b[2]],[a[0],h1,a[2]]];
}
export function panelGeometry(part) {
  const corners = panelCorners(part).flatMap(p => p.map(x=>x/1000));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(corners,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
  geometry.setIndex([0,1,2,0,2,3]); geometry.computeVertexNormals();
  return geometry;
}
