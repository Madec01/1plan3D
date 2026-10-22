/** Propositions de consommables issues des attaches géométriques.
 * Aucun montage ni achat n'est créé avant confirmation explicite.
 * Les recettes sont celles du catalogue existant, sans calcul de résistance.
 */
import {RECIPES, addJoint, calculateBOM, getJointDefaults} from './engine.js';

const SUPPORTS = {wood:'Bois',concrete:'Béton',solid_brick:'Brique pleine',solid_block:'Bloc plein',hollow_brick:'Brique creuse',hollow_block:'Bloc creux',cellular:'Béton cellulaire',stone:'Pierre',plaster:'Plaque de plâtre',insulation:'Isolant',unknown:'Support à identifier'};
const pairKey = (a,b) => [a,b].sort().join('|');
const timber = p => p?.material === 'wood' && p.kind !== 'panel';
const wall = p => p?.kind === 'wall' || p?.material === 'wall';
const label = p => p?.label || p?.id || 'Pièce manquante';
const catalog = RECIPES.filter(recipe => ['joint','wall'].includes(recipe.family));

function compatibleRecipes(a,b) {
  if (!a || !b) return {family:null,support:'unknown',recipes:[],reason:'Une pièce de cette attache est absente.'};
  const masonry = [a,b].find(wall), wood = [a,b].find(timber);
  if (masonry && wood) {
    const support = masonry.wallSupport || 'unknown', offset = Number(masonry.insulation || 0) + Number(masonry.gap || 0);
    const recipes = catalog.filter(r => r.family === 'wall' && r.supports.includes(support) && (offset > 0 ? r.id === 'wall_distance' : r.id !== 'wall_distance'));
    return {family:'wall',support,offset,recipes,reason:recipes.length?'':support === 'unknown'?'Identifiez le matériau porteur du mur pour proposer une fixation.':`Aucune recette du catalogue pour ce support (${SUPPORTS[support] || support}). Précisez le système retenu dans une liaison manuelle.`};
  }
  if (timber(a) && timber(b)) return {family:'joint',support:'wood',offset:0,recipes:catalog.filter(r => r.family === 'joint'),reason:''};
  return {family:null,support:[a,b].some(p => p.material === 'mesh')?'mesh':'other',offset:0,recipes:[],reason:[a,b].some(p => p.kind === 'panel' || ['mesh','roof'].includes(p.material))?'Panneau ou grillage : aucun montage de fixation validé dans le catalogue actuel. Définissez séparément les attaches et consommables adaptés.':'Ce couple de matériaux ne possède pas de recette dans le catalogue actuel.'};
}

/** Une ligne par paire, même si plusieurs coins ou attaches s'y rapportent. */
export function listAttachmentFixings(project = {}) {
  const parts = new Map((project.freeParts || []).map(p => [p.id,p])), pairs = new Map();
  const joints = new Map();
  for (const joint of project.freeJoints || []) {
    const key = pairKey(joint.aPart,joint.bPart);
    if (!joints.has(key)) joints.set(key,[]);
    joints.get(key).push(joint);
  }
  for (const attachment of project.attachments || []) {
    const targetIds = [...new Set([...(attachment.anchors || []).map(anchor => anchor.targetId),...(attachment.intermediateIds || [])])].filter(Boolean);
    for (const targetId of targetIds) {
      if (!attachment.sourceId || attachment.sourceId === targetId) continue;
      const id = pairKey(attachment.sourceId,targetId);
      if (pairs.has(id)) { pairs.get(id).attachmentIds.push(attachment.id); continue; }
      const a = parts.get(attachment.sourceId), b = parts.get(targetId), compatibility = compatibleRecipes(a,b), existing = joints.get(id) || [];
      pairs.set(id,{id,sourceId:attachment.sourceId,targetId,sourceLabel:label(a),targetLabel:label(b),attachmentIds:[attachment.id],...compatibility,supportLabel:SUPPORTS[compatibility.support] || (compatibility.support === 'mesh'?'Grillage':'Autre matériau'),jointIds:existing.map(j=>j.id),manual:existing.some(j=>j.fixingLayout?.mode === 'manual'),status:existing.length?'covered':compatibility.recipes.length?'pending':'unsupported',selectedRecipe:compatibility.recipes.some(r=>r.id === project.joint)?project.joint:compatibility.recipes[0]?.id || ''});
    }
  }
  for (const row of pairs.values()) {
    row.attachmentIds = [...new Set(row.attachmentIds)];
    const conflict = (project.attachmentConflicts || []).find(c=>row.attachmentIds.includes(c.attachmentId || c.id) || c.sourceId === row.sourceId);
    if (conflict && row.status !== 'covered') { row.status='conflict'; row.reason=`Attache à corriger avant de choisir une fixation : ${conflict.message || conflict.reason || 'géométrie incompatible'}`; }
    if (row.status === 'covered') row.reason=`Liaison existante${row.manual?' · implantation manuelle conservée':''}.`;
  }
  return [...pairs.values()];
}

export function attachmentFixingSummary(project) {
  const rows = listAttachmentFixings(project);
  return {total:rows.length,covered:rows.filter(r=>r.status==='covered').length,pending:rows.filter(r=>r.status==='pending').length,unsupported:rows.filter(r=>r.status==='unsupported').length,conflicts:rows.filter(r=>r.status==='conflict').length,unfixed:rows.filter(r=>r.status!=='covered').length};
}

const batchKey = (row,recipe) => [row.family,row.support,row.offset || 0,recipe].join('|');
function checkedSelections(project,selections) {
  if (project.mode !== 'free') throw new Error('Passez en construction libre pour confirmer ces fixations.');
  if (!Array.isArray(selections) || !selections.length) throw new Error('Choisissez au moins une attache à équiper.');
  const rows = new Map(listAttachmentFixings(project).map(r=>[r.id,r])), seen = new Set(), checked=[];
  for (const selection of selections) {
    const id = typeof selection === 'string'?selection:selection?.id, row=rows.get(id), recipe=typeof selection === 'object'?selection.recipe:row?.selectedRecipe;
    if (!row) throw new Error('Cette proposition n’existe plus. Actualisez la liste.');
    if (row.status === 'covered') throw new Error('Une liaison existe déjà entre ces pièces ; son implantation est conservée.');
    if (row.status !== 'pending') throw new Error(row.reason || 'Cette attache ne peut pas être équipée automatiquement.');
    if (!row.recipes.some(r=>r.id===recipe)) throw new Error('La recette choisie ne correspond pas aux matériaux et au support de cette attache.');
    if (seen.has(id)) continue;
    seen.add(id); checked.push({row,recipe});
  }
  if (new Set(checked.map(({row,recipe})=>batchKey(row,recipe))).size > 1) throw new Error('Confirmez séparément les lots de matériaux, supports, déports ou recettes différents.');
  return checked;
}

/** Validation complète avant toute mutation ; une erreur conserve tout le projet. */
export function confirmAttachmentFixings(project,selections) {
  const checked=checkedSelections(project,selections);
  let result=structuredClone(project);
  for (const {row,recipe} of checked) result=addJoint(result,row.sourceId,row.targetId,recipe);
  return result;
}

/** Aperçu du lot et du quantitatif ; l'appelant n'applique project qu'après accord. */
export function previewAttachmentFixings(project,selections) {
  const checked=checkedSelections(project,selections), result=confirmAttachmentFixings(project,selections);
  const before=new Map(calculateBOM(project).map(row=>[row.id,row])), after=calculateBOM(result);
  const changes=after.map(row=>({id:row.id,label:row.label,spec:row.spec,unit:row.unit,before:before.get(row.id)?.required || 0,after:row.required || 0,purchaseBefore:before.get(row.id)?.purchaseQty || 0,purchaseAfter:row.purchaseQty || 0})).filter(row=>row.before!==row.after || row.purchaseBefore!==row.purchaseAfter);
  return {project:result,entries:checked.map(({row,recipe})=>({id:row.id,sourceLabel:row.sourceLabel,targetLabel:row.targetLabel,recipe,recipeLabel:row.recipes.find(r=>r.id===recipe).label,counts:getJointDefaults(recipe)})),addedJoints:result.freeJoints.length-(project.freeJoints || []).length,bomChanges:changes};
}
