(function (global) {
  "use strict";
  // EC3-1-8 Table 6.6 equivalent T-stub effective lengths (all patterns) and the
  // governing minimum.  Params: { m, mx, e, ex, w, pitch, bp, alpha } (mm).
  const windpost = global.Windpost = global.Windpost || {};
  const PI = Math.PI;

  function governing(p) {
    const { m, mx, e, ex, w, pitch, bp, alpha } = p;
    const P = {
      out_cp:       Math.min(2 * PI * mx, PI * mx + w, PI * mx + 2 * e),
      out_nc:       Math.min(4 * mx + 1.25 * ex, e + 2 * mx + 0.625 * ex, 0.5 * bp, 0.5 * w + 2 * mx + 0.625 * ex),
      first_cp_ind: 2 * PI * m,
      first_nc_ind: alpha * m,
      first_cp_grp: PI * m + pitch,
      first_nc_grp: 0.5 * pitch + alpha * m - (2 * m + 0.625 * e),
      end_cp_ind:   2 * PI * m,
      end_nc_ind:   4 * m + 1.25 * e,
      end_cp_grp:   PI * m + pitch,
      end_nc_grp:   2 * m + 0.625 * e + 0.5 * pitch
    };
    let gov = Infinity; for (const k in P) gov = Math.min(gov, P[k]);
    return { patterns: P, gov };
  }

  windpost.baseplateLeff = Object.freeze({ governing });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateLeff;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
