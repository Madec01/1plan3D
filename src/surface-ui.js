import {finishesForSurface,partSurface,surfaceForPart,normalizeAppearance} from './surface-catalog.js';
import {surfaceThumbnail} from './surface-textures.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function swatches(finishes,current,target){
  return `<div class="surface-swatches" role="group" aria-label="${target==='ground'?'Finition du sol':'Finition de la sélection'}">${finishes.map(f=>`<button type="button" class="surface-swatch${f.id===current?' active':''}" data-surface-finish="${f.id}" data-surface-target="${target}" aria-pressed="${f.id===current}"><img src="${surfaceThumbnail(f.id)}" alt="" width="80" height="52" loading="lazy"><span>${esc(f.label)}</span></button>`).join('')}</div>`;
}
function adjustments(settings,target){
  return `<div class="surface-adjustments"><label class="field"><span>Échelle du motif</span><select data-surface-setting="scale" data-surface-target="${target}">${[.25,.5,1,2,4].map(n=>`<option value="${n}"${n===settings.scale?' selected':''}>× ${n}</option>`).join('')}${![.25,.5,1,2,4].includes(settings.scale)?`<option value="${settings.scale}" selected>× ${settings.scale}</option>`:''}</select></label><label class="field"><span>Rotation (°)</span><input type="number" min="-360" max="360" step="any" value="${settings.rotation}" data-surface-setting="rotation" data-surface-target="${target}"></label><label class="field"><span>Teinte</span><input type="color" value="${settings.tint}" data-surface-setting="tint" data-surface-target="${target}"></label></div>`;
}
export function surfaceInspector(project,model,ids){
  const selected=model.parts.filter(part=>ids.includes(part.id));
  if(!selected.length)return '';
  const finishes=finishesForSurface(partSurface(selected[0])).filter(f=>selected.every(part=>finishesForSurface(partSurface(part)).some(other=>other.id===f.id)));
  if(!finishes.length)return '<p class="help-text">Sélectionnez des pièces de même famille pour choisir leur finition.</p>';
  const settings=surfaceForPart(selected[0],project),mixed=selected.some(part=>JSON.stringify(surfaceForPart(part,project))!==JSON.stringify(settings));
  return `<details class="side-details surface-picker" data-surface-picker open><summary>Apparence${selected.length>1?` · ${selected.length} pièces`:''}</summary>${mixed?'<p class="help-text">Finitions différentes. Choisir une finition l’applique à toute la sélection.</p>':''}${swatches(finishes,mixed?'':settings.finish,'parts')}${adjustments(settings,'parts')}<p class="help-text">Aspect visuel uniquement. Les dimensions, le support porteur et les quantités restent identiques.</p></details>`;
}
export function surfaceDisplaySettings(project){
  const settings=normalizeAppearance(project.appearance,project.ground);
  return `<label class="field"><span>Qualité des textures</span><select data-surface-quality><option value="standard"${settings.quality==='standard'?' selected':''}>Détaillée · relief et rugosité</option><option value="light"${settings.quality==='light'?' selected':''}>Légère · couleur seule</option></select></label><details class="surface-picker"><summary>Apparence du sol</summary>${swatches(finishesForSurface('ground'),settings.ground.finish,'ground')}${adjustments(settings.ground,'ground')}</details>`;
}
