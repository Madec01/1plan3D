import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { paperSettingsPanel, paperWorkspace, technicalSettingsPanel, technicalWorkspace } from '../src/dossier-ui.js';

function dom(html) {
  const window = new Window();
  window.document.body.innerHTML = html;
  // Happy DOM's parser can select the second option despite a later `selected`
  // attribute; mirror native selection (and app.js syncSelections) for FormData.
  for (const select of window.document.querySelectorAll('select')) {
    const selected = select.querySelector('option[selected]'); if (selected) select.value = selected.value;
  }
  return { window, document: window.document, q: selector => window.document.querySelector(selector), all: selector => [...window.document.querySelectorAll(selector)], done: () => window.happyDOM.abort() };
}
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210"><text x="10" y="20">Plan</text></svg>';
const parts = [{ id: 'P1', label: 'Poteau gauche', section: '100 × 100', a: [0, 0, 0], b: [0, 2000, 0] }, { id: 'P2', label: 'Poteau droit', section: '100 × 100', a: [3700, 0, 0], b: [3700, 2000, 0] }];

test('paper form carries physical settings, repeated view names and every cartouche field', () => {
  const project = { name: 'Poulailler', paper: { format: 'A3', orientation: 'portrait', margin: 15, scale: 25, title: 'Plan coté', author: 'Anaïs', date: '2026-10-20', revision: 'B', views: ['top', 'side'], automatic: false } };
  const before = structuredClone(project), f = dom(paperSettingsPanel(project));
  try {
    const form = f.q('[data-paper-form]'), data = new f.window.FormData(form);
    assert.deepEqual(Object.fromEntries(data), { format: 'A3', orientation: 'portrait', margin: '15', scale: '25', views: 'side', title: 'Plan coté', author: 'Anaïs', date: '2026-10-20', revision: 'B' });
    assert.deepEqual(data.getAll('views'), ['top', 'side']);
    assert.equal(data.has('automatic'), false);
    assert.deepEqual([...form.elements.scale.options].map(o => o.value), ['fit', '5', '10', '20', '25', '50', '100']);
    assert.equal(form.elements.margin.min, '5'); assert.equal(form.elements.margin.max, '30');
    assert.equal(form.checkValidity(), true);
    assert.deepEqual(project, before);
  } finally { f.done(); }
});

test('an empty paper selection remains empty and disables meaningless exports', () => {
  const project = { paper: { views: [] } }, f = dom(paperSettingsPanel(project) + paperWorkspace(project, {}, []));
  try {
    const data = new f.window.FormData(f.q('[data-paper-form]'));
    assert.deepEqual(data.getAll('views'), []);
    assert.match(f.q('[data-paper-summary]').textContent, /0 feuille/);
    assert.equal(f.q('[data-paper-action=pdf]').disabled, true);
    assert.equal(f.q('[data-paper-action=print]').disabled, true);
    assert.match(f.q('.dossier-empty').textContent, /Choisissez au moins une vue/);
  } finally { f.done(); }
});

test('paper previews retain their identities, vectors and overflow warning without silently changing scale', () => {
  const sheets = [{ id: 'plan-top', title: 'Dessus', view: 'top', width: 297, height: 210, scale: 5, scaleLabel: '1:5', number: 1, total: 2, overflow: true, warnings: ['Dessin trop grand à 1:5'], svg }, { id: 'plan-front', title: 'Face', view: 'front', width: 297, height: 210, scale: 5, number: 2, total: 2, warnings: [], svg }];
  const before = structuredClone(sheets), f = dom(paperWorkspace({ paper: { scale: 5 } }, { parts }, sheets));
  try {
    assert.equal(f.all('.paper-sheet').length, 2); assert.equal(f.all('.paper-sheet-viewport svg').length, 2);
    assert.equal(f.q('.paper-sheet').dataset.sheetId, 'plan-top');
    assert.equal(f.q('.paper-sheet').dataset.paperOrientation, 'landscape');
    assert.match(f.q('.paper-overflow-alert').textContent, /1 feuille déborde/);
    assert.match(f.q('.paper-sheet-warning').textContent, /1:5/);
    assert.deepEqual(f.all('[data-paper-action=svg]').map(b => b.dataset.sheetId), ['plan-top', 'plan-front']);
    assert.equal(f.q('[data-paper-action=pdf]').disabled, false);
    assert.equal(f.q('.paper-sheet-viewport').getAttribute('tabindex'), '0');
    assert.deepEqual(sheets, before);
  } finally { f.done(); }
});

test('project metadata and warnings cannot inject HTML into paper controls or previews', () => {
  const malicious = '"><img src=x onerror="boom()">', project = { name: malicious, paper: { title: malicious, author: malicious, revision: malicious } };
  const f = dom(paperSettingsPanel(project) + paperWorkspace(project, {}, [{ id: malicious, title: malicious, view: malicious, width: 210, height: 297, warnings: [malicious], svg }]));
  try {
    assert.equal(f.q('img'), null); assert.equal(f.q('[onerror]'), null);
    assert.equal(f.q('[name=title]').value, malicious);
    assert.equal(f.q('.paper-sheet').dataset.sheetId, malicious);
    assert.equal(f.q('[data-paper-action=svg]').dataset.sheetId, malicious);
    assert.match(f.q('.dossier-notices').textContent, /<img/);
  } finally { f.done(); }
});

test('technical form reads nested geometric options while exposing the flat field contract', () => {
  const project = { technical: { type: 'exploded', view: 'iso', section: { axis: 'z', offset: -12.5, keep: 'positive' }, exploded: { distance: 420, by: 'part' }, includeInDossier: true, includeSteps: true, labels: false, dimensions: true, includeFixings: true } };
  const before = structuredClone(project), model = { parts, joints: [{ id: 'J1', label: 'Chevron sur poteau' }] }, f = dom(technicalSettingsPanel(project, model, ['P2']));
  try {
    const form = f.q('[data-technical-form]'), data = new f.window.FormData(form);
    for (const [key, value] of Object.entries({ type: 'exploded', view: 'iso', axis: 'z', offset: '-12.5', keep: 'positive', distance: '420', by: 'part', jointId: '', includeInDossier: 'on', includeSteps: 'on', dimensions: 'on', includeFixings: 'on', partIds: 'P2' })) assert.equal(data.get(key), value, key);
    assert.equal(data.has('labels'), false);
    assert.equal(f.q('[data-technical-kind=exploded]').hidden, false);
    assert.equal(f.q('[data-technical-kind=section]').hidden, true);
    assert.equal(f.q('[data-technical-action=add-step][data-step-source=selection]').disabled, false);
    assert.equal(f.q('[name=stepLabel]').type, 'text');
    assert.equal(form.checkValidity(), true);
    assert.deepEqual(project, before);
  } finally { f.done(); }
});

test('manual part choices are independent of drawing selection and contain each part once', () => {
  const f = dom(technicalSettingsPanel({}, { parts: [...parts, parts[0]] }, []));
  try {
    assert.equal(f.q('[data-step-source=selection]').disabled, true);
    assert.equal(f.q('[data-step-source=checked]').disabled, false);
    assert.equal(f.all('[name=partIds]').length, 2);
    f.q('[name=partIds][value=P1]').checked = true;
    assert.deepEqual(new f.window.FormData(f.q('form')).getAll('partIds'), ['P1']);
  } finally { f.done(); }
});

test('the detail selector includes ground anchors and preserves a missing joint reference visibly', () => {
  const model = { parts: [...parts, { id: 'PIED-P1', a: [0, 0, 0] }], posts: [{ id: 'P1', foundation: 'plate_mechanical' }], joints: [{ id: 'J1', label: 'Chevron sur poteau' }] };
  const f = dom(technicalSettingsPanel({ technical: { type: 'detail', jointId: 'deleted-joint' } }, model));
  try {
    const select = f.q('[name=jointId]');
    assert.ok([...select.options].some(o => o.value === 'BASE-P1' && /Ancrage au sol/.test(o.textContent)));
    assert.equal(select.value, 'deleted-joint');
    assert.match(select.selectedOptions[0].textContent, /Référence absente/);
    assert.equal(f.q('[data-technical-kind=detail]').hidden, false);
  } finally { f.done(); }
});

const sequence = [
  { id: 'step-a', label: 'Poser les poteaux', partIds: ['P1', 'P2'] },
  { id: 'step-b', label: 'Poser les chevrons', partIds: ['B1'], missingIds: ['deleted-piece'] },
];
test('assembly cards expose stable edit actions, missing references and cumulative navigation', () => {
  const project = { technical: { type: 'exploded', assemblySteps: sequence, stepIndex: 0 } };
  const before = structuredClone(project), result = { svg, options: project.technical, steps: sequence, includedPartIds: ['P1', 'P2'], currentPartIds: ['P1', 'P2'], warnings: [], legend: [{ id: 'P1', label: 'Poteau', current: true }] };
  const f = dom(technicalWorkspace(project, { parts }, result));
  try {
    assert.equal(f.q('.technical-step.current').dataset.stepId, 'step-a');
    assert.equal(f.q('.technical-step.current').getAttribute('aria-current'), 'step');
    assert.equal(f.q('[data-step-label=step-a]').value, 'Poser les poteaux');
    assert.equal(f.q('[data-technical-action=step-up][data-step-id=step-a]').disabled, true);
    assert.equal(f.q('[data-technical-action=step-down][data-step-id=step-b]').disabled, true);
    assert.equal(f.q('[data-technical-action=step-delete][data-step-id=step-a]').disabled, false);
    assert.equal(f.q('[data-technical-action=next-step]').disabled, false);
    assert.equal(f.q('[data-technical-action=all-steps]').disabled, false);
    assert.match(f.q('[data-step-status]').textContent, /Étape 1 sur 2/);
    assert.match(f.q('.technical-step-missing').textContent, /deleted-piece/);
    assert.match(f.q('.technical-legend .current').textContent, /P1.*À cette étape/);
    assert.deepEqual(project, before);
  } finally { f.done(); }
});

test('assembly start, final step and complete view have distinct states without deleting saved steps', () => {
  for (const index of [-1, 1, null]) {
    const options = { type: 'exploded', assemblySteps: sequence, stepIndex: index };
    const f = dom(technicalWorkspace({ technical: options }, {}, { svg, options, steps: sequence }));
    try {
      assert.equal(f.all('.technical-step').length, 2);
      if (index === -1) {
        assert.equal(f.q('[data-technical-action=prev-step]').disabled, true);
        assert.equal(f.q('[data-technical-action=next-step]').disabled, false);
        assert.match(f.q('[data-step-status]').textContent, /aucune étape/);
      } else if (index === 1) {
        assert.equal(f.q('[data-technical-action=next-step]').disabled, true);
        assert.equal(f.q('[data-technical-action=prev-step]').disabled, false);
      } else {
        assert.equal(f.q('[data-technical-action=all-steps]').disabled, true);
        assert.equal(f.q('[data-technical-action=next-step]').disabled, false);
        assert.match(f.q('[data-step-status]').textContent, /aucune étape de montage filtrée/);
      }
    } finally { f.done(); }
  }
});

test('technical labels, IDs, warnings and legend colors do not become HTML attributes', () => {
  const malicious = '"><img src=x onerror="boom()">';
  const options = { assemblySteps: [{ id: malicious, label: malicious, partIds: [malicious] }] };
  const f = dom(technicalSettingsPanel({ technical: options }, { parts: [{ id: malicious, label: malicious }] }, [malicious]) + technicalWorkspace({}, {}, { svg, options, label: malicious, warnings: [malicious], legend: [{ id: malicious, label: malicious, color: 'red;position:fixed' }] }));
  try {
    assert.equal(f.q('img'), null); assert.equal(f.q('[onerror]'), null);
    assert.equal(f.q('[name=partIds]').value, malicious);
    assert.equal(f.q('[data-step-label]').dataset.stepLabel, malicious);
    assert.equal(f.q('[data-step-label]').value, malicious);
    assert.equal(f.q('.technical-legend i').getAttribute('style'), 'background:#7b8c70');
    assert.match(f.q('.technical-warnings').textContent, /<img/);
  } finally { f.done(); }
});

test('an empty technical project gives useful empty states and no export or step action', () => {
  const f = dom(technicalSettingsPanel() + technicalWorkspace());
  try {
    assert.equal(f.q('[data-technical-action=svg]').disabled, true);
    assert.equal(f.q('[data-step-source=checked]').disabled, true);
    assert.equal(f.q('[data-technical-action=next-step]').disabled, true);
    assert.match(f.q('.technical-preview').textContent, /Choisissez une vue/);
    assert.match(f.q('.technical-steps').textContent, /Ajoutez une étape/);
  } finally { f.done(); }
});
