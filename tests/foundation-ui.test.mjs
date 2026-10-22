import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {DEFAULT_PROJECT,normalizeProject,buildProject,calculateBOM,RECIPES} from '../src/engine.js';
import {foundationHelpHTML} from '../src/foundation-ui.js';

test('conseils béton : mêmes volumes et sacs que le modèle et la checklist, toutes les familles conservées',async()=>{
 const p=normalizeProject({...DEFAULT_PROJECT,margin:10,stock:{'concrete-bags':24}}),model=buildProject(p),bom=calculateBOM(p,model),row=bom.find(r=>r.id==='concrete-bags'),before=JSON.stringify(p),window=new Window();
 try{
  window.document.body.innerHTML=foundationHelpHTML(p,model,bom);
  const text=window.document.body.textContent;
  assert.ok(text.includes(`${row.packs} sac(s) à acheter`));assert.ok(text.includes('450 L de béton'));assert.ok(text.includes('24 L'));
  for(const recipe of RECIPES.filter(r=>r.family==='foundation'))assert.ok(text.includes(recipe.conditions));
  assert.equal(window.document.querySelectorAll('.comparison-card').length,5);assert.equal(JSON.stringify(p),before);
 }finally{await window.happyDOM.close()}
});

test('aucun appui béton : conseils présents sans inventer de sac ; poteau sélectionné décrit séparément',async()=>{
 const p=normalizeProject({...DEFAULT_PROJECT,mode:'free',freeParts:[{id:'P',kind:'post',a:[0,0,0],b:[0,2000,0],width:90,height:90,ground:'soil',foundation:'screw'}]}),model=buildProject(p),bom=calculateBOM(p,model),window=new Window();
 try{window.document.body.innerHTML=foundationHelpHTML(p,model,bom,['P']);const text=window.document.body.textContent;assert.match(text,/Poteaux sélectionnés/);assert.match(text,/Aucun plot béton affecté/);assert.match(text,/Vis de fondation/);assert.ok(!text.includes('NaN'));}finally{await window.happyDOM.close()}
});
