// GENERATED FILE — DO NOT EDIT BY HAND.
// Flat plate post built into the inner leaf (a x t). Ixx = t a^3/12; simply supported only; shear ties only.
// Source: WINDPOST_CALCULATOR_V2.xlsx (Sections_I), 11 Sep 2026.
(function initialiseStandardISectionDatabase(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const sections = Object.freeze([
      {
        type: "I",
        shape: "I",
        name: "I_90 X 8",
        a_mm: 90, b_mm: null, t_mm: 8,
        innerRadius_mm: 0, outerRadius_mm: 8,
        blankWidth_mm: 90,
        crossSectionalArea_mm2: 720,
        centroidY_mm: 45.0,
        ixx_mm4: 486000,
        zTop_mm3: 10800,
        zBottom_mm3: 10800,
        zxx_mm3: 10800,
        standardBasePlate: { length_mm: 205, width_mm: 150, thickness_mm: 6, weight_kg: 1.52 }
      },
      {
        type: "I",
        shape: "I",
        name: "I_100 X 8",
        a_mm: 100, b_mm: null, t_mm: 8,
        innerRadius_mm: 0, outerRadius_mm: 8,
        blankWidth_mm: 100,
        crossSectionalArea_mm2: 800,
        centroidY_mm: 50.0,
        ixx_mm4: 666666.666667,
        zTop_mm3: 13333.333333,
        zBottom_mm3: 13333.333333,
        zxx_mm3: 13333.333333,
        standardBasePlate: { length_mm: 205, width_mm: 150, thickness_mm: 6, weight_kg: 1.52 }
      },
      {
        type: "I",
        shape: "I",
        name: "I_110 X 8",
        a_mm: 110, b_mm: null, t_mm: 8,
        innerRadius_mm: 0, outerRadius_mm: 8,
        blankWidth_mm: 110,
        crossSectionalArea_mm2: 880,
        centroidY_mm: 55.0,
        ixx_mm4: 887333.333333,
        zTop_mm3: 16133.333333,
        zBottom_mm3: 16133.333333,
        zxx_mm3: 16133.333333,
        standardBasePlate: { length_mm: 205, width_mm: 150, thickness_mm: 6, weight_kg: 1.52 }
      },
      {
        type: "I",
        shape: "I",
        name: "I_120 X 8",
        a_mm: 120, b_mm: null, t_mm: 8,
        innerRadius_mm: 0, outerRadius_mm: 8,
        blankWidth_mm: 120,
        crossSectionalArea_mm2: 960,
        centroidY_mm: 60.0,
        ixx_mm4: 1152000,
        zTop_mm3: 19200,
        zBottom_mm3: 19200,
        zxx_mm3: 19200,
        standardBasePlate: { length_mm: 205, width_mm: 150, thickness_mm: 6, weight_kg: 1.52 }
      }
  ].map(Object.freeze));

  windpost.iSectionDatabase = Object.freeze({ sections });
})(typeof window !== "undefined" ? window : globalThis);
