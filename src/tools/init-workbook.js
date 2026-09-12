"use strict";

// One-time (or re-runnable) generator for windpost-database.xlsx.
// It loads the CURRENT app data in a sandbox and writes an authoritative
// workbook that exactly mirrors the live U/L sections, heights, ties and
// constants. Safe to re-run: it overwrites the workbook from source of truth.
//
// Usage:  node tools/init-workbook.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const XLSX = require("./vendor/xlsx.mini.min.js");

// --- Load the current app data chain in a sandbox --------------------------
const context = vm.createContext({ console, window: {} });
context.window.window = context.window;
[
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
const wall = W.outerTieSelectionEngine.WALL_DEFAULTS;
const tieList = W.outerTieSelectionEngine.TIE_LIST;
const design = W.automaticSelectionEngine.DESIGN_DEFAULTS;
const cfg = W.config;

// --- Section rows: name, a, b, t, inner radius, sharp flag -----------------
const sectionRows = (sections) => [
  ["name", "a_mm", "b_mm", "t_mm", "inner_radius_mm", "sharp_edges"],
  ...sections.map((s) => [s.name, s.a_mm, s.b_mm, s.t_mm, s.innerRadius_mm, "no"])
];

// --- Constants as key / value / note ---------------------------------------
const constantRows = [
  ["key", "value", "note"],
  ["fy", design.fy, "Allowable yield stress (N/mm2)"],
  ["E", design.e, "Modulus of elasticity (kN/mm2)"],
  ["secant_fy", design.secantFy, "Stainless secant-model proof strength (N/mm2)"],
  ["secant_n", design.secantN, "Ramberg-Osgood exponent n"],
  ["first_tie_spacing_mm", design.firstTieSpacing, "First tie spacing from support"],
  ["standard_tie_spacing_mm", design.standardTieSpacing, "Tie centre-to-centre spacing"],
  ["tie_strength_U_kN", cfg.DEFAULT_TIE_STRENGTH_KN.U, "Ultimate strength per U tie"],
  ["tie_strength_L_kN", cfg.DEFAULT_TIE_STRENGTH_KN.L, "Ultimate strength per L tie"],
  ["steel_density_kN_m3", cfg.DENSITY_KN_PER_M3, "Self-weight density"],
  ["parapet_top_tie_clearance_mm", cfg.PARAPET_TOP_TIE_CLEARANCE_MM, "Free-edge clearance for parapet tie count"],
  ["propped_cantilever_deflection_coeff", cfg.PROPPED_CANTILEVER_DEFLECTION_COEFF, "Propped cantilever deflection coefficient"],
  ["u_inner_clearance_mm", wall.uInnerClearance_mm, "U post gap clear of inner leaf"],
  ["u_tie_actual_length_mm", wall.uTieActualLength_mm, "Actual U-tie length for inner leaf"],
  ["u_tie_inner_embedment_mm", wall.uTieInnerEmbedment_mm, "U-tie embedment into inner leaf"],
  ["l_inner_leaf_embedment_mm", wall.lInnerLeafEmbedment_mm, "L post embedment into inner leaf"],
  ["min_outer_gap_mm", wall.minimumOuterGap_mm, "Minimum post-to-outer-leaf gap"],
  ["min_outer_embedment_mm", wall.minimumOuterEmbedment_mm, "Minimum outer tie embedment"],
  ["tie_notch_mm", wall.tieNotchLength_mm, "Notch length at post connection"],
  ["tie_tail_beyond_notch_mm", wall.tieTailBeyondNotch_mm, "Tail length beyond the notch"]
];

const tieRows = [
  ["name", "nominal_length_mm", "actual_length_mm"],
  ...tieList.map((t) => [t.name, t.nominal_mm, t.actual_mm])
];
const heightRows = [["standard_height_mm"], ...W.standardSectionHeights.map((h) => [h])];

const instructions = [
  ["Windpost Select — database workbook"],
  [""],
  ["This workbook is the single source of truth for the calculator's data."],
  ["Edit the tabs below, save, then double-click UPDATE-FROM-EXCEL.cmd."],
  [""],
  ["U_Sections / L_Sections:"],
  ["  Add a row to add a section; delete a row to remove one."],
  ["  Only name, a_mm, b_mm, t_mm are required."],
  ["  inner_radius_mm may be left blank (defaults to 1.5 x t_mm)."],
  ["  sharp_edges: 'no' = standard rounded corners, 'yes' = square corners."],
  ["  Ixx, Zxx and Area are computed automatically from the geometry."],
  [""],
  ["Ties: one row per outer tie — name, nominal length, actual length (mm)."],
  ["  The name is free text (rename or add ties as you like); selection uses"],
  ["  the actual length. Keep them ordered smallest first."],
  ["Heights: the standard catalogue heights offered in the dropdown."],
  ["Constants: edit the 'value' column only; keep the 'key' column unchanged."],
  [""],
  ["The updater validates every value and refuses to write if anything is wrong,"],
  ["so a bad edit cannot silently break the calculator."]
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sectionRows(W.uSectionDatabase.sections)), "U_Sections");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sectionRows(W.lSectionDatabase.sections)), "L_Sections");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(heightRows), "Heights");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tieRows), "Ties");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(constantRows), "Constants");

const outPath = path.join(root, "windpost-database.xlsx");
fs.writeFileSync(outPath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(`Wrote ${outPath}`);
console.log(`  U_Sections: ${W.uSectionDatabase.sections.length} rows`);
console.log(`  L_Sections: ${W.lSectionDatabase.sections.length} rows`);
console.log(`  Heights: ${W.standardSectionHeights.length} rows`);
console.log(`  Ties: ${tieList.length} rows`);
console.log(`  Constants: ${constantRows.length - 1} rows`);
