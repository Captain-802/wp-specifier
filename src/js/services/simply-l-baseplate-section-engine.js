(function (global) {
  "use strict";
  // Side view for the simply-supported L-post standard detail.
  const windpost = global.Windpost = global.Windpost || {};

  function drawContinuedPost(g, svg, x1, x2, z0, postH) {
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
    g.push(svg.cad("steelCut", POLY(pts, "#eef1f4", C.INK, 0.7,
      "windpost-continuation-break")));
  }

  function drawSection(ctx, svg) {
    const {
      C, line: L, rect: R, rawRect, text: T, hdim, vdim, ext
    } = svg;
    const {
      d, rows, PL0, PL1, PX0, PX1, totX, secName,
      LEAF, sectionTitleY, postH, SX, SZ, concD,
      wallH, sideDimY
    } = ctx;
    const g = [];

    g.push(T(SX(PL0), sectionTitleY,
      "SIMPLY-SUPPORTED L-POST BASE — SIDE VIEW",
      9.5, C.INK, "start", true));

    // Surroundings are tagged so a composed sheet can drop them and show the
    // connection on its own; the full drawing keeps them.
    const hide = (kind, parts) => `<g data-a4-hide="${kind}">${parts}</g>`;
    const concreteTop = SZ(0) + d.tp;
    const concreteBottom = concreteTop + concD;
    const concreteRight = SX(PL1) + 22;
    g.push(hide("concrete",
      rawRect(SX(0), concreteTop, concreteRight - SX(0), concD,
        "url(#bpHatch)", C.STEELE, 0.5) +
      T((SX(0) + concreteRight) / 2, concreteBottom - 7,
        "CONCRETE", 8, C.DIM, "middle")));
    g.push(hide("wall",
      rawRect(SX(0), SZ(0) - wallH, LEAF, wallH,
        "url(#bpMason)", C.MASON, 0.5, "3,2") +
      T(SX(0) + 4, SZ(postH * 0.65),
        "inner-leaf / concrete edge", 6.5, C.MASON, "start")));
    g.push(L(SX(0), SZ(postH * 0.74), SX(0), concreteBottom,
      C.RED, 0.6, "4,2"));
    g.push(svg.cad("steelCut", R(SX(PL0), SZ(0), totX, d.tp, C.PLATEF, C.INK, 0.7)));

    // The centre section follows the L long leg through its full depth.
    drawContinuedPost(g, svg, SX(PX0), SX(PX1), SZ(0), postH);
    g.push(T((SX(PX0) + SX(PX1)) / 2, SZ(0) - postH * 0.52,
      secName, 8.5, C.INK, "middle", true, -90));

    // Both transverse anchors project to the single 90 mm line in side view.
    // They live inside the slab, so they go with it on a composed sheet.
    const anchorX = SX(rows[0]);
    const anchors = [
      L(anchorX - 2.2, concreteTop, anchorX - 2.2, concreteBottom - 10, C.STEELE, 0.55, "3,2"),
      L(anchorX + 2.2, concreteTop, anchorX + 2.2, concreteBottom - 10, C.STEELE, 0.55, "3,2")
    ];
    for (let k = 1; k <= 3; k++) {
      anchors.push(L(anchorX - 5, concreteTop + k * 12,
        anchorX + 5, concreteTop + k * 12, C.STEELE, 0.5, "3,2"));
    }
    g.push(hide("concrete", anchors.join("")));
    g.push(T(SX(PL1) - 3, SZ(0) - 8,
      Math.round(totX) + " × " + d.B + " × " + d.tp + " mm BASE PLATE",
      7.5, C.INK, "end"));
    g.push(vdim(SZ(0), SZ(0) + d.tp, SX(PL1) + 12,
      String(d.tp), C.DIM));

    // Chain below the slab. On a sheet that drops the concrete it rides back
    // up by the slab depth so the view closes up instead of leaving a void.
    const sectionDimensionLanes = [
      sideDimY + 13,
      sideDimY + 26,
      sideDimY + 39,
      sideDimY + 52
    ];
    const chain = [
      ext(SX(PL0), concreteBottom, SX(PL0), sideDimY + 55,
        sectionDimensionLanes),
      ext(SX(0), concreteBottom, SX(0), sideDimY + 55,
        sectionDimensionLanes),
      ext(SX(rows[0]), concreteBottom, SX(rows[0]), sideDimY + 31,
        sectionDimensionLanes.slice(0, 2)),
      ext(SX(PL1), concreteBottom, SX(PL1), sideDimY + 55,
        sectionDimensionLanes),
      hdim(SX(PL0), SX(0), sideDimY + 13, String(Math.round(-PL0))),
      hdim(SX(0), SX(rows[0]), sideDimY + 26, String(d.anchorFromConcreteEdge)),
      hdim(SX(rows[0]), SX(PL1), sideDimY + 26, String(d.rightEndDistance)),
      hdim(SX(0), SX(PL1), sideDimY + 39, String(d.plateLen)),
      hdim(SX(PL0), SX(PL1), sideDimY + 52, String(Math.round(totX)))
    ];
    g.push(`<g data-a4-shift="0 ${-concD}">${chain.join("")}</g>`);
    return g;
  }

  windpost.simplyLBaseplateSection = Object.freeze({ drawSection });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.simplyLBaseplateSection;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
