"use strict";

// Connection / bolt / weight engine, DU and I posts.
// Golden values come from WINDPOST_CALCULATOR_V2.xlsx (Selector, Connections,
// BasePlates, Bolts), verified against the original workbook on 11 Sep 2026.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, window: {} });
context.window.window = context.window;

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
  "js/engines/automatic-selection-engine.js",
  "js/engines/connection-selection-engine.js",
  "js/services/design-report-service.js"
].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));

const W = context.window.Windpost;
const C = W.connectionSelectionEngine;
let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
}
const near = (a, b, tol = 1e-6) => Math.abs(Number(a) - Number(b)) <= tol;

// ---- catalogues ----------------------------------------------------------
assert(W.sectionProfileEngine.getSections("DU", "simplySupported").length === 12, "12 DU sections are available for simply supported posts");
assert(W.sectionProfileEngine.getSections("DU", "cantilever").length === 0, "DU posts are not offered for cantilevers");
assert(W.sectionProfileEngine.getSections("I", "simplySupported").length === 4, "4 I sections are available");
assert(W.config.DEFAULT_TIE_STRENGTH_KN.DU === 1.713 && W.config.DEFAULT_TIE_STRENGTH_KN.I === 2.25, "DU uses the U tie strength and I uses the L (shear tie) strength");

const duCant = W.automaticSelectionEngine.runDesign({
  type: "DU", supportCondition: "cantilever", loadType: "udl", mode: "automatic", length_mm: 1500, requiredLoad_kN: 4,
  wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 200, outerLeafThickness_mm: 100 }
});
assert(!duCant.valid && duCant.message.includes("simply supported only"), "a DU cantilever is rejected");

// ---- I post: computed capacity equals the old hardcoded table --------------
const iCase = W.automaticSelectionEngine.runDesign({
  type: "I", supportCondition: "simplySupported", loadType: "udl", mode: "manual", length_mm: 2500, selectedSectionName: "I_90 X 8",
  wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 100, outerLeafThickness_mm: 100 }
});
assert(iCase.valid && Math.floor(iCase.selected.finalCapacity_kN * 100) / 100 === 4.89, "I_90 X 8 at 2500 mm gives 4.89 kN (workbook I table, rounded down to 2 dp)");
assert(iCase.selected.wall.outerTie === "None" && iCase.selected.wall.innerTie === "Shear tie", "I post has shear ties only and no outer tie");

// ---- workbook test case: LP 130x70x5, 1000 mm, manual -----------------------
const lCase = W.automaticSelectionEngine.runDesign({
  type: "L", supportCondition: "simplySupported", loadType: "udl", mode: "manual", length_mm: 1000, selectedSectionName: "LP 130x70x5",
  wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 200, outerLeafThickness_mm: 100 }
});
assert(lCase.valid && near(lCase.selected.finalCapacity_kN, 6.75, 1e-9), "LP 130x70x5 at 1000 mm: 6.75 kN (3 ties x 2.25)");
const lConn = C.select({
  type: "L", supportCondition: "simplySupported", loadType: "udl", length_mm: 1000,
  section: lCase.selected.section, finalCapacity_kN: lCase.selected.finalCapacity_kN, numberOfTies: 3,
  headFixing: "L POST TO CONCRETE SLAB UNDERSIDE", baseFixing: "L POST TO TIMBER JOIST",
  headBoltFamily: "FAZ II BOLTS", baseBoltFamily: "Stainless Steel Bolts", postsCount: 3, deliveries: 1, debondingSleeve: true
});
assert(lConn.valid && lConn.head.code === "L-T2" && lConn.base.code === "L-B1", "L fixings resolve to L-T2 / L-B1");
assert(lConn.head.postBolt === "KM12/30  M12X30 Set Screw" && lConn.base.postBolt === "KM12/30  M12X30 Set Screw", "post bolts KM12/30 at both ends");
assert(lConn.head.boltSku === "KM10FAZ  M10/30 x 126 mm" && lConn.base.boltSku === "KM12/100  M12X100 Set Screw", "head FAZ II M10 anchor and base KM12/100 set screw");
assert(lConn.head.boltCount === 2 && lConn.base.boltCount === 2, "two bolts at each end");
assert(near(lConn.post.weight_kg, 7.77, 1e-9), "post weight 7.77 kg (blank x t x L x density)");
assert(near(lConn.head.weight_kg, 1.574, 1e-9) && near(lConn.base.weight_kg, 1.768, 1e-9), "bracket weights 1.574 / 1.768 kg");
assert(near(lConn.totalWeightPerPost_kg, 11.112, 1e-9) && near(lConn.totalWeightAllPosts_kg, 33.336, 1e-9), "total 11.112 kg per post, 33.336 kg for 3 posts");
assert(lConn.ties.debondingSleeves === 3, "three debonding sleeves for three shear ties");

// ---- section-dependent base plate (U-B3 / L-B2) ----------------------------
const up90 = W.uSectionDatabase.sections.find((s) => s.name === "UP 90x60x6");
const up55 = W.uSectionDatabase.sections.find((s) => s.name === "UP 55x60x4");
assert(near(C.standardPlateWeight(up55), 1.52) && near(C.standardPlateWeight(up90), 1.77), "U-B3 plate 1.52 kg up to UP 90x60x5 and 1.77 kg from UP 90x60x6");
const uTop = C.select({
  type: "U", supportCondition: "simplySupported", loadType: "udl", length_mm: 2500, section: up90, finalCapacity_kN: 5, numberOfTies: 10,
  headFixing: "U POST TO CONCRETE SLAB FACE B", baseFixing: "U POST TO CONCRETE TOP ", headBoltFamily: "RGM BOLTS", baseBoltFamily: "RGM BOLTS"
});
assert(uTop.base.code === "U-B3B" && uTop.base.libraryCode === "U-B3" && near(uTop.base.weight_kg, 1.77), "U-B3 (type U-B3B for a 90 deep post) takes the selected section's standard plate weight");
assert(uTop.head.boltSku === "KM10RES  RG M10 x 130 mm" && uTop.base.boltSku === "KM10RES  RG M10 x 130 mm", "RGM anchors selected by load (capacity/2 rule)");
const uHeavy = C.select({ ...{ type: "U", supportCondition: "simplySupported", loadType: "udl", length_mm: 2500, section: up90, numberOfTies: 10, headFixing: "U POST TO CONCRETE SLAB FACE B", baseFixing: "U POST TO CONCRETE TOP ", headBoltFamily: "RGM BOLTS", baseBoltFamily: "RGM BOLTS" }, finalCapacity_kN: 20 });
assert(uHeavy.head.boltSku === "KM12RES  RG M12 x 160 mm", "a 20 kN post moves the tensile anchor up to RGM 12 (10 kN > 2 x 4.5)");

// ---- cantilever plate type by moment (W.H for point load, W.H/2 for UDL) ---
const lp150 = W.lSectionDatabase.sections.find((s) => s.name === "LP 150x70x6");
const cantPoint = C.select({ type: "L", supportCondition: "cantilever", loadType: "tipPointLoad", length_mm: 1500, section: lp150, finalCapacity_kN: 4, numberOfTies: 6 });
assert(near(cantPoint.base.moment_kNm, 6.0) && cantPoint.base.code === "L-D", "L cantilever, 4 kN point at 1.5 m: M = 6.0 kNm -> plate L-D");
assert(cantPoint.base.boltCount === 6 && cantPoint.base.boltSku === "KM12RES  RG M12 x 160 mm", "L-D carries 6 RGM 12 anchors");
assert(near(cantPoint.base.weight_kg, 6.6, 1e-9), "L-D plate + stiffener for LP 150x70x6 = 6.60 kg (varies with section depth)");
assert(!cantPoint.head.applicable && cantPoint.head.weight_kg === 0, "cantilever posts have no head connection");
const cantUdl = C.select({ type: "L", supportCondition: "cantilever", loadType: "udl", length_mm: 1500, section: lp150, finalCapacity_kN: 4, numberOfTies: 6 });
assert(near(cantUdl.base.moment_kNm, 3.0) && cantUdl.base.code === "L-B", "same load as UDL: M = 3.0 kNm -> plate L-B");
const lp125 = W.lSectionDatabase.sections.find((s) => s.name === "LP 125x70x4");
const bp = C.basePlateWeight(W.connectionsDatabase.basePlates.find((p) => p.code === "L-G"), lp125);
assert(near(bp.totalKg, 11.25), "L-G plate for LP 125x70x4 weighs 11.25 kg (workbook table)");
const huge = C.select({ type: "U", supportCondition: "cantilever", loadType: "tipPointLoad", length_mm: 2200, section: up90, finalCapacity_kN: 12, numberOfTies: 9 });
assert(huge.base.code === "U-SD" && huge.base.boltSku === "Special Design", "moment beyond U-G gives special design");

// ---- DU: two ties per level, weight doubled --------------------------------
const du60 = W.duSectionDatabase.sections.find((s) => s.name === "DU 60x60x6");
const duConn = C.select({ type: "DU", supportCondition: "simplySupported", loadType: "udl", length_mm: 1000, section: du60, finalCapacity_kN: 6, numberOfTies: 3,
  headFixing: "DU POST TO SLAB UNDERSIDE", baseFixing: "DU POST ON CONCRETE TOP", headBoltFamily: "RGM BOLTS", baseBoltFamily: "RGM BOLTS" });
assert(duConn.ties.innerCount === 6 && duConn.ties.outerCount === 6, "DU shows two ties per level");
assert(near(duConn.post.weight_kg, 15.27, 1e-9), "DU 60x60x6 at 1 m weighs 15.27 kg (double U)");
assert(duConn.head.code === "DU-T3" && duConn.base.code === "DU-B3" && near(duConn.base.weight_kg, 1.52), "DU fixings resolve and DU-B3 uses the standard plate");

// ---- special connection overrides -----------------------------------------
const special = C.select({ ...{ type: "U", supportCondition: "simplySupported", loadType: "udl", length_mm: 3500, section: up55, finalCapacity_kN: 3, numberOfTies: 14,
  headFixing: "U POST TO TIMBER JOIST BB", baseFixing: "U POST TO TIMBER JOIST TB", headBoltFamily: "Stainless Steel Bolts", baseBoltFamily: "Stainless Steel Bolts" },
  special: { head: { enabled: true, weight_kg: 2.5, bolts: 6, sku: "KM16FAZ PLUS  M16/30 x 126 mm", material: "CONCRETE" } } });
assert(special.head.special && near(special.head.weight_kg, 2.5) && special.head.boltCount === 6, "special head connection uses the entered weight and bolt count");
assert(near(special.base.weight_kg, 2.299) && special.base.boltSku === "KM12/100  M12X100 Set Screw", "base keeps the library bracket U-B1B (2.299 kg, KM12/100)");
// NOTE: the bolt-quantity matrix inherited from the workbook has no KM12/100 count under U-B1A / U-B1B (0); L-B1 has 2. Data gap for the owner to fill.

// ---- report carries the connections section --------------------------------
const report = W.designReportService.buildReport(lCase, lConn);
assert(report.includes("5. Connections, bolts and weights") && report.includes("L-T2") && report.includes("11.112"), "the detailed report includes connections, bolts and weights");

console.log(`\n${passed} checks passed.`);

// ---- supply for all similar posts (13 Sep 2026) -----------------------------
{
  const sec = W.uSectionDatabase.sections.find((x) => x.name === "UP 90x60x4");
  const one = W.connectionSelectionEngine.select({
    type: "U", supportCondition: "simplySupported", loadType: "udl", length_mm: 2670, section: sec, finalCapacity_kN: 5, numberOfTies: 10,
    headFixing: "U POST TO TIMBER JOIST BB", baseFixing: "U POST TO CONCRETE TOP ", headBoltFamily: "Stainless Steel Bolts", baseBoltFamily: "RGM BOLTS", postsCount: 1, deliveries: 1
  });
  const seven = W.connectionSelectionEngine.select({
    type: "U", supportCondition: "simplySupported", loadType: "udl", length_mm: 2670, section: sec, finalCapacity_kN: 5, numberOfTies: 10,
    headFixing: "U POST TO TIMBER JOIST BB", baseFixing: "U POST TO CONCRETE TOP ", headBoltFamily: "Stainless Steel Bolts", baseBoltFamily: "RGM BOLTS", postsCount: 7, deliveries: 2
  });
  assert(one.supply.posts === 1 && seven.supply.posts === 7);
  assert(seven.supply.headBolts === one.head.boltCount * 7, "head bolts x posts");
  assert(seven.supply.baseBolts === one.base.boltCount * 7, "base bolts x posts");
  assert(seven.supply.baseBolts > 0 && seven.supply.headBolts > 0);
  assert(seven.supply.innerTies === 70, "equal");
  assert(seven.supply.outerTies === 70, "equal");
  assert(seven.supply.totalWeight_kg === seven.totalWeightAllPosts_kg, "equal");
  assert(Math.abs(seven.supply.postWeight_kg - one.post.weight_kg * 7) < 1e-6);
  const report = W.designReportService.buildReport(
    W.automaticSelectionEngine.runDesign({ type: "U", supportCondition: "simplySupported", loadType: "udl", mode: "manual", length_mm: 2670, selectedSectionName: "UP 90x60x4", wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 } }),
    seven
  );
  assert(report.includes("7 posts") && report.includes(`>${seven.supply.baseBolts}<`), "the record prints the all-posts quantities");
  console.log("PASS supply: bolts, ties and weights scale with the number of similar posts");
}
