import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTimberCut, cuttingParts, formatDimension, normalizeManufacturing, timberCutSheetSVG } from '../src/manufacturing.js';
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ≈ ${b}`);
const timber=(angle=45,roll=0,L=1000)=>({id:'B1',label:'Écharpe',kind:'brace',material:'wood',a:[0,0,0],b:[L*Math.cos(angle*Math.PI/180),L*Math.sin(angle*Math.PI/180),0],width:40,height:100,roll,length:L});

test('coupe 45° : axe, plans horizontaux et brut exact, sans mutation',()=>{
  const p=timber(),before=structuredClone(p),r=analyzeTimberCut(p,{a:'horizontal',b:'horizontal',allowance:10});
  assert.equal(r.status,'defined');close(r.axisLength,1000);close(r.inclinationDeg,45);close(r.azimuthDeg,0);close(r.cuts.a.angleFromSquareDeg,45);close(r.cuts.a.angleToAxisDeg,45);
  close(r.outerAxialLength,1100);close(r.blankLength,1110);assert.deepEqual(p,before);
  for(const point of r.cuts.a.points)close(point[1],p.a[1]);for(const point of r.cuts.b.points)close(point[1],p.b[1]);
  for(const edge of r.edgeLengths)close(edge,1000);
  close(r.modelBox.size[0],1100/Math.sqrt(2));close(r.modelBox.size[1],1100/Math.sqrt(2));close(r.modelBox.size[2],40);
});

test('coupe 30° : distinction inclinaison, angle de plan et surlongueur géométrique',()=>{
  const p=timber(30),horizontal=analyzeTimberCut(p,{a:'horizontal',b:'horizontal'}),vertical=analyzeTimberCut(p,{a:'vertical',b:'vertical'}),mixed=analyzeTimberCut(p,{a:'square',b:'horizontal'});
  close(horizontal.inclinationDeg,30);close(horizontal.cuts.a.angleFromSquareDeg,60);close(horizontal.outerAxialLength,1000+100*Math.sqrt(3));
  close(vertical.cuts.a.angleFromSquareDeg,30);close(vertical.outerAxialLength,1000+100/Math.sqrt(3));
  close(mixed.outerAxialLength,1000+50*Math.sqrt(3));
  for(const point of vertical.cuts.a.points)close(point[0],p.a[0]);
});

test('rotation de section : la largeur et la hauteur tournées changent les extrêmes',()=>{
  const quarter=analyzeTimberCut(timber(45,90),{a:'horizontal',b:'horizontal'}),compound=analyzeTimberCut(timber(45,45),{a:'horizontal',b:'horizontal'});
  close(quarter.outerAxialLength,1040);close(compound.outerAxialLength,1000+140/Math.sqrt(2));
  assert.ok(compound.messages.some(message=>message.includes('composée')));
});

test('parcours dans XZ : plan vertical explicite et plan transversal géométrique',()=>{
  const p=timber(30);p.b=[Math.sqrt(3)*500/Math.sqrt(2),500,Math.sqrt(3)*500/Math.sqrt(2)];
  const auto=analyzeTimberCut(p,{a:'vertical',b:'vertical'}),x=analyzeTimberCut(p,{a:'vertical-x',b:'vertical-x'});
  close(auto.azimuthDeg,45);close(auto.outerAxialLength,1000+100/Math.sqrt(3));
  assert.equal(x.status,'defined');for(const point of x.cuts.a.points)close(point[0],0);
});

test('plans manquants, parallèles ou croisés : aucun brut inventé',()=>{
  const unknown=analyzeTimberCut(timber(),{});assert.equal(unknown.status,'incomplete');assert.equal(unknown.blankLength,null);
  const parallel=analyzeTimberCut(timber(0),{a:'horizontal',b:'square'});assert.equal(parallel.status,'invalid');assert.equal(parallel.blankLength,null);assert.ok(parallel.messages.some(m=>m.includes('parallèle')));
  const crossed=analyzeTimberCut(timber(45,0,10),{a:'horizontal',b:'vertical'});assert.equal(crossed.status,'invalid');assert.equal(crossed.blankLength,null);
  const zero=timber();zero.b=[0,0,0];assert.equal(analyzeTimberCut(zero).supported,false);
});

test('débit commun : brut seulement si réalisable, conservation des données et résultat idempotent',()=>{
  const a=timber(),b={...timber(30),id:'B2'},panel={id:'P',kind:'panel',material:'wood',length:1700};
  const input=[a,b,panel],original=structuredClone(input),settings={cuts:{B1:{a:'horizontal',b:'horizontal',allowance:5}}};
  const out=cuttingParts(input,settings);close(out[0].length,1105);assert.equal(out[0].cutPreparation.status,'defined');assert.equal(out[1].length,1000);assert.equal(out[1].cutPreparation.status,'incomplete');assert.equal(out[2].length,1700);assert.deepEqual(input,original);
  assert.deepEqual(cuttingParts(out,settings),out);
});

test('arrondi de présentation uniquement et import de paramètres maîtrisé',()=>{
  assert.equal(formatDimension(123.26,1),'123');assert.equal(formatDimension(123.26,.5),'123,5');assert.equal(formatDimension(null),'—');
  const raw=JSON.parse('{"precision":0.5,"cuts":{"B1":{"a":"horizontal","b":"square","allowance":3.25},"__proto__":{"a":"square"}}}');
  const normalized=normalizeManufacturing(raw);assert.equal(normalized.precision,.5);assert.equal(normalized.cuts.B1.allowance,3.25);assert.equal(Object.hasOwn(normalized.cuts,'__proto__'),false);
  const p=timber(30),r=analyzeTimberCut(p,normalized.cuts.B1);close(r.blankLength,1000+50*Math.sqrt(3)+3.25);
  const svg=timberCutSheetSVG(p,normalized.cuts.B1,{precision:.5});assert.ok(svg.includes('demi-millimètre'));assert.ok(svg.includes('réglages d’une scie'));assert.ok(!/NaN|Infinity/.test(svg));
});
