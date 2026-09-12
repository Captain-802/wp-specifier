// DU windpost to concrete slab FACE connections — the owner's detail sheets
// (11 Sep 2026): a 6 mm stainless plate on the face of the slab, the DU post
// welded to it, two M12 anchors through 14 x 70 vertical slots giving
// +/- 29 mm vertical adjustment.
//
//   DU-T2  top    plate 280 x 150 x 6, slots 50 from each end, post 80 from each end
//   DU-B2  bottom plate 250 x 150 x 6, slots 35 from each end, post 65 from each end
//
// Both: slots 180 apart, 70 long centred on the 150 height (40 / 70 / 40),
// post 120 wide (two channels welded web to web, 2 x 60 flanges) with its end
// 8 mm inside the plate edge, welded all round. The bottom connection is the
// top one mirrored about the horizontal. Bolts: RG M12, FAZ II M12 or
// FAZ II Plus M12 (the library rows DU-T2 / DU-B2 carry the SKUs).
(function initialiseDuSlabFacePlates(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const COMMON = Object.freeze({
    plateHeight_mm: 150,
    plateThickness_mm: 6,
    slotWidth_mm: 14,
    slotLength_mm: 70,
    slotPitch_mm: 180,
    postWidth_mm: 120,
    postEndInset_mm: 8,
    boltDiameter_mm: 12,
    bolts: 2,
    verticalAdjustment_mm: 29,          // (70 - 12) / 2
    postBolt: "WELD"
  });

  const PLATES = Object.freeze([
    Object.freeze({
      code: "DU-T2", position: "top", plateLength_mm: 280, slotEdge_mm: 50, postEdge_mm: 80,
      title: "DU POST TO CONCRETE SLAB FACE · TOP CONNECTION", fixing: "Top Fixing", plateNote: "6mm thick S.S top plate"
    }),
    Object.freeze({
      code: "DU-B2", position: "bottom", plateLength_mm: 250, slotEdge_mm: 35, postEdge_mm: 65,
      title: "DU POST TO CONCRETE SLAB FACE · BOTTOM CONNECTION", fixing: "Base Fixing", plateNote: "6mm thick S.S base plate"
    })
  ]);

  function byCode(code) {
    return PLATES.find(plate => plate.code === code) || null;
  }

  // Full geometry for a DU section (depth a, flanges b, thickness t).
  function geometryFor(code, section) {
    const plate = byCode(code);
    if (!plate) return null;
    const depth = Number(section && section.a_mm) || 60;
    const flange = Number(section && section.b_mm) || 60;
    const t = Number(section && section.t_mm) || 6;
    const slotCentres = [plate.slotEdge_mm, plate.plateLength_mm - plate.slotEdge_mm];
    return Object.freeze({
      ...COMMON,
      ...plate,
      depth_mm: depth,
      flange_mm: flange,
      t_mm: t,
      innerRadius_mm: Number.isFinite(Number(section && section.innerRadius_mm)) ? Number(section.innerRadius_mm) : 1.5 * t,
      webThickness_mm: 2 * t,                               // two webs welded together
      postWidth_mm: 2 * flange,                             // 120 for the 60 flange
      slotCentres_mm: Object.freeze(slotCentres),
      slotTop_mm: (COMMON.plateHeight_mm - COMMON.slotLength_mm) / 2,
      postStart_mm: plate.postEdge_mm,
      postEnd_mm: plate.postEdge_mm + 2 * flange,
      check: Object.freeze({
        // the geometry only closes when 2 x edge + pitch = plate length and
        // 2 x post edge + post width = plate length
        slotsClose: 2 * plate.slotEdge_mm + COMMON.slotPitch_mm === plate.plateLength_mm,
        postCentred: 2 * plate.postEdge_mm + 2 * flange === plate.plateLength_mm
      })
    });
  }

  windpost.duSlabFacePlates = Object.freeze({ COMMON, PLATES, byCode, geometryFor });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.duSlabFacePlates;
  }
})(typeof window !== "undefined" ? window : globalThis);
