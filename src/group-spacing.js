/** Chaque groupe explicite est une unité rigide pour le réglage des écarts. */
import {selectionGroupIds,namedSelectionGroups,contextBounds} from './context-actions.js';
import {transformSelection} from './editor-ops.js';

function groupBounds(project,ids){
 const boxes=ids.map(id=>contextBounds(project.freeParts.find(p=>p.id===id)));
 const min=[0,1,2].map(i=>Math.min(...boxes.map(b=>b.min[i]))),max=[0,1,2].map(i=>Math.max(...boxes.map(b=>b.max[i])));
 return {min,max,boxCenter:min.map((n,i)=>(n+max[i])/2)};
}

export function spacingTargets(project,ids=[]){
 const groups=namedSelectionGroups(project),grouped=new Set(groups.flatMap(g=>g.ids));
 const targets=[...groups.map(g=>({key:`group:${g.name}`,label:`Groupe ${g.name} · ${g.count} pièces`,ids:g.ids})),
  ...project.freeParts.filter(p=>!grouped.has(p.id)).map(p=>({key:`part:${p.id}`,label:`${p.label||p.kind} · ${p.id}`,ids:[p.id]}))];
 const all=selectionGroupIds(project,ids);
 if(all.length>1&&!targets.some(t=>t.ids.length===all.length&&t.ids.every(id=>all.includes(id))))targets.unshift({key:'selection',label:`Toute la sélection · ${all.length} pièces`,ids:all});
 return targets;
}
export function spacingDefaults(project,ids){
 const targets=spacingTargets(project,ids),expanded=selectionGroupIds(project,ids);
 const chosen=targets.filter(t=>t.key!=='selection'&&t.ids.some(id=>expanded.includes(id)));
 const moving=chosen.at(-1)||targets[0],reference=chosen.length>1?chosen[0]:targets.find(t=>t.ids.every(id=>!moving?.ids.includes(id)));
 if(!moving||!reference)throw Error('Ajoutez une pièce ou un autre groupe distinct pour régler leur écart.');
 const a=groupBounds(project,moving.ids),b=groupBounds(project,reference.ids);
 const difference=a.boxCenter.map((n,i)=>n-b.boxCenter[i]);
 const index=difference.map(Math.abs).indexOf(Math.max(...difference.map(Math.abs)));
 return {moving:moving.key,reference:reference.key,axis:'xyz'[index],side:difference[index]<0?-1:1,measure:'faces'};
}
export function groupSpacingChange(project,ids,{moving,reference,axis='x',side=1,measure='faces',distance}={}){
 const targets=spacingTargets(project,ids),a=targets.find(t=>t.key===moving),b=targets.find(t=>t.key===reference),index='xyz'.indexOf(axis);
 if(!a||!b||a.ids.some(id=>b.ids.includes(id)))throw Error('Choisissez deux ensembles distincts : la référence reste immobile.');
 if(index<0||axis.length!==1||![-1,1].includes(side)||!['axes','faces'].includes(measure))throw Error('Choisissez un axe, un côté et une mesure valides.');
 const ab=groupBounds(project,a.ids),bb=groupBounds(project,b.ids);
 const current=measure==='axes'?side*(ab.boxCenter[index]-bb.boxCenter[index]):side===1?ab.min[index]-bb.max[index]:bb.min[index]-ab.max[index];
 if(distance===undefined)return {current,ids:a.ids,referenceIds:b.ids,delta:[0,0,0]};
 if(!Number.isFinite(distance)||distance<0||distance>100000)throw Error('Saisissez un écart de 0 à 100 000 mm, avec mm, cm ou m.');
 const delta=[0,0,0];delta[index]=side*(distance-current);
 for(const part of project.freeParts.filter(p=>a.ids.includes(p.id)))for(const point of part.corners||[part.a,part.b])if(point.some((n,i)=>!Number.isFinite(n+delta[i])||Math.abs(n+delta[i])>100000))throw Error('Ce déplacement dépasse les limites du projet (±100 000 mm).');
 return {current,distance,delta,ids:a.ids,referenceIds:b.ids};
}
export function setGroupSpacing(project,ids,options){const change=groupSpacingChange(project,ids,options);return transformSelection(project,change.ids,{delta:change.delta})}
