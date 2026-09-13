(function initialiseTieProfiles(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  // Tie products as the approved workbook's Ties sheet lists them (the
  // sheet is the authority, owner 13 Sep 2026): EDC25 ties 21 wide, 1.2 thick
  // up to EDC25-300 and 1.5 from EDC25-325; Shear Tie 240 x 21 x 1.2;
  // EDC25-U Tie 84 x 21 x 1.2 (in tie-wall-setup-engine).
  const common = Object.freeze({
      family: "EDC",
      width_mm: 21,
      thickness_mm: 1.2,
      engagementNotchLength_mm: 7.6,
      tailBeyondNotch_mm: 11.17,
      leadingEndRadius_mm: 10.5,   // half the 21 mm width
      assumedNotchDropEach_mm: 1,
      referenceEndReliefDepth_mm: 2.25,
      referenceEndReliefHalfHeight_mm: 4.5,
      holesShown: false
  });
  const lengths = Object.freeze([
    [100, 108],
    [125, 133],
    [150, 158],
    [175, 183],
    [200, 208],
    [225, 233],
    [250, 258],
    [275, 283],
    [300, 308],
    [325, 333],
    [350, 358],
    [375, 383]
  ]);
  const edcProfiles = lengths.map(([nominal, overall]) =>
    Object.freeze({
      ...common,
      name: `EDC25-${nominal}`,
      nominalLength_mm: nominal,
      overallLength_mm: overall,
      thickness_mm: nominal >= 325 ? 1.5 : common.thickness_mm
    })
  );
  const shearTie = Object.freeze({
    family: "SHEAR",
    name: "SHEAR TIE 240",
    overallLength_mm: 240,
    halfLength_mm: 120,
    width_mm: 21,
    thickness_mm: 1.2,
    endRadius_mm: 5,
    slotLength_mm: 10,
    slotWidth_mm: 6,
    slotRadius_mm: 3,
    slotCentresFromEnd_mm: Object.freeze([10, 25]),
    engagementNotchLength_mm: 7.6,
    mirroredEngagement_mm: 11.17,
    assumedSideNotchDepth_mm: 3,
    holesShown: true
  });
  const profiles = Object.freeze([...edcProfiles, shearTie]);

  function get(name) {
    return profiles.find(profile => profile.name === name) ||
      (/^SHEAR TIE/i.test(String(name || "")) ? shearTie : profiles[0]);
  }

  windpost.tieProfiles = Object.freeze({ profiles, shearTie, get });
})(typeof window !== "undefined" ? window : globalThis);
