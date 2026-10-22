import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Window } from 'happy-dom';
import { DEFAULT_PROJECT, normalizeProject } from '../src/engine.js';

// Parcours applicatifs avec le DOM réel de l'application et le fallback sans WebGL.
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
  const change = (selector, value) => { const node = q(selector); assign(node, value); node.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const fill = (selector, values = {}) => {
    const form = q(selector);
    for (const [name, value] of Object.entries(values)) { const node = form.elements.namedItem(name); assert.ok(node, `Champ ${name}`); assign(node, value); }
    return form;
  };
  const submit = (selector, values = {}) => {
    const form = fill(selector, values); assert.equal(form.checkValidity(), true, `Formulaire valide : ${selector}`);
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  };
  const key = (type, key, options = {}) => {
    const event = new window.KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...options });
    document.activeElement.dispatchEvent(event); return event;
  };
  const saved = () => JSON.parse(localStorage.getItem('atelier.project.v4'));
  const piece = id => app.getProject().freeParts.find(part => part.id === id);
  const near = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-7, `${label} : ${actual} / ${expected}`);
  return {
    window, document, app, q, click, assign, change, fill, submit, key, saved, piece, near,
    async importJSON(project) {
      const raw = JSON.stringify(project), input = q('#file-input');
      Object.defineProperty(input, 'files', { configurable: true, value: [{ size: raw.length, text: async () => raw }] });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    async close() { await window.happyDOM.close(); },
  };
}

const fixture = () => normalizeProject({
  ...DEFAULT_PROJECT, name: 'Essais interactions V0.19', mode: 'free', foundation: 'none', freeJoints: [], grid: 10,
  workplane: { type: 'xz', offset: 0, lock: false, visible: true },
  meshRollWidth: 1000, meshRollLength: 5000, meshOverlap: 0, margin: 0,
  freeParts: [
    { id: 'QA-A', label: 'Poteau gauche', kind: 'post', material: 'wood', a: [0, 150, 0], b: [0, 2150, 0], width: 100, height: 100, foundation: 'none' },
    { id: 'QA-B', label: 'Poteau droit', kind: 'post', material: 'wood', a: [2000, 350, 0], b: [2000, 2350, 0], width: 100, height: 100, foundation: 'none' },
    { id: 'QA-C', label: 'Traverse', kind: 'beam', material: 'wood', a: [0, 2200, 0], b: [2000, 2200, 0], width: 45, height: 95, foundation: 'none' },
    { id: 'QA-M', label: 'Grillage rectangulaire', kind: 'panel', material: 'mesh', group: 'mesh', a: [0, 0, 500], b: [1000, 1000, 500], width: 1, height: 1000, corners: [[0, 0, 500], [1000, 0, 500], [1000, 1000, 500], [0, 1000, 500]] },
  ],
});

test('V0.19 : interactions directes, clavier, groupes et quantités cohérentes', async t => {
  const env = await setup();
  const { window, document, app, q, click, change, fill, submit, key, saved, piece, near } = env;
  async function load(project = fixture()) {
    await env.importJSON(project); app.setPage('design'); app.setWorkspaceMode('scene');
    document.activeElement?.blur?.();
    return app.getProject();
  }
  const context = id => app.openContextMenu(app.getModel().parts.find(part => part.id === id), { clientX: 160, clientY: 120 });
  const tapKey = (pressed, options = {}) => { key('keydown', pressed, options); key('keyup', pressed, options); };
  try {
    await t.test('écrire dans les propriétés ne déplace, ne supprime et ne duplique aucune pièce', async () => {
      await load(); app.selectParts(['QA-A']);
      const field = q('[data-editor-form="piece"] [name="label"]'); field.focus();
      const before = app.getProject(), selection = app.getSelection();
      for (const [pressed, options] of [['ArrowRight', {}], ['ArrowUp', { shiftKey: true }], ['PageUp', {}], ['Delete', {}], ['Backspace', {}], ['d', { ctrlKey: true }], ['z', { ctrlKey: true }], ['r', {}]]) {
        key('keydown', pressed, options); key('keyup', pressed, options);
        assert.deepEqual(app.getProject(), before, `La touche ${pressed} appartient au champ actif`);
        assert.deepEqual(app.getSelection(), selection);
        assert.deepEqual(saved(), before);
      }
      assert.equal(document.activeElement, field);
      field.blur();
    });

    await t.test('maintenir une flèche déplace par pas exacts et une seule annulation restaure toute la série', async () => {
      await load(); app.selectParts(['QA-A']); document.activeElement?.blur?.();
      const before = app.getProject(), others = before.freeParts.filter(part => part.id !== 'QA-A');
      key('keydown', 'ArrowRight');
      key('keydown', 'ArrowRight', { repeat: true });
      key('keydown', 'ArrowRight', { repeat: true });
      key('keyup', 'ArrowRight');
      near(piece('QA-A').a[0], 30); near(piece('QA-A').b[0], 30);
      assert.deepEqual(app.getProject().freeParts.filter(part => part.id !== 'QA-A'), others);
      const after = app.getProject(); assert.deepEqual(saved(), after);
      click('#undo'); assert.deepEqual(app.getProject(), before);
      click('#redo'); assert.deepEqual(app.getProject(), after);
      document.activeElement?.blur?.();
      tapKey('ArrowRight', { shiftKey: true });
      near(piece('QA-A').a[0], 130);
      click('#undo'); assert.deepEqual(app.getProject(), after);
      document.activeElement?.blur?.();
      tapKey('PageUp', { altKey: true });
      near(piece('QA-A').a[1], 151); near(piece('QA-A').b[1], 2151);
      click('#undo'); assert.deepEqual(app.getProject(), after);
    });

    await t.test('les flèches sur le plan face ou côté suivent ses axes une seule fois, sans double traitement du SVG', async () => {
      await load(); app.selectParts(['QA-A']); app.setWorkspaceMode('plan');
      for (const [view, axis] of [['front', 0], ['side', 2]]) {
        click(`[data-plan-view="${view}"]`);
        const before = app.getProject(), original = piece('QA-A');
        q('#plan-canvas svg').focus();
        tapKey('ArrowRight');
        const horizontal = app.getProject();
        near(piece('QA-A').a[axis], original.a[axis] - 10);
        near(piece('QA-A').b[axis], original.b[axis] - 10);
        near(piece('QA-A').a[1], original.a[1]);
        tapKey('ArrowUp');
        near(piece('QA-A').a[1], original.a[1] + 10);
        near(piece('QA-A').b[1], original.b[1] + 10);
        assert.equal(app.getPlanEditor().getPending(), null, 'Aucun second déplacement en aperçu ne reste dans le contrôleur SVG');
        assert.deepEqual(saved(), app.getProject());
        click('#undo'); assert.deepEqual(app.getProject(), horizontal);
        click('#undo'); assert.deepEqual(app.getProject(), before);
      }
    });

    await t.test('le libellé Structure partagé ne lie pas automatiquement les bois non groupés', async () => {
      const project = fixture();
      for (const part of project.freeParts.filter(part => part.material === 'wood')) { part.groupName = 'Structure'; part.grouped = false; }
      await load(project);
      const before = app.getProject();
      app.selectScenePart(app.getModel().parts.find(part => part.id === 'QA-A'), {});
      assert.deepEqual(app.getSelection(), ['QA-A']);
      assert.deepEqual(app.getProject(), before);
      assert.deepEqual(saved(), before);
    });

    await t.test('les liaisons en chaîne se sélectionnent et se déplacent ensemble ; recliquer choisit une seule pièce', async () => {
      const project=fixture();project.freeJoints=[
        {id:'QA-J1',aPart:'QA-A',bPart:'QA-C',recipe:'angle'},
        {id:'QA-J2',aPart:'QA-C',bPart:'QA-B',recipe:'angle'},
        {id:'QA-J3',aPart:'QA-B',bPart:'QA-A',recipe:'angle'},
      ];
      await load(project);const before=app.getProject(),bom=app.getBOM();
      const pick=id=>app.selectScenePart(app.getModel().parts.find(part=>part.id===id)||null,{});
      pick('QA-A');assert.deepEqual(new Set(app.getSelection()),new Set(['QA-A','QA-B','QA-C']));
      context('QA-C');assert.equal(app.getSelection().length,3,'Le clic droit garde tout l’ensemble');tapKey('Escape');document.activeElement?.blur?.();
      tapKey('ArrowRight');
      for(const part of before.freeParts)near(piece(part.id).a[0],part.a[0]+(part.id==='QA-M'?0:10));
      assert.deepEqual(app.getProject().freeJoints,before.freeJoints);click('#undo');
      pick('QA-C');assert.deepEqual(app.getSelection(),['QA-C']);
      pick('QA-C');assert.deepEqual(app.getSelection(),['QA-C'],'Un clic supplémentaire conserve la pièce seule');
      document.activeElement?.blur?.();tapKey('ArrowRight');
      assert.deepEqual(piece('QA-A'),before.freeParts.find(p=>p.id==='QA-A'));
      assert.deepEqual(piece('QA-B'),before.freeParts.find(p=>p.id==='QA-B'));
      near(piece('QA-C').a[0],10);assert.deepEqual(app.getProject().freeJoints,before.freeJoints);click('#undo');
      pick(null);pick('QA-B');assert.equal(app.getSelection().length,3);
      assert.deepEqual(app.getProject(),before);assert.deepEqual(app.getBOM(),bom);assert.deepEqual(saved(),before);
      app.selectParts([]);app.selectScenePart(app.getModel().parts.find(p=>p.id==='QA-A'),{altKey:true});assert.deepEqual(app.getSelection(),['QA-A']);
      app.selectParts([]);click('[data-pick="QA-B"]');assert.equal(app.getSelection().length,3);
      click('[data-pick="QA-B"]');assert.deepEqual(app.getSelection(),['QA-B']);
      app.selectParts([]);app.setWorkspaceMode('plan');
      app.getPlanEditor().emitSelect(app.getModel().parts.find(p=>p.id==='QA-A'),{});assert.equal(app.getSelection().length,3);
      app.getPlanEditor().emitSelect(app.getModel().parts.find(p=>p.id==='QA-C'),{});assert.deepEqual(app.getSelection(),['QA-C']);
    });

    await t.test('le menu natif est bloqué sur la scène et sur le panneau Actions apparu après le clic droit', async () => {
      await load(); app.selectParts(['QA-A']);
      const before = app.getProject();
      const nativeMenu = node => {
        const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
        node.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
      };
      nativeMenu(q('#scene'));
      context('QA-A');
      const menu = q('#scene-context-menu');
      nativeMenu(menu.querySelector('button'));
      nativeMenu(document.body);
      assert.equal(q('#scene-context-menu'), menu);
      assert.deepEqual(app.getProject(), before);
      assert.deepEqual(app.getSelection(), ['QA-A']);
      click('[data-context-action="properties"]');
      assert.equal(document.querySelector('#scene-context-menu'), null);
      assert.ok(q('[data-editor-form="piece"]'));
    });

    await t.test('un menu contextuel ouvert conserve les pièces quand une touche de construction est pressée', async () => {
      await load(); app.selectParts(['QA-A']);
      const before = app.getProject(); context('QA-A');
      for (const [pressed, options] of [['ArrowRight', {}], ['Delete', {}], ['d', { ctrlKey: true }]]) {
        tapKey(pressed, options);
        assert.deepEqual(app.getProject(), before, `Le menu ouvert absorbe ${pressed}`);
        assert.deepEqual(saved(), before);
      }
      tapKey('Escape');
      assert.equal(document.querySelector('#scene-context-menu'), null);
      assert.deepEqual(app.getSelection(), ['QA-A']);
    });

    await t.test('le menu crée un groupe sélectionnable dans la scène ; dégrouper et grouper sont annulables', async () => {
      await load(); app.selectParts(['QA-A', 'QA-C']);
      const before = app.getProject(), bom = app.getBOM();
      context('QA-A'); click('[data-context-action="group"]');
      const form = q('[data-context-form="group"]');
      form.elements.name.focus();
      tapKey('ArrowRight'); assert.deepEqual(app.getProject(), before);
      submit('[data-context-form="group"]', { name: 'Portique gauche', includeConnected: false });
      const grouped = app.getProject();
      assert.notDeepEqual(grouped, before);
      assert.deepEqual(saved(), grouped); assert.deepEqual(app.getBOM(), bom);
      app.selectParts([]);
      app.selectScenePart(app.getModel().parts.find(part => part.id === 'QA-A'), {});
      assert.deepEqual(new Set(app.getSelection()), new Set(['QA-A', 'QA-C']));
      context('QA-A'); click('[data-context-action="ungroup"]');
      app.selectParts([]);
      app.selectScenePart(app.getModel().parts.find(part => part.id === 'QA-A'), {});
      assert.deepEqual(app.getSelection(), ['QA-A']);
      click('#undo'); assert.deepEqual(app.getProject(), grouped);
      click('#undo'); assert.deepEqual(app.getProject(), before);
    });

    await t.test('V0.27.1 dégrouper depuis les propriétés : sélection indépendante persistante et annulation',async()=>{
      const source=fixture();source.freeJoints=[{id:'J',aPart:'QA-A',bPart:'QA-C',recipe:'angle',screws:8,connectors:2}];await load(source);
      const before=app.getProject(),bom=app.getBOM();app.selectScenePart(app.getModel().parts.find(p=>p.id==='QA-A'),{});assert.equal(app.getSelection().length,2);
      click('[data-editor="ungroup"]');const after=app.getProject();assert.equal(after.freeParts.find(p=>p.id==='QA-A').selectLinked,false);assert.deepEqual(saved(),after);assert.deepEqual(app.getBOM(),bom);
      app.selectParts([]);app.selectScenePart(app.getModel().parts.find(p=>p.id==='QA-C'),{});assert.deepEqual(app.getSelection(),['QA-C']);
      click('#undo');assert.deepEqual(app.getProject(),before);app.selectParts([]);app.selectScenePart(app.getModel().parts.find(p=>p.id==='QA-C'),{});assert.equal(app.getSelection().length,2);
      click('#redo');assert.deepEqual(app.getProject(),after);
    });
    await t.test('V0.27.1 mur : appliquer longueur et hauteur, persister, annuler',async()=>{
      const source=fixture();source.freeParts.push({id:'QA-W',kind:'wall',material:'wall',a:[0,0,0],b:[2000,0,0],height:2500,width:200,wallThickness:200,wallSupport:'concrete'});await load(source);
      const before=app.getProject();assert.equal(app.applyPanelResize('QA-W',[[0,0,0],[3000,0,0],[3000,2800,0],[0,2800,0]]),true);
      assert.deepEqual(piece('QA-W').b,[3000,0,0]);assert.equal(piece('QA-W').height,2800);assert.equal(piece('QA-W').width,200);assert.equal(piece('QA-W').corners,undefined);assert.deepEqual(saved(),app.getProject());click('#undo');assert.deepEqual(app.getProject(),before);
    });
    await t.test('V0.27.1 conseils conservés : entrées visibles, béton calculé, réglages et retour depuis un poteau',async()=>{
      await load();const before=app.getProject();app.setPage('connections');
      for(const action of ['foundation-helper','wall-helper','joint-detail'])assert.ok(q(`.fixing-advice-links [data-action="${action}"]`));
      click('.fixing-advice-links [data-action="foundation-helper"]');assert.equal(q('#modal-title').textContent,'Plots béton & ancrages');assert.match(q('#modal-content').textContent,/Solutions et conseils de pose/);assert.match(q('#modal-content').textContent,/Aucun plot béton affecté/);assert.deepEqual(app.getProject(),before);
      click('[data-action="foundation-settings"]');assert.equal(q('#foundation-settings').open,true);assert.ok(q('#foundation-settings [data-field="concreteYield"]'));assert.deepEqual(app.getProject(),before);
      click('.fixing-advice-links [data-action="wall-helper"]');assert.match(q('#modal-title').textContent,/mur/);click('#modal-close');click('.fixing-advice-links [data-action="joint-detail"]');assert.match(q('#modal-title').textContent,/bois/);click('#modal-close');
      app.setPage('design');app.selectParts(['QA-A']);assert.ok(q('#inspector [data-action="foundation-helper"]'));
    });
    await t.test('poser au sol garde les écarts de la sélection ; poser individuellement règle chaque pied à zéro', async () => {
      await load(); app.selectParts(['QA-A', 'QA-B']);
      const before = app.getProject(), otherParts = before.freeParts.filter(part => !['QA-A', 'QA-B'].includes(part.id));
      context('QA-A'); click('[data-context-action="ground"]');
      near(piece('QA-A').a[1], 0); near(piece('QA-B').a[1], 200);
      near(piece('QA-A').b[1], 2000); near(piece('QA-B').b[1], 2200);
      assert.deepEqual(app.getProject().freeParts.filter(part => !['QA-A', 'QA-B'].includes(part.id)), otherParts);
      assert.deepEqual(saved(), app.getProject());
      click('#undo'); assert.deepEqual(app.getProject(), before);
      app.selectParts(['QA-A', 'QA-B']); context('QA-A'); click('[data-context-action="ground-individual"]');
      near(piece('QA-A').a[1], 0); near(piece('QA-B').a[1], 0);
      near(piece('QA-A').b[1], 2000); near(piece('QA-B').b[1], 2000);
      click('#undo'); assert.deepEqual(app.getProject(), before);
    });

    await t.test('aligner depuis le menu garde la référence choisie fixe et forme une seule action Undo', async () => {
      await load(); app.selectParts(['QA-A', 'QA-B']);
      const before = app.getProject(), fixed = piece('QA-A');
      context('QA-A'); click('[data-context-action="align"]');
      assert.deepEqual(app.getProject(), before);
      submit('[data-context-form="align"]', { referenceId: 'QA-A', axis: 'y', feature: 'min' });
      assert.deepEqual(piece('QA-A'), fixed);
      near(piece('QA-B').a[1], 150); near(piece('QA-B').b[1], 2150);
      assert.deepEqual(saved(), app.getProject());
      click('#undo'); assert.deepEqual(app.getProject(), before);
    });

    await t.test('lier à une pièce visée ouvre le montage choisi ; la liaison et ses achats apparaissent après validation', async () => {
      await load(); app.selectParts(['QA-A']);
      const before = app.getProject();
      context('QA-A'); click('[data-context-action="link-target"]');
      assert.deepEqual(app.getProject(), before);
      app.selectScenePart(app.getModel().parts.find(part => part.id === 'QA-C'), {});
      const form = q('[data-editor-form="connect"]');
      assert.equal(form.elements.aPart.value, 'QA-A');
      assert.equal(form.elements.bPart.value, 'QA-C');
      assert.deepEqual(app.getProject(), before);
      submit('[data-editor-form="connect"]', { recipe: 'angle' });
      const after = app.getProject(), joint = after.freeJoints[0];
      assert.equal(after.freeJoints.length, 1);
      assert.deepEqual(new Set([joint.aPart, joint.bPart]), new Set(['QA-A', 'QA-C']));
      assert.equal(joint.recipe, 'angle');
      assert.deepEqual(after.freeParts, before.freeParts);
      assert.ok(app.getBOM().some(row => row.jointIds?.includes(joint.id) && row.required > 0));
      assert.deepEqual(saved(), after);
      app.selectParts(['QA-A']); context('QA-A'); click('[data-context-action="select-connected"]');
      assert.deepEqual(new Set(app.getSelection()), new Set(['QA-A', 'QA-C']));
      click('#undo'); assert.deepEqual(app.getProject(), before);
    });

    await t.test('modifier une distance directe à 0,50 m garde la première pièce fixe et se défait en une fois', async () => {
      await load(); app.selectParts(['QA-A', 'QA-B']);
      const before = app.getProject(), fixed = piece('QA-A');
      app.editSceneDistance({ referenceIds: ['QA-A', 'QA-B'], measure: 'faces' });
      fill('[data-scene-distance]', { value: '0,50 m', move: 'b', withGroup: false });
      change('[data-scene-distance] [name="value"]', '0,50 m');
      assert.match(q('[data-scene-distance-preview]').textContent, /500/);
      assert.deepEqual(app.getProject(), before);
      assert.deepEqual(saved(), before);
      submit('[data-scene-distance]');
      assert.deepEqual(piece('QA-A'), fixed);
      near(piece('QA-B').a[0], 600); near(piece('QA-B').b[0], 600);
      near(piece('QA-B').a[1], 350);
      assert.deepEqual(saved(), app.getProject());
      click('#undo'); assert.deepEqual(app.getProject(), before);
    });

    await t.test('agrandir le grillage actualise surface, lés et achats, sans changer les bois ; Undo restaure le quantitatif', async () => {
      await load(); app.selectParts(['QA-M']);
      const before = app.getProject(), beforeBOM = app.getBOM(), beforeRoll = beforeBOM.find(row => row.id === 'mesh-roll');
      assert.equal(app.getModel().parts.find(part => part.id === 'QA-M').area, 1);
      const corners = [[0, 0, 500], [2000, 0, 500], [2000, 3000, 500], [0, 3000, 500]];
      app.applyPanelResize('QA-M', corners);
      const after = app.getProject(), afterRoll = app.getBOM().find(row => row.id === 'mesh-roll');
      assert.deepEqual(piece('QA-M').corners, corners);
      near(app.getModel().parts.find(part => part.id === 'QA-M').area, 6);
      assert.ok(afterRoll.required > beforeRoll.required);
      assert.ok(afterRoll.purchaseQty > beforeRoll.purchaseQty);
      assert.notDeepEqual(afterRoll.cuts, beforeRoll.cuts);
      assert.deepEqual(after.freeParts.filter(part => part.id !== 'QA-M'), before.freeParts.filter(part => part.id !== 'QA-M'));
      assert.deepEqual(saved(), after);
      click('#undo');
      assert.deepEqual(app.getProject(), before); assert.deepEqual(app.getBOM(), beforeBOM);
      click('#redo');
      assert.deepEqual(app.getProject(), after);
    });
  } finally { await env.close(); }
});
