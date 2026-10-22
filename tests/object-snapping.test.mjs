import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {findObjectSnap,getObjectSnapCandidates,objectSnapTranslationIsValid} from '../src/object-snapping.js';
import {timberQuaternion} from '../src/geometry.js';
import {resolveAdaptiveGrid} from '../src/adaptive-placement.js';

const close=(a,b,message='',epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${message}: ${a} ≠ ${b}`);
const vectorClose=(a,b,message='')=>a.forEach((v,i)=>close(v,b[i],message));
const beam=(id,a,b,extra={})=>({id,label:id,material:'wood',kind:'beam',a,b,width:100,height:100,roll:0,...extra});
const post=(id,x=400,z=0,top=2000)=>beam(id,[x,0,z],[x,top,z],{kind:'post',width:90,height:90});
const shifted=(part,d)=>({...part,a:part.a.map((v,i)=>v+d[i]),b:part.b.map((v,i)=>v+d[i])});
const freeze=o=>{if(o&&typeof o==='object'){Object.freeze(o);Object.values(o).forEach(freeze)}return o};
const base=()=>beam('target',[-500,1000,0],[500,1000,0]);

test('poteau intermédiaire : centrage transversal et contact sans recentrer la longueur',()=>{
 const source=beam('beam',[-1000,2053,4],[1000,2053,4],{width:45}),target=post('post');
 const result=findObjectSnap([source],[target],{gridStep:10});assert.ok(result);vectorClose(result.delta,[0,-3,-4]);assert.equal(result.targetId,'post');assert.equal(result.kind,'transverse-center');close(result.contactArea,90*45);assert.equal(result.contactDimension,2);assert.ok(result.guides.length>=2);assert.deepEqual(result.lines,result.guides);vectorClose(result.anchorPoints.target.map((v,i)=>v-result.anchorPoints.source[i]),result.delta);
});

test('centres longitudinaux proches : alignement exact de deux chevrons parallèles',()=>{
 const source=beam('moving',[-493,1103,3],[507,1103,3]);const result=findObjectSnap([source],[base()],{gridStep:10});assert.ok(result);vectorClose(result.delta,[-7,-3,-3]);assert.ok(result.features.some(f=>f.kind==='longitudinal-center'));assert.ok(result.features.some(f=>f.kind==='transverse-center'));
});

test('bouts affleurants à quelques millimètres des deux côtés : priorité sur la grille locale',()=>{
 for(const overhang of [-5,-2.125,2.125,5]){
  const source=beam('moving',[100+overhang,1102,3],[500+overhang,1102,3]),result=findObjectSnap([source],[base()],{gridStep:10});assert.ok(result);assert.equal(result.kind,'end-flush');vectorClose(result.delta,[-overhang,-2,-3]);close(source.b[0]+result.delta[0],500);assert.ok(result.priority<2);
 }
});

test('débord volontaire important : aucun raccourcissement ni recentrage longitudinal',()=>{
 const source=beam('moving',[150,1102,4],[650,1102,4]);for(const localGrid of [false,true]){const result=findObjectSnap([source],[base()],{localGrid,gridStep:10});assert.ok(result);vectorClose(result.delta,[0,-2,-4]);const moved=shifted(source,result.delta);close(moved.b[0]-base().b[0],150);assert.deepEqual(moved.b.map((v,i)=>v-moved.a[i]),source.b.map((v,i)=>v-source.a[i]));}
});

test('poteau sous un chevron intermédiaire : seule la largeur et la hauteur sont ajustées',()=>{
 const source=post('moving',400,4,2003),target=beam('target',[-1000,2050,0],[1000,2050,0],{width:45});const result=findObjectSnap([source],[target],{gridStep:10});assert.ok(result);vectorClose(result.delta,[0,-3,-4]);close(source.a[0]+result.delta[0],400);
});

test('chevrons croisés : contact réel et grille locale discrète loin du milieu de la cible',()=>{
 const target=beam('target',[0,1000,-1000],[0,1000,1000]),source=beam('moving',[-1000,1104,377],[1000,1104,377]);
 const result=findObjectSnap([source],[target],{gridStep:10});assert.ok(result);vectorClose(result.delta,[0,-4,3]);close(source.a[2]+result.delta[2],380);assert.equal(result.contactDimension,2);close(result.contactArea,10000);assert.ok(result.features.some(f=>f.kind==='local-grid'));
 const outsideCapture=findObjectSnap([shifted(source,[0,0,-2])],[target],{gridStep:10,gridTolerance:3});assert.ok(outsideCapture);close(outsideCapture.delta[2],0,'écart de5mm hors capture ne déclenche pas grille');
});

test('grille locale tournée : nœud dans le repère du bois et pas dans les axes du monde',()=>{
 const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.63),rotate=p=>new THREE.Vector3(...p).applyQuaternion(yaw).toArray(),target=base(),source=beam('moving',[-148,1102,0],[452,1102,0]);for(const part of [target,source]){part.a=rotate(part.a);part.b=rotate(part.b)}
 const result=findObjectSnap([source],[target],{gridStep:10});assert.ok(result);vectorClose(result.delta,rotate([-2,-2,0]));assert.ok(Math.abs(result.delta[2])>.5);const projection=new THREE.Vector3(...source.a).add(new THREE.Vector3(...source.b)).multiplyScalar(.5).add(new THREE.Vector3(...result.delta)).sub(new THREE.Vector3(...result.localFrame.origin));const long=result.localFrame.v;close(Math.abs(projection.dot(new THREE.Vector3(...long))),150);
});

test('section tournée : vraie face parallèle, axes locaux et aucun changement de rotation',()=>{
 const target=beam('target',[-750,0,0],[750,0,0],{roll:35}),q=timberQuaternion(target),local=p=>new THREE.Vector3(...p).applyQuaternion(q).toArray(),offset=local([4,103,200]),source=beam('moving',[-250,0,0],[250,0,0],{roll:35});source.a=source.a.map((v,i)=>v+offset[i]);source.b=source.b.map((v,i)=>v+offset[i]);
 const result=findObjectSnap([source],[target],{axis:'XY',space:'local',quaternion:q.toArray(),gridStep:10});assert.ok(result);vectorClose(result.delta,local([-4,-3,0]));assert.equal(result.contactDimension,2);assert.equal(source.roll,35);assert.equal(findObjectSnap([source],[target],{axis:'X',space:'local',quaternion:q.toArray(),localGrid:false}),null);
});

test('axe monde contraint oblique : résout le contact sans correction hors axe ni projection erronée',()=>{
 const target=beam('target',[-750,0,0],[750,0,0],{roll:35}),q=timberQuaternion(target),normal=new THREE.Vector3(0,1,0).applyQuaternion(q),offset=normal.clone().multiplyScalar(103),source=shifted(beam('moving',[-250,0,0],[250,0,0],{roll:35}),offset.toArray());
 const result=findObjectSnap([source],[target],{axis:'Y',localGrid:false,featureTolerance:0});assert.ok(result);close(result.delta[0],0);close(result.delta[2],0);close(new THREE.Vector3(...result.delta).dot(normal),-3);assert.equal(objectSnapTranslationIsValid([source],[target],result.delta,{axis:'Y'}),true);
 assert.equal(findObjectSnap([source],[target],{axis:'XY',workplane:{type:'xz',lock:true},localGrid:false,featureTolerance:0}),null);
});

test('section tournée sur poteau : contact d’arête réel sans rotation automatique',()=>{
 const target=post('target',400),radius=(100+45)/2*Math.SQRT1_2,source=beam('moving',[-1000,2000+radius+3,3],[1000,2000+radius+3,3],{width:45,roll:45}),before=structuredClone(source),result=findObjectSnap([source],[target],{gridStep:10});assert.ok(result);vectorClose(result.delta,[0,-3,-3]);assert.equal(result.contactDimension,1);assert.deepEqual(source,before);close(result.contactArea,0);
});

test('groupe : translation rigide, aucun autre bois ne doit être pénétré par une pièce secondaire',()=>{
 const a=beam('a',[-1000,2053,0],[1000,2053,0]),b=beam('b',[2500,2053,0],[3500,2053,0]),target=post('post');const result=findObjectSnap([a,b],[target],{localGrid:false});assert.ok(result);vectorClose(result.delta,[0,-3,0]);const moved=[a,b].map(p=>shifted(p,result.delta));assert.deepEqual(moved[1].a.map((v,i)=>v-moved[0].a[i]),b.a.map((v,i)=>v-a.a[i]));
 const blocker=beam('blocker',[2500,1952,0],[3500,1952,0]);assert.equal(objectSnapTranslationIsValid([a,b],[target,blocker],[0,0,0]),true);assert.equal(objectSnapTranslationIsValid([a,b],[target,blocker],result.delta),false);assert.equal(findObjectSnap([a,b],[target],{localGrid:false,collisionParts:[target,blocker]}),null);
});

test('grille globale stricte : contact exact autorisé seulement si son ancre reste sur un nœud',()=>{
 const source=beam('moving',[97,1102,3],[497,1102,3]),target=base(),strictGrid=resolveAdaptiveGrid({workplane:{type:'xz'},assistance:{gridMode:'fixed',gridStep:100}});
 const compatible=findObjectSnap([source],[target],{gridStep:10,strictGrid});assert.ok(compatible);vectorClose(compatible.delta,[3,-2,-3]);
 const impossible=resolveAdaptiveGrid({workplane:{type:'xz'},assistance:{gridMode:'fixed',gridStep:200}});assert.equal(findObjectSnap([source],[target],{gridStep:10,strictGrid:impossible}),null);
});

test('capture bornée et Alt : aucun saut à distance, aucune déformation, aucune mutation',()=>{
 const source=freeze(beam('moving',[-493,1103,3],[507,1103,3])),target=freeze(base()),before=JSON.stringify({source,target}),options=freeze({gridStep:10,tolerance:20});
 const candidates=getObjectSnapCandidates([source],[target],options);assert.ok(candidates.length);assert.ok(candidates.every(c=>c.distance<=20+1e-7));assert.equal(JSON.stringify({source,target}),before);assert.equal(findObjectSnap([source],[target],{...options,alt:true}),null);assert.equal(findObjectSnap([source],[target],{enabled:false}),null);assert.equal(findObjectSnap([shifted(source,[0,30,0])],[target],options),null);assert.deepEqual(getObjectSnapCandidates([],[],{}),[]);
 assert.equal(findObjectSnap([{...source,kind:'panel'}],[target]),null);assert.equal(findObjectSnap([{...source,width:NaN}],[target]),null);
});

test('hystérésis limitée : garde la cible proche précédente sans la retenir hors capture',()=>{
 const source=beam('moving',[-1000,2053,0],[1000,2053,0]),targets=[post('A',-3),post('B',3)],candidates=getObjectSnapCandidates([source],targets,{localGrid:false}),previous=candidates.find(c=>c.targetId==='B'&&c.featureCount===candidates[0].featureCount);assert.ok(previous);const retained=findObjectSnap([source],targets,{localGrid:false,previousKey:previous.key,hysteresis:2});assert.equal(retained.key,previous.key);const away=findObjectSnap([shifted(source,[200,0,0])],targets,{localGrid:false,previousKey:previous.key});assert.ok(!away||away.key!==previous.key);
});

test('groupe mixte : le bois pilote l’accroche, le panneau garde son décalage relatif',()=>{
 const wood=beam('wood',[-1000,2053,4],[1000,2053,4],{width:45}),panel={id:'panel',kind:'panel',material:'mesh',a:[-800,2100,4],b:[800,2900,4],corners:[[-800,2100,4],[800,2100,4],[800,2900,4],[-800,2900,4]]},before=structuredClone(panel),target=post('post');
 const result=findObjectSnap([panel,wood],[target],{gridStep:10});assert.ok(result);vectorClose(result.delta,[0,-3,-4]);assert.equal(result.sourceId,'wood');assert.equal(objectSnapTranslationIsValid([panel,wood],[target],result.delta),true);const moved=[panel,wood].map(p=>shifted(p,result.delta));assert.deepEqual(moved[0].a.map((v,i)=>v-moved[1].a[i]),panel.a.map((v,i)=>v-wood.a[i]));assert.deepEqual(panel,before);
});

test('appui plus large : centre transversal prioritaire devant un bord plus proche dans la capture',()=>{
 const target=post('post'),source=beam('moving',[-1000,2053,20],[1000,2053,20],{width:45}),options={tolerance:50,featureTolerance:30,gridStep:10};
 const candidates=getObjectSnapCandidates([source],[target],options),result=candidates[0],edge=candidates.find(c=>c.features.some(f=>f.kind==='edge-flush'));
 assert.ok(edge,'le bord à22,5mm reste un candidat géométriquement valable');assert.ok(edge.distance<result.distance);assert.equal(result.centerTransverseScore,1);vectorClose(result.delta,[0,-3,-20]);assert.equal(result.kind,'transverse-center');
 const retained=findObjectSnap([source],[target],{...options,previousKey:edge.key,hysteresis:10});assert.equal(retained.centerTransverseScore,1);vectorClose(retained.delta,[0,-3,-20]);
});

test('hors capture du centre transversal : décalage volontaire préservé, bord presque exact encore accessible',()=>{
 const target=post('post'),source=beam('moving',[-1000,2053,40],[1000,2053,40],{width:45}),result=findObjectSnap([source],[target],{tolerance:50,featureTolerance:30,gridStep:10});assert.ok(result);close(result.delta[2],0);close(source.a[2]+result.delta[2],40);assert.equal(result.centerTransverseScore,0);
 const edgeSource=shifted(source,[0,0,-16]),edge=findObjectSnap([edgeSource],[target],{tolerance:50,featureTolerance:20,localGrid:false});assert.ok(edge);close(edge.delta[2],-1.5);close(edgeSource.a[2]+edge.delta[2],22.5);assert.ok(edge.features.some(f=>f.kind==='edge-flush'));assert.equal(edge.centerTransverseScore,0);
});

test('voisin non ciblé : la broadphase garde un obstacle atteint uniquement après le centrage',()=>{
 const source=beam('moving',[-1000,2053,20],[1000,2053,20],{width:45}),target=post('post'),obstacle=beam('obstacle',[0,2050,-28],[1000,2050,-28],{width:20,height:40}),options={tolerance:50,featureTolerance:30,gridStep:10,collisionParts:[target,obstacle]};
 assert.equal(objectSnapTranslationIsValid([source],[target],[0,0,0],options),true);assert.equal(objectSnapTranslationIsValid([source],[target],[0,-3,-20],options),false);
 const near=findObjectSnap([source],[target],options);assert.ok(near);assert.equal(near.centerTransverseScore,0);assert.equal(objectSnapTranslationIsValid([source],[target],near.delta,options),true);
 const distant=Array.from({length:1000},(_,i)=>post(`far-${i}`,100000+i*3000,100000)),large=findObjectSnap([source],[target],{...options,collisionParts:[...options.collisionParts,...distant]});assert.ok(large);assert.equal(large.key,near.key);vectorClose(large.delta,near.delta);
});

test('validation indépendante : collision à destination même si le déplacement dépasse la capture',()=>{
 const source=beam('moving',[-500,0,0],[500,0,0]),target=shifted(beam('far-target',[-500,0,0],[500,0,0]),[10000,0,0]),options={tolerance:1};
 assert.equal(objectSnapTranslationIsValid([source],[target],[0,0,0],options),true);assert.equal(objectSnapTranslationIsValid([source],[target],[10000,0,0],options),false);assert.equal(objectSnapTranslationIsValid([source],[target],[9500,0,0],options),false);assert.equal(objectSnapTranslationIsValid([source],[target],[9000,0,0],options),true,'contact de bouts exact à9000mm, sans pénétration');assert.equal(objectSnapTranslationIsValid([source],[target],[15000,0,0],options),true);
});
