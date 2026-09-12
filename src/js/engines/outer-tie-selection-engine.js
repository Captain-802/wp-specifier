(function initialiseOuterTieSelectionEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  // Ties and wall geometry come from windpost.parameters (generated from
  // windpost-database.xlsx). The literals below are the fallback used if that
  // generated file is ever missing, so the calculator still works standalone.
  const P = (windpost.parameters && windpost.parameters.tie) || {};

  // Each outer tie carries its own catalogue name, nominal designation length,
  // and actual manufactured length (from the EDC drawings). Selection works off
  // the actual length, so the tie name is whatever the workbook says.
  const FALLBACK_TIE_LIST = [
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

  // Ordered smallest-first by actual length so the first match is the shortest
  // suitable tie.
  const TIE_LIST = Object.freeze(
    (Array.isArray(P.list) && P.list.length ? [...P.list] : FALLBACK_TIE_LIST)
      .map((t) => Object.freeze({ name: t.name, nominal_mm: t.nominal_mm, actual_mm: t.actual_mm }))
      .sort((a, b) => a.actual_mm - b.actual_mm)
  );

  // Nominal designation lengths, kept for reference/back-compat.
  const EDC_TIE_LENGTHS_MM = Object.freeze(TIE_LIST.map((t) => t.nominal_mm));

  const WALL_DEFAULTS = Object.freeze({
    uInnerClearance_mm: P.uInnerClearance_mm ?? 6,
    uTieActualLength_mm: P.uTieActualLength_mm ?? 84,
    uTieInnerEmbedment_mm: P.uTieInnerEmbedment_mm ?? 65.23,
    lInnerLeafEmbedment_mm: P.lInnerLeafEmbedment_mm ?? 90,
    minimumOuterGap_mm: P.minGap_mm ?? 4,
    minimumOuterEmbedment_mm: P.minEmbedment_mm ?? 55,
    // The windpost-slot connection consumes the 7.6 mm notch plus the 11.17 mm
    // tail beyond it, so the length available from the post face is the tie's
    // ACTUAL length minus 18.77 mm.
    tieNotchLength_mm: P.notch_mm ?? 7.6,
    tieTailBeyondNotch_mm: P.tailBeyondNotch_mm ?? 11.17,
    innerTieDescription: "Standard inner-leaf tie"
  });

  const TIE_CONNECTION_LENGTH_MM =
    WALL_DEFAULTS.tieNotchLength_mm + WALL_DEFAULTS.tieTailBeyondNotch_mm;

  function usableProjection_mm(actualLength_mm) {
    return actualLength_mm - TIE_CONNECTION_LENGTH_MM;
  }

  // The inner-leaf tie type depends on the windpost: a U post is tied back with
  // a U tie; an L post (built into the inner leaf) uses a shear tie.
  function innerTieFor(type) {
    if (type === "U") {
      return {
        name: "U tie",
        note: `${WALL_DEFAULTS.uTieActualLength_mm} mm long; ${WALL_DEFAULTS.uTieInnerEmbedment_mm} mm embedment`,
        actualLength_mm: WALL_DEFAULTS.uTieActualLength_mm,
        embedment_mm: WALL_DEFAULTS.uTieInnerEmbedment_mm,
        postClearance_mm: WALL_DEFAULTS.uInnerClearance_mm
      };
    }
    if (type === "DU") {
      return {
        name: "U tie",
        note: `2 per level; ${WALL_DEFAULTS.uTieActualLength_mm} mm long; ${WALL_DEFAULTS.uTieInnerEmbedment_mm} mm embedment`,
        actualLength_mm: WALL_DEFAULTS.uTieActualLength_mm,
        embedment_mm: WALL_DEFAULTS.uTieInnerEmbedment_mm,
        postClearance_mm: WALL_DEFAULTS.uInnerClearance_mm
      };
    }
    if (type === "L") return { name: "Shear tie", note: "for the inner leaf" };
    if (type === "I") return { name: "Shear tie", note: "post built into the inner leaf" };
    return { name: WALL_DEFAULTS.innerTieDescription, note: "" };
  }

  function invalidResult(reason, partial = {}) {
    return {
      valid: false,
      suitable: false,
      reason,
      innerTie: WALL_DEFAULTS.innerTieDescription,
      ...partial
    };
  }

  function calculateWallAndTie(section, wallInput) {
    const innerLeaf = Number(wallInput.innerLeafThickness_mm);
    const cavity = Number(wallInput.cavityWidth_mm);
    const outerLeaf = Number(wallInput.outerLeafThickness_mm);
    const postDepth = Number(section && section.a_mm);

    if (
      !section || ![innerLeaf, cavity, outerLeaf, postDepth].every(Number.isFinite) ||
      innerLeaf <= 0 || cavity <= 0 || outerLeaf <= 0 || postDepth <= 0
    ) {
      return invalidResult("Enter valid inner-leaf, cavity and outer-leaf dimensions.");
    }

    let postProjectionIntoCavity_mm = 0;
    let outerGap_mm = 0;
    let placementDescription = "";

    if (section.type === "I") {
      // An I post is a flat plate built into the inner leaf: it does not
      // enter the cavity, needs no outer-leaf tie and has no cavity check.
      const innerTie = innerTieFor("I");
      return {
        valid: true,
        suitable: true,
        reason: "Post built into the inner leaf; no cavity placement or outer tie required.",
        innerTie: innerTie.name,
        innerTieNote: innerTie.note,
        innerTieActualLength_mm: null,
        innerTieEmbedment_mm: null,
        innerTiePostClearance_mm: null,
        outerTie: "None",
        selectedTieLength_mm: null,
        actualTieLength_mm: null,
        tieConnectionLength_mm: TIE_CONNECTION_LENGTH_MM,
        requiredActualLength_mm: null,
        outerEmbedment_mm: null,
        outerGap_mm: null,
        postProjectionIntoCavity_mm: 0,
        placementDescription: "built into the inner leaf (no cavity projection)",
        innerLeafThickness_mm: innerLeaf,
        cavityWidth_mm: cavity,
        outerLeafThickness_mm: outerLeaf
      };
    }

    if (section.type === "U" || section.type === "DU") {
      postProjectionIntoCavity_mm = postDepth;
      outerGap_mm = cavity - WALL_DEFAULTS.uInnerClearance_mm - postProjectionIntoCavity_mm;
      placementDescription = `${WALL_DEFAULTS.uInnerClearance_mm} mm clear of the inner leaf`;
    } else if (section.type === "L") {
      if (innerLeaf < WALL_DEFAULTS.lInnerLeafEmbedment_mm) {
        return invalidResult(
          `The inner leaf is less than the ${WALL_DEFAULTS.lInnerLeafEmbedment_mm} mm L-post embedment assumption.`,
          { postProjectionIntoCavity_mm: 0, outerGap_mm: cavity }
        );
      }
      postProjectionIntoCavity_mm = postDepth - WALL_DEFAULTS.lInnerLeafEmbedment_mm;
      outerGap_mm = cavity - postProjectionIntoCavity_mm;
      placementDescription = `${WALL_DEFAULTS.lInnerLeafEmbedment_mm} mm embedded into the inner leaf`;
    } else {
      return invalidResult("Unsupported windpost type for wall placement.");
    }

    if (postProjectionIntoCavity_mm < 0) {
      return invalidResult("The windpost projection into the cavity is invalid.", {
        postProjectionIntoCavity_mm,
        outerGap_mm
      });
    }

    if (outerGap_mm < WALL_DEFAULTS.minimumOuterGap_mm) {
      return invalidResult(
        `Only ${outerGap_mm.toFixed(1)} mm remains between the post and outer leaf; at least ${WALL_DEFAULTS.minimumOuterGap_mm} mm is required.`,
        { postProjectionIntoCavity_mm, outerGap_mm, placementDescription }
      );
    }

    const requiredProjection_mm =
      outerGap_mm + WALL_DEFAULTS.minimumOuterEmbedment_mm;
    // The actual tie length a suitable tie must reach.
    const requiredActualLength_mm = requiredProjection_mm + TIE_CONNECTION_LENGTH_MM;
    const selectedTie = TIE_LIST.find(
      (tie) => usableProjection_mm(tie.actual_mm) + 1e-9 >= requiredProjection_mm
    );

    if (!selectedTie) {
      const longestTie = TIE_LIST[TIE_LIST.length - 1];
      return invalidResult(
        `The required outer tie exceeds ${longestTie ? longestTie.name : "the longest available tie"}.`,
        {
          postProjectionIntoCavity_mm,
          outerGap_mm,
          requiredActualLength_mm,
          placementDescription
        }
      );
    }

    const outerEmbedment_mm =
      usableProjection_mm(selectedTie.actual_mm) - outerGap_mm;

    if (outerEmbedment_mm > outerLeaf) {
      return invalidResult(
        `The calculated ${outerEmbedment_mm.toFixed(1)} mm embedment exceeds the ${outerLeaf.toFixed(1)} mm outer-leaf thickness.`,
        {
          postProjectionIntoCavity_mm,
          outerGap_mm,
          requiredActualLength_mm,
          selectedTieLength_mm: selectedTie.nominal_mm,
          outerEmbedment_mm,
          outerTie: selectedTie.name,
          placementDescription
        }
      );
    }

    const innerTie = innerTieFor(section.type);

    return {
      valid: true,
      suitable: true,
      reason: "Wall geometry and outer tie are suitable.",
      innerTie: innerTie.name,
      innerTieNote: innerTie.note,
      innerTieActualLength_mm: innerTie.actualLength_mm ?? null,
      innerTieEmbedment_mm: innerTie.embedment_mm ?? null,
      innerTiePostClearance_mm: innerTie.postClearance_mm ?? null,
      outerTie: selectedTie.name,
      selectedTieLength_mm: selectedTie.nominal_mm,
      actualTieLength_mm: selectedTie.actual_mm,
      tieConnectionLength_mm: TIE_CONNECTION_LENGTH_MM,
      requiredActualLength_mm,
      outerEmbedment_mm,
      outerGap_mm,
      postProjectionIntoCavity_mm,
      placementDescription,
      innerLeafThickness_mm: innerLeaf,
      cavityWidth_mm: cavity,
      outerLeafThickness_mm: outerLeaf
    };
  }

  windpost.outerTieSelectionEngine = Object.freeze({
    EDC_TIE_LENGTHS_MM,
    TIE_LIST,
    WALL_DEFAULTS,
    calculateWallAndTie
  });
})(window);
