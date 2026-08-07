(function initialiseSelectorBaseplateRoutingEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function design(selection) {
    const inputs = (selection && selection.inputs) || {};
    const selected = selection && selection.selected;
    const section = selected && selected.section;
    const isSimplySupportedU = inputs.supportCondition === "simplySupported" &&
      section && section.type === "U";
    if (isSimplySupportedU && windpost.simplyUBaseplateStandard) {
      return windpost.simplyUBaseplateStandard.create(section);
    }
    const isSimplySupportedL = inputs.supportCondition === "simplySupported" &&
      section && section.type === "L";
    if (isSimplySupportedL && windpost.simplyLBaseplateStandard) {
      return windpost.simplyLBaseplateStandard.create(section);
    }
    const isCantileverPost = inputs.supportCondition === "cantilever" &&
      section && (section.type === "L" || section.type === "U");
    if (!isCantileverPost || !windpost.baseplateEngine) return null;
    const W = Number(selected.finalCapacity_kN);
    const H = Number(inputs.length_mm) / 1000;
    if (!(W > 0) || !(H > 0)) return null;
    const isPoint = inputs.loadType === "tipPointLoad";
    const M = isPoint ? W * H : W * H / 2;
    const out = windpost.baseplateEngine.autoDesign({
      M_kNm: M,
      W_kN: W,
      H_m: H,
      B: 220
    });
    out.loadModel = isPoint ? "W·H (tip point load)" : "W·H / 2 (UDL)";
    out.W = W;
    out.H = H;
    out.section = section;
    out.postType = section.type;
    return out;
  }

  windpost.selectorBaseplateRoutingEngine = Object.freeze({ design });
})(typeof window !== "undefined" ? window : globalThis);
