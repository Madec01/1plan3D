import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProject,duplicateParts,removeParts,buildProject,calculateBOM} from '../src/engine.js';
import {transformSelection} from '../src/editor-ops.js';
import {createFixedAttachment,configureBeamAttachment,configurePanelAttachment,detachAttachment,reconcileAttachments,normalizeAttachments} from '../src/attachments.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const nearPoint=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
const piece=(p,id)=>p.freeParts.find(x=>x.id===id);
function fixture(){return normalizeProject({version:4,mode:'free',freeParts:[
  {id:'P1',kind:'post',material:'wood',a:[0,0,0],b:[0,2000,0],width:90,height:90,foundation:'none'},
  {id:'P2',kind:'post',material:'wood',a:[3000,0,0],b:[3000,2000,0],width:90,height:90,foundation:'none'},
  {id:'P3',kind:'post',material:'wood',a:[1500,0,0],b:[1500,2000,0],width:90,height:90,foundation:'none'},
  {id:'B',kind:'beam',material:'wood',a:[0,2035,0],b:[3000,2035,0],width:45,height:70},
  {id:'C',kind:'beam',material:'wood',a:[0,2105,0],b:[1000,2105,0],width:45,height:70},
  {id:'M',kind:'panel',material:'mesh',corners:[[0,100,0],[3000,100,0],[3000,1900,0],[0,1900,0]],width:1,height:1800}
]});}

test('V4 migration uses V5 with opt-in attachments and preserved exact geometry',()=>{
 const p=fixture();assert.equal(p.version,5);assert.deepEqual(p.attachments,[]);assert.equal(p.attachmentSettings.autoAttach,false);assert.equal(p.placementSurface,'ground');assert.equal(piece(p,'B').lengthLocked,true);
 const roundtrip=normalizeProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(roundtrip,p);
});
test('fixed attachment follows a support translation and all descendants once',()=>{
 let p=createFixedAttachment(fixture(),'B','P1');p=createFixedAttachment(p,'C','B');
 const draft=transformSelection(p,['P1'],{delta:[123.456,0,20]}),r=reconcileAttachments(p,draft);
 assert.equal(r.conflicts.length,0);assert.equal(r.changes.length,2);nearPoint(piece(r.project,'B').a,[123.456,2035,20]);nearPoint(piece(r.project,'C').a,[123.456,2105,20]);assert.equal(r.needsConfirmation,false);
 assert.equal(piece(p,'B').a[0],0);
});
test('fixed attachment preserves orientation and length through support rotation',()=>{
 const p=createFixedAttachment(fixture(),'B','P1');
 const r=reconcileAttachments(p,transformSelection(p,['P1'],{axis:'y',angle:90,pivot:[0,0,0]}));
 assert.equal(r.conflicts.length,0);nearPoint(piece(r.project,'B').a,[0,2035,0]);nearPoint(piece(r.project,'B').b,[0,2035,-3000]);near(Math.hypot(...piece(r.project,'B').b.map((n,i)=>n-piece(r.project,'B').a[i])),3000);
});
test('moving a whole attached group does not move its child twice',()=>{
 const p=createFixedAttachment(fixture(),'B','P1'),draft=transformSelection(p,['P1','B'],{delta:[500,0,0]}),r=reconcileAttachments(p,draft);
 assert.equal(r.conflicts.length,0);assert.equal(r.changes.length,0);near(piece(r.project,'B').a[0],500);
});
test('rotating a whole attached group does not break the relationship',()=>{
 const p=createFixedAttachment(fixture(),'B','P1'),draft=transformSelection(p,['P1','B'],{axis:'y',angle:90,pivot:[0,0,0]}),r=reconcileAttachments(p,draft);
 assert.equal(r.conflicts.length,0);assert.equal(r.changes.length,0);
});
test('arbitrary-angle group rotation tolerates only the editor sub-millimetre serialization',()=>{
 const p=createFixedAttachment(fixture(),'B','P1'),draft=transformSelection(p,['P1','B'],{axis:'z',angle:37,pivot:[0,0,0]}),r=reconcileAttachments(p,draft);
 assert.equal(r.conflicts.length,0);assert.equal(r.changes.length,0);
});
test('a wall top-face attachment follows actual wall height with the shared contact frame',()=>{
 let p=fixture();p.freeParts.push({id:'W',kind:'wall',material:'wall',a:[0,0,0],b:[3000,0,0],width:200,height:2500});p=normalizeProject(p);p=createFixedAttachment(p,'B','W',{targetFace:{axis:1,sign:1}});
 const draft=structuredClone(p);piece(draft,'W').height=2800;const r=reconcileAttachments(p,draft);assert.equal(r.conflicts.length,0);near(piece(r.project,'B').a[1],2335);
});
test('moving the dependent alone keeps the requested pose and exposes a persistent conflict',()=>{
 const p=createFixedAttachment(fixture(),'B','P1'),draft=transformSelection(p,['B'],{delta:[20,0,0]}),r=reconcileAttachments(p,draft);
 assert.equal(r.conflicts.length,1);near(piece(r.project,'B').a[0],20);assert.equal(r.project.attachments.length,1);
 const persisted=normalizeProject(r.project),again=reconcileAttachments(persisted,persisted);
 assert.equal(again.conflicts.length,1);near(piece(again.project,'B').a[0],20);assert.ok(buildProject(persisted).warnings.some(w=>w.code.startsWith('attachment-')));
});
test('an attachment cycle is rejected but physical joint cycles remain valid',()=>{
 const p=createFixedAttachment(fixture(),'B','P1');assert.throws(()=>createFixedAttachment(p,'P1','B'),/circulaire/);
 p.freeJoints=[{id:'J1',aPart:'P1',bPart:'B',recipe:'angle'},{id:'J2',aPart:'B',bPart:'P2',recipe:'angle'},{id:'J3',aPart:'P2',bPart:'P1',recipe:'angle'}];
 assert.equal(normalizeProject(p).freeJoints.length,3);
});
test('a second fixed attachment requires an explicit detach or adaptation choice',()=>{
 const p=createFixedAttachment(fixture(),'B','P1');assert.throws(()=>createFixedAttachment(p,'B','P2'),/déjà une attache/);
 assert.equal(createFixedAttachment(detachAttachment(p,'B'),'B','P2').attachments[0].targetId,'P2');
});
test('beam adaptation follows two explicitly chosen endpoints and reports material impact',()=>{
 const p=configureBeamAttachment(fixture(),'B',['P1','P2'],{intermediateIds:['P3']}),r=reconcileAttachments(p,transformSelection(p,['P2'],{delta:[300,0,0]}));
 assert.equal(piece(p,'B').lengthLocked,false);assert.equal(r.conflicts.length,0);assert.equal(r.needsConfirmation,true);near(piece(r.project,'B').a[0],0);near(piece(r.project,'B').b[0],3300);near(r.changes[0].fromLength,3000);near(r.changes[0].toLength,3300);
 assert.ok(calculateBOM(r.project).length);assert.equal(buildProject(r.project).parts.find(p=>p.id==='B').length,3300);
});
test('locking an adaptive beam prevents silent stretching and preserves its endpoints',()=>{
 const p=configureBeamAttachment(fixture(),'B',['P1','P2']);piece(p,'B').lengthLocked=true;
 const r=reconcileAttachments(p,transformSelection(p,['P2'],{delta:[300,0,0]}));assert.equal(r.conflicts.length,1);assert.match(r.conflicts[0].message,/verrouillées/);near(piece(r.project,'B').b[0],3000);
 const unlocked=structuredClone(r.project);piece(unlocked,'B').lengthLocked=false;const preview=reconcileAttachments(r.project,unlocked);assert.equal(preview.conflicts.length,0);assert.equal(preview.needsConfirmation,true);near(piece(preview.project,'B').b[0],3300);
});
test('moving an intermediate post cannot stretch the beam and flags lost contact',()=>{
 const p=configureBeamAttachment(fixture(),'B',['P1','P2'],{intermediateIds:['P3']}),r=reconcileAttachments(p,transformSelection(p,['P3'],{delta:[0,0,250]}));
 assert.deepEqual(piece(r.project,'B').a,piece(p,'B').a);assert.deepEqual(piece(r.project,'B').b,piece(p,'B').b);assert.match(r.conflicts[0].message,/intermédiaire/);
 const reloaded=normalizeProject(JSON.parse(JSON.stringify(r.project)));assert.match(reconcileAttachments(reloaded,reloaded).conflicts[0].message,/intermédiaire/);
});
test('panel follows four explicit corner anchors and updates area on widening',()=>{
 const p=configurePanelAttachment(fixture(),'M',['P1','P2','P2','P1']),r=reconcileAttachments(p,transformSelection(p,['P2'],{delta:[300,0,0]}));
 assert.equal(r.conflicts.length,0);assert.equal(r.needsConfirmation,true);nearPoint(piece(r.project,'M').corners[2],[3300,1900,0]);near(r.changes[0].fromArea,5.4);near(r.changes[0].toArea,5.94);
});
test('panel adaptation rejects a nonplanar frame without warping the panel',()=>{
 let p=fixture();const m=piece(p,'M');p.freeParts=p.freeParts.filter(x=>['M'].includes(x.id));m.corners.forEach((corner,i)=>p.freeParts.push({id:`S${i}`,kind:'post',material:'wood',a:corner,b:[corner[0],corner[1]+100,corner[2]],width:20,height:20,foundation:'none'}));p=normalizeProject(p);p=configurePanelAttachment(p,'M',['S0','S1','S2','S3']);
 const r=reconcileAttachments(p,transformSelection(p,['S2'],{delta:[0,0,250]}));assert.equal(r.conflicts.length,1);assert.match(r.conflicts[0].message,/cadre plat/);assert.deepEqual(piece(r.project,'M').corners,piece(p,'M').corners);
});
test('removing a support keeps the dependent in place and releases its attachment',()=>{
 const p=createFixedAttachment(fixture(),'B','P1'),snapshot=JSON.stringify(p),removed=removeParts(p,['P1']);assert.equal(removed.attachments.length,0);assert.deepEqual(piece(removed,'B').a,piece(p,'B').a);assert.equal(piece(removed,'B').lengthLocked,true);
 const restored=normalizeProject(JSON.parse(snapshot));assert.deepEqual(restored.attachments,p.attachments);
});
test('duplicating all supports duplicates relationships, a lone dependent copy stays independent',()=>{
 const p=createFixedAttachment(fixture(),'B','P1'),all=duplicateParts(p,['P1','B'],[500,0,0]);assert.equal(all.attachments.length,2);const copy=all.attachments[1];assert.notEqual(copy.sourceId,'B');assert.notEqual(copy.targetId,'P1');
 const r=reconcileAttachments(all,transformSelection(all,[copy.targetId],{delta:[50,0,0]}));near(piece(r.project,copy.sourceId).a[0],550);near(piece(r.project,'B').a[0],0);
 const lone=duplicateParts(p,['B']);assert.equal(lone.attachments.length,1);assert.equal(lone.freeParts.at(-1).adaptation,'fixed');
});
test('malformed, missing and duplicate imported attachments are dropped with a warning',()=>{
 const p=createFixedAttachment(fixture(),'B','P1'),a=p.attachments[0];const warnings=[],parsed=normalizeAttachments([a,{...a,id:'A-bad',sourceId:'C',anchors:[{targetId:'missing',local:[0,0,0]}]},{...a,id:'A-duplicate'}],p.freeParts,{warnings});assert.equal(parsed.length,1);assert.equal(warnings.length,2);
 assert.throws(()=>normalizeAttachments(Array(1001).fill(a),p.freeParts),/1 000/);
});
test('normalizing V5 saves fixed, adaptive and conflict metadata without rounding',()=>{
 let p=createFixedAttachment(fixture(),'C','B');p=configureBeamAttachment(p,'B',['P1','P2'],{intermediateIds:['P3']});p=configurePanelAttachment(p,'M',['P1','P2','P2','P1']);
 const normalized=normalizeProject(p),again=normalizeProject(JSON.parse(JSON.stringify(normalized)));assert.deepEqual(again,normalized);assert.equal(again.attachments.length,3);assert.equal(again.importWarnings.length,0);
});
