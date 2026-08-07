(function initialiseLoadCaseEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const { PROPPED_CANTILEVER_DEFLECTION_COEFF } = windpost.config;

  function calculateAllowableDeflection(options) {
    const length = Number(options.length);
    const ratioDenominator = options.supportCondition === "cantilever" ? 180 : 360;
    const deflectionFromRatio = length / ratioDenominator;
    const customDeflection = Number(options.customDeflectionLimit);

    if (
      options.useCustomDeflectionLimit &&
      (!Number.isFinite(customDeflection) || customDeflection <= 0)
    ) {
      return { valid: false, allowableDeflectionLimit: 0 };
    }

    const standardLimit = options.apply10mmLimit
      ? Math.min(deflectionFromRatio, 10)
      : deflectionFromRatio;

    return {
      valid: true,
      ratioDenominator,
      deflectionFromRatio,
      standardLimit,
      allowableDeflectionLimit: options.useCustomDeflectionLimit
        ? Math.min(standardLimit, customDeflection)
        : standardLimit
    };
  }

  function getDeflectionFactors(options) {
    const length = Number(options.length);
    const ixx = Number(options.ixx);
    const zxx = Number(options.zxx);
    const deflection = Number(options.allowableDeflectionLimit);

    if (options.supportCondition === "cantilever" && options.loadType === "tipPointLoad") {
      return {
        loadFactorPerEs: (3 * ixx * deflection) / Math.pow(length, 3),
        bStressPerEs: (3 * ixx * deflection) / (Math.pow(length, 2) * zxx),
        momentFactorPerLoad: length,
        isLineLoadCase: false
      };
    }

    if (options.supportCondition === "cantilever") {
      return {
        loadFactorPerEs: (8 * ixx * deflection) / Math.pow(length, 3),
        bStressPerEs: (4 * ixx * deflection) / (Math.pow(length, 2) * zxx),
        momentFactorPerLoad: length / 2,
        isLineLoadCase: true
      };
    }

    if (options.supportCondition === "simplySupported") {
      return {
        loadFactorPerEs: (384 * ixx * deflection) / (5 * Math.pow(length, 3)),
        bStressPerEs: (48 * ixx * deflection) / (5 * Math.pow(length, 2) * zxx),
        momentFactorPerLoad: length / 8,
        isLineLoadCase: true
      };
    }

    if (options.supportCondition === "proppedCantilever") {
      return {
        loadFactorPerEs: ixx * deflection /
          (PROPPED_CANTILEVER_DEFLECTION_COEFF * Math.pow(length, 3)),
        bStressPerEs: ixx * deflection /
          (8 * PROPPED_CANTILEVER_DEFLECTION_COEFF * Math.pow(length, 2) * zxx),
        momentFactorPerLoad: length / 8,
        isLineLoadCase: true
      };
    }

    return {
      loadFactorPerEs: 0,
      bStressPerEs: 0,
      momentFactorPerLoad: 0,
      isLineLoadCase: true
    };
  }

  function getBendingLoadCapacity(options) {
    const lengthMetres = Number(options.length) / 1000;
    const allowableMomentKnM = Number(options.allowableMomentKnM);

    if (options.supportCondition === "cantilever" && options.loadType === "tipPointLoad") {
      return allowableMomentKnM / lengthMetres;
    }
    if (options.supportCondition === "cantilever") {
      return 2 * allowableMomentKnM / lengthMetres;
    }
    if (
      options.supportCondition === "simplySupported" ||
      options.supportCondition === "proppedCantilever"
    ) {
      return 8 * allowableMomentKnM / lengthMetres;
    }
    return 0;
  }

  windpost.loadCaseEngine = Object.freeze({
    calculateAllowableDeflection,
    getDeflectionFactors,
    getBendingLoadCapacity
  });
})(window);
