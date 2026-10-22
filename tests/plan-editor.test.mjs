import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { PlanEditor, projectPlanPoint, unprojectPlanPoint, projectPlanPart } from '../src/plan-editor.js';

const near = (a,b,epsilon=1e-7) => assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const nearV = (a,b) => a.forEach((n,i)=>near(n,b[i]));
const post = (id,x,z=0,extra={}) => ({id,label:`Poteau ${id}`,kind:'post',material:'wood',a:[x,0,z],b:[x,2000,z],width:100,height:100,roll:0,...extra});
const beam = (id,a,b,extra={}) => ({id,label:`Chevron ${id}`,kind:'beam',material:'wood',a,b,width:45,height:95,roll:0,...extra});
const projectOf = (parts,extra={}) => ({name:'Plan & atelier',mode:'free',freeParts:parts,grid:1,snap:false,assistance:{guides:false,guideSnap:false,gridSnap:false,gridMode:'fixed',gridStep:100},drawing:{automatic:false,dimensions:[]},...extra});
function mount(parts=[post('A',0),post('B',2000)],extra={},callbacks={}){
 const window=new Window(),document=window.document,container=document.createElement('div');document.body.append(container);
 const rect=()=>({left:0,top:0,width:800,height:600});container.getBoundingClientRect=rect;
 const events={select:[],move:[],place:[],dimension:[],preview:[]},editor=new PlanEditor(container,{
  onSelect:(part,event)=>events.select.push({part,event}),onMove:(ids,delta)=>events.move.push({ids,delta}),onPlace:part=>events.place.push(part),onDimension:id=>events.dimension.push(id),onPreviewChange:pending=>events.preview.push(pending),...callbacks
 });editor.svg.getBoundingClientRect=rect;editor.svg.setPointerCapture=()=>{};editor.svg.releasePointerCapture=()=>{};
 const project=projectOf(parts,extra),model={parts};editor.set(project,model,[]);
 const pointer=(type,point,options={})=>editor.svg.dispatchEvent(new window.PointerEvent(type,{bubbles:true,cancelable:true,button:0,pointerId:1,pointerType:'mouse',clientX:point[0],clientY:point[1],...options}));
 const tap=(world,options={})=>{const point=editor.planToClient(world);pointer('pointerdown',point,options);pointer('pointerup',point,options)};
 return {window,document,container,editor,project,model,events,pointer,tap,async close(){editor.dispose();await window.happyDOM.close()}};
}

test('projections orthographiques exactes, inversion et profondeur conservée',()=>{
 const p=[17.125,234.567,-89.321];
 for(const [view,hidden,expected] of [['top',1,[p[0],p[2]]],['front',2,[p[0],-p[1]]],['side',0,[p[2],-p[1]]]]){
  assert.deepEqual(projectPlanPoint(p,view),expected);assert.deepEqual(unprojectPlanPoint(expected,p[hidden],view),p);
 }
 assert.equal(projectPlanPoint([NaN,0,0]),null);
 const p0=post('P',0,0,{width:40,height:100}),p90={...p0,roll:90};
 const a=projectPlanPart(p0,'top'),b=projectPlanPart(p90,'top');nearV(a.min,[-50,-20]);nearV(a.max,[50,20]);nearV(b.min,[-20,-50]);nearV(b.max,[20,50]);
 const diagonal=projectPlanPart(beam('D',[0,0,0],[1000,1000,0],{width:40,height:100}),'front');
 near(diagonal.min[0],-50/Math.sqrt(2));near(diagonal.max[0],1000+50/Math.sqrt(2));near(diagonal.min[1],-1000-50/Math.sqrt(2));
 const wall=projectPlanPart({id:'W',kind:'wall',material:'wall',a:[0,50,0],b:[1000,50,0],width:200,height:2400},'front');nearV(wall.min,[0,-2450]);nearV(wall.max,[1000,-50]);
 const panel=projectPlanPart({id:'M',kind:'panel',material:'mesh',a:[0,0,0],b:[1000,1000,0],corners:[[0,0,0],[1000,0,0],[1000,500,0],[0,1000,0]]},'front');assert.equal(panel.polygon.length,4);assert.ok(panel.polygon.some(p=>p[0]===1000&&p[1]===-500));
});

test('tap tactile, sélection multiple, aucune capture du vide adjacent à un solide',async()=>{
 const e=mount();try{
  e.tap([0,0],{pointerType:'touch'});assert.equal(e.events.select.at(-1).part.id,'A');
  e.editor.setMulti(true);e.tap([2000,0],{pointerType:'touch'});assert.deepEqual(e.editor.selectedIds,['A','B']);assert.equal(e.events.select.at(-1).event.additive,true);
  e.tap([0,0],{pointerType:'touch'});assert.deepEqual(e.editor.selectedIds,['B']);
  assert.equal(e.editor.hitTest([51,0],'touch'),null,'Le tampon tactile ne transforme pas le vide en poteau');
  e.editor.setMulti(false);e.tap([500,500]);assert.equal(e.events.select.at(-1).part,null);assert.deepEqual(e.editor.selectedIds,[]);
 }finally{await e.close()}
});

test('un doigt déplace uniquement la vue ; zoom ancré et caméra conservée au commit',async()=>{
 const e=mount();try{
  const before=structuredClone(e.project),box={...e.editor.viewBox},start=e.editor.planToClient([0,0]);
  e.pointer('pointerdown',start,{pointerType:'touch'});e.pointer('pointermove',[start[0]+100,start[1]+30],{pointerType:'touch'});e.pointer('pointerup',[start[0]+100,start[1]+30],{pointerType:'touch'});
  assert.notEqual(e.editor.viewBox.x,box.x);assert.equal(e.events.select.length,0);assert.equal(e.events.move.length,0);assert.deepEqual(e.project,before);
  const anchor=[250,320],world=e.editor.clientToPlan(...anchor);e.editor.zoom(1.4,anchor);nearV(e.editor.clientToPlan(...anchor),world);
  const camera={...e.editor.viewBox};e.editor.set(structuredClone(e.project),e.model,['A']);assert.deepEqual(e.editor.viewBox,camera);
  e.editor.setView('front');e.editor.setView('top');nearV(Object.values(e.editor.viewBox),Object.values(camera));
  e.editor.set({...e.project,drawing:{...e.project.drawing,view:'side'}},e.model,[]);assert.equal(e.editor.view,'side');
 }finally{await e.close()}
});

test('déplacement précis en aperçu, validation unique, groupe rigide et profondeur inchangée',async()=>{
 const e=mount();try{
  const initial=structuredClone(e.project);e.editor.select(['A','B']);e.editor.setTool('move');
  const pending=e.editor.previewMove(['A','B'],[12.345,0,-37.125],{alt:true});nearV(pending.delta,[12.345,0,-37.125]);nearV(pending.parts[0].a,[12.345,0,-37.125]);near(pending.parts[1].a[0]-pending.parts[0].a[0],2000);
  assert.deepEqual(e.project,initial);assert.equal(e.events.move.length,0);pending.parts[0].a[0]=999;near(e.editor.getPending().parts[0].a[0],12.345);
  e.editor.confirmPreview();assert.equal(e.events.move.length,1);nearV(e.events.move[0].delta,[12.345,0,-37.125]);assert.equal(e.editor.getPending(),null);assert.equal(e.editor.confirmPreview(),false);
  assert.throws(()=>e.editor.previewMove(['A'],[0,1,0]),/profondeur/);
  e.editor.previewMove(['A'],[10,0,0],{alt:true});e.editor.clearPreview();assert.equal(e.events.move.length,1);
 }finally{await e.close()}
});

test('glisser en outil déplacement prépare puis valider applique, annuler ne déplace rien',async()=>{
 const e=mount();try{
  e.editor.setTool('move');const start=e.editor.planToClient([0,0]),end=e.editor.planToClient([125,75]);
  e.pointer('pointerdown',start);e.pointer('pointermove',end);e.pointer('pointerup',end);nearV(e.editor.getPending().delta,[125,0,75]);assert.equal(e.events.move.length,0);e.editor.confirmPreview();assert.equal(e.events.move.length,1);
  e.pointer('pointerdown',start);e.pointer('pointermove',end);e.pointer('pointercancel',end);assert.equal(e.editor.getPending(),null);assert.equal(e.events.move.length,1);
 }finally{await e.close()}
});

test('grille stricte absolue dans chaque vue et Alt suspend les aides sans altérer la géométrie',async()=>{
 const e=mount([post('A',20,30)],{snap:true,grid:7,assistance:{guides:false,guideSnap:false,gridSnap:true,gridMode:'fixed',gridStep:100}});try{
  let pending=e.editor.previewMove(['A'],[135,0,130]);nearV(pending.parts[0].a,[200,0,200]);
  pending=e.editor.previewMove(['A'],[135.125,0,130.25],{alt:true});nearV(pending.parts[0].a,[155.125,0,160.25]);
  e.editor.clearPreview();e.editor.setView('front');pending=e.editor.previewMove(['A'],[135,140,0]);nearV(pending.delta,[180,100,0]);near(pending.parts[0].a[2],30);
 }finally{await e.close()}
});

test('poteau posé par un point, chevron tracé par deux points ; profondeur et section préservées',async()=>{
 const e=mount();try{
  const template=post('NEW',0,0,{a:[0,120,0],b:[0,2120,0],width:70,height:120});e.editor.beginPlacement(template);e.tap([300.25,400.5]);
  const point=e.editor.getPending();nearV(point.part.a,[300.25,120,400.5]);nearV(point.part.b,[300.25,2120,400.5]);assert.equal(e.events.place.length,0);e.editor.confirmPreview();assert.equal(e.events.place.length,1);
  const timber=beam('BNEW',[0,300,0],[1000,450,0],{roll:25});const before=structuredClone(timber);e.editor.beginPlacement(timber,{mode:'two-points'});e.tap([123.125,67.5]);assert.equal(e.editor.getPending(),null);e.tap([1123.875,267.25]);
  const pending=e.editor.getPending();nearV(pending.part.a,[123.125,300,67.5]);nearV(pending.part.b,[1123.875,450,267.25]);assert.equal(pending.part.roll,25);assert.deepEqual(timber,before);assert.equal(e.events.place.length,1);
  e.editor.clearPreview();assert.equal(e.editor.placement,null);assert.equal(e.editor.tool,'select');assert.equal(e.events.place.length,1);
 }finally{await e.close()}
});

test('deuxième point nul ou hors limites invalide un ancien fantôme, sans pose obsolète',async()=>{
 const e=mount();try{
  e.editor.beginPlacement(beam('NEW',[0,0,0],[1000,0,0]),{depth:42});e.editor.placementClick([100,100],true);e.editor.updatePlacement([500,100],true);assert.equal(e.editor.preview.length,1);
  e.editor.placementClick([100,100],true);assert.equal(e.editor.getPending(),null);assert.equal(e.editor.preview.length,0);
  e.editor.updatePlacement([500,100],true);e.editor.placementClick([100001,100],true);assert.equal(e.editor.getPending(),null);assert.equal(e.editor.preview.length,0);assert.equal(e.events.place.length,0);
  e.editor.placementClick([500,200],true);near(e.editor.getPending().part.a[1],42);near(e.editor.getPending().part.b[1],42);
 }finally{await e.close()}
});

test('pincement et fin des deux doigts ne déclenchent ni sélection ni pose',async()=>{
 const e=mount();try{
  const box={...e.editor.viewBox};e.editor.beginPlacement(post('NEW',0));
  e.pointer('pointerdown',[300,300],{pointerId:1,pointerType:'touch'});e.pointer('pointerdown',[500,300],{pointerId:2,pointerType:'touch'});e.pointer('pointermove',[550,300],{pointerId:2,pointerType:'touch'});e.pointer('pointerup',[550,300],{pointerId:2,pointerType:'touch'});e.pointer('pointerup',[300,300],{pointerId:1,pointerType:'touch'});
  assert.ok(e.editor.viewBox.width<box.width);assert.equal(e.events.select.length,0);assert.equal(e.editor.getPending(),null);assert.equal(e.events.place.length,0);
  e.pointer('pointerdown',[300,300],{pointerId:1,pointerType:'touch'});e.pointer('pointerdown',[500,300],{pointerId:2,pointerType:'touch'});e.pointer('pointercancel',[300,300],{pointerId:1,pointerType:'touch'});assert.equal(e.editor.pointers.size,0);assert.equal(e.editor.gesture,null);e.tap([300,300],{pointerType:'touch'});assert.equal(e.editor.getPending()?.kind,'placement');
 }finally{await e.close()}
});

test('cote accessible, SVG complet indépendant du zoom et des aperçus, XML échappé',async()=>{
 const e=mount(undefined,{name:'A < B & "atelier"',drawing:{automatic:true,autoLevel:'spacing',precision:.1,dimensions:[{id:'DIM-1',type:'axes',aPart:'A',bPart:'B',axis:'x',view:'top',offset:200,label:'Écart & repère'}]}});try{
  const dimension=e.editor.svg.querySelector('[data-plan-dimension="DIM-1"]');assert.ok(dimension);assert.equal(dimension.getAttribute('role'),'button');dimension.dispatchEvent(new e.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.deepEqual(e.events.dimension,['DIM-1']);
  const full=e.editor.exportSVG();e.editor.zoom(8);const camera={...e.editor.viewBox};e.editor.previewParts([post('GHOST',5000)]);assert.equal(e.editor.getPending(),null);
  assert.equal(e.editor.exportSVG(),full);assert.deepEqual(e.editor.viewBox,camera);assert.doesNotMatch(full,/GHOST|plan-dimension-hit|plan-part-selected/);assert.match(full,/A &lt; B &amp; &quot;atelier&quot;/);assert.match(full,/Écart &amp; repère/);
  const xml=new e.window.DOMParser().parseFromString(full,'image/svg+xml');assert.equal(xml.querySelector('parsererror'),null);assert.equal(xml.querySelectorAll('[data-plan-part]').length,2);assert.ok(xml.querySelector('[data-plan-dimension="DIM-1"]'));
  e.editor.previewMove(['A'],[25,0,0],{alt:true});assert.equal(e.editor.exportSVG(),full);
 }finally{await e.close()}
});

test('rangées de cotes séparées et cadrage export incluant les libellés décalés',async()=>{
 const dimensions=Array.from({length:4},(_,i)=>({id:`DIM-${i+1}`,type:'axes',aPart:'A',bPart:'B',axis:'x',view:'top',offset:200,label:i===0?'Un repère de fabrication volontairement très long pour contrôler les bords':'Cote de contrôle'}));
 const e=mount(undefined,{drawing:{automatic:true,dimensions}});try{
  const xml=new e.window.DOMParser().parseFromString(e.editor.exportSVG(),'image/svg+xml'),v=xml.documentElement.getAttribute('viewBox').split(' ').map(Number);
  const boxes=[...xml.querySelectorAll('.plan-dimension > rect')].map(rect=>({x:+rect.getAttribute('x'),y:+rect.getAttribute('y'),w:+rect.getAttribute('width'),h:+rect.getAttribute('height')}));
  assert.ok(boxes.length>=4);
  for(let i=0;i<boxes.length;i++){const a=boxes[i];assert.ok(a.x>=v[0]&&a.y>=v[1]&&a.x+a.w<=v[0]+v[2]&&a.y+a.h<=v[1]+v[3],'Le texte exporté reste dans le cadre');for(const b of boxes.slice(i+1))assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'Les libellés ne se recouvrent pas');}
 }finally{await e.close()}
});

test('1000 pièces : scène et grille bornées, cotes automatiques limitées, coordonnées finies',async()=>{
 const parts=Array.from({length:1000},(_,i)=>post(`P${i}`,i%40*300,Math.floor(i/40)*300));
 const e=mount(parts,{drawing:{automatic:true,autoLevel:'full',showGrid:true},assistance:{gridMode:'fixed',gridStep:.1,guides:false}});try{
  assert.equal(e.editor.items.length,1000);assert.equal(e.editor.layers.parts.querySelectorAll('[data-plan-part]').length,1000);assert.ok(e.editor.dimensions.length<=48);assert.ok(e.editor.layers.grid.querySelectorAll('line').length<=242);assert.equal(e.editor.gridInfo.limited,true);assert.match(e.editor.caption.textContent,/grille partielle/);assert.doesNotMatch(e.editor.exportSVG(),/NaN|Infinity/);
 }finally{await e.close()}
});
