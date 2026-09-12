(function (global) {
  "use strict";
  // Standard baseplate detail for simply-supported U windposts: type U-B3A
  // (depth 55-85, 205 long) or U-B3B (depth 90-120, 240 long) from the
  // owner's detail sheets (standard-base-plate-types.js). No moment, plate
  // thickness or stiffener design; the only check is that every anchor edge
  // distance is at least 25 mm.
  const windpost = global.Windpost = global.Windpost || {};

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    require("../data/standard-base-plate-types.js");
  }

  const MINIMUM_EDGE = 25;

  function types() {
    const module_ = windpost.standardBasePlateTypes;
    if (!module_) throw new Error("The standard base plate types must be loaded before the simply-supported engine.");
    return module_;
  }

  // The design record every drawing, 3D model and result panel reads.
  function designFrom(geometry) {
    return {
      B: geometry.plateWidth_mm,
      tp: geometry.plateThickness_mm,
      plateLen: geometry.rightPortion_mm,
      anchorFromConcreteEdge: geometry.edgeToBolt_mm,
      rightEndDistance: geometry.boltEndDistance_mm,
      w: geometry.boltGauge_mm,
      sideEdge: geometry.sideEdge_mm,
      holeDia: geometry.holeDiameter_mm,
      boltDia: geometry.boltDiameter_mm,
      anchorName: geometry.anchorName,
      nRow: geometry.rows,
      nCol: geometry.columns,
      typeCode: geometry.code,
      typeTitle: geometry.title,
      edgeConstant: geometry.edgeConstant_mm,
      leftPortion: geometry.leftPortion_mm,
      overallLength_mm: geometry.plateLength_mm
    };
  }

  function edgeCheck(design) {
    const edgeDistances = Object.freeze({
      concrete: design.anchorFromConcreteEdge,
      longitudinalPlateEnd: design.rightEndDistance,
      transverseTop: design.sideEdge,
      transverseBottom: design.sideEdge
    });
    const minimumProvided = Math.min(...Object.values(edgeDistances));
    return {
      pass: minimumProvided >= MINIMUM_EDGE,
      edgeDistances,
      minimumProvided,
      minimumRequired: MINIMUM_EDGE
    };
  }

  function create(section) {
    if (!section || section.type !== "U") {
      return {
        ok: false,
        standard: true,
        connectionType: "simply-supported-u",
        reason: "The standard simply-supported baseplate is available only for U-posts."
      };
    }
    const geometry = types().geometryFor(section);
    if (!geometry) {
      return {
        ok: false,
        standard: true,
        connectionType: "simply-supported-u",
        reason: `No standard base plate type (U-B3A 55-85, U-B3B 90-120) covers a ${section.a_mm} mm deep U-post.`
      };
    }
    const design = designFrom(geometry);
    const results = edgeCheck(design);
    return {
      ok: results.pass,
      standard: true,
      connectionType: "simply-supported-u",
      postType: "U",
      section,
      design,
      results,
      reason: results.pass ? "" :
        "The standard anchor arrangement does not satisfy the minimum edge distance."
    };
  }

  windpost.simplyUBaseplateStandard = Object.freeze({
    MINIMUM_EDGE, designFrom, edgeCheck, create
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.simplyUBaseplateStandard;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
