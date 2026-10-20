(function (global) {
  "use strict";
  // Drawing geometry for a cantilever U-windpost on a floating base plate.
  //
  // Longitudinal datum X = 0 is the inner-leaf / concrete edge:
  //   plate back -> 6 mm fabrication projection -> U depth a
  //   -> shared U-post wall clearance -> inner-leaf / concrete edge.
  //
  // The U is wholly within the cavity. Its flange mid-lines are centred on the
  // plate width (Y = 0), and the stiffener meets the middle of the front flange.
  const windpost = global.Windpost = global.Windpost || {};
  const tieParameters = (windpost.parameters && windpost.parameters.tie) || {};
  const wallDefaults =
    (windpost.outerTieSelectionEngine && windpost.outerTieSelectionEngine.WALL_DEFAULTS) || {};
  // One workbook-controlled value governs both wall-tie placement and the
  // baseplate drawing, so these two details cannot drift apart.
  const CLEAR = Number(
    wallDefaults.uInnerClearance_mm ?? tieParameters.uInnerClearance_mm ?? 6
  );
  const REAR_PROJECTION = 6, LEAF = 100;

  const arcPoints = (cx, cy, r, startDeg, endDeg, segments) => {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const th = (startDeg + (endDeg - startDeg) * i / segments) * Math.PI / 180;
      pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
    }
    return pts;
  };

  // Rounded U footprint, open toward +Y (the bottom of the plan drawing).
  // Outer dimensions are a along the cavity and b along the flange. Both
  // flange mid-points lie on Y = 0.
  function postProfile(a, b, t, innerRadius, xBack, xFront) {
    const ri = Number.isFinite(innerRadius) ? innerRadius : 1.5 * t;
    const ro = ri + t;
    const yWeb = -b / 2, yTip = b / 2;
    const leftOuterCx = xBack + ro, rightOuterCx = xFront - ro;
    const outerCy = yWeb + ro;
    const leftInnerCx = xBack + t + ri, rightInnerCx = xFront - t - ri;
    const innerCy = yWeb + t + ri;
    const prof = [];

    prof.push([xBack, yTip], [xBack, outerCy]);
    prof.push(...arcPoints(leftOuterCx, outerCy, ro, 180, 270, 8).slice(1));
    prof.push([rightOuterCx, yWeb]);
    prof.push(...arcPoints(rightOuterCx, outerCy, ro, 270, 360, 8).slice(1));
    prof.push([xFront, yTip], [xFront - t, yTip], [xFront - t, innerCy]);
    prof.push(...arcPoints(rightInnerCx, innerCy, ri, 0, -90, 8).slice(1));
    prof.push([leftInnerCx, yWeb + t]);
    prof.push(...arcPoints(leftInnerCx, innerCy, ri, -90, -180, 8).slice(1));
    prof.push([xBack + t, yTip]);
    return prof;
  }

  function layout(design, section) {
    const d = design;
    const a = (section && section.a_mm) || 60;
    const b = (section && section.b_mm) || 60;
    const t = (section && section.t_mm) || 5;
    const innerRadius = Number(section && section.innerRadius_mm);
    const rows = []; for (let i = 0; i < d.nRow; i++) rows.push(d.edge + i * d.pitch);
    const hole = 14;
    const mm = d.m != null ? d.m : 45;
    const gauge = d.w != null ? d.w : 96;
    const cols = [-gauge / 2, gauge / 2];

    const PX0 = -(CLEAR + a);                       // rear U outer face
    const PX1 = -CLEAR;                             // front U outer face
    const CANT = REAR_PROJECTION + a + CLEAR;       // full plate left of datum
    const PL0 = -CANT, PL1 = d.plateLen;
    const totX = PL1 - PL0, B = d.B;
    const secName = (section && section.name) || "U windpost";
    const PROF = postProfile(a, b, t, innerRadius, PX0, PX1);

    const ML = 150, MR = 205, MT = 46;
    const planTop = MT + 64;
    const OX = ML - PL0;
    const PX = x => OX + x, PY = y => planTop + B / 2 + y;
    const chainGap = 20;
    const planChainY = planTop + B + 16;
    const planEndY = planChainY + (rows.length + 1) * chainGap + 14;
    const sectTitleY = planEndY + 12;
    const stiffTopY = sectTitleY + 62;
    const sideTop = stiffTopY + d.hUp;
    const SX = x => OX + x, SZ = z => sideTop - z;
    const concD = 82, postH = d.hUp + 46;
    const vbW = ML + totX + MR;
    const vbH =
      sideTop + d.tp + concD + 32 + (rows.length + 2) * chainGap;

    return {
      d, a, b, t, innerRadius, rows, hole, mm, gauge, cols, CANT, PL0, PL1,
      PX0, PX1, totX, B, secName, PROF, CLEAR, REAR_PROJECTION, LEAF, ML, MR,
      MT, planTop, OX, PX, PY, planChainY, planEndY, sectTitleY, stiffTopY,
      sideTop, SX, SZ, concD, postH, vbW, vbH, stiffenerY: 0,
      stiffenerStartX: PX1, chainGap
    };
  }

  windpost.uBaseplateGeom = Object.freeze({
    CLEAR, REAR_PROJECTION, LEAF, postProfile, layout
  });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.uBaseplateGeom;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
