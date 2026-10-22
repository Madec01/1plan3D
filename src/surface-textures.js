import * as THREE from 'three';
import pack from '../assets/textures/pack.json' with {type:'json'};
import {getFinish} from './surface-catalog.js';

// Decoded images are immutable and shared. GPU maps are reference counted so
// deleting one piece cannot invalidate another piece using the same finish.
const images=new Map(),textures=new Map();
function imageSource(url){
  if(!images.has(url)){
    const promise=new Promise((resolve,reject)=>{
      const image=new globalThis.Image();
      image.onload=()=>resolve(new THREE.Source(image));
      image.onerror=()=>reject(new Error('Une texture embarquée est illisible. Rechargez l’application.'));
      image.src=url;
    });
    promise.catch(()=>{});images.set(url,promise);
  }
  return images.get(url);
}
function acquire(asset,kind){
  const key=`${asset}:${kind}`;
  if(!textures.has(key)){
    const texture=new THREE.Texture();
    texture.name=`Atelier photo · ${key}`;
    texture.colorSpace=kind==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=4;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.userData={atelierPhotoTexture:true,asset,kind};
    const record={texture,refs:0,ready:Promise.resolve()};
    // Three/DOM unit tests do not decode images. Real browsers always have Image.
    if(typeof globalThis.Image==='function')record.ready=imageSource(pack[asset][kind]).then(source=>{texture.source=source;texture.needsUpdate=true;});
    record.ready.catch(()=>{});textures.set(key,record);
  }
  const record=textures.get(key);record.refs++;
  return {texture:record.texture,release(){if(--record.refs===0){record.texture.dispose();textures.delete(key);}}};
}
export function surfaceThumbnail(finishId){return pack[getFinish(finishId)?.asset]?.color||'';}
export function surfaceEndColor(appearance){
  const finish=getFinish(appearance.finish);
  return new THREE.Color(pack[finish.asset].averageColor).multiply(new THREE.Color(finish.tint||'#ffffff')).multiply(new THREE.Color(appearance.tint||'#ffffff'));
}
export function waitForSurfaceTextures(){return Promise.all([...textures.values()].map(record=>record.ready));}
export function createPhotoMaterial(appearance,{quality='standard',side=THREE.FrontSide,schematicColor=0xc5c4bc}={}){
  const finish=getFinish(appearance.finish);
  if(!finish||!pack[finish.asset])throw new TypeError('Finition photographique inconnue.');
  const color=acquire(finish.asset,'color'),normal=quality==='light'?null:acquire(finish.asset,'normal'),roughness=quality==='light'?null:acquire(finish.asset,'roughness');
  const material=new THREE.MeshStandardMaterial({
    color:new THREE.Color(finish.tint||'#ffffff').multiply(new THREE.Color(appearance.tint||'#ffffff')),
    map:color.texture,normalMap:normal?.texture||null,roughnessMap:roughness?.texture||null,
    normalScale:new THREE.Vector2(.65,.65),roughness:finish.roughness,metalness:0,side
  });
  material.userData.surfaceFinish=finish.id;material.userData.schematicColor=schematicColor;
  let disposed=false;
  material.addEventListener('dispose',()=>{if(disposed)return;disposed=true;for(const entry of [color,normal,roughness])entry?.release();});
  return material;
}
