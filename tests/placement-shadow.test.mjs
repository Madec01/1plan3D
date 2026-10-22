import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {projectPlacementShadow,createPlacementShadow} from '../src/placement-shadow.js';
import {partPlacementCorners} from '../src/scene-interactions.js';
import {withCleanVisuals} from '../src/viewport-visuals.js';
import {normalizeProject,DEFAULT_PROJECT} from '../src/engine.js';
import {sceneSettingsPanel} from '../src/precision-ui.js';
const beam={id:'B',kind:'beam',material:'wood',a:[0,1500,0],b:[2000,1500,0],width:100,height:200};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);

test('footprint projects the actual timber corners to ground in mm, without changing the part',()=>{
 const original=JSON.stringify(beam),shadow=projectPlacementShadow(beam),corners=partPlacementCorners(beam);
 assert.equal(shadow.polygon.length,4);for(const p of shadow.polygon)close(p[1],0);
 close(Math.min(...shadow.polygon.map(p=>p[0])),Math.min(...corners.map(p=>p.x)));close(Math.max(...shadow.polygon.map(p=>p[2])),Math.max(...corners.map(p=>p.z)));
 assert.equal(shadow.rays.length,4);for(const ray of shadow.rays){close(ray.from[0],ray.to[0]);close(ray.from[2],ray.to[2]);assert.ok(ray.from[1]>1500);}
 assert.equal(JSON.stringify(beam),original);
});

test('rotated face and wall projections are on the exact support plane',()=>{
 for(const plane of [{type:'xy',offset:750},{origin:[120,310,-60],normal:[1,1,0],u:[0,0,1]}]){
  const projection=projectPlacementShadow({...beam,roll:23,a:[-500,250,320],b:[1500,1300,270]},plane),normal=new THREE.Vector3(...projection.normal),origin=new THREE.Vector3(...projection.origin);
  assert.ok(projection.polygon.length>=4);for(const point of projection.polygon)close(new THREE.Vector3(...point).sub(origin).dot(normal),0);
  for(const ray of projection.rays){const direction=new THREE.Vector3(...ray.from).sub(new THREE.Vector3(...ray.to));close(direction.clone().cross(normal).length(),0);}
 }
});

test('a vertical mesh viewed edge-on has a line footprint, not a fabricated area',()=>{
 const panel={id:'M',kind:'panel',material:'mesh',a:[0,0,0],b:[2000,1500,0],corners:[[0,0,0],[2000,0,0],[2000,1500,0],[0,1500,0]]};
 const projection=projectPlacementShadow(panel);assert.equal(projection.polygon.length,2);
 const group=createPlacementShadow([panel]);assert.equal(group.getObjectByName('placement-shadow-fill'),undefined);assert.ok(group.getObjectByName('placement-shadow-outline'));
});

test('drawn footprint uses metres and is excluded from every export without losing its state',()=>{
 const scene=new THREE.Scene(),group=createPlacementShadow([beam]);scene.add(group);
 const fill=group.getObjectByName('placement-shadow-fill');fill.geometry.computeBoundingBox();close(fill.geometry.boundingBox.max.x,2);close(fill.geometry.boundingBox.min.y,.0015);
 group.traverse(object=>{assert.equal(object.userData.previewOnly,true);assert.equal(object.userData.excludeFromExport,true);assert.equal(object.raycast(),undefined);});
 assert.throws(()=>withCleanVisuals(scene,()=>{assert.equal(group.parent,null);throw Error('export failed');}),/export failed/);assert.equal(group.parent,scene);assert.equal(group.visible,true);
 const contact=createPlacementShadow([beam],{type:'xz'},{contact:true});assert.notEqual(contact.getObjectByName('placement-shadow-fill').material.color.getHex(),fill.material.color.getHex());
});

test('shadow preference defaults on and survives project save/load when disabled',()=>{
 const p=normalizeProject({...DEFAULT_PROJECT,assistance:{placementShadow:false}}),copy=normalizeProject(JSON.parse(JSON.stringify(p)));assert.equal(copy.assistance.placementShadow,false);
 assert.match(sceneSettingsPanel(copy),/name="placementShadow"/);assert.doesNotMatch(sceneSettingsPanel(copy),/name="placementShadow" checked/);
 assert.equal(normalizeProject(DEFAULT_PROJECT).assistance.placementShadow,true);
});
