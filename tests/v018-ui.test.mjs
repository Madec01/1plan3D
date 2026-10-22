import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Window } from 'happy-dom';
import { DEFAULT_PROJECT, normalizeProject } from '../src/engine.js';

// Tests applicatifs DOM : aucune validation du rendu WebGL, de l'imprimante ou du cache navigateur.
async function setup() {
  const window = new Window({ url: 'https://atelier.test' }), document = window.document;
  Object.assign(globalThis, { window, document, localStorage: window.localStorage, ResizeObserver: window.ResizeObserver, FormData: window.FormData });
  document.write((await fs.readFile(new URL('../src/shell.html', import.meta.url), 'utf8')).replace('/*__SCRIPT__*/', ''));
  window.HTMLCanvasElement.prototype.getContext = () => null;
  const mediaListeners = new Set(), media = {
    matches: false,
    addEventListener(type, handler) { if (type === 'change') mediaListeners.add(handler); },
    removeEventListener(type, handler) { if (type === 'change') mediaListeners.delete(handler); },
    set(matches) { this.matches = matches; for (const handler of mediaListeners) handler({ matches }); },
  };
  const originalMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = query => query.includes('max-width: 760px') ? media : originalMatchMedia(query);
  const warn = console.warn, error = console.error;
  console.warn = console.error = () => {};
  try { await import('../src/app.js'); } finally { console.warn = warn; console.error = error; }
  const app = window.Atelier;
  const q = selector => { const node = document.querySelector(selector); assert.ok(node, selector); return node; };
  const click = selector => q(selector).click();
  const assign = (node, value) => { if (node.type === 'checkbox') node.checked = !!value; else node.value = String(value); };
  const change = (selector, value) => { const node = q(selector); assign(node, value); node.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const fill = (selector, values = {}) => {
    const form = q(selector);
    for (const [name, value] of Object.entries(values)) {
      const node = form.elements.namedItem(name); assert.ok(node, `Champ ${name}`); assign(node, value);
    }
    return form;
  };
  const submit = (selector, values = {}) => {
    const form = fill(selector, values);
    assert.equal(form.checkValidity(), true, `Formulaire valide : ${selector}`);
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  };
  const saved = () => JSON.parse(localStorage.getItem('atelier.project.v4'));
  const downloads = [], createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  URL.createObjectURL = blob => { downloads.push({ blob }); return 'blob:v018-test'; };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { if (downloads.length) downloads.at(-1).name = this.download; };
  return {
    window, document, app, q, click, assign, change, fill, submit, saved, downloads, media,
    async importJSON(raw) {
      const input = q('#file-input');
      Object.defineProperty(input, 'files', { configurable: true, value: [{ size: raw.length, text: async () => raw }] });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    async close() { URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; await window.happyDOM.close(); },
  };
}

const fixture = () => normalizeProject({
  ...DEFAULT_PROJECT, name: 'Dossier de la pergola', mode: 'free', foundation: 'none', freeJoints: [],
  freeParts: [
    { id: 'DOS-A', label: 'Poteau gauche', kind: 'post', material: 'wood', a: [0, 0, 0], b: [0, 2000, 0], width: 100, height: 100, foundation: 'none' },
    { id: 'DOS-B', label: 'Poteau droit', kind: 'post', material: 'wood', a: [2500, 0, 0], b: [2500, 2000, 0], width: 100, height: 100, foundation: 'none' },
    { id: 'DOS-C', label: 'Traverse', kind: 'beam', material: 'wood', a: [0, 2050, 0], b: [2500, 2050, 0], width: 45, height: 95, foundation: 'none' },
  ],
  drawing: { dimensions: [{ id: 'DIM-1', type: 'axes', aPart: 'DOS-A', bPart: 'DOS-B', axis: 'x', view: 'all', label: 'Entraxe des poteaux' }] },
  technical: { includeInDossier: false, assemblySteps: [] },
});

test('V0.18 : dossier papier et technique, exports réels et conservation du projet', async t => {
  const env = await setup();
  const { document, app, q, click, change, fill, submit, saved, downloads, media } = env;
  const physicalState = () => {
    // model.project porte aussi les réglages de présentation ; comparer ici toute la géométrie calculée.
    const { project: sourceProject, ...model } = app.getModel();
    return { parts: app.getProject().freeParts, joints: app.getProject().freeJoints, drawing: app.getProject().drawing, model, bom: app.getBOM() };
  };
  const checkGroup = (form, name, values) => {
    const fields = [...q(form).querySelectorAll(`input[name="${name}"]`)];
    assert.ok(fields.length, `Cases ${name}`);
    for (const field of fields) field.checked = values.includes(field.value);
  };
  async function load() {
    media.set(false);
    await env.importJSON(JSON.stringify(fixture()));
    app.setPage('fabrication');
    return app.getProject();
  }
  try {
    await t.test('les onglets du dossier fonctionnent sans WebGL et ne modifient ni pièces, ni cotes, ni achats', async () => {
      const initial = await load(), physical = physicalState();
      for (const tab of ['overview', 'paper', 'technical', 'overview']) {
        click(`[data-dossier-tab="${tab}"]`);
        assert.equal(q('#workspace-content').classList.contains('hidden'), false);
        assert.deepEqual(app.getProject(), initial);
        assert.deepEqual(physicalState(), physical);
        assert.deepEqual(saved(), initial);
      }
    });

    await t.test('papier A3 paysage : champs et vues sont sauvegardés ensemble, sans effet sur le modèle ni les achats', async () => {
      const initial = await load(), physical = physicalState();
      click('[data-dossier-tab="paper"]');
      checkGroup('[data-paper-form]', 'views', ['top', 'front']);
      submit('[data-paper-form]', { format: 'A3', orientation: 'landscape', margin: 12, scale: '20', title: 'Pergola de jardin', author: 'Camille et Alex', date: '2026-10-20', revision: 'B', automatic: false });
      const after = app.getProject();
      assert.equal(after.paper.format, 'A3');
      assert.equal(after.paper.orientation, 'landscape');
      assert.equal(after.paper.margin, 12);
      assert.equal(Number(after.paper.scale), 20);
      assert.equal(after.paper.title, 'Pergola de jardin');
      assert.equal(after.paper.author, 'Camille et Alex');
      assert.equal(after.paper.date, '2026-10-20');
      assert.equal(after.paper.revision, 'B');
      assert.equal(after.paper.automatic, false);
      assert.deepEqual(after.paper.views, ['top', 'front']);
      assert.equal(document.querySelectorAll('.paper-sheet[data-sheet-id]').length, 2);
      assert.deepEqual(saved(), after);
      assert.deepEqual(physicalState(), physical);
      click('#undo');
      assert.deepEqual(app.getProject(), initial, 'Une seule annulation restaure tous les réglages de feuille');
      click('#redo');
      assert.deepEqual(app.getProject(), after);
      assert.deepEqual(physicalState(), physical);
    });

    await t.test('les exports papier téléchargent un PDF vectoriel multipage et un véritable SVG sans modifier le projet', async () => {
      await load();
      click('[data-dossier-tab="paper"]');
      checkGroup('[data-paper-form]', 'views', ['top', 'front']);
      submit('[data-paper-form]', { format: 'A3', orientation: 'landscape', scale: 'fit', title: 'Plans pour fabrication' });
      const before = app.getProject(), physical = physicalState(), count = downloads.length;
      click('[data-paper-action="pdf"]');
      assert.equal(downloads.length, count + 1);
      const pdf = downloads.at(-1);
      assert.match(pdf.name, /\.pdf$/);
      assert.equal(pdf.blob.type, 'application/pdf');
      const bytes = new Uint8Array(await pdf.blob.arrayBuffer()), source = new TextDecoder('latin1').decode(bytes);
      assert.ok(bytes.length > 1000, 'Le PDF contient les pages et tracés du dossier');
      assert.match(source, /^%PDF-1\.[4-7]/);
      assert.match(source, /%%EOF\s*$/);
      assert.equal((source.match(/\/Type\s*\/Page\b/g) || []).length, 2);
      assert.match(source, /\/MediaBox\s*\[/);
      assert.doesNotMatch(source, /<!doctype html|<html/i);
      click('[data-paper-action="svg"][data-sheet-id]');
      const svg = downloads.at(-1);
      assert.match(svg.name, /\.svg$/);
      assert.equal(svg.blob.type, 'image/svg+xml');
      const markup = await svg.blob.text();
      assert.match(markup, /<svg\b/);
      assert.match(markup, /Plans pour fabrication/);
      assert.doesNotMatch(markup, /NaN|Infinity/);
      click('[data-paper-action="print"]');
      const printed = q('#paper-print-frame').srcdoc;
      assert.match(printed, /<svg\b/);
      assert.match(printed, /Plans pour fabrication/);
      assert.match(printed, /@page/);
      assert.match(printed, /420mm|A3/i);
      assert.match(printed, /page-break|break-after/);
      assert.deepEqual(app.getProject(), before);
      assert.deepEqual(saved(), before);
      assert.deepEqual(physicalState(), physical);
    });

    await t.test('coupe et vue éclatée modifient la présentation seulement ; les réglages se restaurent par Undo', async () => {
      const initial = await load(), physical = physicalState();
      click('[data-dossier-tab="technical"]');
      submit('[data-technical-form]', { type: 'section', view: 'front', axis: 'x', offset: 1250, keep: 'positive', labels: true, dimensions: false, includeFixings: false, includeInDossier: true });
      const section = app.getProject();
      assert.equal(section.technical.type, 'section');
      assert.equal(section.technical.view, 'front');
      assert.deepEqual(section.technical.section, { axis: 'x', offset: 1250, keep: 'positive' });
      assert.equal(section.technical.dimensions, false);
      assert.equal(section.technical.includeFixings, false);
      assert.equal(section.technical.includeInDossier, true);
      assert.ok(q('[data-technical-summary]').textContent.trim());
      assert.deepEqual(saved(), section);
      assert.deepEqual(physicalState(), physical);
      submit('[data-technical-form]', { type: 'exploded', view: 'iso', distance: 320, by: 'part' });
      const exploded = app.getProject();
      assert.equal(exploded.technical.type, 'exploded');
      assert.equal(exploded.technical.exploded.distance, 320);
      assert.equal(exploded.technical.exploded.by, 'part');
      assert.deepEqual(saved(), exploded);
      assert.deepEqual(physicalState(), physical);
      click('[data-technical-action="svg"]');
      const svg = downloads.at(-1);
      assert.match(svg.name, /\.svg$/);
      assert.match(await svg.blob.text(), /<svg\b/);
      assert.doesNotMatch(await svg.blob.text(), /NaN|Infinity/);
      assert.deepEqual(app.getProject(), exploded);
      click('#undo');
      assert.deepEqual(app.getProject(), section);
      click('#undo');
      assert.deepEqual(app.getProject(), initial);
      assert.deepEqual(physicalState(), physical);
    });

    await t.test('le détail conserve les deux pièces sélectionnées ; revenir en éclaté enlève ce filtre sans modifier la construction', async () => {
      await load();
      app.setPage('design');
      app.selectParts(['DOS-A', 'DOS-C']);
      app.setPage('fabrication');
      click('[data-dossier-tab="technical"]');
      const before = app.getProject(), physical = physicalState();
      assert.equal(q('[data-technical-form] [name="view"]').value, 'section');
      change('[data-technical-form] [name="type"]', 'detail');
      assert.equal(q('[data-technical-form] [name="view"]').value, 'iso');
      assert.deepEqual(app.getProject(), before, 'Choisir le type prépare le formulaire sans enregistrer');
      submit('[data-technical-form]', { jointId: '' });
      assert.deepEqual(app.getProject().technical.selectionIds, ['DOS-A', 'DOS-C']);
      assert.equal(app.getProject().technical.view, 'iso');
      assert.deepEqual(new Set(app.getTechnicalView().includedPartIds), new Set(['DOS-A', 'DOS-C']));
      assert.deepEqual(saved(), app.getProject());

      app.selectParts([]);
      submit('[data-technical-form]', { dimensions: false });
      const detail = app.getProject();
      assert.deepEqual(detail.technical.selectionIds, ['DOS-A', 'DOS-C'], 'Le détail sauvegardé garde ses références quand la sélection UI est vide');
      assert.deepEqual(new Set(app.getTechnicalView().includedPartIds), new Set(['DOS-A', 'DOS-C']));
      change('[data-technical-form] [name="type"]', 'exploded');
      submit('[data-technical-form]');
      assert.equal(app.getProject().technical.type, 'exploded');
      assert.deepEqual(app.getProject().technical.selectionIds, []);
      assert.deepEqual(new Set(app.getTechnicalView().includedPartIds), new Set(['DOS-A', 'DOS-B', 'DOS-C']));
      assert.deepEqual(saved(), app.getProject());
      assert.deepEqual(physicalState(), physical);
      click('#undo');
      assert.deepEqual(app.getProject(), detail);
    });

    await t.test('les étapes personnalisées gardent les IDs choisis ; nom, ordre et suppression restent annulables', async () => {
      await load();
      app.setPage('design');
      app.selectParts(['DOS-A', 'DOS-B']);
      app.setPage('fabrication');
      click('[data-dossier-tab="technical"]');
      const physical = physicalState(), initialSteps = app.getProject().technical.assemblySteps;
      click('[data-technical-action="add-step"][data-step-source="selection"]');
      const first = app.getProject().technical.assemblySteps.at(-1);
      assert.ok(first, 'Une étape personnalisée a été ajoutée');
      assert.equal(initialSteps.some(step => step.id === first.id), false);
      assert.deepEqual(new Set(first.partIds), new Set(['DOS-A', 'DOS-B']));
      assert.equal(app.getProject().technical.view, 'iso');
      change(`[data-step-label="${first.id}"]`, 'Poser les deux poteaux');
      click(`[data-technical-action="step-save"][data-step-id="${first.id}"]`);
      assert.equal(app.getProject().technical.assemblySteps.find(step => step.id === first.id).label, 'Poser les deux poteaux');
      checkGroup('[data-technical-form]', 'partIds', ['DOS-C']);
      const beforeAdd = app.getProject();
      click('[data-technical-action="add-step"][data-step-source="checked"]');
      const added = app.getProject(), second = added.technical.assemblySteps.find(step => !beforeAdd.technical.assemblySteps.some(old => old.id === step.id));
      assert.ok(second);
      assert.deepEqual(second.partIds, ['DOS-C']);
      click(`[data-technical-action="step-up"][data-step-id="${second.id}"]`);
      const reordered = app.getProject(), reorderedIds = reordered.technical.assemblySteps.map(step => step.id);
      assert.ok(reorderedIds.indexOf(second.id) < reorderedIds.indexOf(first.id));
      assert.deepEqual(physicalState(), physical);
      assert.deepEqual(saved(), reordered);
      click('#undo');
      assert.deepEqual(app.getProject(), added);
      click('#redo');
      assert.deepEqual(app.getProject(), reordered);
      click(`[data-technical-action="step-down"][data-step-id="${second.id}"]`);
      assert.deepEqual(app.getProject().technical.assemblySteps.map(step => step.id), added.technical.assemblySteps.map(step => step.id));
      const beforeDelete = app.getProject();
      click(`[data-technical-action="step-delete"][data-step-id="${first.id}"]`);
      assert.equal(app.getProject().technical.assemblySteps.some(step => step.id === first.id), false);
      assert.ok(app.getProject().technical.assemblySteps.some(step => step.id === second.id));
      assert.deepEqual(physicalState(), physical);
      click('#undo');
      assert.deepEqual(app.getProject(), beforeDelete);
      assert.deepEqual(saved(), beforeDelete);
      click('[data-technical-action="reset-steps"]');
      assert.equal(app.getProject().technical.stepIndex, -1);
      assert.deepEqual(app.getTechnicalView().includedPartIds, []);
      click('[data-technical-action="next-step"]');
      assert.equal(app.getProject().technical.stepIndex, 0);
      assert.deepEqual(new Set(app.getTechnicalView().includedPartIds), new Set(['DOS-A', 'DOS-B']));
      click('[data-technical-action="next-step"]');
      assert.equal(app.getProject().technical.stepIndex, 1);
      assert.deepEqual(new Set(app.getTechnicalView().includedPartIds), new Set(['DOS-A', 'DOS-B', 'DOS-C']));
      click('[data-technical-action="prev-step"]');
      assert.equal(app.getProject().technical.stepIndex, 0);
      click('[data-technical-action="all-steps"]');
      assert.equal(app.getProject().technical.stepIndex, null);
      assert.deepEqual(new Set(app.getTechnicalView().includedPartIds), new Set(['DOS-A', 'DOS-B', 'DOS-C']));
      click('[data-technical-action="next-step"]');
      assert.equal(app.getProject().technical.stepIndex, 0, 'Depuis « Afficher tout », Suivante commence par la première étape');
      assert.deepEqual(new Set(app.getTechnicalView().includedPartIds), new Set(['DOS-A', 'DOS-B']));
      assert.deepEqual(physicalState(), physical);
    });

    await t.test('les réglages papier et techniques survivent à un export puis import JSON', async () => {
      await load();
      click('[data-dossier-tab="paper"]');
      checkGroup('[data-paper-form]', 'views', ['side']);
      submit('[data-paper-form]', { format: 'A4', orientation: 'portrait', margin: 15, title: 'Variante à conserver', revision: 'C', automatic: false });
      click('[data-dossier-tab="technical"]');
      submit('[data-technical-form]', { type: 'exploded', view: 'iso', distance: 480, by: 'part', includeInDossier: true });
      const expected = app.getProject(), physical = physicalState();
      click('#save-project');
      const raw = await downloads.at(-1).blob.text();
      assert.deepEqual(JSON.parse(raw).paper, expected.paper);
      assert.deepEqual(JSON.parse(raw).technical, expected.technical);
      submit('[data-technical-form]', { type: 'section', offset: 700 });
      await env.importJSON(raw);
      assert.deepEqual(app.getProject(), expected);
      assert.deepEqual(saved(), expected);
      assert.deepEqual(physicalState(), physical);
      click('[data-dossier-tab="paper"]');
      assert.equal(q('[data-paper-form] [name="title"]').value, 'Variante à conserver');
      assert.equal(q('[data-paper-form] [name="revision"]').value, 'C');
      click('[data-dossier-tab="technical"]');
      assert.equal(q('[data-technical-form] [name="distance"]').value, '480');
    });

    await t.test('sur mobile, le panneau Dossier ouvre ses réglages puis rend le contenu accessible sans perdre le projet', async () => {
      const initial = await load();
      media.set(true);
      assert.equal(document.body.classList.contains('mobile-ui'), true);
      assert.equal(q('#sidebar').inert, true);
      click('[data-mobile-sheet="pieces"]');
      assert.equal(q('#sidebar').getAttribute('aria-modal'), 'true');
      assert.equal(q('#sidebar').inert, false);
      click('[data-dossier-tab="paper"]');
      assert.ok(q('[data-paper-form]'));
      assert.equal(q('#sidebar').getAttribute('aria-hidden'), 'false');
      click('#sidebar [data-mobile-close]');
      assert.equal(q('#sidebar').inert, true);
      assert.equal(q('#workspace-content').closest('[inert]'), null);
      assert.equal(q('#mobile-sheet-backdrop').hidden, true);
      assert.deepEqual(app.getProject(), initial);
      assert.deepEqual(saved(), initial);
      click('[data-mobile-sheet="pieces"]');
      app.setPage('design');
      assert.equal(document.body.classList.contains('mobile-sheet-open'), false);
      assert.deepEqual(app.getProject(), initial);
      media.set(false);
      assert.equal(q('#sidebar').inert, false);
    });
  } finally { await env.close(); }
});
