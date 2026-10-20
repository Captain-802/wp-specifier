(function (global) {
  "use strict";
  // ==========================================================================
  //  Base plate design engine — FACADE.
  //  Hybrid method: CED own logic + EC3-1-8 equivalent T-stub (SCI P291).
  //  The work is split across small single-purpose engines; this facade just
  //  re-exports the stable public API (windpost.baseplateEngine) so the UI and
  //  tests keep calling one object.  Internal units: mm, N, N·mm, MPa.
  //
  //  Engines (load order):  baseplate-config → -bolt-engine → -leff-engine →
  //  -tstub-engine → -stiffener-engine → -shear-engine → -check-engine →
  //  -sizer-engine → (this facade).
  // ==========================================================================
  const windpost = global.Windpost = global.Windpost || {};

  // In Node, pull the leaf engines in first (browser loads them via <script>).
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    ["./baseplate-config.js", "./baseplate-bolt-engine.js", "./baseplate-leff-engine.js",
     "./baseplate-tstub-engine.js", "./baseplate-stiffener-engine.js", "./baseplate-shear-engine.js",
     "./baseplate-check-engine.js", "./baseplate-sizer-engine.js"].forEach(require);
  }

  const cfg = windpost.baseplateConfig, Bolt = windpost.baseplateBolt, Le = windpost.baseplateLeff,
        Ts = windpost.baseplateTStub, St = windpost.baseplateStiffener, Sh = windpost.baseplateShear,
        Chk = windpost.baseplateCheck, Sz = windpost.baseplateSizer;

  windpost.baseplateEngine = Object.freeze({
    DEFAULTS:        cfg,
    armsList:        Bolt.armsList,
    leffGoverning:   Le.governing,
    tStub:           Ts.modes,
    teeZ:            St.teeZ,
    teeMr:           St.teeMr,
    stiffenerHeight: St.height,
    plateShear:      Sh.plate,
    check:           Chk.run,
    plateThickness:  Sz.plateThickness,
    autoDesign:      Sz.autoDesign
  });

  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateEngine;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
