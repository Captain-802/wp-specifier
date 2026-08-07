(function (global) {
  "use strict";
  // Plan view for the fixed simply-supported U-post baseplate.  Dimension
  // chains remain outside the plate; notes inside the plate have short local
  // leaders so annotation arrows cannot cross the dimension arrows.
  const windpost = global.Windpost = global.Windpost || {};

  function drawPlan(ctx, svg) {
    const {
      C, line: L, rect: R, rawRect, circle: Ci, poly: POLY, text: T,
      hdim, vdim, ext, leader
    } = svg;
    const {
      d, a, b, rows, cols, hole, PL0, PL1, PX0, PX1, totX, B,
      PROF, CLEAR, REAR_PROJECTION, LEAF, planTop, PX, PY,
      planDimY
    } = ctx;
    const g = [];
    const plateRight = PX(PL1);
    const upperBolt = [PX(rows[0]), PY(cols[0])];

    g.push(T(PX(PL0), planTop - 57,
      "SIMPLY-SUPPORTED U-POST BASE — PLAN", 9.5, C.INK, "start", true));
    g.push(svg.cad("steelCut", R(PX(PL0), planTop, totX, B, "none", C.INK, 0.7)));
    // The wall is tagged so a composed sheet can drop it and show the
    // connection on its own; the full drawing keeps it.
    g.push(`<g data-a4-hide="wall">` +
      rawRect(PX(0), planTop, Math.min(LEAF, PL1), B,
        "url(#bpMason)", C.MASON, 0.5, "3,2") +
      T(PX(0) + 3, planTop + B - 6,
        "inner-leaf / concrete edge", 6.5, C.MASON, "start") + `</g>`);
    g.push(L(PX(0), planTop - 7, PX(0), planTop + B + 7,
      C.RED, 0.6, "4,2"));

    g.push(svg.cad("steelCut", POLY(PROF.map(p => [PX(p[0]), PY(p[1])]),
      "none", C.INK, 0.7)));
    rows.forEach(rx => cols.forEach(cy => {
      const hx = PX(rx), hy = PY(cy);
      g.push(Ci(hx, hy, hole / 2, C.HOLEF, C.INK, 0.6));
      g.push(L(hx - hole * 0.85, hy, hx + hole * 0.85, hy,
        C.DIM, 0.25, "3,1.5"));
      g.push(L(hx, hy - hole * 0.85, hx, hy + hole * 0.85,
        C.DIM, 0.25, "3,1.5"));
    }));

    // Every horizontal fabrication dimension uses the plate's left edge as
    // one common datum. Separate lanes keep the cumulative lines readable.
    const topDetailY = planTop - 8;
    g.push(hdim(PX(PL0), PX(PX0), topDetailY,
      String(REAR_PROJECTION), C.RED));
    g.push(hdim(PX(PL0), PX(PX1), topDetailY - 13,
      String(Math.round(PX1 - PL0)), C.BLUE));
    g.push(hdim(PX(PL0), PX(0), topDetailY - 26,
      String(Math.round(-PL0))));

    // Fixed right-hand geometry expressed from the same left-edge datum:
    // left edge -> anchor line, then left edge -> plate end.
    const planDimensionLanes = [planDimY, planDimY + 13];
    g.push(ext(PX(PL0), planTop + B, PX(PL0), planDimY + 26,
      [planDimY]));
    g.push(ext(PX(rows[0]), planTop + B, PX(rows[0]), planDimY + 3));
    g.push(ext(PX(PL1), planTop + B, PX(PL1), planDimY + 26,
      planDimensionLanes));
    g.push(hdim(PX(PL0), PX(rows[0]), planDimY,
      String(Math.round(rows[0] - PL0))));
    g.push(hdim(PX(PL0), PX(PL1), planDimY + 13,
      String(Math.round(totX))));

    // Width chain is in its own two lanes, fully outside the plate.
    const chainX = plateRight + 18, overallX = plateRight + 39;
    g.push(vdim(planTop, PY(cols[0]), chainX,
      String(d.sideEdge)));
    g.push(vdim(PY(cols[0]), PY(cols[1]), chainX,
      String(d.w), C.BLUE));
    g.push(vdim(PY(cols[1]), planTop + B, chainX,
      String(d.sideEdge)));
    g.push(vdim(planTop, planTop + B, overallX, String(B)));

    // Short internal callouts do not pass through any outside dimension lane.
    // Hole callout: diameter only, inside the plate, leader to the hole.
    g.push(T(PX(12), upperBolt[1] + 2.5, "Ø " + hole, 7.5, C.INK, "start"));
    g.push(leader(PX(38), upperBolt[1], upperBolt[0], upperBolt[1], C.INK));
    g.push(T(PX(52), PY(1),
      Math.round(totX) + " × " + B + " × " + d.tp + " mm",
      7.5, C.INK, "middle"));
    g.push(T(PX(52), PY(12), "BASE PLATE", 7.5,
      C.INK, "middle", true));
    return g;
  }

  windpost.simplyUBaseplatePlan = Object.freeze({ drawPlan });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.simplyUBaseplatePlan;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
