import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

test('shell : les étapes et modules restent accessibles avec leurs points d’intégration', async () => {
  const window = new Window(), document = window.document;
  document.write(await readFile(new URL('../src/shell.html', import.meta.url), 'utf8'));
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length, 'Les identifiants du shell doivent être uniques.');
  for (const id of ['project-name','save-status','open-project','save-project','export-open','cart-count','sidebar','workspace','space-kicker','space-title','undo','redo','scene-area','scene','reset-view','editor-toolbar','scene-sub','zoom-in','zoom-out','inspector','navigation-hint','navigation-help','summary-strip','workspace-content','bottom-note','warnings-button','warning-count','modal','modal-title','modal-close','modal-content','backup-input','file-input','toast','print-area','workspace-tabs','workflow-status','focus-toggle','measure-toggle','cancel-interaction','scene-interaction-status','view-orientation']) {
    assert.ok(document.getElementById(id), `Point d’intégration manquant : ${id}`);
  }
  assert.deepEqual([...document.querySelectorAll('.rail [data-page]')].map(b => b.dataset.page), ['design','connections','cuts','fabrication']);
  for (const page of ['projects','templates','guide','electrical','shopping']) {
    const button = document.querySelector(`[data-page="${page}"]`);
    assert.ok(button?.closest('details')?.querySelector('summary'), `Module ${page} accessible par un menu natif.`);
  }
  assert.equal(document.getElementById('scene').parentElement.id, 'scene-frame');
  assert.equal(document.getElementById('inspector').parentElement.id, 'scene-area');
  for (const button of document.querySelectorAll('button')) {
    assert.ok(button.textContent.trim() || button.getAttribute('aria-label') || button.getAttribute('title'), 'Chaque commande possède un nom accessible.');
  }
  await window.happyDOM.close();
});

test('shell : les calques restent dans Afficher et la caméra dans Vue', async () => {
  const window = new Window(), document = window.document;
  document.write(await readFile(new URL('../src/shell.html', import.meta.url), 'utf8'));
  const menu = document.querySelector('details.display-menu');
  assert.ok(menu?.querySelector('summary'));
  assert.deepEqual([...menu.querySelectorAll('[data-layer]')].map(b => b.dataset.layer).sort(), ['dimensions','fixings','foundation','joints','mesh','roof','textures','wall']);
  assert.equal(menu.querySelectorAll('[data-layer].active').length, 7);
  assert.deepEqual([...menu.querySelectorAll('[data-layer-preset]')].map(b => b.dataset.layerPreset), ['structure','complete','plan']);
  const view = document.querySelector('details.view-menu');
  assert.ok(view?.querySelector('summary'));
  assert.deepEqual([...view.querySelectorAll('[data-navigation]')].map(b => b.dataset.navigation), ['free','orbit']);
  assert.deepEqual([...view.querySelectorAll('[data-view]')].map(b => b.dataset.view), ['iso','top','front','side']);
  assert.equal(document.querySelectorAll('[data-navigation]').length, 2);
  assert.equal(document.getElementById('focus-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(document.getElementById('scene-interaction-status').getAttribute('role'), 'status');
  await window.happyDOM.close();
});
