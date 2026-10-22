import {normalizeAssistance, resolveAdaptiveGrid} from './adaptive-placement.js';
import {betweenMeasurements} from './between-placement.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value).toLocaleString('fr-FR', {maximumFractionDigits:3});
const choice = (name, label, options, value) => `<label class="field"><span>${label}</span><select name="${name}">${options.map(([id, text]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
const toggle = (name, label, checked) => `<label class="toggle-row"><span>${label}</span><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}></label>`;
const action = (name, label, primary = false) => `<button type="button" class="btn ${primary ? 'primary ' : ''}full" data-assist-action="${name}">${label}</button>`;

/** Sidebar only: all changes and operations are committed by the app dispatcher. */
export function adaptiveSidebar(project, ids = []) {
  const p = project || {}, a = normalizeAssistance(p.assistance);
  const woods = (p.freeParts || []).filter(part => part.material === 'wood' && part.kind !== 'panel');
  const selected = [...new Set(ids)].map(id => woods.find(part => part.id === id)).filter(Boolean);
  const pairSelected = selected.length === 2 && ids.length === 2;
  const names = new Map(woods.map(part => [part.id, part.label || part.id]));
  const options = [['', 'Choisir une pièce'], ...woods.map(part => [part.id, `${part.label || part.id} · ${part.id}`])];
  let grid;
  try { grid = resolveAdaptiveGrid({...p, assistance:a}); }
  catch (error) { grid = {adaptive:false, step:a.gridStep, divisions:a.gridDivisions, refs:[], notice:error.message || 'Références de grille à compléter.'}; }
  const gridRefs = (grid.refs || []).map(id => names.get(id) || id);
  const mode = a.gridMode === 'adaptive' ? 'Grille adaptative' : 'Grille à pas fixe';
  const gridState = `<div class="adaptive-readout adaptive-grid-readout" role="status"><span>${grid.adaptive ? 'Entre les repères' : 'Pas de la grille'}</span><strong>${fmt(grid.step)} mm <small>/ carreau</small></strong>${grid.adaptive ? `<p>${esc(gridRefs.join(' ↔ '))}</p><small>${fmt(grid.span)} mm d’entraxe dans le plan ÷ ${fmt(grid.divisions)} divisions</small>` : ''}</div>`;
  let pairReadout = '';
  if (pairSelected) {
    try {
      const measure = betweenMeasurements(selected[0], selected[1], p.workplane);
      pairReadout = `<div class="adaptive-readout adaptive-pair-readout" role="status"><p class="adaptive-pair-names">${esc(selected[0].label || selected[0].id)} ↔ ${esc(selected[1].label || selected[1].id)}</p><dl><div><dt>Entraxe dans le plan</dt><dd>${fmt(measure.axisDistance)} <small>mm</small></dd></div><div><dt>${measure.clearGap < 0 ? 'Chevauchement des faces projetées' : 'Espace entre faces projetées'}</dt><dd>${fmt(Math.abs(measure.clearGap))} <small>mm</small></dd></div></dl></div>`;
    } catch (error) {
      pairReadout = `<p class="notice adaptive-pair-notice">${esc(error.message || 'Les deux repères ne définissent pas de distance dans ce plan.')}</p>`;
    }
  }
  return `<section class="adaptive-assistance" aria-label="Aides au placement"><div class="adaptive-heading"><h3>Aides au placement</h3><span class="tag">Adaptatif</span></div><form data-assistance-settings>
    ${toggle('guides', 'Guides d’alignement et distances', a.guides)}
    ${toggle('guideSnap', 'Accrocher aux guides', a.guideSnap)}
    ${toggle('gridSnap', 'Accrocher aux intersections', a.gridSnap)}
    <details class="adaptive-grid-settings" ${a.gridSnap ? 'open' : ''}><summary>${mode}<span>${fmt(grid.step)} mm</span></summary>
      ${choice('gridMode', 'Construction de la grille', [['adaptive','Diviser l’écart entre deux repères'],['fixed','Carreaux de taille fixe']], a.gridMode)}
      <div data-grid-fixed ${a.gridMode === 'fixed' ? '' : 'hidden'}><label class="field"><span>Taille d’un carreau (mm)</span><input type="number" name="gridStep" min="0.1" max="10000" step="any" value="${esc(a.gridStep)}" required></label></div>
      <div data-grid-adaptive ${a.gridMode === 'adaptive' ? '' : 'hidden'}><label class="field"><span>Nombre de divisions de l’entraxe</span><input type="number" name="gridDivisions" min="1" max="100" step="1" value="${esc(a.gridDivisions)}" required></label></div>
      ${choice('gridReference', 'Repères de la grille', [['auto','Automatiques · les deux plus éloignés'],['pair','Choisir deux pièces']], a.gridReference)}
      <p class="help-text" ${a.gridReference === 'auto' ? '' : 'hidden'}>Les poteaux sont choisis en priorité.</p>
      <div class="adaptive-reference-pair" data-grid-pair ${a.gridReference === 'pair' ? '' : 'hidden'}>${choice('gridA', 'Premier repère', options, a.gridA)}${choice('gridB', 'Second repère', options, a.gridB)}</div>
      ${gridState}${grid.notice ? `<p class="notice adaptive-grid-notice">${esc(grid.notice)}</p>` : ''}
      <p class="help-text">Les intersections sont des positions absolues du plan. Le pas de déplacement ci-dessous reste un incrément depuis la position actuelle. Quand l’accroche à la grille est activée, elle est prioritaire ; maintenez Alt pour ignorer les accrochages pendant le geste.</p><p class="help-text">La grille automatique s’adapte aux repères. Elle ne déplace pas les pièces déjà posées.</p>
    </details>
  </form>${pairSelected ? action('grid-selection', 'Prendre ces deux pièces comme repères') : ''}${pairReadout}
  ${woods.length >= 2 ? `<div class="adaptive-actions">${action('between', pairSelected ? 'Ajouter au milieu de ces pièces' : 'Insérer entre deux repères', true)}${selected.length === 3 && ids.length === 3 ? action('center-existing', 'Centrer la dernière entre les deux premières') : ''}</div>` : '<p class="help-text">Ajoutez deux bois pour insérer une pièce entre eux.</p>'}
  </section>`;
}
