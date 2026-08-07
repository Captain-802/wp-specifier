"use strict";

// Tie strengths are editable from the Design assumptions panel. These checks
// pin the override layer: the catalogue values must survive, an edit must
// reach the capacity, and DU must keep following U unless it is given a value
// of its own.

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
global.window = global;
global.Windpost = {};

[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/data/l-section-database.js",
  "js/data/u-section-database.js",
  "js/data/du-section-database.js",
  "js/data/standard-section-heights.js",
  "js/data/section-profiles.js",
  "js/engines/secant-modulus-engine.js",
  "js/engines/load-case-engine.js",
  "js/engines/tie-capacity-engine.js",
  "js/engines/result-selection-engine.js",
  "js/engines/windpost-calculation-engine.js",
  "js/engines/outer-tie-selection-engine.js",
  "js/engines/automatic-selection-engine.js",
  "js/engines/du-capacity-engine.js"
].forEach((file) => require(path.join(root, file)));

const W = global.Windpost;
const C = W.config;

let passed = 0;
function check(name, task) {
  C.resetAllAssumptions();    // every check starts from the catalogue
  task();
  C.resetAllAssumptions();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

check("catalogue tie strengths are the published values", () => {
  assert.strictEqual(C.tieStrength("U"), 1.713);
  assert.strictEqual(C.tieStrength("L"), 2.25);
  assert.strictEqual(C.tieStrength("DU"), 3.426);
});

check("DEFAULT_TIE_STRENGTH_KN is frozen and survives an edit", () => {
  assert.ok(Object.isFrozen(C.DEFAULT_TIE_STRENGTH_KN));
  C.setTieStrength("U", 2.5);
  assert.strictEqual(C.DEFAULT_TIE_STRENGTH_KN.U, 1.713, "catalogue must not be mutated");
  assert.strictEqual(C.tieStrength("U"), 2.5);
});

check("an edited U tie carries the DU value with it (2 sets per level)", () => {
  C.setTieStrength("U", 2);
  assert.strictEqual(C.tieStrength("DU"), 4);
});

check("an explicit DU value breaks the link to U", () => {
  C.setTieStrength("DU", 5);
  C.setTieStrength("U", 2);
  assert.strictEqual(C.tieStrength("DU"), 5, "DU was set by hand, so it must not follow U");
  assert.strictEqual(C.tieStrength("U"), 2);
});

check("clearing DU restores the link to U", () => {
  C.setTieStrength("DU", 5);
  C.setTieStrength("U", 2);
  C.clearTieStrength("DU");
  assert.strictEqual(C.tieStrength("DU"), 4);
});

check("L is independent of U", () => {
  C.setTieStrength("U", 9);
  assert.strictEqual(C.tieStrength("L"), 2.25);
});

check("reset returns every tie to its catalogue value", () => {
  C.setTieStrength("U", 9);
  C.setTieStrength("L", 9);
  C.setTieStrength("DU", 9);
  C.resetTieStrengths();
  assert.strictEqual(C.tieStrength("U"), 1.713);
  assert.strictEqual(C.tieStrength("L"), 2.25);
  assert.strictEqual(C.tieStrength("DU"), 3.426);
  assert.strictEqual(C.isTieStrengthCustom(), false);
});

check("rubbish values are rejected and leave the current value standing", () => {
  [-1, 1001, NaN, Infinity, "abc", null, undefined].forEach((bad) => {
    assert.strictEqual(C.setTieStrength("U", bad), false, `${bad} should be rejected`);
  });
  assert.strictEqual(C.tieStrength("U"), 1.713);
  assert.strictEqual(C.setTieStrength("XX", 2), false, "unknown tie type is rejected");
});

check("zero is allowed - it discounts the ties entirely", () => {
  assert.strictEqual(C.setTieStrength("U", 0), true);
  assert.strictEqual(C.tieStrength("U"), 0);
});

check("isTieStrengthCustom flags only the edited tie", () => {
  C.setTieStrength("L", 3);
  assert.strictEqual(C.isTieStrengthCustom("L"), true);
  assert.strictEqual(C.isTieStrengthCustom("U"), false);
  assert.strictEqual(C.isTieStrengthCustom(), true);
});

check("listTieStrengths reports names, values and the derived DU flag", () => {
  const plain = C.listTieStrengths();
  assert.deepStrictEqual(plain.map((t) => t.type), ["U", "L", "DU"]);
  assert.strictEqual(plain[0].label, "U tie");
  assert.strictEqual(plain[1].label, "Shear tie");
  assert.ok(/2 sets/.test(plain[2].label));
  assert.strictEqual(plain[2].derived, false);

  C.setTieStrength("U", 2);
  const edited = C.listTieStrengths();
  assert.strictEqual(edited[2].derived, true, "DU is following the edited U");
  assert.strictEqual(edited[2].value, 4);
  assert.strictEqual(edited[2].defaultValue, 3.426, "catalogue value still reported");
});

// --- the edit must actually reach the numbers -------------------------

function capacityOf(type, sectionName, length) {
  const design = W.automaticSelectionEngine.runDesign({
    mode: "manual", type, supportCondition: "simplySupported",
    loadType: "udl", length_mm: length, selectedSectionName: sectionName,
    wall: { innerLeaf_mm: 100, cavity_mm: 100, outerLeaf_mm: 102.5 }
  });
  return design.selected.calculation;
}

check("raising the U tie strength raises the tie-governed capacity", () => {
  const base = capacityOf("U", "UP 115x60x6", 2670);
  C.setTieStrength("U", 3.426);
  const raised = capacityOf("U", "UP 115x60x6", 2670);
  assert.strictEqual(raised.totalTiesCapacity, base.totalTiesCapacity * 2,
    "tie capacity is ties x strength, so doubling the strength doubles it");
  assert.ok(raised.ultimateDesignValue >= base.ultimateDesignValue);
});

check("the DU engine picks up an edited U through the 2-set rule", () => {
  const args = { section: "DU 115x60x6", length_mm: 2670, supportCondition: "simplySupported" };
  const base = W.duCapacityEngine.capacity(args);
  C.setTieStrength("U", 2);
  const edited = W.duCapacityEngine.capacity(args);
  assert.ok(base.valid && edited.valid, "both DU capacity runs must be valid");
  assert.strictEqual(base.tieStrengthPerLevel_kN, 3.426);
  assert.strictEqual(edited.tieStrengthPerLevel_kN, 4);
  assert.strictEqual(edited.singleChannelTieStrength_kN, 2);
});

check("zero tie strength drives the tie capacity to zero", () => {
  C.setTieStrength("U", 0);
  const calc = capacityOf("U", "UP 115x60x6", 2670);
  assert.strictEqual(calc.totalTiesCapacity, 0);
});

// --- design assumptions -----------------------------------------------

check("catalogue design assumptions are the published values", () => {
  assert.strictEqual(C.designValue("fy"), 127.27);
  assert.strictEqual(C.designValue("e"), 200);
  assert.strictEqual(C.designValue("secantFy"), 210);
  assert.strictEqual(C.designValue("secantN"), 7);
  assert.strictEqual(C.designValue("firstTieSpacing"), 225);
  assert.strictEqual(C.designValue("standardTieSpacing"), 225);
  assert.strictEqual(C.designValue("apply10mmLimit"), false);
});

check("DESIGN_DEFAULTS is frozen and survives an edit", () => {
  assert.ok(Object.isFrozen(C.DESIGN_DEFAULTS));
  C.setDesignValue("fy", 150);
  assert.strictEqual(C.DESIGN_DEFAULTS.fy, 127.27, "catalogue must not be mutated");
  assert.strictEqual(C.designValue("fy"), 150);
});

check("out-of-range and mistyped design values are rejected", () => {
  [0, -5, 5000, NaN, "", null, undefined, true].forEach((bad) => {
    assert.strictEqual(C.setDesignValue("fy", bad), false, `fy ${bad} should be rejected`);
  });
  assert.strictEqual(C.designValue("fy"), 127.27);
  assert.strictEqual(C.setDesignValue("nonsense", 5), false, "unknown key is rejected");
});

check("the deflection cap only accepts a boolean", () => {
  assert.strictEqual(C.setDesignValue("apply10mmLimit", "yes"), false);
  assert.strictEqual(C.setDesignValue("apply10mmLimit", 1), false);
  assert.strictEqual(C.setDesignValue("apply10mmLimit", true), true);
  assert.strictEqual(C.designValue("apply10mmLimit"), true);
});

check("resetAllAssumptions clears design values and tie strengths together", () => {
  C.setDesignValue("fy", 150);
  C.setTieStrength("U", 3);
  assert.strictEqual(C.isAnyAssumptionCustom(), true);
  C.resetAllAssumptions();
  assert.strictEqual(C.designValue("fy"), 127.27);
  assert.strictEqual(C.tieStrength("U"), 1.713);
  assert.strictEqual(C.isAnyAssumptionCustom(), false);
});

check("listDesignValues carries units, bounds and the custom flag", () => {
  const list = C.listDesignValues();
  assert.deepStrictEqual(list.map((d) => d.key), [
    "fy", "e", "secantFy", "secantN", "firstTieSpacing", "standardTieSpacing", "apply10mmLimit"
  ]);
  assert.strictEqual(list[0].unit, "N/mm²");
  assert.strictEqual(list[6].type, "boolean");
  assert.strictEqual(list[0].custom, false);
  C.setDesignValue("fy", 150);
  assert.strictEqual(C.listDesignValues()[0].custom, true);
  assert.strictEqual(C.listDesignValues()[0].defaultValue, 127.27);
});

check("a raised allowable stress raises the bending capacity", () => {
  const base = capacityOf("U", "UP 115x60x6", 2670);
  C.setDesignValue("fy", 254.54);   // double it
  const raised = capacityOf("U", "UP 115x60x6", 2670);
  assert.ok(raised.safeLoadBendingMomentBased > base.safeLoadBendingMomentBased,
    `bending should rise: ${base.safeLoadBendingMomentBased} -> ${raised.safeLoadBendingMomentBased}`);
  assert.ok(Math.abs(raised.safeLoadBendingMomentBased - base.safeLoadBendingMomentBased * 2) < 1e-6,
    "the bending-governed load is linear in fy");
});

check("a wider tie spacing gives fewer tie levels and less tie capacity", () => {
  const base = capacityOf("U", "UP 115x60x6", 2670);
  C.setDesignValue("standardTieSpacing", 450);
  const wider = capacityOf("U", "UP 115x60x6", 2670);
  assert.ok(wider.numberOfTies < base.numberOfTies,
    `${base.numberOfTies} -> ${wider.numberOfTies}`);
  assert.ok(wider.totalTiesCapacity < base.totalTiesCapacity);
});

check("the report is given the values actually used, not the catalogue", () => {
  C.setDesignValue("fy", 150);
  C.setDesignValue("standardTieSpacing", 300);
  const design = W.automaticSelectionEngine.runDesign({
    mode: "manual", type: "U", supportCondition: "simplySupported", loadType: "udl",
    length_mm: 2670, selectedSectionName: "UP 115x60x6",
    wall: { innerLeaf_mm: 100, cavity_mm: 100, outerLeaf_mm: 102.5 }
  });
  assert.strictEqual(design.designDefaults.fy, 150);
  assert.strictEqual(design.designDefaults.standardTieSpacing, 300);
  assert.strictEqual(W.automaticSelectionEngine.DESIGN_DEFAULTS.fy, 127.27,
    "the engine's catalogue export stays unedited");
});

console.log(`\n${passed} checks passed.`);
