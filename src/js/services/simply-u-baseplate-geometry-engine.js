(function (global) {
  "use strict";
  // Geometry for the fixed simply-supported U-windpost baseplate.
  //
  // Datum X = 0 is the inner-leaf / concrete edge.  From the datum toward the
  // cavity the plate contains: 6 mm clear gap, actual U-post depth, then a
  // 6 mm rear fabrication projection.  Everything right of the datum is the
  // fixed standard detail supplied by simplyUBaseplateStandard.
  const windpost = global.Windpost = global.Windpost || {};

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    require("./u-baseplate-geometry-engine.js");
  }

  const CLEAR = Number(
    (windpost.uBaseplateGeom && windpost.uBaseplateGeom.CLEAR) ?? 6
  );
  const REAR_PROJECTION = 6, LEAF = 100;

  function layout(design, section) {
    const d = design;
    const a = Number(section && section.a_mm) || 60;
    const b = Number(section && section.b_mm) || 60;
    const t = Number(section && section.t_mm) || 5;
    const innerRadius = Number(section && section.innerRadius_mm);
    const hole = d.holeDia;
    const rows = [d.anchorFromConcreteEdge];
    const cols = [-d.w / 2, d.w / 2];

    const PX0 = -(CLEAR + a);
    const PX1 = -CLEAR;
    const CANT = REAR_PROJECTION + a + CLEAR;
    const PL0 = -CANT, PL1 = d.plateLen;
    const totX = PL1 - PL0, B = d.B;
    const secName = (section && section.name) || "U windpost";
    const PROF = windpost.uBaseplateGeom.postProfile(
      a, b, t, innerRadius, PX0, PX1
    );

    const ML = 134, MR = 210, MT = 52;
    const planTop = MT + 42;
    const OX = ML - PL0;
    const PX = x => OX + x;
    const PY = y => planTop + B / 2 + y;
    const planDimY = planTop + B + 18;
    const planEndY = planDimY + 47;
    const sectionTitleY = planEndY + 15;
    const postH = 88, sectionTop = sectionTitleY + 24 + postH;
    const SX = x => OX + x;
    const SZ = z => sectionTop - z;
    const concD = 70;
    const sideDimY = SZ(0) + d.tp + concD + 16;
    const vbW = ML + totX + MR;
    const vbH = sideDimY + 61;

    return {
      d, a, b, t, innerRadius, hole, rows, cols, PX0, PX1, CANT,
      PL0, PL1, totX, B, secName, PROF, CLEAR, REAR_PROJECTION, LEAF,
      ML, MR, MT, planTop, OX, PX, PY, planDimY, planEndY,
      sectionTitleY, postH, sectionTop, SX, SZ, concD, sideDimY,
      vbW, vbH
    };
  }

  windpost.simplyUBaseplateGeom = Object.freeze({
    CLEAR, REAR_PROJECTION, LEAF, layout
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.simplyUBaseplateGeom;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
