import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { timberQuaternion } from '../src/geometry.js';
import { buildProject, DEFAULT_PROJECT } from '../src/engine.js';
import { getFixingCounts, normalizeFixingLayout, getJointFixingFrame, buildJointFixings, toManualFixingLayout, moveJointFixing, getFoundationJoints, createFixingGeometry } from '../src/fixings.js';

const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const nearVector = (a, b) => { assert.equal(a.length, b.length); a.forEach((v, i) => near(v, b[i])); };
const wood = (id, a, b, extra = {}) => ({ id, label: id, kind: 'beam', material: 'wood', a, b, width: 70, height: 145, roll: 0, ...extra });
const fixture = (wallFirst = false) => {
  const beam = wood('beam', [-1500, 1500, -150], [1500, 1500, -150]);
  const wall = { id: 'wall', kind: 'wall', material: 'wall', a: [-2000, 0, 0], b: [2000, 0, 0], width: 200, height: 2500 };
  return { model: { parts: [beam, wall], posts: [], joints: [] }, joint: { id: 'J1', aPart: wallFirst ? 'wall' : 'beam', bPart: wallFirst ? 'beam' : 'wall', recipe: 'wall_mechanical', anchors: 4, screws: 8, bolts: 1, connectors: 1 } };
};
const moved = (part, delta) => ({ ...part, a: part.a.map((v, i) => v + delta[i]), b: part.b.map((v, i) => v + delta[i]) });
const rotatedY = (part, angle) => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  return { ...part, a: new THREE.Vector3(...part.a).applyQuaternion(q).toArray(), b: new THREE.Vector3(...part.b).applyQuaternion(q).toArray() };
};

test('les quantités actives suivent la recette, sans composants fantômes', () => {
  const counts = { anchors: 4, screws: 8, bolts: 2, connectors: 1 };
  assert.deepEqual(getFixingCounts({ ...counts, recipe: 'wall_chemical' }), { anchors: 4, screws: 0, bolts: 0, connectors: 0 });
  assert.deepEqual(getFixingCounts({ ...counts, recipe: 'wall_wood' }), { anchors: 0, screws: 8, bolts: 0, connectors: 0 });
  assert.deepEqual(getFixingCounts({ ...counts, recipe: 'angle' }), { anchors: 0, screws: 8, bolts: 0, connectors: 1 });
  assert.deepEqual(getFixingCounts({ ...counts, recipe: 'wood' }), { anchors: 0, screws: 8, bolts: 2, connectors: 0 });
  const { joint, model } = fixture(), instances = buildJointFixings(joint, model);
  assert.equal(instances.length, 4); assert.ok(instances.every(i => i.type === 'anchor'));
  assert.deepEqual(instances.map(i => i.id), ['J1:anchor:0', 'J1:anchor:1', 'J1:anchor:2', 'J1:anchor:3']);
});

test('normalisation des points : indices bornés, types connus, nombres finis et doublons éliminés', () => {
  const layout = normalizeFixingLayout({ mode: 'manual', points: [
    { type: 'anchor', index: 0, local: [1, 2, 3] },
    { type: 'anchor', index: 0, local: [4, 5, 6] },
    { type: 'anchor', index: 1, local: [Infinity, 0, 0] },
    { type: 'anchor', index: 2, local: [0, 0, 0] },
    { type: 'screw', index: 0, local: [0, 0, 0] },
    { type: 'unknown', index: 0, local: [0, 0, 0] }
  ], frame: { anchorPartId: 'beam', origin: [0, 0, 0], quaternion: [0, 0, 0, 2] } }, { recipe: 'wall_chemical', anchors: 2, screws: 8 });
  assert.deepEqual(layout.points, [{ type: 'anchor', index: 0, local: [4, 5, 6] }]);
  assert.deepEqual(layout.frame.quaternion, [0, 0, 0, 1]);
  assert.equal(normalizeFixingLayout({ frame: { anchorPartId: 'beam', origin: [0, 0, 0], quaternion: [0, 0, 0, 0] } }).frame, undefined);
  assert.equal(normalizeFixingLayout({ frame: { anchorPartId: 'beam', origin: [0, 0, 0], quaternion: [1e300, 0, 0, 0] } }).frame, undefined);
  assert.deepEqual(getFixingCounts({ anchors: NaN, screws: -2, bolts: Infinity, connectors: 100000 }), { anchors: 0, screws: 0, bolts: 0, connectors: 1000 });
});

test('ancrages muraux automatiques : répartition sur la muralière et tige vers le mur', () => {
  for (const wallFirst of [false, true]) {
    const { joint, model } = fixture(wallFirst), instances = buildJointFixings(joint, model);
    assert.deepEqual(instances.map(i => Math.round(i.position[0])), [-1170, -390, 390, 1170]);
    for (const instance of instances) {
      near(instance.position[1], 1500); near(instance.position[2], -185);
      nearVector(instance.basis[2], [0, 0, -1]);
      nearVector(new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...instance.quaternion)).toArray(), [0, 0, 1]);
    }
  }
});

test('mur tourné en plan : points et orientation tournent avec la scène', () => {
  const { joint, model } = fixture(), angle = Math.PI / 3, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  const initial = buildJointFixings(joint, model), rotated = buildJointFixings(joint, { ...model, parts: model.parts.map(p => rotatedY(p, angle)) });
  initial.forEach((instance, i) => {
    nearVector(rotated[i].position, new THREE.Vector3(...instance.position).applyQuaternion(q).toArray());
    nearVector(rotated[i].basis[2], new THREE.Vector3(...instance.basis[2]).applyQuaternion(q).toArray());
  });
});

test('passage auto → manuel : aucune fixation déplacée et données sérialisables', () => {
  const { joint, model } = fixture(), before = JSON.stringify({ joint, model }), automatic = buildJointFixings(joint, model);
  const fixingLayout = toManualFixingLayout(joint, model), manual = buildJointFixings({ ...joint, fixingLayout }, model);
  automatic.forEach((instance, i) => nearVector(instance.position, manual[i].position));
  assert.equal(fixingLayout.mode, 'manual'); assert.equal(fixingLayout.frame.anchorPartId, 'beam');
  assert.deepEqual(JSON.parse(JSON.stringify(fixingLayout)), fixingLayout);
  assert.equal(JSON.stringify({ joint, model }), before);
});

test('édition monde exacte : seuls les décalages de la fixation choisie changent', () => {
  const { joint, model } = fixture(), initial = buildJointFixings(joint, model), desired = [123.4, 1525.6, -204.8];
  const fixingLayout = moveJointFixing(joint, model, initial[1].id, desired), result = buildJointFixings({ ...joint, fixingLayout }, model);
  nearVector(result[1].position, desired);
  for (const index of [0, 2, 3]) nearVector(result[index].position, initial[index].position);
  const second = moveJointFixing({ ...joint, fixingLayout }, model, 'anchor:1', [12, 1500, -185]);
  nearVector(buildJointFixings({ ...joint, fixingLayout: second }, model)[1].position, [12, 1500, -185]);
});

test('implantation manuelle attachée à aPart : translation et longueur stables', () => {
  const { joint, model } = fixture(); joint.fixingLayout = moveJointFixing(joint, model, 'anchor:0', [-900, 1530, -190]);
  const initial = buildJointFixings(joint, model), delta = [400, 200, -300];
  const translated = { ...model, parts: model.parts.map(p => p.id === 'beam' ? moved(p, delta) : p) };
  buildJointFixings(joint, translated).forEach((i, n) => nearVector(i.position, initial[n].position.map((v, c) => v + delta[c])));
  const otherMoved = { ...model, parts: model.parts.map(p => p.id === 'wall' ? moved(p, [500, 0, 0]) : p) };
  buildJointFixings(joint, otherMoved).forEach((i, n) => nearVector(i.position, initial[n].position));
  const lengthened = { ...model, parts: model.parts.map(p => p.id === 'beam' ? { ...p, b: [2500, 1500, -150] } : p) };
  buildJointFixings(joint, lengthened).forEach((i, n) => nearVector(i.position, initial[n].position));
});

test('implantation manuelle suit la rotation du premier bois, y compris le roll', () => {
  const { joint, model } = fixture(); joint.fixingLayout = toManualFixingLayout(joint, model);
  const initial = buildJointFixings(joint, model), beam = model.parts[0], rolled = { ...beam, roll: 61 };
  const rotation = timberQuaternion(rolled).multiply(timberQuaternion(beam).invert()), pivot = new THREE.Vector3(...beam.a);
  const result = buildJointFixings(joint, { ...model, parts: [rolled, model.parts[1]] });
  initial.forEach((instance, i) => {
    nearVector(result[i].position, new THREE.Vector3(...instance.position).sub(pivot).applyQuaternion(rotation).add(pivot).toArray());
    nearVector(result[i].basis[2], new THREE.Vector3(...instance.basis[2]).applyQuaternion(rotation).toArray());
  });
});

test('implantation ancrée au mur : translation et rotation de ce mur conservées', () => {
  const { joint, model } = fixture(true); joint.fixingLayout = toManualFixingLayout(joint, model);
  const initial = buildJointFixings(joint, model), angle = Math.PI / 4, delta = [300, 50, 100];
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  const result = buildJointFixings(joint, { ...model, parts: model.parts.map(p => p.id === 'wall' ? moved(rotatedY(p, angle), delta) : p) });
  initial.forEach((instance, i) => nearVector(result[i].position, new THREE.Vector3(...instance.position).applyQuaternion(q).add(new THREE.Vector3(...delta)).toArray()));
});

test('quantité augmentée puis diminuée : indices stables, aucun point manuel perdu ou doublé', () => {
  const { joint, model } = fixture(); joint.anchors = 2;
  joint.fixingLayout = moveJointFixing(joint, model, 'anchor:0', [-777, 1510, -190]);
  const initial = buildJointFixings(joint, model); joint.anchors = 5;
  const expanded = buildJointFixings(joint, model); assert.equal(expanded.length, 5);
  for (const i of [0, 1]) nearVector(expanded[i].position, initial[i].position);
  assert.equal(new Set(expanded.map(p => p.position.join(','))).size, 5);
  joint.fixingLayout = toManualFixingLayout(joint, model); joint.anchors = 1;
  const reduced = normalizeFixingLayout(joint.fixingLayout, joint); assert.equal(reduced.points.length, 1);
  nearVector(buildJointFixings({ ...joint, fixingLayout: reduced }, model)[0].position, initial[0].position);
  assert.equal(normalizeFixingLayout(reduced, { recipe: 'wall_wood', screws: 4 }).points.length, 0);
});

test('liaison bois : connecteur et nombre exact de vis, sans faux boulon ni ancrage', () => {
  const a = wood('a', [0, 0, 0], [0, 2000, 0], { kind: 'post', width: 90, height: 90, roll: 22 });
  const b = wood('b', [0, 1800, 0], [1000, 1800, 0]), model = { parts: [a, b] };
  const joint = { id: 'wood', aPart: 'a', bPart: 'b', position: [0, 1800, 0], recipe: 'hanger', connectors: 1, screws: 12, bolts: 2, anchors: 4 };
  const instances = buildJointFixings(joint, model);
  assert.equal(instances.filter(i => i.type === 'connector').length, 1);
  assert.equal(instances.filter(i => i.type === 'screw').length, 12);
  assert.equal(instances.length, 13); assert.ok(instances.every(i => i.position.every(Number.isFinite)));
  const frame = getJointFixingFrame(joint, model);
  near(new THREE.Vector3(...frame.basis[0]).dot(new THREE.Vector3(...frame.basis[1])), 0);
  near(new THREE.Vector3(...frame.basis[0]).cross(new THREE.Vector3(...frame.basis[1])).dot(new THREE.Vector3(...frame.basis[2])), 1);
});

test('platines au sol : pseudo-liaisons séparées du devis et ancrages dirigés vers le sol', () => {
  const posts = ['plate_mechanical', 'plate_chemical', 'concrete'].map((foundation, index) => ({ id: `post${index}`, foundation }));
  const parts = posts.flatMap((post, index) => [wood(post.id, [index * 1000, 100, 0], [index * 1000, 2100, 0], { kind: 'post', width: 90, height: 90 }), { id: `PIED-${post.id}`, a: [index * 1000, 100, 0], b: [index * 1000, 170, 0], width: 120, height: 120 }]);
  const model = { parts, posts, joints: [] }, before = JSON.stringify(model), project = { anchorsPerBase: 4 };
  const bases = getFoundationJoints(model, project); assert.equal(bases.length, 2);
  assert.deepEqual(bases.map(j => j.id), ['BASE-post0', 'BASE-post1']);
  for (const joint of bases) {
    const instances = buildJointFixings(joint, model); assert.equal(instances.length, 4);
    instances.forEach(i => { near(i.position[1], 104); nearVector(i.basis[2], [0, 1, 0]); });
  }
  assert.equal(JSON.stringify(model), before);
  const layout = moveJointFixing(bases[0], model, 'anchor:0', [30, 104, 40]);
  const manual = getFoundationJoints(model, { ...project, baseFixingLayouts: { post0: layout } });
  nearVector(buildJointFixings(manual[0], model)[0].position, [30, 104, 40]);
  const translated = { ...model, parts: parts.map(p => ['post0', 'PIED-post0'].includes(p.id) ? moved(p, [300, 100, 200]) : p) };
  nearVector(buildJointFixings(manual[0], translated)[0].position, [330, 204, 240]);
});

test('géométries en mètres : tige négative Z, tête positive Z et attributs finis', () => {
  for (const type of ['anchor', 'bolt', 'screw', 'connector']) for (const recipe of type === 'connector' ? ['angle', 'plate', 'hanger'] : ['']) {
    const geometry = createFixingGeometry(type, { recipe }), bounds = geometry.boundingBox;
    assert.ok(geometry.isBufferGeometry); assert.equal(geometry.userData.units, 'm');
    assert.ok(geometry.getAttribute('position').array.every(Number.isFinite));
    assert.ok(bounds.min.z < 0 && bounds.max.z > 0);
    assert.ok(bounds.getSize(new THREE.Vector3()).length() < .2);
    geometry.dispose();
  }
  assert.throws(() => createFixingGeometry('unknown'));
});

test('entrées invalides : erreur explicite à l’édition, rendu vide si élément absent', () => {
  const { joint, model } = fixture(), before = JSON.stringify({ joint, model });
  assert.deepEqual(buildJointFixings({ ...joint, aPart: 'missing' }, model), []);
  assert.deepEqual(buildJointFixings(joint, { ...model, parts: model.parts.map(p => p.id === 'beam' ? { ...p, b: [...p.a] } : p) }), []);
  assert.deepEqual(buildJointFixings(null, model), []);
  assert.throws(() => toManualFixingLayout({ ...joint, bPart: 'missing' }, model));
  assert.throws(() => moveJointFixing(joint, model, 'anchor:99', [0, 0, 0]));
  for (const position of [[0, NaN, 0], [0, Infinity, 0], [0, 0], [0, 0, '5']]) assert.throws(() => moveJointFixing(joint, model, 'anchor:0', position));
  assert.deepEqual(getFoundationJoints({}, {}), []);
  assert.equal(JSON.stringify({ joint, model }), before);
});

function screwInsideItsPlateAndWood(screw, connector, model) {
  const plate = connector.geometry.plates[screw.plateIndex], hole = plate.holes[screw.holeIndex];
  assert.ok(plate && hole, 'La vis doit correspondre à un perçage de la plaque');
  assert.ok(Math.abs(hole[0]) + hole[2] < plate.size[0] / 2);
  assert.ok(Math.abs(hole[1]) + hole[2] < plate.size[1] / 2);
  const connectorQ = new THREE.Quaternion(...connector.quaternion), plateQ = new THREE.Quaternion(...plate.quaternion);
  const expected = new THREE.Vector3(hole[0], hole[1], plate.size[2] / 2 + .1).applyQuaternion(plateQ).add(new THREE.Vector3(...plate.center)).applyQuaternion(connectorQ).add(new THREE.Vector3(...connector.position));
  nearVector(screw.position, expected.toArray());
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(plateQ).applyQuaternion(connectorQ);
  nearVector(screw.basis[2], normal.toArray());
  const part = model.parts.find(p => p.id === screw.supportPartId); assert.ok(part);
  const entry = new THREE.Vector3(...screw.position).addScaledVector(normal, -plate.size[2] - 1);
  const center = new THREE.Vector3(...part.a).add(new THREE.Vector3(...part.b)).multiplyScalar(.5), inWood = entry.sub(center).applyQuaternion(timberQuaternion(part).invert());
  const half = [part.width / 2, part.height / 2, new THREE.Vector3(...part.a).distanceTo(new THREE.Vector3(...part.b)) / 2];
  assert.ok(inWood.toArray().every((n, i) => Math.abs(n) <= half[i] + 1e-6), `La vis ${screw.id} doit entrer dans ${part.id}, coordonnées locales ${inWood.toArray()}`);
}

test('poteau/traverse du modèle : vraie équerre à deux ailes, chaque vis entre dans son bois', () => {
  const model = buildProject(DEFAULT_PROJECT), joint = model.joints[0], fixings = buildJointFixings(joint, model), connector = fixings.find(f => f.type === 'connector');
  assert.equal(connector.incomplete, false); assert.equal(connector.geometry.plates.length, 2);
  const normals = connector.geometry.plates.map(p => new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...p.quaternion)));
  near(normals[0].dot(normals[1]), 0);
  const screws = fixings.filter(f => f.type === 'screw'); assert.equal(screws.length, joint.screws);
  assert.equal(new Set(screws.map(s => s.supportPartId)).size, 2);
  for (const screw of screws) screwInsideItsPlateAndWood(screw, connector, model);
  const geometry = createFixingGeometry('connector', { recipe: joint.recipe, ...connector.geometry });
  assert.ok(geometry.getAttribute('position').count > 100); assert.ok(geometry.getAttribute('position').array.every(Number.isFinite)); geometry.dispose();
});

test('poteau/diagonale : les perçages restent sur les plaques malgré la pente du bois', () => {
  const model = { parts: [wood('post', [0, 0, 0], [0, 2200, 0], { kind: 'post', width: 90, height: 90 }), wood('brace', [45, 1100, 0], [900, 1955, 0], { kind: 'brace', width: 45, height: 70 })] };
  const joint = { id: 'brace-joint', aPart: 'post', bPart: 'brace', recipe: 'angle', position: [45, 1100, 0], connectors: 1, screws: 8 }, fixings = buildJointFixings(joint, model), connector = fixings.find(f => f.type === 'connector');
  assert.equal(connector.incomplete, false); assert.equal(connector.geometry.plates.length, 2);
  for (const screw of fixings.filter(f => f.type === 'screw')) screwInsideItsPlateAndWood(screw, connector, model);
});

test('pente et sections : les vis de chaque équerre ajustée du modèle paramétrique visent le bois', () => {
  const model = buildProject(DEFAULT_PROJECT); let fitted = 0;
  for (const joint of model.joints) {
    const fixings = buildJointFixings(joint, model), connector = fixings.find(f => f.type === 'connector');
    if (!connector || connector.incomplete) continue;
    fitted++;
    for (const screw of fixings.filter(f => f.type === 'screw')) screwInsideItsPlateAndWood(screw, connector, model);
  }
  assert.ok(fitted >= 50);
});

test('sabot adapté à la traverse : ailes sur le poteau, joues et assise sous le bois', () => {
  const model = buildProject(DEFAULT_PROJECT), joint = { ...model.joints[0], recipe: 'hanger', screws: 12 }, fixings = buildJointFixings(joint, model), connector = fixings.find(f => f.type === 'connector');
  assert.equal(connector.incomplete, false); assert.equal(connector.geometry.plates.length, 5);
  assert.equal(fixings.filter(f => f.type === 'screw').length, 12);
  for (const screw of fixings.filter(f => f.type === 'screw')) screwInsideItsPlateAndWood(screw, connector, model);
  const geometry = createFixingGeometry('connector', { recipe: 'hanger', ...connector.geometry });
  assert.ok(geometry.getAttribute('position').array.every(Number.isFinite)); geometry.dispose();
});

test('plat entre sections décalées : zones de vissage sur les deux faces et déport indiqué', () => {
  const model = buildProject(DEFAULT_PROJECT), joint = { ...model.joints[0], recipe: 'plate' }, fixings = buildJointFixings(joint, model), connector = fixings.find(f => f.type === 'connector');
  assert.equal(connector.geometry.plates.length, 3); assert.match(connector.placementNote, /déport/);
  for (const screw of fixings.filter(f => f.type === 'screw')) screwInsideItsPlateAndWood(screw, connector, model);
});

test('manuel : capture sans saut des plaques et des orientations individuelles des vis', () => {
  const model = buildProject(DEFAULT_PROJECT), joint = model.joints[0], automatic = buildJointFixings(joint, model);
  const fixingLayout = normalizeFixingLayout(JSON.parse(JSON.stringify(toManualFixingLayout(joint, model))), joint), manual = buildJointFixings({ ...joint, fixingLayout }, model);
  automatic.forEach((f, i) => {
    nearVector(manual[i].position, f.position);
    f.basis.forEach((axis, j) => nearVector(manual[i].basis[j], axis));
    assert.equal(manual[i].geometry?.plates?.length, f.geometry?.plates?.length);
  });
  const connector = manual.find(f => f.type === 'connector'), delta = [50, 25, -10], newPosition = connector.position.map((v, i) => v + delta[i]);
  const shiftedLayout = moveJointFixing({ ...joint, fixingLayout }, model, connector.id, newPosition), shifted = buildJointFixings({ ...joint, fixingLayout: shiftedLayout }, model);
  manual.forEach((f, i) => nearVector(shifted[i].position, f.position.map((v, axis) => v + delta[axis])));
  const post = model.parts.find(p => p.id === joint.aPart), pivot = new THREE.Vector3(...post.a), rolled = { ...post, roll: 37 }, rotation = timberQuaternion(rolled).multiply(timberQuaternion(post).invert());
  const rotated = buildJointFixings({ ...joint, fixingLayout }, { ...model, parts: model.parts.map(p => p.id === post.id ? rolled : p) });
  manual.forEach((f, i) => {
    nearVector(rotated[i].position, new THREE.Vector3(...f.position).sub(pivot).applyQuaternion(rotation).add(pivot).toArray());
    nearVector(rotated[i].basis[2], new THREE.Vector3(...f.basis[2]).applyQuaternion(rotation).toArray());
  });
});

test('ancien layout manuel sans orientations : ses coordonnées sauvegardées restent inchangées', () => {
  const model = buildProject(DEFAULT_PROJECT), joint = model.joints[0];
  const fixingLayout = toManualFixingLayout(joint, model);
  for (const p of fixingLayout.points) { delete p.quaternion; delete p.geometry; }
  fixingLayout.points[0].local = [12.3, 45.6, 78.9];
  const legacy = { ...joint, fixingLayout }, frame = getJointFixingFrame(legacy, model), result = buildJointFixings(legacy, model);
  const expected = new THREE.Vector3(12.3, 45.6, 78.9).applyQuaternion(new THREE.Quaternion(...frame.quaternion)).add(new THREE.Vector3(...frame.origin));
  nearVector(result[0].position, expected.toArray());
  const again = buildJointFixings({ ...joint, fixingLayout: normalizeFixingLayout(fixingLayout, joint) }, model);
  result.forEach((f, i) => nearVector(f.position, again[i].position));
});

test('ajout de vis après déplacement manuel : les nouvelles vis rejoignent la plaque déplacée', () => {
  const model = buildProject(DEFAULT_PROJECT), joint = { ...model.joints[0] }, automatic = buildJointFixings(joint, model), connector = automatic.find(f => f.type === 'connector');
  joint.fixingLayout = moveJointFixing(joint, model, connector.id, connector.position.map((n, i) => n + [200, -50, 100][i]));
  const initial = buildJointFixings(joint, model); joint.screws = 10;
  const updated = buildJointFixings(joint, model), steel = updated.find(f => f.type === 'connector');
  assert.equal(updated.filter(f => f.type === 'screw').length, 10);
  for (const previous of initial) nearVector(updated.find(f => f.id === previous.id).position, previous.position);
  for (const screw of updated.filter(f => f.type === 'screw')) {
    const p = steel.geometry.plates[screw.plateIndex], hole = p.holes[screw.holeIndex]; assert.ok(hole);
    const expected = new THREE.Vector3(hole[0], hole[1], p.size[2] / 2 + .1).applyQuaternion(new THREE.Quaternion(...p.quaternion)).add(new THREE.Vector3(...p.center)).applyQuaternion(new THREE.Quaternion(...steel.quaternion)).add(new THREE.Vector3(...steel.position));
    nearVector(screw.position, expected.toArray());
  }
  assert.equal(new Set(updated.filter(f => f.type === 'screw').map(f => f.position.map(n => n.toFixed(4)).join(','))).size, 10);
  const saved = toManualFixingLayout(joint, model), restored = buildJointFixings({ ...joint, fixingLayout: JSON.parse(JSON.stringify(saved)) }, model);
  updated.forEach(f => nearVector(restored.find(r => r.id === f.id).position, f.position));
});

test('montage incomplet : diagnostic conservé après passage en manuel et sérialisation', () => {
  const model = buildProject(DEFAULT_PROJECT), joint = model.joints.find(j => j.id === 'J-CHEV-1-AV');
  assert.ok(joint);
  const automatic = buildJointFixings(joint, model).find(f => f.type === 'connector'); assert.equal(automatic.incomplete, true);
  const fixingLayout = normalizeFixingLayout(JSON.parse(JSON.stringify(toManualFixingLayout(joint, model))), joint);
  assert.equal(fixingLayout.points.find(p => p.type === 'connector').incomplete, true);
  const result = buildJointFixings({ ...joint, fixingLayout }, model).find(f => f.type === 'connector');
  assert.equal(result.incomplete, true); assert.equal(result.placementNote, automatic.placementNote);
});
