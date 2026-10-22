import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT, buildProject, calculateBOM } from '../src/engine.js';
import { parametricTemplates, templateAccessories, TEMPLATE_DEFINITIONS } from '../src/templates.js';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} ≈ ${b}`);

test('pergola : cotes hors-tout exactes et appuis intermédiaires reliés', () => {
  const p = parametricTemplates(DEFAULT_PROJECT, 'pergola', { width: 5111.5, depth: 3123.4, height: 2525.2, maxSpan: 1900, rafterSpacing: 530 });
  const m = buildProject(p), posts = p.freeParts.filter(part => part.kind === 'post');
  near(m.bounds.width, 5111.5); near(m.bounds.depth, 3123.4); near(m.bounds.height, 2525.2);
  assert.equal(posts.length, 8);
  for (const post of posts) assert.ok(m.joints.some(j => j.aPart === post.id && j.separation < 1e-7));
  const rafters = p.freeParts.filter(part => part.group === 'roof');
  for (let i=1;i<rafters.length;i++) assert.ok(rafters[i].a[0]-rafters[i-1].a[0] <= 530);
  assert.ok(m.joints.every(j => j.valid && j.separation < 1e-7));
});

test('clôture : travées entre faces et longueurs sans arrondissement de grille', () => {
  const p = parametricTemplates({...DEFAULT_PROJECT,grid:50}, 'fence', { width: 7050.75, height: 1900.25, maxSpan: 2100, fill:'mesh' });
  const m = buildProject(p), posts = p.freeParts.filter(part=>part.kind==='post'), meshes = p.freeParts.filter(part=>part.material==='mesh');
  near(m.bounds.width, 7050.75);near(m.bounds.height,1900.25);
  assert.equal(posts.length,5);assert.equal(meshes.length,4);
  for(let i=0;i<meshes.length;i++){near(meshes[i].a[0],posts[i].a[0]+posts[i].width/2);near(meshes[i].b[0],posts[i+1].a[0]-posts[i+1].width/2)}
  assert.ok(m.joints.every(j=>j.valid&&j.separation===0));
  assert.ok(calculateBOM(p,m).some(row=>row.category==='Grillage'));
});

test('portes : jeu exact entre vantaux, hors-tout, lames comptées et quincaillerie explicite', () => {
  const p=parametricTemplates(DEFAULT_PROJECT,'barn_door',{width:2450.75,height:2310.2,clearance:15.5,leaves:2}),m=buildProject(p);
  near(m.bounds.width,2450.75);near(m.bounds.height,2310.2);
  assert.equal(m.posts.length,0);
  const left=p.freeParts.filter(part=>part.groupName==='Vantail 1'&&part.label.startsWith('Lame'));
  const right=p.freeParts.filter(part=>part.groupName==='Vantail 2'&&part.label.startsWith('Lame'));
  const leftEdge=Math.max(...left.map(part=>part.a[0]+part.height/2));
  const rightEdge=Math.min(...right.map(part=>part.a[0]-part.height/2));near(rightEdge-leftEdge,15.5);
  assert.ok(p.workshop.extras.some(row=>row.id==='template-door-hinges'&&row.qty===4));
  assert.ok(calculateBOM(p,m).some(row=>row.id.includes('structural-screws')));
  assert.ok(m.joints.every(j=>j.valid));
  const sliding=parametricTemplates(DEFAULT_PROJECT,'sliding_door',{width:1801.7,height:2210.9});
  near(buildProject(sliding).bounds.width,1801.7);
  assert.ok(sliding.workshop.extras.some(row=>row.id==='template-sliding-rail'&&row.qty===1));
  assert.equal(templateAccessories(sliding,'sliding_door').find(row=>row.id==='sliding-carriages').quantity,2);
});

test('modèles : identifiants uniques, aucune mutation et valeurs invalides refusées', () => {
  const input=structuredClone(DEFAULT_PROJECT),before=JSON.stringify(input);
  for(const t of TEMPLATE_DEFINITIONS){const p=parametricTemplates(input,t.id),ids=[...p.freeParts,...p.freeJoints].map(x=>x.id);assert.equal(new Set(ids).size,ids.length);assert.equal(p.mode,'free')}
  assert.equal(JSON.stringify(input),before);
  assert.throws(()=>parametricTemplates(input,'pergola',{width:NaN}));
  assert.throws(()=>parametricTemplates(input,'pergola',{height:100}));
  assert.throws(()=>parametricTemplates(input,'fence',{maxSpan:10}));
  assert.throws(()=>parametricTemplates(input,'barn_door',{width:300}));
  assert.throws(()=>parametricTemplates(input,'missing'));
});
