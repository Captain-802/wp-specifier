(function initialiseBaseplateDrawingRoutingEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function serviceFor(baseplate) {
    if (baseplate && baseplate.connectionType === "simply-supported-u") {
      return windpost.simplyUBaseplateDrawing;
    }
    if (baseplate && baseplate.connectionType === "simply-supported-l") {
      return windpost.simplyLBaseplateDrawing;
    }
    if (baseplate && baseplate.section &&
        baseplate.section.type === "U") {
      return windpost.uBaseplateDrawing;
    }
    return windpost.baseplateDrawing;
  }

  windpost.baseplateDrawingRoutingEngine = Object.freeze({ serviceFor });
})(typeof window !== "undefined" ? window : globalThis);
