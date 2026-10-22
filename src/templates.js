/** Modèles géométriques personnalisables. Toutes les cotes sont en mm. */
import { normalizeProject, getJointDefaults, convertToFree } from './engine.js';

export const TEMPLATE_DEFINITIONS = [
  { id: 'pergola', label: 'Pergola ouverte', description: 'Dimensions hors-tout bois, hauteur au-dessus des chevrons ; entraxes ajustés pour respecter l’espacement maximal saisi.', defaults: { width: 4000, depth: 3000, height: 2500, postSection: 120, beamWidth: 70, beamHeight: 145, maxSpan: 2500, rafterSpacing: 500 } },
  { id: 'fence', label: 'Clôture droite', description: 'Longueur et hauteur hors-tout, poteaux intermédiaires répartis régulièrement, grillage ou lames.', defaults: { width: 6000, depth: 90, height: 1800, postSection: 90, beamWidth: 45, beamHeight: 70, maxSpan: 1800, fill: 'mesh', plankWidth: 120, plankThickness: 18, plankGap: 12 } },
  { id: 'barn_door', label: 'Porte de grange battante', description: 'Dimensions hors-tout des vantaux, jeu entre vantaux inclus dans la largeur ; sans bâti ni réservation de maçonnerie.', defaults: { width: 2400, depth: 45, height: 2200, beamWidth: 45, beamHeight: 95, leaves: 2, clearance: 12, plankWidth: 140, plankThickness: 18, plankGap: 0 } },
  { id: 'sliding_door', label: 'Porte de grange coulissante', description: 'Dimensions hors-tout du panneau mobile ; le rail et ses accessoires sont proposés dans les achats, leurs dimensions restent à choisir.', defaults: { width: 1600, depth: 45, height: 2200, beamWidth: 45, beamHeight: 95, leaves: 1, clearance: 0, plankWidth: 140, plankThickness: 18, plankGap: 0 } }
];
const names = Object.fromEntries(TEMPLATE_DEFINITIONS.map(t => [t.id, t.label]));
const number = (v, fallback) => v === undefined || v === '' ? fallback : Number(v);
function optionsFor(kind, options = {}) {
  const template = TEMPLATE_DEFINITIONS.find(t => t.id === kind);
  if (!template) throw new Error('Modèle inconnu.');
  const result = { ...template.defaults, ...options };
  for (const key of ['width', 'depth', 'height', 'postSection', 'beamWidth', 'beamHeight', 'maxSpan', 'rafterSpacing', 'plankWidth', 'plankThickness', 'plankGap', 'clearance']) {
    if (result[key] === undefined) continue;
    result[key] = number(result[key], template.defaults[key]);
    if (!Number.isFinite(result[key]) || result[key] < 0 || result[key] > 50000) throw new Error(`Cote ${key} invalide (0 à 50 000 mm).`);
  }
  for (const key of ['width', 'height', 'beamWidth', 'beamHeight']) if (!(result[key] > 0)) throw new Error('Largeur, hauteur et sections doivent être positives.');
  if (result.beamWidth > 2000 || result.beamHeight > 2000) throw new Error('Section de bois limitée à 2 000 mm.');
  if (kind === 'pergola' || kind === 'fence') {
    if (!(result.postSection > 0 && result.postSection <= 2000 && result.maxSpan >= result.postSection)) throw new Error('Section des poteaux ou espacement maximal invalide.');
    if (result.width <= 2 * result.postSection || result.height <= 2 * result.beamHeight + 100) throw new Error('Les dimensions ne laissent pas de place entre les poteaux et les traverses.');
  }
  if (kind === 'pergola' && (!(result.depth > 2 * result.postSection) || !(result.rafterSpacing >= result.beamWidth))) throw new Error('La profondeur et l’entraxe doivent laisser place aux pièces de bois.');
  if (kind !== 'pergola') {
    if (!(result.plankWidth > 0 && result.plankThickness > 0 && result.plankThickness <= 2000)) throw new Error('Largeur et épaisseur des lames doivent être positives.');
    if (result.plankGap >= result.plankWidth) throw new Error('Le jour entre lames doit rester inférieur à leur largeur.');
  }
  result.leaves = kind === 'barn_door' && Number(result.leaves) === 2 ? 2 : 1;
  result.fill = result.fill === 'slats' ? 'slats' : 'mesh';
  if (kind.includes('door') && ((result.width - result.clearance * (result.leaves - 1)) / result.leaves <= 4 * result.beamHeight || result.height <= 4 * result.beamHeight)) throw new Error('Les vantaux sont trop petits pour la largeur du cadre.');
  return result;
}

export function templateAccessories(input, kind, options = {}) {
  if (kind === 'enclos') return [];
  const o = optionsFor(kind, options);
  if (kind === 'barn_door') return [
    { id: 'door-hinges', label: 'Charnières / pentures de porte', quantity: 2 * o.leaves, unit: 'kit', notes: 'Hypothèse de 2 par vantail ; modèle, nombre et fixations à choisir pour la porte et son support.' },
    { id: 'door-latch', label: 'Fermeture de porte', quantity: 1, unit: 'kit', notes: 'Kit de fermeture et accessoires à préciser.' },
    ...(o.leaves === 2 ? [{ id: 'door-bolt', label: 'Verrou du vantail semi-fixe', quantity: 1, unit: 'kit', notes: 'Implantation et fixations à préciser.' }] : [])
  ];
  if (kind === 'sliding_door') return [
    { id: 'sliding-rail', label: 'Rail de porte coulissante', quantity: 1, unit: 'kit', notes: `Course et longueur à définir selon l’ouverture et le recouvrement. Largeur du panneau : ${o.width} mm. Fixations du rail à renseigner.` },
    { id: 'sliding-carriages', label: 'Chariots de porte coulissante', quantity: 2, unit: 'kit', notes: 'Hypothèse de 2 chariots ; compatibilité avec le rail, la porte et le kit à confirmer.' },
    { id: 'sliding-guides', label: 'Guide inférieur de porte', quantity: 1, unit: 'kit', notes: 'Support et implantation à définir.' },
    { id: 'sliding-stops', label: 'Butées de porte coulissante', quantity: 2, unit: 'pièce', notes: 'Déduire si déjà incluses dans le kit rail.' },
    { id: 'sliding-retainer', label: 'Dispositif anti-décrochage', quantity: 1, unit: 'kit', notes: 'Suivre le système retenu ; déduire si inclus dans les chariots.' },
    { id: 'door-handle', label: 'Poignée de porte', quantity: 1, unit: 'kit', notes: 'Fixations et dégagement à préciser.' }
  ];
  return [];
}

/** Remplace la scène par un modèle libre. Les cotes saisies ne sont pas arrondies à la grille. */
export function parametricTemplates(input = {}, kind = 'pergola', options = {}) {
  if (kind === 'enclos') return convertToFree({ ...input, mode: 'parametric' });
  const o = optionsFor(kind, options);
  let p = normalizeProject({ ...input, name: names[kind], mode: 'free', freeParts: [], freeJoints: [], jointOverrides: {}, postOverrides: {}, purchased: {}, stock: {}, prices: {}, nextId: 1, importWarnings: [], baseFixingLayouts:{}, electrical:{}, drawing:{},technical:{},paper:{} });
  let sequence = 1;
  const add = (label, a, b, extra = {}) => {
    const id = `F-${String(sequence++).padStart(6, '0')}`;
    p.freeParts.push({ id, label, a, b, kind: 'beam', material: 'wood', width: o.beamWidth, height: o.beamHeight, species: p.material, foundation: p.foundation, ground: p.ground, group: 'structure', groupName: names[kind], roll: 0, ...extra });
    return id;
  };
  const connect = (aPart, bPart, recipe = 'angle', extra = {}) => {
    const id = `J-${String(sequence++).padStart(6, '0')}`;
    p.freeJoints.push({ id, aPart, bPart, ...getJointDefaults(recipe), ...extra });
  };
  const linePositions = (start, end, maximum) => {
    const count = Math.max(1, Math.ceil((end - start) / maximum));
    if (count > 200) throw new Error('Le modèle dépasse 200 intervalles ; augmenter l’espacement.');
    return Array.from({ length: count + 1 }, (_, i) => start + (end - start) * i / count);
  };
  const planks = (left, right, bottom, top, z, rails, groupName) => {
    const span = right - left, count = Math.max(1, Math.ceil((span + o.plankGap) / (o.plankWidth + o.plankGap)));
    if (count > 250) throw new Error('Le modèle dépasse 250 lames par panneau.');
    const actualWidth = (span - (count - 1) * o.plankGap) / count;
    for (let i = 0; i < count; i++) {
      const x = left + actualWidth / 2 + i * (actualWidth + o.plankGap);
      const id = add(`Lame ${i + 1} · ${groupName}`, [x, bottom, z], [x, top, z], { width: o.plankThickness, height: actualWidth, group: kind.includes('door') ? 'gate' : 'structure', groupName });
      for (const rail of rails) connect(id, rail, 'screw', { screws: 2, notes: 'Quantité de préparation : 2 vis par rencontre lame/traverse ; référence et implantation à adapter.' });
    }
  };
  if (kind === 'pergola') {
    const xs = linePositions(-(o.width - o.postSection) / 2, (o.width - o.postSection) / 2, o.maxSpan);
    const postTop = o.height - 2 * o.beamHeight, beamY = postTop + o.beamHeight / 2;
    const beams = [];
    for (const sign of [-1, 1]) {
      const z = sign * (o.depth - o.postSection) / 2;
      const posts = xs.map((x, i) => add(`Poteau ${sign < 0 ? 'avant' : 'arrière'} ${i + 1}`, [x, 0, z], [x, postTop, z], { kind: 'post', width: o.postSection, height: o.postSection }));
      const beam = add(`Poutre ${sign < 0 ? 'avant' : 'arrière'}`, [-o.width / 2, beamY, z], [o.width / 2, beamY, z]);
      beams.push(beam);
      for (const post of posts) connect(post, beam);
    }
    for (const [i, x] of linePositions(-(o.width - o.beamWidth) / 2, (o.width - o.beamWidth) / 2, o.rafterSpacing).entries()) {
      const rafter = add(`Chevron ${i + 1}`, [x, o.height - o.beamHeight / 2, -o.depth / 2], [x, o.height - o.beamHeight / 2, o.depth / 2], { group: 'roof', groupName: 'Chevrons' });
      for (const beam of beams) connect(rafter, beam);
    }
  } else if (kind === 'fence') {
    const xs = linePositions(-(o.width - o.postSection) / 2, (o.width - o.postSection) / 2, o.maxSpan);
    const posts = xs.map((x, i) => add(`Poteau ${i + 1}`, [x, 0, 0], [x, o.height, 0], { kind: 'post', width: o.postSection, height: o.postSection }));
    for (let i = 0; i < posts.length - 1; i++) {
      const left = xs[i] + o.postSection / 2, right = xs[i + 1] - o.postSection / 2, rails = [];
      if (right <= left) throw new Error('Espacement insuffisant entre deux poteaux.');
      for (const [label, y] of [['basse', o.beamHeight / 2], ['haute', o.height - o.beamHeight / 2]]) {
        const rail = add(`Traverse ${label} · travée ${i + 1}`, [left, y, 0], [right, y, 0]);
        rails.push(rail); connect(posts[i], rail); connect(posts[i + 1], rail);
      }
      if (o.fill === 'slats') planks(left, right, 0, o.height, -o.beamWidth / 2 - o.plankThickness / 2, rails, `Travée ${i + 1}`);
      else {
        const z = -o.postSection / 2 - 1, corners = [[left, 0, z], [right, 0, z], [right, o.height, z], [left, o.height, z]];
        add(`Grillage · travée ${i + 1}`, corners[0], corners[2], { kind: 'panel', material: 'mesh', width: 1, height: o.height, corners, group: 'mesh', groupName: `Travée ${i + 1}` });
      }
    }
  } else {
    const leafWidth = (o.width - (o.leaves - 1) * o.clearance) / o.leaves;
    for (let leaf = 0; leaf < o.leaves; leaf++) {
      const left = -o.width / 2 + leaf * (leafWidth + o.clearance), right = left + leafWidth, groupName = o.leaves > 1 ? `Vantail ${leaf + 1}` : 'Panneau mobile', group = 'gate';
      const l = add(`Montant gauche · ${groupName}`, [left + o.beamHeight / 2, 0, 0], [left + o.beamHeight / 2, o.height, 0], { group, groupName });
      const r = add(`Montant droit · ${groupName}`, [right - o.beamHeight / 2, 0, 0], [right - o.beamHeight / 2, o.height, 0], { group, groupName });
      const rails = [];
      for (const [label, y] of [['basse', o.beamHeight / 2], ['haute', o.height - o.beamHeight / 2]]) {
        const rail = add(`Traverse ${label} · ${groupName}`, [left + o.beamHeight, y, 0], [right - o.beamHeight, y, 0], { group, groupName });
        rails.push(rail); connect(l, rail, 'screw'); connect(r, rail, 'screw');
      }
      const reverse = kind === 'barn_door' && leaf === 1;
      const brace = add(`Écharpe · ${groupName}`, [reverse ? right - o.beamHeight : left + o.beamHeight, o.beamHeight, 0], [reverse ? left + o.beamHeight : right - o.beamHeight, o.height - o.beamHeight, 0], { kind: 'brace', group, groupName });
      for (const rail of rails) connect(brace, rail, 'screw', { notes: 'Écharpe représentée par son axe : coupes d’extrémité et ajustement à définir avant débit.' });
      planks(left, right, 0, o.height, -o.beamWidth / 2 - o.plankThickness / 2, rails, groupName);
    }
  }
  p.nextId = sequence;
  p = normalizeProject(p);
  const accessories = templateAccessories(input, kind, o);
  p.workshop = { ...(input.workshop || {}), extras: accessories.map(item => ({ id: `template-${item.id}`, label: item.label, qty: item.quantity, unit: item.unit, packSize: 1, price: 0, stock: 0, supplier: '', reference: item.notes, catalogueId: '' })) };
  return p;
}
