import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWorkshop,planTimber,planPanels,planMeshRolls,extraBOMRows,applyCatalogue,applyWorkshopBOM,workshopAction,workshopView,parseCommercialLengths,applyCommercialLengths,compareTimberLengths,timberQuickSetup,timberLengthsComparison,timberPlanView,formatCutDimension} from '../src/materials.js';
import {normalizeProject,buildProject,calculateBOM} from '../src/engine.js';

const beam=(id,length,species='pin',width=45,height=70)=>({id,label:id,material:'wood',kind:'beam',length,species,width,height});
const timber=(extra={})=>({id:'S',kind:'purchase',qty:0,species:'pin',width:45,height:70,length:3000,...extra});
const board=(id,width,height,extra={})=>({id,kind:'panel',material:'wood',species:'pin',width:18,corners:[[0,0,0],[width,0,0],[width,height,0],[0,height,0]],...extra});
const plaque=(extra={})=>({id:'P',kind:'purchase',qty:0,material:'wood',species:'pin',width:1250,height:2500,thickness:18,allowRotate:false,...extra});

test('normalisation conserve les identités et données sans prototype ni balisage',()=>{
  const p=normalizeWorkshop({useTimberStock:true,timberStock:[timber({id:'__proto__',qty:-2})],catalogue:[{id:'CAT',label:'<script>x</script>',price:NaN}],extras:[{id:'CAT',qty:4}]});
  assert.equal(p.timberStock[0].qty,0);assert.notEqual(p.timberStock[0].id,'__proto__');assert.notEqual(p.extras[0].id,p.catalogue[0].id);assert.ok(!p.catalogue[0].label.includes('<'));assert.equal(p.catalogue[0].price,0);assert.deepEqual(normalizeWorkshop(JSON.parse(JSON.stringify(p))),p);
});

test('débit : trait de scie réel et conservation exacte de la longueur',()=>{
  const w={useTimberStock:true,timberStock:[timber({length:1000})]};
  let plan=planTimber([beam('A',500),beam('B',497)],w,{kerf:3});
  assert.equal(plan.boards.length,1);assert.equal(plan.boards[0].remaining,0);assert.equal(plan.boards[0].sawWaste,3);assert.equal(plan.cuts[1].start,503);
  plan=planTimber([beam('A',500),beam('B',500)],w,{kerf:3});assert.equal(plan.boards.length,2);
  for(const b of plan.boards)assert.equal(b.length,b.cuts.reduce((s,c)=>s+c.length,0)+b.sawWaste+b.remaining);
});

test('chutes et stock limité consommés avant achat, aucune confusion d’essence/section',()=>{
  const w={useTimberStock:true,timberStock:[timber({id:'achat',length:2400}),timber({id:'chute',kind:'offcut',qty:1,length:1100}),timber({id:'stock',kind:'stock',qty:1,length:1200})]};
  const plan=planTimber([beam('A',1000),beam('B',1000),beam('C',1000),beam('D',1000,'douglas'),beam('E',1000,'pin',90,90)],w,{kerf:3});
  assert.deepEqual(plan.boards.map(b=>b.stockId),['chute','stock','achat']);assert.equal(plan.purchases[0].qty,1);assert.deepEqual(plan.missing.map(p=>p.id),['D','E']);assert.equal(plan.unusedStock.length,0);
  assert.equal(plan.boards[0].remaining,97);assert.equal(w.timberStock[1].qty,1,'entrée non mutée');
});

test('formats multiples et quantité achat limitée : manquants explicites',()=>{
  const plan=planTimber([beam('A',2800),beam('B',1000),beam('C',2800)],{useTimberStock:true,timberStock:[timber({id:'court',length:2400,qty:1}),timber({id:'long',length:3000,qty:1})]});
  assert.equal(plan.boards.length,2);assert.equal(plan.missing.length,1);assert.equal(plan.missing[0].length,2800);assert.equal(plan.purchases.reduce((s,p)=>s+p.qty,0),2);
});

test('multi-longueurs : choisit une barre longue quand elle regroupe mieux les pièces',()=>{
  const plan=planTimber([beam('A',1500),beam('B',1500)],{useTimberStock:true,timberStock:[timber({id:'court',length:2400}),timber({id:'long',length:4000})]});
  assert.equal(plan.boards.length,1);assert.equal(plan.boards[0].stockId,'long');assert.equal(plan.boards[0].remaining,994);
});

test('mode historique produit une longueur par section sans exiger de catalogue',()=>{
  const plan=planTimber([beam('A',2000),beam('B',500),beam('C',1000,'douglas')],{}, {defaultLength:3000,kerf:3});
  assert.equal(plan.boards.length,2);assert.equal(plan.missing.length,0);assert.equal(plan.boards[0].remaining,494);
});

test('panneaux : découpes et chutes restent disjointes, rotation explicite',()=>{
  const parts=[board('A',1000,600),board('B',1000,600)];
  const plan=planPanels(parts,{panelStock:[plaque({width:2003,height:603})]},{kerf:3});
  assert.equal(plan.sheets.length,1);assert.equal(plan.sheets[0].cuts.length,2);assert.equal(plan.missing.length,0);
  const a=plan.sheets[0].cuts[0],b=plan.sheets[0].cuts[1];assert.equal(b.x,a.width+3);
  const no=planPanels([board('C',1200,2000)],{panelStock:[plaque({width:2500,height:1250})]});assert.equal(no.missing.length,1);
  const yes=planPanels([board('C',1200,2000)],{panelStock:[plaque({width:2500,height:1250,allowRotate:true})]});assert.equal(yes.sheets[0].cuts[0].rotated,true);
});

test('panneaux : essence/épaisseur, stocks et formes non rectangulaires respectés',()=>{
  const trapezoid=board('T',1000,500);trapezoid.corners[2][0]=900;
  const plan=planPanels([board('A',1000,600),board('B',1000,600,{width:21}),board('C',1000,600,{species:'douglas'}),trapezoid],{panelStock:[plaque({kind:'stock',qty:1,width:1000,height:600})]});
  assert.equal(plan.sheets.length,1);assert.equal(plan.purchases.length,0);assert.equal(plan.missing.length,3);assert.match(plan.missing.find(p=>p.id==='T').reason,/non rectangulaire/);
});

test('grillage : lés indivisibles, recouvrement et rouleaux détaillés',()=>{
  const p=board('M',1800,2000,{material:'mesh',surfaceWidth:1800,surfaceHeight:2000});
  const plan=planMeshRolls([p],{meshRollWidth:1000,meshRollLength:5000,meshOverlap:50});
  assert.equal(plan.strips.length,2);assert.equal(plan.rolls.length,1);assert.equal(plan.rolls[0].remaining,800);assert.equal(plan.strips[0].length,2100);assert.equal(plan.strips[1].width,950);
});

test('grillage intégré : les rouleaux du plan correspondent aux achats avec stock et réserve',()=>{
  const scenarios=[
    {},
    {width:5200,depth:3300,height:2400,roofRise:260,meshRollWidth:1200,meshRollLength:10000},
    {mode:'free',freeParts:[board('M1',2700,1900,{material:'mesh',width:1}),board('M2',5400,1300,{material:'mesh',width:1}),board('M3',1250,900,{material:'mesh',width:1})],meshRollWidth:1000,meshRollLength:5000},
    {mode:'free',freeParts:[board('M1',800,3100.125,{material:'mesh',width:1}),board('M2',700,3200.375,{material:'mesh',width:1})],meshRollWidth:1000,meshRollLength:5000}
  ];
  for(const raw of scenarios)for(const margin of [0,10,35])for(const stock of [0,2.5,10,37.5,500]){
    const p=normalizeProject({...raw,margin,stock:{'mesh-roll':stock}}),model=buildProject(p),plan=planMeshRolls(model.parts,p),row=calculateBOM(p,model).find(r=>r.id==='mesh-roll');
    assert.equal(plan.missing.length,0);assert.equal(plan.purchaseCount,row.packs,`écart stock ${stock}, marge ${margin}, mode ${p.mode}`);
    assert.ok(Math.abs(plan.totalLength/1000-row.required)<.001);
    assert.equal(plan.stockRolls.flatMap(r=>r.cuts).length+plan.purchaseRolls.flatMap(r=>r.cuts).length,plan.strips.length);
    if(!stock&&!margin)assert.equal(plan.rolls.length,row.packs);
  }
});

test('catalogue grillage conserve les rouleaux imposés par les lés indivisibles après stock',()=>{
  const raw={mode:'free',freeParts:['A','B','C'].map(id=>board(id,1000,14000,{material:'mesh',width:1})),meshRollWidth:1000,meshRollLength:25000,meshOverlap:0,margin:0,stock:{'mesh-roll':25},workshop:{catalogue:[{id:'C',rowId:'mesh-roll',label:'Grillage fournisseur',unit:'m',packSize:25,price:50}]}};
  let p=normalizeProject(raw),model=buildProject(p),row=calculateBOM(p,model).find(r=>r.id==='mesh-roll');
  assert.equal(row.required,42);assert.equal(row.toBuy,17);assert.equal(row.packs,2);assert.equal(row.total,100);assert.equal(planMeshRolls(model.parts,p).purchaseCount,2);
  raw.workshop.catalogue[0].packSize=10;p=normalizeProject(raw);row=calculateBOM(p).find(r=>r.id==='mesh-roll');assert.equal(row.packSize,25);assert.equal(row.priced,false);
});

test('catalogue électrique accepte l’unité u des points de schéma',()=>{
  const p={workshop:{catalogue:[{id:'C',rowId:'electrical-socket',label:'Prise',unit:'u',packSize:5,price:20}]}};
  const row=applyCatalogue([{id:'electrical-socket',unit:'u',toBuy:7,packs:7,packSize:1}],p)[0];
  assert.equal(row.packs,2);assert.equal(row.total,40);assert.equal(normalizeWorkshop(p.workshop).catalogue[0].unit,'u');
});

test('articles complémentaires et catalogue : paquets, stock, tarifs prioritaires et unités',()=>{
  const p={workshop:{catalogue:[{id:'C',label:'Peinture',unit:'L',packSize:2.5,price:30,reference:'Ref1',supplier:'Magasin'}],extras:[{id:'E',catalogueId:'C',label:'Ignoré',qty:6,stock:1}]},prices:{},stock:{}};
  let rows=extraBOMRows(p);assert.equal(rows[0].packs,2);assert.equal(rows[0].purchaseQty,5);assert.equal(rows[0].total,60);assert.equal(rows[0].supplier,'Magasin');
  p.prices['extra-E']=25;assert.equal(extraBOMRows(p)[0].total,50);
  const base={id:'joint-vis',unit:'pièce',label:'Vis',toBuy:22,packs:1,packSize:100};
  p.workshop.catalogue=[{id:'C2',rowId:'joint-vis',unit:'pièce',label:'Vis inox',packSize:10,price:6}];
  rows=applyCatalogue([base],p);assert.equal(rows[0].packs,3);assert.equal(rows[0].total,18);
  p.workshop.catalogue[0].unit='kg';assert.deepEqual(applyCatalogue([base],p),[base]);
});

test('BOM multi-stock remplace seulement la matière, conserve les fixations de toiture',()=>{
  const project={kerf:3,prices:{},stock:{},workshop:{useTimberStock:true,usePanelStock:true,timberStock:[timber({kind:'offcut',qty:1,length:1100})],panelStock:[plaque()]}};
  const rows=applyWorkshopBOM([{id:'old',category:'Bois'},{id:'roof-cover',category:'Couverture'},{id:'roof-fasteners',category:'Fixations',required:12}],project,{parts:[beam('A',1000),board('P',1000,1000)]});
  assert.ok(!rows.some(r=>r.id==='old'||r.id==='roof-cover'));assert.ok(rows.some(r=>r.id==='roof-fasteners'));assert.equal(rows.filter(r=>r.category==='Bois').length,0);assert.equal(rows.find(r=>r.category==='Panneaux').required,1);
});

test('actions formulaires : modification stable, suppression et décochage rotation',()=>{
  let w=workshopAction({},'save-panel',{width:1200,height:2400,thickness:18,allowRotate:'on'});const id=w.panelStock[0].id;
  w=workshopAction(w,'save-panel',{id,width:1000,height:2400,thickness:18});assert.equal(w.panelStock.length,1);assert.equal(w.panelStock[0].allowRotate,false);assert.equal(w.panelStock[0].width,1000);
  w=workshopAction(w,'remove-panel',{id});assert.equal(w.panelStock.length,0);
  assert.match(workshopView({workshop:w},{parts:[]}),/data-workshop-form="settings"/);
});

test('longueurs commerciales : saisie multiple, virgule décimale et contrôles explicites',()=>{
  assert.deepEqual(parseCommercialLengths(['4000','2400 ; 3500,5','4000 3000']),[2400,3000,3500.5,4000]);
  for(const value of [[],['0'],['-3000'],['abc'],[true],[100001]])assert.throws(()=>parseCommercialLengths(value));
  assert.throws(()=>parseCommercialLengths(Array.from({length:33},(_,i)=>2000+i)),/32/);
});

test('accès rapide : applique chaque longueur par essence et section en préservant les stocks et références personnelles',()=>{
  const original={material:'pin',workshop:{usePanelStock:true,catalogue:[{id:'CAT',label:'Vis inox',unit:'pièce',packSize:20,price:5}],extras:[{id:'EXTRA',label:'Peinture',qty:2}],panelStock:[plaque()],timberStock:[timber({id:'CHUTE',kind:'offcut',length:1200,qty:2}),timber({id:'STOCK',kind:'stock',length:4000,qty:3}),timber({id:'MANUEL',kind:'purchase',length:3000,qty:4,price:15})]}};
  const copy=structuredClone(original),model={parts:[beam('A',1000),beam('B',1000,'pin',70,45),beam('C',1500,'douglas',90,90)]};
  const next=applyCommercialLengths(original,[2400,3000],model),before=normalizeWorkshop(original.workshop);
  assert.equal(next.useTimberStock,true);assert.equal(next.usePanelStock,true);assert.deepEqual(next.commercialLengths,[2400,3000]);assert.deepEqual(original,copy);
  assert.deepEqual(next.timberStock.filter(s=>!s.generated),before.timberStock);
  for(const key of ['catalogue','extras','panelStock'])assert.deepEqual(next[key],before[key]);
  const generated=next.timberStock.filter(s=>s.generated);assert.equal(generated.length,3);assert.ok(generated.every(s=>s.qty===0&&s.kind==='purchase'));
  assert.equal(next.timberStock.filter(s=>s.species==='pin'&&s.kind==='purchase'&&s.length===3000).length,1);
  assert.deepEqual(normalizeWorkshop(JSON.parse(JSON.stringify(next))),next);
});

test('réappliquer les formats conserve les identités et prix, puis retire seulement les anciennes sources générées',()=>{
  const model={parts:[beam('A',1500),beam('B',1500)]};
  let p={workshop:applyCommercialLengths({},[2400,4000],model)};
  const source=p.workshop.timberStock.find(s=>s.length===4000),id=source.id;source.price=25;
  let next=applyCommercialLengths(p,[3000,4000],model);
  assert.equal(next.timberStock.find(s=>s.length===4000).id,id);assert.equal(next.timberStock.find(s=>s.length===4000).price,25);assert.ok(!next.timberStock.some(s=>s.length===2400));
  p.workshop=workshopAction(next,'save-timber',{...next.timberStock.find(s=>s.id===id),price:'30'});
  assert.equal(p.workshop.timberStock.find(s=>s.id===id).generated,'quick-lengths');
  p.workshop=workshopAction(p.workshop,'save-timber',{...p.workshop.timberStock.find(s=>s.id===id),kind:'stock',qty:1});
  next=applyCommercialLengths(p,[4000],model);
  assert.equal(next.timberStock.find(s=>s.id===id).kind,'stock');assert.equal(next.timberStock.find(s=>s.id===id).generated,undefined);assert.equal(next.timberStock.length,2);
  assert.notEqual(next.timberStock.find(s=>s.kind==='purchase').id,id);
});

test('référence manuelle limitée : la génération rapide ne crée pas une disponibilité illimitée concurrente',()=>{
  const p={workshop:{timberStock:[timber({id:'COMMANDE',qty:1,length:3000,price:18})]}},model={parts:[beam('A',2000),beam('B',2000)]};
  const w=applyCommercialLengths(p,[3000],model),plan=planTimber(model.parts,w);
  assert.equal(w.timberStock.length,1);assert.equal(w.timberStock[0].qty,1);assert.equal(plan.purchases[0].qty,1);assert.equal(plan.missing.length,1);
});

test('comparatif multi-longueurs et achats moteur cohérents, sans consommation du stock',()=>{
  let p=normalizeProject({mode:'free',woodStockLength:3000,kerf:3,freeParts:[{...beam('A',1500),a:[0,0,0],b:[1500,0,0]},{...beam('B',1500),a:[0,500,0],b:[1500,500,0]}],workshop:{timberStock:[timber({id:'CHUTE',kind:'offcut',qty:1,length:500})]}});
  const model=buildProject(p),comparison=compareTimberLengths(p,model,[2400,4000]);
  assert.equal(comparison.currentSummary.purchaseBoards,2);assert.equal(comparison.proposedSummary.purchaseBoards,1);assert.equal(comparison.proposedSummary.purchaseLength,4000);
  p=normalizeProject({...p,workshop:comparison.workshop});const before=structuredClone(p.workshop),plan=planTimber(model.parts,p.workshop,{kerf:p.kerf}),rows=calculateBOM(p,model).filter(r=>r.category==='Bois');
  assert.equal(rows.reduce((s,r)=>s+r.required,0),plan.stats.purchaseBoards);assert.deepEqual(p.workshop,before);assert.equal(p.workshop.timberStock.find(s=>s.id==='CHUTE').qty,1);
  assert.match(timberQuickSetup(p,model),/data-commercial-lengths/);assert.match(timberQuickSetup(p,model),/data-page="workshop"/);assert.match(timberLengthsComparison(p,model,[]),/Choisissez au moins une longueur/);
});

test('cotes de débit : arrondi visuel au mm ou demi-mm, aucun changement de longueur interne',()=>{
  assert.equal(formatCutDimension(1000.36,1),'1\u202f000');assert.equal(formatCutDimension(1000.36,.5),'1\u202f000,5');
  const plan=planTimber([beam('A',1000.36)],{},{defaultLength:2400,kerf:3}),copy=structuredClone(plan);
  const html=timberPlanView(plan,{precision:.5});assert.match(html,/1\u202f000,5/);assert.match(html,/demi-millimètre/);assert.deepEqual(plan,copy);
});

test('migration : le stock historique et son alias sont repris une seule fois, sans faire réapparaître un achat',()=>{
  let p=normalizeProject({mode:'free',woodStockLength:3000,freeParts:[{...beam('A',1500),a:[0,0,0],b:[1500,0,0]}],stock:{'wood-45x70-3000':1,'wood-pin-45x70-3000':1},prices:{'wood-pin-45x70-3000':18}});
  const model=buildProject(p),original=structuredClone(p),before=calculateBOM(p,model).find(r=>r.category==='Bois'),comparison=compareTimberLengths(p,model,[2400,3000]);
  assert.equal(before.packs,0);assert.equal(comparison.currentSummary.purchaseBoards,0);assert.equal(comparison.currentSummary.stockBoards,1);assert.equal(comparison.proposedSummary.purchaseBoards,0);assert.deepEqual(p,original);
  p=normalizeProject({...p,workshop:comparison.workshop});
  assert.equal(calculateBOM(p,model).filter(r=>r.category==='Bois').reduce((s,r)=>s+r.packs,0),0);
  const imported=p.workshop.timberStock.filter(s=>s.legacyStockRow);assert.equal(imported.length,1);assert.deepEqual([imported[0].width,imported[0].height,imported[0].length,imported[0].qty],[45,70,3000,1]);assert.equal(imported[0].species,'pin');assert.equal(imported[0].price,18);
  assert.equal(p.workshop.timberStock.find(s=>s.generated&&s.length===3000).price,18);assert.deepEqual(p.workshop.migratedTimberStockRows,['wood-pin-45x70-3000']);
  const next=applyCommercialLengths(p,[2400,3000],model);assert.deepEqual(next,p.workshop);assert.deepEqual(normalizeWorkshop(JSON.parse(JSON.stringify(next))),next);
});

test('migration : supprimer un stock importé puis désactiver/réactiver ne le réimporte pas',()=>{
  const model={parts:[beam('A',1500)]};let p={stock:{'wood-pin-45x70-3000':2},workshop:{timberStock:[timber({id:'MANUEL',kind:'offcut',qty:1,length:700,price:4})]}};
  p.workshop=applyCommercialLengths(p,[3000],model);const imported=p.workshop.timberStock.find(s=>s.legacyStockRow),manual=structuredClone(p.workshop.timberStock.find(s=>s.id==='MANUEL'));
  p.workshop=workshopAction(p.workshop,'remove-timber',{id:imported.id});p.workshop.useTimberStock=false;
  const next=applyCommercialLengths(p,[3000,4000],model);assert.equal(next.timberStock.filter(s=>s.legacyStockRow).length,0);assert.deepEqual(next.timberStock.find(s=>s.id==='MANUEL'),manual);assert.equal(next.migratedTimberStockRows.length,1);
});

test('migration : une fraction de barre reste à mesurer, sans inventer une chute continue',()=>{
  const model={parts:[beam('A',2000),beam('B',1000)]};let p={woodStockLength:3000,stock:{'wood-pin-45x70-3000':1.5}};
  p.workshop=applyCommercialLengths(p,[3000],model);const physical=p.workshop.timberStock.filter(s=>s.kind!=='purchase');
  assert.equal(physical.length,1);assert.equal(physical[0].qty,1);assert.equal(physical[0].length,3000);assert.deepEqual(p.workshop.legacyTimberStockWarnings,[{rowId:'wood-pin-45x70-3000',fraction:.5,length:3000}]);
  assert.match(workshopView(p,model),/fraction historique à mesurer dans Stock/);
  p.workshop=workshopAction(p.workshop,'acknowledge-legacy-stock',{id:'wood-pin-45x70-3000'});
  const repeated=applyCommercialLengths(p,[3000],model);assert.equal(repeated.legacyTimberStockWarnings.length,0);assert.equal(repeated.timberStock.filter(s=>s.kind==='stock').length,1);
});

test('migration : les zéros explicites remplacent les anciens alias et les références spéciales ne deviennent pas des barres',()=>{
  const model={parts:[beam('A',1500)]},p={material:'pin',stock:{'wood-45x70-3000':2,'wood-pin-45x70-3000':0,'wood-custom-pin-45x70-1500':3},prices:{'wood-45x70-3000':22,'wood-pin-45x70-3000':0}};
  const w=applyCommercialLengths(p,[3000],model);assert.equal(w.timberStock.filter(s=>s.kind==='stock').length,0);assert.equal(w.timberStock[0].price,0);assert.equal(w.migratedTimberStockRows.length,0);
});
