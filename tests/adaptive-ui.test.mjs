import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {adaptiveSidebar} from '../src/adaptive-ui.js';
import {precisionSidebar} from '../src/precision-ui.js';

const post = (id,x,label=id) => ({id,label,kind:'post',material:'wood',a:[x,0,0],b:[x,2000,0],width:90,height:90,roll:0});
const project = (parts=[],assistance={}) => ({mode:'free',freeParts:parts,grid:.1,snap:true,workplane:{type:'xz',offset:0,visible:true,lock:false},assistance});
const mount = html => { const window = new Window(); window.document.body.innerHTML = html; return window; };
const formatted = value => value.toLocaleString('fr-FR',{maximumFractionDigits:3});

test('aides : guides actifs par défaut, grille facultative repliée et tous champs persistables', async () => {
  const window = mount(adaptiveSidebar(project(),[])), d = window.document;
  try {
    const form = d.querySelector('[data-assistance-settings]'); assert.ok(form);
    assert.equal(form.elements.namedItem('guides').checked,true);
    assert.equal(form.elements.namedItem('guideSnap').checked,true);
    assert.equal(form.elements.namedItem('gridSnap').checked,false);
    assert.equal(d.querySelector('.adaptive-grid-settings').open,false);
    for (const name of ['guides','guideSnap','gridSnap','gridMode','gridStep','gridDivisions','gridReference','gridA','gridB']) assert.ok(form.elements.namedItem(name),name);
    const data = new window.FormData(form);
    for (const name of ['gridMode','gridStep','gridDivisions','gridReference','gridA','gridB']) assert.ok(data.has(name),name);
    assert.equal(form.checkValidity(),true);
    assert.equal(d.querySelector('[data-assist-action="between"]'),null);
    assert.match(d.body.textContent,/Alt/);assert.match(d.body.textContent,/ne déplace pas les pièces déjà posées/);
  } finally {await window.happyDOM.close();}
});

test('deux poteaux : pas exact divisé, noms des repères et mesures explicites dans le plan', async () => {
  const p=project([post('a',0,'Gauche'),post('b',1000.125,'Droite')],{gridSnap:true}),before=JSON.stringify(p);
  const window=mount(adaptiveSidebar(p,['a','b'])),d=window.document;
  try {
    assert.equal(d.querySelector('.adaptive-grid-settings').open,true);
    assert.ok(d.querySelector('.adaptive-grid-readout strong').textContent.includes(formatted(1000.125/8)));
    assert.match(d.querySelector('.adaptive-grid-readout').textContent,/Gauche ↔ Droite/);
    const readout=d.querySelector('.adaptive-pair-readout');
    assert.match(readout.textContent,/Entraxe dans le plan/);
    assert.match(readout.textContent,/Espace entre faces projetées/);
    assert.ok(readout.textContent.includes(formatted(1000.125)));
    assert.ok(readout.textContent.includes(formatted(910.125)));
    assert.ok(d.querySelector('[data-assist-action="grid-selection"]'));
    assert.equal(d.querySelector('[data-assist-action="between"]').textContent,'Ajouter au milieu de ces pièces');
    assert.equal(JSON.stringify(p),before,'Le rendu ne modifie pas les coordonnées ni les paramètres.');
  } finally {await window.happyDOM.close();}
});

test('le choix des références exclut murs et panneaux, les actions suivent la sélection', async () => {
  const p=project([post('a',0),post('b',1000),post('c',500),{...post('mur',2000),material:'wall',kind:'wall'},{...post('panneau',3000),kind:'panel'}]);
  const window=mount(adaptiveSidebar(p,['a','b','c'])),d=window.document;
  try {
    assert.deepEqual([...d.querySelector('[name="gridA"]').options].map(o=>o.value),['','a','b','c']);
    assert.equal(d.querySelector('[data-assist-action="grid-selection"]'),null);
    assert.equal(d.querySelector('.adaptive-pair-readout'),null);
    assert.equal(d.querySelector('[data-assist-action="between"]').textContent,'Insérer entre deux repères');
    assert.equal(d.querySelector('[data-assist-action="center-existing"]').textContent,'Centrer la dernière entre les deux premières');
    d.body.innerHTML=adaptiveSidebar(p,['a','mur']);
    assert.equal(d.querySelector('[data-assist-action="grid-selection"]'),null);
    assert.ok(d.querySelector('[data-assist-action="between"]'));
  } finally {await window.happyDOM.close();}
});

test('paire manuelle incomplète : notice exploitable et formulaire modifiable', async () => {
  const p=project([post('a',0),post('b',1000)],{gridMode:'adaptive',gridReference:'pair',gridA:'a',gridB:'',gridSnap:true});
  const window=mount(adaptiveSidebar(p,[])),d=window.document;
  try {
    assert.ok(d.querySelector('.adaptive-grid-notice').textContent.trim());
    assert.equal(d.querySelector('[data-grid-pair]').hidden,false);
    assert.equal(d.querySelector('[data-assistance-settings]').checkValidity(),true,'Une paire incomplète reste enregistrable pendant son choix.');
    assert.equal(d.body.textContent.includes('NaN'),false);
    assert.equal(d.querySelector('.adaptive-grid-readout strong').textContent,'100 mm / carreau');
  } finally {await window.happyDOM.close();}
});

test('grille fixe : taille décimale persistable, limites et champs adaptatifs conservés', async () => {
  const p=project([post('a',0),post('b',1000)],{gridMode:'fixed',gridStep:12.345,gridDivisions:9,gridReference:'pair',gridA:'a',gridB:'b'});
  const window=mount(adaptiveSidebar(p,[])),d=window.document;
  try {
    const form=d.querySelector('[data-assistance-settings]'),input=form.elements.namedItem('gridStep');
    assert.equal(d.querySelector('[data-grid-fixed]').hidden,false);
    assert.equal(d.querySelector('[data-grid-adaptive]').hidden,true);
    assert.equal(input.value,'12.345');assert.equal(input.step,'any');assert.equal(input.min,'0.1');assert.equal(input.max,'10000');
    assert.equal(form.elements.namedItem('gridDivisions').max,'100');
    assert.equal(new window.FormData(form).get('gridDivisions'),'9');
    assert.equal(form.checkValidity(),true);
    assert.ok(d.querySelector('.adaptive-grid-readout').textContent.includes('12,345'));
  } finally {await window.happyDOM.close();}
});

test('mesures impossibles ou chevauchantes : information claire sans distance inventée', async () => {
  const window=mount(adaptiveSidebar(project([post('a',0),post('b',0)]),['a','b'])),d=window.document;
  try {
    assert.ok(d.querySelector('.adaptive-pair-notice').textContent.trim());
    assert.equal(d.querySelector('.adaptive-pair-readout'),null);
    d.body.innerHTML=adaptiveSidebar(project([post('a',0),post('b',50)]),['a','b']);
    assert.match(d.querySelector('.adaptive-pair-readout').textContent,/Chevauchement des faces projetées/);
    assert.equal(d.querySelector('.adaptive-pair-readout dd:last-child').textContent,'50 mm');
    assert.ok([...d.querySelectorAll('.adaptive-pair-readout dd')].some(n=>n.textContent==='40 mm'));
  } finally {await window.happyDOM.close();}
});

test('intégration précision : anciennes commandes intactes, formulaires distincts et noms échappés', async () => {
  const p=project([post('a',0,'<img src=x onerror=alert(1)>'),post('b',1000,'B')]);
  const window=mount(precisionSidebar(p,['a','b'])),d=window.document;
  try {
    assert.ok(d.body.firstElementChild.classList.contains('scene-settings-menu'));
    assert.ok(d.querySelector('.scene-settings-body [data-assistance-settings]'));
    assert.ok(d.querySelector('[data-object-snap="enabled"]'));
    assert.ok(d.querySelector('[data-object-snap="localGrid"]'));
    assert.ok(d.querySelector('[data-object-snap="gridStep"]'));
    assert.equal(d.querySelectorAll('form form').length,0);assert.equal(d.querySelector('img'),null);
    assert.ok(d.querySelector('[data-field="snap"]'));assert.ok(d.querySelector('[data-field="grid"]'));
    assert.deepEqual([...d.querySelectorAll('[data-step]')].map(b=>b.dataset.step),['0.1','1','5','10','50','100']);
    assert.ok(d.querySelector('[data-editor-form="workplane"]'));assert.ok(d.querySelector('[data-editor="plane-view"]'));assert.ok(d.querySelector('[data-editor="plane-drop"]'));
    for (const button of d.querySelectorAll('[data-assist-action]')) {assert.equal(button.type,'button');assert.equal(button.closest('form'),null);}
  } finally {await window.happyDOM.close();}
});
