(function initialiseLCantileverBaseplatePrototypeService(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function replaceAll(source, replacements) {
    return replacements.reduce(
      (value, [from, to]) => value.split(from).join(to),
      source
    );
  }

  function cadPrintSvg(sourceSvg, requestedMode) {
    const mode = requestedMode === "lines" ? "lines" : "hatch";
    const steelFill = mode === "hatch"
      ? "url(#bpSteelPrintHatch)"
      : "#fff";
    let svg = sourceSvg.replace(
      "<defs>",
      `<defs><pattern id="bpSteelPrintHatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="-1" x2="0" y2="4" stroke="#000" stroke-width="0.16"/></pattern>`
    );
    svg = svg.replace(
      "<svg ",
      `<svg data-render-mode="${mode}" data-drawing-standard="cad-print" `
    );
    svg = replaceAll(svg, [
      ["#dfe3e8", steelFill],
      ["#b9c0c8", steelFill],
      ["#aeb6bf", steelFill],
      ["#eef1f4", steelFill],
      ["#1b1e22", "#000"],
      ["#6f767d", "#000"],
      ["#394049", "#000"],
      ["#b3261e", "#000"],
      ["#123a63", "#000"],
      ["#8a6a2f", "#000"],
      ["#a98f66", "#000"],
      ["#9aa0a6", "#000"],
      ["#b7b0a2", "#000"],
      ["#c9b48f", "#000"]
    ]);
    return svg;
  }

  function calculateWindpostCapacity(section, length_mm, loadType) {
    const parameters = windpost.parameters.design;
    return windpost.windpostCalculationEngine.getCalculatedDesignValues({
      length: length_mm,
      fy: parameters.fy,
      e: parameters.e,
      ixx: section.ixx_mm4,
      zxx: section.zxx_mm3,
      area: section.crossSectionalArea_mm2,
      tieStrength: windpost.config.TIE_TYPES.includes(section.type)
        ? windpost.config.tieStrength(section.type, "Cant")
        : windpost.config.tieStrength("L", "Cant"),
      firstTieSpacing: parameters.firstTieSpacing,
      standardTieSpacing: parameters.standardTieSpacing,
      secantFy: parameters.secantFy,
      secantN: parameters.secantN,
      supportCondition: "cantilever",
      loadType,
      apply10mmLimit: false,
      useCustomDeflectionLimit: false,
      customDeflectionLimit: "",
      connectionCapacityCap: ""
    });
  }

  // A simply-supported base is a FIXED standard detail: no moment, no plate or
  // stiffener design, just the standard arrangement and its edge-distance
  // check. It is returned in the same shape as the designed cantilever base so
  // the page and the sheet do not have to branch.
  function simplySupported(section, length_mm, options) {
    const isU = section.type === "U";
    const standardEngine = isU
      ? windpost.simplyUBaseplateStandard
      : windpost.simplyLBaseplateStandard;
    const drawingService = isU
      ? windpost.simplyUBaseplateDrawing
      : windpost.simplyLBaseplateDrawing;
    if (!standardEngine || !drawingService) {
      return Object.freeze({
        ok: false, section, length_mm,
        reason: `The simply-supported ${section.type}-post baseplate services are not loaded.`
      });
    }
    const standard = standardEngine.create(section);
    if (!standard.ok) {
      return Object.freeze({
        ok: false, section, length_mm,
        reason: standard.reason || "The standard baseplate detail is not available."
      });
    }
    const drawingMode = options && options.mode === "lines" ? "lines" : "hatch";
    const drawing = drawingService.draw(standard.design, section);
    const leftPortion_mm = isU
      ? 6 + Number(section.a_mm) + 6
      : 6 + (Number(section.a_mm) - 90);
    return Object.freeze({
      ok: true,
      source: `simply-supported-${section.type.toLowerCase()}-standard`,
      standard: true,
      supportCondition: "simplySupported",
      postType: section.type,
      section,
      length_mm,
      results: standard.results,
      design: Object.freeze({
        ...standard.design,
        leftPortion_mm,
        overallLength_mm: leftPortion_mm + Number(standard.design.plateLen)
      }),
      drawingMode,
      svg: cadPrintSvg(drawing.svg, drawingMode),
      drawingWidth: drawing.width,
      drawingHeight: drawing.height,
      drawingViews: drawing.views
    });
  }

  function design(section, requestedLength_mm, requestedLoadType, options) {
    if (!section || (section.type !== "L" && section.type !== "U")) {
      return Object.freeze({
        ok: false,
        reason: "Choose an L or U windpost section."
      });
    }
    const length_mm = Math.max(
      300,
      Math.min(12000, Number(requestedLength_mm) || 900)
    );
    if (options && options.supportCondition === "simplySupported") {
      return simplySupported(section, length_mm, options);
    }
    const loadType = requestedLoadType === "tipPointLoad"
      ? "tipPointLoad"
      : "udl";
    const capacity = calculateWindpostCapacity(
      section,
      length_mm,
      loadType
    );
    if (!capacity.valid || !(Number(capacity.ultimateDesignValue) > 0)) {
      return Object.freeze({
        ok: false,
        section,
        length_mm,
        loadType,
        capacity,
        reason: capacity.governingCriteriaStatus ||
          "The windpost capacity could not be calculated."
      });
    }

    const finalCapacity_kN = Number(capacity.ultimateDesignValue);
    const height_m = length_mm / 1000;
    const moment_kNm = loadType === "tipPointLoad"
      ? finalCapacity_kN * height_m
      : finalCapacity_kN * height_m / 2;
    const baseplate = windpost.baseplateEngine.autoDesign({
      M_kNm: moment_kNm,
      W_kN: finalCapacity_kN,
      V_kN: finalCapacity_kN,
      H_m: height_m,
      B: 220
    });
    if (!baseplate.ok) {
      return Object.freeze({
        ok: false,
        section,
        length_mm,
        loadType,
        capacity,
        finalCapacity_kN,
        moment_kNm,
        reason: baseplate.reason ||
          "The cantilever baseplate design could not be completed."
      });
    }

    const drawingMode = options && options.mode === "lines"
      ? "lines"
      : "hatch";
    // The two post types sit on the plate differently: an L is built 90 mm into
    // the inner leaf and overhangs the plate by the rest of its depth, while a
    // U stands wholly in the cavity, clear of the leaf at both faces.
    const isU = section.type === "U";
    const drawingService = isU
      ? windpost.uBaseplateDrawing
      : windpost.baseplateDrawing;
    if (!drawingService) {
      return Object.freeze({
        ok: false, section, length_mm, loadType, capacity, finalCapacity_kN,
        moment_kNm,
        reason: `The ${section.type}-post baseplate drawing service is not loaded.`
      });
    }
    const drawing = drawingService.draw(baseplate.design, section);
    const uGeom = windpost.uBaseplateGeom || {};
    const leftPortion_mm = isU
      ? (uGeom.REAR_PROJECTION ?? 6) + Number(section.a_mm) + (uGeom.CLEAR ?? 6)
      : 6 + (Number(section.a_mm) - 90);
    const overallLength_mm =
      leftPortion_mm + Number(baseplate.design.plateLen);

    return Object.freeze({
      ok: true,
      source: `main-selector-cantilever-${section.type.toLowerCase()}-baseplate-pipeline`,
      supportCondition: "cantilever",
      postType: section.type,
      section,
      length_mm,
      height_m,
      loadType,
      capacity,
      finalCapacity_kN,
      moment_kNm,
      baseShear_kN: finalCapacity_kN,
      baseplate,
      design: Object.freeze({
        ...baseplate.design,
        leftPortion_mm,
        overallLength_mm
      }),
      drawingMode,
      svg: cadPrintSvg(drawing.svg, drawingMode),
      drawingWidth: drawing.width,
      drawingHeight: drawing.height,
      drawingViews: drawing.views
    });
  }

  windpost.lCantileverBaseplatePrototype = Object.freeze({
    calculateWindpostCapacity,
    cadPrintSvg,
    design
  });
})(typeof window !== "undefined" ? window : globalThis);
