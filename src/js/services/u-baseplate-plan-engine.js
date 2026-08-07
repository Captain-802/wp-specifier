(function (global) {
  "use strict";
  // U-post plan: floating plate, inner-leaf datum, rounded U footprint (opening
  // down), centre-line stiffener, anchor holes and fabrication dimensions.
  const windpost = global.Windpost = global.Windpost || {};

  // Keep right-side dimension chains and annotation leaders in separate lanes.
  // Dimension chains sit outside the plate. Upper leaders pass above them; the
  // stiffener leader runs below them before turning back into the drawing.
  function rightSideLayout(ctx) {
    const { d, cols, PL1, B, PX, PY } = ctx;
    const plateRight = PX(PL1);
    const calloutX = plateRight + 78;
    const leaderStartX = calloutX - 4;
    const upperElbowX = plateRight + 8;
    const plateRouteY = PY(cols[0]) - 12;
    const stiffenerRouteY = PY(cols[1]) + 24;
    const stiffenerElbowX = plateRight + 8;
    return {
      plateRight,
      dimXStiffener: plateRight + 18,
      dimXOffsets: plateRight + 34,
      dimXGauge: plateRight + 50,
      calloutX,
      leaderStartX,
      upperElbowX,
      plateRouteY,
      stiffenerRouteY,
      stiffenerElbowX,
      plateLeader: [
        [leaderStartX, PY(-30)],
        [leaderStartX, plateRouteY],
        [upperElbowX, plateRouteY],
        [upperElbowX, PY(-B / 2 + 10)],
        [plateRight, PY(-B / 2 + 10)]
      ],
      stiffenerLeader: [
        [leaderStartX, stiffenerRouteY],
        [stiffenerElbowX, stiffenerRouteY],
        [plateRight - 36, PY(0)]
      ]
    };
  }

  function drawPlan(ctx, svg) {
    const { C, cad, line: L, rect: R, rawRect, circle: Ci, poly: POLY, text: T,
            textLines: TL, hdim, vdim, ext, leader } = svg;
    const { d, a, b, t, rows, hole, mm, gauge, cols, PL0, PL1, PX0, PX1,
            totX, B, PROF, CLEAR, REAR_PROJECTION, LEAF, planTop,
            PX, PY, planChainY, stiffenerStartX, chainGap } = ctx;
    const g = [];
    const right = rightSideLayout(ctx);
    const routedLeader = points => {
      let path = "";
      for (let i = 0; i < points.length - 1; i++) {
        path += i === points.length - 2
          ? leader(...points[i], ...points[i + 1], C.INK)
          : L(...points[i], ...points[i + 1], C.INK, 0.4);
      }
      return path;
    };

    g.push(T(PX(PL0), planTop - 57, "U-POST BASE — PLAN", 9.5, C.INK, "start", true));
    g.push(cad("steelCut", R(PX(PL0), planTop, totX, B, "none", C.INK, 0.7)));
    // The wall is tagged so a composed sheet can drop it and show the
    // connection on its own; the full drawing keeps it.
    g.push(`<g data-a4-hide="wall">` +
      rawRect(PX(0), planTop, LEAF, B, "url(#bpMason)", C.MASON, 0.5, "3,2") +
      T(PX(0) + 3, planTop + 11, "inner-leaf / concrete edge", 6.5, C.MASON, "start") +
      `</g>`);
    g.push(cad("sectionMark", L(PX(0), planTop - 7, PX(0), planTop + B + 7, C.RED, 0.6, "4,2")));

    // Stiffener first, then the post over it: it meets the middle of the front
    // flange and remains centred on the plate width.
    g.push(cad("steel", R(PX(stiffenerStartX), PY(-d.tw / 2), PL1 - stiffenerStartX,
      d.tw, "none", C.STEELE, 0.5)));
    g.push(cad("steelCut", POLY(PROF.map(p => [PX(p[0]), PY(p[1])]), "none", C.INK, 0.7)));
    rows.forEach(rx => cols.forEach(cy => {
      const hx = PX(rx), hy = PY(cy);
      g.push(Ci(hx, hy, hole / 2, C.HOLEF, C.INK, 0.6));
      g.push(L(hx - hole * 0.85, hy, hx + hole * 0.85, hy, C.DIM, 0.25, "3,1.5"));
      g.push(L(hx, hy - hole * 0.85, hx, hy + hole * 0.85, C.DIM, 0.25, "3,1.5"));
    }));

    // All horizontal dimensions use the left plate edge as one fabrication
    // datum. The stacked lanes show the cumulative rear projection, U depth
    // and wall-clearance location without chained origins.
    const dyT = planTop - 8;
    g.push(hdim(PX(PL0), PX(PX0), dyT, String(REAR_PROJECTION), C.RED));
    g.push(hdim(PX(PL0), PX(PX1), dyT - 13,
      String(Math.round(PX1 - PL0)), C.BLUE));
    g.push(hdim(PX(PL0), PX(0), dyT - 26,
      String(Math.round(-PL0))));

    // Across-width geometry: flange length centred on plate, stiffener centred
    // at Y=0, and the shared 45 / 96 anchor geometry.
    const dxL = PX(PL0) - 20;
    g.push(vdim(planTop, planTop + B, dxL - 18, String(B)));
    g.push(vdim(PY(-b / 2), PY(b / 2), dxL, String(b), C.BLUE));
    g.push(vdim(PY(cols[0]), PY(-d.tw / 2), right.dimXOffsets, String(mm)));
    g.push(vdim(PY(d.tw / 2), PY(cols[1]), right.dimXOffsets, String(mm)));
    g.push(vdim(PY(cols[0]), PY(cols[1]), right.dimXGauge,
      String(gauge), C.BLUE));
    g.push(vdim(PY(-d.tw / 2), PY(d.tw / 2),
      right.dimXStiffener, String(d.tw)));

    const planLanes = rows.map((unused, lane) =>
      planChainY + lane * chainGap);
    g.push(ext(PX(PL0), planTop + B,
      PX(PL0), planChainY + rows.length * chainGap + 3,
      planLanes));
    rows.forEach((rx, i) => {
      g.push(ext(PX(rx), planTop + B,
        PX(rx), planChainY + i * chainGap + 3,
        rows.slice(0, i).map((unused, lane) =>
          planChainY + lane * chainGap)));
      g.push(hdim(PX(PL0), PX(rx),
        planChainY + i * chainGap, String(Math.round(rx - PL0))));
    });
    g.push(ext(PX(PL1), planTop + B, PX(PL1),
      planChainY + rows.length * chainGap + 3,
      planLanes));
    g.push(hdim(PX(PL0), PX(PL1),
      planChainY + rows.length * chainGap,
      String(Math.round(totX))));

    // hole -> diameter only, sat INSIDE the plate with a leader to the hole
    const holeX = PX(rows[0]), holeY = PY(cols[0]);
    g.push(T(holeX - 26, holeY + 3, "Ø " + hole, 8, C.INK, "end"));
    g.push(leader(holeX - 24, holeY, holeX, holeY, C.INK));
    g.push(TL(right.calloutX, PY(-29),
      [Math.round(totX) + " × " + B + " × " + d.tp + " mm", "BASE PLATE"],
      8, C.INK, "start", [1]));
    g.push(routedLeader(right.plateLeader));
    g.push(T(right.calloutX, right.stiffenerRouteY + 4,
      d.tw + " mm stiffener", 8, C.INK, "start"));
    g.push(routedLeader(right.stiffenerLeader));
    return g;
  }

  windpost.uBaseplatePlan = Object.freeze({ drawPlan, rightSideLayout });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.uBaseplatePlan;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
