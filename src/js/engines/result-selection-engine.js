(function initialiseResultSelectionEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  // The issued windpost capacity is ALWAYS rounded DOWN to two decimals, so
  // the figure on a drawing or schedule can never overstate what the post
  // carries. Truncation happens only at the very end: the governing criterion
  // is decided on the exact value, and selection then compares against the
  // same rounded figure the user is shown, so a section can never be offered
  // whose printed capacity is below the required load.
  //
  // The epsilon absorbs binary representation error — 8.07*100 is
  // 806.9999999999999 in IEEE 754, which would otherwise truncate to 8.06.
  const CAPACITY_DECIMALS = 2;
  const FACTOR = Math.pow(10, CAPACITY_DECIMALS);

  function roundDownCapacity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return number;
    return Math.floor(number * FACTOR + 1e-9) / FACTOR;
  }

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
    // Exact governing value first — the criterion is decided on this.
    const ultimateExact = hasConnectionCapacityCap
      ? Math.min(ultimateBeforeConnectionCap, connectionCapacityCap)
      : ultimateBeforeConnectionCap;

    let ultimateGoverningCriteriaStatus = "Deflection Governs Ultimate";
    if (Math.abs(ultimateExact - ultimateLoadDeflectionBased) < 1e-9) {
      ultimateGoverningCriteriaStatus = "Deflection Governs Ultimate";
    }
    if (Math.abs(ultimateExact - ultimateLoadBendingMomentBased) < 1e-9) {
      ultimateGoverningCriteriaStatus = "Bending Moment Governs Ultimate";
    }
    if (Math.abs(ultimateExact - ultimateTotalTiesCapacity) < 1e-9) {
      ultimateGoverningCriteriaStatus = "Tie Capacity Governs Ultimate";
    }
    if (hasConnectionCapacityCap && Math.abs(ultimateExact - connectionCapacityCap) < 1e-9) {
      ultimateGoverningCriteriaStatus = "Connection Capacity Governs Ultimate";
    }

    // Only now is the issued figure truncated.
    const ultimateDesignValue = roundDownCapacity(ultimateExact);

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
      // The untruncated value, kept for audit and for any downstream check
      // that must not inherit the rounding.
      ultimateDesignValueExact: ultimateExact,
      ultimateGoverningCriteriaStatus
    };
  }

  windpost.resultSelectionEngine = Object.freeze({
    CAPACITY_DECIMALS,
    roundDownCapacity,
    selectResults
  });
})(window);
