import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { panelResizeFrame, resizePanelFromPoint, resizePanelFromDrag, intersectPanelResizePlane, MIN_PANEL_DIMENSION, surfaceResizePatch } from '../src/panel-resize.js';

const panel = (overrides = {}) => ({ id: 'M1', kind: 'panel', material: 'mesh', width: 1, height: 1, a: [0, 0, 0], b: [1000, 1000, 0], corners: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [0, 1000, 0]], ...overrides });
const plus = (a, b) => a.map((n, i) => n + b[i]);
const times = (a, n) => a.map(v => v * n);
function near(actual, expected, tolerance = 1e-7) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`); }
function vectorNear(actual, expected, tolerance = 1e-7) { actual.forEach((n, i) => near(n, expected[i], tolerance)); }

test('a rectangular mesh exposes four corner and four edge handles in its own plane', () => {
  const source = panel(), frame = panelResizeFrame(source);
  assert.equal(frame.available, true); assert.equal(frame.width, 1000); assert.equal(frame.height, 1000);
  assert.deepEqual(frame.u, [1, 0, 0]); assert.deepEqual(frame.v, [0, 1, 0]); assert.deepEqual(frame.normal, [0, 0, 1]);
  assert.equal(frame.handles.length, 8); assert.equal(new Set(frame.handles.map(h => h.id)).size, 8);
  const edge = frame.handles.find(h => h.id === 'edge-1');
  assert.deepEqual(edge.position, [1000, 500, 0]); assert.deepEqual(edge.opposite, [0, 500, 0]);
  assert.deepEqual(edge.fixedCornerIndices, [3, 0]); assert.deepEqual(edge.axes, ['u']);
  frame.corners[0][0] = 999; frame.handles[0].position[0] = 200;
  assert.equal(source.corners[0][0], 0, 'frame values are independent copies');
});

test('each corner stretches its two local dimensions while its opposite corner remains exact', () => {
  const targets = [[-200, -100, 0], [1200, -100, 0], [1200, 1100, 0], [-200, 1100, 0]];
  for (let index = 0; index < 4; index++) {
    const source = panel(), result = resizePanelFromPoint(source, `corner-${index}`, targets[index], { step: 1 });
    assert.equal(result.available, true); assert.equal(result.changed, true);
    assert.equal(result.width, 1200); assert.equal(result.height, 1100);
    assert.deepEqual(result.corners[index], targets[index]);
    assert.deepEqual(result.corners[(index + 2) % 4], source.corners[(index + 2) % 4]);
    assert.equal(panelResizeFrame({ ...source, corners: result.corners }).available, true);
  }
});

test('an edge changes only its normal-in-plane dimension and keeps the opposite edge fixed', () => {
  const targets = [[700, -100, 600], [1100, 800, -400], [300, 1100, 300], [-100, 900, -200]];
  for (let index = 0; index < 4; index++) {
    const source = panel(), result = resizePanelFromPoint(source, `edge-${index}`, targets[index], { step: 1 });
    assert.equal(result.available, true);
    assert.equal(result.width, index % 2 ? 1100 : 1000);
    assert.equal(result.height, index % 2 ? 1000 : 1100);
    const opposite = (index + 2) % 4;
    assert.deepEqual(result.corners[opposite], source.corners[opposite]);
    assert.deepEqual(result.corners[(opposite + 1) % 4], source.corners[(opposite + 1) % 4]);
    assert.ok(result.corners.every(point => point[2] === 0), 'normal pointer movement is discarded');
  }
});

test('fractional dimensions and position do not jump to a global grid at the start of a drag', () => {
  const source = panel({ corners: [[13.35, 2.75, 48.125], [1013.7, 2.75, 48.125], [1013.7, 1803.25, 48.125], [13.35, 1803.25, 48.125]] });
  const frame = panelResizeFrame(source), handle = frame.handles.find(h => h.id === 'corner-2');
  const initial = resizePanelFromPoint(source, handle.id, handle.position, { step: 50 });
  assert.equal(initial.changed, false); assert.deepEqual(initial.corners, source.corners);
  const result = resizePanelFromPoint(source, handle.id, plus(handle.position, [76.2, 24.7, 0]), { step: 50 });
  assert.deepEqual(result.delta, { width: 100, height: 0 });
  assert.deepEqual(result.corners[0], source.corners[0]);
  assert.equal(result.corners[2][0], source.corners[2][0] + 100);
  assert.equal(result.corners[2][1], source.corners[2][1]);
});

test('the project grid is precise to 0.1 mm, including a half step after world-coordinate subtraction', () => {
  const source = panel();
  const a = resizePanelFromPoint(source, 'corner-2', [1007.34, 1000.15, 0], { step: 0.1 });
  assert.deepEqual(a.delta, { width: 7.3, height: 0.2 });
  near(a.width, 1007.3); near(a.height, 1000.2);
  const b = resizePanelFromPoint(source, 'corner-2', [999.85, 1000, 0], { step: 0.1 });
  assert.equal(b.delta.width, -0.1, 'ties follow the same positive direction as Math.round');
});

test('Alt/free mode preserves exact drag distances instead of rounding to the grid', () => {
  const result = resizePanelFromPoint(panel(), 'corner-2', [1012.3456, 998.7654, 45], { step: 50, free: true });
  near(result.width, 1012.3456); near(result.height, 998.7654);
  assert.deepEqual(result.corners[0], [0, 0, 0]); assert.ok(result.corners.every(p => p[2] === 0));
});

test('tilted roofing and timber panels retain their local orientation and thickness metadata', () => {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.43, -0.72, 1.11));
  const corners = panel().corners.map(c => new THREE.Vector3(...c).applyQuaternion(rotation).add(new THREE.Vector3(123.45, 1900.25, -801.75)).toArray());
  for (const material of ['roof', 'wood']) {
    const source = panel({ material, width: 18, height: 18, roll: 17, corners }), before = structuredClone(source), frame = panelResizeFrame(source);
    assert.equal(frame.available, true);
    const target = plus(plus(plus(corners[2], times(frame.u, 123.45)), times(frame.v, -67.89)), times(frame.normal, 600));
    const result = resizePanelFromPoint(source, 'corner-2', target, { free: true });
    assert.equal(result.available, true); near(result.width, 1123.45); near(result.height, 932.11);
    assert.deepEqual(result.corners[0], corners[0]);
    const next = panelResizeFrame({ ...source, corners: result.corners });
    vectorNear(next.normal, frame.normal); vectorNear(next.u, frame.u); vectorNear(next.v, frame.v);
    assert.deepEqual(source, before, 'surface thickness, orientation and source geometry are untouched');
  }
});

test('a click offset from the handle center produces no initial jump, then follows pointer displacement', () => {
  const source = panel(), start = [1024, 1017, 0];
  const initial = resizePanelFromDrag(source, 'corner-2', start, start, { step: 0.5 });
  assert.equal(initial.changed, false); assert.deepEqual(initial.corners, source.corners);
  const result = resizePanelFromDrag(source, 'corner-2', start, [1148.6, 962.6, 900], { step: 0.5 });
  assert.deepEqual(result.delta, { width: 124.5, height: -54.5 });
  assert.deepEqual(result.corners[2], [1124.5, 945.5, 0]);
});

test('dragging across the opposite corner cannot invert the panel or create zero area', () => {
  for (const free of [false, true]) {
    const source = panel(), result = resizePanelFromPoint(source, 'corner-0', [1500, 1700, 0], { step: 50, free });
    assert.equal(result.available, true); assert.equal(result.clamped, true);
    assert.ok(result.width > 0); assert.ok(result.height > 0); assert.ok(result.area > 0);
    assert.deepEqual(result.corners[2], source.corners[2]);
    assert.deepEqual(panelResizeFrame({ ...source, corners: result.corners }).normal, [0, 0, 1]);
    if (free) { near(result.width, MIN_PANEL_DIMENSION); near(result.height, MIN_PANEL_DIMENSION); }
    else { assert.equal(result.width, 50); assert.equal(result.height, 50); }
  }
});

test('minimum dimensions remain on the relative step, even when the original width is fractional', () => {
  const source = panel({ corners: [[0, 0, 0], [1000.35, 0, 0], [1000.35, 1000, 0], [0, 1000, 0]] });
  const result = resizePanelFromPoint(source, 'edge-1', [-100, 500, 0], { step: 50 });
  near(result.width, 0.35); assert.equal(result.delta.width, -1000); assert.equal(result.clamped, true);
  assert.deepEqual(result.corners[0], source.corners[0]); assert.deepEqual(result.corners[3], source.corners[3]);
});

test('trapezoids, sheared, crossed, warped and zero-area panels are unavailable without correction', () => {
  const shapes = [
    [[0, 0, 0], [1000, 0, 0], [800, 1000, 0], [0, 1000, 0]],
    [[0, 0, 0], [1000, 0, 0], [1200, 1000, 0], [200, 1000, 0]],
    [[0, 0, 0], [1000, 1000, 0], [1000, 0, 0], [0, 1000, 0]],
    [[0, 0, 0], [1000, 0, 0], [1000, 1000, 20], [0, 1000, 0]],
    [[0, 0, 0], [0, 0, 0], [0, 1000, 0], [0, 1000, 0]],
  ];
  for (const corners of shapes) {
    const source = panel({ corners }), before = structuredClone(source), frame = panelResizeFrame(source);
    assert.equal(frame.available, false); assert.deepEqual(frame.handles, []); assert.ok(frame.message);
    assert.equal(resizePanelFromPoint(source, 'corner-2', [2000, 2000, 0]).available, false);
    assert.deepEqual(source, before);
  }
});

test('malformed input, wrong elements and unknown handles are rejected without throwing', () => {
  for (const source of [null, {}, { kind: 'panel', material: 'wood' }, panel({ kind: 'beam', material: 'wood' }), panel({ material: 'metal' }), panel({ corners: [[0, 0, 0], [NaN, 0, 0], [1, 1, 0], [0, 1, 0]] })]) assert.equal(panelResizeFrame(source).available, false);
  assert.equal(resizePanelFromPoint(panel(), 'foo', [0, 0, 0]).code, 'handle');
  assert.equal(resizePanelFromPoint(panel(), 'edge-1', [Infinity, 1, 0]).code, 'point');
  assert.equal(resizePanelFromDrag(panel(), 'edge-1', null, [0, 0, 0]).code, 'point');
});

test('legacy rectangular mesh panels use their existing corner convention', () => {
  const source = { id: 'LEGACY', material: 'mesh', kind: 'mesh', a: [-500, 300, 200], b: [500, 1600, 200], endHeights: [1600, 1600] };
  const frame = panelResizeFrame(source);
  assert.equal(frame.available, true); assert.equal(frame.width, 1000); assert.equal(frame.height, 1300);
  const result = resizePanelFromPoint(source, 'edge-2', [0, 1800, 200], { step: 1 });
  assert.equal(result.height, 1500); assert.equal(result.width, 1000);
  assert.deepEqual(result.corners[0], [-500, 300, 200]); assert.deepEqual(result.corners[1], [500, 300, 200]);
});

test('previews stay independent and do not mutate the project, stock or later pointer samples', () => {
  const source = panel(), project = { freeParts: [source], stock: { mesh: 4 }, purchased: {}, grid: 10 }, before = structuredClone(project);
  const first = resizePanelFromPoint(source, 'corner-2', [1512, 1404, 0], { step: project.grid });
  first.corners[0][0] = 888;
  const second = resizePanelFromPoint(source, 'corner-2', [1212, 1104, 0], { step: project.grid });
  assert.deepEqual(second.corners[0], source.corners[0]); assert.equal(second.width, 1210); assert.equal(second.height, 1100);
  assert.deepEqual(project, before);
});

test('out-of-project coordinates are rejected before engine normalization could deform the rectangle', () => {
  const result = resizePanelFromPoint(panel(), 'edge-1', [100010, 500, 0], { free: true });
  assert.equal(result.available, false); assert.equal(result.code, 'bounds'); assert.equal(result.corners, undefined);
  assert.equal(panelResizeFrame(panel({ corners: [[0, 0, 0], [100001, 0, 0], [100001, 1000, 0], [0, 1000, 0]] })).available, false);
});

test('ray intersections use the panel plane and reject parallel or backward rays', () => {
  const frame = panelResizeFrame(panel());
  assert.deepEqual(intersectPanelResizePlane(frame, [500, 400, 200], [0, 0, -7]), [500, 400, 0]);
  assert.equal(intersectPanelResizePlane(frame, [500, 400, 200], [1, 0, 0]), null);
  assert.equal(intersectPanelResizePlane(frame, [500, 400, 200], [0, 0, 1]), null);
  assert.equal(intersectPanelResizePlane(frame, [0, 0, 1], [0, 0, 0]), null);
  assert.equal(intersectPanelResizePlane({ available: false }, [0, 0, 1], [0, 0, -1]), null);
});

const wall = () => ({id:'W',kind:'wall',material:'wall',a:[100,200,300],b:[2500,200,2100],height:2500,width:200,wallThickness:200,wallSupport:'concrete',insulation:100});
test('mur oblique : longueur et hauteur par les côtés, base opposée et épaisseur conservées',()=>{
 const source=wall(),before=structuredClone(source),frame=panelResizeFrame(source);
 near(frame.width,3000);near(frame.height,2500);
 for(const [id,delta,expected] of [['edge-1',[400,0,300],[3500,2500]],['edge-2',[0,500,0],[3000,3000]],['edge-0',[0,-100,0],[3000,2600]]]){
  const handle=frame.handles.find(h=>h.id===id),result=resizePanelFromPoint(source,id,plus(handle.position,delta),{step:1});
  near(result.width,expected[0]);near(result.height,expected[1]);
  for(const index of handle.fixedCornerIndices)assert.deepEqual(result.corners[index],frame.corners[index]);
  const change=surfaceResizePatch(source,result.corners);assert.equal(change.available,true);
  const next={...source,...change.patch},nextFrame=panelResizeFrame(next);
  near(nextFrame.width,expected[0]);near(nextFrame.height,expected[1]);assert.equal(next.width,200);assert.equal(next.wallThickness,200);assert.equal(next.insulation,100);assert.equal(next.corners,undefined);assert.equal(next.a[1],next.b[1]);
 }
 assert.deepEqual(source,before);
});
test('mur : refuse dépassement de hauteur et coins qui le coucheraient',()=>{
 const source=wall(),frame=panelResizeFrame(source),handle=frame.handles.find(h=>h.id==='edge-2');
 assert.equal(resizePanelFromPoint(source,'edge-2',plus(handle.position,[0,9000,0])).available,false);
 assert.equal(surfaceResizePatch(source,[[0,0,0],[1000,0,0],[1000,0,1000],[0,0,1000]]).available,false);
 assert.equal(surfaceResizePatch({kind:'beam',material:'wood'},frame.corners).available,false);
});

test('grillage latéral sous toiture : sommet en pente conservé, réduction limitée par le côté le plus court',()=>{
 const source=panel({corners:[[0,100,0],[1400,100,0],[1400,2200,0],[0,2000,0]]}),frame=panelResizeFrame(source);
 assert.equal(frame.available,true);assert.equal(frame.rectangular,false);assert.equal(frame.height,2100);
 const handle=frame.handles.find(h=>h.id==='edge-2'),result=resizePanelFromPoint(source,handle.id,plus(handle.position,[0,300,0]),{step:1});
 assert.deepEqual(result.corners,[[0,100,0],[1400,100,0],[1400,2500,0],[0,2300,0]]);near(result.area,3.22);
 const minimum=resizePanelFromPoint(source,handle.id,plus(handle.position,[0,-5000,0]),{free:true});assert.equal(minimum.clamped,true);near(minimum.corners[3][1],100.1);near(minimum.corners[2][1],300.1);assert.equal(panelResizeFrame({...source,corners:minimum.corners}).available,true);
});
