(function initialiseAutomaticSelectionEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const { getSections, getSectionProperties } = windpost.sectionProfileEngine;
  const { getCalculatedDesignValues } = windpost.windpostCalculationEngine;
  const { calculateWallAndTie } = windpost.outerTieSelectionEngine;

  // Editable design constants come from windpost.parameters (generated from
  // windpost-database.xlsx); literals are the fallback if that file is absent.
  const PD = (windpost.parameters && windpost.parameters.design) || {};

  const DESIGN_DEFAULTS = Object.freeze({
    fy: PD.fy ?? 127.27,
    e: PD.e ?? 200,
    secantFy: PD.secantFy ?? 210,
    secantN: PD.secantN ?? 7,
    firstTieSpacing: PD.firstTieSpacing ?? 225,
    standardTieSpacing: PD.standardTieSpacing ?? 225,
    apply10mmLimit: false,
    useCustomDeflectionLimit: false,
    customDeflectionLimit: "",
    connectionCapacityCap: ""
  });

  function sharedCalculationInputs(type) {
    return {
      ...DESIGN_DEFAULTS,
      tieStrength: windpost.config.DEFAULT_TIE_STRENGTH_KN[type]
    };
  }

  function calculateDemandActions(requiredLoad_kN, length_mm, supportCondition, loadType) {
    const length_m = length_mm / 1000;
    if (!Number.isFinite(requiredLoad_kN) || requiredLoad_kN <= 0) {
      return { totalLoad_kN: null, lineLoad_kN_m: null, maximumMoment_kNm: null };
    }

    if (supportCondition === "cantilever" && loadType === "tipPointLoad") {
      return {
        totalLoad_kN: requiredLoad_kN,
        lineLoad_kN_m: null,
        maximumMoment_kNm: requiredLoad_kN * length_m
      };
    }

    const lineLoad_kN_m = requiredLoad_kN / length_m;
    const divisor = supportCondition === "cantilever" ? 2 : 8;
    return {
      totalLoad_kN: requiredLoad_kN,
      lineLoad_kN_m,
      maximumMoment_kNm: requiredLoad_kN * length_m / divisor
    };
  }

  function evaluateSection(section, options) {
    const properties = getSectionProperties(section);
    const calculation = getCalculatedDesignValues({
      ...sharedCalculationInputs(options.type),
      length: options.length_mm,
      ixx: properties.ixx_mm4,
      zxx: properties.zxx_mm3,
      area: properties.crossSectionalArea_mm2,
      supportCondition: options.supportCondition,
      loadType: options.loadType
    });
    const wall = calculateWallAndTie(section, options.wall);
    const requiredLoad = Number(options.requiredLoad_kN);
    const hasRequiredLoad = Number.isFinite(requiredLoad) && requiredLoad > 0;
    const finalCapacity = calculation.valid ? Number(calculation.ultimateDesignValue) : 0;
    const capacityAdequate = !hasRequiredLoad || finalCapacity + 1e-9 >= requiredLoad;

    return {
      section,
      properties,
      calculation,
      wall,
      finalCapacity_kN: finalCapacity,
      requiredLoad_kN: hasRequiredLoad ? requiredLoad : null,
      capacityAdequate,
      suitable: Boolean(calculation.valid && wall.suitable && capacityAdequate),
      utilizationPercent: hasRequiredLoad && finalCapacity > 0
        ? requiredLoad / finalCapacity * 100
        : null
    };
  }

  function validateOptions(options) {
    const length = Number(options.length_mm);
    const requiredLoad = Number(options.requiredLoad_kN);
    if (!['U', 'L', 'DU', 'I'].includes(options.type)) return "Choose a U, L, DU or I windpost.";
    if (!['cantilever', 'simplySupported'].includes(options.supportCondition)) {
      return "Choose a support condition.";
    }
    if (options.supportCondition === "cantilever" && !windpost.sectionProfileEngine.supportsCantilever(options.type)) {
      return `${options.type} posts are simply supported only.`;
    }
    if (options.supportCondition !== "cantilever" && options.loadType === "tipPointLoad") {
      return "A top point load is available for cantilevers only.";
    }
    if (!Number.isFinite(length) || length <= 0) return "Enter a valid windpost height.";
    if (options.mode === "automatic" && (!Number.isFinite(requiredLoad) || requiredLoad <= 0)) {
      return "Enter a valid required ULS load.";
    }
    return "";
  }

  function createFailure(message, evaluations = []) {
    const validCalculations = evaluations.filter((item) => item.calculation.valid);
    const strongest = validCalculations.reduce(
      (best, item) => !best || item.finalCapacity_kN > best.finalCapacity_kN ? item : best,
      null
    );
    return { valid: false, message, evaluations, strongest };
  }

  function runDesign(options) {
    const normalized = {
      ...options,
      length_mm: Number(options.length_mm),
      requiredLoad_kN: options.mode === "automatic" ? Number(options.requiredLoad_kN) : null
    };
    const validationMessage = validateOptions(normalized);
    if (validationMessage) return createFailure(validationMessage);

    const sections = getSections(normalized.type, normalized.supportCondition);
    if (!sections.length) return createFailure("No catalogue sections are available for this selection.");

    if (normalized.mode === "manual") {
      const section = sections.find((item) => item.name === normalized.selectedSectionName);
      if (!section) return createFailure("Choose a catalogue windpost section.");
      const selected = evaluateSection(section, normalized);
      return {
        valid: selected.calculation.valid && selected.wall.suitable,
        mode: "manual",
        message: selected.wall.suitable
          ? "Selected section calculated successfully."
          : selected.wall.reason,
        selected,
        alternatives: [],
        evaluations: [selected],
        demandActions: calculateDemandActions(
          null,
          normalized.length_mm,
          normalized.supportCondition,
          normalized.loadType
        ),
        inputs: normalized,
        designDefaults: { ...DESIGN_DEFAULTS }
      };
    }

    const evaluations = sections.map((section) => evaluateSection(section, normalized));
    const selectedIndex = evaluations.findIndex((item) => item.suitable);
    if (selectedIndex < 0) {
      const wallSuitable = evaluations.filter((item) => item.wall.suitable);
      const message = wallSuitable.length
        ? "No standard section reaches the required final capacity at this height."
        : "No standard section is compatible with the entered wall construction.";
      return createFailure(message, evaluations);
    }

    const selected = evaluations[selectedIndex];
    const alternatives = evaluations.slice(selectedIndex + 1).filter((item) => item.suitable).slice(0, 3);
    return {
      valid: true,
      mode: "automatic",
      message: "A suitable standard windpost has been selected.",
      selected,
      alternatives,
      evaluations,
      demandActions: calculateDemandActions(
        normalized.requiredLoad_kN,
        normalized.length_mm,
        normalized.supportCondition,
        normalized.loadType
      ),
      inputs: normalized,
      designDefaults: { ...DESIGN_DEFAULTS }
    };
  }

  windpost.automaticSelectionEngine = Object.freeze({
    DESIGN_DEFAULTS,
    calculateDemandActions,
    evaluateSection,
    runDesign
  });
})(window);
