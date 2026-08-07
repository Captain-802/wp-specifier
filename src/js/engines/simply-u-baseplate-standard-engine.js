(function (global) {
  "use strict";
  // Fixed standard baseplate detail for simply-supported U windposts.
  //
  // This is deliberately separate from the cantilever baseplate designer:
  // there is no moment, capacity, plate-thickness or stiffener design.  The
  // only check is that every provided anchor edge distance is at least 25 mm.
  const windpost = global.Windpost = global.Windpost || {};

  const STANDARD = Object.freeze({
    plateWidth: 150,
    plateThickness: 6,
    anchorFromConcreteEdge: 90,
    concreteToPlateEnd: 125,
    longitudinalEndDistance: 35,
    anchorGauge: 90,
    transverseEdgeDistance: 30,
    minimumEdgeDistance: 25,
    holeDiameter: 14,
    boltDiameter: 12,
    anchorName: "RGM 12",
    nRow: 1,
    nCol: 2
  });

  function create(section) {
    if (!section || section.type !== "U") {
      return {
        ok: false,
        standard: true,
        connectionType: "simply-supported-u",
        reason: "The standard simply-supported baseplate is available only for U-posts."
      };
    }

    const a = Number(section.a_mm);
    if (!(a > 0)) {
      return {
        ok: false,
        standard: true,
        connectionType: "simply-supported-u",
        reason: "The selected U-post depth is not available."
      };
    }

    const edgeDistances = Object.freeze({
      concrete: STANDARD.anchorFromConcreteEdge,
      longitudinalPlateEnd: STANDARD.longitudinalEndDistance,
      transverseTop: STANDARD.transverseEdgeDistance,
      transverseBottom: STANDARD.transverseEdgeDistance
    });
    const minimumProvided = Math.min(...Object.values(edgeDistances));
    const pass = minimumProvided >= STANDARD.minimumEdgeDistance;
    const design = {
      B: STANDARD.plateWidth,
      tp: STANDARD.plateThickness,
      plateLen: STANDARD.concreteToPlateEnd,
      anchorFromConcreteEdge: STANDARD.anchorFromConcreteEdge,
      rightEndDistance: STANDARD.longitudinalEndDistance,
      w: STANDARD.anchorGauge,
      sideEdge: STANDARD.transverseEdgeDistance,
      holeDia: STANDARD.holeDiameter,
      boltDia: STANDARD.boltDiameter,
      anchorName: STANDARD.anchorName,
      nRow: STANDARD.nRow,
      nCol: STANDARD.nCol
    };

    return {
      ok: pass,
      standard: true,
      connectionType: "simply-supported-u",
      postType: "U",
      section,
      design,
      results: {
        pass,
        edgeDistances,
        minimumProvided,
        minimumRequired: STANDARD.minimumEdgeDistance
      },
      reason: pass ? "" :
        "The standard anchor arrangement does not satisfy the minimum edge distance."
    };
  }

  windpost.simplyUBaseplateStandard = Object.freeze({ STANDARD, create });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.simplyUBaseplateStandard;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
