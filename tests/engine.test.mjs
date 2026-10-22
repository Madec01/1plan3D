import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engine.js';

const empty = extra => e.normalizeProject({ mode: 'free', freeParts: [], freeJoints: [], ...extra });
const append = (p, kind, override = {}) => { const part = { ...e.makePart(p, kind), ...override }; return e.normalizeProject({ ...p, freeParts: [...p.freeParts, part] }); };
const row = (p, id) => e.calculateBOM(p).find(a => a.id === id);
const approx = (a, b, message = '') => assert.ok(Math.abs(a - b) < .002, `${message} ${a} / ${b}`);

test('migration V1 et sauvegarde V5 : paramètres, notes, stocks, prix et checklist conservés', () => {
  const p = e.normalizeProject({ version: 1, name: 'Mon ancien enclos', width: 5200, notes: 'Le mur du fond', stock: { 'wood-90x90-3000': 4 }, prices: { 'wood-90x90-3000': 18 }, purchased: { 'wood-90x90-3000': true } });
  assert.equal(p.version, 5); assert.equal(p.mode, 'parametric'); assert.equal(p.width, 5200); assert.equal(p.notes, 'Le mur du fond');
  assert.equal(p.stock['wood-90x90-3000'], 4); assert.equal(p.stock['wood-pin-90x90-3000'], 4);
  assert.equal(p.prices['wood-pin-90x90-3000'], 18); assert.equal(p.purchased['wood-pin-90x90-3000'], true);
  const restored = e.normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored, p);
});

test('conversion paramétrique vers libre : géométrie et devis conservés', () => {
  const p = e.normalizeProject({ jointOverrides: { 'J-T-AV-G-1-H-A': { recipe: 'screw', screws: 3 } } });
  const before = e.buildProject(p), free = e.convertToFree(p), after = e.buildProject(free);
  assert.equal(free.mode, 'free'); assert.equal(free.freeParts.length, before.parts.filter(a => ['wood', 'mesh', 'roof'].includes(a.material)).length);
  assert.equal(after.parts.length, before.parts.length); assert.equal(after.joints.length, before.joints.length);
  for (const key of ['postCount', 'woodPieces', 'woodLength', 'meshArea', 'roofArea', 'concreteLitres']) approx(before.stats[key], after.stats[key], key);
  for (const item of e.calculateBOM(p, before)) { const converted = e.calculateBOM(free, after).find(a => a.id === item.id); assert.ok(converted, item.id); approx(item.required, converted.required, item.id); }
  assert.deepEqual(before.bounds, after.bounds);
  assert.ok(!before.warnings.some(w => w.code.startsWith('joint-gap-J-CHEV')));
});

test('identifiants : insertion, suppression et réouverture ne réutilisent pas les numéros', () => {
  let p = append(empty(), 'post'); const first = p.freeParts[0].id;
  p = append(p, 'beam'); const second = p.freeParts[1].id;
  assert.notEqual(first, second); assert.equal(p.nextId, 3);
  p = e.removeParts(p, [second]); p = e.normalizeProject(JSON.parse(JSON.stringify(p)));
  const next = e.makePart(p, 'beam'); assert.equal(next.id, 'F-000003');
  const duplicate = e.normalizeProject({ ...p, freeParts: [...p.freeParts, { ...p.freeParts[0] }] });
  assert.equal(new Set(duplicate.freeParts.map(a => a.id)).size, 2); assert.equal(duplicate.freeParts.length, 2);
  assert.ok(duplicate.importWarnings.length);
});

test('translation et duplication : déplacement précis des coins, liaisons internes dupliquées', () => {
  let p = append(empty(), 'post'); p = append(p, 'beam'); p = append(p, 'panel');
  p = e.addJoint(p, p.freeParts[0].id, p.freeParts[1].id, 'angle');
  const ids = p.freeParts.map(a => a.id), oldCorners = p.freeParts[2].corners;
  const moved = e.translateParts(p, [ids[2]], [12, 34, 56]);
  assert.deepEqual(moved.freeParts[2].corners[2], oldCorners[2].map((v, i) => v + [12, 34, 56][i]));
  assert.deepEqual(p.freeParts[2].corners, oldCorners);
  const copied = e.duplicateParts(p, ids, [500, 0, 0]);
  assert.equal(copied.freeParts.length, 6); assert.equal(copied.freeJoints.length, 2);
  assert.equal(new Set([...copied.freeParts, ...copied.freeJoints].map(a => a.id)).size, 8);
  const removed = e.removeParts(copied, [ids[0]]);
  assert.equal(removed.freeParts.length, 5); assert.equal(removed.freeJoints.length, 1);
});

test('projet libre vide et poteau sans appui : aucune quincaillerie inventée', () => {
  const p = empty(); assert.deepEqual(e.calculateBOM(p), []);
  assert.deepEqual(e.buildProject(p).bounds, { min: [0, 0, 0], max: [0, 0, 0], width: 0, depth: 0, height: 0 });
  const one = append(p, 'post', { foundation: 'none' });
  const model = e.buildProject(one); assert.equal(model.posts.length, 1); assert.equal(model.stats.footingCount, 0);
  assert.ok(!e.calculateBOM(one).some(a => /base-|gate-|post-bolt/.test(a.id)));
});

test('paramétrique : une recette remplacée supprime seulement son ancien kit', () => {
  const p = e.normalizeProject(), m = e.buildProject(p), joint = m.joints[0], count = m.joints.length;
  const changed = e.normalizeProject({ ...p, jointOverrides: { [joint.id]: { recipe: 'bolt', bolts: 2 } } });
  assert.equal(row(changed, 'joint-angle').required, count - 1);
  assert.equal(row(changed, 'joint-angle-screws').required, 8 * (count - 1));
  assert.equal(row(changed, 'joint-bolt-kit').required, 2);
  assert.equal(e.buildProject(changed).joints[0].recipe, 'bolt');
});

test('libre : quantité de chaque liaison, références séparées, stocks et prix', () => {
  let p = append(empty({ margin: 10 }), 'post', { foundation: 'none' }); p = append(p, 'beam');
  p = e.addJoint(p, p.freeParts[0].id, p.freeParts[1].id, { recipe: 'angle', connectors: 2, screws: 16 });
  assert.equal(row(p, 'joint-angle').required, 2); assert.equal(row(p, 'joint-angle-screws').required, 16);
  p.prices['joint-angle-screws'] = 8; p.stock['joint-angle-screws'] = 5;
  assert.equal(row(p, 'joint-angle-screws').packs, 1); assert.equal(row(p, 'joint-angle-screws').total, 8);
  p.freeJoints[0] = { ...p.freeJoints[0], ...e.getJointDefaults('screw'), screws: 4 };
  assert.equal(row(p, 'joint-angle'), undefined); assert.equal(row(p, 'joint-angle-screws'), undefined);
  assert.equal(row(p, 'joint-structural-screws').required, 4);
  p = e.addJoint(p, p.freeParts[0].id, p.freeParts[1].id, { recipe: 'screw', screws: 3, reference: 'Vis A4 fabricant' });
  assert.equal(e.calculateBOM(p).filter(a => a.id.startsWith('joint-structural-screws')).length, 2);
});

test('mur creux : tamis, résine et tiges suivent les ancrages sans acheter le mur', () => {
  let p = append(empty(), 'wall', { wallSupport: 'hollow_block' }); p = append(p, 'beam');
  p = e.addJoint(p, p.freeParts[0].id, p.freeParts[1].id, { recipe: 'wall_screen', anchors: 6, resinDose: 15 });
  const model = e.buildProject(p), rows = e.calculateBOM(p, model);
  assert.equal(rows.find(a => a.id === 'wall-screen').required, 6);
  assert.equal(rows.find(a => a.id === 'wall-chemical-rod-kit').required, 6);
  assert.equal(rows.find(a => a.id === 'wall-resin-cartridge').required, 90);
  assert.ok(!rows.some(a => a.label === 'Mur existant'));
  assert.ok(!model.warnings.some(a => a.code.startsWith('wall-mismatch')));
  p.freeJoints[0] = { ...p.freeJoints[0], ...e.getJointDefaults('wall_mechanical') };
  assert.equal(row(p, 'wall-screen'), undefined); assert.equal(row(p, 'wall-resin-cartridge'), undefined);
  const invalid = e.buildProject(p); assert.ok(invalid.warnings.some(a => a.code.startsWith('wall-mismatch')));
  assert.equal(invalid.joints[0].status, 'incompatible');
});

test('diagnostics : support inconnu, liaison absente et pièces éloignées', () => {
  let p = append(empty(), 'wall'); p = append(p, 'beam');
  p = e.addJoint(p, p.freeParts[0].id, p.freeParts[1].id, 'wall_chemical');
  let model = e.buildProject(p);
  assert.equal(model.joints[0].status, 'incomplet'); assert.ok(model.joints[0].diagnostics.length);
  assert.ok(model.warnings.some(a => a.code.startsWith('joint-gap')));
  p.freeJoints.push({ id: 'J-999999', aPart: 'missing', bPart: p.freeParts[1].id, recipe: 'angle' });
  model = e.buildProject(p); assert.equal(model.joints.at(-1).valid, false);
  assert.ok(model.warnings.some(a => a.code.startsWith('joint-missing')));
  assert.equal(row(p, 'joint-angle'), undefined);
});

test('plusieurs panneaux de toiture : toutes les surfaces sont quantifiées', () => {
  let p = append(empty(), 'roof'); p = append(p, 'roof');
  const m = e.buildProject(p); approx(m.stats.roofArea, 8);
  assert.equal(row(p, 'roof-cover').required, 8);
  assert.equal(row(p, 'roof-fasteners').required, 48);
  assert.equal(row(p, 'roof-cover').partIds.length, 2);
});

test('essences : débits et achats séparés, pièces hors longueur présentes', () => {
  let p = append(empty(), 'beam', { a: [0, 0, 0], b: [1000, 0, 0], species: 'pin' });
  p = append(p, 'beam', { a: [0, 500, 0], b: [1000, 500, 0], species: 'douglas' });
  const rows = e.calculateBOM(p).filter(a => a.category === 'Bois');
  assert.equal(rows.length, 2); assert.ok(rows.some(a => a.id.includes('pin'))); assert.ok(rows.some(a => a.id.includes('douglas')));
  const cut = e.optimizeCuts(e.buildProject(p).parts.filter(a => a.material === 'wood'), [3000], 3);
  assert.equal(cut.bars.length, 2);
  p.freeParts[0].b = [5000, 0, 0];
  assert.ok(e.calculateBOM(p).some(a => a.id.startsWith('wood-custom-pin') && a.needsQuote && !a.priced));
});

test('fondations libres : déplacées avec le pied et retirées avec le poteau', () => {
  let p = append(empty(), 'post', { a: [200, 300, 400], b: [200, 2300, 400], foundation: 'concrete' });
  let model = e.buildProject(p), footing = model.parts.find(a => a.kind === 'footing');
  assert.deepEqual(footing.b, [200, 300, 400]); assert.equal(model.stats.concreteLitres, 45);
  p = e.translateParts(p, [p.freeParts[0].id], [100, 50, 200]); model = e.buildProject(p);
  assert.deepEqual(model.parts.find(a => a.kind === 'footing').b, [300, 350, 600]);
  assert.equal(e.calculateBOM(e.removeParts(p, [p.freeParts[0].id])).length, 0);
});

test('normalisation et diagnostics limités : murs horizontaux, doublons et panneaux non plans', () => {
  let p = append(empty(), 'wall', { a: [0, 100, 0], b: [2000, 999, 0] });
  assert.equal(p.freeParts[0].b[1], 100);
  p = append(p, 'beam'); p = append(p, 'beam');
  p = append(p, 'panel', { corners: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [0, 1000, 50]] });
  const model = e.buildProject(p);
  assert.ok(model.warnings.some(a => a.code.startsWith('overlap')));
  assert.ok(model.warnings.some(a => a.code.startsWith('panel-warped')));
  assert.ok(!JSON.stringify(e.normalizeProject({ ...p, notes: '<script>bad</script>' })).includes('<script>'));
});

test('recettes globales étendues : sauvegarde et liaisons paramétriques utilisent le choix', () => {
  for (const recipe of ['hanger', 'plate', 'wood']) {
    const p = e.normalizeProject({ joint: recipe }), model = e.buildProject(p);
    assert.equal(e.normalizeProject(JSON.parse(JSON.stringify(p))).joint, recipe);
    assert.ok(model.joints.every(joint => joint.recipe === recipe));
    const rows = e.calculateBOM(p, model);
    assert.ok(!rows.some(row => row.id === 'joint-angle' || row.id === 'joint-angle-screws'));
    if (recipe !== 'wood') assert.equal(rows.find(row => row.id === `joint-${recipe}`).required, model.joints.length);
  }
});

test('bounds de structure distincts de sceneBounds et repère vertical non carré cohérent', () => {
  const model = e.buildProject();
  approx(model.bounds.width, 4000); approx(model.bounds.depth, 3000); assert.equal(model.bounds.min[1], 0);
  assert.ok(model.sceneBounds.width > model.bounds.width); assert.ok(model.sceneBounds.min[1] < 0);
  let p = append(empty(), 'beam', { a: [0, 0, 0], b: [0, 1000, 0], width: 40, height: 100, roll: 0 });
  let vertical = e.buildProject(p); approx(vertical.bounds.width, 100); approx(vertical.bounds.depth, 40);
  p.freeParts[0].roll = 90; vertical = e.buildProject(p); approx(vertical.bounds.width, 40); approx(vertical.bounds.depth, 100);
});

test('avertissements d’import persistants et quincaillerie de portillon copié signalée', () => {
  let p = append(empty(), 'beam'); p.freeParts.push({ ...p.freeParts[0] });
  p = e.normalizeProject(p); const retained = e.normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(retained.importWarnings, p.importWarnings);
  assert.ok(e.buildProject(retained).warnings.some(w => w.code.startsWith('import-')));
  const free = e.convertToFree(e.DEFAULT_PROJECT), gate = free.freeParts.filter(part => part.group === 'gate').map(part => part.id);
  const copy = e.duplicateParts(free, gate, [1000, 0, 0]);
  assert.ok(e.buildProject(copy).warnings.some(w => w.code === 'gate-hardware-manual'));
});

test('diagnostics libres : pièce isolée dans un groupe relié et rouleau trop court', () => {
  let p = append(empty(), 'post', { foundation: 'none' });
  p = append(p, 'beam', { a: [0, 1500, 0], b: [1000, 1500, 0] });
  p = append(p, 'beam', { a: [4000, 1500, 0], b: [5000, 1500, 0] });
  p = e.addJoint(p, p.freeParts[0].id, p.freeParts[1].id, 'angle');
  const model = e.buildProject(p);
  assert.ok(model.warnings.some(w => w.code === `part-unconnected-${p.freeParts[2].id}`));
  assert.ok(!model.warnings.some(w => w.code === `part-unconnected-${p.freeParts[1].id}`));
  p = append(p, 'panel', { corners: [[0, 0, 0], [2000, 0, 0], [2000, 2000, 0], [0, 2000, 0]] });
  p.meshRollLength = 1000;
  assert.ok(e.buildProject(p).warnings.some(w => w.code === 'mesh-too-short'));
});
