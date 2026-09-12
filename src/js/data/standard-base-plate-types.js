// Standard simply-supported base plates "post to concrete top" — the four
// hard-coded types from the owner's detail sheets (11 Sep 2026):
//
//   U-B3A  U post, depth 55-85    plate 205 x 150 x 6   B = 158 - D
//   U-B3B  U post, depth 90-120   plate 240 x 150 x 6   B = 193 - D
//   L-B2A  L post, depth 125-160  plate 205 x 150 x 6   B = 254 - D
//   L-B2B  L post, depth 165-200  plate 240 x 150 x 6   B = 289 - D
//
// D = post depth (a). B = concrete edge to bolt centre. Every type has the
// same plate length and width, the same two Ø12 bolts (35 mm from the plate
// end, 80 mm gauge, 35 mm side edges) and the same 6 mm plate; only B moves
// with the post depth so that:
//   U:  plate length = 6 + D + 6 + B + 35
//   L:  plate length = 6 + (D - 90) + B + 35       (90 mm built into the leaf)
// The bolts (library rows U-B3 / L-B2) are unchanged; only the geometry
// differs between A and B.
(function initialiseStandardBasePlateTypes(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const COMMON = Object.freeze({
    plateWidth_mm: 150,
    plateThickness_mm: 6,
    boltEndDistance_mm: 35,
    boltGauge_mm: 80,
    sideEdge_mm: 35,
    holeDiameter_mm: 14,
    boltDiameter_mm: 12,
    anchorName: "RGM 12",
    rows: 1,
    columns: 2,
    concreteClearance_mm: 6,
    rearProjection_mm: 6,
    embedment_mm: 90
  });

  const TYPES = Object.freeze([
    { code: "U-B3A", parent: "U-B3", family: "U", depthFrom_mm: 55, depthTo_mm: 85, edgeConstant_mm: 158, plateLength_mm: 205,
      title: "U POST TO CONCRETE TOP · BOTTOM CONNECTION 55 TO 85" },
    { code: "U-B3B", parent: "U-B3", family: "U", depthFrom_mm: 90, depthTo_mm: 120, edgeConstant_mm: 193, plateLength_mm: 240,
      title: "U POST TO CONCRETE TOP · BOTTOM CONNECTION 90 x 60 x 4 TO 120 x 80 x 8" },
    { code: "L-B2A", parent: "L-B2", family: "L", depthFrom_mm: 125, depthTo_mm: 160, edgeConstant_mm: 254, plateLength_mm: 205,
      title: "L POST TO CONCRETE TOP · BOTTOM CONNECTION 125 x 70 x 4 TO 160 x 70 x 6" },
    { code: "L-B2B", parent: "L-B2", family: "L", depthFrom_mm: 165, depthTo_mm: 200, edgeConstant_mm: 289, plateLength_mm: 240,
      title: "L POST TO CONCRETE TOP · BOTTOM CONNECTION 165 x 70 x 4 TO 200 x 70 x 6" }
  ].map(type => Object.freeze(type)));

  function familyOf(section) {
    const type = section && (section.type || section.shape);
    return type === "U" || type === "L" ? type : null;
  }

  // The type for a section by family and depth; null when none covers it.
  function typeFor(section) {
    const family = familyOf(section);
    const depth = Number(section && section.a_mm);
    if (!family || !Number.isFinite(depth)) return null;
    return TYPES.find(type => type.family === family && depth >= type.depthFrom_mm && depth <= type.depthTo_mm) || null;
  }

  // Full geometry of the plate for a section: the owner's table row.
  function geometryFor(section) {
    const type = typeFor(section);
    if (!type) return null;
    const depth = Number(section.a_mm);
    const edgeToBolt = type.edgeConstant_mm - depth;
    const leftPortion = type.family === "U"
      ? COMMON.rearProjection_mm + depth + COMMON.concreteClearance_mm
      : COMMON.rearProjection_mm + (depth - COMMON.embedment_mm);
    const rightPortion = edgeToBolt + COMMON.boltEndDistance_mm;
    return Object.freeze({
      code: type.code,
      parent: type.parent,
      title: type.title,
      family: type.family,
      depth_mm: depth,
      edgeConstant_mm: type.edgeConstant_mm,
      edgeToBolt_mm: edgeToBolt,
      leftPortion_mm: leftPortion,
      rightPortion_mm: rightPortion,
      plateLength_mm: leftPortion + rightPortion,
      plateWidth_mm: COMMON.plateWidth_mm,
      plateThickness_mm: COMMON.plateThickness_mm,
      boltEndDistance_mm: COMMON.boltEndDistance_mm,
      boltGauge_mm: COMMON.boltGauge_mm,
      sideEdge_mm: COMMON.sideEdge_mm,
      holeDiameter_mm: COMMON.holeDiameter_mm,
      boltDiameter_mm: COMMON.boltDiameter_mm,
      anchorName: COMMON.anchorName,
      rows: COMMON.rows,
      columns: COMMON.columns,
      tabulatedLength_mm: type.plateLength_mm
    });
  }

  windpost.standardBasePlateTypes = Object.freeze({ COMMON, TYPES, typeFor, geometryFor });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.standardBasePlateTypes;
  }
})(typeof window !== "undefined" ? window : globalThis);
