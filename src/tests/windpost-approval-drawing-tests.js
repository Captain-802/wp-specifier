"use strict";

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
global.window = global;
global.Windpost = {};

[
  "js/data/l-section-database.js",
  "js/data/u-section-database.js",
  "js/data/tie-profiles.js",
  "js/services/cavity-wall-3d-engine.js",
  "js/services/l-section-orthographic-service.js",
  "js/services/u-section-orthographic-service.js",
  "js/services/tie-prototype-geometry-engine.js",
  "js/services/baseplate-svg-engine.js",
  "js/services/u-baseplate-geometry-engine.js",
  "js/services/tie-wall-setup-engine.js",
  "js/services/tie-wall-drawing-service.js",
  "js/services/windpost-approval-drawing-service.js"
].forEach(file => require(path.join(root, file)));

// The wall views are embedded as percent-encoded data: URIs, so their content
// has to be decoded before it can be asserted on.
function wallPlanOf(approval) {
  const match = approval.svg.match(
    /id="approval-wall-plan"[\s\S]*?href="data:image\/svg\+xml[^,]*,([^"]*)"/
  );
  return match ? decodeURIComponent(match[1]) : "";
}

let passed = 0;
function check(name, task) {
  task();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

const lSection = Windpost.lSectionDatabase.sections.find(
  section => section.name === "LP 170x70x4"
);
const lProduction = Windpost.lSectionOrthographic.generate(
  lSection,
  2670,
  { mode: "lines" }
);
const calculatedBaseplate = {
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
    <g id="bp-plan"><rect x="20" y="20" width="260" height="130"/></g>
    <g id="bp-side"><rect x="20" y="230" width="260" height="130"/></g>
  </svg>`,
  drawingWidth: 300,
  drawingHeight: 420,
  drawingViews: {
    plan: [0, 0, 300, 190],
    side: [0, 200, 300, 200]
  }
};
const lApproval = Windpost.windpostApprovalDrawing.build({
  orthographic: lProduction,
  baseplate: calculatedBaseplate,
  section: lSection,
  length_mm: 2670,
  wall: {
    innerLeafThickness_mm: 100,
    cavityWidth_mm: 150,
    outerLeafThickness_mm: 100
  },
  mode: "lines"
});

const uSection = Windpost.uSectionDatabase.sections.find(
  section => section.name === "UP 80x60x6"
);
const uApproval = Windpost.windpostApprovalDrawing.build({
  orthographic: Windpost.uSectionOrthographic.generate(
    uSection, 2670, { mode: "lines" }
  ),
  baseplate: calculatedBaseplate,
  section: uSection,
  length_mm: 2670,
  wall: {
    innerLeafThickness_mm: 100,
    cavityWidth_mm: 150,
    outerLeafThickness_mm: 100
  },
  mode: "lines"
});

check("a U post gets the same cavity-wall arrangement as an L", () => {
  assert(uApproval.assemblyIncluded);
  assert(uApproval.svg.includes("U-WINDPOST CAVITY-WALL APPROVAL ARRANGEMENT"));
  assert(uApproval.svg.includes('data-view="approval-wall-plan"'));
  assert(uApproval.svg.includes('data-view="approval-wall-section"'));
  assert(uApproval.svg.includes('data-view="approval-baseplate-plan"'));
  assert(uApproval.svg.includes('data-view="approval-baseplate-side"'));
  // The wall model must carry the U, not silently fall back to an L.
  assert.strictEqual(uApproval.wallModel.connection.section.name, "UP 80x60x6");
  assert.strictEqual(uApproval.wallModel.connection.postType, "U");
});

check("the U sits clear in the cavity and is tied back with a U tie", () => {
  const connection = uApproval.wallModel.connection;
  // Wholly in the cavity, 6 mm off the inner leaf — never built into it.
  assert.strictEqual(connection.innerLeafEmbedment_mm, 0);
  assert.strictEqual(connection.innerClearance_mm, 6);
  assert.strictEqual(connection.cavityProjection_mm, 6 + uSection.a_mm);
  assert.strictEqual(connection.cavityGap_mm, 150 - 6 - uSection.a_mm);
  assert.strictEqual(connection.innerTieName, "U tie");
  // The tie is drawn, not written up — the text panel is gone. The wall plan
  // is embedded as a data: URI, so it has to be decoded to be read.
  assert(wallPlanOf(uApproval).includes("mm U tie"));
  assert(!wallPlanOf(uApproval).includes("SHEAR TIE"));
  assert(wallPlanOf(uApproval).includes("U windpost"));

  // An L is unaffected: still embedded, still a shear tie.
  assert.strictEqual(lApproval.wallModel.connection.postType, "L");
  assert.strictEqual(lApproval.wallModel.connection.innerLeafEmbedment_mm, 90);
  assert(wallPlanOf(lApproval).includes("SHEAR TIE"));
  assert(!wallPlanOf(lApproval).includes("U tie"));
  assert(wallPlanOf(lApproval).includes("L windpost"));
});

check("L approval replaces the blank with the coordinated wall views", () => {
  assert(lApproval.assemblyIncluded);
  assert(lApproval.svg.includes('data-view="approval-wall-plan"'));
  assert(lApproval.svg.includes('data-view="approval-wall-section"'));
  assert(!lApproval.svg.includes("FLAT BLANK ELEVATION"));
});

check("approval replaces formed-post elevations with calculated baseplate views", () => {
  assert(lApproval.svg.includes('data-view="approval-baseplate-plan"'));
  assert(lApproval.svg.includes('data-view="approval-baseplate-side"'));
  assert(!lApproval.svg.includes('data-view="approval-long-leg-elevation"'));
  assert(!lApproval.svg.includes('data-view="approval-short-leg-elevation"'));
  assert(lApproval.svg.includes("BASEPLATE PLAN"));
  assert(lApproval.svg.includes("BASEPLATE SIDE VIEW"));
});

check("approval wall model follows the selector wall and chosen section", () => {
  assert.strictEqual(lApproval.wallModel.connection.section.name, lSection.name);
  assert.strictEqual(lApproval.wallModel.inner.thickness_mm, 100);
  assert.strictEqual(lApproval.wallModel.cavity.thickness_mm, 150);
  assert.strictEqual(lApproval.wallModel.outer.thickness_mm, 100);
  assert.strictEqual(
    lApproval.wallModel.connection.innerLeafEmbedment_mm,
    90
  );
});

check("approval uses paired ties at the confirmed 225 mm centres", () => {
  assert.strictEqual(lApproval.wallModel.elevation.tieSpacing_mm, 225);
  assert.strictEqual(
    lApproval.wallModel.elevation.tieLevels_mm[0],
    225
  );
  // The ties are drawn and the outer tie is named in the sheet subtitle; the
  // ARRANGEMENT text panel that repeated them has been removed.
  assert(wallPlanOf(lApproval).includes("SHEAR TIE"));
  assert(lApproval.svg.includes(
    `${lApproval.wallModel.connection.edcTie.name} OUTER TIE`
  ));
  assert(!lApproval.svg.includes('id="approval-arrangement-notes"'));
  ["WALL BUILD-UP", "PAIRED TIES", "VIEW PURPOSE", "INNER LEAF:",
    "mm EMBEDMENT", "ARE ON THE A4 SHEET", "note-title"]
    .forEach(text => assert(
      !lApproval.svg.includes(text), `removed panel text returned: ${text}`
    ));
});

check("the separate production source still retains its flat blank", () => {
  assert(lProduction.svg.includes('id="flat-blank-elevation"'));
  assert(lProduction.svg.includes("FLAT BLANK ELEVATION"));
});

const pageHtml = require("fs").readFileSync(
  path.join(root, "l-section-prototype.html"),
  "utf8"
);
const pageController = require("fs").readFileSync(
  path.join(root, "js/ui/l-section-prototype-page.js"),
  "utf8"
);
check("detailing page composes A4 from the temporary fabrication source", () => {
  assert(!pageHtml.includes('id="fabrication-orthographic-source"'));
  assert(pageController.includes("withFabricationDrawing(task)"));
  assert(pageController.includes("this.renderApprovalDrawing(section, length)"));
  assert(pageController.includes("baseplate: Object.assign"));
  assert(pageHtml.includes('class="production-source-only"'));
  assert(!pageHtml.includes('id="baseplate-drawing-title"'));
  assert(
    pageHtml.indexOf("tie-wall-drawing-service.js") <
    pageHtml.indexOf("windpost-approval-drawing-service.js")
  );
  assert(
    pageHtml.indexOf("windpost-approval-drawing-service.js") <
    pageHtml.indexOf("l-section-prototype-page.js")
  );
});

console.log(`\n${passed} approval drawing checks passed.`);
