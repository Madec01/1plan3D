/**
 * Atelier sur mesure — moteur géométrique et quantitatif autonome.
 * Toutes les cotes internes sont en mm, les prix sont par conditionnement.
 * Les recettes servent à préparer un achat ; elles ne dimensionnent pas une structure.
 */
export const DEFAULT_PROJECT = {
  version: 1, name: 'Mon enclos', width: 4000, depth: 3000, height: 2000,
  postSection: 90, beamWidth: 45, beamHeight: 70, maxSpan: 1500,
  gateWidth: 900, gateHeight: 1800, gatePosition: 0.5, roof: 'mesh', roofRise: 200,
  brace: true, material: 'pin', ground: 'soil', foundation: 'concrete', joint: 'angle',
  footingWidth: 300, footingDepth: 500, concreteYield: 12,
  resinYield: 10, resinCartridge: 300, anchorsPerBase: 4,
  meshRollWidth: 1000, meshRollLength: 25000, meshOverlap: 50,
  margin: 10, woodStockLength: 3000, kerf: 3,
  stock: {}, prices: {}, purchased: {}, notes: '', postOverrides: {}
};

export const SOURCES = [
  { id: 'ppjet', label: 'Simpson — PPJET, pied de jardin à enfoncer', url: 'https://www.simpson.fr/fr-FR/produits/pied-de-poteau-carre-de-jardin-a-enfoncer-ppjet', note: 'Famille jardin : ne constitue pas une fondation structurelle universelle.' },
  { id: 'ppjst', label: 'Simpson — PPJST, pied de jardin à visser', url: 'https://www.simpson.fr/fr-FR/produits/pied-de-poteau-carre-de-jardin-a-visser-ppjst', note: 'Support de jardin ; ne pas confondre avec une vis de fondation dimensionnée.' },
  { id: 'pprc', label: 'Simpson — PPRC, pied réglable', url: 'https://www.simpson.fr/fr-FR/produits/pied-de-poteau-reglable-pprc', note: 'Consulter la fiche du pied réellement choisi et son plan de fixation.' },
  { id: 'connectors', label: 'Simpson — DJH-Z, exemple de connecteur documenté', url: 'https://www.simpson.fr/fr-FR/produits/sabot-secable-pour-lexterieur-zpro-djh-z', note: 'Source documentaire ; les quantités génériques ci-dessous ne sont pas celles de ce produit.' },
  { id: 'fischer', label: 'Fischer — FIS V Plus, scellement par injection', url: 'https://www.fischer.fr/fr-fr/produits/fixations-chimiques/scellements-par-injection/scellement-par-injection-fis-v-plus', note: 'Compatibilité, ancrage, nettoyage et consommation à vérifier dans le système retenu.' },
  { id: 'weasyfix', label: 'Weasyfix — documentation des fondations vissées', url: 'https://weasyfix.eu/faq/', note: 'Le sol et les efforts conditionnent la sélection et la mise en œuvre.' }
];
const source = id => SOURCES.find(s => s.id === id);
const recipe = (id, label, family, supports, description, components, sourceId, conditions) => ({
  id, label, family, supports, description, components, source: source(sourceId).label,
  url: source(sourceId).url, conditions, estimated: true
});
export const RECIPES = [
  recipe('concrete', 'Plot béton + pied à sceller', 'foundation', ['soil', 'pavers'], 'Quantification d’un plot carré dessiné et d’un pied à sceller générique.', ['1 pied à sceller', '2 kits de boulonnage bois (exemple)', 'Béton selon les dimensions saisies'], 'pprc', 'Dimensions du massif, sol, profondeur, pied et boulonnage à confirmer. Le pied PPRC cité illustre la documentation des pieds, pas cette recette générique.'),
  recipe('spike', 'Pied de jardin à enfoncer', 'foundation', ['soil'], 'Solution de jardin légère à examiner selon l’ouvrage.', ['1 pied à enfoncer', '2 kits de boulonnage bois (exemple)'], 'ppjet', 'Non présumé adapté à une structure couverte ou aux efforts importants ; sol et contreventement à examiner.'),
  recipe('screw', 'Vis de fondation + tête', 'foundation', ['soil', 'pavers'], 'Fondation vissée avec tête compatible ; modèle et pose à déterminer.', ['1 vis de fondation', '1 tête compatible', '2 kits de boulonnage bois (exemple)'], 'weasyfix', 'Capacité du sol, efforts et essais de pose à confirmer ; aucune longueur de vis n’est calculée ici.'),
  recipe('plate_mechanical', 'Platine + ancrages mécaniques', 'foundation', ['concrete'], 'Pied sur une dalle porteuse identifiée.', ['1 pied sur platine', 'Ancrages selon le nombre saisi', '2 kits de boulonnage bois (exemple)'], 'pprc', 'Épaisseur et état de la dalle, distances aux bords, diamètre, profondeur et compatibilité du pied à vérifier.'),
  recipe('plate_chemical', 'Platine + scellement chimique', 'foundation', ['concrete'], 'Pied et tiges scellées dans du béton identifié.', ['1 pied sur platine', 'Tiges, écrous et rondelles selon le nombre saisi', 'Résine selon la dose estimée saisie', '2 kits de boulonnage bois (exemple)'], 'fischer', 'Diamètre, profondeur, dose, nettoyage, température et durcissement à confirmer dans la documentation du système ; tamis non inclus pour ce cas béton.'),
  recipe('angle', 'Équerre + vis de connecteur', 'joint', ['wood'], 'Recette d’estimation : une équerre et huit vis par liaison.', ['1 équerre (exemple)', '8 vis de connecteur (exemple)'], 'connectors', 'Ni référence ni résistance validées. Remplacer le quantitatif par le plan de fixation du connecteur réellement retenu.'),
  recipe('screw', 'Vissage direct', 'joint', ['wood'], 'Recette d’estimation : deux vis structurelles par liaison.', ['2 vis structurelles (exemple)'], 'connectors', 'Diamètre, longueur, orientation, distances aux bords et accès de vissage à déterminer pour chaque liaison.'),
  recipe('bolt', 'Boulonnage traversant', 'joint', ['wood'], 'Recette d’estimation : un kit de boulonnage par liaison.', ['1 boulon + 1 écrou + 2 rondelles (exemple)'], 'connectors', 'Accès aux deux faces et géométrie à confirmer. Cette recette ne garantit pas qu’un boulonnage est réalisable sur toutes les jonctions.')
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const number = (v, fallback, lo, hi) => {
  if (v === '' || v === null || typeof v === 'boolean') return fallback;
  const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};
const text = (v, fallback = '', max = 200) => typeof v === 'string' ? v.replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : fallback;
const option = (v, options, fallback) => options.includes(v) ? v : fallback;
const r = (v, digits = 2) => Math.round((v + Number.EPSILON) * 10 ** digits) / 10 ** digits;
const ownObject = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const safeKey = k => /^[a-zA-Z0-9_.:-]{1,120}$/.test(k) && !['__proto__', 'constructor', 'prototype'].includes(k);
const numericMap = v => Object.fromEntries(Object.entries(ownObject(v)).filter(([k]) => safeKey(k)).slice(0, 2000).map(([k, val]) => [k, number(val, 0, 0, 1e9)]));
const grounds = ['soil', 'concrete', 'pavers', 'unknown'];
const foundations = ['concrete', 'spike', 'screw', 'plate_mechanical', 'plate_chemical'];

/** Schéma d’import fermé : aucun champ arbitraire ni valeur non finie n’est conservé. */
export function normalizeProject(input = {}) {
  const v = ownObject(input), d = DEFAULT_PROJECT;
  const p = { version: 1, name: text(v.name, d.name, 100) || d.name };
  for (const [key, min, max] of [
    ['width', 1000, 20000], ['depth', 1000, 20000], ['height', 800, 5000],
    ['postSection', 40, 250], ['beamWidth', 25, 150], ['beamHeight', 35, 250],
    ['maxSpan', 500, 5000], ['gateWidth', 300, 4000], ['gateHeight', 400, 4000],
    ['gatePosition', 0, 1], ['roofRise', 0, 1500], ['footingWidth', 100, 1500],
    ['footingDepth', 100, 2000], ['concreteYield', 1, 100], ['resinYield', 1, 1000],
    ['resinCartridge', 50, 1500], ['anchorsPerBase', 1, 12],
    ['meshRollWidth', 300, 3000], ['meshRollLength', 1000, 100000], ['meshOverlap', 0, 200],
    ['margin', 0, 50], ['woodStockLength', 1000, 12000], ['kerf', 0, 10]
  ]) p[key] = number(v[key], d[key], min, max);
  p.postSection = Math.min(p.postSection, p.width / 10, p.depth / 10);
  p.beamWidth = Math.min(p.beamWidth, p.postSection);
  p.gateWidth = Math.min(p.gateWidth, p.width - 4 * p.postSection - 100);
  p.beamHeight = Math.min(p.beamHeight, (p.gateWidth - 90) / 2, 2 * p.postSection);
  p.gateHeight = Math.min(p.gateHeight, p.height - p.beamHeight - 80);
  p.meshOverlap = Math.min(p.meshOverlap, p.meshRollWidth / 3);
  p.anchorsPerBase = Math.round(p.anchorsPerBase);
  p.brace = typeof v.brace === 'boolean' ? v.brace : d.brace;
  p.roof = option(v.roof, ['none', 'mesh', 'solid'], d.roof);
  p.material = option(v.material, ['pin', 'douglas', 'meleze', 'chene', 'other'], d.material);
  p.ground = option(v.ground, grounds, d.ground);
  p.foundation = option(v.foundation, foundations, d.foundation);
  p.joint = option(v.joint, ['angle', 'screw', 'bolt'], d.joint);
  p.stock = numericMap(v.stock); p.prices = numericMap(v.prices);
  p.purchased = Object.fromEntries(Object.entries(ownObject(v.purchased)).filter(([k]) => safeKey(k)).slice(0, 2000).map(([k, val]) => [k, val === true || val === 'received' || val === 'bought']));
  p.notes = text(v.notes, '', 4000);
  p.postOverrides = {};
  for (const [id, item] of Object.entries(ownObject(v.postOverrides)).slice(0, 1000)) {
    if (!safeKey(id)) continue;
    const override = ownObject(item);
    p.postOverrides[id] = { ground: option(override.ground, grounds, p.ground), foundation: option(override.foundation, foundations, p.foundation) };
  }
  return p;
}

const distance = (a, b) => Math.hypot(...a.map((v, i) => b[i] - v));
const section = (w, h) => `${r(w)} × ${r(h)} mm`;

export function buildProject(input = {}) {
  const p = normalizeProject(input), parts = [], posts = [], joints = [], warnings = [];
  // Largeur/profondeur demandées hors tout bois : les axes sont rentrés d’une demi-section.
  const s = p.postSection, w = p.width, d = p.depth, x0 = -(w - s) / 2, x1 = (w - s) / 2, z0 = -(d - s) / 2, z1 = (d - s) / 2;
  const rise = p.roof === 'none' ? 0 : p.roofRise;
  const top = z => p.height + rise * (z - z0) / (d - s);
  const addWarning = (code, message, severity = 'warning') => { if (!warnings.some(a => a.code === code)) warnings.push({ code, message, severity }); };
  const add = (id, label, kind, material, a, b, width, height, group, extra = {}) => {
    const piece = { id, label, kind, material, a, b, width, height, length: r(distance(a, b)), section: section(width, height), group, ...extra };
    parts.push(piece); return piece;
  };
  const addPost = (id, x, z) => {
    const existing = posts.find(a => Math.abs(a.x - x) < 0.01 && Math.abs(a.z - z) < 0.01);
    if (existing) return existing;
    const override = p.postOverrides[id] || {}, post = { id, x, z, height: top(z), ground: override.ground || p.ground, foundation: override.foundation || p.foundation };
    posts.push(post);
    add(id, `Poteau ${id}`, 'post', 'wood', [x, 0, z], [x, post.height, z], s, s, 'structure');
    return post;
  };
  const corners = [addPost('P-AV-G', x0, z0), addPost('P-AV-D', x1, z0), addPost('P-AR-D', x1, z1), addPost('P-AR-G', x0, z1)];
  const gateMin = x0 + 1.5 * s + 50 + p.gateWidth / 2;
  const gateMax = x1 - 1.5 * s - 50 - p.gateWidth / 2;
  const gateCenter = gateMin + (gateMax - gateMin) * p.gatePosition;
  const gateLeft = addPost('P-PORTE-G', gateCenter - (p.gateWidth + s) / 2, z0);
  const gateRight = addPost('P-PORTE-D', gateCenter + (p.gateWidth + s) / 2, z0);
  const join = (id, aPart, bPart, position, type = p.joint) => joints.push({ id, type, aPart, bPart, position, recipe: type });
  const subdivide = (left, right, prefix) => {
    const length = Math.hypot(right.x - left.x, right.z - left.z), n = Math.ceil(length / p.maxSpan), row = [left];
    for (let i = 1; i < n; i++) row.push(addPost(`P-${prefix}-${i}`, left.x + (right.x - left.x) * i / n, left.z + (right.z - left.z) * i / n));
    row.push(right); return row;
  };
  const runs = [
    { id: 'AV-G', row: subdivide(corners[0], gateLeft, 'AV-G') },
    { id: 'AV-D', row: subdivide(gateRight, corners[1], 'AV-D') },
    { id: 'D', row: subdivide(corners[1], corners[2], 'D') },
    { id: 'AR', row: subdivide(corners[3], corners[2], 'AR') },
    { id: 'G', row: subdivide(corners[0], corners[3], 'G') }
  ];
  const panel = (id, a, b, bottom, h1, h2, group = 'mesh') => {
    const horizontal = Math.hypot(b[0] - a[0], b[2] - a[2]), maxHeight = Math.max(h1, h2) - bottom;
    if (horizontal <= 0 || maxHeight <= 0) return;
    add(id, group === 'gate' ? 'Grillage du portillon' : `Grillage ${id}`, 'mesh', 'mesh', [a[0], bottom, a[2]], [b[0], Math.max(h1, h2), b[2]], 1, maxHeight, group,
      { surfaceWidth: horizontal, surfaceHeight: maxHeight, area: horizontal * ((h1 + h2) / 2 - bottom) / 1e6, endHeights: [h1, h2], estimated: true });
  };
  const beamBetween = (pa, pb, id, level, group = 'structure') => {
    const span = Math.hypot(pb.x - pa.x, pb.z - pa.z), ux = (pb.x - pa.x) / span, uz = (pb.z - pa.z) / span;
    const xa = pa.x + ux * s / 2, za = pa.z + uz * s / 2, xb = pb.x - ux * s / 2, zb = pb.z - uz * s / 2;
    const ya = level === 'top' ? top(za) - p.beamHeight / 2 : 100 + p.beamHeight / 2;
    const yb = level === 'top' ? top(zb) - p.beamHeight / 2 : ya;
    const b = add(id, level === 'top' ? 'Traverse haute' : 'Traverse basse', 'beam', 'wood', [xa, ya, za], [xb, yb, zb], p.beamWidth, p.beamHeight, group);
    join(`J-${id}-A`, pa.id, id, b.a); join(`J-${id}-B`, pb.id, id, b.b); return b;
  };
  for (const run of runs) for (let i = 0; i < run.row.length - 1; i++) {
    const pa = run.row[i], pb = run.row[i + 1], id = `${run.id}-${i + 1}`;
    const beam = beamBetween(pa, pb, `T-${id}-H`, 'top');
    beamBetween(pa, pb, `T-${id}-B`, 'bottom');
    panel(`G-${id}`, beam.a, beam.b, 100, top(beam.a[2]), top(beam.b[2]));
  }
  const lintel = beamBetween(gateLeft, gateRight, 'T-PORTE-H', 'top');
  const leafWidth = p.gateWidth - 30, leafHeight = p.gateHeight, bottom = 50;
  const leafL = gateCenter - leafWidth / 2, leafR = gateCenter + leafWidth / 2, frame = p.beamHeight;
  const ga = add('PORTE-M-G', 'Portillon : montant gauche', 'gate', 'wood', [leafL + frame / 2, bottom, z0], [leafL + frame / 2, bottom + leafHeight, z0], p.beamWidth, frame, 'gate', { orientation: 'gateVertical' });
  const gb = add('PORTE-M-D', 'Portillon : montant droit', 'gate', 'wood', [leafR - frame / 2, bottom, z0], [leafR - frame / 2, bottom + leafHeight, z0], p.beamWidth, frame, 'gate', { orientation: 'gateVertical' });
  for (const [id, y] of [['B', bottom + frame / 2], ['H', bottom + leafHeight - frame / 2]]) {
    const rail = add(`PORTE-T-${id}`, 'Portillon : traverse', 'gate', 'wood', [leafL + frame, y, z0], [leafR - frame, y, z0], p.beamWidth, frame, 'gate');
    join(`J-PORTE-${id}-G`, ga.id, rail.id, rail.a); join(`J-PORTE-${id}-D`, gb.id, rail.id, rail.b);
  }
  const diagonal = add('PORTE-DIAG', 'Portillon : diagonale', 'brace', 'wood', [leafL + frame, bottom + frame, z0], [leafR - frame, bottom + leafHeight - frame, z0], p.beamWidth, frame, 'gate');
  join('J-PORTE-DIAG-A', ga.id, diagonal.id, diagonal.a); join('J-PORTE-DIAG-B', gb.id, diagonal.id, diagonal.b);
  panel('G-PORTE', [leafL + frame, 0, z0], [leafR - frame, 0, z0], bottom + frame, bottom + leafHeight - frame, bottom + leafHeight - frame, 'gate');
  panel('G-IMPOSTE', lintel.a, lintel.b, bottom + leafHeight + 15, p.height, p.height);
  if (p.brace) {
    for (const corner of corners) for (const run of runs.filter(a => a.row.includes(corner))) {
      const index = run.row.indexOf(corner), next = index === 0 ? run.row[1] : run.row[index - 1];
      const span = Math.hypot(next.x - corner.x, next.z - corner.z), ux = (next.x - corner.x) / span, uz = (next.z - corner.z) / span;
      const reach = Math.min(500, (span - s) * 0.6), drop = Math.min(500, p.height / 3);
      if (reach < 60) { addWarning('brace-short', 'Une travée est trop courte pour la jambe de force d’exemple : détail à concevoir.'); continue; }
      const ax = corner.x + ux * s / 2, az = corner.z + uz * s / 2, bx = ax + ux * reach, bz = az + uz * reach;
      const b = add(`C-${corner.id}-${run.id}`, 'Jambe de force', 'brace', 'wood', [ax, top(az) - p.beamHeight - drop, az], [bx, top(bz) - p.beamHeight, bz], p.beamWidth, p.beamHeight, 'structure');
      join(`J-${b.id}-A`, corner.id, b.id, b.a); join(`J-${b.id}-B`, `T-${run.id}-${index === 0 ? 1 : run.row.length - 1}-H`, b.id, b.b);
    }
  }
  if (p.roof !== 'none') {
    const count = Math.ceil((w - s) / p.maxSpan);
    const roofSupport = (x, z) => {
      const supportingPost = posts.find(post => Math.abs(post.z - z) < 0.01 && Math.abs(post.x - x) <= s / 2);
      if (supportingPost) return supportingPost.id;
      return parts.find(part => part.kind === 'beam' && part.id.startsWith('T-') && part.id.endsWith('-H') && Math.abs(part.a[2] - z) < 0.01 && Math.abs(part.b[2] - z) < 0.01 && x >= Math.min(part.a[0], part.b[0]) && x <= Math.max(part.a[0], part.b[0]))?.id || lintel.id;
    };
    for (let i = 1; i < count; i++) {
      const x = x0 + (w - s) * i / count;
      const b = add(`CHEV-${i}`, 'Chevron de couverture', 'beam', 'wood', [x, top(z0 + s / 2) + p.beamHeight / 2, z0 + s / 2], [x, top(z1 - s / 2) + p.beamHeight / 2, z1 - s / 2], p.beamWidth, p.beamHeight, 'roof');
      join(`J-${b.id}-AV`, roofSupport(x, z0), b.id, b.a); join(`J-${b.id}-AR`, roofSupport(x, z1), b.id, b.b);
    }
    const slopeLength = Math.hypot(d, rise * d / (d - s));
    // La couverture suit la pente et atteint les faces extérieures des poteaux, sans débord.
    const roofCorners = [[-w / 2, top(-d / 2) + p.beamHeight, -d / 2], [w / 2, top(-d / 2) + p.beamHeight, -d / 2], [w / 2, top(d / 2) + p.beamHeight, d / 2], [-w / 2, top(d / 2) + p.beamHeight, d / 2]];
    add('COUVERTURE', p.roof === 'mesh' ? 'Grillage de couverture' : 'Couverture pleine', p.roof === 'mesh' ? 'mesh' : 'roof', p.roof === 'mesh' ? 'mesh' : 'roof', roofCorners[0], roofCorners[2], 5, 5, 'roof', { surfaceWidth: w, surfaceHeight: slopeLength, area: w * slopeLength / 1e6, corners: roofCorners, estimated: true });
    addWarning('roof-loads', 'Couverture : sections, portées, vent, soulèvement et ancrages restent à vérifier. Aucun dimensionnement de résistance n’est effectué.');
  }
  for (const post of posts) {
    const rec = RECIPES.find(a => a.family === 'foundation' && a.id === post.foundation);
    if (post.ground === 'unknown') addWarning(`support-${post.id}`, `${post.id} : support à identifier avant de choisir l’ancrage.`);
    else if (!rec.supports.includes(post.ground)) addWarning(`support-${post.id}`, `${post.id} : « ${rec.label} » n’est pas couvert ici pour le support choisi. Modifier la solution ou faire préciser le support.`);
    if (post.foundation === 'spike') addWarning('spike-limit', 'Les pieds de jardin à enfoncer ne sont pas validés ici pour une structure couverte ou soumise à des efforts importants.');
    if (post.ground === 'pavers') addWarning('pavers-limit', 'Des pavés ne sont pas assimilés à une dalle porteuse : la fondation doit reprendre le support sous le revêtement.');
    if (post.foundation === 'concrete') add('F-' + post.id, 'Plot béton indicatif', 'footing', 'concrete', [post.x, -p.footingDepth, post.z], [post.x, 0, post.z], p.footingWidth, p.footingWidth, 'foundation', { boxDim: [p.footingWidth, p.footingDepth, p.footingWidth], volumeLitres: p.footingWidth ** 2 * p.footingDepth / 1e6, estimated: true });
    add('PIED-' + post.id, rec.label, 'metal', 'metal', [post.x, 0, post.z], [post.x, 70, post.z], s + 30, s + 30, 'foundation', { foundation: post.foundation, estimated: true });
  }
  const wood = parts.filter(a => a.material === 'wood');
  if (p.footingWidth <= p.postSection && posts.some(post => post.foundation === 'concrete')) addWarning('footing-small', 'La largeur du plot est inférieure ou égale à la section du poteau : géométrie et fixation à revoir.');
  if (wood.some(a => a.length > p.woodStockLength)) addWarning('wood-too-long', 'Certaines pièces dépassent la longueur commerciale choisie : elles sont listées séparément, sans raccord automatique.');
  if (p.joint === 'bolt') addWarning('bolt-access', 'Boulonnage : la faisabilité et l’accès des deux côtés de chaque liaison sont à confirmer ; un kit par liaison est seulement une hypothèse d’achat.');
  if (parts.some(part => part.material === 'mesh' && meshConsumption(part, p).impossible)) addWarning('mesh-too-short', 'Certains lés de grillage dépassent la longueur du rouleau dans les deux orientations : le calepinage et le devis restent à compléter.');
  addWarning('geometry-only', 'Largeur et profondeur hors tout bois ; couverture sans débord. Recettes, sections, fondations et assemblages sont des estimations à confirmer ; aucune validation structurelle.', 'info');
  const stats = { postCount: posts.length, woodPieces: wood.length, jointCount: joints.length, woodLength: r(wood.reduce((a, b) => a + b.length, 0) / 1000), meshArea: r(parts.filter(a => a.material === 'mesh').reduce((a, b) => a + b.area, 0)), roofArea: r(parts.filter(a => a.id === 'COUVERTURE').reduce((a, b) => a + b.area, 0)), concreteLitres: r(parts.filter(a => a.kind === 'footing').reduce((a, b) => a + b.volumeLitres, 0)), footingCount: parts.filter(a => a.kind === 'footing').length };
  return { parts, posts, joints, warnings, stats, gate: { center: gateCenter, left: gateCenter - p.gateWidth / 2, right: gateCenter + p.gateWidth / 2, clearWidth: p.gateWidth, leafWidth, bottom, height: leafHeight }, project: p };
}

/** Débit glouton par section ; trait de scie entre pièces, sans surcote d’équarrissage. */
export function optimizeCuts(input = [], stockLengths = [2400, 3000, 4000], kerf = 3) {
  const lengths = [...new Set(stockLengths.map(Number).filter(a => Number.isFinite(a) && a > 0))].sort((a, b) => a - b);
  const saw = number(kerf, 3, 0, 20), bars = [], unplaced = [], pieces = [];
  for (const part of Array.isArray(input) ? input : []) {
    if (!Number.isFinite(Number(part.length)) || part.length <= 0) continue;
    const qty = Math.floor(number(part.quantity, 1, 1, 10000));
    for (let i = 0; i < qty; i++) pieces.push({ ...part, length: Number(part.length), id: qty > 1 ? `${part.id}-${i + 1}` : part.id });
  }
  pieces.sort((a, b) => b.length - a.length);
  for (const piece of pieces) {
    const key = piece.section || section(piece.width || 0, piece.height || 0);
    let bar = bars.filter(a => a.section === key && a.stockLength - a.used >= piece.length + saw - 1e-6).sort((a, b) => (a.stockLength - a.used) - (b.stockLength - b.used))[0];
    if (!bar) {
      const stockLength = lengths.find(a => a >= piece.length - 1e-6);
      if (!stockLength) { unplaced.push(piece); continue; }
      bar = { id: `BAR-${bars.length + 1}`, section: key, stockLength, length: stockLength, used: 0, waste: stockLength, cuts: [] }; bars.push(bar);
    }
    bar.used += piece.length + (bar.cuts.length ? saw : 0);
    bar.cuts.push({ id: piece.id, label: piece.label || piece.id || 'Pièce', length: piece.length });
    bar.used = r(bar.used, 3); bar.waste = r(bar.stockLength - bar.used, 3);
  }
  const totalStock = bars.reduce((a, b) => a + b.stockLength, 0), totalUsed = bars.reduce((a, b) => a + b.used, 0);
  return { bars, unplaced, totalStock, totalUsed: r(totalUsed), totalWaste: r(totalStock - totalUsed), kerf: saw, efficiency: totalStock ? totalUsed / totalStock : 0 };
}

/** Calepinage rectangulaire simple : choisit le sens consommant le moins de rouleau. */
function meshConsumption(part, p) {
  const width = part.surfaceWidth + 2 * p.meshOverlap, height = part.surfaceHeight + 2 * p.meshOverlap;
  const strips = span => Math.max(1, Math.ceil((span - p.meshOverlap) / (p.meshRollWidth - p.meshOverlap)));
  const vertical = { count: strips(width), cutLength: height, orientation: 'verticale' };
  const horizontal = { count: strips(height), cutLength: width, orientation: 'horizontale' };
  const viable = [vertical, horizontal].filter(a => a.cutLength <= p.meshRollLength);
  const candidate = (viable.length ? viable : [vertical, horizontal]).sort((a, b) => a.count * a.cutLength - b.count * b.cutLength)[0];
  return { ...candidate, partId: part.id, length: candidate.count * candidate.cutLength, impossible: !viable.length };
}

export function calculateBOM(input = {}, built) {
  const p = normalizeProject(input), model = built || buildProject(p), rows = [];
  const row = (id, category, label, spec, unit, required, packSize = 1, options = {}) => {
    const reserve = options.noMargin ? 0 : required * p.margin / 100;
    const stock = p.stock[id] || 0, toBuy = Math.max(0, required + reserve - stock), packs = Math.ceil((toBuy - 1e-9) / packSize);
    const unitPrice = p.prices[id] || 0;
    const item = { id, category, label, spec, unit, required: r(required, 3), marginQty: r(reserve, 3), stock, toBuy: r(toBuy, 3), packSize, packs: Math.max(0, packs), purchaseQty: r(Math.max(0, packs) * packSize, 3), unitPrice, total: r(Math.max(0, packs) * unitPrice), estimated: true, priced: unitPrice > 0 || toBuy === 0, detail: '', source: '', partIds: [], ...options };
    delete item.noMargin; rows.push(item); return item;
  };
  const wood = model.parts.filter(a => a.material === 'wood'), groups = new Map();
  for (const piece of wood) { if (!groups.has(piece.section)) groups.set(piece.section, []); groups.get(piece.section).push(piece); }
  for (const [sec, pieces] of groups) {
    const cut = optimizeCuts(pieces, [p.woodStockLength], p.kerf), first = pieces[0], key = `wood-${first.width}x${first.height}-${p.woodStockLength}`;
    if (cut.bars.length) row(key, 'Bois', `Bois ${p.material} — ${sec}`, `${p.woodStockLength} mm`, 'barre', cut.bars.length, 1, { noMargin: true, partIds: pieces.filter(a => !cut.unplaced.some(b => b.id === a.id)).map(a => a.id), detail: `${pieces.length - cut.unplaced.length} pièces ; ${r(cut.totalWaste / 1000)} m de chutes. Trait de scie ${p.kerf} mm entre pièces. Pas de réserve supplémentaire sur les barres ; surcotes d’usinage non ajoutées.` });
    const outsize = new Map();
    for (const item of cut.unplaced) { const len = Math.ceil(item.length); if (!outsize.has(len)) outsize.set(len, []); outsize.get(len).push(item); }
    for (const [len, items] of outsize) row(`wood-custom-${first.width}x${first.height}-${len}`, 'Bois', 'Pièces hors longueur commerciale', `${sec} × ${len} mm minimum`, 'pièce', items.length, 1, { noMargin: true, needsQuote: true, partIds: items.map(a => a.id), detail: 'Ligne à chiffrer pour compléter le budget. À commander dans une longueur suffisante. Aucun raccord automatique ; longueur finie, surcote d’usinage à prévoir.' });
  }
  const meshParts = model.parts.filter(a => a.material === 'mesh'), meshCuts = meshParts.map(a => meshConsumption(a, p));
  if (meshCuts.length) {
    const linear = meshCuts.reduce((a, b) => a + b.length, 0) / 1000;
    // Les lés sont indivisibles : la somme seule sous-estimerait les rouleaux.
    const strips = meshCuts.flatMap(c => Array.from({ length: c.count }, (_, i) => ({ id: `${c.partId}-${i + 1}`, length: c.cutLength, section: 'grillage' })));
    const packed = optimizeCuts(strips, [p.meshRollLength], 0);
    const item = row('mesh-roll', 'Grillage', 'Grillage en rouleau', `Largeur ${p.meshRollWidth} mm · rouleau ${p.meshRollLength / 1000} m`, 'm', linear, p.meshRollLength / 1000, { partIds: meshParts.map(a => a.id), detail: `Lés avec recouvrement ${p.meshOverlap} mm et retour de ${p.meshOverlap} mm par bord ; coupe rectangulaire des pentes. Découpes optimisées en longueur, chutes de largeur non réutilisées. ${packed.bars.length} rouleaux pour les lés entiers avant stock et réserve.${packed.unplaced.length ? ' ATTENTION : certains lés dépassent la longueur du rouleau ; calepinage à revoir.' : ''}`, cuts: meshCuts });
    // Le stock saisi représente des rouleaux entiers puis un seul reste continu.
    // Une chute trop courte ne peut pas compenser arbitrairement un lé indivisible.
    let fullStockRolls = Math.floor(item.stock * 1000 / p.meshRollLength);
    const stockRemainder = item.stock * 1000 % p.meshRollLength;
    const stockBins = stockRemainder > 0 ? [stockRemainder] : [], remainingStrips = [];
    for (const strip of [...strips].sort((a, b) => b.length - a.length)) {
      let bin = stockBins.map((available, index) => ({ available, index })).filter(a => a.available + 1e-6 >= strip.length).sort((a, b) => a.available - b.available)[0]?.index;
      if (bin === undefined && fullStockRolls > 0 && strip.length <= p.meshRollLength) { stockBins.push(p.meshRollLength); bin = stockBins.length - 1; fullStockRolls--; }
      if (bin !== undefined) stockBins[bin] -= strip.length;
      else remainingStrips.push(strip);
    }
    const remainderPlan = optimizeCuts(remainingStrips, [p.meshRollLength], 0);
    item.packs = Math.max(item.packs, remainderPlan.bars.length);
    item.purchaseQty = item.packs * item.packSize; item.total = r(item.packs * item.unitPrice);
    item.priced = item.unitPrice > 0 || item.packs === 0;
    item.needsReview = packed.unplaced.length > 0;
    if (item.stock) item.detail += ' Stock supposé composé de rouleaux entiers et d’un seul reste continu ; vérifier la longueur réelle des chutes.';
    const stapleCount = meshParts.reduce((sum, part) => sum + Math.ceil(2 * (part.surfaceWidth + part.surfaceHeight) / 150), 0);
    row('mesh-fasteners', 'Fixations', 'Attaches de grillage', 'Fixation au bois · espacement indicatif 150 mm', 'pièce', stapleCount, 100, { partIds: meshParts.map(a => a.id), detail: 'Estimation par périmètre de panneau. Type, espacement, pose des lés et environnement à confirmer.' });
  }
  const solid = model.parts.find(a => a.material === 'roof');
  if (solid) {
    row('roof-cover', 'Couverture', 'Couverture à préciser', 'Surface utile ; format et recouvrements à renseigner', 'm²', solid.area, 1, { partIds: [solid.id], detail: 'Surface seule : ce poste n’est pas encore un calepinage de plaques. Rives, égout et raccords ne sont pas dimensionnés.' });
    row('roof-fasteners', 'Fixations', 'Fixations de couverture', '6 par m² · hypothèse à remplacer', 'pièce', Math.ceil(solid.area * 6), 50, { partIds: [solid.id], detail: 'Type de fixation, rondelles d’étanchéité et densité à confirmer suivant la couverture.' });
  }
  const footingParts = model.parts.filter(a => a.kind === 'footing');
  if (footingParts.length) row('concrete-bags', 'Fondations', 'Béton prêt à gâcher', `Rendement saisi ${p.concreteYield} L / sac`, 'L', footingParts.reduce((a, b) => a + b.volumeLitres, 0), p.concreteYield, { partIds: footingParts.map(a => a.id), detail: 'Volume des plots dessinés. Rendement du sac complet à vérifier. Armatures, coffrage et terrassement non inclus. Les dimensions saisies ne sont pas un dimensionnement de fondation.' });
  for (const kind of foundations) {
    const posts = model.posts.filter(a => a.foundation === kind); if (!posts.length) continue;
    const rec = RECIPES.find(a => a.family === 'foundation' && a.id === kind), ids = posts.map(a => a.id);
    row(`base-${kind}`, 'Fondations', kind === 'screw' ? 'Vis de fondation' : kind === 'concrete' ? 'Pied de poteau à sceller' : rec.label.split(' + ')[0], 'Modèle et dimensions à confirmer', 'pièce', posts.length, 1, { noMargin: true, partIds: ids, source: rec.url, detail: rec.conditions });
    if (kind === 'screw') row('screw-head', 'Fondations', 'Tête de vis de fondation', 'Compatible avec vis et poteau', 'pièce', posts.length, 1, { noMargin: true, partIds: ids, source: rec.url });
    if (kind === 'plate_mechanical') row('mechanical-anchor', 'Fixations', 'Kit d’ancrage mécanique', 'Référence à choisir · écrou/rondelle inclus si fournis', 'kit', posts.length * p.anchorsPerBase, 10, { partIds: ids, source: rec.url, detail: `${p.anchorsPerBase} ancrages par pied : hypothèse modifiable, à vérifier dans le plan de fixation. Ne pas recompter les accessoires inclus.` });
    if (kind === 'plate_chemical') {
      const qty = posts.length * p.anchorsPerBase;
      row('chemical-rod-kit', 'Fixations', 'Kit tige + écrou + rondelle', 'Diamètre, longueur, protection et système à confirmer', 'kit', qty, 10, { partIds: ids, source: rec.url, detail: `${p.anchorsPerBase} tiges par pied : hypothèse d’achat. Pas de tamis ajouté pour ce cas béton. Accessoires inclus dans le kit.` });
      row('resin-cartridge', 'Scellement', 'Résine de scellement', `Dose estimée ${p.resinYield} ml / point · cartouche ${p.resinCartridge} ml`, 'ml', qty * p.resinYield, p.resinCartridge, { partIds: ids, source: rec.url, detail: 'Dose saisie, non calculée par diamètre/profondeur. Réserve générale incluse ; amorçage, pertes, nettoyage et nombre de reprises à confirmer.' });
      row('resin-nozzle', 'Scellement', 'Embout mélangeur', '1 par cartouche nécessaire avant réserve', 'pièce', Math.ceil(qty * p.resinYield * (1 + p.margin / 100) / p.resinCartridge), 1, { noMargin: true, partIds: ids, source: rec.url, detail: 'Estimation ; déduire les embouts fournis avec les cartouches. Les pauses de travail peuvent en demander davantage.' });
    }
  }
  row('post-bolt-kit', 'Fixations', 'Boulonnage poteau / pied', '1 boulon + 1 écrou + 2 rondelles par kit', 'kit', model.posts.length * 2, 10, { partIds: model.posts.map(a => a.id), detail: 'Deux kits par poteau sont une hypothèse. Nombre, diamètre, longueur et accessoires inclus dans le pied à confirmer.' });
  const count = model.joints.length, jointIds = model.joints.map(a => a.id);
  if (p.joint === 'angle') {
    row('joint-angle', 'Assemblages', 'Équerres', '1 par liaison · modèle à confirmer', 'pièce', count, 1, { partIds: jointIds, detail: 'Recette générique, sans référence constructeur ni résistance associée.' });
    row('joint-angle-screws', 'Fixations', 'Vis de connecteur', '8 par liaison · référence à confirmer', 'pièce', count * 8, 100, { partIds: jointIds, detail: 'Huit vis sont une hypothèse d’achat, pas un plan de fixation fabricant.' });
  } else if (p.joint === 'screw') row('joint-structural-screws', 'Fixations', 'Vis structurelles', '2 par liaison · dimensions à confirmer', 'pièce', count * 2, 100, { partIds: jointIds, detail: 'Vérifier la faisabilité et les règles de chaque assemblage ; vissage en bout non validé automatiquement.' });
  else row('joint-bolt-kit', 'Assemblages', 'Kits de boulonnage des assemblages', '1 boulon + 1 écrou + 2 rondelles', 'kit', count, 10, { partIds: jointIds, detail: 'Un kit par liaison : hypothèse ; accès et géométrie à confirmer.' });
  row('gate-hinges', 'Portillon', 'Gonds / charnières de portillon', 'Modèle et fixations à préciser', 'pièce', 2, 1, { noMargin: true, partIds: ['PORTE-M-G'], detail: 'Deux charnières sont une hypothèse. Fixations supposées incluses : les vérifier dans le kit choisi.' });
  row('gate-latch', 'Portillon', 'Loquet de portillon', 'Kit complet à préciser', 'kit', 1, 1, { noMargin: true, partIds: ['PORTE-M-D'], detail: 'Fixations supposées incluses : vérifier le conditionnement.' });
  return rows;
}

export function toCSV(rows = [], purchased = {}) {
  const escape = v => {
    // Neutralisation des formules lors de l’ouverture dans un tableur.
    let str = String(v ?? ''); if (/^[=+@\-\t\r]/.test(str)) str = `'${str}`;
    return `"${str.replaceAll('"', '""')}"`;
  };
  const columns = [
    ['status', 'État checklist'], ['category', 'Famille'], ['label', 'Désignation'], ['spec', 'Caractéristiques'],
    ['required', 'Besoin net'], ['marginQty', 'Réserve'], ['stock', 'Stock'],
    ['toBuy', 'Manquant'], ['unit', 'Unité'], ['packSize', 'Contenu du conditionnement'],
    ['packs', 'Conditionnements à acheter'], ['purchaseQty', 'Quantité achetée'],
    ['priceProvided', 'Prix renseigné'], ['unitPrice', 'Prix par conditionnement EUR'], ['total', 'Total EUR'], ['detail', 'Hypothèses'], ['source', 'Source']
  ];
  const checklist = ownObject(purchased);
  return '\ufeff' + [columns.map(([, label]) => escape(label)).join(';'), ...rows.map(item => {
    const values = { ...item, status: checklist[item.id] === true || checklist[item.id] === 'bought' || checklist[item.id] === 'received' ? 'Acheté' : 'À acheter', priceProvided: Number(item.unitPrice) > 0 ? 'Oui' : 'Non' };
    return columns.map(([key]) => escape(values[key])).join(';');
  })].join('\r\n');
}
