import * as THREE from 'three';
import { timberQuaternion } from './geometry.js';
import { workplaneFrame } from './workplane.js';

// Géométrie en millimètres. Ces aides ne créent aucune liaison persistante.
const EPS = 1e-7;
const vec = p => p?.isVector3 ? p.clone() : new THREE.Vector3(...p);
const finite3 = p => (Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) || (p?.isVector3 && [p.x, p.y, p.z].every(Number.isFinite));
const validPart = p => p && finite3(p.a) && finite3(p.b);
const number = (x, fallback, min, max) => x !== null && x !== '' && Number.isFinite(Number(x)) ? THREE.MathUtils.clamp(Number(x), min, max) : fallback;
const cleanId = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) : '';
const idOrder = (a, b) => String(a.id || '').localeCompare(String(b.id || ''));

export function normalizeAssistance(raw = {}) {
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    placementShadow: p.placementShadow !== false, guides: p.guides !== false, guideSnap: p.guideSnap !== false, gridSnap: p.gridSnap === true,
    gridMode: p.gridMode === 'fixed' ? 'fixed' : 'adaptive',
    gridStep: number(p.gridStep, 100, 0.1, 10000),
    gridDivisions: Math.round(number(p.gridDivisions, 8, 1, 100)),
    gridReference: p.gridReference === 'pair' ? 'pair' : 'auto',
    gridA: cleanId(p.gridA), gridB: cleanId(p.gridB)
  };
}

function frameFor(plane) {
  if (finite3(plane?.origin) && finite3(plane?.u) && finite3(plane?.v) && finite3(plane?.normal)) {
    const origin = vec(plane.origin), u = vec(plane.u).normalize(), normal = vec(plane.normal).normalize();
    return { origin, u, normal, v: vec(plane.v).normalize(), quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, normal, vec(plane.v).normalize())) };
  }
  return workplaneFrame(plane);
}
const projectPoint = (point, frame) => vec(point).addScaledVector(frame.normal, -vec(point).sub(frame.origin).dot(frame.normal));

/** Point de référence non projeté : pied du poteau, centre des autres éléments. */
export function placementAnchor(part, plane) {
  if (!validPart(part)) return null;
  const frame = frameFor(plane), a = vec(part.a), b = vec(part.b);
  if (part.kind === 'post') {
    const difference = a.dot(frame.normal) - b.dot(frame.normal);
    return Math.abs(difference) < EPS ? a.add(b).multiplyScalar(0.5).toArray() : (difference < 0 ? a : b).toArray();
  }
  if (Array.isArray(part.corners) && part.corners.length >= 3 && part.corners.every(finite3)) {
    return part.corners.reduce((sum, p) => sum.add(vec(p)), new THREE.Vector3()).divideScalar(part.corners.length).toArray();
  }
  const center = a.add(b).multiplyScalar(0.5);
  if (part.kind === 'wall' || part.material === 'wall') center.y += number(part.height, 0, 0, 100000) / 2;
  return center.toArray();
}

// Enveloppe convexe puis diamètre : la paire automatique est réellement la plus éloignée,
// y compris lorsque les repères ne suivent pas les axes du plan.
function farthestPair(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y || idOrder(a, b));
  const unique = sorted.filter((p, i) => !i || Math.abs(p.x - sorted[i - 1].x) > EPS || Math.abs(p.y - sorted[i - 1].y) > EPS);
  if (unique.length < 2) return null;
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower = [], upper = [];
  for (const p of unique) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...unique].reverse()) { while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let best = null, bestDistance = -1, bestKey = '';
  const consider = (a, b) => {
    const distance = (a.x - b.x) ** 2 + (a.y - b.y) ** 2, pair = [a, b].sort(idOrder), key = pair.map(p => p.id).join('\u0000');
    if (distance > bestDistance + EPS || (Math.abs(distance - bestDistance) <= EPS && key < bestKey)) { best = pair; bestDistance = distance; bestKey = key; }
  };
  if (hull.length === 2) return hull.sort(idOrder);
  let j = 1;
  for (let i = 0; i < hull.length; i++) {
    const next = (i + 1) % hull.length;
    const area = index => Math.abs(cross(hull[i], hull[next], hull[index]));
    let iterations = 0;
    while (area((j + 1) % hull.length) > area(j) + EPS && iterations++ < hull.length) j = (j + 1) % hull.length;
    consider(hull[i], hull[j]); consider(hull[next], hull[j]);
    if (Math.abs(area((j + 1) % hull.length) - area(j)) <= EPS) { consider(hull[i], hull[(j + 1) % hull.length]); consider(hull[next], hull[(j + 1) % hull.length]); }
  }
  return best;
}

/** Les vecteurs du repère sont des THREE.Vector3 ; local X=u, Y=normal, Z=v. */
export function resolveAdaptiveGrid(project = {}, parts = project?.freeParts) {
  const settings = normalizeAssistance(project?.assistance), base = workplaneFrame(project?.workplane);
  const fixed = notice => ({ ...base, step: settings.gridStep, span: settings.gridStep * settings.gridDivisions, divisions: settings.gridDivisions, refs: [], adaptive: false, notice });
  if (settings.gridMode === 'fixed') return fixed('');
  const available = (Array.isArray(parts) ? parts : []).filter(p => validPart(p) && p.material === 'wood' && p.kind !== 'panel');
  let pair;
  if (settings.gridReference === 'pair') {
    pair = [available.find(p => p.id === settings.gridA), available.find(p => p.id === settings.gridB)];
    if (!pair[0] || !pair[1] || pair[0].id === pair[1].id) return fixed('Choisissez deux repères différents présents dans le projet. Grille fixe utilisée.');
    pair = pair.map(p => ({ id: p.id, point: projectPoint(placementAnchor(p, base), base) }));
  } else {
    const posts = available.filter(p => p.kind === 'post' && p.material === 'wood');
    const candidates = posts.length >= 2 ? posts : available.filter(p => p.material === 'wood');
    const points = candidates.map(p => {
      const point = projectPoint(placementAnchor(p, base), base), local = point.clone().sub(base.origin);
      return { id: p.id, point, x: local.dot(base.u), y: local.dot(base.v) };
    });
    pair = farthestPair(points);
    if (!pair) return fixed('Deux repères distincts sont nécessaires dans le plan. Grille fixe utilisée.');
  }
  const direction = pair[1].point.clone().sub(pair[0].point), span = direction.length();
  if (span < EPS) return fixed('Les deux repères se superposent dans ce plan. Grille fixe utilisée.');
  const u = direction.divideScalar(span), normal = base.normal.clone(), v = u.clone().cross(normal).normalize();
  return {
    origin: pair[0].point.clone(), u, v, normal,
    quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, normal, v)),
    step: span / settings.gridDivisions, span, divisions: settings.gridDivisions,
    refs: pair.map(p => p.id), adaptive: true, notice: ''
  };
}

/** Arrondit dans le plan seulement ; l'altitude par rapport au plan est conservée. */
export function snapPointToGrid(point, grid) {
  if (!finite3(point) || !Number.isFinite(grid?.step) || grid.step <= 0) return null;
  const frame = frameFor(grid), relative = vec(point).sub(frame.origin);
  return frame.origin.clone()
    .addScaledVector(frame.u, Math.round(relative.dot(frame.u) / grid.step) * grid.step)
    .addScaledVector(frame.v, Math.round(relative.dot(frame.v) / grid.step) * grid.step)
    .addScaledVector(frame.normal, relative.dot(frame.normal)).toArray();
}

/** Delta total depuis le début du geste ; l'ancre du premier élément pilote le groupe. */
export function snapDeltaToGrid(parts, delta, grid, { axis = 'XYZ', space = 'world', quaternion = [0, 0, 0, 1], lock = false } = {}) {
  if (!Array.isArray(parts) || !parts.length || !finite3(delta) || !/^(?:X|Y|Z|XY|XZ|YZ|XYZ)$/.test(axis)) return null;
  const anchor = placementAnchor(parts[0], grid);
  if (!anchor) return null;
  const frame = frameFor(grid), target = vec(anchor).add(vec(delta)), snapped = snapPointToGrid(target, grid);
  if (!snapped) return null;
  const result = vec(snapped).sub(vec(anchor));
  const q = quaternion?.isQuaternion ? quaternion.clone() : Array.isArray(quaternion) && quaternion.length === 4 && quaternion.every(Number.isFinite) ? new THREE.Quaternion(...quaternion) : null;
  if (space === 'local' && (!q || q.lengthSq() < EPS)) return null;
  const constrained = space === 'local' ? result.clone().applyQuaternion(q.normalize().invert()) : result;
  if (['X', 'Y', 'Z'].some((key, i) => !axis.includes(key) && Math.abs(constrained.getComponent(i)) > EPS)) return null;
  if (lock && Math.abs(result.dot(frame.normal)) > EPS) return null;
  return result.toArray();
}

function partCorners(part) {
  if (Array.isArray(part.corners) && part.corners.length >= 3 && part.corners.every(finite3)) return part.corners.map(vec);
  const a = vec(part.a), b = vec(part.b), center = a.clone().add(b).multiplyScalar(0.5);
  if (part.material === 'wood' && a.distanceToSquared(b) > EPS) {
    const q = timberQuaternion(part), result = [], length = a.distanceTo(b);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) result.push(new THREE.Vector3(x * number(part.width, 0, 0, 100000) / 2, y * number(part.height, 0, 0, 100000) / 2, z * length / 2).applyQuaternion(q).add(center));
    return result;
  }
  if (part.kind === 'wall' || part.material === 'wall') {
    const tangent = b.clone().sub(a); tangent.y = 0;
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(number(part.width, 0, 0, 100000) / 2), points = [];
    for (const p of [a, b]) for (const sign of [-1, 1]) for (const top of [0, 1]) points.push(p.clone().addScaledVector(side, sign).add(new THREE.Vector3(0, top * number(part.height, 0, 0, 100000), 0)));
    return points;
  }
  return [a, b];
}

function description(parts, frame) {
  const corners = parts.flatMap(partCorners), center = corners.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(corners.length);
  const anchor = projectPoint(placementAnchor(parts[0], frame), frame), middle = projectPoint(center, frame);
  const features = [frame.u, frame.v].map(axis => {
    const coordinates = corners.map(p => p.clone().sub(frame.origin).dot(axis));
    return { min: Math.min(...coordinates), max: Math.max(...coordinates), center: middle.clone().sub(frame.origin).dot(axis), axis: anchor.clone().sub(frame.origin).dot(axis) };
  });
  return { parts, corners, anchor, center: middle, features };
}

function flatFaceAlong(description, direction) {
  if (description.parts.length !== 1 || description.parts[0].material !== 'wood') return false;
  const part = description.parts[0];
  if (vec(part.a).distanceToSquared(vec(part.b)) < EPS) return false;
  const q = timberQuaternion(part);
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].some(a => Math.abs(vec(a).applyQuaternion(q).dot(direction)) > 1 - EPS);
}
const mm = n => `${Number(n.toFixed(2)).toLocaleString('fr-FR')} mm`;

/** Aides temporaires : la préférence guideSnap est appliquée par l'interface, pas ici. */
export function smartPlacementGuides(project = {}, movingParts = [], { excludeIds = [], tolerance = 50, grid = null } = {}) {
  if (!normalizeAssistance(project?.assistance).guides || !Array.isArray(movingParts) || !movingParts.length || movingParts.some(p => !validPart(p)) || !Number.isFinite(tolerance) || tolerance < 0) return null;
  const frame = grid ? frameFor(grid) : workplaneFrame(project?.workplane), moving = description(movingParts, frame);
  const excluded = new Set([...excludeIds, ...movingParts.map(p => p.id)]);
  const references = (Array.isArray(project?.freeParts) ? project.freeParts : []).filter(p => validPart(p) && !excluded.has(p.id) && ['wood', 'wall', 'mesh', 'roof'].includes(p.material))
    .map(p => ({ ...description([p], frame), id: p.id }))
    .sort((a, b) => a.anchor.distanceToSquared(moving.anchor) - b.anchor.distanceToSquared(moving.anchor) || idOrder(a, b)).slice(0, 32);
  if (!references.length) return null;
  const candidates = [];
  const add = (delta, lines, kind, label, refs, priority) => {
    if (delta.length() > tolerance + EPS || Math.abs(delta.dot(frame.normal)) > EPS) return;
    candidates.push({ delta: delta.toArray(), lines, kind, label, referenceIds: [...new Set(refs)], priority, distance: delta.length(), key: refs.join('|') + label });
  };
  const line = (a, b, label, kind) => ({ a: projectPoint(a, frame).toArray(), b: projectPoint(b, frame).toArray(), label, kind });

  // Milieu / répétition : calcul dans la direction réelle de la paire, même diagonale.
  for (let i = 0; i < references.length; i++) for (let j = i + 1; j < references.length; j++) {
    const a = references[i], b = references[j], span = a.anchor.distanceTo(b.anchor);
    if (span < EPS) continue;
    const midpoint = a.anchor.clone().add(b.anchor).multiplyScalar(0.5), refs = [a.id, b.id];
    add(midpoint.clone().sub(moving.anchor), [line(a.anchor, midpoint, mm(span / 2), 'spacing'), line(midpoint, b.anchor, mm(span / 2), 'spacing')], 'spacing', 'Milieu entre axes', refs, 1);
    for (const [left, right] of [[a, b], [b, a]]) {
      const next = right.anchor.clone().multiplyScalar(2).sub(left.anchor);
      add(next.clone().sub(moving.anchor), [line(left.anchor, right.anchor, mm(span), 'spacing'), line(right.anchor, next, mm(span), 'spacing')], 'spacing', 'Espacement des axes identique', refs, 2);
    }
    const direction = b.center.clone().sub(a.center), distance = direction.length();
    if (distance < EPS) continue;
    direction.divideScalar(distance);
    // Un écart entre faces n'est annoncé que si ce sont de vraies faces parallèles.
    if (![a, b, moving].every(d => flatFaceAlong(d, direction))) continue;
    const leftFace = Math.max(...a.corners.map(p => p.clone().sub(a.center).dot(direction)));
    const rightFace = distance + Math.min(...b.corners.map(p => p.clone().sub(b.center).dot(direction)));
    const movingLow = Math.min(...moving.corners.map(p => p.clone().sub(moving.center).dot(direction)));
    const movingHigh = Math.max(...moving.corners.map(p => p.clone().sub(moving.center).dot(direction)));
    const targetDistance = (leftFace + rightFace - movingLow - movingHigh) / 2;
    const gap = targetDistance + movingLow - leftFace;
    if (gap < -EPS) continue;
    const target = a.center.clone().addScaledVector(direction, targetDistance);
    const leftPoint = a.center.clone().addScaledVector(direction, leftFace), rightPoint = a.center.clone().addScaledVector(direction, rightFace);
    add(target.clone().sub(moving.center), [line(leftPoint, target.clone().addScaledVector(direction, movingLow), mm(gap), 'spacing'), line(target.clone().addScaledVector(direction, movingHigh), rightPoint, mm(gap), 'spacing')], 'spacing', 'Écarts entre faces identiques', refs, 0);
  }

  const axes = [frame.u, frame.v], choices = [[], []];
  for (const reference of references) for (let axis = 0; axis < 2; axis++) for (const feature of ['axis', 'center', 'min', 'max']) {
    if (['min', 'max'].includes(feature) && (!flatFaceAlong(moving, axes[axis]) || !flatFaceAlong(reference, axes[axis]))) continue;
    const offset = reference.features[axis][feature] - moving.features[axis][feature];
    if (Math.abs(offset) > tolerance + EPS) continue;
    choices[axis].push({ reference, feature, offset, priority: feature === 'axis' ? 0 : feature === 'center' ? 1 : 2 });
  }
  choices.forEach(list => list.sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset) || a.priority - b.priority || idOrder(a.reference, b.reference)));
  const alignment = selected => {
    const delta = new THREE.Vector3(), refs = [], lines = [];
    for (const [axis, choice] of selected) { delta.addScaledVector(axes[axis], choice.offset); refs.push(choice.reference.id); }
    for (const [axis, choice] of selected) {
      const label = choice.feature === 'axis' ? 'Axes alignés' : choice.feature === 'center' ? 'Centres alignés' : 'Faces alignées';
      const start = moving.anchor.clone().add(delta), end = choice.reference.anchor.clone();
      start.addScaledVector(axes[axis], choice.reference.features[axis][choice.feature] - start.clone().sub(frame.origin).dot(axes[axis]));
      end.addScaledVector(axes[axis], choice.reference.features[axis][choice.feature] - end.clone().sub(frame.origin).dot(axes[axis]));
      lines.push(line(start, end, label, 'alignment'));
    }
    add(delta, lines, 'alignment', selected.length > 1 ? 'Alignement dans les deux directions' : lines[0].label, refs, selected.length > 1 ? 3 : 4);
  };
  if (choices[0].length && choices[1].length) alignment([[0, choices[0][0]], [1, choices[1][0]]]);
  for (let axis = 0; axis < 2; axis++) if (choices[axis].length) alignment([[axis, choices[axis][0]]]);
  candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance || a.key.localeCompare(b.key));
  if (!candidates.length) return null;
  const { priority, distance, key, ...result } = candidates[0];
  return result;
}
