(function (global) {
  "use strict";
  // Longitudinal side view through the centred stiffener and both U flanges.
  // The stiffener has its calculated maximum height at the front flange face
  // and tapers continuously to zero at the design plate end.
  const windpost = global.Windpost = global.Windpost || {};

  function drawContinuedUPost(g, svg, x1, x1i, x2i, x2, z0, postH, fill) {
    const { C, poly: POLY, polyline: PLINE } = svg;
    const y = z0 - postH;
    const mid = (x1 + x2) / 2;
    const width = Math.min(16, Math.max(10, (x2 - x1) * 0.22));
    g.push(svg.cad("steelCut",
      POLY([[x1, z0], [x1, y], [x1i, y], [x1i, z0]], fill, C.INK, 0.7) +
      POLY([[x2i, z0], [x2i, y], [x2, y], [x2, z0]], fill, C.INK, 0.7) +
      PLINE([
        [x1, y], [mid - width / 2, y],
        [mid - width * 0.22, y - 7],
        [mid + width * 0.08, y + 10],
        [mid + width / 2, y], [x2, y]
      ], C.INK, 0.7, "windpost-continuation-break")));
  }

  function drawSection(ctx, svg) {
    const { C, line: L, rect: R, rawRect, poly: POLY, text: T, hdim, vdim,
            ext, leader } = svg;
    const { d, a, t, rows, PL0, PL1, PX0, PX1, totX, secName, CLEAR,
            REAR_PROJECTION, sectTitleY, SX, SZ, concD, postH,
            stiffenerStartX, chainGap } = ctx;
    const g = [];

    g.push(T(SX(PL0), sectTitleY, "U-POST BASE — SIDE VIEW",
      9.5, C.INK, "start", true));
    // Surroundings are tagged so a composed sheet can drop them and show the
    // connection on its own; the full drawing keeps them.
    const hide = (kind, parts) => `<g data-a4-hide="${kind}">${parts}</g>`;
    const cyT = SZ(0) + d.tp, cyB = cyT + concD, cRt = SX(PL1) + 26;
    g.push(hide("concrete",
      rawRect(SX(0), cyT, cRt - SX(0), concD, "url(#bpHatch)", C.STEELE, 0.5) +
      T((SX(0) + cRt) / 2, cyB - 7, "CONCRETE", 8, C.DIM, "middle")));
    g.push(svg.cad("sectionMark", L(SX(0), SZ(d.hUp + 18), SX(0), cyB, C.RED, 0.6, "4,2")));
    g.push(hide("wall", T(SX(0) + 4, SZ(d.hUp + 10),
      "inner-leaf / concrete edge", 6.5, C.MASON, "start")));
    g.push(svg.cad("steelCut", R(SX(PL0), SZ(0), totX, d.tp, C.PLATEF, C.INK, 0.7)));

    // At the flange mid-line the section cuts both U flanges. One continuation
    // break spans the post instead of separate saw-tooth cuts on each flange.
    drawContinuedUPost(g, svg, SX(PX0), SX(PX0 + t),
      SX(PX1 - t), SX(PX1), SZ(0), postH, "#eef1f4");
    g.push(T((SX(PX0) + SX(PX1)) / 2, SZ(0) - postH * 0.5,
      secName, 9, C.INK, "middle", true, -90));

    // No flat top: maximum height occurs at the front flange face, then the
    // calculated stiffener tapers directly to the end of the plate.
    g.push(svg.cad("steel", POLY([[SX(stiffenerStartX), SZ(0)],
      [SX(stiffenerStartX), SZ(d.hUp)], [SX(PL1), SZ(0)]],
      C.STIFF, C.STEELE, 0.7)));
    const callX = SX(stiffenerStartX + (PL1 - stiffenerStartX) * 0.30);
    const callY = SZ(d.hUp * 0.62);
    g.push(T(callX, callY - 14, d.tw + " mm thick stiffener",
      8, C.INK, "start"));
    g.push(leader(callX + 5, callY - 10,
      SX(stiffenerStartX + (PL1 - stiffenerStartX) * 0.46),
      SZ(d.hUp * 0.43), C.INK));

    rows.forEach(rx => {
      const ax = SX(rx);
      const anchor = [L(ax, cyT, ax, cyB - 10, C.STEELE, 0.6)];
      for (let k = 1; k <= 3; k++) {
        anchor.push(L(ax - 3, cyT + k * 12, ax + 3, cyT + k * 12, C.STEELE, 0.6));
      }
      g.push(hide("concrete", anchor.join("")));
    });

    g.push(vdim(SZ(d.hUp), SZ(0), SX(stiffenerStartX) - 12,
      String(d.hUp), C.RED));
    g.push(vdim(SZ(0), SZ(0) + d.tp, SX(PL1) + 12, String(d.tp), C.DIM));

    // Chains below the slab. On a sheet that drops the concrete they ride back
    // up by the slab depth so the view closes up instead of leaving a void.
    const dimY1 = cyB + 14;
    const dimY2 = dimY1 + chainGap;
    const dyR = dimY2 + chainGap;
    const plateY = dyR + rows.length * chainGap;
    const overallY = plateY + chainGap;
    const chain = [];
    chain.push(hdim(SX(PL0), SX(PX0), dimY1, String(REAR_PROJECTION), C.RED));
    chain.push(hdim(SX(PX0), SX(PX1), dimY1, String(a), C.BLUE));
    chain.push(hdim(SX(PX1), SX(0), dimY1, String(CLEAR), C.RED));
    chain.push(hdim(SX(PL0), SX(0), dimY2, String(Math.round(-PL0))));
    rows.forEach((rx, i) => {
      const rowY = dyR + i * chainGap;
      chain.push(ext(SX(rx), cyB, SX(rx), rowY + 3,
        rows.slice(0, i).map((unused, lane) =>
          dyR + lane * chainGap)));
      chain.push(hdim(SX(0), SX(rx), rowY, String(rx)));
    });
    const sectionDimensionLanes = [
      ...rows.map((unused, lane) => dyR + lane * chainGap),
      plateY
    ];
    chain.push(ext(SX(PL0), cyB, SX(PL0), overallY + 3,
      sectionDimensionLanes));
    chain.push(ext(SX(PL1), cyB, SX(PL1), overallY + 3,
      sectionDimensionLanes));
    chain.push(hdim(SX(0), SX(PL1), plateY, String(d.plateLen)));
    chain.push(hdim(SX(PL0), SX(PL1), overallY,
      String(Math.round(totX))));
    g.push(`<g data-a4-shift="0 ${-concD}">${chain.join("")}</g>`);
    return g;
  }

  windpost.uBaseplateSection = Object.freeze({ drawSection });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.uBaseplateSection;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
