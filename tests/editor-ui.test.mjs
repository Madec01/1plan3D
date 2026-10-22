import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';

test('V0.4 : parcours construction libre, assemblages et murs',async t=>{
 const window=new Window({url:'https://atelier.test'}),document=window.document;
 for(const[k,v]of Object.entries({window,document,localStorage:window.localStorage,ResizeObserver:window.ResizeObserver,FormData:window.FormData}))globalThis[k]=v;
 document.write((await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8')).replace('/*__SCRIPT__*/',''));window.HTMLCanvasElement.prototype.getContext=()=>null;
 const warn=console.warn,error=console.error;console.warn=console.error=()=>{};try{await import('../src/app.js')}finally{console.warn=warn;console.error=error}
 const q=s=>{const el=document.querySelector(s);assert.ok(el,s);return el},app=window.Atelier,click=s=>{
  if(q(s)?.matches('[data-add]'))app.selectParts([]); // These fixtures exercise free placement.
  const button=q(s);button.click();
  if(button.matches('[data-add]')){const placement=q('form[data-place-piece]');for(const name of ['p0','p1','p2'])placement.elements.namedItem(name).value=String(Number(placement.elements.namedItem(name).value));placement.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(document.querySelector('form[data-place-piece]')?.closest('dialog')?.open??false,false)}
 };
 const field=(form,key,value)=>{const el=q(`[data-editor-form="${form}"] [name="${key}"]`);el.value=String(value);return el};
 const submit=type=>q(`[data-editor-form="${type}"]`).dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 const change=(form,key,value)=>{field(form,key,value).dispatchEvent(new window.Event('change',{bubbles:true}))};
 const preset=type=>{click(`[data-preset="${type}"]`);click(`[data-load-preset="${type}"]`)};
 await t.test('conversion, édition exacte, duplication multiple et groupes',()=>{
  const count=app.getModel().stats.woodPieces;click('[data-editor="convert"]');assert.equal(app.getProject().mode,'free');assert.equal(app.getModel().stats.woodPieces,count);
  click('[data-pick="P-AV-G"]');assert.ok(app.getSelection().length>1);click('[data-pick="P-AV-G"]');assert.deepEqual(app.getSelection(),['P-AV-G']);const old=app.getProject().freeParts.find(p=>p.id==='P-AV-G');
  field('piece','label','Mon poteau');field('piece','a0',old.a[0]+100);field('piece','b0',old.b[0]+100);field('piece','width',75);field('piece','height',100);field('piece','roll',30);submit('piece');
  const part=app.getProject().freeParts.find(p=>p.id===old.id);assert.equal(part.a[0],old.a[0]+100);assert.equal(part.width,75);assert.equal(part.label,'Mon poteau');
  const before=app.getProject().freeParts.length;field('duplicate','count',2);field('duplicate','spacing',500);submit('duplicate');assert.equal(app.getProject().freeParts.length,before+2);assert.equal(app.getSelection().length,2);
  field('bulk','groupName','Ma travée');field('bulk','species','douglas');submit('bulk');assert.ok(app.getProject().freeParts.filter(p=>app.getSelection().includes(p.id)).every(p=>p.groupName==='Ma travée'&&p.species==='douglas'));
  click('#undo');assert.ok(app.getProject().freeParts.filter(p=>app.getSelection().includes(p.id)).every(p=>p.species==='pin'));click('#redo');
 });
 await t.test('exemples L et toiture double pente, puis scène vide',()=>{
  preset('l');assert.equal(app.getProject().mode,'free');assert.equal(app.getModel().stats.postCount,6);assert.ok(app.getModel().joints.length>=12);
  preset('gable');assert.equal(app.getModel().parts.filter(p=>p.material==='roof').length,2);assert.ok(app.getModel().stats.roofArea>0);
  preset('blank');assert.equal(app.getModel().parts.length,0);assert.equal(app.getBOM().length,0);
 });
 let beamId,postId,jointId,wallId;
 await t.test('ajout de deux pièces et remplacement individuel de leur montage',()=>{
  click('[data-add="post"]');postId=app.getSelection()[0];click('[data-add="beam"]');beamId=app.getSelection()[0];
  click(`[data-multi-pick="${postId}"]`);assert.equal(app.getSelection().length,2);click('[data-editor="connect"]');submit('connect');
  assert.equal(app.getProject().freeJoints.length,1);jointId=app.getProject().freeJoints[0].id;assert.equal(app.getBOM().find(r=>r.id==='joint-angle').required,1);
  change('joint','recipe','hanger');assert.equal(q('[name="screws"]').value,'12');field('joint','connectors',2);submit('joint');assert.equal(app.getBOM().find(r=>r.id==='joint-hanger').required,2);assert.ok(!app.getBOM().some(r=>r.id==='joint-angle'));
  click('[data-joint-compare]');assert.match(q('#modal-content').textContent,/Sabots/);assert.match(q('#modal-content').textContent,/12/);click('[data-use-recipe="screw"]');assert.equal(app.getBOM().find(r=>r.id==='joint-structural-screws').required,2);assert.ok(!app.getBOM().some(r=>r.id==='joint-hanger'));
 });
 await t.test('mur creux, scellement, support modifié et suppression sans orphelin',()=>{
  click('[data-editor="none"]');click('[data-add="wall"]');wallId=app.getSelection()[0];field('piece','wallSupport','hollow_block');field('piece','wallThickness',200);submit('piece');
  click(`[data-multi-pick="${beamId}"]`);click('[data-editor="connect"]');assert.equal(q('[data-editor-form="connect"] [name="recipe"]').value,'wall_screen');submit('connect');
  assert.equal(app.getBOM().find(r=>r.id==='wall-screen').required,4);const wallJoint=app.getProject().freeJoints.find(j=>j.aPart===wallId||j.bPart===wallId);
  field('joint','anchors',6);field('joint','resinDose',20);submit('joint');assert.equal(app.getBOM().find(r=>r.id==='wall-resin-cartridge').required,120);
  click(`[data-pick="${wallId}"]`);assert.ok(app.getSelection().length>1);click(`[data-pick="${wallId}"]`);assert.deepEqual(app.getSelection(),[wallId]);field('piece','wallSupport','concrete');submit('piece');assert.equal(app.getModel().joints.find(j=>j.id===wallJoint.id).status,'incompatible');
  click(`[data-joint-pick="${wallJoint.id}"]`);change('joint','recipe','wall_chemical');submit('joint');assert.ok(!app.getBOM().some(r=>r.id==='wall-screen'));
  click(`[data-pick="${wallId}"]`);click(`[data-pick="${wallId}"]`);assert.deepEqual(app.getSelection(),[wallId]);click('[data-editor="delete"]');assert.ok(!app.getProject().freeJoints.some(j=>j.aPart===wallId||j.bPart===wallId));assert.ok(!app.getBOM().some(r=>r.id.startsWith('wall-')));click('#undo');assert.ok(app.getProject().freeParts.some(p=>p.id===wallId));
 });
 await t.test('copie de recette conserve les identifiants et les extrémités',()=>{
  click('[data-editor="none"]');click('[data-add="beam"]');const other=app.getSelection()[0];click(`[data-multi-pick="${postId}"]`);click('[data-editor="connect"]');submit('connect');const target=app.getProject().freeJoints.at(-1);
  click(`[data-joint-copy="${target.id}"]`);const checkbox=q(`[name="jointIds"][value="${jointId}"]`);checkbox.checked=true;submit('copy-joint');
  const joints=app.getProject().freeJoints;assert.equal(new Set(joints.map(j=>j.id)).size,joints.length);assert.equal(joints.find(j=>j.id===jointId).aPart,beamId);assert.equal(joints.find(j=>j.id===target.id).aPart,other);
 });
 await t.test('panneau éditable et sauvegarde V5 complète',async()=>{
  click('[data-editor="none"]');click('[data-add="mesh"]');const id=app.getSelection()[0];field('piece','c21',1500);field('piece','c31',1500);submit('piece');assert.equal(app.getModel().parts.find(p=>p.id===id).area,1.5);
  const saved=JSON.parse(localStorage.getItem('atelier.project.v4'));assert.equal(saved.version,5);assert.equal(saved.mode,'free');assert.ok(saved.freeParts.some(p=>p.id===id));
  const original=app.getProject();const input=q('#file-input');Object.defineProperty(input,'files',{configurable:true,value:[{size:200,text:async()=>JSON.stringify(original)}]});input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));assert.deepEqual(app.getProject(),original);assert.ok(localStorage.getItem('atelier.project.before-import'));
 });
 await window.happyDOM.close();
});
