(function initialiseDuSectionOrthographicService(global) {
  "use strict";
  // Orthographic views of a DU windpost: two identical rounded folded U
  // channels welded web to web. One channel's views (web and flange
  // elevations, flat blank with its fold width) come from the U service; this
  // service replaces the plan with the two-channel section and adds the FACE
  // ELEVATION — the 2 x b wide flange face seen from the cavity, with one
  // slot column per channel — which is the view the production sheet uses.
  const windpost = global.Windpost = global.Windpost || {};

  function number(value) {
    return Number(value).toFixed(2).replace(/\.?0+$/, "");
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function channelOf(section) {
    return Object.freeze({
      type: "U",
      name: section.name,
      a_mm: Number(section.a_mm),
      b_mm: Number(section.b_mm),
      t_mm: Number(section.t_mm),
      innerRadius_mm: Number.isFinite(Number(section.innerRadius_mm)) ? Number(section.innerRadius_mm) : 1.5 * Number(section.t_mm),
      outerRadius_mm: Number.isFinite(Number(section.outerRadius_mm)) ? Number(section.outerRadius_mm) : 2.5 * Number(section.t_mm)
    });
  }

  function pathFromPoints(points, mapPoint) {
    return points.map((point, index) => {
      const mapped = mapPoint(point);
      return `${index ? "L" : "M"} ${number(mapped[0])} ${number(mapped[1])}`;
    }).join(" ") + " Z";
  }

  function roundedSlotPath(slot, x, y, scale) {
    const w = slot.width_mm * scale, h = slot.depth_mm * scale, r = slot.cornerRadius_mm * scale;
    return [
      `M ${number(x + r)} ${number(y)}`, `H ${number(x + w - r)}`,
      `A ${number(r)} ${number(r)} 0 0 1 ${number(x + w)} ${number(y + r)}`, `V ${number(y + h - r)}`,
      `A ${number(r)} ${number(r)} 0 0 1 ${number(x + w - r)} ${number(y + h)}`, `H ${number(x + r)}`,
      `A ${number(r)} ${number(r)} 0 0 1 ${number(x)} ${number(y + h - r)}`, `V ${number(y + r)}`,
      `A ${number(r)} ${number(r)} 0 0 1 ${number(x + r)} ${number(y)}`, "Z"
    ].join(" ");
  }

  function dimensionHorizontal(x1, x2, dimensionY, label) {
    return `<g class="dimension">
        <line class="extension" x1="${number(x1)}" y1="${number(dimensionY - 10)}" x2="${number(x1)}" y2="${number(dimensionY + 2.5)}"/>
        <line class="extension" x1="${number(x2)}" y1="${number(dimensionY - 10)}" x2="${number(x2)}" y2="${number(dimensionY + 2.5)}"/>
        <line class="dimension-line" x1="${number(x1)}" y1="${number(dimensionY)}" x2="${number(x2)}" y2="${number(dimensionY)}"/>
        <text class="dimension-text" x="${number((x1 + x2) / 2)}" y="${number(dimensionY - 2.2)}" text-anchor="middle">${escapeXml(label)}</text>
      </g>`;
  }

  function dimensionVertical(y1, y2, objectX, dimensionX, label) {
    const direction = dimensionX < objectX ? -1 : 1;
    const textX = dimensionX + direction * -2.6;
    const mid = (y1 + y2) / 2;
    return `<g class="dimension">
        <line class="extension" x1="${number(objectX)}" y1="${number(y1)}" x2="${number(dimensionX + direction * 2.5)}" y2="${number(y1)}"/>
        <line class="extension" x1="${number(objectX)}" y1="${number(y2)}" x2="${number(dimensionX + direction * 2.5)}" y2="${number(y2)}"/>
        <line class="dimension-line" x1="${number(dimensionX)}" y1="${number(y1)}" x2="${number(dimensionX)}" y2="${number(y2)}"/>
        <text class="dimension-text" x="${number(textX)}" y="${number(mid)}" text-anchor="middle" transform="rotate(-90 ${number(textX)} ${number(mid)})">${escapeXml(label)}</text>
      </g>`;
  }

  // The U service's page layout constants, so the added view sits with the others.
  const PLAN_ORIGIN = Object.freeze({ x: 42, y: 63 });
  const ELEVATION_TOP = 88;
  const FACE_X = 110;

  function generate(section, requestedLength_mm, options) {
    const uService = windpost.uSectionOrthographic;
    if (!uService || !windpost.cavityWall3d || !windpost.cavityWall3d.foldedUProfile) {
      throw new Error("The U orthographic and folded-profile services must be loaded first.");
    }
    if (!section || section.type !== "DU") {
      throw new Error("Choose a DU windpost section.");
    }
    const channel = channelOf(section);
    const base = uService.generate(channel, requestedLength_mm, options);
    const profile = windpost.cavityWall3d.foldedUProfile(channel, 64);
    const s = base.sheetScale;
    const a = profile.a_mm, b = profile.b_mm, t = profile.t_mm;
    const length_mm = base.length_mm;

    // plan: the two channels, webs back to back on the plan's web line
    const mapUpper = ([rx, ry]) => [PLAN_ORIGIN.x + ry * s, PLAN_ORIGIN.y - rx * s];
    const mapLower = ([rx, ry]) => [PLAN_ORIGIN.x + ry * s, PLAN_ORIGIN.y + rx * s];
    const planPath = `${pathFromPoints(profile.points, mapUpper)} ${pathFromPoints(profile.points, mapLower)}`;
    const planGroup = `<g id="plan-view" data-view="plan" data-projection="top" data-channels="2">
        <text class="view-title" x="${number(PLAN_ORIGIN.x)}" y="18">PLAN / TOP VIEW</text>
        <path class="section-fill" d="${planPath}"/>
        <text class="section-size" x="${number(PLAN_ORIGIN.x + a * s / 2)}" y="${number(PLAN_ORIGIN.y + b * s + 5)}" text-anchor="middle">DU ${a} x ${2 * b} x ${t}</text>
      </g>`;

    // face elevation: both channels' flanges side by side, one slot column each
    const face = { x: FACE_X, y: ELEVATION_TOP, width: 2 * b * s, height: length_mm * s };
    const slot = base.slot;
    const placement = base.slotPlacement;
    const columns = [placement.flangeOffsetFromTip_mm, 2 * b - placement.flangeOffsetFromTip_mm];
    const slotPaths = columns.map((centre, column) =>
      placement.levels_mm.map((level, index) => {
        const left = face.x + centre * s - slot.width_mm * s / 2;
        const top = face.y + face.height - level * s - slot.depth_mm * s / 2;
        return `<path id="face-slot-${column + 1}-${index + 1}" class="slot-cutout" data-centre-from-base-mm="${number(level)}" d="${roundedSlotPath(slot, left, top, s)}"/>`;
      }).join("")
    ).join("");
    const faceGroup = `<g id="du-face-elevation" data-view="elevation" data-look-direction="flange-face" data-channels="2">
        <text class="view-title" x="${number(face.x)}" y="${number(face.y - 5)}">FACE ELEVATION</text>
        <rect class="elevation-fill" x="${number(face.x)}" y="${number(face.y)}" width="${number(face.width)}" height="${number(face.height)}"/>
        <line class="fold-tangent" x1="${number(face.x + b * s)}" y1="${number(face.y)}" x2="${number(face.x + b * s)}" y2="${number(face.y + face.height)}"/>
        <g id="face-slots" data-offset-from-tip-mm="${number(placement.flangeOffsetFromTip_mm)}" data-slot-count="${placement.levels_mm.length * 2}">${slotPaths}</g>
        ${dimensionVertical(face.y, face.y + face.height, face.x, face.x - 12, `${length_mm}`)}
        ${dimensionHorizontal(face.x, face.x + face.width, Math.min(281, face.y + face.height + 10), `${2 * b}`)}
      </g>`;

    let svg = base.svg
      .replace(/<g id="plan-view"[\s\S]*?<\/g>/, planGroup)
      .replace("U-WINDPOST SECTION — ORTHOGRAPHIC VIEWS", "DU-WINDPOST SECTION — ORTHOGRAPHIC VIEWS (TWO CHANNELS WELDED WEB TO WEB)")
      .replace("FLAT BLANK ELEVATION</text>", "FLAT BLANK ELEVATION (ONE OF TWO CHANNELS)</text>")
      .replace("orthographic section views</title>", "DU orthographic section views</title>");
    svg = svg.replace(/<\/svg>\s*$/, `${faceGroup}\n    </svg>`);

    const total = windpost.foldWidth ? windpost.foldWidth.describe(section) : null;
    const foldWidth = total
      ? Object.freeze({ ...total, perChannel_mm: base.foldWidth ? base.foldWidth.value_mm : null, channels: 2 })
      : base.foldWidth;

    return Object.freeze({
      ...base,
      svg,
      postType: "DU",
      sectionName: section.name,
      channel,
      faceWidth_mm: 2 * b,
      foldWidth,
      sheetViews: Object.freeze([
        Object.freeze({ id: "flat-blank-elevation", label: "ELEVATION OF BLANK (2 No.)" }),
        Object.freeze({ id: "du-face-elevation", label: "FACE ELEVATION" })
      ])
    });
  }

  windpost.duSectionOrthographic = Object.freeze({ generate, channelOf });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.duSectionOrthographic;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
