import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';
import {DEFAULT_PROJECT,normalizeProject} from '../src/engine.js';

test('V0.29 : ajout direct et palette, réglages du plan et retour arrière',async()=>{
 const w=new Window({url:'https://atelier.test'}),d=w.document;
 Object.assign(globalThis,{window:w,document:d,localStorage:w.localStorage,ResizeObserver:w.ResizeObserver,FormData:w.FormData});
 d.write(await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8'));w.HTMLCanvasElement.prototype.getContext=()=>null;
 const project=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:[{id:'A',kind:'post',material:'wood',label:'Poteau',a:[0,0,0],b:[0,2000,0],width:90,height:90}],drawing:{}});
 w.localStorage.setItem('atelier.project.v4',JSON.stringify(project));
 const warn=console.warn,error=console.error;console.warn=console.error=()=>{};
 try{await import('../src/app.js');}finally{console.warn=warn;console.error=error;}
 const q=s=>{const node=d.querySelector(s);assert.ok(node,s);return node;},click=s=>q(s).click();
 const change=(s,value)=>{const el=q(s);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
 try{
  const app=w.Atelier;
  // Desktop capsule: no modal to close. The fallback must start immediately.
  click('.scene-add-menu [data-plan-add="post"]');assert.equal(q('#modal').open,true);assert.ok(q('[data-place-piece]'));
  q('[data-place-piece]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(app.getProject().freeParts.length,2);
  click('#undo');assert.equal(app.getProject().freeParts.length,1);
  app.setWorkspaceMode('plan');
  // Same direct button starts the real plan controller, with no extra close event.
  click('.scene-add-menu [data-plan-add="mesh"]');const editor=app.getPlanEditor();assert.equal(editor.placement.template.material,'mesh');assert.equal(q('#modal').open,false);
  editor.placementClick([700,500],true);assert.equal(app.getProject().freeParts.length,1);assert.equal(editor.confirmPreview(),true);assert.equal(app.getProject().freeParts.length,2);click('#undo');
  // Mobile/plan palette still waits for close, then starts once.
  click('[data-plan-action="add"]');click('#modal [data-plan-add="post"]');await new Promise(r=>setTimeout(r,0));assert.equal(q('#modal').open,false);assert.equal(editor.placement.template.kind,'post');
  editor.placementClick([1500,0],true);editor.confirmPreview();assert.equal(app.getProject().freeParts.length,2);
  const before=JSON.stringify(app.getProject().freeParts);
  change('[data-plan-detail]','none');assert.equal(editor.dimensions.length,0);assert.equal(app.getProject().drawing.showDimensions,false);
  change('[data-plan-detail]','spacing');assert.ok(editor.dimensions.length>0);assert.equal(app.getProject().drawing.autoLevel,'spacing');
  change('.plan-display-tools [data-drawing-field="showGrid"]',true);assert.ok(editor.layers.grid.querySelector('line'));assert.equal(q('.plan-display-tools [data-drawing-field="showGrid"]').checked,true);
  click('#undo');assert.equal(q('.plan-display-tools [data-drawing-field="showGrid"]').checked,false);assert.equal(editor.layers.grid.querySelector('line'),null);
  assert.equal(JSON.stringify(app.getProject().freeParts),before);
  for(const hit of editor.svg.querySelectorAll('.plan-dimension-hit'))assert.equal(hit.getAttribute('stroke'),'none');
 }finally{await w.happyDOM.close();}
});
