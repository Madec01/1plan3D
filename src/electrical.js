// Electrical drawing and take-off only. No circuit sizing or compliance engine.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = (value, max = 160) => String(value ?? '').slice(0, max);
const num = (value, fallback = 0, min = -100000, max = 100000) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
const fmt = (value, digits = 2) => Number(value || 0).toLocaleString('fr-FR', {maximumFractionDigits: digits});
const round = value => Math.round(value * 1000) / 1000;
const colourList = ['#7c5543','#416c96','#6e7751','#a05d73','#537d76','#8063a2'];
export const ELECTRICAL_SYMBOLS = Object.freeze([
  {id:'board', label:'Tableau', short:'T'}, {id:'socket', label:'Prise de courant', short:'PC'},
  {id:'switch', label:'Interrupteur', short:'I'}, {id:'lamp', label:'Point lumineux', short:'L'},
  {id:'junction', label:'Boîte de dérivation', short:'B'}, {id:'rj45', label:'Prise RJ45', short:'RJ'}
]);
export const ELECTRICAL_REFERENCE = {label:'Guide NF C 15-100 · Legrand', url:'https://www.legrand.fr/pro/normes-et-reglementations/norme-nf-c-15-100', checkedAt:'2026-10-19'};
const kinds = ELECTRICAL_SYMBOLS.map(s => s.id);
const list = value => Array.isArray(value) ? value : [];
const point = p => ({x:round(num(p?.x ?? p?.[0])), z:round(num(p?.z ?? p?.[1]))});
const conductorNames = value => [...new Set(text(value, 120).split(/[,;\s]+/).map(v => v.trim()).filter(Boolean))].slice(0, 12);

/** Millimetres on a separate room plan. No regulatory defaults are inferred. */
export function normalizeElectrical(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const used = new Set();
  const id = (value, fallback) => { let out = text(value || fallback, 64), suffix = 1; while (used.has(out)) out = `${fallback}-${suffix++}`; used.add(out); return out; };
  const circuits = list(raw.circuits).slice(0, 100).map((c, i) => ({
    id:id(c?.id, `EC-${i + 1}`), label:text(c?.label || `Circuit ${i + 1}`, 80),
    kind:c?.kind === 'data' ? 'data' : 'power', section:text(c?.section, 40),
    protection:text(c?.protection, 100), differential:text(c?.differential, 100),
    cableRef:text(c?.cableRef, 120), conduitRef:text(c?.conduitRef, 120),
    mode:c?.mode === 'wires' ? 'wires' : 'cable', conductors:conductorNames(c?.conductors).join(','),
    colour:/^#[0-9a-f]{6}$/i.test(c?.colour || '') ? c.colour : colourList[i % colourList.length]
  }));
  const circuitIds = new Set(circuits.map(c => c.id));
  const symbols = list(raw.symbols).slice(0, 1000).map((s, i) => ({
    id:id(s?.id, `ES-${i + 1}`), kind:kinds.includes(s?.kind) ? s.kind : 'socket',
    label:text(s?.label || `${ELECTRICAL_SYMBOLS.find(k => k.id === s?.kind)?.label || 'Prise'} ${i + 1}`, 80),
    ...point(s), height:round(num(s?.height, 0, 0, 100000)), rotation:round(num(s?.rotation, 0, -360, 360)),
    circuitId:circuitIds.has(s?.circuitId) ? s.circuitId : '', reference:text(s?.reference, 120)
  }));
  const symbolIds = new Set(symbols.map(s => s.id));
  const routes = list(raw.routes).slice(0, 2000).map((r, i) => ({
    id:id(r?.id, `ER-${i + 1}`), label:text(r?.label || `Trajet ${i + 1}`, 80),
    circuitId:circuitIds.has(r?.circuitId) ? r.circuitId : '',
    from:symbolIds.has(r?.from) ? r.from : '', to:symbolIds.has(r?.to) ? r.to : '',
    points:list(r?.points).slice(0, 200).map(point),
    vertical:round(num(r?.vertical, 0, 0, 100000)), reserve:round(num(r?.reserve, 0, 0, 100000)),
    margin:num(r?.margin, 0, 0, 100)
  })).filter(r => r.points.length >= 2);
  const selected = text(raw.selected, 64);
  return {
    width:round(num(raw.width, 6000, 100, 100000)), depth:round(num(raw.depth, 4000, 100, 100000)),
    grid:round(num(raw.grid, 50, .1, 1000)), title:text(raw.title || 'Plan électrique', 80),
    circuits, symbols, routes, selected:symbolIds.has(selected) || routes.some(r => r.id === selected) ? selected : '',
    selectedCircuit:circuitIds.has(raw.selectedCircuit) ? raw.selectedCircuit : '',
    tool:[...kinds, 'select', 'route'].includes(raw.tool) ? raw.tool : 'select',
    draft:list(raw.draft).slice(0, 200).map(p => ({...point(p), symbolId:symbolIds.has(p?.symbolId) ? p.symbolId : ''})),
    nextId:Math.floor(num(raw.nextId, 1, 1, 1e9))
  };
}

const stateOf = value => normalizeElectrical(value?.electrical ?? value);
function allocate(s, prefix) { const ids = new Set([...s.circuits, ...s.symbols, ...s.routes].map(x => x.id)); let id; do { id = `${prefix}-${s.nextId++}`; } while (ids.has(id)); return id; }
function find(s, collection, id) { const item = s[collection].find(x => x.id === id); if (!item) throw new Error('Élément électrique introuvable.'); return item; }
export function parseElectricalPoints(value) {
  if (Array.isArray(value)) return value.map(point);
  const lines = String(value ?? '').trim().split(/[;\n]+/).filter(v => v.trim());
  if (lines.length < 2) throw new Error('Indiquez au moins deux points X,Z séparés par un point-virgule.');
  return lines.map(line => { const values = line.trim().split(/[,\s]+/).filter(Boolean); if (values.length !== 2 || values.some(v => !Number.isFinite(Number(v)))) throw new Error('Chaque point doit contenir deux nombres : X,Z (en mm).'); return point(values); });
}

/** Pure reducer. Every operation returns a fresh, normalised electrical document. */
export function electricalAction(raw, action) {
  const s = stateOf(raw), a = action || {}, values = a.values || {};
  switch (a.type) {
    case 'settings': Object.assign(s, values); break;
    case 'tool': s.tool = [...kinds, 'select', 'route'].includes(a.tool) ? a.tool : 'select'; s.draft = []; break;
    case 'select': s.selected = a.id || ''; break;
    case 'selectCircuit': s.selectedCircuit = a.id || ''; break;
    case 'circuit': {
      if (a.id) Object.assign(find(s, 'circuits', a.id), values, {id:a.id});
      else { if (s.circuits.length >= 100) throw new Error('Limite de 100 circuits atteinte.'); const id = allocate(s, 'EC'); s.circuits.push({...values, id}); s.selectedCircuit = id; }
      break;
    }
    case 'deleteCircuit': s.circuits = s.circuits.filter(c => c.id !== a.id); s.routes = s.routes.filter(r => r.circuitId !== a.id); s.symbols.forEach(p => {if (p.circuitId === a.id) p.circuitId = '';}); s.selectedCircuit = ''; break;
    case 'symbol': {
      if (a.id) Object.assign(find(s, 'symbols', a.id), values, {id:a.id});
      else { if (s.symbols.length >= 1000) throw new Error('Limite de 1 000 symboles atteinte.'); const id = allocate(s, 'ES'); s.symbols.push({kind:'socket', circuitId:s.selectedCircuit, ...values, id}); s.selected = id; }
      break;
    }
    case 'deleteSymbol': s.symbols = s.symbols.filter(p => p.id !== a.id); s.routes = s.routes.filter(r => r.from !== a.id && r.to !== a.id); s.draft = s.draft.filter(p => p.symbolId !== a.id); s.selected = ''; break;
    case 'route': {
      const v = {...values, points:parseElectricalPoints(values.points)};
      if (!s.circuits.some(c => c.id === v.circuitId)) throw new Error('Choisissez le circuit de ce trajet.');
      if (a.id) Object.assign(find(s, 'routes', a.id), v, {id:a.id});
      else { if (s.routes.length >= 2000) throw new Error('Limite de 2 000 trajets atteinte.'); const id = allocate(s, 'ER'); s.routes.push({...v, id}); s.selected = id; }
      break;
    }
    case 'deleteRoute': s.routes = s.routes.filter(r => r.id !== a.id); s.selected = ''; break;
    case 'point': {
      const attached = a.symbolId && s.symbols.find(p => p.id === a.symbolId);
      const p = attached ? {x:attached.x, z:attached.z} : {x:round(Math.round(num(a.x) / s.grid) * s.grid), z:round(Math.round(num(a.z) / s.grid) * s.grid)};
      if (s.tool === 'route') {
        if (!s.selectedCircuit) throw new Error('Créez ou sélectionnez un circuit avant de tracer.');
        if (s.draft.length >= 200) throw new Error('Limite de 200 points par trajet atteinte.');
        if (!s.draft.length || Math.hypot(p.x - s.draft.at(-1).x, p.z - s.draft.at(-1).z) > .001) s.draft.push({...p, symbolId:attached?.id || ''});
      } else if (kinds.includes(s.tool)) {
        return electricalAction(s, {type:'symbol', values:{kind:s.tool, ...p, circuitId:s.selectedCircuit}});
      } else s.selected = attached?.id || '';
      break;
    }
    case 'undoPoint': s.draft.pop(); break;
    case 'finishRoute': {
      if (s.draft.length < 2) throw new Error('Posez au moins deux points sur le plan.');
      const result = electricalAction(s, {type:'route', values:{circuitId:s.selectedCircuit, points:s.draft, from:s.draft[0].symbolId, to:s.draft.at(-1).symbolId}});
      result.draft = []; result.tool = 'select'; return result;
    }
    case 'cancelRoute': s.draft = []; s.tool = 'select'; break;
    default: return s;
  }
  return normalizeElectrical(s);
}

/** Endpoint attachments follow moved symbols; intermediate bends remain explicit. */
export function electricalRoutePoints(raw, route) {
  const s = stateOf(raw), r = typeof route === 'string' ? s.routes.find(x => x.id === route) : route;
  return routePoints(s, r);
}
function routePoints(s, r) {
  if (!r) return [];
  const pts = r.points.map(point), from = s.symbols.find(p => p.id === r.from), to = s.symbols.find(p => p.id === r.to);
  if (pts.length) { if (from) pts[0] = point(from); if (to) pts[pts.length - 1] = point(to); }
  return pts;
}
export function electricalRouteLength(raw, route) {
  const s = stateOf(raw), r = typeof route === 'string' ? s.routes.find(x => x.id === route) : route;
  return routeLength(s, r);
}
function routeLength(s, r) {
  if (!r) return {horizontal:0, vertical:0, reserve:0, measured:0, purchase:0};
  const pts = routePoints(s, r);
  const horizontal = pts.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - pts[i].x, p.z - pts[i].z), 0) / 1000;
  const vertical = r.vertical / 1000, reserve = r.reserve / 1000, measured = horizontal + vertical;
  return {horizontal, vertical, reserve, measured, purchase:(measured + reserve) * (1 + r.margin / 100)};
}

/** Quantities are take-offs of drawn routes and entered references, never cable sizing. */
function rowKey(parts) {
  // Keep references in labels, never in persistence keys. JSON tuples avoid
  // ambiguities such as ["a-b", "c"] versus ["a", "b-c"]. Two independent
  // 32-bit hashes keep the key short, deterministic and safe for engine stock.
  const value = JSON.stringify(parts); let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) { const c = value.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (Math.imul(b, 33) ^ c) >>> 0; }
  return `EL-${parts[0]}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
export function electricalRows(raw) {
  const s = stateOf(raw), map = new Map();
  const add = (parts, label, unit, qty, ids, details = '') => { const tuple = JSON.stringify(parts), key = rowKey(parts), old = map.get(tuple); if (old) {old.quantity += qty; old.qty += qty; old.itemIds.push(...ids);} else map.set(tuple, {id:key, key, category:'Électricité', label, unit, quantity:qty, qty, itemIds:[...ids], partIds:[], jointIds:[], details}); };
  for (const symbol of s.symbols) { const label = ELECTRICAL_SYMBOLS.find(k => k.id === symbol.kind).label; add(['symbol',symbol.kind,symbol.reference], `${label}${symbol.reference ? ` · ${symbol.reference}` : ' · référence à définir'}`, 'u', 1, [symbol.id]); }
  for (const c of s.circuits) {
    if (c.protection.trim()) add(['protection',c.protection], `Protection · ${c.protection}`, 'u', 1, [c.id], 'Référence saisie pour ce circuit.');
    for (const r of s.routes.filter(x => x.circuitId === c.id)) {
      const length = routeLength(s, r).purchase;
      if (c.mode === 'wires') {
        for (const conductor of conductorNames(c.conductors)) add(['wire',c.cableRef,c.section,conductor], `Conducteur ${conductor} · ${c.cableRef || 'référence à définir'}${c.section ? ` · ${c.section} mm²` : ''}`, 'm', length, [r.id]);
      } else add(['cable',c.cableRef,c.section], `Câble · ${c.cableRef || 'référence à définir'}${c.section ? ` · ${c.section} mm²` : ''}`, 'm', length, [r.id]);
      if (c.conduitRef.trim()) add(['conduit',c.conduitRef], `Gaine · ${c.conduitRef}`, 'm', length, [r.id]);
    }
  }
  return [...map.values()].map(row => ({...row, quantity:round(row.quantity), qty:round(row.qty), itemIds:[...new Set(row.itemIds)]}));
}
export function electricalCSV(raw) { const cell = v => { let value = String(v ?? ''); if (/^[=+@\-\t\r\n]/.test(value) || /^\s+[=+@-]/.test(value)) value = `'${value}`; return `"${value.replace(/"/g, '""')}"`; }; return '\uFEFF' + [['Article', 'Quantité', 'Unité', 'Repères'], ...electricalRows(raw).map(r => [r.label, r.quantity, r.unit, r.itemIds.join(', ')])].map(row => row.map(cell).join(';')).join('\r\n'); }

function symbolSVG(s, size, colour, selected) {
  const icon = s.kind === 'lamp' ? '<circle r="12"/><path d="m-9-9 18 18m0-18-18 18"/>' : s.kind === 'socket' ? '<circle r="12"/><path d="M-5-5V5M5-5V5M0 6v8"/>' : s.kind === 'switch' ? '<circle r="6"/><path d="m4-4 13-13"/>' : s.kind === 'junction' ? '<rect x="-11" y="-11" width="22" height="22"/><path d="M-6 0H6M0-6V6"/>' : s.kind === 'board' ? '<rect x="-14" y="-16" width="28" height="32"/><path d="M-9-7H9M-9 0H9M-9 7H9"/>' : '<rect x="-14" y="-11" width="28" height="22"/><path d="M-8 0h16M-5-5V5M0-5V5M5-5V5"/>';
  return `<g data-electrical-symbol="${esc(s.id)}" transform="translate(${s.x} ${s.z})" style="cursor:pointer"><title>${esc(s.label)} · ${esc(s.id)}</title><circle r="${size * 21}" fill="${selected ? '#dce8d0' : '#fbfaf5'}" stroke="${selected ? '#477447' : 'none'}" stroke-width="${size * 2}"/><g transform="rotate(${s.rotation}) scale(${size})" fill="none" stroke="${colour}" stroke-width="2">${icon}</g><text x="${size * 23}" y="${size * 4}" font-size="${size * 11}" fill="#314639">${esc(s.label)}</text></g>`;
}
export function electricalPlanSVG(raw, options = {}) {
  const s = stateOf(raw), pad = Math.max(s.width, s.depth) * .07, size = Math.max(s.width, s.depth) / 1000;
  const minor = Math.max(s.grid, Math.ceil(Math.max(s.width, s.depth) / 60 / s.grid) * s.grid);
  const vb = [-pad, -pad, s.width + pad * 2, s.depth + pad * 2];
  const routes = s.routes.map(r => { const c = s.circuits.find(x => x.id === r.circuitId), pts = routePoints(s, r); return `<polyline data-electrical-route="${esc(r.id)}" points="${pts.map(p => `${p.x},${p.z}`).join(' ')}" fill="none" stroke="${c?.colour || '#777777'}" stroke-width="${size * (r.id === s.selected ? 6 : 3)}" stroke-linejoin="round" ${c?.kind === 'data' ? `stroke-dasharray="${size * 8} ${size * 5}"` : ''} style="cursor:pointer"><title>${esc(r.label)} · ${fmt(routeLength(s, r).measured)} m</title></polyline>`; }).join('');
  const draft = s.draft.length ? `<polyline points="${s.draft.map(p => `${p.x},${p.z}`).join(' ')}" fill="none" stroke="#bd7c27" stroke-width="${size * 3}" stroke-dasharray="${size * 8} ${size * 5}"/>${s.draft.map(p => `<circle cx="${p.x}" cy="${p.z}" r="${size * 4}" fill="#bd7c27"/>`).join('')}` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" ${options.interactive === false ? '' : 'data-electrical-plan="true" tabindex="0"'} viewBox="${vb.join(' ')}" style="width:100%;display:block;max-height:540px;background:#fbfaf5;touch-action:manipulation" role="img" aria-label="${esc(s.title)}"><defs><pattern id="electric-grid" width="${minor}" height="${minor}" patternUnits="userSpaceOnUse"><path d="M${minor} 0H0V${minor}" fill="none" stroke="#d8ddcf" stroke-width="${size * .6}"/></pattern></defs><rect x="0" y="0" width="${s.width}" height="${s.depth}" fill="url(#electric-grid)" stroke="#6d7b66" stroke-width="${size * 2}"/><text x="0" y="${-pad * .35}" font-size="${size * 13}" fill="#415d43">${esc(s.title)} · ${fmt(s.width)} × ${fmt(s.depth)} mm</text>${routes}${draft}${s.symbols.map(p => symbolSVG(p, size, s.circuits.find(c => c.id === p.circuitId)?.colour || '#65705d', p.id === s.selected)).join('')}<text x="0" y="${s.depth + pad * .7}" font-size="${size * 10}" fill="#63715c">Implantation · chemins de câbles saisis · hauteurs et réserves ajoutées manuellement</text></svg>`;
}
export function electricalSingleLineSVG(raw) {
  const s = stateOf(raw), height = Math.max(220, s.circuits.length * 128 + 140), width = 1000;
  const rows = s.circuits.map((c, i) => {
    const y = i * 128 + 100, devices = s.symbols.filter(p => p.circuitId === c.id), names = conductorNames(c.conductors);
    return `<g><path d="M80 ${y}H135M335 ${y}H375M665 ${y}H715" fill="none" stroke="${c.colour}" stroke-width="3"/><rect x="135" y="${y - 25}" width="200" height="50" rx="4" fill="#f3f0e7" stroke="#b4bdac"/><text x="145" y="${y - 5}" font-size="12" fill="#334a37">${esc(c.protection || 'Protection à renseigner')}</text><text x="145" y="${y + 13}" font-size="10" fill="#66735e">${esc(c.differential ? `Groupe différentiel : ${c.differential}` : 'Groupe différentiel non renseigné')}</text><rect x="375" y="${y - 25}" width="290" height="50" rx="4" fill="#f4f7ee" stroke="#b4bdac"/><text x="385" y="${y - 5}" font-size="12" fill="#334a37">${esc(c.label)}</text><text x="385" y="${y + 13}" font-size="10" fill="#66735e">${esc([c.section ? `${c.section} mm²` : 'Section à renseigner', names.join(' / ') || 'Conducteurs à renseigner'].join(' · '))}</text><text x="725" y="${y - 5}" font-size="11" fill="#334a37">${devices.length} point(s) affecté(s)</text><text x="725" y="${y + 14}" font-size="10" fill="#66735e">${esc(devices.map(p => p.id).join(', ').slice(0, 48))}</text><text x="135" y="${y + 48}" font-size="10" fill="#66735e">${esc(c.cableRef || 'Référence câble à préciser')}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Schéma unifilaire de principe" style="width:100%;background:#fff"><text x="28" y="30" font-size="18" fill="#334a37">${esc(s.title)} · unifilaire de principe</text><text x="28" y="51" font-size="11" fill="#66735e">L = phase · N = neutre · PE = conducteur de protection · désignations saisies par circuit</text>${s.circuits.length ? `<path d="M80 75V${s.circuits.length * 128 - 28}" stroke="#4d6650" stroke-width="4"/>${rows}` : '<text x="28" y="105" font-size="14" fill="#66735e">Créez un circuit pour dessiner votre répartition.</text>'}<text x="28" y="${height - 28}" font-size="11" fill="#66735e">Affectations et protections déclarées · schéma logique, sans vérification de conformité ni détail de câblage</text></svg>`;
}

const field = (name, label, value, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'step="any"' : ''} ${extra}></label>`;
const select = (name, label, choices, current) => `<label class="field"><span>${label}</span><select name="${name}">${choices.map(([value, caption]) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(caption)}</option>`).join('')}</select></label>`;
const form = (type, id, body, label) => `<form data-electrical-form="${type}" data-id="${esc(id || '')}" style="display:grid;gap:10px">${body}<button class="btn primary" type="submit">${label}</button></form>`;
const button = (type, label, id = '', extra = '') => `<button class="btn small" type="button" data-electrical-action="${type}" data-id="${esc(id)}" ${extra}>${label}</button>`;

export function electricalView(project) {
  const s = stateOf(project), c = s.circuits.find(x => x.id === s.selectedCircuit), symbol = s.symbols.find(x => x.id === s.selected), route = s.routes.find(x => x.id === s.selected);
  const circuitOptions = [['', 'Aucun circuit'], ...s.circuits.map(x => [x.id, x.label])], symbolOptions = [['', 'Point libre'], ...s.symbols.map(x => [x.id, `${x.id} · ${x.label}`])];
  const circuitForm = form('circuit', c?.id, field('label', 'Nom du circuit', c?.label || '', 'text', 'required maxlength="80"') + select('kind', 'Réseau', [['power','Puissance'],['data','Communication']], c?.kind || 'power') + `<div class="field-grid">${field('section', 'Section saisie (mm²)', c?.section || '', 'text', 'placeholder="À définir"')}${field('protection', 'Protection / référence', c?.protection || '', 'text', 'placeholder="À définir"')}</div>` + field('differential', 'Groupe différentiel (repère existant)', c?.differential || '') + select('mode', 'Quantifier', [['cable','Câble multiconducteur · une longueur'],['wires','Conducteurs séparés · une longueur chacun']], c?.mode || 'cable') + field('conductors', 'Conducteurs / repères séparés par une virgule', c?.conductors || '', 'text', 'placeholder="Ex. L,N,PE ou repères réseau"') + field('cableRef', 'Référence câble ou conducteur', c?.cableRef || '') + field('conduitRef', 'Référence gaine (facultatif)', c?.conduitRef || ''), c ? 'Mettre à jour le circuit' : 'Créer le circuit');
  const symbolForm = form('symbol', symbol?.id, select('kind', 'Symbole', ELECTRICAL_SYMBOLS.map(x => [x.id,x.label]), symbol?.kind || 'socket') + field('label','Nom',symbol?.label || '', 'text', 'maxlength="80"') + `<div class="field-grid">${field('x','X (mm)',symbol?.x ?? 500,'number','required')}${field('z','Z (mm)',symbol?.z ?? 500,'number','required')}${field('height','Hauteur de pose (mm)',symbol?.height ?? 0,'number','min="0"')}${field('rotation','Rotation (°)',symbol?.rotation ?? 0,'number')}</div>` + select('circuitId','Affectation',circuitOptions,symbol?.circuitId ?? s.selectedCircuit) + field('reference','Référence à acheter',symbol?.reference || ''), symbol ? 'Appliquer la position' : 'Ajouter aux coordonnées');
  const routeForm = form('route', route?.id, field('label','Nom du trajet',route?.label || '', 'text','maxlength="80"') + select('circuitId','Circuit',circuitOptions,route?.circuitId ?? s.selectedCircuit) + `<div class="field-grid">${select('from','Départ attaché',symbolOptions,route?.from || '')}${select('to','Arrivée attachée',symbolOptions,route?.to || '')}</div><label class="field"><span>Points X,Z en mm (un point par ligne)</span><textarea name="points" rows="4" required placeholder="500,500&#10;2500,500&#10;2500,1500">${esc(route ? electricalRoutePoints(s, route).map(p => `${p.x},${p.z}`).join('\n') : '')}</textarea></label><div class="field-grid">${field('vertical','Montées + descentes (mm)',route?.vertical || 0,'number','min="0"')}${field('reserve','Réserve aux extrémités (mm)',route?.reserve || 0,'number','min="0"')}${field('margin','Marge d’achat (%)',route?.margin || 0,'number','min="0" max="100"')}</div><p class="help-text">Les hauteurs de pose ne sont pas ajoutées automatiquement : saisissez ici la somme des montées et descentes réelles. La marge et la réserve s’appliquent au câble et à la gaine.</p>`, route ? 'Mettre à jour le trajet' : 'Ajouter le trajet');
  const rows = electricalRows(s), lengths = s.routes.reduce((n, r) => n + routeLength(s, r).measured, 0);
  const undefinedRoutes = s.routes.filter(r => !r.circuitId).length, missingConductors = s.circuits.filter(c => c.mode === 'wires' && !c.conductors).length;
  return `<div class="electrical-workspace"><div class="content-heading"><span class="eyebrow">ÉLECTRICITÉ · IMPLANTATION & QUANTITÉS</span><h2>Du plan à la liste d’achats.</h2><p>Placez les appareils, affectez-les à un circuit, puis tracez chaque cheminement. Dimensions en mm.</p></div><p class="notice">Outil de dessin et de quantités. Sections, protections et conducteurs sont à renseigner ; la conformité et le câblage réel restent à vérifier par un électricien.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin:16px 0">${button('tool','Sélectionner','','data-tool="select" aria-pressed="'+(s.tool === 'select')+'"')}${ELECTRICAL_SYMBOLS.map(k => button('tool',esc(k.label),'',`data-tool="${k.id}" aria-pressed="${s.tool === k.id}"`)).join('')}${button('tool','Tracer un câble','','data-tool="route" aria-pressed="'+(s.tool === 'route')+'"')}${button('export-plan','Exporter plan SVG')}${button('export-singleline','Exporter unifilaire SVG')}${button('export-csv','Exporter achats CSV')}</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px"><section class="card" style="min-width:0;padding:18px"><h3>Plan d’implantation</h3><p class="help-text">${s.tool === 'route' ? 'Cliquez les points du parcours, y compris les changements de direction. Cliquez un appareil pour y attacher une extrémité.' : kinds.includes(s.tool) ? 'Cliquez sur le plan pour poser ce symbole ; chaque clic ajoute un appareil.' : 'Cliquez un symbole ou un trajet pour modifier ses propriétés ci-dessous.'} Pas : ${fmt(s.grid)} mm.</p>${electricalPlanSVG(s)}${s.tool === 'route' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${button('finishRoute',`Terminer (${s.draft.length} points)`)}${button('undoPoint','Retirer le dernier point')}${button('cancelRoute','Annuler le tracé')}</div>` : ''}<p class="help-text">${s.symbols.length} appareils · ${s.routes.length} trajets · ${fmt(lengths)} m mesurés hors réserves.</p>${undefinedRoutes || missingConductors ? `<p class="notice">${undefinedRoutes ? `${undefinedRoutes} trajet(s) sans circuit : longueurs exclues des achats. ` : ''}${missingConductors ? `${missingConductors} circuit(s) en conducteurs séparés sans repères : ajoutez les conducteurs pour les quantifier.` : ''}</p>` : ''}<details><summary>Dimensions du plan</summary>${form('settings','',field('title','Titre',s.title) + `<div class="field-grid">${field('width','Largeur X (mm)',s.width,'number','min="100" max="100000"')}${field('depth','Profondeur Z (mm)',s.depth,'number','min="100" max="100000"')}${field('grid','Pas de placement (mm)',s.grid,'number','min="0.1" max="1000"')}</div>`,'Appliquer les dimensions')}</details></section><section class="card" style="padding:18px"><h3>Circuits</h3><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${s.circuits.map(x => button('selectCircuit',esc(x.label),x.id,`aria-pressed="${s.selectedCircuit === x.id}"`)).join('')}${button('selectCircuit','+ Nouveau circuit')}</div>${circuitForm}${c ? `<p>${button('deleteCircuit','Supprimer ce circuit et ses trajets',c.id)}</p>` : ''}<p class="help-text">Le groupe différentiel est un repère descriptif. Les appareils partagés du tableau sont à ajouter à votre catalogue d’achats.</p></section></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px;margin-top:20px"><section class="card" style="padding:18px"><h3>${symbol ? esc(symbol.id) + ' · appareil sélectionné' : 'Ajouter un appareil précisément'}</h3>${symbolForm}${symbol ? `<p>${button('deleteSymbol','Supprimer cet appareil et ses trajets',symbol.id)} ${button('select','Désélectionner')}</p>` : ''}</section><section class="card" style="padding:18px"><h3>${route ? esc(route.id) + ' · trajet sélectionné' : 'Saisir un cheminement'}</h3>${route ? `<p>${fmt(electricalRouteLength(s,route).measured)} m mesurés · ${fmt(electricalRouteLength(s,route).purchase)} m à prévoir avec réserve et marge.</p>` : ''}${routeForm}${route ? `<p>${button('deleteRoute','Supprimer ce trajet',route.id)} ${button('select','Désélectionner')}</p>` : ''}</section></div><section class="card" style="padding:18px;margin-top:20px"><h3>Unifilaire de principe</h3>${electricalSingleLineSVG(s)}</section><section class="card" style="padding:18px;margin-top:20px"><h3>Achats issus du schéma</h3><div style="overflow:auto"><table style="width:100%;text-align:left"><thead><tr><th>Article</th><th>Quantité</th><th>Repères</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${fmt(r.quantity,3)} ${r.unit}</td><td>${esc(r.itemIds.join(', '))}</td></tr>`).join('') || '<tr><td colspan="3">Ajoutez des appareils et tracez les câbles pour constituer la liste.</td></tr>'}</tbody></table></div><p class="help-text">Quantités exactes de tracés, hors conditionnements commerciaux. Chaque chemin est compté une fois ; ne dessinez pas plusieurs fois le même câble.</p></section><p class="help-text"><a href="${ELECTRICAL_REFERENCE.url}" target="_blank" rel="noopener">${ELECTRICAL_REFERENCE.label} ↗</a> · Référence documentaire consultée le ${ELECTRICAL_REFERENCE.checkedAt}. Les règles de dimensionnement ne sont pas intégrées au logiciel.</p></div>`;
}

/** Adapter for the app's delegated click/submit listeners. Export actions are returned for root download handling. */
export function electricalEventAction(event, raw) {
  const s = stateOf(raw), target = event.target;
  if (event.type === 'submit') {
    const f = target?.closest?.('[data-electrical-form]'); if (!f) return null;
    if (f.checkValidity && !f.checkValidity()) return null;
    const FormDataClass = f.ownerDocument?.defaultView?.FormData || globalThis.FormData;
    const values = Object.fromEntries(new FormDataClass(f));
    return {type:f.dataset.electricalForm, id:f.dataset.id || '', values};
  }
  if (event.type !== 'click') return null;
  const btn = target?.closest?.('[data-electrical-action]');
  if (btn) return {type:btn.dataset.electricalAction, id:btn.dataset.id || '', tool:btn.dataset.tool};
  const svg = target?.closest?.('[data-electrical-plan]'); if (!svg) return null;
  const symbol = target.closest?.('[data-electrical-symbol]'), route = target.closest?.('[data-electrical-route]');
  if (symbol && s.tool === 'select') return {type:'select', id:symbol.dataset.electricalSymbol};
  if (route && s.tool === 'select') return {type:'select', id:route.dataset.electricalRoute};
  if (symbol && s.tool === 'route') return {type:'point', symbolId:symbol.dataset.electricalSymbol};
  const box = svg.getBoundingClientRect(), vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  if (!box.width || !box.height) return null;
  const scale = Math.min(box.width / vb[2], box.height / vb[3]);
  const x = (event.clientX - box.left - (box.width - vb[2] * scale) / 2) / scale + vb[0];
  const z = (event.clientY - box.top - (box.height - vb[3] * scale) / 2) / scale + vb[1];
  if (x < 0 || x > s.width || z < 0 || z > s.depth) return null;
  return {type:'point', x, z};
}
