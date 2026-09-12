"use strict";

// Realistic ("photo") drawing mode: the cavity-wall approval arrangement
// carries lit, textured materials built from SVG filters, so it survives the
// <image> embedding and the SVG download.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
const root = path.resolve(__dirname, "..");
[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/data/l-section-database.js",
  "js/data/u-section-database.js",
  "js/data/tie-profiles.js",
  "js/services/baseplate-svg-engine.js",
  "js/services/u-baseplate-geometry-engine.js",
  "js/services/tie-prototype-geometry-engine.js",
  "js/services/tie-wall-setup-engine.js",
  "js/services/tie-wall-drawing-service.js",
  "js/services/windpost-approval-drawing-service.js"
].forEach(file => require(path.join(root, file)));

const W = globalThis.Windpost;
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

const wall = W.tieWallSetup.build({
  sectionName: "LP 125x70x4",
  innerThickness_mm: 100, cavityWidth_mm: 100, outerThickness_mm: 102.5,
  innerMaterial: "aeratedBlock", outerMaterial: "brick",
  wallLength_mm: 900, wallHeight_mm: 450, elevationHeight_mm: 2670
});

check("photo mode lights and textures the masonry and steel with SVG filters", () => {
  const photo = W.tieWallDrawing.draw(wall, { mode: "photo" });
  assert.strictEqual(photo.mode, "photo");
  assert(photo.svg.includes('data-render-mode="photo"'));
  ["photoBrick", "photoBlock", "photoMortar", "photoShadow", "photoSteel", "photoCore"].forEach(id =>
    assert(photo.svg.includes(`id="${id}"`), `${id} defined`));
  assert(photo.svg.includes("feDiffuseLighting") && photo.svg.includes("feDistantLight"), "lit surfaces");
  assert(photo.svg.includes(".outer-plan-unit{fill:url(#photoBrickBase)") && photo.svg.includes(".photo-brick-layer{filter:url(#photoBrick)}"));
  assert((photo.svg.match(/class="photo-brick-layer"/g) || []).length === 3 && (photo.svg.match(/class="photo-block-layer"/g) || []).length === 2, "one filter per masonry layer, not per unit");
  assert(photo.svg.includes(".inner-plan-unit{fill:url(#photoBlockBase)"));
  assert(photo.svg.includes(".outer-plan-unit{fill:url(#photoBrickBase);stroke:#3a1d16;stroke-width:.9;filter:none}"), "per-unit hatch filters switched off under the layer filter");
  assert(photo.svg.includes(".windpost{stroke:url(#photoSteel);filter:url(#photoShadow)}"));
  assert(!/data:image|href="https?:|url\(https?:/.test(photo.svg), "no external resources");
  const hatch = W.tieWallDrawing.draw(wall, { mode: "hatch" });
  assert.strictEqual(hatch.mode, "hatch");
  assert(!hatch.svg.includes('id="photoBrick"'), "hatch mode unchanged");
  const lines = W.tieWallDrawing.draw(wall, { mode: "lines" });
  assert(lines.svg.includes('data-render-mode="lines"'));
});

check("the approval arrangement passes photo mode through to the wall views", () => {
  const section = W.lSectionDatabase.sections.find(s => s.name === "LP 125x70x4");
  const orthographic = { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 297"><rect width="10" height="10"/></svg>', postType: "L", length_mm: 2670, drawingMode: "photo" };
  const out = W.windpostApprovalDrawing.build({ orthographic, baseplate: null, section, length_mm: 2670, wall: {}, mode: "photo" });
  assert(out.assemblyIncluded);
  assert(out.svg.includes('data-render-mode="photo"'));
  // photo views are inlined (nested svg), not data-URI images
  assert(out.svg.includes('id="approval-wall-plan"') && out.svg.includes('data-inline="photo"'));
  assert(!out.svg.includes(encodeURIComponent('data-render-mode="photo"')), "not embedded as an image");
  assert(out.svg.includes('id="photoBrick-approval-wall-plan"') && out.svg.includes('url(#photoBrick-approval-wall-plan)'), "ids localised per view");
  assert(out.svg.includes('id="photoBrick-approval-wall-section"'));
  // the copied wall stylesheet is scoped to its view, the sheet's own rules to its direct content
  assert(out.svg.includes("#approval-wall-plan .datum-text{") && out.svg.includes("#approval-wall-section .datum-text{"), "view styles scoped");
  const nestedStyle = out.svg.slice(out.svg.indexOf('id="approval-wall-plan"')).match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
  const selectors = [...nestedStyle.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(Boolean);
  assert(selectors.length > 5 && selectors.every(s => s.split(",").every(part => part.trim().startsWith("#approval-wall-plan"))), "every selector inside the inlined view is scoped to it");
  assert(out.svg.includes("#windpost-approval-sheet > text"), "sheet rules do not reach into the views");
  const hatchOut = W.windpostApprovalDrawing.build({ orthographic: { ...orthographic, drawingMode: "hatch" }, baseplate: null, section, length_mm: 2670, wall: {}, mode: "hatch" });
  assert(hatchOut.svg.includes('<image') && !hatchOut.svg.includes('data-inline="photo"'), "hatch mode still embeds images");
});

check("the Detailing page offers the Realistic mode", () => {
  const html = fs.readFileSync(path.join(root, "l-section-prototype.html"), "utf8");
  assert(html.includes('id="drawing-mode-photo"') && html.includes(">Realistic<"));
  const page = fs.readFileSync(path.join(root, "js/ui/l-section-prototype-page.js"), "utf8");
  assert(page.includes('this.setDrawingMode("photo")') && page.includes('mode === "photo" ? "photo"'));
});

console.log(`\n${passed} photo-mode checks passed.`);
