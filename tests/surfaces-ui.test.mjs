import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';
import {normalizeProject} from '../src/engine.js';

test('finitions : sélection multiple, annuler/rétablir, sol indépendant, sauvegarde et schéma',async()=>{
 const w=new Window({url:'https://atelier.test'}),d=w.document;
 Object.assign(globalThis,{window:w,document:d,localStorage:w.localStorage,ResizeObserver:w.ResizeObserver,FormData:w.FormData});
 d.write(await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8'));w.HTMLCanvasElement.prototype.getContext=()=>null;
 const beam=id=>({id,kind:'beam',material:'wood',label:id,a:[0,1000,0],b:[2000,1000,0],width:90,height:145});
 const wall={id:'W',kind:'wall',material:'wall',label:'Mur',a:[0,0,300],b:[3000,0,300],width:200,height:2400,wallSupport:'concrete'};
 w.localStorage.setItem('atelier.project.v4',JSON.stringify(normalizeProject({mode:'free',freeParts:[beam('A'),beam('B'),wall]})));
 const warn=console.warn,error=console.error;console.warn=console.error=()=>{};
 try{await import('../src/app.js');}finally{console.warn=warn;console.error=error;}
 const q=s=>{const el=d.querySelector(s);assert.ok(el,s);return el;};
 const change=(s,value)=>{const el=q(s);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
 try{
  const app=w.Atelier,before=app.getBOM(),parts=app.getProject().freeParts;
  app.selectParts(['A','B']);assert.equal(d.querySelectorAll('[data-surface-target="parts"][data-surface-finish]').length,4);
  q('[data-surface-finish="wood-stained"]').click();
  for(const id of ['A','B'])assert.equal(app.getProject().appearance.parts[id].finish,'wood-stained');
  change('[data-surface-target="parts"][data-surface-setting="scale"]','2');
  change('[data-surface-target="parts"][data-surface-setting="rotation"]','90');
  q('#undo').click();assert.equal(app.getProject().appearance.parts.A.rotation,0);q('#redo').click();assert.equal(app.getProject().appearance.parts.A.rotation,90);
  const beforeInvalid=app.getProject();change('[data-surface-target="parts"][data-surface-setting="rotation"]','999');assert.deepEqual(app.getProject(),beforeInvalid);
  app.selectParts(['W']);q('[data-surface-finish="block"]').click();assert.equal(app.getProject().freeParts[2].wallSupport,'concrete');
  assert.equal(d.querySelectorAll('[data-surface-target="parts"][data-surface-finish="wood-raw"]').length,0);
  const ground=app.getProject().ground,foundation=app.getProject().foundation;
  q('details.display-menu').open=true;
  q('[data-surface-target="ground"][data-surface-finish="pavers"]').click();
  assert.equal(q('details.display-menu').open,true,'le choix du sol conserve le menu des réglages ouvert');
  assert.equal(app.getProject().ground,ground);assert.equal(app.getProject().foundation,foundation);assert.equal(app.getProject().appearance.ground.finish,'pavers');
  q('[data-layer="textures"]').click();assert.equal(app.getProject().appearance.mode,'schematic');assert.equal(q('[data-layer="textures"]').getAttribute('aria-pressed'),'false');
  change('[data-surface-quality]','light');
  const saved=JSON.parse(w.localStorage.getItem('atelier.project.v4'));
  assert.equal(saved.appearance.quality,'light');assert.equal(saved.appearance.mode,'schematic');assert.deepEqual(normalizeProject(saved).appearance,app.getProject().appearance);
  assert.deepEqual(app.getBOM(),before);assert.deepEqual(app.getProject().freeParts,parts);
  app.selectParts(['A','W']);assert.equal(d.querySelectorAll('[data-surface-target="parts"][data-surface-finish]').length,0);
 }finally{await w.happyDOM.close();}
});
