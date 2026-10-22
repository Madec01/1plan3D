import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {normalizeProject,addJoint,calculateBOM} from '../src/engine.js';
import {listAttachmentFixings,attachmentFixingSummary,confirmAttachmentFixings,previewAttachmentFixings} from '../src/attachment-fixings.js';
import {attachmentFixingsPanel,readAttachmentFixingSelection,attachmentFixingPreviewHTML} from '../src/attachment-fixings-ui.js';
import {createFixedAttachment,configureBeamAttachment} from '../src/attachments.js';

const wood=(id,x=0)=>({id,label:id,kind:'beam',material:'wood',a:[x,1500,0],b:[x+1000,1500,0],width:45,height:70,foundation:'none'});
const wall=(id,support='concrete',extra={})=>({id,label:id,kind:'wall',material:'wall',a:[0,0,0],b:[2000,0,0],width:200,height:2500,wallSupport:support,...extra});
function fixture(parts=[wood('beam'),wood('post')],attachmentRows=[['beam','post']]) {
  const p=normalizeProject({mode:'free',freeParts:parts,freeJoints:[],margin:0});
  p.attachments=attachmentRows.map(([sourceId,...targets],i)=>({id:`ATT-${i}`,type:'fixed',sourceId,anchors:targets.map(targetId=>({targetId,local:[0,0,0]}))}));
  return p;
}
const selection=(project,recipe='angle')=>listAttachmentFixings(project).filter(r=>r.status==='pending').map(r=>({id:r.id,recipe}));

test('proposer les fixations ne change ni les pièces, ni les liaisons, ni les achats',()=>{
  const p=fixture(),before=JSON.stringify(p),bom=calculateBOM(p);
  const rows=listAttachmentFixings(p);
  assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');
  assert.deepEqual(rows[0].recipes.map(r=>r.id),['angle','screw','bolt','hanger','plate','wood']);
  assert.equal(JSON.stringify(p),before);assert.deepEqual(calculateBOM(p),bom);
  assert.deepEqual(attachmentFixingSummary(p),{total:1,covered:0,pending:1,unsupported:0,conflicts:0,unfixed:1});
});

test('plusieurs coins, attaches inverses et supports intermédiaires ne doublonnent pas une paire',()=>{
  const p=fixture([wood('A'),wood('B'),wood('C')],[['A','B','B'],['B','A']]);
  p.attachments[0].intermediateIds=['C','C','B'];
  const rows=listAttachmentFixings(p);
  assert.equal(rows.length,2);assert.deepEqual(rows.find(r=>r.id==='A|B').attachmentIds,['ATT-0','ATT-1']);
  assert.equal(rows.find(r=>r.targetId==='C').status,'pending');
});

test('les recettes murales respectent le matériau porteur et le déport',()=>{
  const cases=[['concrete',['wall_mechanical','wall_chemical']],['solid_brick',['wall_mechanical','wall_chemical']],['hollow_block',['wall_screen']],['wood',['wall_wood']],['unknown',[]],['plaster',[]],['stone',[]]];
  for(const [support,expected] of cases) {
    const p=fixture([wood('beam'),wall('wall',support)],[['beam','wall']]);
    assert.deepEqual(listAttachmentFixings(p)[0].recipes.map(r=>r.id),expected,support);
  }
  for(const support of ['concrete','hollow_brick','wood']) {
    const p=fixture([wood('beam'),wall('wall',support,{insulation:120,gap:15})],[['beam','wall']]),row=listAttachmentFixings(p)[0];
    assert.deepEqual(row.recipes.map(r=>r.id),['wall_distance']);assert.equal(row.offset,135);
  }
});

test('grillage et support manquant ne reçoivent jamais une recette bois par défaut',()=>{
  const panel={id:'mesh',kind:'panel',material:'mesh',a:[0,0,0],b:[1000,1000,0],width:1,height:1000};
  const p=fixture([wood('beam'),panel],[['mesh','beam'],['beam','missing']]);
  const rows=listAttachmentFixings(p);
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.status==='unsupported' && !r.recipes.length));
  assert.match(rows[0].reason,/Panneau ou grillage/);assert.match(rows[1].reason,/absente/);
  assert.throws(()=>confirmAttachmentFixings(p,[{id:rows[0].id,recipe:'angle'}]),/Panneau ou grillage/);
});

test('un conflit de géométrie bloque la confirmation mais conserve la proposition',()=>{
  const p=fixture();p.attachmentConflicts=[{attachmentId:'ATT-0',sourceId:'beam',message:'Longueur verrouillée'}];
  const row=listAttachmentFixings(p)[0];assert.equal(row.status,'conflict');assert.match(row.reason,/Longueur verrouillée/);
  assert.throws(()=>confirmAttachmentFixings(p,[{id:row.id,recipe:'angle'}]),/corriger/);
});

test('une liaison existante, même inversée, conserve son implantation manuelle',()=>{
  let p=fixture([wood('A'),wood('B'),wood('C')],[['A','B'],['B','C']]);
  const attachments=p.attachments;
  p=addJoint(p,'B','A',{recipe:'angle',fixingLayout:{mode:'manual',points:[{type:'screw',index:0,local:[3,8,5]}]}});p.attachments=attachments;
  const initial=structuredClone(p.freeJoints[0]);
  const row=listAttachmentFixings(p).find(r=>r.id==='A|B');assert.equal(row.status,'covered');assert.equal(row.manual,true);
  const result=confirmAttachmentFixings(p,[{id:'B|C',recipe:'angle'}]);
  assert.deepEqual(result.freeJoints[0],initial);assert.equal(result.freeJoints.length,2);
  assert.throws(()=>confirmAttachmentFixings(p,[{id:'A|B',recipe:'angle'}]),/déjà/);
});

test('la confirmation d’un lot homogène crée un montage par paire et actualise les consommables',()=>{
  const p=fixture([wood('A'),wood('B'),wood('C')],[['A','B'],['A','C']]),selections=selection(p),snapshot=JSON.stringify(p);
  const result=confirmAttachmentFixings(p,[...selections,selections[0]]);
  assert.equal(result.freeJoints.length,2);assert.equal(JSON.stringify(p),snapshot);
  const rows=calculateBOM(result);assert.equal(rows.find(r=>r.id==='joint-angle').required,2);assert.equal(rows.find(r=>r.id==='joint-angle-screws').required,16);
});

test('les attaches V5 réelles survivent à la confirmation et à la réouverture JSON',()=>{
  let p=normalizeProject({mode:'free',freeParts:[wood('A'),wood('B',1000),wood('C',2000),wood('D',3000)],freeJoints:[]});
  p=configureBeamAttachment(p,'A',['B','C'],{intermediateIds:['D']});
  const attachments=structuredClone(p.attachments),selected=selection(p),preview=previewAttachmentFixings(p,selected);
  assert.equal(selected.length,3);assert.equal(preview.addedJoints,3);
  assert.deepEqual(preview.project.attachments,attachments);
  const reopened=normalizeProject(JSON.parse(JSON.stringify(preview.project)));
  assert.deepEqual(reopened.attachments,attachments);assert.ok(listAttachmentFixings(reopened).every(row=>row.status==='covered'));
  let fixed=normalizeProject({mode:'free',freeParts:[wood('A'),wood('B')],freeJoints:[]});
  fixed=createFixedAttachment(fixed,'A','B');
  const confirmed=confirmAttachmentFixings(fixed,selection(fixed));assert.deepEqual(confirmed.attachments,fixed.attachments);
});

test('la validation est atomique et refuse tout lot hétérogène ou devenu invalide',()=>{
  const p=fixture([wood('A'),wood('B'),wood('C')],[['A','B'],['A','C']]),snapshot=JSON.stringify(p);
  assert.throws(()=>confirmAttachmentFixings(p,[{id:'A|B',recipe:'angle'},{id:'A|C',recipe:'bolt'}]),/séparément/);
  assert.throws(()=>confirmAttachmentFixings(p,[{id:'A|B',recipe:'angle'},{id:'A|C',recipe:'wall_chemical'}]),/correspond/);
  assert.throws(()=>confirmAttachmentFixings(p,[{id:'A|B',recipe:'angle'},{id:'missing',recipe:'angle'}]),/existe plus/);
  assert.equal(JSON.stringify(p),snapshot);
  const walls=fixture([wood('A'),wood('B'),wall('w1','concrete',{gap:10}),wall('w2','concrete',{gap:20})],[['A','w1'],['B','w2']]);
  assert.throws(()=>confirmAttachmentFixings(walls,selection(walls,'wall_distance')),/déports/);
});

test('l’aperçu décrit les besoins même si un conditionnement existant suffit',()=>{
  let p=fixture([wood('A'),wood('B'),wood('C')],[['A','C']]);
  const attachments=p.attachments;p=addJoint(p,'A','B','angle');p.attachments=attachments;
  const snapshot=JSON.stringify(p),preview=previewAttachmentFixings(p,[{id:'A|C',recipe:'angle'}]);
  assert.equal(preview.addedJoints,1);assert.equal(JSON.stringify(p),snapshot);
  const screws=preview.bomChanges.find(r=>r.id==='joint-angle-screws');assert.equal(screws.before,8);assert.equal(screws.after,16);
  assert.equal(screws.purchaseBefore,100);assert.equal(screws.purchaseAfter,100);
  assert.match(attachmentFixingPreviewHTML(preview),/Équerre/);
});

test('formulaire : une confirmation individuelle ignore les autres cases et les noms sont échappés',()=>{
  const p=fixture([wood('A'),wood('B'),wood('C')],[['A','B'],['A','C']]);
  p.freeParts[0].label='<img src=x onerror=alert(1)>';
  const win=new Window();win.document.body.innerHTML=attachmentFixingsPanel(p);
  const form=win.document.querySelector('[data-attachment-fixing-form]');assert.ok(form);assert.equal(form.querySelectorAll('img').length,0);
  for(const checkbox of form.querySelectorAll('input[name="contact"]'))checkbox.checked=true;
  const first=form.querySelector('button[name="confirm"]'),all=[...form.querySelectorAll('button[name="confirm"]')].at(-1);
  assert.equal(readAttachmentFixingSelection(form,first).length,1);assert.equal(readAttachmentFixingSelection(form,all).length,2);
  form.querySelector('[data-attachment-fixing-recipe]').value='bolt';assert.equal(readAttachmentFixingSelection(form,first)[0].recipe,'bolt');
  win.happyDOM.abort();
});
