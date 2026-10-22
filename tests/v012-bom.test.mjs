import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProject,buildProject,calculateBOM,optimizeCuts,duplicateParts,removeParts,convertToFree} from '../src/engine.js';
import {analyzeTimberCut,cuttingParts} from '../src/manufacturing.js';
import {applyCommercialLengths,planTimber,formatCutDimension} from '../src/materials.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);
const brace=(id='A')=>({id,label:'Chevron incliné',kind:'brace',material:'wood',species:'pin',width:45,height:70,roll:0,a:[0,0,0],b:[1000,1000,0],foundation:'none'});
const base=extra=>normalizeProject({mode:'free',freeParts:[brace()],freeJoints:[],woodStockLength:1500,kerf:3,...extra});
const defined={a:'horizontal',b:'horizontal',allowance:30};

test('V0.12 : le brut biaisé fait sortir une pièce de sa longueur commerciale dans débit et achats',()=>{
  const axis=base(),raw=base({manufacturing:{precision:1,cuts:{A:defined}}}),model=buildProject(raw),part=model.parts.find(p=>p.id==='A'),analysis=analyzeTimberCut(part,defined),prepared=cuttingParts(model.parts,raw.manufacturing);
  close(part.length,1414.214);close(analysis.blankLength,Math.sqrt(2)*1000+100);
  const before=calculateBOM(axis).filter(r=>r.category==='Bois'),after=calculateBOM(raw,model).filter(r=>r.category==='Bois');
  assert.equal(before.length,1);assert.equal(before[0].needsQuote,false);
  assert.equal(after.length,1);assert.equal(after[0].needsQuote,true);assert.deepEqual(after[0].partIds,['A']);assert.match(after[0].spec,/1515/);
  const plan=optimizeCuts(prepared,[1500],3);assert.equal(plan.bars.length,0);assert.equal(plan.unplaced.length,1);close(plan.unplaced[0].length,analysis.blankLength);
  close(model.parts[0].length,1414.214);
});

test('V0.12 : plusieurs longueurs choisissent un format assez long pour le brut, identique à la nomenclature',()=>{
  let p=base({manufacturing:{precision:.5,cuts:{A:defined}}});const model=buildProject(p),prepared=cuttingParts(model.parts,p.manufacturing);
  p=normalizeProject({...p,workshop:applyCommercialLengths(p,[1500,1800,2400],{...model,parts:prepared})});
  const plan=planTimber(prepared,p.workshop,{kerf:p.kerf}),rows=calculateBOM(p,model).filter(r=>r.category==='Bois');
  assert.equal(plan.missing.length,0);assert.equal(plan.boards.length,1);assert.equal(plan.boards[0].length,1800);
  assert.equal(rows.length,1);assert.equal(rows[0].required,1);assert.equal(rows[0].id,`workshop-timber-${plan.purchases[0].stockId}`);assert.match(rows[0].label,/1800/);
});

test('V0.12 : arrondir l’affichage à 0,5 mm ne rend pas une longueur commerciale trop courte admissible',()=>{
  let p=base({freeParts:[{...brace(),kind:'beam',b:[1000.2,0,0]}],manufacturing:{precision:.5,cuts:{A:{a:'square',b:'square',allowance:.4}}}}),model=buildProject(p),prepared=cuttingParts(model.parts,p.manufacturing);
  close(prepared[0].length,1000.6);assert.equal(formatCutDimension(prepared[0].length,.5),'1\u202f000,5');
  p=normalizeProject({...p,workshop:applyCommercialLengths(p,[1000.5],{...model,parts:prepared})});
  const plan=planTimber(prepared,p.workshop),rows=calculateBOM(p,model).filter(r=>r.category==='Bois');
  assert.equal(plan.missing.length,1);assert.equal(plan.boards.length,0);assert.equal(rows[0].needsQuote,true);
  const coarser=normalizeProject({...p,manufacturing:{...p.manufacturing,precision:1}});
  assert.deepEqual(calculateBOM(coarser,model),calculateBOM(p,model));
});

test('V0.12 : duplication et suppression conservent puis nettoient les spécifications de coupe indépendamment',()=>{
  const p=base({manufacturing:{precision:.5,cuts:{A:defined}}}),copy=duplicateParts(p,['A'],[400,0,0]),id=copy.freeParts.find(p=>p.id!=='A').id;
  assert.deepEqual(copy.manufacturing.cuts[id],p.manufacturing.cuts.A);assert.notEqual(copy.manufacturing.cuts[id],copy.manufacturing.cuts.A);
  copy.manufacturing.cuts[id].allowance=75;assert.equal(copy.manufacturing.cuts.A.allowance,30);
  const deleted=removeParts(copy,[id]);assert.equal(deleted.manufacturing.cuts[id],undefined);assert.deepEqual(deleted.manufacturing.cuts.A,defined);
  assert.equal(calculateBOM(deleted).filter(r=>r.category==='Bois').reduce((s,r)=>s+r.required,0),1);
});

test('V0.12 : sauvegarde JSON conserve les coupes, la précision, les formats personnalisés et les prix',()=>{
  let p=base({manufacturing:{precision:.5,cuts:{A:{a:'horizontal',b:'vertical',allowance:12.375}}}}),model=buildProject(p);
  p=normalizeProject({...p,workshop:applyCommercialLengths(p,[1800,2450.5,3600],model)});p.workshop.timberStock[0].price=17.25;
  const restored=normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored.manufacturing,p.manufacturing);assert.deepEqual(restored.workshop,p.workshop);assert.deepEqual(calculateBOM(restored),calculateBOM(p));
});

test('V0.12 : convertir un modèle guidé garde les coupes des repères existants et leurs achats',()=>{
  let p=normalizeProject(),model=buildProject(p);const id=model.parts.find(p=>p.material==='wood'&&p.kind!=='panel').id;
  p=normalizeProject({...p,manufacturing:{precision:.5,cuts:{[id]:{a:'square',b:'square',allowance:40}}}});
  const converted=convertToFree(p);
  assert.deepEqual(converted.manufacturing,p.manufacturing);
  assert.deepEqual(calculateBOM(converted).filter(r=>r.category==='Bois').map(r=>[r.id,r.required]),calculateBOM(p).filter(r=>r.category==='Bois').map(r=>[r.id,r.required]));
});
