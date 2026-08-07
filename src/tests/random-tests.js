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
].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));

const W = context.window.Windpost;
const SEED = 18072026;
const AUTOMATIC_CASES = 1200;
const MANUAL_CASES = 400;
const EDC_LENGTHS = [100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375];

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);
const between = (minimum, maximum) => minimum + random() * (maximum - minimum);
const integer = (minimum, maximum) => Math.floor(between(minimum, maximum + 1));
const choose = (items) => items[Math.floor(random() * items.length)];
const round = (value, decimals = 3) => Number(value.toFixed(decimals));
const close = (a, b, tolerance = 1e-8) => Math.abs(Number(a) - Number(b)) <= tolerance * Math.max(1, Math.abs(Number(a)), Math.abs(Number(b)));

const failures = [];
function check(condition, message, data) {
  if (!condition) failures.push({ message, data });
}

function randomInput(type, supportCondition, loadType, mode = "automatic") {
  const innerLeaf = choose([80, 90, 100, 102.5, 125, 140, 215]);
  const outerLeaf = choose([80, 90, 100, 102.5, 125, 140, 215]);
  return {
    type,
    supportCondition,
    loadType,
    mode,
    length_mm: integer(800, 6500),
    requiredLoad_kN: mode === "automatic" ? round(between(0.2, 30), 3) : null,
    wall: {
      innerLeafThickness_mm: innerLeaf,
      cavityWidth_mm: integer(70, 420),
      outerLeafThickness_mm: outerLeaf
    }
  };
}

function independentWall(section, wall) {
  const inner = Number(wall.innerLeafThickness_mm);
  const cavity = Number(wall.cavityWidth_mm);
  const outer = Number(wall.outerLeafThickness_mm);
  let projection;
  let gap;

  if (section.type === "U") {
    projection = section.a_mm;
    gap = cavity - 6 - projection;
  } else {
    if (inner < 90) return { suitable: false, reason: "inner-leaf embedment" };
    projection = section.a_mm - 90;
    gap = cavity - projection;
  }

  if (projection < 0 || gap < 4) return { suitable: false, reason: "post fit", projection, gap };
  // Drawing geometry: actual tie = nominal + 8, slot connection consumes
  // 7.6 + 11.17 = 18.77 mm, minimum outer embedment 55 mm.
  const requiredProjection = gap + 55;
  const tieLength = EDC_LENGTHS.find((length) => length + 8 - 18.77 + 1e-9 >= requiredProjection);
  if (!tieLength) return { suitable: false, reason: "tie length", projection, gap, requiredProjection };
  const embedment = tieLength + 8 - 18.77 - gap;
  if (embedment > outer) return { suitable: false, reason: "outer leaf", projection, gap, tieLength, embedment };
  return { suitable: true, projection, gap, tieLength, embedment };
}

function independentCalculation(section, input) {
  const properties = W.sectionProfileEngine.getSectionProperties(section);
  const defaults = W.automaticSelectionEngine.DESIGN_DEFAULTS;
  const calculation = W.windpostCalculationEngine.getCalculatedDesignValues({
    ...defaults,
    tieStrength: W.config.DEFAULT_TIE_STRENGTH_KN[input.type],
    length: input.length_mm,
    ixx: properties.ixx_mm4,
    zxx: properties.zxx_mm3,
    area: properties.crossSectionalArea_mm2,
    supportCondition: input.supportCondition,
    loadType: input.loadType
  });
  const expectedTieCount = input.supportCondition === "cantilever"
    ? Math.max(0, Math.floor((input.length_mm - 50) / 225))
    : Math.max(0, Math.floor((input.length_mm - 225) / 225));
  const expectedTieCapacity = expectedTieCount * W.config.DEFAULT_TIE_STRENGTH_KN[input.type];
  // The issued capacity is always truncated to two decimals, so the
  // independent expectation truncates too — computed here rather than
  // borrowed from the engine, so it stays a genuine cross-check.
  const expectedFinalCapacityExact = Math.min(
    calculation.ultimateLoadDeflectionBased,
    calculation.ultimateLoadBendingMomentBased,
    expectedTieCapacity
  );
  const expectedFinalCapacity =
    Math.floor(expectedFinalCapacityExact * 100 + 1e-9) / 100;
  return {
    calculation, expectedTieCount, expectedTieCapacity,
    expectedFinalCapacity, expectedFinalCapacityExact
  };
}

function independentEvaluation(section, input) {
  const wall = independentWall(section, input.wall);
  const structural = independentCalculation(section, input);
  return {
    section,
    wall,
    ...structural,
    suitable: wall.suitable && structural.expectedFinalCapacity + 1e-9 >= input.requiredLoad_kN
  };
}

const statistics = {
  automaticCases: 0,
  automaticSuitable: 0,
  automaticNoSolution: 0,
  manualCases: 0,
  manualWallSuitable: 0,
  types: { U: 0, L: 0 },
  supports: { simplySupported: 0, cantilever: 0 },
  loads: { udl: 0, tipPointLoad: 0 },
  minimumHeight_mm: Infinity,
  maximumHeight_mm: 0,
  minimumRequiredLoad_kN: Infinity,
  maximumRequiredLoad_kN: 0,
  selectedTies: Object.fromEntries(EDC_LENGTHS.map((length) => [length, 0]))
};
const samples = [];

for (let index = 0; index < AUTOMATIC_CASES; index += 1) {
  const type = random() < 0.5 ? "U" : "L";
  const supportCondition = random() < 0.5 ? "simplySupported" : "cantilever";
  const loadType = supportCondition === "cantilever" && random() < 0.35 ? "tipPointLoad" : "udl";
  const input = randomInput(type, supportCondition, loadType);
  const result = W.automaticSelectionEngine.runDesign(input);
  const sections = W.sectionProfileEngine.getSections(type, supportCondition);
  const independent = sections.map((section) => independentEvaluation(section, input));
  const expected = independent.find((item) => item.suitable) || null;

  statistics.automaticCases += 1;
  statistics.types[type] += 1;
  statistics.supports[supportCondition] += 1;
  statistics.loads[loadType] += 1;
  statistics.minimumHeight_mm = Math.min(statistics.minimumHeight_mm, input.length_mm);
  statistics.maximumHeight_mm = Math.max(statistics.maximumHeight_mm, input.length_mm);
  statistics.minimumRequiredLoad_kN = Math.min(statistics.minimumRequiredLoad_kN, input.requiredLoad_kN);
  statistics.maximumRequiredLoad_kN = Math.max(statistics.maximumRequiredLoad_kN, input.requiredLoad_kN);

  check(Boolean(result.valid) === Boolean(expected), "automatic availability differs from independent scan", { index, input, result: result.message, expected: expected && expected.section.name });
  if (!expected) {
    statistics.automaticNoSolution += 1;
    continue;
  }

  statistics.automaticSuitable += 1;
  const selected = result.selected;
  check(selected.section.name === expected.section.name, "automatic selector did not choose the first suitable catalogue section", { index, input, actual: selected.section.name, expected: expected.section.name });
  check(selected.finalCapacity_kN + 1e-9 >= input.requiredLoad_kN, "selected final capacity is below demand", { index, input, selected: selected.finalCapacity_kN });
  check(close(selected.finalCapacity_kN, expected.expectedFinalCapacity), "governing capacity differs from independent minimum", { index, input, actual: selected.finalCapacity_kN, expected: expected.expectedFinalCapacity });
  // The issued figure must never exceed the true capacity, and must be a
  // clean two-decimal value.
  check(selected.finalCapacity_kN <= expected.expectedFinalCapacityExact + 1e-9, "issued capacity exceeds the exact capacity", { index, input, actual: selected.finalCapacity_kN, exact: expected.expectedFinalCapacityExact });
  check(close(selected.finalCapacity_kN * 100, Math.round(selected.finalCapacity_kN * 100)), "issued capacity is not a two-decimal value", { index, input, actual: selected.finalCapacity_kN });
  check(selected.calculation.numberOfTies === expected.expectedTieCount, "tie count differs from exact-height floor equation", { index, input, actual: selected.calculation.numberOfTies, expected: expected.expectedTieCount });
  check(close(selected.calculation.totalTiesCapacity, expected.expectedTieCapacity), "ultimate tie capacity differs from count times per-tie strength", { index, input });
  check(selected.wall.selectedTieLength_mm === expected.wall.tieLength, "outer EDC tie differs from independent discrete selection", { index, input, actual: selected.wall.selectedTieLength_mm, expected: expected.wall.tieLength });
  check(close(selected.wall.outerEmbedment_mm, expected.wall.embedment), "outer tie embedment equation differs", { index, input, actual: selected.wall.outerEmbedment_mm, expected: expected.wall.embedment });
  check(selected.wall.outerEmbedment_mm >= 55 && selected.wall.outerEmbedment_mm <= input.wall.outerLeafThickness_mm, "outer tie embedment is outside accepted geometry", { index, input, embedment: selected.wall.outerEmbedment_mm });

  statistics.selectedTies[selected.wall.selectedTieLength_mm] += 1;
  if (samples.length < 12) {
    samples.push({
      case: index + 1,
      type,
      support: supportCondition,
      loadType,
      height_mm: input.length_mm,
      demand_kN: input.requiredLoad_kN,
      wall_mm: `${input.wall.innerLeafThickness_mm}/${input.wall.cavityWidth_mm}/${input.wall.outerLeafThickness_mm}`,
      section: selected.section.name,
      capacity_kN: round(selected.finalCapacity_kN),
      outerTie: selected.wall.outerTie,
      embedment_mm: round(selected.wall.outerEmbedment_mm, 1)
    });
  }
}

for (let index = 0; index < MANUAL_CASES; index += 1) {
  const type = random() < 0.5 ? "U" : "L";
  const supportCondition = random() < 0.5 ? "simplySupported" : "cantilever";
  const loadType = supportCondition === "cantilever" && random() < 0.35 ? "tipPointLoad" : "udl";
  const input = randomInput(type, supportCondition, loadType, "manual");
  const sections = W.sectionProfileEngine.getSections(type, supportCondition);
  const section = choose(sections);
  input.selectedSectionName = section.name;
  const result = W.automaticSelectionEngine.runDesign(input);
  const wall = independentWall(section, input.wall);
  const structural = independentCalculation(section, input);

  statistics.manualCases += 1;
  if (wall.suitable) statistics.manualWallSuitable += 1;
  check(result.valid === wall.suitable, "manual result validity differs from wall geometry", { index, input, wall, message: result.message });
  if (!wall.suitable) continue;
  check(result.selected.section.name === section.name, "manual mode changed the chosen section", { index, input, actual: result.selected.section.name });
  check(close(result.selected.finalCapacity_kN, structural.expectedFinalCapacity), "manual final capacity differs from independent minimum", { index, input, actual: result.selected.finalCapacity_kN, expected: structural.expectedFinalCapacity });
  check(result.selected.calculation.numberOfTies === structural.expectedTieCount, "manual tie count differs from exact-height equation", { index, input });
  check(result.selected.wall.selectedTieLength_mm === wall.tieLength, "manual outer EDC selection differs", { index, input });
}

console.log(`Random audit seed: ${SEED}`);
console.log(`Automatic cases: ${statistics.automaticCases} (${statistics.automaticSuitable} suitable, ${statistics.automaticNoSolution} correctly returned no standard solution)`);
console.log(`Manual cases: ${statistics.manualCases} (${statistics.manualWallSuitable} wall-compatible, ${statistics.manualCases - statistics.manualWallSuitable} correctly rejected by wall geometry)`);
console.log(`Coverage: U=${statistics.types.U}, L=${statistics.types.L}; simply supported=${statistics.supports.simplySupported}, cantilever=${statistics.supports.cantilever}; UDL=${statistics.loads.udl}, tip point=${statistics.loads.tipPointLoad}`);
console.log(`Height range: ${statistics.minimumHeight_mm}–${statistics.maximumHeight_mm} mm; load range: ${statistics.minimumRequiredLoad_kN.toFixed(3)}–${statistics.maximumRequiredLoad_kN.toFixed(3)} kN`);
console.log("\nFirst 12 suitable automatic samples:");
console.table(samples);
console.log("Selected EDC tie distribution:");
console.table(Object.entries(statistics.selectedTies).map(([length, count]) => ({ EDC_length_mm: Number(length), selections: count })).filter((item) => item.selections > 0));

if (failures.length) {
  console.error(`\nFAILED: ${failures.length} invariant failure(s).`);
  console.error(JSON.stringify(failures.slice(0, 10), null, 2));
  process.exitCode = 1;
} else {
  console.log(`\nPASS: all ${AUTOMATIC_CASES + MANUAL_CASES} random cases satisfied every independent invariant.`);
}
