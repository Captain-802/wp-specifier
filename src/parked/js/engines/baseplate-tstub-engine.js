(function (global) {
  "use strict";
  // Equivalent T-stub: plate plastic capacity, required rigid thickness, and the
  // three failure modes (all N / N·mm).
  const windpost = global.Windpost = global.Windpost || {};

  function modes(Leff, tp, fy, gM0, m, n, FtRd_N, M_Ed) {
    const Mpl = Leff * tp * tp * fy / (4 * gM0);        // plate plastic, N·mm
    const mode1 = 4 * Mpl / m;
    const mode2 = (2 * Mpl + n * FtRd_N) / (m + n);
    const mode3 = FtRd_N;
    return {
      Mpl,
      treq: Math.sqrt(4 * M_Ed * gM0 / (Leff * fy)),    // required rigid t, mm
      mode1, mode2, mode3,
      gov: Math.min(mode1, mode2, mode3)
    };
  }

  windpost.baseplateTStub = Object.freeze({ modes });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateTStub;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
