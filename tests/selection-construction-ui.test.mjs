import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';
import {normalizeProject,DEFAULT_PROJECT} from '../src/engine.js';
import {getPartBounds} from '../src/placement.js';

test('selected construction: groups, spacing, direct additions, intermediate posts, cancellation and undo',async t=>{
 const w=new Window({url:'https://atelier.test'}),d=w.document;
 Object.assign(globalThis,{window:w,document:d,localStorage:w.localStorage,ResizeObserver:w.ResizeObserver,FormData:w.FormData});
 d.write(await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8'));w.HTMLCanvasElement.prototype.getContext=()=>null;
 const post=(id,x,groupName)=>({id,label:id,kind:'post',material:'wood',a:[x,0,0],b:[x,2000,0],width:90,height:90,groupName,grouped:true});
 const initial=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:[post('A',0,'Cadre A'),post('B',1000,'Cadre A'),post('C',4000,'Cadre B'),post('D',5000,'Cadre B')],freeJoints:[],appearance:{parts:{B:{finish:'wood-weathered'}}}});
 w.localStorage.setItem('atelier.project.v4',JSON.stringify(initial));
 const warn=console.warn,error=console.error;console.warn=console.error=()=>{};try{await import('../src/app.js');}finally{console.warn=warn;console.error=error;}
 const app=w.Atelier,q=s=>{const n=d.querySelector(s);assert.ok(n,s);return n;},click=s=>q(s).click();
 const change=(form,name,value)=>{const el=q(form).elements.namedItem(name);el.value=String(value);el.dispatchEvent(new w.Event('change',{bubbles:true}));};
 const submit=form=>q(form).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const reset=()=>{click('#undo');assert.deepEqual(app.getProject(),initial);};
 try{
  await t.test('quick duplication copies an entire group independently and multiple copies stay independent',()=>{
   app.selectParts(['A','B']);click('#context-actions-open');assert.equal(q('.context-primary [data-context-action="duplicate"]').textContent,'Dupliquer le groupe');click('.context-primary [data-context-action="duplicate"]');
   const copies=app.getProject().freeParts.slice(4);assert.equal(copies.length,2);assert.equal(copies[0].groupName,copies[1].groupName);assert.notEqual(copies[0].groupName,'Cadre A');assert.equal(copies[1].a[0]-copies[0].a[0],1000);reset();
   app.selectParts(['A','B']);change('[data-editor-form="duplicate"]','count',2);change('[data-editor-form="duplicate"]','spacing',2000);submit('[data-editor-form="duplicate"]');
   const repeated=app.getProject().freeParts.slice(4);assert.equal(new Set(repeated.map(p=>p.groupName)).size,2);assert.deepEqual(repeated.map(p=>p.a[0]),[2000,3000,4000,5000]);reset();
  });
  await t.test('spacing moves complete groups, persists exact dimensions, and has one undo step',()=>{
   app.selectParts(['A','B','C','D']);click('#editor-toolbar [data-context-action="spacing"]');
   assert.equal(q('[data-group-spacing]').elements.moving.value,'group:Cadre B');change('[data-group-spacing]','distance','0,5 m');assert.deepEqual(app.getProject(),initial);submit('[data-group-spacing]');
   assert.equal(q('#modal').open,false);const p=app.getProject();assert.deepEqual(p.freeParts.slice(0,2),initial.freeParts.slice(0,2));assert.equal(p.freeParts[2].a[0],1590);assert.equal(p.freeParts[3].a[0],2590);assert.deepEqual(JSON.parse(w.localStorage.getItem('atelier.project.v4')),p);reset();
  });
  await t.test('beam and mesh are added immediately to the selected group, with exact fit',()=>{
   app.selectParts(['A','B']);click('.scene-add-menu [data-plan-add="beam"]');const p=app.getProject(),beam=p.freeParts.at(-1);
   assert.equal(p.freeParts.length,5);assert.equal(q('#modal').open,false);assert.equal(beam.groupName,'Cadre A');assert.equal(getPartBounds(beam).min[1],2000);assert.deepEqual(new Set(app.getSelection()),new Set(['A','B',beam.id]));
   click('.scene-add-menu [data-plan-add="mesh"]');const mesh=app.getProject().freeParts.at(-1);assert.equal(mesh.material,'mesh');assert.equal(mesh.groupName,'Cadre A');assert.deepEqual(mesh.corners,[[-45,0,45],[1045,0,45],[1045,getPartBounds(beam).max[1],45],[-45,getPartBounds(beam).max[1],45]]);click('#undo');assert.deepEqual(app.getProject(),p);reset();
  });
  await t.test('post asks for a distance, cancellation is lossless, and placement inherits the end post',()=>{
   app.selectParts(['A','B']);click('.scene-add-menu [data-plan-add="post"]');assert.ok(q('[data-selected-post]'));change('[data-selected-post]','distance','600 mm');assert.deepEqual(app.getProject(),initial);click('[data-selected-post] [data-context-cancel]');assert.deepEqual(app.getProject(),initial);
   click('.scene-add-menu [data-plan-add="post"]');change('[data-selected-post]','distance','0,5 m');submit('[data-selected-post]');const p=app.getProject(),post=p.freeParts.at(-1);assert.equal(post.a[0],1590);assert.equal(post.b[1],2000);assert.equal(post.width,90);assert.equal(post.grouped,false);assert.deepEqual(p.appearance.parts[post.id],initial.appearance.parts.B);reset();
  });
  await t.test('intermediate posts are reachable directly, with middle and equal-spacing presets',()=>{
   app.selectParts(['A','B']);click('#editor-toolbar [data-context-action="between"]');const form=q('[data-between-form]');assert.equal(form.elements.referenceA.value,'A');assert.equal(form.elements.referenceB.value,'B');click('[data-between-preset="1"]');submit('[data-between-form]');assert.equal(app.getProject().freeParts.at(-1).a[0],500);reset();
   app.selectParts(['A','B']);click('.scene-add-menu [data-assist-action="between"]');click('[data-between-preset="2"]');change('[data-between-form]','count',3);submit('[data-between-form]');assert.deepEqual(app.getProject().freeParts.slice(4).map(p=>p.a[0]),[250,500,750]);assert.deepEqual(app.getProject().freeParts.slice(0,4),initial.freeParts);reset();
  });
  await t.test('free placement remains available with a selection and the plan uses the same automatic placement',async()=>{
   app.selectParts(['A','B']);click('.scene-add-menu [data-plan-add="post"]');click('[data-free-add="post"]');await new Promise(r=>setTimeout(r,0));assert.ok(q('[data-place-piece]'));click('#modal-close');assert.deepEqual(app.getProject(),initial);
   app.setWorkspaceMode('plan');app.selectParts(['A','B']);click('[data-plan-action="add"]');click('#modal [data-plan-add="beam"]');await new Promise(r=>setTimeout(r,0));assert.equal(app.getProject().freeParts.length,5);assert.equal(app.getPlanEditor().placement,null);reset();
  });
 }finally{await w.happyDOM.close();}
});
