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

check("catalogue level strengths are unchanged by the grid, in every load case", () => {
  C.TIE_LOAD_CASES.forEach((c) => {
    assert.strictEqual(C.tieStrength("U", c), 1.713, `U ${c}`);
    assert.strictEqual(C.tieStrength("L", c), 2.25, `L ${c}`);
    assert.strictEqual(C.tieStrength("DU", c), 3.426, `DU ${c}`);
  });
  // the no-load-case call still answers, defaulting to simply supported
  assert.strictEqual(C.tieStrength("U"), 1.713);
});

check("both leaves start at the catalogue figure", () => {
  C.TIE_TYPES.forEach((t) => C.TIE_LOAD_CASES.forEach((c) => {
    const expected = t === "L" ? 2.25 : 1.713;
    assert.strictEqual(C.tieLeafStrength(t, c, "inner"), expected);
    assert.strictEqual(C.tieLeafStrength(t, c, "outer"), expected);
  }));
});

check("DEFAULT_TIE_GRID is frozen and survives an edit", () => {
  assert.ok(Object.isFrozen(C.DEFAULT_TIE_GRID));
  C.setTieStrength("U", "SS", "outer", 0.5);
  assert.strictEqual(C.DEFAULT_TIE_GRID.U.SS.outer, 1.713, "catalogue must not be mutated");
  assert.strictEqual(C.tieLeafStrength("U", "SS", "outer"), 0.5);
});

check("the weaker leaf governs the level - a weak EDC pulls the level down", () => {
  C.setTieStrength("U", "SS", "outer", 1.0);
  assert.strictEqual(C.tieStrength("U", "SS"), 1.0, "outer is now the weak end");
  assert.strictEqual(C.tieLeafStrength("U", "SS", "inner"), 1.713, "inner is untouched");
});

check("a stronger leaf does not raise the level on its own", () => {
  C.setTieStrength("U", "SS", "outer", 99);
  assert.strictEqual(C.tieStrength("U", "SS"), 1.713, "the inner tie still governs");
});

check("a DU level is the weaker leaf times two sets", () => {
  assert.strictEqual(C.setsPerLevel("DU"), 2);
  C.setTieStrength("DU", "SS", "outer", 1.0);
  assert.strictEqual(C.tieStrength("DU", "SS"), 2.0);
});

check("load cases are independent of one another", () => {
  C.setTieStrength("U", "Cant", "inner", 1.0);
  assert.strictEqual(C.tieStrength("U", "Cant"), 1.0);
  assert.strictEqual(C.tieStrength("U", "SS"), 1.713, "SS must not move");
  assert.strictEqual(C.tieStrength("U", "Point"), 1.713, "Point must not move");
});

check("post families are independent of one another", () => {
  C.setTieStrength("U", "SS", "inner", 1.0);
  assert.strictEqual(C.tieStrength("L", "SS"), 2.25);
  assert.strictEqual(C.tieStrength("DU", "SS"), 3.426);
});

check("loadCaseOf maps the selector inputs onto the grid columns", () => {
  assert.strictEqual(C.loadCaseOf("simplySupported", "udl"), "SS");
  assert.strictEqual(C.loadCaseOf("cantilever", "udl"), "Cant");
  assert.strictEqual(C.loadCaseOf("cantilever", "tipPointLoad"), "Point");
  assert.strictEqual(C.loadCaseOf("simplySupported", "tipPointLoad"), "SS",
    "a top point load is a cantilever-only model");
});

check("rubbish values and unknown cells are rejected", () => {
  [-1, 1001, NaN, Infinity, "abc", null, undefined].forEach((bad) => {
    assert.strictEqual(C.setTieStrength("U", "SS", "inner", bad), false, `${bad} rejected`);
  });
  assert.strictEqual(C.tieLeafStrength("U", "SS", "inner"), 1.713);
  assert.strictEqual(C.setTieStrength("XX", "SS", "inner", 2), false, "unknown post");
  assert.strictEqual(C.setTieStrength("U", "NOPE", "inner", 2), false, "unknown load case");
  assert.strictEqual(C.setTieStrength("U", "SS", "middle", 2), false, "unknown leaf");
});

check("zero is allowed - it discounts that leaf entirely", () => {
  assert.strictEqual(C.setTieStrength("U", "SS", "outer", 0), true);
  assert.strictEqual(C.tieStrength("U", "SS"), 0);
});

check("clearing one cell restores it; clearing a family restores all of it", () => {
  C.setTieStrength("U", "SS", "inner", 1);
  C.setTieStrength("U", "Cant", "outer", 1);
  C.clearTieStrength("U", "SS", "inner");
  assert.strictEqual(C.tieStrength("U", "SS"), 1.713);
  assert.strictEqual(C.tieStrength("U", "Cant"), 1, "the other cell still stands");
  C.clearTieStrength("U");
  assert.strictEqual(C.tieStrength("U", "Cant"), 1.713);
});

check("reset returns every cell to catalogue", () => {
  C.TIE_TYPES.forEach((t) => C.TIE_LOAD_CASES.forEach((c) =>
    C.TIE_LEAVES.forEach((f) => C.setTieStrength(t, c, f, 9))));
  C.resetTieStrengths();
  assert.strictEqual(C.tieStrength("U", "SS"), 1.713);
  assert.strictEqual(C.tieStrength("L", "Cant"), 2.25);
  assert.strictEqual(C.tieStrength("DU", "Point"), 3.426);
  assert.strictEqual(C.isTieStrengthCustom(), false);
});

check("isTieStrengthCustom narrows from family to cell", () => {
  C.setTieStrength("L", "Cant", "outer", 3);
  assert.strictEqual(C.isTieStrengthCustom("L", "Cant", "outer"), true);
  assert.strictEqual(C.isTieStrengthCustom("L", "Cant", "inner"), false);
  assert.strictEqual(C.isTieStrengthCustom("L", "SS"), false);
  assert.strictEqual(C.isTieStrengthCustom("L"), true);
  assert.strictEqual(C.isTieStrengthCustom("U"), false);
  assert.strictEqual(C.isTieStrengthCustom(), true);
});

check("listTieStrengths yields one row per cell, named by leaf", () => {
  const rows = C.listTieStrengths();
  assert.strictEqual(rows.length, 3 * 3 * 2, "3 posts x 3 cases x 2 leaves");
  const uss = rows.filter((r) => r.type === "U" && r.loadCase === "SS");
  assert.deepStrictEqual(uss.map((r) => r.label), ["U tie", "EDC tie"]);
  assert.deepStrictEqual(rows.filter((r) => r.type === "L" && r.loadCase === "SS")
    .map((r) => r.label), ["Shear tie", "EDC tie"]);
  assert.strictEqual(uss[0].caseLabel, "Simply supported");
});

check("listTieLevelStrengths reports the resolved level value per case", () => {
  const rows = C.listTieLevelStrengths();
  assert.strictEqual(rows.length, 9, "3 posts x 3 cases");
  const duPoint = rows.find((r) => r.type === "DU" && r.loadCase === "Point");
  assert.strictEqual(duPoint.value, 3.426);
  assert.strictEqual(duPoint.setsPerLevel, 2);
  C.setTieStrength("DU", "Point", "outer", 1);
  const after = C.listTieLevelStrengths().find((r) => r.type === "DU" && r.loadCase === "Point");
  assert.strictEqual(after.value, 2, "min(1.713, 1) x 2");
  assert.strictEqual(after.defaultValue, 3.426, "catalogue still reported");
  assert.strictEqual(after.custom, true);
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
  // both ends of the load path must be raised - lifting one alone is capped
  // by the other, which is the whole point of the weakest-link rule
  C.setTieStrength("U", "SS", "inner", 3.426);
  const halfRaised = capacityOf("U", "UP 115x60x6", 2670);
  assert.strictEqual(halfRaised.totalTiesCapacity, base.totalTiesCapacity,
    "raising only the inner tie must not move the level");
  C.setTieStrength("U", "SS", "outer", 3.426);
  const raised = capacityOf("U", "UP 115x60x6", 2670);
  assert.strictEqual(raised.totalTiesCapacity, base.totalTiesCapacity * 2,
    "tie capacity is ties x strength, so doubling the strength doubles it");
  assert.ok(raised.ultimateDesignValue >= base.ultimateDesignValue);
});

check("the DU engine picks up an edited U through the 2-set rule", () => {
  const args = { section: "DU 115x60x6", length_mm: 2670, supportCondition: "simplySupported" };
  const base = W.duCapacityEngine.capacity(args);
  C.setTieStrength("U", "SS", "inner", 2);
  C.setTieStrength("U", "SS", "outer", 2);
  C.setTieStrength("DU", "SS", "inner", 2);
  C.setTieStrength("DU", "SS", "outer", 2);
  const edited = W.duCapacityEngine.capacity(args);
  assert.ok(base.valid && edited.valid, "both DU capacity runs must be valid");
  assert.strictEqual(base.tieStrengthPerLevel_kN, 3.426);
  assert.strictEqual(edited.tieStrengthPerLevel_kN, 4);
  assert.strictEqual(edited.singleChannelTieStrength_kN, 2);
});

check("zero tie strength drives the tie capacity to zero", () => {
  C.setTieStrength("U", "SS", "outer", 0);
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
  C.setTieStrength("U", "SS", "inner", 3);
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
