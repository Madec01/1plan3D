import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeProject} from '../src/engine.js';
import {findObjectSnap,getObjectSnapCandidates,getContactBounds,objectSnapTranslationIsValid} from '../src/object-snapping.js';
import {getPlacementSuggestions,setPartSpacing,measurePartSpacing} from '../src/placement.js';
import {createContactFaceOverlay,VISUAL_FEEDBACK} from '../src/viewport-visuals.js';
import {resolveAdaptiveGrid} from '../src/adaptive-placement.js';

const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-6,`${a} != ${b}`));
const beam=(id,a,b,extra={})=>({id,label:id,kind:'beam',material:'wood',a,b,width:45,height:100,...extra});
const wall=()=>({id:'wall',kind:'wall',material:'wall',a:[-1000,0,0],b:[1000,0,0],width:200,height:2500,wallSupport:'concrete'});
const panel=(id,z=0)=>({id,kind:'panel',material:'mesh',a:[-500,0,z],b:[500,1000,z],corners:[[-500,0,z],[500,0,z],[500,1000,z],[-500,1000,z]],width:1,height:1000});
const p=parts=>normalizeProject({mode:'free',freeParts:parts,objectSnap:{localGrid:false}});

test('V0.22 : mur réel, mêmes candidats pour glisser et proposer, sans modifier le projet',()=>{
 const source=beam('ledger',[-500,1000,150],[500,1000,150]),project=p([source,wall()]),before=JSON.stringify(project),options={tolerance:50,featureTolerance:30,localGrid:false,workplane:project.workplane,lock:project.workplane.lock};
 const live=getObjectSnapCandidates([project.freeParts[0]],[project.freeParts[1]],options),suggestions=getPlacementSuggestions(project,['ledger'],50);
 assert.ok(live.length&&suggestions.length);near(live[0].delta,[0,0,-27.5]);near(suggestions[0].delta,live[0].delta);assert.equal(suggestions[0].key,live[0].key);assert.equal(live[0].contactDimension,2);assert.equal(live[0].targetFacePolygon.length,4);live[0].targetFacePolygon.forEach(point=>assert.equal(point[2],100));assert.equal(JSON.stringify(project),before);
});

test('V0.22 : mur tourné en plan et distance entre enveloppes à 0,1 mm',()=>{
 const angle=.63,q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle),rotate=point=>new THREE.Vector3(...point).applyQuaternion(q).toArray(),source=beam('ledger',[-500,1000,150],[500,1000,150]),target=wall();
 for(const part of [source,target]){part.a=rotate(part.a);part.b=rotate(part.b)}
 const c=findObjectSnap([source],[target],{tolerance:50,featureTolerance:30,localGrid:false});assert.ok(c);near(c.delta,rotate([0,0,-27.5]));
 const project=p([source,target]),spaced=setPartSpacing(project,['ledger'],'wall',{axis:'z',distance:500.1});assert.ok(Math.abs(measurePartSpacing(spaced,['ledger'],'wall','z')-500.1)<1e-6);assert.deepEqual(spaced.freeParts[1].a,target.a);
});

test('V0.22 : un panneau se pose sur une face et un chevron sur son bord réel',()=>{
 const flat=panel('flat',105),c=findObjectSnap([flat],[wall()],{tolerance:20,localGrid:false});assert.ok(c);near(c.delta,[0,0,-5]);assert.equal(c.contactDimension,2);assert.equal(c.contactArea,1000000);
 const edge=findObjectSnap([beam('post',[560,0,0],[560,1000,0],{width:50,height:100})],[panel('panel')],{tolerance:20,localGrid:false});assert.ok(edge);near(edge.delta,[-10,0,0]);assert.equal(edge.contactDimension,1);assert.equal(edge.contactArea,0);
 const bounds=getContactBounds(panel('panel'));near(bounds.min,[-500,0,0]);near(bounds.max,[500,1000,0]);
});

test('V0.22 : panneau non rectangulaire ou non plan exclu, jamais une face inventée',()=>{
 for(const corners of [[[-500,0,0],[500,0,0],[450,1000,0],[-500,1000,0]],[[-500,0,0],[500,0,0],[500,1000,20],[-500,1000,0]]]){
  const invalid={...panel('invalid'),corners};assert.equal(getContactBounds(invalid),null);assert.equal(findObjectSnap([invalid],[wall()]),null);
 }
});

test('V0.22 : contraintes axe, grille et collision mur/panneau s’appliquent aux mêmes contacts',()=>{
 const source=beam('ledger',[-500,1000,150],[500,1000,150]),target=wall();
 assert.equal(findObjectSnap([source],[target],{tolerance:50,axis:'X',localGrid:false}),null);
 const strictGrid=resolveAdaptiveGrid({workplane:{type:'xz'},assistance:{gridMode:'fixed',gridStep:100}});assert.equal(findObjectSnap([source],[target],{tolerance:50,strictGrid,localGrid:false}),null);
 assert.equal(objectSnapTranslationIsValid([source],[target],[0,0,-100]),false);assert.equal(objectSnapTranslationIsValid([source],[target],[0,0,-27.5]),true);
 const flat=panel('flat',120);assert.equal(objectSnapTranslationIsValid([flat],[target],[0,0,-40]),false);assert.equal(objectSnapTranslationIsValid([flat],[target],[0,0,-20]),true);
 assert.equal(findObjectSnap([source],[target],{alt:true,tolerance:50}),null);
});

test('V0.23 : couleur de sélection distincte et face cible exacte, opaque, temporaire',()=>{
 assert.notEqual(VISUAL_FEEDBACK.selected.color,VISUAL_FEEDBACK.moving.color);
 const points=[[-1000,0,100],[1000,0,100],[1000,2500,100],[-1000,2500,100]],overlay=createContactFaceOverlay(points);assert.ok(overlay);assert.equal(overlay.userData.excludeFromExport,true);const mesh=overlay.getObjectByName('feedback-fill');assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.opacity,1);assert.equal(overlay.getObjectByName('feedback-marker'),undefined);
 near(Array.from(mesh.geometry.attributes.position.array).slice(0,3),[-1,0,.1]);assert.equal(createContactFaceOverlay([[0,0,0],[0,0,0],[0,1,0]]),null);
});
