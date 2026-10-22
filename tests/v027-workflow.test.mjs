import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';
import {DEFAULT_PROJECT,normalizeProject} from '../src/engine.js';
const fixture=()=>normalizeProject({...DEFAULT_PROJECT,mode:'free',freeJoints:[],name:'Essai V0.27',freeParts:[
 {id:'P1',kind:'post',material:'wood',label:'Poteau gauche',a:[0,0,0],b:[0,2000,0],width:90,height:90,foundation:'none'},
 {id:'P2',kind:'post',material:'wood',label:'Poteau droit',a:[2000,0,0],b:[2000,2000,0],width:90,height:90,foundation:'none'},
 {id:'T',kind:'beam',material:'wood',label:'Chevron',a:[0,2035,0],b:[2000,2035,0],width:45,height:70},
]});
test('V0.27 — parcours attaches, adaptation prévisualisée, fixations et sauvegarde',async t=>{
 const window=new Window({url:'https://atelier.test'}),document=window.document;
 Object.assign(globalThis,{window,document,localStorage:window.localStorage,ResizeObserver:window.ResizeObserver,FormData:window.FormData});
 document.write((await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8')).replace('/*__SCRIPT__*/',''));
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 const warn=console.warn,error=console.error;console.warn=console.error=()=>{};try{await import('../src/app.js')}finally{console.warn=warn;console.error=error;}
 const app=window.Atelier,q=s=>{const node=document.querySelector(s);assert.ok(node,s);return node;},click=s=>q(s).click();
 const field=(form,name,value)=>{const node=q(form).elements.namedItem(name);assert.ok(node,name);if(node.type==='checkbox')node.checked=value;else node.value=String(value);};
 const submit=async(form,submitter)=>{const node=q(form);assert.equal(node.checkValidity(),true);node.dispatchEvent(new window.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:submitter||null}));await new Promise(r=>setTimeout(r,0));};
 const change=(selector,value)=>{const node=q(selector);if(node.type==='checkbox')node.checked=value;else node.value=String(value);node.dispatchEvent(new window.Event('change',{bubbles:true}));};
 const load=async(p=fixture())=>{const raw=JSON.stringify(p),input=q('#file-input');Object.defineProperty(input,'files',{configurable:true,value:[{size:raw.length,text:async()=>raw}]});input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));app.setPage('design');};
 const movePost=async(id,x)=>{app.selectParts([id]);click('[data-inspector-tab="position"]');field('[data-editor-form="piece"]','a0',x);field('[data-editor-form="piece"]','b0',x);await submit('[data-editor-form="piece"]');};
 const part=id=>app.getProject().freeParts.find(p=>p.id===id);
 try{
  await t.test('réglages près de la scène, onglets sans perte et menu direct',async()=>{
   await load();assert.equal(document.querySelector('#sidebar [data-field="grid"]'),null);assert.ok(q('#scene-settings-host [data-field="grid"]'));
   app.selectParts(['T']);field('[data-editor-form="piece"]','label','Chevron renommé');click('[data-inspector-tab="position"]');click('[data-inspector-tab="piece"]');assert.equal(q('[data-editor-form="piece"]').elements.label.value,'Chevron renommé');
   change('#project-title-input','Projet vérifié');assert.equal(app.getProject().name,'Projet vérifié');
   app.openContextMenu(part('T'),{clientX:80,clientY:80});assert.ok(q('[data-context-action="attach"]'));assert.ok(q('[data-context-action="ground"]'));
  });
  await t.test('les flèches des onglets changent d’onglet sans déplacer la pièce',async()=>{
   await load();app.selectParts(['T']);const before=app.getProject(),tab=q('[data-inspector-tab="piece"]');tab.focus();tab.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
   assert.equal(q('[data-inspector-tab="position"]').getAttribute('aria-selected'),'true');assert.deepEqual(app.getProject(),before);
  });
  await t.test('attache fixe suit le support et nouvelle sélection isole une pièce',async()=>{
   await load();app.selectParts(['T']);click('[data-attachment-action="create"]');field('[data-attachment-form="fixed"]','targetId','P1');await submit('[data-attachment-form="fixed"]');assert.equal(app.getProject().attachments.length,1);
   app.selectScenePart(app.getModel().parts.find(p=>p.id==='T'));assert.deepEqual(new Set(app.getSelection()),new Set(['T','P1']));app.selectScenePart(app.getModel().parts.find(p=>p.id==='T'));assert.deepEqual(app.getSelection(),['T']);
   await movePost('P1',100);assert.equal(part('T').a[0],100);assert.equal(part('T').b[0],2100);assert.equal(app.getProject().attachmentConflicts.length,0);
   click('#undo');assert.equal(part('T').a[0],0);assert.equal(part('P1').a[0],0);
  });
  await t.test('adaptation de +300 mm attend validation puis annulation atomique',async()=>{
   await load();app.selectParts(['T']);click('[data-attachment-action="adapt"]');field('[data-attachment-form="adapt"]','target0','P1');field('[data-attachment-form="adapt"]','target1','P2');field('[data-attachment-form="adapt"]','allowAdaptation',true);await submit('[data-attachment-form="adapt"]');
   assert.equal(part('T').lengthLocked,false);const before=app.getProject();
   await movePost('P2',2300);assert.deepEqual(app.getProject(),before,'Aucun changement avant validation');assert.match(q('#modal-content').textContent,/2.?300/);click('[data-attachment-impact="cancel"]');assert.deepEqual(app.getProject(),before);
   await movePost('P2',2300);click('[data-attachment-impact="apply"]');assert.equal(part('P2').a[0],2300);assert.equal(part('T').b[0],2300);assert.equal(app.getProject().attachmentConflicts.length,0);
   click('#undo');assert.deepEqual(app.getProject(),before);click('#redo');assert.equal(part('T').b[0],2300);
  });
  await t.test('verrouillage conserve la longueur et montre le conflit sans détacher',async()=>{
   app.selectParts(['T']);change('[data-attachment-lock="T"]',true);await movePost('P2',2500);assert.equal(part('T').b[0],2300);assert.equal(app.getProject().attachments.length,1);assert.equal(app.getProject().attachmentConflicts.length,1);assert.equal(q('#attachment-status').hidden,false);
   click('#undo');assert.equal(part('P2').a[0],2300);assert.equal(app.getProject().attachmentConflicts.length,0);
  });
  await t.test('fixations : aperçu sans achat puis confirmation, aucun doublon',async()=>{
   app.setPage('connections');assert.ok(q('#editor-toolbar').classList.contains('hidden'));
   const form=q('[data-attachment-fixing-form]'),button=form.querySelector('button[name="confirm"][value]:not([value=""])');assert.ok(button);const before=app.getProject();await submit('[data-attachment-fixing-form]',button);
   assert.deepEqual(app.getProject(),before);assert.ok(q('[data-attachment-fixing-preview="confirm"]'));click('[data-attachment-fixing-preview="confirm"]');assert.equal(app.getProject().freeJoints.length,1);assert.equal(app.getProject().attachments.length,1);
   const saved=JSON.parse(localStorage.getItem('atelier.project.v4'));assert.equal(saved.version,5);await load(saved);assert.deepEqual(app.getProject().attachments,saved.attachments);assert.equal(app.getProject().freeJoints.length,1);
  });
  await t.test('détecter un contact déjà équipé permet de créer une attache',async()=>{
   const p=fixture();p.freeJoints=[{id:'J1',aPart:'P1',bPart:'T',recipe:'angle'}];await load(p);app.selectParts(['T']);click('[data-attachment-action="detect"]');assert.ok(q('[data-attachment-detected-source="T"][data-attachment-detected-target="P1"]'));
  });
 }finally{await window.happyDOM.close();}
});
