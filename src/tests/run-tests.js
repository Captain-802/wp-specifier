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
  "js/data/tie-profiles.js",
  "js/data/connections-database.js",
  "js/engines/design-data-engine.js",
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
// 106 - 6 clearance - 85 deep leaves exactly the 15 mm minimum gap.
const shortGapTie = W.outerTieSelectionEngine.calculateWallAndTie(up85, {
  innerLeafThickness_mm: 100,
  cavityWidth_mm: 106,
  outerLeafThickness_mm: 100
});
assert(shortGapTie.outerTie === "EDC25-100" && Math.abs(shortGapTie.outerEmbedment_mm - 74.23) < 1e-6, "EDC25-100 is used at the smallest gap the rules allow");

// One millimetre tighter and the post no longer fits.
const tooTight = W.outerTieSelectionEngine.calculateWallAndTie(up85, {
  innerLeafThickness_mm: 100,
  cavityWidth_mm: 105,
  outerLeafThickness_mm: 100
});
assert(!tooTight.suitable && /at least 15 mm is required/.test(tooTight.reason), "a gap under 15 mm is refused");

const lp125 = W.lSectionDatabase.sections.find((section) => section.name === "LP 125x70x4");
const lTie = W.outerTieSelectionEngine.calculateWallAndTie(lp125, {
  innerLeafThickness_mm: 100,
  cavityWidth_mm: 90,
  outerLeafThickness_mm: 100
});
assert(lTie.postProjectionIntoCavity_mm === 35 && lTie.outerTie === "EDC25-125" && Math.abs(lTie.outerEmbedment_mm - 59.23) < 1e-6, "L placement uses 90 mm inner embedment and selects the outer EDC tie");

assert(uTie.innerTie === "EDC25-U tie", "the U post's inner-leaf tie carries the catalogue name");
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

// The outer leaf can also take a U tie. It is shorter than the shortest EDC,
// so in a tight cavity it reaches without burying itself past the back of a
// thin outer leaf. EDC is still preferred wherever one fits.
(function uTieServesTheOuterLeaf() {
  const E = context.window.Windpost.outerTieSelectionEngine;
  const P = context.window.Windpost.sectionProfileEngine;
  const D = context.window.Windpost.designData;
  const sec = (n) => P.getSections("U", "cantilever").find((s) => s.name === n);
  const run = (n, cavity, outer) => E.calculateWallAndTie(sec(n), {
    innerLeafThickness_mm: 100, cavityWidth_mm: cavity, outerLeafThickness_mm: outer
  });

  // At the 15 mm minimum gap the U tie can never reach the outer leaf: it
  // projects 84 - 18.77 = 65.23 mm, against 15 + 55 = 70 mm required. The
  // branch therefore only opens if the gap or the outer embedment is
  // lowered in the design data.
  const atDefault = run("UP 120x80x8", 130, 75);
  assert(!atDefault.suitable, "a 4 mm gap is refused at the 15 mm default");

  assert(D.setDesign("minimumOuterGap_mm", 4), "the minimum gap is editable");

  // Thin outer leaf: EDC25-100 would drive 85.23 mm into a 75 mm leaf.
  const tight = run("UP 120x80x8", 130, 75);
  assert(tight.suitable && tight.outerTie === "EDC25-U tie",
    "a tight cavity with a thin outer leaf uses the U tie on the outer leaf");
  assert(tight.outerEmbedment_mm <= 75 + 1e-9,
    "the U tie stays within the outer leaf");

  // Same post, normal outer leaf: the stronger EDC is preferred.
  const roomy = run("UP 120x80x8", 130, 100);
  assert(roomy.suitable && roomy.outerTie === "EDC25-100",
    "an EDC tie is preferred whenever one fits");

  // Ordinary walls are untouched.
  const normal = run("UP 90x60x6", 150, 100);
  assert(normal.suitable && normal.outerTie === "EDC25-125",
    "ordinary cavities still select the EDC tie they always did");

  // Whatever is chosen must never over-penetrate.
  [[130, 75], [125, 75], [120, 65], [150, 100], [200, 100]].forEach(([c, o]) => {
    const r = run("UP 110x60x6", c, o);
    if (r.suitable) {
      assert(r.outerEmbedment_mm <= o + 1e-9,
        `outer embedment stays within the ${o} mm leaf at ${c} mm cavity`);
    }
  });

  D.reset("design");
  assert(D.designSpec().find((d) => d.key === "minimumOuterGap_mm").current === 15,
    "the minimum gap returns to its 15 mm catalogue value");
})();
assert(true, "the U tie is scanned for the outer leaf when the cavity is tight");

// Number("") is 0, so an emptied box must not be read as a zero constant.
// Editing is forgiving: a bad entry keeps the previous value.
(function editingAConstantNeverCorrupts() {
  const D = context.window.Windpost.designData;
  const value = () => D.designSpec().find((d) => d.key === "uInnerClearance_mm").current;
  const before = value();

  ["", "   ", "abc", null, undefined, NaN, -5, 1e9].forEach((bad) => {
    const accepted = D.setDesign("uInnerClearance_mm", bad);
    assert(accepted === false, `a constant rejects ${JSON.stringify(bad)}`);
    assert(value() === before, `a rejected entry leaves the constant at ${before}`);
  });

  assert(D.setDesign("uInnerClearance_mm", 8) === true, "a valid constant is accepted");
  assert(value() === 8, "an accepted constant takes the new value");

  // Tie capacities and tie geometry go through the same parser.
  const tie = () => D.tieRows().find((t) => t.name === "EDC25-100");
  const capBefore = tie().capacity_kN;
  ["", "  ", "abc"].forEach((bad) => {
    assert(D.setTieCapacity("EDC25-100", bad) === false, `a tie capacity rejects ${JSON.stringify(bad)}`);
    assert(tie().capacity_kN === capBefore, "a rejected tie capacity keeps the previous value");
  });
  const lenBefore = tie().actual_mm;
  assert(D.setTieField("EDC25-100", "actual_mm", "") === false, "a tie length rejects a blank");
  assert(tie().actual_mm === lenBefore, "a rejected tie length keeps the previous value");

  // A new tie with no length must not be created with a zero length.
  assert(D.addTie({ name: "EDC25-BLANK", actual_mm: "" }) === false,
    "a tie cannot be added without an actual length");
  assert(!D.tieRows().some((t) => t.name === "EDC25-BLANK"), "the blank tie was not added");

  D.reset();
  assert(value() === before, "reset returns the constant to the catalogue");
})();
assert(true, "an emptied or invalid design figure keeps the previous value, never zero");

// A tie added by hand must behave like any other: its capacity, like its
// geometry, is editable. catalogueTies() does not know about added rows.
(function anAddedTieIsFullyEditable() {
  const D = context.window.Windpost.designData;
  assert(D.addTie({ name: "TEST-ADD", nominal_mm: 400, actual_mm: 408 }) === true, "a tie can be added");
  assert(D.setTieCapacity("TEST-ADD", 3.1) === true, "an added tie accepts a capacity");
  assert(D.tieRows().find((t) => t.name === "TEST-ADD").capacity_kN === 3.1, "the capacity is kept");
  assert(D.setTieField("TEST-ADD", "actual_mm", 420) === true, "an added tie can be re-measured");
  assert(D.outerTieSizes().find((t) => t.name === "TEST-ADD").actual_mm === 420, "selection sees the new length");
  assert(D.setTieCapacity("TEST-ADD", "") === false, "a blank capacity is refused");
  assert(D.tieRows().find((t) => t.name === "TEST-ADD").capacity_kN === 3.1, "a refused capacity keeps the previous value");
  assert(D.removeTie("TEST-ADD") === true, "an added tie can be removed");
  D.reset();
})();
assert(true, "a tie added by hand is as editable as a catalogue tie");

// Nothing the form can produce may throw or be silently accepted.
(function hostileInputIsRefusedNotSwallowed() {
  const run = context.window.Windpost.automaticSelectionEngine.runDesign;
  const wall = { innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100 };
  const base = { type: "U", supportCondition: "simplySupported", loadType: "udl",
    length_mm: 3000, mode: "automatic", requiredLoad_kN: 3, wall, connections: {} };
  [["height 0", { length_mm: 0 }], ["height -1", { length_mm: -1 }], ["height NaN", { length_mm: NaN }],
   ["height text", { length_mm: "abc" }], ["load 0", { requiredLoad_kN: 0 }], ["load -5", { requiredLoad_kN: -5 }],
   ["unknown type", { type: "Z" }], ["unknown support", { supportCondition: "floating" }],
   ["point load simply supported", { loadType: "tipPointLoad" }]].forEach(([label, over]) => {
    let r = null, threw = false;
    try { r = run(Object.assign({}, base, over)); } catch (e) { threw = true; }
    assert(!threw, `${label} does not throw`);
    assert(r && r.valid === false, `${label} is refused`);
    assert(typeof r.message === "string" && r.message.length > 0, `${label} says why`);
  });
})();
assert(true, "invalid form input is refused with a message and never throws");

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
  !/baseplate/i.test(selectorPage) && !/basePlate/.test(selectorPage),
  "the selector carries no base-plate code"
);
assert(
  !/baseplate-|selector\/|drawing-service|dxf-|sheet-export/i.test(indexHtml),
  "no parked base-plate, drawing or export engine is loaded"
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
