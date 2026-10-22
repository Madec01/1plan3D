import * as THREE from 'three';

// No DOM, canvas or network is needed. The material owns its GPU textures; only
// immutable pixel templates are shared between pieces.
const TAU = Math.PI * 2;
const pixelTemplates = new Map();
const resources = new WeakMap();
const disposedTextures = new WeakSet();
const disposedMaterials = new WeakSet();
export const VISUAL_FEEDBACK = Object.freeze({
  moving: Object.freeze({color: 0x1976d2, outline: 0x123f78, label: 'Pièce à déplacer', symbol: 'arrow'}),
  target: Object.freeze({color: 0xd88018, outline: 0x784307, label: 'Cible de l’accrochage', symbol: 'diamond'}),
  contact: Object.freeze({color: 0x258049, outline: 0x123f2c, label: 'Accrochage appliqué', symbol: 'check'}),
  selected: Object.freeze({color: 0x386d48, outline: 0x21452c, label: 'Pièce sélectionnée', symbol: 'square'}),
  hover: Object.freeze({color: 0x657c8a, outline: 0x304957, label: 'Pièce visée', symbol: 'circle'})
});
const woodColors = {pin: 0xc8a878, douglas: 0xc79968, chene: 0xb5a17c, meleze: 0xc1946c, other: 0xc3b29b};
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = value => value * value * (3 - 2 * value);
function hash(x, y, seed) {
  let n = Math.imul(x + 0x9e37, 374761393) ^ Math.imul(y + seed * 31, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(u, v, count, seed) {
  const x = u * count, y = v * count, ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const at = (a, b) => hash(((a % count) + count) % count, ((b % count) + count) % count, seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), fx), THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), fx), fy);
}

/** Wood is a two-column atlas: longitudinal grain on the left, end grain on
 * the right. All other maps are small, seamless, low-contrast grayscale tiles.
 * Returned data is newly allocated and safe for callers to inspect or change.
 */
export function createProceduralTextureData(kind = 'wood', {size = 64, seed = 19} = {}) {
  if (!['wood', 'grass', 'earth', 'concrete'].includes(kind)) throw new TypeError('Texture inconnue.');
  size = clamp(Math.round(Number(size) || 64), 16, 128);
  seed = Number(seed) | 0;
  const width = kind === 'wood' ? size * 2 : size, height = kind === 'wood' ? size * 2 : size;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + .5) / width, v = (y + .5) / height;
    let shade;
    if (kind === 'wood') {
      if (u < .5) {
        const across = u * 2;
        const warp = .018 * Math.sin(TAU * v) + .007 * Math.sin(TAU * (v * 2 + across));
        const broad = Math.sin(TAU * (across * 5 + warp));
        const fibre = Math.pow(.5 + .5 * Math.sin(TAU * (across * 23 + warp * 2)), 10);
        shade = 246 + broad * 5 - fibre * 19 + (noise(across, v, 8, seed) - .5) * 3;
      } else {
        const dx = (u - .75) * 4, dy = (v - .5) * 2;
        const radius = Math.sqrt(dx * dx + dy * dy) + .018 * Math.sin(TAU * dx);
        shade = 242 + 6 * Math.sin(radius * 45) + (noise(u, v, 8, seed) - .5) * 3;
      }
    } else {
      const broad = noise(u, v, 4, seed) - .5, fine = noise(u, v, 16, seed + 7) - .5;
      shade = kind === 'grass' ? 242 + broad * 15 + fine * 8 : kind === 'earth' ? 240 + broad * 16 + fine * 6 : 246 + broad * 8 + fine * 5;
    }
    const i = (y * width + x) * 4, value = clamp(Math.round(shade), 0, 255);
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  return {data, width, height};
}

function dataTexture(image, name) {
  const texture = new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name; texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  texture.addEventListener('dispose', () => disposedTextures.add(texture));
  return texture;
}
export function createSurfaceTexture(kind = 'wood', {repeat = [1, 1], size = 64, seed = 19} = {}) {
  const key = `${kind}:${size}:${seed}`;
  if (!pixelTemplates.has(key)) pixelTemplates.set(key, createProceduralTextureData(kind, {size, seed}));
  const texture = dataTexture(pixelTemplates.get(key), `Atelier · ${kind}`);
  texture.wrapS = kind === 'wood' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(.001, Number(repeat[0]) || 1), Math.max(.001, Number(repeat[1]) || 1));
  texture.userData = {atelierTexture: true, kind};
  return texture;
}
function disposeTexture(texture) { if (texture && !disposedTextures.has(texture)) texture.dispose(); }
function snapshot(material) {
  return {color: material.color?.clone(), emissive: material.emissive?.clone(), opacity: material.opacity, transparent: material.transparent, depthTest: material.depthTest, depthWrite: material.depthWrite, toneMapped: material.toneMapped, wireframe: material.wireframe, map: material.map};
}
function trackMaterial(material, texture = null, enabled = true) {
  const record = {owned: new Set(texture ? [texture] : []), original: snapshot(material), texture: texture || material.map, textures: enabled, feedback: null};
  resources.set(material, record);
  material.userData.atelierVisualMaterial = true;
  material.addEventListener('dispose', () => { for (const map of record.owned) disposeTexture(map); record.owned.clear(); disposedMaterials.add(material); });
  if (!enabled) material.map = null;
  return material;
}

export function createPartMaterial(part = {}, {species, textures = true} = {}) {
  const type = part.material || (part.kind === 'wall' ? 'wall' : 'wood');
  const textureKind = type === 'wood' ? 'wood' : ['wall', 'concrete'].includes(type) ? 'concrete' : null;
  const color = type === 'wood' ? woodColors[part.species || species] || woodColors.pin : type === 'wall' ? 0xc5c4bc : type === 'concrete' ? 0xb6bab1 : type === 'metal' ? 0x929da2 : type === 'roof' ? 0x77846f : 0xc4c7be;
  const map = textureKind ? createSurfaceTexture(textureKind) : null;
  const material = new THREE.MeshStandardMaterial({color, map, roughness: type === 'metal' ? .48 : type === 'wood' ? .88 : 1, metalness: type === 'metal' ? .5 : 0, side: part.kind === 'panel' || part.corners ? THREE.DoubleSide : THREE.FrontSide, transparent: false, opacity: 1, depthWrite: true});
  material.userData.surface = type;
  return trackMaterial(material, map, textures);
}
export function createGroundMaterial({textures = true, kind = 'grass', size = 200} = {}) {
  kind = ['earth', 'soil'].includes(kind) ? 'earth' : ['concrete', 'pavers'].includes(kind) ? 'concrete' : 'grass';
  const repeat = clamp(Number(size) || 200, .1, 1000) / 2;
  const map = createSurfaceTexture(kind, {repeat: [repeat, repeat]});
  const material = new THREE.MeshStandardMaterial({color: kind === 'grass' ? 0xdce2ce : kind === 'earth' ? 0xd8cbb4 : 0xd9dad4, map, roughness: 1});
  return trackMaterial(material, map, textures);
}

/** Box timbers use local Z for length. Panel geometry uses its first edge.
 * Geometry is changed only in its UV buffer; dimensions/positions stay exact.
 */
export function applyWoodGrainUV(geometry, part = {}) {
  const position = geometry?.getAttribute('position');
  if (!position) return geometry;
  const uv = new Float32Array(position.count * 2), point = new THREE.Vector3();
  if (part.kind === 'panel' || part.corners) {
    const origin = new THREE.Vector3().fromBufferAttribute(position, 0), along = new THREE.Vector3().fromBufferAttribute(position, 1).sub(origin).normalize();
    const across = new THREE.Vector3().fromBufferAttribute(position, Math.min(3, position.count - 1)).sub(origin);
    across.addScaledVector(along, -across.dot(along)); const width = Math.max(across.length(), .0001); across.normalize();
    for (let i = 0; i < position.count; i++) { point.fromBufferAttribute(position, i).sub(origin); uv[i * 2] = .005 + .49 * clamp(point.dot(across) / width, 0, 1); uv[i * 2 + 1] = point.dot(along) / .8; }
  } else {
    geometry.computeBoundingBox(); const {min, max} = geometry.boundingBox;
    const width = Math.max(max.x - min.x, .0001), height = Math.max(max.y - min.y, .0001), normal = geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      if (normal && Math.abs(normal.getZ(i)) > .5) { uv[i * 2] = .505 + .49 * (point.x - min.x) / width; uv[i * 2 + 1] = .005 + .99 * (point.y - min.y) / height; }
      else { uv[i * 2] = .005 + .49 * (normal && Math.abs(normal.getX(i)) > .5 ? (point.y - min.y) / height : (point.x - min.x) / width); uv[i * 2 + 1] = (point.z - min.z) / .8; }
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.userData.woodGrain = 'longitudinal';
  return geometry;
}

export function setMaterialTextures(material, enabled) {
  for (const item of [].concat(material || [])) {
    const record = resources.get(item);
    if (!record || disposedMaterials.has(item)) continue;
    record.textures = !!enabled;
    item.map = !record.feedback && record.textures ? record.texture : null;
    item.needsUpdate = true;
  }
}
export function setMaterialFeedback(material, state = null) {
  if (state !== null && !VISUAL_FEEDBACK[state]) throw new TypeError('État de repérage inconnu.');
  for (const item of [].concat(material || [])) {
    if (disposedMaterials.has(item)) continue;
    let record = resources.get(item);
    if (!record) { trackMaterial(item); record = resources.get(item); }
    if (state && !record.feedback) record.original = snapshot(item);
    record.feedback = state;
    const original = record.original;
    if (state) {
      item.color?.set(VISUAL_FEEDBACK[state].color); item.emissive?.set(0);
      item.opacity = 1; item.transparent = false; item.depthTest = true; item.depthWrite = true; item.toneMapped = false; item.map = null;
      if ('wireframe' in item) item.wireframe = false;
    } else {
      if (original.color) item.color.copy(original.color);
      if (original.emissive) item.emissive.copy(original.emissive);
      for (const key of ['opacity', 'transparent', 'depthTest', 'depthWrite', 'toneMapped']) item[key] = original[key];
      if (original.wireframe !== undefined) item.wireframe = original.wireframe;
      item.map = record.textures ? record.texture : null;
    }
    item.userData.feedbackState = state; item.needsUpdate = true;
  }
}
export function createFeedbackMaterial(state = 'moving', {overlay = false} = {}) {
  const style = VISUAL_FEEDBACK[state]; if (!style) throw new TypeError('État de repérage inconnu.');
  const material = new THREE.MeshBasicMaterial({color: style.color, transparent: false, opacity: 1, depthTest: true, depthWrite: !overlay, side: THREE.DoubleSide, toneMapped: false, polygonOffset: overlay, polygonOffsetFactor: -1, polygonOffsetUnits: -1});
  material.userData.feedbackState = state;
  return trackMaterial(material);
}

function markerImage(state) {
  const key = `marker:${state}`;
  if (pixelTemplates.has(key)) return pixelTemplates.get(key);
  const width = 48, height = 48, data = new Uint8Array(width * height * 4), color = new THREE.Color(VISUAL_FEEDBACK[state].outline).getHex();
  const channels = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  const nearLine = (x, y, ax, ay, bx, by, width = .065) => { const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1); return Math.hypot(x - ax - t * dx, y - ay - t * dy) < width; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + .5) / width * 2 - 1, v = (y + .5) / height * 2 - 1, radius = Math.hypot(u, v), i = (y * width + x) * 4;
    if (radius > .94) continue;
    const glyph = state === 'contact' ? nearLine(u,v,-.45,.02,-.1,-.3) || nearLine(u,v,-.1,-.3,.5,.35)
      : state === 'target' ? Math.abs(Math.abs(u) + Math.abs(v) - .56) < .08
      : state === 'moving' ? nearLine(u,v,-.45,0,.45,0) || nearLine(u,v,.45,0,.12,.3) || nearLine(u,v,.45,0,.12,-.3)
      : state === 'selected' ? Math.abs(Math.max(Math.abs(u),Math.abs(v)) - .43) < .07
      : Math.abs(radius - .43) < .07;
    const ink = glyph || radius > .85;
    data[i] = ink ? channels[0] : 255; data[i + 1] = ink ? channels[1] : 255; data[i + 2] = ink ? channels[2] : 250; data[i + 3] = 255;
  }
  const image = {width, height, data}; pixelTemplates.set(key, image); return image;
}
export function createFeedbackMarker(state = 'moving', size = .1) {
  if (!VISUAL_FEEDBACK[state]) throw new TypeError('État de repérage inconnu.');
  const map = dataTexture(markerImage(state), `Atelier · ${state} marker`);
  const material = trackMaterial(new THREE.SpriteMaterial({map, depthTest: false, depthWrite: false, toneMapped: false, transparent: true}), map);
  const marker = new THREE.Sprite(material); marker.name = 'feedback-marker'; marker.scale.set(size, size, 1); marker.renderOrder = 42;
  marker.userData = {previewOnly: true, excludeFromExport: true, feedbackState: state, label: VISUAL_FEEDBACK[state].label, symbol: VISUAL_FEEDBACK[state].symbol, aspect: 1};
  marker.raycast = () => {};
  return marker;
}

/** La face ciblée est exprimée en coordonnées monde mm. Le remplissage reste
 * opaque et respecte la profondeur ; seuls ses bords cachés sont en pointillés.
 */
export function createContactFaceOverlay(points){
 if(!Array.isArray(points)||points.length<3||points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))return null;
 const normal=new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0])).cross(new THREE.Vector3(...points[2]).sub(new THREE.Vector3(...points[0])));if(normal.lengthSq()<1e-10)return null;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(p=>p.map(n=>n/1000)),3));
 const indices=[];for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);geometry.setIndex(indices);geometry.computeVertexNormals();
 const result=createFocusOverlay(geometry,'target',{fill:true,overlay:true,occluded:true,marker:false});result.name='contact-target-face';result.userData.targetFace=true;geometry.dispose();return result;
}

/** All returned geometry/materials belong to the overlay. Source geometry is
 * never borrowed, so deleting an overlay cannot break a committed piece.
 * Orange/blue/green are also differentiated by marker shape and label metadata.
 */
export function createFocusOverlay(geometry, state = 'moving', {fill = true, occluded = true, overlay = false, marker = true} = {}) {
  const style = VISUAL_FEEDBACK[state]; if (!style) throw new TypeError('État de repérage inconnu.');
  const group = new THREE.Group(); group.name = `feedback-${state}`;
  group.userData = {previewOnly: true, excludeFromExport: true, feedbackState: state, label: style.label, symbol: style.symbol};
  if (fill) { const mesh = new THREE.Mesh(geometry.clone(), createFeedbackMaterial(state, {overlay})); mesh.name = 'feedback-fill'; mesh.renderOrder = 30; group.add(mesh); }
  const visible = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({color: style.outline, depthTest: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, toneMapped: false}));
  visible.name = 'feedback-visible'; visible.renderOrder = 31; group.add(visible);
  if (occluded) {
    const hidden = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineDashedMaterial({color: style.outline, transparent: true, opacity: .5, depthTest: true, depthWrite: false, depthFunc: THREE.GreaterDepth, dashSize: .045, gapSize: .035, toneMapped: false}));
    hidden.computeLineDistances(); hidden.name = 'feedback-occluded'; hidden.renderOrder = 32; group.add(hidden);
  }
  if (marker) {
    const bounds = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position')), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const indicator = createFeedbackMarker(state, clamp(size.length() * .035, .07, .16));
    indicator.position.copy(center); group.add(indicator);
  }
  group.traverse(object => { object.userData.previewOnly = true; object.userData.excludeFromExport = true; object.raycast = () => {}; });
  return group;
}

export function disposeVisualMaterial(material) {
  for (const item of new Set([].concat(material || []))) if (!disposedMaterials.has(item)) { item.dispose(); disposedMaterials.add(item); }
}
/** Only maps created here are disposed. Foreign textures remain their owner's
 * responsibility. Geometry/materials in this object must be owned by it. */
export function disposeVisualObject(object) {
  const geometries = new Set(), materials = new Set();
  object?.traverse(child => { if (child.geometry) geometries.add(child.geometry); for (const material of [].concat(child.material || [])) materials.add(material); });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) disposeVisualMaterial(material);
  object?.removeFromParent();
}

/** Synchronous PNG/OBJ export guard. Restores overlays and transient colors
 * even if exporting fails; it does not touch transforms or project objects. */
export function withCleanVisuals(root, callback) {
  const hidden = [], feedback = new Map();
  root?.traverse(object => {
    if (object.userData.previewOnly || object.userData.excludeFromExport) {
      let ancestor = object.parent, nested = false;
      while (ancestor && ancestor !== root) { if (ancestor.userData.previewOnly || ancestor.userData.excludeFromExport) { nested = true; break; } ancestor = ancestor.parent; }
      if (!nested) hidden.push({object, visible: object.visible, parent: object.parent, index: object.parent?.children.indexOf(object)});
    }
    for (const material of [].concat(object.material || [])) { const state = resources.get(material)?.feedback; if (state && !feedback.has(material)) { feedback.set(material, state); setMaterialFeedback(material, null); } }
  });
  // OBJExporter traverses invisible objects too; detach top-level previews.
  for (const {object} of hidden) { object.visible = false; object.removeFromParent(); }
  try { return callback(); }
  finally {
    for (const {object, visible, parent, index} of hidden) { object.visible = visible; if (parent) { parent.add(object); parent.children.splice(parent.children.indexOf(object), 1); parent.children.splice(index, 0, object); } }
    for (const [material, state] of feedback) setMaterialFeedback(material, state);
  }
}
