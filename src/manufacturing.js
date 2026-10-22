/** Préparation géométrique des coupes. mm et degrés ; aucun réglage de machine déduit. */
import * as THREE from 'three';
import { timberQuaternion } from './geometry.js';

export const CUT_PLANES = [
  ['unspecified', 'Non définie'], ['square', 'D’équerre à l’axe'], ['horizontal', 'Horizontale · Y constant'],
  ['vertical', 'Verticale · perpendiculaire au parcours'], ['vertical-x', 'Verticale · X constant'], ['vertical-z', 'Verticale · Z constant']
];
const types = CUT_PLANES.map(([id]) => id), labels = Object.fromEntries(CUT_PLANES);
const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const finitePoint = p => Array.isArray(p) && p.length === 3 && p.every(n => typeof n === 'number' && Number.isFinite(n));
const safeID = id => /^[a-zA-Z0-9_.:-]{1,120}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const numeric = (v, fallback=0) => v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? fallback : Number(v);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const angle = value => Number.isFinite(value) ? value.toLocaleString('fr-FR',{maximumFractionDigits:1})+'°' : '—';
const clean = n => Math.abs(n) < 1e-10 ? 0 : n;
const vector = p => new THREE.Vector3(...p);
const degrees = n => n * 180 / Math.PI;
export function normalizeCutSpec(raw={}) {
  const v=object(raw);
  return {a:types.includes(v.a)?v.a:'unspecified',b:types.includes(v.b)?v.b:'unspecified',allowance:Math.max(0,Math.min(10000,numeric(v.allowance)))};
}
export function normalizeManufacturing(raw={}) {
  const v=object(raw),cuts={};
  for(const [id,spec] of Object.entries(object(v.cuts)).slice(0,1000)) if(safeID(id))cuts[id]=normalizeCutSpec(spec);
  return {version:1,precision:Number(v.precision)===.5?.5:1,cuts};
}
export function formatDimension(value,precision=1) {
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
  const step=Number(precision)===.5?.5:1,rounded=clean(Math.round(Number(value)/step)*step);
  return rounded.toLocaleString('fr-FR',{maximumFractionDigits:step===.5?1:0});
}
function boxOf(points) {
  const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
  return {min,max,size:max.map((v,i)=>v-min[i])};
}
function normalFor(type,direction) {
  if(type==='square')return direction.clone();
  if(type==='horizontal')return new THREE.Vector3(0,1,0);
  if(type==='vertical-x')return new THREE.Vector3(1,0,0);
  if(type==='vertical-z')return new THREE.Vector3(0,0,1);
  if(type==='vertical')return new THREE.Vector3(direction.x,0,direction.z).normalize();
  return null;
}

/** Plans passant par A et B. Intersection des quatre arêtes du prisme de section constante. */
export function analyzeTimberCut(part,spec={}) {
  const input=object(part),settings=normalizeCutSpec(spec),result={partId:input.id||'',supported:false,status:'invalid',axisLength:null,inclinationDeg:null,azimuthDeg:null,rollDeg:numeric(input.roll),section:{width:numeric(input.width),height:numeric(input.height)},modelBox:null,cuts:{},outerAxialLength:null,blankLength:null,allowance:settings.allowance,messages:[]};
  if(input.material!=='wood'||input.kind==='panel'){result.messages.push('La fiche de coupe concerne une barre de bois de section rectangulaire constante.');return result}
  if(!finitePoint(input.a)||!finitePoint(input.b)||!(result.section.width>0)||!(result.section.height>0)){result.messages.push('Coordonnées ou section de la pièce invalides.');return result}
  const a=vector(input.a),b=vector(input.b),direction=b.clone().sub(a),length=direction.length();
  if(!(length>1e-6)){result.messages.push('Une pièce de longueur nulle ne définit pas de plan de coupe.');return result}
  direction.normalize();const q=timberQuaternion(input),inverse=q.clone().invert(),horizontal=Math.hypot(direction.x,direction.z);
  Object.assign(result,{supported:true,axisLength:length,inclinationDeg:degrees(Math.atan2(direction.y,horizontal)),azimuthDeg:horizontal>1e-9?degrees(Math.atan2(direction.z,direction.x)):null,status:'incomplete'});
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[x*result.section.width/2,y*result.section.height/2]);
  const worldPoint=(x,y,t)=>new THREE.Vector3(x,y,t).applyQuaternion(q).add(a).toArray().map(clean);
  result.modelBox={...boxOf([0,length].flatMap(t=>corners.map(([x,y])=>worldPoint(x,y,t)))),axialLength:length};
  for(const end of ['a','b']) {
    const type=settings[end],t0=end==='a'?0:length,cut={type,label:labels[type],defined:type!=='unspecified',valid:false,angleFromSquareDeg:null,angleToAxisDeg:null,localNormal:null,axialRange:null,points:[],localPoints:[]};
    result.cuts[end]=cut;
    if(!cut.defined){result.messages.push(`Coupe ${end.toUpperCase()} non définie : la cote brute reste à confirmer.`);continue}
    const normal=normalFor(type,direction);
    if(!normal||normal.lengthSq()<1e-12){result.messages.push(`Coupe ${end.toUpperCase()} : une pièce verticale ne définit pas de parcours horizontal.`);continue}
    const localNormal=normal.clone().applyQuaternion(inverse).normalize(),denominator=localNormal.z;
    cut.localNormal=localNormal.toArray().map(clean);
    if(Math.abs(denominator)<1e-7){result.messages.push(`Coupe ${end.toUpperCase()} impossible : le plan est parallèle à l’axe de la pièce.`);continue}
    cut.angleFromSquareDeg=degrees(Math.acos(Math.min(1,Math.abs(denominator))));
    cut.angleToAxisDeg=90-cut.angleFromSquareDeg;
    cut.localPoints=corners.map(([x,y])=>[x,y,t0-(localNormal.x*x+localNormal.y*y)/denominator]);
    cut.points=cut.localPoints.map(([x,y,t])=>worldPoint(x,y,t));
    const ts=cut.localPoints.map(p=>p[2]);cut.axialRange=[Math.min(...ts),Math.max(...ts)];cut.valid=true;
  }
  const [ca,cb]=[result.cuts.a,result.cuts.b];
  if((ca.defined&&!ca.valid)||(cb.defined&&!cb.valid)){result.status='invalid';return result}
  if(!ca.valid||!cb.valid)return result;
  const edgeLengths=ca.localPoints.map((p,i)=>cb.localPoints[i][2]-p[2]);
  if(edgeLengths.some(l=>l<=1e-6)){result.status='invalid';result.messages.push('Les deux plans se croisent ou inversent une arête : la pièce ne conserve pas sa section rectangulaire complète.');return result}
  result.edgeLengths=edgeLengths;
  result.outerAxialLength=cb.axialRange[1]-ca.axialRange[0];
  result.blankLength=result.outerAxialLength+settings.allowance;
  result.cutBox=boxOf([...ca.points,...cb.points]);
  result.status='defined';
  result.messages.push('Plans géométriques passant par les points A et B ; angles mesurés par rapport à une coupe d’équerre, sans correspondance automatique avec les graduations d’une machine.');
  if(ca.localNormal&&cb.localNormal&&[ca,cb].some(c=>Math.abs(c.localNormal[0])>1e-7&&Math.abs(c.localNormal[1])>1e-7)) result.messages.push('La section tournée produit une coupe composée : les deux projections de la fiche décrivent cette géométrie.');
  return result;
}

/** Entrée commune au débit et aux achats. Ne modifie jamais les pièces originales. */
export function cuttingParts(parts=[],manufacturing={}) {
  const settings=normalizeManufacturing(manufacturing);
  return parts.map(part=>{
    if(part.material!=='wood'||part.kind==='panel')return {...part};
    const analysis=analyzeTimberCut(part,settings.cuts[part.id]);
    return {...part,...(analysis.status==='defined'?{length:analysis.blankLength}:{}),cutPreparation:{status:analysis.status,axisLength:analysis.axisLength,blankLength:analysis.blankLength,messages:[...analysis.messages]}};
  });
}
const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
function hull(points){const ordered=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(ordered.length<3)return ordered;const l=[],u=[];for(const p of ordered){while(l.length>1&&cross(l.at(-2),l.at(-1),p)<=0)l.pop();l.push(p)}for(const p of [...ordered].reverse()){while(u.length>1&&cross(u.at(-2),u.at(-1),p)<=0)u.pop();u.push(p)}return [...l.slice(0,-1),...u.slice(0,-1)]}

export function timberCutSheetSVG(part,spec={},options={}) {
  const analysis=analyzeTimberCut(part,spec),precision=Number(options.precision)===.5?.5:1,dim=v=>formatDimension(v,precision),width=1100,height=760;
  const text=(x,y,value,size=15,color='#294b3c')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${esc(value)}</text>`;
  let drawings='';
  if(analysis.supported){
    const {width:w,height:h}=analysis.section,L=analysis.axisLength,all=analysis.status==='defined'?[...analysis.cuts.a.localPoints,...analysis.cuts.b.localPoints]:[0,L].flatMap(t=>[[-w/2,-h/2,t],[w/2,-h/2,t],[w/2,h/2,t],[-w/2,h/2,t]]);
    for(const [index,coordinate,label,size] of [[0,1,'Face de hauteur · axe local H',h],[1,0,'Face de largeur · axe local L',w]]){
      const shape=hull(all.map(p=>[p[2],-p[coordinate]])),ts=shape.map(p=>p[0]),min=Math.min(0,...ts),max=Math.max(L,...ts),scale=Math.min(920/Math.max(1,max-min),110/Math.max(1,size)),x0=90+(920-(max-min)*scale)/2,y0=245+index*185;
      const screen=p=>[x0+(p[0]-min)*scale,y0+p[1]*scale],points=shape.map(p=>screen(p).join(',')).join(' ');
      const ga=screen([0,-size/2]),gb=screen([L,size/2]);
      drawings+=text(48,y0-72,label,13)+`<rect x="${ga[0]}" y="${ga[1]}" width="${L*scale}" height="${size*scale}" fill="none" stroke="#9daea5" stroke-dasharray="5 4"/><polygon points="${points}" fill="#ddc599" fill-opacity=".6" stroke="#84663d"/><path d="M${screen([min,0]).join(',')}H${screen([max,0])[0]}" stroke="#5b7d73" stroke-dasharray="4 3"/>`;
      for(const [end,color] of [['a','#b15b34'],['b','#3a6691']]){
        const cut=analysis.cuts[end],endT=end==='a'?0:L;
        drawings+=text(screen([endT,0])[0]-5,y0+Math.max(20,size*scale/2+22),end.toUpperCase(),13,color);
        if(cut?.valid){const line=hull(cut.localPoints.map(p=>[p[2],-p[coordinate]]));drawings+=`<polyline points="${line.map(p=>screen(p).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`}
      }
      drawings+=text(48,y0+79,analysis.status==='defined'?`Enveloppe axiale entre points extrêmes : ${dim(analysis.outerAxialLength)} mm`:`Prisme du modèle · longueur d’axe : ${dim(L)} mm · plans de coupe à compléter`,13);
    }
  }
  const a=analysis.cuts.a,b=analysis.cuts.b;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fiche de coupe ${esc(part?.id)}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fffdf8"/><g font-family="Arial,sans-serif">${text(36,38,`Fiche de coupe · ${part?.id||'Pièce'}`,24)}${text(36,64,part?.label||'',16)}${text(36,98,`Section ${dim(analysis.section.width)} × ${dim(analysis.section.height)} mm · longueur d’axe ${dim(analysis.axisLength)} mm`)}${text(36,124,`Inclinaison A → B : ${angle(analysis.inclinationDeg)} · azimut X → Z : ${angle(analysis.azimuthDeg)} · rotation de section : ${angle(analysis.rollDeg)}`,13)}${drawings}${text(36,585,`A · ${a?.label||'Non définie'} · angle géométrique depuis l’équerre : ${angle(a?.angleFromSquareDeg)}`,14,'#985030')}${text(36,612,`B · ${b?.label||'Non définie'} · angle géométrique depuis l’équerre : ${angle(b?.angleFromSquareDeg)}`,14,'#3a6691')}${text(36,648,analysis.status==='defined'?`Brut minimal ${dim(analysis.outerAxialLength)} mm + surlongueur ${dim(analysis.allowance)} mm = ${dim(analysis.blankLength)} mm`:'Cote brute non déterminée · compléter les deux plans de coupe réalisables.',18)}${text(36,680,analysis.status==='invalid'?(analysis.messages[0]||'Géométrie à revoir'):'Les plans passent par A et B. Trait de scie réservé séparément dans le plan de débit.',12)}${text(36,707,'Angles géométriques : ne pas les assimiler aux réglages d’une scie. Entailles et assemblages usinés non calculés.',12)}${text(36,734,`Affichage au ${precision===.5?'demi-millimètre':'millimètre'} · calculs non arrondis · pointillés : prisme du modèle`,11)}</g></svg>`;
}
