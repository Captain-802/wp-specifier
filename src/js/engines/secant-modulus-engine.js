(function initialiseSecantModulusEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function solveSecantModulus(options) {
    const strainPerModulus = Number(options.strainPerModulus);
    const elasticModulus = Number(options.elasticModulus);
    const proofStrength = Number(options.proofStrength);
    const exponent = Number(options.exponent);
    const iterations = Number.isInteger(options.iterations) ? options.iterations : 100;

    if (
      !Number.isFinite(strainPerModulus) || strainPerModulus <= 0 ||
      !Number.isFinite(elasticModulus) || elasticModulus <= 0 ||
      !Number.isFinite(proofStrength) || proofStrength <= 0 ||
      !Number.isFinite(exponent) || exponent <= 0 ||
      iterations <= 0
    ) {
      return { valid: false, stress: 0, secantModulus: 0 };
    }

    let lowStress = 0;
    let highStress = strainPerModulus * elasticModulus;
    const rootFunction = (stress) =>
      stress + 0.002 * elasticModulus * Math.pow(stress / proofStrength, exponent)
      - strainPerModulus * elasticModulus;

    for (let index = 0; index < iterations; index += 1) {
      const midStress = (lowStress + highStress) / 2;
      if (rootFunction(midStress) > 0) highStress = midStress;
      else lowStress = midStress;
    }

    const stress = (lowStress + highStress) / 2;
    return {
      valid: true,
      stress,
      secantModulus: stress / strainPerModulus
    };
  }

  windpost.secantModulusEngine = Object.freeze({ solveSecantModulus });
})(window);
