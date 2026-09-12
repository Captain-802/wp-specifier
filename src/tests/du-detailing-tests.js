"use strict";

// DU on the Detailing page: two-channel section views with the per-channel
// blank and fold width, the DU-B2 / DU-T2 plates as the base and top
// connections, and the 3D model with both channels and both plates.

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
  "js/data/du-section-database.js",
  "js/data/connections-database.js",
  "js/data/standard-base-plate-types.js",
  "js/data/du-slab-face-plates.js",
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
  "js/services/baseplate-svg-engine.js",
  "js/services/baseplate-drawing-service.js",
  "js/services/u-baseplate-geometry-engine.js",
  "js/engines/simply-u-baseplate-standard-engine.js",
  "js/engines/simply-l-baseplate-standard-engine.js",
  "js/services/simply-u-baseplate-drawing-service.js",
  "js/services/simply-l-baseplate-drawing-service.js",
  "js/services/du-slab-face-drawing-service.js",
  "js/services/windpost-scene-mesh-engine.js",
  "js/services/cavity-wall-3d-engine.js",
  "js/services/l-section-orthographic-service.js",
  "js/services/u-section-orthographic-service.js",
  "js/services/du-section-orthographic-service.js",
  "js/services/l-cantilever-baseplate-prototype-service.js"
].forEach(file => require(path.join(root, file)));

const W = globalThis.Windpost;
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const du = name => W.duSectionDatabase.sections.find(s => s.name === name);
const WALL = { innerLeafThickness_mm: 100, cavityWidth_mm: 100, outerLeafThickness_mm: 102.5 };

check("the DU section views: two-channel plan, face elevation with two slot columns, per-channel blank", () => {
  const section = du("DU 60x60x6");
  const out = W.duSectionOrthographic.generate(section, 2670, {});
  assert.strictEqual(out.postType, "DU");
  assert.strictEqual(out.faceWidth_mm, 120);
  const plan = out.svg.match(/<g id="plan-view"[\s\S]*?<\/g>/)[0];
  const d = plan.match(/<path class="section-fill" d="([^"]+)"/)[1];
  assert.strictEqual((d.match(/Z/g) || []).length, 2, "one compound path with two channel loops");
  assert((d.match(/L /g) || []).length > 100, "rounded folds");
  assert(plan.includes("DU 60 x 120 x 6"));
  const face = out.svg.match(/<g id="du-face-elevation"[\s\S]*?<\/g>\s*<\/g>/)[0];
  const slots = (face.match(/class="slot-cutout"/g) || []).length;
  assert.strictEqual(slots, out.slotPlacement.levels_mm.length * 2, "two slot columns");
  assert(face.includes(">120<") || face.includes(">120</"), "face width dimensioned");
  assert(out.svg.includes("FLAT BLANK ELEVATION (ONE OF TWO CHANNELS)"));
  assert(out.svg.includes("FOLD WIDTH 155.44 mm"), "per-channel fold width on the blank");
  assert.strictEqual(out.foldWidth.value_mm, 310.88);
  assert.strictEqual(out.foldWidth.perChannel_mm, 155.44);
  assert.deepStrictEqual(out.sheetViews.map(v => v.id), ["flat-blank-elevation", "du-face-elevation"]);
  assert(out.svg.includes("DU-WINDPOST SECTION"));
});

check("the Detailing base router returns DU-B2 as the base and DU-T2 as the top connection", () => {
  const section = du("DU 115x60x6");
  const bp = W.lCantileverBaseplatePrototype.design(section, 2670, "udl", { supportCondition: "cantilever" });
  assert(bp.ok && bp.standard);
  assert.strictEqual(bp.connectionType, "du-slab-face");
  assert.strictEqual(bp.supportCondition, "simplySupported", "a DU is always simply supported");
  assert.strictEqual(bp.design.typeCode, "DU-B2");
  assert.strictEqual(bp.topTypeCode, "DU-T2");
  assert.strictEqual(bp.design.plateLen, 250);
  assert.strictEqual(bp.design.B, 150);
  assert.strictEqual(bp.design.tp, 6);
  assert(bp.svg.includes('id="bp-plan"') && bp.svg.includes('id="bp-side"'), "sheet zone ids");
  assert(bp.topSvg.includes("DU-T2") && bp.topSvg.includes('id="bp-side"'));
  assert.strictEqual(bp.design.facePlates.top.plateLength_mm, 280);
  assert.strictEqual(bp.design.facePlates.top.depth_mm, 115);
});

check("the 3D model carries two channels, both face plates and their anchors", () => {
  const section = du("DU 60x60x6");
  const bp = W.lCantileverBaseplatePrototype.design(section, 2670, "udl", {});
  const model = W.cavityWall3d.sectionPrototypeModel(section, 2670, null, bp.design);
  assert.strictEqual(model.type, "DU");
  assert(model.baseplate.facePlate);
  assert.strictEqual(model.baseplate.bottom.z0_mm, -8);
  assert.strictEqual(model.baseplate.bottom.z1_mm, 142);
  assert.strictEqual(model.baseplate.top.z1_mm, 2678);
  assert.deepStrictEqual(model.baseplate.bottom.anchorX_mm, [-90, 90]);
  assert.deepStrictEqual(model.baseplate.top.anchorX_mm, [-90, 90]);
  const scene = W.cavityWall3d.buildSectionScene(model);
  const groups = scene.map(item => item.group);
  assert.strictEqual(groups.filter(g => g === "post").length, 2, "two channels");
  assert.strictEqual(groups.filter(g => g === "baseplate").length, 2, "foot and head plates");
  assert.strictEqual(groups.filter(g => g === "anchors").length, 2);
  // channel 1 spans x in [-60, 0], channel 2 in [0, 60]; both stand off the plate face at y = -6
  const posts = scene.filter(item => item.group === "post");
  const xs = posts.map(p => p.points.map(pt => pt[0]));
  assert(Math.min(...xs[0]) < -59 && Math.max(...xs[0]) < 1e-6);
  assert(Math.max(...xs[1]) > 59 && Math.min(...xs[1]) > -1e-6);
  posts.forEach(p => assert(Math.max(...p.points.map(pt => pt[1])) <= -6 + 1e-6, "flanges bear on the plate face"));
  // slots cut in the flanges
  assert(posts[0].faces.some(f => f.holes && f.holes.length));
  const mesh = W.sceneMesh.build(scene, model, { showWall: true, wall: WALL, supportCondition: "simplySupported" });
  assert(mesh.contextCount > 20);
  for (let i = 0; i < mesh.positions.length; i += 1) assert(Number.isFinite(mesh.positions[i]));
});

check("the wall context of a DU: slabs at the inner-leaf line, two ties per level, no cleat", () => {
  const section = du("DU 60x60x6");
  const bp = W.lCantileverBaseplatePrototype.design(section, 2670, "udl", {});
  const model = W.cavityWall3d.sectionPrototypeModel(section, 2670, null, bp.design);
  const items = W.sceneMesh.contextItems(model, { wall: WALL, supportCondition: "simplySupported" });
  const groups = items.map(entry => entry.item.group);
  assert.strictEqual(groups.filter(g => g === "concrete").length, 2, "floor below and above");
  assert(!groups.includes("headplate"), "the DU-T2 plate comes from the scene, not a cleat");
  const slabs = items.filter(entry => entry.item.group === "concrete").map(entry => entry.item.points);
  slabs.forEach(points => assert(Math.min(...points.map(p => p[1])) >= -1e-6, "slab faces at the inner-leaf line"));
  const lower = slabs.find(points => Math.min(...points.map(p => p[2])) < 0);
  assert(Math.max(...lower.map(p => p[2])) === 150, "post foot 150 below the slab top");
  const ties = items.filter(entry => entry.item.group === "ties");
  const levelsInWall = model.slotPlacement.levels_mm.filter(z => z >= 180 && z <= 2670 - 180);
  assert.strictEqual(ties.length, 2 * levelsInWall.length, "two U ties per level in the wall");
});

check("the page offers DU, loads its services and reserves the top-connection zone", () => {
  const html = fs.readFileSync(path.join(root, "l-section-prototype.html"), "utf8");
  assert(html.includes('<option value="DU">'));
  assert(html.includes('id="top-connection-drawing"'));
  ["du-section-database.js", "du-slab-face-plates.js", "du-slab-face-drawing-service.js", "du-section-orthographic-service.js"]
    .forEach(file => assert(html.includes(file), file));
  assert(html.indexOf("u-section-orthographic-service.js") < html.indexOf("du-section-orthographic-service.js"));
  const page = fs.readFileSync(path.join(root, "js/ui/l-section-prototype-page.js"), "utf8");
  assert(page.includes("duSectionOrthographic") && page.includes("topConn") && page.includes("BASE CONNECTION"));
  const app = fs.readFileSync(path.join(root, "js/ui/app.js"), "utf8");
  assert(app.includes('section.type === "DU"') && app.includes("U, L and DU posts"));
});

console.log(`\n${passed} DU detailing checks passed.`);
