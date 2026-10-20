(function (global) {
  "use strict";
  // Side view for the simply-supported standard detail. The post is
  // welded directly to the 6 mm floating plate; no stiffener is drawn.
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
    const {
      C, line: L, rect: R, rawRect, text: T, hdim, vdim, ext
    } = svg;
    const {
      d, a, t, rows, PL0, PL1, PX0, PX1, totX, secName, CLEAR,
      REAR_PROJECTION, sectionTitleY, postH, SX, SZ, concD, sideDimY
    } = ctx;
    const g = [];

    g.push(T(SX(PL0), sectionTitleY,
      "SIMPLY-SUPPORTED U-POST BASE — SIDE VIEW",
      9.5, C.INK, "start", true));
    if (d.typeCode) {
      g.push(T(SX(PL0), sectionTitleY + 11, d.typeCode + "  " + d.typeTitle, 7, C.INK, "start", true));
    }

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
    g.push(hide("wall", T(SX(0) + 4, SZ(postH * 0.64),
      "inner-leaf / concrete edge", 6.5, C.MASON, "start")));
    g.push(L(SX(0), SZ(postH * 0.72), SX(0), concreteBottom,
      C.RED, 0.6, "4,2"));
    g.push(svg.cad("steelCut", R(SX(PL0), SZ(0), totX, d.tp, C.PLATEF, C.INK, 0.7)));

    // The centre section intersects both U flanges. A single continuation
    // break spans the windpost.
    drawContinuedUPost(g, svg, SX(PX0), SX(PX0 + t),
      SX(PX1 - t), SX(PX1), SZ(0), postH, "#eef1f4");
    g.push(T((SX(PX0) + SX(PX1)) / 2, SZ(0) - postH * 0.52,
      secName, 8.5, C.INK, "middle", true, -90));

    // Both transverse anchors project onto the same X coordinate in this view.
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

    // Independent horizontal chains below the concrete avoid crossed arrows.
    // On a sheet that drops the concrete they ride back up by the slab depth.
    const sectionDimensionLanes = [
      sideDimY,
      sideDimY + 13,
      sideDimY + 26,
      sideDimY + 39,
      sideDimY + 52
    ];
    const chain = [
      ext(SX(PL0), concreteBottom, SX(PL0), sideDimY + 55,
        sectionDimensionLanes),
      ext(SX(PX0), concreteBottom, SX(PX0), sideDimY + 4),
      ext(SX(PX1), concreteBottom, SX(PX1), sideDimY + 4),
      ext(SX(0), concreteBottom, SX(0), sideDimY + 55,
        sectionDimensionLanes),
      ext(SX(rows[0]), concreteBottom, SX(rows[0]), sideDimY + 31,
        sectionDimensionLanes.slice(0, 3)),
      ext(SX(PL1), concreteBottom, SX(PL1), sideDimY + 55,
        sectionDimensionLanes),
      hdim(SX(PL0), SX(PX0), sideDimY, String(REAR_PROJECTION), C.RED),
      hdim(SX(PX0), SX(PX1), sideDimY, String(a), C.BLUE),
      hdim(SX(PX1), SX(0), sideDimY, String(CLEAR), C.RED),
      hdim(SX(PL0), SX(0), sideDimY + 13, String(Math.round(-PL0))),
      hdim(SX(0), SX(rows[0]), sideDimY + 26, String(d.anchorFromConcreteEdge)),
      hdim(SX(rows[0]), SX(PL1), sideDimY + 26, String(d.rightEndDistance)),
      hdim(SX(0), SX(PL1), sideDimY + 39, String(d.plateLen)),
      hdim(SX(PL0), SX(PL1), sideDimY + 52, String(Math.round(totX)))
    ];
    g.push(`<g data-a4-shift="0 ${-concD}">${chain.join("")}</g>`);
    return g;
  }

  windpost.simplyUBaseplateSection = Object.freeze({ drawSection });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.simplyUBaseplateSection;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
