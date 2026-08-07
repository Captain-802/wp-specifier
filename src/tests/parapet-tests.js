"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, window: {} });
context.window.window = context.window;

[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/utils.js",
  "js/data/standard-section-heights.js",
  "js/data/u-section-database.js",
  "js/data/l-section-database.js",
  "js/data/section-profiles.js",
  "js/engines/secant-modulus-engine.js",
  "js/engines/load-case-engine.js",
  "js/engines/tie-capacity-engine.js",
  "js/engines/result-selection-engine.js",
  "js/engines/windpost-calculation-engine.js",
  "js/engines/outer-tie-selection-engine.js",
  "js/engines/automatic-selection-engine.js"
].forEach((file) => vm.runInContext(
  fs.readFileSync(path.join(root, file), "utf8"),
  context,
  { filename: file }
));

const W = context.window.Windpost;
const defaults = W.automaticSelectionEngine.DESIGN_DEFAULTS;
const heights = Array.from({ length: 13 }, (_value, index) => 800 + index * 100);
const failures = [];

function calculate(sectionName, height) {
  const section = W.sectionProfileEngine.allSections.find(
    (candidate) => candidate.name === sectionName
  );
  if (!section) throw new Error(`Missing section ${sectionName}`);
  const properties = W.sectionProfileEngine.getSectionProperties(section);
  return W.windpostCalculationEngine.getCalculatedDesignValues({
    ...defaults,
    length: height,
    ixx: properties.ixx_mm4,
    zxx: properties.zxx_mm3,
    area: properties.crossSectionalArea_mm2,
    tieStrength: W.config.DEFAULT_TIE_STRENGTH_KN[section.type],
    supportCondition: "cantilever",
    loadType: "udl"
  });
}

function check(condition, message, detail) {
  if (!condition) failures.push({ message, detail });
}

const uTableSections = [];
for (const depth of [55, 60, 65, 75, 85, 95, 105, 115]) {
  for (const thickness of depth === 55 ? [4, 5] : [4, 5, 6]) {
    uTableSections.push(`UP ${depth}x60x${thickness}`);
  }
}
const lTableSections = W.sectionProfileEngine
  .getSections("L", "cantilever")
  .map((section) => section.name);

let matrixPositions = 0;
for (const sectionName of [...uTableSections, ...lTableSections]) {
  for (const height of heights) {
    matrixPositions += 1;
    const result = calculate(sectionName, height);
    const expectedTies = Math.max(0, Math.floor((height - 50) / 225));
    check(
      result.numberOfTies === expectedTies,
      "parapet tie count differs from the photographed table pattern",
      { sectionName, height, actual: result.numberOfTies, expected: expectedTies }
    );
  }
}

// Representative values transcribed from the photographed UPP and LPP
// ULS UDL tables. A 0.015 kN tolerance allows their two-decimal display.
const referenceValues = [
  ["UP 55x60x4", 800, 5.14],
  ["UP 55x60x4", 900, 4.96],
  ["UP 55x60x4", 1000, 4.14],
  ["UP 55x60x4", 1200, 2.96],
  ["UP 55x60x4", 2000, 1.09],
  ["UP 60x60x5", 1000, 5.81],
  ["UP 65x60x6", 1000, 6.85],
  ["UP 115x60x6", 1400, 10.28],
  ["UP 115x60x6", 1500, 10.28],
  ["UP 115x60x6", 1600, 10.28],
  ["UP 115x60x6", 1700, 9.71],
  ["UP 115x60x6", 2000, 7.78],
  ["LP 125x70x4", 800, 6.75],
  ["LP 125x70x4", 900, 6.46],
  ["LP 125x70x4", 1000, 5.82],
  ["LP 125x70x4", 1100, 5.29],
  ["LP 125x70x4", 1200, 4.85],
  ["LP 125x70x4", 2000, 2.91],
  ["LP 125x70x6", 800, 6.75],
  ["LP 125x70x6", 900, 6.75],
  ["LP 125x70x6", 1000, 8.53],
  ["LP 125x70x6", 1100, 7.76],
  ["LP 125x70x6", 1200, 7.11],
  ["LP 125x70x6", 2000, 4.26],
  ["LP 180x80x8", 800, 6.75],
  ["LP 180x80x8", 1000, 9.00],
  ["LP 180x80x8", 1200, 11.25],
  ["LP 180x80x8", 1400, 13.50],
  ["LP 180x80x8", 1500, 13.50],
  ["LP 180x80x8", 1600, 13.50],
  ["LP 180x80x8", 1700, 13.34],
  ["LP 180x80x8", 2000, 11.34],
  ["LP 200x70x6", 800, 6.75],
  ["LP 200x70x6", 1000, 9.00],
  ["LP 200x70x6", 1200, 11.25],
  ["LP 200x70x6", 1400, 13.50],
  ["LP 200x70x6", 1500, 13.50],
  ["LP 200x70x6", 1600, 12.82],
  ["LP 200x70x6", 2000, 10.26]
];

for (const [sectionName, height, expected] of referenceValues) {
  const actual = calculate(sectionName, height).ultimateDesignValue;
  check(
    Math.abs(actual - expected) <= 0.015,
    "ULS UDL capacity differs from the photographed parapet table",
    { sectionName, height, actual, expected }
  );
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} parapet checks failed.`);
  console.error(JSON.stringify(failures.slice(0, 20), null, 2));
  process.exit(1);
}

console.log(`PASS: ${matrixPositions} UPP/LPP matrix positions use the parapet tie rule.`);
console.log(`PASS: ${referenceValues.length} photographed ULS UDL values match within 0.015 kN.`);

