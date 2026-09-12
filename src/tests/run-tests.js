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
assert(
  uParapet.valid &&
  uParapet.selected.section.name === "UP 55x60x4" &&
  uParapet.selected.calculation.numberOfTies === 3 &&
  Math.abs(uParapet.selected.finalCapacity_kN - 5.139) < 1e-9,
  "800 mm U parapet uses three ties and reproduces the 5.14 kN table cap"
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
  "800 mm L parapet uses three ties and reproduces the 6.75 kN table cap"
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

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert(!/(?:src|href)=["']https?:\/\//i.test(indexHtml), "the application has no external web dependencies");
const selectorPage = fs.readFileSync(path.join(root, "js/ui/app.js"), "utf8");
const transferEnginePage = fs.readFileSync(
  path.join(root, "js/engines/workflow/design-transfer-engine.js"),
  "utf8"
);
assert(
  indexHtml.includes('id="detailing-tab"') &&
  selectorPage.includes("detailingHref(design)") &&
  selectorPage.includes("global.location.href = href"),
  "the selector exposes a same-tab detailing workflow"
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
