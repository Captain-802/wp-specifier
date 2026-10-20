(function (global) {
  "use strict";
  // Drawing geometry for the cantilever windpost base (L-BASEPLATE style):
  // the folded L-section footprint (PROF) and the full layout context (mm) shared
  // by the plan and section engines.  Datum X = 0 at the concrete/slab edge.
  const windpost = global.Windpost = global.Windpost || {};
  const EMBED = 90, WELD = 6, LEAF = 100;

  // Folded L footprint: a-leg -(a-EMBED)..EMBED along X, b-leg at the tip, radii.
  function postProfile(a, b, t) {
    const ri = 1.5 * t, ro = 2.5 * t, cx = -(a - EMBED) + ro, cy = t / 2 - ro, prof = [];
    prof.push([EMBED, t / 2]); prof.push([cx, t / 2]);
    for (let k = 0; k < 11; k++) { const th = (90 + 9 * k) * Math.PI / 180; prof.push([cx + ro * Math.cos(th), cy + ro * Math.sin(th)]); }
    prof.push([-(a - EMBED), -t / 2 - b + t]); prof.push([-(a - EMBED) + t, -t / 2 - b + t]); prof.push([-(a - EMBED) + t, cy]);
    for (let k = 0; k < 11; k++) { const th = (180 - 9 * k) * Math.PI / 180; prof.push([cx + ri * Math.cos(th), cy + ri * Math.sin(th)]); }
    prof.push([EMBED, -t / 2]);
    return prof;
  }

  function layout(design, section) {
    const d = design;
    const a = (section && section.a_mm) || 200, b = (section && section.b_mm) || 70, t = (section && section.t_mm) || 5;
    const rows = []; for (let i = 0; i < d.nRow; i++) rows.push(d.edge + i * d.pitch);
    const hole = 14, mm = (d.m != null ? d.m : 45);
    const cols = [t / 2 - mm, t / 2 + d.w - mm];   // straddle the back-offset stiffener
    const CANT = (a - EMBED) + WELD;
    const PL0 = -CANT, PL1 = d.plateLen;
    const PX0 = -(a - EMBED), PX1 = EMBED;
    const totX = PL1 - PL0, B = d.B;
    const secName = (section && section.name) || "L windpost";
    const PROF = postProfile(a, b, t);

    const ML = 140, MR = 205, MT = 46;
    const planTop = MT + 40;
    const OX = ML - PL0;
    const PX = x => OX + x, PY = y => planTop + B / 2 + y;
    const chainGap = 20;
    const planChainY = planTop + B + 16;
    const planEndY = planChainY + (rows.length + 1) * chainGap + 14;
    const sectTitleY = planEndY + 12;
    const stiffTopY = sectTitleY + 62;             // clears the rising post below the title
    const sideTop = stiffTopY + d.hUp;
    const SX = x => OX + x, SZ = z => sideTop - z;
    const concD = 82, wallH = 88, postH = d.hUp + 46;
    const vbW = ML + totX + MR;
    const vbH =
      sideTop + d.tp + concD + 32 + (rows.length + 2) * chainGap;

    return { d, a, b, t, rows, hole, mm, cols, CANT, PL0, PL1, PX0, PX1, totX, B, secName, PROF,
             EMBED, WELD, LEAF, ML, MR, MT, planTop, OX, PX, PY, planChainY, planEndY, sectTitleY,
             stiffTopY, sideTop, SX, SZ, concD, wallH, postH, vbW, vbH,
             chainGap };
  }

  windpost.baseplateGeom = Object.freeze({ EMBED, WELD, LEAF, postProfile, layout });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateGeom;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
