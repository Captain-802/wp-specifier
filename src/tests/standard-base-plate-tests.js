"use strict";

// The simply-supported base plate is one of four hard-coded types from the
// owner's detail sheets (U-B3A / U-B3B / L-B2A / L-B2B): same plate length
// and width within a type, the same two bolts, only the concrete edge to
// bolt distance B moving with the post depth. These checks reproduce the
// owner's tables row by row and follow the type through the engines, the
// connection selection, the drawings and the 3D base.

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
  "js/data/i-section-database.js",
  "js/data/connections-database.js",
  "js/data/standard-base-plate-types.js",
  "js/engines/connection-selection-engine.js",
  "js/engines/simply-u-baseplate-standard-engine.js",
  "js/engines/simply-l-baseplate-standard-engine.js",
  "js/services/baseplate-svg-engine.js",
  "js/services/baseplate-geometry-engine.js",
  "js/services/u-baseplate-geometry-engine.js",
  "js/services/simply-u-baseplate-geometry-engine.js",
  "js/services/simply-u-baseplate-plan-engine.js",
  "js/services/simply-u-baseplate-section-engine.js",
  "js/services/simply-u-baseplate-drawing-service.js",
  "js/services/simply-l-baseplate-geometry-engine.js",
  "js/services/simply-l-baseplate-plan-engine.js",
  "js/services/simply-l-baseplate-section-engine.js",
  "js/services/simply-l-baseplate-drawing-service.js",
  "js/services/cavity-wall-3d-engine.js"
].forEach(file => require(path.join(root, file)));

const W = globalThis.Windpost;
const T = W.standardBasePlateTypes;
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const uSection = name => W.uSectionDatabase.sections.find(s => s.name === name);
const lSection = name => W.lSectionDatabase.sections.find(s => s.name === name);

// the owner's tables: section -> [B, plate length]
const OWNER_ROWS = {
  "UP 55x60x4": [103, 205], "UP 60x60x5": [98, 205], "UP 65x60x6": [93, 205], "UP 70x60x4": [88, 205],
  "UP 75x60x5": [83, 205], "UP 80x60x6": [78, 205], "UP 85x60x4": [73, 205],
  "UP 90x60x4": [103, 240], "UP 95x60x5": [98, 240], "UP 100x60x6": [93, 240], "UP 105x60x4": [88, 240],
  "UP 110x60x5": [83, 240], "UP 115x60x6": [78, 240], "UP 115x65x8": [78, 240], "UP 120x80x8": [73, 240],
  "LP 125x70x4": [129, 205], "LP 130x70x5": [124, 205], "LP 135x70x6": [119, 205], "LP 140x70x4": [114, 205],
  "LP 145x70x5": [109, 205], "LP 150x70x6": [104, 205], "LP 150x80x8": [104, 205], "LP 155x70x4": [99, 205],
  "LP 160x70x6": [94, 205], "LP 160x80x8": [94, 205],
  "LP 165x70x5": [124, 240], "LP 170x80x8": [119, 240], "LP 180x70x4": [109, 240], "LP 200x70x6": [89, 240]
};

check("every row of the owner's tables is reproduced (B = constant - D, fixed plate length)", () => {
  Object.entries(OWNER_ROWS).forEach(([name, [edgeToBolt, plateLength]]) => {
    // rows the web catalogue does not carry (e.g. LP 135) are built from the name
    const parsed = name.match(/^(UP|LP) (\d+)x(\d+)x(\d+)$/);
    const section = uSection(name) || lSection(name) ||
      { type: parsed[1] === "UP" ? "U" : "L", name, a_mm: Number(parsed[2]), b_mm: Number(parsed[3]), t_mm: Number(parsed[4]) };
    const g = T.geometryFor(section);
    assert(g, `${name} has a type`);
    assert.strictEqual(g.edgeToBolt_mm, edgeToBolt, `${name} B`);
    assert.strictEqual(g.plateLength_mm, plateLength, `${name} plate length`);
    assert.strictEqual(g.tabulatedLength_mm, plateLength, `${name} tabulated length`);
    assert.strictEqual(g.plateWidth_mm, 150);
    assert.strictEqual(g.plateThickness_mm, 6);
    assert.strictEqual(g.boltGauge_mm, 80);
    assert.strictEqual(g.sideEdge_mm, 35);
    assert.strictEqual(g.boltEndDistance_mm, 35);
  });
  assert.strictEqual(T.typeFor(uSection("UP 85x60x4")).code, "U-B3A");
  assert.strictEqual(T.typeFor(uSection("UP 90x60x4")).code, "U-B3B");
  assert.strictEqual(T.typeFor(lSection("LP 160x80x8")).code, "L-B2A");
  assert.strictEqual(T.typeFor({ type: "L", a_mm: 165, b_mm: 70, t_mm: 4 }).code, "L-B2B");
  assert.strictEqual(T.typeFor(lSection("LP 170x70x4")).code, "L-B2B");
  assert.strictEqual(T.typeFor({ type: "U", a_mm: 130 }), null);
  assert.strictEqual(T.typeFor({ type: "DU", a_mm: 60 }), null);
});

check("the simply-supported engines carry the type into the design record", () => {
  const u = W.simplyUBaseplateStandard.create(uSection("UP 90x60x4"));
  assert(u.ok && u.standard);
  assert.strictEqual(u.design.typeCode, "U-B3B");
  assert.strictEqual(u.design.anchorFromConcreteEdge, 103);
  assert.strictEqual(u.design.plateLen, 138);
  assert.strictEqual(u.design.leftPortion, 102);
  assert.strictEqual(u.design.overallLength_mm, 240);
  assert.strictEqual(u.design.w, 80);
  assert.strictEqual(u.design.sideEdge, 35);
  assert.deepStrictEqual(u.results.edgeDistances, { concrete: 103, longitudinalPlateEnd: 35, transverseTop: 35, transverseBottom: 35 });
  const l = W.simplyLBaseplateStandard.create(lSection("LP 125x70x4"));
  assert.strictEqual(l.design.typeCode, "L-B2A");
  assert.strictEqual(l.design.anchorFromConcreteEdge, 129);
  assert.strictEqual(l.design.plateLen, 164);
  assert.strictEqual(l.design.leftPortion, 41);
  assert.strictEqual(l.design.overallLength_mm, 205);
  assert.strictEqual(l.design.B, 150, "same width for every type, 80 mm legs included");
  assert.strictEqual(W.simplyLBaseplateStandard.create(lSection("LP 160x80x8")).design.B, 150);
  const deep = W.simplyUBaseplateStandard.create({ type: "U", name: "UP 130x60x6", a_mm: 130, b_mm: 60, t_mm: 6 });
  assert(!deep.ok && /U-B3A 55-85, U-B3B 90-120/.test(deep.reason));
});

check("the drawings dimension B, the 35 end distance and the tabulated plate length", () => {
  const u = W.simplyUBaseplateStandard.create(uSection("UP 90x60x4"));
  const uSvg = W.simplyUBaseplateDrawing.draw(u.design, uSection("UP 90x60x4")).svg;
  assert(uSvg.includes("240 × 150 × 6 mm"), "U-B3B plate 240 x 150 x 6");
  assert(uSvg.includes("U-B3B"), "type code on the drawing");
  assert(uSvg.includes(">103<") || uSvg.includes(">103</"), "B = 103 dimensioned");
  const l = W.simplyLBaseplateStandard.create(lSection("LP 125x70x4"));
  const lSvg = W.simplyLBaseplateDrawing.draw(l.design, lSection("LP 125x70x4")).svg;
  assert(lSvg.includes("205 × 150 × 6 mm") && lSvg.includes("L-B2A"));
  assert(lSvg.includes(">129<") || lSvg.includes(">129</"), "B = 129 dimensioned");
});

check("the 3D base follows the type (anchors at B from the concrete edge, 80 gauge)", () => {
  const section = uSection("UP 90x60x4");
  const u = W.simplyUBaseplateStandard.create(section);
  const model = W.cavityWall3d.sectionPrototypeModel(section, 2670, null, u.design);
  assert.strictEqual(model.baseplate.overallLength_mm, 240);
  assert.deepStrictEqual(model.baseplate.rowCentres_mm, [103]);
  assert.deepStrictEqual(model.baseplate.columnCentres_mm, [-40, 40]);
  assert.strictEqual(model.baseplate.width_mm, 150);
});

check("the connection selection reports the sub-type while bolts and weights stay with U-B3 / L-B2", () => {
  const C = W.connectionSelectionEngine;
  const up90 = uSection("UP 90x60x6");
  const uTop = C.select({
    type: "U", supportCondition: "simplySupported", loadType: "udl", length_mm: 2500, section: up90, finalCapacity_kN: 5, numberOfTies: 10,
    headFixing: "U POST TO CONCRETE SLAB FACE B", baseFixing: "U POST TO CONCRETE TOP ", headBoltFamily: "RGM BOLTS", baseBoltFamily: "RGM BOLTS"
  });
  assert.strictEqual(uTop.base.code, "U-B3B");
  assert.strictEqual(uTop.base.libraryCode, "U-B3");
  assert(Math.abs(uTop.base.weight_kg - 1.77) < 1e-9, "240 plate weight from the library");
  assert.strictEqual(uTop.base.boltSku, "KM10RES  RG M10 x 130 mm");
  assert.strictEqual(uTop.base.standardPlate.plateLength_mm, 240);
  const lp125 = lSection("LP 125x70x4");
  const lBase = C.select({
    type: "L", supportCondition: "simplySupported", loadType: "udl", length_mm: 2500, section: lp125, finalCapacity_kN: 5, numberOfTies: 10,
    headFixing: "L POST TO CONCRETE SLAB UNDERSIDE", baseFixing: "L POST TO CONCRETE TOP ", headBoltFamily: "RGM BOLTS", baseBoltFamily: "RGM BOLTS"
  });
  assert.strictEqual(lBase.base.code, "L-B2A");
  assert(Math.abs(lBase.base.weight_kg - 1.52) < 1e-9);
});

check("both pages load the type table before the engines that use it", () => {
  ["index.html", "l-section-prototype.html"].forEach(page => {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const at = html.indexOf("standard-base-plate-types.js");
    assert(at > 0, `${page} loads the type table`);
    if (html.includes("connection-selection-engine.js")) {
      assert(at < html.indexOf("connection-selection-engine.js"), `${page} order`);
    }
    if (html.includes("simply-u-baseplate-standard-engine.js")) {
      assert(at < html.indexOf("simply-u-baseplate-standard-engine.js"), `${page} before the simply engines`);
    }
  });
});

console.log(`\n${passed} standard base plate checks passed.`);
