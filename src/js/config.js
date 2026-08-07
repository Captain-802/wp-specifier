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

  const DEFAULT_TIE_STRENGTH_KN = Object.freeze({
    L: (P.tieStrength && P.tieStrength.L) ?? 2.25,
    U: U_TIE_STRENGTH_KN,
    DU: (P.tieStrength && P.tieStrength.DU) ??
      DU_TIE_SETS_PER_LEVEL * U_TIE_STRENGTH_KN
  });

  // The names the drawings and schedules use for each post's inner-leaf tie,
  // so the editor lists ties by the name the engineer sees on the output.
  const TIE_LABELS = Object.freeze({
    U: "U tie", L: "Shear tie", DU: "U tie (2 sets per level)"
  });

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
      TIE_TYPES.forEach((type) => {
        if (Object.prototype.hasOwnProperty.call(parsed, type) && isValidStrength(parsed[type])) {
          overrides[type] = Number(parsed[type]);
        }
      });
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

  function tieStrength(type) {
    if (Object.prototype.hasOwnProperty.call(overrides, type)) return overrides[type];
    // A DU level is two U sets, so it follows an edited U unless the engineer
    // has given DU a value of its own.
    if (type === "DU" && Object.prototype.hasOwnProperty.call(overrides, "U")) {
      return DU_TIE_SETS_PER_LEVEL * overrides.U;
    }
    return DEFAULT_TIE_STRENGTH_KN[type];
  }

  function setTieStrength(type, value) {
    if (!TIE_TYPES.includes(type) || !isValidStrength(value)) return false;
    overrides[type] = Number(value);
    persistOverrides();
    return true;
  }

  function clearTieStrength(type) {
    delete overrides[type];
    persistOverrides();
  }

  function resetTieStrengths() {
    overrides = Object.create(null);
    persistOverrides();
  }

  function isTieStrengthCustom(type) {
    if (type === undefined) return TIE_TYPES.some((t) => isTieStrengthCustom(t));
    return tieStrength(type) !== DEFAULT_TIE_STRENGTH_KN[type];
  }

  function listTieStrengths() {
    return TIE_TYPES.map((type) => ({
      type,
      label: TIE_LABELS[type],
      value: tieStrength(type),
      defaultValue: DEFAULT_TIE_STRENGTH_KN[type],
      custom: isTieStrengthCustom(type),
      // DU is showing a value derived from an edited U rather than its own.
      derived: type === "DU" &&
        !Object.prototype.hasOwnProperty.call(overrides, "DU") &&
        Object.prototype.hasOwnProperty.call(overrides, "U")
    }));
  }

  readStoredOverrides();
  readStoredDesignOverrides();

  windpost.config = Object.freeze({
    CM4_TO_MM4: 10000,
    CM3_TO_MM3: 1000,
    DENSITY_KN_PER_M3: P.density_kN_m3 ?? 78.5,
    DU_TIE_SETS_PER_LEVEL,
    DEFAULT_TIE_STRENGTH_KN,
    TIE_LABELS,
    TIE_TYPES,
    tieStrength,
    setTieStrength,
    clearTieStrength,
    resetTieStrengths,
    isTieStrengthCustom,
    listTieStrengths,
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
