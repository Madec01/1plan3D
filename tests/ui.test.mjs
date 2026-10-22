import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Window } from 'happy-dom';

// Interaction DOM sans navigateur ni rendu WebGL. Le rendu visuel reste à vérifier en navigateur.
test('parcours utilisateur : paramètres, achats, exports et réouverture', async t => {
 const window=new Window({url:'https://atelier.test'});
 const document=window.document;
 for(const [k,v] of Object.entries({window,document,localStorage:window.localStorage,ResizeObserver:window.ResizeObserver}))globalThis[k]=v;
 document.write((await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8')).replace('/*__SCRIPT__*/',''));
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 const oldWarn=console.warn,oldError=console.error;console.warn=console.error=()=>{};
 try{await import('../src/app.js')}finally{console.warn=oldWarn;console.error=oldError}
 const app=window.Atelier, q=s=>document.querySelector(s);
 const change=(sel,value)=>{const el=q(sel);assert.ok(el,sel);if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new window.Event('change',{bubbles:true}))};
 const click=sel=>{assert.ok(q(sel),sel);q(sel).click()};
 const next=()=>new Promise(r=>setTimeout(r,0));
 await t.test('modification de dimensions et annulation',()=>{
  assert.equal(app.getProject().width,4000);assert.ok(q('.fallback svg'));
  assert.match(q('.summary-strip').textContent,/À chiffrer/);
  const count=app.getModel().stats.postCount;
  change('[data-field="width"]',6000);
  assert.equal(app.getProject().width,6000);assert.ok(app.getModel().stats.postCount>count);
  click('#undo');assert.equal(app.getProject().width,4000);
  click('#redo');assert.equal(app.getProject().width,6000);
  change('[data-field="width"]',-5);assert.equal(app.getProject().width,6000);
  assert.equal(JSON.parse(localStorage.getItem('atelier.project.v4')).width,6000);
 });
 await t.test('appui individuel chimique et liaisons vissées',()=>{
  click('[data-page="connections"]');
  const before=app.getModel().stats.footingCount;
  change('#post-picker','P-AV-G');
  change('[data-post-ground="P-AV-G"]','concrete');
  change('[data-post-foundation="P-AV-G"]','plate_chemical');
  assert.equal(app.getModel().stats.footingCount,before-1);
  assert.equal(app.getBOM().find(r=>r.id==='chemical-rod-kit').required,4);
  change('[data-field="joint"]','screw');
  assert.ok(app.getBOM().some(r=>r.id==='joint-structural-screws'));
  assert.ok(!app.getBOM().some(r=>r.id==='joint-angle'));
  click('[data-action="wall-helper"]');change('#wall-support','hollow');
  assert.match(q('#modal-content').textContent,/tamis/);click('#modal-close');
 });
 await t.test('stock, prix, checklist et filtre',()=>{
  click('[data-page="shopping"]');
  change('[data-stock="gate-hinges"]',2);
  assert.equal(app.getBOM().find(r=>r.id==='gate-hinges').packs,0);
  change('[data-price="concrete-bags"]',7.5);
  const row=app.getBOM().find(r=>r.id==='concrete-bags');assert.equal(row.total,row.packs*7.5);
  assert.match(q('.inline-total').textContent,/partiel/);
  change('[data-purchased="concrete-bags"]',true);
  click('[data-action="toggle-missing"]');assert.equal(q('[data-purchased="concrete-bags"]'),null);
  click('[data-action="toggle-missing"]');
  const input=q('#shopping-search');input.value='loquet';input.dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.equal(document.querySelectorAll('tbody tr').length,1);assert.match(q('tbody').textContent,/Loquet/);
  q('#shopping-search').value='';q('#shopping-search').dispatchEvent(new window.Event('input',{bubbles:true}));
  click('[data-page="design"]');change('[data-field="width"]',8000);assert.equal(app.getProject().purchased['concrete-bags'],undefined);click('#undo');assert.equal(app.getProject().purchased['concrete-bags'],true);click('[data-page="shopping"]');
 });
 const downloads=[];const origCreate=URL.createObjectURL,origRevoke=URL.revokeObjectURL;
 URL.createObjectURL=blob=>{downloads.push({blob});return 'blob:atelier-test'};URL.revokeObjectURL=()=>{};
 window.HTMLAnchorElement.prototype.click=function(){downloads.at(-1).name=this.download};
 try{
  await t.test('CSV, sauvegarde JSON et SVG',async()=>{
   click('[data-action="csv"]');const csv=await downloads.at(-1).blob.text();
   assert.match(csv,/État checklist/);assert.match(csv,/Acheté/);assert.match(downloads.at(-1).name,/_achats.csv$/);
   click('#save-project');const data=JSON.parse(await downloads.at(-1).blob.text());
   assert.equal(data.width,6000);assert.equal(data.postOverrides['P-AV-G'].foundation,'plate_chemical');assert.equal(data.purchased['concrete-bags'],true);
   assert.equal(data.prices['concrete-bags'],7.5);
   const parsed=new window.DOMParser().parseFromString(app.planSVG(),'image/svg+xml');
   assert.equal(parsed.querySelector('parsererror'),null);assert.ok(parsed.querySelectorAll('rect').length>=app.getModel().posts.length+1);
   const input=q('#file-input');Object.defineProperty(input,'files',{configurable:true,value:[{size:300,text:async()=>JSON.stringify({...data,width:5000,name:'Projet réouvert'})}]});
   input.dispatchEvent(new window.Event('change',{bubbles:true}));await next();
   assert.equal(app.getProject().width,5000);assert.equal(q('#project-name').textContent,'Projet réouvert');
   Object.defineProperty(input,'files',{configurable:true,value:[{size:10,text:async()=>'{invalide'}]});
   input.dispatchEvent(new window.Event('change',{bubbles:true}));await next();assert.equal(app.getProject().width,5000);
  });
  await t.test('débit, dossier imprimable et sources',()=>{
   click('[data-page="cuts"]');assert.ok(document.querySelectorAll('.cut-bar').length>0);
   let printed=false;window.print=()=>{printed=true};click('[data-action="print"]');
   assert.equal(printed,true);assert.match(q('#print-area').textContent,/Checklist des achats/);assert.match(q('#print-area').textContent,/partiel/);
   click('[data-page="guide"]');assert.ok(document.querySelectorAll('.source-link').length>=5);
   assert.match(q('#workspace-content').textContent,/Un solveur général de contraintes/);
  });
 }finally{URL.createObjectURL=origCreate;URL.revokeObjectURL=origRevoke;await window.happyDOM.close()}
});
