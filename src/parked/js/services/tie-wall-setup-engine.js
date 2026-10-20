(function initialiseTieWallSetupEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const MATERIALS = Object.freeze({
    brick: Object.freeze({
      key: "brick",
      label: "Facing brick",
      unitLength_mm: 215,
      unitHeight_mm: 65,
      mortar_mm: 10,
      course_mm: 75,
      defaultThickness_mm: 102.5,
      color: "#a84f35"
    }),
    denseBlock: Object.freeze({
      key: "denseBlock",
      label: "Dense block",
      unitLength_mm: 440,
      unitHeight_mm: 215,
      mortar_mm: 10,
      course_mm: 225,
      defaultThickness_mm: 100,
      color: "#aeb1ad"
    }),
    aeratedBlock: Object.freeze({
      key: "aeratedBlock",
      label: "Aerated block",
      unitLength_mm: 440,
      unitHeight_mm: 215,
      mortar_mm: 10,
      course_mm: 225,
      defaultThickness_mm: 100,
      color: "#c5c7c2"
    })
  });

  const DEFAULTS = Object.freeze({
    outerMaterial: "brick",
    outerThickness_mm: 102.5,
    cavityWidth_mm: 100,
    innerMaterial: "aeratedBlock",
    innerThickness_mm: 100,
    sectionName: "LP 125x70x4",
    wallLength_mm: 900,
    wallHeight_mm: 450,
    elevationHeight_mm: 1800
  });

  const CONNECTION = Object.freeze({
    innerLeafEmbedment_mm: 90,
    minimumOuterEmbedment_mm: 55,
    // A U post stands wholly in the cavity, held clear of the inner leaf, and
    // is tied back with a U tie instead of the L's shear tie. The figures are
    // the same ones the selector's outer-tie engine designs to.
    uInnerClearance_mm: 6,
    uTie: Object.freeze({
      name: "U tie",
      overallLength_mm: 84,
      innerEmbedment_mm: 65.23,
      width_mm: 21,
      thickness_mm: 1.2
    }),
    edcEngagement_mm: 7.6 + 11.17,
    nominalTieSlots: Object.freeze({
      length_mm: 10,
      width_mm: 6,
      radius_mm: 3,
      centresFromFreeEnd_mm: Object.freeze([10, 25])
    }),
    // Shear Tie 240 x 21 x 1.2 (workbook Ties sheet), from tie-profiles when
    // that file is on the page.
    shearTie: Object.freeze({
      overallLength_mm: 240,
      halfLength_mm: 120,
      width_mm: 21,
      thickness_mm: 1.2,
      endRadius_mm: 5,
      slotLength_mm: 10,
      slotWidth_mm: 6,
      slotRadius_mm: 3,
      slotCentresFromEnd_mm: Object.freeze([10, 25]),
      ...((windpost.tieProfiles && windpost.tieProfiles.shearTie) || {})
    })
  });

  function finite(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function material(key, fallback) {
    return MATERIALS[key] || MATERIALS[fallback];
  }

  function masonryUnits(layer, materialDetail, zone, wallLength, wallHeight) {
    const units = [];
    const moduleLength =
      materialDetail.unitLength_mm + materialDetail.mortar_mm;
    const courseCount = Math.ceil(wallHeight / materialDetail.course_mm);

    for (let course = 0; course < courseCount; course += 1) {
      const z = course * materialDetail.course_mm;
      const unitHeight = Math.min(
        materialDetail.unitHeight_mm,
        wallHeight - z
      );
      if (unitHeight <= 0) continue;

      const offset = course % 2 ? moduleLength / 2 : 0;
      let nominalStart = -offset;
      while (nominalStart < wallLength) {
        const start = Math.max(
          0,
          nominalStart + materialDetail.mortar_mm / 2
        );
        const end = Math.min(
          wallLength,
          nominalStart + materialDetail.unitLength_mm
        );
        if (end - start > 8) {
          units.push({
            layer,
            course,
            x_mm: start,
            y_mm: zone.start_mm,
            z_mm: z,
            length_mm: end - start,
            depth_mm: zone.thickness_mm,
            height_mm: unitHeight,
            color: materialDetail.color
          });
        }
        nominalStart += moduleLength;
      }
    }
    return units;
  }

  function defaultSection() {
    const sections =
      windpost.lSectionDatabase &&
      Array.isArray(windpost.lSectionDatabase.sections)
        ? windpost.lSectionDatabase.sections
        : [];
    return sections.find(section => section.name === DEFAULTS.sectionName) ||
      sections[0] || {
        type: "L",
        name: DEFAULTS.sectionName,
        a_mm: 125,
        b_mm: 70,
        t_mm: 4,
        innerRadius_mm: 6,
        outerRadius_mm: 10
      };
  }

  // Both catalogues are searched: the wall arrangement is drawn for U posts as
  // well as L, and each type sits in the cavity differently.
  function selectedSection(name) {
    const list = key =>
      windpost[key] && Array.isArray(windpost[key].sections)
        ? windpost[key].sections
        : [];
    const sections = list("lSectionDatabase").concat(list("uSectionDatabase"));
    return sections.find(section => section.name === name) || defaultSection();
  }

  // Where the post sits between the two leaves.
  //   L — built 90 mm into the inner leaf, the rest of its depth in the cavity.
  //   U — wholly in the cavity, held 6 mm clear of the inner leaf face.
  // cavityProjection is measured from the inner leaf face toward the outer
  // leaf either way, so the gap left for the outer tie is the same subtraction.
  function placement(section, innerThickness, cavityWidth) {
    if (section && section.type === "U") {
      const clearance = CONNECTION.uInnerClearance_mm;
      const depth = Number(section.a_mm) || 0;
      return {
        postType: "U",
        innerLeafEmbedment_mm: 0,
        innerClearance_mm: clearance,
        cavityProjection_mm: clearance + depth,
        postDepth_mm: depth,
        longLegStartFromInnerFace_mm: innerThickness,
        innerTie: CONNECTION.uTie
      };
    }
    const embedment = Math.min(CONNECTION.innerLeafEmbedment_mm, innerThickness);
    return {
      postType: "L",
      innerLeafEmbedment_mm: embedment,
      innerClearance_mm: 0,
      cavityProjection_mm: Math.max(0, Number(section.a_mm) - embedment),
      postDepth_mm: Number(section.a_mm) || 0,
      longLegStartFromInnerFace_mm: innerThickness - embedment,
      innerTie: null
    };
  }

  function edcProfiles() {
    return windpost.tieProfiles &&
      Array.isArray(windpost.tieProfiles.profiles)
      ? windpost.tieProfiles.profiles.filter(profile =>
          profile.family === "EDC"
        )
      : [];
  }

  function selectEdcTie(gap_mm, outerThickness_mm) {
    const profiles = edcProfiles();
    const minimum = CONNECTION.minimumOuterEmbedment_mm;
    const engagement = CONNECTION.edcEngagement_mm;
    const suitable = profiles.find(profile => {
      const usable = profile.overallLength_mm - engagement;
      const embedment = usable - gap_mm;
      return embedment >= minimum && embedment <= outerThickness_mm;
    });
    const selected = suitable || profiles[profiles.length - 1] || {
      name: "EDC25-150",
      nominalLength_mm: 150,
      overallLength_mm: 158,
      width_mm: 21,
      thickness_mm: 1.2
    };
    const usableLength = selected.overallLength_mm - engagement;
    return {
      name: selected.name,
      profile: selected,
      nominalLength_mm: selected.nominalLength_mm,
      overallLength_mm: selected.overallLength_mm,
      width_mm: selected.width_mm || 21,
      thickness_mm: selected.thickness_mm || 1.2,
      engagementNotchLength_mm:
        selected.engagementNotchLength_mm || 7.6,
      tailBeyondNotch_mm:
        selected.tailBeyondNotch_mm || 11.17,
      engagement_mm: engagement,
      usableLength_mm: usableLength,
      gap_mm,
      outerEmbedment_mm: usableLength - gap_mm,
      minimumOuterEmbedment_mm: minimum,
      nominalSlots: CONNECTION.nominalTieSlots,
      suitable: Boolean(suitable)
    };
  }

  function build(input) {
    const values = input || {};
    const outerMaterial = material(
      values.outerMaterial,
      DEFAULTS.outerMaterial
    );
    const innerMaterial = material(
      values.innerMaterial,
      DEFAULTS.innerMaterial
    );
    const outerThickness = clamp(
      finite(values.outerThickness_mm, DEFAULTS.outerThickness_mm),
      65,
      300
    );
    const cavityWidth = clamp(
      finite(values.cavityWidth_mm, DEFAULTS.cavityWidth_mm),
      40,
      450
    );
    const innerThickness = clamp(
      finite(values.innerThickness_mm, DEFAULTS.innerThickness_mm),
      75,
      300
    );
    const wallLength = clamp(
      finite(values.wallLength_mm, DEFAULTS.wallLength_mm),
      450,
      2400
    );
    const wallHeight = clamp(
      finite(values.wallHeight_mm, DEFAULTS.wallHeight_mm),
      225,
      1350
    );
    const elevationHeight = clamp(
      finite(values.elevationHeight_mm, DEFAULTS.elevationHeight_mm),
      450,
      6000
    );
    const section = selectedSection(values.sectionName);

    const outer = {
      key: "outer",
      label: "OUTER LEAF",
      start_mm: 0,
      end_mm: outerThickness,
      thickness_mm: outerThickness,
      material: outerMaterial
    };
    const cavity = {
      key: "cavity",
      label: "CLEAR CAVITY",
      start_mm: outer.end_mm,
      end_mm: outer.end_mm + cavityWidth,
      thickness_mm: cavityWidth
    };
    const inner = {
      key: "inner",
      label: "INNER LEAF",
      start_mm: cavity.end_mm,
      end_mm: cavity.end_mm + innerThickness,
      thickness_mm: innerThickness,
      material: innerMaterial
    };

    const outerUnits = masonryUnits(
      "outer",
      outerMaterial,
      outer,
      wallLength,
      wallHeight
    );
    const innerUnits = masonryUnits(
      "inner",
      innerMaterial,
      inner,
      wallLength,
      wallHeight
    );
    const seat = placement(section, innerThickness, cavityWidth);
    const innerEmbedment = seat.innerLeafEmbedment_mm;
    const cavityProjection = seat.cavityProjection_mm;
    const cavityGap = Math.max(0, cavityWidth - cavityProjection);
    const edcTie = selectEdcTie(cavityGap, outerThickness);

    return {
      valid: true,
      datum: "External face of outer leaf",
      axes: Object.freeze({
        x: "along wall",
        y: "external to internal",
        z: "vertical"
      }),
      wallLength_mm: wallLength,
      wallHeight_mm: wallHeight,
      totalThickness_mm: inner.end_mm,
      outer,
      cavity,
      inner,
      connection: {
        section,
        postType: seat.postType,
        innerLeafEmbedment_mm: innerEmbedment,
        innerClearance_mm: seat.innerClearance_mm,
        postDepth_mm: seat.postDepth_mm,
        cavityProjection_mm: cavityProjection,
        cavityGap_mm: cavityGap,
        longLegStartFromInnerFace_mm: seat.longLegStartFromInnerFace_mm,
        shearTie: CONNECTION.shearTie,
        uTie: seat.innerTie,
        innerTieName: seat.postType === "U"
          ? CONNECTION.uTie.name
          : "SHEAR TIE",
        edcTie
      },
      elevation: {
        height_mm: elevationHeight,
        tieSpacing_mm: 225,
        tieLevels_mm: Array.from(
          {
            length: Math.max(
              0,
              Math.floor((elevationHeight - 25) / 225)
            )
          },
          (_, index) => 225 * (index + 1)
        )
      },
      units: [...outerUnits, ...innerUnits],
      courseAlignment: {
        brickCourses:
          outerMaterial.course_mm === 75
            ? Math.ceil(wallHeight / 75)
            : null,
        blockCourses:
          innerMaterial.course_mm === 225
            ? Math.ceil(wallHeight / 225)
            : null,
        commonBedJoint_mm: 225
      }
    };
  }

  windpost.tieWallSetup = Object.freeze({
    MATERIALS,
    DEFAULTS,
    CONNECTION,
    build
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.tieWallSetup;
  }
})(typeof window !== "undefined" ? window : globalThis);
