import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT, buildProject, calculateBOM, optimizeCuts } from '../src/engine.js';
import { parametricTemplates } from '../src/templates.js';
import { projectionSVG, projectedBounds, jointDetailSVG, assemblySteps, fabricationHTML, fixationSchedule, jointSheetData, jointSheetHTML, jointSheetSVG } from '../src/fabrication.js';
import { moveJointFixing, buildJointFixings } from '../src/fixings.js';
import { Window } from 'happy-dom';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≈ ${b}`);

test('plans : dimensions calculées sur les sections réelles dans les trois projections',()=>{
  const p=parametricTemplates(DEFAULT_PROJECT,'pergola',{width:4100.75,depth:3200.5,height:2500.25}),m=buildProject(p);
  const top=projectedBounds(m,'top'),front=projectedBounds(m,'front'),side=projectedBounds(m,'side');
  close(top.width,4100.75);close(top.height,3200.5);close(front.width,4100.75);close(front.height,2500.25);close(side.width,3200.5);close(side.height,2500.25);
  const foundations=projectedBounds(m,'front',{showFoundations:true});assert.ok(foundations.height>=front.height);
  for(const view of ['top','front','side']){const svg=projectionSVG(m,view);assert.ok(svg.includes('Projection orthographique'));assert.ok(!svg.includes('NaN'));assert.ok(svg.includes('data-part-id="'+p.freeParts[0].id+'"'))}
});

test('plans : enveloppe d’une pièce inclinée tournée, et mur avec son épaisseur',()=>{
  const model={parts:[{id:'wood',a:[0,0,0],b:[100,0,0],width:20,height:40,material:'wood',kind:'beam',roll:90}],joints:[]};
  const front=projectedBounds(model,'front'),top=projectedBounds(model,'top');close(front.height,20);close(top.height,40);close(top.width,100);
  const wall={parts:[{id:'wall',a:[0,0,0],b:[1000,0,0],width:200,height:2500,kind:'wall',material:'wall'}],joints:[]};close(projectedBounds(wall,'front').height,2500);close(projectedBounds(wall,'top').height,200);
});

test('dossier : toutes les pièces, achats, débit, liaisons et étapes restent présents et échappés',async()=>{
  const p=parametricTemplates(DEFAULT_PROJECT,'barn_door');p.name='<script>alert(1)</script>';
  const m=buildProject(p),bom=calculateBOM(p,m),cuts=optimizeCuts(m.parts.filter(part=>part.material==='wood'),[2400,4000],3);
  m.parts[0].label='<img src=x onerror=bad>';
  const html=fabricationHTML({project:p,model:m,bom,cuts,includeJointDetails:true});
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;img'));
  const window=new Window();window.document.write(html);
  assert.ok(window.document.querySelectorAll('svg').length>=3+m.joints.length);
  for(const part of m.parts) assert.ok(window.document.body.textContent.includes(part.id));
  for(const row of bom) assert.ok(window.document.body.textContent.includes(row.label));
  assert.ok(window.document.body.textContent.includes('Préparation du montage'));
  const steps=assemblySteps(m);assert.ok(steps.some(s=>s.title.includes('vantaux')));assert.ok(steps.every(s=>Array.isArray(s.partIds)&&Array.isArray(s.jointIds)));
  assert.ok(jointDetailSVG(m,m.joints[0].id).includes(m.joints[0].id));
  assert.ok(jointDetailSVG(m,'absent').includes('introuvable'));
  await window.happyDOM.close();
});

test('plans et dossier : scène vide exportable sans valeurs infinies',()=>{
  const m={parts:[],joints:[],warnings:[]};
  for(const view of ['top','front','side'])assert.ok(!/NaN|Infinity/.test(projectionSVG(m,view)));
  assert.ok(fabricationHTML({model:m}).includes('Aucun élément.'));
});

test('fixations manuelles et ancrages de base : positions exactes conservées dans plans et dossier',()=>{
  const p=parametricTemplates({...DEFAULT_PROJECT,foundation:'plate_mechanical',ground:'concrete'},'pergola');
  const m=buildProject(p),joint=m.joints[0],point=buildJointFixings(joint,m)[0],position=[123.456,789.012,345.678];
  joint.fixingLayout=moveJointFixing(joint,m,point.id,position);
  const schedule=fixationSchedule(m),changed=schedule.find(f=>f.id===point.id);
  for(let i=0;i<3;i++)close(changed.position[i],position[i]);
  assert.equal(changed.mode,'manual');assert.ok(schedule.some(f=>f.jointId.startsWith('BASE-')));
  assert.ok(jointDetailSVG(m,joint.id).includes(`data-fixing-id="${point.id}"`));
  const html=fabricationHTML({project:p,model:m});assert.ok(html.includes('Implantation des fixations'));assert.ok(html.includes('123 ; 789 ; 346'));
  const half=fabricationHTML({project:p,model:m,precision:.5});assert.ok(half.includes('123,5 ; 789 ; 345,5'));
  assert.ok(jointDetailSVG(m,schedule.find(f=>f.jointId.startsWith('BASE-')).jointId).includes('data-fixing-id'));
});

test('précision de présentation : les cotes changent, la géométrie SVG et les données restent exactes',()=>{
  const p=parametricTemplates(DEFAULT_PROJECT,'pergola',{width:4100.26,depth:3200.26,height:2500.26}),m=buildProject(p),before=JSON.stringify(m);
  const a=projectionSVG(m,'front',{precision:1}),b=projectionSVG(m,'front',{precision:.5});
  assert.ok(a.includes('4 100 mm'));assert.ok(b.includes('4 100,5 mm'));
  assert.deepEqual([...a.matchAll(/polygon points="([^"]+)"/g)].map(x=>x[1]),[...b.matchAll(/polygon points="([^"]+)"/g)].map(x=>x[1]));
  assert.equal(JSON.stringify(m),before);close(projectedBounds(m,'front').width,4100.26);
});

test('fiches de liaison : deux pièces nommées, quantités exactes et dossier sans effet sur achats',()=>{
  const p=parametricTemplates(DEFAULT_PROJECT,'pergola'),m=buildProject(p),j=m.joints[0],before=JSON.stringify(calculateBOM(p,m)),data=jointSheetData(m,j.id);
  assert.equal(data.status,'incomplete');assert.ok(data.missing.some(message=>message.includes('Référence')));
  assert.equal(data.parts.length,2);assert.equal(data.components.reduce((n,c)=>n+c.quantity,0),buildJointFixings(j,m).length);
  const html=jointSheetHTML(m,j.id,{precision:.5}),svg=jointSheetSVG(m,j.id,{precision:.5});
  for(const part of data.parts){assert.ok(html.includes(part.id));assert.ok(html.includes(part.label));assert.ok(svg.includes(part.label))}
  assert.ok(html.includes('Implantation des fixations'));assert.ok(svg.includes('Fiche de liaison'));assert.ok(!/NaN|Infinity/.test(svg));
  assert.equal(JSON.stringify(calculateBOM(p,m)),before);
  j.reference='Kit A';assert.equal(jointSheetData(m,j.id).status,'to-confirm');
});

test('fiche sans géométrie exploitable : quantités de recette et devis conservées',()=>{
  const p=parametricTemplates(DEFAULT_PROJECT,'pergola');p.freeJoints=p.freeJoints.slice(0,1);
  const part=p.freeParts.find(piece=>piece.id===p.freeJoints[0].aPart);part.b=[...part.a];
  const m=buildProject(p),joint=m.joints[0],data=jointSheetData(m,joint.id),bom=calculateBOM(p,m).filter(row=>row.jointIds?.includes(joint.id));
  assert.equal(data.fixings.length,0);assert.equal(data.status,'incomplete');
  assert.equal(data.components.find(c=>c.type==='connector').quantity,1);assert.equal(data.components.find(c=>c.type==='screw').quantity,8);
  assert.equal(bom.find(row=>row.id==='joint-angle').required,1);assert.equal(bom.find(row=>row.id==='joint-angle-screws').required,8);
  assert.ok(data.missing.some(message=>message.includes('Implantation indisponible')));
  assert.ok(jointSheetHTML(m,joint.id).includes('Les quantités de la recette sont conservées'));
});
