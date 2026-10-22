// Installation/offline state is deliberately independent from project data and storage.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const button = (action, text, disabled = false) => `<button type="button" class="btn" data-offline-action="${action}"${disabled ? ' disabled' : ''}>${text}</button>`;
function environment(options = {}) {
  const window = options.window ?? globalThis.window;
  return {window, document: options.document ?? window?.document ?? globalThis.document, navigator: options.navigator ?? window?.navigator ?? globalThis.navigator, location: options.location ?? window?.location ?? globalThis.location};
}
export function getOfflineState(options = {}) {
  const {window, document, navigator, location} = environment(options);
  const protocol = location?.protocol || '';
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location?.hostname);
  const secure = window?.isSecureContext ?? (protocol === 'https:' || (protocol === 'http:' && localHost));
  const marker = document?.querySelector('meta[name="atelier-app-shell"]')?.content || '';
  const [version = '', buildId = ''] = marker.split(':');
  const file = protocol === 'file:';
  const supported = !file && !!secure && /^https?:$/.test(protocol) && !!navigator?.serviceWorker;
  const installed = !!(navigator?.standalone || window?.matchMedia?.('(display-mode: standalone)').matches);
  const ios = /iPad|iPhone|iPod/.test(navigator?.userAgent || '') || (navigator?.platform === 'MacIntel' && navigator?.maxTouchPoints > 1);
  return {mode: file ? 'file' : supported ? 'preparing' : 'unsupported', online: navigator?.onLine !== false, offlineReady: file, supported, installed, ios, installAvailable: false, updateAvailable: false, updatePending: false, updateActivated: false, busy: false, error: '', note: '', version, buildId, cachedVersion: '', cachedBuildId: '', storagePersisted: null, storageUsage: null, storageQuota: null, persistenceAvailable: !file && !!secure && typeof navigator?.storage?.persist === 'function'};
}

const bytes = value => Number.isFinite(value) ? `${new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}).format(value / 1024 / 1024)} Mo` : 'inconnu';
export function renderOfflinePanel(state = {}) {
  const status = state.mode === 'file' ? 'Fichier autonome' : state.offlineReady ? 'Disponible hors connexion' : state.mode === 'preparing' ? 'Préparation du mode hors connexion…' : state.mode === 'unsupported' ? 'Installation non disponible ici' : 'Mode hors connexion non confirmé';
  let detail = state.mode === 'file'
    ? 'Ce fichier HTML fonctionne sans connexion. Pour l’installer sur l’écran d’accueil, ouvrez la version hébergée en HTTPS.'
    : state.mode === 'unsupported'
      ? 'L’installation demande une version HTTPS (ou localhost) et un navigateur compatible. Les aperçus intégrés peuvent la bloquer ; ouvrez le site dans votre navigateur.'
      : state.offlineReady
        ? 'L’application est conservée sur cet appareil. Les projets restent enregistrés dans ce navigateur ; exportez aussi vos sauvegardes.'
        : 'Une première ouverture en ligne doit terminer la préparation. Un accès privé qui redirige les fichiers vers une connexion peut empêcher cette étape.';
  const actions = [];
  if (state.installAvailable && !state.installed) actions.push(button('install', 'Installer l’atelier', state.busy));
  if (state.supported) actions.push(button('check-update', 'Vérifier les mises à jour', state.busy || !state.online));
  if (state.updateAvailable) actions.push(button('apply-update', 'Préparer la mise à jour', state.busy));
  if (state.mode === 'error') actions.push(button('retry', 'Réessayer la préparation', state.busy || !state.online));
  if (state.persistenceAvailable && state.storagePersisted !== true) actions.push(button('persist', 'Demander un stockage durable', state.busy));
  const installation = state.installed ? '<p class="help-text">Ouvert comme application installée.</p>' : state.mode === 'file' ? '' : state.ios
    ? '<p class="help-text">Sur iPhone ou iPad : ouvrez ce site dans Safari, puis Partager → Sur l’écran d’accueil. L’option dépend du navigateur et de ses réglages.</p>'
    : !state.installAvailable ? '<p class="help-text">Si votre navigateur le propose, utilisez son menu « Installer » ou « Ajouter à l’écran d’accueil ». Aucun bouton d’installation n’est disponible dans ce contexte pour le moment.</p>' : '';
  const persisted = state.storagePersisted === true ? 'Stockage durable accordé par le navigateur.' : state.storagePersisted === false ? 'Stockage durable non accordé : le navigateur peut libérer les données en cas de manque de place.' : 'État du stockage durable non disponible.';
  return `<section class="offline-panel content-card" aria-label="Installation et mode hors connexion">
    <div class="offline-status" role="status" aria-live="polite"><strong>${escape(status)}</strong><span class="badge">${state.online ? 'En ligne' : 'Hors ligne'}</span></div>
    <p>${detail}</p>${state.error ? `<p class="notice" role="alert">${escape(state.error)}</p>` : ''}
    ${state.updateAvailable ? '<p class="notice">Une nouvelle version est prête. La préparer conserve le projet ouvert ; elle s’utilisera à la prochaine ouverture de l’application.</p>' : ''}
    ${state.updateActivated ? '<p class="notice">Mise à jour préparée. Le projet reste ouvert ; la nouvelle version sera utilisée à la prochaine ouverture.</p>' : ''}
    ${state.note ? `<p class="help-text" role="status">${escape(state.note)}</p>` : ''}
    <div class="button-row offline-actions">${actions.join('')}</div>${installation}
    <details class="offline-details"><summary>Stockage et version</summary><p class="help-text">${escape(persisted)} Le stockage durable n’est pas une sauvegarde et peut être effacé depuis les réglages du navigateur.</p>
    ${Number.isFinite(state.storageUsage) || Number.isFinite(state.storageQuota) ? `<p class="help-text">Espace utilisé : ${bytes(state.storageUsage)} · quota estimé : ${bytes(state.storageQuota)} (ensemble du site).</p>` : ''}
    <p class="help-text">Version ouverte : ${escape(state.version || 'développement')}${state.cachedVersion ? ` · hors connexion : ${escape(state.cachedVersion)}` : ''}.</p></details>
  </section>`;
}

/** Callbacks receive a state snapshot. No reload or project/storage write is performed.
 * beforeUpdate may asynchronously persist the current project before activating a waiting worker.
 * Optional environment objects and statusTimeout make browser behavior directly testable.
 */
export function setupOfflineUI(options = {}) {
  const {window, document, navigator, location} = environment(options);
  const state = getOfflineState({window, document, navigator, location});
  let registration = null, installPrompt = null, disposed = false, activationRequested = false, starting = false;
  const cleanups = [], pendingChannels = new Set(), watchedWorkers = new WeakSet();
  const container = options.container;
  const getState = () => ({...state});
  const publish = patch => {
    if (disposed) return getState();
    Object.assign(state, patch);
    if (container) container.innerHTML = renderOfflinePanel(state);
    options.onStatus?.(getState());
    return getState();
  };
  const listen = (target, type, listener) => {
    target?.addEventListener?.(type, listener);
    cleanups.push(() => target?.removeEventListener?.(type, listener));
  };
  const errorText = error => error?.message || 'Opération indisponible dans ce navigateur.';
  const reportError = (error, prefix = '') => publish({busy: false, error: `${prefix}${errorText(error)}`});

  function messageWorker(worker, type) {
    return new Promise((resolve, reject) => {
      const Channel = options.MessageChannel ?? window?.MessageChannel ?? globalThis.MessageChannel;
      if (!worker || !Channel) { reject(new Error('Impossible de vérifier le cache hors connexion.')); return; }
      const channel = new Channel();
      let timer;
      const close = () => { clearTimeout(timer); channel.port1.close?.(); channel.port2.close?.(); pendingChannels.delete(cancel); };
      const cancel = () => { close(); reject(new Error('Vérification annulée.')); };
      pendingChannels.add(cancel);
      channel.port1.onmessage = event => { close(); event.data?.type === type ? resolve(event.data) : reject(new Error('Réponse du cache inattendue.')); };
      timer = setTimeout(() => { close(); reject(new Error('Le navigateur n’a pas confirmé la préparation hors connexion.')); }, options.statusTimeout ?? 3000);
      try { worker.postMessage({type}, [channel.port2]); } catch (error) { close(); reject(error); }
    });
  }
  async function readStorage() {
    const storage = navigator?.storage;
    if (!storage || state.mode === 'file') return;
    const [persisted, estimate] = await Promise.allSettled([storage.persisted?.(), storage.estimate?.()]);
    const patch = {};
    if (persisted.status === 'fulfilled' && typeof persisted.value === 'boolean') patch.storagePersisted = persisted.value;
    if (estimate.status === 'fulfilled' && estimate.value) {
      for (const [key, value] of [['storageUsage', estimate.value.usage], ['storageQuota', estimate.value.quota]]) if (Number.isFinite(value) && value >= 0) patch[key] = value;
    }
    publish(patch);
  }
  async function refreshActive(worker = registration?.active || navigator?.serviceWorker?.controller) {
    if (!worker) return;
    try {
      const info = await messageWorker(worker, 'ATELIER_OFFLINE_STATUS');
      publish({offlineReady: !!info.ready, mode: info.ready ? 'ready' : 'error', cachedVersion: info.version || '', cachedBuildId: info.buildId || '', error: info.ready ? '' : 'Le cache local est incomplet. Reconnectez-vous puis réessayez la préparation.'});
    } catch (error) { if (!state.offlineReady) publish({mode: 'error', error: errorText(error)}); }
  }
  function waitingReady() {
    if (!registration?.waiting) return;
    watchWorker(registration.waiting);
    if (state.updatePending) return;
    publish({updateAvailable: true, busy: false});
    options.onUpdateReady?.(getState());
  }
  function watchWorker(worker) {
    if (!worker || watchedWorkers.has(worker)) return;
    watchedWorkers.add(worker);
    listen(worker, 'statechange', () => {
      if (worker.state === 'installed') waitingReady();
      if (worker.state === 'activated') { waitingReady(); refreshActive(worker); }
      if (worker.state === 'redundant') publish({mode: state.offlineReady ? 'ready' : 'error', busy: false, error: 'La préparation a échoué. Le site privé, une redirection de connexion ou le réseau peuvent bloquer les fichiers nécessaires.'});
    });
  }
  async function start() {
    if (disposed || starting) return getState();
    starting = true;
    publish({error: ''});
    void readStorage();
    if (!state.supported) { starting = false; return getState(); }
    try {
      const base = new URL('./', location.href);
      registration = await navigator.serviceWorker.register(new URL('sw.js', base).pathname, {scope: base.pathname, updateViaCache: 'none'});
      if (disposed) return getState();
      listen(registration, 'updatefound', () => watchWorker(registration.installing));
      watchWorker(registration.installing);
      waitingReady();
      if (registration.active) await refreshActive();
      else if (!registration.installing && !registration.waiting) publish({mode: 'error', error: 'Le navigateur n’a pas confirmé la préparation hors connexion.'});
    } catch (error) {
      publish({mode: state.offlineReady ? 'ready' : 'error', busy: false, error: `Préparation impossible. Vérifiez l’accès HTTPS aux fichiers de l’application et les restrictions du navigateur. ${errorText(error)}`});
    } finally { starting = false; }
    return getState();
  }
  async function install() {
    if (!installPrompt || state.installed || disposed) return false;
    const prompt = installPrompt;
    installPrompt = null;
    publish({busy: true, installAvailable: false, error: '', note: ''});
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      publish({busy: false, note: choice?.outcome === 'accepted' ? 'Demande d’installation acceptée. Le navigateur termine l’installation.' : 'Installation reportée.'});
      return choice?.outcome === 'accepted';
    } catch (error) { reportError(error); return false; }
  }
  async function checkForUpdate() {
    if (disposed || !state.supported || !state.online) return false;
    if (!registration) { await start(); return !!registration; }
    publish({busy: true, error: '', note: ''});
    try {
      await registration.update();
      watchWorker(registration.installing);
      waitingReady();
      publish({busy: false, note: registration.installing ? 'Recherche terminée, préparation de la nouvelle version en cours.' : registration.waiting ? '' : 'Aucune mise à jour en attente.'});
      await refreshActive();
      return true;
    } catch (error) { reportError(error, 'Vérification impossible. '); return false; }
  }
  async function applyUpdate() {
    if (disposed || !registration?.waiting || state.busy || state.updatePending) return false;
    publish({busy: true, error: '', note: ''});
    try {
      await options.beforeUpdate?.();
      if (disposed) return false;
      const waiting = registration.waiting;
      if (!waiting) { publish({busy: false, updateAvailable: false}); return false; }
      activationRequested = true;
      waiting.postMessage({type: 'ATELIER_APPLY_UPDATE'});
      publish({busy: false, updateAvailable: false, updatePending: true, note: 'Activation de la mise à jour demandée. Le projet reste ouvert.'});
      return true;
    } catch (error) { activationRequested = false; reportError(error, 'Mise à jour reportée. '); return false; }
  }
  async function requestPersistence() {
    if (disposed || !state.persistenceAvailable || state.busy) return false;
    publish({busy: true, error: '', note: ''});
    try {
      const granted = !!await navigator.storage.persist();
      publish({busy: false, storagePersisted: granted, note: granted ? 'Stockage durable accordé sur cet appareil.' : 'Le navigateur n’a pas accordé le stockage durable. Vous pouvez toujours exporter vos projets.'});
      await readStorage();
      return granted;
    } catch (error) { reportError(error, 'Stockage durable indisponible. '); return false; }
  }
  async function retry() {
    if (!state.supported || disposed || !state.online) return false;
    publish({mode: state.offlineReady ? 'ready' : 'preparing', error: '', note: ''});
    if (!registration) { await start(); return state.offlineReady; }
    await checkForUpdate();
    if (!state.offlineReady && registration.active && !registration.installing && !registration.waiting) {
      try {
        const info = await messageWorker(registration.active, 'ATELIER_PREPARE_OFFLINE');
        if (!info.ready) throw new Error(info.error || 'Préparation incomplète.');
        await refreshActive();
      } catch (error) { publish({mode: 'error', error: errorText(error)}); }
    }
    return state.offlineReady;
  }
  listen(window, 'online', () => { publish({online: true}); void readStorage(); });
  listen(window, 'offline', () => publish({online: false}));
  listen(window, 'beforeinstallprompt', event => {
    if (!state.supported || state.installed || state.ios) return;
    event.preventDefault(); installPrompt = event;
    publish({installAvailable: true});
  });
  listen(window, 'appinstalled', () => { installPrompt = null; publish({installed: true, installAvailable: false, note: 'L’atelier est installé sur cet appareil.'}); });
  listen(navigator?.serviceWorker, 'controllerchange', () => {
    if (activationRequested) { activationRequested = false; publish({busy: false, updateAvailable: false, updatePending: false, updateActivated: true, note: ''}); }
    void refreshActive(navigator?.serviceWorker?.controller);
  });
  const actions = {install, 'check-update': checkForUpdate, 'apply-update': applyUpdate, persist: requestPersistence, retry};
  if (container) listen(container, 'click', event => {
    const target = event.target.closest?.('[data-offline-action]');
    if (target && !target.disabled) void actions[target.dataset.offlineAction]?.();
  });
  const ready = Promise.resolve().then(start);
  return {getState, renderPanel: () => renderOfflinePanel(state), install, checkForUpdate, applyUpdate, requestPersistence, retry, ready,
    dispose() { disposed = true; cleanups.splice(0).forEach(cleanup => cleanup()); for (const cancel of [...pendingChannels]) cancel(); installPrompt = null; }
  };
}
