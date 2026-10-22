import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';

// Parcours applicatifs réels dans le fallback DOM. Ne valide pas le rendu WebGL.
test('V0.13 : répartition exacte, assistance persistante et pose sur grille indépendante',async t=>{
  const window=new Window({url:'https://atelier.test'}),document=window.document;
  Object.assign(globalThis,{window,document,localStorage:window.localStorage,ResizeObserver:window.ResizeObserver,FormData:window.FormData});
  document.write((await fs.readFile(new URL('../src/shell.html',import.meta.url),'utf8')).replace('/*__SCRIPT__*/',''));
  window.HTMLCanvasElement.prototype.getContext=()=>null;
  const warn=console.warn,error=console.error;console.warn=console.error=()=>{};
  try{await import('../src/app.js')}finally{console.warn=warn;console.error=error}
  const app=window.Atelier;
  const q=selector=>{const node=document.querySelector(selector);assert.ok(node,selector);return node};
  const click=selector=>q(selector).click();
  const assign=(node,value)=>{if(node.type==='checkbox')node.checked=!!value;else node.value=String(value)};
  const change=(selector,value)=>{const node=q(selector);assign(node,value);node.dispatchEvent(new window.Event('change',{bubbles:true}));return node};
  const fill=(selector,values={})=>{const form=q(selector);for(const [name,value]of Object.entries(values)){const node=form.elements.namedItem(name);assert.ok(node,`Champ ${name}`);assign(node,value)}return form};
  const submit=(selector,values={})=>{const form=fill(selector,values);assert.equal(form.checkValidity(),true,`Formulaire valide : ${selector}`);form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));};
  const saved=()=>JSON.parse(localStorage.getItem('atelier.project.v4'));
  const piece=id=>app.getProject().freeParts.find(p=>p.id===id);
  const centerX=p=>(p.a[0]+p.b[0])/2;
  const near=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-8,`${message} : ${a} / ${b}`);
  const sameReferences=(before,ids)=>{for(const id of ids)assert.deepEqual(piece(id),before.freeParts.find(p=>p.id===id),`${id} reste fixe`)};
  const addPost=(x,section=100)=>{
    click('[data-add="post"]');submit('[data-place-piece]',{p0:0,p1:0,p2:0});const id=app.getSelection()[0];assert.ok(id);
    submit('[data-editor-form="piece"]',{a0:x,a1:0,a2:0,b0:x,b1:2000,b2:0,length:2000,lengthAnchor:'a',width:section,height:section,foundation:'none'});
    assert.deepEqual(piece(id).a,[x,0,0]);assert.deepEqual(piece(id).b,[x,2000,0]);return id;
  };
  const pair=(secondSection=100)=>{app.setPage('design');click('[data-preset="blank"]');click('[data-load-preset="blank"]');const a=addPost(0),b=addPost(3700,secondSection);app.selectParts([a,b]);return [a,b]};
  const settings=(name,value)=>change(`[data-assistance-settings] [name="${name}"]`,value);
  const downloads=[],createURL=URL.createObjectURL,revokeURL=URL.revokeObjectURL;
  URL.createObjectURL=blob=>{downloads.push({blob});return 'blob:v013-test'};URL.revokeObjectURL=()=>{};
  window.HTMLAnchorElement.prototype.click=function(){downloads.at(-1).name=this.download;};
  try{
    await t.test('deux poteaux saisis à 0 et 3700 mm : l’aperçu et Annuler ne modifient rien',()=>{
      const [a,b]=pair(),before=app.getProject();
      click('[data-assist-action="between"]');const form=q('[data-between-form]');
      assert.equal(form.elements.referenceA.value,a);assert.equal(form.elements.referenceB.value,b);assert.equal(form.elements.source.value,a);assert.equal(form.elements.mode.value,'insert');
      assert.ok(form.querySelector('[data-between-preview] svg'));assert.equal(q('[data-between-apply]').disabled,false);
      change('[data-between-form] [name="count"]',3);assert.match(q('[data-between-preview]').textContent,/925/);assert.deepEqual(app.getProject(),before);assert.deepEqual(saved(),before);
      click('[data-between-cancel]');assert.equal(q('#modal').open,false);assert.deepEqual(app.getProject(),before);
    });

    await t.test('une copie est exactement à 1850 mm ; une seule annulation restaure la scène et le doublon est rejeté',()=>{
      const [a,b]=pair(),before=app.getProject();click('[data-assist-action="between"]');submit('[data-between-form]',{count:1,spacing:'axes'});
      let after=app.getProject();assert.equal(after.freeParts.length,3);sameReferences(before,[a,b]);
      const inserted=after.freeParts.find(p=>![a,b].includes(p.id));assert.equal(centerX(inserted),1850);assert.equal(inserted.a[1],0);assert.equal(inserted.b[1],2000);assert.equal(q('#modal').open,false);
      assert.deepEqual(saved(),after);click('#undo');assert.deepEqual(app.getProject(),before);click('#redo');assert.deepEqual(app.getProject(),after);
      app.selectParts([a,b]);click('[data-assist-action="between"]');assert.equal(q('[data-between-apply]').disabled,true);assert.match(q('[data-between-preview]').textContent,/occupe déjà cet emplacement/);
      submit('[data-between-form]',{count:1,spacing:'axes'});assert.deepEqual(app.getProject(),after);assert.equal(q('#modal').open,true);click('[data-between-cancel]');
    });

    await t.test('trois copies donnent quatre entraxes de 925 mm, avec des identifiants distincts et une seule action Undo',()=>{
      const refs=pair(),before=app.getProject();click('[data-assist-action="between"]');change('[data-between-form] [name="count"]',3);
      assert.equal(app.getProject().freeParts.length,2);submit('[data-between-form]',{count:3,spacing:'axes'});
      const result=app.getProject(),inserted=result.freeParts.filter(p=>!refs.includes(p.id));assert.equal(result.freeParts.length,5);assert.equal(new Set(result.freeParts.map(p=>p.id)).size,5);
      assert.deepEqual(inserted.map(centerX).sort((a,b)=>a-b),[925,1850,2775]);sameReferences(before,refs);
      assert.deepEqual(new Set(app.getSelection()),new Set(inserted.map(p=>p.id)));click('#undo');assert.deepEqual(app.getProject(),before);
    });

    await t.test('espaces libres égaux avec sections de 100 et 200 mm : centre à 1825 et jeux de 1725 mm',()=>{
      const [a,b]=pair(200),before=app.getProject();click('[data-assist-action="between"]');change('[data-between-form] [name="spacing"]','faces');
      assert.match(q('[data-between-preview]').textContent,/1\s*725/);assert.deepEqual(app.getProject(),before);submit('[data-between-form]',{count:1,spacing:'faces',source:a});
      const added=app.getProject().freeParts.find(p=>![a,b].includes(p.id));near(centerX(added),1825);near(centerX(added)-added.height/2-(centerX(piece(a))+piece(a).height/2),1725);near(centerX(piece(b))-piece(b).height/2-(centerX(added)+added.height/2),1725);sameReferences(before,[a,b]);
    });

    await t.test('centrer la troisième pièce conserve sa section et sa longueur sans créer de copie',()=>{
      const [a,b]=pair(),c=addPost(9000,120);app.selectParts([a,b,c]);const before=app.getProject();
      click('[data-assist-action="center-existing"]');const form=q('[data-between-form]');assert.equal(form.elements.mode.value,'existing');assert.equal(form.elements.source.value,c);assert.equal(form.elements.count.disabled,true);assert.deepEqual(app.getProject(),before);
      submit('[data-between-form]',{spacing:'axes'});assert.equal(app.getProject().freeParts.length,3);assert.equal(centerX(piece(c)),1850);assert.equal(piece(c).width,120);assert.equal(piece(c).height,120);assert.equal(piece(c).b[1]-piece(c).a[1],2000);sameReferences(before,[a,b]);assert.deepEqual(app.getSelection(),[c]);
      click('#undo');assert.deepEqual(app.getProject(),before);
    });

    await t.test('les réglages de grille se sauvegardent au changement, refusent un nombre invalide et survivent au JSON',async()=>{
      const [a,b]=pair(),geometry=app.getProject().freeParts;
      for(const [name,value]of [['guides',false],['guideSnap',false],['gridSnap',true],['gridMode','fixed'],['gridStep',125.5],['gridDivisions',2],['gridReference','pair'],['gridA',a],['gridB',b]]){
        settings(name,value);assert.equal(app.getProject().assistance[name],value,`${name} mis à jour`);assert.deepEqual(saved().assistance,app.getProject().assistance);
      }
      const before=app.getProject(),invalid=settings('gridDivisions',0);assert.equal(invalid.getAttribute('aria-invalid'),'true');assert.deepEqual(app.getProject(),before);settings('gridDivisions',2);assert.notEqual(q('[name="gridDivisions"]').getAttribute('aria-invalid'),'true');
      settings('gridMode','adaptive');const expected=app.getProject();assert.deepEqual(expected.freeParts,geometry);
      click('#save-project');assert.match(downloads.at(-1).name,/\.json$/);const raw=await downloads.at(-1).blob.text();assert.deepEqual(JSON.parse(raw).assistance,expected.assistance);
      settings('gridSnap',false);settings('gridStep',50);settings('gridReference','auto');
      const file=q('#file-input');Object.defineProperty(file,'files',{configurable:true,value:[{size:raw.length,text:async()=>raw}]});file.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,0));
      assert.deepEqual(app.getProject(),expected);assert.deepEqual(saved().assistance,expected.assistance);assert.equal(q('[name="gridDivisions"]').value,'2');assert.equal(q('[name="gridStep"]').value,'125.5');assert.equal(q('[name="gridA"]').value,a);assert.equal(q('[name="gridB"]').value,b);
    });

    await t.test('la grille liée aux deux références prime sur le pas relatif dans le formulaire de pose sans WebGL',()=>{
      const [a,b]=pair();settings('gridDivisions',2);app.selectParts([a,b]);const references=app.getProject().freeParts;
      click('[data-assist-action="grid-selection"]');const assistance=app.getProject().assistance;
      assert.equal(assistance.gridSnap,true);assert.equal(assistance.gridMode,'adaptive');assert.equal(assistance.gridReference,'pair');assert.equal(assistance.gridA,a);assert.equal(assistance.gridB,b);assert.match(q('.adaptive-grid-readout').textContent,/1\s*850/);assert.deepEqual(app.getProject().freeParts,references);
      click('[data-step="50"]');assert.deepEqual(app.getProject().assistance,assistance);
      const before=app.getProject();click('[data-add="post"]');submit('[data-place-piece]',{p0:1900.123,p1:0,p2:123.4});const added=piece(app.getSelection()[0]);assert.deepEqual(added.a,[1850,0,0]);assert.equal(app.getProject().grid,50);click('#undo');assert.deepEqual(app.getProject(),before);
      change('[data-field="snap"]',false);const noRelativeSnap=app.getProject();click('[data-add="post"]');submit('[data-place-piece]',{p0:1900.123,p1:0,p2:123.4});assert.deepEqual(piece(app.getSelection()[0]).a,[1850,0,0]);click('#undo');assert.deepEqual(app.getProject(),noRelativeSnap);
      settings('gridSnap',false);change('[data-field="snap"]',true);const relativeOnly=app.getProject();click('[data-add="post"]');submit('[data-place-piece]',{p0:1900.123,p1:0,p2:123.4});assert.deepEqual(piece(app.getSelection()[0]).a,[1900,0,100]);click('#undo');assert.deepEqual(app.getProject(),relativeOnly);
      change('[data-field="snap"]',false);click('[data-add="post"]');submit('[data-place-piece]',{p0:1900.123,p1:0,p2:123.4});assert.deepEqual(piece(app.getSelection()[0]).a,[1900.123,0,123.4]);
    });
  }finally{URL.createObjectURL=createURL;URL.revokeObjectURL=revokeURL;await window.happyDOM.close();}
});
