"use strict";

// Proves the outer-tie engine honours custom tie NAMES and per-tie ACTUAL
// lengths supplied via windpost.parameters.tie.list — i.e. a maintainer can
// rename ties or add ties whose actual length is not nominal + 8.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const failures = [];
const check = (cond, msg, data) => { if (!cond) failures.push({ msg, data }); };

// Sandbox with a CUSTOM, deliberately out-of-order, non-(nominal+8) tie list.
const ctx = vm.createContext({ console, window: {} });
ctx.window.window = ctx.window;
ctx.window.Windpost = {
  parameters: {
    tie: {
      list: [
        { name: "LONGZILLA", nominal_mm: 300, actual_mm: 322 },   // odd extra (+22)
        { name: "SHORTIE", nominal_mm: 90, actual_mm: 100 },       // smallest, listed 2nd
        { name: "MY-CUSTOM-TIE", nominal_mm: 140, actual_mm: 150 } // middle, custom name
      ],
      notch_mm: 7.6, tailBeyondNotch_mm: 11.17,
      minEmbedment_mm: 55, minGap_mm: 4,
      uInnerClearance_mm: 6, lInnerLeafEmbedment_mm: 90
    }
  }
};
vm.runInContext(
  fs.readFileSync(path.join(root, "js/engines/outer-tie-selection-engine.js"), "utf8"),
  ctx, { filename: "outer-tie-selection-engine.js" }
);
const eng = ctx.window.Windpost.outerTieSelectionEngine;

// The engine must sort by actual length regardless of workbook row order.
check(
  eng.TIE_LIST.map((t) => t.name).join(",") === "SHORTIE,MY-CUSTOM-TIE,LONGZILLA",
  "TIE_LIST is sorted smallest-actual-first regardless of input order",
  eng.TIE_LIST.map((t) => t.name)
);

// U post, depth 55, big outer leaf so embedment never limits.
const wallFor = (gap) => ({ innerLeafThickness_mm: 100, cavityWidth_mm: gap + 6 + 55, outerLeafThickness_mm: 400 });
const U = (gap) => eng.calculateWallAndTie({ type: "U", a_mm: 55 }, wallFor(gap));

// gap 20 -> requiredProjection 75; SHORTIE usable = 100-18.77 = 81.23 >= 75 -> SHORTIE.
const r1 = U(20);
check(r1.suitable && r1.outerTie === "SHORTIE" && r1.actualTieLength_mm === 100 && r1.selectedTieLength_mm === 90,
  "smallest custom tie selected by name for a small gap", r1);
check(Math.abs(r1.outerEmbedment_mm - (100 - 18.77 - 20)) < 1e-6, "embedment uses the custom actual length", r1.outerEmbedment_mm);

// gap 30 -> requiredProjection 85; SHORTIE 81.23 too short -> MY-CUSTOM-TIE (150-18.77=131.23).
const r2 = U(30);
check(r2.suitable && r2.outerTie === "MY-CUSTOM-TIE" && r2.actualTieLength_mm === 150,
  "custom-named middle tie selected when the shortest is too short", r2);

// gap 120 -> requiredProjection 175; only LONGZILLA (322-18.77=303.23) fits.
const r3 = U(120);
check(r3.suitable && r3.outerTie === "LONGZILLA" && r3.actualTieLength_mm === 322,
  "tie with a non-standard actual length (+22) is used correctly", r3);

// gap 320 -> requiredProjection 375; nothing fits; message names the longest tie.
const r4 = U(320);
check(!r4.suitable && /LONGZILLA/.test(r4.reason || ""),
  "failure message names the longest available tie", r4.reason);

if (failures.length) {
  console.error(`FAIL: ${failures.length} tie-naming check(s) failed.`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("PASS: custom tie names and per-tie actual lengths flow through selection (5 checks).");
