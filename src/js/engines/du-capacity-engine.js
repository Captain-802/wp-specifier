(function initialiseDuCapacityEngine(global) {
  "use strict";

  // DU WINDPOST CAPACITY — simply supported and cantilever.
  //
  // A DU is two U channels welded web to web. Structurally that means:
  //
  //   * Section — the pair acts as one. Ixx and Zxx are already the assembled
  //     values in js/data/du-section-database.js (2 x the single channel about
  //     the shared axis), so the established deflection and bending formulae
  //     apply unchanged. Nothing here re-derives them.
  //
  //   * Ties — the DU carries TWO sets of ties at every level, so a tie level
  //     resists twice what a single U does. That is the only DU-specific term,
  //     and it comes from config.DEFAULT_TIE_STRENGTH_KN.DU (= 2 x U).
  //
  //     CAPACITY counts LEVELS; the SCHEDULE counts ties. Each channel takes
  //     its own EDC tie outward and its own U tie back into the inner leaf, so
  //     one level is 2 EDC + 2 U = 4 ties. A post with 10 slot levels is
  //     therefore 20 EDC and 20 U ties, 40 in all.
  //
  // Both support conditions run through the same proven load-case, deflection,
  // bending and tie chain as U and L — this engine only assembles the right
  // inputs and reports which of them governs.

  const windpost = global.Windpost = global.Windpost || {};

  const design = () => (windpost.parameters && windpost.parameters.design) || {};

  function tieStrengthFor(section) {
    const cfg = windpost.config;
    const type = section && section.type;
    return cfg.TIE_TYPES.includes(type) ? cfg.tieStrength(type) : cfg.tieStrength("DU");
  }

  function sectionsList() {
    return (windpost.duSectionDatabase &&
      windpost.duSectionDatabase.sections) || [];
  }

  // What the fabricator and the schedule need: tie COUNTS, not levels.
  // Each of the two channels takes its own outer EDC tie and its own inner
  // U tie, so a level is 4 ties. Capacity still works in levels.
  function tieSchedule(tieLevels) {
    const levels = Math.max(0, Math.round(Number(tieLevels) || 0));
    const sets = windpost.config.DU_TIE_SETS_PER_LEVEL;
    return Object.freeze({
      tieLevels: levels,
      setsPerLevel: sets,
      edcTiesPerLevel: sets,
      uTiesPerLevel: sets,
      tiesPerLevel: 2 * sets,          // 2 EDC + 2 U
      edcTiesTotal: sets * levels,
      uTiesTotal: sets * levels,
      tiesTotal: 2 * sets * levels,
      description: `${levels} tie levels — ` +
        `${sets * levels} EDC ties and ${sets * levels} U ties ` +
        `(${2 * sets} per level)`
    });
  }

  function findSection(name) {
    return sectionsList().find(item => item.name === name) || null;
  }

  // One DU section, one length, one support condition.
  function capacity(input) {
    const values = input || {};
    const section = typeof values.section === "string"
      ? findSection(values.section)
      : values.section;

    if (!section || section.type !== "DU") {
      return Object.freeze({
        valid: false,
        reason: "Choose a DU windpost section."
      });
    }

    const length_mm = Number(values.length_mm);
    if (!(length_mm > 0)) {
      return Object.freeze({
        valid: false, section,
        reason: "Enter the windpost height in millimetres."
      });
    }

    const supportCondition = values.supportCondition === "cantilever"
      ? "cantilever"
      : "simplySupported";
    // Only a cantilever offers a load model; a simply-supported post is UDL.
    const loadType = supportCondition === "cantilever" &&
      values.loadType === "tipPointLoad" ? "tipPointLoad" : "udl";

    const p = design();
    const tieStrength = tieStrengthFor(section);
    const result = windpost.windpostCalculationEngine.getCalculatedDesignValues({
      length: length_mm,
      fy: values.fy ?? p.fy,
      e: values.e ?? p.e,
      ixx: section.ixx_mm4,
      zxx: section.zxx_mm3,
      area: section.crossSectionalArea_mm2,
      tieStrength,
      firstTieSpacing: values.firstTieSpacing ?? p.firstTieSpacing,
      standardTieSpacing: values.standardTieSpacing ?? p.standardTieSpacing,
      secantFy: values.secantFy ?? p.secantFy,
      secantN: values.secantN ?? p.secantN,
      supportCondition,
      loadType,
      apply10mmLimit: values.apply10mmLimit ?? false,
      useCustomDeflectionLimit: values.useCustomDeflectionLimit ?? false,
      customDeflectionLimit: values.customDeflectionLimit ?? "",
      connectionCapacityCap: values.connectionCapacityCap ?? ""
    });

    return Object.freeze({
      valid: Boolean(result.valid),
      section,
      sectionName: section.name,
      postType: "DU",
      length_mm,
      supportCondition,
      loadType,
      tieSetsPerLevel: windpost.config.DU_TIE_SETS_PER_LEVEL,
      tieStrengthPerLevel_kN: tieStrength,
      singleChannelTieStrength_kN: windpost.config.tieStrength("U"),
      // numberOfTies is the LEVEL count the capacity chain works in; ties
      // holds the quantities that go on a schedule.
      numberOfTies: result.numberOfTies,
      tieLevels: result.numberOfTies,
      ties: tieSchedule(result.numberOfTies),
      ultimateDesignValue_kN: Number(result.ultimateDesignValue),
      governing: result.ultimateGoverningCriteriaStatus,
      calculation: result
    });
  }

  const simplySupported = input =>
    capacity({ ...(input || {}), supportCondition: "simplySupported" });

  const cantilever = input =>
    capacity({ ...(input || {}), supportCondition: "cantilever" });

  // Every DU in the catalogue at one length, weakest first — the same order
  // the automatic selector walks.
  function schedule(length_mm, options) {
    const values = options || {};
    return sectionsList().map(section => capacity({
      ...values, section, length_mm
    })).filter(entry => entry.valid);
  }

  // First DU with enough ultimate capacity for the required load.
  function select(requiredLoad_kN, length_mm, options) {
    const required = Number(requiredLoad_kN);
    const list = schedule(length_mm, options);
    const chosen = Number.isFinite(required) && required > 0
      ? list.find(entry => entry.ultimateDesignValue_kN >= required)
      : null;
    return Object.freeze({
      required_kN: Number.isFinite(required) ? required : null,
      selected: chosen || null,
      suitable: Boolean(chosen),
      considered: list.length,
      reason: chosen
        ? ""
        : "No DU section in the catalogue reaches the required load at this height."
    });
  }

  windpost.duCapacityEngine = Object.freeze({
    sections: sectionsList,
    find: findSection,
    tieSchedule,
    capacity,
    simplySupported,
    cantilever,
    schedule,
    select
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.duCapacityEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
