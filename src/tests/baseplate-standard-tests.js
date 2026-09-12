"use strict";

// The cantilever base-plate designer must reproduce the standard plate types
// (U-A..U-G / L-A..L-G from the connection library) wherever those types pass
// the full check set, and must stay within the standard practice (200/220 wide,
// 8/10 thick, pitch <= 150) when it auto-sizes.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, window: {} });
context.window.window = context.window;
[
  "js/data/connections-database.js",
  "js/data/standard-base-plate-types.js",
  "js/engines/baseplate-config.js",
  "js/engines/baseplate-bolt-engine.js",
  "js/engines/baseplate-leff-engine.js",
  "js/engines/baseplate-tstub-engine.js",
  "js/engines/baseplate-stiffener-engine.js",
  "js/engines/baseplate-shear-engine.js",
  "js/engines/baseplate-check-engine.js",
  "js/engines/baseplate-sizer-engine.js",
  "js/engines/baseplate-design-engine.js"
].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));

const W = context.window.Windpost;
const engine = W.baseplateEngine;
const plates = W.connectionsDatabase.basePlates.filter((p) => Number.isFinite(p.capacity_kNm));
let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
}

// Types whose standard geometry does not satisfy every check at the top of
// their band (documented deviations, kept in the library as the owner's data).
const KNOWN_DEVIATIONS = {
  "L-B": "bolt group (3.16 kNm band exceeds 2 x 6.6 x 230 / 1000 = 3.036 kNm)",
  "L-C": "stiffener (95 mm short of the T-section requirement)",
  "U-G": "stiffener (110 mm x 10 far below the T-section requirement at 13.56 kNm)"
};

let adopted = 0;
plates.forEach((p) => {
  const out = engine.autoDesign({ M_kNm: p.capacity_kNm, W_kN: p.capacity_kNm, H_m: 1, family: p.family });
  assert(out.ok && out.results.pass, `${p.code}: a passing design exists at the band capacity ${p.capacity_kNm} kNm`);
  assert(out.standardType === p.code, `${p.code}: the designer identifies the standard type for its band`);
  const d = out.design;
  if (KNOWN_DEVIATIONS[p.code]) {
    assert(out.basis !== "standard", `${p.code}: standard geometry is not adopted unverified (${KNOWN_DEVIATIONS[p.code]})`);
    assert(d.nRow * d.nCol === p.bolts, `${p.code}: fallback keeps the standard bolt count (${p.bolts})`);
    if (out.basis === "standard (stiffener raised)") {
      assert(d.plateLen === 2 * 55 + (d.nRow - 1) * d.pitch && d.tp === p.plateThk_mm && d.B === p.plateWid_mm, `${p.code}: standard plate kept, only the stiffener raised (${out.stiffenerRaisedFrom_mm} -> ${d.hUp} mm)`);
    }
  } else {
    adopted += 1;
    assert(out.basis === "standard", `${p.code}: standard type adopted after passing every check (${(out.results.govUtil * 100).toFixed(0)}%)`);
    assert(d.nRow * d.nCol === p.bolts && d.tp === p.plateThk_mm && d.B === p.plateWid_mm && Math.abs(d.plateLen - p.plateLen_mm) <= 2 && d.hUp === Math.max(p.stiffH1_mm, p.stiffH2_mm) && d.tw === p.stiffThk_mm,
      `${p.code}: bolts ${p.bolts}, plate ${p.plateLen_mm} x ${p.plateWid_mm} x ${p.plateThk_mm}, stiffener ${p.stiffThk_mm} x ${Math.max(p.stiffH1_mm, p.stiffH2_mm)} reproduced`);
  }
});
assert(adopted === plates.length - Object.keys(KNOWN_DEVIATIONS).length, `${adopted} of ${plates.length} standard types are reproduced exactly`);

// auto-sizing practice beyond the standard range
[["U", 15], ["L", 13], ["U", 20]].forEach(([family, M]) => {
  const out = engine.autoDesign({ M_kNm: M, W_kN: M, H_m: 1, family });
  const d = out.design;
  assert(out.ok && out.results.pass && out.basis === "auto (beyond standard types)", `${family} ${M} kNm: auto-sized special design passes`);
  assert(d.pitch <= 150 && [200, 220].includes(d.B) && [8, 10].includes(d.tp) && (d.plateLen >= 390 ? d.tp === 10 : true), `${family} ${M} kNm: pitch <= 150, width 200/220, thickness 8/10 by length`);
});

// width and thickness rules by plate length
assert(W.baseplateSizer.widthFor(260, W.baseplateConfig) === 200 && W.baseplateSizer.widthFor(261, W.baseplateConfig) === 220, "plates up to 260 long are 200 wide, longer plates 220");
assert(W.baseplateSizer.minThicknessFor(389, W.baseplateConfig) === 8 && W.baseplateSizer.minThicknessFor(390, W.baseplateConfig) === 10, "plates from 390 long are 10 thick");

console.log(`\n${passed} base-plate standard checks passed.`);
