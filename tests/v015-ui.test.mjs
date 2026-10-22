import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Window } from 'happy-dom';
import { DEFAULT_PROJECT, normalizeProject } from '../src/engine.js';

// Integration with the real app in its DOM fallback; no renderer/WebGL claim.
async function setup() {
  const window = new Window({ url: 'https://atelier.test' }), document = window.document;
  Object.assign(globalThis, { window, document, localStorage: window.localStorage, ResizeObserver: window.ResizeObserver, FormData: window.FormData });
  document.write((await fs.readFile(new URL('../src/shell.html', import.meta.url), 'utf8')).replace('/*__SCRIPT__*/', ''));
  window.HTMLCanvasElement.prototype.getContext = () => null;
  const warn = console.warn, error = console.error;
  console.warn = console.error = () => {};
  try { await import('../src/app.js'); } finally { console.warn = warn; console.error = error; }
  const app = window.Atelier;
  const q = selector => { const node = document.querySelector(selector); assert.ok(node, selector); return node; };
  const click = selector => q(selector).click();
  const assign = (node, value) => { if (node.type === 'checkbox') node.checked = !!value; else node.value = String(value); };
  const change = (selector, value) => { const node = q(selector); assign(node, value); node.dispatchEvent(new window.Event('change', { bubbles: true })); return node; };
  const fill = (selector, values = {}) => {
    const form = q(selector);
    for (const [name, value] of Object.entries(values)) { const node = form.elements.namedItem(name); assert.ok(node, `Champ ${name}`); assign(node, value); }
    return form;
  };
  const submit = (selector, values = {}) => {
    const form = fill(selector, values); assert.equal(form.checkValidity(), true, `Formulaire valide : ${selector}`);
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  };
  const saved = () => JSON.parse(localStorage.getItem('atelier.project.v4'));
  const piece = id => app.getProject().freeParts.find(part => part.id === id);
  const near = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-7, `${label} : ${actual} / ${expected}`);
  const downloads = [], createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  URL.createObjectURL = blob => { downloads.push({ blob }); return 'blob:v015-test'; };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { if (downloads.length) downloads.at(-1).name = this.download; };
  return {
    window, document, app, q, click, assign, change, fill, submit, saved, piece, near, downloads,
    async importJSON(raw) {
      const input = q('#file-input');
      Object.defineProperty(input, 'files', { configurable: true, value: [{ size: raw.length, text: async () => raw }] });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    async close() { URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; await window.happyDOM.close(); }
  };
}

test('V0.15 : plan sans WebGL, cotes attachées, aperçu exact et sauvegarde', async t => {
  const env = await setup();
  const { window, document, app, q, click, change, fill, submit, saved, piece, near, downloads } = env;
  const post = (id, x, section = 100) => ({ id, label: `Poteau ${id}`, kind: 'post', material: 'wood', a: [x, 0, 0], b: [x, 2000, 0], width: section, height: section, foundation: 'none' });
  const beam = { id: 'TEST-L', label: 'Chevron longueur', kind: 'beam', material: 'wood', a: [0, 1800, 0], b: [2000, 1800, 0], width: 45, height: 95, foundation: 'none' };
  const dimensions = () => app.getProject().drawing.dimensions;
  const input = (selector, value) => { const field = q(selector); env.assign(field, value); field.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const tapPlan = point => {
    const editor = app.getPlanEditor(), [clientX, clientY] = editor.planToClient(point);
    for (const type of ['pointerdown', 'pointerup']) editor.svg.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX, clientY }));
  };
  const addFromPalette = async type => {
    click('[data-plan-action="add"]');
    click(`[data-plan-add="${type}"]`);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(q('#modal').open, false);
  };
  async function load(parts = [post('TEST-A', 0), post('TEST-B', 2000)], extra = {}) {
    const fixture = normalizeProject({ ...DEFAULT_PROJECT, name: 'Test plan V0.15', mode: 'free', freeParts: parts, freeJoints: [], drawing: { dimensions: [] }, foundation: 'none', ...extra });
    await env.importJSON(JSON.stringify(fixture));
    app.setPage('design');
    click('[data-workspace-mode="plan"]');
    assert.deepEqual(app.getProject().freeParts, fixture.freeParts);
    return app.getProject();
  }
  function create(type, a = 'TEST-A', b = 'TEST-B', extra = {}) {
    app.selectParts(b ? [a, b] : [a]);
    click('[data-plan-action="dimension"]');
    submit('[data-dimension-create]', { type, aPart: a, bPart: b, axis: 'x', view: 'all', label: `Cote ${type}`, ...extra });
    const form = q('[data-dimension-edit]'), id = form.dataset.id;
    assert.ok(id && dimensions().some(dimension => dimension.id === id));
    return id;
  }
  try {
    await t.test('le plan est accessible sans WebGL ; vues et multisélection conservent la géométrie', async () => {
      const initial = await load();
      assert.ok(q('#plan-area').contains(q('#plan-canvas')));
      assert.equal(q('#plan-area').classList.contains('hidden'), false);
      assert.ok(app.getPlanEditor(), 'Le contrôleur du plan existe même sans renderer WebGL');
      app.selectParts(['TEST-A', 'TEST-B']);
      for (const view of ['front', 'side', 'top']) {
        click(`[data-plan-view="${view}"]`);
        assert.equal(app.getProject().drawing.view, view);
        assert.deepEqual(app.getSelection(), ['TEST-A', 'TEST-B']);
        assert.deepEqual(app.getProject().freeParts, initial.freeParts);
      }
      click('[data-workspace-mode="scene"]');
      click('[data-workspace-mode="plan"]');
      assert.deepEqual(app.getSelection(), ['TEST-A', 'TEST-B']);
      assert.deepEqual(app.getProject().freeParts, initial.freeParts);
      change('[data-drawing-field="automatic"]', false);
      change('[data-drawing-field="autoLevel"]', 'full');
      change('[data-drawing-field="precision"]', .1);
      assert.equal(app.getProject().drawing.automatic, false);
      assert.equal(app.getProject().drawing.autoLevel, 'full');
      assert.equal(app.getProject().drawing.precision, .1);
      assert.deepEqual(saved().drawing, app.getProject().drawing);
      assert.deepEqual(app.getProject().freeParts, initial.freeParts);
    });

    await t.test('créer une cote axes enregistre ses références sans déplacer les pièces ; annuler un aperçu ne sauvegarde rien', async () => {
      const initial = await load(), id = create('axes');
      const annotation = dimensions().find(dimension => dimension.id === id);
      assert.equal(annotation.type, 'axes');
      assert.equal(annotation.aPart, 'TEST-A');
      assert.equal(annotation.bPart, 'TEST-B');
      assert.equal(annotation.axis, 'x');
      assert.deepEqual(app.getProject().freeParts, initial.freeParts);
      const before = app.getProject();
      input('[data-dimension-edit] [name="value"]', '0,50 m');
      click('[data-dimension-preview]');
      assert.ok(q('[data-dimension-edit-preview]').textContent.trim(), 'L’aperçu explique la modification');
      assert.deepEqual(app.getProject(), before);
      assert.deepEqual(saved(), before);
      click('[data-dimension-cancel]');
      assert.equal(q('#modal').open, false);
      assert.deepEqual(app.getProject(), before);
      assert.deepEqual(saved(), before);
      assert.ok(q(`[data-dimension-open="${id}"]`));
    });

    await t.test('espace libre de 0,50 m : première pièce fixe, mouvement exact malgré la grille et une seule annulation', async () => {
      await load(undefined, { grid: 127, snap: true });
      const id = create('gap'), before = app.getProject(), first = piece('TEST-A');
      assert.equal(q('[data-dimension-edit] [name="move"]').value, 'b');
      input('[data-dimension-edit] [name="value"]', '0,50 m');
      click('[data-dimension-preview]');
      assert.deepEqual(app.getProject(), before);
      submit('[data-dimension-edit]', { value: '0,50 m', move: 'b', label: 'Passage de 500 mm' });
      const after = app.getProject();
      assert.deepEqual(piece('TEST-A'), first);
      near(piece('TEST-B').a[0], 600, 'Deux sections de 100 mm laissent 500 mm libres');
      near(piece('TEST-B').b[0], 600);
      assert.equal(after.grid, 127, 'La commande de cote ne change pas la grille');
      assert.equal(dimensions().find(dimension => dimension.id === id).label, 'Passage de 500 mm');
      assert.equal(q('#modal').open, false);
      assert.deepEqual(saved(), after);
      click('#undo');
      assert.deepEqual(app.getProject(), before, 'Une seule action annule la géométrie et le nom de cote');
      click('#redo');
      assert.deepEqual(app.getProject(), after);
    });

    await t.test('choisir de déplacer la première pièce conserve exactement la seconde référence', async () => {
      await load(); create('axes');
      const second = piece('TEST-B'), before = app.getProject();
      change('[data-dimension-edit] [name="move"]', 'a');
      input('[data-dimension-edit] [name="value"]', '80 cm');
      click('[data-dimension-preview]');
      assert.deepEqual(app.getProject(), before);
      submit('[data-dimension-edit]', { value: '80 cm', move: 'a' });
      assert.deepEqual(piece('TEST-B'), second);
      near(piece('TEST-A').a[0], 1200);
      near(piece('TEST-A').b[0], 1200);
      click('#undo');
      assert.deepEqual(app.getProject(), before);
    });

    await t.test('cote de longueur : ancrage au centre, extrémités cohérentes et aucune pièce supplémentaire', async () => {
      await load([beam]);
      const id = create('length', 'TEST-L', ''), before = app.getProject();
      const dimension = dimensions().find(d => d.id === id);
      assert.equal(dimension.aPart, 'TEST-L');
      assert.equal(dimension.bPart, '');
      change('[data-dimension-edit] [name="anchor"]', 'center');
      input('[data-dimension-edit] [name="value"]', '3 m');
      click('[data-dimension-preview]');
      assert.deepEqual(app.getProject(), before);
      submit('[data-dimension-edit]', { value: '3 m', anchor: 'center' });
      assert.equal(app.getProject().freeParts.length, 1);
      assert.deepEqual(piece('TEST-L').a, [-500, 1800, 0]);
      assert.deepEqual(piece('TEST-L').b, [2500, 1800, 0]);
      click('#undo');
      assert.deepEqual(app.getProject(), before);
    });

    await t.test('JSON et SVG conservent les cotes ; suppression d’une référence affiche « manquante » puis Undo restaure', async () => {
      await load();
      const id = create('axes');
      fill('[data-dimension-edit]', { label: 'Entraxe enregistré' });
      click('[data-dimension-save]');
      change('[data-drawing-field="automatic"]', false);
      change('[data-drawing-field="precision"]', .1);
      const expected = app.getProject();
      click('#save-project');
      assert.match(downloads.at(-1).name, /\.json$/);
      const raw = await downloads.at(-1).blob.text();
      assert.deepEqual(JSON.parse(raw).drawing, expected.drawing);
      change('[data-drawing-field="automatic"]', true);
      await env.importJSON(raw);
      assert.deepEqual(app.getProject(), expected);
      assert.deepEqual(saved().drawing, expected.drawing);
      assert.ok(q(`[data-dimension-open="${id}"]`));
      click('[data-plan-action="export"]');
      assert.match(downloads.at(-1).name, /\.svg$/);
      const svg = await downloads.at(-1).blob.text();
      assert.match(svg, /<svg/);
      assert.match(svg, /Entraxe enregistré/);
      assert.doesNotMatch(svg, /NaN|Infinity/);
      app.selectParts(['TEST-A']);
      click('[data-editor="delete"]');
      assert.equal(piece('TEST-A'), undefined);
      assert.equal(dimensions().length, 1);
      assert.equal(dimensions()[0].aPart, 'TEST-A');
      const missing = q(`[data-dimension-open="${id}"][data-dimension-status="missing"]`);
      assert.match(missing.textContent, /manquante/i);
      click(`[data-dimension-open="${id}"]`);
      assert.match(q('[data-dimension-edit]').textContent, /Référence manquante/);
      assert.equal(document.querySelector('[data-dimension-apply]'), null);
      click('[data-dimension-cancel]');
      click('#undo');
      assert.deepEqual(app.getProject(), expected);
      assert.notEqual(q(`[data-dimension-open="${id}"]`).dataset.dimensionStatus, 'missing');
    });

    await t.test('poser un poteau au clic prépare une pièce annulable ; valider ajoute exactement une pièce et une action Undo', async () => {
      const initial = await load([], { snap: false, assistance: { guides: false, guideSnap: false, gridSnap: false } });
      await addFromPalette('post');
      tapPlan([325, 775]);
      assert.equal(app.getPlanEditor().getPending()?.kind, 'placement');
      assert.equal(q('#plan-confirm').classList.contains('hidden'), false);
      assert.deepEqual(app.getProject(), initial);
      assert.deepEqual(saved(), initial);
      click('#plan-cancel');
      assert.equal(app.getPlanEditor().getPending(), null);
      assert.deepEqual(app.getProject(), initial);

      await addFromPalette('post');
      tapPlan([325, 775]);
      click('#plan-confirm');
      const after = app.getProject(), placed = after.freeParts[0];
      assert.equal(after.freeParts.length, 1);
      assert.equal(placed.kind, 'post');
      near(placed.a[0], 325); near(placed.a[1], 0); near(placed.a[2], 775);
      near(placed.b[0], 325); near(placed.b[1], initial.height); near(placed.b[2], 775);
      assert.deepEqual(app.getSelection(), [placed.id]);
      assert.deepEqual(saved(), after);
      assert.equal(app.getPlanEditor().getPending(), null);
      click('#undo');
      assert.deepEqual(app.getProject(), initial);
      click('#redo');
      assert.deepEqual(app.getProject(), after);
    });

    await t.test('tracer un chevron par deux clics garde sa hauteur ; un premier point ou un aperçu ne crée aucune pièce', async () => {
      const initial = await load([], { snap: false, assistance: { guides: false, guideSnap: false, gridSnap: false } });
      await addFromPalette('beam');
      tapPlan([-300, 400]);
      assert.equal(app.getPlanEditor().getPending(), null);
      assert.deepEqual(app.getProject(), initial);
      tapPlan([-300, 400]);
      assert.equal(app.getPlanEditor().getPending(), null, 'Deux points identiques ne créent pas de chevron nul');
      tapPlan([700, 900]);
      const pending = app.getPlanEditor().getPending();
      assert.equal(pending?.kind, 'placement');
      assert.deepEqual(app.getProject(), initial);
      assert.deepEqual(saved(), initial);
      click('#plan-confirm');
      const after = app.getProject(), placed = after.freeParts[0];
      assert.equal(after.freeParts.length, 1);
      assert.equal(placed.kind, 'beam');
      near(placed.a[0], -300); near(placed.a[1], 1500); near(placed.a[2], 400);
      near(placed.b[0], 700); near(placed.b[1], 1500); near(placed.b[2], 900);
      assert.deepEqual(app.getSelection(), [placed.id]);
      assert.deepEqual(saved(), after);
      click('#undo');
      assert.deepEqual(app.getProject(), initial);
    });
  } finally { await env.close(); }
});
