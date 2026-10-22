import {RECIPES} from './engine.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:2});
const grounds={soil:'Terre / jardin',concrete:'Dalle en béton',pavers:'Pavés ou gravier',unknown:'Support à identifier'};

export function fixingAdviceLinks(){
 return `<section class="fixing-advice-links" aria-label="Conseils de fixation"><h2 class="sidebar-title">Conseils & calculs</h2><button class="btn full" data-action="foundation-helper">Plots béton & ancrages</button><button class="btn full subtle" data-action="wall-helper">Fixations au mur</button><button class="btn full subtle" data-action="joint-detail">Assemblages bois</button></section>`;
}

/** Reuse the existing catalogue and BOM; opening advice never changes a project. */
export function foundationHelpHTML(project,model,bom,selectedIds=[]){
 const selected=model.posts.filter(p=>selectedIds.includes(p.id)),posts=selected.length?selected:model.posts;
 const recipes=RECIPES.filter(r=>r.family==='foundation'),footings=model.parts.filter(p=>p.kind==='footing'),litres=footings.reduce((sum,p)=>sum+p.volumeLitres,0),concrete=bom.find(r=>r.id==='concrete-bags');
 const rows=bom.filter(row=>row.category==='Fondations'||['post-bolt-kit','mechanical-anchors','chemical-rod-kit','chemical-resin'].includes(row.id));
 return `<p class="help-text">Retrouvez ici les familles de fondations, leurs composants, les points à vérifier et les calculs du projet. Consulter ces conseils ne change aucun appui.</p>
 <h3>${selected.length?'Poteaux sélectionnés':'Appuis du projet'}</h3>
 <ul>${posts.map(p=>`<li><strong>${esc(p.id)}</strong> · ${esc(grounds[p.ground])} · ${esc(recipes.find(r=>r.id===p.foundation)?.label||'Sans appui quantifié')}</li>`).join('')||'<li>Aucun poteau dans le projet.</li>'}</ul>
 <h3>Plots béton · calcul du projet entier</h3>
 <p>Plot carré : <strong>${fmt(project.footingWidth)} × ${fmt(project.footingWidth)} × ${fmt(project.footingDepth)} mm</strong>.<br>Volume d’un plot : ${fmt(project.footingWidth**2*project.footingDepth/1e6)} L.<br><strong>${footings.length} plot(s) · ${fmt(litres)} L de béton</strong> avant réserve.<br>Rendement saisi : ${fmt(project.concreteYield)} L par sac.${concrete?`<br>Réserve : ${fmt(concrete.marginQty)} L · stock : ${fmt(concrete.stock)} L.<br><strong>${fmt(concrete.packs)} sac(s) à acheter</strong>, selon la checklist actuelle.`:'<br>Aucun plot béton affecté : aucun sac ajouté aux achats.'}</p>
 <p class="help-text">Les dimensions saisies décrivent les plots dessinés ; elles ne dimensionnent pas les fondations. Armatures, coffrage et terrassement ne sont pas inclus.</p>
 <button class="btn primary" data-action="foundation-settings">Régler les plots et les ancrages</button>
 <h3>Solutions et conseils de pose</h3><div class="comparison-grid">${recipes.map(r=>`<article class="comparison-card"><h3>${esc(r.label)}</h3><p>${esc(r.description)}</p><p class="help-text">Supports du catalogue : ${r.supports.map(s=>esc(grounds[s]||s)).join(', ')}.</p><ul>${r.components.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><p>${esc(r.conditions)}</p><a class="source-link" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.source)} ↗</a></article>`).join('')}</div>
 <h3>Quantités actuelles</h3><ul>${rows.map(row=>`<li>${esc(row.label)} : ${fmt(row.required)} ${esc(row.unit)} avant réserve.</li>`).join('')||'<li>Aucun appui quantifié pour le moment.</li>'}</ul><button class="btn" data-action="foundation-shopping">Voir la checklist d’achat</button>`;
}
