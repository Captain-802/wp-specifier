(function initialiseWindpostCalculationEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const { DENSITY_KN_PER_M3 } = windpost.config;
  const { solveSecantModulus } = windpost.secantModulusEngine;
  const {
    calculateAllowableDeflection,
    getDeflectionFactors,
    getBendingLoadCapacity
  } = windpost.loadCaseEngine;
  const { calculateTieCapacity } = windpost.tieCapacityEngine;
  const { selectResults } = windpost.resultSelectionEngine;

    const getCalculatedDesignValues = (props) => {
      const L = parseFloat(props.length); const Fy = parseFloat(props.fy); const E = parseFloat(props.e) * 1000;
      const Ixx = parseFloat(props.ixx); const Zxx = parseFloat(props.zxx); const area = parseFloat(props.area);
      const tieStrengthValue = parseFloat(props.tieStrength); const firstTie = parseFloat(props.firstTieSpacing); const standardTie = parseFloat(props.standardTieSpacing);
      const secantFy = parseFloat(props.secantFy); const secantNValue = parseFloat(props.secantN);

      if (!Number.isFinite(L) || !Number.isFinite(Fy) || !Number.isFinite(E) || !Number.isFinite(Ixx) || !Number.isFinite(Zxx) || !Number.isFinite(area) ||
          !Number.isFinite(tieStrengthValue) || !Number.isFinite(firstTie) || !Number.isFinite(standardTie) || !Number.isFinite(secantFy) || !Number.isFinite(secantNValue) ||
          L <= 0 || Fy <= 0 || E <= 0 || Ixx <= 0 || Zxx <= 0 || area <= 0 || tieStrengthValue < 0 || firstTie <= 0 || standardTie <= 0 || secantFy <= 0 || secantNValue <= 0) {
        return { valid: false, governingCriteriaStatus: "Invalid inputs" };
      }

      const calculatedSelfWeightPerMeter = (area / 1_000_000) * DENSITY_KN_PER_M3;
      const deflectionResult = calculateAllowableDeflection({
        length: L,
        supportCondition: props.supportCondition,
        apply10mmLimit: props.apply10mmLimit,
        useCustomDeflectionLimit: props.useCustomDeflectionLimit,
        customDeflectionLimit: props.customDeflectionLimit
      });
      if (!deflectionResult.valid) {
        return { valid: false, governingCriteriaStatus: "Invalid custom deflection" };
      }
      const { allowableDeflectionLimit } = deflectionResult;

      const {
        bStressPerEs,
        loadFactorPerEs,
        momentFactorPerLoad,
        isLineLoadCase
      } = getDeflectionFactors({
        length: L,
        ixx: Ixx,
        zxx: Zxx,
        allowableDeflectionLimit,
        supportCondition: props.supportCondition,
        loadType: props.loadType
      });

      let totalLoadN = 0, lineLoadNPerMm = 0, momentNmm = 0, stressNmm2 = 0, secantModulusNmm2 = 0;
      if (bStressPerEs > 0 && loadFactorPerEs > 0 && momentFactorPerLoad > 0) {
        const secantResult = solveSecantModulus({
          strainPerModulus: bStressPerEs,
          elasticModulus: E,
          proofStrength: secantFy,
          exponent: secantNValue,
          iterations: 100
        });
        stressNmm2 = secantResult.stress;
        const secantE = secantResult.secantModulus;
        secantModulusNmm2 = secantE;
        totalLoadN = loadFactorPerEs * secantE;
        momentNmm = totalLoadN * momentFactorPerLoad;
        lineLoadNPerMm = isLineLoadCase ? totalLoadN / L : 0;
      }

      const safeLoadDeflectionBased = totalLoadN / 1000;
      const allowableMomentKnM = (Fy * Zxx) / 1_000_000;
      const safeLoadBendingMomentBased = getBendingLoadCapacity({
        length: L,
        allowableMomentKnM,
        supportCondition: props.supportCondition,
        loadType: props.loadType
      });
      const { numberOfTies, totalTiesCapacity } = calculateTieCapacity({
        length: L,
        firstTieSpacing: firstTie,
        standardTieSpacing: standardTie,
        tieStrength: tieStrengthValue,
        supportCondition: props.supportCondition
      });
      const selectedResults = selectResults({
        deflectionCapacity: safeLoadDeflectionBased,
        bendingCapacity: safeLoadBendingMomentBased,
        tieCapacity: totalTiesCapacity,
        connectionCapacityCap: props.connectionCapacityCap
      });

      return {
        valid: true,
        allowableDeflectionLimit,
        safeDeflectionWorkingLoad: lineLoadNPerMm,
        calculatedSelfWeightPerMeter,
        bendingMoment: momentNmm / 1_000_000,
        appliedBendingStress: stressNmm2,
        safeLoadDeflectionBased,
        safeLoadBendingMomentBased,
        totalTiesCapacity,
        tieStrength: tieStrengthValue,
        ...selectedResults,
        numberOfTies,
        calculationDetails: {
          elasticModulusNmm2: E,
          ratioDenominator: deflectionResult.ratioDenominator,
          deflectionFromRatio: deflectionResult.deflectionFromRatio,
          standardDeflectionLimit: deflectionResult.standardLimit,
          strainAtDeflectionLimit: bStressPerEs,
          secantStressNmm2: stressNmm2,
          secantModulusNmm2,
          loadFactorPerSecantModulus: loadFactorPerEs,
          momentFactorPerLoadMm: momentFactorPerLoad,
          totalDeflectionLoadN: totalLoadN,
          lineLoadNPerMm,
          momentNmm,
          allowableMomentKnM,
          totalSelfWeightKn: calculatedSelfWeightPerMeter * (L / 1000)
        }
      };
    };

    windpost.windpostCalculationEngine = Object.freeze({
      getCalculatedDesignValues
    });
})(window);
