import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Window} from 'happy-dom';

// Interaction DOM avec fallback sans WebGL : ce test ne valide pas le rendu 3D.
test('V0.12 : précision saisie, navigation, pose explicite et préparation des coupes', async t => {
  const window = new Window({url:'https://atelier.test'}), document = window.document;
  Object.assign(globalThis, {window, document, localStorage:window.localStorage, ResizeObserver:window.ResizeObserver, FormData:window.FormData});
  document.write((await fs.readFile(new URL('../src/shell.html', import.meta.url), 'utf8')).replace('/*__SCRIPT__*/', ''));
  window.HTMLCanvasElement.prototype.getContext = () => null;
  const warn = console.warn, error = console.error;
  console.warn = console.error = () => {};
  try { await import('../src/app.js'); } finally { console.warn = warn; console.error = error; }
  const app = window.Atelier;
  const q = selector => { const node = document.querySelector(selector); assert.ok(node, selector); return node; };
  const click = selector => q(selector).click();
  const change = (selector, value) => {
    const node = q(selector); node.value = String(value);
    node.dispatchEvent(new window.Event('change', {bubbles:true}));
    return node;
  };
  const submit = (selector, values = {}) => {
    const form = q(selector);
    for (const [key, value] of Object.entries(values)) {
      const node = form.elements.namedItem(key); assert.ok(node, `Champ ${key}`);
      if (node.type === 'checkbox') node.checked = value; else node.value = String(value);
    }
    assert.equal(form.checkValidity(), true, `Formulaire valide : ${selector}`);
    form.dispatchEvent(new window.Event('submit', {bubbles:true, cancelable:true}));
  };
  const key = key => document.dispatchEvent(new window.KeyboardEvent('keydown', {key,bubbles:true,cancelable:true}));
  const saved = () => JSON.parse(window.localStorage.getItem('atelier.project.v4'));
  const downloads = [], createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  URL.createObjectURL = blob => {downloads.push({blob}); return 'blob:v012-test';};
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {downloads.at(-1).name = this.download;};
  let pieceId;
  try {
    await t.test('une cote guidée conserve ses décimales et une saisie invalide reste corrigeable', () => {
      change('[data-field="width"]', 4567.125);
      assert.equal(app.getProject().width, 4567.125);
      assert.equal(saved().width, 4567.125);
      assert.equal(q('[data-field="width"]').value, '4567.125');
      const before = app.getProject(), invalid = change('[data-field="width"]', -1);
      assert.equal(invalid.value, '-1');
      assert.equal(invalid.getAttribute('aria-invalid'), 'true');
      assert.deepEqual(app.getProject(), before);
      assert.equal(saved().width, 4567.125);
      change('[data-field="width"]', 4567.125);
      assert.notEqual(q('[data-field="width"]').getAttribute('aria-invalid'), 'true');
    });

    await t.test('quatre espaces, sous-onglets de préparation et plein cadre réservé aux vues 3D', () => {
      assert.deepEqual([...document.querySelectorAll('.rail [data-page]')].map(b => b.dataset.page), ['design','connections','cuts','fabrication']);
      key('f'); assert.equal(document.body.classList.contains('scene-focus'), true);
      assert.equal(q('#focus-toggle').getAttribute('aria-pressed'), 'true');
      key('Escape'); assert.equal(document.body.classList.contains('scene-focus'), false);
      click('.rail [data-page="connections"]'); key('f');
      assert.equal(document.body.classList.contains('scene-focus'), true);
      click('.rail [data-page="cuts"]');
      assert.equal(document.body.classList.contains('scene-focus'), false);
      assert.deepEqual([...document.querySelectorAll('#workspace-tabs [data-page]')].map(b => b.dataset.page), ['cuts','workshop','shopping']);
      for (const page of ['cuts','workshop','shopping']) {
        click(`#workspace-tabs [data-page="${page}"]`);
        assert.equal(q(`#workspace-tabs [data-page="${page}"]`).getAttribute('aria-current'), 'page');
        assert.equal(q('#focus-toggle').disabled, true);
        key('f'); assert.equal(document.body.classList.contains('scene-focus'), false, `Pas de plein cadre sur ${page}`);
      }
      click('.rail [data-page="fabrication"]'); key('f');
      assert.equal(document.body.classList.contains('scene-focus'), false, 'Pas de plein cadre sur Dossier');
      app.setPage('design');
    });

    await t.test('ajouter depuis la scène vide prépare la pose et ne crée rien après annulation', () => {
      app.setPage('design');
      click('[data-preset="blank"]'); click('[data-load-preset="blank"]');
      assert.equal(app.getProject().mode, 'free');
      assert.equal(app.getProject().freeParts.length, 0);
      click('[data-add="beam"]');
      assert.equal(q('#modal').open, true); q('form[data-place-piece]');
      assert.equal(app.getProject().freeParts.length, 0, 'Aucun ajout avant confirmation du point');
      click('[data-cancel-placement]');
      assert.equal(q('#modal').open, false);
      assert.equal(app.getProject().freeParts.length, 0);
      click('[data-add="beam"]'); click('#modal-close');
      assert.equal(q('#modal').open, false);
      assert.equal(app.getProject().freeParts.length, 0, 'Fermer la fenêtre ne pose aucune pièce');
      click('[data-add="beam"]');
      assert.equal(app.getProject().freeParts.length, 0);
      submit('form[data-place-piece]', {p0:100,p1:0,p2:200});
      assert.equal(q('#modal').open, false);
      assert.equal(app.getProject().freeParts.length, 1);
      pieceId = app.getSelection()[0]; assert.ok(pieceId);
      assert.equal(saved().freeParts.length, 1);
    });

    await t.test('longueur au millième avec conservation de A, du centre ou de B', () => {
      for (const anchor of ['a','center','b']) {
        const before = app.getProject().freeParts.find(p => p.id === pieceId);
        const length = Math.hypot(...before.a.map((v,i) => before.b[i] - v));
        const target = Number((length + .001).toFixed(6));
        const center = before.a.map((v,i) => (v + before.b[i]) / 2);
        const form = q('[data-editor-form="piece"]');
        assert.deepEqual([...form.elements.namedItem('lengthAnchor').options].map(o => o.value), ['a','center','b']);
        submit('[data-editor-form="piece"]', {length:target,lengthAnchor:anchor});
        const after = app.getProject().freeParts.find(p => p.id === pieceId);
        const actual = Math.hypot(...after.a.map((v,i) => after.b[i] - v));
        assert.ok(Math.abs(actual - target) < 1e-8, `${anchor} : conservation de ${target} mm`);
        assert.ok(Math.abs(actual - length - .001) < 1e-8, 'Le millième ne doit pas être arrondi');
        if (anchor === 'center') after.a.forEach((v,i) => assert.ok(Math.abs((v + after.b[i]) / 2 - center[i]) < 1e-9));
        else assert.deepEqual(after[anchor], before[anchor], `L’extrémité ${anchor} est conservée`);
        assert.deepEqual(saved().freeParts.find(p => p.id === pieceId), after);
      }
    });

    await t.test('Dossier conserve les coupes et la précision, puis exporte une vraie fiche SVG', async () => {
      app.setPage('fabrication');
      const geometry = app.getProject().freeParts;
      assert.equal(q('[data-cut-settings]').dataset.id, pieceId);
      submit('[data-cut-settings]', {a:'square',b:'square',allowance:12.345});
      change('[data-cut-precision]', .5);
      assert.deepEqual(app.getProject().manufacturing.cuts[pieceId], {a:'square',b:'square',allowance:12.345});
      assert.equal(app.getProject().manufacturing.precision, .5);
      assert.deepEqual(saved().manufacturing, app.getProject().manufacturing);
      assert.deepEqual(app.getProject().freeParts, geometry, 'La présentation ne modifie pas la géométrie');
      app.setPage('design'); app.setPage('fabrication');
      assert.equal(q('[data-cut-settings] [name="allowance"]').value, '12.345');
      assert.equal(q('[data-cut-precision]').value, '0.5');
      const count = downloads.length;
      click(`[data-cut-export="${pieceId}"]`);
      assert.equal(downloads.length, count + 1);
      assert.match(downloads.at(-1).name, /_coupe\.svg$/);
      assert.equal(downloads.at(-1).blob.type, 'image/svg+xml');
      const source = await downloads.at(-1).blob.text();
      const parsed = new window.DOMParser().parseFromString(source, 'image/svg+xml');
      assert.equal(parsed.querySelector('parsererror'), null);
      assert.ok(parsed.querySelector('svg'));
      assert.match(parsed.documentElement.textContent, /Fiche de coupe/);
      assert.match(parsed.documentElement.textContent, /demi-millimètre/);
      assert.ok(parsed.documentElement.textContent.includes(pieceId));
      assert.deepEqual(app.getProject().freeParts, geometry);
    });
  } finally {
    URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL;
    await window.happyDOM.close();
  }
});
