"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const engine = require(path.join(root, "js", "engines", "baseplate-design-engine.js"));
const lGeometry = require(path.join(root, "js", "services", "baseplate-geometry-engine.js"));
const lDrawing = require(path.join(root, "js", "services", "baseplate-drawing-service.js"));
const uGeometry = require(path.join(root, "js", "services", "u-baseplate-geometry-engine.js"));
const uPlan = require(path.join(root, "js", "services", "u-baseplate-plan-engine.js"));
const uDrawing = require(path.join(root, "js", "services", "u-baseplate-drawing-service.js"));
const simplyUEngine = require(path.join(root, "js", "engines", "simply-u-baseplate-standard-engine.js"));
const simplyUGeometry = require(path.join(root, "js", "services", "simply-u-baseplate-geometry-engine.js"));
const simplyUDrawing = require(path.join(root, "js", "services", "simply-u-baseplate-drawing-service.js"));
const simplyLEngine = require(path.join(root, "js", "engines", "simply-l-baseplate-standard-engine.js"));
const simplyLGeometry = require(path.join(root, "js", "services", "simply-l-baseplate-geometry-engine.js"));
const simplyLDrawing = require(path.join(root, "js", "services", "simply-l-baseplate-drawing-service.js"));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const separated =
    Math.max(a[0], b[0]) < Math.min(c[0], d[0]) ||
    Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
    Math.max(a[1], b[1]) < Math.min(c[1], d[1]) ||
    Math.max(c[1], d[1]) < Math.min(a[1], b[1]);
  if (separated) return false;
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  return abC * abD <= 0 && cdA * cdB <= 0;
}

const design = engine.autoDesign({ M_kNm: 10, W_kN: 10, H_m: 2, B: 220 });
assert(design.ok && design.results.pass, "Reference shared baseplate design must pass.");

const u60 = {
  type: "U", name: "UP 60x60x5", a_mm: 60, b_mm: 60, t_mm: 5,
  innerRadius_mm: 7.5
};
const u115 = {
  type: "U", name: "UP 115x60x4", a_mm: 115, b_mm: 60, t_mm: 4,
  innerRadius_mm: 6
};
const u75 = {
  type: "U", name: "UP 75x60x4", a_mm: 75, b_mm: 60, t_mm: 4,
  innerRadius_mm: 6
};
const l160 = {
  type: "L", name: "LP 160x70x6", a_mm: 160, b_mm: 70, t_mm: 6,
  innerRadius_mm: 9
};
const l125 = {
  type: "L", name: "LP 125x70x4", a_mm: 125, b_mm: 70, t_mm: 4,
  innerRadius_mm: 6
};
const l160x80 = {
  type: "L", name: "LP 160x80x8", a_mm: 160, b_mm: 80, t_mm: 8,
  innerRadius_mm: 12
};

check("shared structural design remains independent of U/L drawing geometry", () => {
  const lSvg = lDrawing.draw(design.design, l160);
  const uSvg = uDrawing.draw(design.design, u60);
  assert(lSvg.svg.includes("CONNECTION — PLAN"));
  assert(uSvg.svg.includes("U-POST BASE — PLAN"));
  assert.strictEqual(design.design.B, 220);
  assert.strictEqual(design.design.tw, design.design.tp);
});

check("UP 60 left portion uses the shared 6 mm wall clearance", () => {
  const g = uGeometry.layout(design.design, u60);
  assert.strictEqual(g.CLEAR, 6);
  assert.strictEqual(g.PX0, -66);
  assert.strictEqual(g.PX1, -6);
  assert.strictEqual(g.PL0, -72);
  assert.strictEqual(g.CANT, 72);
  assert.strictEqual(g.stiffenerStartX, -6);
  const source = fs.readFileSync(path.join(root, "js", "services", "u-baseplate-geometry-engine.js"), "utf8");
  assert(source.includes("wallDefaults.uInnerClearance_mm"));
  assert(source.includes("tieParameters.uInnerClearance_mm"));
});

check("UP 115 left portion responds to the selected section depth", () => {
  const g = uGeometry.layout(design.design, u115);
  assert.strictEqual(g.PX0, -121);
  assert.strictEqual(g.PX1, -6);
  assert.strictEqual(g.PL0, -127);
  assert.strictEqual(g.CANT, 127);
});

check("U flange mid-line and stiffener are centred on the plate width", () => {
  const g = uGeometry.layout(design.design, u60);
  assert.strictEqual(g.stiffenerY, 0);
  assert.deepStrictEqual(g.cols, [-48, 48]);
  const ys = g.PROF.map(point => point[1]);
  assert(Math.abs(Math.min(...ys) + 30) < 1e-9);
  assert(Math.abs(Math.max(...ys) - 30) < 1e-9);
});

check("U plan uses the section's actual rounded bend radius", () => {
  const g = uGeometry.layout(design.design, u60);
  assert.strictEqual(g.innerRadius, 7.5);
  assert(g.PROF.length > 30, "Rounded profile should contain sampled arc points.");
  const xs = g.PROF.map(point => point[0]);
  assert(Math.abs(Math.min(...xs) + 66) < 1e-9);
  assert(Math.abs(Math.max(...xs) + 6) < 1e-9);
});

check("U SVG carries the confirmed fabrication dimensions and no weld symbol", () => {
  const out = uDrawing.draw(design.design, u60);
  assert(out.svg.includes(">6<"));
  assert(out.svg.includes(">60<"));
  assert(out.svg.includes(">72<"));
  assert(out.svg.includes(
    `${Math.round(out.geometry.totX)} × ${out.geometry.B} × ${out.geometry.d.tp} mm`
  ));
  assert(out.svg.includes("BASE PLATE"));
  assert(out.svg.includes("UP 60x60x5"));
  assert(!out.svg.toLowerCase().includes("fillet weld"));
  assert(out.svg.includes("Ø 14"));
  assert(!out.svg.includes("14 mm dia hole"));
  assert(!out.svg.includes("to suit RGM 12"));
});

check("right-side dimension arrows and annotation leaders occupy non-crossing lanes", () => {
  const g = uGeometry.layout(design.design, u60);
  const right = uPlan.rightSideLayout(g);
  assert(right.dimXStiffener > right.plateRight);
  assert(right.dimXOffsets > right.dimXStiffener);
  assert(right.dimXGauge > right.dimXOffsets);
  assert(right.leaderStartX > right.dimXGauge);
  assert(right.stiffenerRouteY > g.PY(g.cols[1]) + 3);
  assert(right.stiffenerElbowX < right.dimXStiffener);

  const dimensionSegments = [];
  const addVerticalDimension = (x, y1, y2) => {
    dimensionSegments.push([[x, y1], [x, y2]]);
    dimensionSegments.push([[x - 3, y1], [x + 3, y1]]);
    dimensionSegments.push([[x - 3, y2], [x + 3, y2]]);
  };
  addVerticalDimension(right.dimXOffsets, g.PY(g.cols[0]), g.PY(-g.d.tw / 2));
  addVerticalDimension(right.dimXOffsets, g.PY(g.d.tw / 2), g.PY(g.cols[1]));
  addVerticalDimension(right.dimXGauge, g.PY(g.cols[0]), g.PY(g.cols[1]));
  addVerticalDimension(right.dimXStiffener, g.PY(-g.d.tw / 2), g.PY(g.d.tw / 2));

  const leaderPaths = [
    right.plateLeader,
    right.stiffenerLeader
  ];
  const leaderSegments = leaderPaths.flatMap((points, pathIndex) =>
    points.slice(0, -1).map((point, segmentIndex) => ({
      pathIndex,
      segmentIndex,
      segment: [point, points[segmentIndex + 1]]
    }))
  );
  dimensionSegments.forEach(([a, b]) => leaderSegments.forEach(({ segment: [c, d] }) => {
    assert(!segmentsIntersect(a, b, c, d), "A callout leader crosses a dimension arrow.");
  }));
  leaderSegments.forEach((first, i) => leaderSegments.slice(i + 1).forEach(second => {
    if (first.pathIndex === second.pathIndex) return;
    assert(
      !segmentsIntersect(...first.segment, ...second.segment),
      "Two annotation leaders cross each other."
    );
  }));
});

check("development page loads the U drawing engines before the UI", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const uServiceAt = html.indexOf("./js/services/u-baseplate-drawing-service.js");
  const simplyUEngineAt = html.indexOf("./js/engines/simply-u-baseplate-standard-engine.js");
  const simplyUServiceAt = html.indexOf("./js/services/simply-u-baseplate-drawing-service.js");
  const appAt = html.indexOf("./js/ui/app.js");
  assert(uServiceAt >= 0 && appAt > uServiceAt);
  assert(simplyUEngineAt >= 0 && appAt > simplyUEngineAt);
  assert(simplyUServiceAt >= 0 && appAt > simplyUServiceAt);
});

check("UI routes cantilever U-posts to the shared design and U drawing service", () => {
  const app = fs.readFileSync(path.join(root, "js", "ui", "app.js"), "utf8");
  const selectorRouter = fs.readFileSync(
    path.join(root, "js", "engines", "selector", "selector-baseplate-routing-engine.js"),
    "utf8"
  );
  const drawingRouter = fs.readFileSync(
    path.join(root, "js", "engines", "selector", "baseplate-drawing-routing-engine.js"),
    "utf8"
  );
  assert(selectorRouter.includes('section.type === "L" || section.type === "U"'));
  assert(drawingRouter.includes("windpost.uBaseplateDrawing"));
  assert(app.includes("cantilever U‑ and L‑posts"));
});

check("simply-supported U standard uses the confirmed fixed right-hand detail", () => {
  const out = simplyUEngine.create(u60);
  assert(out.ok && out.standard && out.results.pass);
  assert.strictEqual(out.connectionType, "simply-supported-u");
  assert.deepStrictEqual(out.design, {
    B: 150,
    tp: 6,
    plateLen: 125,
    anchorFromConcreteEdge: 90,
    rightEndDistance: 35,
    w: 90,
    sideEdge: 30,
    holeDia: 14,
    boltDia: 12,
    anchorName: "RGM 12",
    nRow: 1,
    nCol: 2
  });
  assert.strictEqual(out.results.minimumProvided, 30);
  assert.strictEqual(out.results.minimumRequired, 25);
  assert.deepStrictEqual(out.results.edgeDistances, {
    concrete: 90,
    longitudinalPlateEnd: 35,
    transverseTop: 30,
    transverseBottom: 30
  });
});

check("simply-supported U left portion changes only with selected post depth", () => {
  const d60 = simplyUEngine.create(u60).design;
  const d115 = simplyUEngine.create(u115).design;
  const g60 = simplyUGeometry.layout(d60, u60);
  const g115 = simplyUGeometry.layout(d115, u115);
  assert.strictEqual(g60.CLEAR, 6);
  assert.strictEqual(g60.PL0, -72);
  assert.strictEqual(g60.PL1, 125);
  assert.strictEqual(g60.totX, 197);
  assert.deepStrictEqual(g60.rows, [90]);
  assert.deepStrictEqual(g60.cols, [-45, 45]);
  assert.strictEqual(g115.PL0, -127);
  assert.strictEqual(g115.PL1, 125);
  assert.strictEqual(g115.totX, 252);
});

check("simply-supported U drawing contains plan and side views without a stiffener", () => {
  const out = simplyUEngine.create(u60);
  const drawing = simplyUDrawing.draw(out.design, u60);
  assert(drawing.svg.includes("SIMPLY-SUPPORTED U-POST BASE — PLAN"));
  assert(drawing.svg.includes("SIMPLY-SUPPORTED U-POST BASE — SIDE VIEW"));
  assert(drawing.svg.includes("197 × 150 × 6 mm"));
  assert(drawing.svg.includes("BASE PLATE"));
  assert(drawing.svg.includes("Ø 14"));
  assert(!drawing.svg.includes("14 mm dia hole"));
  assert(!drawing.svg.includes("to suit RGM 12"));
  assert(!drawing.svg.includes("STANDARD DETAIL"));
  assert(!drawing.svg.includes("Required edge"));
  assert(!drawing.svg.toLowerCase().includes("stiffener"));
  const xs = drawing.geometry.PROF.map(point => point[0]);
  assert(Math.abs(Math.min(...xs) + 66) < 1e-9);
  assert(Math.abs(Math.max(...xs) + 6) < 1e-9);
  assert(drawing.geometry.PROF.length > 30);
});

check("UI routes simply-supported U-posts to the separate standard engine", () => {
  const app = fs.readFileSync(path.join(root, "js", "ui", "app.js"), "utf8");
  const selectorRouter = fs.readFileSync(
    path.join(root, "js", "engines", "selector", "selector-baseplate-routing-engine.js"),
    "utf8"
  );
  const drawingRouter = fs.readFileSync(
    path.join(root, "js", "engines", "selector", "baseplate-drawing-routing-engine.js"),
    "utf8"
  );
  assert(selectorRouter.includes('inputs.supportCondition === "simplySupported"'));
  assert(selectorRouter.includes("windpost.simplyUBaseplateStandard.create(section)"));
  assert(drawingRouter.includes('baseplate.connectionType === "simply-supported-u"'));
  assert(drawingRouter.includes("windpost.simplyUBaseplateDrawing"));
  // The result block still identifies the fixed standard detail and reports
  // the edge-spacing check; only its explanatory sentence was dropped.
  assert(app.includes("Simply-supported ${this.escape(bp.postType)}-post base plate"));
  assert(app.includes("Edge-spacing check"));
});

check("simply-supported L standard retains the fixed right-hand anchor detail", () => {
  const out = simplyLEngine.create(l125);
  assert(out.ok && out.standard && out.results.pass);
  assert.strictEqual(out.connectionType, "simply-supported-l");
  assert.strictEqual(out.design.B, 150);
  assert.strictEqual(out.design.tp, 6);
  assert.strictEqual(out.design.plateLen, 125);
  assert.strictEqual(out.design.anchorFromConcreteEdge, 90);
  assert.strictEqual(out.design.rightEndDistance, 35);
  assert.strictEqual(out.design.w, 90);
  assert.strictEqual(out.design.sideEdge, 30);
  assert.strictEqual(out.design.holeDia, 14);
  assert.strictEqual(out.design.nRow, 1);
  assert.strictEqual(out.design.nCol, 2);
  assert.strictEqual(out.design.embedment, 90);
  assert.strictEqual(out.design.weldProjection, 6);
  assert.strictEqual(out.design.leftPortion, 41);
  assert.strictEqual(out.results.minimumProvided, 30);
  assert.strictEqual(out.results.minimumRequired, 25);
});

check("80 mm L legs use the confirmed 160 mm plate and remain inside it", () => {
  const out = simplyLEngine.create(l160x80);
  const g = simplyLGeometry.layout(out.design, l160x80);
  assert(out.ok && out.results.pass);
  assert.strictEqual(out.design.B, 160);
  assert.strictEqual(out.design.sideEdge, 35);
  assert.strictEqual(out.results.minimumProvided, 35);
  assert.strictEqual(out.design.leftPortion, 76);
  assert.strictEqual(g.PL0, -76);
  assert.strictEqual(g.PX0, -70);
  assert.strictEqual(g.PX1, 90);
  assert.strictEqual(g.PL1, 125);
  assert.strictEqual(g.totX, 201);
  assert.deepStrictEqual(g.rows, [90]);
  assert.deepStrictEqual(g.cols, [-45, 45]);
  const ys = g.PROF.map(point => point[1]);
  assert(Math.min(...ys) >= -g.B / 2);
  assert(Math.max(...ys) <= g.B / 2);
});

check("simply-supported L drawing contains plan and side views without a stiffener", () => {
  const out = simplyLEngine.create(l125);
  const drawing = simplyLDrawing.draw(out.design, l125);
  assert(drawing.svg.includes("SIMPLY-SUPPORTED L-POST BASE — PLAN"));
  assert(drawing.svg.includes("SIMPLY-SUPPORTED L-POST BASE — SIDE VIEW"));
  assert(drawing.svg.includes("166 × 150 × 6 mm"));
  assert(drawing.svg.includes("BASE PLATE"));
  assert(drawing.svg.includes("Ø 14"));
  assert(!drawing.svg.includes("14 mm dia hole"));
  assert(!drawing.svg.includes("to suit RGM 12"));
  assert(!drawing.svg.includes("STANDARD DETAIL"));
  assert(!drawing.svg.includes("Required edge"));
  assert(!drawing.svg.toLowerCase().includes("stiffener"));
});

check("all baseplate drawings use numeric-only dimensions and the standard hole callout", () => {
  const simplyU = simplyUEngine.create(u60);
  const simplyL = simplyLEngine.create(l125);
  const drawings = [
    lDrawing.draw(design.design, l160).svg,
    uDrawing.draw(design.design, u60).svg,
    simplyUDrawing.draw(simplyU.design, u60).svg,
    simplyLDrawing.draw(simplyL.design, l125).svg
  ];
  const bannedDrawingText = [
    " design", "overall", "left portion", "right portion", " c/c",
    " flange", "o'hang", "STANDARD DETAIL", "Minimum provided",
    "Required edge", "rows ×", "cols RGM", "2 × RGM", "projected",
    "A–A", ">A<"
  ];
  drawings.forEach(svg => {
    bannedDrawingText.forEach(text => {
      assert(!svg.includes(text), `Drawing still contains '${text}'.`);
    });
    assert(svg.includes("Ø 14"));
    assert(!svg.includes("14 mm dia hole"));
    assert(!svg.includes("to suit RGM 12"));
    assert(svg.includes("BASE PLATE"));
    assert(svg.includes('data-extension-break-count="'));
  });
});

check("all plan horizontal dimensions use the plate left edge as datum", () => {
  const cases = [
    {
      drawing: uDrawing.draw(design.design, u60),
      geometry: uGeometry.layout(design.design, u60)
    },
    {
      drawing: lDrawing.draw(design.design, l125),
      geometry: lGeometry.layout(design.design, l125)
    },
    {
      drawing: simplyUDrawing.draw(simplyUEngine.create(u75).design, u75),
      geometry: simplyUGeometry.layout(
        simplyUEngine.create(u75).design, u75
      )
    },
    {
      drawing: simplyLDrawing.draw(simplyLEngine.create(l125).design, l125),
      geometry: simplyLGeometry.layout(
        simplyLEngine.create(l125).design, l125
      )
    }
  ];
  cases.forEach(({ drawing, geometry }) => {
    const plan = drawing.svg.split('<g id="bp-plan"')[1]
      .split('<g id="bp-side"')[0];
    const left = geometry.PX(geometry.PL0);
    const dimensionGroups = plan.match(
      /<g data-cad="dim"[^>]*>[\s\S]*?<\/g>/g
    ) || [];
    const horizontalStarts = dimensionGroups.map(group => {
      const line = group.match(
        /<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/
      );
      if (!line || Math.abs(Number(line[2]) - Number(line[4])) > 1e-6 ||
          Math.abs(Number(line[1]) - Number(line[3])) < 1e-6) return null;
      return Number(line[1]);
    }).filter(value => value !== null);
    assert(horizontalStarts.length >= 3,
      "Expected cumulative horizontal plan dimensions.");
    horizontalStarts.forEach(start => assert(
      Math.abs(start - left) < 1e-6,
      `Horizontal dimension starts at ${start}, not left datum ${left}.`
    ));
  });
});

check("all baseplate side views use one central windpost continuation break", () => {
  const simplyU = simplyUEngine.create(u60);
  const simplyL = simplyLEngine.create(l125);
  const drawings = [
    lDrawing.draw(design.design, l160).svg,
    uDrawing.draw(design.design, u60).svg,
    simplyUDrawing.draw(simplyU.design, u60).svg,
    simplyLDrawing.draw(simplyL.design, l125).svg
  ];
  drawings.forEach(svg => {
    const breaks = svg.match(/data-detail="windpost-continuation-break"/g) || [];
    assert.strictEqual(breaks.length, 1);
  });
});

check("development page and UI load and route the simply-supported L engine", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const engineAt = html.indexOf("./js/engines/simply-l-baseplate-standard-engine.js");
  const drawingAt = html.indexOf("./js/services/simply-l-baseplate-drawing-service.js");
  const appAt = html.indexOf("./js/ui/app.js");
  assert(engineAt >= 0 && drawingAt > engineAt && appAt > drawingAt);
  const canvasAt = html.indexOf("./js/services/engineering-canvas-renderer.js");
  assert(canvasAt >= 0 && canvasAt < appAt);
  const app = fs.readFileSync(path.join(root, "js", "ui", "app.js"), "utf8");
  const selectorRouter = fs.readFileSync(
    path.join(root, "js", "engines", "selector", "selector-baseplate-routing-engine.js"),
    "utf8"
  );
  const drawingRouter = fs.readFileSync(
    path.join(root, "js", "engines", "selector", "baseplate-drawing-routing-engine.js"),
    "utf8"
  );
  assert(selectorRouter.includes("windpost.simplyLBaseplateStandard.create(section)"));
  assert(drawingRouter.includes('baseplate.connectionType === "simply-supported-l"'));
  assert(drawingRouter.includes("windpost.simplyLBaseplateDrawing"));
  assert(app.includes("simply-supported U‑ and L‑posts"));
  assert(app.includes("windpost.engineeringCanvasRenderer.enhance"));
});

console.log(`\n${passed} baseplate checks passed.`);
