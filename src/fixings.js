/** Fixations schématiques positionnables. mm pour les données, mètres pour les géométries. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { timberQuaternion } from './geometry.js';

const TYPES = ['anchor', 'screw', 'bolt', 'connector'];
const FIELDS = { anchor: 'anchors', screw: 'screws', bolt: 'bolts', connector: 'connectors' };
const LABELS = { anchor: 'Ancrage', screw: 'Vis', bolt: 'Boulon', connector: 'Connecteur' };
const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const finite = (v, fallback = 0, min = -1000000, max = 1000000) => Number.isFinite(Number(v)) && v !== null && v !== '' && typeof v !== 'boolean' ? Math.min(max, Math.max(min, Number(v))) : fallback;
const validVector = v => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000000);
const vector = v => new THREE.Vector3(...v);
const cleanVector = v => v.toArray().map(n => Math.abs(n) < 1e-10 ? 0 : n);
const safeText = v => typeof v === 'string' ? v.replace(/[<>\u0000-\u001f]/g, '').slice(0, 120) : '';
const keyOf = (type, index) => `${type}:${index}`;
const countOf = (value, fallback = 0) => Math.round(finite(value, fallback, 0, 1000));
const normalizedQuaternion = value => {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000000)) return null;
  const q = new THREE.Quaternion(...value); return q.lengthSq() > 1e-12 ? q.normalize().toArray() : null;
};
function normalizeGeometry(raw) {
  const v = object(raw), result = {};
  for (const key of ['shaftLength', 'shaftDiameter', 'headDiameter', 'headHeight']) if (Number.isFinite(v[key])) result[key] = finite(v[key], 5, .1, 2000);
  if (Array.isArray(v.plates)) result.plates = v.plates.slice(0, 12).flatMap(rawPlate => {
    const p = object(rawPlate), quaternion = normalizedQuaternion(p.quaternion);
    if (!validVector(p.center) || !validVector(p.size) || p.size.some(n => n <= 0 || n > 10000) || !quaternion) return [];
    const holes = (Array.isArray(p.holes) ? p.holes : []).slice(0, 1000).filter(h => validVector(h) && h[2] > 0 && h[2] < Math.min(p.size[0], p.size[1]) / 2).map(h => [...h]);
    return [{ center: [...p.center], size: [...p.size], quaternion, holes }];
  });
  return result;
}

/** Les types actifs suivent les recettes effectivement comptées au devis. */
export function getFixingCounts(raw = {}) {
  const v = object(raw), recipe = typeof v.recipe === 'string' ? v.recipe : '';
  let active = TYPES;
  if (v.kind === 'foundation' || v.foundation === true || recipe.startsWith('foundation_')) active = ['anchor'];
  else if (['angle', 'hanger', 'plate'].includes(recipe)) active = ['connector', 'screw'];
  else if (recipe === 'screw' || recipe === 'wall_wood') active = ['screw'];
  else if (recipe === 'bolt') active = ['bolt'];
  else if (recipe === 'wood') active = ['screw', 'bolt'];
  else if (recipe.startsWith('wall_')) active = ['anchor'];
  return Object.fromEntries(TYPES.map(type => [FIELDS[type], active.includes(type) ? countOf(v[FIELDS[type]] ?? v[type]) : 0]));
}

/**
 * Les points sont identifiés par type + index, jamais par leur position.
 * Un ajout de quantité laisse les nouveaux indices à compléter automatiquement.
 */
export function normalizeFixingLayout(raw = {}, counts = {}) {
  const v = object(raw), quantities = getFixingCounts(counts), points = new Map();
  for (const rawPoint of (Array.isArray(v.points) ? v.points : []).slice(0, 4000)) {
    const p = object(rawPoint), type = p.type, index = Number(p.index);
    if (!TYPES.includes(type) || !Number.isInteger(index) || index < 0 || index >= quantities[FIELDS[type]] || !validVector(p.local)) continue;
    const point = { type, index, local: [...p.local] }, quaternion = normalizedQuaternion(p.quaternion);
    if (quaternion) point.quaternion = quaternion;
    if (p.geometry) point.geometry = normalizeGeometry(p.geometry);
    if (typeof p.incomplete === 'boolean') point.incomplete = p.incomplete;
    for (const key of ['supportPartId', 'connectorKey', 'placementNote']) if (safeText(p[key])) point[key] = safeText(p[key]);
    for (const key of ['plateIndex', 'holeIndex']) if (Number.isInteger(p[key]) && p[key] >= 0 && p[key] < 1000) point[key] = p[key];
    points.set(keyOf(type, index), point);
  }
  const result = { version: 1, mode: v.mode === 'manual' ? 'manual' : 'auto', points: [...points.values()].sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.index - b.index) };
  const f = object(v.frame);
  if (safeText(f.anchorPartId) && validVector(f.origin) && Array.isArray(f.quaternion) && f.quaternion.length === 4 && f.quaternion.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000000)) {
    const q = new THREE.Quaternion(...f.quaternion);
    if (q.lengthSq() > 1e-12) result.frame = { anchorPartId: safeText(f.anchorPartId), origin: [...f.origin], quaternion: q.normalize().toArray() };
  }
  return result;
}

function findParts(joint, model) {
  const parts = Array.isArray(model?.parts) ? model.parts : [];
  const a = parts.find(p => p.id === joint?.aPart), b = parts.find(p => p.id === joint?.bPart);
  return a && b && validVector(a.a) && validVector(a.b) && validVector(b.a) && validVector(b.b) && vector(a.a).distanceToSquared(vector(a.b)) > 1e-10 && vector(b.a).distanceToSquared(vector(b.b)) > 1e-10 ? { a, b } : null;
}

/** Repère rigide ancré à l’extrémité a : une variation de longueur ne décale pas l’origine. */
function partFrame(part) {
  if (!part || !validVector(part.a) || !validVector(part.b)) return null;
  const direction = vector(part.b).sub(vector(part.a));
  if (direction.lengthSq() < 1e-10) return null;
  let quaternion;
  if (part.kind === 'wall' || part.material === 'wall') {
    const x = direction.setY(0).normalize(), y = new THREE.Vector3(0, 1, 0);
    if (x.lengthSq() < .5) return null;
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  } else quaternion = timberQuaternion(part);
  return { origin: vector(part.a), quaternion };
}

function cornersOf(part) {
  if (Array.isArray(part.corners) && part.corners.length === 4 && part.corners.every(validVector)) return part.corners.map(vector);
  const a = vector(part.a), b = vector(part.b), out = [];
  if (part.kind === 'wall' || part.material === 'wall') {
    const dir = b.clone().sub(a).setY(0).normalize(), normal = new THREE.Vector3(-dir.z, 0, dir.x);
    for (const point of [a, b]) for (const side of [-1, 1]) for (const up of [0, 1]) out.push(point.clone().addScaledVector(normal, side * finite(part.width, 200, .1) / 2).add(new THREE.Vector3(0, up * finite(part.height, 2500, .1), 0)));
  } else {
    const q = timberQuaternion(part), center = a.clone().add(b).multiplyScalar(.5), length = a.distanceTo(b);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push(new THREE.Vector3(x * finite(part.width, 45, .1) / 2, y * finite(part.height, 70, .1) / 2, z * length / 2).applyQuaternion(q).add(center));
  }
  return out;
}
const interval = (points, axis) => { const values = points.map(p => p.dot(axis)); return [Math.min(...values), Math.max(...values)]; };
const intersection = (a, b) => Math.min(a[1], b[1]) > Math.max(a[0], b[0]) ? [Math.max(a[0], b[0]), Math.min(a[1], b[1])] : a;
function outputFrame(origin, x, y, z, span, anchorPartId, kind) {
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).normalize();
  return { origin: cleanVector(origin), basis: [cleanVector(x), cleanVector(y), cleanVector(z)], quaternion: quaternion.toArray(), span, anchorPartId, kind };
}

function autoFrame(joint, model) {
  const parts = findParts(joint, model); if (!parts) return null;
  const { a, b } = parts, wall = [a, b].find(p => p.kind === 'wall' || p.material === 'wall');
  if (joint.kind === 'foundation' || joint.foundation === true || joint.recipe?.startsWith('foundation_')) {
    const bottom = a.a[1] <= a.b[1] ? vector(a.a) : vector(a.b), z = new THREE.Vector3(0, 1, 0);
    let x = new THREE.Vector3(1, 0, 0).applyQuaternion(timberQuaternion(a)).setY(0);
    if (x.lengthSq() < 1e-10) x.set(1, 0, 0); x.normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const w = finite(b.width, a.width + 30, 1), d = finite(b.height, a.height + 30, 1);
    return outputFrame(bottom.add(new THREE.Vector3(0, 4, 0)), x, y, z, [w * .84, d * .84], a.id, 'foundation');
  }
  if (wall) {
    const timber = wall === a ? b : a, wallAlong = vector(wall.b).sub(vector(wall.a)).setY(0).normalize();
    if (wallAlong.lengthSq() < .5) return null;
    const center = vector(timber.a).add(vector(timber.b)).multiplyScalar(.5), wallCenter = vector(wall.a).add(vector(wall.b)).multiplyScalar(.5), z = new THREE.Vector3().crossVectors(wallAlong, new THREE.Vector3(0, 1, 0)).normalize();
    if (center.clone().sub(wallCenter).dot(z) < 0) z.negate();
    let x = vector(timber.b).sub(vector(timber.a)); x.addScaledVector(z, -x.dot(z));
    if (x.lengthSq() < 1e-10) x = wallAlong.clone(); x.normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize(), timberCorners = cornersOf(timber), wallCorners = cornersOf(wall);
    const u = intersection(interval(timberCorners, x), interval(wallCorners, x)), v = intersection(interval(timberCorners, y), interval(wallCorners, y)), depth = interval(timberCorners, z)[1];
    const origin = x.clone().multiplyScalar((u[0] + u[1]) / 2).addScaledVector(y, (v[0] + v[1]) / 2).addScaledVector(z, depth);
    return outputFrame(origin, x, y, z, [Math.max(1, (u[1] - u[0]) * .78), Math.max(1, (v[1] - v[0]) * .65)], a.id, 'wall');
  }
  // Pour le bois : point de jonction et face visible du premier élément. Les
  // connecteurs sont des repères de montage, pas leurs perçages fabricant.
  const anchor = partFrame(a); if (!anchor) return null;
  const long = vector(a.b).sub(vector(a.a)).normalize(), q = anchor.quaternion;
  const z = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize(), x = long, y = new THREE.Vector3().crossVectors(z, x).normalize();
  const source = validVector(joint.position) ? vector(joint.position) : vector(a.a).add(vector(a.b)).multiplyScalar(.5);
  const corners = cornersOf(a), plane = interval(corners, z)[1], origin = source.addScaledVector(z, plane - source.dot(z));
  const axial = interval(corners, x), centerU = origin.dot(x), around = Math.max(10, Math.min(120, (axial[1] - axial[0]) * .2));
  const spanX = Math.max(1, Math.min(around, 2 * Math.max(0, Math.min(centerU - axial[0], axial[1] - centerU))));
  return outputFrame(origin, x, y, z, [spanX, Math.max(1, finite(a.height, 70, .1) * .65)], a.id, 'wood');
}

/** Retour sérialisable : origin/basis en monde, quaternion [x,y,z,w], span en mm. */
export function getJointFixingFrame(joint, model) {
  const automatic = autoFrame(joint, model); if (!automatic) return null;
  const layout = normalizeFixingLayout(joint.fixingLayout, joint), saved = layout.frame;
  if (layout.mode !== 'manual' || !saved || saved.anchorPartId !== joint.aPart) return automatic;
  const parts = findParts(joint, model), anchor = partFrame(parts.a); if (!anchor) return automatic;
  const quaternion = anchor.quaternion.clone().multiply(new THREE.Quaternion(...saved.quaternion)).normalize();
  const origin = vector(saved.origin).applyQuaternion(anchor.quaternion).add(anchor.origin);
  const basis = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map(v => cleanVector(v.applyQuaternion(quaternion)));
  return { ...automatic, origin: cleanVector(origin), quaternion: quaternion.toArray(), basis, manual: true };
}

function automaticPositions(count, type, frame) {
  if (!count) return [];
  const [sx, sy] = frame.span;
  if (count === 1) return [[0, 0, type === 'connector' ? 1 : 0]];
  let columns, rows;
  if (frame.kind === 'wall' && sx / Math.max(1, sy) >= 3) { columns = count; rows = 1; }
  else { columns = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * sx / Math.max(1, sy))))); rows = Math.ceil(count / columns); }
  const positions = [];
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / columns), inRow = Math.min(columns, count - row * columns), col = index % columns;
    positions.push([inRow === 1 ? 0 : (col / (inRow - 1) - .5) * sx, rows === 1 ? 0 : (row / (rows - 1) - .5) * sy, type === 'connector' ? 1 : 0]);
  }
  return positions;
}
function toWorld(local, frame) { return vector(local).applyQuaternion(new THREE.Quaternion(...frame.quaternion)).add(vector(frame.origin)); }
function toLocal(world, frame) { return vector(world).sub(vector(frame.origin)).applyQuaternion(new THREE.Quaternion(...frame.quaternion).invert()); }

// Géométrie des faces réelles du bois, indépendante de son orientation dans la scène.
function timberFaces(part) {
  const q = timberQuaternion(part), axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map(v => v.applyQuaternion(q));
  const center = vector(part.a).add(vector(part.b)).multiplyScalar(.5), half = [part.width / 2, part.height / 2, vector(part.a).distanceTo(vector(part.b)) / 2], faces = [];
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const normal = axes[axis].clone().multiplyScalar(sign), uIndex = (axis + 1) % 3, u = axes[uIndex].clone(), v = new THREE.Vector3().crossVectors(normal, u).normalize();
    faces.push({ partId: part.id, part, axis, sign, normal, center: center.clone().addScaledVector(normal, half[axis]), u, v, hu: half[uIndex], hv: half[(axis + 2) % 3], depth: half[axis] * 2 });
  }
  return faces;
}
function faceInterval(face, point, direction, inset = 0) {
  const relative = point.clone().sub(face.center); let lo = -Infinity, hi = Infinity;
  for (const [axis, half] of [[face.u, face.hu - inset], [face.v, face.hv - inset]]) {
    const at = relative.dot(axis), along = direction.dot(axis);
    if (half <= 0 || (Math.abs(along) < 1e-9 && Math.abs(at) > half + .05)) return null;
    if (Math.abs(along) < 1e-9) continue;
    const ends = [(-half - at) / along, (half - at) / along].sort((a, b) => a - b); lo = Math.max(lo, ends[0]); hi = Math.min(hi, ends[1]);
  }
  return lo <= hi ? [lo, hi] : null;
}
function rectOnFace(face, center, x, y, width, height, thickness = 2.5) {
  // x × y doit pointer hors du bois : la tige des vis sera orientée vers −Z.
  if (new THREE.Vector3().crossVectors(x, y).dot(face.normal) < 0) x = x.clone().negate();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, face.normal)).normalize();
  return { center: center.clone().addScaledVector(face.normal, thickness / 2 + .25), quaternion, width, height, thickness, face, supportPartId: face.partId, holes: [], acceptsScrews: true };
}
function angleAtFaces(fa, fb, source) {
  const c = fa.normal.dot(fb.normal); if (Math.abs(c) > .94) return null;
  const da = fa.center.clone().sub(source).dot(fa.normal), db = fb.center.clone().sub(source).dot(fb.normal), divisor = 1 - c * c;
  const crease = source.clone().addScaledVector(fa.normal, (da - c * db) / divisor).addScaledVector(fb.normal, (db - c * da) / divisor);
  const tangent = new THREE.Vector3().crossVectors(fa.normal, fb.normal).normalize(), ia = faceInterval(fa, crease, tangent), ib = faceInterval(fb, crease, tangent);
  if (!ia || !ib) return null;
  const lo = Math.max(ia[0], ib[0]) + 2, hi = Math.min(ia[1], ib[1]) - 2, width = Math.min(80, (hi - lo) * .82);
  if (width < 16) return null;
  crease.addScaledVector(tangent, Math.max(lo + width / 2, Math.min(hi - width / 2, 0)));
  const alongA = fb.normal.clone().addScaledVector(fa.normal, -c).normalize(), alongB = fa.normal.clone().addScaledVector(fb.normal, -c).normalize();
  const availableA = faceInterval(fa, crease, alongA, .2), availableB = faceInterval(fb, crease, alongB, .2);
  if (!availableA || !availableB) return null;
  const legA = Math.min(110, Math.min(fa.part.width, fa.part.height) * 1.35, availableA[1] * .88), legB = Math.min(110, Math.min(fb.part.width, fb.part.height) * 1.35, availableB[1] * .88);
  if (legA < 16 || legB < 16) return null;
  const plates = [rectOnFace(fa, crease.clone().addScaledVector(alongA, legA / 2), tangent.clone(), alongA, width, legA), rectOnFace(fb, crease.clone().addScaledVector(alongB, legB / 2), tangent.clone(), alongB, width, legB)];
  return { origin: crease, plates, score: crease.distanceTo(source) + Math.abs(c) * 12, placementNote: Math.abs(c) < .05 ? 'Équerre ajustée aux deux faces du bois.' : 'Équerre pliée selon l’angle réel ; modèle commercial à préciser.' };
}
function flatOnFace(face, source) {
  const width = Math.min(130, face.hu * 1.6), height = Math.min(130, face.hv * 1.6), r = source.clone().sub(face.center);
  const u = Math.max(-face.hu + width / 2 + .5, Math.min(face.hu - width / 2 - .5, r.dot(face.u))), v = Math.max(-face.hv + height / 2 + .5, Math.min(face.hv - height / 2 - .5, r.dot(face.v)));
  return rectOnFace(face, face.center.clone().addScaledVector(face.u, u).addScaledVector(face.v, v), face.u.clone(), face.v.clone(), width, height);
}
function plateAssembly(aFaces, bFaces, source) {
  let best;
  for (const fa of aFaces.filter(f => f.axis !== 2)) for (const fb of bFaces.filter(f => f.axis !== 2)) {
    if (fa.normal.dot(fb.normal) < .995) continue;
    const pa = flatOnFace(fa, source), pb = flatOnFace(fb, source), offset = Math.abs(fa.center.clone().sub(fb.center).dot(fa.normal));
    const score = pa.center.distanceTo(source) + pb.center.distanceTo(source) + offset * 6;
    if (!best || score < best.score) best = { origin: pa.center.clone().add(pb.center).multiplyScalar(.5), plates: [pa, pb], score, placementNote: offset < .5 ? 'Plat/gousset sur les faces des deux bois.' : 'Plat à déport : faces décalées, pliage et référence à préciser.' };
  }
  if (!best) return null;
  // Raccord métallique continu entre les deux zones de vissage, y compris un
  // petit déport entre sections différentes. Il ne porte aucune vis fictive.
  const [pa, pb] = best.plates, normal = pa.face.normal, projected = pb.center.clone().sub(pa.center).addScaledVector(normal, -pb.center.clone().sub(pa.center).dot(normal));
  if (projected.lengthSq() > 1) {
    const direction = projected.clone().normalize(), cross = new THREE.Vector3().crossVectors(direction, normal).normalize();
    const edgeDistance = p => {
      const q = p.quaternion.clone().invert(), d = direction.clone().applyQuaternion(q);
      return Math.min(Math.abs(d.x) > 1e-8 ? p.width / 2 / Math.abs(d.x) : Infinity, Math.abs(d.y) > 1e-8 ? p.height / 2 / Math.abs(d.y) : Infinity);
    };
    const reachA = Math.min(edgeDistance(pa), projected.length() / 2), reachB = Math.min(edgeDistance(pb), projected.length() / 2);
    const start = pa.center.clone().addScaledVector(direction, reachA * .88), end = pb.center.clone().addScaledVector(direction, -reachB * .88), along = end.clone().sub(start), length = along.length();
    if (length > .5) {
      along.normalize(); const out = new THREE.Vector3().crossVectors(cross, along).normalize();
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(cross, along, out));
      best.plates.push({ center: start.add(end).multiplyScalar(.5).addScaledVector(normal, .15), quaternion, width: Math.min(pa.width, pa.height, pb.width, pb.height) * .75, height: length, thickness: 2.5, holes: [], acceptsScrews: false });
    }
  }
  return best;
}
function hangerAssembly(parts, aFaces, bFaces, source) {
  const receiver = parts.a.kind === 'post' ? parts.b : parts.b.kind === 'post' ? parts.a : parts.b, support = receiver === parts.a ? parts.b : parts.a;
  const receiverFaces = receiver === parts.a ? aFaces : bFaces, supportFaces = receiver === parts.a ? bFaces : aFaces, long = vector(receiver.b).sub(vector(receiver.a)).normalize();
  let selected;
  for (const sf of supportFaces.filter(f => Math.abs(f.normal.dot(long)) > .97)) {
    const sides = receiverFaces.filter(f => f.axis === 0).map(rf => angleAtFaces(sf, rf, source));
    if (sides.every(Boolean)) {
      const score = sides.reduce((sum, item) => sum + item.score, 0);
      if (!selected || score < selected.score) selected = { origin: sides[0].origin.clone().add(sides[1].origin).multiplyScalar(.5), plates: sides.flatMap(s => s.plates), score, placementNote: 'Sabot avec joues, ailes sur le support et fond sous le bois.' };
    }
  }
  const q = timberQuaternion(receiver), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q); if (up.y < 0) up.negate();
  const bottom = receiverFaces.reduce((best, face) => !best || face.normal.dot(up) < best.normal.dot(up) ? face : best, null);
  if (selected) {
    const sidePlates = selected.plates.filter(p => p.supportPartId === receiver.id), centers = sidePlates.map(p => p.center), midpoint = centers[0].clone().add(centers[1]).multiplyScalar(.5), projected = midpoint.clone().addScaledVector(bottom.normal, bottom.center.clone().sub(midpoint).dot(bottom.normal));
    const widthAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(q), depth = Math.min(...sidePlates.map(p => p.height));
    const seat = rectOnFace(bottom, projected, widthAxis, long, receiver.width + 5, depth); seat.acceptsScrews = false; selected.plates.push(seat); return selected;
  }
  // Un sabot inadéquat reste identifiable. Sa cuvette épouse le bois, mais
  // aucune fausse aile de fixation au support n’est inventée hors de ses faces.
  const sideFaces = receiverFaces.filter(f => f.axis === 0), sidePlates = sideFaces.map(f => flatOnFace(f, source));
  const center = sidePlates[0].center.clone().add(sidePlates[1].center).multiplyScalar(.5), seatCenter = center.clone().addScaledVector(bottom.normal, bottom.center.clone().sub(center).dot(bottom.normal));
  const seat = rectOnFace(bottom, seatCenter, new THREE.Vector3(1, 0, 0).applyQuaternion(q), long, receiver.width + 5, Math.min(...sidePlates.map(p => p.height))); seat.acceptsScrews = false;
  return { origin: center, plates: [...sidePlates, seat], score: Infinity, placementNote: `Cuvette ajustée ; ailes sur ${support.label || support.id} impossibles ici, montage à revoir.`, incomplete: true };
}
function connectorPlan(joint, model) {
  const counts = getFixingCounts(joint), parts = findParts(joint, model), records = new Map();
  if (!parts || !['angle', 'plate', 'hanger'].includes(joint.recipe) || parts.a.material !== 'wood' || parts.b.material !== 'wood' || !counts.connectors) return records;
  const source = validVector(joint.position) ? vector(joint.position) : vector(parts.a.b).add(vector(parts.b.a)).multiplyScalar(.5), af = timberFaces(parts.a), bf = timberFaces(parts.b);
  let assemblies;
  if (joint.recipe === 'plate') assemblies = [plateAssembly(af, bf, source)].filter(Boolean);
  else if (joint.recipe === 'hanger') assemblies = [hangerAssembly(parts, af, bf, source)];
  else {
    assemblies = af.flatMap(a => bf.map(b => angleAtFaces(a, b, source)).filter(Boolean)).sort((a, b) => a.score - b.score);
    // Évite plusieurs choix identiques sur une même arête, pour les paires d’équerres.
    assemblies = assemblies.filter((item, i, all) => !all.slice(0, i).some(previous => previous.origin.distanceTo(item.origin) < 2));
  }
  if (!assemblies.length) {
    const fallback = plateAssembly(af, bf, source);
    if (fallback) assemblies = [{ ...fallback, incomplete: true, placementNote: 'Faces sans angle intérieur exploitable : montage de l’équerre à revoir.' }];
    else return records;
  }
  let screwIndex = 0;
  for (let connector = 0; connector < counts.connectors; connector++) {
    const assembly = assemblies[connector % assemblies.length], origin = assembly.origin.clone(), quaternion = assembly.plates[0].quaternion.clone(), inverse = quaternion.clone().invert();
    const plates = assembly.plates.map(p => ({ ...p, holes: [] })), receiving = plates.filter(p => p.acceptsScrews), screwCount = Math.floor(counts.screws / counts.connectors) + (connector < counts.screws % counts.connectors ? 1 : 0);
    receiving.forEach((plate, surface) => {
      const n = Math.floor(screwCount / receiving.length) + (surface < screwCount % receiving.length ? 1 : 0), plateIndex = plates.indexOf(plate);
      const positions = automaticPositions(n, 'screw', { kind: 'plate', span: [Math.max(1, plate.width - Math.min(20, plate.width * .5)), Math.max(1, plate.height - Math.min(20, plate.height * .5))] });
      positions.forEach(local => {
        const holeIndex = plate.holes.length; plate.holes.push([local[0], local[1], 2.9]);
        const position = vector([local[0], local[1], plate.thickness / 2 + .1]).applyQuaternion(plate.quaternion).add(plate.center);
        records.set(keyOf('screw', screwIndex++), { position, quaternion: plate.quaternion.clone(), supportPartId: plate.supportPartId, connectorKey: keyOf('connector', connector), plateIndex, holeIndex, geometry: { shaftLength: plate.thickness + Math.min(50, plate.face.depth * .7), shaftDiameter: 5, headDiameter: 9, headHeight: 3 }, placementNote: assembly.placementNote });
      });
    });
    const geometry = { plates: plates.map(p => ({ center: cleanVector(p.center.clone().sub(origin).applyQuaternion(inverse)), size: [p.width, p.height, p.thickness], quaternion: inverse.clone().multiply(p.quaternion).normalize().toArray(), holes: p.holes })) };
    records.set(keyOf('connector', connector), { position: origin, quaternion, geometry, placementNote: assembly.placementNote, incomplete: !!assembly.incomplete });
  }
  return records;
}

// Une quantité ajoutée en mode manuel rejoint le connecteur déjà déplacé,
// sans remettre les anciennes vis sur la grille automatique.
function fitNewManualScrews(plan, saved, frame) {
  const occupied = [...saved.values()].filter(p => p.type === 'screw').map(p => toWorld(p.local, frame));
  for (const [key, record] of plan) {
    if (!key.startsWith('screw:') || saved.has(key)) continue;
    const connector = saved.get(record.connectorKey), plannedConnector = plan.get(record.connectorKey), plate = connector?.geometry?.plates?.[record.plateIndex], plannedPlate = plannedConnector?.geometry?.plates?.[record.plateIndex];
    if (!plate || !plannedPlate) continue;
    const connectorQ = new THREE.Quaternion(...frame.quaternion).multiply(new THREE.Quaternion(...(connector.quaternion || [0, 0, 0, 1]))), plateQ = connectorQ.clone().multiply(new THREE.Quaternion(...plate.quaternion));
    const center = vector(plate.center).applyQuaternion(connectorQ).add(toWorld(connector.local, frame));
    const hole = plannedPlate.holes[record.holeIndex], original = [hole[0] * plate.size[0] / plannedPlate.size[0], hole[1] * plate.size[1] / plannedPlate.size[1], plate.size[2] / 2 + .1];
    const candidates = [original, ...automaticPositions(Math.min(1000, Math.max(16, occupied.length * 2)), 'screw', { kind: 'plate', span: [Math.max(1, plate.size[0] - 12), Math.max(1, plate.size[1] - 12)] }).map(p => [p[0], p[1], original[2]])];
    let position = vector(original).applyQuaternion(plateQ).add(center);
    for (const candidate of candidates) { const world = vector(candidate).applyQuaternion(plateQ).add(center); if (occupied.every(p => p.distanceTo(world) > 8)) { position = world; break; } }
    record.position = position; record.quaternion = plateQ; occupied.push(position);
  }
}

function refreshManualHoles(instances) {
  const connectors = instances.filter(f => f.type === 'connector' && f.geometry?.plates?.length);
  for (const connector of connectors) {
    const inverse = new THREE.Quaternion(...connector.quaternion).invert();
    for (const plate of connector.geometry.plates) plate.holes = [];
    for (const screw of instances.filter(f => f.connectorKey === connector.key)) {
      const plate = connector.geometry.plates[screw.plateIndex]; if (!plate) continue;
      const position = vector(screw.position).sub(vector(connector.position)).applyQuaternion(inverse).sub(vector(plate.center)).applyQuaternion(new THREE.Quaternion(...plate.quaternion).invert());
      if (Math.abs(position.z - plate.size[2] / 2 - .1) < .2 && Math.abs(position.x) + 2.9 < plate.size[0] / 2 && Math.abs(position.y) + 2.9 < plate.size[1] / 2) {
        screw.holeIndex = plate.holes.length; plate.holes.push([position.x, position.y, 2.9]);
      } else screw.placementNote = 'Position manuelle hors de la plaque : implantation à ajuster.';
    }
  }
}

export function buildJointFixings(joint, model) {
  if (!joint || typeof joint.id !== 'string') return [];
  const frame = getJointFixingFrame(joint, model); if (!frame) return [];
  const counts = getFixingCounts(joint), layout = normalizeFixingLayout(joint.fixingLayout, joint), plan = connectorPlan(joint, model), frameQuaternion = new THREE.Quaternion(...frame.quaternion);
  const saved = new Map(layout.mode === 'manual' ? layout.points.map(p => [keyOf(p.type, p.index), p]) : []), instances = [];
  if (layout.mode === 'manual') fitNewManualScrews(plan, saved, frame);
  for (const type of TYPES) {
    const count = counts[FIELDS[type]], automatic = automaticPositions(count, type, frame), occupied = [...saved.entries()].filter(([key]) => key.startsWith(type + ':')).map(([, point]) => point.local);
    for (let index = 0; index < count; index++) {
      const key = keyOf(type, index), point = saved.get(key), planned = plan.get(key); let local = point?.local || (planned ? cleanVector(toLocal(planned.position.toArray(), frame)) : automatic[index]);
      // Après augmentation d’une quantité manuelle, évite de superposer exactement
      // un nouveau repère à un point conservé. Cette grille n’est pas une règle de pose.
      if (layout.mode === 'manual' && !saved.has(key) && !planned && occupied.some(p => vector(p).distanceTo(vector(local)) < .1)) {
        for (let candidate = 0; candidate < count * 2 + 1; candidate++) {
          const alternative = [(candidate / Math.max(1, count * 2) - .5) * frame.span[0], frame.span[1] * .25, local[2]];
          if (!occupied.some(p => vector(p).distanceTo(vector(alternative)) < .1)) { local = alternative; break; }
        }
      }
      occupied.push(local);
      const orientation = point ? (point.quaternion ? frameQuaternion.clone().multiply(new THREE.Quaternion(...point.quaternion)) : frameQuaternion.clone()) : planned?.quaternion || frameQuaternion;
      const basis = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map(v => cleanVector(v.applyQuaternion(orientation)));
      const metadata = {};
      for (const field of ['geometry', 'supportPartId', 'connectorKey', 'plateIndex', 'holeIndex', 'placementNote', 'incomplete']) if ((point?.[field] ?? planned?.[field]) !== undefined) metadata[field] = structuredClone(point?.[field] ?? planned?.[field]);
      instances.push({ id: `${joint.id}:${key}`, key, jointId: joint.id, type, index, position: cleanVector(toWorld(local, frame)), quaternion: orientation.toArray(), basis, local: [...local], ...metadata, label: `${LABELS[type]} ${index + 1} · ${joint.id}`, recipe: joint.recipe || '', anchorPartId: joint.aPart, mode: layout.mode, schematic: true });
    }
  }
  if (layout.mode === 'manual') refreshManualHoles(instances);
  return instances;
}

/** Capture l’implantation actuelle dans un repère attaché à aPart. */
export function toManualFixingLayout(joint, model) {
  const frame = getJointFixingFrame(joint, model), parts = findParts(joint, model);
  if (!frame || !parts) throw new Error('Impossible de placer les fixations : éléments de la liaison absents ou dégénérés.');
  const anchor = partFrame(parts.a); if (!anchor) throw new Error('Le premier élément ne possède pas de repère exploitable.');
  const inverse = anchor.quaternion.clone().invert();
  const inverseFrame = new THREE.Quaternion(...frame.quaternion).invert();
  const result = { version: 1, mode: 'manual', frame: { anchorPartId: joint.aPart, origin: cleanVector(vector(frame.origin).sub(anchor.origin).applyQuaternion(inverse)), quaternion: inverse.clone().multiply(new THREE.Quaternion(...frame.quaternion)).normalize().toArray() }, points: buildJointFixings(joint, model).map(instance => {
    const point = { type: instance.type, index: instance.index, local: [...instance.local], quaternion: inverseFrame.clone().multiply(new THREE.Quaternion(...instance.quaternion)).normalize().toArray() };
    for (const field of ['geometry', 'supportPartId', 'connectorKey', 'plateIndex', 'holeIndex', 'placementNote', 'incomplete']) if (instance[field] !== undefined) point[field] = structuredClone(instance[field]);
    return point;
  }) };
  return normalizeFixingLayout(result, joint);
}

/** Change un point en coordonnées monde et retourne le layout à sauvegarder. */
export function moveJointFixing(joint, model, fixingId, worldPosition) {
  if (!validVector(worldPosition)) throw new RangeError('La position doit contenir trois coordonnées finies en millimètres.');
  const layout = toManualFixingLayout(joint, model), manualJoint = { ...joint, fixingLayout: layout };
  const instance = buildJointFixings(manualJoint, model).find(f => f.id === fixingId || f.key === fixingId);
  if (!instance) throw new Error('Fixation introuvable dans les quantités actuelles de la liaison.');
  const frame = getJointFixingFrame(manualJoint, model), local = cleanVector(toLocal(worldPosition, frame));
  const point = layout.points.find(p => p.type === instance.type && p.index === instance.index), delta = local.map((n, i) => n - point.local[i]); point.local = local;
  if (instance.type === 'connector') for (const child of layout.points.filter(p => p.connectorKey === instance.key)) child.local = child.local.map((n, i) => n + delta[i]);
  return normalizeFixingLayout(layout, joint);
}

/** Pseudo-liaisons visuelles uniquement : ne pas les insérer dans model.joints/BOM. */
export function getFoundationJoints(model, project = {}) {
  if (!Array.isArray(model?.posts) || !Array.isArray(model?.parts)) return [];
  const result = [];
  for (const post of model.posts) {
    if (!['plate_mechanical', 'plate_chemical'].includes(post.foundation)) continue;
    const base = model.parts.find(p => p.id === `PIED-${post.id}`), timber = model.parts.find(p => p.id === post.id);
    if (!base || !timber) continue;
    const joint = { id: `BASE-${post.id}`, kind: 'foundation', foundation: true, aPart: post.id, bPart: base.id, position: [...base.a], recipe: post.foundation === 'plate_chemical' ? 'foundation_chemical' : 'foundation_mechanical', anchors: countOf(project.anchorsPerBase, 4), screws: 0, bolts: 0, connectors: 0, resinDose: finite(project.resinYield, 10, 0, 1000), reference: '', notes: '', valid: true };
    joint.fixingLayout = normalizeFixingLayout(object(project.baseFixingLayouts)[post.id], joint);
    result.push(joint);
  }
  return result;
}

/** Géométrie illustrative, en mètres. +Z sort du support ; tige vers −Z. */
export function createFixingGeometry(type, options = {}) {
  const { recipe = '' } = options, specification = normalizeGeometry(options);
  if (!TYPES.includes(type)) throw new Error('Type de fixation inconnu.');
  const geometries = [];
  const cylinder = (radius, height, z, sides = 12) => { const g = new THREE.CylinderGeometry(radius, radius, height, sides).rotateX(Math.PI / 2).translate(0, 0, z); geometries.push(g); };
  const plate = (w, h, d, x, y, z) => geometries.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  if (type === 'connector') {
    if (specification.plates?.length) for (const p of specification.plates) {
      const [w, h, d] = p.size.map(n => n / 1000), outline = new THREE.Shape();
      outline.moveTo(-w / 2, -h / 2); outline.lineTo(w / 2, -h / 2); outline.lineTo(w / 2, h / 2); outline.lineTo(-w / 2, h / 2); outline.closePath();
      for (const [x, y, radius] of p.holes) if (Math.abs(x) + radius < p.size[0] / 2 && Math.abs(y) + radius < p.size[1] / 2) { const hole = new THREE.Path(); hole.absellipse(x / 1000, y / 1000, radius / 1000, radius / 1000, 0, Math.PI * 2, true, 0); outline.holes.push(hole); }
      const g = new THREE.ExtrudeGeometry(outline, { depth: d, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -d / 2);
      g.applyQuaternion(new THREE.Quaternion(...p.quaternion)); g.translate(...p.center.map(n => n / 1000)); geometries.push(g);
    }
    else if (recipe === 'hanger') { plate(.05, .05, .003, 0, 0, 0); plate(.003, .05, .04, -.0265, 0, -.02); plate(.003, .05, .04, .0265, 0, -.02); }
    else { plate(.045, .045, .003, 0, 0, 0); if (recipe !== 'plate') plate(.045, .003, .045, 0, -.024, -.021); }
  } else {
    const dimensions = type === 'anchor' ? { shaft: .004, length: .09, head: .008, headHeight: .006 } : type === 'bolt' ? { shaft: .005, length: .06, head: .009, headHeight: .007 } : { shaft: .0025, length: .05, head: .0045, headHeight: .003 };
    if (specification.shaftLength) dimensions.length = specification.shaftLength / 1000;
    if (specification.shaftDiameter) dimensions.shaft = specification.shaftDiameter / 2000;
    if (specification.headDiameter) dimensions.head = specification.headDiameter / 2000;
    if (specification.headHeight) dimensions.headHeight = specification.headHeight / 1000;
    cylinder(dimensions.shaft, dimensions.length, -dimensions.length / 2);
    cylinder(dimensions.head, dimensions.headHeight, dimensions.headHeight / 2, type === 'screw' ? 12 : 6);
    if (type !== 'screw') cylinder(dimensions.head * 1.35, .002, -.001, 16);
  }
  const nonIndexed = geometries.map(g => g.index ? g.toNonIndexed() : g), merged = mergeGeometries(nonIndexed, false);
  for (const g of new Set([...geometries, ...nonIndexed])) g.dispose();
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  merged.userData = { schematic: true, type, units: 'm', note: 'Représentation générique sans dimensions commerciales ni capacité validée.' };
  return merged;
}
