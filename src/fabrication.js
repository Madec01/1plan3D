/** Plans et dossier issus du modèle géométrique réel. Unités : mm. */
import * as THREE from 'three';
import { timberQuaternion, panelCorners } from './geometry.js';
import { buildJointFixings, getFoundationJoints, createFixingGeometry, getFixingCounts } from './fixings.js';
import { normalizeManufacturing, analyzeTimberCut, formatDimension, timberCutSheetSVG } from './manufacturing.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('fr-FR', { maximumFractionDigits: digits }) : '—';
const pointText = (point, precision=1) => Array.isArray(point) ? point.map(v => formatDimension(v,precision)).join(' ; ') : '—';
const center = part => part.a.map((v, i) => (v + part.b[i]) / 2);
const views = { top: { name: 'Dessus', axes: ['X', 'Z'], project: p => [p[0], p[2]] }, front: { name: 'Face', axes: ['X', 'Y'], project: p => [p[0], -p[1]] }, side: { name: 'Côté droit', axes: ['Z', 'Y'], project: p => [p[2], -p[1]] } };
const finitePoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
let nextClip = 0;
const allJoints = (model, project = model.project || {}) => [...new Map([...(model.joints || []), ...getFoundationJoints(model, project)].map(j => [j.id, j])).values()];
export function fixationSchedule(model, project = model.project || {}) {
  return allJoints(model, project).filter(j => j.valid !== false).flatMap(j => buildJointFixings(j, model).map(f => ({ ...f, reference: j.reference || '', aPart: j.aPart, bPart: j.bPart })));
}
function fixingOutline(fixing,projectPoint){
  const geometry=createFixingGeometry(fixing.type,{recipe:fixing.recipe,...fixing.geometry}),edges=new THREE.EdgesGeometry(geometry,25),positions=edges.getAttribute('position'),quaternion=new THREE.Quaternion(...fixing.quaternion),origin=new THREE.Vector3(...fixing.position),points=[];
  for(let i=0;i<positions.count;i++)points.push(projectPoint(new THREE.Vector3().fromBufferAttribute(positions,i).multiplyScalar(1000).applyQuaternion(quaternion).add(origin).toArray()));
  edges.dispose();geometry.dispose();return points;
}

function partCorners(part) {
  if (!finitePoint(part.a) || !finitePoint(part.b)) return [];
  if (part.kind === 'panel' || ['roof', 'mesh'].includes(part.material)) return panelCorners(part).filter(finitePoint);
  if (part.boxDim) {
    const c = center(part), points = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push([c[0] + x * part.boxDim[0] / 2, c[1] + y * part.boxDim[1] / 2, c[2] + z * part.boxDim[2] / 2]);
    return points;
  }
  if (part.kind === 'wall') {
    const dx = part.b[0] - part.a[0], dz = part.b[2] - part.a[2], length = Math.hypot(dx, dz) || 1, n = [-dz / length, 0, dx / length], points = [];
    for (const p of [part.a, part.b]) for (const side of [-1, 1]) for (const top of [0, 1]) points.push([p[0] + n[0] * part.width / 2 * side, p[1] + part.height * top, p[2] + n[2] * part.width / 2 * side]);
    return points;
  }
  const q = timberQuaternion(part), points = [];
  for (const p of [part.a, part.b]) for (const x of [-1, 1]) for (const y of [-1, 1]) points.push(new THREE.Vector3(x * (part.width || 1) / 2, y * (part.height || 1) / 2, 0).applyQuaternion(q).add(new THREE.Vector3(...p)).toArray());
  return points;
}
const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function hull(points) {
  const ordered = [...new Map(points.map(p => [p.map(v => Math.round(v * 1e6)).join(','), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (ordered.length < 3) return ordered;
  const lower = [], upper = [];
  for (const p of ordered) { while (lower.length >= 2 && cross2(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...ordered].reverse()) { while (upper.length >= 2 && cross2(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function projectedBounds(model, view = 'top', { showFoundations = false } = {}) {
  const projection = views[view] || views.top;
  const parts = (model?.parts || []).filter(p => showFoundations || (p.group !== 'foundation' && p.material !== 'metal' && p.kind !== 'footing'));
  const items = parts.map(part => ({ part, points: hull(partCorners(part).map(projection.project)) })).filter(item => item.points.length);
  const points = items.flatMap(item => item.points);
  const min = [0, 1].map(i => points.length ? Math.min(...points.map(p => p[i])) : 0), max = [0, 1].map(i => points.length ? Math.max(...points.map(p => p[i])) : 0);
  return { items, min, max, width: max[0] - min[0], height: max[1] - min[1], axes: projection.axes };
}

/** SVG autonome. Les dimensions portent sur les enveloppes réelles projetées. */
export function projectionSVG(model, view = 'top', options = {}) {
  const projection = views[view] || views.top, bounds = projectedBounds(model, view, options);
  const precision=options.precision ?? model.project?.manufacturing?.precision ?? 1,dim=v=>formatDimension(v,precision);
  const fixings = options.fixings === false ? [] : fixationSchedule(model).filter(f => !options.jointId || f.jointId === options.jointId);
  const fittingPoints = [...bounds.items.flatMap(item => item.points), ...fixings.map(f => projection.project(f.position))];
  const drawingMin = options.focusBounds?.min || [0, 1].map(i => fittingPoints.length ? Math.min(...fittingPoints.map(p => p[i])) : 0), drawingMax = options.focusBounds?.max || [0, 1].map(i => fittingPoints.length ? Math.max(...fittingPoints.map(p => p[i])) : 0);
  const drawingSize = drawingMax.map((v, i) => v - drawingMin[i]);
  const width = Number.isFinite(options.width) ? Math.max(300, options.width) : 1100, height = Number.isFinite(options.height) ? Math.max(240, options.height) : 650;
  const margin = 85, top = 64, bottom = 88, usableW = width - margin * 2, usableH = height - top - bottom;
  const clipId=`fab-clip-${nextClip++}`;
  const scale = Math.min(usableW / Math.max(1, drawingSize[0]), usableH / Math.max(1, drawingSize[1]));
  const offset = [margin + (usableW - drawingSize[0] * scale) / 2, top + (usableH - drawingSize[1] * scale) / 2];
  const screen = p => p.map((v, i) => offset[i] + (v - drawingMin[i]) * scale);
  const [start, end] = [screen(bounds.min), screen(bounds.max)];
  const dimensions = options.dimensions !== false && bounds.items.length ? `<g stroke="#2d5147" stroke-width="1" fill="none"><path d="M${start[0]},${end[1] + 10}V${end[1] + 35}M${end[0]},${end[1] + 10}V${end[1] + 35}M${start[0]},${end[1] + 28}H${end[0]}M${start[0] - 4},${end[1] + 32}l8,-8M${end[0] - 4},${end[1] + 32}l8,-8"/><path d="M${start[0] - 10},${start[1]}H${start[0] - 35}M${start[0] - 10},${end[1]}H${start[0] - 35}M${start[0] - 28},${start[1]}V${end[1]}M${start[0] - 32},${start[1] + 4}l8,-8M${start[0] - 32},${end[1] + 4}l8,-8"/></g><g fill="#2d5147" font-size="12"><text x="${(start[0] + end[0]) / 2}" y="${end[1] + 48}" text-anchor="middle">${dim(bounds.width)} mm · ${projection.axes[0]}</text><text transform="translate(${start[0] - 46} ${(start[1] + end[1]) / 2}) rotate(-90)" text-anchor="middle">${dim(bounds.height)} mm · ${projection.axes[1]}</text></g>` : '';
  const shapes = bounds.items.map(({ part, points }) => {
    const fill = part.material === 'wood' ? '#d6b88a' : part.kind === 'wall' ? '#bfc8c5' : part.material === 'mesh' ? '#cbdcd5' : part.material === 'roof' ? '#b5c8d3' : '#a8afb3';
    const polygon = points.map(p => screen(p).map(n => n.toFixed(3)).join(',')).join(' ');
    const c = screen(points.reduce((out, p) => out.map((v, i) => v + p[i] / points.length), [0, 0]));
    return `<g data-part-id="${esc(part.id)}"><title>${esc(part.id)} · ${esc(part.label)}</title><${points.length < 3 ? 'polyline' : 'polygon'} points="${polygon}" fill="${fill}" fill-opacity="${['mesh', 'roof'].includes(part.material) ? .32 : .82}" stroke="#61736c" stroke-width="1"/>${options.labels === false ? '' : `<text x="${c[0]}" y="${c[1] - 3}" font-size="9" text-anchor="middle" fill="#243e34" stroke="#fff" stroke-width="2.6" paint-order="stroke">${esc(part.id)}</text>`}</g>`;
  }).join('');
  const hardware = fixings.map(f => {
    const pos = screen(projection.project(f.position)), color = f.mode === 'manual' ? '#9654b4' : '#235d8f';
    const outline=options.fixingOutlines?.get(f.id),path=outline?outline.map((p,i)=>`${i%2?'L':'M'}${screen(p).map(v=>v.toFixed(2)).join(',')}`).join(''):'';
    return `<g data-fixing-id="${esc(f.id)}"><title>${esc(f.label)} · ${esc(pointText(f.position,precision))} mm · ${f.mode === 'manual' ? 'manuel' : 'automatique'}</title>${path?`<path data-fixing-outline="${esc(f.id)}" d="${path}" fill="none" stroke="${color}" stroke-width="1"/>`:''}<circle cx="${pos[0]}" cy="${pos[1]}" r="${options.jointId ? (path?2:3.5) : 2.1}" fill="${color}" stroke="#fff" stroke-width=".6"/>${options.jointId && options.fixingLabels!==false ? `<text x="${pos[0] + 5}" y="${pos[1] + 12}" fill="${color}" font-size="9">${esc(f.key)}</text>` : ''}</g>`;
  }).join('');
  const joints = (options.joints === false ? [] : model.joints || []).filter(j => finitePoint(j.position) && (options.jointId ? j.id === options.jointId : options.joints)).map(j => {
    const pos = screen(projection.project(j.position));
    return `<g><circle cx="${pos[0]}" cy="${pos[1]}" r="5" fill="#c96c32" stroke="#fff"/><text x="${pos[0] + 8}" y="${pos[1] - 8}" font-size="10" fill="#8c3e15">${esc(j.id)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(options.title || projection.name)}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fffdf8"/><g font-family="Arial, sans-serif"><text x="28" y="32" font-size="20" font-weight="700" fill="#234538">${esc(options.title || projection.name)}</text><text x="${width - 28}" y="30" text-anchor="end" font-size="11" fill="#64736c">Cotes arrondies à ${Number(precision)===.5?'0,5':'1'} mm · ${options.showFoundations ? 'appuis inclus' : 'hors appuis au sol'}</text><defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${margin}" y="${top}" width="${usableW}" height="${usableH}"/></clipPath></defs><g clip-path="url(#${clipId})">${shapes}${hardware}${joints}</g>${dimensions}${!bounds.items.length ? `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#63766d">Aucune pièce dans cette vue</text>` : ''}<text x="28" y="${height - 16}" font-size="10" fill="#63766d">Projection orthographique · l’impression peut modifier l’échelle · se reporter aux cotes.</text>${fixings.length ? `<text x="${width - 28}" y="${height - 16}" font-size="10" text-anchor="end" fill="#63766d">Repères : bleu automatique · violet manuel</text>` : ''}</g></svg>`;
}

export function jointDetailSVG(model, jointId, options = {}) {
  const joint = allJoints(model).find(j => j.id === jointId);
  if (!joint) return projectionSVG({ parts: [], joints: [] }, options.view || 'front', { ...options, title: 'Liaison introuvable' });
  const subset = { ...model, parts: model.parts.filter(p => [joint.aPart, joint.bPart].includes(p.id)), joints: [joint] };
  let view = options.view;
  if (!views[view]) {
    const choices = Object.keys(views).map(v => ({ view: v, box: projectedBounds(subset, v, { showFoundations: true }) }));
    view = choices.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0].view;
  }
  let focusBounds,fixingOutlines;
  if(options.focus){
    const instances=buildJointFixings(joint,model);
    fixingOutlines=new Map(instances.map(f=>[f.id,fixingOutline(f,views[view].project)]));
    const points=[...[...fixingOutlines.values()].flat(),...[joint.position].filter(finitePoint).map(views[view].project)];
    if(points.length){const min=[0,1].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1].map(i=>Math.max(...points.map(p=>p[i]))),pad=Math.max(70,...max.map((v,i)=>(v-min[i])*.3));focusBounds={min:min.map(v=>v-pad),max:max.map(v=>v+pad)}}
  }
  return projectionSVG(subset, view, { ...options,...(focusBounds?{focusBounds,fixingOutlines,dimensions:false,fixingLabels:false}:{}), showFoundations: true, joints: true, jointId, title: `Liaison ${jointId} · ${joint.reference || joint.recipe}${focusBounds?' · détail rapproché':''}` });
}

export function assemblySteps(model) {
  const parts = model.parts || [], joints = model.joints || [], wood = parts.filter(p => p.material === 'wood'), panels = parts.filter(p => p.kind === 'panel'), posts = parts.filter(p => p.kind === 'post'), walls = parts.filter(p => p.kind === 'wall');
  const ids = list => list.map(p => p.id), jointIds = list => joints.filter(j => list.some(p => [j.aPart, j.bPart].includes(p.id))).map(j => j.id);
  const result = [
    { title: 'Repérer les pièces et les références', description: `Reporter les repères des ${parts.length} éléments sur les plans. Compléter les références d’achat et les quantités des liaisons avant de préparer le matériel.`, partIds: ids(parts), jointIds: [] },
    { title: 'Préparer le débit et les ajustements', description: `${wood.length} pièces de bois sont décrites ci-dessous. Les longueurs de barres correspondent à leurs axes ; prévoir séparément les coupes en biais, entailles et jeux de montage. Le plan de débit ajoute le trait de scie renseigné.`, partIds: ids(wood), jointIds: [] }
  ];
  if (posts.length) result.push({ title: 'Reporter les appuis au sol', description: `Reporter les axes des ${posts.length} poteaux et vérifier les niveaux avec les cotes du projet. Les plots et pieds affichés reprennent les dimensions et recettes saisies ; compléter leurs détails de pose avec le produit choisi.`, partIds: ids(posts), jointIds: [] });
  if (walls.length) result.push({ title: 'Préparer les interfaces avec les murs', description: 'Identifier le support réel, reporter les implantations retenues et vérifier que les accès de pose restent possibles. Dimensions de perçage et instructions de pose proviennent de la notice du système choisi.', partIds: ids(walls), jointIds: jointIds(walls) });
  const gates = wood.filter(p => p.group === 'gate');
  if (gates.length) result.push({ title: 'Préparer les vantaux et panneaux mobiles', description: 'Repérer chaque vantail, ses traverses et son parement. Contrôler les cotes et les diagonales à plat, puis compléter les ferrures et les jeux de fonctionnement dans la liste d’achats.', partIds: ids(gates), jointIds: jointIds(gates) });
  const structure = wood.filter(p => p.group !== 'gate' && p.group !== 'roof');
  if (structure.length) result.push({ title: 'Organiser le montage de l’ossature', description: 'Regrouper les pièces par sous-ensemble. Préparer une séquence permettant de contrôler équerrage, niveaux et accès aux fixations ; définir les moyens de maintien nécessaires au montage.', partIds: ids(structure), jointIds: jointIds(structure) });
  const roofing = parts.filter(p => p.group === 'roof' && p.kind !== 'panel');
  if (roofing.length) result.push({ title: 'Repérer les pièces supérieures', description: 'Reporter les entraxes et vérifier le contact des pièces sur chaque appui, y compris les appuis intermédiaires. Préparer les moyens d’accès et l’ordre de pose adaptés au chantier.', partIds: ids(roofing), jointIds: jointIds(roofing) });
  if (panels.length) result.push({ title: 'Préparer les parements et le grillage', description: `Contrôler les dimensions des ${panels.length} panneaux et lés, leur orientation et leurs recouvrements avant découpe. Compléter les attaches et accessoires propres au produit retenu.`, partIds: ids(panels), jointIds: jointIds(panels) });
  result.push({ title: 'Contrôler et archiver le dossier', description: 'Comparer l’ouvrage au plan coté, pointer les pièces et fixations installées, puis enregistrer le projet avec les références réellement utilisées et les modifications de chantier.', partIds: [], jointIds: [] });
  return result;
}

const table = (headings, rows) => `<table><thead><tr>${headings.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headings.length}">Aucun élément.</td></tr>`}</tbody></table>`;
const methodNames={angle:'Équerre',screw:'Vissage direct',bolt:'Boulonnage',hanger:'Sabot de charpente',plate:'Plaque / gousset',wood:'Assemblage bois usiné',wall_mechanical:'Ancrage mécanique mural',wall_chemical:'Scellement chimique en mur plein',wall_screen:'Scellement avec tamis',wall_wood:'Fixation dans une ossature bois',wall_distance:'Fixation à distance',foundation_mechanical:'Ancrage mécanique de platine',foundation_chemical:'Scellement de platine'};
export function jointSheetData(model,jointId,options={}){
  const joint=allJoints(model,options.project||model.project||{}).find(j=>j.id===jointId);
  if(!joint)return {id:jointId,status:'incomplete',statusLabel:'À compléter',missing:['Liaison introuvable.'],parts:[],fixings:[],components:[]};
  const parts=[joint.aPart,joint.bPart].map(id=>(model.parts||[]).find(p=>p.id===id)||{id,label:'Pièce absente'}),fixings=buildJointFixings(joint,model),counts=getFixingCounts(joint);
  const components=[['anchor','anchors','Ancrage'],['screw','screws','Vis'],['bolt','bolts','Boulon'],['connector','connectors','Connecteur']].filter(([,field])=>counts[field]>0).map(([type,field,label])=>({type,quantity:counts[field],label}));
  const missing=[];
  if(joint.valid===false||parts.some(p=>!p.a))missing.push('Les deux pièces doivent être identifiées.');
  if(!joint.reference)missing.push('Référence du système de fixation à renseigner.');
  if(!components.length)missing.push('Quantités ou géométrie des composants à compléter.');
  if(components.some(c=>fixings.filter(f=>f.type===c.type).length!==c.quantity))missing.unshift('Implantation indisponible : géométrie à compléter. Les quantités de la recette sont conservées.');
  if(joint.separation>10)missing.push(`Pièces séparées : ${formatDimension(joint.separation,options.precision)} mm au minimum.`);
  if(parts.some(p=>p.kind==='wall'&&(!p.wallSupport||p.wallSupport==='unknown')))missing.push('Support du mur à identifier.');
  return {id:joint.id,joint,parts,method:methodNames[joint.recipe]||joint.recipe||'Méthode à définir',reference:joint.reference||'',components,fixings,status:missing.length?'incomplete':'to-confirm',statusLabel:missing.length?'À compléter':'À confirmer',missing,position:joint.position,mode:joint.fixingLayout?.mode==='manual'?'Manuel':'Automatique'};
}

export function jointSheetHTML(model,jointId,options={}){
  const precision=options.precision??model.project?.manufacturing?.precision??1,data=jointSheetData(model,jointId,{...options,precision});
  return `<article class="fab-joint-sheet"><header><p class="fab-eyebrow">FICHE DE LIAISON · ${esc(data.id)}</p><h3>${data.parts.map(p=>esc(p.label)).join(' ↔ ')||'Liaison introuvable'}</h3><span class="fab-status">${esc(data.statusLabel)}</span></header><div class="fab-joint-summary"><div><strong>Pièces</strong>${data.parts.map(p=>`<p><b>${esc(p.id)}</b> · ${esc(p.label)}</p>`).join('')}</div><div><strong>Méthode</strong><p>${esc(data.method||'À définir')}</p><strong>Référence</strong><p>${esc(data.reference||'Non renseignée')}</p></div><div><strong>Composants</strong>${data.components.map(c=>`<p>${c.quantity} × ${esc(c.label)}</p>`).join('')||'<p>À compléter</p>'}<p>Implantation : ${esc(data.mode||'À définir')}</p></div></div>${data.missing.length?`<ul class="fab-note">${data.missing.map(message=>`<li>${esc(message)}</li>`).join('')}</ul>`:''}<figure>${jointDetailSVG(model,jointId,{...options,precision,focus:true,width:1000,height:450})}<figcaption>Vue schématique des deux pièces et des composants. Les symboles ne représentent pas les perçages d’un produit fabricant.</figcaption></figure><h4>Implantation des fixations · X ; Y ; Z en mm</h4>${table(['Repère','Composant','X','Y','Z','Mode'],data.fixings.map(f=>[esc(f.key),esc(f.label.split(' · ')[0]),...f.position.map(v=>esc(formatDimension(v,precision))),f.mode==='manual'?'Manuel':'Automatique']))}${data.joint?.notes?`<p><b>Note de montage :</b> ${esc(data.joint.notes)}</p>`:''}</article>`;
}

export function jointSheetSVG(model,jointId,options={}){
  const precision=options.precision??model.project?.manufacturing?.precision??1,data=jointSheetData(model,jointId,{...options,precision}),height=760+data.fixings.length*24;
  const text=(x,y,value,size=14)=>`<text x="${x}" y="${y}" font-size="${size}" fill="#294b3c">${esc(value)}</text>`;
  const drawing=jointDetailSVG(model,jointId,{...options,precision,focus:true,width:1020,height:410}).replace('<svg ','<svg x="40" y="165" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fiche de liaison ${esc(jointId)}" viewBox="0 0 1100 ${height}" width="1100" height="${height}"><rect width="100%" height="100%" fill="#fffdf8"/><g font-family="Arial,sans-serif">${text(36,38,`Fiche de liaison · ${data.id} · ${data.statusLabel}`,24)}${data.parts.map((p,i)=>text(36,72+i*24,`${p.id} · ${p.label}`)).join('')}${text(36,124,`${data.method||'Méthode à définir'} · ${data.reference||'Référence non renseignée'}`)}${text(36,149,data.components.map(c=>`${c.quantity} × ${c.label}`).join(' · ')||'Composants à compléter')}${drawing}${text(36,605,'Implantation des fixations · coordonnées monde en mm',17)}${text(36,635,'Repère / composant')}${text(520,635,'X')}${text(665,635,'Y')}${text(810,635,'Z')}${text(945,635,'Mode')}${data.fixings.map((f,i)=>{const y=663+i*24;return text(36,y,`${f.key} · ${f.label.split(' · ')[0]}`,12)+f.position.map((v,j)=>text(520+j*145,y,formatDimension(v,precision),12)).join('')+text(945,y,f.mode==='manual'?'Manuel':'Auto',12)}).join('')}${text(36,height-52,data.missing[0]||'Référence, compatibilité et pose à confirmer pour les produits réellement retenus.',12)}${text(36,height-28,`Repères schématiques, sans plan de perçage fabricant · affichage à ${Number(precision)===.5?'0,5':'1'} mm · calculs non arrondis`,12)}</g></svg>`;
}

export function fabricationBody({ project = {}, model = { parts: [], joints: [] }, bom = [], cuts = {}, title, includeJointDetails = false, includeCutDetails = true, precision:requestedPrecision } = {}) {
  const settings=normalizeManufacturing(project.manufacturing),precision=requestedPrecision??settings.precision,dim=v=>formatDimension(v,precision),coords=p=>pointText(p,precision);
  const parts=model.parts||[],joints=allJoints(model,project),fixings=fixationSchedule(model,project),wood=parts.filter(p=>p.material==='wood'&&p.kind!=='panel'),panels=parts.filter(p=>p.kind==='panel');
  const buying=Array.isArray(bom)?bom:bom.rows||[],cutPlan=cuts?.bars?cuts:cuts?.wood||cuts?.linear||{};
  const analyzed=wood.map(part=>({part,cut:analyzeTimberCut(part,settings.cuts[part.id])}));
  const cutDetails=analyzed.filter(({part,cut})=>includeCutDetails&&(settings.cuts[part.id]||Math.abs(cut.inclinationDeg)>1e-6&&Math.abs(Math.abs(cut.inclinationDeg)-90)>1e-6));
  const stepRows=assemblySteps(model).map((step,index)=>`<li><h3>${index+1}. ${esc(step.title)}</h3><p>${esc(step.description)}</p>${step.partIds.length?`<p class="fab-ref">Pièces : ${step.partIds.map(esc).join(', ')}</p>`:''}${step.jointIds.length?`<p class="fab-ref">Liaisons : ${step.jointIds.map(esc).join(', ')}</p>`:''}</li>`).join('');
  const quantity=row=>row.purchaseQty??row.toBuy??row.required??row.qty??0,budgetComplete=buying.every(row=>row.priced||row.total>0||row.packs===0);
  const fixingTable=fixings.length?`<h3>Implantation des fixations</h3><p>Repères schématiques des composants, en coordonnées monde. Les positions ne constituent pas un plan de perçage fabricant.</p>${table(['Repère','Liaison','Composant','Mode','X ; Y ; Z (mm)'],fixings.map(f=>[f.id,f.jointId,f.label,f.mode==='manual'?'Manuel':'Automatique',coords(f.position)].map(esc)))}`:'';
  return `<article class="fabrication-document"><header><p class="fab-eyebrow">ATELIER · DOSSIER DE FABRICATION</p><h1>${esc(title||project.name||'Mon projet')}</h1><div class="fab-key-metrics"><p><b>${parts.length}</b> éléments</p><p><b>${wood.length}</b> pièces de bois</p><p><b>${joints.length}</b> liaisons</p></div><p>Cotes affichées à ${Number(precision)===.5?'0,5':'1'} mm. Calculs et coordonnées du projet conservés sans cet arrondi.</p><p class="fab-note">Dossier géométrique et quantitatif. Les recettes de fixation et dimensions saisies restent à compléter avec les produits retenus ; ce dossier ne contient pas de calcul d’efforts.</p><ol class="fab-contents"><li>Plans et repères</li><li>Bois et fiches de coupe</li><li>Liaisons et implantation</li><li>Achats et préparation du montage</li></ol></header>
<section class="fab-section"><p class="fab-eyebrow">01 · VUES D’ENSEMBLE</p><h2>Plans cotés</h2>${['top','front','side'].map(view=>`<figure>${projectionSVG(model,view,{precision})}<figcaption>${views[view].name} · dimensions hors appuis au sol · se reporter aux repères</figcaption></figure>`).join('')}</section>
<section class="fab-section"><p class="fab-eyebrow">02 · BOIS</p><h2>Repérage et débit des bois</h2><p>La longueur d’axe décrit la pièce du modèle. Le brut de débit est calculé seulement après définition de deux plans de coupe réalisables et ajoute la surlongueur saisie.</p>${table(['Repère / pièce','Section (mm)','Axe (mm)','Brut de débit (mm)','Coupes A / B'],analyzed.map(({part,cut})=>[`${esc(part.id)}<br>${esc(part.label)}<br><small>${esc(part.species)}</small>`,`${dim(part.width)} × ${dim(part.height)}`,dim(cut.axisLength),cut.status==='defined'?dim(cut.blankLength):'<span class="fab-status">À confirmer</span>',`${esc(cut.cuts.a?.label||'—')}<br>${esc(cut.cuts.b?.label||'—')}`]))}<h3>Encombrement et orientation</h3><p>Enveloppe du prisme du modèle mesurée suivant les axes du projet. Ces trois projections ne remplacent pas la longueur brute de la barre.</p>${table(['Repère','Enveloppe X × Y × Z (mm)','Inclinaison A → B','Azimut X → Z','Rotation de section'],analyzed.map(({part,cut})=>[esc(part.id),cut.modelBox?cut.modelBox.size.map(dim).join(' × '):'—',`${fmt(cut.inclinationDeg,1)}°`,cut.azimuthDeg===null?'Vertical':`${fmt(cut.azimuthDeg,1)}°`,`${fmt(cut.rollDeg,1)}°`]))}<h3>Position des extrémités</h3>${table(['Repère','A : X ; Y ; Z (mm)','B : X ; Y ; Z (mm)'],wood.map(p=>[p.id,coords(p.a),coords(p.b)].map(esc)))}${cutDetails.length?`<h3>Fiches de coupe</h3><p>Chaque plan passe par l’extrémité A ou B de l’axe. Les angles indiqués sont géométriques et ne désignent pas un réglage de scie.</p>${cutDetails.map(({part})=>`<figure class="fab-cut-sheet">${timberCutSheetSVG(part,settings.cuts[part.id],{precision})}</figure>`).join('')}`:''}</section>
${panels.length?`<section class="fab-section"><h2>Panneaux et lés</h2>${table(['Repère / désignation','Enveloppe (mm)','Surface nette (m²)','Coins : X ; Y ; Z'],panels.map(p=>[`${esc(p.id)}<br>${esc(p.label)}`,`${dim(p.surfaceWidth)} × ${dim(p.surfaceHeight)}`,fmt(p.area,3),panelCorners(p).map(c=>esc(coords(c))).join('<br>')]))}</section>`:''}
<section class="fab-section"><h2>Plan de débit des barres</h2>${table(['Barre / section','Disponible (mm)','Pièces à découper (mm)','Reste (mm)'],(cutPlan.bars||[]).map(bar=>[`${esc(bar.id)}<br><small>${esc(bar.section)}</small>`,dim(bar.stockLength??bar.length),(bar.cuts||[]).map(c=>`${esc(c.id)} : ${dim(c.length)}`).join('<br>'),dim(bar.waste??bar.remaining)]))}${cutPlan.unplaced?.length?`<p class="fab-note">Pièces non placées dans le stock : ${cutPlan.unplaced.map(p=>esc(p.id)).join(', ')}.</p>`:''}<p>Trait de scie : ${fmt(cutPlan.kerf??project.kerf)} mm. Brut de coupe utilisé pour les pièces dont les deux plans sont définis ; longueur du modèle à confirmer pour les autres.</p></section>
<section class="fab-section"><p class="fab-eyebrow">03 · ASSEMBLAGES</p><h2>Liaisons et implantation</h2>${table(['Repère','Deux pièces','Méthode / référence','Quantités','État de la fiche'],joints.map(j=>{const data=jointSheetData(model,j.id,{precision,project});return [esc(j.id),data.parts.map(p=>`<b>${esc(p.id)}</b> · ${esc(p.label)}`).join('<br>'),`${esc(data.method)}<br><small>${esc(data.reference||'Référence à renseigner')}</small>`,data.components.map(c=>`${c.quantity} × ${esc(c.label)}`).join('<br>')||'À compléter',esc(data.statusLabel)]}))}${includeJointDetails?joints.map(j=>jointSheetHTML(model,j.id,{precision,project})).join(''):fixingTable}</section>
<section class="fab-section"><p class="fab-eyebrow">04 · APPROVISIONNEMENT</p><h2>Checklist des achats</h2><p>Budget saisi ${budgetComplete?'complet':'partiel'} : ${fmt(buying.reduce((sum,row)=>sum+(Number(row.total)||0),0))} €. Les lignes sans prix restent à chiffrer.</p>${table(['Fait','Désignation / référence','Besoin net','Stock','À acheter','Lots','Budget saisi'],buying.map(row=>[project.purchased?.[row.id]?'☑':'☐',`${esc(row.label)}${row.spec||row.reference?`<br><small>${esc(row.spec||row.reference)}</small>`:''}`,`${fmt(row.required??row.qty)} ${esc(row.unit)}`,fmt(row.stock||0),`${fmt(quantity(row))} ${esc(row.unit)}`,fmt(row.packs??quantity(row)/(row.packSize||1)),row.priced||row.total>0?`${fmt(row.total||0)} €`:'À chiffrer']))}</section>
<section class="fab-section"><h2>Préparation du montage</h2><ol class="fab-steps">${stepRows}</ol></section>${model.warnings?.length?`<section class="fab-section"><h2>Points du projet à compléter</h2><ul>${model.warnings.map(w=>`<li>${esc(w.message||w)}</li>`).join('')}</ul></section>`:''}</article>`;
}

export const FABRICATION_STYLES = `.fabrication-document{font:14px/1.5 Arial,sans-serif;color:#243d33;background:#fff;max-width:1180px;margin:auto;padding:32px}.fab-key-metrics{display:flex;gap:24px;flex-wrap:wrap}.fab-key-metrics b{font-size:24px;display:block}.fab-contents{columns:2;line-height:1.8;padding-left:24px}.fab-section{margin-top:40px;padding-top:12px}.fab-joint-sheet{border:1px solid #c9d6ce;border-radius:8px;padding:20px;margin:28px 0}.fab-joint-sheet header{position:relative;padding-right:130px}.fab-joint-summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;background:#f5f7f2;padding:16px;margin:16px 0}.fab-joint-summary p{margin:5px 0}.fab-status{display:inline-block;background:#f4ebd5;padding:3px 8px;border-radius:3px;color:#6e5629;font-size:11px}.fab-joint-sheet header>.fab-status{position:absolute;right:0;top:0}.fab-cut-sheet{border:1px solid #dbe2db;border-radius:6px}.fabrication-document h1{font-size:32px;margin:8px 0}.fabrication-document h2{font-size:22px;margin:32px 0 12px;padding-bottom:8px;border-bottom:1px solid #ccd7ce}.fabrication-document h3{font-size:16px}.fab-eyebrow{letter-spacing:2px;font-size:11px;color:#537762}.fab-note{background:#f5f4e9;border-left:3px solid #b69c5c;padding:12px}.fabrication-document figure{margin:16px 0;break-inside:avoid}.fabrication-document svg{width:100%;height:auto}.fabrication-document figcaption,.fab-ref{font-size:11px;color:#566b60}.fabrication-document table{width:100%;border-collapse:collapse;font-size:11px}.fabrication-document th,.fabrication-document td{border:1px solid #dbe2db;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.fabrication-document th{background:#edf2eb}.fabrication-document tr{break-inside:avoid}.fab-steps{list-style:none;padding:0}.fab-steps>li{break-inside:avoid;margin:20px 0}.fabrication-document small{color:#52685b}@media print{@page{size:A4 landscape;margin:12mm}.fabrication-document{padding:0;font-size:11px;max-width:none}.fabrication-document header{break-after:page}.fabrication-document h2{break-after:avoid}.fab-section{break-before:page}.fab-joint-sheet{break-before:page;border:0;padding:0}.fab-joint-sheet header{break-after:avoid}.fab-key-metrics b{font-size:20px}.fab-joint-sheet figure{margin:6px 0}.fab-joint-sheet figure svg{max-height:105mm}.fabrication-document figure{max-height:170mm}.fabrication-document figure svg{max-height:155mm}.fabrication-document thead{display:table-header-group}.fabrication-document th,.fabrication-document td{padding:4px}.fabrication-document section{margin-bottom:20px}.no-print{display:none!important}}`;
export function fabricationHTML(options = {}) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(options.title || options.project?.name || 'Dossier de fabrication')}</title><style>${FABRICATION_STYLES}</style></head><body>${fabricationBody(options)}</body></html>`;
}
