"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, window: {} });
context.window.window = context.window;

[
  "js/data/l-section-database.js",
  "js/data/tie-profiles.js",
  "js/services/tie-prototype-geometry-engine.js",
  "js/services/tie-prototype-drawing-service.js",
  "js/services/tie-wall-setup-engine.js",
  "js/services/tie-wall-drawing-service.js",
  "js/services/tie-wall-canvas-renderer.js"
].forEach(file => vm.runInContext(
  fs.readFileSync(path.join(root, file), "utf8"),
  context,
  { filename: file }
));

const W = context.window.Windpost;
const profile = W.tieProfiles.get("EDC25-100");
const geometry = W.tiePrototypeGeometry.build(profile);
let passed = 0;

function check(name, task) {
  task();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

check("EDC25-100 stores only the confirmed primary dimensions", () => {
  assert.strictEqual(profile.nominalLength_mm, 100);
  assert.strictEqual(profile.overallLength_mm, 108);
  assert.strictEqual(profile.width_mm, 18);
  assert.strictEqual(profile.thickness_mm, 1.5);
  assert.strictEqual(profile.engagementNotchLength_mm, 7.6);
  assert.strictEqual(profile.tailBeyondNotch_mm, 11.17);
  assert.strictEqual(profile.assumedNotchDropEach_mm, 1);
  assert.strictEqual(profile.holesShown, false);
});

check("the complete EDC25-100 to EDC25-375 series is available", () => {
  const edc = [...W.tieProfiles.profiles].filter(
    item => item.family === "EDC"
  );
  const nominal = edc.map(
    item => item.nominalLength_mm
  );
  const overall = edc.map(
    item => item.overallLength_mm
  );
  assert.deepStrictEqual(
    nominal,
    [100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375]
  );
  assert.deepStrictEqual(
    overall,
    [108, 133, 158, 183, 208, 233, 258, 283, 308, 333, 358, 383]
  );
  edc.forEach(item => {
    assert.strictEqual(item.overallLength_mm, item.nominalLength_mm + 8);
    assert.strictEqual(item.width_mm, 18);
    assert.strictEqual(item.thickness_mm, 1.5);
    assert.strictEqual(item.holesShown, false);
  });
});

check("connection datums are derived from the confirmed 108 mm length", () => {
  assert.strictEqual(geometry.connectionLength_mm, 18.77);
  assert.strictEqual(geometry.notchStart_mm, 89.23);
  assert.strictEqual(geometry.tailStart_mm, 96.83);
  assert.strictEqual(geometry.stepAt_mm, 93.03);
  assert.strictEqual(geometry.notchDropEach_mm, 1);
  assert.strictEqual(geometry.notchTotalDrop_mm, 2);
  assert(
    Math.abs(
      geometry.length_mm - geometry.tailStart_mm - 11.17
    ) < 1e-9
  );
});

check("prototype outline is finite and retains the rounded 18 mm leading end", () => {
  assert.strictEqual(geometry.leadingRadius_mm, 9);
  assert(geometry.outline.length >= 15);
  assert(geometry.outline.flat().every(Number.isFinite));
  assert.deepStrictEqual([...geometry.outline[0]], [9, 0]);
  assert.deepStrictEqual(
    [...geometry.outline.at(-1)],
    [9, 18]
  );
  assert(geometry.meshOutline.length > geometry.outline.length);
  assert.strictEqual(
    Math.min(...geometry.meshOutline.map(point => point[0])),
    0
  );
  assert(
    geometry.outline.some(point =>
      point[0] === geometry.stepAt_mm && point[1] === 1
    )
  );
  assert(
    geometry.outline.some(point =>
      point[0] === geometry.stepAt_mm && point[1] === 2
    )
  );
  assert.strictEqual(
    Math.min(...geometry.outline.map(point => point[0])),
    9
  );
});

check("CAD drawing contains plan and true side elevation without holes", () => {
  const drawing = W.tiePrototypeDrawing.draw(profile, { mode: "hatch" });
  assert(drawing.svg.startsWith("<svg"));
  assert(drawing.svg.includes("EDC25-100"));
  assert(drawing.svg.includes(">108</text>"));
  assert(drawing.svg.includes(">18</text>"));
  assert(drawing.svg.includes(">1.5</text>"));
  assert(drawing.svg.includes(">7.6</text>"));
  assert(drawing.svg.includes(">11.17</text>"));
  assert(drawing.svg.includes("holes omitted"));
  assert(!/<circle|<ellipse/i.test(drawing.svg));
  assert(!/NaN|undefined|Infinity/.test(drawing.svg));
});

check("CAD display switches between hatched and line-only geometry", () => {
  const hatch = W.tiePrototypeDrawing.draw(profile, { mode: "hatch" });
  const lines = W.tiePrototypeDrawing.draw(profile, { mode: "lines" });
  assert(hatch.svg.includes('data-render-mode="hatch"'));
  assert(hatch.svg.includes("url(#tieSteelHatch)"));
  assert(lines.svg.includes('data-render-mode="lines"'));
  assert(lines.svg.includes(".outline{fill:#fff"));
});

check("every EDC drawing fits the sheet and retains a readable connection detail", () => {
  [...W.tieProfiles.profiles]
    .filter(item => item.family === "EDC")
    .forEach(item => {
    const drawing = W.tiePrototypeDrawing.draw(item, { mode: "lines" });
    assert.strictEqual(drawing.geometry.length_mm, item.overallLength_mm);
    assert(drawing.scale > 0);
    assert(drawing.geometry.length_mm * drawing.scale <= 720 + 1e-9);
    assert(drawing.svg.includes("CONNECTION DETAIL"));
    assert(drawing.svg.includes(`>${item.overallLength_mm}</text>`));
    assert(drawing.svg.includes(">7.6</text>"));
    assert(drawing.svg.includes(">11.17</text>"));
    assert(!/NaN|undefined|Infinity/.test(drawing.svg));
  });
});

check("shear tie stores the confirmed fabrication dimensions", () => {
  const shear = W.tieProfiles.get("SHEAR TIE 168");
  assert.strictEqual(shear.overallLength_mm, 168);
  assert.strictEqual(shear.halfLength_mm, 84);
  assert.strictEqual(shear.width_mm, 10);
  assert.strictEqual(shear.thickness_mm, 1.5);
  assert.strictEqual(shear.endRadius_mm, 5);
  assert.strictEqual(shear.slotLength_mm, 10);
  assert.strictEqual(shear.slotWidth_mm, 6);
  assert.strictEqual(shear.slotRadius_mm, 3);
  assert.deepStrictEqual([...shear.slotCentresFromEnd_mm], [10, 25]);
  assert.strictEqual(shear.engagementNotchLength_mm, 7.6);
  assert.strictEqual(shear.mirroredEngagement_mm, 11.17);
});

check("shear tie geometry is symmetric with four non-overlapping slots", () => {
  const shear = W.tieProfiles.get("SHEAR TIE 168");
  const detail = W.tiePrototypeGeometry.build(shear);
  assert.strictEqual(detail.kind, "shear");
  assert.strictEqual(detail.halfLength_mm, 84);
  assert.strictEqual(detail.leftNotchStart_mm, 78.415);
  assert.strictEqual(detail.leftNotchEnd_mm, 86.015);
  assert.strictEqual(detail.rightNotchStart_mm, 81.985);
  assert.strictEqual(detail.rightNotchEnd_mm, 89.585);
  assert.strictEqual(detail.notchDepth_mm, 3);
  assert(
    Math.abs(
      detail.leftNotchEnd_mm - detail.rightNotchStart_mm - 4.03
    ) < 1e-9
  );
  assert.deepStrictEqual(
    [...detail.slots].map(slot => slot.centreX_mm),
    [10, 25, 143, 158]
  );
  assert(
    detail.slots.every(slot =>
      slot.length_mm === 10 &&
      slot.width_mm === 6 &&
      slot.radius_mm === 3 &&
      slot.outline.length > 20
    )
  );
});

check("shear tie CAD drawing shows holes, centre detail and both 84 mm halves", () => {
  const shear = W.tieProfiles.get("SHEAR TIE 168");
  const drawing = W.tiePrototypeDrawing.draw(shear, { mode: "hatch" });
  assert(drawing.svg.includes("SHEAR TIE PROTOTYPE"));
  assert(drawing.svg.includes("MIRRORED CENTRE CONNECTION"));
  assert(drawing.svg.includes("4 SLOTS 10 × 6 · R3 ENDS"));
  assert.strictEqual(
    (drawing.svg.match(/id="shear-slot-/g) || []).length,
    4
  );
  assert.strictEqual(
    (drawing.svg.match(/>84<\/text>/g) || []).length,
    2
  );
  assert(drawing.svg.includes(">7.6</text>"));
  assert(drawing.svg.includes(">11.17</text>"));
  assert(!/NaN|undefined|Infinity/.test(drawing.svg));
});

check("separate prototype page loads every tie engine before its controller", () => {
  const html = fs.readFileSync(
    path.join(root, "tie-prototype.html"),
    "utf8"
  );
  const lDataAt = html.indexOf("./js/data/l-section-database.js");
  const dataAt = html.indexOf("./js/data/tie-profiles.js");
  const geometryAt = html.indexOf("./js/services/tie-prototype-geometry-engine.js");
  const drawingAt = html.indexOf("./js/services/tie-prototype-drawing-service.js");
  const modelAt = html.indexOf("./js/services/tie-prototype-3d-engine.js");
  const wallSetupAt = html.indexOf("./js/services/tie-wall-setup-engine.js");
  const wallDrawingAt = html.indexOf("./js/services/tie-wall-drawing-service.js");
  const wallCanvasAt = html.indexOf("./js/services/tie-wall-canvas-renderer.js");
  const wallModelAt = html.indexOf("./js/services/tie-wall-3d-engine.js");
  const pageAt = html.indexOf("./js/ui/tie-prototype-page.js");
  assert(
    lDataAt >= 0 &&
    dataAt > lDataAt &&
    geometryAt > dataAt &&
    drawingAt > geometryAt &&
    modelAt > drawingAt &&
    wallSetupAt > modelAt &&
    wallDrawingAt > wallSetupAt &&
    wallCanvasAt > wallDrawingAt &&
    wallModelAt > wallCanvasAt &&
    pageAt > wallModelAt
  );
  assert(html.includes("Back to Selector"));
  assert(html.includes('id="tie-mode-hatch"'));
  assert(html.includes('id="tie-mode-lines"'));
  assert(html.includes('id="tie-3d-canvas"'));
  assert(html.includes('id="wall-elevation-height"'));
  assert.strictEqual(
    typeof W.tieWallCanvasRenderer.render,
    "function"
  );
});

check("wall setup uses the confirmed external-to-internal datum", () => {
  const wall = W.tieWallSetup.build();
  assert.strictEqual(wall.datum, "External face of outer leaf");
  assert.strictEqual(wall.outer.start_mm, 0);
  assert.strictEqual(wall.outer.end_mm, 102.5);
  assert.strictEqual(wall.cavity.start_mm, 102.5);
  assert.strictEqual(wall.cavity.end_mm, 202.5);
  assert.strictEqual(wall.inner.start_mm, 202.5);
  assert.strictEqual(wall.inner.end_mm, 302.5);
  assert.strictEqual(wall.totalThickness_mm, 302.5);
  assert.strictEqual(wall.connection.section.name, "LP 125x70x4");
  assert.strictEqual(wall.connection.innerLeafEmbedment_mm, 90);
  assert.strictEqual(wall.connection.cavityProjection_mm, 35);
  assert.strictEqual(wall.connection.cavityGap_mm, 65);
  assert.strictEqual(wall.connection.edcTie.name, "EDC25-150");
  assert.strictEqual(
    wall.connection.edcTie.engagementNotchLength_mm,
    7.6
  );
  assert.strictEqual(
    wall.connection.edcTie.tailBeyondNotch_mm,
    11.17
  );
  assert(
    Math.abs(wall.connection.edcTie.outerEmbedment_mm - 74.23) < 1e-9
  );
  assert.strictEqual(
    wall.connection.edcTie.nominalSlots.length_mm,
    10
  );
  assert.strictEqual(
    wall.connection.edcTie.nominalSlots.width_mm,
    6
  );
  assert.strictEqual(
    wall.connection.edcTie.nominalSlots.radius_mm,
    3
  );
  assert.deepStrictEqual(
    [...wall.connection.edcTie.nominalSlots.centresFromFreeEnd_mm],
    [10, 25]
  );
  assert.strictEqual(wall.elevation.height_mm, 1800);
  assert.strictEqual(wall.elevation.tieSpacing_mm, 225);
  assert.deepStrictEqual(
    [...wall.elevation.tieLevels_mm],
    [225, 450, 675, 900, 1125, 1350, 1575]
  );
});

check("wall setup retains standard UK masonry and aligned courses", () => {
  const wall = W.tieWallSetup.build();
  assert.strictEqual(wall.outer.material.unitLength_mm, 215);
  assert.strictEqual(wall.outer.material.unitHeight_mm, 65);
  assert.strictEqual(wall.outer.material.mortar_mm, 10);
  assert.strictEqual(wall.outer.material.course_mm, 75);
  assert.strictEqual(wall.inner.material.unitLength_mm, 440);
  assert.strictEqual(wall.inner.material.unitHeight_mm, 215);
  assert.strictEqual(wall.inner.material.mortar_mm, 10);
  assert.strictEqual(wall.inner.material.course_mm, 225);
  assert.strictEqual(wall.courseAlignment.brickCourses, 6);
  assert.strictEqual(wall.courseAlignment.blockCourses, 2);
  assert(
    wall.units.filter(unit => unit.layer === "outer").length > 6
  );
  assert(
    wall.units.filter(unit => unit.layer === "inner").length >= 4
  );
});

check("wall controls remain editable without breaking zone continuity", () => {
  const wall = W.tieWallSetup.build({
    outerThickness_mm: 110,
    cavityWidth_mm: 150,
    innerThickness_mm: 140,
    innerMaterial: "denseBlock"
  });
  assert.strictEqual(wall.outer.end_mm, 110);
  assert.strictEqual(wall.cavity.start_mm, wall.outer.end_mm);
  assert.strictEqual(wall.cavity.end_mm, 260);
  assert.strictEqual(wall.inner.start_mm, wall.cavity.end_mm);
  assert.strictEqual(wall.inner.end_mm, 400);
  assert.strictEqual(wall.totalThickness_mm, 400);
  assert.strictEqual(wall.inner.material.label, "Dense block");
});

check("dimensioned wall plan shows all three zones and total thickness", () => {
  const wall = W.tieWallSetup.build();
  const drawing = W.tieWallDrawing.draw(wall, { mode: "hatch" });
  const hybridDrawing = W.tieWallDrawing.draw(wall, {
    mode: "hatch",
    canvasMasonry: true
  });
  const lineDrawing = W.tieWallDrawing.draw(wall, { mode: "lines" });
  assert(drawing.svg.startsWith("<svg"));
  assert(drawing.svg.includes("OUTER LEAF"));
  assert(drawing.svg.includes("CLEAR CAVITY"));
  assert(drawing.svg.includes("INNER LEAF"));
  assert(drawing.svg.includes(">102.5</text>"));
  assert(drawing.svg.includes(">100</text>"));
  assert(drawing.svg.includes(">302.5</text>"));
  assert(drawing.svg.includes("EXTERNAL FACE DATUM"));
  assert(drawing.svg.includes("LP 125x70x4"));
  assert(drawing.svg.includes("EDC25-150"));
  assert(drawing.svg.includes("168 × 10 × 1.5 SHEAR TIE"));
  assert(drawing.svg.includes('class="windpost"'));
  assert(drawing.svg.includes('class="shear-tie"'));
  assert(drawing.svg.includes('class="edc-tie edc-engagement-profile"'));
  assert.strictEqual(
    (drawing.svg.match(/edc-slot/g) || []).length,
    2
  );
  assert(drawing.svg.includes('class="edc-tie edc-engagement-profile"'));
  assert(drawing.svg.includes('data-notched-head="true"'));
  assert(drawing.svg.includes('data-engagement-mm="7.6"'));
  assert(drawing.svg.includes('data-tail-mm="11.2"'));
  assert(!drawing.svg.includes('class="edc-hook"'));
  assert(drawing.svg.includes('id="brickRough"'));
  assert(drawing.svg.includes('id="blockRough"'));
  assert(drawing.svg.includes('id="brickCore"'));
  assert(drawing.svg.includes('class="mortar-bed"'));
  assert.strictEqual(
    (drawing.svg.match(/class="mortar-joint inner-mortar"/g) || []).length,
    1
  );
  assert.strictEqual(
    (drawing.svg.match(/class="mortar-edge inner-mortar-edge"/g) || []).length,
    1
  );
  assert.strictEqual(
    (drawing.svg.match(/class="mortar-joint outer-mortar"/g) || []).length,
    3
  );
  assert(drawing.svg.includes('id="mortarRough"'));
  assert.strictEqual(
    (drawing.svg.match(/class="elevation-mortar outer-elevation-mortar"/g) || []).length,
    1
  );
  assert.strictEqual(
    (drawing.svg.match(/class="inner-elevation-mortar"/g) || []).length,
    1
  );
  assert(drawing.svg.includes("VERTICAL CAVITY-WALL SECTION / ELEVATION"));
  assert(drawing.svg.includes('class="vertical-windpost"'));
  assert(drawing.svg.includes('data-leg="long"'));
  assert(drawing.svg.includes('data-long-leg-mm="125"'));
  assert(drawing.svg.includes('data-embedded-mm="90"'));
  assert(drawing.svg.includes('data-visible-long-leg-mm="35"'));
  assert(!drawing.svg.includes('class="vertical-post-slot"'));
  assert(drawing.svg.includes('class="windpost-base"'));
  assert(drawing.svg.includes('data-component="baseplate"'));
  assert(drawing.svg.includes('aria-label="windpost baseplate"'));
  assert(drawing.svg.includes('class="post-cut-end"'));
  assert(drawing.svg.includes('data-component="windpost-cut-end"'));
  assert(drawing.svg.includes('id="postEndHatch"'));
  assert.strictEqual(
    (drawing.svg.match(/data-tie-segment="inner-embedded"/g) || []).length,
    7
  );
  assert.strictEqual(
    (drawing.svg.match(/data-tie-segment="outer-cavity"/g) || []).length,
    7
  );
  assert.strictEqual(
    (drawing.svg.match(/data-tie-segment="outer-embedded"/g) || []).length,
    7
  );
  assert(drawing.svg.includes('data-embedment-mm="74.2"'));
  assert(drawing.svg.includes("OUTER TIES @ 225 mm c/c"));
  assert(hybridDrawing.svg.includes('data-render-engine="canvas+svg"'));
  assert(hybridDrawing.svg.includes(".outer-plan-unit{fill:none"));
  assert(hybridDrawing.svg.includes(".inner-plan-unit{fill:none"));
  assert(hybridDrawing.svg.includes('data-canvas-mortar="brick"'));
  assert(hybridDrawing.svg.includes('data-canvas-mortar="block"'));
  assert(lineDrawing.svg.includes('data-render-mode="lines"'));
  assert(lineDrawing.svg.includes('id="lineBrickHatch"'));
  assert(lineDrawing.svg.includes('id="lineBlockHatch"'));
  assert(lineDrawing.svg.includes(".outer-plan-unit{fill:url(#lineBrickHatch)"));
  assert(lineDrawing.svg.includes(".inner-plan-unit{fill:url(#lineBlockHatch)"));
  assert(lineDrawing.svg.includes(".outer-unit{fill:url(#lineBrickHatch)"));
  assert(lineDrawing.svg.includes(".inner-unit{fill:url(#lineBlockHatch)"));
  assert(!/NaN|undefined|Infinity/.test(drawing.svg));
  assert(!/NaN|undefined|Infinity/.test(lineDrawing.svg));
});

console.log(`\n${passed} tie prototype checks passed.`);
