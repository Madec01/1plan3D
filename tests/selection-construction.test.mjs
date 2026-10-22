import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProject,DEFAULT_PROJECT,makePart} from '../src/engine.js';
import {getPartBounds} from '../src/placement.js';
import {objectSnapTranslationIsValid} from '../src/object-snapping.js';
import {constructionOnSelection,postBesideSelection} from '../src/selection-construction.js';
import {spacingDefaults,groupSpacingChange,setGroupSpacing} from '../src/group-spacing.js';

const post=(id,x,z=0,extra={})=>({id,kind:'post',material:'wood',label:id,a:[x,0,z],b:[x,2000,z],width:90,height:90,...extra});
const project=parts=>normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:parts,freeJoints:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);

test('a beam sits exactly above the selected posts and spans their outer faces',()=>{
 const p=project([post('A',0),post('B',1000),post('C',500)]),before=structuredClone(p);
 const result=constructionOnSelection(p,['A','B','C'],'beam',makePart(p,'beam'));
 assert.equal(result.parts.length,1);const b=getPartBounds(result.parts[0]);near(b.min[1],2000);near(result.parts[0].a[0],-45);near(result.parts[0].b[0],1045);assert.deepEqual(p,before);
});
test('beam follows a rotated row and makes contact without penetrating unequal-height posts',()=>{
 const p=project([post('A',0,0),post('B',1000,1000,{b:[1000,2400,1000]})]);
 const beam=constructionOnSelection(p,['A','B'],'beam',makePart(p,'beam')).parts[0];
 near(beam.a[0],beam.a[2]);near(beam.b[0],beam.b[2]);assert.ok(beam.b[1]>beam.a[1]);assert.ok(beam.a[1]>2000);
});
test('a selected group receives mesh over its faces, including a rotated surface and a wall',()=>{
 const p=project([post('A',0),post('B',1000)]);
 const panel=constructionOnSelection(p,['A','B'],'mesh',makePart(p,'mesh')).parts[0];
 assert.deepEqual(panel.corners,[[-45,0,45],[1045,0,45],[1045,2000,45],[-45,2000,45]]);
 const rotated=project([post('A',0),post('B',1000,1000)]),mesh=constructionOnSelection(rotated,['A','B'],'mesh',makePart(rotated,'mesh')).parts[0];
 near(mesh.corners[0][0]-mesh.corners[0][2],-90);near(mesh.corners[1][0]-mesh.corners[1][2],-90);
 const wall=project([{id:'W',kind:'wall',material:'wall',a:[0,0,0],b:[2000,0,0],width:200,height:2500}]);
 const face=constructionOnSelection(wall,['W'],'mesh',makePart(wall,'mesh')).parts[0];near(face.corners[0][2],100);near(face.corners[2][1],2500);
 const frame=project([post('A',0),post('B',1000),post('C',1000,1000),post('D',0,1000)]);
 const nextPost=postBesideSelection(frame,['A','B','C','D'],makePart(frame,'post')).parts[0];near(nextPost.a[0],1590);near(nextPost.a[2],0);
 assert.equal(constructionOnSelection(frame,['A','B','C','D'],'mesh',makePart(frame,'mesh')).parts.length,4);
 const beams=constructionOnSelection(frame,['A','B','C','D'],'beam',makePart(frame,'beam')).parts.map((p,i)=>({...p,id:`beam-${i}`}));
 assert.equal(beams.length,4);for(const beam of beams)assert.ok(objectSnapTranslationIsValid([beam],beams,[0,0,0]));
 const roof=constructionOnSelection(frame,['A','B','C','D'],'roof',makePart(frame,'roof')).parts[0];assert.ok(roof.corners.every(c=>c[1]===2000));
 const covered=project([{...roof,id:'R'}]),cover=constructionOnSelection(covered,['R'],'mesh',makePart(covered,'mesh')).parts[0];assert.ok(cover.corners.every(c=>c[1]===2001));
});
test('a new post copies the end post geometry, clears the whole selection, and respects the requested spacing',()=>{
 const p=project([post('A',0),post('B',1000,0,{width:120,height:160,roll:30,groupName:'Cadre',grouped:true})]),template=makePart(p,'post'),before=structuredClone(p);
 const result=postBesideSelection(p,['A','B'],template,{distance:350,measure:'faces'}),part=result.parts[0];
 near(getPartBounds(part).min[0]-getPartBounds(p.freeParts[1]).max[0],350);
 assert.equal(part.width,120);assert.equal(part.height,160);assert.equal(part.roll,30);assert.equal(part.grouped,false);assert.equal(result.sourceId,'B');near(part.b[1]-part.a[1],2000);
 const axes=postBesideSelection(p,['A','B'],template,{distance:600,measure:'axes'}).parts[0];near(axes.a[0],1600);
 const other=postBesideSelection(p,['A','B'],template,{distance:300,side:-1}).parts[0];near(other.a[0],-390);
 assert.deepEqual(p,before);
 assert.throws(()=>postBesideSelection(p,['A'],template,{distance:1,measure:'axes'}),/chevaucher/);
 assert.throws(()=>postBesideSelection(p,['A'],template,{distance:NaN}),/écart/);
 assert.throws(()=>postBesideSelection(p,['A'],template,{distance:100000}),/limites/);
});
test('group spacing moves every member rigidly, including panel corners, and fixes the reference group',()=>{
 const p=project([post('A',0,0,{groupName:'G1',grouped:true}),post('B',1000,0,{groupName:'G1',grouped:true}),post('C',3000,0,{groupName:'G2',grouped:true}),post('D',4000,0,{groupName:'G2',grouped:true})]);
 const before=structuredClone(p),initial=spacingDefaults(p,['A','B','C','D']);assert.equal(initial.moving,'group:G2');assert.equal(initial.reference,'group:G1');
 const options={...initial,distance:500},change=groupSpacingChange(p,['C'],options),next=setGroupSpacing(p,['C'],options);
 assert.deepEqual(change.ids,['C','D']);near(change.current,1910);near(next.freeParts[2].a[0],1590);near(next.freeParts[3].a[0],2590);assert.deepEqual(next.freeParts.slice(0,2),p.freeParts.slice(0,2));assert.deepEqual(p,before);
 assert.throws(()=>setGroupSpacing(p,['A'],{...options,reference:'group:G2'}),/distincts/);
 assert.throws(()=>setGroupSpacing(p,['A'],{...options,distance:-1}),/écart/);
 const panel={id:'M',kind:'panel',material:'mesh',a:[3000,0,0],b:[4000,2000,0],corners:[[3000,0,0],[4000,0,0],[4000,2000,0],[3000,2000,0]],groupName:'G2',grouped:true};
 p.freeParts.push(panel);const withPanel=setGroupSpacing(p,['C'],options);assert.deepEqual(withPanel.freeParts.at(-1).corners,panel.corners.map(c=>[c[0]-1410,c[1],c[2]]));
 panel.corners[2][1]=1750;panel.b=[...panel.corners[2]];
 const withSlopingPanel=setGroupSpacing(p,['C'],options);assert.deepEqual(withSlopingPanel.freeParts.at(-1).corners,panel.corners.map(c=>[c[0]-1410,c[1],c[2]]));
});
