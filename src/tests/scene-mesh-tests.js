"use strict";

// The WebGL picture is built from triangle meshes produced by the scene-mesh
// engine: every scene item (post, base plate, stiffener, anchors) plus the
// cavity-wall context (slabs, brick and block leaves, ties, head connection).
// These checks keep the geometry honest without a browser.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
const root = path.resolve(__dirname, "..");
[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/engines/fold-width-engine.js",
  "js/data/l-section-database.js",
  "js/data/u-section-database.js",
  "js/data/connections-database.js",
  "js/data/standard-base-plate-types.js",
  "js/engines/secant-modulus-engine.js",
  "js/engines/load-case-engine.js",
  "js/engines/tie-capacity-engine.js",
  "js/engines/result-selection-engine.js",
  "js/engines/windpost-calculation-engine.js",
  "js/engines/baseplate-config.js",
  "js/engines/baseplate-bolt-engine.js",
  "js/engines/baseplate-leff-engine.js",
  "js/engines/baseplate-tstub-engine.js",
  "js/engines/baseplate-stiffener-engine.js",
  "js/engines/baseplate-shear-engine.js",
  "js/engines/baseplate-check-engine.js",
  "js/engines/baseplate-sizer-engine.js",
  "js/engines/baseplate-design-engine.js",
  "js/services/baseplate-drawing-service.js",
  "js/services/u-baseplate-geometry-engine.js",
  "js/engines/simply-u-baseplate-standard-engine.js",
  "js/engines/simply-l-baseplate-standard-engine.js",
  "js/services/simply-u-baseplate-geometry-engine.js",
  "js/services/simply-u-baseplate-plan-engine.js",
  "js/services/simply-u-baseplate-section-engine.js",
  "js/services/simply-u-baseplate-drawing-service.js",
  "js/services/simply-l-baseplate-geometry-engine.js",
  "js/services/simply-l-baseplate-plan-engine.js",
  "js/services/simply-l-baseplate-section-engine.js",
  "js/services/simply-l-baseplate-drawing-service.js",
  "js/services/windpost-scene-mesh-engine.js",
  "js/services/windpost-gl-renderer.js",
  "js/services/cavity-wall-3d-engine.js",
  "js/services/l-section-orthographic-service.js",
  "js/services/u-section-orthographic-service.js",
  "js/services/l-cantilever-baseplate-prototype-service.js"
].forEach(file => require(path.join(root, file)));

const W = globalThis.Windpost;
const M = W.sceneMesh;
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function triangleArea2d(t) {
  const [a, b, c] = t;
  return ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}

function modelFor(type, name, length, support) {
  const db = type === "U" ? W.uSectionDatabase : W.lSectionDatabase;
  const section = db.sections.find(s => s.name === name);
  const design = W.lCantileverBaseplatePrototype.design(section, length, "udl", { supportCondition: support });
  assert(design.ok, `${name} ${support} base design`);
  const model = W.cavityWall3d.sectionPrototypeModel(section, length, null, design.design);
  return { model, scene: W.cavityWall3d.buildSectionScene(model) };
}

const WALL = { innerLeafThickness_mm: 100, cavityWidth_mm: 100, outerLeafThickness_mm: 102.5 };

check("a square with a circular hole triangulates to the right area with the right normal", () => {
  const square = [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]];
  const hole = [];
  for (let i = 0; i < 24; i += 1) {
    hole.push([50 + 10 * Math.cos(2 * Math.PI * i / 24), 50 + 10 * Math.sin(2 * Math.PI * i / 24), 0]);
  }
  const out = M.triangulateFace(square, [hole]);
  const area = out.triangles.reduce((sum, t) => sum + triangleArea2d(t), 0);
  const holeArea = 0.5 * 24 * 100 * Math.sin(2 * Math.PI / 24);
  assert(Math.abs(area - (10000 - holeArea)) < 1e-6);
  assert.deepStrictEqual(out.normal.map(v => Math.round(v * 1e6) / 1e6), [0, 0, 1]);
  assert(out.triangles.every(t => triangleArea2d(t) > 0), "every triangle winds with the outer ring");
});

check("a clockwise ring keeps its own winding and a downward normal", () => {
  const square = [[0, 0, 0], [0, 100, 0], [100, 100, 0], [100, 0, 0]];
  const out = M.triangulateFace(square, []);
  assert.deepStrictEqual(out.normal.map(v => Math.round(v * 1e6) / 1e6), [0, 0, -1]);
  assert(out.triangles.every(t => triangleArea2d(t) < 0));
});

check("boxes and prisms produce outward normals", () => {
  const meshes = [M.itemToMesh(M.box(0, 0, 0, 10, 20, 30, "b"), { oriented: true }),
    M.itemToMesh(M.prism(0, 0, 0, 5, 3, 12, "p"), { oriented: true })];
  meshes.forEach(mesh => {
    assert.strictEqual(mesh.positions.length % 9, 0);
    const centre = [0, 0, 0];
    const n = mesh.positions.length / 3;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      centre[0] += mesh.positions[i] / n;
      centre[1] += mesh.positions[i + 1] / n;
      centre[2] += mesh.positions[i + 2] / n;
    }
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const d = [mesh.positions[i] - centre[0], mesh.positions[i + 1] - centre[1], mesh.positions[i + 2] - centre[2]];
      const dotted = d[0] * mesh.normals[i] + d[1] * mesh.normals[i + 1] + d[2] * mesh.normals[i + 2];
      assert(dotted > -1e-6, "normal faces away from the centre");
    }
  });
});

check("a perforated brick has hole walls facing into the holes", () => {
  const brick = M.box(0, 0, 0, 215, 102.5, 65, "outer", [{ x: 107.5, y: 51.25, r: 14 }]);
  assert.strictEqual(brick.faces.length, 6 + 20);
  assert.strictEqual(brick.faces[4].holes.length, 1);
  const mesh = M.itemToMesh(brick, { oriented: true, material: M.MATERIAL.brick });
  // vertices on the hole wall: normal points towards the hole axis
  let walls = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i], y = mesh.positions[i + 1];
    const radial = Math.hypot(x - 107.5, y - 51.25);
    if (Math.abs(radial - 14) > 1e-6 || Math.abs(mesh.normals[i + 2]) > 1e-6) continue;
    const inward = -((x - 107.5) * mesh.normals[i] + (y - 51.25) * mesh.normals[i + 1]);
    assert(inward > 0, "hole wall normal points into the hole");
    walls += 1;
  }
  assert(walls > 0);
});

check("post fold radii are smoothed while the plate edges stay sharp", () => {
  const { scene } = modelFor("L", "LP 125x70x6", 900, "cantilever");
  const post = scene.find(item => item.group === "post");
  const mesh = M.itemToMesh(post, { material: 0 });
  const distinct = new Set();
  for (let i = 0; i < mesh.normals.length; i += 3) {
    distinct.add(`${mesh.normals[i].toFixed(2)},${mesh.normals[i + 1].toFixed(2)},${mesh.normals[i + 2].toFixed(2)}`);
  }
  assert(distinct.size > 30, "the fold arcs carry many intermediate normals");
  const plate = scene.find(item => item.group === "baseplate");
  const plateMesh = M.itemToMesh(plate, { material: 1 });
  for (let i = 0; i < plateMesh.normals.length; i += 3) {
    const n = [plateMesh.normals[i], plateMesh.normals[i + 1], plateMesh.normals[i + 2]];
    assert(n.some(v => Math.abs(Math.abs(v) - 1) < 1e-6), "plate normals stay axis-aligned");
  }
});

check("the cantilever context holds a floor slab, both leaves, ties and no head connection", () => {
  const { model } = modelFor("L", "LP 125x70x6", 900, "cantilever");
  const items = M.contextItems(model, { wall: WALL, supportCondition: "cantilever" });
  const groups = items.map(entry => entry.item.group);
  assert.strictEqual(groups.filter(g => g === "concrete").length, 1);
  assert(groups.filter(g => g === "outer").length > 20, "brick outer leaf");
  assert(groups.filter(g => g === "inner").length >= 3, "block inner leaf");
  assert(groups.includes("mortar"));
  assert(!groups.includes("headplate"));
  const ties = items.filter(entry => entry.item.group === "ties");
  assert.strictEqual(ties.length, 2 * model.slotPlacement.levels_mm.length, "shear tie + L tie per level");
  const perforated = items.filter(entry => entry.item.group === "outer" && entry.item.faces.length > 6);
  assert(perforated.length > 0, "exposed bricks are perforated");
  items.forEach(entry => entry.item.points.forEach(p => p.forEach(v => assert(Number.isFinite(v)))));
});

check("the simply-supported context adds the floor above and the head connection", () => {
  const { model } = modelFor("U", "UP 90x60x4", 2670, "simplySupported");
  const items = M.contextItems(model, { wall: WALL, supportCondition: "simplySupported" });
  const groups = items.map(entry => entry.item.group);
  assert.strictEqual(groups.filter(g => g === "concrete").length, 2);
  assert.strictEqual(groups.filter(g => g === "headplate").length, 2);
  assert(groups.filter(g => g === "anchors").length >= 6, "two head anchors of three parts");
  const ties = items.filter(entry => entry.item.group === "ties");
  assert.strictEqual(ties.length, model.slotPlacement.levels_mm.length, "one U tie per level");
  // the U tie spans both leaves through the flange slots
  const tie = ties[0].item.points;
  const ys = tie.map(p => p[1]);
  assert(Math.min(...ys) < -WALL.cavityWidth_mm && Math.max(...ys) > 0);
});

check("build packs every mesh into typed arrays with bounds and a ground plane", () => {
  const { model, scene } = modelFor("L", "LP 150x70x4", 2670, "simplySupported");
  const out = M.build(scene, model, { showWall: true, wall: WALL, supportCondition: "simplySupported" });
  assert(out.vertexCount > 1000 && out.vertexCount % 3 === 0);
  assert.strictEqual(out.positions.length, out.vertexCount * 3);
  assert.strictEqual(out.materials.length, out.vertexCount);
  assert(out.contextCount > 20);
  assert(out.bounds.max[2] > 2670 + 200, "the floor above is inside the bounds");
  assert(out.groundZ < out.bounds.min[2]);
  const materials = new Set(Array.from(out.materials));
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(id => assert(materials.has(id), `material ${id} present`));
  const bare = M.build(scene, model, { showWall: false });
  assert.strictEqual(bare.contextCount, 0);
  assert(bare.vertexCount < out.vertexCount);
});

check("the viewer falls back to the 2D painter when WebGL is refused", () => {
  const canvas = {
    width: 600, height: 400, dataset: {},
    getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 600, height: 400 }),
    addEventListener: () => {},
    classList: { add() {}, remove() {} }
  };
  assert.strictEqual(W.windpostGlRenderer.create(canvas), null);
  const renderer = W.cavityWall3d.create(canvas);
  assert.strictEqual(renderer.gl, null);
  assert(renderer.ctx, "2D context kept for the painter");
  assert.strictEqual(renderer.context.showWall, true);
  renderer.context.showWall = false;
  renderer.setContext({ showWall: true });
  assert.strictEqual(renderer.context.showWall, true);
});

check("both pages load the mesh engine and the WebGL renderer before the 3D engine", () => {
  ["l-section-prototype.html", "cavity-wall-assembly.html"].forEach(page => {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const mesh = html.indexOf("windpost-scene-mesh-engine.js");
    const gl = html.indexOf("windpost-gl-renderer.js");
    const engine = html.indexOf("cavity-wall-3d-engine.js");
    assert(mesh > 0 && gl > mesh && engine > gl, `${page} script order`);
  });
  const html = fs.readFileSync(path.join(root, "l-section-prototype.html"), "utf8");
  assert(html.includes('id="view-context-wall"') && html.includes('id="view-context-post"'));
  const gl = fs.readFileSync(path.join(root, "js/services/windpost-gl-renderer.js"), "utf8");
  assert(!/\beval\(|new Function\(|https?:\/\//.test(gl), "no eval, no network");
});

console.log(`\n${passed} scene-mesh checks passed.`);
