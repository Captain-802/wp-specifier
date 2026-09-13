"use strict";

// Editable design data (13 Sep 2026): one capacity per tie product as in the
// workbook's Ties sheet (level = weaker of inner and outer tie), editable
// design constants, anchors, bolt SKUs / quantities and the bolt each
// connection uses; edits persist, travel in the project JSON and are
// reported. The U blank is drawn on the workbook basis (2a + b).

const assert = require("assert");
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
const root = path.resolve(__dirname, "..");
[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/engines/fold-width-engine.js",
  "js/utils.js",
  "js/data/standard-section-heights.js",
  "js/data/u-section-database.js",
  "js/data/l-section-database.js",
  "js/data/du-section-database.js",
  "js/data/i-section-database.js",
  "js/data/connections-database.js",
  "js/data/standard-base-plate-types.js",
  "js/data/section-profiles.js",
  "js/engines/secant-modulus-engine.js",
  "js/engines/load-case-engine.js",
  "js/engines/tie-capacity-engine.js",
  "js/engines/result-selection-engine.js",
  "js/engines/windpost-calculation-engine.js",
  "js/engines/outer-tie-selection-engine.js",
  "js/engines/design-data-engine.js",
  "js/engines/automatic-selection-engine.js",
  "js/engines/connection-selection-engine.js",
  "js/services/design-report-service.js",
  "js/services/cavity-wall-3d-engine.js",
  "js/services/windpost-scene-mesh-engine.js",
  "js/services/u-section-orthographic-service.js"
].forEach(file => require(path.join(root, file)));

const W = globalThis.Windpost;
const D = W.designData;
let passed = 0;
function check(name, fn) {
  D.reset();
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const WALL = { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 };
const run = (type, extra) => W.automaticSelectionEngine.runDesign({
  type, supportCondition: "simplySupported", loadType: "udl", mode: "automatic",
  length_mm: 2670, requiredLoad_kN: 13, wall: WALL, ...extra
});
const conn = (type, section, headFixing, baseFixing, extra) => W.connectionSelectionEngine.select({
  type, supportCondition: "simplySupported", loadType: "udl", length_mm: 2670, section,
  finalCapacity_kN: 5, numberOfTies: 8, headFixing, baseFixing, ...extra
});
const u = name => W.uSectionDatabase.sections.find(s => s.name === name);

check("the Ties table lists every tie product with the workbook's columns and reproduces the family strengths", () => {
  const rows = D.tieRows();
  const outer = rows.filter(t => t.kind === "outer");
  assert.strictEqual(outer.length, 12);
  assert.deepStrictEqual(outer.map(t => t.name).slice(0, 3), ["EDC25-100", "EDC25-125", "EDC25-150"]);
  const e150 = outer.find(t => t.name === "EDC25-150");
  assert(e150.nominal_mm === 150 && e150.actual_mm === 158 && e150.width_mm === 21 && e150.thickness_mm === 1.2);
  assert(outer.find(t => t.name === "EDC25-350").thickness_mm === 1.5);
  assert(rows.some(t => t.name === "U tie" && t.label === "EDC25-U Tie" && t.actual_mm === 84));
  assert(rows.some(t => t.name === "Shear tie" && t.label === "Shear Tie"));
  assert.strictEqual(D.tieCapacity("U tie"), W.config.DEFAULT_TIE_STRENGTH_KN.U);
  assert.strictEqual(D.tieCapacity("Shear tie"), W.config.DEFAULT_TIE_STRENGTH_KN.L);
  assert.strictEqual(D.levelCapacity("U", "U tie", "EDC25-150"), 1.713, "U level: the U tie governs");
  assert.strictEqual(D.levelCapacity("L", "Shear tie", "EDC25-125"), 2.25);
  assert.strictEqual(D.levelCapacity("DU", "U tie", "EDC25-200"), 1.713, "DU counted per level, as the workbook");
  assert.strictEqual(D.levelCapacity("I", "Shear tie", "None"), 2.25, "I: shear ties only");
  ["U", "L", "DU", "I"].forEach(type => assert.strictEqual(D.familyCapacity(type), W.config.DEFAULT_TIE_STRENGTH_KN[type], type));
  assert(rows.every(t => !t.edited) && D.edits().count === 0);
});

check("with catalogue values the selection is unchanged (UP 95x60x6 at 13.97 kN) and the calculation reports the tie strength it used", () => {
  const design = run("U");
  assert(design.valid && design.selected.section.name === "UP 95x60x6", design.message);
  assert.strictEqual(design.selected.finalCapacity_kN.toFixed(4), "13.9697", "same figure as before the editor (13.969662...)");
  assert.strictEqual(design.selected.calculation.tieStrength, 1.713);
  assert.strictEqual(design.designDefaults.fy, 127.27);
  const l = run("L");
  assert(l.valid && l.selected.calculation.tieStrength === 2.25);
  const du = run("DU", { requiredLoad_kN: 5 });
  assert(du.valid && du.selected.calculation.tieStrength === 1.713, "DU per level");
});

check("editing a tie capacity changes the level capacity of the posts that use that tie, weakest link governing", () => {
  const manual = { mode: "manual", selectedSectionName: "UP 95x60x6" };
  const before = run("U", manual);
  const outerTie = before.selected.wall.outerTie;
  assert(/^EDC25-\d+$/.test(outerTie), outerTie);
  assert(D.setTieCapacity(outerTie, 1.0));
  const after = run("U", manual);
  assert.strictEqual(after.selected.wall.outerTie, outerTie);
  assert.strictEqual(after.selected.calculation.tieStrength, 1.0, "the outer tie now governs");
  assert(after.selected.calculation.totalTiesCapacity < before.selected.calculation.totalTiesCapacity);
  assert(D.tieRows().find(t => t.name === outerTie).edited);
  // a stronger U tie cannot lift a U post above its EDC tie
  D.reset("ties");
  assert(D.setTieCapacity("U tie", 3.0));
  assert.strictEqual(run("U").selected.calculation.tieStrength, 2.25, "min(U tie 3.0, EDC 2.25)");
  // I posts only see the shear tie
  D.reset("ties");
  assert(D.setTieCapacity("Shear tie", 1.5));
  const i = W.automaticSelectionEngine.runDesign({ type: "I", supportCondition: "simplySupported", loadType: "udl", mode: "manual", length_mm: 2500, selectedSectionName: "I_90 X 8", wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 100, outerLeafThickness_mm: 100 } });
  assert.strictEqual(i.selected.calculation.tieStrength, 1.5);
  assert(!D.setTieCapacity("EDC25-150", -1) && !D.setTieCapacity("no such tie", 2), "bad values are refused");
  assert(D.setTieCapacity("Shear tie", 2.25) && !D.tieRows().find(t => t.name === "Shear tie").edited, "typing the catalogue value clears the edit");
});

check("design constants are editable within bounds and the run reports the values it used", () => {
  const before = run("U");
  assert(D.setDesign("fy", 150));
  assert(!D.setDesign("fy", 0) && !D.setDesign("nope", 1), "out of range / unknown refused");
  const after = run("U");
  assert.strictEqual(after.designDefaults.fy, 150);
  assert(after.selected.calculation.safeLoadBendingMomentBased > before.selected.calculation.safeLoadBendingMomentBased, "bending capacity follows fy");
  assert(D.setDesign("standardTieSpacing", 300));
  assert(run("U").selected.calculation.numberOfTies < before.selected.calculation.numberOfTies, "fewer tie levels at 300 mm");
  assert(D.setDesign("apply10mmLimit", true) && D.designValues().apply10mmLimit === true);
  assert(D.designSpec().filter(d => d.edited).length === 3);
});

check("anchors: capacities are editable, rows can be added and removed, and the connection engine picks from the edited table", () => {
  const section = u("UP 90x60x4");
  const base = conn("U", section, "U POST TO TIMBER JOIST BB", "U POST TO CONCRETE TOP ", { baseBoltFamily: "RGM BOLTS" });
  assert(base.valid && /RG M10/.test(base.base.boltSku), "5 kN: RGM 10 (shear 9.2 kN) suffices");
  assert(D.setAnchor("KM10RES  RG M10 x 130 mm", { shear: 1.0 }));
  const weaker = conn("U", section, "U POST TO TIMBER JOIST BB", "U POST TO CONCRETE TOP ", { baseBoltFamily: "RGM BOLTS" });
  assert(/RG M12/.test(weaker.base.boltSku), `RGM 10 too weak now -> ${weaker.base.boltSku}`);
  assert(D.anchors().find(a => a.sku === "KM10RES  RG M10 x 130 mm").edited);
  assert(D.removeAnchor("KM12RES  RG M12 x 160 mm"));
  const noM12 = conn("U", section, "U POST TO TIMBER JOIST BB", "U POST TO CONCRETE TOP ", { baseBoltFamily: "RGM BOLTS" });
  assert(/RG M16/.test(noM12.base.boltSku), "RGM 12 removed -> RGM 16");
  assert(D.addAnchor({ family: "RGM", name: "RGM 20", sku: "KM20RES  RG M20 x 200 mm", shear: 30, tension: 15 }));
  assert(!D.addAnchor({ family: "RGM", name: "dup", sku: "KM20RES  RG M20 x 200 mm", shear: 1, tension: 1 }), "duplicate SKU refused");
  assert(D.anchors().some(a => a.sku === "KM20RES  RG M20 x 200 mm" && a.added));
  assert(D.edits().byArea.anchors === 3 && D.edits().lines.some(l => /RGM 20/.test(l)) && D.edits().lines.some(l => /removed/.test(l)));
});

check("bolt SKUs: quantities are editable (clearing the missing-count note), SKUs can be added, chosen for a connection and removed", () => {
  const section = u("UP 55x60x4");
  const before = conn("U", section, "U POST TO TIMBER JOIST BA", "U POST TO TIMBER JOIST TA");
  assert(before.base.boltCount === 0 && before.notes.length === 1, "catalogue: no KM12/100 quantity under U-B1A");
  assert(D.setBoltSku("KM12/100  M12X100 Set Screw", { counts: { "U-B1A": 2 } }));
  const fixed = conn("U", section, "U POST TO TIMBER JOIST BA", "U POST TO TIMBER JOIST TA");
  assert(fixed.base.boltCount === 2 && fixed.notes.length === 0, "quantity now listed");
  assert(D.boltSku("KM12/100  M12X100 Set Screw").edited);
  // a new bolt, used by U-B1A under the stainless family
  assert(D.addBoltSku({ sku: "KM12/120  M12X120 Set Screw", description: "Longer set screw for deep joists" }));
  assert(!D.addBoltSku({ sku: "KM12/120  M12X120 Set Screw" }), "duplicate refused");
  assert(D.setBoltSku("KM12/120  M12X120 Set Screw", { counts: { "U-B1A": 4 } }));
  assert(D.setConnectionBolt("U-B1A", "Stainless Steel Bolts", "KM12/120  M12X120 Set Screw"));
  const swapped = conn("U", section, "U POST TO TIMBER JOIST BA", "U POST TO TIMBER JOIST TA");
  assert.strictEqual(swapped.base.boltSku, "KM12/120  M12X120 Set Screw");
  assert.strictEqual(swapped.base.boltCount, 4);
  assert(D.boltCodes().includes("U-B1A") && D.boltCodes().includes("DU-T4") && D.boltCodes().includes("I-B1A"));
  assert(D.connectionBoltRows().find(c => c.code === "U-B1A").edited);
  // removing the new SKU leaves the connection pointing at an unknown SKU with count 0 and a note
  assert(D.removeBoltSku("KM12/120  M12X120 Set Screw"));
  const gone = conn("U", section, "U POST TO TIMBER JOIST BA", "U POST TO TIMBER JOIST TA");
  assert(gone.base.boltCount === 0 && gone.notes.length === 1);
  assert(D.removeBoltSku("KM12/30  M12X30 Set Screw") && !D.boltSkus().some(r => r.sku === "KM12/30  M12X30 Set Screw"));
  assert(D.edits().lines.some(l => /KM12\/30.*removed/.test(l)));
});

check("edits serialize, restore, reset and persist through a storage object", () => {
  D.setTieCapacity("EDC25-200", 2.6);
  D.setDesign("e", 195);
  D.setAnchor("KM10FAZ  M10/30 x 126 mm", { tension: 5 });
  D.addBoltSku({ sku: "TEST-SKU", description: "test", counts: { "L-B1": 3 } });
  D.setConnectionBolt("L-B1", "Stainless Steel Bolts", "TEST-SKU");
  const saved = D.serialize();
  assert.strictEqual(D.edits().count, 5);
  D.reset();
  assert.strictEqual(D.edits().count, 0);
  assert(D.restore(saved));
  assert.strictEqual(D.edits().count, 5);
  assert.strictEqual(D.tieCapacity("EDC25-200"), 2.6);
  assert.strictEqual(D.connectionBolt("L-B1", "Stainless Steel Bolts"), "TEST-SKU");
  assert(D.restore({ ties: { "EDC25-100": "abc", "EDC25-125": 9 }, design: { fy: 99999 }, junk: 1 }));
  assert.strictEqual(D.edits().count, 1, "bad values dropped, good ones kept");
  D.reset("ties");
  assert.strictEqual(D.edits().count, 0);
  // storage
  const memory = {};
  const storage = { getItem: k => (k in memory ? memory[k] : null), setItem: (k, v) => { memory[k] = String(v); } };
  D.load(storage);
  D.setTieCapacity("EDC25-100", 1.9);
  assert(JSON.parse(memory[D.STORAGE_KEY]).ties["EDC25-100"] === 1.9, "written on change");
  D.reset();
  assert(D.load(storage) && D.edits().count === 0, "the reset was written too");
  memory[D.STORAGE_KEY] = JSON.stringify({ ties: { "EDC25-100": 1.8 } });
  assert(D.load(storage) && D.tieCapacity("EDC25-100") === 1.8);
  assert(D.load(null) === false);
  D.load(storage); D.reset();
});

check("the report lists the edits and the pages carry the editor", () => {
  D.setTieCapacity("U tie", 1.2);
  const design = run("U", { mode: "manual", selectedSectionName: "UP 95x60x6" });
  const connections = W.connectionSelectionEngine.select({ type: "U", supportCondition: "simplySupported", loadType: "udl", length_mm: 2670, section: design.selected.section, finalCapacity_kN: design.selected.finalCapacity_kN, numberOfTies: design.selected.calculation.numberOfTies, headFixing: "U POST TO TIMBER JOIST BB", baseFixing: "U POST TO TIMBER JOIST TB" });
  const report = W.designReportService.buildReport(design, connections);
  assert(report.includes("Design data edited for this calculation") && report.includes("EDC25-U Tie capacity 1.713 -&gt; 1.200 kN"), "edit line printed (HTML-escaped arrow)");
  assert(report.includes("1.200 kN/tie"), "the tie strength used is printed, not the catalogue one");
  D.reset();
  assert(!W.designReportService.buildReport(design, connections).includes("Design data edited"));
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const order = ["outer-tie-selection-engine.js", "design-data-engine.js", "automatic-selection-engine.js", "connection-selection-engine.js", "design-data-editor.js", "ui/app.js"].map(f => index.indexOf(f));
  assert(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), "script order: engine after the tie engine, before the selection engines; editor before the page");
  assert(index.includes('id="design-data-editor"') && index.includes('id="design-data-badge"'));
  const app = fs.readFileSync(path.join(root, "js/ui/app.js"), "utf8");
  assert(app.includes("initDesignData") && app.includes("designData.serialize()") && app.includes("designData.restore("));
  const detailing = fs.readFileSync(path.join(root, "l-section-prototype.html"), "utf8");
  assert(detailing.indexOf("design-data-engine.js") > detailing.indexOf("connections-database.js"));
  const editor = fs.readFileSync(path.join(root, "js/ui/design-data-editor.js"), "utf8");
  assert(!/\son\w+="/.test(editor) && !editor.includes("eval("), "CSP-safe editor");
});

check("the U blank is drawn on the workbook basis: the drawn length equals the fold width shown (2a + b)", () => {
  const section = u("UP 90x60x4");
  const fold = W.foldWidth.describe(section);
  assert.strictEqual(fold.basis, "workbook");
  const out = W.uSectionOrthographic.generate(section, 2670, {});
  const drawn = Number(out.svg.match(/data-blank-length-mm="([\d.]+)"/)[1]);
  assert.strictEqual(Math.round(drawn * 100) / 100, fold.value_mm, `${drawn} vs ${fold.value_mm}`);
  assert(out.svg.includes(`FOLD WIDTH ${fold.value_mm} mm`) || out.svg.includes(`FOLD WIDTH ${fold.value_mm.toFixed(2)} mm`));
  assert.strictEqual(fold.value_mm, 223.62);
  // a == b: both bases agree
  const square = u("UP 60x60x4");
  const sq = W.uSectionOrthographic.generate(square, 2670, {});
  assert.strictEqual(Math.round(Number(sq.svg.match(/data-blank-length-mm="([\d.]+)"/)[1]) * 100) / 100, W.foldWidth.describe(square).value_mm);
});

console.log(`\n${passed} design-data checks passed.`);
