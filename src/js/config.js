(function initialiseWindpostConfig(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  // Editable constants come from windpost.parameters (generated from
  // windpost-database.xlsx). The literals are the fallback if that generated
  // file is absent, so the calculator still runs with its original values.
  const P = (windpost.parameters && windpost.parameters.config) || {};

  windpost.config = Object.freeze({
    CM4_TO_MM4: 10000,
    CM3_TO_MM3: 1000,
    DENSITY_KN_PER_M3: P.density_kN_m3 ?? 78.5,
    DEFAULT_TIE_STRENGTH_KN: Object.freeze({
      L: (P.tieStrength && P.tieStrength.L) ?? 2.25,
      U: (P.tieStrength && P.tieStrength.U) ?? 1.713,
      // DU (double U) is tied with U ties; I posts sit in the inner leaf and
      // use shear ties, so they take the U and L strengths respectively.
      DU: (P.tieStrength && (P.tieStrength.DU ?? P.tieStrength.U)) ?? 1.713,
      I: (P.tieStrength && (P.tieStrength.I ?? P.tieStrength.L)) ?? 2.25
    }),
    // Ties per scheduled level shown on the supply schedule (capacity is
    // counted per level, as in the approved workbook).
    TIES_PER_LEVEL: Object.freeze({ U: 1, L: 1, DU: 2, I: 1 }),
    // Post weight rule from the approved workbook: blank width x thickness x
    // length x density (kg/m3 = 80.2984 / 0.00981).
    POST_DENSITY_KG_PER_M3: P.postDensity_kg_m3 ?? 80.2984 / 0.00981,
    PLATE_DENSITY_KG_PER_MM3: P.plateDensity_kg_mm3 ?? 8.185e-6,
    PARAPET_TOP_TIE_CLEARANCE_MM: P.parapetTopTieClearance_mm ?? 50,
    // Fold (blank) width shown on drawings, DXF, weights and results:
    // "workbook" = the approved spreadsheet lines exactly (U: 2a + b ...);
    // "developed" = the geometric development of the drawn section
    // (U: a + 2b ...). See fold-width-engine.js; they differ only for U/DU
    // posts with a != b.
    FOLD_WIDTH_BASIS: P.foldWidthBasis ?? "workbook",
    STORAGE_KEY: "windpost_saved_designs_original_gui_local_v1",
    PROPPED_CANTILEVER_DEFLECTION_COEFF: P.proppedCantileverDeflectionCoeff ?? 0.0054161216
  });
})(window);
