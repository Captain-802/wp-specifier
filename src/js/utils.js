(function initialiseWindpostUtilities(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const formatNumber = (value, decimalPlaces = 4) =>
    Number.isFinite(Number(value)) ? Number(value).toFixed(decimalPlaces) : "N/A";

  const getLoadLabel = (loadType) =>
    loadType === "tipPointLoad" ? "Tip Point Load" : "Uniform Load";

  const getSupportLabel = (supportCondition) => ({
    cantilever: "Cantilever",
    simplySupported: "Simply Supported",
    proppedCantilever: "Propped Cantilever"
  })[supportCondition] || supportCondition;

  windpost.utils = Object.freeze({
    formatNumber,
    getLoadLabel,
    getSupportLabel
  });
})(window);
