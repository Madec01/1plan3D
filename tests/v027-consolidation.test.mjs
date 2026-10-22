import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProject,buildProject,calculateBOM,convertToFree,toCSV,duplicateParts} from '../src/engine.js';
import {createFixedAttachment,configureBeamAttachment,reconcileAttachments} from '../src/attachments.js';
import {createProjectLibrary} from '../src/project-library.js';
import {buildDrawingSheets,pdfBytes} from '../src/paper-sheets.js';
import {projectionSVG} from '../src/fabrication.js';

const post=(id,x,z=0)=>({id,label:`Poteau ${id}`,kind:'post',material:'wood',a:[x,0,z],b:[x,2000,z],width:90,height:90,foundation:'none'});
function fixture(){return normalizeProject({version:4,mode:'free',name:'Validation V0.27',foundation:'none',freeParts:[post('P1',0),post('P2',2000),{id:'B',label:'Traverse',kind:'beam',material:'wood',a:[0,2035,0],b:[2000,2035,0],width:45,height:70,foundation:'none'}],freeJoints:[],notes:'Conserver les cotes exactes',prices:{'custom':12.5},stock:{'custom':3},purchased:{'custom':true}})}
function memoryStorage(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}}

test('V0.27 : migration V1 et V4, attaches facultatives et export JSON exact',()=>{
  const old=normalizeProject({version:1,name:'Ancien projet',width:3700,depth:2400,notes:'À conserver'});
  assert.equal(old.version,5);assert.equal(old.notes,'À conserver');assert.deepEqual(old.attachments,[]);
  const converted=convertToFree(old);assert.equal(converted.version,5);assert.ok(converted.freeParts.length>0);assert.deepEqual(converted.attachments,[]);
  const original=fixture(),attached=normalizeProject(createFixedAttachment(original,'B','P1'));
  assert.equal(attached.attachmentSettings.autoAttach,false);
  assert.equal(attached.freeParts.find(p=>p.id==='B').lengthLocked,true);
  assert.equal(attached.attachments.length,1);
  const reopened=normalizeProject(JSON.parse(JSON.stringify(attached)));
  assert.deepEqual(reopened,attached);
  assert.deepEqual(calculateBOM(reopened),calculateBOM(original),'Une attache ne crée aucun consommable');
  const store=createProjectLibrary(memoryStorage()),saved=store.save(reopened);
  assert.deepEqual(normalizeProject(store.open(saved.id).project),attached);
  const restored=createProjectLibrary(memoryStorage());restored.importBackup(store.exportBackup());
  assert.deepEqual(normalizeProject(restored.open(saved.id).project),attached);
});

test('V0.27 : adaptation explicitement choisie, aperçu pur et exports sur la géométrie finale',()=>{
  const before=normalizeProject(configureBeamAttachment({...fixture(),woodStockLength:2100},'B',['P1','P2']));
  const snapshot=JSON.stringify(before),draft=structuredClone(before),support=draft.freeParts.find(p=>p.id==='P2');
  support.a[0]+=300;support.b[0]+=300;
  const result=reconcileAttachments(before,draft),after=normalizeProject(result.project);
  assert.equal(JSON.stringify(before),snapshot,'Le calcul d’aperçu est sans mutation');
  assert.equal(result.needsConfirmation,true);assert.equal(result.conflicts.length,0);
  assert.equal(buildProject(after).parts.find(p=>p.id==='B').length,2300);
  assert.equal(buildProject(before).parts.find(p=>p.id==='B').length,2000);
  const model=buildProject(after),bom=calculateBOM(after,model),csv=toCSV(bom);
  assert.ok(csv.includes('2300'));assert.ok(!csv.includes('NaN'));
  const svg=projectionSVG(model,'front',{precision:.1});
  assert.match(svg,/<svg\b/);assert.doesNotMatch(svg,/NaN|Infinity/);
  const sheets=buildDrawingSheets(after,model,{views:['front','top'],scale:'fit'});
  assert.equal(sheets.length,2);assert.ok(sheets.every(s=>!s.overflow));
  const pdf=new TextDecoder().decode(pdfBytes(sheets));
  assert.match(pdf,/^%PDF-1\.4/);assert.match(pdf,/\/Count 2\b/);
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(after))),after);
});

test('V0.27 : 1 000 pièces sauvegardables, dimensions précises et limite de duplication explicite',()=>{
  const parts=Array.from({length:1000},(_,i)=>post(`P${i}`,(i%50)*250,Math.floor(i/50)*250));
  const project=normalizeProject({version:5,mode:'free',name:'Grand projet',freeParts:parts,freeJoints:[],foundation:'none',grid:.1});
  const original=JSON.stringify(project),model=buildProject(project);
  assert.equal(model.parts.length,1000);assert.equal(model.stats.woodPieces,1000);
  assert.equal(model.stats.woodLength,2000);assert.ok(model.bounds.width>12000);
  const bom=calculateBOM(project,model);assert.ok(bom.length>0);
  assert.ok(bom.every(row=>Number.isFinite(row.required)&&Number.isFinite(row.purchaseQty)));
  const store=createProjectLibrary(memoryStorage()),saved=store.save(project);
  assert.equal(store.open(saved.id).project.freeParts.length,1000);
  assert.equal(JSON.stringify(project),original,'Calcul et sauvegarde ne modifient pas la géométrie');
  assert.throws(()=>duplicateParts(project,['P0']),/1000|1 000|volumineux/i);
});
