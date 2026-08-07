(function initialiseTieCapacityEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function calculateTieCapacity(options) {
    const length = Number(options.length);
    const firstTieSpacing = Number(options.firstTieSpacing);
    const standardTieSpacing = Number(options.standardTieSpacing);
    const tieStrength = Number(options.tieStrength);
    const isParapet = options.supportCondition === "cantilever";

    // Simply supported posts omit the uppermost scheduled tie because the
    // top connection occupies that zone. A parapet is free at the top, so
    // no tie is deducted; only the 50 mm free-edge clearance is maintained.
    const numberOfTies = isParapet
      ? Math.max(
          0,
          Math.floor(
            (length - windpost.config.PARAPET_TOP_TIE_CLEARANCE_MM) /
            standardTieSpacing
          )
        )
      : Math.max(
          0,
          Math.floor((length - firstTieSpacing) / standardTieSpacing)
        );

    return {
      numberOfTies,
      totalTiesCapacity: numberOfTies * tieStrength,
      tieArrangement: isParapet ? "parapet" : "topConnection"
    };
  }

  windpost.tieCapacityEngine = Object.freeze({ calculateTieCapacity });
})(window);
