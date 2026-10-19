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
  "js/data/du-section-database.js",
  "js/data/i-section-database.js",
  "js/data/section-profiles.js",
  "js/engines/custom-section-properties-engine.js",
  "js/engines/secant-modulus-engine.js",
  "js/engines/load-case-engine.js",
  "js/engines/tie-capacity-engine.js",
  "js/engines/result-selection-engine.js",
  "js/engines/windpost-calculation-engine.js",
  "js/engines/outer-tie-selection-engine.js",
  "js/engines/automatic-selection-engine.js",
  "js/services/design-report-service.js"
].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));

const W = context.window.Windpost;
let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
}

const defaults = W.automaticSelectionEngine.DESIGN_DEFAULTS;
assert(defaults.fy === 127.27 && defaults.e === 200, "existing fy and E defaults are preserved");
assert(defaults.secantFy === 210 && defaults.secantN === 7, "existing secant-modulus defaults are preserved");
assert(W.config.DEFAULT_TIE_STRENGTH_KN.U === 1.713 && W.config.DEFAULT_TIE_STRENGTH_KN.L === 2.25, "U and L ultimate tie strengths are preserved");
assert(W.config.PARAPET_TOP_TIE_CLEARANCE_MM === 50, "parapet top tie clearance is 50 mm");
const uSections = W.sectionProfileEngine.getSections("U", "simplySupported");
assert(uSections.length === 40, "all 40 U sections are available");
const addedUSections = [
  "UP 70x60x4", "UP 70x60x5", "UP 70x60x6",
  "UP 100x60x4", "UP 100x60x5", "UP 100x60x6",
  "UP 110x60x4", "UP 110x60x5", "UP 110x60x6"
];
assert(
  addedUSections.every(name => uSections.some(section => section.name === name)),
  "the nine requested 70, 100 and 110 mm U sections are available"
);
assert(W.sectionProfileEngine.getSections("L", "cantilever").length === 31, "all 31 L sections are available");

const up60 = W.uSectionDatabase.sections.find((section) => section.name === "UP 60x60x4");
const uTie = W.outerTieSelectionEngine.calculateWallAndTie(up60, {
  innerLeafThickness_mm: 100,
  cavityWidth_mm: 100,
  outerLeafThickness_mm: 100
});
assert(uTie.outerTie === "EDC25-100" && Math.abs(uTie.outerEmbedment_mm - 55.23) < 1e-6, "U outer-tie equation reproduces EDC25-100 with 55.23 mm embedment (drawing geometry)");

const up85 = W.uSectionDatabase.sections.find((section) => section.name === "UP 85x60x4");
const shortGapTie = W.outerTieSelectionEngine.calculateWallAndTie(up85, {
  innerLeafThickness_mm: 100,
  cavityWidth_mm: 100,
  outerLeafThickness_mm: 100
});
assert(shortGapTie.outerTie === "EDC25-100" && Math.abs(shortGapTie.outerEmbedment_mm - 80.23) < 1e-6, "EDC25-100 is used for a short outer gap; no U-Tie branch remains");

const lp125 = W.lSectionDatabase.sections.find((section) => section.name === "LP 125x70x4");
const lTie = W.outerTieSelectionEngine.calculateWallAndTie(lp125, {
  innerLeafThickness_mm: 100,
  cavityWidth_mm: 90,
  outerLeafThickness_mm: 100
});
assert(lTie.postProjectionIntoCavity_mm === 35 && lTie.outerTie === "EDC25-125" && Math.abs(lTie.outerEmbedment_mm - 59.23) < 1e-6, "L placement uses 90 mm inner embedment and selects the outer EDC tie");

assert(uTie.innerTie === "U tie", "U post inner-leaf tie is labelled 'U tie'");
assert(
  uTie.innerTieActualLength_mm === 84 &&
  Math.abs(uTie.innerTieEmbedment_mm - 65.23) < 1e-9 &&
  uTie.innerTiePostClearance_mm === 6,
  "U tie stores 84 mm actual length, 65.23 mm inner-leaf embedment and 6 mm post clearance"
);
assert(
  uTie.innerTieNote === "84 mm long; 65.23 mm embedment",
  "U-tie supply note reports the stored length and embedment"
);
assert(lTie.innerTie === "Shear tie" && lTie.innerTieNote === "for the inner leaf", "L post inner-leaf tie is labelled 'Shear tie'");

const sample = W.automaticSelectionEngine.runDesign({
  type: "U",
  supportCondition: "simplySupported",
  loadType: "udl",
  mode: "automatic",
  length_mm: 2670,
  requiredLoad_kN: 13,
  wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 }
});
assert(sample.valid && sample.selected.finalCapacity_kN >= 13, "automatic selection finds a U post for 13 kN at the exact 2670 mm height");
assert(sample.inputs.length_mm === 2670 && sample.selected.calculation.numberOfTies === 10, "arbitrary height is retained and tie quantity uses the exact height");
const uTieReport = W.designReportService.buildReport(sample);
assert(
  uTieReport.includes("84.00 mm") && uTieReport.includes("65.23 mm"),
  "detailed report carries the stored U-tie length and inner-leaf embedment"
);

const uParapet = W.automaticSelectionEngine.runDesign({
  type: "U",
  supportCondition: "cantilever",
  loadType: "udl",
  mode: "automatic",
  length_mm: 800,
  requiredLoad_kN: 4.5,
  wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 100, outerLeafThickness_mm: 100 }
});
// Tie cap 3 x 1.713 = 5.139 kN, reported rounded down as 5.13.
assert(
  uParapet.valid &&
  uParapet.selected.section.name === "UP 55x60x4" &&
  uParapet.selected.calculation.numberOfTies === 3 &&
  Math.abs(uParapet.selected.calculation.ultimateDesignValue - 5.139) < 1e-9 &&
  Math.abs(uParapet.selected.finalCapacity_kN - 5.13) < 1e-9,
  "800 mm U parapet uses three ties and gives 5.13 kN"
);

const lParapet = W.automaticSelectionEngine.runDesign({
  type: "L",
  supportCondition: "cantilever",
  loadType: "udl",
  mode: "automatic",
  length_mm: 800,
  requiredLoad_kN: 6,
  wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 90, outerLeafThickness_mm: 100 }
});
assert(
  lParapet.valid &&
  lParapet.selected.section.name === "LP 125x70x4" &&
  lParapet.selected.calculation.numberOfTies === 3 &&
  Math.abs(lParapet.selected.finalCapacity_kN - 6.75) < 1e-9,
  "800 mm L parapet uses three ties and gives 6.75 kN"
);

const pointLoad = W.automaticSelectionEngine.runDesign({
  type: "L",
  supportCondition: "cantilever",
  loadType: "tipPointLoad",
  mode: "automatic",
  length_mm: 2500,
  requiredLoad_kN: 2,
  wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 }
});
assert(pointLoad.valid, "cantilever top point-load automatic selection is supported");

const invalidPointLoad = W.automaticSelectionEngine.runDesign({
  type: "U",
  supportCondition: "simplySupported",
  loadType: "tipPointLoad",
  mode: "automatic",
  length_mm: 2500,
  requiredLoad_kN: 2,
  wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 }
});
assert(!invalidPointLoad.valid && invalidPointLoad.message.includes("cantilevers only"), "top point load is rejected for simply supported posts");

const manual = W.automaticSelectionEngine.runDesign({
  type: "U",
  supportCondition: "cantilever",
  loadType: "udl",
  mode: "manual",
  length_mm: 2835,
  selectedSectionName: "UP 105x60x5",
  wall: { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 }
});
assert(manual.valid && manual.selected.section.name === "UP 105x60x5" && manual.inputs.length_mm === 2835, "manual section mode calculates the chosen section at an arbitrary height");

// A custom section must reproduce the catalogue exactly when it is given a
// catalogue section's dimensions — same properties, capacity, tie and wall.
(function customSectionMatchesCatalogue() {
  const engine = context.window.Windpost.customSectionPropertiesEngine;
  const profiles = context.window.Windpost.sectionProfileEngine;
  const run = context.window.Windpost.automaticSelectionEngine.runDesign;
  let checked = 0;
  ["U", "L", "DU", "I"].forEach((type) => {
    profiles.getSections(type, "simplySupported").forEach((s) => {
      const p = engine.calculate(type, s.a_mm, s.b_mm, s.t_mm, s.innerRadius_mm, false);
      assert(p.valid, `custom geometry is valid for ${s.name}`);
      ["crossSectionalArea_mm2", "ixx_mm4", "zxx_mm3"].forEach((field) => {
        const got = { crossSectionalArea_mm2: p.area, ixx_mm4: p.ixx, zxx_mm3: p.zxx }[field];
        const want = s[field];
        assert(Math.abs(got - want) / Math.max(Math.abs(want), 1) < 1e-6,
          `${s.name} ${field} from geometry matches the catalogue`);
      });
      checked += 1;
    });
  });
  assert(checked >= 80, "every catalogue section was checked against the geometry calculator");
})();
assert(true, "custom sections reproduce every catalogue section's properties");

(function customDesignMatchesCatalogueDesign() {
  const run = context.window.Windpost.automaticSelectionEngine.runDesign;
  const wall = { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 };
  const cases = [
    ["U", "UP 90x60x6", { a_mm: 90, b_mm: 60, t_mm: 6, r_mm: 9 }, "cantilever"],
    ["L", "LP 125x70x4", { a_mm: 125, b_mm: 70, t_mm: 4, r_mm: 6 }, "cantilever"],
    ["DU", "DU 60x60x6", { a_mm: 60, b_mm: 60, t_mm: 6, r_mm: 9 }, "simplySupported"],
    ["I", "I_90 X 8", { a_mm: 90, b_mm: null, t_mm: 8, r_mm: 0 }, "simplySupported"]
  ];
  cases.forEach(([type, name, custom, supportCondition]) => {
    const base = { type, supportCondition, loadType: "udl", length_mm: 2000, wall, connections: {} };
    const cat = run({ ...base, mode: "manual", selectedSectionName: name });
    const cus = run({ ...base, mode: "custom", custom: { ...custom, sharpEdges: false } });
    assert(cat.selected && cus.selected, `${type} custom and catalogue both calculate`);
    assert(Math.abs(cat.selected.finalCapacity_kN - cus.selected.finalCapacity_kN) < 1e-9,
      `${type}: custom final capacity equals the catalogue section`);
    assert(cat.selected.wall.outerTie === cus.selected.wall.outerTie,
      `${type}: custom selects the same outer tie`);
  });
})();
assert(true, "a custom section designs identically to the same catalogue section");

// The design value is never rounded up: a sheet must not claim capacity the
// post does not have. Exact 2 dp values must survive untouched.
(function designValueRoundsDown() {
  const wall = { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 };
  [["U", "UP 95x60x6", 2670, "simplySupported"],
   ["L", "LP 150x70x6", 3000, "simplySupported"],
   ["DU", "DU 60x60x6", 3000, "simplySupported"],
   ["L", "LP 125x70x4", 800, "cantilever"]].forEach(([type, name, length_mm, supportCondition]) => {
    const d = W.automaticSelectionEngine.runDesign({
      type, supportCondition, loadType: "udl", length_mm,
      mode: "manual", selectedSectionName: name, wall, connections: {}
    });
    const raw = d.selected.calculation.ultimateDesignValue;
    const shown = d.selected.finalCapacity_kN;
    assert(shown <= raw + 1e-12, `${name}: reported value never exceeds the calculated one`);
    assert(raw - shown < 0.01 + 1e-12, `${name}: reported value is within one 2 dp step`);
    assert(Math.abs(shown * 100 - Math.round(shown * 100)) < 1e-6, `${name}: reported value is exactly 2 dp`);
  });
})();
assert(true, "the final design value is rounded down to 2 dp, never up");

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert(!/(?:src|href)=["']https?:\/\//i.test(indexHtml), "the application has no external web dependencies");
const selectorPage = fs.readFileSync(path.join(root, "js/ui/app.js"), "utf8");
const transferEnginePage = fs.readFileSync(
  path.join(root, "js/engines/workflow/design-transfer-engine.js"),
  "utf8"
);
// Detailing, base plates, bolts and connection details are switched off for
// this release. Re-enable these assertions when they are added back.
assert(
  !indexHtml.includes('id="detailing-tab"'),
  "the detailing tab is switched off"
);
assert(
  /aria-labelledby="step-six-title"/.test(indexHtml) &&
  /<section class="form-step" hidden aria-labelledby="step-six-title">/.test(indexHtml) &&
  /<section class="form-step" hidden aria-labelledby="step-seven-title">/.test(indexHtml),
  "the fixings and quantities steps are hidden"
);
assert(
  selectorPage.includes("const bp = null;"),
  "the selector does not run a base-plate design"
);
assert(
  !selectorPage.includes("this.connectionsBlockHtml(connections)"),
  "the connections and bolts block is not rendered"
);
assert(
  transferEnginePage.includes("sectionName: section.name") &&
  transferEnginePage.includes("length_mm: finite(inputs.length_mm)") &&
  transferEnginePage.includes("supportCondition: inputs.supportCondition") &&
  transferEnginePage.includes("loadType: inputs.loadType"),
  "the design-transfer engine receives the selected section, exact length, support and load model"
);
context.window.addEventListener = () => {};
context.window.location = {
  pathname: "/WINDPOST/Windpost-Selector-Full.html"
};
const storedDetailing = new Map();
context.window.sessionStorage = {
  setItem: (key, value) => storedDetailing.set(key, value),
  getItem: key => storedDetailing.get(key) || null
};
context.URLSearchParams = URLSearchParams;
vm.runInContext(transferEnginePage, context, {
  filename: "js/engines/workflow/design-transfer-engine.js"
});
vm.runInContext(selectorPage, context, { filename: "js/ui/app.js" });
const detailingUrl = new URL(
  context.window.windpostSelectorApp.detailingHref(lParapet),
  "http://local/"
);
assert(
  // the context runs as Windpost-Selector-Full.html, so the built Detailing
  // page is the target
  detailingUrl.pathname.endsWith("/Windpost-Detailing-Full.html") &&
  detailingUrl.searchParams.get("section") === lParapet.selected.section.name &&
  detailingUrl.searchParams.get("length") === "800" &&
  detailingUrl.searchParams.get("support") === "cantilever" &&
  detailingUrl.searchParams.get("load") === "udl",
  "the detailing URL reproduces a selected design without rounding"
);
assert(
  detailingUrl.searchParams.get("return") === "Windpost-Selector-Full.html" &&
  detailingUrl.searchParams.get("firstSlot") === "225" &&
  detailingUrl.searchParams.get("slotSpacing") === "225",
  "the standalone launcher return path and tie-slot schedule are preserved"
);
assert(
  context.window.Windpost.designTransferEngine.restore(
    context.window.sessionStorage
  ).sectionName === lParapet.selected.section.name,
  "the same validated detailing design is preserved as a JSON session snapshot"
);

console.log(`\n${passed} checks passed.`);
