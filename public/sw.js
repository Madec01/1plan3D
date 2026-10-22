/* Atelier sur mesure. Build replaces both tokens; no user projects enter this cache. */
const VERSION = '__ATELIER_VERSION__';
const BUILD_ID = '__ATELIER_BUILD_ID__';
const PREFIX = 'atelier-app-shell-';
const CACHE_NAME = `${PREFIX}${VERSION}-${BUILD_ID}`;
const SHELL = '/index.html';
const ASSETS = [SHELL, '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
const SENTINEL = `<meta name="atelier-app-shell" content="${VERSION}:${BUILD_ID}">`;
const absolute = path => new URL(path, self.location.origin).href;

async function checkedResponse(response, path) {
  if (!response || response.status !== 200 || response.redirected || response.type === 'opaque' || response.type === 'opaqueredirect') throw new Error('Réponse indisponible ou redirigée.');
  if (response.url && response.url !== absolute(path)) throw new Error('Adresse inattendue.');
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (path === SHELL) {
    if (!type.includes('text/html') || !(await response.clone().text()).includes(SENTINEL)) throw new Error('Cette page n’est pas la version attendue de l’atelier.');
  } else if (path.endsWith('.png')) {
    if (!type.startsWith('image/png')) throw new Error('Icône indisponible.');
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) throw new Error('Icône invalide.');
  } else {
    if (!type.includes('application/manifest+json') && !type.includes('application/json')) throw new Error('Manifest indisponible.');
    const manifest = await response.clone().json();
    if (manifest.id !== '/' || manifest.start_url !== SHELL || !Array.isArray(manifest.icons)) throw new Error('Manifest inattendu.');
  }
  return response;
}

async function cachedShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(absolute(SHELL));
  try { return await checkedResponse(response, SHELL); } catch { return null; }
}

async function cacheReady() {
  const cache = await caches.open(CACHE_NAME);
  try {
    await Promise.all(ASSETS.map(async path => checkedResponse(await cache.match(absolute(path)), path)));
    return true;
  } catch { return false; }
}

async function prepareCache() {
  const existed = (await caches.keys()).includes(CACHE_NAME);
  try {
    // Never precache the current route: it may be a login, callback, or preview URL.
    const responses = await Promise.all(ASSETS.map(async path => checkedResponse(await fetch(absolute(path), {cache: 'reload', credentials: 'same-origin', redirect: 'error'}), path)));
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS.map((path, i) => cache.put(absolute(path), responses[i])));
  } catch (error) {
    if (!existed) await caches.delete(CACHE_NAME);
    throw error;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(prepareCache());
  // An updated worker waits for an explicit user action; no skipWaiting here.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!await cacheReady()) throw new Error('Application hors connexion incomplète.');
    await Promise.all((await caches.keys()).filter(name => name.startsWith(PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Strict allowlist: no API, auth, callback, query-string or cross-origin response is cached.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;
  const navigation = request.mode === 'navigate' && (url.pathname === '/' || url.pathname === SHELL);
  const asset = ASSETS.includes(url.pathname) && url.pathname !== SHELL;
  if (!navigation && !asset) return;
  if (navigation) {
    event.respondWith((async () => {
      try {
        // Network authentication/error responses are returned as-is, never replaced or cached.
        // Cache upgrades only happen during installation of a matching new worker.
        return await fetch(request);
      } catch {
        return await cachedShell() || new Response('Atelier indisponible hors connexion. Ouvrez d’abord l’application en ligne.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
      }
    })());
  } else {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(absolute(url.pathname)) || fetch(request);
    })());
  }
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ATELIER_OFFLINE_STATUS') {
    event.waitUntil((async () => {
      const ready = await cacheReady();
      event.ports?.[0]?.postMessage({type: 'ATELIER_OFFLINE_STATUS', version: VERSION, buildId: BUILD_ID, ready});
    })());
  } else if (event.data?.type === 'ATELIER_PREPARE_OFFLINE') {
    event.waitUntil((async () => {
      try {
        await prepareCache();
        event.ports?.[0]?.postMessage({type: 'ATELIER_PREPARE_OFFLINE', ready: true});
      } catch (error) {
        event.ports?.[0]?.postMessage({type: 'ATELIER_PREPARE_OFFLINE', ready: false, error: error.message});
      }
    })());
  } else if (event.data?.type === 'ATELIER_APPLY_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
});
