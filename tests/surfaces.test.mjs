import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import pack from '../assets/textures/pack.json' with {type:'json'};
import sources from '../assets/textures/sources.json' with {type:'json'};
import {normalizeProject,buildProject,calculateBOM,duplicateParts,removeParts,convertToFree} from '../src/engine.js';
import {SURFACE_FINISHES,normalizeAppearance,normalizeSurface,surfaceForPart,applySurfaceToSelection} from '../src/surface-catalog.js';
import {applySurfaceUV,assignTimberEndGrain} from '../src/surface-uv.js';
import {createPartMaterial,setMaterialFeedback,setMaterialTextures,disposeVisualMaterial} from '../src/viewport-visuals.js';
import {panelGeometry} from '../src/geometry.js';

const beam={id:'B',kind:'beam',material:'wood',a:[0,1500,0],b:[3000,1500,0],width:90,height:145};
const wall={id:'W',kind:'wall',material:'wall',a:[0,0,200],b:[4000,0,200],width:200,height:2400,wallSupport:'concrete'};

test('apparences : import borné, identifiants sûrs et anciennes sauvegardes compatibles',()=>{
 const p=normalizeProject({mode:'free',freeParts:[beam,wall]});
 assert.equal(p.appearance.mode,'realistic');assert.equal(surfaceForPart(p.freeParts[0],p).finish,'wood-raw');
 const input=JSON.parse('{"parts":{"__proto__":{"finish":"block"},"B":{"finish":"wood-stained","scale":99,"rotation":999,"tint":"<script>"}},"mode":"other","quality":"huge"}');
 const n=normalizeAppearance(input);assert.equal(Object.hasOwn(n.parts,'__proto__'),false);assert.equal(n.parts.B.scale,4);assert.equal(n.parts.B.rotation,360);assert.equal(n.parts.B.tint,'#ffffff');
 assert.deepEqual(normalizeAppearance(n),n);
 assert.equal(normalizeSurface({finish:'block',scale:NaN},'wood').finish,'wood-raw');
});

test('apparences : sauvegarde, copie, suppression et nomenclature indépendantes du rendu',()=>{
 let p=normalizeProject({mode:'free',freeParts:[beam,wall]});const before=calculateBOM(p),geometry=buildProject(p).parts;
 applySurfaceToSelection(p,geometry,['W'],{finish:'block',scale:2,rotation:90,tint:'#f0f0f0'});
 applySurfaceToSelection(p,geometry,['B'],{finish:'wood-stained',scale:.5});
 p=normalizeProject(JSON.parse(JSON.stringify(p)));
 assert.deepEqual(calculateBOM(p),before);assert.deepEqual(buildProject(p).parts,geometry);assert.equal(p.freeParts[1].wallSupport,'concrete');
 const copied=duplicateParts(p,['B'],[300,0,0]),id=copied.freeParts.at(-1).id;
 assert.deepEqual(copied.appearance.parts[id],p.appearance.parts.B);assert.notEqual(copied.appearance.parts[id],copied.appearance.parts.B);
 assert.equal(removeParts(copied,[id]).appearance.parts[id],undefined);
 assert.throws(()=>applySurfaceToSelection(p,geometry,['B','W'],{finish:'block'}),/compatibles/);
 const param=normalizeProject({}),part=buildProject(param).parts.find(p=>p.material==='wood');
 applySurfaceToSelection(param,buildProject(param).parts,[part.id],{finish:'wood-weathered'});
 assert.equal(surfaceForPart(convertToFree(param).freeParts.find(p=>p.id===part.id),convertToFree(param)).finish,'wood-weathered');
});

test('UV : blocs à échelle fixe après agrandissement et rotation sans changer la géométrie',()=>{
 const small=new THREE.BoxGeometry(3,2.4,.2),large=new THREE.BoxGeometry(6,2.4,.2);
 for(const geometry of [small,large]){
  const positions=geometry.attributes.position.array.slice(),normals=geometry.attributes.normal.array.slice();
  applySurfaceUV(geometry,wall,{finish:'block',scale:1,rotation:0});
  const uv=geometry.attributes.uv,pos=geometry.attributes.position,n=geometry.attributes.normal;
  for(let i=0;i<pos.count;i++)if(Math.abs(n.getZ(i))>.5){assert.ok(Math.abs(uv.getX(i)-pos.getX(i)/1.5)<1e-6);assert.ok(Math.abs(uv.getY(i)-pos.getY(i)/1.5)<1e-6);}
  assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.attributes.normal.array,normals);
  applySurfaceUV(geometry,wall,{finish:'block',scale:2,rotation:90});
  for(let i=0;i<pos.count;i++)if(Math.abs(n.getZ(i))>.5)assert.ok(Math.abs(geometry.attributes.uv.getX(i)+pos.getY(i)/3)<1e-6);
  geometry.dispose();
 }
});

test('UV bois : grain dans la longueur, bouts séparés et panneau oblique',()=>{
 const geometry=assignTimberEndGrain(new THREE.BoxGeometry(.09,.145,3));
 applySurfaceUV(geometry,beam,{finish:'wood-raw'});
 const pos=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
 for(let i=0;i<pos.count;i++){
  if(Math.abs(n.getZ(i))>.5)assert.ok(uv.getX(i)>.5&&uv.getX(i)<1);
  else assert.ok(Math.abs(uv.getX(i)-pos.getZ(i))<1e-6);
 }
 assert.equal(geometry.groups.filter(g=>g.materialIndex===1).length,2);
 const panel={kind:'panel',material:'wood',corners:[[100,300,200],[2100,800,700],[2100,1800,700],[100,1300,200]]},g=panelGeometry(panel);
 applySurfaceUV(g,panel,{finish:'wood-raw'});
 assert.ok(g.attributes.uv.getX(1)>2);assert.ok(Math.abs(g.attributes.uv.getY(1))<1e-6);assert.ok(g.attributes.uv.getY(3)>.9);
 geometry.dispose();g.dispose();
});

test('PBR : maps partagées, espaces de couleur, libération au dernier utilisateur',()=>{
 const appearance=normalizeSurface({finish:'wood-raw'},'wood');
 const a=createPartMaterial(beam,{appearance}),b=createPartMaterial(beam,{appearance});
 assert.equal(a.map,b.map);assert.equal(a.normalMap,b.normalMap);assert.equal(a.roughnessMap,b.roughnessMap);
 assert.equal(a.map.colorSpace,THREE.SRGBColorSpace);assert.equal(a.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(a.roughnessMap.colorSpace,THREE.NoColorSpace);
 assert.equal(a.displacementMap,null);
 const maps=[a.map,a.normalMap,a.roughnessMap],disposed=[0,0,0];maps.forEach((m,i)=>m.addEventListener('dispose',()=>disposed[i]++));
 disposeVisualMaterial(a);assert.deepEqual(disposed,[0,0,0]);setMaterialTextures(b,false);disposeVisualMaterial(b);disposeVisualMaterial(b);assert.deepEqual(disposed,[1,1,1]);
});

test('PBR : schéma, qualité légère et repérage retirent aussi normales et rugosité',()=>{
 const appearance=normalizeSurface({finish:'wood-stained',tint:'#aabbcc'},'wood'),m=createPartMaterial(beam,{appearance});
 const maps=[m.map,m.normalMap,m.roughnessMap],color=m.color.clone();
 setMaterialTextures(m,false);assert.deepEqual([m.map,m.normalMap,m.roughnessMap],[null,null,null]);assert.notEqual(m.color.getHex(),color.getHex());
 setMaterialFeedback(m,'moving');setMaterialTextures(m,true);assert.equal(m.normalMap,null);setMaterialFeedback(m,null);
 assert.deepEqual([m.map,m.normalMap,m.roughnessMap],maps);assert.equal(m.color.getHex(),color.getHex());
 const light=createPartMaterial(beam,{appearance,quality:'light'});assert.equal(light.map,m.map);assert.equal(light.normalMap,null);assert.equal(light.roughnessMap,null);
 const cap=createPartMaterial(beam,{appearance,endGrain:true}),plainCap=createPartMaterial(beam,{appearance:normalizeSurface({finish:'wood-raw'},'wood'),endGrain:true});
 assert.equal(cap.map.isDataTexture,true);assert.notEqual(cap.color.getHex(),plainCap.color.getHex());
 const capColor=cap.color.getHex();setMaterialTextures(cap,false);assert.notEqual(cap.color.getHex(),capColor);setMaterialTextures(cap,true);assert.equal(cap.color.getHex(),capColor);
 disposeVisualMaterial(m);disposeVisualMaterial(light);disposeVisualMaterial(cap);disposeVisualMaterial(plainCap);
});

test('pack hors connexion : chaque finition référence trois JPEG embarqués et une provenance CC0',()=>{
 assert.equal(SURFACE_FINISHES.length,12);
 for(const finish of SURFACE_FINISHES){
  const data=pack[finish.asset],source=sources[finish.asset];assert.equal(source.license,'CC0-1.0');assert.match(source.source,/^https:\/\//);
  for(const kind of ['color','normal','roughness']){
   assert.match(data[kind],/^data:image\/jpeg;base64,/);const bytes=Buffer.from(data[kind].split(',')[1],'base64');
   assert.equal(bytes.readUInt16BE(0),0xffd8);assert.equal(bytes.readUInt16BE(bytes.length-2),0xffd9);
   assert.match(source.maps[kind].sha256,/^[a-f0-9]{64}$/);assert.match(source.maps[kind].url,/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//);
  }
 }
 assert.ok(Buffer.byteLength(JSON.stringify(pack))<1.5*1024*1024);
});
