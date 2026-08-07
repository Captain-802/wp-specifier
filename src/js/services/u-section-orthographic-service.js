(function initialiseUSectionOrthographicService(global) {
  "use strict";

  // Orthographic projection of a folded U (channel) windpost: plan, web and
  // flange elevations, and the developed flat blank.
  //
  // The U stands clear in the cavity and is tied back through slots punched in
  // BOTH flanges, so the blank carries two slot columns — one per flange —
  // where the L carries one per leg.  Conventions (page size, scales, slot
  // spec, K-factor, edge-distance rule, dimension style) are deliberately the
  // same as the L service so the two can share a sheet.
  const windpost = global.Windpost = global.Windpost || {};
  const PAGE = Object.freeze({ width_mm: 420, height_mm: 297 });
  const STANDARD_SCALES = Object.freeze([1, 2, 5, 10, 20, 25, 50, 100, 200]);
  const DEFAULT_K_FACTOR = 0.38;
  const SLOT_SPEC = Object.freeze({
    width_mm: 18,
    depth_mm: 50,
    cornerRadius_mm: 5
  });
  // EN 1993-1-8:2005 Table 3.3 — e1,min = 1.2·d0 toward a free end, d0 taken as
  // the slot width. Applied to the top slot only; see the L service.
  const SLOT_MIN_END_DISTANCE_FACTOR = 1.2;
  const DEFAULT_SLOT_OFFSET_FROM_TIP_MM = 25;

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function number(value) {
    return Number(value.toFixed(3));
  }

  function dimText(value) {
    return String(Number(Number(value).toFixed(1)));
  }

  function chooseScale(length_mm, maximumSheetLength_mm) {
    const length = Number(length_mm);
    const maximum = Number(maximumSheetLength_mm) || 180;
    if (!Number.isFinite(length) || length <= 0) {
      throw new Error("The displayed section length must be greater than zero.");
    }
    return STANDARD_SCALES.find(denominator => length / denominator <= maximum) ||
      Math.ceil(length / maximum / 100) * 100;
  }

  // Developed blank: flange tip -> bend -> web -> bend -> flange tip.  The web
  // loses a fold radius at BOTH ends, each flange one, and there are two bend
  // allowances rather than the L's one.
  function calculateBlank(section, requestedKFactor) {
    const a = Number(section && section.a_mm);
    const b = Number(section && section.b_mm);
    const thickness = Number(section && section.t_mm);
    const kFactor = Number.isFinite(Number(requestedKFactor))
      ? Number(requestedKFactor)
      : DEFAULT_K_FACTOR;
    const storedInnerRadius = Number(section && section.innerRadius_mm);
    const innerRadius = Number.isFinite(storedInnerRadius)
      ? storedInnerRadius
      : 1.5 * thickness;
    const outerRadius = innerRadius + thickness;
    if (
      ![a, b, thickness, kFactor].every(Number.isFinite) ||
      a <= 2 * outerRadius ||
      b <= outerRadius ||
      thickness <= 0 ||
      kFactor < 0 ||
      kFactor > 1
    ) {
      throw new Error("The selected U section has invalid flat-blank geometry.");
    }

    const flangeStraight_mm = b - outerRadius;
    const webStraight_mm = a - 2 * outerRadius;
    const bendAllowance_mm = Math.PI / 2 * (innerRadius + kFactor * thickness);
    const blankLength_mm =
      2 * flangeStraight_mm + 2 * bendAllowance_mm + webStraight_mm;

    return Object.freeze({
      outsideWeb_mm: a,
      outsideFlange_mm: b,
      thickness_mm: thickness,
      innerRadius_mm: innerRadius,
      outerRadius_mm: outerRadius,
      kFactor,
      bendAngle_deg: 90,
      bendCount: 2,
      flangeStraight_mm,
      webStraight_mm,
      bendAllowance_mm,
      blankLength_mm,
      firstBendCentre_mm: flangeStraight_mm + bendAllowance_mm / 2,
      secondBendCentre_mm:
        flangeStraight_mm + bendAllowance_mm + webStraight_mm +
        bendAllowance_mm / 2
    });
  }

  function createSlotGeometry(requestedSpec) {
    const source = requestedSpec || SLOT_SPEC;
    const width = Number(source.width_mm);
    const depth = Number(source.depth_mm);
    const radius = Number(source.cornerRadius_mm);
    if (
      ![width, depth, radius].every(Number.isFinite) ||
      width <= 0 || depth <= 0 || radius <= 0 ||
      radius * 2 > width || radius * 2 > depth
    ) {
      throw new Error("The slot dimensions or corner radius are invalid.");
    }
    return Object.freeze({
      width_mm: width,
      depth_mm: depth,
      cornerRadius_mm: radius,
      topAndBottomStraight_mm: width - 2 * radius,
      sideStraight_mm: depth - 2 * radius
    });
  }

  // Both flanges are free edges, so the slot centre is a FIXED 25 mm from the
  // flange tip on each of them — measured from the tip, never from the fold.
  // Not adjustable (unlike the L's long leg, which is built into the leaf); the
  // only movement is the clamp that keeps the slot on the flat if a flange is
  // ever too short to take 25.  Field names follow the L service so the page
  // controls and the 3D hand-off do not need to branch.
  function calculateSlotPlacement(
    profile,
    length_mm,
    slot,
    requestedFirstSlotFromBase_mm,
    requestedVerticalSpacing_mm
  ) {
    const halfWidth = slot.width_mm / 2;
    const minimumOffset = halfWidth;
    const maximumOffset = profile.b_mm - profile.outerRadius_mm - halfWidth;
    const offsetFromTip = Math.max(
      minimumOffset,
      Math.min(maximumOffset, DEFAULT_SLOT_OFFSET_FROM_TIP_MM)
    );
    const minEndDistance_mm = SLOT_MIN_END_DISTANCE_FACTOR * slot.width_mm;
    const minimumFirstCentreFromBase_mm = slot.depth_mm / 2;
    const maximumFirstCentreFromBase_mm = Math.max(
      minimumFirstCentreFromBase_mm,
      length_mm - slot.depth_mm / 2 - minEndDistance_mm
    );
    const requestedFirst = Number(requestedFirstSlotFromBase_mm);
    const firstCentreFromBase_mm = Math.max(
      minimumFirstCentreFromBase_mm,
      Math.min(
        maximumFirstCentreFromBase_mm,
        Number.isFinite(requestedFirst) ? requestedFirst : 225
      )
    );
    const minimumVerticalSpacing_mm = slot.depth_mm;
    const maximumVerticalSpacing_mm = Math.max(
      minimumVerticalSpacing_mm,
      length_mm
    );
    const requestedSpacing = Number(requestedVerticalSpacing_mm);
    const verticalSpacing_mm = Math.max(
      minimumVerticalSpacing_mm,
      Math.min(
        maximumVerticalSpacing_mm,
        Number.isFinite(requestedSpacing) ? requestedSpacing : 225
      )
    );
    const levels = [];
    for (
      let centre = firstCentreFromBase_mm;
      centre + slot.depth_mm / 2 <= length_mm;
      centre += verticalSpacing_mm
    ) {
      levels.push(centre);
    }
    let topSlotEndDistance_mm = null;
    let topSlotSkipped = false;
    if (levels.length) {
      const topCentre = levels[levels.length - 1];
      topSlotEndDistance_mm = length_mm - (topCentre + slot.depth_mm / 2);
      if (topSlotEndDistance_mm < minEndDistance_mm) {
        levels.pop();
        topSlotSkipped = true;
        topSlotEndDistance_mm = levels.length
          ? length_mm - (levels[levels.length - 1] + slot.depth_mm / 2)
          : null;
      }
    }
    return Object.freeze({
      width_mm: slot.width_mm,
      depth_mm: slot.depth_mm,
      cornerRadius_mm: slot.cornerRadius_mm,
      offsetFromOuterEdge_mm: offsetFromTip,
      minimumOffsetFromOuterEdge_mm: minimumOffset,
      maximumOffsetFromOuterEdge_mm: maximumOffset,
      flangeOffsetFromTip_mm: offsetFromTip,
      flangeCentreFromFold_mm: profile.b_mm - offsetFromTip,
      firstCentreFromBase_mm,
      minimumFirstCentreFromBase_mm,
      maximumFirstCentreFromBase_mm,
      verticalSpacing_mm,
      minimumVerticalSpacing_mm,
      maximumVerticalSpacing_mm,
      levels_mm: Object.freeze(levels),
      minEndDistance_mm,
      topSlotEndDistance_mm,
      topSlotSkipped
    });
  }

  function roundedSlotPath(slot, originX, originY, requestedScale) {
    const x = Number(originX);
    const y = Number(originY);
    const scale = Number(requestedScale) || 1;
    const w = slot.width_mm * scale;
    const h = slot.depth_mm * scale;
    const r = slot.cornerRadius_mm * scale;
    return [
      `M ${number(x + r)} ${number(y)}`,
      `H ${number(x + w - r)}`,
      `A ${number(r)} ${number(r)} 0 0 1 ${number(x + w)} ${number(y + r)}`,
      `V ${number(y + h - r)}`,
      `A ${number(r)} ${number(r)} 0 0 1 ${number(x + w - r)} ${number(y + h)}`,
      `H ${number(x + r)}`,
      `A ${number(r)} ${number(r)} 0 0 1 ${number(x)} ${number(y + h - r)}`,
      `V ${number(y + r)}`,
      `A ${number(r)} ${number(r)} 0 0 1 ${number(x + r)} ${number(y)}`,
      "Z"
    ].join(" ");
  }

  function pathFromPoints(points, mapPoint) {
    return points.map((point, index) => {
      const mapped = mapPoint(point);
      return `${index ? "L" : "M"} ${number(mapped[0])} ${number(mapped[1])}`;
    }).join(" ") + " Z";
  }

  function dimensionExtensionVertical(x, y1, y2, breakYs) {
    const gap = .8;
    const direction = y2 >= y1 ? 1 : -1;
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    const breaks = (Array.isArray(breakYs) ? breakYs : [])
      .map(Number)
      .filter(value => Number.isFinite(value) && value > lo + gap && value < hi - gap)
      .sort((a, b) => direction > 0 ? a - b : b - a);
    let cursor = y1;
    const commands = [];
    breaks.forEach(value => {
      commands.push(`M ${number(x)} ${number(cursor)} L ${number(x)} ${number(value - direction * gap)}`);
      cursor = value + direction * gap;
    });
    commands.push(`M ${number(x)} ${number(cursor)} L ${number(x)} ${number(y2)}`);
    return `<path class="extension" data-extension-break-count="${breaks.length}" d="${commands.join(" ")}"/>`;
  }

  function dimensionHorizontal(x1, x2, objectY, dimensionY, label, options) {
    const direction = dimensionY < objectY ? -1 : 1;
    const textY = dimensionY + direction * -2.2;
    const available = Math.abs(x2 - x1);
    const estimatedTextWidth = Math.max(5, String(label).length * 2);
    const placeOutside = available < estimatedTextWidth + 3;
    const textX = placeOutside
      ? Math.max(x1, x2) + 2.5
      : (x1 + x2) / 2;
    const extensionEnd = dimensionY + direction * 2.5;
    const breakYs = options && options.breakYs;
    return `
      <g class="dimension">
        ${dimensionExtensionVertical(x1, objectY, extensionEnd, breakYs)}
        ${dimensionExtensionVertical(x2, objectY, extensionEnd, breakYs)}
        <line class="dimension-line" x1="${number(x1)}" y1="${number(dimensionY)}" x2="${number(x2)}" y2="${number(dimensionY)}"/>
        <text class="dimension-text" data-text-placement="${placeOutside ? "outside" : "inside"}" x="${number(textX)}" y="${number(textY)}" text-anchor="${placeOutside ? "start" : "middle"}">${escapeXml(label)}</text>
      </g>`;
  }

  function dimensionVertical(y1, y2, objectX, dimensionX, label) {
    const direction = dimensionX < objectX ? -1 : 1;
    const textX = dimensionX + direction * -2.6;
    return `
      <g class="dimension">
        <line class="extension" x1="${number(objectX)}" y1="${number(y1)}" x2="${number(dimensionX + direction * 2.5)}" y2="${number(y1)}"/>
        <line class="extension" x1="${number(objectX)}" y1="${number(y2)}" x2="${number(dimensionX + direction * 2.5)}" y2="${number(y2)}"/>
        <line class="dimension-line" x1="${number(dimensionX)}" y1="${number(y1)}" x2="${number(dimensionX)}" y2="${number(y2)}"/>
        <text class="dimension-text" x="${number(textX)}" y="${number((y1 + y2) / 2)}" text-anchor="middle" transform="rotate(-90 ${number(textX)} ${number((y1 + y2) / 2)})">${escapeXml(label)}</text>
      </g>`;
  }

  function generate(section, requestedLength_mm, options) {
    if (!windpost.cavityWall3d || !windpost.cavityWall3d.foldedUProfile) {
      throw new Error("The folded U-profile geometry service must be loaded first.");
    }

    const profile = windpost.cavityWall3d.foldedUProfile(section, 64);
    const drawingMode = options && options.mode === "lines" ? "lines" : "hatch";
    const sectionFill = drawingMode === "hatch"
      ? "url(#steel-section-hatch)"
      : "#fff";
    const length_mm = Math.max(300, Math.min(12000, Number(requestedLength_mm) || 900));
    const blank = calculateBlank(section, options && options.kFactor);
    const slot = createSlotGeometry(SLOT_SPEC);
    const slotPlacement = calculateSlotPlacement(
      profile,
      length_mm,
      slot,
      options && options.firstSlotFromBase_mm,
      options && options.slotVerticalSpacing_mm
    );
    const scaleDenominator = chooseScale(length_mm, 180);
    const sheetScale = 1 / scaleDenominator;
    const a = profile.a_mm;
    const b = profile.b_mm;
    const t = profile.t_mm;
    const ro = profile.outerRadius_mm;
    const elevationHeight = length_mm * sheetScale;

    const planOrigin = { x: 42, y: 63 };
    const elevationTop = 88;
    // Web elevation sits under the plan (same width, a); the flange elevation
    // and the developed blank follow across the sheet.
    const webElevation = {
      x: planOrigin.x,
      y: elevationTop,
      width: a * sheetScale,
      height: elevationHeight
    };
    const flangeElevation = {
      x: 175,
      y: elevationTop,
      width: b * sheetScale,
      height: elevationHeight
    };
    const flatBlankElevation = {
      x: 270,
      y: elevationTop,
      width: blank.blankLength_mm * sheetScale,
      height: elevationHeight,
      firstBendX: 270 + blank.firstBendCentre_mm * sheetScale,
      secondBendX: 270 + blank.secondBendCentre_mm * sheetScale
    };

    const mapPlan = ([rawX, rawY]) => [
      planOrigin.x + rawY * sheetScale,
      planOrigin.y - rawX * sheetScale
    ];
    const planPath = pathFromPoints(profile.points, mapPlan);
    const planWebStart = mapPlan([0, 0]);
    const planWebEnd = mapPlan([0, a]);
    const planFlangeEnd = mapPlan([b, 0]);

    const constructionProjectors = [
      ...[0, t, ro, a - ro, a - t, a].map(rawY => {
        const x = planOrigin.x + rawY * sheetScale;
        return `<line data-source-y-mm="${number(rawY)}" x1="${number(x)}" y1="${number(planOrigin.y + 4)}" x2="${number(x)}" y2="${number(elevationTop + elevationHeight)}"/>`;
      }),
      ...[0, t, ro, b].map(rawX => {
        const sourceY = planOrigin.y - rawX * sheetScale;
        const targetX = flangeElevation.x + rawX * sheetScale;
        return `<polyline data-source-x-mm="${number(rawX)}" points="${number(planOrigin.x - 4)},${number(sourceY)} ${number(flangeElevation.x - 22)},${number(sourceY)} ${number(targetX)},${number(elevationTop)}"/>`;
      })
    ].join("");

    // On the web elevation both folds show; on the flange elevation the single
    // fold at the web end shows.
    const webFoldLines = [t, ro, a - ro, a - t].map(rawY =>
      `<line class="fold-tangent" x1="${number(webElevation.x + rawY * sheetScale)}" y1="${number(webElevation.y)}" x2="${number(webElevation.x + rawY * sheetScale)}" y2="${number(webElevation.y + webElevation.height)}"/>`
    ).join("");
    const flangeFoldLines = [t, ro].map(rawX =>
      `<line class="fold-tangent" x1="${number(flangeElevation.x + rawX * sheetScale)}" y1="${number(flangeElevation.y)}" x2="${number(flangeElevation.x + rawX * sheetScale)}" y2="${number(flangeElevation.y + flangeElevation.height)}"/>`
    ).join("");

    const slotColumn = (originX, centre_mm, idPrefix, top_y) =>
      slotPlacement.levels_mm.map((level, index) => {
        const left = originX + centre_mm * sheetScale - slot.width_mm * sheetScale / 2;
        const centreY = top_y + elevationHeight - level * sheetScale;
        const topEdge = centreY - slot.depth_mm * sheetScale / 2;
        return `<path
        id="${idPrefix}-${index + 1}"
        class="slot-cutout"
        data-centre-from-base-mm="${number(level)}"
        d="${roundedSlotPath(slot, left, topEdge, sheetScale)}"
      />`;
      }).join("");

    // Flange elevation: fold at the left edge, tip at the right.
    const flangeSlotPaths = slotColumn(
      flangeElevation.x,
      slotPlacement.flangeCentreFromFold_mm,
      "flange-slot",
      flangeElevation.y
    );
    // Blank: flange-1 tip (u=0) -> bend -> web -> bend -> flange-2 tip.  Both
    // columns sit on flat portions, so the tip offsets develop 1:1.
    const blankFirstFlangeSlotPaths = slotColumn(
      flatBlankElevation.x,
      slotPlacement.flangeOffsetFromTip_mm,
      "blank-flange-1-slot",
      flatBlankElevation.y
    );
    const blankSecondFlangeSlotPaths = slotColumn(
      flatBlankElevation.x,
      blank.blankLength_mm - slotPlacement.flangeOffsetFromTip_mm,
      "blank-flange-2-slot",
      flatBlankElevation.y
    );
    const blankSlotScheduleDimensions = (() => {
      if (!slotPlacement.levels_mm.length) return "";
      const right = flatBlankElevation.x + flatBlankElevation.width;
      const base = flatBlankElevation.y + flatBlankElevation.height;
      const dimensionX = right + 10;
      const firstLevel = slotPlacement.levels_mm[0];
      const firstY = base - firstLevel * sheetScale;
      let out = dimensionVertical(
        firstY,
        base,
        right,
        dimensionX,
        dimText(firstLevel)
      );
      if (slotPlacement.levels_mm.length > 1) {
        const secondLevel = slotPlacement.levels_mm[1];
        const secondY = base - secondLevel * sheetScale;
        out += dimensionVertical(
          secondY,
          firstY,
          right,
          dimensionX,
          dimText(secondLevel - firstLevel)
        );
      }
      return `<g class="slot-schedule-dimensions">${out}</g>`;
    })();

    const svg = `<svg
      xmlns="http://www.w3.org/2000/svg"
      width="${PAGE.width_mm}mm"
      height="${PAGE.height_mm}mm"
      viewBox="0 0 ${PAGE.width_mm} ${PAGE.height_mm}"
      role="img"
      aria-labelledby="orthographic-title orthographic-description"
      data-scale-denominator="${scaleDenominator}"
      data-section-length-mm="${number(length_mm)}"
      data-render-mode="${drawingMode}"
    >
      <title id="orthographic-title">${escapeXml(section.name)} orthographic section views</title>
      <desc id="orthographic-description">A true-scale plan of the rounded folded U section, web and flange elevations, and the calculated flat-blank elevation. All views use scale one to ${scaleDenominator}.</desc>
      <defs>
        <marker id="orthographic-dimension-arrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth">
          <path d="M 5 2.5 L 0 0 L 0 5 Z" fill="#000"/>
        </marker>
        <pattern id="steel-section-hatch" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)">
          <line x1="0" y1="-1" x2="0" y2="4" stroke="#000" stroke-width=".16"/>
        </pattern>
        <style>
          .sheet-border{fill:#fff;stroke:#000;stroke-width:.35}
          .section-fill{fill:${sectionFill};stroke:#000;stroke-width:.5;stroke-linejoin:round}
          .elevation-fill{fill:#fff;stroke:#000;stroke-width:.28}
          .blank-fill{fill:${sectionFill};stroke:#000;stroke-width:.5}
          .slot-cutout{fill:#fff;stroke:#000;stroke-width:.4;stroke-linejoin:round}
          .fold-tangent{stroke:#000;stroke-width:.25}
          .bend-line{stroke:#000;stroke-width:.25;stroke-dasharray:2 1}
          .section-size{font:700 3.6px "Arial Narrow",Arial,sans-serif;fill:#000}
          .view-title{font:700 4px "Arial Narrow",Arial,sans-serif;fill:#000;letter-spacing:.18px}
          .sheet-title{font:700 5px "Arial Narrow",Arial,sans-serif;fill:#000}
          .sheet-subtitle{font:3.2px "Arial Narrow",Arial,sans-serif;fill:#000}
          .dimension-line{stroke:#000;stroke-width:.25;marker-start:url(#orthographic-dimension-arrow);marker-end:url(#orthographic-dimension-arrow)}
          .extension{stroke:#000;stroke-width:.18}
          .dimension-text{font:3.2px "Arial Narrow",Arial,sans-serif;fill:#000;paint-order:stroke;stroke:#fff;stroke-width:2.2px;stroke-linejoin:round}
          .projection-lines{display:none!important;stroke:#6c93ab;stroke-width:.18;stroke-dasharray:2 1;fill:none}
        </style>
      </defs>
      <rect class="sheet-border" x="5" y="5" width="410" height="287" rx="1"/>

      <text class="sheet-title" x="220" y="18">U-WINDPOST SECTION — ORTHOGRAPHIC VIEWS</text>
      <text class="sheet-subtitle" x="220" y="24">${escapeXml(section.name)} · ALL VIEWS SCALE 1:${scaleDenominator} · DIMENSIONS IN mm</text>

      <g id="orthographic-construction-projectors" class="projection-lines" aria-hidden="true">
        ${constructionProjectors}
      </g>

      <g id="plan-view" data-view="plan" data-projection="top">
        <text class="view-title" x="${number(planOrigin.x)}" y="18">PLAN / TOP VIEW</text>
        <path class="section-fill" d="${planPath}"/>
        <text class="section-size" x="${number(planOrigin.x + a * sheetScale / 2)}" y="${number(planOrigin.y + 5)}" text-anchor="middle">${a} x ${b} x ${t}</text>
      </g>

      <g id="web-elevation" data-view="elevation" data-look-direction="web-face">
        <text class="view-title" x="${number(webElevation.x)}" y="${number(webElevation.y - 5)}">WEB ELEVATION</text>
        <rect class="elevation-fill" x="${number(webElevation.x)}" y="${number(webElevation.y)}" width="${number(webElevation.width)}" height="${number(webElevation.height)}"/>
        ${webFoldLines}
        ${dimensionVertical(
          webElevation.y,
          webElevation.y + webElevation.height,
          webElevation.x,
          webElevation.x - 12,
          `${length_mm}`
        )}
        ${dimensionHorizontal(
          webElevation.x,
          webElevation.x + webElevation.width,
          webElevation.y + webElevation.height,
          Math.min(281, webElevation.y + webElevation.height + 10),
          `${a}`
        )}
      </g>

      <g id="flange-elevation" data-view="elevation" data-look-direction="flange-face">
        <text class="view-title" x="${number(flangeElevation.x)}" y="${number(flangeElevation.y - 5)}">FLANGE ELEVATION</text>
        <rect class="elevation-fill" x="${number(flangeElevation.x)}" y="${number(flangeElevation.y)}" width="${number(flangeElevation.width)}" height="${number(flangeElevation.height)}"/>
        ${flangeFoldLines}
        <g
          id="flange-slots"
          data-offset-from-tip-mm="${number(slotPlacement.flangeOffsetFromTip_mm)}"
          data-vertical-spacing-mm="${slotPlacement.verticalSpacing_mm}"
          data-slot-count="${slotPlacement.levels_mm.length}"
          data-min-end-distance-mm="${number(slotPlacement.minEndDistance_mm)}"
          data-top-slot-skipped="${slotPlacement.topSlotSkipped}"
        >${flangeSlotPaths}</g>
        ${dimensionVertical(
          flangeElevation.y,
          flangeElevation.y + flangeElevation.height,
          flangeElevation.x + flangeElevation.width,
          flangeElevation.x + flangeElevation.width + 12,
          `${length_mm}`
        )}
        ${dimensionHorizontal(
          flangeElevation.x,
          flangeElevation.x + flangeElevation.width,
          flangeElevation.y + flangeElevation.height,
          Math.min(281, flangeElevation.y + flangeElevation.height + 10),
          `${b}`
        )}
      </g>

      <g
        id="flat-blank-elevation"
        data-view="flat-blank"
        data-blank-length-mm="${number(blank.blankLength_mm)}"
        data-first-bend-centre-mm="${number(blank.firstBendCentre_mm)}"
        data-second-bend-centre-mm="${number(blank.secondBendCentre_mm)}"
        data-inner-radius-mm="${number(blank.innerRadius_mm)}"
        data-k-factor="${number(blank.kFactor)}"
      >
        <text class="view-title" x="${number(flatBlankElevation.x)}" y="${number(flatBlankElevation.y - 5)}">FLAT BLANK ELEVATION</text>
        <rect class="blank-fill" x="${number(flatBlankElevation.x)}" y="${number(flatBlankElevation.y)}" width="${number(flatBlankElevation.width)}" height="${number(flatBlankElevation.height)}"/>
        <line
          class="bend-line"
          x1="${number(flatBlankElevation.firstBendX)}"
          y1="${number(flatBlankElevation.y)}"
          x2="${number(flatBlankElevation.firstBendX)}"
          y2="${number(flatBlankElevation.y + flatBlankElevation.height)}"
        />
        <line
          class="bend-line"
          x1="${number(flatBlankElevation.secondBendX)}"
          y1="${number(flatBlankElevation.y)}"
          x2="${number(flatBlankElevation.secondBendX)}"
          y2="${number(flatBlankElevation.y + flatBlankElevation.height)}"
        />
        <g
          id="blank-flange-1-slots"
          data-slot-column="flange-1"
          data-centre-from-blank-start-mm="${number(slotPlacement.flangeOffsetFromTip_mm)}"
          data-slot-count="${slotPlacement.levels_mm.length}"
        >${blankFirstFlangeSlotPaths}</g>
        <g
          id="blank-flange-2-slots"
          data-slot-column="flange-2"
          data-centre-from-blank-start-mm="${number(blank.blankLength_mm - slotPlacement.flangeOffsetFromTip_mm)}"
          data-slot-count="${slotPlacement.levels_mm.length}"
        >${blankSecondFlangeSlotPaths}</g>
        ${blankSlotScheduleDimensions}
        ${dimensionHorizontal(
          flatBlankElevation.x,
          flatBlankElevation.firstBendX,
          flatBlankElevation.y + flatBlankElevation.height,
          Math.min(278, flatBlankElevation.y + flatBlankElevation.height + 6),
          `${dimText(blank.firstBendCentre_mm)}`
        )}
        ${dimensionHorizontal(
          flatBlankElevation.x,
          flatBlankElevation.x + flatBlankElevation.width,
          flatBlankElevation.y + flatBlankElevation.height,
          Math.min(285, flatBlankElevation.y + flatBlankElevation.height + 13),
          `${dimText(blank.blankLength_mm)}`,
          {
            breakYs: [
              Math.min(278, flatBlankElevation.y + flatBlankElevation.height + 6)
            ]
          }
        )}
      </g>
    </svg>`;

    return Object.freeze({
      svg,
      page: PAGE,
      postType: "U",
      sectionName: section.name,
      scaleDenominator,
      sheetScale,
      length_mm,
      blank,
      slot,
      slotPlacement,
      // Zone views for the combined sheet, in left-to-right sheet order.
      sheetViews: Object.freeze([
        Object.freeze({ id: "flat-blank-elevation", label: "ELEVATION OF BLANK" }),
        Object.freeze({ id: "web-elevation", label: "WEB ELEVATION" }),
        // Off for now — flip enabled to true to bring it back on the sheet.
        Object.freeze({ id: "flange-elevation", label: "FLANGE ELEVATION", enabled: false })
      ])
    });
  }

  windpost.uSectionOrthographic = Object.freeze({
    PAGE, SLOT_SPEC, DEFAULT_K_FACTOR,
    calculateBlank, calculateSlotPlacement, generate
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.uSectionOrthographic;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
