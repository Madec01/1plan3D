import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OBJExporter} from 'three/addons/exporters/OBJExporter.js';
import {panelGeometry, timberQuaternion} from '../src/geometry.js';
import {VISUAL_FEEDBACK, createProceduralTextureData, createSurfaceTexture, createPartMaterial, createGroundMaterial, applyWoodGrainUV, setMaterialTextures, setMaterialFeedback, createFeedbackMaterial, createFocusOverlay, disposeVisualMaterial, disposeVisualObject, withCleanVisuals} from '../src/viewport-visuals.js';

test('textures : génération déterministe sans canvas, opaque et contraste discret', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  for (const kind of ['wood', 'grass', 'earth', 'concrete']) {
    const image = createProceduralTextureData(kind);
    assert.ok(image.width <= 128 && image.height <= 128);
    assert.equal(image.data.length, image.width * image.height * 4);
    assert.deepEqual(image.data, createProceduralTextureData(kind).data);
    assert.notDeepEqual(image.data, createProceduralTextureData(kind, {seed: 32}).data);
    const shades = [];
    for (let i = 0; i < image.data.length; i += 4) { assert.equal(image.data[i + 3], 255); shades.push(image.data[i]); }
    const spread = Math.max(...shades) - Math.min(...shades);
    assert.ok(spread > 4 && spread < 40, `${kind}: contraste ${spread}`);
  }
  assert.throws(() => createProceduralTextureData('photo'), /inconnue/);
  assert.equal(createProceduralTextureData('wood', {size: 100000}).width, 256);
});

test('bois : le grain varie nettement davantage en travers que dans le sens de la longueur', () => {
  const {data,width,height} = createProceduralTextureData('wood');
  let across = 0, along = 0, count = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width / 2 - 1; x++) {
    const value = data[(y * width + x) * 4];
    across += Math.abs(value - data[(y * width + x + 1) * 4]);
    along += Math.abs(value - data[((y + 1) * width + x) * 4]); count++;
  }
  assert.ok(across / count > along / count * 3, `${across/count} / ${along/count}`);
});

test('textures : matériau propriétaire, bascule sans perte de map et destruction indépendante', () => {
  const first = createPartMaterial({material:'wood',species:'douglas'}), second = createPartMaterial({material:'wood',species:'douglas'});
  const firstMap = first.map, secondMap = second.map;
  assert.ok(firstMap.isDataTexture); assert.notEqual(firstMap, secondMap); assert.notEqual(firstMap.source, secondMap.source);
  assert.equal(firstMap.colorSpace, THREE.SRGBColorSpace); assert.equal(firstMap.generateMipmaps, true);
  assert.equal(firstMap.wrapS,THREE.ClampToEdgeWrapping); assert.equal(firstMap.wrapT,THREE.RepeatWrapping);
  let firstDisposed = 0, secondDisposed = 0;
  firstMap.addEventListener('dispose',()=>firstDisposed++); secondMap.addEventListener('dispose',()=>secondDisposed++);
  setMaterialTextures(first,false); assert.equal(first.map,null); assert.equal(second.map,secondMap);
  setMaterialTextures(first,true); assert.equal(first.map,firstMap);
  setMaterialTextures(first,false); disposeVisualMaterial(first); disposeVisualMaterial(first);
  assert.equal(firstDisposed,1,'une map désactivée est aussi libérée, une seule fois'); assert.equal(secondDisposed,0); assert.equal(second.map,secondMap);
  disposeVisualMaterial(second); assert.equal(secondDisposed,1);
  const initiallyOff = createPartMaterial({material:'wood'},{textures:false});
  assert.equal(initiallyOff.map,null); setMaterialTextures(initiallyOff,true); assert.ok(initiallyOff.map.isDataTexture); disposeVisualMaterial(initiallyOff);
});

test('textures : sol herbe/terre, mur béton opaques, géométrie inchangée et maps modérées', () => {
  for (const kind of ['grass','earth','soil','concrete']) {
    const material = createGroundMaterial({kind,size:200});
    assert.equal(material.map.repeat.x,100); assert.equal(material.map.repeat.y,100); assert.equal(material.transparent,false); assert.equal(material.depthWrite,true);
    assert.equal(material.map.userData.kind,kind==='soil'?'earth':kind); disposeVisualMaterial(material);
  }
  const wall = createPartMaterial({material:'wall'}), foundation = createPartMaterial({material:'concrete'});
  for (const material of [wall,foundation]) { assert.equal(material.opacity,1); assert.equal(material.transparent,false); assert.equal(material.map.userData.kind,'concrete'); disposeVisualMaterial(material); }
});

test('UV bois : toutes les faces suivent Z local, bouts distincts, sans toucher aux coordonnées exactes', () => {
  const geometry = new THREE.BoxGeometry(.045,.095,3.227125);
  const positions = geometry.getAttribute('position').array.slice(), normals = geometry.getAttribute('normal').array.slice();
  applyWoodGrainUV(geometry,{material:'wood',kind:'beam'});
  assert.deepEqual(geometry.getAttribute('position').array,positions); assert.deepEqual(geometry.getAttribute('normal').array,normals);
  const uv = geometry.getAttribute('uv'), pos = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(normal.getZ(i)) > .5) assert.ok(uv.getX(i) > .5 && uv.getX(i) < 1,'bouts dans la moitié droite de l’atlas');
    else {
      assert.ok(uv.getX(i) < .5);
      assert.ok(Math.abs(uv.getY(i)-(pos.getZ(i)-geometry.boundingBox.min.z)/.8) < 1e-6);
    }
  }
  const part={a:[10,50,80],b:[2000,350,900],roll:37};
  const localZ=new THREE.Vector3(0,0,1).applyQuaternion(timberQuaternion(part));
  assert.ok(localZ.dot(new THREE.Vector3(...part.b).sub(new THREE.Vector3(...part.a)).normalize())>.999999);
  geometry.dispose();
});

test('UV panneau : grain le long de sa première arête, même pour un panneau oblique', () => {
  const part={material:'wood',kind:'panel',corners:[[100,300,200],[2100,800,700],[2100,1800,700],[100,1300,200]]};
  const geometry=panelGeometry(part), positions=geometry.getAttribute('position').array.slice(); applyWoodGrainUV(geometry,part);
  const uv=geometry.getAttribute('uv');
  assert.ok(Math.abs(uv.getX(0)-uv.getX(1))<1e-6); assert.ok(uv.getY(1)>uv.getY(0)+2);
  assert.ok(uv.getX(3)>uv.getX(0)+.4); assert.deepEqual(geometry.getAttribute('position').array,positions); geometry.dispose();
});

test('feedback : bleu/orange/vert opaque, marqueurs distincts et profondeur normale', () => {
  assert.notEqual(VISUAL_FEEDBACK.moving.color,VISUAL_FEEDBACK.target.color);
  assert.equal(new Set(['moving','target','contact'].map(state=>VISUAL_FEEDBACK[state].symbol)).size,3);
  for (const state of ['moving','target','contact']) {
    const material=createFeedbackMaterial(state);
    assert.equal(material.opacity,1); assert.equal(material.transparent,false); assert.equal(material.depthTest,true); assert.equal(material.depthWrite,true); assert.equal(material.wireframe,false); assert.equal(material.toneMapped,false);
    assert.equal(material.color.getHex(),VISUAL_FEEDBACK[state].color); disposeVisualMaterial(material);
  }
  const overlay=createFeedbackMaterial('target',{overlay:true}); assert.equal(overlay.depthWrite,false); assert.equal(overlay.polygonOffset,true); disposeVisualMaterial(overlay);
});

test('feedback : changement d’état réversible, sélection préexistante conservée et textures basculables pendant le geste', () => {
  const material=createPartMaterial({material:'wood'}), map=material.map;
  material.emissive.set(0x102b35); material.opacity=.83; material.transparent=true;
  const original={color:material.color.getHex(),emissive:material.emissive.getHex(),depthWrite:material.depthWrite,toneMapped:material.toneMapped};
  setMaterialFeedback(material,'moving'); assert.equal(material.color.getHex(),VISUAL_FEEDBACK.moving.color); assert.equal(material.map,null);
  setMaterialFeedback(material,'target'); setMaterialTextures(material,false); setMaterialFeedback(material,null);
  assert.equal(material.map,null); assert.equal(material.color.getHex(),original.color); assert.equal(material.emissive.getHex(),original.emissive); assert.equal(material.opacity,.83); assert.equal(material.transparent,true); assert.equal(material.depthWrite,original.depthWrite); assert.equal(material.toneMapped,original.toneMapped);
  setMaterialTextures(material,true); assert.equal(material.map,map); disposeVisualMaterial(material);
  assert.throws(()=>setMaterialFeedback(new THREE.MeshBasicMaterial(),'maybe'),/inconnu/);
});

test('feedback : contours visibles et cachés séparés par profondeur, silhouette en tirets et source jamais libérée', () => {
  const geometry=new THREE.BoxGeometry(.1,.2,3), overlay=createFocusOverlay(geometry,'contact');
  const fill=overlay.getObjectByName('feedback-fill'), visible=overlay.getObjectByName('feedback-visible'), hidden=overlay.getObjectByName('feedback-occluded'), marker=overlay.getObjectByName('feedback-marker');
  assert.notEqual(fill.geometry,geometry); assert.notEqual(visible.geometry,hidden.geometry);
  assert.equal(visible.material.depthFunc,THREE.LessEqualDepth); assert.equal(hidden.material.depthFunc,THREE.GreaterDepth); assert.equal(hidden.material.isLineDashedMaterial,true);
  assert.equal(visible.material.depthWrite,false); assert.equal(hidden.material.depthWrite,false);
  assert.ok(hidden.geometry.getAttribute('lineDistance')); assert.equal(marker.isSprite,true); assert.equal(marker.userData.symbol,'check'); assert.match(marker.userData.label,/Accrochage/);
  assert.equal(marker.material.map.isDataTexture,true);
  overlay.traverse(object=>{assert.equal(object.userData.excludeFromExport,true);assert.equal(object.userData.previewOnly,true);assert.equal(object.raycast(),undefined);});
  let sourceDisposed=0, mapDisposed=0; geometry.addEventListener('dispose',()=>sourceDisposed++); marker.material.map.addEventListener('dispose',()=>mapDisposed++);
  disposeVisualObject(overlay); assert.equal(sourceDisposed,0); assert.equal(mapDisposed,1); geometry.dispose();
});

test('export : repères retirés aussi du OBJ, couleur d’origine exportée et scène restaurée après erreur', () => {
  const scene=new THREE.Scene(), material=createPartMaterial({material:'wood'}), mesh=new THREE.Mesh(new THREE.BoxGeometry(.1,.2,2),material); mesh.name='bois'; scene.add(mesh);
  const original=material.color.getHex(), first=createFocusOverlay(mesh.geometry,'moving'), second=createFocusOverlay(mesh.geometry,'target'); scene.add(first,second);
  const order=[...scene.children]; setMaterialFeedback(material,'moving');
  const result=withCleanVisuals(scene,()=>{
    assert.equal(first.parent,null); assert.equal(second.parent,null); assert.equal(material.color.getHex(),original);
    return new OBJExporter().parse(scene);
  });
  assert.match(result,/o bois/); assert.doesNotMatch(result,/feedback/); assert.equal((result.match(/^v /gm)||[]).length,24);
  assert.deepEqual(scene.children,order); assert.equal(material.color.getHex(),VISUAL_FEEDBACK.moving.color);
  assert.throws(()=>withCleanVisuals(scene,()=>{throw new Error('Export échoué');}),/échoué/);
  assert.deepEqual(scene.children,order); assert.equal(first.visible,true); assert.equal(second.visible,true); assert.equal(material.color.getHex(),VISUAL_FEEDBACK.moving.color);
  disposeVisualObject(scene);
});

test('disposal : map étrangère partagée conservée, map propriétaire déjà détruite sans double libération', () => {
  const shared=createSurfaceTexture('concrete'), a=new THREE.MeshStandardMaterial({map:shared}), b=new THREE.MeshStandardMaterial({map:shared});
  let sharedDisposals=0; shared.addEventListener('dispose',()=>sharedDisposals++);
  setMaterialFeedback(a,'hover'); setMaterialFeedback(a,null); disposeVisualMaterial(a); assert.equal(sharedDisposals,0); assert.equal(b.map,shared);
  b.dispose(); shared.dispose(); assert.equal(sharedDisposals,1);
  const owned=createPartMaterial({material:'wood'}), map=owned.map; let disposals=0; map.addEventListener('dispose',()=>disposals++); map.dispose(); disposeVisualMaterial(owned); assert.equal(disposals,1);
});
