import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Window} from 'happy-dom';
import {normalizeTechnicalViewOptions,technicalPartGeometry,sectionTechnicalGeometry,buildTechnicalView} from '../src/technical-views.js';
import {timberQuaternion} from '../src/geometry.js';
import {buildProject,DEFAULT_PROJECT,calculateBOM,normalizeProject} from '../src/engine.js';

const close=(a,b,message='',epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${message}: ${a} ≠ ${b}`);
const beam=(id,a,b,extra={})=>({id,label:id,kind:'beam',material:'wood',a,b,width:100,height:200,roll:0,group:'structure',...extra});
const model=parts=>({parts,joints:[],posts:[]});
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0]},0))/2;
const freeze=object=>{if(object&&typeof object==='object'){Object.freeze(object);for(const v of Object.values(object))freeze(v)}return object};

test('normalisation : offsets exacts, alias formulaire, booléens, IDs étapes stables et limites',()=>{
 const raw={type:'section',view:'normal',section:{axis:'y',offset:2,keep:'negative'},axis:'Z',offset:12.3456789,keep:'positive',exploded:{by:'part',distance:80,offsets:{A:[1.25,2.5,-3]}},assemblySteps:[{id:'s',label:'Première',partIds:['A','A','B']},{id:'s',label:'Deuxième'}],stepIndex:99,includeInDossier:true,includeSteps:true};
 const before=structuredClone(raw),o=normalizeTechnicalViewOptions(raw);assert.deepEqual(raw,before);assert.equal(o.view,'section');assert.equal(o.section.axis,'z');assert.equal(o.section.offset,12.3456789);assert.equal(o.section.keep,'positive');assert.equal(o.stepIndex,1);assert.deepEqual(o.assemblySteps.map(s=>s.id),['s','s-2']);assert.deepEqual(o.assemblySteps[0].partIds,['A','B']);assert.deepEqual(normalizeTechnicalViewOptions(o),o);assert.equal(o.includeSteps,true);
 assert.equal(normalizeTechnicalViewOptions().stepIndex,null);assert.equal(normalizeTechnicalViewOptions({stepIndex:-1}).stepIndex,-1);assert.equal(normalizeTechnicalViewOptions({distance:Infinity}).exploded.distance,300);assert.equal(normalizeTechnicalViewOptions({assemblySteps:Array(90).fill({})}).assemblySteps.length,50);assert.equal(normalizeTechnicalViewOptions({includeSteps:'true'}).includeSteps,false);
});

test('coupe oblique : vraie section OBB avec roll, aire analytique et demi-espace exact',()=>{
 for(const roll of [0,17,45,89]){
  const part=beam('DIAG',[-1000,-1000,0],[1000,1000,0],{roll}),source=technicalPartGeometry(part),cut=sectionTechnicalGeometry(source,{axis:'y',offset:12.34567,keep:'negative'});
  assert.ok(cut.cutPolygon.length>=4);close(cut.cutAreaMm2,100*200/Math.SQRT1_2,'aire de section oblique');
  const inverse=timberQuaternion(part).invert(),halfLength=new THREE.Vector3(...part.a).distanceTo(new THREE.Vector3(...part.b))/2;
  for(const p of cut.cutPolygon){close(p[1],12.34567,'plan exact',1e-10);const local=new THREE.Vector3(...p).applyQuaternion(inverse);assert.ok(Math.abs(local.x)<=50+1e-7);assert.ok(Math.abs(local.y)<=100+1e-7);assert.ok(Math.abs(local.z)<=halfLength+1e-7)}
  for(const p of cut.vertices)assert.ok(p[1]<=12.34567+1e-7);
  const positive=sectionTechnicalGeometry(source,{axis:'y',offset:12.34567,keep:'positive'});for(const p of positive.vertices)assert.ok(p[1]>=12.34567-1e-7);close(positive.cutAreaMm2,cut.cutAreaMm2);
 }
});

test('coupes X Y Z : conservations correctes, volume supprimé et tangence sans fausse hachure',()=>{
 const parts=[beam('X',[-100,0,0],[100,0,0],{width:40,height:60}),beam('Y',[0,-100,0],[0,100,0],{width:40,height:60}),beam('Z',[0,0,-100],[0,0,100],{width:40,height:60})];
 for(const [i,axis]of ['x','y','z'].entries()){
  const result=buildTechnicalView({},model([parts[i]]),{type:'section',section:{axis,offset:0},labels:false,dimensions:false});assert.equal(result.sections.length,1);close(result.sections[0].areaMm2,2400);assert.ok(result.primitives.some(p=>p.role==='hatch'));assert.ok(result.worldParts[0].faces.flat().every(p=>p[i]<=1e-7));
  const empty=buildTechnicalView({},model([parts[i]]),{type:'section',section:{axis,offset:-101}});assert.deepEqual(empty.includedPartIds,[]);assert.match(empty.warnings.join(' '),/Aucune géométrie/);
  const tangent=buildTechnicalView({},model([parts[i]]),{type:'section',section:{axis,offset:100}});assert.equal(tangent.sections.length,0);assert.equal(tangent.primitives.filter(p=>p.role==='hatch').length,0);
 }
});

test('mur tourné et panneau réel : coupe solide et intersection surfacique sans épaisseur inventée',()=>{
 const wall={id:'W',kind:'wall',material:'wall',a:[0,0,0],b:[1000,0,1000],width:200,wallThickness:200,height:2500},panel={id:'M',kind:'panel',material:'mesh',a:[-500,0,0],b:[500,1000,200],corners:[[-500,0,0],[500,0,0],[500,1000,200],[-500,1500,200]],width:1,height:1000};
 const result=buildTechnicalView({},model([wall,panel]),{type:'section',axis:'y',offset:500});const wallCut=result.sections.find(s=>s.partId==='W');close(wallCut.areaMm2,Math.SQRT2*1000*200);assert.ok(result.worldParts.find(p=>p.id==='M').surface);assert.equal(result.sections.some(p=>p.partId==='M'),false);assert.ok(result.primitives.some(p=>p.partId==='M'&&p.role==='surface-section'));assert.equal(result.primitives.some(p=>p.partId==='M'&&p.role==='hatch'),false);assert.match(result.warnings.join(' '),/sans épaisseur/);
 const edges=result.worldParts.find(p=>p.id==='M').cutSegments;assert.ok(edges.flat().every(p=>Math.abs(p[1]-500)<1e-7));
});

test('vue éclatée par groupe ou pièce : translations rigides et traits d’appel',()=>{
 const parts=[beam('A',[-1000,0,0],[-500,0,0],{group:'left'}),beam('B',[-1000,300,0],[-500,300,0],{group:'left'}),beam('C',[500,0,0],[1000,0,0],{group:'right'})],source=freeze(model(parts));
 const grouped=buildTechnicalView({},source,{type:'exploded',distance:333.333,by:'group'});const [a,b,c]=grouped.worldParts;assert.deepEqual(a.translation,b.translation);assert.notDeepEqual(a.translation,c.translation);close(Math.hypot(...a.translation),333.333);assert.equal(grouped.primitives.filter(p=>p.role==='explosion-leader').length,3);
 const custom=buildTechnicalView({},source,{type:'exploded',exploded:{by:'part',distance:10,offsets:{A:[12.123,34.456,-56.789]}}});assert.deepEqual(custom.worldParts[0].translation,[12.123,34.456,-56.789]);
 for(const world of custom.worldParts){const original=technicalPartGeometry(parts.find(p=>p.id===world.id));world.faces.forEach((face,i)=>face.forEach((point,j)=>point.forEach((value,k)=>close(value-original.faces[i][j][k],world.translation[k]))));}
 const assembled=buildTechnicalView({},source,{type:'exploded',assembled:true,distance:999});assert.ok(assembled.worldParts.every(p=>p.translation.every(v=>v===0)));assert.equal(assembled.primitives.some(p=>p.role==='explosion-leader'),false);
});

test('montage cumulatif : ordre, groupes, doublons, références absentes et éclaté stable entre étapes',()=>{
 const parts=[beam('A',[-1000,0,0],[-500,0,0],{group:'left'}),beam('B',[500,0,0],[1000,0,0],{group:'right'}),beam('C',[500,500,0],[1000,500,0],{group:'right'})],options={type:'exploded',assemblySteps:[{id:'first',label:'Bases',partIds:['A']},{id:'second',label:'Suite',groups:['right'],partIds:['A','gone']},{id:'third',label:'Erreur',groups:['missing']}],stepIndex:0};
 const first=buildTechnicalView({},model(parts),options),second=buildTechnicalView({},model(parts),{...options,stepIndex:1});assert.deepEqual(first.includedPartIds,['A']);assert.deepEqual(second.includedPartIds,['A','B','C']);assert.deepEqual(second.currentPartIds,['B','C']);assert.deepEqual(second.worldParts[0].translation,first.worldParts[0].translation);assert.deepEqual(second.steps[1].missingIds,['gone']);assert.deepEqual(second.steps[2].missingGroups,['missing']);assert.match(second.warnings.join(' '),/gone/);assert.match(second.warnings.join(' '),/groupe absent missing/);
 assert.deepEqual(buildTechnicalView({},model(parts),{...options,stepIndex:-1}).includedPartIds,[]);assert.deepEqual(buildTechnicalView({},model(parts),{...options,stepIndex:null}).includedPartIds,['A','B','C']);
});

test('détail de liaison : uniquement les deux pièces et leurs fixations, références manquantes explicites',()=>{
 const project=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:[beam('A',[0,1000,120],[1000,1000,120]),{id:'W',kind:'wall',material:'wall',a:[-500,0,0],b:[1500,0,0],width:200,height:2500},beam('OTHER',[3000,0,0],[4000,0,0])],freeJoints:[{id:'J',aPart:'A',bPart:'W',recipe:'wall_mechanical',anchors:4}]}),built=buildProject(project),result=buildTechnicalView(project,built,{type:'detail',jointId:'J',view:'front'});
 assert.deepEqual(result.includedPartIds,['A','W']);assert.equal(result.primitives.filter(p=>p.role==='fixing').length,4);assert.ok(result.primitives.some(p=>p.role==='dimension'));assert.match(result.warnings.join(' '),/schématiquement/);
 const missing=buildTechnicalView(project,built,{type:'detail',jointId:'unknown'});assert.deepEqual(missing.includedPartIds,[]);assert.match(missing.warnings.join(' '),/introuvable/);
 const selected=buildTechnicalView(project,built,{type:'detail',selectionIds:['A','W','OTHER','missing']});assert.deepEqual(selected.includedPartIds,['A','W']);assert.match(selected.warnings.join(' '),/deux premières/);assert.match(selected.warnings.join(' '),/missing/);
});

test('aucune mutation : modèle, données projet et nomenclature restent identiques',()=>{
 const project=normalizeProject(DEFAULT_PROJECT),built=buildProject(project),bomBefore=calculateBOM(project,built),pBefore=structuredClone(project),mBefore=structuredClone(built);freeze(project);freeze(built);
 for(const options of [{type:'section',axis:'y',offset:850.123,view:'iso'},{type:'exploded',distance:450,by:'part'},{type:'detail',jointId:built.joints[0].id}]){const result=buildTechnicalView(project,built,options);assert.ok(result.svg.startsWith('<svg'));assert.equal(result.units,'mm');}
 assert.deepEqual(project,pBefore);assert.deepEqual(built,mBefore);assert.deepEqual(calculateBOM(project,built),bomBefore);
});

test('SVG/XML échappé, primitives vectorielles autonomes et coordonnées finies',async()=>{
 const id='A<&"\'>';const result=buildTechnicalView({},model([beam(id,[-500,0,0],[500,0,0],{label:'<script>alert(1)</script>'})]),{type:'section',axis:'x',offset:0,selectionIds:[id],assemblySteps:[{id:'s',label:'<img onerror="bad"> & suite',partIds:[id]}],stepIndex:0});
 assert.match(result.svg,/&lt;img/);assert.match(result.svg,/&amp;/);assert.doesNotMatch(result.svg,/<script|<img|onerror="bad"/);assert.doesNotMatch(result.svg,/NaN|Infinity|undefined/);
 const window=new Window(),document=new window.DOMParser().parseFromString(result.svg,'image/svg+xml');assert.equal(document.querySelectorAll('parsererror').length,0);assert.equal(document.documentElement.tagName,'svg');assert.equal(document.querySelectorAll('script,img').length,0);assert.ok(document.querySelectorAll('[data-role="hatch"]').length>0);
 assert.ok(result.primitives.every(p=>['line','polygon','polyline','rect','circle','text'].includes(p.type)));assert.ok(result.primitives.every(p=>!p.stroke||/^#[0-9a-f]{6}$/i.test(p.stroke)));assert.ok(result.bounds.width>result.geometryBounds.width);assert.equal(result.scaleable,true);await window.happyDOM.close();
});

test('groupes manuels : groupName prioritaire, transformations rigides et offsets stables aux étapes',()=>{
 const parts=[
  beam('A',[-1200,0,0],[-700,0,0],{group:'structure',groupName:'Cadre gauche'}),
  beam('B',[-1200,300,0],[-700,300,0],{group:'structure',groupName:'Cadre gauche'}),
  beam('C',[700,0,0],[1200,0,0],{group:'structure',groupName:'Cadre droit'}),
  beam('D',[700,300,0],[1200,300,0],{group:'structure',groupName:'Cadre droit'})
 ],source=freeze(model(parts)),base={type:'exploded',distance:225.5,by:'group',assemblySteps:[{id:'left',label:'Gauche',groups:['Cadre gauche']},{id:'right',label:'Droit',groups:['Cadre droit']}]};
 const full=buildTechnicalView({},source,base),[a,b,c,d]=full.worldParts;
 assert.deepEqual(a.translation,b.translation);assert.deepEqual(c.translation,d.translation);assert.notDeepEqual(a.translation,c.translation);close(Math.hypot(...a.translation),225.5);assert.deepEqual(full.legend.map(p=>p.group),['Cadre gauche','Cadre gauche','Cadre droit','Cadre droit']);assert.ok(full.steps.every(s=>s.missingGroups.length===0));
 const custom={...base,exploded:{distance:225.5,by:'group',offsets:{'Cadre gauche':[10.125,250.25,-20.5],'Cadre droit':[-30.75,50.5,400.125]}}},first=buildTechnicalView({},source,{...custom,stepIndex:0}),second=buildTechnicalView({},source,{...custom,stepIndex:1});
 assert.deepEqual(first.includedPartIds,['A','B']);assert.deepEqual(second.includedPartIds,['A','B','C','D']);assert.deepEqual(second.currentPartIds,['C','D']);
 for(const world of second.worldParts){const expected=custom.exploded.offsets[parts.find(p=>p.id===world.id).groupName];assert.deepEqual(world.translation,expected);const original=technicalPartGeometry(parts.find(p=>p.id===world.id));world.faces.forEach((face,i)=>face.forEach((point,j)=>point.forEach((value,k)=>close(value-original.faces[i][j][k],expected[k]))));if(['A','B'].includes(world.id))assert.deepEqual(world.translation,first.worldParts.find(p=>p.id===world.id).translation)}
});
