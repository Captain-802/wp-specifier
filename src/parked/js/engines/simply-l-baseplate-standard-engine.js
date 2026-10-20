(function (global) {
  "use strict";
  // Standard baseplate detail for simply-supported L windposts: type L-B2A
  // (depth 125-160, 205 long) or L-B2B (depth 165-200, 240 long) from the
  // owner's detail sheets (standard-base-plate-types.js). The long leg is
  // built 90 mm into the inner leaf, with a 6 mm projection behind the
  // cavity-side end. No structural design; only the 25 mm edge check.
  const windpost = global.Windpost = global.Windpost || {};

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    require("../data/standard-base-plate-types.js");
    require("./simply-u-baseplate-standard-engine.js");
  }

  const EMBED = 90, WELD_PROJECTION = 6;

  function create(section) {
    if (!section || section.type !== "L") {
      return {
        ok: false,
        standard: true,
        connectionType: "simply-supported-l",
        reason: "The standard simply-supported L baseplate is available only for L-posts."
      };
    }
    const a = Number(section.a_mm);
    const b = Number(section.b_mm);
    if (!(a >= EMBED) || !(b > 0)) {
      return {
        ok: false,
        standard: true,
        connectionType: "simply-supported-l",
        reason: "The selected L-post dimensions are not available."
      };
    }
    const geometry = windpost.standardBasePlateTypes.geometryFor(section);
    if (!geometry) {
      return {
        ok: false,
        standard: true,
        connectionType: "simply-supported-l",
        reason: `No standard base plate type (L-B2A 125-160, L-B2B 165-200) covers a ${a} mm deep L-post.`
      };
    }
    const shared = windpost.simplyUBaseplateStandard;
    const design = Object.assign(shared.designFrom(geometry), {
      embedment: EMBED,
      weldProjection: WELD_PROJECTION
    });
    const results = shared.edgeCheck(design);
    return {
      ok: results.pass,
      standard: true,
      connectionType: "simply-supported-l",
      postType: "L",
      section,
      design,
      results,
      reason: results.pass ? "" :
        "The standard anchor arrangement does not satisfy the minimum edge distance."
    };
  }

  windpost.simplyLBaseplateStandard = Object.freeze({
    EMBED, WELD_PROJECTION, create
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.simplyLBaseplateStandard;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
