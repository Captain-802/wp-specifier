(function (global) {
  "use strict";
  // Concrete slab, inner leaf, plate, rising post with a central continuation
  // break, welds, stiffener, anchors and dimensions.
  // Returns an array of SVG fragment strings.
  const windpost = global.Windpost = global.Windpost || {};

  function drawContinuedPost(g, svg, x1, x2, z0, postH, fill) {
    const { C, poly: POLY } = svg;
    const y = z0 - postH;
    const mid = (x1 + x2) / 2;
    const width = Math.min(16, Math.max(10, (x2 - x1) * 0.22));
    const pts = [
      [x1, z0], [x1, y], [mid - width / 2, y],
      [mid - width * 0.22, y - 7],
      [mid + width * 0.08, y + 10],
      [mid + width / 2, y], [x2, y], [x2, z0]
    ];
    g.push(svg.cad("steelCut", POLY(pts, fill, C.INK, 0.7, "windpost-continuation-break")));
  }

  function drawSection(ctx, svg) {
    const { C, cad, line: L, rect: R, rawRect, poly: POLY, text: T, hdim, vdim, ext, leader } = svg;
    const { d, rows, PL0, PL1, PX0, PX1, totX, secName, EMBED, WELD, LEAF,
            sectTitleY, SX, SZ, concD, wallH, postH, chainGap } = ctx;
    const g = [];

    g.push(T(SX(PL0), sectTitleY, "CONNECTION — SIDE VIEW",
      9.5, C.INK, "start", true));
    // Surroundings are tagged so a composed sheet can drop them and show the
    // connection on its own; the full drawing keeps them.
    const hide = (kind, parts, role) =>
      `<g data-a4-hide="${kind}"${role ? ` data-cad="${role}"` : ""}>${parts}</g>`;
    const cyT = SZ(0) + d.tp, cyB = cyT + concD, cRt = SX(PL1) + 26;
    g.push(hide("concrete",
      rawRect(SX(0), cyT, cRt - SX(0), concD, "url(#bpHatch)", C.STEELE, 0.5) +
      L(SX(0), cyT, SX(0), cyB, C.INK, 0.6) +
      T((SX(0) + cRt) / 2, cyB - 7, "CONCRETE", 8, C.DIM, "middle"), "concreteCut"));
    g.push(hide("wall",
      rawRect(SX(0), SZ(0) - wallH, LEAF, wallH, "url(#bpMason)", C.MASON, 0.5, "3,2"),
      "masonry")); // inner leaf (labelled on plan)
    g.push(cad("steelCut", R(SX(PL0), SZ(0), totX, d.tp, C.PLATEF, C.INK, 0.7)));       // plate

    drawContinuedPost(g, svg, SX(PX0), SX(PX1), SZ(0), postH, "#eef1f4");
    g.push(T((SX(PX0) + SX(PX1)) / 2, SZ(0) - postH * 0.5, secName, 9, C.INK, "middle", true, -90));
    // fillet welds OUTSIDE the post at each end (post edge -> plate edge), leg = WELD
    g.push(cad("weld",
      POLY([[SX(PX0), SZ(0)], [SX(PX0) - WELD, SZ(0)], [SX(PX0), SZ(0) - WELD]], C.WELDC, C.INK, 0.4) +
      POLY([[SX(PX1), SZ(0)], [SX(PX1) + WELD, SZ(0)], [SX(PX1), SZ(0) - WELD]], C.WELDC, C.INK, 0.4)));

    // stiffener: flat full-height edge -> inner face, triangle inner face -> plate end
    const flatEnd = Math.max(d.edge, EMBED);
    g.push(cad("steel", POLY([[SX(d.edge), SZ(0)], [SX(d.edge), SZ(d.hUp)], [SX(flatEnd), SZ(d.hUp)], [SX(PL1), SZ(0)]], C.STIFF, C.STEELE, 0.7)));
    // stiffener callout with a leader arrow (matches the plan style)
    const sf = SX(flatEnd), sp = SX(PL1);
    const stx = sf + (sp - sf) * 0.28, sty = SZ(d.hUp) - 13;
    g.push(T(stx, sty, d.tw + " mm thk stiffener", 8, C.INK, "start"));
    g.push(leader(stx + 6, sty + 3, sf + (sp - sf) * 0.44, SZ(d.hUp * 0.38), C.INK));

    // anchors into concrete
    rows.forEach(rx => {
      const ax = SX(rx);
      const anchor = [L(ax, cyT, ax, cyB - 10, C.STEELE, 0.6)];
      for (let k = 1; k <= 3; k++) anchor.push(L(ax - 3, cyT + k * 12, ax + 3, cyT + k * 12, C.STEELE, 0.6));
      g.push(hide("concrete", anchor.join(""), "hidden"));   // embedded anchor
    });
    // dims
    const flatLen = flatEnd - d.edge;   // flat top of the stiffener (first bolt -> inner face)
    if (flatLen > 0) g.push(hdim(SX(d.edge), SX(flatEnd), SZ(d.hUp) - 6, String(Math.round(flatLen))));
    g.push(vdim(SZ(d.hUp), SZ(0), SX(d.edge) - 12, String(d.hUp), C.RED));
    g.push(vdim(SZ(0), SZ(0) + d.tp, SX(PL1) + 12, String(d.tp), C.DIM));
    // Chain below the slab. On a sheet that drops the concrete it rides back up
    // by the slab depth so the view closes up instead of leaving a void.
    const dimY2 = cyB + 18;
    const dyR = dimY2 + chainGap;
    const plateY = dyR + rows.length * chainGap;
    const overallY = plateY + chainGap;
    const chain = [];
    // Show only the overall cavity-side overhang in elevation. The 6 mm weld
    // projection and exposed leg component remain dimensioned in plan.
    const sectionDimensionLanes = [
      dimY2,
      ...rows.map((unused, index) => dyR + index * chainGap),
      plateY
    ];
    chain.push(ext(SX(PL0), cyB, SX(PL0), overallY + 3,
      sectionDimensionLanes));
    chain.push(ext(SX(0), cyB, SX(0), dimY2 + 3));
    chain.push(hdim(SX(PL0), SX(0), dimY2, String(Math.round(-PL0))));
    rows.forEach((rx, i) => {
      const rowY = dyR + i * chainGap;
      chain.push(ext(SX(rx), cyB, SX(rx), rowY + 3,
        sectionDimensionLanes.filter(value => value < rowY)));
      chain.push(hdim(SX(0), SX(rx), rowY, String(rx)));
    });
    chain.push(ext(SX(PL1), cyB, SX(PL1), overallY + 3,
      sectionDimensionLanes));
    chain.push(hdim(SX(0), SX(PL1), plateY, String(d.plateLen)));
    chain.push(hdim(SX(PL0), SX(PL1), overallY,
      String(Math.round(totX))));
    g.push(`<g data-a4-shift="0 ${-concD}">${chain.join("")}</g>`);
    return g;
  }

  windpost.baseplateSection = Object.freeze({ drawSection });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateSection;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
