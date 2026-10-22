import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Window} from 'happy-dom';
import {getOfflineState, renderOfflinePanel, setupOfflineUI} from '../src/offline-ui.js';

const workerSource = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8');
const icon192 = await readFile(new URL('../public/icon-192.png', import.meta.url));
const icon512 = await readFile(new URL('../public/icon-512.png', import.meta.url));
const origin = 'https://atelier.test';
const cacheName = (id, base = '/') => `atelier-app-shell-${encodeURIComponent(base)}-0.18.0-${id}`;
const shell = id => `<!DOCTYPE html><html><head><meta name="atelier-app-shell" content="0.18.0:${id}"></head><body>Atelier ${id}</body></html>`;
function memoryCaches() {
  const stores = new Map();
  return {stores, async keys() { return [...stores.keys()]; }, async delete(key) { return stores.delete(key); }, async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {async match(key) { return store.get(String(key))?.clone(); }, async put(key, value) { store.set(String(key), value.clone()); }, async delete(key) { return store.delete(String(key)); }};
  }};
}
function workerEnv({id = 'one', base = '/', caches = memoryCaches(), network} = {}) {
  const events = new Map(), fetched = [];
  let skipped = 0, claimed = 0;
  const responseFor = path => path === `${base}index.html` || path === base ? new Response(shell(id), {headers: {'Content-Type':'text/html; charset=utf-8'}})
    : path === `${base}manifest.webmanifest` ? new Response(manifest, {headers: {'Content-Type':'application/manifest+json'}})
    : path === `${base}icon-192.png` || path === `${base}icon-512.png` ? new Response(path === `${base}icon-192.png` ? icon192 : icon512, {headers: {'Content-Type':'image/png'}})
    : new Response('Not found', {status:404});
  let handler = network || ((input) => responseFor(new URL(typeof input === 'string' ? input : input.url).pathname));
  const fetch = async (input, options) => { fetched.push({input, options}); return handler(input, options); };
  const self = {location: {origin, href:`${origin}${base}sw.js`}, clients: {async claim() { claimed++; }}, async skipWaiting() { skipped++; }, addEventListener(type, fn) { events.set(type, fn); }};
  vm.runInNewContext(workerSource.replaceAll('__ATELIER_VERSION__','0.18.0').replaceAll('__ATELIER_BUILD_ID__',id), {self, caches, fetch, URL, Response, Uint8Array, Promise, Error});
  async function lifecycle(type, extra = {}) {
    const waits = []; events.get(type)?.({waitUntil: promise => waits.push(promise), ...extra}); await Promise.all(waits);
  }
  return {caches, fetched, responseFor, get skipped() { return skipped; }, get claimed() { return claimed; }, network(fn) { handler = fn; }, install: () => lifecycle('install'), activate: () => lifecycle('activate'),
    async request(path, {mode = 'navigate', method = 'GET', otherOrigin = origin} = {}) {
      let response;
      events.get('fetch')({request: {url: `${otherOrigin}${path}`, mode, method}, respondWith: value => { response = value; }});
      return response === undefined ? undefined : await response;
    }, async message(type) { let response; await lifecycle('message', {data: {type}, ports: [{postMessage: value => { response = value; }}]}); return response; }
  };
}

test('PWA : pré-cache strict, versionné, complet ; activation initiale sans mise à jour forcée', async () => {
  const env = workerEnv(); await env.install();
  assert.equal(env.skipped, 0);
  assert.deepEqual(env.fetched.map(call => new URL(call.input).pathname).sort(), ['/icon-192.png','/icon-512.png','/index.html','/manifest.webmanifest']);
  assert.ok(env.fetched.every(call => call.options.redirect === 'error' && call.options.cache === 'reload'));
  assert.equal((await env.message('ATELIER_OFFLINE_STATUS')).ready, true);
  await env.activate(); assert.equal(env.claimed, 1);
  assert.deepEqual(await env.caches.keys(), [cacheName('one')]);
  const cache = await env.caches.open(cacheName('one'));
  await cache.delete(`${origin}/icon-192.png`);
  assert.equal((await env.message('ATELIER_OFFLINE_STATUS')).ready, false, 'une icône évincée ne permet pas de déclarer le cache complet');
  assert.equal((await env.message('ATELIER_PREPARE_OFFLINE')).ready, true);
  assert.equal((await env.message('ATELIER_OFFLINE_STATUS')).ready, true);
});

test('PWA : login 200, redirection, erreur et mauvaise version sont refusés sans effacer le cache précédent', async () => {
  const previous = workerEnv(); await previous.install();
  for (const invalid of [
    () => new Response('<html>Connexion</html>', {headers: {'Content-Type':'text/html'}}),
    () => { const response = new Response(shell('two'), {headers: {'Content-Type':'text/html'}}); Object.defineProperty(response,'redirected',{value:true}); return response; },
    () => new Response(shell('two'), {status:503, headers: {'Content-Type':'text/html'}}),
    () => new Response(shell('one'), {headers: {'Content-Type':'text/html'}}),
    () => { const response = new Response(shell('two'), {headers: {'Content-Type':'text/html'}}); Object.defineProperty(response,'url',{value:`${origin}/login`}); return response; }
  ]) {
    const next = workerEnv({id:'two', caches:previous.caches});
    next.network(input => new URL(input).pathname === '/index.html' ? invalid() : next.responseFor(new URL(input).pathname));
    await assert.rejects(next.install());
    assert.deepEqual(await previous.caches.keys(), [cacheName('one')]);
    assert.equal(next.skipped, 0);
  }
});

test('PWA : icônes/manifest de connexion et échec réseau refusent une installation incomplète', async () => {
  for (const path of ['/manifest.webmanifest','/icon-192.png']) {
    const env = workerEnv(); env.network(input => new URL(input).pathname === path ? new Response('<html>Connexion</html>', {headers: {'Content-Type':path.endsWith('.png')?'image/png':'text/html'}}) : env.responseFor(new URL(input).pathname));
    await assert.rejects(env.install()); assert.deepEqual(await env.caches.keys(), []);
  }
  const env = workerEnv({network: () => { throw new TypeError('offline'); }});
  await assert.rejects(env.install()); assert.deepEqual(await env.caches.keys(), []);
});

test('PWA : hors connexion sur la seule route application ; aucune interception auth/API/query/POST', async () => {
  const env = workerEnv(); await env.install(); env.fetched.length = 0;
  env.network(() => { throw new TypeError('offline'); });
  assert.match(await (await env.request('/')).text(), /Atelier one/);
  assert.match(await (await env.request('/index.html')).text(), /Atelier one/);
  assert.equal((await env.request('/icon-192.png', {mode:'no-cors'})).headers.get('content-type'), 'image/png');
  for (const path of ['/api/projects','/auth/login','/login','/callback','/?token=secret','/index.html?code=secret','/sw.js']) assert.equal(await env.request(path), undefined, path);
  assert.equal(await env.request('/index.html', {method:'POST'}), undefined);
  assert.equal(await env.request('/index.html', {otherOrigin:'https://other.test'}), undefined);
  assert.equal(await env.request('/index.html', {mode:'cors'}), undefined, 'le HTML n’est servi que pour une navigation');
  const empty = workerEnv({network: () => { throw new TypeError('offline'); }});
  assert.equal((await empty.request('/')).status, 503);
});

test('PWA : en ligne, refus/auth et nouvelle page ne remplacent pas le shell hors connexion', async () => {
  const env = workerEnv(); await env.install();
  for (const status of [401,403,503]) {
    env.network(() => new Response('Accès indisponible', {status}));
    assert.equal((await env.request('/')).status,status);
  }
  env.network(() => new Response('<html>Connexion privée</html>', {headers:{'Content-Type':'text/html'}}));
  assert.match(await (await env.request('/')).text(), /Connexion privée/);
  env.network(() => new Response(shell('two'), {headers:{'Content-Type':'text/html'}}));
  assert.match(await (await env.request('/')).text(), /Atelier two/);
  env.network(() => { throw new TypeError('offline'); });
  assert.match(await (await env.request('/')).text(), /Atelier one/, 'une navigation ne remplace jamais le cache installé');
});

test('PWA : nouvelle version attend une action ; activation nettoie seulement les anciens caches de l’atelier', async () => {
  const first = workerEnv(); await first.install(); await first.caches.open('autre-application');
  const next = workerEnv({id:'two', caches:first.caches}); await next.install();
  assert.equal(next.skipped,0);
  assert.ok((await next.caches.keys()).includes(cacheName('one')));
  await next.message('ATELIER_APPLY_UPDATE'); assert.equal(next.skipped,1);
  await next.activate();
  assert.deepEqual((await next.caches.keys()).sort(), ['autre-application',cacheName('two')].sort());
});

test('PWA GitHub Pages : fichiers et navigation hors connexion limités au sous-dossier', async () => {
  const base = '/1plan3D/', env = workerEnv({base});
  await env.install(); await env.activate();
  assert.deepEqual(env.fetched.map(call => new URL(call.input).pathname).sort(), ['icon-192.png','icon-512.png','index.html','manifest.webmanifest'].map(file => base + file));
  assert.equal((await env.message('ATELIER_OFFLINE_STATUS')).ready, true);
  env.network(() => { throw new TypeError('offline'); });
  for (const path of [base, `${base}index.html`]) assert.match(await (await env.request(path)).text(), /Atelier one/);
  assert.equal((await env.request(`${base}icon-192.png`, {mode:'no-cors'})).headers.get('content-type'), 'image/png');
  for (const path of ['/','/index.html','/icon-192.png','/other/index.html',`${base}login`,`${base}?token=secret`]) assert.equal(await env.request(path), undefined, path);
});

test('PWA GitHub Pages : une mise à jour ne supprime pas le cache d’un autre déploiement', async () => {
  const root = workerEnv(), pages = workerEnv({base:'/1plan3D/',caches:root.caches});
  await root.install(); await pages.install();
  const next = workerEnv({id:'two',base:'/1plan3D/',caches:root.caches});
  await next.install(); await next.activate();
  assert.equal((await root.message('ATELIER_OFFLINE_STATUS')).ready, true);
  assert.equal((await next.message('ATELIER_OFFLINE_STATUS')).ready, true);
  assert.deepEqual((await root.caches.keys()).sort(), [cacheName('one'),cacheName('two','/1plan3D/')].sort());
  const nextRoot = workerEnv({id:'two',caches:root.caches});
  await nextRoot.install(); await nextRoot.activate();
  assert.equal((await next.message('ATELIER_OFFLINE_STATUS')).ready, true);
});

test('PWA GitHub Pages : un manifeste d’un autre chemin est refusé', async () => {
  const env = workerEnv({base:'/1plan3D/'});
  env.network(input => new URL(input).pathname.endsWith('/manifest.webmanifest')
    ? new Response(JSON.stringify({...JSON.parse(manifest), start_url:'/index.html'}), {headers:{'Content-Type':'application/manifest+json'}})
    : env.responseFor(new URL(input).pathname));
  await assert.rejects(env.install(), /Manifest inattendu/);
  assert.deepEqual(await env.caches.keys(), []);
});

function browserEnv({url = `${origin}/`, ios = false, secure = true, supported = true, cached = true, failed = false, waiting = false, persistGranted = true, beforeUpdate} = {}) {
  const window = new Window({url});
  Object.defineProperty(window,'isSecureContext',{configurable:true,value:secure});
  window.document.head.innerHTML = '<meta name="atelier-app-shell" content="0.18.0:two">';
  const panel = window.document.createElement('div'); window.document.body.append(panel);
  const events = () => new window.EventTarget();
  const messages = [], registrations = [], storageCalls = [], states = [];
  let persisted = false, updates = 0, reloads = 0;
  window.location.reload = () => { reloads++; };
  class Channel {
    constructor() {
      this.port1 = {onmessage:null, close(){}};
      this.port2 = {postMessage: data => queueMicrotask(() => this.port1.onmessage?.({data})), close(){}};
    }
  }
  function worker(version = '0.18.0', buildId = 'one') {
    const value = events(); value.state = 'activated';
    value.postMessage = (data, ports) => {
      messages.push(data);
      if (data.type === 'ATELIER_OFFLINE_STATUS') ports[0].postMessage({type:data.type,version,buildId,ready:cached});
      if (data.type === 'ATELIER_PREPARE_OFFLINE') { cached = true; ports[0].postMessage({type:data.type,ready:true}); }
    };
    return value;
  }
  const registration = events();
  Object.assign(registration,{active:worker(),waiting:waiting ? worker('0.18.0','two') : null,installing:null,update:async()=>{updates++;}});
  const serviceWorker = events();
  Object.assign(serviceWorker,{controller:registration.active,register:async (...args) => {registrations.push(args);if(failed)throw new Error('login redirect');return registration;}});
  const navigator = {onLine:true,userAgent:ios?'Mozilla iPhone':'Chrome',platform:ios?'iPhone':'Linux',maxTouchPoints:ios?5:0,...(supported?{serviceWorker}:{}),storage:{
    persisted:async()=>persisted,estimate:async()=>({usage:1048576,quota:52428800}),persist:async()=>{storageCalls.push('persist');persisted=persistGranted;return persisted;}
  }};
  const ui = setupOfflineUI({window,document:window.document,navigator,location:window.location,container:panel,MessageChannel:Channel,statusTimeout:50,onStatus:state=>states.push(state),beforeUpdate});
  return {window,panel,navigator,serviceWorker,registration,ui,states,messages,registrations,storageCalls,get updates(){return updates},get reloads(){return reloads},async close(){ui.dispose();await window.happyDOM.close();}};
}
const flush = () => new Promise(resolve=>setTimeout(resolve,0));

test('UI hors connexion : fichier autonome sans service worker et navigateur non compatible explicités', async () => {
  const file = browserEnv({url:'file:///tmp/atelier.html'}); await file.ui.ready;
  assert.equal(file.ui.getState().mode,'file'); assert.equal(file.ui.getState().offlineReady,true); assert.equal(file.registrations.length,0);
  assert.match(file.panel.textContent,/fichier HTML fonctionne sans connexion/);
  assert.equal(file.panel.querySelector('[data-offline-action="install"]'),null);
  await file.close();
  for (const options of [{secure:false},{supported:false}]) {
    const env = browserEnv(options); await env.ui.ready;
    assert.equal(env.ui.getState().mode,'unsupported'); assert.equal(env.registrations.length,0); assert.equal(env.ui.getState().offlineReady,false);
    await env.close();
  }
});

test('UI hors connexion : confirmation réelle du cache, réseau, estimation de stockage et rejet d’hébergement privé', async () => {
  const env = browserEnv(); await env.ui.ready;
  assert.equal(env.ui.getState().mode,'ready'); assert.equal(env.ui.getState().offlineReady,true);
  assert.deepEqual(env.registrations,[['/sw.js',{scope:'/',updateViaCache:'none'}]]);
  assert.equal(env.ui.getState().storageUsage,1048576); assert.equal(env.ui.getState().storageQuota,52428800);
  assert.equal(env.storageCalls.length,0, 'la persistance est demandée uniquement par action explicite');
  env.window.dispatchEvent(new env.window.Event('offline')); assert.equal(env.ui.getState().online,false); assert.match(env.panel.textContent,/Hors ligne/);
  assert.equal(await env.ui.checkForUpdate(),false);
  env.window.dispatchEvent(new env.window.Event('online')); assert.equal(env.ui.getState().online,true);
  await env.ui.checkForUpdate(); assert.equal(env.updates,1);
  await env.close();
  const blocked = browserEnv({failed:true}); await blocked.ui.ready;
  assert.equal(blocked.ui.getState().mode,'error'); assert.equal(blocked.ui.getState().offlineReady,false);
  assert.match(blocked.panel.textContent,/Préparation impossible/); assert.ok(blocked.panel.querySelector('[data-offline-action="retry"]'));
  await blocked.close();
});

test('UI installation : bouton seulement avec prompt réel, report et installation confirmée', async () => {
  const env = browserEnv(); await env.ui.ready;
  assert.equal(env.panel.querySelector('[data-offline-action="install"]'),null);
  let prompts = 0;
  const event = new env.window.Event('beforeinstallprompt',{cancelable:true});
  Object.assign(event,{prompt:async()=>{prompts++;},userChoice:Promise.resolve({outcome:'accepted'})});
  env.window.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true); assert.ok(env.panel.querySelector('[data-offline-action="install"]'));
  env.panel.querySelector('[data-offline-action="install"]').click(); await flush();
  assert.equal(prompts,1); assert.equal(env.ui.getState().installed,false,'le choix accepté ne prouve pas encore une installation terminée');
  env.window.dispatchEvent(new env.window.Event('appinstalled'));
  assert.equal(env.ui.getState().installed,true); assert.equal(env.panel.querySelector('[data-offline-action="install"]'),null);
  await env.close();
  const ios = browserEnv({ios:true}); await ios.ui.ready;
  assert.match(ios.panel.textContent,/Safari, puis Partager → Sur l’écran d’accueil/); assert.equal(ios.panel.querySelector('[data-offline-action="install"]'),null);
  await ios.close();
});

test('UI GitHub Pages : inscription du worker dans le dossier de l’application', async () => {
  for (const path of ['/1plan3D/', '/1plan3D/index.html', '/1plan3D/index.html?mode=demo#atelier']) {
    const env = browserEnv({url:origin+path}); await env.ui.ready;
    assert.deepEqual(env.registrations,[['/1plan3D/sw.js',{scope:'/1plan3D/',updateViaCache:'none'}]]);
    assert.equal(env.ui.getState().offlineReady,true);
    await env.close();
  }
});

test('UI mise à jour : attente de la sauvegarde, activation confirmée, aucun rechargement ni modification de projet', async () => {
  let allowSave;
  const env = browserEnv({waiting:true,beforeUpdate:()=>new Promise(resolve=>{allowSave=resolve;})});
  env.window.localStorage.setItem('atelier.project.v4','projet en cours');
  await env.ui.ready; assert.equal(env.ui.getState().updateAvailable,true);
  const applying = env.ui.applyUpdate();
  assert.equal(env.messages.filter(message=>message.type==='ATELIER_APPLY_UPDATE').length,0);
  allowSave(); assert.equal(await applying,true);
  assert.equal(env.ui.getState().updatePending,true); assert.equal(env.ui.getState().updateActivated,false);
  env.serviceWorker.controller = env.registration.waiting; env.registration.active = env.registration.waiting; env.registration.waiting = null;
  env.serviceWorker.dispatchEvent(new env.window.Event('controllerchange')); await flush();
  assert.equal(env.ui.getState().updateActivated,true); assert.equal(env.ui.getState().cachedBuildId,'two');
  assert.equal(env.reloads,0); assert.equal(env.window.localStorage.getItem('atelier.project.v4'),'projet en cours');
  assert.match(env.panel.textContent,/prochaine ouverture/);
  await env.close();
});

test('UI mise à jour : échec de sauvegarde bloque l’activation et permet une nouvelle tentative', async () => {
  const env = browserEnv({waiting:true,beforeUpdate:async()=>{throw new Error('Sauvegarde impossible');}}); await env.ui.ready;
  assert.equal(await env.ui.applyUpdate(),false);
  assert.equal(env.messages.filter(message=>message.type==='ATELIER_APPLY_UPDATE').length,0);
  assert.equal(env.ui.getState().updateAvailable,true); assert.match(env.panel.textContent,/Mise à jour reportée/);
  await env.close();
});

test('UI stockage durable : demande explicite, refus honnête, récupération du cache évincé', async () => {
  for (const grant of [true,false]) {
    const env = browserEnv({persistGranted:grant,cached:false}); await env.ui.ready;
    assert.equal(env.ui.getState().offlineReady,false);
    assert.equal(await env.ui.requestPersistence(),grant); assert.equal(env.ui.getState().storagePersisted,grant);
    assert.deepEqual(env.storageCalls,['persist']);
    assert.match(env.panel.textContent,grant ? /Stockage durable accordé/ : /n’a pas accordé/);
    assert.equal(await env.ui.retry(),true); assert.equal(env.ui.getState().offlineReady,true);
    const last = env.states.length; env.ui.dispose(); env.window.dispatchEvent(new env.window.Event('offline')); assert.equal(env.states.length,last);
    await env.close();
  }
});

test('PWA : manifest et icônes installables, texte d’état échappé', () => {
  const json = JSON.parse(manifest);
  assert.equal(json.start_url,'./index.html'); assert.equal(json.scope,'./'); assert.equal(json.id,'./'); assert.equal(json.display,'standalone');
  for (const base of ['/', '/1plan3D/']) {
    const manifestURL = `${origin}${base}manifest.webmanifest`;
    assert.equal(new URL(json.start_url,manifestURL).pathname,`${base}index.html`);
    for (const icon of json.icons) assert.ok(new URL(icon.src,manifestURL).pathname.startsWith(base));
  }
  assert.deepEqual(json.icons.map(icon=>icon.sizes),['192x192','512x512']);
  for (const [data,size] of [[icon192,192],[icon512,512]]) {
    assert.equal(data.readUInt32BE(16),size); assert.equal(data.readUInt32BE(20),size);
    assert.deepEqual([...data.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  }
  const html = renderOfflinePanel({...getOfflineState({window:{},navigator:{},location:{protocol:'file:'}}),error:'<img src=x onerror=alert(1)>',version:'<script>x</script>'});
  assert.ok(!html.includes('<img')); assert.ok(!html.includes('<script>')); assert.match(html,/&lt;img/);
});
