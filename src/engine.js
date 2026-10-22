import {normalizeSheetSettings} from './paper-sheets.js';
import {normalizeTechnicalViewOptions} from './technical-views.js';
import {normalizeDrawing} from './plan-dimensions.js';
import {normalizeAssistance} from './adaptive-placement.js';
import {normalizeAttachments,duplicateAttachments} from './attachments.js';
import {normalizeManufacturing,cuttingParts} from './manufacturing.js';
/** Atelier V0.4 : édition libre et liaisons individualisées. Unités : mm, degrés. */
import * as legacy from './model.js';
import {normalizeWorkplane,DEFAULT_WORKPLANE} from './workplane.js';
import {normalizeFixingLayout} from './fixings.js';
import {normalizeWorkshop,applyWorkshopBOM} from './materials.js';
import {normalizeElectrical,electricalRows} from './electrical.js';
import {normalizeAppearance} from './surface-catalog.js';
export const SOURCES = legacy.SOURCES;
export const DEFAULT_PROJECT = { ...legacy.DEFAULT_PROJECT, version: 5, mode: 'parametric', freeParts: [], freeJoints: [], attachments: [], attachmentSettings: {autoAttach:false}, attachmentConflicts: [], placementSurface:'ground', jointOverrides: {}, grid: 1, assistance:{gridMode:'fixed',gridStep:10,gridSnap:false}, precisionVersion: 1, workplane: DEFAULT_WORKPLANE, snap: true, nextId: 1 };
const src = id => SOURCES.find(s => s.id === id);
const extraRecipe = (id, label, family, supports, components, conditions, sourceId = 'connectors') => ({ id, label, family, supports, components, description: 'Recette générique d’estimation, à adapter au produit retenu.', conditions, estimated: true, source: src(sourceId).label, url: src(sourceId).url });
export const RECIPES = [...legacy.RECIPES,
  extraRecipe('hanger', 'Sabot de charpente', 'joint', ['wood'], ['Sabot', 'Vis de connecteur'], 'Modèle, appuis, orientation et nombre de vis à vérifier sur le plan de fixation du sabot.'),
  extraRecipe('plate', 'Plaque / gousset', 'joint', ['wood'], ['Plaque', 'Vis de connecteur'], 'Géométrie, épaisseur et fixations à déterminer. Les quantités ne valident pas l’assemblage.'),
  extraRecipe('wood', 'Assemblage bois usiné', 'joint', ['wood'], ['Usinage', 'Fixations complémentaires si renseignées'], 'Tenon, mortaise ou mi-bois à concevoir ; aucune déduction de matière ni vérification de résistance automatique.'),
  extraRecipe('wall_mechanical', 'Mur : ancrage mécanique', 'wall', ['concrete', 'solid_brick', 'solid_block'], ['Ancrages'], 'Produit évalué pour le support exact ; épaisseur, bords, perçage et efforts à vérifier.', 'fischer'),
  extraRecipe('wall_chemical', 'Mur plein : scellement chimique', 'wall', ['concrete', 'solid_brick', 'solid_block'], ['Tiges, écrous, rondelles', 'Résine'], 'Système complet, support exact, nettoyage, dose et durcissement à confirmer.', 'fischer'),
  extraRecipe('wall_screen', 'Mur creux : scellement avec tamis', 'wall', ['hollow_brick', 'hollow_block'], ['Tiges, écrous, rondelles', 'Tamis', 'Résine'], 'Tamis uniquement si prescrit par le système et adapté au bloc réel ; dose et perçage à confirmer.', 'fischer'),
  extraRecipe('wall_wood', 'Mur bois : fixation dans l’ossature', 'wall', ['wood'], ['Vis structurelles'], 'Reprise dans les montants porteurs identifiés ; épaisseurs, position des montants et distances aux bords à vérifier.'),
  extraRecipe('wall_distance', 'Façade : fixation à distance', 'wall', ['concrete', 'solid_brick', 'solid_block', 'hollow_brick', 'hollow_block', 'wood'], ['Kits de fixation à distance', 'Étanchéité à préciser'], 'Système traversant l’isolation vers le support porteur. Déport, étanchéité et accessoires propres au kit à confirmer.', 'fischer')
];
const jointRecipes = RECIPES.filter(r => r.family === 'joint' || r.family === 'wall');
const foundations = legacy.RECIPES.filter(r => r.family === 'foundation').map(r => r.id).concat('none');
const supportTypes = ['unknown', 'concrete', 'solid_brick', 'solid_block', 'hollow_brick', 'hollow_block', 'cellular', 'stone', 'wood', 'plaster', 'insulation'];
const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const num = (v, def, lo = -100000, hi = 100000) => v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? def : Math.max(lo, Math.min(hi, Number(v)));
const str = (v, def = '', max = 160) => typeof v === 'string' ? v.replace(/[<>\u0000-\u001f]/g, '').slice(0, max) : def;
const safeID = id => typeof id === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const choice = (v, opts, def) => opts.includes(v) ? v : def;
const vec = (v, def = [0, 0, 0]) => [0, 1, 2].map(i => num(Array.isArray(v) ? v[i] : undefined, def[i]));
const plus = (a, b) => a.map((v, i) => v + b[i]);
const minus = (a, b) => a.map((v, i) => v - b[i]);
const times = (a, n) => a.map(v => v * n);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = a => Math.hypot(...a);
const distance = (a, b) => length(minus(a, b));
const round = (v, digits = 3) => Math.round((v + Number.EPSILON) * 10 ** digits) / 10 ** digits;
const unit = a => length(a) > 1e-8 ? times(a, 1 / length(a)) : [0, 1, 0];
const section = part => `${round(part.width)} × ${round(part.height)} mm`;
const allocate = (p, prefix = 'F') => `${prefix}-${String(p.nextId++).padStart(6, '0')}`;
const jointDefault = id => ({ connectors: ['angle', 'hanger', 'plate'].includes(id) ? 1 : 0, screws: id === 'screw' ? 2 : id === 'wall_wood' ? 4 : id === 'hanger' ? 12 : ['angle', 'plate'].includes(id) ? 8 : 0, bolts: id === 'bolt' ? 1 : 0, anchors: id.startsWith('wall_') && id !== 'wall_wood' ? 4 : 0, resinDose: 10, reference: '', notes: '' });
export function getJointDefaults(recipe = 'angle') {
  const id = choice(recipe, jointRecipes.map(r => r.id), 'angle');
  return { recipe: id, ...jointDefault(id) };
}

function normalizeConfig(raw, fallback = 'angle', partial = false) {
  const v = object(raw), recipe = choice(v.recipe || v.type, jointRecipes.map(r => r.id), fallback);
  const result = partial ? {} : { recipe, ...jointDefault(recipe) };
  if (!partial || v.recipe !== undefined || v.type !== undefined) result.recipe = recipe;
  for (const key of ['connectors', 'screws', 'bolts', 'anchors', 'resinDose']) if (!partial || v[key] !== undefined) {
    const value = num(v[key], jointDefault(recipe)[key], 0, 1000);
    result[key] = key === 'resinDose' ? value : Math.round(value);
  }
  for (const key of ['reference', 'notes']) if (!partial || v[key] !== undefined) result[key] = str(v[key], '', key === 'notes' ? 2000 : 160);
  if (!partial || v.fixingLayout !== undefined) result.fixingLayout = normalizeFixingLayout(v.fixingLayout, {...jointDefault(recipe),...result});
  return result;
}

function normalizePart(raw, p, id) {
  const v = object(raw);
  const kind = choice(v.kind, ['post', 'beam', 'brace', 'panel', 'wall'], ['mesh', 'roof'].includes(v.kind) ? 'panel' : 'beam');
  const material = kind === 'wall' ? 'wall' : choice(v.material, ['wood', 'mesh', 'roof'], kind === 'panel' ? 'mesh' : 'wood');
  const part = { id, label: str(v.label, kind === 'wall' ? 'Mur existant' : 'Pièce libre'), kind, material, a: vec(v.a), b: vec(v.b, [0, 1000, 0]), width: num(v.width, kind === 'wall' ? 200 : kind === 'panel' ? 1 : 45, 0.1, 2000), height: num(v.height, kind === 'wall' ? 2500 : 70, 0.1, 10000), roll: num(v.roll, 0, -36000, 36000), species: choice(v.species, ['pin', 'douglas', 'meleze', 'chene', 'other'], p.material), group: choice(v.group, ['structure', 'gate', 'mesh', 'foundation', 'roof', 'wall'], kind === 'wall' ? 'wall' : kind === 'panel' ? (material === 'roof' ? 'roof' : 'mesh') : 'structure'), foundation: choice(v.foundation, foundations, p.foundation), ground: choice(v.ground, ['soil', 'concrete', 'pavers', 'unknown'], p.ground), wallSupport: choice(v.wallSupport, supportTypes, 'unknown'), wallThickness: num(v.wallThickness, v.width || 200, 1, 2000), insulation: num(v.insulation, 0, 0, 1000), gap: num(v.gap, 0, 0, 2000) };
  part.groupName = str(v.groupName, '', 80);
  if(v.selectLinked===false)part.selectLinked=false;
  part.lengthLocked = v.lengthLocked !== false;
  part.adaptation = choice(v.adaptation, ['fixed','beam','panel'], 'fixed');
  part.grouped=v.grouped===true||(v.grouped!==false&&!!part.groupName&&!['Structure','Portillon','Grillage','Toiture','Appuis','Fondations','Murs'].includes(part.groupName));
  if (v.orientation === 'gateVertical') part.orientation = v.orientation;
  if (kind === 'wall') { part.b[1] = part.a[1]; part.wallThickness = part.width; }
  if (kind === 'panel') {
    if (Array.isArray(v.corners) && v.corners.length === 4) part.corners = v.corners.map(c => vec(c));
    else part.corners = [[part.a[0], part.a[1], part.a[2]], [part.b[0], part.a[1], part.b[2]], [...part.b], [part.a[0], part.b[1], part.a[2]]];
    part.a = [...part.corners[0]]; part.b = [...part.corners[2]];
  }
  return part;
}

export function normalizeProject(input = {}) {
  const v = object(input), p = { ...legacy.normalizeProject(v), version: 5, mode: v.mode === 'free' ? 'free' : 'parametric', grid: num(v.precisionVersion!==1&&v.grid===50?1:v.grid, 1, .1, 1000), precisionVersion: 1, workplane: normalizeWorkplane(v.workplane), snap: typeof v.snap === 'boolean' ? v.snap : true, nextId: Math.floor(num(v.nextId, 1, 1, 1e9)), freeParts: [], freeJoints: [], jointOverrides: {}, importWarnings: [...new Set((Array.isArray(v.importWarnings) ? v.importWarnings : []).slice(0, 100).map(message => str(message, '', 240)).filter(Boolean))] };
  p.placementSurface=choice(v.placementSurface,['ground','face','workplane'],'ground');
  p.appearance=normalizeAppearance(v.appearance,p.ground);
  p.attachmentSettings={autoAttach:object(v.attachmentSettings).autoAttach===true};
  p.joint = choice(v.joint, ['angle', 'screw', 'bolt', 'hanger', 'plate', 'wood'], legacy.DEFAULT_PROJECT.joint);
  p.workshop = normalizeWorkshop(v.workshop);
  p.manufacturing = normalizeManufacturing(v.manufacturing);
  p.assistance = normalizeAssistance(v.assistance);
  const objectSnap=object(v.objectSnap);
  p.objectSnap={enabled:objectSnap.enabled!==false,localGrid:objectSnap.localGrid!==false,gridStep:num(objectSnap.gridStep,10,.1,1000)};
  p.drawing = normalizeDrawing(v.drawing);
  p.paper = normalizeSheetSettings(v.paper);
  p.technical = normalizeTechnicalViewOptions(v.technical);
  p.electrical = normalizeElectrical(v.electrical);
  p.baseFixingLayouts = {};
  for (const [id,layout] of Object.entries(object(v.baseFixingLayouts)).slice(0,1000)) if(safeID(id)) p.baseFixingLayouts[id]=normalizeFixingLayout(layout,{anchors:p.anchorsPerBase});
  const rawParts = Array.isArray(v.freeParts) ? v.freeParts : [], rawJoints = Array.isArray(v.freeJoints) ? v.freeJoints : [];
  if (rawParts.length > 1000 || rawJoints.length > 5000) throw new Error('Projet trop volumineux : maximum 1 000 pièces et 5 000 liaisons dans cette version.');
  for (const item of [...rawParts, ...rawJoints]) { const match = String(item?.id).match(/^[FJ]-(\d+)$/); if (match) p.nextId = Math.max(p.nextId, Number(match[1]) + 1); }
  const used = new Set();
  for (const raw of rawParts) {
    let id = raw?.id;
    if (!safeID(id) || used.has(id)) { id = allocate(p); p.importWarnings.push('Un identifiant de pièce absent ou dupliqué a été remplacé ; vérifier ses liaisons.'); }
    used.add(id); p.freeParts.push(normalizePart(raw, p, id));
  }
  p.attachments=normalizeAttachments(v.attachments,p.freeParts,{warnings:p.importWarnings});
  const attachmentIds=new Set(p.attachments.map(a=>a.id));
  p.attachmentConflicts=(Array.isArray(v.attachmentConflicts)?v.attachmentConflicts:[]).filter(c=>c&&attachmentIds.has(c.attachmentId)&&p.freeParts.some(a=>a.id===c.sourceId)).slice(0,1000).map(c=>({attachmentId:c.attachmentId,sourceId:c.sourceId,message:str(c.message,'Attache à revoir.',500)}));
  p.importWarnings=[...new Set(p.importWarnings)].slice(0,100);
  for (const raw of rawJoints) {
    const item = object(raw); let id = item.id;
    if (!safeID(id) || used.has(id)) { id = allocate(p, 'J'); p.importWarnings.push('Un identifiant de liaison absent ou dupliqué a été remplacé.'); }
    used.add(id); p.freeJoints.push({ id, aPart: str(item.aPart), bPart: str(item.bPart), ...normalizeConfig(item, p.joint) });
  }
  for (const [id, config] of Object.entries(object(v.jointOverrides))) if (safeID(id)) p.jointOverrides[id] = normalizeConfig(config, p.joint, true);
  // Conserve les anciens stocks/prix/checklists et en offre une clé par essence.
  for (const field of ['stock', 'prices', 'purchased']) for (const [id, value] of Object.entries(p[field])) {
    const match = id.match(/^wood-(custom-)?(\d+(?:\.\d+)?x\d+(?:\.\d+)?-\d+)$/);
    if (match) { const next = `wood-${match[1] || ''}${p.material}-${match[2]}`; if (!Object.hasOwn(p[field], next)) p[field][next] = value; }
  }
  return p;
}

/** Axes locaux identiques au rendu : largeur normale au plan vertical de la pièce. */
function pieceCorners(part) {
  if (part.corners) return part.corners;
  if (part.material === 'mesh' || part.material === 'roof') return panelCornersFromLegacy(part);
  if (part.kind === 'wall') {
    const dir = unit(minus(part.b, part.a)), normal = [-dir[2], 0, dir[0]], points = [];
    for (const point of [part.a, part.b]) for (const side of [-1, 1]) for (const top of [0, 1]) points.push(plus(plus(point, times(normal, part.width / 2 * side)), [0, part.height * top, 0]));
    return points;
  }
  if (part.boxDim) {
    const center = times(plus(part.a, part.b), .5), pts = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push(plus(center, [x * part.boxDim[0] / 2, y * part.boxDim[1] / 2, z * part.boxDim[2] / 2]));
    return pts;
  }
  const dir = unit(minus(part.b, part.a)), horizontal = Math.hypot(dir[0], dir[2]);
  const n = horizontal > 1e-7 ? [-dir[2] / horizontal, 0, dir[0] / horizontal] : [0, 0, 1];
  const h = cross(dir, n), angle = (part.roll || 0) * Math.PI / 180;
  const nx = plus(times(n, Math.cos(angle)), times(h, Math.sin(angle))), hy = plus(times(h, Math.cos(angle)), times(n, -Math.sin(angle)));
  const points = [];
  for (const point of [part.a, part.b]) for (const i of [-1, 1]) for (const j of [-1, 1]) points.push(plus(plus(point, times(nx, part.width / 2 * i)), times(hy, part.height / 2 * j)));
  return points;
}
const partBounds = part => {
  const points = pieceCorners(part);
  return { min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))), max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))) };
};
const allBounds = parts => {
  if (!parts.length) return { min: [0, 0, 0], max: [0, 0, 0], width: 0, depth: 0, height: 0 };
  const boxes = parts.map(partBounds), min = [0, 1, 2].map(i => Math.min(...boxes.map(b => b.min[i]))), max = [0, 1, 2].map(i => Math.max(...boxes.map(b => b.max[i])));
  return { min, max, width: max[0] - min[0], depth: max[2] - min[2], height: max[1] - min[1] };
};
function enrichPart(part) {
  const piece = { ...part, a: [...part.a], b: [...part.b], length: round(distance(part.a, part.b)), section: section(part) };
  if (part.corners) {
    piece.corners = part.corners.map(p => [...p]);
    const [a, b, c, d] = piece.corners;
    piece.surfaceWidth = Math.max(distance(a, b), distance(d, c));
    piece.surfaceHeight = Math.max(distance(a, d), distance(b, c));
    piece.area = (length(cross(minus(b, a), minus(c, a))) + length(cross(minus(c, a), minus(d, a)))) / 2e6;
  }
  if (piece.kind === 'wall') piece.area = piece.length * piece.height / 1e6;
  return piece;
}

function jointGeometry(joint, parts) {
  const a = parts.find(p => p.id === joint.aPart), b = parts.find(p => p.id === joint.bPart);
  if (!a || !b || a.id === b.id) return { ...joint, type: joint.recipe, position: a ? times(plus(a.a, a.b), .5) : [0, 0, 0], valid: false, separation: null };
  const aa = partBounds(a), bb = partBounds(b), pa = [], pb = [];
  for (let i = 0; i < 3; i++) {
    if (aa.max[i] < bb.min[i]) { pa[i] = aa.max[i]; pb[i] = bb.min[i]; }
    else if (bb.max[i] < aa.min[i]) { pa[i] = aa.min[i]; pb[i] = bb.max[i]; }
    else pa[i] = pb[i] = (Math.max(aa.min[i], bb.min[i]) + Math.min(aa.max[i], bb.max[i])) / 2;
  }
  return { ...joint, type: joint.recipe, position: times(plus(pa, pb), .5), valid: true, separation: round(distance(pa, pb)) };
}

function addFoundations(model, p) {
  for (const piece of model.parts.filter(a => a.kind === 'post' && a.material === 'wood')) {
    const bottom = piece.a[1] <= piece.b[1] ? piece.a : piece.b;
    const post = { id: piece.id, x: bottom[0], y: bottom[1], z: bottom[2], height: Math.abs(piece.b[1] - piece.a[1]), ground: piece.ground, foundation: piece.foundation, section: piece.width };
    model.posts.push(post);
    if (post.foundation === 'none') continue;
    const rec = RECIPES.find(r => r.family === 'foundation' && r.id === post.foundation);
    if (post.foundation === 'concrete') model.parts.push({ id: 'F-' + post.id, label: 'Plot béton indicatif', kind: 'footing', material: 'concrete', a: [post.x, post.y - p.footingDepth, post.z], b: [post.x, post.y, post.z], width: p.footingWidth, height: p.footingWidth, length: p.footingDepth, group: 'foundation', boxDim: [p.footingWidth, p.footingDepth, p.footingWidth], volumeLitres: p.footingWidth ** 2 * p.footingDepth / 1e6, estimated: true });
    model.parts.push({ id: 'PIED-' + post.id, label: rec.label, kind: 'metal', material: 'metal', a: [post.x, post.y, post.z], b: [post.x, post.y + 70, post.z], width: piece.width + 30, height: piece.width + 30, length: 70, group: 'foundation', foundation: post.foundation, estimated: true });
  }
}

function validateModel(model, p) {
  const warn = (code, message, severity = 'warning') => { if (!model.warnings.some(w => w.code === code)) model.warnings.push({ code, message, severity }); };
  for (const [i, message] of p.importWarnings.entries()) warn(`import-${i}`, message);
  for (const conflict of p.attachmentConflicts) warn(`attachment-${conflict.attachmentId}`, `${conflict.sourceId} : ${conflict.message}`);
  for (const post of model.posts) {
    const rec = RECIPES.find(r => r.family === 'foundation' && r.id === post.foundation);
    if (post.foundation === 'none') { warn(`support-${post.id}`, `${post.id} : aucun appui au sol prévu.`); continue; }
    if (post.ground === 'unknown') warn(`support-${post.id}`, `${post.id} : support au sol inconnu.`);
    else if (!rec?.supports.includes(post.ground)) warn(`support-${post.id}`, `${post.id} : appui ${rec?.label || post.foundation} non couvert pour ce support.`);
    if (post.foundation === 'spike') warn('spike-limit', 'Pieds de jardin à enfoncer : aucune capacité structurelle validée pour la toiture ou les efforts importants.');
    const part = model.parts.find(a => a.id === post.id);
    if (Math.hypot(part.b[0] - part.a[0], part.b[2] - part.a[2]) > 1) warn(`post-tilted-${post.id}`, `${post.id} : poteau incliné, appui représenté à son extrémité basse ; détail à concevoir.`);
  }
  const lookup = new Map(model.parts.map(a => [a.id, a]));
  for (const joint of model.joints) {
    if (!joint.valid) { warn(`joint-missing-${joint.id}`, `${joint.id} : liaison incomplète ou pièce manquante. Consommables de cette liaison exclus du devis.`); continue; }
    if (joint.separation > 10) warn(`joint-gap-${joint.id}`, `${joint.id} : les pièces sont séparées d’au moins ${round(joint.separation)} mm ; l’assemblage reste à concevoir.`);
    const pieces = [lookup.get(joint.aPart), lookup.get(joint.bPart)], wall = pieces.find(a => a.kind === 'wall');
    const rec = jointRecipes.find(r => r.id === joint.recipe);
    if (rec?.family === 'wall') {
      if (!wall) warn(`wall-missing-${joint.id}`, `${joint.id} : recette murale sans mur identifié.`);
      else if (wall.wallSupport === 'unknown') warn(`wall-unknown-${joint.id}`, `${joint.id} : identifier le matériau porteur du mur avant de choisir les fixations.`);
      else if (!rec.supports.includes(wall.wallSupport)) warn(`wall-mismatch-${joint.id}`, `${joint.id} : « ${rec.label} » non couvert ici pour « ${wall.wallSupport} ».`);
      if (wall && wall.insulation + wall.gap > 0 && joint.recipe !== 'wall_distance') warn(`wall-offset-${joint.id}`, `${joint.id} : isolant ou déport présent (${wall.insulation + wall.gap} mm), traversée et reprise porteuse à détailler.`);
      if (joint.recipe === 'wall_distance') warn(`wall-distance-${joint.id}`, `${joint.id} : le kit à distance inclut ses composants propres ; vérifier notamment étanchéité, tiges et accessoires, sans double comptage.`);
    } else if (pieces.some(a => a.material !== 'wood' || a.kind === 'panel')) warn(`joint-material-${joint.id}`, `${joint.id} : recette bois appliquée à un autre type d’élément ; compatibilité à confirmer.`);
  }
  const bars = model.parts.filter(a => a.material === 'wood' && a.kind !== 'panel');
  model.warnings = model.warnings.filter(w=>w.code!=='wood-too-long');
  const preparedBars = cuttingParts(bars,p.manufacturing);
  for (const panel of model.parts.filter(a => a.kind === 'panel')) {
    if (!(panel.area > .000001)) warn(`panel-empty-${panel.id}`, `${panel.id} : surface nulle ou dégénérée.`);
    const [a, b, c, d] = panel.corners, normal = unit(cross(minus(b, a), minus(c, a)));
    if (Math.abs(dot(normal, minus(d, a))) > 1) warn(`panel-warped-${panel.id}`, `${panel.id} : les quatre coins ne sont pas coplanaires ; découpe rectangulaire estimée à revoir.`);
  }
  if (model.parts.some(a => a.material === 'mesh' && a.surfaceWidth + 2 * p.meshOverlap > p.meshRollLength && a.surfaceHeight + 2 * p.meshOverlap > p.meshRollLength)) warn('mesh-too-short', 'Certains lés dépassent la longueur du rouleau dans les deux orientations : calepinage et quantités de grillage à revoir.');
  for (const part of bars) {
    if (part.length < 1) warn(`zero-length-${part.id}`, `${part.id} : pièce de longueur nulle.`);
    if (!p.workshop.useTimberStock && preparedBars.find(a=>a.id===part.id).length > p.woodStockLength) warn('wood-too-long', 'Des pièces dépassent la longueur commerciale ; des lignes spécifiques restent à chiffrer au devis.');
  }
  // Détection volontairement limitée aux doublons presque exacts, sans faux calcul de collision.
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) {
    const a = bars[i], b = bars[j];
    if ((distance(a.a, b.a) < 1 && distance(a.b, b.b) < 1) || (distance(a.a, b.b) < 1 && distance(a.b, b.a) < 1)) warn(`overlap-${a.id}-${b.id}`, `${a.id} et ${b.id} occupent les mêmes extrémités : doublon ou collision à vérifier.`);
  }
  if (p.mode === 'free') {
    if (bars.length && !model.joints.length) warn('no-joints', 'Aucune liaison renseignée : le devis ne contient pas encore les fixations entre les pièces.');
    const connected = new Set(model.joints.filter(j => j.valid && j.separation <= 10).flatMap(j => [j.aPart, j.bPart]));
    for (const part of bars) if (!connected.has(part.id)) warn(`part-unconnected-${part.id}`, `${part.id} : aucune liaison entre éléments au contact renseignée pour cette pièce ; ses fixations restent à compléter.`);
    if (bars.some(part => part.group === 'gate' && !part.id.startsWith('PORTE-'))) warn('gate-hardware-manual', 'Un portillon libre ou copié nécessite sa propre quincaillerie. Gonds, loquet et fixations supplémentaires ne sont pas ajoutés automatiquement au devis.');
  }
  if (model.parts.some(a => a.group === 'roof')) warn('roof-loads', 'Couverture : portées, vent, soulèvement et résistance de toutes les liaisons restent à vérifier.');
  warn('geometry-only', 'Géométrie et quantités de préparation. Fixations, fondations, sections et références restent à confirmer ; aucune capacité structurelle validée.', 'info');
}

export function buildProject(input = {}) {
  const p = normalizeProject(input);
  let model;
  if (p.mode === 'parametric') {
    model = legacy.buildProject(p);
    model.parts = model.parts.map(part => ({ ...part, species: p.material, roll: 0, groupName: ({ structure: 'Structure', gate: 'Portillon', mesh: 'Grillage', foundation: 'Fondations', roof: 'Toiture' })[part.group] || '' }));
    // Les chevrons doivent atteindre les axes des traverses porteuses, pas seulement
    // les faces intérieures des poteaux (ces traverses sont moins épaisses).
    for (const part of model.parts.filter(a => a.id.startsWith('CHEV-'))) {
      const delta = p.postSection / 2, slope = p.roofRise / (p.depth - p.postSection);
      part.a = plus(part.a, [0, -delta * slope, -delta]);
      part.b = plus(part.b, [0, delta * slope, delta]);
      part.length = round(distance(part.a, part.b));
    }
    model.joints = model.joints.map(j => {
      const override = p.jointOverrides[j.id] || {}, recipe = override.recipe || p.joint;
      return jointGeometry({ ...j, ...normalizeConfig({ recipe, ...override }, recipe) }, model.parts);
    });
  } else {
    model = { parts: p.freeParts.map(enrichPart), posts: [], joints: [], warnings: [], stats: {} };
    addFoundations(model, p);
    model.joints = p.freeJoints.map(j => jointGeometry(j, model.parts));
  }
  model.project = p;
  validateModel(model, p);
  for (const joint of model.joints) {
    joint.diagnostics = model.warnings.filter(w => w.code.endsWith(`-${joint.id}`));
    joint.status = !joint.valid ? 'incomplet' : joint.diagnostics.some(w => w.code.startsWith('wall-mismatch-') || w.code.startsWith('joint-material-')) ? 'incompatible' : joint.diagnostics.some(w => w.code.startsWith('wall-unknown-') || w.code.startsWith('wall-missing-')) ? 'incomplet' : joint.diagnostics.length ? 'à revoir' : 'à confirmer';
    joint.message = joint.diagnostics[0]?.message || 'Recette, référence, géométrie de pose et quantités à confirmer ; capacité non validée.';
  }
  const wood = model.parts.filter(a => a.material === 'wood' && a.kind !== 'panel');
  model.stats = { postCount: model.posts.length, woodPieces: wood.length, jointCount: model.joints.length, woodLength: round(wood.reduce((s, a) => s + a.length, 0) / 1000), meshArea: round(model.parts.filter(a => a.material === 'mesh').reduce((s, a) => s + (a.area || 0), 0)), roofArea: round(model.parts.filter(a => a.group === 'roof' && a.kind === 'panel' || a.id === 'COUVERTURE').reduce((s, a) => s + (a.area || 0), 0)), concreteLitres: round(model.parts.filter(a => a.kind === 'footing').reduce((s, a) => s + a.volumeLitres, 0)), footingCount: model.parts.filter(a => a.kind === 'footing').length, wallCount: model.parts.filter(a => a.kind === 'wall').length };
  model.bounds = allBounds(model.parts.filter(part => part.group !== 'foundation' && part.material !== 'metal' && part.kind !== 'footing'));
  model.sceneBounds = allBounds(model.parts);
  return model;
}

function panelCornersFromLegacy(part) {
  if (part.corners) return part.corners;
  const [h1, h2] = part.endHeights || [part.b[1], part.b[1]];
  return [[part.a[0], part.a[1], part.a[2]], [part.b[0], part.a[1], part.b[2]], [part.b[0], h2, part.b[2]], [part.a[0], h1, part.a[2]]];
}

export function convertToFree(input = {}) {
  const p = normalizeProject(input); if (p.mode === 'free') return p;
  const model = buildProject(p), posts = new Map(model.posts.map(a => [a.id, a]));
  p.freeParts = model.parts.filter(a => ['wood', 'mesh', 'roof'].includes(a.material)).map(part => {
    const source = { ...part, species: part.species || p.material, grouped:false };
    if (part.material === 'mesh' || part.material === 'roof') { source.kind = 'panel'; source.corners = panelCornersFromLegacy(part); }
    else if (part.kind === 'gate') source.kind = 'beam';
    if (posts.has(part.id)) Object.assign(source, { foundation: posts.get(part.id).foundation, ground: posts.get(part.id).ground });
    return source;
  });
  p.freeJoints = model.joints.map(j => ({ ...j })); p.mode = 'free';
  return normalizeProject(p);
}

export function makePart(input = {}, kind = 'beam') {
  const p = normalizeProject(input), id = allocate(p), common = { id, label: '', species: p.material, ground: p.ground, foundation: p.foundation, width: p.beamWidth, height: p.beamHeight, material: 'wood', group: 'structure', groupName: '', grouped:false, roll: 0 };
  let part;
  if (kind === 'post') part = { ...common, kind, label: 'Poteau', a: [0, 0, 0], b: [0, p.height, 0], width: p.postSection, height: p.postSection };
  else if (kind === 'wall') part = { ...common, kind, label: 'Mur existant', material: 'wall', group: 'wall', a: [-2000, 0, 1000], b: [2000, 0, 1000], width: 200, height: 2500, wallSupport: 'unknown', wallThickness: 200, insulation: 0, gap: 0 };
  else if (['panel', 'mesh', 'roof'].includes(kind)) part = { ...common, kind: 'panel', label: kind === 'roof' ? 'Panneau de couverture' : 'Panneau grillagé', material: kind === 'roof' ? 'roof' : 'mesh', group: kind === 'roof' ? 'roof' : 'mesh', width: kind === 'roof' ? 18 : 1, height: 1000, a: [-500, 0, 0], b: [500, 1000, 0], corners: kind === 'roof' ? [[-1000, 2000, -1000], [1000, 2000, -1000], [1000, 2000, 1000], [-1000, 2000, 1000]] : [[-500, 0, 0], [500, 0, 0], [500, 1000, 0], [-500, 1000, 0]] };
  else if (kind === 'brace') part = { ...common, kind, label: 'Jambe de force', a: [-500, 1000, 0], b: [0, 1500, 0] };
  else part = { ...common, kind: 'beam', label: 'Chevron / traverse', a: [-1000, 1500, 0], b: [1000, 1500, 0] };
  return normalizePart(part, p, id);
}

const movePart = (part, delta) => ({ ...part, a: plus(part.a, delta), b: plus(part.b, delta), ...(part.corners ? { corners: part.corners.map(c => plus(c, delta)) } : {}) });
export function translateParts(input, ids, delta) {
  const p = convertToFree(input), selected = new Set(ids || []), v = vec(delta);
  p.freeParts = p.freeParts.map(part => selected.has(part.id) ? movePart(part, v) : part);
  return normalizeProject(p);
}
export function duplicateParts(input, ids, delta = [250, 0, 250]) {
  const p = convertToFree(input), selected = new Set(ids || []), map = new Map(), v = vec(delta), copies = [];
  for (const part of p.freeParts.filter(a => selected.has(a.id))) { const id = allocate(p); map.set(part.id, id); copies.push({ ...movePart(part, v), id, label: `${part.label} (copie)` }); }
  const joints = p.freeJoints.filter(j => map.has(j.aPart) && map.has(j.bPart)).map(j => {const copy=structuredClone(j);if(copy.fixingLayout?.frame?.anchorPartId)copy.fixingLayout.frame.anchorPartId=map.get(copy.fixingLayout.frame.anchorPartId)||copy.fixingLayout.frame.anchorPartId;return {...copy,id:allocate(p,'J'),aPart:map.get(j.aPart),bPart:map.get(j.bPart)}});
  for(const [oldId,newId] of map)if(p.baseFixingLayouts[oldId]){const copy=structuredClone(p.baseFixingLayouts[oldId]);if(copy.frame?.anchorPartId)copy.frame.anchorPartId=newId;p.baseFixingLayouts[newId]=copy}
  for(const [oldId,newId] of map)if(p.manufacturing.cuts[oldId])p.manufacturing.cuts[newId]=structuredClone(p.manufacturing.cuts[oldId]);
  for(const [oldId,newId] of map)if(p.appearance.parts[oldId])p.appearance.parts[newId]=structuredClone(p.appearance.parts[oldId]);
  p.freeParts.push(...copies); p.freeJoints.push(...joints);
  p.attachments=duplicateAttachments(p.attachments,map,v);
  for(const copy of copies)if(!p.attachments.some(a=>a.sourceId===copy.id)){copy.adaptation='fixed';copy.lengthLocked=true;}
  return normalizeProject(p);
}
export function removeParts(input, ids) {
  const p = convertToFree(input), selected = new Set(ids || []);
  p.freeParts = p.freeParts.filter(a => !selected.has(a.id));
  p.freeJoints = p.freeJoints.filter(j => !selected.has(j.aPart) && !selected.has(j.bPart));
  const released=new Set(p.attachments.filter(a=>!selected.has(a.sourceId)&&a.anchors.some(anchor=>selected.has(anchor.targetId))).map(a=>a.sourceId));
  p.attachments=p.attachments.filter(a=>!selected.has(a.sourceId)&&!a.anchors.some(anchor=>selected.has(anchor.targetId))).map(a=>a.intermediateIds?{...a,intermediateIds:a.intermediateIds.filter(id=>!selected.has(id))}:a);
  for(const part of p.freeParts)if(released.has(part.id)){part.adaptation='fixed';part.lengthLocked=true;}
  for(const id of selected)delete p.manufacturing.cuts[id];
  for(const id of selected)delete p.appearance.parts[id];
  return normalizeProject(p);
}
export function addJoint(input, aPart, bPart, recipe = 'angle') {
  const p = convertToFree(input), a = typeof aPart === 'string' ? aPart : aPart?.id, b = typeof bPart === 'string' ? bPart : bPart?.id;
  if (!a || !b || a === b) return p;
  const config = typeof recipe === 'object' ? recipe : { recipe };
  p.freeJoints.push({ id: allocate(p, 'J'), aPart: a, bPart: b, ...normalizeConfig(config, p.joint) });
  return normalizeProject(p);
}

export function optimizeCuts(parts = [], stockLengths = [2400, 3000, 4000], kerf = 3) {
  return legacy.optimizeCuts(parts.filter(a => a.kind !== 'panel').map(part => ({ ...part, section: part.species ? `${part.section || section(part)} · ${part.species}` : part.section })), stockLengths, kerf);
}
export const toCSV = legacy.toCSV;

const referenceKey = reference => {
  if (!reference) return '';
  let hash = 2166136261; for (const ch of reference) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return `-${(hash >>> 0).toString(36)}`;
};
function makeRow(p, id, category, label, unit, required, packSize, extra = {}) {
  const marginQty = extra.noMargin ? 0 : required * p.margin / 100, stock = p.stock[id] || 0, toBuy = Math.max(0, required + marginQty - stock), packs = Math.max(0, Math.ceil((toBuy - 1e-9) / packSize)), unitPrice = p.prices[id] || 0;
  const row = { id, category, label, spec: 'Dimensions et référence à confirmer', unit, required: round(required), marginQty: round(marginQty), stock, toBuy: round(toBuy), packSize, packs, purchaseQty: round(packs * packSize), unitPrice, total: round(packs * unitPrice, 2), priced: unitPrice > 0 || packs === 0, estimated: true, detail: '', source: '', partIds: [], ...extra };
  delete row.noMargin; return row;
}

export function calculateBOM(input = {}, built) {
  const p = normalizeProject(input), model = built || buildProject(p), activePosts = model.posts.filter(a => a.foundation !== 'none');
  // Réutilise les calculs éprouvés de béton/grillage sans quincaillerie de liaison implicite.
  const roofParts = model.parts.filter(a => a.material === 'roof');
  const materialParts = model.parts.filter(a => !['wood', 'roof', 'wall'].includes(a.material));
  if (roofParts.length) materialParts.push({ ...roofParts[0], area: roofParts.reduce((s, a) => s + (a.area || 0), 0) });
  let rows = legacy.calculateBOM(p, { ...model, parts: materialParts, posts: activePosts, joints: [] }).filter(row => row.required > 0 && !row.id.startsWith('joint-') && !row.id.startsWith('gate-'));
  for (const row of rows.filter(a => a.id.startsWith('roof-'))) row.partIds = roofParts.map(a => a.id);
  const prepared = cuttingParts(model.parts,p.manufacturing);
  const woodGroups = new Map();
  for (const part of prepared.filter(a => a.material === 'wood' && a.kind !== 'panel')) {
    const species = part.species || p.material; if (!woodGroups.has(species)) woodGroups.set(species, []); woodGroups.get(species).push(part);
  }
  for (const [species, pieces] of woodGroups) {
    const woodRows = legacy.calculateBOM({ ...p, material: species }, { ...model, parts: pieces, posts: [], joints: [] }).filter(row => row.category === 'Bois');
    for (const old of woodRows) {
      const id = old.id.replace(/^wood-(custom-)?/, (_, custom) => `wood-${custom || ''}${species}-`);
      rows.push(makeRow(p, id, old.category, old.label, old.unit, old.required, old.packSize, { noMargin: true, spec: old.spec, detail: old.detail.replace('surcotes d’usinage non ajoutées.', 'bruts et surlongueurs renseignés dans Dossier intégrés, coupes non définies à compléter.').replace('longueur finie, surcote d’usinage à prévoir.', 'brut et surlongueur renseignés intégrés ; coupes non définies à compléter.'), partIds: old.partIds, needsQuote: old.needsQuote || false, species }));
    }
  }
  const panels = model.parts.filter(a => a.material === 'wood' && a.kind === 'panel'), panelGroups = new Map();
  for (const panel of panels) { const key = `${panel.species}-${panel.width}`; if (!panelGroups.has(key)) panelGroups.set(key, []); panelGroups.get(key).push(panel); }
  for (const [key, parts] of panelGroups) rows.push(makeRow(p, `wood-panel-${key}`, 'Panneaux', `Panneau bois ${parts[0].species}`, 'm²', parts.reduce((s, a) => s + a.area, 0), 1, { spec: `Épaisseur ${parts[0].width} mm`, detail: 'Surface nette + réserve : format commercial et calepinage des plaques à compléter.', partIds: parts.map(a => a.id), needsReview: true }));
  const items = new Map();
  const consume = (joint, baseId, category, label, qty, unit = 'pièce', pack = 100, detail = '') => {
    if (!(qty > 0)) return;
    const id = baseId + referenceKey(joint.reference), existing = items.get(id), rec = jointRecipes.find(a => a.id === joint.recipe);
    if (existing) { existing.required += qty; existing.jointIds.push(joint.id); existing.partIds.push(joint.aPart, joint.bPart); }
    else items.set(id, { id, category, label, required: qty, unit, pack, spec: joint.reference || 'Référence et dimensions à confirmer', detail: detail || rec.conditions, source: rec.url, jointIds: [joint.id], partIds: [joint.aPart, joint.bPart] });
  };
  for (const joint of model.joints.filter(a => a.valid)) {
    const id = joint.recipe;
    if (['angle', 'hanger', 'plate'].includes(id)) {
      consume(joint, `joint-${id}`, 'Assemblages', id === 'angle' ? 'Équerres' : id === 'hanger' ? 'Sabots' : 'Plaques / goussets', joint.connectors, 'pièce', 1);
      consume(joint, `joint-${id}-screws`, 'Fixations', 'Vis de connecteur', joint.screws);
    } else if (id === 'screw') consume(joint, 'joint-structural-screws', 'Fixations', 'Vis structurelles', joint.screws);
    else if (id === 'bolt') consume(joint, 'joint-bolt-kit', 'Assemblages', 'Kit boulon + écrou + 2 rondelles', joint.bolts, 'kit', 10);
    else if (id === 'wood') {
      consume(joint, 'joint-wood-screws', 'Fixations', 'Vis complémentaires d’assemblage bois', joint.screws);
      consume(joint, 'joint-wood-bolts', 'Assemblages', 'Kit boulon complémentaire', joint.bolts, 'kit', 10);
    } else if (id === 'wall_mechanical') consume(joint, 'wall-mechanical-anchor', 'Fixations murales', 'Kit d’ancrage mécanique au mur', joint.anchors, 'kit', 10);
    else if (['wall_chemical', 'wall_screen'].includes(id)) {
      consume(joint, 'wall-chemical-rod-kit', 'Fixations murales', 'Kit tige + écrou + rondelle', joint.anchors, 'kit', 10);
      if (id === 'wall_screen') consume(joint, 'wall-screen', 'Scellement mural', 'Tamis de scellement', joint.anchors, 'pièce', 10);
      consume(joint, 'wall-resin-cartridge', 'Scellement mural', 'Résine de scellement mural', joint.anchors * joint.resinDose, 'ml', p.resinCartridge, 'Dose par point saisie et réserve globale. Amorçage, pertes, reprise après pause et consommation réelle à confirmer.');
    } else if (id === 'wall_wood') consume(joint, 'wall-wood-screws', 'Fixations murales', 'Vis dans l’ossature bois', joint.screws);
    else if (id === 'wall_distance') consume(joint, 'wall-distance-kit', 'Fixations murales', 'Kit de fixation à distance complet', joint.anchors, 'kit', 1, 'Kit complet supposé inclure ses tiges et accessoires. Étanchéité, résine éventuelle et contenu du kit à confirmer ; aucun composant compté deux fois.');
  }
  for (const item of items.values()) rows.push(makeRow(p, item.id, item.category, item.label, item.unit, item.required, item.pack, { spec: item.spec, detail: item.detail, source: item.source, jointIds: item.jointIds, partIds: [...new Set(item.partIds)] }));
  for (const resin of rows.filter(a => a.id.startsWith('wall-resin-cartridge'))) rows.push(makeRow(p, resin.id.replace('cartridge', 'nozzle'), 'Scellement mural', 'Embout mélangeur pour scellement mural', 'pièce', Math.ceil(resin.required * (1 + p.margin / 100) / p.resinCartridge), 1, { noMargin: true, detail: 'Un par cartouche théorique. Déduire les embouts fournis ; reprises de travail à préciser.', partIds: resin.partIds }));
  // Un portillon converti conserve sa quincaillerie ; une scène vide n’en invente pas.
  if (model.parts.some(a => a.id === 'PORTE-M-G') && model.parts.some(a => a.id === 'PORTE-M-D')) {
    rows.push(makeRow(p, 'gate-hinges', 'Portillon', 'Gonds / charnières de portillon', 'pièce', 2, 1, { noMargin: true, detail: 'Hypothèse de deux charnières avec fixations incluses ; vérifier le kit.', partIds: ['PORTE-M-G'] }));
    rows.push(makeRow(p, 'gate-latch', 'Portillon', 'Loquet de portillon', 'kit', 1, 1, { noMargin: true, detail: 'Kit complet à préciser.', partIds: ['PORTE-M-D'] }));
  }
  return applyWorkshopBOM([...rows.filter(a => a.required > 0),...electricalRows(p).map(r=>makeRow(p,r.id,r.category,r.label,r.unit,r.quantity,1,{noMargin:true,spec:'Depuis le schéma électrique',detail:r.details||r.itemIds.join(', '),partIds:[],itemIds:r.itemIds}))],p,{...model,parts:prepared});
}
