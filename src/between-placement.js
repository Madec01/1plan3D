/** Répartition par translation entre deux bois. Calculs exacts en mm ; aucune mutation ni création d’ID. */
import * as THREE from 'three';
import { timberQuaternion } from './geometry.js';
import { workplaneFrame } from './workplane.js';

const EPS=1e-7,OVERLAP_EPS=1e-6;
const vec=p=>new THREE.Vector3(...p);
const finite3=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n));
const clean=n=>Math.abs(n)<1e-10?0:n;
const array=v=>v.toArray().map(clean);
const name=p=>p.label||p.id||'Pièce';
const fmt=n=>Number(n).toLocaleString('fr-FR',{maximumFractionDigits:3});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function timberBox(part){
  if(!part||part.material!=='wood'||!['post','beam','brace','gate'].includes(part.kind)||!finite3(part.a)||!finite3(part.b)||!Number.isFinite(part.width)||!Number.isFinite(part.height)||part.width<=0||part.height<=0||!Number.isFinite(Number(part.roll||0)))return null;
  const a=vec(part.a),b=vec(part.b),length=a.distanceTo(b);
  if(!Number.isFinite(length)||length<EPS)return null;
  const quaternion=timberQuaternion(part),axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)].map(v=>v.applyQuaternion(quaternion)),half=[part.width/2,part.height/2,length/2],center=a.clone().add(b).multiplyScalar(.5),corners=[];
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push(center.clone().addScaledVector(axes[0],half[0]*x).addScaledVector(axes[1],half[1]*y).addScaledVector(axes[2],half[2]*z));
  const min=new THREE.Vector3(...[0,1,2].map(i=>Math.min(...corners.map(p=>p.getComponent(i))))),max=new THREE.Vector3(...[0,1,2].map(i=>Math.max(...corners.map(p=>p.getComponent(i)))));
  return {part,axes,half,center,corners,min,max};
}
function requireBox(part,label){const box=timberBox(part);if(!box)throw new Error(`${label} : choisissez une pièce de bois rectangulaire de longueur et section positives.`);return box}
function anchorOf(box,normal){
  if(box.part.kind!=='post')return box.center.clone();
  const a=vec(box.part.a),b=vec(box.part.b),difference=a.dot(normal)-b.dot(normal);
  // Un poteau parallèle au plan n’a pas d’extrémité basse privilégiée.
  return Math.abs(difference)<EPS?box.center.clone():difference<0?a:b;
}
function projectPoint(point,frame){return point.clone().addScaledVector(frame.normal,-point.clone().sub(frame.origin).dot(frame.normal))}
function extents(box,anchor,direction){const values=box.corners.map(point=>point.clone().sub(anchor).dot(direction));return {min:Math.min(...values),max:Math.max(...values),width:Math.max(...values)-Math.min(...values)}}
function measurementLine(a,b,distance,measure){return {a:array(a),b:array(b),distance:clean(distance),measure,kind:'spacing',label:`${measure==='axes'?'Entraxe':'Jeu projeté'} : ${fmt(clean(distance))} mm`}}
function pairData(a,b,workplane){
  if(!a||!b||a===b||(a.id&&b.id&&a.id===b.id))throw new Error('Choisissez deux références distinctes.');
  const boxes=[requireBox(a,'Référence A'),requireBox(b,'Référence B')],frame=workplaneFrame(workplane),anchors=boxes.map(box=>anchorOf(box,frame.normal)),projected=anchors.map(point=>projectPoint(point,frame)),delta=projected[1].clone().sub(projected[0]),axisDistance=delta.length();
  if(!Number.isFinite(axisDistance)||axisDistance<EPS)throw new Error('Les références n’ont pas de distance exploitable dans le plan de travail ; choisissez un autre plan ou deux autres références.');
  const direction=delta.multiplyScalar(1/axisDistance),ranges=boxes.map((box,i)=>extents(box,anchors[i],direction)),clearGap=axisDistance+ranges[1].min-ranges[0].max;
  return {boxes,frame,anchors,projected,direction,ranges,axisDistance,clearGap};
}

/** Mesures dans le plan. Un jeu négatif décrit un recouvrement des enveloppes projetées. */
export function betweenMeasurements(a,b,workplane){
  const data=pairData(a,b,workplane),{anchors,projected,direction,ranges,frame,axisDistance,clearGap}=data;
  const messages=['Distances mesurées dans le plan de travail, entre les repères et les enveloppes projetées.'];
  if(anchors[1].clone().sub(anchors[0]).dot(frame.normal)>EPS||anchors[0].clone().sub(anchors[1]).dot(frame.normal)>EPS)messages.push('Les deux repères ont des niveaux différents suivant la normale du plan.');
  return {axisDistance,clearGap:clean(clearGap),anchors:anchors.map(array),projectedAnchors:projected.map(array),direction:array(direction),normal:array(frame.normal),origin:array(frame.origin),u:array(frame.u),v:array(frame.v),referenceIds:[a.id,b.id],referenceParts:[structuredClone(a),structuredClone(b)],extensions:ranges.map(r=>({...r})),lines:[measurementLine(projected[0],projected[1],axisDistance,'axes'),measurementLine(projected[0].clone().addScaledVector(direction,ranges[0].max),projected[1].clone().addScaledVector(direction,ranges[1].min),clearGap,'faces')],messages};
}
function radius(box,axis){return box.axes.reduce((sum,v,i)=>sum+Math.abs(v.dot(axis))*box.half[i],0)}
function interiorsOverlap(a,b){
  for(let i=0;i<3;i++)if(Math.min(a.max.getComponent(i),b.max.getComponent(i))-Math.max(a.min.getComponent(i),b.min.getComponent(i))<=OVERLAP_EPS)return false;
  const axes=[...a.axes,...b.axes];
  for(const first of a.axes)for(const second of b.axes){const axis=new THREE.Vector3().crossVectors(first,second);if(axis.lengthSq()>EPS*EPS)axes.push(axis.normalize())}
  const delta=a.center.clone().sub(b.center);
  return axes.every(axis=>radius(a,axis)+radius(b,axis)-Math.abs(delta.dot(axis))>OVERLAP_EPS);
}
function translated(part,delta){
  const copy=structuredClone(part);copy.a=array(vec(part.a).add(delta));copy.b=array(vec(part.b).add(delta));
  if(Array.isArray(copy.corners)&&copy.corners.every(finite3))copy.corners=copy.corners.map(p=>array(vec(p).add(delta)));
  if([copy.a,copy.b].some(p=>p.some(n=>!Number.isFinite(n)||Math.abs(n)>100000)))throw new RangeError('La proposition dépasse les limites du projet (±100 000 mm).');
  return copy;
}

/** Une proposition complète est refusée si un emplacement est déjà occupé. */
export function betweenArrangement(parts=[],options={}){
  if(!Array.isArray(parts))throw new Error('La liste des pièces est invalide.');
  const a=parts.find(p=>p.id===options.referenceA),b=parts.find(p=>p.id===options.referenceB),data=pairData(a,b,options.workplane),measure=options.spacing??'axes',count=options.count===undefined?1:Number(options.count);
  if(!Number.isInteger(count)||count<1||count>200)throw new RangeError('Choisissez entre 1 et 200 éléments à répartir.');
  if(!['axes','faces'].includes(measure))throw new Error('Choisissez un espacement entre axes ou entre faces.');
  const existingId=options.existingId??null;
  if(existingId!==null&&(count!==1||existingId===a.id||existingId===b.id))throw new Error('Le repositionnement concerne une seule pièce, distincte des deux références.');
  const template=existingId!==null?parts.find(p=>p.id===existingId):options.template;
  const templateBox=requireBox(template,existingId!==null?'Pièce à repositionner':'Pièce à répartir'),templateAnchor=anchorOf(templateBox,data.frame.normal),templateRange=extents(templateBox,templateAnchor,data.direction);
  const interval=measure==='axes'?data.axisDistance/(count+1):(data.clearGap-count*templateRange.width)/(count+1);
  if(interval<-OVERLAP_EPS)throw new Error('Espace insuffisant : les éléments et leurs sections ne tiennent pas entre les deux références.');
  const distances=Array.from({length:count},(_,i)=>measure==='axes'?data.axisDistance*(i+1)/(count+1):data.ranges[0].max+interval-templateRange.min+i*(templateRange.width+interval));
  const before=[{distance:0,range:data.ranges[0]},...distances.map(distance=>({distance,range:templateRange})),{distance:data.axisDistance,range:data.ranges[1]}];
  const gaps=before.slice(1).map((item,i)=>item.distance+item.range.min-before[i].distance-before[i].range.max);
  if(gaps.some(gap=>gap<-OVERLAP_EPS))throw new Error('Espace insuffisant : les sections se chevaucheraient avec cet espacement entre axes.');
  const targets=distances.map(distance=>data.anchors[0].clone().lerp(data.anchors[1],distance/data.axisDistance)),proposed=targets.map(target=>translated(template,target.clone().sub(templateAnchor)));
  const excluded=new Set([a.id,b.id,...(existingId!==null?[existingId]:[])]),others=parts.filter(p=>!excluded.has(p.id)).map(timberBox).filter(Boolean),intersections=[];
  for(const [index,candidate] of proposed.entries()){
    const box=requireBox(candidate,'Proposition');
    for(const other of others)if(interiorsOverlap(box,other)){
      if(candidate.kind===other.part.kind||Math.abs(box.axes[2].dot(other.axes[2]))>1-1e-6)throw new Error(`Un élément occupe déjà cet emplacement : ${name(other.part)}. Déplacez-le ou choisissez son repositionnement ; aucune pièce existante n’a été réorganisée.`);
      intersections.push({placementIndex:index,partId:other.part.id,label:name(other.part)});
    }
  }
  const projected=[data.projected[0],...targets.map(p=>projectPoint(p,data.frame)),data.projected[1]],lines=projected.slice(1).map((point,i)=>measure==='axes'?measurementLine(projected[i],point,before[i+1].distance-before[i].distance,'axes'):measurementLine(projected[i].clone().addScaledVector(data.direction,before[i].range.max),point.clone().addScaledVector(data.direction,before[i+1].range.min),gaps[i],'faces'));
  const base=betweenMeasurements(a,b,options.workplane),messages=[measure==='axes'?'Les entraxes sont identiques ; les jeux libres dépendent des sections.':'Les jeux libres projetés sont identiques ; les entraxes peuvent différer selon les sections.'];
  if(Math.abs(data.anchors[1].clone().sub(data.anchors[0]).dot(data.frame.normal))>EPS)messages.push('Les niveaux des repères sont interpolés entre les deux références ; aucun élément n’est rabattu au sol.');
  if(template.kind==='post'&&Math.abs(vec(template.b).sub(vec(template.a)).dot(data.frame.normal))<EPS)messages.push('Le poteau est parallèle au plan : son centre sert de repère.');
  for(const item of new Map(intersections.map(hit=>[hit.partId,hit])).values())messages.push(`Intersection avec ${item.label} : adapter la longueur ou les extrémités des nouveaux éléments avant l’assemblage. La pièce transversale reste en place.`);
  return {...base,parts:proposed,placementAnchors:targets.map(array),fractions:distances.map(distance=>distance/data.axisDistance),lines,overallLines:base.lines,axisDistance:data.axisDistance,clearGap:clean(data.clearGap),interval:clean(interval),count,spacing:measure,existingId,intersections,messages};
}

const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
function hull(points){const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(sorted.length<3)return sorted;const lower=[],upper=[];for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}for(const p of [...sorted].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}return [...lower.slice(0,-1),...upper.slice(0,-1)]}

/** Petit plan d’implantation autonome ; aucun dessin de produit ni repère fabricant. */
export function betweenPreviewSVG(result,{labels=true}={}){
  if(!result||!finite3(result.u)||!finite3(result.v)||!finite3(result.origin))throw new Error('Aucune proposition exploitable à prévisualiser.');
  const origin=vec(result.origin),u=vec(result.u),v=vec(result.v),project=p=>{const d=vec(p).sub(origin);return [d.dot(u),-d.dot(v)]};
  const items=[...(result.referenceParts||[]).map((part,i)=>({part,role:'reference',label:i?'B':'A'})),...(result.parts||[]).map((part,i)=>({part,role:'proposed',label:String(i+1)}))].map(item=>({...item,box:timberBox(item.part)})).filter(item=>item.box);
  const proposedCount=(result.parts||[]).length;
  const shapes=items.map(item=>({...item,polygon:hull(item.box.corners.map(p=>project(array(p))))})),points=[...shapes.flatMap(item=>item.polygon),...(result.lines||[]).flatMap(line=>[project(line.a),project(line.b)])];
  const min=[0,1].map(i=>points.length?Math.min(...points.map(p=>p[i])):0),max=[0,1].map(i=>points.length?Math.max(...points.map(p=>p[i])):1),size=max.map((n,i)=>n-min[i]),scale=Math.min(624/Math.max(size[0],1),170/Math.max(size[1],1));
  const offset=[48+(624-size[0]*scale)/2,70+(170-size[1]*scale)/2],screen=p=>p.map((n,i)=>offset[i]+(n-min[i])*scale);
  const geometry=shapes.map(item=>{const center=screen(project(array(anchorOf(item.box,vec(result.normal)))));return `<g><title>${esc(item.label)} · ${esc(name(item.part))}</title><polygon points="${item.polygon.map(p=>screen(p).map(n=>n.toFixed(3)).join(',')).join(' ')}" fill="${item.role==='reference'?'#cad1cd':'#b6d5bd'}" stroke="${item.role==='reference'?'#63776d':'#2d7851'}" stroke-width="1.5"/>${labels&&(item.role==='reference'||proposedCount<=12||item.label==='1'||item.label===String(proposedCount))?`<text x="${center[0]}" y="${center[1]-(item.role==='proposed'&&proposedCount>12?28:12)}" text-anchor="middle" font-size="13" fill="#254d39" stroke="#fffdf8" stroke-width="3" paint-order="stroke">${esc(item.label)}</text>`:''}</g>`}).join('');
  const lines=(result.lines||[]).map((line,index)=>{const a=screen(project(line.a)),b=screen(project(line.b));return `<g><title>${esc(line.label)}</title><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#52786a" stroke-width="1" stroke-dasharray="4 3"/>${labels&&(result.lines||[]).length<=6?`<text x="${(a[0]+b[0])/2}" y="${(a[1]+b[1])/2+20+(Number.isFinite(result.count)?0:index*15)}" font-size="11" text-anchor="middle" fill="#365e4a" stroke="#fffdf8" stroke-width="3" paint-order="stroke">${fmt(line.distance)} mm</text>`:''}</g>`}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Aperçu de répartition entre deux références" viewBox="0 0 720 310" width="720" height="310"><rect width="100%" height="100%" fill="#fffdf8"/><g font-family="Arial,sans-serif"><text x="24" y="28" font-size="17" font-weight="700" fill="#254d39">Aperçu d’implantation dans le plan de travail</text><text x="24" y="49" font-size="12" fill="#61796b">${Number.isFinite(result.count)?`${result.count} élément${result.count>1?'s':''} · ${result.spacing==='faces'?'jeu libre':'entraxe'} ${fmt(result.interval)} mm`:'Mesure entre deux références'}</text>${geometry}${lines}<text x="24" y="278" font-size="12" fill="#365e4a">Entre A et B : ${fmt(result.axisDistance)} mm entre axes · ${fmt(result.clearGap)} mm entre enveloppes</text><text x="24" y="297" font-size="10" fill="#61796b">A et B restent en place. Cet aperçu montre des positions projetées, sans représenter une fixation.</text></g></svg>`;
}
