import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {DEFAULT_PROJECT,normalizeProject,buildProject,makePart} from '../src/engine.js';
import {transformSelection,createPreset,alignSelection,resizePartLength,centerOf} from '../src/editor-ops.js';
import {timberQuaternion} from '../src/geometry.js';
test('rotation libre conserve longueur, section et orientation 3D',()=>{
 let p=normalizeProject({...DEFAULT_PROJECT,mode:'free'});const part=makePart(p,'beam');part.roll=25;p.freeParts=[part];
 const result=transformSelection(p,[part.id],{axis:'z',angle:90,pivot:[0,0,0]});const rotated=result.freeParts[0];
 const expected=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2).multiply(timberQuaternion(part));
 assert.ok(Math.abs(expected.dot(timberQuaternion(rotated)))>1-1e-8);assert.ok(Math.abs(Math.hypot(...rotated.a.map((v,i)=>rotated.b[i]-v))-2000)<.01);
});
test('alignement groupé et espacement régulier conservant les longueurs',()=>{
 let p=createPreset(DEFAULT_PROJECT,'l');const ids=p.freeParts.filter(x=>x.kind==='post').map(x=>x.id);p=alignSelection(p,ids,'x');const xs=p.freeParts.filter(x=>ids.includes(x.id)).map(p=>(p.a[0]+p.b[0])/2);assert.equal(new Set(xs).size,1);
});
test('exemples libres : IDs uniques, liaisons valides, achats physiques',()=>{
 for(const type of ['blank','frame','l','wall','gable','enclos']){const p=createPreset(DEFAULT_PROJECT,type),m=buildProject(p);assert.equal(p.mode,'free');assert.equal(new Set(p.freeParts.map(x=>x.id)).size,p.freeParts.length);assert.ok(m.joints.every(j=>j.valid),type);if(type==='wall')assert.equal(m.stats.wallCount,1);if(type==='blank')assert.equal(m.parts.length,0)}
});

for(const anchor of ['a','center','b'])test(`longueur libre : ${anchor} fixe, direction et section conservées`,()=>{
 const part={id:'F-1',kind:'beam',material:'wood',a:[-123.456789123,987.654321987,-50.00000003],b:[321.987654321,1675.1298734,875.73219812],width:45,height:95,roll:23.456789,groupName:'Pente'},before=structuredClone(part);
 const result=resizePartLength(part,2345.678901234,anchor),oldDirection=new THREE.Vector3(...part.b).sub(new THREE.Vector3(...part.a)).normalize(),newDirection=new THREE.Vector3(...result.b).sub(new THREE.Vector3(...result.a)).normalize();
 assert.deepEqual(part,before,'helper pur');
 assert.notEqual(result,part);assert.notEqual(result.a,part.a);assert.notEqual(result.b,part.b);
 if(anchor==='center')for(let i=0;i<3;i++)assert.ok(Math.abs(centerOf(result)[i]-centerOf(part)[i])<1e-10);
 else assert.deepEqual(result[anchor],part[anchor],'point fixe conservé exactement');
 assert.ok(Math.abs(Math.hypot(...result.a.map((v,i)=>result.b[i]-v))-2345.678901234)<1e-10);
 assert.ok(oldDirection.distanceTo(newDirection)<1e-14);
 assert.equal(result.roll,part.roll);assert.equal(result.width,part.width);assert.equal(result.height,part.height);assert.equal(result.groupName,part.groupName);
});

test('réappliquer la longueur exacte ne déplace aucune coordonnée',()=>{
 const part={a:[.123456789123456,12.3456789123456,-1234.56789123456],b:[987.654321987654,2345.67891234567,90.1234567890123],roll:13.123456789};
 const length=Math.hypot(...part.a.map((v,i)=>part.b[i]-v));
 for(const anchor of ['a','center','b'])assert.deepEqual(resizePartLength(part,length,anchor),part);
});

test('longueur libre : orientations inversées et verticales, paramètres invalides',()=>{
 for(const direction of [[-1,0,0],[0,-1,0],[0,0,1]]){
  const part={a:[1.25,2.75,3.125],b:direction.map((v,i)=>[1.25,2.75,3.125][i]+v*700)};
  for(const anchor of ['a','center','b'])assert.equal(Math.hypot(...resizePartLength(part,1250.5,anchor).a.map((v,i)=>resizePartLength(part,1250.5,anchor).b[i]-v)),1250.5);
 }
 const part={a:[0,0,0],b:[1,1,1]};
 for(const length of [0,-1,NaN,Infinity])assert.throws(()=>resizePartLength(part,length),RangeError);
 assert.throws(()=>resizePartLength(part,1,'unknown'),RangeError);
 assert.throws(()=>resizePartLength({a:[0,0,0],b:[0,0,0]},10),RangeError);
});


test('translation conserve les divisions de grille et les coordonnées fractionnaires',()=>{
 const project=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:[{id:'P-1',kind:'post',material:'wood',a:[3700/7,0,12.12345678],b:[3700/7,2000,12.12345678],width:100,height:100}]});
 const delta=[3700/7,0,0],result=transformSelection(project,['P-1'],{delta});
 assert.equal(result.freeParts[0].a[0],3700*2/7);assert.equal(result.freeParts[0].a[2],12.12345678);
 assert.deepEqual(result.freeParts[0].b.map((v,i)=>v-result.freeParts[0].a[i]),[0,2000,0]);
});
test('un nouveau modèle ne conserve pas les références de cotes de son prédécesseur',()=>{
 const project=normalizeProject({...DEFAULT_PROJECT,drawing:{dimensions:[{id:'DIM-1',type:'length',aPart:'OLD'}]}});
 for(const type of ['blank','frame','enclos'])assert.equal(createPreset(project,type).drawing.dimensions.length,0);
});
