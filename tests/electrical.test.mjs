import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {normalizeElectrical, electricalAction, electricalRows, electricalRouteLength, electricalRoutePoints, electricalPlanSVG, electricalSingleLineSVG, electricalView, electricalEventAction, electricalCSV, parseElectricalPoints} from '../src/electrical.js';

const fixture = () => normalizeElectrical({
  circuits:[{id:'c1',label:'Atelier',section:'2,5',cableRef:'Câble choisi',conduitRef:'ICTA choisie',protection:'Protection choisie',conductors:'L,N,PE'}],
  symbols:[{id:'s1',kind:'board',x:0,z:0,circuitId:'c1'}, {id:'s2',kind:'socket',x:3000,z:4000,circuitId:'c1',reference:'Prise choisie'}],
  routes:[{id:'r1',circuitId:'c1',from:'s1',to:'s2',points:[[0,0],[3000,0],[3000,4000]],vertical:2000,reserve:1000,margin:10}]
});

test('quantité câble et gaine : tracé + dénivelés + réserve + marge, sans multiplication par conducteurs', () => {
  const s = fixture(), length = electricalRouteLength(s, 'r1');
  assert.deepEqual(length, {horizontal:7,vertical:2,reserve:1,measured:9,purchase:11});
  const rows = electricalRows(s);
  assert.equal(rows.find(r => r.label.startsWith('Câble')).quantity, 11);
  assert.equal(rows.find(r => r.label.startsWith('Gaine')).quantity, 11);
  assert.equal(rows.find(r => r.label.startsWith('Protection')).quantity, 1);
  assert.equal(rows.filter(r => r.unit === 'u').length, 3);
  assert.ok(rows.every(r => r.quantity === r.qty));
});

test('conducteurs séparés : une longueur par repère, doublons de repères supprimés', () => {
  const s = fixture(); s.circuits[0].mode = 'wires'; s.circuits[0].conductors = 'L,N,PE,L';
  const rows = electricalRows(s), wires = rows.filter(r => r.label.startsWith('Conducteur'));
  assert.equal(wires.length, 3); assert.ok(wires.every(r => r.quantity === 11));
  assert.equal(rows.filter(r => r.label.startsWith('Câble')).length, 0);
  s.circuits[0].conductors = '';
  assert.equal(electricalRows(s).filter(r => r.label.startsWith('Conducteur')).length, 0);
  assert.match(electricalView(s), /sans repères/);
});

test('les extrémités suivent les appareils, les angles restent à leurs coordonnées', () => {
  const original = fixture();
  const moved = electricalAction(original, {type:'symbol',id:'s1',values:{x:1000,z:0}});
  assert.deepEqual(electricalRoutePoints(moved, 'r1'), [{x:1000,z:0},{x:3000,z:0},{x:3000,z:4000}]);
  assert.equal(electricalRouteLength(moved, 'r1').horizontal, 6);
  assert.equal(original.symbols[0].x, 0);
  assert.equal(electricalRouteLength(original, 'r1').horizontal, 7);
});

test('la suppression d’un appareil enlève ses trajets attachés et leurs achats', () => {
  const s = electricalAction(fixture(), {type:'deleteSymbol',id:'s2'});
  assert.equal(s.routes.length, 0); assert.equal(s.symbols.length, 1);
  assert.equal(electricalRows(s).some(r => r.unit === 'm'), false);
});

test('la suppression d’un circuit détache les symboles et supprime ses trajets', () => {
  const s = electricalAction(fixture(), {type:'deleteCircuit',id:'c1'});
  assert.equal(s.routes.length, 0); assert.equal(s.circuits.length, 0);
  assert.equal(s.symbols.length, 2); assert.ok(s.symbols.every(p => !p.circuitId));
});

test('tracé clic à clic : grille relative au plan, attache exacte et fin de trajet', () => {
  let s = fixture(); s.selectedCircuit = 'c1'; s.tool = 'route';
  s = electricalAction(s, {type:'point',symbolId:'s1'});
  s = electricalAction(s, {type:'point',x:3127,z:74});
  s = electricalAction(s, {type:'point',symbolId:'s2'});
  assert.deepEqual(s.draft[1], {x:3150,z:50,symbolId:''});
  s = electricalAction(s, {type:'finishRoute'});
  const route = s.routes.at(-1);
  assert.equal(route.from, 's1'); assert.equal(route.to, 's2');
  assert.equal(route.circuitId, 'c1'); assert.equal(s.tool, 'select'); assert.equal(s.draft.length, 0);
  const saved = JSON.parse(JSON.stringify(s));
  assert.deepEqual(normalizeElectrical(saved), s);
});

test('coordonnées saisies précises, circuit obligatoire pour un trajet', () => {
  let s = electricalAction({}, {type:'symbol',values:{x:12.345,z:678.901,kind:'switch'}});
  assert.equal(s.symbols[0].x, 12.345); assert.equal(s.symbols[0].z, 678.901);
  assert.throws(() => electricalAction(s, {type:'route',values:{points:'0,0;100,100'}}), /circuit/);
  assert.throws(() => electricalAction(s, {type:'finishRoute'}), /au moins deux/);
  assert.deepEqual(parseElectricalPoints('12.5,17\n2000,15'), [{x:12.5,z:17},{x:2000,z:15}]);
  assert.throws(() => parseElectricalPoints('1,2;3,nope'), /deux nombres/);
});

test('normalisation robuste : IDs uniques, imports bornés, aucun dimensionnement implicite', () => {
  const s = normalizeElectrical({width:Infinity,depth:-1,circuits:[{id:'same'}, {id:'same'}],symbols:[null,{id:'same',x:NaN,z:Infinity}],routes:[{points:[[0,0]],circuitId:'absent'}]});
  assert.equal(s.width, 6000); assert.equal(s.depth, 100); assert.equal(s.routes.length, 0);
  const ids = [...s.circuits,...s.symbols].map(x => x.id); assert.equal(new Set(ids).size, ids.length);
  assert.ok(s.circuits.every(c => c.section === '' && c.protection === '' && c.conductors === ''));
  assert.deepEqual(normalizeElectrical(null), normalizeElectrical({}));
});

test('les variantes de référence et section gardent leurs quantités distinctes', () => {
  const s = fixture();
  s.circuits.push({...s.circuits[0],id:'c2',section:'1,5'});
  s.routes.push({...s.routes[0],id:'r2',circuitId:'c2'});
  const rows = electricalRows(s);
  assert.equal(rows.filter(r => r.label.startsWith('Câble')).length, 2);
  assert.equal(rows.find(r => r.label.startsWith('Gaine')).quantity, 22);
  assert.equal(rows.find(r => r.label.startsWith('Protection')).quantity, 2);
  assert.match(electricalCSV(s), /"22";"m"/);
});

test('identifiants achats stables, bornés et ASCII avec références longues, accents et séparateurs', () => {
  const s = fixture();
  s.symbols[0].reference = 'Équipement spécial / réf. très longue '.repeat(6);
  s.symbols[1].reference = 'équipement spécial / réf. très longue '.repeat(6);
  s.circuits[0].cableRef = 'a-b'; s.circuits[0].section = 'c';
  s.circuits.push({...s.circuits[0],id:'c2',cableRef:'a',section:'b-c'});
  s.routes.push({...s.routes[0],id:'r2',circuitId:'c2'});
  const rows = electricalRows(s), ids = rows.map(r => r.id);
  assert.ok(ids.every(id => /^[a-zA-Z0-9_.:-]{1,120}$/.test(id)));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(rows.filter(r => r.label.startsWith('Câble')).length, 2);
  assert.deepEqual(electricalRows(JSON.parse(JSON.stringify(s))).map(r => r.id), ids);
  s.symbols.reverse(); s.circuits.reverse(); s.routes.reverse();
  assert.deepEqual(electricalRows(s).map(r => r.id).sort(), [...ids].sort());
});

test('CSV neutralise les repères interprétables comme formules', () => {
  for (const id of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1', ' =1']) {
    const csv = electricalCSV({symbols:[{id,kind:'socket'}]});
    assert.ok(csv.includes(`"'${id}"`), `Repère non neutralisé : ${JSON.stringify(id)}`);
  }
});

test('SVG et vue acceptent projet entier, textes échappés et absence de validation réglementaire', () => {
  const s = fixture(); s.title = '<script>alert(1)</script>'; s.symbols[0].label = '<img onerror="x">';
  const window = new Window();
  for (const output of [electricalPlanSVG({electrical:s}), electricalSingleLineSVG({electrical:s})]) {
    const parsed = new window.DOMParser().parseFromString(output, 'image/svg+xml');
    assert.equal(parsed.querySelector('parsererror'), null); assert.equal(parsed.querySelector('script'), null);
    assert.match(output, /&lt;script&gt;/);
  }
  const view = electricalView({electrical:s});
  assert.match(view, /la conformité et le câblage réel restent à vérifier/);
  assert.match(view, /data-electrical-form="route"/);
  assert.deepEqual(electricalRows({electrical:s}), electricalRows(s));
  window.happyDOM.abort();
});

test('adaptateur DOM : circuit saisi, sélection appareil, clic de placement et export', () => {
  const window = new Window(), doc = window.document, s = fixture();
  doc.body.innerHTML = electricalView(s);
  const circuitForm = doc.querySelector('[data-electrical-form="circuit"]');
  circuitForm.querySelector('[name="label"]').value = 'Prises annexe';
  const action = electricalEventAction({type:'submit',target:circuitForm}, s);
  assert.equal(action.type, 'circuit'); assert.equal(action.values.label, 'Prises annexe');
  assert.equal(electricalAction(s,action).circuits.length, 2);
  const symbol = doc.querySelector('[data-electrical-symbol="s2"] text');
  assert.deepEqual(electricalEventAction({type:'click',target:symbol}, s), {type:'select',id:'s2'});
  const exportButton = doc.querySelector('[data-electrical-action="export-plan"]');
  assert.equal(electricalEventAction({type:'click',target:exportButton},s).type,'export-plan');
  const svg = doc.querySelector('[data-electrical-plan]');
  svg.getBoundingClientRect = () => ({left:0,top:0,width:1000,height:700});
  const click = electricalEventAction({type:'click',target:svg,clientX:500,clientY:350}, {...s,tool:'socket'});
  assert.equal(Math.round(click.x), 3000); assert.equal(Math.round(click.z), 2000);
  assert.equal(electricalEventAction({type:'click',target:svg,clientX:1,clientY:1},s), null);
  window.happyDOM.abort();
});
