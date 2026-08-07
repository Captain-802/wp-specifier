(function initialiseCavityWallAssemblyEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const DETAIL = Object.freeze({
    masonry: Object.freeze({
      brick: Object.freeze({
        length_mm: 215,
        depth_mm: 102.5,
        height_mm: 65,
        mortar_mm: 10,
        course_mm: 75
      }),
      block: Object.freeze({
        length_mm: 440,
        depth_mm: 100,
        height_mm: 215,
        mortar_mm: 10,
        course_mm: 225
      })
    }),
    postSlot: Object.freeze({
      width_mm: 10,
      height_mm: 50,
      radius_mm: 5
    }),
    shearTie: Object.freeze({
      overallLength_mm: 168,
      halfLength_mm: 84,
      width_mm: 10,
      thickness_mm: 1.5,
      endRadius_mm: 5,
      holeWidth_mm: 6,
      holeLength_mm: 10,
      holeRadius_mm: 3,
      holeCentresFromEnd_mm: Object.freeze([10, 25]),
      notch_mm: 7.6,
      mirroredEngagement_mm: 11.17
    }),
    tieSchedule: Object.freeze({
      firstCentre_mm: 225,
      spacing_mm: 225,
      parapetTopClearance_mm: 50
    }),
    lPost: Object.freeze({
      innerLeafEmbedment_mm: 90
    })
  });

  function finite(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function defaultSection() {
    const list = windpost.lSectionDatabase && windpost.lSectionDatabase.sections;
    return list && list.length
      ? list.find((section) => section.name === "LP 125x70x4") || list[0]
      : {
          type: "L", name: "LP 125x70x4",
          a_mm: 125, b_mm: 70, t_mm: 4,
          innerRadius_mm: 6, outerRadius_mm: 10
        };
  }

  function tieLevels(length_mm, supportCondition) {
    const length = Math.max(0, finite(length_mm, 2670));
    const first = DETAIL.tieSchedule.firstCentre_mm;
    const pitch = DETAIL.tieSchedule.spacing_mm;
    const freeTop = supportCondition === "cantilever"
      ? DETAIL.tieSchedule.parapetTopClearance_mm
      : first;
    const levels = [];
    for (let z = first; z <= length - freeTop + 1e-9; z += pitch) {
      levels.push(z);
    }
    return levels;
  }

  function fallbackWallCalculation(section, wall) {
    const embed = DETAIL.lPost.innerLeafEmbedment_mm;
    const projection = finite(section.a_mm, 125) - embed;
    const gap = finite(wall.cavityWidth_mm, 150) - projection;
    const ties = [
      { name: "EDC25-100", nominal_mm: 100, actual_mm: 108 },
      { name: "EDC25-125", nominal_mm: 125, actual_mm: 133 },
      { name: "EDC25-150", nominal_mm: 150, actual_mm: 158 },
      { name: "EDC25-175", nominal_mm: 175, actual_mm: 183 },
      { name: "EDC25-200", nominal_mm: 200, actual_mm: 208 },
      { name: "EDC25-225", nominal_mm: 225, actual_mm: 233 },
      { name: "EDC25-250", nominal_mm: 250, actual_mm: 258 },
      { name: "EDC25-275", nominal_mm: 275, actual_mm: 283 },
      { name: "EDC25-300", nominal_mm: 300, actual_mm: 308 },
      { name: "EDC25-325", nominal_mm: 325, actual_mm: 333 },
      { name: "EDC25-350", nominal_mm: 350, actual_mm: 358 },
      { name: "EDC25-375", nominal_mm: 375, actual_mm: 383 }
    ];
    const connection = 7.6 + 11.17;
    const selected = ties.find((tie) => tie.actual_mm - connection >= gap + 55);
    const outerEmbedment = selected ? selected.actual_mm - connection - gap : 0;
    const suitable = Boolean(
      selected && gap >= 4 &&
      outerEmbedment <= finite(wall.outerLeafThickness_mm, 100)
    );
    return {
      valid: suitable,
      suitable,
      reason: suitable ? "Wall geometry and outer tie are suitable." :
        "The wall geometry is outside the stored EDC tie range.",
      postProjectionIntoCavity_mm: projection,
      outerGap_mm: gap,
      outerTie: selected ? selected.name : "No suitable EDC tie",
      selectedTieLength_mm: selected ? selected.nominal_mm : null,
      actualTieLength_mm: selected ? selected.actual_mm : null,
      tieConnectionLength_mm: connection,
      outerEmbedment_mm: outerEmbedment,
      placementDescription: `${embed} mm embedded into the inner leaf`
    };
  }

  function wallCalculation(section, wall) {
    if (
      windpost.outerTieSelectionEngine &&
      typeof windpost.outerTieSelectionEngine.calculateWallAndTie === "function"
    ) {
      return windpost.outerTieSelectionEngine.calculateWallAndTie(section, wall);
    }
    return fallbackWallCalculation(section, wall);
  }

  function baseplateSummary(input, section) {
    if (input.baseplate && input.baseplate.ok && input.baseplate.design) {
      return input.baseplate;
    }
    if (
      input.supportCondition === "simplySupported" &&
      windpost.simplyLBaseplateStandard &&
      typeof windpost.simplyLBaseplateStandard.create === "function"
    ) {
      return windpost.simplyLBaseplateStandard.create(section);
    }
    const depth = finite(section.a_mm, 125);
    const width = finite(section.b_mm, 70) >= 80 ? 220 : 220;
    return {
      ok: true,
      standard: false,
      connectionType: "cavity-preview",
      postType: "L",
      section,
      design: {
        B: width,
        tp: 8,
        plateLen: 170,
        leftPortion: 6 + Math.max(0, depth - 90),
        holeDia: 14,
        nRow: 2,
        nCol: 2,
        w: 96,
        edge: 55,
        pitch: 60
      }
    };
  }

  function build(input) {
    const options = input || {};
    const section = options.section || defaultSection();
    const length = clamp(finite(options.length_mm, 2670), 450, 12000);
    const supportCondition = options.supportCondition === "cantilever"
      ? "cantilever"
      : "simplySupported";
    const wall = {
      innerLeafThickness_mm: clamp(
        finite(options.wall && options.wall.innerLeafThickness_mm, 100),
        90,
        300
      ),
      cavityWidth_mm: clamp(
        finite(options.wall && options.wall.cavityWidth_mm, 150),
        40,
        450
      ),
      outerLeafThickness_mm: clamp(
        finite(options.wall && options.wall.outerLeafThickness_mm, 102.5),
        65,
        300
      )
    };

    if (!section || section.type !== "L") {
      return { valid: false, reason: "The cavity-wall assembly currently supports L windposts only." };
    }
    if (wall.innerLeafThickness_mm < DETAIL.lPost.innerLeafEmbedment_mm) {
      return {
        valid: false,
        reason: `The inner leaf must be at least ${DETAIL.lPost.innerLeafEmbedment_mm} mm for the L-post embedment.`
      };
    }

    const selectedWallTie = wallCalculation(section, wall);
    if (!selectedWallTie.valid || !selectedWallTie.suitable) {
      return {
        valid: false,
        reason: selectedWallTie.reason || "The wall and EDC tie geometry is unsuitable.",
        section,
        wall,
        wallTie: selectedWallTie
      };
    }

    const levels = tieLevels(length, supportCondition);
    const baseplate = baseplateSummary(options, section);
    const a = finite(section.a_mm, 125);
    const b = finite(section.b_mm, 70);
    const t = finite(section.t_mm, 4);
    const embed = DETAIL.lPost.innerLeafEmbedment_mm;
    const postProjection = a - embed;
    const wallLength = Math.max(
      900,
      DETAIL.masonry.block.length_mm * 2 + DETAIL.masonry.block.mortar_mm
    );

    return {
      valid: true,
      type: "L",
      section,
      supportCondition,
      length_mm: length,
      wall,
      wallLength_mm: wallLength,
      totalWallDepth_mm:
        wall.innerLeafThickness_mm +
        wall.cavityWidth_mm +
        wall.outerLeafThickness_mm,
      post: {
        a_mm: a,
        b_mm: b,
        t_mm: t,
        innerRadius_mm: finite(section.innerRadius_mm, 1.5 * t),
        outerRadius_mm: finite(section.outerRadius_mm, 2.5 * t),
        innerLeafEmbedment_mm: embed,
        cavityProjection_mm: postProjection,
        longLegY0_mm: wall.innerLeafThickness_mm - embed,
        longLegY1_mm: wall.innerLeafThickness_mm + postProjection,
        flangeY_mm: wall.innerLeafThickness_mm + postProjection - t
      },
      slot: DETAIL.postSlot,
      shearTie: DETAIL.shearTie,
      tieSchedule: {
        firstCentre_mm: DETAIL.tieSchedule.firstCentre_mm,
        spacing_mm: DETAIL.tieSchedule.spacing_mm,
        levels_mm: levels,
        count: levels.length
      },
      wallTie: selectedWallTie,
      baseplate,
      masonry: DETAIL.masonry,
      view: {
        modelHeight_mm: Math.min(length, 1800),
        masonryHeight_mm: Math.min(length, 1350),
        postCentreX_mm: 0
      }
    };
  }

  windpost.cavityWallAssemblyEngine = Object.freeze({
    DETAIL,
    tieLevels,
    build
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.cavityWallAssemblyEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
