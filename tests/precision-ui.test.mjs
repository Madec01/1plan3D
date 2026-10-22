import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';
import {getPartBounds,measurePartSpacing} from '../src/placement.js';

test('V0.4.1 : navigation, précision, écart, plan de travail et contact proposé',async t=>{
 const window=new Window({url:'https://atelier.test'}),document=window.document;
 for(const [k,v]of Object.entries({window,document,localStorage:window.localStorage,ResizeObserver:window.ResizeObserver,FormData:window.FormData}))globalThis[k]=v;
 document.write((await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8')).replace('/*__SCRIPT__*/',''));
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 const warn=console.warn,error=console.error;console.warn=console.error=()=>{};try{await import('../src/app.js')}finally{console.warn=warn;console.error=error}
 const app=window.Atelier,q=s=>document.querySelector(s),click=s=>{
  const button=q(s);assert.ok(button,s);button.click();
  if(button.matches('[data-add]')){const placement=q('form[data-place-piece]');assert.ok(placement,'placement XYZ');for(const name of ['p0','p1','p2'])placement.elements.namedItem(name).value=String(Number(placement.elements.namedItem(name).value));placement.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(placement.closest('dialog')?.open??false,false)}
 },change=(s,value)=>{const el=q(s);assert.ok(el,s);if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new window.Event('change',{bubbles:true}))},submit=s=>q(s).dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 try{
  await t.test('navigation libre par défaut, bascule et commandes accessibles',()=>{
   assert.equal(q('[data-navigation="free"]').getAttribute('aria-pressed'),'true');click('[data-navigation="orbit"]');assert.equal(localStorage.getItem('atelier.navigation.v1'),'orbit');click('[data-navigation="free"]');assert.match(q('#navigation-hint').textContent,/zoomer au curseur/);
   click('#navigation-help');assert.match(q('#modal-content').textContent,/centre est choisi à chaque nouveau geste/);click('#modal-close');
  });
  click('[data-preset="blank"]');click('[data-load-preset="blank"]');click('[data-add="post"]');click('[data-add="post"]');
  const [first,second]=app.getProject().freeParts.map(p=>p.id);
  await t.test('réglage 0,5 m entre deux poteaux, référence fixe, annulation',()=>{
   app.selectParts([first,second]);const before=app.getProject(),form='[data-editor-form="placement"]';assert.ok(q(form));
   change(form+' [name="distance"]',.5);change(form+' [name="unit"]',1000);change(form+' [name="measure"]','faces');change(form+' [name="axis"]','x');change(form+' [name="side"]',1);submit(form);
   const after=app.getProject();assert.ok(Math.abs(measurePartSpacing(after,[second],first,'x','faces',1)-500)<1e-8);assert.deepEqual(after.freeParts.find(p=>p.id===first),before.freeParts.find(p=>p.id===first));
   click('#undo');assert.deepEqual(app.getProject().freeParts,before.freeParts);click('#redo');
   app.selectParts([second]);click('[data-step="0.1"]');const a=app.getProject().freeParts.find(p=>p.id===second).a[0];click('[data-nudge-axis="x"][data-nudge-sign="1"]');assert.ok(Math.abs(app.getProject().freeParts.find(p=>p.id===second).a[0]-a-.1)<1e-7);
  });
  await t.test('aligner une face de référence et régler un plan en hauteur',()=>{
   app.selectParts([first,second]);const form='[data-editor-form="placement"]';change(form+' [name="operation"]','align');change(form+' [name="axis"]','y');change(form+' [name="feature"]','max');submit(form);
   const parts=app.getProject().freeParts;assert.ok(Math.abs(getPartBounds(parts.find(p=>p.id===first)).max[1]-getPartBounds(parts.find(p=>p.id===second)).max[1])<1e-7);
   app.selectParts([second]);change('[data-editor-form="workplane"] [name="offset"]',500);change('[data-editor-form="workplane"] [name="lock"]',true);submit('[data-editor-form="workplane"]');
   assert.equal(app.getProject().workplane.offset,500);assert.ok(q('[data-nudge-axis="u"]'));click('[data-editor="plane-drop"]');assert.ok(Math.abs(getPartBounds(app.getProject().freeParts.find(p=>p.id===second)).min[1]-500)<1e-8);
   submit('[data-editor-form="plane-face"]');assert.equal(app.getProject().workplane.type,'face');assert.equal(app.getProject().workplane.lock,true);
  });
  await t.test('appui chevron sur poteau intermédiaire, proposé puis appliqué sans liaison implicite',()=>{
   click('[data-preset="blank"]');click('[data-load-preset="blank"]');click('[data-add="post"]');const post=app.getProject().freeParts[0];click('[data-add="beam"]');const beam=app.getProject().freeParts.find(p=>p.kind==='beam');const form='[data-editor-form="piece"]',height=post.b[1]+beam.height/2+25;
   change(form+' [name="a1"]',height);change(form+' [name="b1"]',height);change(form+' [name="a2"]',20);change(form+' [name="b2"]',20);submit(form);
   assert.ok(q('[data-apply-snap]'));assert.match(q('.placement-card').textContent,/Centré|Posé sur/);
   const id=q('[data-apply-snap]').dataset.applySnap;assert.ok(id.includes(post.id));click('[data-apply-snap]');const final=app.getProject(),wood=final.freeParts.find(p=>p.id===beam.id);
   assert.ok(Math.abs(getPartBounds(wood).min[1]-getPartBounds(post).max[1])<.001);assert.equal(wood.a[0],beam.a[0]);assert.equal(wood.b[0],beam.b[0]);assert.equal(final.freeJoints.length,0);assert.ok(Math.abs(wood.a[2])<.001);
  });
 }finally{await window.happyDOM.close()}
});
