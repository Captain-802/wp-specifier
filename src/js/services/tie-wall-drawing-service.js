(function initialiseTieWallDrawingService(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function number(value) {
    const rounded = Math.round(Number(value) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function dimensionVertical(x, y1, y2, objectX, label) {
    const middle = (y1 + y2) / 2;
    return `
      <path class="extension" d="M ${objectX} ${y1} H ${x - 4} M ${objectX} ${y2} H ${x - 4}"/>
      <path class="dimension" d="M ${x} ${y1} V ${y2}"/>
      <path class="tick" d="M ${x - 5} ${y1 + 5} L ${x + 5} ${y1 - 5} M ${x - 5} ${y2 + 5} L ${x + 5} ${y2 - 5}"/>
      <text class="dim-text" x="${x - 9}" y="${middle}" transform="rotate(-90 ${x - 9} ${middle})">${label}</text>`;
  }

  function masonryElevation(model, layer, x, y, width, height, photo) {
    const zone = model[layer];
    const material = zone.material;
    const scaleX = width / model.wallLength_mm;
    const scaleY = height / model.wallHeight_mm;
    const units = model.units.filter(item => item.layer === layer);
    const rectangles = units.map(item => {
      const px = x + item.x_mm * scaleX;
      const py =
        y + height - (item.z_mm + item.height_mm) * scaleY;
      return `<rect class="${layer}-unit" x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${(item.length_mm * scaleX).toFixed(2)}" height="${(item.height_mm * scaleY).toFixed(2)}"/>`;
    }).join("");
    return `
      <g aria-label="${zone.label.toLowerCase()} elevation">
        <text class="view-title" x="${x}" y="${y - 16}">${zone.label} ELEVATION</text>
        <rect class="elevation-mortar ${layer}-elevation-mortar" x="${x}" y="${y}" width="${width}" height="${height}"/>
        <rect class="view-frame" x="${x}" y="${y}" width="${width}" height="${height}"/>
        <g class="${photo ? (layer === "outer" ? "photo-brick-layer" : "photo-block-layer") : ""}">${rectangles}</g>
        <text class="note" x="${x}" y="${y + height + 24}">${material.label.toUpperCase()} · ${number(material.unitLength_mm)} × ${number(material.unitHeight_mm)} · ${number(material.mortar_mm)} mm JOINTS</text>
      </g>`;
  }

  function fullHeightConnectionElevation(model, x, y, width, height, photo) {
    const elevationHeight = model.elevation.height_mm;
    const scaleX = width / model.totalThickness_mm;
    const scaleZ = height / elevationHeight;
    const innerWidth = model.inner.thickness_mm * scaleX;
    const cavityWidth = model.cavity.thickness_mm * scaleX;
    const outerWidth = model.outer.thickness_mm * scaleX;
    const innerEnd = x + innerWidth;
    const outerStart = innerEnd + cavityWidth;
    const end = outerStart + outerWidth;
    const innerMaterial = model.inner.material;
    const outerMaterial = model.outer.material;
    const innerCourses = Math.ceil(
      elevationHeight / innerMaterial.course_mm
    );
    const outerCourses = Math.ceil(
      elevationHeight / outerMaterial.course_mm
    );
    // An L runs out of the inner leaf face; a U starts its 6 mm clear of it.
    const postFaceX =
      innerEnd + (model.connection.innerClearance_mm || 0) * scaleX;
    const postFaceWidth =
      (model.connection.cavityProjection_mm -
        (model.connection.innerClearance_mm || 0)) * scaleX;
    const postFoldX = postFaceX + postFaceWidth;
    const innerTieEnd =
      x + model.inner.thickness_mm * .5 * scaleX;
    const outerTieEnd = Math.min(
      end,
      outerStart +
      Math.max(0, model.connection.edcTie.outerEmbedment_mm) * scaleX
    );
    const tieThickness = Math.max(
      2.5,
      model.connection.edcTie.thickness_mm * scaleZ
    );

    const innerUnits = Array.from(
      { length: innerCourses },
      (_, course) => {
        const z = course * innerMaterial.course_mm;
        const unitHeight = Math.min(
          innerMaterial.unitHeight_mm,
          elevationHeight - z
        );
        if (unitHeight <= 0) return "";
        const unitY =
          y + height - (z + unitHeight) * scaleZ;
        return `<rect class="inner-plan-unit" x="${x.toFixed(2)}" y="${unitY.toFixed(2)}" width="${innerWidth.toFixed(2)}" height="${(unitHeight * scaleZ).toFixed(2)}"/>`;
      }
    ).join("");
    const outerUnits = Array.from(
      { length: outerCourses },
      (_, course) => {
        const z = course * outerMaterial.course_mm;
        const unitHeight = Math.min(
          outerMaterial.unitHeight_mm,
          elevationHeight - z
        );
        if (unitHeight <= 0) return "";
        const unitY =
          y + height - (z + unitHeight) * scaleZ;
        return `<rect class="outer-plan-unit" x="${outerStart.toFixed(2)}" y="${unitY.toFixed(2)}" width="${outerWidth.toFixed(2)}" height="${(unitHeight * scaleZ).toFixed(2)}"/>`;
      }
    ).join("");
    const ties = model.elevation.tieLevels_mm.map((level) => {
      const tieY = y + height - level * scaleZ;
      return `<g aria-label="paired inner and outer ties at ${level} mm">
        <rect class="side-shear-tie embedded-tie" data-tie-segment="inner-embedded" x="${innerTieEnd.toFixed(2)}" y="${(tieY - tieThickness / 2).toFixed(2)}" width="${Math.max(3, innerEnd - innerTieEnd).toFixed(2)}" height="${tieThickness.toFixed(2)}"/>
        <rect class="side-edc-tie exposed-tie" data-tie-segment="outer-cavity" x="${postFoldX.toFixed(2)}" y="${(tieY - tieThickness / 2).toFixed(2)}" width="${Math.max(3, outerStart - postFoldX).toFixed(2)}" height="${tieThickness.toFixed(2)}"/>
        <rect class="side-edc-tie embedded-tie" data-tie-segment="outer-embedded" data-embedment-mm="${number(model.connection.edcTie.outerEmbedment_mm)}" x="${outerStart.toFixed(2)}" y="${(tieY - tieThickness / 2).toFixed(2)}" width="${Math.max(3, outerTieEnd - outerStart).toFixed(2)}" height="${tieThickness.toFixed(2)}"/>
        <circle class="tie-node" cx="${innerTieEnd.toFixed(2)}" cy="${tieY.toFixed(2)}" r="2.2"/>
        <circle class="tie-node" cx="${postFoldX.toFixed(2)}" cy="${tieY.toFixed(2)}" r="2.2"/>
      </g>`;
    }).join("");
    const baseThickness = Math.max(7, 8 * scaleZ);
    const baseY = y + height - baseThickness;
    const baseStart = x - 22;
    const baseEnd = Math.min(
      outerStart - 10,
      postFoldX + Math.max(24, cavityWidth * .25)
    );
    const baseWidth = baseEnd - baseStart;
    const postCutDepth = Math.max(5, Math.min(9, postFaceWidth * .28));

    return `<g aria-label="full-height cavity wall connection elevation">
      <text class="view-title" x="${x}" y="${y - 16}">VERTICAL CAVITY-WALL SECTION / ELEVATION</text>
      <rect class="inner-elevation-mortar" x="${x}" y="${y}" width="${innerWidth}" height="${height}"/>
      <g class="${photo ? "photo-block-layer" : ""}">${innerUnits}</g>
      <rect class="cavity-fill" x="${innerEnd}" y="${y}" width="${cavityWidth}" height="${height}"/>
      <rect class="outer-elevation-mortar" x="${outerStart}" y="${y}" width="${outerWidth}" height="${height}"/>
      <g class="${photo ? "photo-brick-layer" : ""}">${outerUnits}</g>
      <rect class="view-frame" x="${x}" y="${y}" width="${width}" height="${height}"/>
      ${ties}
      <rect class="vertical-windpost" data-leg="long" data-long-leg-mm="${number(model.connection.section.a_mm)}" data-embedded-mm="${number(model.connection.innerLeafEmbedment_mm)}" data-visible-long-leg-mm="${number(model.connection.cavityProjection_mm)}" aria-label="${model.connection.section.name} exposed long-leg elevation" x="${postFaceX.toFixed(2)}" y="${y}" width="${postFaceWidth.toFixed(2)}" height="${(baseY - y).toFixed(2)}"/>
      <rect class="post-cut-end" data-component="windpost-cut-end" aria-label="hatched cut end of L windpost" x="${postFaceX.toFixed(2)}" y="${y}" width="${postFaceWidth.toFixed(2)}" height="${postCutDepth.toFixed(2)}" fill="url(#postEndHatch)"/>
      <rect class="windpost-base" data-component="baseplate" aria-label="windpost baseplate" x="${baseStart.toFixed(2)}" y="${baseY.toFixed(2)}" width="${baseWidth.toFixed(2)}" height="${baseThickness.toFixed(2)}"/>
      <text class="note" x="${x}" y="${y + height + 27}">${number(elevationHeight)} mm HIGH · PAIRED INNER / ${model.connection.edcTie.name} OUTER TIES @ 225 mm c/c</text>
    </g>`;
  }

  function planMasonry(model, layer, x, y, width, depth, mode) {
    const material = model[layer].material;
    const scale = width / model.wallLength_mm;
    const isOuter = layer === "outer";
    const moduleLength = material.unitLength_mm + material.mortar_mm;
    const count = Math.max(
      1,
      Math.floor(
        (model.wallLength_mm + material.mortar_mm) / moduleLength
      )
    );
    const runLength =
      count * material.unitLength_mm +
      (count - 1) * material.mortar_mm;
    const start = (model.wallLength_mm - runLength) / 2;
    return Array.from({ length: count }, (_, index) => {
      const unitX = x +
        (start + index * moduleLength) * scale;
      const unitWidth = material.unitLength_mm * scale;
      const body = `<rect class="${layer}-plan-unit" x="${unitX.toFixed(2)}" y="${y.toFixed(2)}" width="${unitWidth.toFixed(2)}" height="${depth.toFixed(2)}"/>`;
      if (!isOuter || mode === "lines") return body;
      const radius = Math.min(12, depth * .17);
      const holes = [0.25, 0.5, 0.75].map(portion =>
        `<circle class="brick-core" cx="${(unitX + unitWidth * portion).toFixed(2)}" cy="${(y + depth / 2).toFixed(2)}" r="${radius.toFixed(2)}"/>`
      ).join("");
      return `<g data-plan-unit="${layer}-${index}">${body}${holes}</g>`;
    }).join("");
  }

  function planMortarJoints(model, layer, x, y, width, depth, mode) {
    const material = model[layer].material;
    const scale = width / model.wallLength_mm;
    const moduleLength = material.unitLength_mm + material.mortar_mm;
    const count = Math.max(
      1,
      Math.floor(
        (model.wallLength_mm + material.mortar_mm) / moduleLength
      )
    );
    const runLength =
      count * material.unitLength_mm +
      (count - 1) * material.mortar_mm;
    const start = (model.wallLength_mm - runLength) / 2;
    const fill = mode === "hatch"
      ? layer === "outer" ? "#aaa69f" : "#8e8d88"
      : "#ffffff";
    return Array.from({ length: Math.max(0, count - 1) }, (_, index) => {
      const jointStart =
        start +
        (index + 1) * material.unitLength_mm +
        index * material.mortar_mm;
      const jointX = x + jointStart * scale;
      const jointWidth = material.mortar_mm * scale;
      return `<g aria-label="${material.mortar_mm} mm ${layer} leaf mortar joint">
        <rect class="mortar-joint ${layer}-mortar" x="${jointX.toFixed(2)}" y="${y.toFixed(2)}" width="${jointWidth.toFixed(2)}" height="${depth.toFixed(2)}" fill="${fill}"/>
        <path class="mortar-edge ${layer}-mortar-edge" d="M ${jointX.toFixed(2)} ${y.toFixed(2)} V ${(y + depth).toFixed(2)} M ${(jointX + jointWidth).toFixed(2)} ${y.toFixed(2)} V ${(y + depth).toFixed(2)}"/>
      </g>`;
    }).join("");
  }

  function shearTiePlan(model, cx, cy, scaleX, scaleY) {
    const tie = model.connection.shearTie;
    const left = cx - tie.halfLength_mm * scaleX;
    const width = tie.overallLength_mm * scaleX;
    const height = Math.max(7, tie.width_mm * scaleY);
    const slots = [];
    [-1, 1].forEach(direction => {
      tie.slotCentresFromEnd_mm.forEach(fromEnd => {
        const slotCx =
          cx + direction * (tie.halfLength_mm - fromEnd) * scaleX;
        slots.push(
          `<rect class="tie-hole" x="${(slotCx - tie.slotLength_mm * scaleX / 2).toFixed(2)}" y="${(cy - tie.slotWidth_mm * scaleY / 2).toFixed(2)}" width="${(tie.slotLength_mm * scaleX).toFixed(2)}" height="${Math.max(4, tie.slotWidth_mm * scaleY).toFixed(2)}" rx="${Math.max(2, tie.slotRadius_mm * scaleY).toFixed(2)}"/>`
        );
      });
    });
    return `<g aria-label="${tie.overallLength_mm} × ${tie.width_mm} × ${tie.thickness_mm} SHEAR TIE">
      <rect class="shear-tie" x="${left.toFixed(2)}" y="${(cy - height / 2).toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${(height / 2).toFixed(2)}"/>
      ${slots.join("")}
    </g>`;
  }

  // A U post is tied back to the inner leaf with a short U tie rather than the
  // L's full-length shear tie: it reaches from just clear of the post web into
  // the inner leaf only.
  function uTiePlan(model, cx, innerFaceY, scaleX, scaleY) {
    const tie = model.connection.uTie;
    if (!tie) return "";
    const height = Math.max(7, tie.width_mm * scaleY);
    const embedment = Math.min(
      tie.innerEmbedment_mm,
      model.inner.thickness_mm
    );
    const startY = innerFaceY - embedment * scaleY;
    const endY = innerFaceY +
      (tie.overallLength_mm - embedment) * scaleY;
    const width = Math.max(7, tie.width_mm * scaleX);
    return `<g aria-label="${number(tie.overallLength_mm)} mm U tie">
      <rect class="shear-tie" x="${(cx - width / 2).toFixed(2)}"
        y="${startY.toFixed(2)}" width="${width.toFixed(2)}"
        height="${(endY - startY).toFixed(2)}"
        rx="${(width / 2).toFixed(2)}"/>
    </g>`;
  }

  // The U channel in plan. Its depth runs across the cavity and its flanges
  // run along the wall, so the stored profile's axes are swapped into the
  // plan's. The same profile builder the U baseplate plan uses, so the two
  // drawings can never disagree about the shape.
  function uWindpostPlan(model, cx, innerY, cavityY, scaleX, scaleY) {
    const connection = model.connection;
    const section = connection.section;
    const geom = windpost.uBaseplateGeom;
    const depth = Number(connection.postDepth_mm) || Number(section.a_mm) || 0;
    const backY = cavityY + (connection.innerClearance_mm || 0) * scaleY;
    const frontY = backY + depth * scaleY;
    if (!geom || typeof geom.postProfile !== "function") {
      return {
        startY: backY,
        foldY: frontY,
        endX: cx + (Number(section.b_mm) || 0) * scaleX / 2,
        thickness: Math.max(5, section.t_mm * scaleY),
        svg: `<rect class="windpost" x="${(cx - (section.b_mm || 0) * scaleX / 2).toFixed(2)}"
          y="${backY.toFixed(2)}" width="${((section.b_mm || 0) * scaleX).toFixed(2)}"
          height="${(frontY - backY).toFixed(2)}" fill="none" stroke-width="2"/>`
      };
    }
    // profile x = depth (back → front), profile y = flange width across.
    const profile = geom.postProfile(
      depth,
      Number(section.b_mm),
      Number(section.t_mm),
      Number(section.innerRadius_mm),
      0,
      depth
    );
    const points = profile.map(([alongDepth, acrossWall]) =>
      `${(cx + acrossWall * scaleX).toFixed(2)} ` +
      `${(backY + alongDepth * scaleY).toFixed(2)}`
    ).join(" L ");
    return {
      startY: backY,
      foldY: frontY,
      endX: cx + Number(section.b_mm) * scaleX / 2,
      thickness: Math.max(1, Number(section.t_mm) * scaleY),
      svg: `<path class="windpost" aria-label="${section.name} U windpost"
        d="M ${points} Z" fill="none" stroke-width="1.6"/>`
    };
  }

  function lWindpostPlan(model, cx, innerY, cavityY, scaleX, scaleY) {
    const connection = model.connection;
    const section = connection.section;
    const startY =
      innerY + connection.longLegStartFromInnerFace_mm * scaleY;
    const foldY =
      cavityY + connection.cavityProjection_mm * scaleY;
    const thickness = Math.max(5, section.t_mm * scaleY);
    const radius = Math.max(
      thickness,
      Number(section.innerRadius_mm || 1.5 * section.t_mm) * scaleY
    );
    const endX = cx + section.b_mm * scaleX;
    const path = [
      `M ${cx.toFixed(2)} ${startY.toFixed(2)}`,
      `L ${cx.toFixed(2)} ${(foldY - radius).toFixed(2)}`,
      `Q ${cx.toFixed(2)} ${foldY.toFixed(2)} ${(cx + radius).toFixed(2)} ${foldY.toFixed(2)}`,
      `L ${endX.toFixed(2)} ${foldY.toFixed(2)}`
    ].join(" ");
    return {
      startY,
      foldY,
      endX,
      thickness,
      svg: `<path class="windpost" aria-label="${section.name} L windpost" d="${path}" stroke-width="${thickness.toFixed(2)}"/>`
    };
  }

  function edcTiePlan(model, x, foldY, outerY, scaleX, scaleY) {
    const tie = model.connection.edcTie;
    const profile = tie.profile ||
      (windpost.tieProfiles && windpost.tieProfiles.get(tie.name));
    const geometry =
      profile &&
      windpost.tiePrototypeGeometry &&
      windpost.tiePrototypeGeometry.build(profile);
    const endY =
      outerY + Math.max(0, tie.outerEmbedment_mm) * scaleY;
    const outline = geometry
      ? geometry.meshOutline.map(point => {
          const px =
            x + (point[1] - geometry.width_mm / 2) * scaleX;
          const py =
            foldY + (geometry.notchStart_mm - point[0]) * scaleY;
          return `${px.toFixed(2)} ${py.toFixed(2)}`;
        }).join(" L ")
      : [
          `${(x - tie.width_mm * scaleX / 2).toFixed(2)} ${(foldY - tie.engagement_mm * scaleY).toFixed(2)}`,
          `${(x + tie.width_mm * scaleX / 2).toFixed(2)} ${(foldY - tie.engagement_mm * scaleY).toFixed(2)}`,
          `${(x + tie.width_mm * scaleX / 2).toFixed(2)} ${endY.toFixed(2)}`,
          `${(x - tie.width_mm * scaleX / 2).toFixed(2)} ${endY.toFixed(2)}`
        ].join(" L ");
    const slots = tie.nominalSlots.centresFromFreeEnd_mm.map(
      fromEnd => {
        const centreY = endY - fromEnd * scaleY;
        const slotWidth = tie.nominalSlots.width_mm * scaleX;
        const slotHeight = tie.nominalSlots.length_mm * scaleY;
        const radius = tie.nominalSlots.radius_mm *
          Math.min(scaleX, scaleY);
        return `<rect class="tie-hole edc-slot" x="${(x - slotWidth / 2).toFixed(2)}" y="${(centreY - slotHeight / 2).toFixed(2)}" width="${slotWidth.toFixed(2)}" height="${slotHeight.toFixed(2)}" rx="${radius.toFixed(2)}"/>`;
      }
    ).join("");
    return `<g aria-label="${tie.name} outer-leaf tie">
      <path class="edc-tie edc-engagement-profile" data-notched-head="true" data-engagement-mm="${number(tie.engagementNotchLength_mm)}" data-tail-mm="${number(tie.tailBeyondNotch_mm)}" d="M ${outline} Z"/>
      ${slots}
    </g>`;
  }

  // Photo mode: the materials are lit and textured with SVG filters
  // (turbulence height maps under a distant light, multiplied into the base
  // colour, with an inner edge shade), so the cavity-wall plan reads like the
  // manufacturer's product renders and still travels inside an <image>.
  const PHOTO_CSS = `
      .mortar-bed{stroke:#5c5852;stroke-width:1;fill:#b4aea3;filter:url(#photoMortar)}
      .mortar-joint{stroke:none;filter:none}
      .inner-mortar{fill:#a49f97!important;stroke:none}
      .outer-mortar{fill:#b6b0a5!important}
      .mortar-edge,.inner-mortar-edge{stroke:rgba(0,0,0,.22);stroke-width:.8}
      .elevation-mortar{filter:url(#photoMortar)}
      .outer-elevation-mortar{fill:#b6b0a5}
      .inner-elevation-mortar{fill:#a49f97}
      .outer-plan-unit{fill:url(#photoBrickBase);stroke:#3a1d16;stroke-width:.9;filter:none}
      .inner-plan-unit{fill:url(#photoBlockBase);stroke:#4a4f52;stroke-width:.9;filter:none}
      .photo-brick-layer{filter:url(#photoBrick)}
      .photo-block-layer{filter:url(#photoBlock)}
      .brick-core{fill:url(#photoCore);stroke:#1c1210;stroke-width:1}
      .cavity-fill{fill:#f5f4f1;stroke:#c9cfd3;stroke-width:.8;stroke-dasharray:none}
      .windpost{stroke:url(#photoSteel);filter:url(#photoShadow)}
      .shear-tie,.edc-tie{fill:url(#photoSteel);stroke:#4f5c64;stroke-width:.8;filter:url(#photoShadow)}
      .edc-hook{stroke:#6b7780}
      .tie-hole{fill:#2b2f33;stroke:#15181a;stroke-width:.6}
      .side-windpost,.vertical-windpost,.windpost-base,.side-post-edge{fill:url(#photoSteelV);stroke:#4f5c64;stroke-width:.9;filter:url(#photoShadow);opacity:1}
      .side-shear-tie,.side-edc-tie{fill:url(#photoSteelV);stroke:#4f5c64;stroke-width:.8}
      .side-post-slot{fill:#2b2f33;stroke:#15181a}
      .outer-unit{fill:url(#photoBrickBase);stroke:#3a1d16;stroke-width:.8}
      .inner-unit{fill:url(#photoBlockBase);stroke:#4a4f52;stroke-width:.8}
      .view-frame{stroke:#2b2f33;stroke-width:1.2}
  `;

  const PHOTO_DEFS = `
        <linearGradient id="photoBrickBase" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#bb5b3f"/>
          <stop offset=".5" stop-color="#a7452d"/>
          <stop offset="1" stop-color="#c4684c"/>
        </linearGradient>
        <linearGradient id="photoBlockBase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d6d5cf"/>
          <stop offset="1" stop-color="#bfbeb8"/>
        </linearGradient>
        <radialGradient id="photoCore" cx=".45" cy=".4" r=".72">
          <stop offset="0" stop-color="#141111"/>
          <stop offset=".68" stop-color="#1c1615"/>
          <stop offset="1" stop-color="#4a2a22"/>
        </radialGradient>
        <linearGradient id="photoSteel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#eaedef"/>
          <stop offset=".3" stop-color="#b3bbc2"/>
          <stop offset=".55" stop-color="#f3f5f6"/>
          <stop offset=".8" stop-color="#a5aeb6"/>
          <stop offset="1" stop-color="#d8dde1"/>
        </linearGradient>
        <linearGradient id="photoSteelV" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#eaedef"/>
          <stop offset=".3" stop-color="#b3bbc2"/>
          <stop offset=".55" stop-color="#f3f5f6"/>
          <stop offset=".8" stop-color="#a5aeb6"/>
          <stop offset="1" stop-color="#d8dde1"/>
        </linearGradient>
        <filter id="photoShadow" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
          <feDropShadow dx="2.5" dy="3" stdDeviation="2.4" flood-color="#000" flood-opacity=".38"/>
        </filter>
        <filter id="photoBrick" x="-2%" y="-3%" width="104%" height="106%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".42 .42" numOctaves="4" seed="19" result="grain"/>
          <feDiffuseLighting in="grain" surfaceScale="1.4" diffuseConstant="1.08" lighting-color="#fff" result="lit">
            <feDistantLight azimuth="130" elevation="58"/>
          </feDiffuseLighting>
          <feComposite in="lit" in2="SourceAlpha" operator="in" result="litClip"/>
          <feBlend in="SourceGraphic" in2="litClip" mode="multiply" result="rough"/>
          <feTurbulence type="fractalNoise" baseFrequency=".03 .16" numOctaves="3" seed="3" result="mottle"/>
          <feColorMatrix in="mottle" type="matrix" values="0 0 0 0 .62  0 0 0 0 .33  0 0 0 0 .24  0 0 0 .55 0" result="mottleTone"/>
          <feComposite in="mottleTone" in2="SourceAlpha" operator="in" result="mottleClip"/>
          <feBlend in="rough" in2="mottleClip" mode="soft-light" result="toned"/>
          <feComposite in="toned" in2="SourceAlpha" operator="in"/>
        
        </filter>
        <filter id="photoBlock" x="-2%" y="-3%" width="104%" height="106%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="5" seed="23" result="grain"/>
          <feDiffuseLighting in="grain" surfaceScale="3.4" diffuseConstant="1.12" lighting-color="#fff" result="lit">
            <feDistantLight azimuth="130" elevation="55"/>
          </feDiffuseLighting>
          <feComposite in="lit" in2="SourceAlpha" operator="in" result="litClip"/>
          <feBlend in="SourceGraphic" in2="litClip" mode="multiply" result="rough"/>
          <feTurbulence type="turbulence" baseFrequency=".48" numOctaves="2" seed="7" result="poreNoise"/>
          <feColorMatrix in="poreNoise" type="matrix" values="0 0 0 0 .25  0 0 0 0 .25  0 0 0 0 .24  0 0 0 2.6 -1.7" result="pores"/>
          <feComposite in="pores" in2="SourceAlpha" operator="in" result="poreClip"/>
          <feBlend in="rough" in2="poreClip" mode="multiply" result="pored"/>
          <feComposite in="pored" in2="SourceAlpha" operator="in"/>
        
        </filter>
        <filter id="photoMortar" x="-2%" y="-3%" width="104%" height="106%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="47" result="grain"/>
          <feDiffuseLighting in="grain" surfaceScale="1.3" diffuseConstant="1" lighting-color="#fff" result="lit">
            <feDistantLight azimuth="130" elevation="60"/>
          </feDiffuseLighting>
          <feComposite in="lit" in2="SourceAlpha" operator="in" result="litClip"/>
          <feBlend in="SourceGraphic" in2="litClip" mode="multiply" result="rough"/>
          <feComposite in="rough" in2="SourceAlpha" operator="in"/>
        </filter>
  `;

  function draw(model, options) {
    const requested = options && options.mode;
    const photo = requested === "photo";
    const mode = requested === "lines" ? "lines" : "hatch";
    const useCanvas =
      mode === "hatch" && !photo &&
      Boolean(options && options.canvasMasonry);
    const width = 1280;
    const height = 1200;
    const planX = 245;
    const planY = 100;
    const planWidth = 820;
    const planScaleX = planWidth / model.wallLength_mm;
    const planScaleY = .92;
    const innerDepth = model.inner.thickness_mm * planScaleY;
    const cavityDepth = model.cavity.thickness_mm * planScaleY;
    const outerDepth = model.outer.thickness_mm * planScaleY;
    const innerY = planY;
    const cavityY = innerY + innerDepth;
    const outerY = cavityY + cavityDepth;
    const endY = outerY + outerDepth;
    const dimensionX = 205;
    const totalDimensionX = 150;

    const elevationY = Math.max(470, endY + 102);
    const elevationHeight = 215;
    const elevationWidth = elevationHeight *
      model.wallLength_mm / model.wallHeight_mm;

    const css = `
      .outline,.view-frame{stroke:#101820;stroke-width:1.5;fill:none}
      .dimension,.extension,.tick{stroke:#364753;stroke-width:1;fill:none}
      .extension{stroke:#82919d}
      .datum{stroke:#d44b3f;stroke-width:1.2;stroke-dasharray:7 5}
      .datum-text{font-size:12px;fill:#b13b31}
      .cavity-fill{fill:#fff;stroke:#168a91;stroke-width:1.2;stroke-dasharray:8 5}
      .mortar-bed{stroke:#454b4e;stroke-width:1}
      .mortar-joint{stroke:#696d6d;stroke-width:.8;${mode === "hatch" && !useCanvas ? "filter:url(#mortarRough)" : ""}}
      .inner-mortar{fill:${mode === "hatch" ? "#716e68" : "#fff"}!important;stroke:#474743;stroke-width:1.4}
      .outer-mortar{fill:${mode === "hatch" ? "#a7a198" : "#fff"}!important}
      .mortar-edge{fill:none;stroke:#666560;stroke-width:1}
      .inner-mortar-edge{stroke:#3f403d;stroke-width:1.5}
      .elevation-mortar{stroke:none;${mode === "hatch" && !useCanvas ? "filter:url(#mortarRough)" : ""}}
      .outer-elevation-mortar{fill:${useCanvas ? "none" : mode === "hatch" ? "#aaa69f" : "#fff"}}
      .inner-elevation-mortar{fill:${useCanvas ? "none" : mode === "hatch" ? "#8e8d88" : "#fff"}}
      .outer-plan-unit{fill:${useCanvas ? "none" : mode === "hatch" ? "url(#brickBase)" : "url(#lineBrickHatch)"};stroke:#3d241d;stroke-width:1.2;${mode === "hatch" && !useCanvas ? "filter:url(#brickRough)" : ""}}
      .inner-plan-unit{fill:${useCanvas ? "none" : mode === "hatch" ? "url(#blockBase)" : "url(#lineBlockHatch)"};stroke:#353c40;stroke-width:1.2;${mode === "hatch" && !useCanvas ? "filter:url(#blockRough)" : ""}}
      .brick-core{fill:${mode === "hatch" ? "url(#brickCore)" : "#fff"};stroke:#4b2f29;stroke-width:1.2}
      .windpost{fill:none;stroke:#778791;stroke-linecap:butt;stroke-linejoin:round}
      .shear-tie{fill:#8da8b2;stroke:#314d59;stroke-width:1.2}
      .edc-tie{fill:#9eb5bd;stroke:#314d59;stroke-width:1.2}
      .edc-hook{fill:none;stroke:#314d59;stroke-width:1.2}
      .tie-hole{fill:#fff;stroke:#314d59;stroke-width:.9}
      .side-windpost{fill:#aebac2;stroke:#263746;stroke-width:1.2;opacity:.92}
      .side-post-edge{fill:#71818c;stroke:#263746;stroke-width:1}
      .side-post-slot{fill:#fff;stroke:#263746;stroke-width:1}
      .side-shear-tie{fill:#6f95a3;stroke:#314d59;stroke-width:1}
      .side-edc-tie{fill:#9eb5bd;stroke:#314d59;stroke-width:1}
      .embedded-tie{opacity:.86;stroke-dasharray:5 3}
      .exposed-tie{opacity:1}
      .vertical-windpost{fill:#8999a4;stroke:#263746;stroke-width:1.2}
      .windpost-base{fill:#697985;stroke:#263746;stroke-width:1.2}
      .tie-node{fill:#314d59;stroke:#fff;stroke-width:.7}
      .tie-level{fill:none;stroke:#2f6e78;stroke-width:.8;stroke-dasharray:5 4}
      .outer-unit{fill:${useCanvas ? "none" : mode === "hatch" ? "#bd674c" : "url(#lineBrickHatch)"};stroke:#202b32;stroke-width:.75}
      .inner-unit{fill:${useCanvas ? "none" : mode === "hatch" ? "#c9cbc7" : "url(#lineBlockHatch)"};stroke:#202b32;stroke-width:.75}
      text{font-family:Arial,Helvetica,sans-serif;fill:#101820}
      .sheet-title{font-size:23px;font-weight:700}
      .view-title{font-size:15px;font-weight:700;letter-spacing:.5px}
      .layer-label{font-size:15px;font-weight:700;text-anchor:middle;dominant-baseline:middle}
      .dim-text{font-size:14px;text-anchor:middle;dominant-baseline:middle}
      .note{font-size:12px;font-weight:600}
    `;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Dimensioned cavity wall setup" data-render-mode="${photo ? "photo" : mode}" data-render-engine="${useCanvas ? "canvas+svg" : "svg"}">
      <defs>${photo ? PHOTO_DEFS : ""}
        <pattern id="brickHatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="16" stroke="#c56c52" stroke-width="2"/>
        </pattern>
        <pattern id="blockHatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="18" stroke="#aeb3b0" stroke-width="1.5"/>
        </pattern>
        <pattern id="lineBrickHatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="9" stroke="#62534d" stroke-width=".75"/>
        </pattern>
        <pattern id="lineBlockHatch" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="11" stroke="#59646a" stroke-width=".75"/>
        </pattern>
        <pattern id="postEndHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="#d7dfe4"/>
          <line x1="0" y1="0" x2="0" y2="5" stroke="#263746" stroke-width=".8"/>
        </pattern>
        <linearGradient id="brickBase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#aa4f35"/>
          <stop offset=".24" stop-color="#c06749"/>
          <stop offset=".53" stop-color="#a54831"/>
          <stop offset=".78" stop-color="#bf6547"/>
          <stop offset="1" stop-color="#94402d"/>
        </linearGradient>
        <linearGradient id="blockBase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c7c6c0"/>
          <stop offset=".45" stop-color="#b7b6b0"/>
          <stop offset=".72" stop-color="#cdccc6"/>
          <stop offset="1" stop-color="#aaa9a4"/>
        </linearGradient>
        <radialGradient id="brickCore" cx=".42" cy=".36" r=".72">
          <stop offset="0" stop-color="#111416"/>
          <stop offset=".62" stop-color="#1b1717"/>
          <stop offset=".86" stop-color="#31201e"/>
          <stop offset="1" stop-color="#63362e"/>
        </radialGradient>
        <filter id="brickRough" x="-3%" y="-8%" width="106%" height="116%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".035 .28" numOctaves="4" seed="37" result="brickNoise"/>
          <feColorMatrix in="brickNoise" type="matrix" values="
            .58 0 0 0 .12
            0 .34 0 0 .05
            0 0 .26 0 .02
            0 0 0 .58 0" result="brickGrain"/>
          <feBlend in="SourceGraphic" in2="brickGrain" mode="multiply" result="brickMottle"/>
          <feTurbulence type="fractalNoise" baseFrequency=".12 .75" numOctaves="2" seed="11" result="fineBrick"/>
          <feComposite in="fineBrick" in2="SourceAlpha" operator="in" result="clippedBrick"/>
          <feBlend in="brickMottle" in2="clippedBrick" mode="soft-light"/>
        </filter>
        <filter id="blockRough" x="-3%" y="-8%" width="106%" height="116%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".22" numOctaves="5" seed="23" result="aggregate"/>
          <feColorMatrix in="aggregate" type="matrix" values="
            .50 0 0 0 .25
            0 .49 0 0 .24
            0 0 .46 0 .22
            0 0 0 .72 0" result="aggregateTone"/>
          <feBlend in="SourceGraphic" in2="aggregateTone" mode="multiply" result="roughBlock"/>
          <feTurbulence type="turbulence" baseFrequency=".48" numOctaves="2" seed="61" result="fineAggregate"/>
          <feComposite in="fineAggregate" in2="SourceAlpha" operator="in" result="clippedAggregate"/>
          <feBlend in="roughBlock" in2="clippedAggregate" mode="screen"/>
        </filter>
        <filter id="mortarRough" x="-10%" y="-4%" width="120%" height="108%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".28" numOctaves="3" seed="47" result="mortarNoise"/>
          <feColorMatrix in="mortarNoise" type="matrix" values="
            .28 0 0 0 .43
            0 .28 0 0 .42
            0 0 .27 0 .40
            0 0 0 .46 0" result="mortarTone"/>
          <feBlend in="SourceGraphic" in2="mortarTone" mode="multiply"/>
        </filter>
      </defs>
      <style>${css}${photo ? PHOTO_CSS : ""}</style>
      <rect width="${width}" height="${height}" fill="${useCanvas ? "none" : "#fff"}"/>
      <text class="sheet-title" x="54" y="46">CAVITY WALL SETUP</text>
      <text class="view-title" x="${planX}" y="${planY - 22}">PLAN AT PAIRED TIE LEVEL</text>
      <text class="note" x="${planX + 360}" y="${planY - 22}">INNER LEAF · ${number(model.cavity.thickness_mm)} CLEAR CAVITY · OUTER LEAF</text>
      <rect class="mortar-bed" data-canvas-mortar="block" x="${planX}" y="${innerY}" width="${planWidth}" height="${innerDepth}" fill="${useCanvas ? "none" : mode === "hatch" ? "#858681" : "#fff"}"/>
      <g class="${photo ? "photo-block-layer" : ""}">${planMasonry(model, "inner", planX, innerY, planWidth, innerDepth, mode)}</g>
      ${planMortarJoints(model, "inner", planX, innerY, planWidth, innerDepth, mode)}
      <rect class="cavity-fill" x="${planX}" y="${cavityY}" width="${planWidth}" height="${cavityDepth}"/>
      <rect class="mortar-bed" data-canvas-mortar="brick" x="${planX}" y="${outerY}" width="${planWidth}" height="${outerDepth}" fill="${useCanvas ? "none" : mode === "hatch" ? "#a29d95" : "#fff"}"/>
      <g class="${photo ? "photo-brick-layer" : ""}">${planMasonry(model, "outer", planX, outerY, planWidth, outerDepth, mode)}</g>
      ${planMortarJoints(model, "outer", planX, outerY, planWidth, outerDepth, mode)}
      ${(() => {
        const isU = model.connection.postType === "U";
        const cx = planX + planWidth / 2;
        const post = (isU ? uWindpostPlan : lWindpostPlan)(
          model,
          cx,
          innerY,
          cavityY,
          planScaleX,
          planScaleY
        );
        // The L is tied to the inner leaf by a shear tie crossing the leaf; a
        // U is held back by a short U tie reaching from the post web.
        const innerTie = isU
          ? uTiePlan(model, cx, cavityY, planScaleX, planScaleY)
          : shearTiePlan(model, cx, innerY + innerDepth / 2,
            planScaleX, planScaleY);
        // The outer tie leaves the post at its cavity-side face: the fold for
        // an L, the front flange face for a U.
        const edcX = isU
          ? cx
          : cx + (model.connection.section.b_mm -
            model.connection.section.t_mm) * planScaleX / 2;
        return `${innerTie}
          ${edcTiePlan(model, edcX, post.foldY, outerY, planScaleX, planScaleY)}
          ${post.svg}`;
      })()}
      <path class="datum" d="M ${planX - 16} ${endY} H ${planX + planWidth + 16}"/>
      <text class="datum-text" x="${planX + planWidth + 22}" y="${endY + 4}">EXTERNAL FACE DATUM · y = 0</text>
      ${dimensionVertical(dimensionX, innerY, cavityY, planX, number(model.inner.thickness_mm))}
      ${dimensionVertical(dimensionX, cavityY, outerY, planX, number(model.cavity.thickness_mm))}
      ${dimensionVertical(dimensionX, outerY, endY, planX, number(model.outer.thickness_mm))}
      ${dimensionVertical(totalDimensionX, innerY, endY, planX, number(model.totalThickness_mm))}
      ${masonryElevation(model, "outer", 95, elevationY, elevationWidth, elevationHeight, photo)}
      ${fullHeightConnectionElevation(model, 760, elevationY, 250, 650, photo)}
    </svg>`;

    return {
      svg,
      model,
      mode: photo ? "photo" : mode
    };
  }

  windpost.tieWallDrawing = Object.freeze({ draw });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.tieWallDrawing;
  }
})(typeof window !== "undefined" ? window : globalThis);
