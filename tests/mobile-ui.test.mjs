import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { setupMobileUI, MOBILE_QUERY } from '../src/mobile-ui.js';

function fixture(initial = {}, options = {}) {
  const window = new Window({ url: 'https://atelier.test/' });
  if (options.visualViewport) Object.defineProperty(window, 'visualViewport', { value: options.visualViewport, configurable: true });
  if (options.innerHeight) window.innerHeight = options.innerHeight;
  const document = window.document;
  document.body.innerHTML = `<header><button id="save">Sauver</button></header><main>
    <nav><button id="navigation">Construire</button></nav>
    <aside id="sidebar" aria-label="Pièces"><input id="piece-search"><button id="piece">Poteau</button><details><summary>Aides</summary><section class="adaptive-assistance"><input id="grid"></section></details></aside>
    <section id="workspace"><div id="scene-area"><canvas></canvas><div id="plan-area"></div><div id="inspector" role="region" aria-label="Propriétés"><form><input id="position"><button id="apply">Appliquer</button></form></div></div></section>
  </main><div id="mobile-toolbar"><button data-mobile-sheet="pieces">Pièces</button><button data-mobile-sheet="properties">Propriétés</button><button data-mobile-sheet="aids">Aides</button><button data-mobile-action="add">Ajouter</button><button data-mobile-action="multi">Plusieurs</button><button data-mobile-action="cancel">Annuler</button><button data-mobile-action="confirm">Valider</button></div><dialog id="modal"><button id="modal-control">Valider</button></dialog>`;
  let context = { page: 'design', sceneActive: true, selectedCount: 1, pendingAction: false, ...initial };
  const actions = [], listeners = new Set();
  const media = {
    matches: true,
    addEventListener(type, listener) { assert.equal(type, 'change'); listeners.add(listener); },
    removeEventListener(type, listener) { listeners.delete(listener); },
    set(matches) { this.matches = matches; for (const listener of listeners) listener({ matches }); },
  };
  const ui = setupMobileUI({ document, media, getContext: () => context, onAction: action => actions.push(action) });
  const q = selector => document.querySelector(selector);
  return {
    window, document, media, listeners, ui, q, actions,
    update(change) { context = { ...context, ...change }; ui.refresh(); },
    key(key, options = {}) { const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }); document.activeElement.dispatchEvent(event); return event; },
    destroy() { ui.destroy(); window.happyDOM.abort(); },
  };
}

test('mobile keeps the drawing clear, and opens just one existing panel at a time', () => {
  const f = fixture();
  try {
    const sidebar = f.q('#sidebar'), inspector = f.q('#inspector'), input = f.q('#position');
    const sidebarParent = sidebar.parentElement, inspectorParent = inspector.parentElement;
    let inputEvents = 0; input.addEventListener('change', () => inputEvents++);
    assert.deepEqual(f.ui.getState(), { mobile: true, sheet: null, pendingAction: false });
    assert.equal(sidebar.inert, true); assert.equal(inspector.inert, true);
    f.q('[data-mobile-sheet=pieces]').click();
    assert.equal(f.ui.getState().sheet, 'pieces');
    assert.equal(sidebar.getAttribute('aria-hidden'), 'false');
    assert.equal(sidebar.getAttribute('aria-modal'), 'true');
    assert.equal(f.q('[data-mobile-sheet=pieces]').getAttribute('aria-expanded'), 'true');
    assert.equal(f.q('#mobile-sheet-backdrop').hidden, false);
    f.q('[data-mobile-sheet=properties]').click();
    assert.equal(f.ui.getState().sheet, 'properties');
    assert.equal(sidebar.inert, true); assert.equal(inspector.inert, false);
    assert.equal(f.q('[data-mobile-sheet=pieces]').getAttribute('aria-expanded'), 'false');
    assert.equal(sidebar.parentElement, sidebarParent); assert.equal(inspector.parentElement, inspectorParent);
    assert.equal(f.q('#position'), input);
    input.dispatchEvent(new f.window.Event('change', { bubbles: true }));
    assert.equal(inputEvents, 1, 'opening a sheet preserves form nodes and their listeners');
  } finally { f.destroy(); }
});

test('Escape folds properties without clearing the selected item and restores the opener', () => {
  const f = fixture();
  try {
    let editorEscape = 0; f.document.addEventListener('keydown', () => editorEscape++);
    const opener = f.q('[data-mobile-sheet=properties]'); opener.click();
    assert.equal(f.document.activeElement, f.q('#inspector [data-mobile-close]'));
    const event = f.key('Escape');
    assert.equal(event.defaultPrevented, true);
    assert.equal(editorEscape, 0, 'the editor does not also interpret Escape as clear selection');
    assert.equal(f.ui.getState().sheet, null);
    assert.equal(f.document.activeElement, opener);
    assert.equal(opener.disabled, false);
    assert.equal(f.q('#inspector').classList.contains('hidden'), false);
    assert.deepEqual(f.actions, []);
  } finally { f.destroy(); }
});

test('Tab stays in the sheet, while an open native modal keeps its own keyboard handling', () => {
  const f = fixture();
  try {
    f.ui.open('properties');
    const close = f.q('#inspector [data-mobile-close]'), apply = f.q('#apply');
    close.focus(); assert.equal(f.key('Tab', { shiftKey: true }).defaultPrevented, true);
    assert.equal(f.document.activeElement, apply);
    assert.equal(f.key('Tab').defaultPrevented, true); assert.equal(f.document.activeElement, close);
    f.q('#save').focus(); assert.equal(f.document.activeElement, close, 'background controls cannot steal focus');
    f.q('#modal').setAttribute('open', ''); f.q('#modal-control').focus();
    f.ui.refresh(); assert.equal(f.document.activeElement, f.q('#modal-control'), 'rerendering does not steal focus from a native dialog');
    assert.equal(f.key('Escape').defaultPrevented, false);
    assert.equal(f.ui.getState().sheet, 'properties');
  } finally { f.destroy(); }
});

test('existing inspector form submission remains owned by the editor', () => {
  const f = fixture();
  try {
    let submits = 0;
    f.q('#inspector form').addEventListener('submit', event => { event.preventDefault(); submits++; });
    f.ui.open('properties'); f.q('#position').value = '1850'; f.q('#apply').click();
    assert.equal(submits, 1); assert.equal(f.q('#position').value, '1850');
    assert.equal(f.ui.getState().sheet, 'properties'); assert.deepEqual(f.actions, []);
  } finally { f.destroy(); }
});

test('Aides délègue au panneau de réglages sans reconstruire la liste des pièces', () => {
  const f = fixture();
  try {
    const input = f.q('#grid');
    f.q('[data-mobile-sheet=aids]').click();
    assert.equal(f.ui.getState().sheet, null);
    assert.deepEqual(f.actions, ['aids']);
    assert.equal(f.q('#grid'), input);
    assert.equal(f.q('#sidebar details').open, false);
  } finally { f.destroy(); }
});

test('inspector refresh preserves the open sheet and recovers focus after its form is rerendered', () => {
  const f = fixture();
  try {
    f.ui.open('properties'); f.q('#position').focus();
    f.q('#inspector').innerHTML = '<form><input id="new-position"><button id="new-apply">Appliquer</button></form>';
    f.ui.refresh();
    assert.equal(f.ui.getState().sheet, 'properties');
    assert.equal(f.q('#inspector [data-mobile-close]'), f.document.activeElement);
    assert.equal(f.q('#inspector').querySelectorAll('[data-mobile-sheet-heading]').length, 1);
    f.ui.refresh();
    assert.equal(f.q('#inspector').querySelectorAll('[data-mobile-sheet-heading]').length, 1);
    f.q('#inspector').classList.add('hidden'); f.update({ selectedCount: 0 });
    assert.equal(f.ui.getState().sheet, null);
    assert.equal(f.q('[data-mobile-sheet=properties]').disabled, true);
    assert.equal(f.ui.open('properties'), false);
    assert.equal(f.q('#inspector').classList.contains('hidden'), true);
  } finally { f.destroy(); }
});

test('pending operations expose persistent confirm/cancel and close the panel before delegating an action', () => {
  const f = fixture();
  try {
    f.ui.open('pieces'); f.update({ pendingAction: 'Placer le poteau', canConfirm: false });
    assert.equal(f.ui.getState().sheet, null);
    assert.equal(f.q('[data-mobile-action=cancel]').hidden, false);
    assert.equal(f.q('[data-mobile-action=confirm]').hidden, false);
    assert.equal(f.q('[data-mobile-action=confirm]').disabled, true);
    assert.equal(f.q('[data-mobile-action=add]').disabled, true);
    f.q('[data-mobile-action=confirm]').click(); assert.deepEqual(f.actions, []);
    f.update({ canConfirm: true }); f.q('[data-mobile-action=confirm]').click();
    f.q('[data-mobile-action=cancel]').click(); assert.deepEqual(f.actions, ['confirm', 'cancel']);
    f.update({ pendingAction: false, multiSelect: true });
    assert.equal(f.q('[data-mobile-action=cancel]').hidden, true);
    assert.equal(f.q('[data-mobile-action=confirm]').hidden, true);
    assert.equal(f.q('[data-mobile-action=multi]').getAttribute('aria-pressed'), 'true');
    f.ui.open('pieces'); f.q('[data-mobile-action=add]').click();
    assert.equal(f.ui.getState().sheet, null); assert.deepEqual(f.actions, ['confirm', 'cancel', 'add']);
  } finally { f.destroy(); }
});

test('rotation to desktop restores panel semantics, visibility and background interaction', () => {
  const f = fixture();
  try {
    f.ui.open('properties');
    assert.equal(f.q('#save').closest('header').inert, true);
    f.media.set(false);
    assert.equal(f.ui.getState().mobile, false); assert.equal(f.ui.getState().sheet, null);
    assert.equal(f.q('#inspector').getAttribute('role'), 'region');
    assert.equal(f.q('#inspector').getAttribute('aria-hidden'), null);
    assert.equal(f.q('#inspector').getAttribute('aria-modal'), null);
    assert.equal(f.q('#inspector').getAttribute('tabindex'), null);
    assert.equal(f.q('#inspector').inert, false); assert.equal(f.q('#sidebar').inert, false);
    assert.equal(f.q('#save').closest('header').inert, false);
    assert.equal(f.q('#mobile-toolbar').hidden, true);
    assert.equal(f.q('[data-mobile-sheet-heading]'), null);
    f.media.set(true); assert.equal(f.q('#mobile-toolbar').hidden, false);
    assert.equal(f.ui.getState().sheet, null); assert.equal(f.q('#inspector').inert, true);
  } finally { f.destroy(); }
});

test('content pages keep settings available and disable scene-only controls', () => {
  const f = fixture();
  try {
    f.ui.open('properties'); f.update({ page: 'shopping', sceneActive: false });
    assert.equal(f.ui.getState().sheet, null);
    assert.equal(f.document.body.dataset.mobilePage, 'shopping');
    assert.equal(f.document.body.classList.contains('mobile-scene'), false);
    assert.equal(f.q('[data-mobile-sheet=pieces]').disabled, false);
    assert.equal(f.q('[data-mobile-sheet=aids]').disabled, true);
    assert.equal(f.q('[data-mobile-sheet=properties]').disabled, true);
    assert.equal(f.q('[data-mobile-action=add]').disabled, true);
    assert.equal(f.q('[data-mobile-action=multi]').disabled, true);
    assert.equal(f.ui.open('pieces'), true);
  } finally { f.destroy(); }
});

test('switching to the 2D view keeps the same selection properties panel', () => {
  const f = fixture();
  try {
    const inspector = f.q('#inspector'); f.ui.open('properties');
    f.update({ mode: 'plan' });
    assert.equal(f.ui.getState().sheet, 'properties'); assert.equal(f.q('#inspector'), inspector);
    assert.equal(inspector.getAttribute('aria-hidden'), 'false');
    f.update({ mode: '3d' }); assert.equal(f.ui.getState().sheet, 'properties');
  } finally { f.destroy(); }
});

test('the numeric keyboard reserves its covered viewport and its listeners are removed on teardown', () => {
  const events = new Map();
  const visualViewport = {
    height: 800, offsetTop: 0, scale: 1,
    addEventListener(type, listener) { events.set(type, listener); },
    removeEventListener(type) { events.delete(type); },
  };
  const f = fixture({}, { visualViewport, innerHeight: 800 });
  try {
    assert.equal(f.document.body.style.getPropertyValue('--mobile-keyboard-inset'), '0px');
    visualViewport.height = 470; events.get('resize')();
    assert.equal(f.document.body.style.getPropertyValue('--mobile-keyboard-inset'), '330px');
    visualViewport.scale = 2; events.get('resize')();
    assert.equal(f.document.body.style.getPropertyValue('--mobile-keyboard-inset'), '0px', 'pinch zoom is not interpreted as a keyboard');
    f.ui.destroy(); assert.equal(events.size, 0);
    assert.equal(f.document.body.style.getPropertyValue('--mobile-keyboard-inset'), '');
  } finally { f.destroy(); }
});

test('destroy removes only mobile additions and detaches every controller listener', () => {
  const f = fixture();
  try {
    assert.equal(f.listeners.size, 1); f.ui.open('pieces'); f.ui.destroy();
    assert.equal(f.listeners.size, 0); assert.equal(f.q('#mobile-sheet-backdrop'), null);
    assert.equal(f.q('[data-mobile-sheet-heading]'), null);
    assert.equal(f.q('#sidebar').getAttribute('aria-label'), 'Pièces');
    assert.equal(f.q('#inspector').getAttribute('role'), 'region');
    assert.equal(f.q('#sidebar').inert, false);
    f.q('[data-mobile-action=add]').click(); assert.deepEqual(f.actions, []);
    f.media.set(true); assert.equal(f.document.body.classList.contains('mobile-ui'), false);
    assert.equal(f.ui.open('pieces'), false);
    assert.match(MOBILE_QUERY, /pointer: coarse/);
  } finally { f.destroy(); }
});
