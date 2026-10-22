/** Local, bounded project library. This module never writes the working-project
 * keys (atelier.project.v4 / atelier.project.before-import). A mutation is one
 * localStorage.setItem: failed validation or quota errors leave stored data intact.
 */
export const PROJECT_LIBRARY_KEY = 'atelier.projects.v1';
export const PROJECT_LIBRARY_FORMAT = 'atelier-project-library';

export class ProjectLibraryError extends Error {
  constructor(code, message) { super(message); this.name = 'ProjectLibraryError'; this.code = code; }
}
const fail = (code, message) => { throw new ProjectLibraryError(code, message); };
const copy = value => JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const empty = () => ({ schemaVersion: 1, activeId: null, projects: [] });
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const bytes = value => JSON.stringify(value).length * 2; // Conservative UTF-16 storage budget.
const cleanName = (value, fallback = 'Sans titre') => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) || fallback : fallback;
const validDate = value => typeof value === 'string' && value.length <= 30 && Number.isFinite(Date.parse(value));

function checkJSON(value, code = 'INVALID_PROJECT') {
  let nodes = 0;
  const seen = new Set();
  function visit(item, depth) {
    if (++nodes > 100000 || depth > 35) fail(code, 'Les données dépassent les limites de complexité autorisées.');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail(code, 'Une valeur numérique est invalide.'); return; }
    if (typeof item === 'string') { if (item.length > 250000) fail(code, 'Un texte est trop long.'); return; }
    if (typeof item !== 'object') fail(code, 'Le projet doit contenir uniquement des données JSON.');
    if (seen.has(item)) fail(code, 'Les données contiennent une référence circulaire.');
    seen.add(item);
    if (Array.isArray(item)) {
      if (item.length > 20000) fail(code, 'Une liste est trop volumineuse.');
      for (let i = 0; i < item.length; i++) { if (!own(item, i)) fail(code, 'Une liste contient une entrée manquante.'); visit(item[i], depth + 1); }
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail(code, 'Le projet doit contenir uniquement des objets JSON simples.');
      for (const key of Object.keys(item)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) fail(code, 'Une clé de données non autorisée a été détectée.');
        visit(item[key], depth + 1);
      }
    }
    seen.delete(item);
  }
  visit(value, 0);
}

/** No engine dependency: callers pass a normalized Atelier project. Import also
 * checks its envelope before callers normalize it for the editor. */
function checkedProject(value, maxProjectBytes, code = 'INVALID_PROJECT') {
  checkJSON(value, code);
  if (!value || Array.isArray(value) || ![1, 4, 5].includes(value.version)
      || typeof value.width !== 'number' || value.width <= 0
      || typeof value.depth !== 'number' || value.depth <= 0
      || typeof value.name !== 'string') fail(code, 'Ce fichier ne contient pas un projet Atelier reconnu (V1, V4 ou V5).');
  if (value.version >= 4 && value.mode !== undefined && !['parametric', 'free'].includes(value.mode)) fail(code, 'Le mode de construction du projet est invalide.');
  for (const field of ['freeParts', 'freeJoints', 'walls', 'attachments']) {
    if (value[field] !== undefined && !Array.isArray(value[field])) fail(code, `La liste « ${field} » est invalide.`);
  }
  const elementIds = new Set();
  const elementId = id => typeof id === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
  const vector = point => Array.isArray(point) && point.length === 3 && point.every(n => typeof n === 'number' && Number.isFinite(n));
  if ((value.freeParts?.length || 0) > 1000 || (value.freeJoints?.length || 0) > 5000 || (value.attachments?.length || 0) > 1000) fail(code, 'Le projet dépasse la limite de pièces, de liaisons ou d’attaches de cette version.');
  for (const part of value.freeParts || []) {
    if (!part || !elementId(part.id) || elementIds.has(part.id)
        || !['post', 'beam', 'brace', 'panel', 'wall'].includes(part.kind)
        || !vector(part.a) || !vector(part.b)
        || typeof part.width !== 'number' || part.width <= 0
        || typeof part.height !== 'number' || part.height <= 0
        || (part.corners !== undefined && (!Array.isArray(part.corners) || part.corners.length !== 4 || !part.corners.every(vector)))) fail(code, 'Une pièce libre est invalide ou son identifiant est dupliqué.');
    elementIds.add(part.id);
  }
  for (const joint of value.freeJoints || []) {
    if (!joint || !elementId(joint.id) || elementIds.has(joint.id) || !elementId(joint.aPart) || !elementId(joint.bPart)) fail(code, 'Une liaison est invalide ou son identifiant est dupliqué.');
    elementIds.add(joint.id);
  }
  // Keep the library independent from the geometry engine. Validate the saved
  // envelope without changing offsets or discarding a relation on import.
  const attachmentIds = new Set();
  for (const attachment of value.attachments || []) {
    if (!attachment || !elementId(attachment.id) || attachmentIds.has(attachment.id)
        || !elementId(attachment.sourceId) || !['fixed', 'beam', 'panel'].includes(attachment.type)
        || !Array.isArray(attachment.anchors) || attachment.anchors.length !== ({ fixed: 1, beam: 2, panel: 4 })[attachment.type]
        || attachment.anchors.some(anchor => !anchor || !elementId(anchor.targetId) || !vector(anchor.local))) fail(code, 'Une attache géométrique est invalide ou son identifiant est dupliqué.');
    attachmentIds.add(attachment.id);
  }
  if (bytes(value) > maxProjectBytes) fail('LIMIT_BYTES', 'Ce projet est trop volumineux pour la bibliothèque locale. Conservez son fichier JSON.');
  const result = copy(value);
  result.name = cleanName(result.name);
  return result;
}

function checkedLibrary(value, limits, code) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.projects)) fail(code, 'Le format de la bibliothèque est invalide.');
  if (value.projects.length > limits.maxProjects) fail('LIMIT_PROJECTS', `La bibliothèque est limitée à ${limits.maxProjects} projets. Aucun projet n’a été importé.`);
  const ids = new Set();
  const projects = value.projects.map(record => {
    if (!record || !validId(record.id) || ids.has(record.id) || typeof record.name !== 'string'
        || !validDate(record.createdAt) || !validDate(record.updatedAt) || !Array.isArray(record.revisions)) fail(code, 'Une fiche de projet est invalide ou dupliquée.');
    ids.add(record.id);
    if (record.revisions.length > 10) fail(code, 'Un projet contient trop de versions.');
    const project = checkedProject(record.project, limits.maxProjectBytes, code);
    const name = cleanName(record.name);
    if (project.name !== name) fail(code, 'Le nom du projet ne correspond pas à sa fiche.');
    const revisionIds = new Set();
    const revisions = record.revisions.map(revision => {
      if (!revision || !validId(revision.id) || revisionIds.has(revision.id) || !validDate(revision.createdAt)
          || (revision.reason !== undefined && typeof revision.reason !== 'string')) fail(code, 'Une version de projet est invalide ou dupliquée.');
      revisionIds.add(revision.id);
      return {
        id: revision.id, createdAt: revision.createdAt,
        reason: cleanName(revision.reason, 'Version précédente'),
        project: checkedProject(revision.project, limits.maxProjectBytes, code)
      };
    });
    return { id: record.id, name, createdAt: record.createdAt, updatedAt: record.updatedAt, project, revisions };
  });
  if (value.activeId !== null && (!validId(value.activeId) || !ids.has(value.activeId))) fail(code, 'Le projet actif de la bibliothèque est introuvable.');
  return { schemaVersion: 1, activeId: value.activeId, projects };
}

/**
 * save(project) updates active project, or creates the first entry.
 * save(project, { id: null }) always creates a separate entry.
 * open/restore/duplicate return { id, project }; caller installs project in editor.
 * read/list/revisions return independent copies. No writes happen on construction.
 */
export function createProjectLibrary(storage, options = {}) {
  const key = options.key || PROJECT_LIBRARY_KEY;
  const bounded = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
  const limits = {
    maxProjects: bounded(options.maxProjects, 20, 1, 20),
    maxRevisions: bounded(options.maxRevisions, 10, 0, 10),
    maxBytes: bounded(options.maxBytes, 3500000, 1024, 4000000),
    maxProjectBytes: 0
  };
  limits.maxProjectBytes = Math.min(limits.maxBytes, bounded(options.maxProjectBytes, limits.maxBytes, 256, 4000000));
  const clock = () => {
    const date = options.now ? new Date(options.now()) : new Date();
    if (!Number.isFinite(date.getTime())) fail('INVALID_DATE', 'La date du navigateur est invalide.');
    return date.toISOString();
  };
  let sequence = 0;
  function uniqueId(prefix, existing = []) {
    const occupied = new Set(existing);
    for (let attempt = 0; attempt < 50; attempt++) {
      const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${++sequence}`;
      const id = `${prefix}-${random}`;
      if (validId(id) && !occupied.has(id)) return id;
    }
    fail('ID_ERROR', 'Impossible de créer un identifiant de projet.');
  }
  function read() {
    let raw;
    try { raw = storage.getItem(key); } catch { fail('STORAGE_UNAVAILABLE', 'La bibliothèque locale est inaccessible. Enregistrez votre projet en JSON.'); }
    if (raw === null) return empty();
    if (typeof raw !== 'string' || raw.length * 2 > 12000000) fail('CORRUPT_STORE', 'La bibliothèque locale est illisible. Ses données ont été conservées.');
    let parsed;
    try { parsed = JSON.parse(raw); } catch { fail('CORRUPT_STORE', 'La bibliothèque locale est illisible. Ses données ont été conservées.'); }
    return checkedLibrary(parsed, limits, 'CORRUPT_STORE');
  }
  function write(candidate) {
    let prunedRevisions = 0;
    for (const record of candidate.projects) {
      if (record.revisions.length > limits.maxRevisions) {
        prunedRevisions += record.revisions.length - limits.maxRevisions;
        record.revisions.length = limits.maxRevisions;
      }
    }
    // Keep all current projects. Only oldest history snapshots may be evicted.
    let serialized = JSON.stringify(candidate);
    while (serialized.length * 2 > limits.maxBytes) {
      const oldest = candidate.projects.flatMap(record => record.revisions.map((revision, index) => ({ record, revision, index })))
        .sort((a, b) => Date.parse(a.revision.createdAt) - Date.parse(b.revision.createdAt) || b.index - a.index)[0];
      if (!oldest) fail('LIMIT_BYTES', 'La bibliothèque locale est pleine. Exportez puis supprimez un projet avant de réessayer. Aucun projet n’a été modifié.');
      oldest.record.revisions.splice(oldest.index, 1);
      prunedRevisions++;
      serialized = JSON.stringify(candidate);
    }
    try { storage.setItem(key, serialized); }
    catch (error) {
      const quota = error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014;
      fail(quota ? 'STORAGE_FULL' : 'STORAGE_UNAVAILABLE', quota
        ? 'Le navigateur manque de place. La bibliothèque précédente a été conservée ; exportez votre projet en JSON.'
        : 'La bibliothèque n’a pas pu être enregistrée. La copie précédente a été conservée.');
    }
    return { prunedRevisions };
  }
  function find(data, id) {
    const record = data.projects.find(item => item.id === id);
    if (!record) fail('PROJECT_NOT_FOUND', 'Ce projet ne figure plus dans la bibliothèque.');
    return record;
  }
  function pushRevision(record, reason) {
    record.revisions.unshift({ id: uniqueId('rev', record.revisions.map(item => item.id)), createdAt: record.updatedAt, reason, project: copy(record.project) });
  }
  function result(record, extra = {}) {
    return { id: record.id, name: record.name, project: copy(record.project), updatedAt: record.updatedAt, ...extra };
  }
  function save(project, settings = {}) {
    const data = read();
    const next = checkedProject(project, limits.maxProjectBytes);
    if (settings.name !== undefined) next.name = cleanName(settings.name);
    const id = own(settings, 'id') ? settings.id : data.activeId;
    let record;
    if (id === null) {
      if (data.projects.length >= limits.maxProjects) fail('LIMIT_PROJECTS', `Vous avez atteint la limite de ${limits.maxProjects} projets. Exportez puis supprimez un projet pour en créer un autre.`);
      const date = clock();
      record = { id: uniqueId('project', data.projects.map(item => item.id)), name: next.name, createdAt: date, updatedAt: date, project: next, revisions: [] };
      data.projects.push(record);
    } else {
      record = find(data, id);
      if (JSON.stringify(record.project) === JSON.stringify(next)) {
        if (data.activeId === id) return result(record, { changed: false, prunedRevisions: 0 });
        data.activeId = id;
        return result(record, { changed: false, ...write(data) });
      }
      pushRevision(record, 'Avant modification');
      record.project = next;
      record.name = next.name;
      record.updatedAt = clock();
    }
    data.activeId = record.id;
    return result(record, { changed: true, ...write(data) });
  }
  function list() {
    const data = read();
    return data.projects.map(({ id, name, createdAt, updatedAt, revisions }) => ({ id, name, createdAt, updatedAt, revisionCount: revisions.length, isActive: id === data.activeId }))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.name.localeCompare(b.name, 'fr'));
  }
  function open(id) {
    const data = read(), record = find(data, id);
    if (data.activeId === id) return result(record, { prunedRevisions: 0 });
    data.activeId = id;
    return result(record, write(data));
  }
  function duplicate(id) {
    const data = read(), record = find(data, id);
    return save(record.project, { id: null, name: cleanName(`${record.name.slice(0, 90)} (copie)`) });
  }
  function remove(id) {
    const data = read();
    find(data, id);
    data.projects = data.projects.filter(record => record.id !== id);
    if (data.activeId === id) data.activeId = [...data.projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]?.id || null;
    const next = data.projects.find(record => record.id === data.activeId);
    return { id, activeId: data.activeId, project: next ? copy(next.project) : null, ...write(data) };
  }
  function rename(id, name) {
    const data = read(), record = find(data, id);
    // Rename is independent from navigation: preserve the currently active entry.
    const nextName = cleanName(name);
    if (record.name === nextName) return result(record, { changed: false, prunedRevisions: 0 });
    pushRevision(record, 'Avant renommage');
    record.name = nextName;
    record.project.name = nextName;
    record.updatedAt = clock();
    return result(record, { changed: true, ...write(data) });
  }
  function revisions(id) {
    return find(read(), id).revisions.map(revision => ({ id: revision.id, createdAt: revision.createdAt, name: revision.project.name, reason: revision.reason }));
  }
  function restore(id, revisionId) {
    const data = read(), record = find(data, id), revision = record.revisions.find(item => item.id === revisionId);
    if (!revision) fail('REVISION_NOT_FOUND', 'Cette version n’est plus disponible.');
    const next = copy(revision.project);
    if (JSON.stringify(record.project) !== JSON.stringify(next)) {
      pushRevision(record, 'Avant restauration');
      record.project = next;
      record.name = next.name;
      record.updatedAt = clock();
    }
    data.activeId = id;
    return result(record, write(data));
  }
  function exportBackup() {
    return JSON.stringify({ format: PROJECT_LIBRARY_FORMAT, version: 1, exportedAt: clock(), library: read() }, null, 2);
  }
  function importBackup(json, settings = {}) {
    const mode = settings.mode || 'merge';
    if (!['merge', 'replace'].includes(mode)) fail('INVALID_BACKUP', 'Le mode d’importation est invalide.');
    if (typeof json !== 'string' || json.length * 2 > 12000000) fail('INVALID_BACKUP', 'La sauvegarde globale est trop volumineuse ou illisible.');
    let raw;
    try { raw = JSON.parse(json); } catch { fail('INVALID_BACKUP', 'Le fichier de sauvegarde n’est pas un JSON valide.'); }
    if (!raw || raw.format !== PROJECT_LIBRARY_FORMAT || raw.version !== 1 || !validDate(raw.exportedAt)) fail('INVALID_BACKUP', 'Ce fichier n’est pas une sauvegarde globale Atelier reconnue.');
    // Validate every imported entry before reading/modifying the destination.
    const imported = checkedLibrary(raw.library, limits, 'INVALID_BACKUP');
    let data, added = 0, skipped = 0;
    if (mode === 'replace') { data = imported; added = imported.projects.length; }
    else {
      data = read();
      const idMap = new Map();
      for (const record of imported.projects) {
        const previous = data.projects.find(item => item.id === record.id);
        if (previous && JSON.stringify(previous) === JSON.stringify(record)) { skipped++; idMap.set(record.id, record.id); continue; }
        const oldId = record.id;
        if (previous) record.id = uniqueId('project', data.projects.map(item => item.id));
        idMap.set(oldId, record.id);
        data.projects.push(record);
        added++;
      }
      if (data.projects.length > limits.maxProjects) fail('LIMIT_PROJECTS', `Cet import dépasserait ${limits.maxProjects} projets. Aucun projet n’a été ajouté.`);
      if (data.activeId === null && imported.activeId !== null) data.activeId = idMap.get(imported.activeId) || null;
    }
    return { added, skipped, activeId: data.activeId, projectCount: data.projects.length, ...write(data) };
  }
  return Object.freeze({ key, limits: Object.freeze({ ...limits }), read, list, activeId: () => read().activeId,
    save, open, duplicate, remove, rename, revisions, restore, exportBackup, importBackup });
}

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const dateLabel = value => new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Stateless markup. Root UI owns clicks, confirmation and file-download flows.
 * Actions: save-current, save-copy, open, duplicate, rename, delete, restore,
 * export-library, import-library. Inputs use data-project-name="<id>".
 */
export function projectsView(store, currentProject) {
  const data = store.read();
  const active = data.projects.find(record => record.id === data.activeId);
  const changed = !active || JSON.stringify(active.project) !== JSON.stringify(currentProject);
  const sorted = [...data.projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.name.localeCompare(b.name, 'fr'));
  const action = (name, label, id = '', extra = '') => `<button type="button" class="btn" data-project-action="${name}"${id ? ` data-project-id="${escapeHTML(id)}"` : ''}${extra}>${label}</button>`;
  return `<div class="project-library" data-project-library>
    <p>Conservez vos variantes dans ce navigateur. La sauvegarde globale JSON permet de les transférer ou de les récupérer si les données du navigateur sont effacées.</p>
    <div class="notice"><strong>Projet ouvert : ${escapeHTML(currentProject?.name || 'Sans titre')}</strong><br>${active ? `${escapeHTML(active.name)} · ${changed ? 'modifications à enregistrer' : 'copie enregistrée'}` : 'Ce projet n’a pas encore d’entrée dans la bibliothèque.'}</div>
    <div class="toolbar" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">${action('save-current', active ? 'Enregistrer le projet actif' : 'Ajouter ce projet')}${action('save-copy', 'Enregistrer une copie')}${action('export-library', 'Exporter tous les projets')}${action('import-library', 'Importer une sauvegarde')}</div>
    <p class="help-text">${data.projects.length} / ${store.limits.maxProjects} projets · Jusqu’à ${store.limits.maxRevisions} versions par projet. Les versions les plus anciennes sont retirées si la place manque ; les projets courants sont conservés.</p>
    ${sorted.length ? sorted.map(record => `<article class="content-card" style="margin:12px 0" data-project-card="${escapeHTML(record.id)}">
      <label class="field"><span>Nom${record.id === data.activeId ? ' · actif' : ''}</span><input type="text" maxlength="100" data-project-name="${escapeHTML(record.id)}" value="${escapeHTML(record.name)}" aria-label="Nom du projet ${escapeHTML(record.name)}"></label>
      <p class="help-text">Modifié le ${escapeHTML(dateLabel(record.updatedAt))} · ${record.revisions.length} version${record.revisions.length > 1 ? 's' : ''}</p>
      <div class="toolbar" style="display:flex;gap:8px;flex-wrap:wrap">${action('open', 'Ouvrir', record.id)}${action('duplicate', 'Dupliquer', record.id)}${action('rename', 'Renommer', record.id)}${action('delete', 'Supprimer', record.id)}</div>
      ${record.revisions.length ? `<details style="margin-top:12px"><summary>Versions précédentes</summary><ul>${record.revisions.map(revision => `<li style="margin:8px 0">${escapeHTML(dateLabel(revision.createdAt))} · ${escapeHTML(revision.reason)} · ${escapeHTML(revision.project.name)} ${action('restore', 'Restaurer', record.id, ` data-project-revision="${escapeHTML(revision.id)}"`)}</li>`).join('')}</ul></details>` : '<p class="help-text">Une version sera conservée lors du prochain enregistrement modifié.</p>'}
    </article>`).join('') : '<div class="content-card"><h3>Aucun projet enregistré</h3><p>Ajoutez le projet ouvert pour commencer votre bibliothèque.</p></div>'}
  </div>`;
}
