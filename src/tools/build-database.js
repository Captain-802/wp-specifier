"use strict";

// Regenerate the calculator's data files from windpost-database.xlsx.
//
//   node tools/build-database.js
//
// Reads the workbook, validates every value, computes section properties from
// geometry, and rewrites four generated files:
//   js/data/standard-section-heights.js
//   js/data/u-section-database.js
//   js/data/l-section-database.js
//   js/data/windpost-parameters.js
//
// If ANY value fails validation, nothing is written and the problems are
// listed, so a bad spreadsheet edit can never silently break the calculator.

const fs = require("fs");
const path = require("path");
const XLSX = require("./vendor/xlsx.mini.min.js");
const { calculateGeometrySection } = require("./lib/section-geometry.js");

const root = path.resolve(__dirname, "..");
const workbookPath = path.join(root, "windpost-database.xlsx");

const errors = [];
const fail = (msg) => errors.push(msg);

function readSheet(wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) { fail(`Missing sheet "${name}" in the workbook.`); return []; }
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function num(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  return typeof value === "number" ? value : Number(String(value).trim());
}

function round6(value) {
  return Number(value.toFixed(6));
}

function parseSharp(value) {
  const v = String(value).trim().toLowerCase();
  return v === "yes" || v === "true" || v === "y" || v === "1";
}

// --- Parse + validate sections ---------------------------------------------
function buildSections(rows, type, sheetName) {
  const shape = type;
  const out = [];
  const seen = new Set();
  rows.forEach((row, i) => {
    const line = `${sheetName} row ${i + 2}`; // +2: header row + 1-based
    const name = String(row.name === undefined ? "" : row.name).trim();
    if (!name) { fail(`${line}: missing section name.`); return; }
    if (seen.has(name)) { fail(`${line}: duplicate section name "${name}".`); return; }
    seen.add(name);

    const a = num(row.a_mm);
    const b = num(row.b_mm);
    const t = num(row.t_mm);
    for (const [label, val] of [["a_mm", a], ["b_mm", b], ["t_mm", t]]) {
      if (!Number.isFinite(val) || val <= 0) fail(`${line} (${name}): ${label} must be a positive number (got "${row[label]}").`);
    }
    if (!Number.isFinite(a) || !Number.isFinite(t) || a <= 0 || t <= 0 || !Number.isFinite(b) || b <= 0) return;

    let innerRadius = num(row.inner_radius_mm);
    if (!Number.isFinite(innerRadius)) innerRadius = 1.5 * t; // blank -> default 1.5t
    if (innerRadius < 0) { fail(`${line} (${name}): inner_radius_mm cannot be negative.`); return; }
    const sharp = parseSharp(row.sharp_edges);

    const g = calculateGeometrySection(shape, a, b, t, innerRadius, sharp);
    if (!g.valid) { fail(`${line} (${name}): invalid geometry — ${g.error}`); return; }

    const section = {
      type, shape, name,
      a_mm: a, b_mm: b, t_mm: t,
      innerRadius_mm: round6(innerRadius),
      outerRadius_mm: round6(innerRadius + t),
      crossSectionalArea_mm2: round6(g.area),
      centroidY_mm: round6(g.ybar),
      ixx_mm4: round6(g.ixx),
      zTop_mm3: round6(g.zTop),
      zBottom_mm3: round6(g.zBottom),
      zxx_mm3: round6(g.zxx)
    };
    if (type === "DU") {
      section.overallDepth_mm = round6(a);
      section.overallWidth_mm = round6(g.overallWidth);
      section.webThickness_mm = round6(g.webThickness);
      section.iyy_mm4 = round6(g.iyy);
      section.zyy_mm3 = round6(g.zyy);
    }
    out.push(section);
  });
  if (!out.length) fail(`${sheetName}: no valid sections found.`);
  return out;
}

// --- Parse + validate a single-column numeric list -------------------------
function numberList(rows, key, sheetName, { integer = false } = {}) {
  const values = [];
  rows.forEach((row, i) => {
    const v = num(row[key]);
    if (!Number.isFinite(v) || v <= 0) { fail(`${sheetName} row ${i + 2}: ${key} must be a positive number (got "${row[key]}").`); return; }
    if (integer && !Number.isInteger(v)) fail(`${sheetName} row ${i + 2}: ${key} must be a whole number (got ${v}).`);
    values.push(v);
  });
  const sorted = [...values].sort((x, y) => x - y);
  const unique = [...new Set(sorted)];
  if (unique.length !== values.length) fail(`${sheetName}: contains duplicate values.`);
  return unique;
}

// --- Parse + validate the ties (name / nominal / actual length) ------------
function buildTies(rows) {
  const out = [];
  const seenNames = new Set();
  rows.forEach((row, i) => {
    const line = `Ties row ${i + 2}`;
    const name = String(row.name === undefined ? "" : row.name).trim();
    const nominal = num(row.nominal_length_mm);
    const actual = num(row.actual_length_mm);
    if (!name) { fail(`${line}: missing tie name.`); return; }
    if (seenNames.has(name)) { fail(`${line}: duplicate tie name "${name}".`); return; }
    seenNames.add(name);
    if (!Number.isFinite(nominal) || nominal <= 0) fail(`${line} (${name}): nominal_length_mm must be a positive number (got "${row.nominal_length_mm}").`);
    if (!Number.isFinite(actual) || actual <= 0) { fail(`${line} (${name}): actual_length_mm must be a positive number (got "${row.actual_length_mm}").`); return; }
    if (Number.isFinite(nominal) && actual < nominal) fail(`${line} (${name}): actual_length_mm (${actual}) is shorter than nominal_length_mm (${nominal}).`);
    out.push({ name, nominal_mm: nominal, actual_mm: actual });
  });
  if (!out.length) fail(`Ties: no valid ties found.`);
  out.sort((a, b) => a.actual_mm - b.actual_mm);
  return out;
}

// --- Parse + validate constants (key/value) --------------------------------
const REQUIRED_CONSTANTS = [
  "fy", "E", "secant_fy", "secant_n", "first_tie_spacing_mm", "standard_tie_spacing_mm",
  "tie_strength_U_kN", "tie_strength_L_kN", "steel_density_kN_m3", "parapet_top_tie_clearance_mm",
  "propped_cantilever_deflection_coeff", "u_inner_clearance_mm",
  "u_tie_actual_length_mm", "u_tie_inner_embedment_mm", "l_inner_leaf_embedment_mm",
  "min_outer_gap_mm", "min_outer_embedment_mm", "tie_notch_mm", "tie_tail_beyond_notch_mm"
];

function buildConstants(rows) {
  const map = {};
  rows.forEach((row, i) => {
    const key = String(row.key === undefined ? "" : row.key).trim();
    if (!key) return;
    const value = num(row.value);
    if (!Number.isFinite(value)) { fail(`Constants row ${i + 2} (${key}): value must be a number (got "${row.value}").`); return; }
    map[key] = value;
  });
  for (const key of REQUIRED_CONSTANTS) {
    if (!(key in map)) fail(`Constants: missing required key "${key}".`);
    else if (map[key] <= 0 && key !== "min_outer_gap_mm") fail(`Constants: "${key}" must be positive (got ${map[key]}).`);
  }
  return map;
}

// --- File emitters ----------------------------------------------------------
const HEADER = (name) =>
  `// GENERATED FILE — DO NOT EDIT BY HAND.\n` +
  `// Rebuilt from windpost-database.xlsx by tools/build-database.js.\n` +
  `// To change ${name}, edit the workbook and run UPDATE-FROM-EXCEL.cmd.\n`;

function sectionLiteral(s) {
  const lines = [
    "      {",
    `        type: ${JSON.stringify(s.type)},`,
    `        shape: ${JSON.stringify(s.shape)},`,
    `        name: ${JSON.stringify(s.name)},`,
    `        a_mm: ${s.a_mm}, b_mm: ${s.b_mm}, t_mm: ${s.t_mm},`,
    `        innerRadius_mm: ${s.innerRadius_mm}, outerRadius_mm: ${s.outerRadius_mm},`
  ];
  // A DU is an assembled pair, so its overall size and web are not a/b/t.
  if (s.type === "DU") {
    lines.push(
      `        channels: 2, weld: "web-to-web",`,
      `        overallDepth_mm: ${s.overallDepth_mm}, overallWidth_mm: ${s.overallWidth_mm},`,
      `        webThickness_mm: ${s.webThickness_mm},`
    );
  }
  lines.push(
    `        crossSectionalArea_mm2: ${s.crossSectionalArea_mm2},`,
    `        centroidY_mm: ${s.centroidY_mm},`,
    `        ixx_mm4: ${s.ixx_mm4},`
  );
  if (s.type === "DU") lines.push(`        iyy_mm4: ${s.iyy_mm4},`);
  lines.push(
    `        zTop_mm3: ${s.zTop_mm3},`,
    `        zBottom_mm3: ${s.zBottom_mm3},`,
    `        zxx_mm3: ${s.zxx_mm3}`
  );
  if (s.type === "DU") {
    lines[lines.length - 1] += ",";
    lines.push(`        zyy_mm3: ${s.zyy_mm3}`);
  }
  lines.push("      }");
  return lines.join("\n");
}

function emitDuDatabase(sections) {
  return `${HEADER("the DU sections")}(function initialiseStandardDuSectionDatabase(global) {
  "use strict";

  // A DU post is TWO U channels welded web to web. a_mm/b_mm/t_mm are the
  // SINGLE channel; overallWidth_mm and webThickness_mm describe the pair.
  // It carries two sets of ties per level — see DEFAULT_TIE_STRENGTH_KN.DU.
  const windpost = global.Windpost = global.Windpost || {};

  const sections = Object.freeze([
${sections.map(sectionLiteral).join(",\n")}
  ].map((section) => Object.freeze(section)));

  windpost.duSectionDatabase = Object.freeze({ sections });
})(window);
`;
}

function emitHeights(heights) {
  const rows = heights.reduce((acc, h, i) => {
    if (i % 5 === 0) acc.push([]);
    acc[acc.length - 1].push(h);
    return acc;
  }, []).map((chunk) => "    " + chunk.join(", ")).join(",\n");
  return `${HEADER("the standard heights")}(function initialiseStandardSectionHeights(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  windpost.standardSectionHeights = Object.freeze([
${rows}
  ]);
})(window);
`;
}

function emitUDatabase(sections) {
  return `${HEADER("the U sections")}(function initialiseStandardUSectionDatabase(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const standardHeights_mm = windpost.standardSectionHeights;

  const sections = Object.freeze([
${sections.map(sectionLiteral).join(",\n")}
  ].map((section) => Object.freeze(section)));

  windpost.uSectionDatabase = Object.freeze({
    standardHeights_mm,
    sections
  });
})(window);
`;
}

function emitLDatabase(sections) {
  return `${HEADER("the L sections")}(function initialiseStandardLSectionDatabase(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const sections = Object.freeze([
${sections.map(sectionLiteral).join(",\n")}
  ].map((section) => Object.freeze(section)));

  windpost.lSectionDatabase = Object.freeze({ sections });
})(window);
`;
}

function emitParameters(constants, ties) {
  const c = constants;
  const tieList = ties
    .map((t) => `      Object.freeze({ name: ${JSON.stringify(t.name)}, nominal_mm: ${t.nominal_mm}, actual_mm: ${t.actual_mm} })`)
    .join(",\n");
  return `${HEADER("the ties and constants")}(function initialiseWindpostParameters(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  windpost.parameters = Object.freeze({
    design: Object.freeze({
      fy: ${c.fy},
      e: ${c.E},
      secantFy: ${c.secant_fy},
      secantN: ${c.secant_n},
      firstTieSpacing: ${c.first_tie_spacing_mm},
      standardTieSpacing: ${c.standard_tie_spacing_mm}
    }),
    config: Object.freeze({
      tieStrength: Object.freeze({ U: ${c.tie_strength_U_kN}, L: ${c.tie_strength_L_kN} }),
      density_kN_m3: ${c.steel_density_kN_m3},
      parapetTopTieClearance_mm: ${c.parapet_top_tie_clearance_mm},
      proppedCantileverDeflectionCoeff: ${c.propped_cantilever_deflection_coeff}
    }),
    tie: Object.freeze({
      list: Object.freeze([
${tieList}
      ]),
      notch_mm: ${c.tie_notch_mm},
      tailBeyondNotch_mm: ${c.tie_tail_beyond_notch_mm},
      minEmbedment_mm: ${c.min_outer_embedment_mm},
      minGap_mm: ${c.min_outer_gap_mm},
      uInnerClearance_mm: ${c.u_inner_clearance_mm},
      uTieActualLength_mm: ${c.u_tie_actual_length_mm},
      uTieInnerEmbedment_mm: ${c.u_tie_inner_embedment_mm},
      lInnerLeafEmbedment_mm: ${c.l_inner_leaf_embedment_mm}
    })
  });
})(window);
`;
}

// --- Run --------------------------------------------------------------------
if (!fs.existsSync(workbookPath)) {
  console.error(`ERROR: workbook not found at ${workbookPath}`);
  console.error(`Run "node tools/init-workbook.js" first to create it.`);
  process.exit(1);
}

const wb = XLSX.read(fs.readFileSync(workbookPath), { type: "buffer" });
const uSections = buildSections(readSheet(wb, "U_Sections"), "U", "U_Sections");
const lSections = buildSections(readSheet(wb, "L_Sections"), "L", "L_Sections");
// DU_Sections is optional so an older workbook still builds.
const duSections = wb.Sheets.DU_Sections
  ? buildSections(readSheet(wb, "DU_Sections"), "DU", "DU_Sections")
  : [];
const heights = numberList(readSheet(wb, "Heights"), "standard_height_mm", "Heights");
const ties = buildTies(readSheet(wb, "Ties"));
const constants = buildConstants(readSheet(wb, "Constants"));

if (errors.length) {
  console.error(`\nDatabase NOT updated — ${errors.length} problem(s) found in windpost-database.xlsx:\n`);
  errors.forEach((e) => console.error("  - " + e));
  console.error(`\nFix the workbook and run the update again. No files were changed.`);
  process.exit(1);
}

const writes = [
  ["js/data/standard-section-heights.js", emitHeights(heights)],
  ["js/data/u-section-database.js", emitUDatabase(uSections)],
  ...(duSections.length
    ? [["js/data/du-section-database.js", emitDuDatabase(duSections)]]
    : []),
  ["js/data/l-section-database.js", emitLDatabase(lSections)],
  ["js/data/windpost-parameters.js", emitParameters(constants, ties)]
];
for (const [rel, content] of writes) {
  fs.writeFileSync(path.join(root, rel), content, "utf8");
  console.log(`Wrote ${rel}`);
}

console.log(`\nDatabase updated: ${uSections.length} U sections, ${lSections.length} L sections, ${ties.length} ties, ${heights.length} heights.`);
