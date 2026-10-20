(function initialiseDuSlabFaceDrawingService(global) {
  "use strict";
  // Plan and elevation of the DU slab-face connections DU-T2 / DU-B2, drawn
  // to the owner's detail sheets with the shared SVG primitives so the CAD
  // roles (and hence the DXF layers) are the same as every other drawing.
  //
  // Plan: the slab above the plate (y < 0 is concrete), the 6 mm plate on the
  // slab face, the DU section (two channels welded web to web: an H whose
  // 120 wide flange bar sits on the plate and whose stem, the post depth,
  // points into the cavity), the two anchors into the slab.
  // Elevation: the plate seen from the cavity with its two vertical slots and
  // the post welded over it, its end 8 mm inside the plate edge.
  const windpost = global.Windpost = global.Windpost || {};

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    require("./baseplate-svg-engine.js");
    require("./u-baseplate-geometry-engine.js");
    require("../data/du-slab-face-plates.js");
  }

  const DEFS =
    `<defs>` +
    `<pattern id="bpHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#b7b0a2" stroke-width="0.5"/></pattern>` +
    `</defs>`;

  function anchorSymbol(svg, x, y0, y1) {
    const { C, line: L } = svg;
    const parts = [
      L(x - 2.2, y0, x - 2.2, y1, C.STEELE, 0.55, "3,2"),
      L(x + 2.2, y0, x + 2.2, y1, C.STEELE, 0.55, "3,2")
    ];
    const span = y1 - y0;
    for (let k = 1; k <= 3; k += 1) {
      const y = y0 + span * k / 4;
      parts.push(L(x - 5, y, x + 5, y, C.STEELE, 0.5, "3,2"));
    }
    return parts.join("");
  }

  function slotPath(svg, cx, cy, width, length) {
    // rounded slot, long axis vertical
    const r = width / 2;
    const x0 = cx - r, x1 = cx + r;
    const y0 = cy - length / 2 + r, y1 = cy + length / 2 - r;
    const n = svg.n2;
    return `<path d="M${n(x0)} ${n(y0)} A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y0)} L${n(x1)} ${n(y1)} A${n(r)} ${n(r)} 0 0 1 ${n(x0)} ${n(y1)} Z" fill="${svg.C.HOLEF}" stroke="${svg.C.INK}" stroke-width="0.6" data-cad="hole"/>`;
  }

  function draw(code, section) {
    const svg = windpost.baseplateSvg;
    const g = windpost.duSlabFacePlates.geometryFor(code, section);
    if (!g) throw new Error(`No DU slab-face connection ${code}.`);
    const { C, line: L, rect: R, rawRect, poly: POLY, text: T, hdim, vdim, ext, leader, cad } = svg;
    const isTop = g.position === "top";
    const name = (section && section.name) || "DU windpost";
    const parts = [];

    // ---- layout (mm on the drawing = mm on the connection) ----------------
    const ML = 60, MT = 40, GAP = 46;
    const L_ = g.plateLength_mm, H = g.plateHeight_mm, tp = g.plateThickness_mm;
    const slabDepth = 70;
    // plan: slab top band, then plate, then the post section below
    const planTitleY = MT;
    const slabTop = planTitleY + 14;
    const faceY = slabTop + slabDepth;             // slab face (y of the plate's back)
    const PX = x => ML + x;
    const plateY0 = faceY, plateY1 = faceY + tp;
    const postY0 = plateY1, postY1 = plateY1 + g.depth_mm;
    const planDimY = postY1 + 36;
    const planEndY = planDimY + 40;
    // elevation
    const elevTitleY = planEndY + 18;
    const elevTop = elevTitleY + 16 + (isTop ? 0 : 60);      // room for the post continuing upward on B2
    const EY = y => elevTop + y;
    const elevBottom = elevTop + H;
    const postBreak = isTop ? elevBottom + 60 : elevTop - 60;
    const elevDimY = elevBottom + 22 + (isTop ? 60 : 0);
    const vbW = ML + L_ + 150;
    const vbH = elevDimY + 60;

    // ---- plan ---------------------------------------------------------------
    parts.push(T(PX(0), planTitleY, `${g.code}  ${g.title} — PLAN`, 9.5, C.INK, "start", true));
    parts.push(`<g data-a4-hide="concrete">` +
      cad("concrete", rawRect(PX(-40), slabTop, L_ + 80, slabDepth, "url(#bpHatch)", C.STEELE, 0.5)) +
      T(PX(L_ + 34), slabTop + 12, "CONCRETE SLAB", 7, C.DIM, "end") + `</g>`);
    parts.push(cad("concrete", L(PX(-40), faceY, PX(L_ + 40), faceY, C.RED, 0.6, "4,2")));
    parts.push(T(PX(-4), faceY + 12, "EDGE OF SLAB", 6.5, C.RED, "end"));
    // plate on the face
    parts.push(cad("steelCut", R(PX(0), plateY0, L_, tp, C.PLATEF, C.INK, 0.7)));
    // DU section as selected: two rounded folded U channels (the section's
    // own a, b, t and inside fold radius) welded web to web, webs at the
    // centre, flanges out to each side, the depth a into the cavity.
    const x0 = PX(g.postStart_mm), x1 = PX(g.postEnd_mm);
    const cx = (x0 + x1) / 2;
    const ri = Number.isFinite(g.innerRadius_mm) ? g.innerRadius_mm : 1.5 * g.t_mm;
    // postProfile: web along x from 0 to a at y = -b/2, flanges to y = +b/2
    const raw = windpost.uBaseplateGeom.postProfile(g.depth_mm, g.flange_mm, g.t_mm, ri, 0, g.depth_mm);
    const channel = sign => raw.map(([px, py]) => [cx + sign * (py + g.flange_mm / 2), postY0 + px]);
    parts.push(cad("steelCut", POLY(channel(-1), "none", C.INK, 0.7) + POLY(channel(1), "none", C.INK, 0.7)));
    parts.push(cad("weld", L(cx, postY0 + 2, cx, postY1 - 2, C.WELDC, 0.5, "2,1")));
    parts.push(T(cx, postY1 + 9, name, 7, C.INK, "middle", true));
    parts.push(T(cx, postY1 + 16.5, `2 x UP ${g.depth_mm}x${g.flange_mm}x${g.t_mm} welded web to web  ·  Ri ${ri} mm`, 6, C.DIM, "middle"));
    // anchors into the slab at the slot centres
    parts.push(`<g data-a4-hide="concrete">` +
      cad("hidden", g.slotCentres_mm.map(x => anchorSymbol(svg, PX(x), faceY - slabDepth + 8, faceY)).join("")) + `</g>`);
    // dimensions: plate length, anchors, post
    const lane1 = planDimY, lane2 = planDimY + 13, lane3 = planDimY + 26;
    [0, g.slotCentres_mm[0], g.postStart_mm, g.postEnd_mm, g.slotCentres_mm[1], L_].forEach(x =>
      parts.push(ext(PX(x), postY1 + 2, PX(x), lane3 + 4, [lane1, lane2])));
    parts.push(hdim(PX(0), PX(g.slotCentres_mm[0]), lane1, String(g.slotEdge_mm)));
    parts.push(hdim(PX(g.slotCentres_mm[0]), PX(g.slotCentres_mm[1]), lane1, String(g.slotPitch_mm), C.BLUE));
    parts.push(hdim(PX(g.slotCentres_mm[1]), PX(L_), lane1, String(g.slotEdge_mm)));
    parts.push(hdim(PX(0), PX(g.postStart_mm), lane2, String(g.postEdge_mm)));
    parts.push(hdim(PX(g.postStart_mm), PX(g.postEnd_mm), lane2, String(g.postWidth_mm), C.BLUE));
    parts.push(hdim(PX(g.postEnd_mm), PX(L_), lane2, String(g.postEdge_mm)));
    parts.push(hdim(PX(0), PX(L_), lane3, String(L_)));
    parts.push(vdim(plateY0, plateY1, PX(L_) + 14, String(tp)));
    parts.push(vdim(postY0, postY1, PX(L_) + 30, String(g.depth_mm), C.BLUE));
    parts.push(leader(PX(L_ + 48), postY0 + 18, x1, postY0 + 3, C.INK));
    parts.push(T(PX(L_ + 50), postY0 + 20, "POST TO BE WELDED TO PLATE", 6.5, C.INK, "start"));

    const planCount = parts.length;

    // ---- elevation ------------------------------------------------------------
    parts.push(T(PX(0), elevTitleY, `${g.code}  ${g.title} — ELEVATION 1`, 9.5, C.INK, "start", true));
    // The post runs across one plate edge (the bottom edge of the top plate,
    // the top edge of the bottom plate): that edge is hidden behind the post,
    // so the outline leaves a gap there and a dashed line marks it below.
    const coveredY = isTop ? EY(H) : EY(0);
    const clearY = isTop ? EY(0) : EY(H);
    parts.push(cad("steelFace",
      L(PX(0), clearY, PX(L_), clearY, C.INK, 0.7) +
      L(PX(0), EY(0), PX(0), EY(H), C.INK, 0.7) + L(PX(L_), EY(0), PX(L_), EY(H), C.INK, 0.7) +
      L(PX(0), coveredY, x0, coveredY, C.INK, 0.7) + L(x1, coveredY, PX(L_), coveredY, C.INK, 0.7)));
    // slots
    g.slotCentres_mm.forEach(x => parts.push(slotPath(svg, PX(x), EY(H / 2), g.slotWidth_mm, g.slotLength_mm)));
    // the post over the plate, ending 8 mm inside the plate edge, continuing away
    const postTopY = isTop ? EY(g.postEndInset_mm) : postBreak;
    const postBotY = isTop ? postBreak : EY(H - g.postEndInset_mm);
    const bw = 12;
    const breakY = isTop ? postBotY : postTopY;
    const breakLine = isTop
      ? [[x0, breakY], [cx - bw, breakY], [cx - bw * 0.4, breakY - 7], [cx + bw * 0.2, breakY + 8], [cx + bw, breakY], [x1, breakY]]
      : [[x0, breakY], [cx - bw, breakY], [cx - bw * 0.4, breakY + 7], [cx + bw * 0.2, breakY - 8], [cx + bw, breakY], [x1, breakY]];
    parts.push(cad("steel",
      L(x0, postTopY, x0, postBotY, C.INK, 0.7) + L(x1, postTopY, x1, postBotY, C.INK, 0.7) +
      L(cx, postTopY, cx, postBotY, C.INK, 0.5) +
      L(x0, isTop ? postTopY : postBotY, x1, isTop ? postTopY : postBotY, C.INK, 0.7) +
      svg.polyline(breakLine, C.INK, 0.7, "windpost-continuation-break")));
    // hidden plate edge behind the post
    parts.push(cad("hidden", L(x0, coveredY, x1, coveredY, C.DIM, 0.4, "3,2")));
    // dimensions
    const eLane1 = elevDimY, eLane2 = elevDimY + 13, eLane3 = elevDimY + 26;
    [0, g.slotCentres_mm[0], g.postStart_mm, g.postEnd_mm, g.slotCentres_mm[1], L_].forEach(x =>
      parts.push(ext(PX(x), isTop ? postBreak + 2 : elevBottom + 2, PX(x), eLane3 + 4, [eLane1, eLane2])));
    parts.push(hdim(PX(0), PX(g.slotCentres_mm[0]), eLane1, String(g.slotEdge_mm)));
    parts.push(hdim(PX(g.slotCentres_mm[0]), PX(g.slotCentres_mm[1]), eLane1, String(g.slotPitch_mm), C.BLUE));
    parts.push(hdim(PX(g.slotCentres_mm[1]), PX(L_), eLane1, String(g.slotEdge_mm)));
    parts.push(hdim(PX(0), PX(g.postStart_mm), eLane2, String(g.postEdge_mm)));
    parts.push(hdim(PX(g.postStart_mm), PX(g.postEnd_mm), eLane2, String(g.postWidth_mm), C.BLUE));
    parts.push(hdim(PX(g.postEnd_mm), PX(L_), eLane2, String(g.postEdge_mm)));
    parts.push(hdim(PX(0), PX(L_), eLane3, String(L_)));
    const vx = PX(L_) + 16;
    parts.push(vdim(EY(0), EY(g.slotTop_mm), vx, String(g.slotTop_mm)));
    parts.push(vdim(EY(g.slotTop_mm), EY(g.slotTop_mm + g.slotLength_mm), vx, String(g.slotLength_mm), C.BLUE));
    parts.push(vdim(EY(g.slotTop_mm + g.slotLength_mm), EY(H), vx, String(g.slotTop_mm)));
    parts.push(vdim(EY(0), EY(H), vx + 22, String(H)));
    parts.push(vdim(isTop ? EY(0) : EY(H - g.postEndInset_mm), isTop ? EY(g.postEndInset_mm) : EY(H), PX(g.postEnd_mm) + 12, String(g.postEndInset_mm)));
    parts.push(hdim(PX(g.slotCentres_mm[0]) - g.slotWidth_mm / 2, PX(g.slotCentres_mm[0]) + g.slotWidth_mm / 2, EY(g.slotTop_mm) - 6, String(g.slotWidth_mm)));
    parts.push(T(vx + 46, EY(H / 2) - 6, `±${g.verticalAdjustment_mm} MM`, 7, C.INK, "start", true));
    parts.push(T(vx + 46, EY(H / 2) + 3, "VERTICAL", 7, C.INK, "start"));
    parts.push(T(vx + 46, EY(H / 2) + 12, "ADJUSTMENT", 7, C.INK, "start"));
    parts.push(T(PX(0), elevDimY + 44, `${g.fixing}  ·  ${g.plateNote}  ·  ${L_} × ${H} × ${tp} mm  ·  2 × M${g.boltDiameter_mm} IN ${g.slotWidth_mm} × ${g.slotLength_mm} SLOTS`, 7.5, C.INK, "start", true));

    const n2 = svg.n2;
    const out =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(vbW)} ${n2(vbH)}" width="100%" ` +
      `style="max-width:${Math.round(vbW * 1.7)}px;height:auto;background:#fff" font-family="Arial,Helvetica,sans-serif">` +
      DEFS + `<rect x="0" y="0" width="${n2(vbW)}" height="${n2(vbH)}" fill="#fff"/>` +
      `<g id="bp-plan" data-view="plan">${parts.slice(0, planCount).join("")}</g>` +
      `<g id="bp-side" data-view="elevation">${parts.slice(planCount).join("")}</g>` + `</svg>`;
    return { svg: out, width: vbW, height: vbH, geometry: g };
  }

  windpost.duSlabFaceDrawing = Object.freeze({ draw });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.duSlabFaceDrawing;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
