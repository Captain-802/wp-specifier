(function initialiseDrawingConsistencyEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const SELECTOR = [
    "[data-canvas-fill]",
    ".section-fill",
    ".blank-fill"
  ].join(",");

  function geometryRecords(svg) {
    if (!svg || !svg.querySelectorAll) return [];
    return Array.from(svg.querySelectorAll(SELECTOR)).map(element => {
      const tag = (element.tagName || "").toLowerCase();
      const attributes = ["x", "y", "width", "height", "d", "points",
        "data-canvas-fill", "class"];
      return tag + "|" + attributes.map(name =>
        `${name}=${element.getAttribute(name) || ""}`).join("|");
    }).sort();
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function signature(svg) {
    return hashText(geometryRecords(svg).join("\n"));
  }

  function stamp(svg, canvas) {
    const value = signature(svg);
    if (svg && svg.dataset) svg.dataset.geometrySignature = value;
    if (canvas && canvas.dataset) canvas.dataset.geometrySignature = value;
    return value;
  }

  function validate(stage) {
    const svg = stage && stage.querySelector
      ? stage.querySelector("svg")
      : null;
    const canvas = stage && stage.querySelector
      ? stage.querySelector("canvas")
      : null;
    const expected = svg && svg.dataset
      ? svg.dataset.geometrySignature || signature(svg)
      : "";
    const actual = canvas && canvas.dataset
      ? canvas.dataset.geometrySignature || ""
      : "";
    return {
      ok: Boolean(expected && actual && expected === actual),
      expected,
      actual,
      geometryCount: geometryRecords(svg).length
    };
  }

  windpost.drawingConsistencyEngine = Object.freeze({
    SELECTOR,
    geometryRecords,
    signature,
    stamp,
    validate
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.drawingConsistencyEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
