(function (global) {
  "use strict";
  // Auto-sizer.  Two stages:
  //  1. STANDARD TYPE FIRST — the standard cantilever plate type for the base
  //     moment (U-A..U-G / L-A..L-G from the connection library, same table as
  //     the approved workbook) is rebuilt as a bolt layout + stiffener and put
  //     through the full check set.  If it passes it IS the design, so the
  //     designer and the standard table agree.
  //  2. AUTO-SIZE — otherwise (moment beyond the standard range, a standard
  //     type that fails the checks, or no library) the layout is sized from
  //     M: fewest rows, then thinnest plate, then shortest plate.  Width and
  //     thickness follow the standard practice: 200 wide up to 260 long, 220
  //     above; 8 thick, 10 thick from 390 long.  Local plate bending
  //     (Mpl >= Ft,Ed·m) is always enforced.  t_w = t_p.
  const windpost = global.Windpost = global.Windpost || {};
  const roundUp = (x, step) => Math.ceil(x / step) * step;

  const STD_EDGE = 55;   // longitudinal edge of the standard plate types

  function widthFor(plateLen, d) {
    return plateLen <= (d.widthStep_mm ?? 260) ? (d.narrowB ?? 200) : (d.wideB ?? 220);
  }

  function minThicknessFor(plateLen, d) {
    return plateLen >= (d.thickLen_mm ?? 390) ? (d.thickTp ?? 10) : (d.thinTp ?? 8);
  }

  // smallest plate thickness resisting the local moment and the length rule
  function plateThickness(B, FtEd_N, m, plateLen, fy, gM0, cands, cap, d) {
    const Leff = 0.5 * B;                    // 0.5·bp governs L_eff
    const tmin = minThicknessFor(plateLen, d || {});
    for (const tp of cands) {
      if (tp > cap) break;
      if (tp < tmin) continue;
      const localCap = Leff * tp * tp * fy / (4 * gM0);
      if (localCap >= FtEd_N * m) return tp;
    }
    return null;
  }

  function standardTypes(family) {
    const db = windpost.connectionsDatabase;
    if (!db || !Array.isArray(db.basePlates)) return [];
    return db.basePlates.filter(p => p.family === family && Number.isFinite(p.capacity_kNm));
  }

  function standardFor(family, M) {
    const list = standardTypes(family);
    return list.find(p => M <= p.capacity_kNm + 1e-9) || null;
  }

  // Rebuild a standard plate type as a designer layout (edge 55, equal pitch).
  function standardLayout(p) {
    const nRow = Math.max(2, Math.round(p.bolts / 2));
    const pitch = nRow > 1 ? Math.round((p.plateLen_mm - 2 * STD_EDGE) / (nRow - 1)) : 0;
    return {
      nRow, nCol: 2, edge: STD_EDGE, pitch, tp: p.plateThk_mm,
      plateLen: 2 * STD_EDGE + (nRow - 1) * pitch,
      B: p.plateWid_mm, hUp: Math.max(p.stiffH1_mm, p.stiffH2_mm), tw: p.stiffThk_mm,
      standardCode: p.code
    };
  }

  function autoDesign(o) {
    const d = windpost.baseplateConfig, Bolt = windpost.baseplateBolt,
          St = windpost.baseplateStiffener, Chk = windpost.baseplateCheck;
    const fy = o.fy ?? d.fy, gM0 = o.gM0 ?? d.gM0;
    const FtRd_kN = o.FtRd_kN ?? d.FtRd_kN, FvRd_kN = o.FvRd_kN ?? d.FvRd_kN;
    const FtRd_N = FtRd_kN * 1000, FvRd_N = FvRd_kN * 1000;
    const m = o.m ?? d.m, w = o.w ?? d.w, alpha = o.alpha ?? d.alpha;
    const npry = o.npry ?? d.npry, e = o.e ?? d.e, nCol = d.nCol;

    const W = o.W_kN, H = o.H_m;
    const M = (o.M_kNm != null) ? o.M_kNm : (W * H / 2);      // kNm
    const M_Nmm = M * 1e6;
    const V_Ed = (o.V_kN != null ? o.V_kN : (W ?? 0)) * 1000; // base shear
    const Sreq = M * 1000 / (nCol * FtRd_kN);                 // required Σarms, mm
    const edges = o.edge != null ? [o.edge] : d.edgeCandidates.slice();

    const checkInput = (design) => ({
      fy, gM0, B: design.B, tp: design.tp, edge: design.edge, pitch: design.pitch,
      nRow: design.nRow, nCol, w, m, e, npry, alpha,
      hUp: design.hUp, tw: design.tw, FtRd_N, FvRd_N, M_Ed: M_Nmm, V_Ed
    });

    // ---- stage 1: the standard plate type for this moment band -------------
    const family = o.family || o.postType || null;
    const std = family ? standardFor(family, M) : null;
    let standardComparison = null;
    if (std) {
      const layout = standardLayout(std);
      layout.w = w; layout.m = m;
      const inp = checkInput(layout);
      const results = Chk.run(inp);
      standardComparison = { code: std.code, capacity_kNm: std.capacity_kNm, design: layout, results, pass: results.pass };
      if (results.pass && o.preferStandard !== false) {
        return {
          ok: true, moment: M, baseShear: V_Ed / 1000, design: layout, input: inp, results,
          basis: "standard", standardType: std.code, standardComparison
        };
      }
      // Standard plate and bolts adequate but the stiffener alone is short:
      // keep the standard plate/bolt layout and raise the stiffener to the
      // height the T-section check needs.
      const u = results.util;
      const onlyStiffener = !results.pass && u.stiffener > 1 &&
        Math.max(u.boltGroup, u.plateLocal, u.tstub, u.shearBolt, u.shearPlate) <= 1;
      if (onlyStiffener && o.preferStandard !== false) {
        const grown = { ...layout, hUp: St.height(layout.B, layout.tp, M_Nmm, layout.tw, fy, gM0, d.hStep) };
        if (grown.hUp != null) {
          const inp2 = checkInput(grown);
          const results2 = Chk.run(inp2);
          if (results2.pass) {
            return {
              ok: true, moment: M, baseShear: V_Ed / 1000, design: grown, input: inp2, results: results2,
              basis: "standard (stiffener raised)", standardType: std.code, standardComparison,
              stiffenerRaisedFrom_mm: layout.hUp
            };
          }
        }
      }
    }

    // ---- stage 2: auto-size -----------------------------------------------
    let design = null;
    for (let nRow = 2; nRow <= 10 && !design; nRow++) {
      const denom = nRow * (nRow - 1) / 2;
      let best = null;
      for (const edge of edges) {
        const pitch = Math.max(d.saMin, roundUp((Sreq - nRow * edge) / (denom || 1), 5));
        if (pitch > (d.pitchMax_mm ?? 150)) continue;      // add a row instead
        const arms = Bolt.armsList(edge, pitch, nRow);
        const sumArms = Bolt.sum(arms);
        if (nCol * FtRd_kN * sumArms / 1000 < M) continue;
        const plateLen = 2 * edge + (nRow - 1) * pitch;
        const B = o.B ?? widthFor(plateLen, d);
        const FtEd_N = M_Nmm / (nCol * sumArms);
        const tp = plateThickness(B, FtEd_N, m, plateLen, fy, gM0, d.tpCandidates, d.tpCap, d);
        if (tp == null) continue;
        const cand = { nRow, nCol, edge, pitch, tp, sumArms, plateLen, B };
        if (!best || cand.tp < best.tp || (cand.tp === best.tp && cand.plateLen < best.plateLen)) best = cand;
      }
      if (best) design = best;
    }
    if (!design) return { ok: false, reason: "No layout found within limits", moment: M, standardComparison };

    design.tw = design.tp;                                     // t_w = t_p
    design.hUp = St.height(design.B, design.tp, M_Nmm, design.tw, fy, gM0, d.hStep);
    design.w = w; design.m = m;

    const inp = checkInput(design);
    return {
      ok: true, moment: M, baseShear: V_Ed / 1000, design, input: inp, results: Chk.run(inp),
      basis: std ? (standardComparison && !standardComparison.pass ? "auto (standard type fails check)" : "auto") : "auto (beyond standard types)",
      standardType: std ? std.code : null, standardComparison
    };
  }

  windpost.baseplateSizer = Object.freeze({ plateThickness, widthFor, minThicknessFor, standardFor, standardLayout, autoDesign });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateSizer;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
