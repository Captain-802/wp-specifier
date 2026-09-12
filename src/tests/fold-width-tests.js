"use strict";

// Fold (blank) width: one engine reproduces the approved workbook's lines
// for U, L, DU and I, the post weight and both production drawings use it,
// the A4 sheet states it, and the validator warns where the workbook's U
// line and the drawn development disagree (a != b).

const assert = require("assert");
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
const root = path.resolve(__dirname, "..");
[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/engines/fold-width-engine.js",
  "js/data/l-section-database.js",
  "js/data/u-section-database.js",
  "js/data/du-section-database.js",
  "js/data/i-section-database.js",
  "js/data/connections-database.js",
  "js/data/standard-base-plate-types.js",
  "js/engines/connection-selection-engine.js",
  "js/engines/workflow/production-validation-engine.js"
].forEach(file => require(path.join(root, file)));

const W = globalThis.Windpost;
const F = W.foldWidth;
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const find = (db, name) => db.sections.find(s => s.name === name);

check("workbook lines reproduce the V2 Sections sheets", () => {
  // values read from WINDPOST_CALCULATOR_V2.xlsx (Sections_U/L/DU/I, blank_mm)
  assert.strictEqual(F.workbook(find(W.uSectionDatabase, "UP 55x60x4")), 153.62);
  assert.strictEqual(F.workbook(find(W.uSectionDatabase, "UP 55x60x5")), 149.53);
  assert.strictEqual(F.workbook(find(W.uSectionDatabase, "UP 60x60x4")), 163.62);
  assert.strictEqual(F.workbook(find(W.lSectionDatabase, "LP 125x70x4")), 186.81);
  assert.strictEqual(F.workbook(find(W.lSectionDatabase, "LP 125x70x6")), 182.72);
  assert.strictEqual(F.workbook(find(W.lSectionDatabase, "LP 130x70x4")), 191.81);
  assert.strictEqual(F.workbook(find(W.duSectionDatabase, "DU 60x60x6")), 310.88);
  assert.strictEqual(F.workbook(find(W.duSectionDatabase, "DU 65x60x6")), 330.88);
  assert.strictEqual(F.workbook(find(W.iSectionDatabase, "I_90 X 8")), 90);
  // every stored DU blank width equals the workbook line
  W.duSectionDatabase.sections.forEach(s => assert.strictEqual(F.workbook(s), s.blankWidth_mm, s.name));
});

check("the developed width agrees with the workbook for L, I and equal-leg U, and differs by a - b otherwise", () => {
  W.lSectionDatabase.sections.forEach(s => assert.strictEqual(F.developed(s), F.workbook(s), s.name));
  assert.strictEqual(F.developed(find(W.iSectionDatabase, "I_90 X 8")), 90);
  assert.strictEqual(F.developed(find(W.uSectionDatabase, "UP 60x60x4")), 163.62);
  const u = find(W.uSectionDatabase, "UP 55x60x4");
  assert.strictEqual(F.developed(u), 158.62);
  assert(Math.abs((F.workbook(u) - F.developed(u)) - (u.a_mm - u.b_mm)) < 1e-9);
  const d = F.describe(u);
  assert.strictEqual(d.basis, "workbook");
  assert.strictEqual(d.value_mm, 153.62);
  assert.strictEqual(d.agree, false);
  assert(F.describe(find(W.lSectionDatabase, "LP 125x70x6")).agree);
  assert.strictEqual(F.describe(u, "developed").value_mm, 158.62);
});

check("the post weight uses the engine (workbook basis) for every family", () => {
  const E = W.connectionSelectionEngine;
  [find(W.uSectionDatabase, "UP 55x60x4"), find(W.lSectionDatabase, "LP 125x70x6"),
    find(W.duSectionDatabase, "DU 65x60x6"), find(W.iSectionDatabase, "I_100 X 8")].forEach(s => {
    assert.strictEqual(E.blankWidth_mm(s), F.compute(s), s.name);
    assert.strictEqual(E.postWeight(s, 2670).blankWidth_mm, F.compute(s));
  });
});

check("the validator warns when the workbook fold width and the drawn blank disagree", () => {
  const V = W.productionValidationEngine;
  const warn = V.validate({ section: find(W.uSectionDatabase, "UP 55x60x4"), orthographic: { length_mm: 900, slotPlacement: { levels_mm: [] } } });
  const item = warn.checks.find(c => c.id === "fold-width");
  assert(item && !item.pass && item.severity === "warning", "U 55x60x4 warns");
  assert(/153\.62/.test(item.detail) && /158\.62/.test(item.detail), item.detail);
  const fine = V.validate({ section: find(W.lSectionDatabase, "LP 125x70x6"), orthographic: { length_mm: 900, slotPlacement: { levels_mm: [] } } });
  const ok = fine.checks.find(c => c.id === "fold-width");
  assert(ok && ok.pass && /182\.72/.test(ok.detail));
});

check("both drawings, the sheet and the Selector state the fold width", () => {
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  ["js/services/l-section-orthographic-service.js", "js/services/u-section-orthographic-service.js"].forEach(file =>
    assert(read(file).includes("FOLD WIDTH") && read(file).includes("foldWidth"), file));
  assert(read("js/ui/l-section-prototype-page.js").includes("FOLD WIDTH"));
  assert(read("js/ui/app.js").includes("Fold (blank) width"));
  ["index.html", "l-section-prototype.html"].forEach(page => {
    const html = read(page);
    assert(html.indexOf("fold-width-engine.js") > html.indexOf("config.js"), `${page} loads the engine after config`);
    assert(html.indexOf("fold-width-engine.js") < html.indexOf("connection-selection-engine.js") || page !== "index.html");
  });
  assert.strictEqual(W.config.FOLD_WIDTH_BASIS, "workbook");
});

console.log(`\n${passed} fold-width checks passed.`);
