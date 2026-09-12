(function initialiseResultSelectionEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function selectResults(options) {
    const deflectionCapacity = Number(options.deflectionCapacity);
    const bendingCapacity = Number(options.bendingCapacity);
    const tieCapacity = Number(options.tieCapacity);
    const connectionCapacityCap = Number(options.connectionCapacityCap);
    const hasConnectionCapacityCap = Number.isFinite(connectionCapacityCap) && connectionCapacityCap > 0;
    // Tie strength is supplied as an ultimate capacity. It must not limit
    // the service result or receive a further ultimate multiplier.
    const designValueWindpost = Math.min(deflectionCapacity, bendingCapacity);

    let governingCriteriaStatus = "Deflection Governs SWL";
    if (Math.abs(designValueWindpost - deflectionCapacity) < 1e-9) {
      governingCriteriaStatus = "Deflection Governs SWL";
    }
    if (Math.abs(designValueWindpost - bendingCapacity) < 1e-9) {
      governingCriteriaStatus = "Bending Moment Governs SWL";
    }

    const ultimateLoadDeflectionBased = deflectionCapacity * 1.5;
    const ultimateLoadBendingMomentBased = bendingCapacity * 1.5;
    const ultimateTotalTiesCapacity = tieCapacity;
    const ultimateBeforeConnectionCap = Math.min(
      ultimateLoadDeflectionBased,
      ultimateLoadBendingMomentBased,
      ultimateTotalTiesCapacity
    );
    const ultimateDesignValue = hasConnectionCapacityCap
      ? Math.min(ultimateBeforeConnectionCap, connectionCapacityCap)
      : ultimateBeforeConnectionCap;

    let ultimateGoverningCriteriaStatus = "Deflection Governs Ultimate";
    if (Math.abs(ultimateDesignValue - ultimateLoadDeflectionBased) < 1e-9) {
      ultimateGoverningCriteriaStatus = "Deflection Governs Ultimate";
    }
    if (Math.abs(ultimateDesignValue - ultimateLoadBendingMomentBased) < 1e-9) {
      ultimateGoverningCriteriaStatus = "Bending Moment Governs Ultimate";
    }
    if (Math.abs(ultimateDesignValue - ultimateTotalTiesCapacity) < 1e-9) {
      ultimateGoverningCriteriaStatus = "Tie Capacity Governs Ultimate";
    }
    if (hasConnectionCapacityCap && Math.abs(ultimateDesignValue - connectionCapacityCap) < 1e-9) {
      ultimateGoverningCriteriaStatus = "Connection Capacity Governs Ultimate";
    }

    const windpostUltimateCapacity = Math.min(
      ultimateLoadDeflectionBased,
      ultimateLoadBendingMomentBased
    );
    const windpostCapacityUtilization = windpostUltimateCapacity > 0
      ? ultimateDesignValue / windpostUltimateCapacity * 100
      : 0;

    return {
      designValueWindpost,
      governingCriteriaStatus,
      windpostCapacityUtilization,
      ultimateLoadDeflectionBased,
      ultimateLoadBendingMomentBased,
      ultimateTotalTiesCapacity,
      ultimateBeforeConnectionCap,
      connectionCapacityCapApplied: hasConnectionCapacityCap ? connectionCapacityCap : null,
      ultimateDesignValue,
      ultimateGoverningCriteriaStatus
    };
  }

  windpost.resultSelectionEngine = Object.freeze({ selectResults });
})(window);
