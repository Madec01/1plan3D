import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeProject,DEFAULT_PROJECT} from '../src/engine.js';
import {planeFromPart,normalizeWorkplane,workplaneFrame,snapMovement,workplaneDropDelta} from '../src/workplane.js';
import {timberQuaternion} from '../src/geometry.js';

test('pas précis relatif : millimètre et dixième sans perte de la position de départ',()=>{
 assert.deepEqual(snapMovement([1.44,0,-.26],.1),[1.4,0,-.3]);
 assert.deepEqual(snapMovement([1.1,2.1,3.1],1),[1,2,3]);
 const start=[12.35,42.72,10.01],delta=snapMovement([1.1,0,0],1);assert.deepEqual(start.map((n,i)=>n+delta[i]),[13.35,42.72,10.01]);
 assert.equal(normalizeProject({...DEFAULT_PROJECT,grid:.1}).grid,.1);
 assert.equal(normalizeProject({grid:50}).grid,1,'ancien défaut grossier migré');
 assert.equal(normalizeProject({...DEFAULT_PROJECT,grid:50}).grid,50,'choix explicite conservé');
});
test('plans XY/YZ et verrouillage du déplacement parallèle',()=>{
 for(const type of ['xz','xy','yz']){const p=normalizeWorkplane({type,offset:500,lock:true}),f=workplaneFrame(p),d=snapMovement([101,202,303],1,p,true);assert.ok(Math.abs(new THREE.Vector3(...d).dot(f.normal))<1e-8);assert.ok(Math.abs(f.origin.dot(f.normal)-500)<1e-8)}
 const invalid=normalizeWorkplane({type:'face',normal:[0,0,0],u:[1,0,0],origin:[0,0,0]});assert.equal(invalid.type,'xz');
});
test('plan sur une vraie face tournée, puis pose sans rotation',()=>{
 const part={id:'B',material:'wood',kind:'beam',a:[0,0,0],b:[1200,400,700],width:45,height:95,roll:31};
 const plane=planeFromPart(part,'top'),f=workplaneFrame(plane),q=timberQuaternion(part),expectedNormal=new THREE.Vector3(0,1,0).applyQuaternion(q);
 assert.ok(f.normal.dot(expectedNormal)>.99999999);
 const atFace=new THREE.Vector3(...part.a).add(new THREE.Vector3(...part.b)).multiplyScalar(.5).addScaledVector(expectedNormal,47.5);assert.ok(f.origin.distanceTo(atFace)<1e-7);
 const move=workplaneDropDelta([part],{type:'xz',offset:500}),length=new THREE.Vector3(...part.a).distanceTo(new THREE.Vector3(...part.b)),center=new THREE.Vector3(...part.a).add(new THREE.Vector3(...part.b)).multiplyScalar(.5);let low=Infinity;
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])low=Math.min(low,new THREE.Vector3(x*22.5,y*47.5,z*length/2).applyQuaternion(q).add(center).add(new THREE.Vector3(...move)).y);
 assert.ok(Math.abs(low-500)<1e-7);
 const saved=normalizeProject({...DEFAULT_PROJECT,workplane:plane});assert.equal(saved.workplane.type,'face');assert.ok(workplaneFrame(saved.workplane).normal.dot(expectedNormal)>.99999999);
});
