"use strict";

// One-off migration: adds the DU_Sections sheet to windpost-database.xlsx.
//
// A DU post is two U channels welded web to web. The sheet lists the SINGLE
// channel dimensions, exactly as ordered — a x b x t — and the build tool
// assembles the pair. Safe to re-run: an existing DU_Sections sheet is
// replaced, every other sheet is left untouched.
//
//   node tools/add-du-sheet.js

const fs = require("fs");
const path = require("path");
const XLSX = require("./vendor/xlsx.mini.min.js");

const root = path.resolve(__dirname, "..");
const workbookPath = path.join(root, "windpost-database.xlsx");

const DEPTHS = [60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115];
const B = 60, T = 6, INNER_RADIUS = 1.5 * T;   // 9 mm, the catalogue default

const rows = DEPTHS.map(a => ({
  name: `DU ${a}x${B}x${T}`,
  a_mm: a,
  b_mm: B,
  t_mm: T,
  inner_radius_mm: INNER_RADIUS,
  sharp_edges: "no"
}));

const wb = XLSX.read(fs.readFileSync(workbookPath), { type: "buffer" });
const sheet = XLSX.utils.json_to_sheet(rows, {
  header: ["name", "a_mm", "b_mm", "t_mm", "inner_radius_mm", "sharp_edges"]
});

if (!wb.SheetNames.includes("DU_Sections")) {
  // Keep it beside the other section sheets rather than at the end.
  const at = wb.SheetNames.indexOf("L_Sections");
  wb.SheetNames.splice(at < 0 ? wb.SheetNames.length : at + 1, 0, "DU_Sections");
}
wb.Sheets.DU_Sections = sheet;

fs.writeFileSync(workbookPath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(
  `DU_Sections written to ${path.basename(workbookPath)} — ` +
  `${rows.length} sections, ${rows[0].name} to ${rows[rows.length - 1].name}`
);
console.log(`sheets now: ${wb.SheetNames.join(" | ")}`);
