/** Construction à partir des supports sélectionnés, en mm, sans mutation du projet. */
import {getPartBounds} from './placement.js';
import {objectSnapTranslationIsValid} from './object-snapping.js';

const EPS=1e-6;
const add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]),mul=(a,n)=>a.map(v=>v*n);
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0),length=a=>Math.hypot(...a),unit=a=>mul(a,1/length(a));
const middle=p=>mul(add(p.a,p.b),.5);
const low=p=>p.a[1]<=p.b[1]?p.a:p.b,high=p=>p.a[1]>=p.b[1]?p.a:p.b;
const horizontal=a=>[a[0],0,a[2]];
const points=part=>getPartBounds(part)?.corners||part.corners||[part.a,part.b];
const range=(parts,axis)=>{const values=parts.flatMap(points).map(p=>dot(p,axis));return {min:Math.min(...values),max:Math.max(...values)}};
const centerRange=r=>(r.min+r.max)/2;
const selected=(project,ids)=>[...new Set(ids)].map(id=>project.freeParts.find(p=>p.id===id)).filter(Boolean);
function fresh(template){return {...structuredClone(template),groupName:'',grouped:false,selectLinked:false,adaptation:'fixed',lengthLocked:true}}
function rowDirection(parts){
 let direction=[1,0,0],distance=0;
 const hull=postHull(parts);
 for(let i=0;i<hull.length;i++){const delta=horizontal(sub(middle(hull[(i+1)%hull.length]),middle(hull[i]))),size=length(delta);if(size>distance){distance=size;direction=unit(delta)}}
 if(distance<EPS&&parts[0]){const delta=horizontal(sub(parts[0].b,parts[0].a));if(length(delta)>EPS)direction=unit(delta)}
 if(direction[0]<-EPS||Math.abs(direction[0])<EPS&&direction[2]<0)direction=mul(direction,-1);
 return direction;
}
function postHull(posts){
 const sorted=[...posts].sort((a,b)=>middle(a)[0]-middle(b)[0]||middle(a)[2]-middle(b)[2]);
 const turn=(a,b,c)=>{const [p,q,r]=[a,b,c].map(middle);return (q[0]-p[0])*(r[2]-p[2])-(q[2]-p[2])*(r[0]-p[0])};
 const lower=[],upper=[];
 for(const p of sorted){while(lower.length>1&&turn(lower.at(-2),lower.at(-1),p)<=EPS)lower.pop();lower.push(p)}
 for(const p of [...sorted].reverse()){while(upper.length>1&&turn(upper.at(-2),upper.at(-1),p)<=EPS)upper.pop();upper.push(p)}
 return posts.length<2?posts:[...lower.slice(0,-1),...upper.slice(0,-1)];
}
function edges(posts){const hull=postHull(posts);return hull.length===2?[[hull[0],hull[1]]]:hull.map((p,i)=>[p,hull[(i+1)%hull.length]])}
function check(project,parts){
 if(project.freeParts.length+parts.length>1000)throw Error('Cette pose dépasserait la limite de 1 000 pièces.');
 for(const part of parts){
  if(![part.a,part.b,...(part.corners||[])].every(p=>p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)))throw Error('Cette pose dépasse les limites du projet (±100 000 mm).');
  if(length(sub(part.b,part.a))<EPS)throw Error('Les supports ne définissent pas une longueur exploitable.');
  if(!objectSnapTranslationIsValid([part],project.freeParts,[0,0,0]))throw Error('Cette pose chevaucherait une pièce existante. Modifiez l’écart ou choisissez d’autres supports.');
 }
 return parts;
}

/** Le nouveau poteau reprend section, hauteur, orientation et appui du poteau de bout. */
export function postBesideSelection(project,ids,template,{distance=500,measure='faces',direction='row',side=1}={}){
 const parts=selected(project,ids),posts=parts.filter(p=>p.kind==='post');
 if(!parts.length)throw Error('Sélectionnez au moins un support.');
 if(!Number.isFinite(distance)||distance<0||distance>100000||!['axes','faces'].includes(measure)||![-1,1].includes(side)||!['row','x','z'].includes(direction))throw Error('Choisissez un écart positif, une direction et une mesure valides.');
 const axis=mul(direction==='x'?[1,0,0]:direction==='z'?[0,0,1]:rowDirection(posts.length?posts:parts),side);
 const reference=[...(posts.length?posts:parts)].sort((a,b)=>dot(middle(b),axis)-dot(middle(a),axis))[0];
 let part=fresh(template),sourceId=null;
 if(posts.length){
  sourceId=reference.id;
  for(const key of ['a','b','width','height','roll','species','ground','foundation'])if(reference[key]!==undefined)part[key]=structuredClone(reference[key]);
 }else{
  const bounds=getPartBounds(reference);if(!bounds)throw Error('Choisissez un support rectangulaire pour aligner le poteau.');
  const base=Math.min(0,bounds.min[1]),top=bounds.min[1]>base+EPS?bounds.min[1]:bounds.max[1];
  part.a=[bounds.center[0],base,bounds.center[2]];part.b=[bounds.center[0],top,bounds.center[2]];
 }
 const extent=range(parts,axis),own=range([part],axis),offset=measure==='faces'?extent.max+distance-own.min:dot(middle(reference),axis)+distance-dot(middle(part),axis);
 part.a=add(part.a,mul(axis,offset));part.b=add(part.b,mul(axis,offset));
 const fmt=n=>Number(n).toLocaleString('fr-FR',{maximumFractionDigits:3});
 return {parts:check(project,[part]),sourceId,message:`Poteau aligné · section ${fmt(part.width)} × ${fmt(part.height)} mm · longueur ${fmt(length(sub(part.b,part.a)))} mm.`};
}

function beamOnPosts(template,a,b){
 const u=unit(horizontal(sub(high(b),high(a)))),span=dot(sub(high(b),high(a)),u);
 if(span<EPS)throw Error('Choisissez des poteaux à des positions distinctes.');
 const slope=(high(b)[1]-high(a)[1])/span,normal=unit([-u[0]*slope,1,-u[2]*slope]);
 const part=fresh(template),r=range([a,b],u),origin=high(a);
 const offset=(range([a,b],normal).max-dot(origin,normal)+part.height/2)/normal[1];
 const point=t=>add(add(origin,mul(u,t-dot(origin,u))),[0,(t-dot(origin,u))*slope+offset,0]);
 part.a=point(r.min);part.b=point(r.max);part.roll=0;
 return part;
}
function panel(template,corners){
 const part=fresh(template);part.corners=corners;part.a=[...corners[0]];part.b=[...corners[2]];
 if(length(sub(corners[1],corners[0]))<EPS||length(sub(corners[3],corners[0]))<EPS)throw Error('La sélection ne définit pas une surface suffisante.');
 return part;
}
function verticalSurface(template,parts,u,outward){
 const n=outward||[-u[2],0,u[0]],r=range(parts,u),y=range(parts,[0,1,0]),front=range(parts,n).max;
 const point=(x,h)=>add(add(mul(u,x),mul(n,front)),[0,h,0]);
 return panel(template,[point(r.min,y.min),point(r.max,y.min),point(r.max,y.max),point(r.min,y.max)]);
}

/** Pose immédiate sur des supports ; une rangée est couverte, un cadre reçoit ses côtés. */
export function constructionOnSelection(project,ids,type,template){
 const parts=selected(project,ids);if(!parts.length)throw Error('Sélectionnez les supports de la nouvelle pièce.');
 const posts=parts.filter(p=>p.kind==='post'),u=rowDirection(posts.length?posts:parts),v=[-u[2],0,u[0]],y=range(parts,[0,1,0]);
 let proposed=[];
 if(type==='beam'){
  if(posts.length>=2){
   proposed=edges(posts).map(([a,b])=>beamOnPosts(template,a,b));
   if(proposed.length>2){
    const main=unit(horizontal(sub(proposed[0].b,proposed[0].a)));
    proposed.sort((a,b)=>Math.abs(dot(unit(horizontal(sub(b.b,b.a))),main))-Math.abs(dot(unit(horizontal(sub(a.b,a.a))),main)));
   }
   const otherSupports=parts.filter(p=>p.kind!=='post');
   if(otherSupports.length)for(const part of proposed){
    const delta=sub(part.b,part.a),horizontalLength=length(horizontal(delta)),along=unit(horizontal(delta)),normal=unit([-along[0]*delta[1]/horizontalLength,1,-along[2]*delta[1]/horizontalLength]);
    const lift=Math.max(0,(range(otherSupports,normal).max-dot(part.a,normal)+part.height/2)/normal[1]);
    part.a[1]+=lift;part.b[1]+=lift;
   }
   // A frame uses two bearing levels at crossing corners, never overlapping timbers.
   for(let i=1;i<proposed.length;i++){
    const part=proposed[i],crossings=proposed.slice(0,i).map((p,j)=>({...p,id:`preview-${j}`})).filter(p=>!objectSnapTranslationIsValid([part],[p],[0,0,0]));
    if(crossings.length){const lift=Math.max(...crossings.map(p=>getPartBounds(p).max[1]))-getPartBounds(part).min[1];part.a[1]+=lift;part.b[1]+=lift;}
   }
  }
  else{
   const part=fresh(template),r=range(parts,u),cross=centerRange(range(parts,v)),span=Math.max(r.max-r.min,posts.length?length(sub(template.b,template.a)):0),mid=centerRange(r);
   const point=t=>add(add(mul(u,t),mul(v,cross)),[0,y.max+part.height/2,0]);
   part.a=point(mid-span/2);part.b=point(mid+span/2);part.roll=0;proposed=[part];
  }
 }else if(['mesh','woodpanel','roof'].includes(type)){
  const surface=parts.length===1&&parts[0].corners;
  if(surface){
   const a=sub(surface[1],surface[0]),b=sub(surface[3],surface[0]);let normal=unit([a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]);
   if(normal[1]<-EPS)normal=mul(normal,-1);
   proposed=[panel(template,surface.map(p=>add(p,mul(normal,1))))];
  }else if(type==='roof'){
   // The first edge gives a stable frame even on a square rotated in the scene.
   const edge=posts.length>=2?edges(posts)[0]:null,ru=edge?unit(horizontal(sub(middle(edge[1]),middle(edge[0])))):u,rv=[-ru[2],0,ru[0]],a=range(parts,ru),b=range(parts,rv);
   const point=(x,z)=>add(add(mul(ru,x),mul(rv,z)),[0,y.max,0]);
   proposed=[panel(template,[point(a.min,b.min),point(a.max,b.min),point(a.max,b.max),point(a.min,b.max)])];
  }else if(posts.length>=2){
   const perimeter=edges(posts);proposed=perimeter.map(([a,b])=>{const axis=unit(horizontal(sub(middle(b),middle(a))));return verticalSurface(template,perimeter.length===1?parts:[a,b],axis,perimeter.length>1?[axis[2],0,-axis[0]]:null)});
  }else proposed=[verticalSurface(template,parts,u)];
 }else if(type==='brace'){
  const r=range(parts,u),cross=centerRange(range(parts,v)),part=fresh(template),point=(x,h)=>add(add(mul(u,x),mul(v,cross)),[0,h,0]);
  part.a=point(r.min,y.min+part.height);part.b=point(r.max,y.max-part.height);part.roll=0;proposed=[part];
 }else if(type==='wall'){
  const part=fresh(template),r=range(parts,u),front=range(parts,v).max+part.width/2;
  const point=t=>add(add(mul(u,t),mul(v,front)),[0,y.min,0]);part.a=point(r.min);part.b=point(r.max);part.height=y.max-y.min;proposed=[part];
 }else throw Error('Ce type de pièce ne peut pas être posé sur cette sélection.');
 return {parts:check(project,proposed),message:proposed.length>1?`${proposed.length} pièces ajustées aux supports sélectionnés.`:'Pièce ajustée aux supports sélectionnés.'};
}
