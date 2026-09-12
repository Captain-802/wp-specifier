(function initialiseFoldWidthEngine(global) {
  "use strict";

  // Fold (developed blank) width of a windpost, in millimetres — ONE source
  // for the production drawing, the DXF sheet, the post weight and the
  // Selector results.
  //
  // The approved workbook (WINDPOST_CALCULATOR_V2, sheets Sections_U/L/DU/I)
  // gives, with r = 1.5 t the inside bend radius and k = 0.38:
  //   L   ROUND(a + b  - 2(r + t) + (pi/2)(r + 0.38 t), 2)
  //   U   ROUND(2a + b - 4(r + t) +  pi   (r + 0.38 t), 2)
  //   DU  2 x U
  //   I   a                                       (flat plate)
  //
  // The U line develops TWO legs of a and one of b. The workbook's own area
  // and inertia lines, the tie rule (clear gap = cavity - 6 - a) and the
  // drawn blank all treat a as the single web across the cavity and b as
  // the two flanges, which develops a + 2b - 4(r + t) + pi(r + 0.38 t).
  // The two agree whenever a = b and differ by (a - b) otherwise. Both are
  // computed here; config.FOLD_WIDTH_BASIS picks which one the software
  // shows ("workbook" reproduces the spreadsheet exactly), and the production
  // validation warns whenever they differ.
  const windpost = global.Windpost = global.Windpost || {};

  const K_FACTOR = 0.38;
  const BASIS = Object.freeze({ workbook: "workbook", developed: "developed" });

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function dims(section) {
    const a = Number(section && section.a_mm);
    const b = Number(section && section.b_mm) || 0;
    const t = Number(section && section.t_mm);
    const stored = Number(section && section.innerRadius_mm);
    const r = Number.isFinite(stored) ? stored : 1.5 * t;
    return { a, b, t, r, family: familyOf(section) };
  }

  function familyOf(section) {
    const type = section && (section.type || section.shape);
    return ["U", "L", "DU", "I"].includes(type) ? type : "L";
  }

  function bendAllowance(r, t, angleFraction) {
    return Math.PI * angleFraction * (r + K_FACTOR * t);
  }

  // The spreadsheet lines, verbatim.
  function workbook(section) {
    const { a, b, t, r, family } = dims(section);
    if (![a, t].every(Number.isFinite) || t <= 0) return NaN;
    if (family === "I") return a;
    if (family === "L") return round2(a + b - 2 * (r + t) + bendAllowance(r, t, 0.5));
    const u = round2(2 * a + b - 4 * (r + t) + bendAllowance(r, t, 1));
    return family === "DU" ? round2(2 * u) : u;
  }

  // The geometric development of the drawn section (web a, flanges b).
  function developed(section) {
    const { a, b, t, r, family } = dims(section);
    if (![a, t].every(Number.isFinite) || t <= 0) return NaN;
    if (family === "I") return a;
    if (family === "L") return round2(a + b - 2 * (r + t) + bendAllowance(r, t, 0.5));
    const u = round2(a + 2 * b - 4 * (r + t) + bendAllowance(r, t, 1));
    return family === "DU" ? round2(2 * u) : u;
  }

  function formulaText(family, basis) {
    const u = basis === BASIS.developed
      ? "a + 2b - 4(r + t) + pi(r + 0.38t)"
      : "2a + b - 4(r + t) + pi(r + 0.38t)";
    return {
      L: "a + b - 2(r + t) + (pi/2)(r + 0.38t)",
      U: u,
      DU: `2 x [${u}]`,
      I: "a (flat plate)"
    }[family];
  }

  function basisInUse() {
    const configured = windpost.config && windpost.config.FOLD_WIDTH_BASIS;
    return configured === BASIS.developed ? BASIS.developed : BASIS.workbook;
  }

  // Everything a caller might show: the value on the chosen basis, both
  // candidates, the formula and whether they agree.
  function describe(section, requestedBasis) {
    const basis = requestedBasis === BASIS.developed || requestedBasis === BASIS.workbook
      ? requestedBasis
      : basisInUse();
    const family = familyOf(section);
    const workbook_mm = workbook(section);
    const developed_mm = developed(section);
    const value_mm = basis === BASIS.developed ? developed_mm : workbook_mm;
    const { a, b, t, r } = dims(section);
    return Object.freeze({
      family,
      basis,
      value_mm,
      workbook_mm,
      developed_mm,
      agree: Number.isFinite(workbook_mm) && Number.isFinite(developed_mm) &&
        Math.abs(workbook_mm - developed_mm) < 0.005,
      formula: formulaText(family, basis),
      a_mm: a, b_mm: b, t_mm: t, innerRadius_mm: r, kFactor: K_FACTOR
    });
  }

  function compute(section, requestedBasis) {
    return describe(section, requestedBasis).value_mm;
  }

  windpost.foldWidth = Object.freeze({
    K_FACTOR, BASIS, workbook, developed, describe, compute, basisInUse, familyOf
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.foldWidth;
  }
})(typeof window !== "undefined" ? window : globalThis);
