(function initialiseCavityWallDrawingService(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const C = Object.freeze({
    ink: "#172333",
    muted: "#627083",
    dim: "#35516f",
    steel: "#cbd3da",
    steelDark: "#748290",
    brick: "#a94d32",
    brickLight: "#c96a49",
    block: "#c8c7bf",
    mortar: "#eee7db",
    cavity: "#f5f8fb",
    tie: "#2f7f91",
    shear: "#195b72",
    red: "#c13c2d",
    white: "#ffffff"
  });

  function n(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function line(x1, y1, x2, y2, cls, extra) {
    return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" class="${cls || "ln"}" ${extra || ""}/>`;
  }

  function rect(x, y, width, height, fill, stroke, extra) {
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="${fill || "none"}" stroke="${stroke || C.ink}" ${extra || ""}/>`;
  }

  function text(x, y, value, size, anchor, cls, extra) {
    return `<text x="${n(x)}" y="${n(y)}" font-size="${size || 12}" text-anchor="${anchor || "middle"}" class="${cls || "tx"}" ${extra || ""}>${esc(value)}</text>`;
  }

  function obround(x, y, width, height, fill, stroke, strokeWidth) {
    const radius = Math.min(width, height) / 2;
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="${n(radius)}" fill="${fill || C.white}" stroke="${stroke || C.ink}" stroke-width="${strokeWidth || 1}"/>`;
  }

  function dimH(x1, x2, y, witnessY, label, laneClass) {
    return [
      line(x1, witnessY, x1, y, "ext"),
      line(x2, witnessY, x2, y, "ext"),
      line(x1, y, x2, y, laneClass || "dim", `marker-start="url(#cwArrow)" marker-end="url(#cwArrow)"`),
      text((x1 + x2) / 2, y - 5, label, 11, "middle", "dim-text")
    ].join("");
  }

  function dimV(y1, y2, x, witnessX, label, laneClass) {
    return [
      line(witnessX, y1, x, y1, "ext"),
      line(witnessX, y2, x, y2, "ext"),
      line(x, y1, x, y2, laneClass || "dim", `marker-start="url(#cwArrow)" marker-end="url(#cwArrow)"`),
      text(x - 6, (y1 + y2) / 2, label, 11, "middle", "dim-text", `transform="rotate(-90 ${n(x - 6)} ${n((y1 + y2) / 2)})"`)
    ].join("");
  }

  function callout(x1, y1, x2, y2, lines, align) {
    const anchor = align === "end" ? "end" : "start";
    const tx = align === "end" ? x2 - 6 : x2 + 6;
    return [
      `<polyline points="${n(x1)},${n(y1)} ${n((x1 + x2) / 2)},${n(y2)} ${n(x2)},${n(y2)}" class="leader" marker-start="url(#cwDot)"/>`,
      lines.map((item, index) =>
        text(tx, y2 - 3 + index * 13, item, 11, anchor, "note")
      ).join("")
    ].join("");
  }

  function defs() {
    return `<defs>
      <marker id="cwArrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M7,3.5 L0,0.7 L0,6.3 Z" fill="${C.dim}"/></marker>
      <marker id="cwDot" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5"><circle cx="2.5" cy="2.5" r="1.7" fill="${C.ink}"/></marker>
      <pattern id="cwBlock" width="44" height="22.5" patternUnits="userSpaceOnUse">
        <rect width="44" height="22.5" fill="${C.block}"/>
        <path d="M0 0H44M0 22.5H44M0 0V22.5" stroke="${C.mortar}" stroke-width="1.2"/>
      </pattern>
      <pattern id="cwBrick" width="22.5" height="7.5" patternUnits="userSpaceOnUse">
        <rect width="22.5" height="7.5" fill="${C.brick}"/>
        <path d="M0 0H22.5M0 7.5H22.5M0 0V7.5" stroke="#e2a37f" stroke-width=".8"/>
      </pattern>
      <linearGradient id="cwSteel" x1="0" x2="1"><stop offset="0" stop-color="#eef2f5"/><stop offset=".48" stop-color="#b9c3cb"/><stop offset="1" stop-color="#85929e"/></linearGradient>
    </defs>`;
  }

  function styles() {
    return `<style>
      .ln{stroke:${C.ink};stroke-width:1.2;fill:none}.outline{stroke:${C.ink};stroke-width:1.4}
      .centre{stroke:#8a97a3;stroke-width:.75;stroke-dasharray:7 4}.hidden-line{stroke:#8795a2;stroke-width:.8;stroke-dasharray:4 3}
      .dim{stroke:${C.dim};stroke-width:.8;fill:none}.ext{stroke:#8190a0;stroke-width:.55}.dim-text{fill:${C.dim};font-family:Arial,sans-serif}
      .tx{fill:${C.ink};font-family:Arial,sans-serif}.note{fill:${C.ink};font-family:Arial,sans-serif}.leader{stroke:${C.ink};stroke-width:.8;fill:none}
      .title{font-family:Arial,sans-serif;font-weight:700;letter-spacing:.04em;fill:${C.ink}}
      .sub{font-family:Arial,sans-serif;fill:${C.muted}}.tie{stroke:${C.tie};fill:${C.tie}}.shear{stroke:${C.shear};fill:${C.shear}}
    </style>`;
  }

  function wrap(viewBox, title, subtitle, body) {
    const width = viewBox[2], height = viewBox[3];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(" ")}" width="100%" role="img" aria-label="${esc(title)}">
      ${defs()}${styles()}
      <rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>
      ${text(34, 31, title, 17, "start", "title")}
      ${text(34, 49, subtitle, 10.5, "start", "sub")}
      ${body}
    </svg>`;
  }

  function drawTieHoles(cx, cy, half, scale) {
    const tie = windpost.cavityWallAssemblyEngine.DETAIL.shearTie;
    const s = scale || 1;
    let out = "";
    [-1, 1].forEach((direction) => {
      tie.holeCentresFromEnd_mm.forEach((fromEnd) => {
        const hx = cx + direction * (half - fromEnd) * s;
        out += obround(
          hx - tie.holeLength_mm * s / 2,
          cy - tie.holeWidth_mm * s / 2,
          tie.holeLength_mm * s,
          tie.holeWidth_mm * s,
          C.white,
          C.shear,
          .65
        );
      });
    });
    return out;
  }

  function plan(model) {
    const x0 = 84, x1 = 846, wallCentre = (x0 + x1) / 2;
    const y0 = 112;
    const depthScale = 1;
    const inner = model.wall.innerLeafThickness_mm * depthScale;
    const cavity = model.wall.cavityWidth_mm * depthScale;
    const outer = model.wall.outerLeafThickness_mm * depthScale;
    const innerY = y0;
    const cavityY = innerY + inner;
    const outerY = cavityY + cavity;
    const wallEndY = outerY + outer;
    const post = model.post;
    const postX = wallCentre;
    const longY0 = y0 + post.longLegY0_mm;
    const longY1 = y0 + post.longLegY1_mm;
    const flangeY = y0 + post.flangeY_mm;
    const shearY = y0 + model.wall.innerLeafThickness_mm / 2;
    const shearHalf = model.shearTie.halfLength_mm;
    const tieActual = Number(model.wallTie.actualTieLength_mm);
    const tieUsable = tieActual - Number(model.wallTie.tieConnectionLength_mm);
    const edcX = postX + post.b_mm / 2 - post.t_mm / 2;
    const edcStartY = longY1;
    const edcEndY = edcStartY + tieUsable;
    const flangeX0 = postX - post.t_mm / 2;
    const flangeWidth = post.b_mm;
    let body = "";

    body += rect(x0, innerY, x1 - x0, inner, "url(#cwBlock)", C.ink, `class="outline"`);
    body += rect(postX - 5, innerY, 10, inner, C.mortar, "#d7cbb8");
    body += rect(x0, cavityY, x1 - x0, cavity, C.cavity, "#bdc9d4", `stroke-dasharray="5 4"`);
    body += rect(x0, outerY, x1 - x0, outer, "url(#cwBrick)", C.ink, `class="outline"`);

    for (let x = x0 + 54; x < x1; x += 113) {
      body += `<circle cx="${n(x)}" cy="${n(outerY + outer / 2)}" r="7" fill="#5d2b22" opacity=".7"/>`;
    }

    body += rect(
      postX - model.shearTie.halfLength_mm,
      shearY - model.shearTie.width_mm / 2,
      model.shearTie.overallLength_mm,
      model.shearTie.width_mm,
      C.shear,
      C.shear,
      `rx="5"`
    );
    body += drawTieHoles(postX, shearY, shearHalf, 1);

    body += rect(
      edcX - 12.5,
      edcStartY,
      25,
      Math.max(2, edcEndY - edcStartY),
      C.tie,
      C.tie,
      `rx="2"`
    );
    body += obround(edcX - 4, outerY + 14, 8, 15, C.white, C.tie, .8);
    body += obround(edcX - 4, outerY + 35, 8, 15, C.white, C.tie, .8);

    body += rect(
      postX - post.t_mm / 2,
      longY0,
      post.t_mm,
      longY1 - longY0,
      "url(#cwSteel)",
      C.ink,
      `class="outline"`
    );
    body += rect(
      flangeX0,
      flangeY,
      flangeWidth,
      post.t_mm,
      "url(#cwSteel)",
      C.ink,
      `class="outline" rx="${n(Math.min(post.outerRadius_mm, post.t_mm * 2))}"`
    );

    body += line(postX, innerY - 20, postX, wallEndY + 18, "centre");
    body += line(x0 - 10, cavityY, x1 + 10, cavityY, "centre");
    body += line(x0 - 10, outerY, x1 + 10, outerY, "centre");

    body += dimH(postX - shearHalf, postX, innerY - 48, shearY - 6, "84");
    body += dimH(postX, postX + shearHalf, innerY - 48, shearY - 6, "84");
    body += dimH(postX - shearHalf, postX + shearHalf, innerY - 74, shearY - 6, "168 shear tie");

    const dx = x1 + 25;
    body += dimV(innerY, cavityY, dx, x1, `${n(model.wall.innerLeafThickness_mm)} inner leaf`);
    body += dimV(cavityY, outerY, dx + 31, x1, `${n(model.wall.cavityWidth_mm)} cavity`);
    body += dimV(outerY, wallEndY, dx + 62, x1, `${n(model.wall.outerLeafThickness_mm)} outer leaf`);

    body += callout(postX - 3, longY0 + 18, x0 + 124, wallEndY + 68, [
      `${model.section.name}`,
      `90 mm embedded into inner leaf`
    ], "start");
    body += callout(postX - 40, shearY, x0 + 20, innerY + 31, [
      "168 × 10 × 1.5 mm two-way shear tie",
      "4 no. 6 × 10 mm R3 slots"
    ], "start");
    body += callout(edcX, outerY + 18, x1 - 132, wallEndY + 46, [
      `${model.wallTie.outerTie} outer-leaf tie`,
      `${n(model.wallTie.outerEmbedment_mm)} mm embedment`
    ], "start");

    body += text((x0 + x1) / 2, wallEndY + 91, "PLAN AT TIE LEVEL", 15, "middle", "title");
    return wrap([0, 0, 1000, Math.max(610, wallEndY + 115)], "L-WINDPOST CAVITY WALL — PLAN", "Paired shear and EDC ties at the same elevation", body);
  }

  function elevation(model) {
    const left = 86, right = 874, top = 86, bottom = 535;
    const drawingHeight = bottom - top;
    const scaleZ = drawingHeight / model.length_mm;
    const centre = (left + right) / 2;
    const postWidth = Math.max(42, model.post.b_mm * .65);
    const levels = model.tieSchedule.levels_mm;
    let body = "";

    body += rect(left, top, right - left, drawingHeight, "url(#cwBlock)", C.ink, `class="outline"`);
    body += rect(centre - postWidth / 2, top - 8, postWidth, drawingHeight + 16, "url(#cwSteel)", C.ink, `class="outline"`);

    levels.forEach((level, index) => {
      const y = bottom - level * scaleZ;
      body += rect(
        centre - model.shearTie.halfLength_mm * .68,
        y - 3,
        model.shearTie.overallLength_mm * .68,
        6,
        C.shear,
        C.shear,
        `rx="3"`
      );
      body += obround(centre - 5, y - 25, 10, 50 * scaleZ, C.white, C.ink, .8);
      if (index === 0 || index === levels.length - 1) {
        body += text(centre + 60, y + 4, `Tie level ${index + 1}`, 10, "start", "note");
      }
    });

    const plateWidth = model.baseplate && model.baseplate.design
      ? Number(model.baseplate.design.B) : 220;
    body += rect(centre - plateWidth * .65 / 2, bottom, plateWidth * .65, 8, C.steelDark, C.ink, `class="outline"`);
    body += line(centre, top - 23, centre, bottom + 18, "centre");

    const firstY = bottom - model.tieSchedule.firstCentre_mm * scaleZ;
    body += dimV(firstY, bottom, left - 31, left, "225");
    if (levels.length > 1) {
      const secondY = bottom - levels[1] * scaleZ;
      body += dimV(secondY, firstY, left - 62, left, "225 c/c");
    }
    body += dimV(top, bottom, right + 35, right, `${n(model.length_mm)} overall`);

    body += callout(centre + postWidth / 2, top + 60, right - 235, top + 32, [
      `${model.section.name} L windpost`,
      "10 × 50 mm R5 slot at every tie level"
    ], "start");
    body += callout(centre - 70, firstY, left + 24, bottom + 42, [
      "Two-way shear tie in inner-leaf bed joint",
      "EDC tie paired at the same level"
    ], "start");
    body += text((left + right) / 2, bottom + 64, "INNER-LEAF ELEVATION", 15, "middle", "title");
    return wrap([0, 0, 1000, 630], "L-WINDPOST CAVITY WALL — ELEVATION", "Standard blockwork module: 440 × 100 × 215 mm with 10 mm mortar", body);
  }

  function side(model) {
    const x0 = 115, top = 87, bottom = 527;
    const widthScale = 1.45;
    const inner = model.wall.innerLeafThickness_mm * widthScale;
    const cavity = model.wall.cavityWidth_mm * widthScale;
    const outer = model.wall.outerLeafThickness_mm * widthScale;
    const xInnerEnd = x0 + inner;
    const xCavityEnd = xInnerEnd + cavity;
    const xOuterEnd = xCavityEnd + outer;
    const height = bottom - top;
    const scaleZ = height / model.length_mm;
    const postX = x0 + model.post.longLegY0_mm * widthScale;
    const postEndX = x0 + model.post.longLegY1_mm * widthScale;
    let body = "";

    body += rect(x0, top, inner, height, "url(#cwBlock)", C.ink, `class="outline"`);
    body += rect(xInnerEnd, top, cavity, height, C.cavity, "#bdc9d4", `stroke-dasharray="5 4"`);
    body += rect(xCavityEnd, top, outer, height, "url(#cwBrick)", C.ink, `class="outline"`);
    body += rect(postX, top - 8, Math.max(4, postEndX - postX), height + 16, "url(#cwSteel)", C.ink, `class="outline"`);

    model.tieSchedule.levels_mm.forEach((level) => {
      const y = bottom - level * scaleZ;
      body += rect(postEndX - 2, y - 2.4, xCavityEnd + model.wallTie.outerEmbedment_mm * widthScale - postEndX, 4.8, C.tie, C.tie, `rx="2.4"`);
      body += rect(postX - 6, y - 3.2, 12, 6.4, C.shear, C.shear, `rx="3.2"`);
    });

    const plate = model.baseplate && model.baseplate.design ? model.baseplate.design : {};
    const plateLeft = xInnerEnd - (Number(plate.leftPortion) || 41) * widthScale;
    const plateRight = xInnerEnd + (Number(plate.plateLen) || 125) * widthScale;
    body += rect(plateLeft, bottom, plateRight - plateLeft, 8, C.steelDark, C.ink, `class="outline"`);
    body += rect(xInnerEnd, bottom + 8, plateRight - xInnerEnd, 55, "#d8d9d6", C.ink, `class="outline"`);
    body += text((xInnerEnd + plateRight) / 2, bottom + 39, "CONCRETE", 11, "middle", "tx");

    body += dimH(x0, xInnerEnd, bottom + 91, bottom, `${n(model.wall.innerLeafThickness_mm)}`);
    body += dimH(xInnerEnd, xCavityEnd, bottom + 117, bottom, `${n(model.wall.cavityWidth_mm)}`);
    body += dimH(xCavityEnd, xOuterEnd, bottom + 143, bottom, `${n(model.wall.outerLeafThickness_mm)}`);
    body += dimH(postX, xInnerEnd, top - 30, top, "90 embedment");
    body += dimH(postEndX, xCavityEnd, top - 56, top, `${n(model.wallTie.outerGap_mm)} clear gap`);

    const firstY = bottom - model.tieSchedule.firstCentre_mm * scaleZ;
    body += callout((postEndX + xCavityEnd) / 2, firstY, xOuterEnd + 46, firstY - 31, [
      `${model.wallTie.outerTie} at each tie level`,
      `${n(model.wallTie.outerEmbedment_mm)} mm into outer leaf`
    ], "start");
    body += text((x0 + xOuterEnd) / 2, bottom + 174, "WALL SECTION / SIDE VIEW", 15, "middle", "title");
    return wrap([0, 0, 1000, 735], "L-WINDPOST CAVITY WALL — SIDE VIEW", "EDC tie crosses the cavity; the shear tie is viewed edge-on", body);
  }

  function isoPoint(x, y, z, ox, oy, sx, sy, sz) {
    return [
      ox + (x - y) * sx,
      oy + (x + y) * sy - z * sz
    ];
  }

  function isoPrism(x, y, z, dx, dy, dz, fill, stroke, opacity, origin) {
    const p = (xx, yy, zz) => isoPoint(xx, yy, zz, origin.ox, origin.oy, origin.sx, origin.sy, origin.sz);
    const a = p(x, y, z), b = p(x + dx, y, z), c = p(x + dx, y + dy, z), d = p(x, y + dy, z);
    const e = p(x, y, z + dz), f = p(x + dx, y, z + dz), g = p(x + dx, y + dy, z + dz), h = p(x, y + dy, z + dz);
    const poly = points => points.map(item => `${n(item[0])},${n(item[1])}`).join(" ");
    return [
      `<polygon points="${poly([a,b,f,e])}" fill="${fill}" stroke="${stroke}" opacity="${opacity}"/>`,
      `<polygon points="${poly([b,c,g,f])}" fill="${fill}" stroke="${stroke}" opacity="${Math.max(.12, opacity - .12)}"/>`,
      `<polygon points="${poly([e,f,g,h])}" fill="${fill}" stroke="${stroke}" opacity="${Math.min(1, opacity + .08)}"/>`
    ].join("");
  }

  function isometric(model) {
    const origin = { ox: 485, oy: 535, sx: .62, sy: .29, sz: .32 };
    const wallLength = 620;
    const x0 = -wallLength / 2;
    const height = Math.min(model.length_mm, 1350);
    const inner = model.wall.innerLeafThickness_mm;
    const cavity = model.wall.cavityWidth_mm;
    const outer = model.wall.outerLeafThickness_mm;
    const postY0 = inner - model.post.innerLeafEmbedment_mm;
    const postY1 = inner + model.post.cavityProjection_mm;
    let body = "";

    body += isoPrism(x0, 0, 0, wallLength, inner, height * .72, C.block, C.ink, .72, origin);
    body += isoPrism(x0, inner + cavity, 0, wallLength, outer, height * .48, C.brick, C.ink, .88, origin);
    body += isoPrism(-model.post.t_mm / 2, postY0, 0, model.post.t_mm, postY1 - postY0, model.length_mm, C.steel, C.ink, .98, origin);
    body += isoPrism(-model.post.t_mm / 2, postY1 - model.post.t_mm, 0, model.post.b_mm, model.post.t_mm, model.length_mm, C.steel, C.ink, .98, origin);

    const plate = model.baseplate && model.baseplate.design ? model.baseplate.design : {};
    const plateB = Number(plate.B) || 220;
    const left = Number(plate.leftPortion) || 41;
    const right = Number(plate.plateLen) || 125;
    body += isoPrism(-plateB / 2, inner - left, -8, plateB, left + right, 8, C.steelDark, C.ink, .96, origin);

    model.tieSchedule.levels_mm.filter(level => level <= height).forEach((level) => {
      body += isoPrism(-84, inner / 2 - 5, level - .75, 168, 10, 1.5, C.shear, C.shear, .98, origin);
      const edcX = model.post.b_mm / 2 - 12.5;
      const usable = model.wallTie.actualTieLength_mm - model.wallTie.tieConnectionLength_mm;
      body += isoPrism(edcX, postY1 - 11.17, level - .75, 25, usable, 1.5, C.tie, C.tie, .98, origin);
    });

    body += text(34, 575, "Inner block leaf shown at 72% height; outer brick leaf cut down to expose the paired ties.", 10.5, "start", "sub");
    body += text(500, 609, "ISOMETRIC ASSEMBLY", 15, "middle", "title");
    return wrap([0, 0, 1000, 635], "L-WINDPOST CAVITY WALL — ISOMETRIC", "Cutaway assembly generated from the selected section and wall construction", body);
  }

  function drawAll(model) {
    if (!model || !model.valid) {
      throw new Error(model && model.reason ? model.reason : "A valid cavity-wall model is required.");
    }
    return {
      plan: plan(model),
      elevation: elevation(model),
      side: side(model),
      isometric: isometric(model)
    };
  }

  windpost.cavityWallDrawingService = Object.freeze({
    drawAll,
    plan,
    elevation,
    side,
    isometric
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.cavityWallDrawingService;
  }
})(typeof window !== "undefined" ? window : globalThis);
