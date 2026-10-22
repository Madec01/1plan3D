import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {timberQuaternion} from '../src/geometry.js';
import { betweenArrangement, betweenMeasurements, betweenPreviewSVG } from '../src/between-placement.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≈ ${b}`);
const pointNear=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
const post=(id,x,z=0,{section=100,height=2000,base=0,roll=0}={})=>({id,label:`Poteau ${id}`,kind:'post',material:'wood',a:[x,base,z],b:[x,base+height,z],width:section,height:section,roll,group:'structure'});
const options=(a,b,template,extra={})=>({referenceA:a.id,referenceB:b.id,template,...extra});

test('deux poteaux séparés de 3 000 mm : un milieu et trois intervalles exacts sans mutation',()=>{
  const a=post('A',0),b=post('B',3000),input=[a,b],original=structuredClone(input);
  const one=betweenArrangement(input,options(a,b,a));near(one.axisDistance,3000);near(one.clearGap,2900);near(one.interval,1500);pointNear(one.parts[0].a,[1500,0,0]);assert.equal(one.lines.length,2);
  const three=betweenArrangement(input,options(a,b,a,{count:3}));assert.deepEqual(three.parts.map(p=>p.a[0]),[750,1500,2250]);assert.equal(three.lines.length,4);assert.ok(three.lines.every(line=>line.distance===750));
  assert.deepEqual(input,original);assert.notEqual(one.parts[0],a);one.parts[0].a[0]=1;assert.equal(a.a[0],0);
});

test('jeux libres égaux entre sections différentes, entraxes variables',()=>{
  const a=post('A',0,0,{section:100}),b=post('B',3700,0,{section:200});
  const one=betweenArrangement([a,b],options(a,b,a,{spacing:'faces'}));near(one.parts[0].a[0],1825);near(one.interval,1725);assert.ok(one.lines.every(line=>Math.abs(line.distance-1725)<1e-7));
  const three=betweenArrangement([a,b],options(a,b,a,{spacing:'faces',count:3}));near(three.interval,812.5);assert.deepEqual(three.parts.map(p=>p.a[0]),[912.5,1825,2737.5]);assert.ok(three.lines.every(line=>Math.abs(line.distance-812.5)<1e-7));
  const axes=betweenArrangement([a,b],options(a,b,a,{count:3}));assert.deepEqual(axes.parts.map(p=>p.a[0]),[925,1850,2775]);
});

test('niveau des pieds interpolé et hauteur du template conservée, extrémités inversées',()=>{
  const a=post('A',0,0,{base:100,height:1700}),b=post('B',3000,0,{base:500,height:3100}),template=post('T',9000,0,{base:725,height:1234});
  const r=betweenArrangement([a,b],options(a,b,template));pointNear(r.parts[0].a,[1500,300,0]);pointNear(r.parts[0].b,[1500,1534,0]);near(r.axisDistance,3000);near(r.interval,1500);
  const inverted={...template,a:[...template.b],b:[...template.a]},again=betweenArrangement([a,b],options(a,b,inverted));pointNear(again.parts[0].b,[1500,300,0]);pointNear(again.parts[0].a,[1500,1534,0]);
  assert.ok(r.messages.some(m=>m.includes('interpolés')));
});

test('implantation diagonale et références inversées conservent les mêmes positions physiques',()=>{
  const a=post('A',0),b=post('B',3000,4000,{section:200}),template=post('T',0,0,{section:80,roll:30});
  const r=betweenArrangement([a,b],options(a,b,template,{count:3,spacing:'faces'})),reverse=betweenArrangement([a,b],options(b,a,template,{count:3,spacing:'faces'}));
  near(r.axisDistance,5000);near(r.interval,reverse.interval);
  r.parts.forEach((p,i)=>{pointNear(p.a,reverse.parts[2-i].a);near(p.a[2]/p.a[0],4/3);assert.equal(p.roll,30)});
  assert.ok(r.lines.every(line=>Math.abs(line.distance-r.interval)<1e-7));
});

test('plan personnalisé : repère de pied selon sa normale et dénivelé normal conservé',()=>{
  const a={...post('A',0),a:[0,0,100],b:[0,0,900]},b={...post('B',0),a:[2400,0,300],b:[2400,0,1700]},template={...post('T',0),a:[-500,20,60],b:[-500,20,760]};
  const plane={type:'face',origin:[0,0,0],normal:[0,0,1],u:[1,0,0]};
  const r=betweenArrangement([a,b],options(a,b,template,{workplane:plane}));pointNear(r.parts[0].a,[1200,0,200]);pointNear(r.parts[0].b,[1200,0,900]);near(r.axisDistance,2400);near(r.parts[0].b[2]-r.parts[0].a[2],700);
  assert.ok(r.lines.every(line=>line.a[2]===0&&line.b[2]===0));
});

test('rotation arbitraire du projet et du plan : placement et jeux invariants',()=>{
  const a=post('A',0,0,{section:90,base:100}),b=post('B',3000,0,{section:160,base:300}),template={...post('T',7000),width:45,height:95,roll:23};
  const original=betweenArrangement([a,b],options(a,b,template,{count:3,spacing:'faces'}));
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,2,3).normalize(),.72),rotatePoint=p=>new THREE.Vector3(...p).applyQuaternion(q).toArray();
  const rotatePart=part=>{const result={...part,a:rotatePoint(part.a),b:rotatePoint(part.b),roll:0},desired=q.clone().multiply(timberQuaternion(part)),relative=timberQuaternion(result).invert().multiply(desired);result.roll=2*Math.atan2(relative.z,relative.w)*180/Math.PI;return result};
  const ar=rotatePart(a),br=rotatePart(b),tr=rotatePart(template),plane={type:'face',origin:[0,0,0],normal:rotatePoint([0,1,0]),u:rotatePoint([1,0,0])};
  const rotated=betweenArrangement([ar,br],options(ar,br,tr,{count:3,spacing:'faces',workplane:plane}));
  near(rotated.axisDistance,original.axisDistance);near(rotated.clearGap,original.clearGap);near(rotated.interval,original.interval);rotated.parts.forEach((part,i)=>{pointNear(part.a,rotatePoint(original.parts[i].a));pointNear(part.b,rotatePoint(original.parts[i].b))});
});

test('bois autres que poteaux : interpolation des centres et conservation orientation/section',()=>{
  const a={...post('A',0),kind:'beam',a:[0,1000,-500],b:[0,1000,500]},b={...a,id:'B',a:[3000,1400,-200],b:[3000,1400,800]},template={...a,id:'T',a:[4000,200,100],b:[4300,600,600],roll:37,width:47,height:121};
  const r=betweenArrangement([a,b],options(a,b,template)),part=r.parts[0];
  pointNear(part.a.map((n,i)=>(n+part.b[i])/2),[1500,1200,150]);pointNear(part.b.map((n,i)=>n-part.a[i]),template.b.map((n,i)=>n-template.a[i]));assert.equal(part.roll,37);assert.equal(part.width,47);assert.equal(part.height,121);
});

test('section rectangulaire tournée : mesure des enveloppes réellement projetées',()=>{
  const a={...post('A',0),width:40,height:100,roll:90},b={...post('B',1000),width:80,height:200,roll:90};
  const r=betweenMeasurements(a,b);near(r.axisDistance,1000);near(r.clearGap,940);
  const diagonal=betweenMeasurements({...a,roll:45},{...b,roll:45});near(diagonal.clearGap,1000-(40+100+80+200)/(2*Math.sqrt(2)));
});

test('élément intermédiaire déjà présent : refus explicite, ou repositionnement unique autorisé',()=>{
  const a=post('A',0),b=post('B',3000),middle=post('M',1500),input=[a,b,middle],original=structuredClone(input);
  assert.throws(()=>betweenArrangement(input,options(a,b,a)),/élément occupe déjà cet emplacement/);
  const move=betweenArrangement(input,options(a,b,{...a,height:50},{existingId:'M'}));pointNear(move.parts[0].a,middle.a);assert.equal(move.parts[0].height,middle.height);assert.equal(move.parts[0].id,'M');
  assert.throws(()=>betweenArrangement(input,options(a,b,a,{existingId:'M',count:2})),/une seule pièce/);
  assert.throws(()=>betweenArrangement(input,options(a,b,a,{existingId:'A'})),/distincte/);assert.deepEqual(input,original);
});

test('collision OBB : une simple proximité hors de la ligne ne bloque pas le placement',()=>{
  const a=post('A',0),b=post('B',3000),off=post('M',1500,101),touch=post('TOUCH',1500,100),overlap=post('HIT',1500,99.5);
  assert.doesNotThrow(()=>betweenArrangement([a,b,off],options(a,b,a)));assert.doesNotThrow(()=>betweenArrangement([a,b,touch],options(a,b,a)));assert.throws(()=>betweenArrangement([a,b,overlap],options(a,b,a)),/occupe déjà/);
  const overhead={...post('HIGH',1500),a:[1500,2100,0],b:[1500,3000,0]};assert.doesNotThrow(()=>betweenArrangement([a,b,overhead],options(a,b,a)));
});

test('poteau sous une traverse existante : proposition conservée avec intersection à adapter',()=>{
  const a=post('A',0),b=post('B',3000),beam={id:'TR',label:'Traverse haute',material:'wood',kind:'beam',a:[50,1965,0],b:[2950,1965,0],width:45,height:70,roll:0},input=[a,b,beam],before=structuredClone(input);
  const r=betweenArrangement(input,options(a,b,a));pointNear(r.parts[0].a,[1500,0,0]);assert.ok(r.messages.some(message=>message.includes('Intersection avec Traverse haute')&&message.includes('adapter')));assert.equal(r.intersections[0].partId,'TR');assert.deepEqual(input,before);
  assert.throws(()=>betweenArrangement([...input,post('M',1500)],options(a,b,a)),/occupe déjà/);
  const parallel={...post('BEAM',1500),kind:'beam'};assert.throws(()=>betweenArrangement([...input,parallel],options(a,b,a)),/occupe déjà/);
});

test('espace insuffisant et références invalides sont refusés avant création',()=>{
  const a=post('A',0),b=post('B',180);
  assert.throws(()=>betweenArrangement([a,b],options(a,b,a,{spacing:'faces'})),/Espace insuffisant/);
  assert.throws(()=>betweenArrangement([a,b],options(a,b,a,{spacing:'axes'})),/Espace insuffisant/);
  assert.throws(()=>betweenMeasurements(a,{...b,id:'C',a:[0,300,0],b:[0,2000,0]}),/plan de travail/);
  assert.throws(()=>betweenMeasurements(a,a),/distinctes/);
  assert.throws(()=>betweenArrangement([a,b],options(a,b,a,{count:0})),/1 et 200/);
  assert.throws(()=>betweenMeasurements({...a,material:'wall'},b),/bois rectangulaire/);
});

test('géométrie précise non arrondie et SVG léger autonome échappé',()=>{
  const a=post('A',.123),b=post('B',3000.789);a.label='<script>bad</script>';
  const r=betweenArrangement([a,b],options(a,b,a,{count:2}));near(r.parts[0].a[0],.123+(3000.789-.123)/3);near(r.parts[1].a[0],.123+2*(3000.789-.123)/3);
  const svg=betweenPreviewSVG(r);assert.ok(svg.includes('Aperçu d’implantation'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(!/NaN|Infinity/.test(svg));assert.ok(svg.includes('viewBox="0 0 720 310"'));
  assert.ok(betweenPreviewSVG(betweenMeasurements(a,b)).includes('Mesure entre deux références'));
});
