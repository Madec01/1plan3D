import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectLibrary, projectsView, PROJECT_LIBRARY_KEY, ProjectLibraryError } from '../src/project-library.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    writes: 0, blocked: false,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (this.blocked) { const error = new Error('quota'); error.name = 'QuotaExceededError'; throw error; }
      this.writes++; values.set(key, String(value));
    }
  };
}
const project = (name = 'Enclos', width = 4000) => ({ version: 4, name, width, depth: 3000, mode: 'free', freeParts: [], freeJoints: [], notes: '', stock: {}, prices: {}, purchased: {} });
function fixture(options = {}) {
  const storage = memoryStorage({ 'atelier.project.v4': '{"working":true}', 'atelier.project.before-import': '{"backup":true}' });
  let time = Date.parse('2026-10-19T12:00:00Z');
  const store = createProjectLibrary(storage, { now: () => time++, ...options });
  return { storage, store };
}
const code = expected => error => error instanceof ProjectLibraryError && error.code === expected;

test('la bibliothèque démarre sans écriture et préserve les copies de travail existantes', () => {
  const { storage, store } = fixture();
  assert.equal(storage.writes, 0);
  assert.deepEqual(store.read(), { schemaVersion: 1, activeId: null, projects: [] });
  assert.deepEqual(store.list(), []);
  assert.equal(store.activeId(), null);
  store.save(project());
  assert.equal(storage.getItem('atelier.project.v4'), '{"working":true}');
  assert.equal(storage.getItem('atelier.project.before-import'), '{"backup":true}');
  assert.equal(storage.writes, 1);
});

test('enregistrer le projet actif, créer une copie et éviter les versions identiques', () => {
  const { storage, store } = fixture();
  const first = store.save(project('Enclos'));
  const second = store.save(project('Pergola'), { id: null });
  assert.notEqual(first.id, second.id);
  assert.equal(store.list().length, 2);
  assert.equal(store.activeId(), second.id);
  const opened = store.open(first.id);
  opened.project.width = 5200;
  const saved = store.save(opened.project);
  assert.equal(saved.id, first.id);
  assert.equal(store.revisions(first.id).length, 1);
  assert.equal(store.read().projects.find(item => item.id === first.id).revisions[0].project.width, 4000);
  assert.equal(store.open(second.id).project.width, 4000);
  store.open(first.id);
  const before = storage.writes;
  assert.equal(store.save(saved.project).changed, false);
  assert.equal(storage.writes, before);
  assert.equal(store.revisions(first.id).length, 1);
  saved.project.width = 99;
  assert.equal(store.open(first.id).project.width, 5200);
});

test('renommer un projet inactif ne change pas le projet actif et crée une version restaurable', () => {
  const { store } = fixture();
  const first = store.save(project('Enclos'));
  const second = store.save(project('Pergola'), { id: null });
  store.rename(first.id, '  Poulailler été  ');
  assert.equal(store.activeId(), second.id);
  assert.equal(store.list().find(item => item.id === first.id).name, 'Poulailler été');
  const revision = store.revisions(first.id)[0];
  assert.equal(revision.name, 'Enclos');
  assert.equal(store.restore(first.id, revision.id).project.name, 'Enclos');
});

test('dix versions maximum et restauration qui conserve le travail remplacé', () => {
  const { store } = fixture();
  const initial = store.save(project());
  let totalPruned = 0;
  for (let i = 1; i <= 15; i++) totalPruned += store.save(project('Enclos', 4000 + i)).prunedRevisions;
  assert.equal(totalPruned, 5);
  const record = store.read().projects[0];
  assert.equal(record.revisions.length, 10);
  assert.equal(record.revisions[0].project.width, 4014);
  assert.equal(record.revisions.at(-1).project.width, 4005);
  const restored = store.restore(initial.id, record.revisions[4].id);
  assert.equal(restored.project.width, 4010);
  assert.equal(store.read().projects[0].revisions[0].project.width, 4015);
  assert.equal(store.read().projects[0].revisions.length, 10);
});

test('dupliquer produit un projet indépendant sans reprendre son historique', () => {
  const { store } = fixture();
  const original = store.save(project());
  store.save(project('Enclos', 5000));
  const duplicate = store.duplicate(original.id);
  assert.notEqual(duplicate.id, original.id);
  assert.equal(duplicate.name, 'Enclos (copie)');
  assert.equal(store.revisions(duplicate.id).length, 0);
  store.save(project('Copie modifiée', 7000));
  assert.equal(store.open(original.id).project.width, 5000);
});

test('supprimer choisit le projet restant le plus récent sans toucher aux autres sauvegardes', () => {
  const { storage, store } = fixture();
  const first = store.save(project('A'));
  const second = store.save(project('B'), { id: null });
  const third = store.save(project('C'), { id: null });
  store.remove(first.id);
  assert.equal(store.activeId(), third.id);
  assert.equal(store.remove(third.id).activeId, second.id);
  const removed = store.remove(second.id);
  assert.equal(removed.activeId, null);
  assert.equal(removed.project, null);
  assert.deepEqual(store.list(), []);
  assert.equal(storage.getItem('atelier.project.before-import'), '{"backup":true}');
});

test('la limite de vingt projets est appliquée sans supprimer de projet', () => {
  const { storage, store } = fixture();
  for (let i = 0; i < 20; i++) store.save(project(`Projet ${i}`), { id: null });
  const before = storage.getItem(PROJECT_LIBRARY_KEY);
  assert.throws(() => store.save(project('Trop'), { id: null }), code('LIMIT_PROJECTS'));
  assert.equal(storage.getItem(PROJECT_LIBRARY_KEY), before);
  assert.equal(store.list().length, 20);
});

test('la sauvegarde globale restitue les projets, leurs identifiants et leurs versions', () => {
  const { store } = fixture();
  store.save(project('Enclos'));
  store.save({ ...project('Enclos'), freeParts: [{ id: 'P-1', kind: 'post', a: [0, 0, 0], b: [0, 2000, 0], width: 90, height: 90 }] });
  store.save(project('Pergola'), { id: null });
  const destination = fixture();
  const result = destination.store.importBackup(store.exportBackup(), { mode: 'replace' });
  assert.equal(result.added, 2);
  assert.deepEqual(destination.store.read(), store.read());
  assert.equal(destination.storage.writes, 1);
  assert.equal(destination.storage.getItem('atelier.project.v4'), '{"working":true}');
});

test('fusionner ne remplace pas un identifiant différent et ignore les copies strictement identiques', () => {
  const source = fixture(), destination = fixture();
  const original = source.store.save(project('Enclos'));
  const backup = source.store.exportBackup();
  destination.store.importBackup(backup);
  assert.equal(destination.store.importBackup(backup).skipped, 1);
  assert.equal(destination.store.list().length, 1);
  destination.store.save(project('Version locale', 6500));
  const result = destination.store.importBackup(backup);
  assert.equal(result.added, 1);
  assert.equal(destination.store.list().length, 2);
  assert.equal(destination.store.open(original.id).project.name, 'Version locale');
  assert.ok(destination.store.list().some(record => record.id !== original.id && record.name === 'Enclos'));
});

test('un import global partiellement invalide ne produit aucune écriture', () => {
  const source = fixture(), destination = fixture();
  source.store.save(project('A')); source.store.save(project('B'), { id: null });
  destination.store.save(project('Travail à garder'));
  const oldRaw = destination.storage.getItem(PROJECT_LIBRARY_KEY), oldWrites = destination.storage.writes;
  const backup = JSON.parse(source.store.exportBackup());
  backup.library.projects[1].project.width = 'incorrect';
  assert.throws(() => destination.store.importBackup(JSON.stringify(backup), { mode: 'replace' }), code('INVALID_BACKUP'));
  assert.equal(destination.storage.getItem(PROJECT_LIBRARY_KEY), oldRaw);
  assert.equal(destination.storage.writes, oldWrites);
  backup.library.projects[1].project.width = 4000;
  backup.library.projects[1].id = backup.library.projects[0].id;
  assert.throws(() => destination.store.importBackup(JSON.stringify(backup)), code('INVALID_BACKUP'));
  assert.equal(destination.storage.getItem(PROJECT_LIBRARY_KEY), oldRaw);
  const badGeometry = JSON.parse(source.store.exportBackup());
  badGeometry.library.projects[0].project.freeParts = [null];
  assert.throws(() => destination.store.importBackup(JSON.stringify(badGeometry)), code('INVALID_BACKUP'));
  assert.equal(destination.storage.getItem(PROJECT_LIBRARY_KEY), oldRaw);
});

test('le dépassement de capacité pendant une fusion conserve la bibliothèque entière', () => {
  const source = fixture(), destination = fixture({ maxProjects: 2 });
  source.store.save(project('A')); source.store.save(project('B'), { id: null });
  destination.store.save(project('Local'));
  const before = destination.storage.getItem(PROJECT_LIBRARY_KEY);
  assert.throws(() => destination.store.importBackup(source.store.exportBackup()), code('LIMIT_PROJECTS'));
  assert.equal(destination.storage.getItem(PROJECT_LIBRARY_KEY), before);
});

test('quota, stockage corrompu et clés interdites ne détruisent pas les données', () => {
  const { storage, store } = fixture();
  store.save(project());
  const before = storage.getItem(PROJECT_LIBRARY_KEY);
  storage.blocked = true;
  assert.throws(() => store.save(project('Changement')), code('STORAGE_FULL'));
  assert.equal(storage.getItem(PROJECT_LIBRARY_KEY), before);
  storage.blocked = false;
  const polluted = JSON.parse('{"version":4,"name":"A","width":4000,"depth":3000,"stock":{"__proto__":{"bad":1}}}');
  assert.throws(() => store.save(polluted), code('INVALID_PROJECT'));
  assert.throws(() => store.save({ ...project(), width: NaN }), code('INVALID_PROJECT'));
  assert.throws(() => store.save({ ...project(), unexpected: new Date() }), code('INVALID_PROJECT'));
  assert.equal(storage.getItem(PROJECT_LIBRARY_KEY), before);
  storage.setItem(PROJECT_LIBRARY_KEY, 'broken-json');
  assert.throws(() => store.save(project()), code('CORRUPT_STORE'));
  assert.equal(storage.getItem(PROJECT_LIBRARY_KEY), 'broken-json');
});

test('élaguer les anciennes versions respecte le budget sans évincer les projets courants', () => {
  const { store, storage } = fixture({ maxBytes: 2500, maxProjectBytes: 1600 });
  store.save(project('A'));
  let pruned = 0;
  for (let i = 0; i < 12; i++) pruned += store.save({ ...project('A', 4000 + i), notes: 'a'.repeat(80) }).prunedRevisions;
  assert.ok(pruned > 0);
  assert.equal(store.list().length, 1);
  assert.ok(storage.getItem(PROJECT_LIBRARY_KEY).length * 2 <= 2500);
  const before = storage.getItem(PROJECT_LIBRARY_KEY);
  assert.throws(() => store.save({ ...project('A'), notes: 'a'.repeat(2000) }), code('LIMIT_BYTES'));
  assert.equal(storage.getItem(PROJECT_LIBRARY_KEY), before);
});

test('ouvrir ou restaurer un identifiant absent est sans effet sur le projet actif', () => {
  const { storage, store } = fixture();
  const original = store.save(project());
  const before = storage.getItem(PROJECT_LIBRARY_KEY);
  assert.throws(() => store.open('missing'), code('PROJECT_NOT_FOUND'));
  assert.throws(() => store.restore(original.id, 'missing'), code('REVISION_NOT_FOUND'));
  assert.equal(storage.getItem(PROJECT_LIBRARY_KEY), before);
});

test('le rendu échappe les noms et expose les actions et versions sans mutation', () => {
  const { storage, store } = fixture();
  const dangerousName = '<img src=x onerror="alert(1)">';
  store.save(project(dangerousName));
  const current = project('Version actuelle');
  store.save(current);
  const before = storage.writes;
  const html = projectsView(store, current);
  assert.equal(storage.writes, before);
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
  assert.match(html, /data-project-action="restore"/);
  assert.match(html, /data-project-revision="rev-/);
  assert.match(html, /copie enregistrée/);
  assert.match(projectsView(store, project('Modifié')), /modifications à enregistrer/);
});

test('V5 : projets, attaches et positions manuelles survivent à sauvegarde globale et restauration', () => {
  const { store } = fixture();
  const current = {
    ...project('Atelier attaché'), version: 5,
    freeParts: [
      { id: 'A', kind: 'post', a: [0, 0, 0], b: [0, 2000, 0], width: 90, height: 90 },
      { id: 'B', kind: 'beam', a: [0, 2000, 0], b: [2000, 2000, 0], width: 45, height: 95, lengthLocked: true },
    ],
    freeJoints: [{ id: 'J1', aPart: 'A', bPart: 'B', recipe: 'angle', fixingLayout: { mode: 'manual', positions: { 'test-screw': [12.25, 26.5, 38.75] } } }],
    attachments: [{ id: 'AT1', type: 'fixed', sourceId: 'B', anchors: [{ targetId: 'A', local: [0.25, 1000.5, 0] }], relativeRoll: 12.75 }],
    attachmentSettings: { autoAttach: false },
  };
  const saved = store.save(current);
  store.save({ ...current, name: 'Variante' });
  const other = fixture();
  other.store.importBackup(store.exportBackup(), { mode: 'replace' });
  assert.deepEqual(other.store.read(), store.read());
  const old = other.store.revisions(saved.id)[0];
  assert.deepEqual(other.store.restore(saved.id, old.id).project, current);
});

test('V5 : attache invalide, mode inconnu et dépassement de limite refusés sans écriture', () => {
  const { storage, store } = fixture();
  store.save(project());
  const before = storage.getItem(PROJECT_LIBRARY_KEY), writes = storage.writes;
  const valid = { id: 'AT1', type: 'fixed', sourceId: 'B', anchors: [{ targetId: 'A', local: [0, 0, 0] }] };
  for (const patch of [
    { mode: 'unknown' }, { attachments: {} },
    { attachments: [{ ...valid, anchors: [{ targetId: 'A', local: [0, 0] }] }] },
    { attachments: [{ ...valid, type: 'beam' }] },
    { attachments: [valid, valid] },
    { attachments: Array.from({ length: 1001 }, (_, i) => ({ ...valid, id: `AT${i}` })) },
  ]) assert.throws(() => store.save({ ...project(), version: 5, ...patch }), code('INVALID_PROJECT'));
  assert.equal(storage.writes, writes);
  assert.equal(storage.getItem(PROJECT_LIBRARY_KEY), before);
});

test('les sauvegardes historiques V1/V4 restent ouvrables sans migration implicite dans la bibliothèque', () => {
  const { store } = fixture();
  for (const version of [1, 4]) {
    const old = { ...project(`Ancien V${version}`), version };
    const saved = store.save(old, { id: null });
    assert.deepEqual(store.open(saved.id).project, old);
  }
  const target = fixture();
  target.store.importBackup(store.exportBackup());
  assert.deepEqual(target.store.read(), store.read());
});
