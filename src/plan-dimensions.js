/** Cotes associatives de plan : millimètres exacts, sans solveur de contraintes. */
import * as THREE from 'three';
import { timberQuaternion, panelCorners } from './geometry.js';

const TYPES = ['axes', 'gap', 'length', 'angle'];
const VIEWS = { top: [0, 2], front: [0, 1], side: [2, 1] };
const EPS = 1e-8;
const vector = a => new THREE.Vector3(...a);
const finite3 = a => Array.isArray(a) && a.length === 3 && a.every(x => typeof x === 'number' && Number.isFinite(x));
const partOK = p => p && finite3(p.a) && finite3(p.b);
const object = a => a && typeof a === 'object' && !Array.isArray(a) ? a : {};
const idOK = s => typeof s === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(s) && !['__proto__', 'prototype', 'constructor'].includes(s);
const text = (s, length = 120) => typeof s === 'string' ? s.replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, length) : '';
const bounded = (n, fallback, min, max) => typeof n !== 'boolean' && n !== null && n !== '' && Number.isFinite(Number(n)) ? Math.min(max, Math.max(min, Number(n))) : fallback;
const axisIndex = axis => ({ x: 0, y: 1, z: 2 })[String(axis).toLowerCase()];
const viewName = v => typeof v === 'string' && Object.hasOwn(VIEWS, v) ? v : 'top';
const partsOf = (project, model) => Array.isArray(model?.parts) ? model.parts : Array.isArray(project?.freeParts) ? project.freeParts : [];

function normalizeDimension(raw, id) {
  const p = object(raw);
  return {
    id, type: p.type, aPart: idOK(p.aPart) ? p.aPart : '', bPart: p.type === 'length' ? '' : idOK(p.bPart) ? p.bPart : '',
    axis: typeof p.axis === 'string' && ['x', 'y', 'z'].includes(p.axis.toLowerCase()) ? p.axis.toLowerCase() : 'x',
    view: p.view === 'all' ? 'all' : typeof p.view === 'string' && Object.hasOwn(VIEWS, p.view) ? p.view : 'all',
    offset: bounded(p.offset, 200, -10000, 10000), label: text(p.label), side: p.side === -1 ? -1 : 1
  };
}

/** Ne supprime jamais une cote parce que sa pièce a été supprimée. Aucune valeur mise en cache. */
export function normalizeDrawing(raw = {}) {
  const p = object(raw), rawDimensions = Array.isArray(p.dimensions) ? p.dimensions.slice(0, 500) : [];
  let nextId = Math.floor(bounded(p.nextId, 1, 1, Number.MAX_SAFE_INTEGER - 1000));
  for (const d of rawDimensions) {
    const match = typeof d?.id === 'string' && d.id.match(/^DIM-(\d+)$/);
    if (match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) < Number.MAX_SAFE_INTEGER - 1000) nextId = Math.max(nextId, Number(match[1]) + 1);
  }
  const dimensions = [], used = new Set();
  for (const d of rawDimensions) {
    if (!TYPES.includes(d?.type)) continue;
    let id = idOK(d.id) && !d.id.startsWith('AUTO-') && !used.has(d.id) ? d.id : null;
    if (!id) { do { id = `DIM-${nextId++}`; } while (used.has(id)); }
    used.add(id); dimensions.push(normalizeDimension(d, id));
  }
  return {
    version: 1, view: viewName(p.view), automatic: p.automatic !== false,
    autoLevel: ['overall', 'spacing', 'full'].includes(p.autoLevel) ? p.autoLevel : 'overall',
    precision: [0.1, 0.5, 1].includes(Number(p.precision)) ? Number(p.precision) : 1,
    showGrid:p.showGrid===true, showDimensions:p.showDimensions!==false, structureOnly:p.structureOnly===true,
    nextId, dimensions
  };
}

/** Syntaxe volontairement limitée : un nombre français ou anglais, puis mm/cm/m facultatif. */
export function parseDimensionInput(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string' || input.length > 80) return null;
  const match = input.trim().match(/^([+-]?(?:(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,]\d+)?|[.,]\d+))\s*(mm|cm|m)?$/i);
  if (!match) return null;
  const value = Number(match[1].replace(/[ \u00a0\u202f]/g, '').replace(',', '.')) * ({ mm: 1, cm: 10, m: 1000 }[(match[2] || 'mm').toLowerCase()]);
  return Number.isFinite(value) ? value : null;
}

function bounds(part) {
  if (!partOK(part)) return null;
  const a = vector(part.a), b = vector(part.b), center = a.clone().add(b).multiplyScalar(0.5);
  let corners;
  if (part.material === 'wood' && part.kind !== 'panel') {
    if (!(part.width > 0 && part.height > 0) || !Number.isFinite(part.width) || !Number.isFinite(part.height) || a.distanceToSquared(b) < EPS || !Number.isFinite(Number(part.roll || 0))) return null;
    const q = timberQuaternion(part), length = a.distanceTo(b); corners = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(new THREE.Vector3(x * part.width / 2, y * part.height / 2, z * length / 2).applyQuaternion(q).add(center).toArray());
  } else if (part.material === 'wall' || part.kind === 'wall') {
    if (!(part.width > 0 && part.height > 0) || !Number.isFinite(part.width) || !Number.isFinite(part.height)) return null;
    const direction = b.clone().sub(a); direction.y = 0;
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize().multiplyScalar(part.width / 2);
    corners = [];
    for (const endpoint of [a, b]) for (const sign of [-1, 1]) for (const top of [0, 1]) corners.push(endpoint.clone().addScaledVector(normal, sign).add(new THREE.Vector3(0, top * part.height, 0)).toArray());
    center.y += part.height / 2;
  } else if (part.kind === 'panel' || ['mesh', 'roof'].includes(part.material)) {
    corners = panelCorners(part);
    if (!Array.isArray(corners) || corners.length < 3 || !corners.every(finite3)) return null;
    center.copy(corners.reduce((sum, p) => sum.add(vector(p)), new THREE.Vector3()).divideScalar(corners.length));
  } else return null;
  const min = [0, 1, 2].map(i => Math.min(...corners.map(p => p[i]))), max = [0, 1, 2].map(i => Math.max(...corners.map(p => p[i])));
  return { min, max, center: center.toArray(), corners };
}

const displayValue = (n, unit, precision) => {
  const step = unit === 'deg' ? 0.1 : precision, rounded = Math.round(n / step) * step;
  return `${Number(rounded.toFixed(4)).toLocaleString('fr-FR', { maximumFractionDigits: 4 })}${unit === 'deg' ? '°' : ' mm'}`;
};
const kindLabel = (type, axis) => ({ axes: `Entraxe ${axis.toUpperCase()}`, gap: `Espace libre projeté ${axis.toUpperCase()}`, length: 'Longueur réelle', angle: 'Angle aigu entre axes', overall: `Hors tout ${axis.toUpperCase()}`, height: 'Hauteur' })[type] || 'Cote';

function lineGeometry(sourcePoints, view, offset, axis = null) {
  const [u, v] = VIEWS[view], hidden = [0, 1, 2].find(i => i !== u && i !== v), [sourceA, sourceB] = sourcePoints;
  const a = [...sourceA], b = [...sourceB]; a[hidden] = b[hidden] = (a[hidden] + b[hidden]) / 2;
  if (axis !== null) {
    if (axis !== u && axis !== v) return { a: null, b: null, lines: [], hidden: true };
    const other = axis === u ? v : u;
    const baseline = axis === u && view !== 'top' ? Math.min(a[other], b[other]) - offset : Math.max(a[other], b[other]) + offset;
    a[other] = b[other] = baseline;
  } else {
    const dx = b[u] - a[u], dy = b[v] - a[v], length = Math.hypot(dx, dy);
    if (length < EPS) return { a: null, b: null, lines: [], hidden: true };
    a[u] += -dy / length * offset; b[u] += -dy / length * offset;
    a[v] += dx / length * offset; b[v] += dx / length * offset;
  }
  return { a, b, hidden: false, lines: [{ a: [...sourceA], b: [...a], role: 'extension' }, { a: [...sourceB], b: [...b], role: 'extension' }, { a, b, role: 'dimension' }] };
}

/** Une mesure est toujours recalculée depuis les IDs, jamais depuis un ancien affichage. */
export function measureDimension(project, dimension, model = null) {
  const drawing = normalizeDrawing(project?.drawing), raw = object(dimension);
  const d = normalizeDimension(raw, idOK(raw.id) ? raw.id : 'DIM');
  const view = d.view === 'all' ? drawing.view : viewName(d.view), unit = d.type === 'angle' ? 'deg' : 'mm';
  const result = { ...d, view, a: null, b: null, sourcePoints: [], lines: [], value: null, unit, label: d.label || kindLabel(d.type, d.axis), status: 'invalid', editable: false, message: '', automatic: false, lane: 0, partIds: [d.aPart, ...(d.type === 'length' ? [] : [d.bPart])].filter(Boolean) };
  if (!TYPES.includes(d.type)) return { ...result, message: 'Type de cote inconnu.' };
  const parts = partsOf(project, model), a = parts.find(p => p.id === d.aPart), b = d.type === 'length' ? null : parts.find(p => p.id === d.bPart);
  if (!a || (d.type !== 'length' && !b)) return { ...result, status: 'missing', label: `${result.label} · référence supprimée`, message: 'Une pièce de référence est absente. Cette cote doit être reliée à une pièce existante ou supprimée.' };
  if (b && a.id === b.id) return { ...result, message: 'Choisissez deux pièces distinctes.' };
  const ba = bounds(a), bb = b ? bounds(b) : null;
  if (!ba || (b && !bb)) return { ...result, message: 'La géométrie de la pièce ne permet pas cette mesure.' };
  let value, sourcePoints, measurementAxis = null, side = d.side;
  if (['axes', 'gap'].includes(d.type)) {
    const index = axisIndex(d.axis); side = Math.sign(bb.center[index] - ba.center[index]) || d.side;
    const aa = [...ba.center], ab = [...bb.center];
    if (d.type === 'axes') value = Math.abs(ab[index] - aa[index]);
    else { aa[index] = side === 1 ? ba.max[index] : ba.min[index]; ab[index] = side === 1 ? bb.min[index] : bb.max[index]; value = side * (ab[index] - aa[index]); }
    sourcePoints = [aa, ab]; measurementAxis = index;
  } else {
    if (a.material !== 'wood' || a.kind === 'panel' || (b && (b.material !== 'wood' || b.kind === 'panel'))) return { ...result, message: 'La longueur et l’angle concernent les axes des pièces de bois.' };
    const directionA = vector(a.b).sub(vector(a.a)), lengthA = directionA.length();
    if (lengthA < EPS) return { ...result, message: 'La pièce a une longueur nulle.' };
    if (d.type === 'length') { value = lengthA; sourcePoints = [[...a.a], [...a.b]]; }
    else {
      const directionB = vector(b.b).sub(vector(b.a));
      if (directionB.length() < EPS) return { ...result, message: 'La pièce a une longueur nulle.' };
      value = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(directionA.normalize().dot(directionB.normalize())))));
      sourcePoints = [[...ba.center], [...bb.center]];
    }
  }
  const editable = project?.mode === 'free' && d.type !== 'angle';
  const geometry = lineGeometry(sourcePoints, view, d.offset, measurementAxis);
  if (d.type === 'angle') {
    // Les deux axes réels sont montrés, sans inventer une intersection physique.
    geometry.lines = [{ a: [...a.a], b: [...a.b], role: 'angle' }, { a: [...b.a], b: [...b.b], role: 'angle' }];
    geometry.a = [...ba.center]; geometry.b = [...bb.center]; geometry.hidden = false;
  }
  const message = d.type === 'angle' ? 'Angle aigu entre les axes, en lecture seule ; indépendant du sens A → B.' : project?.mode !== 'free' ? 'Convertissez le projet en construction libre pour modifier cette cote.' : d.type === 'gap' && value < 0 ? 'Les enveloppes des pièces se recouvrent selon cet axe.' : '';
  return { ...result, ...geometry, side, value, sourcePoints, editable, status: editable ? 'ok' : 'readonly', message, label: `${d.label || kindLabel(d.type, d.axis)} · ${displayValue(value, unit, drawing.precision)}` };
}

/** Ajoute une définition, pas un nombre figé. L'ordre des IDs définit A puis B. */
export function createDimension(project, type, ids, options = {}) {
  if (!TYPES.includes(type)) throw new RangeError('Choisissez un type de cote valide.');
  const required = type === 'length' ? 1 : 2;
  if (!Array.isArray(ids) || ids.length !== required || new Set(ids).size !== ids.length || ids.some(id => !idOK(id))) throw new Error(`Sélectionnez exactement ${required} pièce${required > 1 ? 's distinctes' : ''}.`);
  const drawing = normalizeDrawing(project?.drawing);
  if (drawing.dimensions.length >= 500) throw new RangeError('Le projet contient déjà 500 cotes persistantes.');
  let id; do { id = `DIM-${drawing.nextId++}`; } while (drawing.dimensions.some(d => d.id === id));
  const definition = normalizeDimension({ ...options, type, aPart: ids[0], bPart: ids[1] || '' }, id);
  const measurement = measureDimension({ ...project, drawing }, definition, options.model);
  if (['missing', 'invalid'].includes(measurement.status)) throw new Error(measurement.message);
  definition.side = measurement.side;
  drawing.dimensions.push(definition);
  return drawing;
}

/** Aperçu d'une opération ponctuelle : aucune pièce, cote ou liaison de l'entrée n'est mutée. */
export function previewDimensionEdit(project, dimensionId, input, { move = 'b', anchor = 'a' } = {}) {
  const fail = message => ({ ok: false, project: null, changes: [], before: null, after: null, fixedId: null, movedIds: [], message });
  if (project?.mode !== 'free') return fail('Convertissez le projet en construction libre pour modifier une cote.');
  const drawing = normalizeDrawing(project?.drawing), definition = drawing.dimensions.find(d => d.id === dimensionId);
  if (!definition) return fail('Cette cote est introuvable.');
  const before = measureDimension(project, definition);
  if (!before.editable) return { ...fail(before.message || 'Cette cote est en lecture seule.'), before };
  const requested = parseDimensionInput(input);
  if (requested === null || requested < 0 || (definition.type === 'length' && requested <= 0)) return { ...fail('Saisissez une distance valide en mm, cm ou m, positive (ou nulle pour un écart).'), before };
  if (!['a', 'b'].includes(move) || !['a', 'center', 'b'].includes(anchor)) return { ...fail('Choisissez la pièce à déplacer et le point à conserver.'), before };
  const p = structuredClone(project), movingId = definition.type === 'length' || move === 'a' ? definition.aPart : definition.bPart;
  const index = p.freeParts.findIndex(part => part.id === movingId), original = p.freeParts[index], changed = structuredClone(original);
  let delta = null;
  if (definition.type === 'length') {
    const direction = vector(original.b).sub(vector(original.a)), length = direction.length(); direction.divideScalar(length);
    // Une validation sans changement conserve les coordonnées bit pour bit.
    if (Math.abs(length - requested) > Number.EPSILON * Math.max(1, length, requested) * 4) {
      if (anchor === 'a') changed.b = vector(original.a).addScaledVector(direction, requested).toArray();
      else if (anchor === 'b') changed.a = vector(original.b).addScaledVector(direction, -requested).toArray();
      else { const center = vector(original.a).add(vector(original.b)).multiplyScalar(0.5); changed.a = center.clone().addScaledVector(direction, -requested / 2).toArray(); changed.b = center.addScaledVector(direction, requested / 2).toArray(); }
    }
    if (Object.hasOwn(changed, 'length')) changed.length = requested;
  } else {
    delta = [0, 0, 0]; delta[axisIndex(definition.axis)] = (move === 'b' ? 1 : -1) * before.side * (requested - before.value);
    const translated = point => point.map((v, i) => v + delta[i]);
    changed.a = translated(changed.a); changed.b = translated(changed.b);
    if (Array.isArray(changed.corners)) changed.corners = changed.corners.map(translated);
  }
  if ([changed.a, changed.b, ...(changed.corners || [])].some(point => !finite3(point) || point.some(n => Math.abs(n) > 100000))) return { ...fail('Ce changement dépasse les limites du projet (±100 000 mm).'), before };
  p.freeParts[index] = changed; p.drawing = drawing;
  const after = measureDimension(p, definition), fixedId = definition.type === 'length' ? null : move === 'a' ? definition.bPart : definition.aPart;
  return { ok: true, project: p, changes: [{ id: movingId, before: structuredClone(original), after: structuredClone(changed), delta }], before, after, fixedId, movedIds: [movingId], anchor: definition.type === 'length' ? anchor : null, message: definition.type === 'length' ? 'Aperçu de la longueur ; les autres pièces restent à leur position.' : 'Aperçu du déplacement ; la référence et les autres pièces restent fixes.' };
}

function automaticDimensions(project, model, view, { limit, level, precision }) {
  const parts = partsOf(project, model).filter(p => ['wood', 'wall', 'mesh', 'roof'].includes(p.material));
  const valid = parts.map(part => ({ part, bounds: bounds(part) })).filter(p => p.bounds), result = [];
  if (!valid.length || limit <= 0) return result;
  const min = [0, 1, 2].map(i => Math.min(...valid.map(d => d.bounds.min[i]))), max = [0, 1, 2].map(i => Math.max(...valid.map(d => d.bounds.max[i])));
  const add = (id, type, axis, value, sourcePoints, partIds, lane = 0) => {
    if (result.length >= limit) return;
    const offset = 200 + lane * 160, geometry = lineGeometry(sourcePoints, view, offset, type === 'length' ? null : axisIndex(axis));
    if (geometry.hidden) return;
    result.push({ id, type, view, axis, value, unit: 'mm', label: `${kindLabel(type, axis)} · ${displayValue(value, 'mm', precision)}`, ...geometry, sourcePoints, partIds, offset, lane, automatic: true, status: 'readonly', editable: false, message: 'Cote automatique calculée depuis le modèle.' });
  };
  for (const i of VIEWS[view]) {
    const a = [...min], b = [...min]; b[i] = max[i];
    add(`AUTO-${view}-overall-${'xyz'[i]}`, 'overall', 'xyz'[i], max[i] - min[i], [a, b], valid.map(d => d.part.id), 2);
  }
  if (level === 'overall') return result;
  const posts = valid.filter(({ part }) => part.material === 'wood' && part.kind === 'post' && Math.abs(part.a[0] - part.b[0]) < EPS && Math.abs(part.a[2] - part.b[2]) < EPS)
    .map(({ part }) => ({ part, anchor: part.a[1] <= part.b[1] ? part.a : part.b }));
  const seen = new Set();
  for (const axis of VIEWS[view].filter(i => i !== 1)) {
    const others = [0, 1, 2].filter(i => i !== axis), rows = [];
    for (const item of [...posts].sort((a, b) => a.anchor[others[0]] - b.anchor[others[0]] || a.anchor[others[1]] - b.anchor[others[1]] || a.anchor[axis] - b.anchor[axis] || a.part.id.localeCompare(b.part.id))) {
      // Les deux autres coordonnées doivent coïncider en 3D, pas seulement à l'écran.
      const row = rows.find(r => others.every(i => Math.abs(r[0].anchor[i] - item.anchor[i]) <= 0.5));
      if (row) row.push(item); else rows.push([item]);
    }
    for (const row of rows) {
      row.sort((a, b) => a.anchor[axis] - b.anchor[axis] || a.part.id.localeCompare(b.part.id));
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1], b = row[i], value = b.anchor[axis] - a.anchor[axis];
        if (value < EPS) continue;
        const key = `${axis}:${VIEWS[view].flatMap(j => [a.anchor[j], b.anchor[j]]).join(':')}`;
        if (seen.has(key)) continue; seen.add(key);
        add(`AUTO-${view}-row-${'xyz'[axis]}-${a.part.id}-${b.part.id}`, 'axes', 'xyz'[axis], value, [[...a.anchor], [...b.anchor]], [a.part.id, b.part.id], 0);
      }
    }
  }
  if (level !== 'full') return result;
  for (const { part } of [...valid].sort((a, b) => a.part.id.localeCompare(b.part.id))) {
    if (part.material !== 'wood' || part.kind === 'panel') continue;
    const vertical = Math.abs(part.a[0] - part.b[0]) < EPS && Math.abs(part.a[2] - part.b[2]) < EPS;
    add(`AUTO-${view}-length-${part.id}`, vertical ? 'height' : 'length', vertical ? 'y' : 'x', vector(part.a).distanceTo(vector(part.b)), [[...part.a], [...part.b]], [part.id], 1);
  }
  return result;
}

/** Cotes persistantes de la vue, suivies d'un ensemble automatique borné. */
export function getPlanDimensions(project, model = null, { view, automatic = true, limit = 40, level } = {}) {
  const drawing = normalizeDrawing(project?.drawing), selectedView = viewName(view || drawing.view);
  const persistent = drawing.dimensions.filter(d => d.view === 'all' || d.view === selectedView)
    .map(d => measureDimension({ ...project, drawing: { ...drawing, view: selectedView } }, d, model)).filter(d => !d.hidden);
  if (!automatic || !drawing.automatic) return persistent;
  const auto = automaticDimensions(project, model, selectedView, { limit: Math.floor(bounded(limit, 40, 0, 100)), level: ['overall', 'spacing', 'full'].includes(level) ? level : drawing.autoLevel, precision: drawing.precision });
  return [...persistent, ...auto];
}
