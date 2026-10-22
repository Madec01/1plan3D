import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {DEFAULT_PROJECT,normalizeProject,buildProject} from '../src/engine.js';
import {editorInspector,editorSidebar,connectionsList,jointInspector} from '../src/editor-ui.js';
import {resizePartLength} from '../src/editor-ops.js';
import {sceneSettingsPanel} from '../src/precision-ui.js';

const project=parts=>normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:parts,freeJoints:[]});
const timber={id:'F-1',label:'Chevron incliné',kind:'beam',material:'wood',a:[.123456789123456,12.3456789123456,-1234.56789123456],b:[987.654321987654,2345.67891234567,90.1234567890123],width:45,height:95,roll:13.123456789,groupName:'Toiture',grouped:true};
const mount=html=>{const window=new Window();window.document.body.innerHTML=html;return window};

test('inspecteur : champs principaux en premier, avancé replié dans le formulaire',async()=>{
 const p=project([{...timber,kind:'post'}]),m=buildProject(p),window=mount(editorInspector(p,m,['F-1'])),d=window.document;
 try{
  const form=d.querySelector('form[data-editor-form="piece"]'),advanced=form.querySelector('.inspector-advanced');
  assert.ok(form);assert.ok(advanced);assert.equal(advanced.open,false);assert.equal(advanced.closest('form'),form);
  assert.equal(d.querySelector('.inspector-head strong').textContent,'Chevron incliné');
  assert.equal(form.elements.lengthAnchor.value,'a');assert.deepEqual([...form.elements.lengthAnchor.options].map(x=>x.value),['a','center','b']);
  for(const name of ['label','length','lengthAnchor','width','height','species','ground','foundation']){assert.ok(form.elements.namedItem(name),name);assert.ok(!form.elements.namedItem(name).closest('.inspector-advanced'),name)}
  for(const name of ['groupName','roll','a0','a1','a2','b0','b1','b2'])assert.equal(form.elements.namedItem(name).closest('.inspector-advanced'),advanced,name);
  assert.equal(d.querySelectorAll('form form').length,0);
  assert.ok(d.querySelector('[data-editor="connect"]'));assert.ok(d.querySelector('[data-editor="delete"]'));assert.ok(d.querySelector('[data-select-group="Toiture"]'));
 }finally{await window.happyDOM.close()}
});

test('inspecteur : FormData restitue les coordonnées, rotation et longueur exactes sans saut',async()=>{
 const p=project([timber]),m=buildProject(p),part=p.freeParts[0],window=mount(editorInspector(p,m,['F-1']));
 try{
  const form=window.document.querySelector('[data-editor-form="piece"]'),data=new window.FormData(form);
  const edited={...part,a:[0,1,2].map(i=>Number(data.get('a'+i))),b:[0,1,2].map(i=>Number(data.get('b'+i))),roll:Number(data.get('roll'))};
  assert.deepEqual(edited,part);assert.equal(Number(data.get('length')),Math.hypot(...part.a.map((v,i)=>part.b[i]-v)));
  for(const anchor of ['a','center','b'])assert.deepEqual(resizePartLength(edited,Number(data.get('length')),anchor),part);
 }finally{await window.happyDOM.close()}
});

test('inspecteur : murs et panneaux gardent leurs champs et coordonnées avancées',async()=>{
 const cases=[
  {part:{...timber,id:'F-2',kind:'wall',material:'wall',height:2500,wallSupport:'hollow_block',wallThickness:200,insulation:120,gap:15},fields:['label','groupName','height','wallSupport','wallThickness','insulation','gap','a0','a1','a2','b0','b1','b2'],coords:['a0','b2']},
  {part:{...timber,id:'F-3',kind:'panel',material:'mesh',corners:[[.123456789,0,0],[1000.987654321,0,0],[1000.987654321,1600.123456789,0],[.123456789,1600.123456789,0]]},fields:['label','groupName','material','width','species',...[0,1,2,3].flatMap(i=>[0,1,2].map(a=>'c'+i+a))],coords:['c00','c31']},
 ];
 for(const {part,fields,coords} of cases){const p=project([part]),window=mount(editorInspector(p,buildProject(p),[part.id]));try{const form=window.document.querySelector('[data-editor-form="piece"]');for(const name of fields)assert.ok(form.elements.namedItem(name),name);for(const name of coords)assert.ok(form.elements.namedItem(name).closest('.inspector-advanced'));assert.equal(window.document.querySelectorAll('form form').length,0)}finally{await window.happyDOM.close()}}
});

test('barre libre et inspecteur conservent précision, plan, écart et commandes de placement',async()=>{
 const p=project([timber,{...timber,id:'F-2',label:'Référence',a:[0,0,0],b:[0,2000,0]}]),m=buildProject(p),window=mount(editorSidebar(p,m,['F-1'])+sceneSettingsPanel(p,['F-1'])+editorInspector(p,m,['F-1']));
 try{
  const d=window.document,q=s=>{const el=d.querySelector(s);assert.ok(el,s);return el};
  for(const kind of ['post','beam','brace','mesh','roof','woodpanel','wall'])q(`[data-add="${kind}"]`);
  q('[data-field="snap"]');q('[data-field="grid"]');for(const step of ['0.1','1','5','10','50'])q(`[data-step="${step}"]`);
  for(const name of ['type','offset','visible','lock'])q(`[data-editor-form="workplane"] [name="${name}"]`);
  for(const name of ['moving','reference','operation','axis','measure','distance','unit','side','feature'])q(`[data-editor-form="placement"] [name="${name}"]`);
  q('[data-editor="preview-placement"]');q('[data-placement-readout]');q('[data-editor-form="plane-face"]');q('[data-editor="plane-view"]');q('[data-editor="plane-drop"]');
  assert.equal(q('.editor-help').open,false);assert.equal(q('.precision-help').open,false);assert.equal(q('.workplane-help').open,false);
  assert.equal(d.querySelectorAll('form form').length,0);
 }finally{await window.happyDOM.close()}
});

test('liaisons : les noms des pièces précèdent les identifiants',async()=>{
 const p=project([timber,{...timber,id:'F-2',label:'Poteau de droite'}]);p.freeJoints=[{id:'J-1',aPart:'F-1',bPart:'F-2',recipe:'angle'}];const m=buildProject(p),window=mount(connectionsList(p,m)+jointInspector(p,m,'J-1'));
 try{const d=window.document;assert.equal(d.querySelector('.joint-row strong').textContent,'Chevron incliné ↔ Poteau de droite');assert.equal(d.querySelector('.inspector-head strong').textContent,'Chevron incliné ↔ Poteau de droite');assert.ok(d.querySelector('[data-joint-pick="J-1"]'));assert.ok(d.querySelector('[data-editor-form="joint"]'))}finally{await window.happyDOM.close()}
});
