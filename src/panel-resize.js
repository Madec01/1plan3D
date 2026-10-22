import { panelCorners } from './geometry.js';

/** All coordinates and dimensions are in millimetres. No project state is changed. */
export const PANEL_COORDINATE_LIMIT = 100000;
export const MIN_PANEL_DIMENSION = 0.1;
const EPS = 1e-8;
const finite3 = point => Array.isArray(point) && point.length === 3 && point.every(n => typeof n === 'number' && Number.isFinite(n));
const add = (a, b) => a.map((n, i) => n + b[i]);
const sub = (a, b) => a.map((n, i) => n - b[i]);
const mul = (a, n) => a.map(v => v * n);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = a => Math.hypot(...a);
const copy = corners => corners.map(point => [...point]);
const fail = (code, message) => ({ available: false, code, message, handles: [] });
const SIDE = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function handles(corners) {
  const result = corners.map((position, index) => ({
    id: `corner-${index}`, kind: 'corner', index, label: `Coin ${index + 1}`,
    position: [...position], axes: ['u', 'v'], signs: { u: SIDE[index][0], v: SIDE[index][1] },
    opposite: [...corners[(index + 2) % 4]], oppositeId: `corner-${(index + 2) % 4}`, fixedCornerIndices: [(index + 2) % 4],
  }));
  for (let index = 0; index < 4; index++) {
    const opposite = (index + 2) % 4, axis = index % 2 ? 'u' : 'v';
    result.push({
      id: `edge-${index}`, kind: 'edge', index, label: `Bord ${index + 1}`,
      position: mul(add(corners[index], corners[(index + 1) % 4]), 0.5),
      axes: [axis], signs: { [axis]: index === 0 || index === 3 ? -1 : 1 },
      opposite: mul(add(corners[opposite], corners[(opposite + 1) % 4]), 0.5),
      oppositeId: `edge-${opposite}`, fixedCornerIndices: [opposite, (opposite + 1) % 4],
    });
  }
  return result;
}

/**
 * A rectangle or enclosure mesh with a sloping top in its own plane.
 * c0→c1 is u, c0→c3 is v; crossed, sheared and warped panels are refused.
 * Handles use corner-0..3 and edge-0..3; edge-i joins corner i to (i+1)%4.
 */
export function panelResizeFrame(part) {
  const wall = part?.kind === 'wall';
  if (!wall && (!part || !['wood', 'mesh', 'roof'].includes(part.material) || !(part.kind === 'panel' || ['mesh', 'roof'].includes(part.material)))) {
    return fail('unsupported', 'Sélectionnez un grillage, un panneau rectangulaire ou un mur seul pour tirer ses poignées.');
  }
  let corners;
  try {
    if (wall) {
      if (!finite3(part.a) || !finite3(part.b) || !(part.height > 0) || Math.abs(part.a[1] - part.b[1]) > EPS) return fail('invalid', 'Le mur doit avoir une base horizontale et une hauteur positive.');
      corners = [[...part.a], [...part.b], add(part.b, [0, part.height, 0]), add(part.a, [0, part.height, 0])];
    } else corners = panelCorners(part);
  } catch { return fail('invalid', 'Les coins de cette surface sont incomplets.'); }
  if (!Array.isArray(corners) || corners.length !== 4 || !corners.every(finite3)) return fail('invalid', 'Les quatre coins du panneau doivent avoir des coordonnées valides.');
  if (corners.some(point => point.some(n => Math.abs(n) > PANEL_COORDINATE_LIMIT))) return fail('bounds', 'Le panneau dépasse les coordonnées autorisées du projet.');
  const horizontal = sub(corners[1], corners[0]), vertical = sub(corners[3], corners[0]);
  const width = length(horizontal), leftHeight = length(vertical);
  if (width <= EPS || leftHeight <= EPS) return fail('degenerate', 'La largeur et la hauteur du panneau doivent être positives.');
  const u = mul(horizontal, 1 / width), v = mul(vertical, 1 / leftHeight), normalRaw = cross(u, v);
  const right = sub(corners[2], corners[1]), rightHeight = dot(right, v), height = Math.max(leftHeight, rightHeight);
  const tolerance = Math.max(1e-6, Math.max(width, height) * 1e-8);
  // Enclosure side mesh has a sloping top. Keep both upright sides parallel
  // and preserve their height difference when moving the top/bottom edge.
  if (rightHeight <= EPS || Math.abs(dot(u, v)) > 1e-8 || length(sub(right, mul(v, rightHeight))) > tolerance) {
    return fail('not-rectangular', 'Cette forme ne possède pas deux côtés parallèles adaptés aux poignées. Modifiez ses coins dans Position.');
  }
  const normalLength = length(normalRaw);
  if (normalLength <= EPS) return fail('degenerate', 'Le panneau ne définit pas un plan de redimensionnement.');
  const normal = mul(normalRaw, 1 / normalLength), cloned = copy(corners);
  return {
    available: true, message: '', partId: part.id ?? null, origin: [...corners[0]], u, v, normal,
    width, height, minHeight: Math.min(leftHeight, rightHeight), rectangular: Math.abs(leftHeight - rightHeight) <= tolerance,
    corners: cloned, center: mul(add(corners[0], corners[2]), 0.5),
    handles: handles(cloned),
  };
}

function dimensionalChange(size, request, options) {
  const configuredMinimum = typeof options.minDimension === 'number' && Number.isFinite(options.minDimension) && options.minDimension > 0
    ? options.minDimension : MIN_PANEL_DIMENSION;
  // A previously imported very small rectangle must not jump on pointer-down.
  const minimum = Math.min(configuredMinimum, size);
  if (options.free === true) {
    const dimension = Math.max(minimum, size + request);
    return { delta: dimension - size, dimension, clamped: size + request < minimum };
  }
  const step = typeof options.step === 'number' && Number.isFinite(options.step) && options.step > 0 ? options.step : 1;
  // Restore exact half-step behaviour after subtracting large world coordinates.
  const desiredCount = Math.floor(request / step + 0.5 + 1e-9);
  const minimumCount = Math.ceil((minimum - size) / step - EPS);
  const count = Math.max(minimumCount, desiredCount);
  const delta = Number((count * step).toPrecision(15));
  return { delta, dimension: size + delta, clamped: count !== desiredCount };
}

/**
 * `worldPoint` is the desired position of the handle, not the camera ray origin.
 * Movement normal to the panel is ignored. Snapping applies to the dimensional
 * change from the ORIGINAL panel, not its world position or the previous preview.
 * Always supply the snapshot taken on pointer-down to avoid incremental drift.
 */
export function resizePanelFromPoint(part, handleId, worldPoint, options = {}) {
  const frame = panelResizeFrame(part);
  if (!frame.available) return frame;
  const handle = frame.handles.find(item => item.id === handleId);
  if (!handle) return fail('handle', 'Poignée de panneau inconnue.');
  if (!finite3(worldPoint)) return fail('point', 'La position de redimensionnement est invalide.');
  const pointerDelta = sub(worldPoint, handle.position), changes = {};
  for (const axis of handle.axes) {
    const size = axis === 'u' ? frame.width : frame.height;
    const minDimension = axis === 'v' ? size - frame.minHeight + (options.minDimension || MIN_PANEL_DIMENSION) : options.minDimension;
    changes[axis] = dimensionalChange(size, dot(pointerDelta, frame[axis]) * handle.signs[axis], { ...options, minDimension });
  }
  const changed = Object.values(changes).some(change => Math.abs(change.delta) > EPS);
  const corners = frame.corners.map((point, index) => {
    if (!changed) return [...point];
    const delta = [0, 0, 0];
    for (const axis of handle.axes) {
      if (SIDE[index][axis === 'u' ? 0 : 1] !== handle.signs[axis]) continue;
      const movement = mul(frame[axis], changes[axis].delta * handle.signs[axis]);
      for (let i = 0; i < 3; i++) delta[i] += movement[i];
    }
    // Keep all fixed corners bit-for-bit intact, including fractional positions.
    return point.map((n, i) => delta[i] === 0 ? n : n + delta[i]);
  });
  if (corners.some(point => !finite3(point) || point.some(n => Math.abs(n) > PANEL_COORDINATE_LIMIT))) {
    return fail('bounds', 'Le redimensionnement dépasse la limite du projet : ±100 000 mm par axe.');
  }
  const width = changes.u?.dimension ?? frame.width, height = changes.v?.dimension ?? frame.height;
  if (part.kind === 'wall' && height > 10000) return fail('bounds', 'La hauteur maximale du mur est de 10 000 mm.');
  if (!(width > 0 && height > 0)) return fail('degenerate', 'La largeur et la hauteur du panneau doivent rester positives.');
  const clamped = Object.values(changes).some(change => change.clamped);
  const nextHandle = handles(corners).find(item => item.id === handleId);
  return {
    available: true, code: clamped ? 'minimum' : 'ok', message: clamped ? 'Dimension minimale atteinte : le côté opposé reste fixe.' : '',
    partId: part.id ?? null, handleId, corners, a: [...corners[0]], b: [...corners[2]], width, height,
    area: width * (length(sub(corners[3],corners[0])) + length(sub(corners[2],corners[1]))) / 2e6,
    changed, clamped, handlePosition: [...nextHandle.position], opposite: [...handle.opposite],
    fixedCornerIndices: [...handle.fixedCornerIndices], normal: [...frame.normal],
    delta: { width: changes.u?.delta ?? 0, height: changes.v?.delta ?? 0 },
  };
}

/** Convert the common rectangular handles back to the native part geometry. */
export function surfaceResizePatch(part, corners) {
  const original = panelResizeFrame(part);
  if (!original.available) return original;
  const frame = panelResizeFrame({ ...part, kind: 'panel', material: 'mesh', corners });
  if (!frame.available) return frame;
  if (part.kind === 'wall') {
    if (!frame.rectangular || Math.abs(frame.u[1]) > EPS || Math.abs(frame.v[1] - 1) > EPS || frame.height > 10000) return fail('invalid', 'Le mur doit rester vertical et rectangulaire, avec une hauteur inférieure ou égale à 10 000 mm.');
    return { available: true, patch: { a: [...corners[0]], b: [...corners[1]], height: frame.height } };
  }
  return { available: true, patch: { corners: copy(corners), a: [...corners[0]], b: [...corners[2]] } };
}

/** Screen projection fallback: a wall seen from above still has a draggable length. */
export function resizeScreenDelta(frame, handleId, delta, basis) {
  const handle = frame.handles.find(h => h.id === handleId);
  if (!handle) return null;
  const axes = handle.axes.filter(axis => Math.hypot(...basis[axis]) > 1e-4);
  if (!axes.length) return null;
  const values = {}, determinant = basis.u[0] * basis.v[1] - basis.u[1] * basis.v[0];
  if (axes.length === 2 && Math.abs(determinant) > Math.hypot(...basis.u) * Math.hypot(...basis.v) * .15) {
    values.u = (delta[0] * basis.v[1] - delta[1] * basis.v[0]) / determinant;
    values.v = (basis.u[0] * delta[1] - basis.u[1] * delta[0]) / determinant;
  } else {
    const axis = axes.sort((a,b) => Math.hypot(...basis[b]) - Math.hypot(...basis[a]))[0], d = basis[axis];
    values[axis] = (delta[0] * d[0] + delta[1] * d[1]) / (d[0] ** 2 + d[1] ** 2);
  }
  return Object.entries(values).reduce((point,[axis,amount]) => add(point, mul(frame[axis], amount)), [0,0,0]);
}

/** Offset-aware drag: clicking near a handle does not move the panel on contact. */
export function resizePanelFromDrag(part, handleId, startWorldPoint, currentWorldPoint, options = {}) {
  const frame = panelResizeFrame(part);
  if (!frame.available) return frame;
  const handle = frame.handles.find(item => item.id === handleId);
  if (!handle) return fail('handle', 'Poignée de panneau inconnue.');
  if (!finite3(startWorldPoint) || !finite3(currentWorldPoint)) return fail('point', 'La position de redimensionnement est invalide.');
  return resizePanelFromPoint(part, handleId, add(handle.position, sub(currentWorldPoint, startWorldPoint)), options);
}

/** Ray coordinates in mm, direction arbitrary nonzero length; null if no forward hit. */
export function intersectPanelResizePlane(frame, rayOrigin, rayDirection) {
  if (!frame?.available || !finite3(frame.origin) || !finite3(frame.normal) || !finite3(rayOrigin) || !finite3(rayDirection)) return null;
  const directionLength = length(rayDirection);
  if (directionLength <= EPS) return null;
  const direction = mul(rayDirection, 1 / directionLength), denominator = dot(direction, frame.normal);
  if (Math.abs(denominator) < EPS) return null;
  const distance = dot(sub(frame.origin, rayOrigin), frame.normal) / denominator;
  if (distance < -EPS) return null;
  const point = add(rayOrigin, mul(direction, Math.max(0, distance)));
  return finite3(point) ? point : null;
}
