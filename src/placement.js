/** Placement V0.22. Géométrie en mm ; aucune rotation ni liaison créée implicitement. */
import { convertToFree, translateParts } from './engine.js';
import {getObjectSnapCandidates,getContactBounds,contactBox} from './object-snapping.js';
import {resolveAdaptiveGrid} from './adaptive-placement.js';

const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, n) => a.map(v => v * n);
const mean = points => points.reduce((out, point) => add(out, scale(point, 1 / points.length)), [0, 0, 0]);
const vecOK = a => Array.isArray(a) && a.length === 3 && a.every(v => typeof v === 'number' && Number.isFinite(v));
const indexOf = axis => ({ x: 0, y: 1, z: 2 })[axis];
const clean = a => a.map(v => Math.abs(v) < 1e-10 ? 0 : v);

/** Enveloppes exactes de bois, murs et panneaux rectangulaires. */
export const getPartBounds=getContactBounds;
const boxOf=contactBox;

function freeProject(input) {
  if (!input || typeof input !== 'object') return null;
  try { return convertToFree(input); } catch { return null; }
}
function selection(input, ids) {
  const project = freeProject(input);
  if (!project || !Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) return null;
  const unique = [...new Set(ids)], parts = unique.map(id => project.freeParts.find(p => p.id === id));
  if (parts.some(p => !p || !boxOf(p))) return null;
  return { project, ids: unique, parts };
}
function boundsOfParts(parts) {
  const boxes = parts.map(getPartBounds);
  const min = [0, 1, 2].map(i => Math.min(...boxes.map(p => p.min[i]))), max = [0, 1, 2].map(i => Math.max(...boxes.map(p => p.max[i])));
  return { min, max, center: mean(boxes.map(b => b.center)), boxCenter: scale(add(min, max), .5), width: max[0] - min[0], height: max[1] - min[1], depth: max[2] - min[2], partIds: parts.map(p => p.id) };
}
/** center = moyenne des centres de pièces ; boxCenter = centre de l’enveloppe. */
export function selectionBounds(project, ids) {
  const selected = selection(project, ids); return selected ? boundsOfParts(selected.parts) : null;
}
function pair(input, ids, referenceId) {
  const selected = selection(input, ids);
  if (!selected || selected.ids.includes(referenceId)) return null;
  const reference = selected.project.freeParts.find(p => p.id === referenceId), referenceBounds = getPartBounds(reference);
  if (!referenceBounds) return null;
  return { ...selected, reference, movingBounds: boundsOfParts(selected.parts), referenceBounds };
}

/** Valeur signée : une valeur négative indique mauvais côté ou recouvrement projeté. */
export function measurePartSpacing(project, movingIds, referenceId, axis = 'x', measure = 'faces', side = 1) {
  const i = indexOf(axis), data = pair(project, movingIds, referenceId);
  if (!data || i === undefined || !['faces', 'axes'].includes(measure) || ![1, -1].includes(side)) return null;
  const a = data.movingBounds, b = data.referenceBounds;
  if (measure === 'axes') return side * (a.center[i] - b.center[i]);
  return side === 1 ? a.min[i] - b.max[i] : b.min[i] - a.max[i];
}
function validateTranslation(data, delta) {
  if (!vecOK(delta)) throw new Error('Le déplacement doit comporter trois coordonnées finies.');
  for (const part of data.parts) for (const point of part.corners||[part.a,part.b]) if (add(point, delta).some(v => Math.abs(v) > 100000)) throw new RangeError('Ce déplacement dépasse les limites du projet (±100 000 mm).');
}
export function setPartSpacing(project, movingIds, referenceId, options = {}) {
  const { axis = 'x', distance = 500, measure = 'faces', side = 1 } = options || {};
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) throw new RangeError('L’écart demandé doit être un nombre positif ou nul, en millimètres.');
  const data = pair(project, movingIds, referenceId), current = measurePartSpacing(project, movingIds, referenceId, axis, measure, side);
  if (!data || current === null) throw new Error('Sélection et référence distinctes requises : pièces rectangulaires, axe X/Y/Z et côté +1 ou −1.');
  const delta = [0, 0, 0]; delta[indexOf(axis)] = side * (distance - current);
  validateTranslation(data, delta);
  return translateParts(data.project, data.ids, delta);
}

export function computeAlignmentDelta(project, movingIds, referenceId, options = {}) {
  const { axis = 'x', feature = 'center' } = options || {}, i = indexOf(axis), data = pair(project, movingIds, referenceId);
  if (!data || i === undefined || !['min', 'center', 'max'].includes(feature)) return null;
  const delta = [0, 0, 0]; delta[i] = data.referenceBounds[feature][i] - data.movingBounds[feature][i];
  return clean(delta);
}
/** Aligne une coordonnée seulement ; ne prétend pas vérifier les collisions. */
export function alignParts(project, movingIds, referenceId, options = {}) {
  const data = pair(project, movingIds, referenceId), delta = computeAlignmentDelta(project, movingIds, referenceId, options);
  if (!data || !delta) throw new Error('Alignement impossible : sélection de pièces rectangulaires, référence distincte, axe et face valides requis.');
  validateTranslation(data, delta);
  return translateParts(data.project, data.ids, delta);
}

/** Propositions explicites issues du même calcul que le déplacement direct.
 * Le nom historique « kind » est gardé pour les commandes existantes ; snapKind
 * décrit l'aide fine, contactType le contact réel. Aucune rotation ni attache.
 */
export function getPlacementSuggestions(project, selectedIds, tolerance=75, options={}){
 if(typeof tolerance!=='number'||!Number.isFinite(tolerance)||tolerance<=0)return [];
 const data=selection(project,selectedIds);if(!data)return [];
 const selected=new Set(data.ids),targets=data.project.freeParts.filter(p=>!selected.has(p.id)),preferences=data.project.objectSnap||{};
 const strictGrid=data.project.assistance?.gridSnap?resolveAdaptiveGrid(data.project):null;
 const candidates=getObjectSnapCandidates(data.parts,targets,{tolerance:Math.min(tolerance,1000),featureTolerance:Math.min(30,tolerance),localGrid:preferences.localGrid!==false,gridStep:preferences.gridStep||10,workplane:data.project.workplane,lock:!!data.project.workplane?.lock,strictGrid,...options});
 return candidates.filter(candidate=>{
  if(candidate.alreadyPlaced&&data.project.freeJoints.some(j=>j.aPart===candidate.sourceId&&j.bPart===candidate.targetId||j.aPart===candidate.targetId&&j.bPart===candidate.sourceId))return false;
  try{validateTranslation(data,candidate.delta);return true}catch{return false}
 }).slice(0,8).map(candidate=>({...candidate,id:`place:${candidate.key}`,snapKind:candidate.kind,kind:candidate.contactType,selectedIds:[...data.ids],note:'Contact géométrique ; attache et fixation à choisir séparément.'}));
}
