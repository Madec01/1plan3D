import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {normalizeProject,buildProject} from '../src/engine.js';
import {editorSidebar,editorInspector} from '../src/editor-ui.js';
import {sceneSettingsPanel} from '../src/precision-ui.js';
import {activateInspectorTab,inspectorTabKeydown,projectTitleEditor,workspaceStyles} from '../src/workspace-ui.js';
import {contextMenuHTML} from '../src/context-ui.js';
const post=(id,x)=>({id,kind:'post',material:'wood',label:'Poteau '+id,a:[x,0,0],b:[x,2000,0],width:90,height:90});
const project=()=>normalizeProject({mode:'free',freeParts:[post('A',0),post('B',3700)],assistance:{gridMode:'adaptive',gridDivisions:8,gridReference:'pair',gridA:'A',gridB:'B'}});
const mount=html=>{const w=new Window();w.document.body.innerHTML=html;return w};

test('V0.21 sidebar prioritizes pieces; all settings and presets remain in scene panel',async()=>{
 const p=project(),w=mount(`<aside>${editorSidebar(p,buildProject(p),['A'])}</aside><section>${sceneSettingsPanel(p,['A','B'])}</section>`),d=w.document;
 try{
  const sidebar=d.querySelector('aside');assert.equal(sidebar.querySelectorAll('[data-pick]').length,2);assert.equal(sidebar.querySelectorAll('[data-add]').length,7);assert.equal(sidebar.querySelector('[data-field]'),null);assert.equal(sidebar.querySelector('[data-object-snap]'),null);assert.equal(sidebar.querySelector('[data-assistance-settings]'),null);
  assert.equal(d.querySelectorAll('[data-assistance-settings]').length,1);assert.equal(d.querySelectorAll('[name="gridStep"]').length,1);assert.ok(d.querySelector('[data-object-snap="gridStep"]'));assert.ok(d.querySelector('[data-preset="blank"]'));assert.ok(d.querySelector('[data-editor-form="workplane"]'));
  for(const step of ['0.1','1','10','50','100'])assert.ok(d.querySelector(`[data-step="${step}"]`));
  assert.deepEqual([...d.querySelector('[data-placement-surface]').options].map(o=>o.value),['ground','face','workplane']);assert.equal(d.querySelector('[data-placement-surface]').value,'ground');
  assert.match(d.querySelector('.adaptive-grid-readout').textContent,/462,5 mm/);assert.equal(d.querySelectorAll('form form').length,0);assert.equal(d.querySelectorAll('.adaptive-pair-readout').length,0);
 }finally{await w.happyDOM.close()}
});

test('V0.21 changing Piece/Position tabs keeps unsaved fields and lossless coordinates',async()=>{
 const p=project();p.freeParts[0].a[0]=.123456789123;const w=mount(editorInspector(p,buildProject(p),['A'])),d=w.document;
 try{
  const form=d.querySelector('[data-editor-form="piece"]');form.elements.label.value='Nom non appliqué';form.elements.a0.value='0.123456789123';
  assert.ok([...d.querySelectorAll('[data-inspector-panel="position"]')].every(p=>p.hidden));
  activateInspectorTab(d.body,'position');assert.equal(form.elements.label.value,'Nom non appliqué');assert.equal(form.elements.a0.value,'0.123456789123');assert.equal(d.querySelector('[data-inspector-tab="position"]').getAttribute('aria-selected'),'true');assert.ok([...d.querySelectorAll('[data-inspector-panel="piece"]')].every(p=>p.hidden));
  form.elements.a1.value='250.125';activateInspectorTab(d.body,'piece');const fd=new w.FormData(form);assert.equal(fd.get('a1'),'250.125');assert.equal(fd.get('a0'),'0.123456789123');assert.equal(fd.get('label'),'Nom non appliqué');assert.equal(d.querySelectorAll('form form').length,0);
  const tab=d.querySelector('[data-inspector-tab="piece"]');const event=new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true});Object.defineProperty(event,'target',{value:tab});assert.equal(inspectorTabKeydown(event,d.body),'position');assert.equal(d.activeElement.dataset.inspectorTab,'position');
 }finally{await w.happyDOM.close()}
});

test('V0.21 panel coordinates and multiple selections stay editable without duplicate spacing controls',async()=>{
 const p=project();p.freeParts.push({id:'P',label:'Grillage',kind:'panel',material:'mesh',width:1,corners:[[0,0,0],[1000,0,0],[1000,1500,0],[0,1500,0]],a:[0,0,0],b:[1000,1500,0]});const w=mount(editorInspector(p,buildProject(p),['P'],{tab:'position'}));
 try{
  const d=w.document,form=d.querySelector('[data-editor-form="piece"]');for(let c=0;c<4;c++)for(let a=0;a<3;a++)assert.ok(form.elements.namedItem(`c${c}${a}`));assert.equal(d.querySelector('[data-inspector-panel="position"]').hidden,false);
  d.body.innerHTML=editorInspector(p,buildProject(p),['A','B'],{tab:'position'});assert.equal(d.querySelectorAll('[data-editor-form="placement"]').length,1);assert.ok(d.querySelector('[data-editor-form="bulk"]'));assert.ok(d.querySelector('[data-editor-form="transform"]'));assert.ok(d.querySelector('[data-editor-form="duplicate"]'));
 }finally{await w.happyDOM.close()}
});

test('V0.21 context menu exposes common actions and one overflow, retaining rare commands',async()=>{
 const p=project(),w=mount(contextMenuHTML(p,['A','B']));
 try{
  const d=w.document;assert.equal(d.querySelectorAll('details').length,1);assert.equal(d.querySelector('summary').textContent,'Plus d’actions');assert.ok(d.querySelectorAll('.context-primary button').length<=8);
  for(const action of ['properties','link','attach','ground','align','group','measure','delete'])assert.ok(d.querySelector(`.context-primary [data-context-action="${action}"]`),action);
  for(const action of ['duplicate','select-connected','distribute','adapt','detach','isolate','show-all','workplane-reset'])assert.ok(d.querySelector(`details [data-context-action="${action}"]`),action);
  assert.equal(d.querySelectorAll('[data-context-action="measure"]').length,1);assert.equal(d.querySelectorAll('[data-context-action="duplicate"]').length,1);
 }finally{await w.happyDOM.close()}
});

test('V0.21 title is editable and escaped; mobile and pointer layouts retain usable controls',async()=>{
 const w=mount(projectTitleEditor({name:'A < B & "C"'}));try{assert.equal(w.document.querySelector('input').value,'A < B & "C"');assert.equal(w.document.querySelector('input').getAttribute('aria-label'),'Nom du projet');assert.match(workspaceStyles,/@media\(pointer:coarse\)/);assert.match(workspaceStyles,/body\.mobile-ui #scene-settings-host\{display:none\}/);assert.match(workspaceStyles,/#modal \.scene-settings-menu>.scene-settings-body/)}finally{await w.happyDOM.close()}
});
