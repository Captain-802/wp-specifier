"use strict";

// Deployment and hand-off behaviour (12 Sep 2026 audit): the built pages
// link to each other by their built names, the Detailing page draws only the
// connection the Selector handed over, the Selector draws the concrete-top
// plate only when that fixing is selected, and data gaps are surfaced as
// notes instead of silent zeros.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
const root = path.resolve(__dirname, "..");
[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/engines/fold-width-engine.js",
  "js/data/l-section-database.js",
  "js/data/u-section-database.js",
  "js/data/du-section-database.js",
  "js/data/connections-database.js",
  "js/data/standard-base-plate-types.js",
  "js/data/du-slab-face-plates.js",
  "js/engines/secant-modulus-engine.js",
  "js/engines/load-case-engine.js",
  "js/engines/tie-capacity-engine.js",
  "js/engines/result-selection-engine.js",
  "js/engines/windpost-calculation-engine.js",
  "js/engines/baseplate-config.js",
  "js/engines/baseplate-bolt-engine.js",
  "js/engines/baseplate-leff-engine.js",
  "js/engines/baseplate-tstub-engine.js",
  "js/engines/baseplate-stiffener-engine.js",
  "js/engines/baseplate-shear-engine.js",
  "js/engines/baseplate-check-engine.js",
  "js/engines/baseplate-sizer-engine.js",
  "js/engines/baseplate-design-engine.js",
  "js/services/baseplate-svg-engine.js",
  "js/services/baseplate-drawing-service.js",
  "js/services/u-baseplate-geometry-engine.js",
  "js/engines/simply-u-baseplate-standard-engine.js",
  "js/engines/simply-l-baseplate-standard-engine.js",
  "js/services/simply-u-baseplate-drawing-service.js",
  "js/services/simply-l-baseplate-drawing-service.js",
  "js/services/du-slab-face-drawing-service.js",
  "js/services/windpost-scene-mesh-engine.js",
  "js/services/cavity-wall-3d-engine.js",
  "js/services/l-section-orthographic-service.js",
  "js/services/u-section-orthographic-service.js",
  "js/services/du-section-orthographic-service.js",
  "js/services/l-cantilever-baseplate-prototype-service.js",
  "js/engines/connection-selection-engine.js",
  "js/engines/selector/selector-baseplate-routing-engine.js",
  "js/engines/workflow/design-transfer-engine.js",
  "js/services/cad-layer-standard.js",
  "js/services/dxf-r2000-writer.js"
].forEach(file => require(path.join(root, file)));

const W = globalThis.Windpost;
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const u = name => W.uSectionDatabase.sections.find(s => s.name === name);
const l = name => W.lSectionDatabase.sections.find(s => s.name === name);
const du = name => W.duSectionDatabase.sections.find(s => s.name === name);

function selection(section, supportCondition, length_mm) {
  return {
    inputs: { type: section.type, supportCondition, length_mm, loadType: "udl" },
    selected: { section, finalCapacity_kN: 5, calculation: { numberOfTies: 8 } }
  };
}

function connections(section, supportCondition, length_mm, headFixing, baseFixing) {
  return W.connectionSelectionEngine.select({
    type: section.type, supportCondition, loadType: "udl", length_mm, section,
    finalCapacity_kN: 5, numberOfTies: 8, headFixing, baseFixing
  });
}

check("the hand-off targets the built Detailing page when the Selector runs as the built file", () => {
  const engine = W.designTransferEngine;
  const design = { selected: { section: u("UP 90x60x4"), finalCapacity_kN: 5, wall: {} }, inputs: { length_mm: 2670, supportCondition: "simplySupported", loadType: "udl" } };
  const asSplit = engine.snapshot(design, null, { pathname: "/wp-specifier/index.html" });
  const asFull = engine.snapshot(design, null, { pathname: "/client/Windpost-Selector-Full.html" });
  assert(engine.href(asSplit).startsWith("./l-section-prototype.html?"));
  assert(engine.href(asFull).startsWith("./Windpost-Detailing-Full.html?"));
  assert.strictEqual(engine.detailingFileName(asFull), "Windpost-Detailing-Full.html");
  assert.strictEqual(engine.href({ ...asSplit, length_mm: 12001 }), "", "outside 300-12000 mm there is no hand-off");
});

check("the concrete-top plate is drawn only when U-B3 / L-B2 is the selected base fixing", () => {
  const routing = W.selectorBaseplateRoutingEngine;
  const up = u("UP 90x60x4");
  const timber = connections(up, "simplySupported", 2670, "U POST TO TIMBER JOIST BB", "U POST TO TIMBER JOIST TB");
  const concrete = connections(up, "simplySupported", 2670, "U POST TO TIMBER JOIST BB", "U POST TO CONCRETE TOP ");
  assert(timber.valid && concrete.valid, "both fixings resolve");
  assert.strictEqual(routing.design(selection(up, "simplySupported", 2670), timber), null, "timber joist base: no drawn plate");
  const plate = routing.design(selection(up, "simplySupported", 2670), concrete);
  assert(plate && plate.ok && plate.design.typeCode === "U-B3B", "concrete top: U-B3B for a 90 deep U");
  assert(routing.design(selection(up, "simplySupported", 2670)), "headless callers without connections still get the plate");
  const lp = l("LP 150x70x4");
  const lTimber = connections(lp, "simplySupported", 2670, "L POST TO TIMBER JOIST ", "L POST TO TIMBER JOIST");
  assert.strictEqual(routing.design(selection(lp, "simplySupported", 2670), lTimber), null);
  const cant = routing.design(selection(lp, "cantilever", 2000), lTimber);
  assert(cant && cant.ok, "cantilever plates do not depend on the base fixing");
});

check("the Detailing page draws the handed-over DU connections, or a note for ones without a detail", () => {
  const proto = W.lCantileverBaseplatePrototype;
  const section = du("DU 70x60x6");
  const direct = proto.design(section, 2670, "udl", { mode: "hatch", supportCondition: "simplySupported" });
  assert(direct.ok && !direct.omitted && !direct.omittedTop && direct.topTypeCode === "DU-T2" && direct.design.typeCode === "DU-B2", "direct open: DU-T2 / DU-B2 as before");
  const selected = proto.design(section, 2670, "udl", { mode: "hatch", supportCondition: "simplySupported", headCode: "DU-T2", baseCode: "DU-B2" });
  assert(!selected.omitted && !selected.omittedTop && selected.svg.includes("bp-plan"));
  const other = proto.design(section, 2670, "udl", { mode: "hatch", supportCondition: "simplySupported", headCode: "DU-T1", baseCode: "DU-B1" });
  assert(other.ok && other.omitted && other.omittedTop, "DU-T1 / DU-B1 have no drawn detail");
  assert.strictEqual(other.topTypeCode, "DU-T1");
  assert.strictEqual(other.design.typeCode, "DU-B1");
  assert(other.svg.includes('id="bp-plan"') && other.svg.includes('id="bp-side"'), "the note sits in the sheet's zones");
  assert(other.svg.includes("BASE CONNECTION DU-B1") && other.svg.includes("DU POST TO TIMBER JOIST"), "the note names the selected fixing");
  assert(other.topSvg.includes("TOP CONNECTION DU-T1"));
  assert(!other.svg.includes("DU-B2") && !other.topSvg.includes("DU-T2"), "no DU-T2 / DU-B2 drawing for other fixings");
});

check("the Detailing page omits the concrete-top plate for other simply-supported base fixings", () => {
  const proto = W.lCantileverBaseplatePrototype;
  const up = u("UP 90x60x4");
  const plate = proto.design(up, 2670, "udl", { mode: "hatch", supportCondition: "simplySupported", baseCode: "U-B3B" });
  assert(plate.ok && !plate.omitted && plate.design.typeCode === "U-B3B");
  const timber = proto.design(up, 2670, "udl", { mode: "hatch", supportCondition: "simplySupported", baseCode: "U-B1B" });
  assert(timber.ok && timber.omitted && timber.design.typeCode === "U-B1B" && timber.svg.includes("BASE CONNECTION U-B1B"));
  assert(timber.svg.includes("U POST TO TIMBER JOIST TB"));
  const lp = l("LP 150x70x4");
  const lTimber = proto.design(lp, 2670, "udl", { mode: "hatch", supportCondition: "simplySupported", baseCode: "L-B1" });
  assert(lTimber.omitted && lTimber.design.typeCode === "L-B1");
  const direct = proto.design(lp, 2670, "udl", { mode: "hatch", supportCondition: "simplySupported" });
  assert(!direct.omitted && direct.design.typeCode === "L-B2A");
});

check("DU-T3 is a concrete fixing (anchor families offered) and missing bolt quantities become notes", () => {
  const engine = W.connectionSelectionEngine;
  const t3 = engine.findByCode("DU-T3");
  assert.strictEqual(t3.materialClass, "CONCRETE");
  assert(engine.boltFamiliesFor(t3.materialClass).length === 3, "RGM / FAZ II / FAZ II PLUS");
  const duConn = connections(du("DU 70x60x6"), "simplySupported", 2670, "DU POST TO SLAB UNDERSIDE", "DU POST TO TIMBER JOIST");
  assert(duConn.valid && duConn.head.boltCount > 0 && /RG M|FAZ/.test(duConn.head.boltSku), "DU-T3 gets an anchor and a count");
  const timber = connections(u("UP 55x60x4"), "simplySupported", 2670, "U POST TO TIMBER JOIST BA", "U POST TO TIMBER JOIST TA");
  assert(timber.valid, "a note never invalidates the result");
  assert.strictEqual(timber.base.boltCount, 0, "the workbook matrix has no KM12/100 quantity under U-B1A");
  assert(timber.notes.some(n => n.includes("KM12/100") && n.includes("U-B1A")), "and the result says so");
  assert(timber.head.boltCount === 2 && !timber.notes.some(n => n.includes("U-T1A")), "U-T1A has its quantity, no note");
});

check("DXF hatches carry ANSI31 rotation/scale that regenerate the stored 45-degree lines, and dashed untagged lines are hidden lines", () => {
  const writer = W.dxfR2000Writer;
  const text = writer.write({
    width_mm: 210, height_mm: 297,
    items: [{ kind: "poly", role: "steelCut", points: [[40, 100], [40, 60], [70, 60], [70, 100]], closed: true, stroke: [0, 0, 0], fill: null, width: 0.5 }]
  }, W.cadLayers).text;
  const hatch = text.slice(text.indexOf("AcDbHatch"));
  assert(hatch.length > 100, "a hatch entity was written for the cut steel");
  const has = (code, value) => new RegExp(`\\r?\\n *${code}\\r?\\n${value.replace(".", "\\.")}\\r?\\n`).test(hatch);
  assert(has(52, "0.0000"), "no extra rotation on top of the 45-degree definition line");
  assert(has(41, "0.3150"), "scale = 1.0 mm / 3.175 mm");
  assert(has(53, "45.0000"), "definition line stays at 45 degrees");
  const lines = writer.ansi31(1.0, 45)[0];
  assert(Math.abs(Math.hypot(lines.offset[0], lines.offset[1]) - 1.0) < 1e-9, "offset equals the spacing");
});

check("the DU slab-face elevation dashes the plate edge the post actually covers", () => {
  // the elevation is the last hidden group (the plan's anchor symbols come first)
  const horizontals = svg => [...svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)]
    .filter(m => m[2] === m[4]).map(m => Number(m[2]));
  const lastGroup = (svg, role) => [...svg.matchAll(new RegExp(`<g data-cad="${role}">([\\s\\S]*?)</g>`, "g"))].map(m => m[1]).pop();
  const top = W.duSlabFaceDrawing.draw("DU-T2", du("DU 60x60x6")).svg;
  const hiddenT = horizontals(lastGroup(top, "hidden"));
  const edgesT = horizontals(lastGroup(top, "steelFace"));
  assert(hiddenT.length === 1 && edgesT.length === 3, "one hidden edge, three visible edge pieces");
  assert.strictEqual(hiddenT[0], Math.max(...edgesT), "top plate: the bottom edge is behind the post");
  assert(edgesT.filter(y => y === Math.max(...edgesT)).length === 2, "the covered edge is drawn in two pieces with a gap");
  const base = W.duSlabFaceDrawing.draw("DU-B2", du("DU 60x60x6")).svg;
  const hiddenB = horizontals(lastGroup(base, "hidden"));
  const edgesB = horizontals(lastGroup(base, "steelFace"));
  assert.strictEqual(hiddenB[0], Math.min(...edgesB), "bottom plate: the top edge is behind the post");
});

check("the build ships every page the others link to, and the update script runs every suite", () => {
  const build = fs.readFileSync(path.join(root, "build-standalone.js"), "utf8");
  ["index.html", "l-section-prototype.html", "cavity-wall-assembly.html", "print-calibration.html"].forEach(page =>
    assert(build.includes(`source: "${page}"`), `${page} is built`));
  const cmd = fs.readFileSync(path.join(root, "UPDATE-FROM-EXCEL.cmd"), "utf8");
  assert(cmd.includes('for %%t in ("tests\\*.js")'), "all suites gate the rebuild");
  const page = fs.readFileSync(path.join(root, "js/ui/app.js"), "utf8");
  assert(page.includes("Windpost-CavityWall-Full.html") && page.includes("windpost.detailing.fromSelector"));
  const detailing = fs.readFileSync(path.join(root, "l-section-prototype.html"), "utf8");
  assert(detailing.includes('id="print-calibration-link"') && detailing.includes('target="_blank"') && detailing.includes('id="page-notice"'));
  assert(!fs.readFileSync(path.join(root, "js/ui/l-section-prototype-page.js"), "utf8").includes("global.alert("), "no alerts on the Detailing page");
});

console.log(`\n${passed} deployment checks passed.`);
