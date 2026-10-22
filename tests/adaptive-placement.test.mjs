import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  normalizeAssistance, resolveAdaptiveGrid, placementAnchor,
  snapPointToGrid, snapDeltaToGrid, smartPlacementGuides
} from '../src/adaptive-placement.js';

const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const near3 = (a, b) => (a.isVector3 ? a.toArray() : a).forEach((x, i) => near(x, b[i]));
const post = (id, x, z = 0, extra = {}) => ({ id, kind: 'post', material: 'wood', a: [x, 0, z], b: [x, 2000, z], width: 90, height: 90, roll: 0, ...extra });
const beam = (id, a, b, extra = {}) => ({ id, kind: 'beam', material: 'wood', a, b, width: 45, height: 90, roll: 0, ...extra });
const project = (parts, assistance = {}, workplane = { type: 'xz' }) => ({ freeParts: parts, assistance, workplane });
const translate = (p, delta) => ({ ...p, a: p.a.map((v, i) => v + delta[i]), b: p.b.map((v, i) => v + delta[i]) });

test('normalisation : valeurs par défaut, interrupteurs et import borné', () => {
  assert.deepEqual(normalizeAssistance(null), { placementShadow: true, guides: true, guideSnap: true, gridSnap: false, gridMode: 'adaptive', gridStep: 100, gridDivisions: 8, gridReference: 'auto', gridA: '', gridB: '' });
  const p = normalizeAssistance({ guides: false, guideSnap: false, gridSnap: true, gridMode: 'bad', gridStep: -8, gridDivisions: Infinity, gridReference: 'pair', gridA: 'a\u0000b', gridB: 123 });
  assert.equal(p.guides, false); assert.equal(p.guideSnap, false); assert.equal(p.gridSnap, true);
  assert.equal(p.gridStep, 0.1); assert.equal(p.gridDivisions, 8); assert.equal(p.gridMode, 'adaptive');
  assert.equal(p.gridA, 'ab'); assert.equal(p.gridB, '');
  assert.equal(normalizeAssistance({ gridDivisions: 3.6 }).gridDivisions, 4);
  assert.equal(normalizeAssistance({ gridDivisions: 9999, gridStep: 999999 }).gridDivisions, 100);
  assert.equal(normalizeAssistance({ gridDivisions: 9999, gridStep: 999999 }).gridStep, 10000);
});

test('ancre : pied selon la normale, centre réel et aucun changement de la pièce', () => {
  const p = post('reversed', 25, 10, { a: [25, 2200, 10], b: [25, 100, 10] }), before = JSON.stringify(p);
  near3(placementAnchor(p, { type: 'xz' }), [25, 100, 10]);
  near3(placementAnchor(p, { type: 'face', origin: [0, 0, 0], normal: [0, -1, 0], u: [1, 0, 0] }), [25, 2200, 10]);
  near3(placementAnchor(p, { type: 'xy' }), [25, 1150, 10]);
  near3(placementAnchor({ ...p, a: p.b, b: p.a }, { type: 'xy' }), [25, 1150, 10]);
  near3(placementAnchor(beam('b', [0, 0, 0], [1000, 300, 400]), { type: 'xz' }), [500, 150, 200]);
  near3(placementAnchor({ id: 'panel', a: [0, 0, 0], b: [100, 100, 0], corners: [[0, 0, 0], [100, 0, 0], [100, 200, 0], [0, 200, 0]] }), [50, 100, 0]);
  near3(placementAnchor({ kind: 'wall', material: 'wall', a: [0, 0, 0], b: [1000, 0, 0], height: 2400 }), [500, 1200, 0]);
  assert.equal(JSON.stringify(p), before); assert.equal(placementAnchor({ a: [NaN, 0, 0], b: [1, 1, 1] }), null);
});

test('grille fixe, paire absente ou superposée : repli explicite sans exception', () => {
  const fixed = resolveAdaptiveGrid(project([], { gridMode: 'fixed', gridStep: 37.5 }, { type: 'xy', offset: 150 }));
  near3(fixed.origin, [0, 0, 150]); near(fixed.step, 37.5); assert.equal(fixed.adaptive, false); assert.equal(fixed.notice, '');
  const missing = resolveAdaptiveGrid(project([post('A', 0)], { gridReference: 'pair', gridA: 'A', gridB: 'missing' }));
  assert.equal(missing.adaptive, false); assert.match(missing.notice, /deux repères/i); near(missing.step, 100);
  const coincident = resolveAdaptiveGrid(project([post('A', 0), post('B', 0, 0, { a: [0, 300, 0], b: [0, 2300, 0] })], { gridReference: 'pair', gridA: 'A', gridB: 'B' }));
  assert.equal(coincident.adaptive, false); assert.match(coincident.notice, /superposent/);
});

test('paire imposée diagonale : origine projetée, repère orthonormal et subdivisions décimales exactes', () => {
  const p = project([post('A', 100, 200), post('B', 3100, 4200)], { gridReference: 'pair', gridA: 'A', gridB: 'B', gridDivisions: 3 }, { type: 'xz', offset: 70 });
  const before = JSON.stringify(p), grid = resolveAdaptiveGrid(p);
  assert.equal(grid.adaptive, true); assert.deepEqual(grid.refs, ['A', 'B']); near(grid.span, 5000); near(grid.step, 5000 / 3);
  near3(grid.origin, [100, 70, 200]); near3(grid.u, [0.6, 0, 0.8]); near3(grid.v, [-0.8, 0, 0.6]);
  near3(new THREE.Vector3(1, 0, 0).applyQuaternion(grid.quaternion), grid.u.toArray());
  near3(new THREE.Vector3(0, 1, 0).applyQuaternion(grid.quaternion), grid.normal.toArray());
  near3(snapPointToGrid([3100, 880, 4200], grid), [3100, 880, 4200]);
  assert.equal(JSON.stringify(p), before);
});

test('choix automatique : vraie paire la plus éloignée, préférence poteaux et ordre stable', () => {
  const parts = [post('D', 2000, 0), post('A', -100, -500), post('C', 0, 1000), post('B', 200, 200), beam('far', [-50000, 100, 0], [-40000, 100, 0])];
  const grid = resolveAdaptiveGrid(project(parts));
  assert.deepEqual(grid.refs, ['C', 'D']); near(grid.span, Math.hypot(2000, 1000));
  const shuffled = resolveAdaptiveGrid(project([...parts].reverse()));
  assert.deepEqual(shuffled.refs, grid.refs); near3(shuffled.u, grid.u.toArray());
  const woodOnly = resolveAdaptiveGrid(project([beam('A', [0, 0, 0], [100, 0, 0]), beam('B', [1000, 0, 0], [1100, 0, 0])]));
  near(woodOnly.span, 1000); assert.equal(woodOnly.adaptive, true);
});

test('diamètre automatique vérifié face à toutes les paires sur plusieurs nuages', () => {
  let seed = 71;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let iteration = 0; iteration < 20; iteration++) {
    const points = Array.from({ length: 40 }, (_, i) => post(`p${i}`, random() * 5000, random() * 5000));
    let max = 0;
    for (const a of points) for (const b of points) max = Math.max(max, Math.hypot(a.a[0] - b.a[0], a.a[2] - b.a[2]));
    near(resolveAdaptiveGrid(project(points)).span, max);
  }
});

test('accrochage point : altitude conservée, valeurs négatives et pas non entier', () => {
  const grid = resolveAdaptiveGrid(project([post('A', 0), post('B', 3700)], { gridDivisions: 3 }));
  near3(snapPointToGrid([1200, 123.456, -1260], grid), [3700 / 3, 123.456, -3700 / 3]);
  assert.equal(snapPointToGrid([0, 0, 0], { step: 0 }), null);
  assert.equal(snapPointToGrid([Infinity, 0, 0], grid), null);
});

test('translation de groupe : une seule ancre et aucune déformation ni mutation', () => {
  const parts = [post('first', 20, 0), post('second', 760, 320)], before = JSON.stringify(parts);
  const grid = resolveAdaptiveGrid(project([], { gridMode: 'fixed', gridStep: 100 }));
  const delta = snapDeltaToGrid(parts, [195, 0, 122], grid);
  near3(delta, [180, 0, 100]);
  const moved = parts.map(p => translate(p, delta));
  near3(moved[0].a, [200, 0, 100]); near3(moved[1].a, [940, 0, 420]);
  near(moved[1].a[0] - moved[0].a[0], 740); assert.equal(JSON.stringify(parts), before);
});

test('axes monde, axe local et verrouillage : aucun mouvement hors contrainte', () => {
  const grid = resolveAdaptiveGrid(project([], { gridMode: 'fixed', gridStep: 100 }));
  near3(snapDeltaToGrid([post('P', 0)], [130, 0, 0], grid, { axis: 'X', lock: true }), [100, 0, 0]);
  assert.equal(snapDeltaToGrid([post('P', 0, 15)], [130, 0, 0], grid, { axis: 'X' }), null);
  assert.equal(snapDeltaToGrid([post('P', 0)], [130, 10, 0], grid, { axis: 'XYZ', lock: true }), null);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  near3(snapDeltaToGrid([post('P', 0)], [0, 0, -132], grid, { axis: 'X', space: 'local', quaternion: q, lock: true }), [0, 0, -100]);
  assert.equal(snapDeltaToGrid([], [0, 0, 0], grid), null);
  assert.equal(snapDeltaToGrid([post('P', 0)], [NaN, 0, 0], grid), null);
});

test('grille diagonale : accrochage exact en plan et refus d’un axe monde incompatible', () => {
  const grid = resolveAdaptiveGrid(project([post('A', 0), post('B', 1000, 1000)], { gridDivisions: 10 }));
  near3(snapDeltaToGrid([post('P', 0)], [92, 0, 115], grid, { axis: 'XZ', lock: true }), [100, 0, 100]);
  near3(snapDeltaToGrid([post('P', 0)], [110, 0, 0], grid, { axis: 'X' }), [200, 0, 0]);
  assert.equal(snapDeltaToGrid([post('P', 0, 20)], [110, 0, 0], grid, { axis: 'X' }), null);
});

test('milieu entre deux poteaux : deux écarts identiques, lignes sur le plan et coordonnées exactes', () => {
  const a = post('A', 0), b = post('B', 3700), moving = post('M', 1880, 8), p = project([a, b, moving]), before = JSON.stringify(p);
  const guide = smartPlacementGuides(p, [moving], { tolerance: 50 });
  assert.ok(guide); assert.equal(guide.kind, 'spacing'); assert.equal(guide.label, 'Écarts entre faces identiques');
  near3(guide.delta, [-30, 0, -8]); assert.equal(guide.lines.length, 2);
  const lengths = guide.lines.map(l => new THREE.Vector3(...l.a).distanceTo(new THREE.Vector3(...l.b)));
  near(lengths[0], lengths[1]); near(lengths[0], 1760);
  for (const l of guide.lines) { near(l.a[1], 0); near(l.b[1], 0); }
  assert.equal(JSON.stringify(p), before);
});

test('écarts entre vraies faces avec des sections différentes', () => {
  const a = post('A', 0, 0, { height: 100 }), b = post('B', 1000, 0, { height: 200 }), moving = post('M', 490, 0, { height: 80 });
  const guide = smartPlacementGuides(project([a, b, moving]), [moving]);
  assert.equal(guide.label, 'Écarts entre faces identiques'); near3(guide.delta, [-15, 0, 0]);
  for (const l of guide.lines) near(new THREE.Vector3(...l.a).distanceTo(new THREE.Vector3(...l.b)), 385);
});

test('milieu diagonal : axes exacts, aucune fausse annonce d’écart entre faces inclinées', () => {
  const a = post('A', 0, 0), b = post('B', 1000, 1000), moving = post('M', 517, 489);
  const guide = smartPlacementGuides(project([a, b, moving]), [moving]);
  assert.equal(guide.label, 'Milieu entre axes'); near3(guide.delta, [-17, 0, 11]);
  assert.ok(guide.lines.every(l => l.kind === 'spacing'));
});

test('répétition d’espacement et alignement simple restent disponibles', () => {
  const a = post('A', 0), b = post('B', 1000), moving = post('M', 2020, 5);
  const repeat = smartPlacementGuides(project([a, b, moving]), [moving]);
  assert.equal(repeat.label, 'Espacement des axes identique'); near3(repeat.delta, [-20, 0, -5]);
  const single = smartPlacementGuides(project([a, post('M', 22, 700)]), [post('M', 22, 700)]);
  assert.equal(single.kind, 'alignment'); near3(single.delta, [-22, 0, 0]);
});

test('exclusions, auto désactivé, tolérance et guide visuel sans aimantation', () => {
  const a = post('A', 0), b = post('B', 1000), moving = post('M', 510, 0), p = project([a, b, moving]);
  assert.equal(smartPlacementGuides(p, [moving], { excludeIds: ['A', 'B'] }), null);
  assert.equal(smartPlacementGuides({ ...p, assistance: { guides: false } }, [moving]), null);
  assert.ok(smartPlacementGuides({ ...p, assistance: { guideSnap: false } }, [moving]));
  assert.equal(smartPlacementGuides(project([a]), [post('M', 600, 700)], { tolerance: 5 }), null);
  assert.equal(smartPlacementGuides(p, [], {}), null);
  assert.equal(smartPlacementGuides(p, [moving], { tolerance: -1 }), null);
});

test('plan incliné : lignes projetées, delta tangent et groupe conservé', () => {
  const workplane = { type: 'face', origin: [0, 100, 0], normal: [0, Math.SQRT1_2, Math.SQRT1_2], u: [1, 0, 0] };
  const a = post('A', 0), b = post('B', 1000), moving = post('M', 515, 10);
  const p = project([a, b, moving], {}, workplane), grid = resolveAdaptiveGrid(p, [a, b]);
  const guide = smartPlacementGuides(p, [moving], { grid });
  assert.ok(guide); near(new THREE.Vector3(...guide.delta).dot(grid.normal), 0);
  for (const l of guide.lines) for (const point of [l.a, l.b]) near(new THREE.Vector3(...point).sub(grid.origin).dot(grid.normal), 0);
});

test('scène de 200 bois : candidats bornés et références de la sélection exclues', () => {
  const parts = Array.from({ length: 200 }, (_, i) => post(`P${i}`, (i % 20) * 500, Math.floor(i / 20) * 700));
  const moving = post('M', 252, 8), p = project([...parts, moving]);
  const result = smartPlacementGuides(p, [moving]);
  assert.ok(result); assert.ok(result.lines.length <= 2); assert.ok(!result.referenceIds.includes('M'));
  assert.equal(resolveAdaptiveGrid(p, parts).adaptive, true);
});
