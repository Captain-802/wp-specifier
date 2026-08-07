(function initialiseTieProfiles(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const common = Object.freeze({
      family: "EDC",
      width_mm: 18,
      thickness_mm: 1.5,
      engagementNotchLength_mm: 7.6,
      tailBeyondNotch_mm: 11.17,
      leadingEndRadius_mm: 9,
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
      overallLength_mm: overall
    })
  );
  const shearTie = Object.freeze({
    family: "SHEAR",
    name: "SHEAR TIE 168",
    overallLength_mm: 168,
    halfLength_mm: 84,
    width_mm: 10,
    thickness_mm: 1.5,
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
    return profiles.find(profile => profile.name === name) || profiles[0];
  }

  windpost.tieProfiles = Object.freeze({ profiles, get });
})(typeof window !== "undefined" ? window : globalThis);
