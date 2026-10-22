import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { timberQuaternion } from '../src/geometry.js';
import { normalizeDrawing, parseDimensionInput, createDimension, measureDimension, previewDimensionEdit, getPlanDimensions } from '../src/plan-dimensions.js';

const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const near3 = (a, b) => a.forEach((x, i) => near(x, b[i]));
const wood = (id, a, b, extra = {}) => ({ id, label: id, kind: 'beam', material: 'wood', a, b, width: 45, height: 90, roll: 0, ...extra });
const post = (id, x, z = 0, extra = {}) => wood(id, [x, 0, z], [x, 2000, z], { kind: 'post', width: 100, height: 100, ...extra });
const project = (parts, extra = {}) => ({ mode: 'free', freeParts: parts, freeJoints: [], drawing: normalizeDrawing(), ...extra });
const dimensioned = (p, type, ids, options = {}) => ({ ...p, drawing: createDimension(p, type, ids, options) });
const first = p => p.drawing.dimensions[0];
const auto = (p, view = 'top', level = 'spacing', limit = 40) => getPlanDimensions(p, null, { view, level, limit }).filter(d => d.automatic);

test('normalisation/import : IDs uniques, compteur croissant et aucune valeur figée', () => {
  const raw = { version: 77, view: 'front', precision: 0.5, nextId: 3, dimensions: [
    { id: 'DIM-50', type: 'axes', aPart: 'A', bPart: 'removed', axis: 'Z', value: 9876, label: '<b>Ouverture</b>' },
    { id: 'DIM-50', type: 'gap', aPart: 'A', bPart: 'B', axis: ['x'] },
    { id: '__proto__', type: 'length', aPart: 'A' },
    { id: 'AUTO-top-overall-x', type: 'length', aPart: 'A' },
    { id: 'DIM-80', type: 'unknown', aPart: 'A' }
  ] };
  const before = JSON.stringify(raw), normalized = normalizeDrawing(raw);
  assert.equal(normalized.version, 1); assert.equal(normalized.view, 'front'); assert.equal(normalized.precision, 0.5);
  assert.equal(normalized.dimensions.length, 4); assert.equal(new Set(normalized.dimensions.map(d => d.id)).size, 4);
  assert.equal(normalized.dimensions[0].id, 'DIM-50'); assert.equal(normalized.dimensions[0].bPart, 'removed');
  assert.equal(normalized.dimensions[0].axis, 'z'); assert.equal(normalized.dimensions[1].axis, 'x');
  assert.ok(normalized.nextId > 83); assert.ok(normalized.dimensions.every(d => !Object.hasOwn(d, 'value')));
  assert.ok(!normalized.dimensions[0].label.includes('<')); assert.equal(JSON.stringify(raw), before);
  assert.deepEqual(normalizeDrawing(JSON.parse(JSON.stringify(normalized))), normalized);
  const oldCounter = normalizeDrawing({ nextId: 900, dimensions: [] }); assert.equal(oldCounter.nextId, 900);
});

test('import invalide borné, références dangereuses neutralisées et options stables', () => {
  assert.equal(normalizeDrawing(null).dimensions.length, 0);
  const p = normalizeDrawing({ view: 'constructor', precision: 'bad', automatic: false, autoLevel: 'full', dimensions: [{ id: 'd', type: 'axes', aPart: '__proto__', bPart: 'B', offset: Infinity, axis: {} }] });
  assert.equal(p.view, 'top'); assert.equal(p.precision, 1); assert.equal(p.automatic, false); assert.equal(p.autoLevel, 'full');
  assert.equal(p.dimensions[0].aPart, ''); assert.equal(p.dimensions[0].offset, 200);
  assert.equal(normalizeDrawing({ dimensions: Array.from({ length: 700 }, (_, i) => ({ id: `d${i}`, type: 'length', aPart: 'A' })) }).dimensions.length, 500);
});

test('saisie française : unités, décimales et milliers sans évaluation de code', () => {
  for (const [input, expected] of [['0,5 m', 500], ['.5m', 500], ['20,125 cm', 201.25], ['1\u202f234,5 mm', 1234.5], ['1 200 cm', 12000], ['+2.75M', 2750], ['0', 0], [42.125, 42.125], ['-2 cm', -20]]) near(parseDimensionInput(input), expected);
  for (const input of ['', null, true, Infinity, '1e3', '1,2.3', '5+6', 'Math.PI', '1/2m', '12 34mm', '2mfoo', '0x10', 'alert(1)', '1,']) assert.equal(parseDimensionInput(input), null, String(input));
});

test('création : ordre des références, compte exact, références validées et IDs jamais réutilisés', () => {
  const p = project([post('A', 0), post('B', 1000)]), before = JSON.stringify(p);
  const firstDrawing = createDimension(p, 'axes', ['B', 'A'], { axis: 'x' });
  assert.equal(firstDrawing.dimensions[0].aPart, 'B'); assert.equal(firstDrawing.dimensions[0].bPart, 'A'); assert.equal(firstDrawing.dimensions[0].side, -1);
  const next = createDimension({ ...p, drawing: { ...firstDrawing, dimensions: [] } }, 'length', ['A']);
  assert.equal(next.dimensions[0].id, 'DIM-2'); assert.equal(JSON.stringify(p), before);
  assert.throws(() => createDimension(p, 'axes', ['A', 'A']), /distinctes/);
  assert.throws(() => createDimension(p, 'length', ['A', 'B']), /exactement/);
  assert.throws(() => createDimension(p, 'gap', ['A', 'missing']), /absente/);
  assert.throws(() => createDimension(p, 'bad', ['A']), /type/);
});

test('mesure live : les nombres exacts suivent la pièce sans arrondi de calcul', () => {
  const p = dimensioned(project([post('A', 0), post('B', 1234.123456)]), 'axes', ['A', 'B']);
  const before = measureDimension(p, first(p)); near(before.value, 1234.123456); assert.match(before.label, /1.?234 mm/);
  const moved = structuredClone(p); moved.freeParts[1].a[0] = moved.freeParts[1].b[0] = 1789.654321;
  near(measureDimension(moved, first(moved)).value, 1789.654321); near(measureDimension(p, first(p)).value, 1234.123456);
  assert.equal(before.status, 'ok'); assert.equal(before.editable, true); assert.ok(before.lines.some(l => l.role === 'dimension'));
});

test('référence supprimée : état missing et aucune ancienne valeur après sauvegarde', () => {
  let p = dimensioned(project([post('A', 0), post('B', 1000)]), 'gap', ['A', 'B']);
  near(measureDimension(p, first(p)).value, 900);
  p = JSON.parse(JSON.stringify({ ...p, freeParts: [p.freeParts[0]] })); p.drawing = normalizeDrawing(p.drawing);
  const result = measureDimension(p, first(p));
  assert.equal(result.status, 'missing'); assert.equal(result.value, null); assert.equal(result.a, null); assert.equal(result.b, null);
  assert.equal(p.drawing.dimensions[0].bPart, 'B'); assert.equal(getPlanDimensions(p, null, { automatic: false }).length, 1);
  assert.equal(previewDimensionEdit(p, first(p).id, '500 mm').ok, false);
});

test('espace projeté : rotation de section et vrais coins tournés du rendu', () => {
  const a = post('A', 0, 0, { width: 40, height: 120, roll: 90 }), b = post('B', 1000, 0, { width: 60, height: 200 });
  const p = dimensioned(project([a, b]), 'gap', ['A', 'B'], { axis: 'x' }); near(measureDimension(p, first(p)).value, 880);
  const rotated = wood('R', [80, 160, 240], [880, 1060, 1440], { width: 55, height: 180, roll: 37 });
  const q = timberQuaternion(rotated), center = new THREE.Vector3(...rotated.a).add(new THREE.Vector3(...rotated.b)).multiplyScalar(0.5), length = new THREE.Vector3(...rotated.a).distanceTo(new THREE.Vector3(...rotated.b)), corners = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(new THREE.Vector3(x * 55 / 2, y * 180 / 2, z * length / 2).applyQuaternion(q).add(center));
  const far = post('F', 3000), r = dimensioned(project([rotated, far]), 'gap', ['R', 'F']);
  near(measureDimension(r, first(r)).value, 2950 - Math.max(...corners.map(c => c.x)));
});

test('écart 0,5 m : référence A fixe, mouvement de B seulement et aperçu sans mutation', () => {
  const p = dimensioned(project([post('A', 0), post('B', 1000), post('C', 3000)], { freeJoints: [{ id: 'J', aPart: 'A', bPart: 'B' }], notes: 'À conserver' }), 'gap', ['A', 'B']);
  const before = JSON.stringify(p), result = previewDimensionEdit(p, first(p).id, '0,5 m', { move: 'b' });
  assert.equal(result.ok, true); near(result.before.value, 900); near(result.after.value, 500);
  assert.equal(result.fixedId, 'A'); assert.deepEqual(result.movedIds, ['B']); near3(result.changes[0].delta, [-400, 0, 0]);
  assert.deepEqual(result.project.freeParts[0], p.freeParts[0]); assert.deepEqual(result.project.freeParts[2], p.freeParts[2]);
  assert.deepEqual(result.project.freeJoints, p.freeJoints); assert.equal(result.project.notes, p.notes); assert.equal(JSON.stringify(p), before);
});

test('déplacer A conserve B et respecte le côté lorsque B est à gauche', () => {
  for (const positions of [[0, 1000], [1000, 0]]) {
    const p = dimensioned(project([post('A', positions[0]), post('B', positions[1])]), 'gap', ['A', 'B']);
    const result = previewDimensionEdit(p, first(p).id, '500mm', { move: 'a' });
    assert.equal(result.fixedId, 'B'); assert.deepEqual(result.project.freeParts[1], p.freeParts[1]); near(result.after.value, 500);
    near(result.project.freeParts[0].a[0], positions[0] === 0 ? 400 : 600);
  }
});

test('écart négatif : recouvrement signalé, zéro demandé crée un contact projeté', () => {
  const p = dimensioned(project([post('A', 0), post('B', 60)]), 'gap', ['A', 'B']);
  const measured = measureDimension(p, first(p)); near(measured.value, -40); assert.match(measured.message, /recouvrent/);
  const changed = previewDimensionEdit(p, first(p).id, 0); assert.equal(changed.ok, true); near(changed.after.value, 0); near(changed.project.freeParts[1].a[0], 100);
});

test('longueur réelle diagonale : conservation exacte de A, du centre ou de B', () => {
  const piece = wood('L', [10, 20, 30], [13, 24, 42], { roll: 28, species: 'douglas' });
  const p = dimensioned(project([piece, post('other', 1000)]), 'length', ['L'], { view: 'front' });
  near(measureDimension(p, first(p)).value, 13);
  for (const [anchor, expectedA, expectedB] of [['a', [10, 20, 30], [16, 28, 54]], ['b', [7, 16, 18], [13, 24, 42]], ['center', [8.5, 18, 24], [14.5, 26, 48]]]) {
    const result = previewDimensionEdit(p, first(p).id, '2,6 cm', { anchor });
    assert.equal(result.ok, true); near3(result.project.freeParts[0].a, expectedA); near3(result.project.freeParts[0].b, expectedB); near(result.after.value, 26);
    assert.equal(result.project.freeParts[0].roll, 28); assert.equal(result.project.freeParts[0].species, 'douglas'); assert.deepEqual(result.project.freeParts[1], p.freeParts[1]);
  }
  assert.deepEqual(previewDimensionEdit(p, first(p).id, 13).project.freeParts, p.freeParts);
});

test('angles aigus : 45° invariants au sens A/B, lecture seule explicite', () => {
  const a = wood('A', [0, 0, 0], [1000, 0, 0]), b = wood('B', [0, 0, 0], [1000, 1000, 0]);
  const p = dimensioned(project([a, b]), 'angle', ['A', 'B']);
  const result = measureDimension(p, first(p)); near(result.value, 45); assert.equal(result.status, 'readonly'); assert.equal(result.editable, false); assert.match(result.message, /lecture seule/);
  assert.equal(result.lines.length, 2); assert.ok(result.lines.every(l => l.role === 'angle'));
  const reversed = { ...p, freeParts: [a, { ...b, a: b.b, b: b.a }] }; near(measureDimension(reversed, first(p)).value, 45);
  assert.equal(previewDimensionEdit(p, first(p).id, 60).ok, false);
});

test('paramétrique : cotes possibles avec modèle, mesure live et modification refusée', () => {
  const p = project([], { mode: 'parametric' }), model = { parts: [post('P1', 0), post('P2', 2000)] };
  p.drawing = createDimension(p, 'axes', ['P1', 'P2'], { model });
  const result = measureDimension(p, first(p), model); near(result.value, 2000); assert.equal(result.status, 'readonly');
  const preview = previewDimensionEdit(p, first(p).id, 2500); assert.equal(preview.ok, false); assert.match(preview.message, /construction libre/);
  assert.ok(getPlanDimensions(p, model).some(d => d.id === first(p).id));
});

test('préparation invalide : saisie, longueur nulle et dépassement refusés sans changement', () => {
  const p = dimensioned(project([wood('L', [99900, 0, 0], [99950, 0, 0])]), 'length', ['L']);
  const before = JSON.stringify(p);
  for (const input of [0, -1, '', '0.5m+200', Infinity, 500]) assert.equal(previewDimensionEdit(p, first(p).id, input).ok, false);
  assert.equal(previewDimensionEdit(p, 'missing', 50).ok, false); assert.equal(previewDimensionEdit(p, first(p).id, 50, { anchor: 'bad' }).ok, false);
  assert.equal(JSON.stringify(p), before);
});

test('cote de mur et panneau : centre réel et déplacement de tous les sommets', () => {
  const wall = { id: 'W', kind: 'wall', material: 'wall', a: [0, 0, 0], b: [2000, 0, 0], width: 200, height: 2400 };
  const corners = [[0, 0, 500], [1000, 0, 500], [1000, 2000, 500], [0, 2000, 500]], panel = { id: 'P', kind: 'panel', material: 'mesh', a: corners[0], b: corners[2], corners };
  const p = dimensioned(project([wall, panel]), 'gap', ['W', 'P'], { axis: 'z' }); near(measureDimension(p, first(p)).value, 400);
  const result = previewDimensionEdit(p, first(p).id, 250); near(result.after.value, 250);
  assert.ok(result.project.freeParts[1].corners.every(c => c[2] === 350)); assert.deepEqual(p.freeParts[1].corners, corners);
  assert.throws(() => createDimension(p, 'length', ['W']), /bois/);
});

test('automatique hors tout : géométrie tournée exacte et fondations exclues', () => {
  const a = post('A', 0), b = post('B', 1000, 500), concrete = { id: 'footing', kind: 'footing', material: 'concrete', a: [-5000, -800, 0], b: [5000, 0, 0], width: 10000, height: 800 };
  const dimensions = auto(project([a, b, concrete]), 'top', 'overall');
  assert.equal(dimensions.length, 2); near(dimensions.find(d => d.axis === 'x').value, 1100); near(dimensions.find(d => d.axis === 'z').value, 600);
  assert.ok(dimensions.every(d => d.status === 'readonly' && d.automatic && !d.partIds.includes('footing')));
  near(auto(project([a, b, concrete]), 'front', 'overall').find(d => d.axis === 'y').value, 2000);
});

test('rangées : vrais alignements 3D, aucune diagonale réunie artificiellement', () => {
  const p = project([post('A', 0), post('B', 1000), post('C', 0, 500), post('D', 1000, 500), post('center', 500, 250)]);
  const rows = auto(p).filter(d => d.type === 'axes'); assert.equal(rows.length, 4);
  assert.ok(rows.every(d => !d.partIds.includes('center')));
  for (const row of rows) {
    const [a, b] = row.partIds.map(id => p.freeParts.find(p => p.id === id));
    if (row.axis === 'x') near(a.a[2], b.a[2]); else near(a.a[0], b.a[0]);
  }
  const falseRow = auto(project([post('A', 0, 0), post('B', 1000, 100)]), 'front').filter(d => d.type === 'axes'); assert.equal(falseRow.length, 0);
});

test('rangée tolérée sans dérive cumulative et doublons de projection évités', () => {
  const p = project([post('A', 0, 0), post('B', 1000, 0.4), post('C', 2000, 0.8)]);
  const rows = auto(p).filter(d => d.type === 'axes' && d.axis === 'x'); assert.equal(rows.length, 1); assert.deepEqual(rows[0].partIds, ['A', 'B']);
  const rectangle = project([post('A', 0), post('B', 1000), post('C', 0, 500), post('D', 1000, 500)]);
  assert.equal(auto(rectangle, 'front').filter(d => d.type === 'axes').length, 1);
});

test('niveaux de détail, vues et nombre borné : hauteurs et longueurs selon projection', () => {
  const p = project([post('A', 0), post('B', 1000), wood('beam', [0, 2200, 0], [1000, 2400, 0])]);
  assert.equal(auto(p, 'top', 'overall').length, 2);
  assert.ok(auto(p, 'front', 'full').some(d => d.type === 'height' && d.partIds[0] === 'A'));
  near(auto(p, 'front', 'full').find(d => d.type === 'length' && d.partIds[0] === 'beam').value, Math.hypot(1000, 200));
  assert.ok(!auto(p, 'top', 'full').some(d => d.type === 'height'));
  assert.ok(auto(p, 'side', 'full').every(d => d.a && d.b)); assert.equal(auto(p, 'front', 'full', 3).length, 3);
  assert.equal(auto(p, 'top', 'full', 0).length, 0);
  const empty = project([]); assert.deepEqual(auto(empty), []);
});

test('persistantes filtrées par vue visible, auto désactivable et étiquette personnalisée', () => {
  let p = project([post('A', 0), post('B', 1000)]);
  p = dimensioned(p, 'axes', ['A', 'B'], { axis: 'x', view: 'all', label: 'Ouverture' });
  assert.equal(getPlanDimensions(p, null, { view: 'side', automatic: false }).length, 0);
  const visible = getPlanDimensions(p, null, { view: 'front', automatic: false }); assert.equal(visible.length, 1); assert.match(visible[0].label, /^Ouverture/);
  p.drawing.automatic = false; assert.equal(getPlanDimensions(p).length, 1);
  assert.equal(first(p).view, 'all');
});
