(function (global) {
  "use strict";
  // Bolt group: lever arms along the length, group moment resistance, and the
  // uniform-tension bolt demand.  Moments taken about the compression edge (X=0).
  const windpost = global.Windpost = global.Windpost || {};

  const armsList = (edge, pitch, nRow) => {
    const a = []; for (let i = 0; i < nRow; i++) a.push(edge + i * pitch); return a;
  };
  const sum = arms => arms.reduce((p, c) => p + c, 0);

  // Mr = nCol · Ft,Rd · Σ(row arms)   [N·mm]
  const groupMr = (arms, nCol, FtRd_N) => nCol * FtRd_N * sum(arms);
  // uniform bolt tension: nCol · T · Σarms = M  →  T   [N per bolt]
  const tension = (M_Nmm, arms, nCol) => M_Nmm / (nCol * sum(arms));

  windpost.baseplateBolt = Object.freeze({ armsList, groupMr, tension, sum });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateBolt;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
