(function (global) {
  "use strict";
  // Fixed standard baseplate detail for simply-supported L windposts.
  //
  // The right-hand anchor arrangement is shared with the simply-supported U
  // standard.  L sections with a 70 mm short leg use a 150 mm plate; the
  // 80x8 catalogue sections use a 160 mm plate so the centred profile fits.
  // There is no structural baseplate design; only anchor edge distances are
  // checked against the confirmed 25 mm minimum.
  const windpost = global.Windpost = global.Windpost || {};

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    require("./simply-u-baseplate-standard-engine.js");
  }

  const U_STANDARD = windpost.simplyUBaseplateStandard.STANDARD;
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

    const plateWidth = b >= 80 ? 160 : U_STANDARD.plateWidth;
    const transverseEdge = (plateWidth - U_STANDARD.anchorGauge) / 2;
    const edgeDistances = Object.freeze({
      concrete: U_STANDARD.anchorFromConcreteEdge,
      longitudinalPlateEnd: U_STANDARD.longitudinalEndDistance,
      transverseTop: transverseEdge,
      transverseBottom: transverseEdge
    });
    const minimumProvided = Math.min(...Object.values(edgeDistances));
    const pass = minimumProvided >= U_STANDARD.minimumEdgeDistance;
    const leftPortion = WELD_PROJECTION + (a - EMBED);
    const design = {
      B: plateWidth,
      tp: U_STANDARD.plateThickness,
      plateLen: U_STANDARD.concreteToPlateEnd,
      anchorFromConcreteEdge: U_STANDARD.anchorFromConcreteEdge,
      rightEndDistance: U_STANDARD.longitudinalEndDistance,
      w: U_STANDARD.anchorGauge,
      sideEdge: transverseEdge,
      holeDia: U_STANDARD.holeDiameter,
      boltDia: U_STANDARD.boltDiameter,
      anchorName: U_STANDARD.anchorName,
      nRow: U_STANDARD.nRow,
      nCol: U_STANDARD.nCol,
      embedment: EMBED,
      weldProjection: WELD_PROJECTION,
      leftPortion
    };

    return {
      ok: pass,
      standard: true,
      connectionType: "simply-supported-l",
      postType: "L",
      section,
      design,
      results: {
        pass,
        edgeDistances,
        minimumProvided,
        minimumRequired: U_STANDARD.minimumEdgeDistance
      },
      reason: pass ? "" :
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
