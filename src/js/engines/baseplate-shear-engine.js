(function (global) {
  "use strict";
  // Plate plastic shear resistance:  Vpl,Rd = Av·(fy/√3)/gM0,  Av = B·tp.
  const windpost = global.Windpost = global.Windpost || {};

  function plate(B, tp, fy, gM0) {
    const Av = B * tp;
    return { Av, Vpl: Av * (fy / Math.sqrt(3)) / gM0 };
  }

  windpost.baseplateShear = Object.freeze({ plate });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateShear;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
