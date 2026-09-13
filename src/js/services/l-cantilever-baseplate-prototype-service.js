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
      tieStrength: windpost.designData
        ? windpost.designData.familyCapacity(section.type)
        : (windpost.config.DEFAULT_TIE_STRENGTH_KN[section.type] ??
          windpost.config.DEFAULT_TIE_STRENGTH_KN.L),
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

  function escapeXml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  // A fixing that has no standard detail drawn: the sheet's connection zones
  // carry a note naming the selected connection instead of a drawing of a
  // different one. Ids match the zones the sheet composer picks.
  function connectionNote(code, kind) {
    // The Detailing page carries the connection library but not the
    // selection engine, so read the row from either.
    const engine = windpost.connectionSelectionEngine;
    const library = windpost.connectionsDatabase && windpost.connectionsDatabase.connections;
    const row = engine && engine.findByCode
      ? engine.findByCode(code)
      : (Array.isArray(library) ? library.find(c => c.code === code) : null);
    const title = row && row.description ? String(row.description).trim() : "";
    const W = 420, H = 180;
    const text = (y, size, weight, value) =>
      `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="#111">${escapeXml(value)}</text>`;
    const block = (id, y0) => `<g id="${id}">` +
      text(y0, 12, 700, `${kind === "top" ? "TOP" : "BASE"} CONNECTION ${code}`) +
      (title ? text(y0 + 18, 10, 400, title.toUpperCase()) : "") +
      text(y0 + 36, 9, 400, "NO STANDARD DETAIL DRAWN - REFER TO THE CONNECTION LIBRARY") +
      `</g>`;
    return Object.freeze({
      code,
      title,
      width: W,
      height: H,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
        `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${block("bp-plan", 40)}${block("bp-side", 120)}</svg>`
    });
  }

  // The concrete-top plate (U-B3A/B, L-B2A/B) is drawn only when the Selector
  // handed over that base fixing; any other fixing has no drawn plate.
  const STANDARD_PLATE_CODE = /^(?:U-B3|L-B2)/i;
  function omitUnselectedPlate(result, options) {
    const baseCode = options && options.baseCode ? String(options.baseCode).trim() : "";
    if (!result || !result.ok || !baseCode || STANDARD_PLATE_CODE.test(baseCode)) return result;
    const note = connectionNote(baseCode, "base");
    return Object.freeze({
      ...result,
      omitted: true,
      omittedCode: baseCode,
      design: Object.freeze({ ...result.design, typeCode: baseCode, typeTitle: note.title }),
      svg: cadPrintSvg(note.svg, result.drawingMode),
      drawingWidth: note.width,
      drawingHeight: note.height,
      drawingViews: null
    });
  }

  // A DU post hangs on the slab FACES: DU-B2 at the bottom, DU-T2 at the top
  // (owner's detail sheets). Both drawings are returned; the base one in the
  // usual place, the head one as topSvg for the sheet's top-connection zone.
  // When the Selector handed over other fixings (?head=DU-T1&base=DU-B1) the
  // zones carry a note for those instead of a drawing of DU-T2 / DU-B2.
  function duSlabFace(section, length_mm, options) {
    const plates = windpost.duSlabFacePlates;
    const drawingService = windpost.duSlabFaceDrawing;
    if (!plates || !drawingService) {
      return Object.freeze({ ok: false, section, length_mm, reason: "The DU slab-face connection services are not loaded." });
    }
    const bottom = plates.geometryFor("DU-B2", section);
    const top = plates.geometryFor("DU-T2", section);
    const drawingMode = options && options.mode === "lines" ? "lines" : "hatch";
    const headCode = options && options.headCode ? String(options.headCode).trim() : "";
    const baseCode = options && options.baseCode ? String(options.baseCode).trim() : "";
    const drawBase = !baseCode || baseCode.toUpperCase() === "DU-B2";
    const drawHead = !headCode || headCode.toUpperCase() === "DU-T2";
    const baseNote = drawBase ? null : connectionNote(baseCode, "base");
    const headNote = drawHead ? null : connectionNote(headCode, "top");
    const base = drawBase ? drawingService.draw("DU-B2", section) : baseNote;
    const head = drawHead ? drawingService.draw("DU-T2", section) : headNote;
    return Object.freeze({
      ok: true,
      source: "du-slab-face",
      standard: true,
      connectionType: "du-slab-face",
      supportCondition: "simplySupported",
      postType: "DU",
      section,
      length_mm,
      results: Object.freeze({ pass: true, edgeDistances: Object.freeze({ slotEdge: bottom.slotEdge_mm }), minimumProvided: bottom.slotEdge_mm, minimumRequired: 25 }),
      design: Object.freeze({
        B: bottom.plateHeight_mm,
        tp: bottom.plateThickness_mm,
        plateLen: bottom.plateLength_mm,
        leftPortion_mm: 0,
        overallLength_mm: bottom.plateLength_mm,
        typeCode: drawBase ? bottom.code : baseCode,
        typeTitle: drawBase ? bottom.title : baseNote.title,
        holeDia: bottom.slotWidth_mm,
        boltDia: bottom.boltDiameter_mm,
        anchorName: "RGM 12",
        nRow: 1,
        nCol: 2,
        w: bottom.slotPitch_mm,
        facePlates: Object.freeze({ top, bottom })
      }),
      drawingMode,
      omitted: !drawBase,
      omittedTop: !drawHead,
      svg: cadPrintSvg(base.svg, drawingMode),
      topSvg: cadPrintSvg(head.svg, drawingMode),
      topTypeCode: drawHead ? top.code : headCode,
      drawingWidth: base.width,
      drawingHeight: base.height
    });
  }

  function design(section, requestedLength_mm, requestedLoadType, options) {
    if (!section || (section.type !== "L" && section.type !== "U" && section.type !== "DU")) {
      return Object.freeze({
        ok: false,
        reason: "Choose an L, U or DU windpost section."
      });
    }
    const length_mm = Math.max(
      300,
      Math.min(12000, Number(requestedLength_mm) || 900)
    );
    if (section.type === "DU") {
      return duSlabFace(section, length_mm, options);
    }
    if (options && options.supportCondition === "simplySupported") {
      return omitUnselectedPlate(simplySupported(section, length_mm, options), options);
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
      family: section && section.type
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
