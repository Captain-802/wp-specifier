"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
global.window = global;
global.Windpost = {};
require(path.join(root, "js/data/windpost-parameters.js"));
require(path.join(root, "js/config.js"));
require(path.join(root, "js/engines/fold-width-engine.js"));
require(path.join(root, "js/data/l-section-database.js"));
require(path.join(root, "js/data/connections-database.js"));
require(path.join(root, "js/engines/secant-modulus-engine.js"));
require(path.join(root, "js/engines/load-case-engine.js"));
require(path.join(root, "js/engines/tie-capacity-engine.js"));
require(path.join(root, "js/engines/result-selection-engine.js"));
require(path.join(root, "js/engines/windpost-calculation-engine.js"));
require(path.join(root, "js/engines/baseplate-design-engine.js"));
require(path.join(root, "js/services/baseplate-drawing-service.js"));
require(path.join(root, "js/services/cavity-wall-3d-engine.js"));
require(path.join(root, "js/services/l-section-orthographic-service.js"));
require(path.join(
  root,
  "js/services/l-cantilever-baseplate-prototype-service.js"
));

const W = global.Windpost;
const section = W.lSectionDatabase.sections.find(
  item => item.name === "LP 150x70x4"
);
const profile = W.cavityWall3d.foldedLProfile(section, 128);
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function polygonArea(points) {
  let twiceArea = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    twiceArea += point[0] * next[1] - next[0] * point[1];
  });
  return Math.abs(twiceArea / 2);
}

check("profile retains the selected unequal-leg dimensions", () => {
  const xs = profile.points.map(point => point[0]);
  const ys = profile.points.map(point => point[1]);
  assert.strictEqual(Math.min(...xs), 0);
  assert.strictEqual(Math.max(...xs), 70);
  assert.strictEqual(Math.min(...ys), 0);
  assert.strictEqual(Math.max(...ys), 150);
});

check("fold uses the database inner radius and thickness-derived outer radius", () => {
  assert.strictEqual(profile.t_mm, 4);
  assert.strictEqual(profile.innerRadius_mm, 6);
  assert.strictEqual(profile.outerRadius_mm, 10);
  assert.strictEqual(profile.outerRadius_mm, profile.innerRadius_mm + profile.t_mm);
});

check("curved profile area matches the database section property", () => {
  assert(
    Math.abs(
      polygonArea(profile.points) -
      section.crossSectionalArea_mm2
    ) < 0.01
  );
});

check("prototype mesh contains empty slot cutouts through both leg faces", () => {
  const model = W.cavityWall3d.sectionPrototypeModel(section, 900);
  const scene = W.cavityWall3d.buildSectionScene(model);
  assert.deepStrictEqual(model.slotPlacement.levels_mm, [225, 450, 675]);
  assert.strictEqual(scene.length, 1);
  assert.strictEqual(scene[0].type, "mesh");
  assert.strictEqual(scene[0].group, "post");
  assert(scene[0].points.every(point => point[2] === 0 || point[2] === 900));
  const facesWithHoles = scene[0].faces.filter(face => face.holes);
  assert.strictEqual(facesWithHoles.length, 4);
  assert.strictEqual(
    facesWithHoles.filter(face => face.slotLeg === "long").length,
    2
  );
  assert.strictEqual(
    facesWithHoles.filter(face => face.slotLeg === "short").length,
    2
  );
  assert.strictEqual(
    facesWithHoles.reduce((count, face) => count + face.holes.length, 0),
    12
  );
});

check("3D cantilever baseplate uses the designed datum and dimensions", () => {
  const result = W.lCantileverBaseplatePrototype.design(
    section,
    900,
    "udl"
  );
  const geometry = W.cavityWall3d.prototypeBaseplateGeometry(
    section,
    result.design
  );
  assert.strictEqual(geometry.datum, "inner-leaf-concrete-edge");
  assert.strictEqual(geometry.embedment_mm, 90);
  assert.strictEqual(geometry.weldProjection_mm, 6);
  assert.strictEqual(geometry.startY_mm, -66);
  assert.strictEqual(geometry.endY_mm, 235);
  assert.strictEqual(geometry.overallLength_mm, 301);
  assert.strictEqual(geometry.width_mm, 200);
  assert.strictEqual(geometry.thickness_mm, 8);
  assert.strictEqual(geometry.holeDiameter_mm, 14);
  assert.deepStrictEqual(geometry.rowCentres_mm, [55, 180]);
  assert.deepStrictEqual(geometry.columnCentres_mm, [-43, 53]);
  assert.deepStrictEqual(geometry.anchorCentres_mm, [
    { x: -43, y: 55 },
    { x: 53, y: 55 },
    { x: -43, y: 180 },
    { x: 53, y: 180 }
  ]);
});

check("3D scene contains the folded post, perforated plate and stiffener", () => {
  const result = W.lCantileverBaseplatePrototype.design(
    section,
    900,
    "udl"
  );
  const model = W.cavityWall3d.sectionPrototypeModel(
    section,
    900,
    null,
    result.design
  );
  const scene = W.cavityWall3d.buildSectionScene(model);
  assert.strictEqual(scene.length, 4);
  assert.strictEqual(scene.filter(item => item.group === "post").length, 1);
  assert.strictEqual(scene.filter(item => item.group === "baseplate").length, 1);
  assert.strictEqual(scene.filter(item => item.group === "stiffener").length, 1);
  assert.strictEqual(scene.filter(item => item.group === "anchors").length, 1);
  assert.deepStrictEqual(model.sortPlanes.map(plane => plane.id), ["plate", "post"]);
  assert.deepStrictEqual(scene.find(item => item.group === "stiffener").planeSides, { plate: 1, post: 1 });
  assert.deepStrictEqual(scene.find(item => item.group === "post").planeSides, { plate: 1, post: -1 });
  const anchors = scene.find(item => item.group === "anchors");
  assert.strictEqual(anchors.faces.length, 4 * (3 * 2 + 16 + 6 + 12));
  const plate = scene.find(item => item.group === "baseplate");
  assert.strictEqual(plate.faces[4].holes.length, 4);
  assert.strictEqual(plate.faces[5].holes.length, 4);
  assert(plate.faces[4].holes.every(hole => hole.length === 36));
  const post = scene.find(item => item.group === "post");
  const xs = post.points.map(point => point[0]);
  const ys = post.points.map(point => point[1]);
  assert.strictEqual(Math.max(...xs), 2);
  assert.strictEqual(Math.min(...ys), -60);
  assert.strictEqual(Math.max(...ys), 90);
});

check("3D stiffener matches the calculated thickness and height", () => {
  const result = W.lCantileverBaseplatePrototype.design(
    section,
    900,
    "udl"
  );
  const geometry = W.cavityWall3d.prototypeBaseplateGeometry(
    section,
    result.design
  );
  assert.deepStrictEqual(geometry.stiffener, {
    x0_mm: 2,
    x1_mm: 10,
    startY_mm: 55,
    flatEndY_mm: 90,
    endY_mm: 235,
    thickness_mm: 8,
    height_mm: 80
  });
});

check("all L sections generate finite 3D baseplate geometry", () => {
  let audited = 0;
  W.lSectionDatabase.sections.forEach(candidate => {
    [900, 1800, 3000].forEach(height => {
      ["udl", "tipPointLoad"].forEach(loadType => {
        const result = W.lCantileverBaseplatePrototype.design(
          candidate,
          height,
          loadType
        );
        assert(result.ok, `${candidate.name} ${height} ${loadType}`);
        const model = W.cavityWall3d.sectionPrototypeModel(
          candidate,
          height,
          null,
          result.design
        );
        const scene = W.cavityWall3d.buildSectionScene(model);
        assert.strictEqual(
          model.baseplate.anchorCentres_mm.length,
          result.design.nRow * result.design.nCol
        );
        assert.strictEqual(scene.length, 4);
        assert(
          scene.flatMap(item => item.points || [])
            .flat()
            .every(Number.isFinite)
        );
        audited += 1;
      });
    });
  });
  assert.strictEqual(audited, 186);
});

check("prototype page loads the L geometry and cantilever baseplate pipelines", () => {
  const html = fs.readFileSync(
    path.join(root, "l-section-prototype.html"),
    "utf8"
  );
  assert(html.includes("l-section-database.js"));
  assert(html.includes("cavity-wall-3d-engine.js"));
  assert(html.includes("l-section-orthographic-service.js"));
  assert(html.includes("baseplate-design-engine.js"));
  assert(html.includes("baseplate-drawing-service.js"));
  assert(html.includes("l-cantilever-baseplate-prototype-service.js"));
  assert(html.includes("l-section-prototype-page.js"));
  assert(!html.includes("cavity-wall-assembly-engine.js"));
  assert(!html.includes("cavity-wall-drawing-service.js"));
});

check("orthographic drawing uses one standard scale for all section views", () => {
  const drawing = W.lSectionOrthographic.generate(section, 900);
  assert.strictEqual(drawing.scaleDenominator, 5);
  assert.strictEqual(drawing.views.plan.width_mmOnSheet, 30);
  assert.strictEqual(drawing.views.plan.depth_mmOnSheet, 14);
  assert.strictEqual(drawing.views.longElevation.width_mmOnSheet, 30);
  assert.strictEqual(drawing.views.longElevation.height_mmOnSheet, 180);
  assert.strictEqual(drawing.views.shortElevation.width_mmOnSheet, 14);
  assert.strictEqual(drawing.views.shortElevation.height_mmOnSheet, 180);
});

check("plan is sourced from the rounded profile and both elevations are present", () => {
  const drawing = W.lSectionOrthographic.generate(section, 900);
  assert.strictEqual(drawing.views.plan.source, "foldedLProfile");
  assert(drawing.svg.includes('id="plan-view"'));
  assert(drawing.svg.includes('id="long-leg-elevation"'));
  assert(drawing.svg.includes('id="short-leg-elevation"'));
  assert(!drawing.svg.includes("t = 4"));
  assert(!drawing.svg.includes("Ri ="));
  assert(!drawing.svg.includes("Ro ="));
});

check("A3 SVG retains hidden construction projectors without exposing them", () => {
  const drawing = W.lSectionOrthographic.generate(section, 900);
  assert(drawing.svg.includes('width="420mm"'));
  assert(drawing.svg.includes('height="297mm"'));
  assert(drawing.svg.includes('id="orthographic-construction-projectors"'));
  assert(drawing.svg.includes(".projection-lines{display:none!important"));
  assert(drawing.svg.includes('data-source-y-mm="150"'));
  assert(drawing.svg.includes('data-source-x-mm="70"'));
});

check("orthographic SVG contains no invalid numeric output", () => {
  const drawing = W.lSectionOrthographic.generate(section, 12000);
  assert(!/NaN|undefined|Infinity/.test(drawing.svg));
  assert(drawing.scaleDenominator >= 50);
});

check("CAD print modes switch between hatched section and linework only", () => {
  const hatched = W.lSectionOrthographic.generate(section, 900, {
    mode: "hatch"
  });
  const lines = W.lSectionOrthographic.generate(section, 900, {
    mode: "lines"
  });
  assert.strictEqual(hatched.drawingMode, "hatch");
  assert.strictEqual(lines.drawingMode, "lines");
  assert(hatched.svg.includes('data-render-mode="hatch"'));
  assert(hatched.svg.includes(".section-fill{fill:url(#steel-section-hatch)"));
  assert(lines.svg.includes('data-render-mode="lines"'));
  assert(lines.svg.includes(".section-fill{fill:#fff"));
  assert(lines.svg.includes(".elevation-fill{fill:#fff;stroke:#000"));
  assert(lines.svg.includes(".elevation-fill{fill:#fff;stroke:#000;stroke-width:.28}"));
  assert(hatched.svg.includes('data-extension-break-count="1"'));
});

check("flat blank uses Ri 1.5t, K 0.38 and the bend-allowance method", () => {
  const section125x70x6 = W.lSectionDatabase.sections.find(
    item => item.name === "LP 125x70x6"
  );
  const blank = W.lSectionOrthographic.calculateBlank(section125x70x6);
  assert.strictEqual(blank.innerRadius_mm, 9);
  assert.strictEqual(blank.kFactor, 0.38);
  assert.strictEqual(blank.longStraight_mm, 110);
  assert.strictEqual(blank.shortStraight_mm, 55);
  assert.strictEqual(blank.blankLength_mm.toFixed(2), "182.72");
  assert.strictEqual(
    blank.bendCentre_mm,
    blank.longStraight_mm + blank.bendAllowance_mm / 2
  );
});

check("flat blank elevation shares the drawing scale and shows a dashed bend line", () => {
  const drawing = W.lSectionOrthographic.generate(section, 900);
  assert(drawing.svg.includes('id="flat-blank-elevation"'));
  assert(drawing.svg.includes('class="bend-line"'));
  assert(drawing.svg.includes(".bend-line{stroke:#000;stroke-width:.25;stroke-dasharray:2 1}"));
  assert.strictEqual(
    drawing.views.flatBlankElevation.width_mmOnSheet,
    drawing.blank.blankLength_mm / drawing.scaleDenominator
  );
  assert.strictEqual(
    drawing.views.flatBlankElevation.height_mmOnSheet,
    drawing.views.longElevation.height_mmOnSheet
  );
});

check("long-leg slot is exactly 18 by 50 with four R5 corners", () => {
  const slot = W.lSectionOrthographic.createSlotGeometry(
    W.lSectionOrthographic.SLOT_SPEC
  );
  assert.strictEqual(slot.width_mm, 18);
  assert.strictEqual(slot.depth_mm, 50);
  assert.strictEqual(slot.cornerRadius_mm, 5);
  assert.strictEqual(slot.topAndBottomStraight_mm, 8);
  assert.strictEqual(slot.sideStraight_mm, 40);
  const pathData = W.lSectionOrthographic.roundedSlotPath(slot, 0, 0);
  assert.strictEqual((pathData.match(/A 5 5/g) || []).length, 4);
});

check("long-leg slots use the 40 mm outer-edge default and 225 mm schedule", () => {
  const drawing = W.lSectionOrthographic.generate(section, 900);
  assert.strictEqual(drawing.slotPlacement.offsetFromOuterEdge_mm, 40);
  assert.strictEqual(drawing.slotPlacement.centreFromFold_mm, 110);
  assert.strictEqual(drawing.slotPlacement.centreFromMasonryEdge_mm, 50);
  assert.deepStrictEqual(drawing.slotPlacement.levels_mm, [225, 450, 675]);
  assert(drawing.svg.includes('id="long-leg-slots"'));
  assert(drawing.svg.includes('data-slot-count="3"'));
  assert(drawing.svg.includes('id="long-leg-slot-1"'));
  assert(drawing.svg.includes('data-centre-from-base-mm="675"'));
  assert(!drawing.svg.includes('id="slot-detail"'));
});

check("short-leg slots are centred 25 mm from the free tip", () => {
  const drawing = W.lSectionOrthographic.generate(section, 900);
  assert.strictEqual(drawing.slotPlacement.shortLegOffsetFromTip_mm, 25);
  assert.strictEqual(drawing.slotPlacement.shortLegCentreFromFold_mm, 45);
  assert.strictEqual(drawing.views.shortElevation.slotCount, 3);
  assert.deepStrictEqual(
    drawing.views.shortElevation.slotLevels_mm,
    [225, 450, 675]
  );
  assert(drawing.svg.includes('id="short-leg-slots"'));
  assert(drawing.svg.includes('data-offset-from-tip-mm="25"'));
  assert(drawing.svg.includes('id="short-leg-slot-1"'));
  assert(drawing.svg.includes('id="short-leg-slot-3"'));
});

check("slot offset is manually adjustable and remains on the long leg", () => {
  const drawing = W.lSectionOrthographic.generate(section, 900, {
    slotOffsetFromOuterEdge_mm: 55
  });
  assert.strictEqual(drawing.slotPlacement.offsetFromOuterEdge_mm, 55);
  assert.strictEqual(drawing.slotPlacement.centreFromFold_mm, 95);
  assert.strictEqual(drawing.slotPlacement.centreFromMasonryEdge_mm, 35);
});

check("first slot datum and following slot spacing are independently editable", () => {
  const drawing = W.lSectionOrthographic.generate(section, 900, {
    firstSlotFromBase_mm: 219,
    slotVerticalSpacing_mm: 250
  });
  assert.strictEqual(drawing.slotPlacement.firstCentreFromBase_mm, 219);
  assert.strictEqual(drawing.slotPlacement.verticalSpacing_mm, 250);
  assert.deepStrictEqual(
    drawing.slotPlacement.levels_mm,
    [219, 469, 719]
  );
  assert(drawing.svg.includes('class="slot-schedule-dimensions"'));
  assert(drawing.svg.includes(">219</text>"));
  assert(drawing.svg.includes(">250</text>"));
});

check("a final slot is skipped until its free-end edge distance is available", () => {
  const touchesFreeEnd = W.lSectionOrthographic.generate(section, 925);
  const clearsFreeEnd = W.lSectionOrthographic.generate(section, 947);
  assert.deepStrictEqual(
    touchesFreeEnd.slotPlacement.levels_mm,
    [225, 450, 675]
  );
  assert.strictEqual(touchesFreeEnd.slotPlacement.topSlotSkipped, true);
  assert.deepStrictEqual(
    clearsFreeEnd.slotPlacement.levels_mm,
    [225, 450, 675, 900]
  );
  assert.strictEqual(clearsFreeEnd.slotPlacement.topSlotSkipped, false);
});

check("cantilever baseplate reproduces the main selector pipeline", () => {
  const result = W.lCantileverBaseplatePrototype.design(
    section,
    900,
    "udl",
    { mode: "hatch" }
  );
  assert(result.ok);
  assert.strictEqual(
    result.source,
    "main-selector-cantilever-l-baseplate-pipeline"
  );
  assert.strictEqual(result.finalCapacity_kN, 6.75);
  assert.strictEqual(result.moment_kNm, 3.0375);
  assert.strictEqual(result.baseShear_kN, 6.75);
  assert.strictEqual(result.design.nRow, 2);
  assert.strictEqual(result.design.nCol, 2);
  assert.strictEqual(result.design.edge, 55);
  assert.strictEqual(result.design.pitch, 125);
  assert.strictEqual(result.design.tp, 8);
  assert.strictEqual(result.design.hUp, 80);
  assert.strictEqual(result.design.B, 200);
  assert.strictEqual(result.design.leftPortion_mm, 66);
  assert.strictEqual(result.design.overallLength_mm, 301);
  assert(result.baseplate.results.pass);
});

check("2D baseplate sheet carries plan, side view and CAD print modes", () => {
  const hatch = W.lCantileverBaseplatePrototype.design(
    section,
    900,
    "udl",
    { mode: "hatch" }
  );
  const lines = W.lCantileverBaseplatePrototype.design(
    section,
    900,
    "udl",
    { mode: "lines" }
  );
  assert(hatch.svg.includes("CONNECTION — PLAN"));
  assert(hatch.svg.includes("CONNECTION — SIDE VIEW"));
  assert(hatch.svg.includes('data-render-mode="hatch"'));
  assert(hatch.svg.includes("url(#bpSteelPrintHatch)"));
  assert(lines.svg.includes('data-render-mode="lines"'));
  assert(!lines.svg.includes("url(#bpSteelPrintHatch)"));
  assert(!/#b3261e|#123a63|#8a6a2f/.test(lines.svg));
  const planOnly = hatch.svg.split('<g id="bp-plan"')[1].split('<g id="bp-side"')[0];
  const sideOnly = hatch.svg.split('<g id="bp-side"')[1];
  assert(!planOnly.includes(section.name));
  assert(!sideOnly.includes("w.post"));
  assert(!/>6<\/text>/.test(sideOnly));
  assert(!/>60<\/text>/.test(sideOnly));
  assert(sideOnly.includes(">301</text>"));
});

check("long-section blank dimensions move outside narrow extension lines", () => {
  const drawing = W.lSectionOrthographic.generate(section, 6000);
  const outside = drawing.svg.match(
    /class="dimension-text" data-text-placement="outside"/g
  ) || [];
  assert(outside.length >= 2);
  assert(drawing.svg.includes(">145.9</text>"));
  assert(drawing.svg.includes(">211.8</text>"));
});

check("tip point load uses W times H as in the main selector", () => {
  const result = W.lCantileverBaseplatePrototype.design(
    section,
    900,
    "tipPointLoad"
  );
  assert(result.ok);
  assert.strictEqual(
    result.moment_kNm,
    result.finalCapacity_kN * result.height_m
  );
});

check("3D navigation supports orbit, pan shortcuts and reset", () => {
  const handlers = {};
  const classes = new Set();
  const canvas = {
    width: 600,
    height: 400,
    dataset: {},
    getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 600, height: 400 }),
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
    setPointerCapture: () => {},
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name)
    }
  };
  const renderer = W.cavityWall3d.create(canvas);
  assert.strictEqual(renderer.interactionMode, "orbit");
  assert.strictEqual(canvas.dataset.interactionMode, "orbit");

  const originalAzimuth = renderer.azimuth;
  handlers.pointerdown({
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
    preventDefault: () => {}
  });
  handlers.pointermove({
    clientX: 30,
    clientY: 20,
    preventDefault: () => {}
  });
  handlers.pointerup();
  assert(renderer.azimuth > originalAzimuth);
  assert.strictEqual(renderer.panX, 0);
  assert.strictEqual(renderer.panY, 0);

  handlers.pointerdown({
    button: 0,
    shiftKey: true,
    clientX: 30,
    clientY: 20,
    pointerId: 2,
    preventDefault: () => {}
  });
  handlers.pointermove({
    clientX: 55,
    clientY: 8,
    preventDefault: () => {}
  });
  handlers.pointerup();
  assert.strictEqual(renderer.panX, 25);
  assert.strictEqual(renderer.panY, -12);

  renderer.setInteractionMode("pan");
  assert.strictEqual(canvas.dataset.interactionMode, "pan");
  handlers.pointerdown({
    button: 0,
    clientX: 55,
    clientY: 8,
    pointerId: 3,
    preventDefault: () => {}
  });
  handlers.pointermove({
    clientX: 65,
    clientY: 18,
    preventDefault: () => {}
  });
  handlers.pointerup();
  assert.strictEqual(renderer.panX, 35);
  assert.strictEqual(renderer.panY, -2);

  renderer.setInteractionMode("orbit");
  handlers.pointerdown({
    button: 1,
    clientX: 65,
    clientY: 18,
    pointerId: 4,
    preventDefault: () => {}
  });
  handlers.pointermove({
    clientX: 70,
    clientY: 23,
    preventDefault: () => {}
  });
  handlers.pointerup();
  assert.strictEqual(renderer.panX, 40);
  assert.strictEqual(renderer.panY, 3);

  renderer.model = W.cavityWall3d.sectionPrototypeModel(section, 900);
  const projected = renderer.project([0, 0, 450], 1, 600, 400);
  assert.strictEqual(projected.x, 340);
  assert.strictEqual(projected.y, 203);
  renderer.zoom = 4;
  renderer.reset();
  assert.strictEqual(renderer.zoom, 1);
  assert.strictEqual(renderer.panX, 0);
  assert.strictEqual(renderer.panY, 0);
});

check("prototype exposes accessible hatch and linework controls", () => {
  const html = fs.readFileSync(
    path.join(root, "l-section-prototype.html"),
    "utf8"
  );
  assert(html.includes('id="drawing-mode-hatch"'));
  assert(html.includes('id="drawing-mode-lines"'));
  assert(html.includes('aria-label="Drawing display"'));
  assert(html.includes('id="prototype-slot-offset"'));
  assert(html.includes('id="prototype-first-slot"'));
  assert(html.includes('id="prototype-slot-spacing"'));
  assert(html.includes("Slot centre from long-leg outer edge"));
  assert(html.includes('id="prototype-load-type"'));
  assert(html.includes('id="cantilever-baseplate-drawing"'));
  assert(html.includes('class="production-source-only"'));
  assert(!html.includes('id="download-baseplate-drawing"'));
  assert(html.includes('id="view-mode-orbit"'));
  assert(html.includes('id="view-mode-pan"'));
  assert(html.includes('aria-label="3D navigation mode"'));
  assert(html.includes("Shift-drag, middle-drag or right-drag"));
  assert(html.includes('id="production-details-form"'));
  assert(html.includes('id="production-merchant"'));
  assert(html.includes('id="production-weight"'));
  assert(html.includes('id="production-customer"'));
  assert(html.includes('id="production-drawing-number"'));
  assert(html.includes('id="production-schedule"'));
  assert(html.includes('id="production-date"'));
  assert(html.includes('id="production-quantity"'));
});

check("production composer uses the selected A4 CAD palette and sign-off layout", () => {
  const html = fs.readFileSync(
    path.join(root, "l-section-prototype.html"),
    "utf8"
  );
  const page = fs.readFileSync(
    path.join(root, "js/ui/l-section-prototype-page.js"),
    "utf8"
  );
  assert(html.includes("A4 windpost production drawing"));
  assert(html.includes("./js/services/engineering-canvas-renderer.js"));
  assert(html.includes('id="download-a4-sheet"'));
  assert(html.includes('id="download-a4-dxf"'));
  assert(html.includes('id="download-a4-pdf"'));
  assert(html.includes('id="back-to-selector"'));
  assert(page.includes('params.get("source") === "selector"'));
  assert(page.includes("global.history.back()"));
  assert(page.includes("Windpost-Selector-Full"));
  assert(page.includes('width="210mm" height="297mm"'));
  assert(page.includes('viewBox="0 0 210 297"'));
  assert(page.includes('data-sheet-standard="keystone-production-a4"'));
  assert(page.includes('data-production-colour="${productionColour}"'));
  assert(page.includes("paletteCss(monochrome)"));
  assert(page.includes('id="production-signoff"'));
  assert(page.includes('["CUT", "MARK", "WELD", "CHECK"]'));
  assert(page.includes("MEASUREMENT TOLERANCE: ± 2 mm"));
  assert(page.includes("*** STAINLESS STEEL — GRADE 304 ***"));
  assert(page.includes("FOLD UP"));
  assert(page.includes("WIND POST SECTION (TOP VIEW)"));
  assert(page.includes("BASE PLATE PLAN"));
  assert(page.includes("BASE PLATE SIDE VIEW"));
  assert(page.includes("const plateMetaX = label =>"));
  assert(page.includes('plateMetaX(baseLabels[0])'));
  assert(page.includes('plateMetaX(baseLabels[1])'));
  assert(page.includes(
    "topDetail.setScale(Number(ortho.scaleDenominator) || 1)"
  ));
  assert(page.includes("topDetail.setLabelPaperGap(bFit.s, TOP.paperFont)"));
  assert(page.includes("* topDetail.scale)"));
  assert(page.includes("paperStroke: 0.14"));
  assert(page.includes("windpost.engineeringCanvasRenderer.enhance"));
  assert(!page.includes('label: "TOP CONNECTIONS"'));
  assert(page.includes("productionDetails()"));
  assert(page.includes("${production.quantity} NO."));
});

console.log(`\n${passed} folded L-section prototype checks passed.`);
