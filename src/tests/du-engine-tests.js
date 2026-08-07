"use strict";

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
global.window = global;
global.Windpost = {};

[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/data/l-section-database.js",
  "js/data/u-section-database.js",
  "js/data/du-section-database.js",
  "js/data/standard-section-heights.js",
  "js/data/section-profiles.js",
  "js/engines/secant-modulus-engine.js",
  "js/engines/load-case-engine.js",
  "js/engines/tie-capacity-engine.js",
  "js/engines/result-selection-engine.js",
  "js/engines/windpost-calculation-engine.js",
  "js/engines/outer-tie-selection-engine.js",
  "js/engines/automatic-selection-engine.js",
  "js/engines/du-capacity-engine.js"
].forEach(file => require(path.join(root, file)));

const W = global.Windpost;
const DU = W.duCapacityEngine;
const { calculateGeometrySection } =
  require(path.join(root, "tools/lib/section-geometry.js"));

let passed = 0;
function check(name, task) {
  task();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

const DEPTHS = [60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115];

check("catalogue holds the twelve ordered DU sections", () => {
  const sections = W.duSectionDatabase.sections;
  assert.strictEqual(sections.length, 12);
  assert.deepStrictEqual(sections.map(s => s.a_mm), DEPTHS);
  sections.forEach(s => {
    assert.strictEqual(s.type, "DU");
    assert.strictEqual(s.b_mm, 60);
    assert.strictEqual(s.t_mm, 6);
    assert.strictEqual(s.innerRadius_mm, 9);      // 1.5t
    assert.strictEqual(s.outerRadius_mm, 15);     // r + t
    assert.strictEqual(s.name, `DU ${s.a_mm}x60x6`);
  });
});

check("a DU is two channels welded web to web", () => {
  W.duSectionDatabase.sections.forEach(s => {
    assert.strictEqual(s.channels, 2);
    assert.strictEqual(s.weld, "web-to-web");
    assert.strictEqual(s.overallDepth_mm, s.a_mm);
    assert.strictEqual(s.overallWidth_mm, 2 * s.b_mm);   // 120
    assert.strictEqual(s.webThickness_mm, 2 * s.t_mm);   // 12
  });
});

check("DU properties are exactly twice the single channel about the shared axis", () => {
  W.duSectionDatabase.sections.forEach(s => {
    const one = calculateGeometrySection("U", s.a_mm, s.b_mm, s.t_mm, 9, false);
    assert(one.valid);
    assert(Math.abs(s.crossSectionalArea_mm2 - 2 * one.area) < 1e-5,
      `${s.name} area`);
    assert(Math.abs(s.ixx_mm4 - 2 * one.ixx) < 1e-3, `${s.name} Ixx`);
    // Symmetric about mid depth, so the centroid sits at a/2.
    assert.strictEqual(s.centroidY_mm, s.a_mm / 2);
    assert(Math.abs(s.zxx_mm3 - s.ixx_mm4 / (s.a_mm / 2)) < 1e-3, `${s.name} Zxx`);
    assert(Math.abs(s.zTop_mm3 - s.zBottom_mm3) < 1e-6, `${s.name} symmetry`);
  });
});

check("both principal axes are published and Iyy is width-driven", () => {
  W.duSectionDatabase.sections.forEach(s => {
    assert(s.iyy_mm4 > 0 && s.zyy_mm3 > 0, `${s.name} missing Iyy`);
    assert(Math.abs(s.zyy_mm3 - s.iyy_mm4 / s.b_mm) < 1e-3, `${s.name} Zyy`);
  });
  // Iyy comes from the 120 mm width, so it barely moves with depth, while
  // Ixx grows steeply. They cross over between DU 75 and DU 80.
  const byName = n => W.duSectionDatabase.sections.find(s => s.name === n);
  assert(byName("DU 60x60x6").ixx_mm4 < byName("DU 60x60x6").iyy_mm4);
  assert(byName("DU 115x60x6").ixx_mm4 > byName("DU 115x60x6").iyy_mm4);
  const spread = byName("DU 115x60x6").iyy_mm4 - byName("DU 60x60x6").iyy_mm4;
  assert(spread / byName("DU 60x60x6").iyy_mm4 < 0.01, "Iyy should be near-flat");
});

check("a DU tie level is worth two U tie sets", () => {
  const table = W.config.DEFAULT_TIE_STRENGTH_KN;
  assert.strictEqual(W.config.DU_TIE_SETS_PER_LEVEL, 2);
  assert.strictEqual(table.DU, 2 * table.U);
  assert.strictEqual(table.U, 1.713);
  assert.strictEqual(table.DU, 3.426);
  // The single-U and L values must be untouched.
  assert.strictEqual(table.L, 2.25);
});

check("the doubled tie strength reaches the capacity chain", () => {
  const out = DU.simplySupported({ section: "DU 60x60x6", length_mm: 2670 });
  assert(out.valid);
  assert.strictEqual(out.tieSetsPerLevel, 2);
  assert.strictEqual(out.tieStrengthPerLevel_kN, 3.426);
  assert.strictEqual(out.singleChannelTieStrength_kN, 1.713);
  // totalTiesCapacity = numberOfTies x tie strength, doubled vs a single U.
  assert.strictEqual(
    out.calculation.totalTiesCapacity,
    out.numberOfTies * 3.426
  );
  assert.strictEqual(
    out.calculation.ultimateTotalTiesCapacity,
    out.numberOfTies * 3.426
  );
});

check("halving the tie strength would change a tie-governed result", () => {
  // Prove the doubling is load-bearing, not cosmetic: run the same section
  // through the shared engine with the single-U tie strength and confirm the
  // tie line moves.
  const p = W.parameters.design;
  const s = W.duSectionDatabase.sections[0];
  const run = tieStrength => W.windpostCalculationEngine.getCalculatedDesignValues({
    length: 2670, fy: p.fy, e: p.e,
    ixx: s.ixx_mm4, zxx: s.zxx_mm3, area: s.crossSectionalArea_mm2,
    tieStrength,
    firstTieSpacing: p.firstTieSpacing, standardTieSpacing: p.standardTieSpacing,
    secantFy: p.secantFy, secantN: p.secantN,
    supportCondition: "simplySupported", loadType: "udl",
    apply10mmLimit: false, useCustomDeflectionLimit: false,
    customDeflectionLimit: "", connectionCapacityCap: ""
  });
  const single = run(1.713), doubled = run(3.426);
  assert.strictEqual(doubled.totalTiesCapacity, 2 * single.totalTiesCapacity);
  assert(doubled.ultimateTotalTiesCapacity > single.ultimateTotalTiesCapacity);
});

check("a tie level schedules 4 ties — 2 EDC and 2 U", () => {
  const s = DU.tieSchedule(10);
  assert.strictEqual(s.tieLevels, 10);
  assert.strictEqual(s.setsPerLevel, 2);
  assert.strictEqual(s.tiesPerLevel, 4);        // 2 EDC + 2 U
  assert.strictEqual(s.edcTiesPerLevel, 2);
  assert.strictEqual(s.uTiesPerLevel, 2);
  // The worked case: 10 slot levels -> 20 EDC and 20 U ties, 40 in all.
  assert.strictEqual(s.edcTiesTotal, 20);
  assert.strictEqual(s.uTiesTotal, 20);
  assert.strictEqual(s.tiesTotal, 40);
  assert(s.description.includes("20 EDC ties and 20 U ties"));

  assert.strictEqual(DU.tieSchedule(0).tiesTotal, 0);
  assert.strictEqual(DU.tieSchedule(1).tiesTotal, 4);
});

check("a calculated DU reports levels for capacity and ties for the schedule", () => {
  const out = DU.simplySupported({ section: "DU 85x60x6", length_mm: 2670 });
  assert(out.valid);
  // 2670 mm at 225 c/c, first tie deducted -> 10 levels.
  assert.strictEqual(out.tieLevels, 10);
  assert.strictEqual(out.numberOfTies, 10);
  // Capacity works in LEVELS x doubled strength, not in tie count.
  assert.strictEqual(out.calculation.ultimateTotalTiesCapacity, 10 * 3.426);
  // The schedule works in ties.
  assert.strictEqual(out.ties.edcTiesTotal, 20);
  assert.strictEqual(out.ties.uTiesTotal, 20);
  assert.strictEqual(out.ties.tiesTotal, 40);
  assert.strictEqual(out.ties.tiesPerLevel, 4);
  // Counts must track the level count, whatever the height.
  const short = DU.simplySupported({ section: "DU 85x60x6", length_mm: 1350 });
  assert.strictEqual(short.ties.edcTiesTotal, 2 * short.tieLevels);
  assert.strictEqual(short.ties.tiesTotal, 4 * short.tieLevels);
});

check("simply supported and cantilever both run and differ", () => {
  const ss = DU.simplySupported({ section: "DU 85x60x6", length_mm: 2670 });
  const cant = DU.cantilever({ section: "DU 85x60x6", length_mm: 2670 });
  assert(ss.valid && cant.valid);
  assert.strictEqual(ss.supportCondition, "simplySupported");
  assert.strictEqual(cant.supportCondition, "cantilever");
  assert(ss.ultimateDesignValue_kN > 0 && cant.ultimateDesignValue_kN > 0);
  // A cantilever of the same height carries far less than a propped span.
  assert(cant.ultimateDesignValue_kN < ss.ultimateDesignValue_kN);
  assert(typeof ss.governing === "string" && ss.governing.length > 0);
});

check("a simply supported post ignores the point-load model", () => {
  const ss = DU.simplySupported({
    section: "DU 85x60x6", length_mm: 2670, loadType: "tipPointLoad"
  });
  assert.strictEqual(ss.loadType, "udl");
  const cant = DU.cantilever({
    section: "DU 85x60x6", length_mm: 2670, loadType: "tipPointLoad"
  });
  assert.strictEqual(cant.loadType, "tipPointLoad");
  const udl = DU.cantilever({ section: "DU 85x60x6", length_mm: 2670 });
  assert(cant.ultimateDesignValue_kN < udl.ultimateDesignValue_kN);
});

check("capacity rises with depth across the whole catalogue", () => {
  ["simplySupported", "cantilever"].forEach(support => {
    const list = DU.schedule(2670, { supportCondition: support });
    assert.strictEqual(list.length, 12);
    for (let i = 1; i < list.length; i += 1) {
      assert(
        list[i].ultimateDesignValue_kN >= list[i - 1].ultimateDesignValue_kN,
        `${support}: ${list[i].sectionName} below ${list[i - 1].sectionName}`
      );
    }
  });
});

check("selection returns the first DU that carries the load", () => {
  const pick = DU.select(20, 2670, { supportCondition: "simplySupported" });
  assert(pick.suitable && pick.selected);
  assert(pick.selected.ultimateDesignValue_kN >= 20);
  assert.strictEqual(pick.considered, 12);
  // Nothing shallower would have done.
  const all = DU.schedule(2670, { supportCondition: "simplySupported" });
  const idx = all.findIndex(e => e.sectionName === pick.selected.sectionName);
  all.slice(0, idx).forEach(e => assert(e.ultimateDesignValue_kN < 20));

  const impossible = DU.select(100000, 2670, {});
  assert(!impossible.suitable && impossible.selected === null);
  assert(impossible.reason.length > 0);
});

check("bad input is refused rather than guessed", () => {
  assert(!DU.capacity({ section: "UP 80x60x6", length_mm: 2670 }).valid);
  assert(!DU.capacity({ section: "DU 60x60x6", length_mm: 0 }).valid);
  assert(!DU.capacity({ section: "DU 999x60x6", length_mm: 2670 }).valid);
  assert(!DU.capacity({}).valid);
});

check("a DU sits in the cavity like a U and takes two U tie sets", () => {
  const du = W.duSectionDatabase.sections.find(s => s.name === "DU 85x60x6");
  const u = W.uSectionDatabase.sections.find(s => s.name === "UP 85x60x6") ||
    { a_mm: 85, type: "U" };
  const wall = {
    innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100
  };
  const rDu = W.outerTieSelectionEngine.calculateWallAndTie(du, wall);
  assert(rDu.valid, rDu.reason);
  // Wholly in the cavity, 6 mm clear — the U rule, not the L's 90 mm embedment.
  assert.strictEqual(rDu.postProjectionIntoCavity_mm, du.a_mm);
  assert.strictEqual(rDu.outerGap_mm, 150 - 6 - du.a_mm);
  // The tie is named plainly and the QUANTITY carries the doubling, so a
  // schedule reads "20 no. U tie" rather than "10 no. U tie (2 sets)".
  assert.strictEqual(rDu.innerTie, "U tie");
  assert.strictEqual(rDu.tieSetsPerLevel, 2);
  assert.strictEqual(rDu.innerTiePostClearance_mm, 6);
  // Same depth of U gives the same placement and outer tie.
  const rU = W.outerTieSelectionEngine.calculateWallAndTie(
    { ...u, type: "U", a_mm: du.a_mm }, wall);
  assert.strictEqual(rDu.outerGap_mm, rU.outerGap_mm);
  assert.strictEqual(rDu.outerTie, rU.outerTie);
  assert.strictEqual(rU.innerTie, "U tie");

  // BOTH faces are doubled — a DU takes two EDC ties outward and two U ties
  // back at every level. A single U and an L stay at one set.
  assert.strictEqual(rU.tieSetsPerLevel, 1);
  const lWall = W.outerTieSelectionEngine.calculateWallAndTie(
    W.lSectionDatabase.sections.find(x => x.name === "LP 170x70x4"), wall);
  assert.strictEqual(lWall.tieSetsPerLevel, 1);
  assert.strictEqual(lWall.innerTie, "Shear tie");
  assert.strictEqual(W.outerTieSelectionEngine.setsPerLevel("DU"), 2);
  assert.strictEqual(W.outerTieSelectionEngine.setsPerLevel("U"), 1);
  assert.strictEqual(W.outerTieSelectionEngine.setsPerLevel("L"), 1);

  // 10 tie levels on a DU schedules 20 of each.
  const levels = 10;
  assert.strictEqual(levels * rDu.tieSetsPerLevel, 20);
  assert.strictEqual(levels * rU.tieSetsPerLevel, 10);
});

check("DU is selectable in the Selector UI", () => {
  const fs = require("fs");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
  const app = fs.readFileSync(path.join(root, "js/ui/app.js"), "utf8");

  assert(html.includes('name="windpostType" value="DU"'), "no DU radio");
  assert(html.includes("DU-shaped post"));
  assert(html.includes("shape-du"), "no DU icon");
  assert(html.includes('class="choice-grid three"'), "grid still two-wide");
  assert(css.includes(".choice-grid.three"));
  assert(css.includes(".shape-du"));
  // Detailing has no baseplate or folded drawing for a welded pair yet, so
  // the tab must stay shut for a DU rather than open onto a broken sheet.
  assert(app.includes('section.type !== "DU"'), "Detailing not blocked for DU");
  assert(app.includes("not available for DU posts yet"));
});

check("the selector accepts DU and returns a design", () => {
  const wall = {
    innerLeafThickness_mm: 100, cavityWidth_mm: 150, outerLeafThickness_mm: 100
  };
  const base = {
    loadType: "udl", mode: "automatic", length_mm: 2670, wall
  };
  // Previously rejected with "Choose a U or L windpost."
  ["simplySupported", "cantilever"].forEach(support => {
    const out = W.automaticSelectionEngine.runDesign({
      ...base, type: "DU", supportCondition: support,
      requiredLoad_kN: support === "cantilever" ? 5 : 13
    });
    assert(out.valid, `${support}: ${out.message}`);
    assert.strictEqual(out.selected.section.type, "DU");
    assert(out.selected.finalCapacity_kN > 0);
    // The doubled tie count reaches the result the UI renders.
    assert.strictEqual(out.selected.wall.tieSetsPerLevel, 2);
  });
  // A bad type is still refused, and the message now names all three.
  const bad = W.automaticSelectionEngine.runDesign({
    ...base, type: "X", supportCondition: "simplySupported", requiredLoad_kN: 13
  });
  assert(!bad.valid);
  assert(bad.message.includes("DU"), bad.message);

  // U and L are unaffected.
  ["U", "L"].forEach(type => {
    const out = W.automaticSelectionEngine.runDesign({
      ...base, type, supportCondition: "simplySupported", requiredLoad_kN: 13
    });
    assert(out.valid && out.selected.section.type === type);
    assert.strictEqual(out.selected.wall.tieSetsPerLevel, 1);
  });
});

check("the DU catalogue joins the shared section lookup", () => {
  const list = W.sectionProfileEngine.getSections("DU", "simplySupported");
  assert.strictEqual(list.length, 12);
  const props = W.sectionProfileEngine.getSectionProperties(list[0]);
  assert(props.ixx_mm4 > 0 && props.zxx_mm3 > 0 && props.crossSectionalArea_mm2 > 0);
  // U and L lookups are unaffected.
  assert.strictEqual(W.sectionProfileEngine.getSections("U", "simplySupported").length, 40);
  assert.strictEqual(W.sectionProfileEngine.getSections("L", "simplySupported").length, 31);
});

check("adding DU left the U and L capacities untouched", () => {
  // The 15.435941956864 kN figure is the LP 170x70x4 simply-supported UDL
  // result the selector has always produced.
  const p = W.parameters.design;
  const l = W.lSectionDatabase.sections.find(s => s.name === "LP 170x70x4");
  const out = W.windpostCalculationEngine.getCalculatedDesignValues({
    length: 2670, fy: p.fy, e: p.e,
    ixx: l.ixx_mm4, zxx: l.zxx_mm3, area: l.crossSectionalArea_mm2,
    tieStrength: W.config.DEFAULT_TIE_STRENGTH_KN.L,
    firstTieSpacing: p.firstTieSpacing, standardTieSpacing: p.standardTieSpacing,
    secantFy: p.secantFy, secantN: p.secantN,
    supportCondition: "simplySupported", loadType: "udl",
    apply10mmLimit: false, useCustomDeflectionLimit: false,
    customDeflectionLimit: "", connectionCapacityCap: ""
  });
  // Issued capacity is truncated to two decimals; the exact value behind
  // it is unchanged, which is what proves the maths did not move.
  assert.strictEqual(out.ultimateDesignValueExact, 15.435941956864);
  assert.strictEqual(out.ultimateDesignValue, 15.43);
});

console.log(`\n${passed} DU engine checks passed.`);
