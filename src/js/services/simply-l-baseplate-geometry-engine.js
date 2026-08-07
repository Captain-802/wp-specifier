(function (global) {
  "use strict";
  // Geometry for the fixed simply-supported L-windpost baseplate.
  //
  // Datum X = 0 is the inner-leaf / concrete edge. The established L-post
  // placement is retained: 90 mm of the long leg is embedded into the inner
  // leaf, while the cavity-side length is (a - 90). A 6 mm fabrication
  // projection is provided behind the cavity-side end.
  const windpost = global.Windpost = global.Windpost || {};

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    require("./baseplate-geometry-engine.js");
  }

  const EMBED = 90, WELD_PROJECTION = 6, LEAF = 100;

  function layout(design, section) {
    const d = design;
    const a = Number(section && section.a_mm) || 125;
    const b = Number(section && section.b_mm) || 70;
    const t = Number(section && section.t_mm) || 4;
    const hole = d.holeDia;
    const rows = [d.anchorFromConcreteEdge];
    const cols = [-d.w / 2, d.w / 2];

    const PX0 = -(a - EMBED);
    const PX1 = EMBED;
    const CANT = WELD_PROJECTION + (a - EMBED);
    const PL0 = -CANT, PL1 = d.plateLen;
    const totX = PL1 - PL0, B = d.B;
    const secName = (section && section.name) || "L windpost";
    const PROF = windpost.baseplateGeom.postProfile(a, b, t);

    const ML = 140, MR = 210, MT = 52;
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
    const concD = 70, wallH = 76;
    const sideDimY = SZ(0) + d.tp + concD + 16;
    const vbW = ML + totX + MR;
    const vbH = sideDimY + 61;

    return {
      d, a, b, t, hole, rows, cols, PX0, PX1, CANT, PL0, PL1,
      totX, B, secName, PROF, EMBED, WELD_PROJECTION, LEAF,
      ML, MR, MT, planTop, OX, PX, PY, planDimY, planEndY,
      sectionTitleY, postH, sectionTop, SX, SZ, concD, wallH,
      sideDimY, vbW, vbH
    };
  }

  windpost.simplyLBaseplateGeom = Object.freeze({
    EMBED, WELD_PROJECTION, LEAF, layout
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.simplyLBaseplateGeom;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
