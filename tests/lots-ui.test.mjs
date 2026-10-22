import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';
import {buildJointFixings,getFoundationJoints} from '../src/fixings.js';

test('V0.9 : fixations, matériaux, modèles, électricité et projets ensemble',async t=>{
 const window=new Window({url:'https://atelier.test'}),document=window.document;
 Object.assign(globalThis,{window,document,localStorage:window.localStorage,ResizeObserver:window.ResizeObserver,FormData:window.FormData});
 document.write((await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8')).replace('/*__SCRIPT__*/',''));
 window.HTMLCanvasElement.prototype.getContext=()=>null;const warn=console.warn,error=console.error;console.warn=console.error=()=>{};try{await import('../src/app.js')}finally{console.warn=warn;console.error=error}
 const app=window.Atelier,q=s=>document.querySelector(s),click=s=>{
  if(q(s)?.matches('[data-add]'))app.selectParts([]); // These fixtures exercise free placement.
  const button=q(s);assert.ok(button,s);button.click();
  if(button.matches('[data-add]')){const placement=q('form[data-place-piece]');assert.ok(placement,'placement XYZ');for(const name of ['p0','p1','p2'])placement.elements.namedItem(name).value=String(Number(placement.elements.namedItem(name).value));placement.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(placement.closest('dialog')?.open??false,false)}
 },form=(s,values)=>{const f=q(s);assert.ok(f,s);for(const [k,v]of Object.entries(values)){const el=f.elements.namedItem(k);assert.ok(el,k);if(el.type==='checkbox')el.checked=v;else el.value=String(v)}assert.equal(f.checkValidity(),true,'valid '+s+' '+[...f.elements].filter(e=>e.checkValidity&&!e.checkValidity()).map(e=>e.name+':'+e.value+':'+e.validationMessage).join(';'));f.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))};
 const downloads=[],origCreate=URL.createObjectURL,origRevoke=URL.revokeObjectURL;URL.createObjectURL=b=>{downloads.push(b);return 'blob:test'};URL.revokeObjectURL=()=>{};window.HTMLAnchorElement.prototype.click=function(){};
 try{
 await t.test('mur : auto → manuel, coordonnées exactes, annulation et mêmes achats',()=>{
  click('[data-editor="convert"]');click('[data-preset="wall"]');click('[data-load-preset="wall"]');const joint=app.getModel().joints.find(j=>j.recipe.startsWith('wall_'));assert.ok(joint.recipe.startsWith('wall_'));app.pickJoint(joint.id);const before=app.getBOM();
  click('[data-fixing-mode="manual"]');const p=buildJointFixings(app.getModel().joints.find(j=>j.id===joint.id),app.getModel())[0];app.pickFixing(joint.id,p.id);form('[data-fixing-form]',{p0:123.125,p1:1520.5,p2:94.25});
  const moved=buildJointFixings(app.getModel().joints.find(j=>j.id===joint.id),app.getModel())[0];assert.deepEqual(moved.position,[123.125,1520.5,94.25]);assert.deepEqual(app.getBOM(),before);
  const saved=JSON.parse(localStorage.getItem('atelier.project.v4'));assert.equal(saved.freeJoints.find(j=>j.id===joint.id).fixingLayout.mode,'manual');assert.equal(saved.freeJoints.find(j=>j.id===joint.id).fixingLayout.points.length,joint.anchors);
  click('#undo');assert.notDeepEqual(buildJointFixings(app.getModel().joints.find(j=>j.id===joint.id),app.getModel())[0].position,moved.position);click('#redo');assert.deepEqual(buildJointFixings(app.getModel().joints.find(j=>j.id===joint.id),app.getModel())[0].position,moved.position);
  click('[data-fixing-mode="auto"]');assert.equal(app.getProject().freeJoints.find(j=>j.id===joint.id).fixingLayout.mode,'auto');assert.deepEqual(app.getBOM(),before);
 });
 await t.test('compléments, catalogue et stock alimentent les achats globaux',()=>{
  app.setPage('workshop');form('[data-workshop-form="save-extra"]',{label:'Peinture extérieure',qty:3,unit:'L',packSize:2,price:15,stock:1});
  const r=app.getBOM().find(r=>r.label==='Peinture extérieure');assert.equal(r.packs,1);assert.equal(r.total,15);assert.equal(r.toBuy,2);
  form('[data-workshop-form="save-timber"]',{species:'pin',width:45,height:70,length:4000,kind:'stock',qty:1,price:0});form('[data-workshop-form="settings"]',{useTimberStock:true,usePanelStock:false});
  app.setPage('cuts');assert.match(q('#workspace-content').textContent,/Débit selon votre stock/);assert.ok(app.getProject().workshop.timberStock.length===1);
 });
 await t.test('modèle de pergola créé avec cotes, ancien projet préservé et platines manuelles',()=>{
  const before=JSON.parse(localStorage.getItem('atelier.projects.v1')).projects.length;app.setPage('templates');form('[data-template-form="pergola"]',{width:4200,depth:3200,height:2600});
  assert.equal(app.getProject().mode,'free');assert.equal(app.getModel().bounds.width,4200);assert.equal(app.getModel().bounds.depth,3200);assert.equal(JSON.parse(localStorage.getItem('atelier.projects.v1')).projects.length,before+1);
  const post=app.getProject().freeParts.find(p=>p.kind==='post');app.selectParts([post.id]);form('[data-editor-form="piece"]',{foundation:'plate_chemical',ground:'concrete'});
  click('[data-base-fixings]');click('[data-fixing-mode="manual"]');const j=getFoundationJoints(app.getModel(),app.getProject())[0],f=buildJointFixings(j,app.getModel())[0];app.pickFixing(j.id,f.id);form('[data-fixing-form]',{p0:100.125,p1:4,p2:200.5});
  assert.deepEqual(buildJointFixings(getFoundationJoints(app.getModel(),app.getProject())[0],app.getModel())[0].position,[100.125,4,200.5]);assert.equal(app.getBOM().find(r=>r.id==='chemical-rod-kit').required,4);
 });
 await t.test('panneau bois libre : coins, épaisseur et achats de surface',()=>{
  app.setPage('design');click('[data-editor="none"]');click('[data-add="woodpanel"]');const id=app.getSelection()[0];form('[data-editor-form="piece"]',{width:21,c21:1500,c31:1500});
  const part=app.getModel().parts.find(p=>p.id===id);assert.equal(part.kind,'panel');assert.equal(part.material,'wood');assert.equal(part.area,1.5);assert.equal(part.width,21);assert.ok(app.getBOM().some(r=>r.id.startsWith('wood-panel-')&&r.required===1.5));
 });
 await t.test('électricité : circuit, câble et symbole conservés dans BOM et sauvegarde',()=>{
  app.setPage('electrical');form('[data-electrical-form="circuit"]',{label:'Éclairage atelier',cableRef:'Référence test',section:'saisie',protection:'Dispositif choisi',conduitRef:'Gaine test'});
  const id=app.getProject().electrical.circuits[0].id;form('[data-electrical-form="symbol"]',{kind:'light',label:'Lampe atelier',x:250.5,z:500.25,circuitId:id});
  form('[data-electrical-form="route"]',{label:'Trajet atelier',circuitId:id,points:'0,0\n3000,0\n3000,4000',vertical:0,reserve:0,margin:0});
  const row=app.getBOM().find(r=>r.label.startsWith('Câble'));assert.equal(row.required,7);assert.equal(row.marginQty,0);assert.equal(row.packs,7);assert.equal(app.getProject().electrical.symbols[0].x,250.5);
  app.setPage('shopping');const price=q(`[data-price="${row.id}"]`);price.value='2.5';price.dispatchEvent(new window.Event('change',{bubbles:true}));const stock=q(`[data-stock="${row.id}"]`);stock.value='2';stock.dispatchEvent(new window.Event('change',{bubbles:true}));const check=q(`[data-purchased="${row.id}"]`);check.checked=true;check.dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(app.getProject().prices[row.id],2.5);assert.equal(app.getProject().stock[row.id],2);assert.equal(app.getProject().purchased[row.id],true);assert.equal(app.getBOM().find(r=>r.id===row.id).total,12.5);app.setPage('electrical');click('[data-electrical-action="export-plan"]');assert.match(String(downloads.at(-1)),/Blob/);click('#save-project');
 });
 await t.test('plusieurs projets, copie, changement puis restauration',()=>{
  app.setPage('projects');const oldCount=JSON.parse(localStorage.getItem('atelier.projects.v1')).projects.length;click('[data-project-action="save-copy"]');assert.equal(JSON.parse(localStorage.getItem('atelier.projects.v1')).projects.length,oldCount+1);
  const active=JSON.parse(localStorage.getItem('atelier.projects.v1')).activeId;const oldName=app.getProject().name;const input=q('[data-field="name"]');input.value='Variante renommée';input.dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(app.getProject().name,'Variante renommée');
  click(`[data-project-action="restore"][data-project-id="${active}"]`);assert.equal(app.getProject().name,oldName);assert.equal(app.getProject().electrical.routes.length,1);
  click('[data-project-action="export-library"]');
 });
 await t.test('dossier et plans exportés, données source inchangées',()=>{
  const before=app.getProject();app.setPage('fabrication');assert.equal(document.querySelectorAll('.fabrication-document figure svg').length>=3,true);let printed=false;window.print=()=>{printed=true};click('[data-action="print"]');assert.equal(printed,true);assert.match(q('#print-area').textContent,/Checklist des achats/);assert.deepEqual(app.getProject(),before);click('[data-projection-export="front"]');
 });
 }finally{URL.createObjectURL=origCreate;URL.revokeObjectURL=origRevoke;await window.happyDOM.close()}
});
