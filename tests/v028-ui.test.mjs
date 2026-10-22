import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';
import {setupSceneChrome} from '../src/scene-chrome.js';
import {setupMobileUI} from '../src/mobile-ui.js';
import {DEFAULT_PROJECT,normalizeProject} from '../src/engine.js';
const shell=await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8');
function fixture(){
 const w=new Window({url:'https://atelier.test'}),d=w.document;d.write(shell);
 let context={page:'design',mode:'scene',view:'iso',editable:true,selectedCount:1,canResize:false,canLink:false,canUngroup:false};
 d.getElementById('inspector').classList.remove('hidden');d.getElementById('inspector').innerHTML='<input name="exact" value="0.125"><div class="inspector-head"><button data-editor="none">Fermer la sélection</button></div>';
 const ui=setupSceneChrome({document:d,getContext:()=>context});ui.refresh();
 const q=s=>d.querySelector(s),click=s=>q(s).click(),outside=()=>q('#scene').dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}));
 return {w,d,ui,q,click,outside,setContext:next=>{context={...context,...next};ui.refresh();},async close(){ui.destroy();await w.happyDOM.close();}};
}
test('V0.28 dropdowns are exclusive, close outside and after commands, keep layer toggles open',async()=>{
 const e=fixture();try{
  e.click('.project-menu > summary');assert.equal(e.q('.project-menu').open,true);
  e.click('.tools-menu > summary');assert.equal(e.q('.project-menu').open,false);assert.equal(e.q('.tools-menu').open,true);
  e.outside();assert.equal(e.q('.tools-menu').open,false);
  e.click('.display-menu > summary');e.click('[data-layer="mesh"]');e.click('[data-layer="roof"]');assert.equal(e.q('.display-menu').open,true);
  e.click('.view-menu > summary');assert.equal(e.q('.display-menu').open,false);e.click('[data-view="top"]');assert.equal(e.q('.view-menu').open,false);
  e.click('.scene-add-menu > summary');e.click('.scene-add-menu [data-plan-add="mesh"]');assert.equal(e.q('.scene-add-menu').open,false);
 }finally{await e.close();}
});
test('V0.28 Escape dismisses menu before a modeling handler; second Escape reaches that handler',async()=>{
 const e=fixture();try{let cancelled=0;e.d.addEventListener('keydown',()=>cancelled++,true);e.click('.display-menu > summary');
  const escape=()=>e.d.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));escape();assert.equal(cancelled,0);assert.equal(e.q('.display-menu').open,false);escape();assert.equal(cancelled,1);
 }finally{await e.close();}
});
test('V0.28 drawers preserve exact draft nodes, pinning, collapse and focus without deselection',async()=>{
 const e=fixture();try{
  e.ui.show('properties');const input=e.q('[name=exact]');input.value='0.123456789123';e.click('[data-drawer-pin=properties]');e.outside();assert.equal(e.q('#inspector').inert,false);
  e.click('[data-drawer-close=properties]');assert.equal(e.q('#inspector').inert,true);e.ui.show('properties');assert.equal(e.q('[name=exact]'),input);assert.equal(input.value,'0.123456789123');
  let deselected=0;e.d.addEventListener('click',ev=>{if(ev.target.dataset.editor==='none')deselected++;});e.click('#inspector [data-editor=none]');assert.equal(deselected,0);assert.equal(e.q('#inspector').inert,true);
  e.ui.show('pieces');e.ui.show('properties');assert.equal(e.q('#sidebar').inert,true);assert.equal(e.q('#inspector').inert,false);
  e.setContext({page:'connections'});assert.equal(e.q('#sidebar').parentElement,e.q('.app-shell'));assert.equal(e.q('#sidebar').inert,false);assert.equal(input.value,'0.123456789123');
 }finally{await e.close();}
});
test('V0.28 contextual controls match the selection and restore tools when leaving the 3D layout',async()=>{
 const e=fixture();try{
  assert.equal(e.q('[data-tool=resize]').hidden,true);assert.equal(e.q('#editor-toolbar [data-context-action=link]').hidden,true);
  e.setContext({canResize:true});assert.equal(e.q('[data-tool=resize]').hidden,false);
  e.setContext({selectedCount:2,canResize:false,canLink:true,canUngroup:true});for(const action of ['align','group','ungroup','link'])assert.equal(e.q(`#editor-toolbar [data-context-action=${action}]`).hidden,false);
  e.setContext({selectedCount:0});assert.equal(e.q('#editor-toolbar').classList.contains('hidden'),true);
  e.setContext({mode:'plan'});assert.equal(e.q('[data-tool=resize]').hidden,false);assert.equal(e.q('#sidebar').parentElement,e.q('.app-shell'));
 }finally{await e.close();}
});
test('V0.28 mobile sheets own visibility and Escape; desktop drawers do not steal focus or inertness',async()=>{
 const e=fixture();let mobile;try{
  mobile=setupMobileUI({document:e.d,media:{matches:true},getContext:()=>({page:'design',sceneActive:true,selectedCount:1})});e.ui.refresh();assert.equal(mobile.open('properties'),true);const input=e.q('[name=exact]');input.value='27.625';
  e.ui.refresh();assert.equal(e.q('#inspector').inert,false);assert.equal(e.q('#sidebar').inert,true);
  e.d.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(mobile.getState().sheet,null);mobile.open('properties');assert.equal(e.q('[name=exact]'),input);assert.equal(input.value,'27.625');
 }finally{mobile?.destroy();await e.close();}
});
test('V0.28 real app: menu Escape preserves selection; drawer controls never create undo or lose drafts; advice remains accessible',async()=>{
 const w=new Window({url:'https://atelier.test'}),d=w.document;
 Object.assign(globalThis,{window:w,document:d,localStorage:w.localStorage,ResizeObserver:w.ResizeObserver,FormData:w.FormData});d.write(shell);w.HTMLCanvasElement.prototype.getContext=()=>null;
 const project=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:[{id:'A',kind:'post',material:'wood',label:'Poteau A',a:[0,0,0],b:[0,2000,0],width:90,height:90},{id:'B',kind:'post',material:'wood',label:'Poteau B',a:[1000,0,0],b:[1000,2000,0],width:90,height:90}]});w.localStorage.setItem('atelier.project.v4',JSON.stringify(project));
 const warn=console.warn,error=console.error;console.warn=console.error=()=>{};
 try{await import('../src/app.js');}finally{console.warn=warn;console.error=error;}
 try{
  const app=w.Atelier,click=s=>d.querySelector(s).click();app.selectParts(['A']);const original=JSON.stringify(app.getProject());
  click('[data-drawer-toggle=properties]');const name=d.querySelector('[data-editor-form=piece] [name=label]');name.value='Texte en cours';click('[data-drawer-close=properties]');click('[data-drawer-toggle=properties]');assert.equal(d.querySelector('[name=label]'),name);assert.equal(name.value,'Texte en cours');
  click('[data-drawer-close=properties]');click('.view-menu > summary');d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.deepEqual(app.getSelection(),['A']);assert.equal(JSON.stringify(app.getProject()),original);assert.equal(d.querySelector('#undo').disabled,true);
  app.setPage('connections');assert.ok(d.querySelector('#sidebar [data-action=foundation-helper]'));click('#sidebar [data-action=foundation-helper]');assert.equal(d.querySelector('#modal').open,true);assert.match(d.querySelector('#modal-content').textContent,/béton/i);
 }finally{await w.happyDOM.close();}
});
