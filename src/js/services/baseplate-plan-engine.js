(function (global) {
  "use strict";
  // Plan view: plate, inner-leaf hatch, back-welded stiffener, folded post,
  // holes, A-A marks and the full fabrication dimension set.  Returns an array
  // of SVG fragment strings.  ctx = geometry context, svg = primitive builder.
  const windpost = global.Windpost = global.Windpost || {};

  function drawPlan(ctx, svg) {
    const { C, cad, line: L, rect: R, rawRect, circle: Ci, poly: POLY, text: T, textLines: TL, hdim, vdim, ext, leader } = svg;
    const { d, a, b, t, rows, hole, mm, cols, CANT, PL0, PL1, PX0, totX, B,
            PROF, EMBED, WELD, LEAF, planTop, PX, PY, planChainY,
            chainGap } = ctx;
    const g = [];

    g.push(T(PX(PL0), planTop - 57, "CONNECTION — PLAN", 9.5, C.INK, "start", true));
    g.push(cad("steelCut", R(PX(PL0), planTop, totX, B, "none", C.INK, 0.7)));
    // The wall is tagged so a composed sheet can drop it and show the
    // connection on its own; the full drawing keeps it.
    g.push(`<g data-a4-hide="wall" data-cad="masonry">` +
      rawRect(PX(0), planTop, LEAF, B, "url(#bpMason)", C.MASON, 0.5, "3,2") +
      T(PX(LEAF) + 3, planTop + 11, "inner leaf", 6.5, C.MASON, "start") + `</g>`);
    g.push(cad("steel", R(PX(d.edge), PY(t / 2), PL1 - d.edge, d.tw, "none", C.STEELE, 0.5)));  // stiffener on the a-leg back
    g.push(cad("steelCut", POLY(PROF.map(p => [PX(p[0]), PY(p[1])]), "none", C.INK, 0.7)));     // folded post
    g.push(cad("weld", L(PX(d.edge), PY(t / 2), PX(EMBED), PY(t / 2), C.WELDC, 0.8)));           // stiffener weld line
    rows.forEach(rx => cols.forEach(cy => {
      const hx = PX(rx), hy = PY(cy);
      g.push(Ci(hx, hy, hole / 2, C.HOLEF, C.INK, 0.6));
      g.push(cad("centre",                                                            // bolt centre-lines
        L(hx - hole * 0.85, hy, hx + hole * 0.85, hy, C.DIM, 0.25, "3,1.5") +
        L(hx, hy - hole * 0.85, hx, hy + hole * 0.85, C.DIM, 0.25, "3,1.5")));
    }));

    // All horizontal dimensions use the plate's left edge as one fabrication
    // datum; the three post-location values occupy separate cumulative lanes.
    const dyT = planTop - 8;
    g.push(hdim(PX(PL0), PX(PX0), dyT, String(WELD), C.RED));
    g.push(hdim(PX(PL0), PX(0), dyT - 13,
      String(Math.round(-PL0)), C.RED));
    g.push(hdim(PX(PL0), PX(EMBED), dyT - 26,
      String(Math.round(EMBED - PL0)), C.BLUE));
    // left: across-width chain + overall width
    const dxL = PX(PL0) - 18;
    g.push(vdim(planTop, PY(cols[0]), dxL, String(Math.round(B / 2 + cols[0]))));
    g.push(vdim(PY(cols[0]), PY(cols[1]), dxL, String(d.w), C.BLUE));
    g.push(vdim(PY(cols[1]), planTop + B, dxL, String(Math.round(B / 2 - cols[1]))));
    g.push(vdim(planTop, planTop + B, PX(PL0) - 36, String(B)));
    // bolt -> stiffener offsets (m) and stiffener thickness
    // place the bolt->stiffener offset dims (m) in a clear gap OUTSIDE the wall hatch
    let mX = PX(rows.length > 1 ? 0.5 * (rows[rows.length - 2] + rows[rows.length - 1]) : d.edge + 40);
    for (let i = 1; i < rows.length; i++) { const mid = 0.5 * (rows[i - 1] + rows[i]); if (mid > LEAF) { mX = PX(mid); break; } }
    g.push(vdim(PY(cols[0]), PY(t / 2), mX, String(mm)));
    g.push(vdim(PY(t / 2 + d.tw), PY(cols[1]), mX, String(Math.round(d.w - mm - d.tw))));
    g.push(vdim(PY(t / 2), PY(t / 2 + d.tw), PX(PL1) - 22, String(d.tw)));
    // Anchor rows and plate end are cumulative from the same left datum.
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
    // callouts with leader arrows to the features (clear, no overlap)
    const cxL = PX(PL1) + 26;
    // hole -> diameter only, sat INSIDE the plate with a leader to the hole
    const holeX = PX(rows[0]), holeY = PY(cols[0]);
    g.push(T(holeX - 26, holeY + 3, "Ø " + hole, 8, C.INK, "end"));
    g.push(leader(holeX - 24, holeY, holeX, holeY, C.INK));
    // base plate -> arrow to the plate right edge
    g.push(TL(cxL, PY(-29),
      [Math.round(totX) + " × " + B + " × " + d.tp + " mm", "BASE PLATE"],
      8, C.INK, "start", [1]));
    g.push(leader(cxL - 4, PY(-30), PX(PL1), PY(-54), C.INK));
    // stiffener -> arrow to the stiffener bar
    g.push(T(cxL, PY(26), d.tw + " mm stiffener", 8, C.INK, "start"));
    g.push(leader(cxL - 4, PY(22), PX(PL1) - 36, PY(t / 2 + d.tw / 2), C.INK));
    return g;
  }

  windpost.baseplatePlan = Object.freeze({ drawPlan });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplatePlan;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
