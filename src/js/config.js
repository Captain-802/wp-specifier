(function initialiseWindpostConfig(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  // Editable constants come from windpost.parameters (generated from
  // windpost-database.xlsx). The literals are the fallback if that generated
  // file is absent, so the calculator still runs with its original values.
  const P = (windpost.parameters && windpost.parameters.config) || {};

  const U_TIE_STRENGTH_KN = (P.tieStrength && P.tieStrength.U) ?? 1.713;

  // A DU is two channels side by side and carries TWO sets of ties at every
  // level, so a tie level resists twice what a single U does. Derived from
  // the U value rather than written out, so it follows any workbook change.
  const DU_TIE_SETS_PER_LEVEL = 2;

  const L_TIE_STRENGTH_KN = (P.tieStrength && P.tieStrength.L) ?? 2.25;

  // ---------------------------------------------------------------------
  // Tie strength grid.
  //
  // A tie level is a load path in series:
  //
  //   wind -> outer leaf -> EDC tie -> windpost -> inner tie -> inner leaf
  //
  // so the level is only as strong as its weaker end. Each leaf carries its
  // own strength, per post type and per load case, matching the Ties sheet
  // columns in the capacity workbook (U_SS, U_Cant, U_Point, L_*, DU_*).
  //
  //   level capacity = min(inner, outer) x sets per level
  //
  // Values are per SET. A DU carries two sets, so its level works out at
  // twice a U's - which reproduces the previous single-value model exactly
  // while the catalogue has inner and outer equal.
  // ---------------------------------------------------------------------
  const TIE_LOAD_CASES = Object.freeze(["SS", "Cant", "Point"]);
  const TIE_LEAVES = Object.freeze(["inner", "outer"]);

  const TIE_LOAD_CASE_LABELS = Object.freeze({
    SS: "Simply supported", Cant: "Cantilever", Point: "Cantilever, top point load"
  });

  // The names the drawings and schedules use for each leaf's tie, so the
  // editor lists ties by the name the engineer sees on the output.
  const TIE_LEAF_LABELS = Object.freeze({
    U: { inner: "U tie", outer: "EDC tie" },
    L: { inner: "Shear tie", outer: "EDC tie" },
    DU: { inner: "U tie", outer: "EDC tie" }
  });

  const TIE_LABELS = Object.freeze({
    U: "U tie", L: "Shear tie", DU: "U tie (2 sets per level)"
  });

  function setsPerLevel(type) {
    return type === "DU" ? DU_TIE_SETS_PER_LEVEL : 1;
  }

  // Catalogue grid. Both leaves start from the published per-set figure for
  // the post family; the workbook holds one column per post and load case.
  function catalogueFor(type) {
    return type === "L" ? L_TIE_STRENGTH_KN : U_TIE_STRENGTH_KN;
  }

  const GRID = (P.tieGrid && typeof P.tieGrid === "object") ? P.tieGrid : null;

  const DEFAULT_TIE_GRID = Object.freeze(["U", "L", "DU"].reduce((posts, type) => {
    posts[type] = Object.freeze(TIE_LOAD_CASES.reduce((cases, loadCase) => {
      const supplied = GRID && GRID[type] && GRID[type][loadCase];
      cases[loadCase] = Object.freeze({
        inner: (supplied && supplied.inner) ?? catalogueFor(type),
        outer: (supplied && supplied.outer) ?? catalogueFor(type)
      });
      return cases;
    }, Object.create(null)));
    return posts;
  }, Object.create(null)));

  // Per-level totals at catalogue values, kept for the engines and tests that
  // ask for "the" tie strength of a post family.
  const DEFAULT_TIE_STRENGTH_KN = Object.freeze(["U", "L", "DU"].reduce((all, type) => {
    const g = DEFAULT_TIE_GRID[type].SS;
    all[type] = Math.min(g.inner, g.outer) * setsPerLevel(type);
    return all;
  }, Object.create(null)));

  // supportCondition + loadType as used by the selector -> grid column.
  function loadCaseOf(supportCondition, loadType) {
    if (supportCondition === "cantilever") {
      return loadType === "tipPointLoad" ? "Point" : "Cant";
    }
    return "SS";
  }

  // ---------------------------------------------------------------------
  // Design assumptions.
  //
  // The material and spacing constants behind every calculation. Same
  // pattern as the tie strengths: DESIGN_DEFAULTS holds the catalogue
  // values and never changes; edits live in an override store that
  // designValue() reads through. The bounds are sanity limits to catch a
  // mistyped figure, not code limits.
  // ---------------------------------------------------------------------
  const PD = (windpost.parameters && windpost.parameters.design) || {};

  const DESIGN_SPEC = Object.freeze([
    { key: "fy", label: "Allowable stress", hint: "fᵧ in bending",
      unit: "N/mm²", decimals: 2, min: 1, max: 2000, value: PD.fy ?? 127.27 },
    { key: "e", label: "Initial E", hint: "Young's modulus",
      unit: "kN/mm²", decimals: 0, min: 1, max: 1000, value: PD.e ?? 200 },
    { key: "secantFy", label: "Secant fᵧ", hint: "Ramberg-Osgood proof strength",
      unit: "N/mm²", decimals: 2, min: 1, max: 2000, value: PD.secantFy ?? 210 },
    { key: "secantN", label: "Secant exponent", hint: "Ramberg-Osgood n",
      unit: "", decimals: 2, min: 1, max: 100, value: PD.secantN ?? 7 },
    { key: "firstTieSpacing", label: "First tie spacing", hint: "base to first tie",
      unit: "mm", decimals: 0, min: 1, max: 5000, value: PD.firstTieSpacing ?? 225 },
    { key: "standardTieSpacing", label: "Standard tie spacing", hint: "tie to tie",
      unit: "mm", decimals: 0, min: 1, max: 5000, value: PD.standardTieSpacing ?? 225 },
    { key: "apply10mmLimit", label: "10 mm deflection cap", hint: "cap deflection at 10 mm",
      type: "boolean", value: false }
  ]);

  const DESIGN_KEYS = Object.freeze(DESIGN_SPEC.map((d) => d.key));
  const DESIGN_META = Object.freeze(DESIGN_SPEC.reduce((all, d) => {
    all[d.key] = d;
    return all;
  }, Object.create(null)));
  const DESIGN_DEFAULTS = Object.freeze(DESIGN_SPEC.reduce((all, d) => {
    all[d.key] = d.value;
    return all;
  }, Object.create(null)));

  // ---------------------------------------------------------------------
  // Tie strength overrides.
  //
  // DEFAULT_TIE_STRENGTH_KN stays frozen as the catalogue values. Anything
  // the engineer types is held here instead, and every engine reads through
  // tieStrength() so one edit reaches the capacity, the report and the
  // baseplate service alike. Values are per TIE LEVEL, not per individual
  // tie: a DU level carries two sets, which is why its default is 2 x U.
  // ---------------------------------------------------------------------
  const OVERRIDE_STORAGE_KEY = "windpost_tie_strength_overrides_v1";
  const TIE_TYPES = Object.freeze(["U", "L", "DU"]);
  let overrides = Object.create(null);

  function isValidStrength(value) {
    // Guard the type first: Number(null), Number("") and Number([]) are all 0,
    // which would otherwise be accepted as a deliberate zero strength.
    if (typeof value !== "number" && typeof value !== "string") return false;
    if (typeof value === "string" && value.trim() === "") return false;
    const n = Number(value);
    // 0 is legitimate (ties discounted entirely); the cap only blocks typos.
    return Number.isFinite(n) && n >= 0 && n <= 1000;
  }

  function readStoredOverrides() {
    // Google Sites serves the page from a sandboxed iframe where storage can
    // throw on access, so a failure here must leave the defaults standing.
    try {
      const raw = global.localStorage && global.localStorage.getItem(OVERRIDE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Keys are "<post>.<loadCase>.<leaf>". Anything else is from an older
      // build of the single-value model and is discarded rather than guessed.
      TIE_TYPES.forEach((type) => TIE_LOAD_CASES.forEach((loadCase) => {
        TIE_LEAVES.forEach((leaf) => {
          const key = `${type}.${loadCase}.${leaf}`;
          if (Object.prototype.hasOwnProperty.call(parsed, key) && isValidStrength(parsed[key])) {
            overrides[key] = Number(parsed[key]);
          }
        });
      }));
    } catch (error) {
      overrides = Object.create(null);
    }
  }

  function persistOverrides() {
    try {
      if (!global.localStorage) return;
      if (Object.keys(overrides).length === 0) global.localStorage.removeItem(OVERRIDE_STORAGE_KEY);
      else global.localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
    } catch (error) { /* storage unavailable - overrides stay in memory */ }
  }

  // --- design assumption overrides, same shape as the tie layer ---------
  const DESIGN_STORAGE_KEY = "windpost_design_overrides_v1";
  let designOverrides = Object.create(null);

  function isValidDesignValue(key, value) {
    const meta = DESIGN_META[key];
    if (!meta) return false;
    if (meta.type === "boolean") return typeof value === "boolean";
    if (typeof value !== "number" && typeof value !== "string") return false;
    if (typeof value === "string" && value.trim() === "") return false;
    const n = Number(value);
    return Number.isFinite(n) && n >= meta.min && n <= meta.max;
  }

  function normaliseDesignValue(key, value) {
    return DESIGN_META[key].type === "boolean" ? Boolean(value) : Number(value);
  }

  function readStoredDesignOverrides() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(DESIGN_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      DESIGN_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(parsed, key) && isValidDesignValue(key, parsed[key])) {
          designOverrides[key] = normaliseDesignValue(key, parsed[key]);
        }
      });
    } catch (error) {
      designOverrides = Object.create(null);
    }
  }

  function persistDesignOverrides() {
    try {
      if (!global.localStorage) return;
      if (Object.keys(designOverrides).length === 0) global.localStorage.removeItem(DESIGN_STORAGE_KEY);
      else global.localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(designOverrides));
    } catch (error) { /* storage unavailable - overrides stay in memory */ }
  }

  function designValue(key) {
    return Object.prototype.hasOwnProperty.call(designOverrides, key)
      ? designOverrides[key]
      : DESIGN_DEFAULTS[key];
  }

  function setDesignValue(key, value) {
    if (!isValidDesignValue(key, value)) return false;
    designOverrides[key] = normaliseDesignValue(key, value);
    persistDesignOverrides();
    return true;
  }

  function clearDesignValue(key) {
    delete designOverrides[key];
    persistDesignOverrides();
  }

  function resetDesignValues() {
    designOverrides = Object.create(null);
    persistDesignOverrides();
  }

  function isDesignCustom(key) {
    if (key === undefined) return DESIGN_KEYS.some((k) => isDesignCustom(k));
    return designValue(key) !== DESIGN_DEFAULTS[key];
  }

  function listDesignValues() {
    return DESIGN_SPEC.map((meta) => ({
      key: meta.key,
      label: meta.label,
      hint: meta.hint,
      unit: meta.unit || "",
      decimals: meta.decimals,
      type: meta.type || "number",
      min: meta.min,
      max: meta.max,
      value: designValue(meta.key),
      defaultValue: DESIGN_DEFAULTS[meta.key],
      custom: isDesignCustom(meta.key)
    }));
  }

  // The values actually used by a calculation. The detailed report prints
  // these, so it must show what was used, not what the catalogue says.
  function currentDesignValues() {
    return DESIGN_KEYS.reduce((all, key) => {
      all[key] = designValue(key);
      return all;
    }, {});
  }

  // Anything edited at all - drives the single "edited" badge in the panel.
  function isAnyAssumptionCustom() {
    return isTieStrengthCustom() || isDesignCustom();
  }

  function resetAllAssumptions() {
    resetTieStrengths();
    resetDesignValues();
  }

  const gridKey = (type, loadCase, leaf) => `${type}.${loadCase}.${leaf}`;

  // Strength of one tie at one leaf, for a post family and load case.
  function tieLeafStrength(type, loadCase, leaf) {
    const key = gridKey(type, loadCase, leaf);
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
    return DEFAULT_TIE_GRID[type][loadCase][leaf];
  }

  function defaultLeafStrength(type, loadCase, leaf) {
    return DEFAULT_TIE_GRID[type][loadCase][leaf];
  }

  // What a whole tie level resists: the weaker end of the load path, times
  // the number of tie sets the post carries at that level.
  function tieStrength(type, loadCase) {
    const useCase = TIE_LOAD_CASES.includes(loadCase) ? loadCase : "SS";
    return Math.min(
      tieLeafStrength(type, useCase, "inner"),
      tieLeafStrength(type, useCase, "outer")
    ) * setsPerLevel(type);
  }

  function setTieStrength(type, loadCase, leaf, value) {
    if (!TIE_TYPES.includes(type) || !TIE_LOAD_CASES.includes(loadCase) ||
        !TIE_LEAVES.includes(leaf) || !isValidStrength(value)) {
      return false;
    }
    overrides[gridKey(type, loadCase, leaf)] = Number(value);
    persistOverrides();
    return true;
  }

  function clearTieStrength(type, loadCase, leaf) {
    if (loadCase === undefined) {
      // Clear every cell for the post family.
      TIE_LOAD_CASES.forEach((c) => TIE_LEAVES.forEach((f) => {
        delete overrides[gridKey(type, c, f)];
      }));
    } else {
      delete overrides[gridKey(type, loadCase, leaf)];
    }
    persistOverrides();
  }

  function resetTieStrengths() {
    overrides = Object.create(null);
    persistOverrides();
  }

  // Narrows from "anything at all" down to one cell, so each argument left
  // off widens the question rather than falling through to an undefined cell.
  function isTieStrengthCustom(type, loadCase, leaf) {
    if (type === undefined) return TIE_TYPES.some((t) => isTieStrengthCustom(t));
    if (loadCase === undefined) {
      return TIE_LOAD_CASES.some((c) => isTieStrengthCustom(type, c));
    }
    if (leaf === undefined) {
      return TIE_LEAVES.some((f) => isTieStrengthCustom(type, loadCase, f));
    }
    return tieLeafStrength(type, loadCase, leaf) !== defaultLeafStrength(type, loadCase, leaf);
  }

  // One row per editable cell: post family x load case x leaf.
  function listTieStrengths() {
    const rows = [];
    TIE_TYPES.forEach((type) => {
      TIE_LOAD_CASES.forEach((loadCase) => {
        TIE_LEAVES.forEach((leaf) => {
          rows.push({
            type,
            loadCase,
            leaf,
            label: TIE_LEAF_LABELS[type][leaf],
            caseLabel: TIE_LOAD_CASE_LABELS[loadCase],
            value: tieLeafStrength(type, loadCase, leaf),
            defaultValue: defaultLeafStrength(type, loadCase, leaf),
            custom: isTieStrengthCustom(type, loadCase, leaf),
            setsPerLevel: setsPerLevel(type),
            levelStrength: tieStrength(type, loadCase),
            // Strictly weaker end only: when both match, neither is singled
            // out, otherwise every catalogue row would carry the tag.
            governs: tieLeafStrength(type, loadCase, leaf) <
              tieLeafStrength(type, loadCase, leaf === "inner" ? "outer" : "inner")
          });
        });
      });
    });
    return rows;
  }

  // Per-level totals for every post family and load case - what the panel
  // and the report quote.
  function listTieLevelStrengths() {
    const rows = [];
    TIE_TYPES.forEach((type) => TIE_LOAD_CASES.forEach((loadCase) => {
      rows.push({
        type,
        loadCase,
        caseLabel: TIE_LOAD_CASE_LABELS[loadCase],
        label: TIE_LABELS[type],
        inner: tieLeafStrength(type, loadCase, "inner"),
        outer: tieLeafStrength(type, loadCase, "outer"),
        setsPerLevel: setsPerLevel(type),
        value: tieStrength(type, loadCase),
        defaultValue: Math.min(
          defaultLeafStrength(type, loadCase, "inner"),
          defaultLeafStrength(type, loadCase, "outer")
        ) * setsPerLevel(type),
        custom: isTieStrengthCustom(type, loadCase)
      });
    }));
    return rows;
  }

  readStoredOverrides();
  readStoredDesignOverrides();

  windpost.config = Object.freeze({
    CM4_TO_MM4: 10000,
    CM3_TO_MM3: 1000,
    DENSITY_KN_PER_M3: P.density_kN_m3 ?? 78.5,
    DU_TIE_SETS_PER_LEVEL,
    DEFAULT_TIE_STRENGTH_KN,
    DEFAULT_TIE_GRID,
    TIE_LABELS,
    TIE_LEAF_LABELS,
    TIE_TYPES,
    TIE_LOAD_CASES,
    TIE_LOAD_CASE_LABELS,
    TIE_LEAVES,
    loadCaseOf,
    setsPerLevel,
    tieStrength,
    tieLeafStrength,
    setTieStrength,
    clearTieStrength,
    resetTieStrengths,
    isTieStrengthCustom,
    listTieStrengths,
    listTieLevelStrengths,
    DESIGN_DEFAULTS,
    DESIGN_KEYS,
    designValue,
    setDesignValue,
    clearDesignValue,
    resetDesignValues,
    isDesignCustom,
    listDesignValues,
    currentDesignValues,
    isAnyAssumptionCustom,
    resetAllAssumptions,
    PARAPET_TOP_TIE_CLEARANCE_MM: P.parapetTopTieClearance_mm ?? 50,
    STORAGE_KEY: "windpost_saved_designs_original_gui_local_v1",
    PROPPED_CANTILEVER_DEFLECTION_COEFF: P.proppedCantileverDeflectionCoeff ?? 0.0054161216
  });
})(window);
