(function (global) {
  "use strict";
  // Base plate design constants (RGM 12, stainless). Falls back to literals if
  // windpost.parameters.baseplate is not generated.
  const windpost = global.Windpost = global.Windpost || {};
  const PP = (windpost.parameters && windpost.parameters.baseplate) || {};

  windpost.baseplateConfig = Object.freeze({
    fy:       PP.fy       ?? 210,     // MPa, tested/proof yield
    gM0:      PP.gM0      ?? 1.1,     // partial factor
    FtRd_kN:  PP.FtRd_kN  ?? 6.6,     // RGM 12 tension resistance / bolt
    FvRd_kN:  PP.FvRd_kN  ?? 13.7,    // RGM 12 shear resistance / bolt
    m:        PP.m        ?? 45,      // bolt centre -> stiffener edge
    w:        PP.w        ?? 96,      // gauge across width (2 columns)
    alpha:    PP.alpha    ?? 6,       // EC3 Fig 6.11 factor
    npry:     PP.npry     ?? 55,      // prying length n (Mode 2)
    e:        PP.e        ?? 55,      // edge distance
    edge:     PP.edge     ?? 55,      // longitudinal edge to first row
    holeDia:  PP.holeDia  ?? 14,
    boltDia:  PP.boltDia  ?? 12,
    nCol:     2,                      // columns across width (always 2)
    B:        220,                    // plate width (200 or 220)
    tpCandidates: Object.freeze([8, 10, 12]),
    tpCap:    10,                     // add a row before exceeding this
    edgeCandidates: Object.freeze([55, 60, 65]),
    saMin:    60,                     // min spacing / edge (RGM)
    hStep:    5                       // stiffener height rounding
  });

  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateConfig;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
