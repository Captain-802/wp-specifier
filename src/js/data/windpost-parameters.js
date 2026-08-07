// GENERATED FILE — DO NOT EDIT BY HAND.
// Rebuilt from windpost-database.xlsx by tools/build-database.js.
// To change the ties and constants, edit the workbook and run UPDATE-FROM-EXCEL.cmd.
(function initialiseWindpostParameters(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  windpost.parameters = Object.freeze({
    design: Object.freeze({
      fy: 127.27,
      e: 200,
      secantFy: 210,
      secantN: 7,
      firstTieSpacing: 225,
      standardTieSpacing: 225
    }),
    config: Object.freeze({
      tieStrength: Object.freeze({ U: 1.713, L: 2.25 }),
      density_kN_m3: 78.5,
      parapetTopTieClearance_mm: 50,
      proppedCantileverDeflectionCoeff: 0.0054161216
    }),
    tie: Object.freeze({
      list: Object.freeze([
      Object.freeze({ name: "EDC25-100", nominal_mm: 100, actual_mm: 108 }),
      Object.freeze({ name: "EDC25-125", nominal_mm: 125, actual_mm: 133 }),
      Object.freeze({ name: "EDC25-150", nominal_mm: 150, actual_mm: 158 }),
      Object.freeze({ name: "EDC25-175", nominal_mm: 175, actual_mm: 183 }),
      Object.freeze({ name: "EDC25-200", nominal_mm: 200, actual_mm: 208 }),
      Object.freeze({ name: "EDC25-225", nominal_mm: 225, actual_mm: 233 }),
      Object.freeze({ name: "EDC25-250", nominal_mm: 250, actual_mm: 258 }),
      Object.freeze({ name: "EDC25-275", nominal_mm: 275, actual_mm: 283 }),
      Object.freeze({ name: "EDC25-300", nominal_mm: 300, actual_mm: 308 }),
      Object.freeze({ name: "EDC25-325", nominal_mm: 325, actual_mm: 333 }),
      Object.freeze({ name: "EDC25-350", nominal_mm: 350, actual_mm: 358 }),
      Object.freeze({ name: "EDC25-375", nominal_mm: 375, actual_mm: 383 })
      ]),
      notch_mm: 7.6,
      tailBeyondNotch_mm: 11.17,
      minEmbedment_mm: 55,
      minGap_mm: 4,
      uInnerClearance_mm: 6,
      uTieActualLength_mm: 84,
      uTieInnerEmbedment_mm: 65.23,
      lInnerLeafEmbedment_mm: 90
    })
  });
})(window);
