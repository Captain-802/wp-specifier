(function initialiseLSectionOrthographicService(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const PAGE = Object.freeze({ width_mm: 420, height_mm: 297 });
  const STANDARD_SCALES = Object.freeze([1, 2, 5, 10, 20, 25, 50, 100, 200]);
  const DEFAULT_K_FACTOR = 0.38;
  const SLOT_SPEC = Object.freeze({
    width_mm: 18,
    depth_mm: 50,
    cornerRadius_mm: 5
  });
  // EN 1993-1-8:2005 Table 3.3 — minimum end distance e1,min = 1.2·d0 toward a
  // free end. For the slotted tie hole d0 is taken as the slot width (= the M16
  // clearance hole). Applied as a hidden edge-distance check on the TOP slot:
  // if the clear steel from the top of the slot to the top of the section is
  // below e1,min, that top slot is dropped. Conservative datum (measured to the
  // slot end, not the end-radius centre). [factor to verify against project NA]
  const SLOT_MIN_END_DISTANCE_FACTOR = 1.2;

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

  // Dimension LABEL text — rounded to one decimal place (trailing .0 dropped).
  // Coordinates and data-* attributes keep full precision via number().
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
    if (
      ![a, b, thickness, kFactor].every(Number.isFinite) ||
      a <= innerRadius + thickness ||
      b <= innerRadius + thickness ||
      thickness <= 0 ||
      kFactor < 0 ||
      kFactor > 1
    ) {
      throw new Error("The selected L section has invalid flat-blank geometry.");
    }

    const longStraight_mm = a - innerRadius - thickness;
    const shortStraight_mm = b - innerRadius - thickness;
    const bendAllowance_mm =
      Math.PI / 2 * (innerRadius + kFactor * thickness);
    const blankLength_mm =
      longStraight_mm + bendAllowance_mm + shortStraight_mm;

    return Object.freeze({
      outsideLongLeg_mm: a,
      outsideShortLeg_mm: b,
      thickness_mm: thickness,
      innerRadius_mm: innerRadius,
      kFactor,
      bendAngle_deg: 90,
      longStraight_mm,
      shortStraight_mm,
      bendAllowance_mm,
      blankLength_mm,
      bendTangentStart_mm: longStraight_mm,
      bendCentre_mm: longStraight_mm + bendAllowance_mm / 2,
      bendTangentEnd_mm: longStraight_mm + bendAllowance_mm
    });
  }

  function createSlotGeometry(requestedSpec) {
    const source = requestedSpec || SLOT_SPEC;
    const width = Number(source.width_mm);
    const depth = Number(source.depth_mm);
    const radius = Number(source.cornerRadius_mm);
    if (
      ![width, depth, radius].every(Number.isFinite) ||
      width <= 0 ||
      depth <= 0 ||
      radius <= 0 ||
      radius * 2 > width ||
      radius * 2 > depth
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

  function calculateSlotPlacement(
    profile,
    length_mm,
    slot,
    requestedOffsetFromOuterEdge_mm,
    requestedFirstSlotFromBase_mm,
    requestedVerticalSpacing_mm
  ) {
    const halfWidth = slot.width_mm / 2;
    const minimumOffset = halfWidth;
    const maximumOffset =
      profile.a_mm - profile.outerRadius_mm - halfWidth;
    const requestedOffset = Number(requestedOffsetFromOuterEdge_mm);
    const offsetFromOuterEdge = Math.max(
      minimumOffset,
      Math.min(
        maximumOffset,
        Number.isFinite(requestedOffset) ? requestedOffset : 40
      )
    );
    const shortLegMaximumOffset =
      profile.b_mm - profile.outerRadius_mm - halfWidth;
    const shortLegOffsetFromTip = Math.max(
      minimumOffset,
      Math.min(shortLegMaximumOffset, 25)
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
    // Hidden edge-distance check on the top slot (EN 1993-1-8 Table 3.3).
    // Only the top slot can fail (edge distance shrinks as the slot rises), so
    // at most one slot is dropped.
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
      offsetFromOuterEdge_mm: offsetFromOuterEdge,
      minimumOffsetFromOuterEdge_mm: minimumOffset,
      maximumOffsetFromOuterEdge_mm: maximumOffset,
      centreFromFold_mm: profile.a_mm - offsetFromOuterEdge,
      centreFromMasonryEdge_mm: 90 - offsetFromOuterEdge,
      shortLegOffsetFromTip_mm: shortLegOffsetFromTip,
      shortLegCentreFromFold_mm:
        profile.b_mm - shortLegOffsetFromTip,
      firstCentreFromBase_mm,
      minimumFirstCentreFromBase_mm,
      maximumFirstCentreFromBase_mm,
      verticalSpacing_mm,
      minimumVerticalSpacing_mm,
      maximumVerticalSpacing_mm,
      levels_mm: Object.freeze(levels),
      minEndDistance_mm: minEndDistance_mm,
      topSlotEndDistance_mm: topSlotEndDistance_mm,
      topSlotSkipped: topSlotSkipped
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
    if (!windpost.cavityWall3d || !windpost.cavityWall3d.foldedLProfile) {
      throw new Error("The folded L-profile geometry service must be loaded first.");
    }

    const profile = windpost.cavityWall3d.foldedLProfile(section, 64);
    const drawingMode = options && options.mode === "lines" ? "lines" : "hatch";
    const sectionFill = drawingMode === "hatch"
      ? "url(#steel-section-hatch)"
      : "#fff";
    const length_mm = Math.max(300, Math.min(12000, Number(requestedLength_mm) || 900));
    // Fold width per the approved workbook (shared engine); the drawn blank
    // is the geometric development and agrees with it for every L section.
    const foldWidth = windpost.foldWidth ? windpost.foldWidth.describe(section) : null;
    const blank = calculateBlank(
      section,
      options && options.kFactor
    );
    const slot = createSlotGeometry(SLOT_SPEC);
    const slotPlacement = calculateSlotPlacement(
      profile,
      length_mm,
      slot,
      options && options.slotOffsetFromOuterEdge_mm,
      options && options.firstSlotFromBase_mm,
      options && options.slotVerticalSpacing_mm
    );
    const scaleDenominator = chooseScale(length_mm, 180);
    const sheetScale = 1 / scaleDenominator;
    const a = profile.a_mm;
    const b = profile.b_mm;
    const t = profile.t_mm;
    const ri = profile.innerRadius_mm;
    const ro = profile.outerRadius_mm;
    const elevationHeight = length_mm * sheetScale;

    const planOrigin = { x: 42, y: 63 };
    const elevationTop = 88;
    const longElevation = {
      x: planOrigin.x,
      y: elevationTop,
      width: a * sheetScale,
      height: elevationHeight
    };
    const shortElevation = {
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
      bendLineX: 270 + blank.bendCentre_mm * sheetScale
    };

    const mapPlan = ([rawX, rawY]) => [
      planOrigin.x + rawY * sheetScale,
      planOrigin.y - rawX * sheetScale
    ];
    const planPath = pathFromPoints(profile.points, mapPlan);
    const planLongStart = mapPlan([0, 0]);
    const planLongEnd = mapPlan([0, a]);
    const planShortEnd = mapPlan([b, 0]);
    const longProjectionCoordinates = [0, t, ro, a];
    const shortProjectionCoordinates = [0, t, ro, b];
    const constructionProjectors = [
      ...longProjectionCoordinates.map(rawY => {
        const x = planOrigin.x + rawY * sheetScale;
        return `<line data-source-y-mm="${number(rawY)}" x1="${number(x)}" y1="${number(planOrigin.y + 4)}" x2="${number(x)}" y2="${number(elevationTop + elevationHeight)}"/>`;
      }),
      ...shortProjectionCoordinates.map(rawX => {
        const sourceY = planOrigin.y - rawX * sheetScale;
        const targetX = shortElevation.x + rawX * sheetScale;
        return `<polyline data-source-x-mm="${number(rawX)}" points="${number(planOrigin.x - 4)},${number(sourceY)} ${number(shortElevation.x - 22)},${number(sourceY)} ${number(targetX)},${number(elevationTop)}"/>`;
      }),
      `<line class="mitre-transfer" x1="${number(shortElevation.x - 22)}" y1="${number(planOrigin.y - b * sheetScale - 4)}" x2="${number(shortElevation.x + b * sheetScale + 4)}" y2="${number(planOrigin.y + 22)}"/>`
    ].join("");

    const longFoldLines = [t, ro].map(rawY =>
      `<line class="fold-tangent" x1="${number(longElevation.x + rawY * sheetScale)}" y1="${number(longElevation.y)}" x2="${number(longElevation.x + rawY * sheetScale)}" y2="${number(longElevation.y + longElevation.height)}"/>`
    ).join("");
    const shortFoldLines = [t, ro].map(rawX =>
      `<line class="fold-tangent" x1="${number(shortElevation.x + rawX * sheetScale)}" y1="${number(shortElevation.y)}" x2="${number(shortElevation.x + rawX * sheetScale)}" y2="${number(shortElevation.y + shortElevation.height)}"/>`
    ).join("");
    const longLegSlotCentreX =
      longElevation.x + slotPlacement.centreFromFold_mm * sheetScale;
    const longLegSlotPaths = slotPlacement.levels_mm.map((level, index) => {
      const left =
        longLegSlotCentreX - slot.width_mm * sheetScale / 2;
      const centreY =
        longElevation.y + longElevation.height - level * sheetScale;
      const top = centreY - slot.depth_mm * sheetScale / 2;
      return `<path
        id="long-leg-slot-${index + 1}"
        class="slot-cutout"
        data-centre-from-base-mm="${number(level)}"
        d="${roundedSlotPath(slot, left, top, sheetScale)}"
      />`;
    }).join("");
    const shortLegSlotCentreX =
      shortElevation.x +
      slotPlacement.shortLegCentreFromFold_mm * sheetScale;
    const shortLegSlotPaths = slotPlacement.levels_mm.map((level, index) => {
      const left =
        shortLegSlotCentreX - slot.width_mm * sheetScale / 2;
      const centreY =
        shortElevation.y + shortElevation.height - level * sheetScale;
      const top = centreY - slot.depth_mm * sheetScale / 2;
      return `<path
        id="short-leg-slot-${index + 1}"
        class="slot-cutout"
        data-centre-from-base-mm="${number(level)}"
        d="${roundedSlotPath(slot, left, top, sheetScale)}"
      />`;
    }).join("");

    // Slots also appear on the developed flat blank, as two columns. The blank
    // runs long-leg tip (u=0) -> bend -> short-leg tip (u=blankLength); both
    // columns sit on the undistorted flat portions so the tip offsets develop
    // 1:1. Same `levels_mm`, so the edge-distance skip carries through.
    const blankSlotColumnPaths = (centreU_mm, idPrefix) => {
      const centreX = flatBlankElevation.x + centreU_mm * sheetScale;
      return slotPlacement.levels_mm.map((level, index) => {
        const left = centreX - slot.width_mm * sheetScale / 2;
        const centreY =
          flatBlankElevation.y + flatBlankElevation.height - level * sheetScale;
        const top = centreY - slot.depth_mm * sheetScale / 2;
        return `<path
        id="${idPrefix}-${index + 1}"
        class="slot-cutout"
        data-centre-from-base-mm="${number(level)}"
        d="${roundedSlotPath(slot, left, top, sheetScale)}"
      />`;
      }).join("");
    };
    const blankLongLegSlotPaths = blankSlotColumnPaths(
      slotPlacement.offsetFromOuterEdge_mm,
      "blank-long-slot"
    );
    const blankShortLegSlotU_mm =
      blank.blankLength_mm - slotPlacement.shortLegOffsetFromTip_mm;
    const blankShortLegSlotPaths = blankSlotColumnPaths(
      blankShortLegSlotU_mm,
      "blank-short-slot"
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
      <desc id="orthographic-description">A true-scale plan of the rounded folded L section, long-leg and short-leg elevations, and the calculated flat-blank elevation. All views use scale one to ${scaleDenominator}.</desc>
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
          .fold-width{font:700 2.6px Arial,sans-serif;fill:#000}
          .sheet-title{font:700 5px "Arial Narrow",Arial,sans-serif;fill:#000}
          .sheet-subtitle{font:3.2px "Arial Narrow",Arial,sans-serif;fill:#000}
          .dimension-line{stroke:#000;stroke-width:.25;marker-start:url(#orthographic-dimension-arrow);marker-end:url(#orthographic-dimension-arrow)}
          .extension{stroke:#000;stroke-width:.18}
          .dimension-text{font:3.2px "Arial Narrow",Arial,sans-serif;fill:#000;paint-order:stroke;stroke:#fff;stroke-width:2.2px;stroke-linejoin:round}
          .projection-lines{display:none!important;stroke:#6c93ab;stroke-width:.18;stroke-dasharray:2 1;fill:none}
        </style>
      </defs>
      <rect class="sheet-border" x="5" y="5" width="410" height="287" rx="1"/>

      <text class="sheet-title" x="220" y="18">L-WINDPOST SECTION — ORTHOGRAPHIC VIEWS</text>
      <text class="sheet-subtitle" x="220" y="24">${escapeXml(section.name)} · ALL VIEWS SCALE 1:${scaleDenominator} · DIMENSIONS IN mm</text>

      <g id="orthographic-construction-projectors" class="projection-lines" aria-hidden="true">
        ${constructionProjectors}
      </g>

      <g id="plan-view" data-view="plan" data-projection="top">
        <text class="view-title" x="${number(planOrigin.x)}" y="18">PLAN / TOP VIEW</text>
        <path class="section-fill" d="${planPath}"/>
        <text class="section-size" x="${number(planOrigin.x + a * sheetScale / 2)}" y="${number(planOrigin.y + 5)}" text-anchor="middle">${a} x ${b} x ${t}</text>
      </g>

      <g id="long-leg-elevation" data-view="elevation" data-look-direction="short-leg-axis">
        <text class="view-title" x="${number(longElevation.x)}" y="${number(longElevation.y - 5)}">LONG-LEG ELEVATION</text>
        <rect class="elevation-fill" x="${number(longElevation.x)}" y="${number(longElevation.y)}" width="${number(longElevation.width)}" height="${number(longElevation.height)}"/>
        ${longFoldLines}
        <g
          id="long-leg-slots"
          data-offset-from-outer-edge-mm="${number(slotPlacement.offsetFromOuterEdge_mm)}"
          data-centre-from-masonry-edge-mm="${number(slotPlacement.centreFromMasonryEdge_mm)}"
          data-vertical-spacing-mm="${slotPlacement.verticalSpacing_mm}"
          data-slot-count="${slotPlacement.levels_mm.length}"
          data-min-end-distance-mm="${number(slotPlacement.minEndDistance_mm)}"
          data-top-slot-skipped="${slotPlacement.topSlotSkipped}"
        >${longLegSlotPaths}</g>
        ${dimensionVertical(
          longElevation.y,
          longElevation.y + longElevation.height,
          longElevation.x,
          longElevation.x - 12,
          `${length_mm}`
        )}
        ${dimensionHorizontal(
          longElevation.x,
          longElevation.x + longElevation.width,
          longElevation.y + longElevation.height,
          Math.min(281, longElevation.y + longElevation.height + 10),
          `${a}`
        )}
      </g>

      <g id="short-leg-elevation" data-view="elevation" data-look-direction="long-leg-axis">
        <text class="view-title" x="${number(shortElevation.x)}" y="${number(shortElevation.y - 5)}">SHORT-LEG ELEVATION</text>
        <rect class="elevation-fill" x="${number(shortElevation.x)}" y="${number(shortElevation.y)}" width="${number(shortElevation.width)}" height="${number(shortElevation.height)}"/>
        ${shortFoldLines}
        <g
          id="short-leg-slots"
          data-offset-from-tip-mm="${number(slotPlacement.shortLegOffsetFromTip_mm)}"
          data-vertical-spacing-mm="${slotPlacement.verticalSpacing_mm}"
          data-slot-count="${slotPlacement.levels_mm.length}"
        >${shortLegSlotPaths}</g>
        ${dimensionVertical(
          shortElevation.y,
          shortElevation.y + shortElevation.height,
          shortElevation.x + shortElevation.width,
          shortElevation.x + shortElevation.width + 12,
          `${length_mm}`
        )}
        ${dimensionHorizontal(
          shortElevation.x,
          shortElevation.x + shortElevation.width,
          shortElevation.y + shortElevation.height,
          Math.min(281, shortElevation.y + shortElevation.height + 10),
          `${b}`
        )}
      </g>

      <g
        id="flat-blank-elevation"
        data-view="flat-blank"
        data-blank-length-mm="${number(blank.blankLength_mm)}"
        data-bend-centre-mm="${number(blank.bendCentre_mm)}"
        data-inner-radius-mm="${number(blank.innerRadius_mm)}"
        data-k-factor="${number(blank.kFactor)}"
      >
        <text class="view-title" x="${number(flatBlankElevation.x)}" y="${number(flatBlankElevation.y - 5)}">FLAT BLANK ELEVATION</text>
        <text class="fold-width" data-cad="text" x="${number(flatBlankElevation.x)}" y="${number(flatBlankElevation.y - 1.2)}">FOLD WIDTH ${foldWidth ? number(foldWidth.value_mm) : number(blank.blankLength_mm)} mm</text>
        <rect class="blank-fill" x="${number(flatBlankElevation.x)}" y="${number(flatBlankElevation.y)}" width="${number(flatBlankElevation.width)}" height="${number(flatBlankElevation.height)}"/>
        <line
          class="bend-line"
          x1="${number(flatBlankElevation.bendLineX)}"
          y1="${number(flatBlankElevation.y)}"
          x2="${number(flatBlankElevation.bendLineX)}"
          y2="${number(flatBlankElevation.y + flatBlankElevation.height)}"
        />
        <g
          id="blank-long-slots"
          data-slot-column="long-leg"
          data-centre-from-blank-start-mm="${number(slotPlacement.offsetFromOuterEdge_mm)}"
          data-slot-count="${slotPlacement.levels_mm.length}"
        >${blankLongLegSlotPaths}</g>
        <g
          id="blank-short-slots"
          data-slot-column="short-leg"
          data-centre-from-blank-start-mm="${number(blankShortLegSlotU_mm)}"
          data-slot-count="${slotPlacement.levels_mm.length}"
        >${blankShortLegSlotPaths}</g>
        ${blankSlotScheduleDimensions}
        ${dimensionHorizontal(
          flatBlankElevation.x,
          flatBlankElevation.bendLineX,
          flatBlankElevation.y + flatBlankElevation.height,
          Math.min(278, flatBlankElevation.y + flatBlankElevation.height + 6),
          `${dimText(blank.bendCentre_mm)}`
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
      postType: "L",
      sectionName: section.name,
      length_mm,
      scaleDenominator,
      drawingMode,
      profile,
      blank,
      foldWidth,
      slot,
      slotPlacement,
      // Zone views for the combined sheet, in left-to-right sheet order.
      sheetViews: Object.freeze([
        Object.freeze({ id: "flat-blank-elevation", label: "ELEVATION OF BLANK" }),
        Object.freeze({ id: "long-leg-elevation", label: "LONG LEG SIDE ELEVATION" }),
        // Off for now — flip enabled to true to bring it back on the sheet.
        Object.freeze({ id: "short-leg-elevation", label: "SHORT LEG SIDE ELEVATION", enabled: false })
      ]),
      views: Object.freeze({
        plan: Object.freeze({
          source: "foldedLProfile",
          width_mmOnSheet: a * sheetScale,
          depth_mmOnSheet: b * sheetScale
        }),
        longElevation: Object.freeze({
          actualWidth_mm: a,
          actualHeight_mm: length_mm,
          width_mmOnSheet: longElevation.width,
          height_mmOnSheet: longElevation.height,
          slotCount: slotPlacement.levels_mm.length,
          slotOffsetFromOuterEdge_mm:
            slotPlacement.offsetFromOuterEdge_mm,
          slotLevels_mm: slotPlacement.levels_mm
        }),
        shortElevation: Object.freeze({
          actualWidth_mm: b,
          actualHeight_mm: length_mm,
          width_mmOnSheet: shortElevation.width,
          height_mmOnSheet: shortElevation.height,
          slotCount: slotPlacement.levels_mm.length,
          slotOffsetFromTip_mm:
            slotPlacement.shortLegOffsetFromTip_mm,
          slotLevels_mm: slotPlacement.levels_mm
        }),
        flatBlankElevation: Object.freeze({
          actualWidth_mm: blank.blankLength_mm,
          actualHeight_mm: length_mm,
          width_mmOnSheet: flatBlankElevation.width,
          height_mmOnSheet: flatBlankElevation.height,
          bendLineOffset_mmOnSheet:
            blank.bendCentre_mm * sheetScale
        })
      })
    });
  }

  windpost.lSectionOrthographic = Object.freeze({
    PAGE,
    STANDARD_SCALES,
    DEFAULT_K_FACTOR,
    SLOT_SPEC,
    chooseScale,
    calculateBlank,
    createSlotGeometry,
    calculateSlotPlacement,
    roundedSlotPath,
    generate
  });
})(typeof window !== "undefined" ? window : globalThis);
