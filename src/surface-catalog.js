// Visual finishes only: these identifiers never select a structural material.
export const SURFACE_FINISHES = Object.freeze([
  {id:'wood-raw', label:'Bois naturel', family:'wood', asset:'wood', size:[1,1], grain:'u', roughness:.95},
  {id:'wood-planed', label:'Bois satiné', family:'wood', asset:'wood', size:[1,1], grain:'u', roughness:.55},
  {id:'wood-stained', label:'Bois lasuré', family:'wood', asset:'wood', size:[1,1], grain:'u', roughness:.4, tint:'#ac7845'},
  {id:'wood-weathered', label:'Bois patiné', family:'wood', asset:'weathered', size:[.234375,1.5], grain:'v', roughness:1},
  {id:'block', label:'Parpaing gris', family:'wall', asset:'block', size:[1.5,1.5], roughness:1},
  {id:'stone', label:'Pierre naturelle', family:'wall', asset:'stone', size:[2,2], roughness:1},
  {id:'concrete', label:'Béton brut', family:'mineral', asset:'concrete', size:[2,2], roughness:1},
  {id:'plaster', label:'Enduit clair', family:'wall', asset:'plaster', size:[1,1], roughness:1},
  {id:'grass', label:'Herbe', family:'ground', asset:'grass', size:[2,2], roughness:1},
  {id:'earth', label:'Terre et mousse', family:'ground', asset:'earth', size:[2,2], roughness:1},
  {id:'earth-wet', label:'Terre humide', family:'ground', asset:'earth', size:[2,2], roughness:.48, tint:'#706153'},
  {id:'pavers', label:'Pavés', family:'ground', asset:'pavers', size:[2,2], roughness:1}
].map(f => Object.freeze({...f, size:Object.freeze(f.size)})));
const byId = new Map(SURFACE_FINISHES.map(f => [f.id,f]));
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback;
export function finishesForSurface(surface){
  return SURFACE_FINISHES.filter(f => surface==='wood' ? f.family==='wood' : surface==='wall' ? ['wall','mineral'].includes(f.family) : surface==='ground' ? ['ground','mineral'].includes(f.family) : ['concrete','roof'].includes(surface) ? f.family==='mineral' : false);
}
export function defaultFinish(surface, ground='soil'){
  return surface==='wood'?'wood-raw':surface==='wall'?'concrete':surface==='ground'?(ground==='concrete'?'concrete':ground==='pavers'?'pavers':'grass'):'concrete';
}
export function normalizeSurface(raw={}, surface='wood', fallback=defaultFinish(surface)){
  const v=object(raw), valid=finishesForSurface(surface).some(f=>f.id===v.finish);
  return {finish:valid?v.finish:fallback,scale:number(v.scale,1,.25,4),rotation:number(v.rotation,0,-360,360),tint:typeof v.tint==='string'&&/^#[a-f\d]{6}$/i.test(v.tint)?v.tint.toLowerCase():'#ffffff'};
}
export function normalizeAppearance(raw={}, ground='soil'){
  const v=object(raw),parts={};
  for(const [id,value] of Object.entries(object(v.parts)).slice(0,2000)){
    if(!/^[\w.:-]{1,120}$/.test(id)||['__proto__','constructor','prototype'].includes(id))continue;
    const entry=object(value), finish=byId.get(entry.finish);
    if(finish)parts[id]=normalizeSurface(entry,finish.family==='mineral'?'concrete':finish.family);
  }
  return {mode:v.mode==='schematic'?'schematic':'realistic',quality:v.quality==='light'?'light':'standard',ground:normalizeSurface(v.ground,'ground',defaultFinish('ground',ground)),parts};
}
export function partSurface(part){return part.material||(part.kind==='wall'?'wall':'wood');}
export function surfaceForPart(part, project={}){
  const surface=partSurface(part);
  return normalizeSurface(project.appearance?.parts?.[part.id],surface);
}
export function getFinish(id){return byId.get(id);}
export function applySurfaceToSelection(project, parts, ids, appearance){
  const selected=parts.filter(part=>ids.includes(part.id));
  if(!selected.length)throw new Error('Sélectionnez au moins une pièce.');
  if(selected.some(part=>!finishesForSurface(partSurface(part)).some(f=>f.id===appearance.finish)))throw new Error('Choisissez des pièces compatibles avec cette finition.');
  project.appearance=normalizeAppearance(project.appearance,project.ground);
  for(const part of selected)project.appearance.parts[part.id]=normalizeSurface(appearance,partSurface(part));
  return project;
}
