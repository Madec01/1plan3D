import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildProject,DEFAULT_PROJECT,normalizeProject} from '../src/model.js';
import {timberQuaternion,panelGeometry,panelCorners} from '../src/geometry.js';
test('géométrie rendue : sections orientées dans le hors tout et porte plane',()=>{
 for(const raw of [DEFAULT_PROJECT,{...DEFAULT_PROJECT,width:1250,postSection:200,beamHeight:180,roofRise:800},{...DEFAULT_PROJECT,depth:1200,width:8000,roofRise:600,gatePosition:.2}]){
  const p=normalizeProject(raw),model=buildProject(p);
  for(const part of model.parts.filter(p=>p.material==='wood')){
   const quat=timberQuaternion(part),mid=new THREE.Vector3(...part.a).add(new THREE.Vector3(...part.b)).multiplyScalar(.5);
   for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
    const v=new THREE.Vector3(x*part.width/2,y*part.height/2,z*part.length/2).applyQuaternion(quat).add(mid);
    assert.ok(Math.abs(v.x)<=p.width/2+.01,part.id+' largeur');assert.ok(Math.abs(v.z)<=p.depth/2+.01,part.id+' profondeur');
   }
  }
 }
});
test('grillage : toiture inclinée et panneaux trapézoïdaux conservent leurs coins',()=>{
 const model=buildProject(DEFAULT_PROJECT),roof=model.parts.find(p=>p.id==='COUVERTURE');
 assert.deepEqual(panelCorners(roof),roof.corners);
 const geo=panelGeometry(roof),positions=geo.getAttribute('position');assert.equal(positions.count,4);
 for(let i=0;i<4;i++)assert.ok(Math.abs(positions.getY(i)-roof.corners[i][1]/1000)<1e-6);
 const side=model.parts.find(p=>p.material==='mesh'&&p.endHeights?.[0]!==p.endHeights?.[1]);
 assert.ok(side);const corners=panelCorners(side);assert.equal(corners[3][1],side.endHeights[0]);assert.equal(corners[2][1],side.endHeights[1]);geo.dispose();
});
