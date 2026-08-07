(function (global) {
  "use strict";
  // Auto-sizer: from M (or W,H) selects the bolt layout, derives the plate
  // thickness (local plastic bending + 14·tp pitch cap) and the stiffener height,
  // then runs the full check.  Objective: fewest rows, then thinnest plate, then
  // shortest plate.  t_w = t_p.
  const windpost = global.Windpost = global.Windpost || {};
  const roundUp = (x, step) => Math.ceil(x / step) * step;

  // smallest even plate thickness resisting the local moment and the pitch rule
  function plateThickness(B, FtEd_N, m, pitch, fy, gM0, cands, cap) {
    const Leff = 0.5 * B;                    // 0.5·bp governs L_eff
    for (const tp of cands) {
      if (tp > cap) break;
      const localCap = Leff * tp * tp * fy / (4 * gM0);
      if (localCap >= FtEd_N * m && 14 * tp >= pitch) return tp;
    }
    return null;
  }

  function autoDesign(o) {
    const d = windpost.baseplateConfig, Bolt = windpost.baseplateBolt,
          St = windpost.baseplateStiffener, Chk = windpost.baseplateCheck;
    const fy = o.fy ?? d.fy, gM0 = o.gM0 ?? d.gM0;
    const FtRd_kN = o.FtRd_kN ?? d.FtRd_kN, FvRd_kN = o.FvRd_kN ?? d.FvRd_kN;
    const FtRd_N = FtRd_kN * 1000, FvRd_N = FvRd_kN * 1000;
    const m = o.m ?? d.m, w = o.w ?? d.w, alpha = o.alpha ?? d.alpha;
    const npry = o.npry ?? d.npry, e = o.e ?? d.e, B = o.B ?? d.B, nCol = d.nCol;

    const W = o.W_kN, H = o.H_m;
    const M = (o.M_kNm != null) ? o.M_kNm : (W * H / 2);      // kNm
    const M_Nmm = M * 1e6;
    const V_Ed = (o.V_kN != null ? o.V_kN : (W ?? 0)) * 1000; // base shear
    const Sreq = M * 1000 / (nCol * FtRd_kN);                 // required Σarms, mm
    const edges = o.edge != null ? [o.edge] : d.edgeCandidates.slice();

    let design = null;
    for (let nRow = 2; nRow <= 10 && !design; nRow++) {
      const denom = nRow * (nRow - 1) / 2;
      let best = null;
      for (const edge of edges) {
        let pitch = Math.max(d.saMin, roundUp((Sreq - nRow * edge) / (denom || 1), 5));
        const arms = Bolt.armsList(edge, pitch, nRow);
        const sumArms = Bolt.sum(arms);
        if (nCol * FtRd_kN * sumArms / 1000 < M) continue;
        const FtEd_N = M_Nmm / (nCol * sumArms);
        const tp = plateThickness(B, FtEd_N, m, pitch, fy, gM0, d.tpCandidates, d.tpCap);
        if (tp == null) continue;
        const cand = { nRow, nCol, edge, pitch, tp, sumArms, plateLen: 2 * edge + (nRow - 1) * pitch };
        if (!best || cand.tp < best.tp || (cand.tp === best.tp && cand.plateLen < best.plateLen)) best = cand;
      }
      if (best) design = best;
    }
    if (!design) return { ok: false, reason: "No layout found within limits", moment: M };

    design.tw = design.tp;                                     // t_w = t_p
    design.hUp = St.height(B, design.tp, M_Nmm, design.tw, fy, gM0, d.hStep);
    design.B = B; design.w = w; design.m = m;

    const inp = {
      fy, gM0, B, tp: design.tp, edge: design.edge, pitch: design.pitch,
      nRow: design.nRow, nCol, w, m, e, npry, alpha,
      hUp: design.hUp, tw: design.tw, FtRd_N, FvRd_N, M_Ed: M_Nmm, V_Ed
    };
    return { ok: true, moment: M, baseShear: V_Ed / 1000, design, input: inp, results: Chk.run(inp) };
  }

  windpost.baseplateSizer = Object.freeze({ plateThickness, autoDesign });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateSizer;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
