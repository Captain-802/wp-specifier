"use strict";

// DU-T2 / DU-B2: the DU post to concrete slab face connections from the
// owner's detail sheets — plate geometry, the drawings, M12 anchors and the
// Selector wiring.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
const root = path.resolve(__dirname, "..");
[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/engines/fold-width-engine.js",
  "js/data/du-section-database.js",
  "js/data/u-section-database.js",
  "js/data/l-section-database.js",
  "js/data/i-section-database.js",
  "js/data/connections-database.js",
  "js/data/standard-base-plate-types.js",
  "js/data/du-slab-face-plates.js",
  "js/engines/connection-selection-engine.js",
  "js/services/baseplate-svg-engine.js",
  "js/services/u-baseplate-geometry-engine.js",
  "js/services/du-slab-face-drawing-service.js"
].forEach(file => require(path.join(root, file)));

const W = globalThis.Windpost;
const P = W.duSlabFacePlates;
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const du = name => W.duSectionDatabase.sections.find(s => s.name === name);

check("DU-T2 and DU-B2 reproduce the owner's sheets", () => {
  const top = P.geometryFor("DU-T2", du("DU 60x60x6"));
  assert.strictEqual(top.plateLength_mm, 280);
  assert.strictEqual(top.plateHeight_mm, 150);
  assert.strictEqual(top.plateThickness_mm, 6);
  assert.deepStrictEqual(top.slotCentres_mm, [50, 230]);
  assert.strictEqual(top.slotPitch_mm, 180);
  assert.strictEqual(top.slotWidth_mm, 14);
  assert.strictEqual(top.slotLength_mm, 70);
  assert.strictEqual(top.slotTop_mm, 40);
  assert.strictEqual(top.postWidth_mm, 120);
  assert.strictEqual(top.postStart_mm, 80);
  assert.strictEqual(top.postEnd_mm, 200);
  assert.strictEqual(top.postEndInset_mm, 8);
  assert.strictEqual(top.verticalAdjustment_mm, 29);
  assert.strictEqual(top.webThickness_mm, 12);
  assert(top.check.slotsClose && top.check.postCentred);
  const bottom = P.geometryFor("DU-B2", du("DU 115x60x6"));
  assert.strictEqual(bottom.plateLength_mm, 250);
  assert.deepStrictEqual(bottom.slotCentres_mm, [35, 215]);
  assert.strictEqual(bottom.postStart_mm, 65);
  assert.strictEqual(bottom.postEnd_mm, 185);
  assert.strictEqual(bottom.depth_mm, 115);
  assert(bottom.check.slotsClose && bottom.check.postCentred);
  assert.strictEqual(P.geometryFor("DU-T3", du("DU 60x60x6")), null);
});

check("the drawings carry both views, the slots, the post and the owner's dimensions", () => {
  ["DU-T2", "DU-B2"].forEach(code => {
    const out = W.duSlabFaceDrawing.draw(code, du("DU 60x60x6"));
    const svg = out.svg;
    assert(svg.includes(`${code}  DU POST TO CONCRETE SLAB FACE`), `${code} title`);
    assert(svg.includes("— PLAN") && svg.includes("— ELEVATION 1"));
    assert((svg.match(/data-cad="hole"/g) || []).length === 2, "two slots");
    assert(svg.includes(">180<") && svg.includes(">120<") && svg.includes(">70<") && svg.includes(">14<") && svg.includes(">8<"));
    assert(svg.includes(code === "DU-T2" ? ">280<" : ">250<"));
    assert(svg.includes(code === "DU-T2" ? ">50<" : ">35<"));
    assert(svg.includes("±29 MM") && svg.includes("VERTICAL") && svg.includes("ADJUSTMENT"));
    assert(svg.includes("POST TO BE WELDED TO PLATE"));
    assert(svg.includes(code === "DU-T2" ? "6mm thick S.S top plate" : "6mm thick S.S base plate"));
    assert(svg.includes('data-cad="steelCut"') && svg.includes('data-cad="steelFace"') && svg.includes('data-cad="dim"'));
    assert(svg.includes("2 × M12 IN 14 × 70 SLOTS"));
    // the section is the selected one: two rounded channels with its fold radius
    assert(svg.includes("2 x UP 60x60x6 welded web to web") && svg.includes("Ri 9 mm"), "section note");
    const cut = svg.match(/<g data-cad="steelCut">([\s\S]*?)<\/g>/g) || [];
    const channelGroup = cut.find(group => (group.match(/<polygon/g) || []).length === 2);
    assert(channelGroup, "two channel polygons in one cut-steel group");
    const pointCount = (channelGroup.match(/<polygon points="([^"]+)"/)[1].trim().split(/\s+/)).length;
    assert(pointCount > 30, `rounded folds carry arc points (${pointCount})`);
  });
});

check("the library rows DU-T2 / DU-B2 take M12 anchors as the slots require", () => {
  const rows = W.connectionsDatabase.connections.filter(c => c.code === "DU-T2" || c.code === "DU-B2");
  assert.strictEqual(rows.length, 2);
  rows.forEach(row => {
    assert.strictEqual(row.minimumAnchorSize_mm, 12, `${row.code} minimum anchor`);
    assert(/M12/.test(row.bolts["RGM BOLTS"]) && /M12/.test(row.bolts["FAZ II BOLTS"]) && /M12/.test(row.bolts["FAZ II PLUS BOLTS"]), `${row.code} SKUs`);
  });
  const C = W.connectionSelectionEngine;
  const light = C.select({ type: "DU", supportCondition: "simplySupported", loadType: "udl", length_mm: 1000, section: du("DU 60x60x6"), finalCapacity_kN: 3, numberOfTies: 3,
    headFixing: "DU POST TO CONCRETE SLAB FACE", baseFixing: "DU POST TO CONCRETE SLAB FACE", headBoltFamily: "RGM BOLTS", baseBoltFamily: "FAZ II BOLTS" });
  assert.strictEqual(light.head.code, "DU-T2");
  assert.strictEqual(light.base.code, "DU-B2");
  assert(/M12/.test(light.head.boltSku), `a light load still gets M12, got ${light.head.boltSku}`);
  assert(/M12/.test(light.base.boltSku), `FAZ II M12, got ${light.base.boltSku}`);
  assert.strictEqual(light.head.boltCount, 2);
  assert.strictEqual(light.base.boltCount, 2);
});

check("the Selector shows the DU connection drawings and loads what they need", () => {
  const app = fs.readFileSync(path.join(root, "js/ui/app.js"), "utf8");
  assert(app.includes("duConnectionDrawingsHtml") && app.includes("duSlabFaceDrawing"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  ["du-slab-face-plates.js", "du-slab-face-drawing-service.js", "dxf-r2000-writer.js", "sheet-export-service.js"]
    .forEach(file => assert(html.includes(file), `${file} in index.html`));
  assert(html.indexOf("du-slab-face-plates.js") < html.indexOf("du-slab-face-drawing-service.js"));
  assert(html.indexOf("baseplate-svg-engine.js") < html.indexOf("du-slab-face-drawing-service.js"));
});

console.log(`\n${passed} DU slab-face checks passed.`);
