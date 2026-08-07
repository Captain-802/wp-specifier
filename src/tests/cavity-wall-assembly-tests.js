"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, window: {} });
context.window.window = context.window;
[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/data/l-section-database.js",
  "js/engines/outer-tie-selection-engine.js",
  "js/engines/simply-u-baseplate-standard-engine.js",
  "js/engines/simply-l-baseplate-standard-engine.js",
  "js/services/cavity-wall-assembly-engine.js",
  "js/services/cavity-wall-drawing-service.js",
  "js/services/cavity-wall-3d-engine.js"
].forEach(file => vm.runInContext(
  fs.readFileSync(path.join(root, file), "utf8"),
  context,
  { filename: file }
));

const W = context.window.Windpost;
const section = W.lSectionDatabase.sections.find(item => item.name === "LP 125x70x4");
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

check("confirmed post-slot and shear-tie fabrication dimensions are locked", () => {
  const detail = W.cavityWallAssemblyEngine.DETAIL;
  assert.deepStrictEqual(
    [detail.postSlot.width_mm, detail.postSlot.height_mm, detail.postSlot.radius_mm],
    [10, 50, 5]
  );
  assert.deepStrictEqual(
    [
      detail.shearTie.overallLength_mm,
      detail.shearTie.halfLength_mm,
      detail.shearTie.width_mm,
      detail.shearTie.thickness_mm
    ],
    [168, 84, 10, 1.5]
  );
  assert.deepStrictEqual(
    [
      detail.shearTie.holeWidth_mm,
      detail.shearTie.holeLength_mm,
      detail.shearTie.holeRadius_mm
    ],
    [6, 10, 3]
  );
  assert.deepStrictEqual([...detail.shearTie.holeCentresFromEnd_mm], [10, 25]);
  assert.strictEqual(detail.shearTie.notch_mm, 7.6);
  assert.strictEqual(detail.shearTie.mirroredEngagement_mm, 11.17);
});

const model = W.cavityWallAssemblyEngine.build({
  section,
  supportCondition: "simplySupported",
  length_mm: 2670,
  wall: {
    innerLeafThickness_mm: 100,
    cavityWidth_mm: 150,
    outerLeafThickness_mm: 102.5
  }
});

check("L-post placement retains the established 90 mm inner-leaf embedment", () => {
  assert(model.valid);
  assert.strictEqual(model.post.innerLeafEmbedment_mm, 90);
  assert.strictEqual(model.post.cavityProjection_mm, 35);
  assert.strictEqual(model.wallTie.outerGap_mm, 115);
});

check("the EDC engine is shared with the selector", () => {
  assert.strictEqual(model.wallTie.outerTie, "EDC25-200");
  assert(Math.abs(model.wallTie.outerEmbedment_mm - 74.23) < 1e-9);
});

check("simply-supported exact-height tie schedule starts and repeats at 225 mm", () => {
  assert.strictEqual(model.tieSchedule.count, 10);
  assert.strictEqual(model.tieSchedule.levels_mm[0], 225);
  assert.strictEqual(model.tieSchedule.levels_mm[1], 450);
  assert.strictEqual(model.tieSchedule.levels_mm.at(-1), 2250);
});

check("cantilever schedule preserves three paired levels at 800 mm", () => {
  const levels = W.cavityWallAssemblyEngine.tieLevels(800, "cantilever");
  assert.strictEqual(JSON.stringify(levels), JSON.stringify([225, 450, 675]));
});

check("standard UK brick, block and mortar modules are stored", () => {
  assert.deepStrictEqual(
    [
      model.masonry.brick.length_mm,
      model.masonry.brick.depth_mm,
      model.masonry.brick.height_mm,
      model.masonry.brick.mortar_mm
    ],
    [215, 102.5, 65, 10]
  );
  assert.deepStrictEqual(
    [
      model.masonry.block.length_mm,
      model.masonry.block.depth_mm,
      model.masonry.block.height_mm,
      model.masonry.block.mortar_mm
    ],
    [440, 100, 215, 10]
  );
});

check("the confirmed 5 mm clear-gap hole layout cannot overlap", () => {
  const tie = model.shearTie;
  const centres = tie.holeCentresFromEnd_mm;
  const clearBetween = centres[1] - centres[0] - tie.holeLength_mm;
  const clearEnd = centres[0] - tie.holeLength_mm / 2;
  assert.strictEqual(clearEnd, 5);
  assert.strictEqual(clearBetween, 5);
});

const drawings = W.cavityWallDrawingService.drawAll(model);

check("all four coordinated SVG views are generated", () => {
  assert.deepStrictEqual(Object.keys(drawings), ["plan", "elevation", "side", "isometric"]);
  Object.values(drawings).forEach(svg => {
    assert(svg.startsWith("<svg"));
    assert(!svg.includes("NaN"));
    assert(!svg.includes("undefined"));
  });
});

check("plan view carries the paired-tie geometry and EDC selection", () => {
  assert(drawings.plan.includes("168 shear tie"));
  assert(drawings.plan.includes("EDC25-200 outer-leaf tie"));
  assert(drawings.plan.includes("Paired shear and EDC ties at the same elevation"));
});

check("drawn EDC projection starts at the post face and reaches the calculated embedment", () => {
  const scene = W.cavityWall3d.buildScene(model);
  const edc = scene.find(item =>
    item.type === "cuboid" &&
    item.group === "ties" &&
    Math.abs(item.points[1][0] - item.points[0][0] - 25) < 1e-9
  );
  const start = edc.points[0][1];
  const end = edc.points[2][1];
  const outerFace = model.wall.innerLeafThickness_mm + model.wall.cavityWidth_mm;
  assert.strictEqual(start, model.post.longLegY1_mm);
  assert(Math.abs(end - outerFace - model.wallTie.outerEmbedment_mm) < 1e-9);
});

check("interactive model contains the four confirmed shear-tie holes per level", () => {
  const scene = W.cavityWall3d.buildScene(model);
  const horizontalHoles = scene.filter(item =>
    item.type === "slot" && item.plane === "horizontal"
  );
  assert.strictEqual(
    horizontalHoles.length,
    model.tieSchedule.count * 4
  );
});

check("elevation and side view carry the confirmed vertical schedule", () => {
  assert(drawings.elevation.includes(">225<"));
  assert(drawings.elevation.includes(">225 c/c<"));
  assert(drawings.side.includes("EDC25-200 at each tie level"));
});

console.log(`\n${passed} cavity-wall assembly checks passed.`);
