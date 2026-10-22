import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT, normalizeProject, buildProject, calculateBOM, optimizeCuts, toCSV } from '../src/model.js';

const project = patch => normalizeProject({ ...DEFAULT_PROJECT, ...patch });
const bom = patch => { const p = project(patch); return calculateBOM(p, buildProject(p)); };

test('normalisation : valeurs non finies, bornes, import fermé et clés dangereuses', () => {
  const p = normalizeProject(JSON.parse('{"width":-300,"height":"Infinity","gatePosition":20,"postSection":999,"name":"<script>enclos</script>","stock":{"__proto__":22,"constructor":44,"ok":7,"bad":-5},"unknown":12}'));
  assert.equal(p.width, 1000); assert.equal(p.height, DEFAULT_PROJECT.height);
  assert.equal(p.gatePosition, 1); assert.equal(p.postSection, 100);
  assert.equal(p.name.includes('<'), false); assert.equal(p.unknown, undefined);
  assert.deepEqual(p.stock, { ok: 7, bad: 0 });
  assert.equal(Object.hasOwn(p.stock, '__proto__'), false);
});

test('géométrie de base : poteaux uniques, ouverture libre et liaisons reliées aux pièces', () => {
  const model = buildProject(DEFAULT_PROJECT), s = DEFAULT_PROJECT.postSection;
  assert.equal(model.posts.length, 10);
  assert.equal(new Set(model.posts.map(a => `${a.x}:${a.z}`)).size, model.posts.length);
  assert.equal(new Set(model.parts.map(a => a.id)).size, model.parts.length);
  const left = model.posts.find(a => a.id === 'P-PORTE-G'), right = model.posts.find(a => a.id === 'P-PORTE-D');
  assert.equal(right.x - left.x - s, DEFAULT_PROJECT.gateWidth);
  assert.equal(model.gate.leafWidth, DEFAULT_PROJECT.gateWidth - 30);
  const frontZ = -(DEFAULT_PROJECT.depth - s) / 2;
  assert.equal(model.posts.filter(a => a.z === frontZ && a.x > left.x && a.x < right.x).length, 0);
  for (const beam of model.parts.filter(a => a.kind === 'beam' && a.a[2] === frontZ && a.b[2] === frontZ && a.id !== 'T-PORTE-H')) {
    assert.ok(Math.max(beam.a[0], beam.b[0]) <= model.gate.left || Math.min(beam.a[0], beam.b[0]) >= model.gate.right);
  }
  const ids = new Set(model.parts.map(a => a.id));
  for (const joint of model.joints) { assert.ok(ids.has(joint.aPart), joint.id); assert.ok(ids.has(joint.bPart), joint.id); }
});

test('largeur et profondeur hors tout exactes, y compris les sections orientées', () => {
  for (const change of [{}, { width: 5700, depth: 4100 }, { postSection: 40, beamWidth: 150, beamHeight: 250, roofRise: 1500, depth: 1000 }]) {
    const p = project(change), model = buildProject(p), xs = [], zs = [];
    for (const part of model.parts.filter(a => a.material === 'wood')) {
      const delta = part.b.map((v, i) => v - part.a[i]), len = Math.hypot(...delta), dir = delta.map(v => v / len), horizontal = Math.hypot(dir[0], dir[2]);
      const n = horizontal > 1e-8 ? [dir[2] / horizontal, 0, -dir[0] / horizontal] : part.orientation === 'gateVertical' ? [0, 0, 1] : [1, 0, 0];
      const h = [dir[1] * n[2] - dir[2] * n[1], dir[2] * n[0] - dir[0] * n[2], dir[0] * n[1] - dir[1] * n[0]];
      for (const point of [part.a, part.b]) for (const u of [-1, 1]) for (const v of [-1, 1]) {
        xs.push(point[0] + u * part.width / 2 * n[0] + v * part.height / 2 * h[0]);
        zs.push(point[2] + u * part.width / 2 * n[2] + v * part.height / 2 * h[2]);
      }
    }
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - p.width) < 1e-5);
    assert.ok(Math.abs(Math.max(...zs) - Math.min(...zs) - p.depth) < 1e-5);
    const roof = model.parts.find(a => a.id === 'COUVERTURE');
    assert.equal(Math.max(...roof.corners.map(a => a[0])) - Math.min(...roof.corners.map(a => a[0])), p.width);
    assert.equal(Math.max(...roof.corners.map(a => a[2])) - Math.min(...roof.corners.map(a => a[2])), p.depth);
    const front = model.posts.find(a => a.id === 'P-AV-G'), back = model.posts.find(a => a.id === 'P-AR-G');
    assert.equal(back.height - front.height, p.roofRise);
    assert.ok(Math.abs((roof.corners[2][1] - roof.corners[0][1]) / p.depth - p.roofRise / (p.depth - p.postSection)) < 1e-8);
  }
});

test('traverses : longueur nette entre faces, poteaux aux angles partagés', () => {
  const p = project({ roof: 'none' }), model = buildProject(p);
  for (const joint of model.joints.filter(a => a.id.startsWith('J-T-') && a.id.endsWith('-A'))) {
    const beam = model.parts.find(a => a.id === joint.bPart), postA = model.posts.find(a => a.id === joint.aPart);
    const end = model.joints.find(a => a.id === joint.id.slice(0, -1) + 'B'), postB = model.posts.find(a => a.id === end.aPart);
    const centreLength = Math.hypot(postB.x - postA.x, postB.z - postA.z);
    assert.ok(Math.abs(beam.length - (centreLength - p.postSection)) < 0.02);
    assert.ok(centreLength <= p.maxSpan + 0.01 || beam.id === 'T-PORTE-H');
  }
});

test('portillon décalé aux limites : deux montants dédiés et aucune pièce négative', () => {
  for (const ratio of [0, 0.1, 0.9, 1]) {
    const model = buildProject(project({ gatePosition: ratio, width: 1000, gateWidth: 300, beamHeight: 250, postSection: 250 }));
    assert.equal(model.posts.filter(a => a.id.startsWith('P-PORTE-')).length, 2);
    assert.equal(new Set(model.posts.map(a => `${a.x}:${a.z}`)).size, model.posts.length);
    for (const part of model.parts) assert.ok(part.length > 0 && Number.isFinite(part.length), part.id);
  }
});

test('plots : litres géométriques, réserve et sacs selon rendement', () => {
  const rows = bom(), concrete = rows.find(a => a.id === 'concrete-bags');
  assert.equal(rows.find(a => a.id === 'base-concrete').label, 'Pied de poteau à sceller');
  assert.ok(Math.abs(concrete.required - 10 * 0.3 * 0.3 * 0.5 * 1000) < 1e-8);
  assert.equal(concrete.marginQty, 45); assert.equal(concrete.packs, 42); assert.equal(concrete.purchaseQty, 504);
  const changed = bom({ concreteYield: 15, stock: { 'concrete-bags': 90 }, prices: { 'concrete-bags': 6.5 } }).find(a => a.id === 'concrete-bags');
  assert.equal(changed.toBuy, 405); assert.equal(changed.packs, 27); assert.equal(changed.total, 175.5);
});

test('appuis individualisés : remplacement local, compatibilité et absence de double compte', () => {
  const p = project({ postOverrides: { 'P-AV-G': { ground: 'concrete', foundation: 'plate_chemical' } } });
  const model = buildProject(p), rows = calculateBOM(p, model);
  assert.equal(model.stats.footingCount, 9); assert.equal(model.stats.concreteLitres, 405);
  assert.equal(rows.find(a => a.id === 'base-plate_chemical').required, 1);
  assert.equal(rows.find(a => a.id === 'chemical-rod-kit').required, 4);
  assert.equal(rows.find(a => a.id === 'resin-cartridge').required, 40);
  assert.equal(rows.find(a => a.id === 'resin-cartridge').packs, 1);
  assert.ok(!rows.some(a => /rondelle/i.test(a.label) && a.unit !== 'kit')); // incluses dans les kits, pas de seconde ligne
  assert.equal(model.warnings.some(a => a.code === 'support-P-AV-G'), false);
  const bad = buildProject(project({ ground: 'pavers', foundation: 'plate_mechanical' }));
  assert.ok(bad.warnings.some(a => a.code.startsWith('support-')));
  assert.ok(bad.warnings.some(a => a.code === 'pavers-limit'));
});

test('débit : trait de scie, sections séparées et pièces impossibles non raccordées', () => {
  const cuts = optimizeCuts([{ id: 'A', length: 1500, section: '45×70' }, { id: 'B', length: 1500, section: '45×70' }], [3000], 3);
  assert.equal(cuts.bars.length, 2);
  const exact = optimizeCuts([{ id: 'A', length: 1498, section: '45×70' }, { id: 'B', length: 1499, section: '45×70' }], [3000], 3);
  assert.equal(exact.bars.length, 1); assert.equal(exact.bars[0].waste, 0);
  const mixed = optimizeCuts([{ id: 'A', length: 1000, section: '90×90' }, { id: 'B', length: 1000, section: '45×70' }, { id: 'C', length: 4001, section: '45×70' }], [3000, 4000], 3);
  assert.equal(mixed.bars.length, 2); assert.equal(mixed.unplaced.length, 1); assert.equal(mixed.unplaced[0].id, 'C');
});

test('bois : le débit inclut les chutes sans seconde marge et compte les hors longueur', () => {
  const rows = bom({ woodStockLength: 1000, margin: 20 }), wood = rows.filter(a => a.category === 'Bois');
  assert.ok(wood.some(a => a.id.startsWith('wood-custom-')));
  assert.ok(wood.filter(a => a.id.startsWith('wood-custom-')).every(a => a.needsQuote && !a.priced));
  for (const item of wood) assert.equal(item.marginQty, 0);
  const count = wood.reduce((sum, item) => sum + item.partIds.length, 0);
  assert.equal(count, buildProject(project({ woodStockLength: 1000, margin: 20 })).stats.woodPieces);
});

test('quantités adaptatives : agrandissement, couverture, joints et grillage', () => {
  const base = bom(), wider = bom({ width: 8000 }), noRoof = bom({ roof: 'none' }), screws = bom({ joint: 'screw' });
  assert.ok(wider.find(a => a.id === 'concrete-bags').required > base.find(a => a.id === 'concrete-bags').required);
  assert.ok(wider.find(a => a.id === 'mesh-roll').required > base.find(a => a.id === 'mesh-roll').required);
  assert.ok(noRoof.find(a => a.id === 'mesh-roll').required < base.find(a => a.id === 'mesh-roll').required);
  assert.ok(!screws.some(a => a.id === 'joint-angle'));
  assert.equal(screws.find(a => a.id === 'joint-structural-screws').required, 2 * buildProject(project({ joint: 'screw' })).joints.length);
});

test('conditionnements : stock complet ou supérieur ne crée pas de quantité négative', () => {
  const rows = bom({ stock: { 'joint-angle-screws': 9000, 'gate-hinges': 2 } });
  for (const id of ['joint-angle-screws', 'gate-hinges']) {
    const item = rows.find(a => a.id === id); assert.equal(item.packs, 0); assert.equal(item.toBuy, 0); assert.equal(item.total, 0);
  }
});

test('grillage : les bandes indivisibles imposent assez de rouleaux', () => {
  const p = project({ meshRollLength: 3000, meshRollWidth: 1000, margin: 0, roof: 'none' });
  const row = calculateBOM(p).find(a => a.id === 'mesh-roll');
  const strips = row.cuts.flatMap(c => Array.from({ length: c.count }, (_, i) => ({ id: `${c.partId}-${i}`, length: c.cutLength })));
  const packing = optimizeCuts(strips, [p.meshRollLength], 0);
  assert.equal(packing.unplaced.length, 0);
  assert.ok(row.packs >= packing.bars.length);
});

test('grillage : recouvrement, stock indivisible et longueur impossible signalée', () => {
  const small = bom({ meshOverlap: 0 }).find(a => a.id === 'mesh-roll'), overlap = bom({ meshOverlap: 100 }).find(a => a.id === 'mesh-roll');
  assert.ok(overlap.required > small.required);
  const p = project({ meshRollLength: 3000, meshRollWidth: 300, margin: 0, roof: 'none', stock: { 'mesh-roll': 1 } });
  const row = calculateBOM(p).find(a => a.id === 'mesh-roll');
  assert.ok(row.packs > 0);
  assert.ok(row.detail.includes('un seul reste continu'));
  const invalid = project({ meshRollLength: 1000, meshRollWidth: 300, roof: 'mesh' }), model = buildProject(invalid);
  assert.ok(model.warnings.some(a => a.code === 'mesh-too-short'));
  assert.equal(calculateBOM(invalid, model).find(a => a.id === 'mesh-roll').needsReview, true);
});

test('export CSV : UTF-8, séparateur Excel, guillemets et neutralisation des formules', () => {
  const csv = toCSV([{ label: '=1+1', detail: 'Un "kit"; à vérifier\nDeuxième ligne' }]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('Un ""kit""; à vérifier\nDeuxième ligne'));
  assert.ok(csv.includes('"État checklist"'));
  assert.ok(csv.includes('"Prix renseigné"'));
  assert.ok(csv.includes('"À acheter"'));
  const checked = toCSV([{ id: 'item', label: 'Vis', unitPrice: 5 }], { item: true });
  assert.ok(checked.includes('"Acheté"'));
  assert.ok(checked.includes('"Oui"'));
});
