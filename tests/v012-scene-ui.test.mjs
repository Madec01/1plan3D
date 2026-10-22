import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Window} from 'happy-dom';

// Application, scènes, contrôles et géométries réels. Seul le renderer WebGL
// est substitué en mémoire : aucun fichier applicatif ni bundle n’est modifié.
test('V0.12 : cohérence interface/scène, annulations et conservation des objets Three', async t => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const window = new Window({url:'https://atelier.test'}), document = window.document;
  Object.assign(globalThis, {window, document, localStorage:window.localStorage, ResizeObserver:window.ResizeObserver, FormData:window.FormData});
  document.write((await fs.readFile(new URL('../src/shell.html', import.meta.url), 'utf8')).replace('/*__SCRIPT__*/', ''));
  window.HTMLCanvasElement.prototype.getContext = () => ({beginPath(){},roundRect(){},fill(){},fillText(){},strokeRect(){}});
  window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({left:0,top:0,width:800,height:600});
  const canvas = document.querySelector('#scene');
  Object.defineProperties(canvas, {clientWidth:{value:800},clientHeight:{value:600}});
  Object.defineProperties(canvas.parentElement, {clientWidth:{value:800},clientHeight:{value:600}});
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  window.__sceneTestRenderer = {shadowMap:{},setPixelRatio(){},setSize(){},setAnimationLoop(){},render(){}};
  const bundle = await build({
    absWorkingDir:root,entryPoints:['src/app.js'],bundle:true,write:false,format:'iife',
    plugins:[{name:'renderer-substitute',setup(builder){
      builder.onLoad({filter:/\/viewport\.js$/}, async args => {
        let source = await fs.readFile(args.path, 'utf8');
        assert.ok(source.includes('options=>new THREE.WebGLRenderer(options)'), 'Point de substitution du renderer');
        assert.ok(source.includes('this.canvas=canvas;'), 'Accès de test à la véritable instance Viewport');
        source = source.replace('options=>new THREE.WebGLRenderer(options)', 'options=>window.__sceneTestRenderer')
          .replace('this.canvas=canvas;', 'window.__sceneTestViewport=this;this.canvas=canvas;');
        return {contents:source,loader:'js'};
      });
    }}]
  });
  (0,eval)(bundle.outputFiles[0].text);
  const app = window.Atelier, viewport = window.__sceneTestViewport;
  assert.ok(app && viewport); assert.equal(document.querySelector('.fallback'), null);
  const q = selector => {const element=document.querySelector(selector);assert.ok(element,selector);return element;};
  const click = selector => q(selector).click();
  const change = (selector,value) => {
    const element=q(selector);if(element.type==='checkbox')element.checked=value;else element.value=String(value);
    element.dispatchEvent(new window.Event('change',{bubbles:true}));return element;
  };
  const submit = (selector,values) => {
    const form=q(selector);for(const [name,value]of Object.entries(values))form.elements.namedItem(name).value=String(value);
    assert.ok(form.checkValidity());form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  };
  const pointer = type => canvas.dispatchEvent(new window.PointerEvent(type,{clientX:400,clientY:300,button:0,pointerId:1,pointerType:'mouse',bubbles:true,cancelable:true}));
  const escapeFrom = input => {input.focus();assert.equal(document.activeElement,input);input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));};
  let sceneRebuilds=0;
  const originalSet=viewport.set.bind(viewport);
  viewport.set=(...args)=>{sceneRebuilds++;return originalSet(...args);};
  let partId;
  try {
    await t.test('plan puis nouveau point de départ : retour 3D avec préférence libre conservée', () => {
      click('[data-navigation="free"]');
      click('[data-view="top"]');
      assert.equal(viewport.currentView,'top');assert.equal(viewport.camera.isOrthographicCamera,true);
      assert.equal(q('[data-navigation="free"]').disabled,true);
      assert.equal(localStorage.getItem('atelier.navigation.v1'),'free');
      click('[data-preset="blank"]');click('[data-load-preset="blank"]');
      assert.equal(viewport.currentView,'iso');assert.equal(viewport.navigation,'free');
      assert.equal(q('[data-view="top"]').classList.contains('active'),false);
      assert.equal(q('[data-view="iso"]').classList.contains('active'),true);
      assert.equal(q('[data-navigation="free"]').disabled,false);
      assert.equal(q('[data-navigation="free"]').getAttribute('aria-pressed'),'true');
      assert.equal(localStorage.getItem('atelier.navigation.v1'),'free');
    });

    await t.test('mesure puis outil : annulation synchronisée et redémarrage en un clic', () => {
      click('#measure-toggle');assert.equal(viewport.interaction.type,'measure');
      click('[data-tool="translate"]');
      assert.equal(viewport.interaction,null);assert.equal(q('#measure-toggle').getAttribute('aria-pressed'),'false');
      assert.equal(q('#scene-interaction-status').textContent,'');
      click('#measure-toggle');assert.equal(viewport.interaction.type,'measure');
      click('#cancel-interaction');assert.equal(viewport.interaction,null);assert.equal(q('#measure-toggle').getAttribute('aria-pressed'),'false');
    });

    await t.test('Échap dans un champ annule mesure et pose sans créer de pièce en retard', () => {
      click('#measure-toggle');escapeFrom(q('#editor-search'));
      assert.equal(viewport.interaction,null);assert.equal(q('#measure-toggle').getAttribute('aria-pressed'),'false');
      assert.equal(q('#scene-interaction-status').textContent,'');
      click('[data-add="post"]');const pending=viewport.interaction;
      assert.equal(pending.type,'placement');assert.equal(app.getProject().freeParts.length,0);
      escapeFrom(q('#editor-search'));assert.equal(viewport.interaction,null);
      // Une callback tardive ne doit pas valider une pose annulée dans l’application.
      pending.onPlace(pending.part);assert.equal(app.getProject().freeParts.length,0);
      click('[data-view="top"]');click('[data-add="post"]');pointer('pointerdown');pointer('pointerup');
      assert.equal(app.getProject().freeParts.length,1);partId=app.getSelection()[0];assert.ok(partId);
      assert.equal(app.getProject().freeParts[0].a[1],0);assert.equal(viewport.interaction,null);
      click('#measure-toggle');escapeFrom(q('#editor-search'));
      assert.deepEqual(app.getSelection(),[partId],'Échap dans un champ conserve la sélection');
    });

    await t.test('prix, stock, checklist et leurs annulations gardent les mêmes meshes', () => {
      app.setPage('shopping');const objects=[...viewport.objects],baseline=sceneRebuilds;
      const priceId=q('[data-price]').dataset.price;
      change(`[data-price="${priceId}"]`,7.5);assert.equal(app.getProject().prices[priceId],7.5);
      click('#undo');assert.equal(app.getProject().prices[priceId],undefined);
      click('#redo');assert.equal(app.getProject().prices[priceId],7.5);
      const stockId=q('[data-stock]').dataset.stock;
      change(`[data-stock="${stockId}"]`,1);assert.equal(app.getProject().stock[stockId],1);
      click('#undo');click('#redo');assert.equal(app.getProject().stock[stockId],1);
      const purchasedId=q('[data-purchased]').dataset.purchased;
      change(`[data-purchased="${purchasedId}"]`,true);assert.equal(app.getProject().purchased[purchasedId],true);
      click('#undo');click('#redo');assert.equal(app.getProject().purchased[purchasedId],true);
      assert.equal(sceneRebuilds,baseline);assert.equal(viewport.objects.length,objects.length);
      viewport.objects.forEach((object,index)=>assert.equal(object,objects[index]));
    });

    await t.test('coupes et précision : recalcul des achats sans reconstruction, y compris undo/redo', () => {
      app.setPage('fabrication');const objects=[...viewport.objects],baseline=sceneRebuilds;
      const before=structuredClone(app.getProject().manufacturing.cuts[partId]);
      submit('[data-cut-settings]',{a:'square',b:'square',allowance:12.5});
      assert.equal(app.getProject().manufacturing.cuts[partId].allowance,12.5);
      click('#undo');assert.deepEqual(app.getProject().manufacturing.cuts[partId],before);
      click('#redo');assert.equal(app.getProject().manufacturing.cuts[partId].allowance,12.5);
      change('[data-cut-precision]',.5);assert.equal(app.getProject().manufacturing.precision,.5);
      click('#undo');assert.equal(app.getProject().manufacturing.precision,1);
      click('#redo');assert.equal(app.getProject().manufacturing.precision,.5);
      assert.equal(sceneRebuilds,baseline);viewport.objects.forEach((object,index)=>assert.equal(object,objects[index]));
      assert.deepEqual(app.getSelection(),[partId]);
    });
  } finally {
    viewport.freeNavigation.dispose();viewport.controls.dispose();viewport.transform.dispose();viewport.resizeObserver.disconnect();
    window.removeEventListener('keydown',viewport.modifierHandler);window.removeEventListener('keyup',viewport.modifierHandler);
    await window.happyDOM.close();
  }
});
