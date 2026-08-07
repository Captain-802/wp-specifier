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
const failures = [];

function check(condition, message, detail) {
  if (!condition) failures.push({ message, detail });
}

function calculateU(cavity, depth, outerLeaf = 100) {
  return W.outerTieSelectionEngine.calculateWallAndTie(
    { type: "U", a_mm: depth },
    {
      innerLeafThickness_mm: 100,
      cavityWidth_mm: cavity,
      outerLeafThickness_mm: outerLeaf
    }
  );
}

// The uploaded table's embedment values follow the older "nominal − 10" rule.
// The engine now uses the drawing geometry (nominal + 8 − 18.77), so the same
// tie is selected but every embedment is 0.77 mm smaller than the table cell.
const EMBEDMENT_SHIFT_MM = 0.77;

function verifyUReference(cavity, depth, expectedLength, expectedEmbedment) {
  const result = calculateU(cavity, depth);
  check(
    result.suitable &&
      result.selectedTieLength_mm === expectedLength &&
      Math.abs(result.outerEmbedment_mm - (expectedEmbedment - EMBEDMENT_SHIFT_MM)) < 1e-6,
    "U tie selection differs from the uploaded EDC table cell",
    { cavity, depth, expectedLength, expectedEmbedment, result }
  );
}

// EDC cells transcribed from both uploaded U-table photographs.
const uEdcReferenceCells = [
  [90, 55, 100, 61],
  [100, 55, 125, 76],
  [100, 60, 100, 56],
  [110, 65, 125, 76],
  [115, 75, 100, 56],
  [125, 75, 125, 71],
  [135, 90, 125, 76],
  [140, 105, 100, 61],
  [150, 85, 125, 56],
  [160, 95, 125, 56],
  [165, 105, 125, 61],
  [175, 95, 150, 66],
  [185, 115, 150, 76],
  [190, 120, 150, 76],
  [200, 105, 175, 76],
  [210, 120, 150, 56],
  [225, 115, 175, 61],
  [240, 120, 200, 76],
  [250, 55, 275, 76],
  [260, 80, 250, 66],
  [275, 90, 250, 61],
  [285, 105, 250, 66],
  [300, 55, 325, 76],
  [310, 85, 300, 71],
  [325, 95, 300, 66],
  [340, 110, 300, 66],
  [350, 55, 375, 76],
  [360, 90, 350, 76],
  [375, 60, 375, 56],
  [385, 70, 375, 56]
];

for (const cell of uEdcReferenceCells) verifyUReference(...cell);

// These positions were labelled U-Tie in the older photograph. The later
// confirmed requirement is EDC-only, so EDC25-100 is the expected supply.
const formerUTieCells = [
  [90, 70, 100, 76],
  [90, 75, 100, 81],
  [100, 85, 100, 81],
  [125, 110, 100, 81],
  [135, 120, 100, 81]
];

for (const cell of formerUTieCells) verifyUReference(...cell);

// Exercise each EDC length and the exact 55 mm minimum-embedment boundary.
// Usable projection = nominal + 8 − 18.77, so 55 mm embedment occurs at
// gap = nominal − 65.77.
for (const tieLength of W.outerTieSelectionEngine.EDC_TIE_LENGTHS_MM) {
  const gap = tieLength - 65.77;
  const cavity = gap + 6 + 55;
  const result = calculateU(cavity, 55);
  check(
    result.suitable &&
      result.selectedTieLength_mm === tieLength &&
      Math.abs(result.outerEmbedment_mm - 55) < 1e-6,
    "EDC boundary selection failed",
    { tieLength, gap, result }
  );
}

// Verify the L-post placement rule used by the same automatic selector.
const lReferences = [
  { depth: 125, cavity: 90, tie: 125, embedment: 59.23, gap: 55 },
  { depth: 160, cavity: 150, tie: 150, embedment: 59.23, gap: 80 },
  // Old rule gave EDC25-225 with exactly 55 mm here; the drawing geometry
  // shows only 54.23 mm would actually embed, so the next size is required.
  { depth: 180, cavity: 250, tie: 250, embedment: 79.23, gap: 160 },
  { depth: 200, cavity: 300, tie: 275, embedment: 74.23, gap: 190 }
];

for (const reference of lReferences) {
  const result = W.outerTieSelectionEngine.calculateWallAndTie(
    { type: "L", a_mm: reference.depth },
    {
      innerLeafThickness_mm: 100,
      cavityWidth_mm: reference.cavity,
      outerLeafThickness_mm: 100
    }
  );
  check(
    result.suitable &&
      result.outerGap_mm === reference.gap &&
      result.selectedTieLength_mm === reference.tie &&
      Math.abs(result.outerEmbedment_mm - reference.embedment) < 1e-6,
    "L outer-tie placement or selection failed",
    { reference, result }
  );
}

// End-to-end automatic selections must report the tie calculated for the
// section that the structural selector actually chooses.
const automaticCases = [
  {
    input: {
      type: "U", supportCondition: "simplySupported", loadType: "udl",
      mode: "automatic", length_mm: 2500, requiredLoad_kN: 3,
      wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 100, outerLeafThickness_mm: 100 }
    }
  },
  {
    input: {
      type: "L", supportCondition: "cantilever", loadType: "udl",
      mode: "automatic", length_mm: 1200, requiredLoad_kN: 5,
      wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 }
    }
  }
];

for (const testCase of automaticCases) {
  const design = W.automaticSelectionEngine.runDesign(testCase.input);
  check(design.valid, "end-to-end automatic selection failed", { input: testCase.input, design });
  if (design.valid) {
    const repeated = W.outerTieSelectionEngine.calculateWallAndTie(
      design.selected.section,
      testCase.input.wall
    );
    check(
      design.selected.wall.outerTie === repeated.outerTie &&
        design.selected.wall.outerEmbedment_mm === repeated.outerEmbedment_mm,
      "automatic result does not carry the selected section's tie result",
      { input: testCase.input, design, repeated }
    );
  }
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} outer-tie checks failed.`);
  console.error(JSON.stringify(failures.slice(0, 20), null, 2));
  process.exit(1);
}

console.log(`PASS: ${uEdcReferenceCells.length} uploaded U-table EDC cells match exactly.`);
console.log(`PASS: ${formerUTieCells.length} former U-Tie cells follow the confirmed EDC25-100-only rule.`);
console.log(`PASS: all ${W.outerTieSelectionEngine.EDC_TIE_LENGTHS_MM.length} EDC boundary lengths select with 55 mm embedment.`);
console.log(`PASS: ${lReferences.length} L-post placement and outer-tie cases match the 90 mm inner-leaf embedment rule.`);
console.log(`PASS: ${automaticCases.length} complete automatic designs carry the correct selected outer tie.`);
