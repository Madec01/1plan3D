import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {contextBounds,groundSelection,alignToReference,distributeSelection,connectedSelection,selectionGroupIds,namedSelectionGroups,groupSelection,ungroupSelection,separateCopiedGroups,keyboardNudge} from '../src/context-actions.js';
import {contextMenuHTML,contextGroupForm,contextAlignForm,contextDistributeForm,contextMenuKeydown} from '../src/context-ui.js';
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),near3=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
const post=(id,x,y=0,width=100)=>({id,label:`Poteau ${id}`,kind:'post',material:'wood',a:[x,y,0],b:[x,y+2000,0],width,height:width,roll:0,groupName:''});
const beam=(id,a,b,extra={})=>({id,kind:'beam',material:'wood',a,b,width:40,height:100,roll:0,groupName:'',...extra});
const project=parts=>({mode:'free',freeParts:parts,freeJoints:[],notes:'Conserver mes réglages',manufacturing:{cuts:{A:{start:'square'}}}});

test('pose au sol : bois incliné avec section et roulis réels, groupe rigide sans mutation',()=>{
 const tilted=beam('A',[0,400,0],[1000,1400,0],{roll:90}),second=post('B',500,1000),p=project([tilted,second]),before=structuredClone(p),minimum=400-20/Math.sqrt(2),out=groundSelection(p,['A','B']);near(contextBounds(tilted).min[1],minimum);near(contextBounds(out.freeParts[0]).min[1],0);near(out.freeParts[0].a[1],400-minimum);near(out.freeParts[1].a[1],1000-minimum);near(out.freeParts[1].a[1]-out.freeParts[0].a[1],600);assert.deepEqual(p,before);assert.deepEqual(out.manufacturing,p.manufacturing);assert.deepEqual(out.freeJoints,p.freeJoints);
 const individual=groundSelection(p,['A','B'],{individual:true});near(contextBounds(individual.freeParts[0]).min[1],0);near(contextBounds(individual.freeParts[1]).min[1],0);
});

test('panneau vrai à quatre coins et mur : hauteur minimale effective, aucune épaisseur inventée',()=>{
 const panel={id:'M',kind:'panel',material:'mesh',a:[0,200,0],b:[1000,300,100],corners:[[0,200,0],[1000,-30,0],[1000,300,100],[0,500,100]]},wall={id:'W',kind:'wall',material:'wall',a:[0,80,1000],b:[2000,80,1000],width:200,height:2500};
 const p=project([panel,wall]),out=groundSelection(p,['M']);near(contextBounds(out.freeParts[0]).min[1],0);near3(out.freeParts[0].corners[1],[1000,0,0]);assert.deepEqual(out.freeParts[1],wall);near(contextBounds(wall).max[1],2580);near(contextBounds(wall).min[2],900);
 const oldPanel={...panel,corners:undefined,a:[0,50,0],b:[1000,250,0],endHeights:[-10,250]};const moved=groundSelection(project([oldPanel]),['M']);near(moved.freeParts[0].endHeights[0],0);
});

test('alignement : première sélection fixe, centres ou faces réelles, ordre projet indépendant',()=>{
 const p=project([post('A',0,50,100),post('B',700,80,200),post('C',2000,100,300)]),before=structuredClone(p);
 for(const feature of ['center','min','max']){const out=alignToReference(p,['C','A','B'],{axis:'x',feature});const target=contextBounds(p.freeParts[2])[feature][0];for(const part of out.freeParts)near(contextBounds(part)[feature][0],target);assert.deepEqual(out.freeParts[2],p.freeParts[2]);}
 const y=alignToReference(p,['A','B','C'],{axis:'y',feature:'min',referenceId:'B'});near(contextBounds(y.freeParts[0]).min[1],80);near(contextBounds(y.freeParts[2]).min[1],80);assert.deepEqual(y.freeParts[1],p.freeParts[1]);assert.deepEqual(p,before);assert.throws(()=>alignToReference(p,['A','B'],{axis:'q'}),/axe/);assert.throws(()=>alignToReference(p,['A','B'],{referenceId:'C'}),/référence/);
});

test('répartition : extrêmes fixes, centres réguliers ou vides égaux avec sections différentes',()=>{
 const p=project([post('A',0,0,100),post('B',500,0,200),post('C',2000,0,300)]),before=structuredClone(p);
 const axes=distributeSelection(p,['C','A','B'],{axis:'x',spacing:'axes'});near(contextBounds(axes.freeParts[1]).center[0],1000);
 const faces=distributeSelection(p,['C','A','B'],{axis:'x',spacing:'faces'}),bounds=faces.freeParts.map(contextBounds);near(bounds[1].center[0],950);near(bounds[1].min[0]-bounds[0].max[0],800);near(bounds[2].min[0]-bounds[1].max[0],800);assert.deepEqual(faces.freeParts[0],p.freeParts[0]);assert.deepEqual(faces.freeParts[2],p.freeParts[2]);assert.deepEqual(p,before);
 const tight=project([post('A',0,0,100),post('B',100,0,500),post('C',200,0,100)]);assert.throws(()=>distributeSelection(tight,['A','B','C'],{spacing:'faces'}),/insuffisant/);assert.throws(()=>distributeSelection(p,['A','C']),/3 pièces/);
});

test('groupes nommés et composante liée explicite : aucune liaison créée, cycles et références absentes ignorés',()=>{
 const p=project([post('A',0),post('B',1000),post('C',2000),{...post('D',3000),groupName:'Groupe 1'}]);p.freeJoints=[{id:'J1',aPart:'A',bPart:'B'},{id:'J2',aPart:'B',bPart:'C'},{id:'J3',aPart:'C',bPart:'A'},{id:'J4',aPart:'D',bPart:'missing'}];const before=structuredClone(p);
 assert.deepEqual(connectedSelection(p,['B']),['B','A','C']);const grouped=groupSelection(p,['B'],{includeConnected:true});assert.deepEqual(grouped.freeParts.map(p=>p.groupName),['Groupe 2','Groupe 2','Groupe 2','Groupe 1']);assert.deepEqual(grouped.freeJoints,p.freeJoints);assert.ok(grouped.freeParts.slice(0,3).every(p=>p.grouped===true));assert.deepEqual(selectionGroupIds(grouped,['C']),['C','A','B']);assert.deepEqual(namedSelectionGroups(grouped).map(g=>g.count),[1,3]);
 const removed=ungroupSelection(grouped,['A','B','C']);assert.deepEqual(removed.freeParts.map(p=>p.groupName),['','','','Groupe 1']);assert.ok(removed.freeParts.slice(0,3).every(p=>p.grouped===false));assert.throws(()=>groupSelection(p,['A'],{name:'Groupe 1'}),/existe déjà/);assert.deepEqual(p,before);
 const isolated=groupSelection(p,['A','B'],{name:'Portillon'});assert.equal(isolated.freeParts[2].groupName,'');assert.equal(isolated.freeJoints.length,4);
});

test('sélection complète : les liaisons traversent les groupes explicites sans prendre les anciens libellés',()=>{
 const p=project(['A','B','C','D','E','F'].map((id,i)=>post(id,i*1000)));
 for(const [i,name]of [[0,'Gauche'],[1,'Gauche'],[2,'Droite'],[3,'Droite']])Object.assign(p.freeParts[i],{groupName:name,grouped:true});
 Object.assign(p.freeParts[5],{groupName:'Droite',grouped:false});
 p.freeJoints=[{aPart:'B',bPart:'C'},{aPart:'D',bPart:'E'},{aPart:'E',bPart:'C'}];const before=structuredClone(p);
 assert.deepEqual(connectedSelection(p,['A']),['A']);
 assert.deepEqual(new Set(connectedSelection(p,['A'],{includeGroups:true})),new Set(['A','B','C','D','E']));
 assert.deepEqual(connectedSelection(p,['F'],{includeGroups:true}),['F']);
 assert.deepEqual(p,before);
});

test('duplication : groupe copie indépendant, original et liaisons conservés',()=>{
 const before=project([{...post('A',0),groupName:'Cadre'},{...post('B',1000),groupName:'Cadre'}]),after={...structuredClone(before),freeParts:[...structuredClone(before.freeParts),{...post('N1',2000),groupName:'Cadre'},{...post('N2',3000),groupName:'Cadre'},{...post('OLD',4000),groupName:'Cadre (copie)'}]};
 // OLD fait partie du projet antérieur : son nom ne doit pas être réutilisé.
 before.freeParts.push({...after.freeParts.at(-1)});const out=separateCopiedGroups(before,after);assert.equal(out.freeParts[0].groupName,'Cadre');assert.equal(out.freeParts[2].groupName,'Cadre (copie 2)');assert.equal(out.freeParts[3].groupName,'Cadre (copie 2)');assert.deepEqual(selectionGroupIds(out,['N1']),['N1','N2']);assert.equal(after.freeParts[2].groupName,'Cadre');
});

test('libellés historiques hors groupe explicite : pas de sélection ou de duplication groupée',()=>{
 const p=project([{...post('A',0),groupName:'Structure',grouped:false},{...post('B',1000),groupName:'Structure',grouped:false},{...post('C',2000),groupName:'Structure',grouped:true}]);
 assert.deepEqual(selectionGroupIds(p,['A']),['A']);assert.deepEqual(selectionGroupIds(p,['C']),['C']);assert.deepEqual(namedSelectionGroups(p),[{name:'Structure',ids:['C'],count:1}]);
 const copy=separateCopiedGroups(p,{...p,freeParts:[...p.freeParts,{...p.freeParts[0],id:'D'}]});assert.equal(copy.freeParts[3].groupName,'Structure');assert.equal(copy.freeParts[3].grouped,false);
 const group=groupSelection(p,['A','B','C'],{name:'Structure'});assert.ok(group.freeParts.every(p=>p.grouped===true));assert.deepEqual(selectionGroupIds(group,['B']),['B','A','C']);
});

test('nudges exacts : repère écran, vues caméra, hauteur monde et modificateurs cumulables',()=>{
 near3(keyboardNudge({key:'ArrowUp'},'top',.1),[0,0,-.1]);near3(keyboardNudge({key:'ArrowRight'},'front',1),[-1,0,0]);near3(keyboardNudge({key:'ArrowRight'},'side',1),[0,0,-1]);
 near3(keyboardNudge({key:'ArrowUp'},{right:[1,0,0],up:[0,1,0]},2),[0,2,0]);near3(keyboardNudge({key:'ArrowRight'},{right:[1,0,1],up:[0,1,0]},10),[Math.sqrt(50),0,Math.sqrt(50)]);
 near3(keyboardNudge({key:'PageUp',shiftKey:true},'top',.1),[0,1,0]);near3(keyboardNudge({key:'PageDown',altKey:true},'top',.1),[0,-.01,0]);near3(keyboardNudge({key:'ArrowLeft',altKey:true,shiftKey:true},'top',.1),[-.1,0,0]);
 for(const extra of [{ctrlKey:true},{metaKey:true},{isComposing:true},{defaultPrevented:true}])assert.equal(keyboardNudge({key:'ArrowRight',...extra},'top',1),null);assert.equal(keyboardNudge({key:'a'},'top',1),null);assert.equal(keyboardNudge({key:'ArrowRight'},{right:[0,0,0]},1),null);
});

test('champs et dialogues ne déplacent rien ; menu compact accessible et formulaires sûrs',async()=>{
 const window=new Window(),document=window.document,p=project([{...post('A',0),label:'A < B & C',groupName:'Portillon'},{...post('B',1000),groupName:'Portillon'},post('C',2000)]);try{
  for(const html of ['<input>','<textarea></textarea>','<select></select>','<div contenteditable="true"><span></span></div>','<dialog open><button>B</button></dialog>']){document.body.innerHTML=html;const target=document.body.querySelector('span,button,input,textarea,select')||document.body.firstElementChild;assert.equal(keyboardNudge({key:'ArrowRight',target},'top',1),null);}
  document.body.innerHTML=contextMenuHTML(p,['A','B']);const menu=document.body.firstElementChild;assert.ok(menu.querySelector('[data-context-action="link"]'));assert.equal(menu.querySelector('[data-context-action="link-target"]'),null);assert.equal(menu.querySelectorAll('details[open]').length,0);assert.equal(menu.querySelector('[data-context-action="distribute"]').disabled,true);assert.ok(menu.querySelector('[data-context-group="Portillon"]'));
  const event=new window.KeyboardEvent('keydown',{key:'ArrowDown',cancelable:true});assert.equal(contextMenuKeydown(event,menu),true);assert.equal(document.activeElement.dataset.contextAction,'properties');contextMenuKeydown(new window.KeyboardEvent('keydown',{key:'End',cancelable:true}),menu);assert.equal(document.activeElement.tagName,'SUMMARY');
  document.body.innerHTML=contextMenuHTML(p,['A']);assert.ok(document.querySelector('[data-context-action="link-target"]'));assert.match(document.body.innerHTML,/A &lt; B &amp; C/);assert.ok(document.querySelector('[data-context-action="workplane-top"]'));
  document.body.innerHTML=contextAlignForm(p,['C','A','B']);assert.equal(document.querySelector('[name="referenceId"]').value,'C');assert.equal(document.querySelector('[name="feature"]').value,'center');
  document.body.innerHTML=contextGroupForm(p,['A','B']);assert.equal(document.querySelector('[name="name"]').value,'Portillon');assert.ok(document.querySelector('[name="includeConnected"]'));assert.equal(document.querySelector('[name="includeConnected"]').checked,false);
  document.body.innerHTML=contextDistributeForm(p,['A','B','C']);assert.equal(document.querySelector('[name="spacing"]').value,'axes');assert.ok(document.querySelector('[data-context-cancel]'));
 }finally{await window.happyDOM.close()}
});

test('limites : paramétrique et translations hors domaine ne sont jamais corrigés silencieusement',()=>{
 const p=project([post('A',99990),post('B',-99990,0,2000)]);assert.throws(()=>alignToReference(p,['A','B'],{feature:'min'}),/limites/);assert.throws(()=>groundSelection({...p,mode:'parametric'},['A']),/construction libre/);assert.throws(()=>groundSelection(p,[]),/Sélectionnez/);
});


test('menu : redimensionnement des panneaux et liaisons réservées aux bois et murs',async()=>{
 const window=new Window(),document=window.document,panel={id:'P',kind:'panel',material:'wood',label:'Panneau'},wall={id:'W',kind:'wall',material:'wall',label:'Mur'},p=project([post('A',0),panel,wall]);try{
  document.body.innerHTML=contextMenuHTML(p,['P']);assert.ok(document.querySelector('[data-context-action="resize"]'));assert.equal(document.querySelector('[data-context-action="link-target"]'),null);
  document.body.innerHTML=contextMenuHTML(p,['A','P']);assert.equal(document.querySelector('[data-context-action="link"]'),null);assert.equal(document.querySelector('[data-context-action="resize"]'),null);
  document.body.innerHTML=contextMenuHTML(p,['A','W']);assert.ok(document.querySelector('[data-context-action="link"]'));assert.equal(document.querySelector('[data-context-action="resize"]'),null);
  document.body.innerHTML=contextMenuHTML(p,['W']);assert.ok(document.querySelector('[data-context-action="link-target"]'));
 }finally{await window.happyDOM.close()}
});

test('dégrouper une sélection liée conserve les fixations mais suspend sa sélection automatique',()=>{
 const p=project(['A','B','C'].map((id,i)=>post(id,i*1000)));p.freeJoints=[{id:'J',aPart:'A',bPart:'B',screws:8}];p.attachments=[{sourceId:'B',anchors:[{targetId:'C'}]}];
 const out=ungroupSelection(p,['A','B','C']);
 assert.deepEqual(connectedSelection(out,['A'],{includeGroups:true,respectUngrouped:true}),['A']);
 assert.deepEqual(new Set(connectedSelection(out,['A'])),new Set(['A','B','C']));
 assert.deepEqual(out.freeJoints,p.freeJoints);assert.deepEqual(out.attachments,p.attachments);
 const regrouped=groupSelection(out,['A','B','C']);assert.equal(connectedSelection(regrouped,['A'],{includeGroups:true,respectUngrouped:true}).length,3);
 const window=new Window();try{window.document.body.innerHTML=contextMenuHTML(p,['A','B','C']);assert.equal(window.document.querySelector('.context-primary [data-context-action="ungroup"]').textContent,'Dégrouper');window.document.body.innerHTML=contextMenuHTML(project([{id:'W',kind:'wall',material:'wall'}]),['W']);assert.ok(window.document.querySelector('.context-primary [data-context-action="resize"]'));}finally{window.happyDOM.close()}
});
