import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeProject, translateParts } from '../src/engine.js';
import { timberQuaternion } from '../src/geometry.js';
import { getPartBounds, selectionBounds, getPlacementSuggestions, measurePartSpacing, setPartSpacing, computeAlignmentDelta, alignParts } from '../src/placement.js';

const wood = (id, a, b, extra = {}) => ({ id, label: id, kind: 'beam', material: 'wood', a, b, width: 45, height: 100, roll: 0, foundation: 'none', ...extra });
const project = parts => normalizeProject({ mode: 'free', freeParts: parts, freeJoints: [] });
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const nearVec = (a, b) => a.forEach((v, i) => near(v, b[i]));
const appuiProject = () => project([
  wood('beam', [-1000, 2075, 20], [1000, 2075, 20]),
  wood('post', [450, 0, 0], [450, 2000, 0], { kind: 'post', width: 90, height: 90 })
]);

test('appui sur poteau intermédiaire : projection longitudinale, centrage et contact exact', () => {
  const p = appuiProject(), suggestion = getPlacementSuggestions(p, ['beam']).find(a => a.kind === 'beam-on-post');
  assert.ok(suggestion); assert.equal(suggestion.targetId, 'post'); nearVec(suggestion.delta, [0, -25, -20]);
  near(suggestion.contactArea, 4050);
  const moved = translateParts(p, ['beam'], suggestion.delta);
  assert.equal(moved.freeParts[0].a[0], -1000); assert.equal(moved.freeParts[0].b[0], 1000);
  near(measurePartSpacing(moved, ['beam'], 'post', 'y', 'faces', 1), 0);
  assert.equal(moved.freeJoints.length, 0); assert.deepEqual(p.freeParts[0].a, [-1000, 2075, 20]);
});

test('poteau déplacé sous un chevron, avec sections différentes', () => {
  const p = project([wood('beam', [-1500, 2050, 0], [1500, 2050, 0], { width: 70, height: 100 }), wood('post', [500, 0, 15], [500, 1970, 15], { kind: 'post', width: 110, height: 80 })]);
  const suggestion = getPlacementSuggestions(p, ['post']).find(a => a.kind === 'post-under-beam');
  assert.ok(suggestion); nearVec(suggestion.delta, [0, 30, -15]);
  const moved = translateParts(p, ['post'], suggestion.delta);
  near(measurePartSpacing(moved, ['post'], 'beam', 'y', 'faces', -1), 0);
});

test('tolérance de proximité : aucune proposition pour une pièce éloignée', () => {
  const p = appuiProject(); p.freeParts[0].a[1] = p.freeParts[0].b[1] = 2400;
  assert.deepEqual(getPlacementSuggestions(p, ['beam'], 75), []);
  assert.deepEqual(getPlacementSuggestions(appuiProject(), ['beam'], 10), []);
  assert.deepEqual(getPlacementSuggestions(appuiProject(), ['beam'], -1), []);
  assert.deepEqual(getPlacementSuggestions(appuiProject(), ['missing']), []);
});

test('extrémités de sections différentes : contact sans superposition des axes de volume', () => {
  const p = project([wood('reference', [0, 1000, 0], [2000, 1000, 0], { width: 90, height: 145 }), wood('moving', [2050, 1000, 15], [3050, 1000, 15], { width: 45, height: 70 })]);
  const suggestion = getPlacementSuggestions(p, ['moving']).find(a => a.kind === 'end-contact');
  assert.ok(suggestion); nearVec(suggestion.delta, [-50, 0, -15]);
  const moved = translateParts(p, ['moving'], suggestion.delta);
  near(measurePartSpacing(moved, ['moving'], 'reference', 'x', 'faces', 1), 0);
});

test('bois tourné : coins identiques au rendu Three, y compris section verticale et roll', () => {
  for (const part of [wood('angled', [-500, 200, -300], [800, 1400, 900], { width: 50, height: 180, roll: 37 }), wood('vertical', [0, 0, 0], [0, 2000, 0], { width: 40, height: 120, roll: 90 })]) {
    const quaternion = timberQuaternion(part), center = new THREE.Vector3(...part.a).add(new THREE.Vector3(...part.b)).multiplyScalar(.5), length = new THREE.Vector3(...part.a).distanceTo(new THREE.Vector3(...part.b)), points = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push(new THREE.Vector3(x * part.width / 2, y * part.height / 2, z * length / 2).applyQuaternion(quaternion).add(center).toArray());
    const bounds = getPartBounds(part);
    for (const i of [0, 1, 2]) { near(bounds.min[i], Math.min(...points.map(p => p[i]))); near(bounds.max[i], Math.max(...points.map(p => p[i]))); }
  }
});

test('faces inclinées parallèles : raccord exact, mais aucun faux appui sur un sommet non parallèle', () => {
  const d = Math.SQRT1_2, targetEnd = [1000 * d, 1000 * d, 0];
  const p = project([wood('target', [0, 0, 0], targetEnd, { roll: 20 }), wood('moving', [1020 * d, 1020 * d, 5], [2020 * d, 2020 * d, 5], { roll: 20 })]);
  const suggestion = getPlacementSuggestions(p, ['moving']).find(a => a.kind === 'end-contact');
  assert.ok(suggestion); nearVec(suggestion.delta, [-20 * d, -20 * d, -5]);
  const tilted = project([wood('beam', [-1000, 2030, 0], [1000, 2230, 0]), wood('post', [0, 0, 0], [0, 2000, 0], { kind: 'post', width: 90, height: 90 })]);
  assert.ok(!getPlacementSuggestions(tilted, ['beam']).some(a => a.kind === 'beam-on-post'));
});

test('poteau intermédiaire sous un chevron orienté en plan : pas de recentrage longitudinal', () => {
  const d = Math.SQRT1_2;
  const p = project([wood('beam', [-1000 * d, 2075, -1000 * d], [1000 * d, 2075, 1000 * d]), wood('post', [300, 0, 330], [300, 2000, 330], { kind: 'post', width: 90, height: 90, roll: 23 })]);
  const suggestion = getPlacementSuggestions(p, ['beam']).find(a => a.kind === 'beam-on-post');
  assert.ok(suggestion); near(suggestion.delta[0] * d + suggestion.delta[2] * d, 0); near(suggestion.delta[1], -25); assert.ok(suggestion.contactArea > 0);
});

test('une suggestion est rejetée si elle ferait pénétrer un autre membre de la sélection', () => {
  const p = appuiProject();
  p.freeParts.push(wood('selected-other', [2800, 1000, 0], [3200, 1000, 0]), wood('obstacle', [2800, 900, 0], [3200, 900, 0]));
  const suggestions = getPlacementSuggestions(p, ['beam', 'selected-other']);
  assert.ok(!suggestions.some(a => a.sourceId === 'beam' && a.targetId === 'post' && a.delta[1] < 0));
});

test('contacts déjà placés : proposés pour pouvoir relier, aucune liaison créée', () => {
  let p = appuiProject(); p = translateParts(p, ['beam'], [0, -25, -20]);
  const suggestion = getPlacementSuggestions(p, ['beam']).find(a => a.targetId === 'post' && a.alreadyPlaced);
  assert.ok(suggestion); nearVec(suggestion.delta, [0, 0, 0]); assert.equal(p.freeJoints.length, 0);
  p.freeJoints.push({ id: 'joint', aPart: 'beam', bPart: 'post', recipe: 'angle' });
  assert.ok(!getPlacementSuggestions(p, ['beam']).some(a => a.targetId === 'post' && a.alreadyPlaced));
});

test('écart de 500 mm entre vraies faces après rotation, des deux côtés', () => {
  const p = project([wood('reference', [0, 0, 0], [0, 1500, 0], { width: 60, height: 140, roll: 30 }), wood('moving', [400, 0, 50], [700, 1200, 300], { width: 45, height: 170, roll: 42 })]);
  for (const axis of ['x', 'y', 'z']) for (const side of [-1, 1]) {
    const moved = setPartSpacing(p, ['moving'], 'reference', { axis, side, measure: 'faces', distance: 500 });
    near(measurePartSpacing(moved, ['moving'], 'reference', axis, 'faces', side), 500);
    assert.equal(moved.freeParts[1].roll, 42); nearVec(moved.freeParts[0].a, p.freeParts[0].a);
    nearVec(moved.freeParts[1].b.map((v, i) => v - moved.freeParts[1].a[i]), p.freeParts[1].b.map((v, i) => v - p.freeParts[1].a[i]));
  }
});

test('écart axes et groupe : translation rigide, aucune remise à la grille', () => {
  const p = project([wood('reference', [0, 0, 0], [0, 1000, 0]), wood('one', [1000, 0, 0], [1000, 1000, 0]), wood('two', [1400, 0, 0], [1400, 1000, 0])]);
  p.grid = 50; p.snap = true;
  const moved = setPartSpacing(p, ['one', 'two'], 'reference', { axis: 'x', side: 1, measure: 'axes', distance: 500.1 });
  near(measurePartSpacing(moved, ['one', 'two'], 'reference', 'x', 'axes', 1), 500.1);
  near(moved.freeParts[2].a[0] - moved.freeParts[1].a[0], 400);
  near(selectionBounds(moved, ['one', 'two']).center[0], 500.1);
});

test('alignement min/max/centre : delta précis et application sur un seul axe', () => {
  const p = project([wood('reference', [-200, 1000, 0], [300, 1000, 0], { width: 80, height: 150 }), wood('moving', [600, 900, 20], [1500, 900, 20], { width: 40, height: 90 })]);
  for (const feature of ['min', 'max', 'center']) for (const axis of ['x', 'y', 'z']) {
    const delta = computeAlignmentDelta(p, ['moving'], 'reference', { axis, feature }); assert.ok(delta);
    const moved = alignParts(p, ['moving'], 'reference', { axis, feature }), i = { x: 0, y: 1, z: 2 }[axis];
    near(getPartBounds(moved.freeParts[1])[feature][i], getPartBounds(moved.freeParts[0])[feature][i]);
    assert.equal(delta.filter((v, j) => j !== i).every(v => v === 0), true);
  }
});

test('entrées invalides protégées sans mutation, et géométries hors périmètre explicites', () => {
  const p = appuiProject(), before = JSON.stringify(p);
  for (const distance of [-1, NaN, Infinity, '500']) assert.throws(() => setPartSpacing(p, ['beam'], 'post', { distance }));
  assert.throws(() => setPartSpacing(p, ['missing'], 'post', { distance: 500 }));
  assert.throws(() => setPartSpacing(p, ['beam'], 'beam', { distance: 500 }));
  assert.throws(() => setPartSpacing(p, ['beam'], 'post', { axis: 'u', distance: 500 }));
  assert.throws(() => setPartSpacing(p, ['beam'], 'post', { distance: 300000 }));
  assert.throws(() => alignParts(p, ['beam'], 'post', { feature: 'unknown' }));
  assert.equal(measurePartSpacing(p, ['missing'], 'post'), null);
  assert.equal(getPartBounds({ ...p.freeParts[0], kind: 'panel' }), null);
  assert.equal(selectionBounds(p, []), null); assert.equal(JSON.stringify(p), before);
});

test('scène de 200 bois : propositions bornées et temps de calcul raisonnable', () => {
  const parts = [...appuiProject().freeParts];
  for (let i = 0; i < 198; i++) parts.push(wood(`extra-${i}`, [5000 + (i % 20) * 200, 0, Math.floor(i / 20) * 500], [5000 + (i % 20) * 200, 2000, Math.floor(i / 20) * 500], { kind: 'post', width: 90, height: 90 }));
  const p = project(parts), started = performance.now(), suggestions = getPlacementSuggestions(p, ['beam']);
  assert.ok(suggestions.length > 0 && suggestions.length <= 8);
  assert.ok(performance.now() - started < 1500, 'Calcul excessivement long pour 200 bois');
});
