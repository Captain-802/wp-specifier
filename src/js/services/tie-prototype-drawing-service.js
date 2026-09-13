(function initialiseTiePrototypeDrawing(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const geometryEngine = windpost.tiePrototypeGeometry;

  const n = value => Number(value.toFixed(3));

  function dimH(x1, x2, y, extensionY, label) {
    const mid = (x1 + x2) / 2;
    return `<g class="dimension">
      <path d="M ${n(x1)} ${n(extensionY)}V${n(y + 4)}M${n(x2)} ${n(extensionY)}V${n(y + 4)}"/>
      <path d="M${n(x1)} ${n(y)}H${n(x2)}" marker-start="url(#tieArrow)" marker-end="url(#tieArrow)"/>
      <rect class="text-mask" x="${n(mid - 9)}" y="${n(y - 5.2)}" width="18" height="7"/>
      <text x="${n(mid)}" y="${n(y - 0.8)}">${label}</text>
    </g>`;
  }

  function dimV(y1, y2, x, extensionX, label) {
    const mid = (y1 + y2) / 2;
    return `<g class="dimension">
      <path d="M${n(extensionX)} ${n(y1)}H${n(x - 4)}M${n(extensionX)} ${n(y2)}H${n(x - 4)}"/>
      <path d="M${n(x)} ${n(y1)}V${n(y2)}" marker-start="url(#tieArrow)" marker-end="url(#tieArrow)"/>
      <rect class="text-mask" x="${n(x - 5)}" y="${n(mid - 9)}" width="7" height="18"/>
      <text transform="translate(${n(x - 0.8)} ${n(mid)}) rotate(-90)">${label}</text>
    </g>`;
  }

  function drawShear(profile, options) {
    const geometry = geometryEngine.build(profile);
    const mode = options && options.mode === "lines" ? "lines" : "hatch";
    const scale = Math.min(4.2, 720 / geometry.length_mm);
    const planX = 145;
    const planY = 155;
    const x = value => planX + value * scale;
    const y = value => planY + value * scale;
    const path = geometryEngine.svgPath(geometry, (px, py) => [x(px), y(py)]);
    const top = planY;
    const bottom = y(geometry.width_mm);
    const end = x(geometry.length_mm);
    const centre = x(geometry.halfLength_mm);
    const fill = mode === "hatch" ? "url(#tieSteelHatch)" : "#fff";
    const slotMarkup = geometry.slots.map((slot, index) => {
      const sx = x(slot.centreX_mm - slot.length_mm / 2);
      const sy = y(slot.centreY_mm - slot.width_mm / 2);
      return `<rect id="shear-slot-${index + 1}" class="hole"
        x="${n(sx)}" y="${n(sy)}"
        width="${n(slot.length_mm * scale)}"
        height="${n(slot.width_mm * scale)}"
        rx="${n(slot.radius_mm * scale)}"/>`;
    }).join("");

    const detailScale = 10;
    const detailX = 630;
    const detailY = 300;
    const detailFrom =
      geometry.halfLength_mm - geometry.mirroredEngagement_mm / 2;
    const detailTo =
      geometry.halfLength_mm + geometry.mirroredEngagement_mm / 2;
    const detailWidth = (detailTo - detailFrom) * detailScale;
    const detailBottom = detailY + geometry.width_mm * detailScale;
    const detailPath = geometryEngine.svgPath(
      geometry,
      (px, py) => [
        detailX + (px - detailFrom) * detailScale,
        detailY + py * detailScale
      ]
    );

    const sideY = 575;
    const sideThickness = Math.max(geometry.thickness_mm * scale, 3);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"
      viewBox="0 0 1000 800" data-render-mode="${mode}" role="img"
      aria-label="${profile.name} prototype drawing">
      <defs>
        <pattern id="tieSteelHatch" width="12" height="12" patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#9aa7b2" stroke-width="1"/>
        </pattern>
        <marker id="tieArrow" markerWidth="8" markerHeight="8" refX="4" refY="4"
          orient="auto-start-reverse" markerUnits="strokeWidth">
          <path d="M8 4L0 0L0 8Z" fill="#111"/>
        </marker>
        <clipPath id="shearConnectionClip">
          <rect x="${detailX - 3}" y="${detailY - 3}"
            width="${n(detailWidth + 6)}"
            height="${n(geometry.width_mm * detailScale + 6)}"/>
        </clipPath>
        <style>
          .outline{fill:${fill};stroke:#111;stroke-width:2;vector-effect:non-scaling-stroke}
          .hole{fill:#fff;stroke:#111;stroke-width:1.5;vector-effect:non-scaling-stroke}
          .centre{fill:none;stroke:#6b7280;stroke-width:1;stroke-dasharray:8 5}
          .dimension path{fill:none;stroke:#111;stroke-width:1}
          .dimension text{font:16px Arial,sans-serif;text-anchor:middle;dominant-baseline:middle;fill:#111}
          .text-mask{fill:#fff;stroke:none}
          .title{font:700 22px Arial,sans-serif;fill:#0f2742}
          .view-title{font:700 16px Arial,sans-serif;letter-spacing:.7px;fill:#111}
          .note{font:14px Arial,sans-serif;fill:#374151}
          .name{font:700 18px Arial,sans-serif;fill:#111}
        </style>
      </defs>
      <rect width="1000" height="800" fill="#fff"/>
      <text class="title" x="40" y="42">SHEAR TIE PROTOTYPE</text>
      <text class="name" x="40" y="72">${profile.name}</text>
      <text class="note" x="40" y="98">${geometry.length_mm} × ${geometry.width_mm} × ${geometry.thickness_mm} mm</text>

      <text class="view-title" x="65" y="140">PLAN</text>
      <path class="outline" d="${path}"/>
      ${slotMarkup}
      <path class="centre" d="M${x(0)} ${y(geometry.width_mm / 2)}H${end + 22}"/>
      ${dimH(planX, end, 116, top, `${geometry.length_mm}`)}
      ${dimV(top, bottom, 118, planX, `${geometry.width_mm}`)}
      ${dimH(planX, centre, bottom + 44, bottom, `${geometry.halfLength_mm}`)}
      ${dimH(centre, end, bottom + 78, bottom, `${geometry.halfLength_mm}`)}
      <path d="M${x(25)} ${y(geometry.width_mm / 2)}L${x(42)} ${bottom + 112}H${x(68)}"
        fill="none" stroke="#111" stroke-width="1"/>
      <text class="note" x="${x(69)}" y="${bottom + 117}">4 SLOTS 10 × 6 · R3 ENDS</text>

      <text class="view-title" x="${detailX}" y="${detailY - 28}">MIRRORED CENTRE CONNECTION</text>
      <g clip-path="url(#shearConnectionClip)">
        <path class="outline" d="${detailPath}"/>
      </g>
      ${dimH(
        detailX,
        detailX + geometry.notchLength_mm * detailScale,
        detailBottom + 42,
        detailBottom,
        "7.6"
      )}
      ${dimH(
        detailX,
        detailX + geometry.mirroredEngagement_mm * detailScale,
        detailBottom + 76,
        detailBottom,
        "11.17"
      )}
      <text class="note" x="${detailX}" y="${detailBottom + 108}">MIRRORED ABOUT ${geometry.halfLength_mm} mm CENTRELINE</text>

      <text class="view-title" x="${planX}" y="${sideY - 30}">SIDE ELEVATION</text>
      <rect class="outline" x="${planX}" y="${sideY}"
        width="${n(geometry.length_mm * scale)}" height="${n(sideThickness)}"/>
      ${dimH(planX, end, sideY + 60, sideY + sideThickness, `${geometry.length_mm}`)}
      ${dimV(sideY, sideY + sideThickness, 118, planX, `${geometry.thickness_mm}`)}

      <g transform="translate(725 675)">
        <rect x="0" y="0" width="225" height="105" fill="#f7f9fb" stroke="#bcc5ce"/>
        <text class="view-title" x="16" y="27">CONFIRMED INPUTS</text>
        <text class="note" x="16" y="52">Overall length  ${geometry.length_mm} mm</text>
        <text class="note" x="16" y="73">Width  ${geometry.width_mm} mm</text>
        <text class="note" x="16" y="94">Thickness  ${geometry.thickness_mm} mm · four slots</text>
      </g>
    </svg>`;

    return Object.freeze({ profile, geometry, mode, scale, svg });
  }

  function draw(profile, options) {
    if (profile && profile.family === "SHEAR") {
      return drawShear(profile, options);
    }
    const geometry = geometryEngine.build(profile);
    const mode = options && options.mode === "lines" ? "lines" : "hatch";
    const scale = Math.min(5.15, 720 / geometry.length_mm);
    const planX = 145;
    const planY = 155;
    const x = value => planX + value * scale;
    const y = value => planY + value * scale;
    const path = geometryEngine.svgPath(geometry, (px, py) => [x(px), y(py)]);
    const top = planY;
    const bottom = y(geometry.width_mm);
    const end = x(geometry.length_mm);
    const notchStart = x(geometry.notchStart_mm);
    const tailStart = x(geometry.tailStart_mm);
    const sideY = 580;
    const sideThickness = Math.max(geometry.thickness_mm * scale, 3);
    const fill = mode === "hatch" ? "url(#tieSteelHatch)" : "#fff";
    const detailScale = 6.3;
    const detailX = 650;
    const detailY = 315;
    const detailEnd = detailX + geometry.connectionLength_mm * detailScale;
    const detailNotchEnd = detailX + geometry.notchLength_mm * detailScale;
    const detailBottom = detailY + geometry.width_mm * detailScale;
    const detailPath = geometryEngine.svgPath(
      geometry,
      (px, py) => [
        detailX + (px - geometry.notchStart_mm) * detailScale,
        detailY + py * detailScale
      ]
    );

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"
      viewBox="0 0 1000 800" data-render-mode="${mode}" role="img"
      aria-label="${profile.name} tie prototype drawing">
      <defs>
        <pattern id="tieSteelHatch" width="12" height="12" patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#9aa7b2" stroke-width="1"/>
        </pattern>
        <marker id="tieArrow" markerWidth="8" markerHeight="8" refX="4" refY="4"
          orient="auto-start-reverse" markerUnits="strokeWidth">
          <path d="M8 4L0 0L0 8Z" fill="#111"/>
        </marker>
        <clipPath id="tieConnectionClip">
          <rect x="${detailX - 3}" y="${detailY - 3}"
            width="${n(geometry.connectionLength_mm * detailScale + 6)}"
            height="${n(geometry.width_mm * detailScale + 6)}"/>
        </clipPath>
        <style>
          .outline{fill:${fill};stroke:#111;stroke-width:2;vector-effect:non-scaling-stroke}
          .thin{fill:none;stroke:#111;stroke-width:1.25;vector-effect:non-scaling-stroke}
          .centre{fill:none;stroke:#6b7280;stroke-width:1;stroke-dasharray:8 5}
          .dimension path{fill:none;stroke:#111;stroke-width:1}
          .dimension text{font:16px Arial,sans-serif;text-anchor:middle;dominant-baseline:middle;fill:#111}
          .text-mask{fill:#fff;stroke:none}
          .title{font:700 22px Arial,sans-serif;fill:#0f2742}
          .view-title{font:700 16px Arial,sans-serif;letter-spacing:.7px;fill:#111}
          .note{font:14px Arial,sans-serif;fill:#374151}
          .name{font:700 18px Arial,sans-serif;fill:#111}
        </style>
      </defs>
      <rect width="1000" height="650" fill="#fff"/>
      <text class="title" x="40" y="42">EDC TIE PROTOTYPE</text>
      <text class="name" x="40" y="72">${profile.name}</text>
      <text class="note" x="40" y="98">${geometry.length_mm} × ${geometry.width_mm} × ${geometry.thickness_mm} mm</text>

      <text class="view-title" x="65" y="140">PLAN</text>
      <path class="outline" d="${path}"/>
      <path class="centre" d="M${x(0)} ${y(geometry.width_mm / 2)}H${end + 26}"/>
      ${dimH(planX, end, 116, top, String(geometry.length_mm))}
      ${dimV(top, bottom, 118, planX, `${geometry.width_mm}`)}

      <text class="view-title" x="${detailX}" y="${detailY - 28}">CONNECTION DETAIL</text>
      <g clip-path="url(#tieConnectionClip)">
        <path class="outline" d="${detailPath}"/>
      </g>
      ${dimH(detailX, detailNotchEnd, detailBottom + 42, detailBottom, "7.6")}
      ${dimH(detailNotchEnd, detailEnd, detailBottom + 76, detailBottom, "11.17")}

      <text class="view-title" x="${planX}" y="${sideY - 30}">SIDE ELEVATION</text>
      <rect class="outline" x="${planX}" y="${sideY}" width="${n(geometry.length_mm * scale)}"
        height="${n(sideThickness)}"/>
      ${dimH(planX, end, sideY + 60, sideY + sideThickness, String(geometry.length_mm))}
      ${dimV(sideY, sideY + sideThickness, 118, planX, `${geometry.thickness_mm}`)}

      <g transform="translate(725 675)">
        <rect x="0" y="0" width="225" height="105" fill="#f7f9fb" stroke="#bcc5ce"/>
        <text class="view-title" x="16" y="27">CONFIRMED INPUTS</text>
        <text class="note" x="16" y="52">Overall length  ${geometry.length_mm} mm</text>
        <text class="note" x="16" y="73">Width  ${geometry.width_mm} mm</text>
        <text class="note" x="16" y="94">Thickness  ${geometry.thickness_mm} mm · holes omitted</text>
      </g>
    </svg>`;

    return Object.freeze({ profile, geometry, mode, scale, svg });
  }

  windpost.tiePrototypeDrawing = Object.freeze({ draw });
})(typeof window !== "undefined" ? window : globalThis);
