"use strict";

// The A4 production sheet exports to AutoCAD 2000 DXF on the office
// detailer's layer standard: every layer carries its ACI colour and an
// explicit lineweight, outlines are LWPOLYLINEs, cut steel is hatched ANSI31,
// text uses the Arial Standard style and the SALEEM dimension style is in
// the file for hand-added dimensions. These checks read the file back as
// text; `python dxf-audit.py <file>` (ezdxf) is the independent audit.

const assert = require("assert");
const path = require("path");

globalThis.window = globalThis;
const root = path.resolve(__dirname, "..");
["js/services/cad-layer-standard.js", "js/services/dxf-r2000-writer.js", "js/services/sheet-export-service.js"]
  .forEach(file => require(path.join(root, file)));

const W = globalThis.Windpost;
const standard = W.cadLayers;
const writer = W.dxfR2000Writer;
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

const sheet = {
  width_mm: 210, height_mm: 297,
  items: [
    { kind: "poly", role: "construction", points: [[4, 4], [206, 4], [206, 293], [4, 293]], closed: true, stroke: [0, 0, 0], fill: null, width: 0.3 },
    { kind: "poly", role: "steelCut", points: [[40, 100], [40, 60], [70, 60], [70, 64], [44, 64], [44, 100]], closed: true, stroke: [0, 0, 0], fill: null, width: 0.5 },
    { kind: "poly", role: "steel", points: [[100, 60], [160, 60], [160, 200], [100, 200]], closed: true, stroke: [0, 0, 0], fill: null, width: 0.35 },
    { kind: "poly", role: "dim", points: [[100, 210], [160, 210]], closed: false, stroke: [0, 0, 0], fill: null, width: 0.18 },
    { kind: "text", role: "dim", text: "60", x: 128, y: 208, size: 3, rotation: 0, bold: false, fill: [0, 0, 0] },
    { kind: "text", role: "text", text: "LP 125×70×4 — Ø14 ± 1 · 45°", x: 20, y: 30, size: 4, rotation: 90, bold: true, fill: [0, 0, 0] },
    { kind: "circle", role: "hole", cx: 130, cy: 100, r: 7, stroke: [0, 0, 0], fill: null, width: 0.25 },
    { kind: "poly", role: "unknownRole", points: [[1, 1], [2, 2], [3, 1]], closed: false, stroke: [0, 0, 0], fill: null, width: 0.1 },
    { kind: "poly", role: "steel", points: [[1, 1], [2, 2]], closed: false, stroke: null, fill: null, width: 0.1 }
  ]
};

// group-code pairs of the file, for structural checks
function pairs(text) {
  const lines = text.split("\r\n");
  if (lines[lines.length - 1] === "") lines.pop();       // trailing newline only
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([lines[i].trim(), lines[i + 1]]);
  return out;
}

check("the layer standard mirrors the detailer: firm names, ACI colours, explicit lineweights", () => {
  const names = standard.LAYER_TABLE.map(layer => layer.name);
  ["STEEL", "5 FB", "DR-SEC", "Text", "leader", "HATCH", "grid line", "Con. Sections", "0"]
    .forEach(name => assert(names.includes(name), `${name} in the layer table`));
  standard.LAYER_TABLE.forEach(layer => {
    assert(Number.isInteger(layer.aci) && layer.aci >= 1 && layer.aci <= 256, `${layer.name} colour`);
    assert([5, 9, 13, 18, 25, 35].includes(layer.lineweight), `${layer.name} lineweight ${layer.lineweight}`);
  });
  assert.strictEqual(standard.layerFor("steelCut").lineweight, 35);
  assert.strictEqual(standard.layerFor("steelHatch").name, "HATCH");
  assert.strictEqual(standard.layerFor("nonsense").name, "STEEL");
  assert.strictEqual(standard.DIMSTYLE.name, "SALEEM");
  assert.strictEqual(standard.DIMSTYLE.dimclrd, 253);
  assert.strictEqual(standard.DIMSTYLE.dimclrt, 7);
  assert.strictEqual(standard.TEXT_STYLES[0].font, "arial.ttf");
  assert.strictEqual(standard.HATCH.pattern, "ANSI31");
});

let out;
check("the writer produces an AC1015 file with the full table set and the OBJECTS section", () => {
  out = writer.write(sheet, standard);
  const p = pairs(out.text);
  const has = (code, value) => p.some(([c, v]) => c === String(code) && v === value);
  assert(has(1, "AC1015"), "AutoCAD 2000 version");
  assert(has(9, "$LWDISPLAY") && has(290, "1"), "lineweights shown");
  assert(has(9, "$INSUNITS") && has(70, "4"), "millimetres");
  ["VPORT", "LTYPE", "LAYER", "STYLE", "VIEW", "UCS", "APPID", "DIMSTYLE", "BLOCK_RECORD"].forEach(name =>
    assert(p.some(([c, v], i) => c === "2" && v === name && p[i - 1][1] === "TABLE"), `${name} table`));
  ["*Model_Space", "*Paper_Space", "_OBLIQUE"].forEach(name => assert(has(2, name), `${name} block`));
  ["ACAD_GROUP", "ACAD_LAYOUT", "ACAD_MLINESTYLE", "ACAD_PLOTSTYLENAME"].forEach(name => assert(has(3, name), name));
  assert(has(0, "LAYOUT") && has(0, "MLINESTYLE") && has(0, "ACDBPLACEHOLDER"));
  assert(out.text.endsWith("0\r\nEOF\r\n"));
});

check("every layer record carries colour, linetype and lineweight; entities are ByLayer", () => {
  const p = pairs(out.text);
  let layers = 0;
  p.forEach(([c, v], i) => {
    if (c !== "0" || v !== "LAYER") return;
    const record = [];
    for (let k = i + 1; k < p.length && p[k][0] !== "0"; k += 1) record.push(p[k]);
    const code = n => record.find(([cc]) => cc === String(n));
    assert(code(62) && code(6) && code(370), `layer ${code(2)[1]} complete`);
    layers += 1;
  });
  assert.strictEqual(layers, standard.LAYER_TABLE.length);
  // entities: only the dimension text carries its own colour (7, as SALEEM)
  const colours = [];
  const entitiesAt = p.findIndex(([c, v]) => c === "2" && v === "ENTITIES");
  p.forEach(([c, v], i) => {
    if (i > entitiesAt && c === "0" && ["LINE", "LWPOLYLINE", "CIRCLE", "TEXT", "HATCH"].includes(v)) {
      for (let k = i + 1; k < p.length && p[k][0] !== "0"; k += 1) if (p[k][0] === "62") colours.push([v, p[k][1]]);
    }
  });
  assert.deepStrictEqual(colours, [["TEXT", "7"]]);
});

check("outlines become LWPOLYLINEs, cut steel is hatched ANSI31, unstroked shapes are dropped", () => {
  assert.deepStrictEqual(out.counts, { line: 1, polyline: 4, circle: 1, text: 2, hatch: 1 });
  const p = pairs(out.text);
  const hatchAt = p.findIndex(([c, v]) => c === "0" && v === "HATCH");
  const hatch = p.slice(hatchAt, hatchAt + 60);
  assert(hatch.some(([c, v]) => c === "2" && v === "ANSI31"));
  assert(hatch.some(([c, v]) => c === "8" && v === "HATCH"), "hatch on the HATCH layer");
  assert(hatch.some(([c, v]) => c === "53" && Number(v) === 45), "45 degree lines");
  const unknownAt = p.findIndex(([c, v]) => c === "8" && v === "STEEL");
  assert(unknownAt > 0, "unknown roles fall on the default STEEL layer");
});

check("text is folded to DXF control codes and set in the Arial Standard style, y flipped", () => {
  const p = pairs(out.text);
  const textAt = p.findIndex(([c, v]) => c === "1" && v.startsWith("LP 125x70x4"));
  assert(textAt > 0);
  assert.strictEqual(p[textAt][1], "LP 125x70x4 - %%c14 %%p 1 - 45%%d");
  const block = p.slice(textAt - 8, textAt + 6);
  assert(block.some(([c, v]) => c === "7" && v === "Standard"));
  assert(block.some(([c, v]) => c === "50" && Number(v) === 90));
  assert(block.some(([c, v]) => c === "20" && Number(v) === 297 - 30));
  assert(!/[^\x00-\x7F]/.test(out.text), "pure ASCII file");
});

check("handles are unique and $HANDSEED is above every handle", () => {
  const p = pairs(out.text);
  const seedIndex = p.findIndex(([c, v]) => c === "9" && v === "$HANDSEED");
  const seed = parseInt(p[seedIndex + 1][1], 16);
  const own = p.filter(([c], i) => (c === "5" || c === "105") && i !== seedIndex + 1).map(([, v]) => v);
  assert.strictEqual(new Set(own).size, own.length, "no duplicate handles");
  assert(own.every(v => parseInt(v, 16) < seed), "seed beyond the last handle");
  const owners = p.filter(([c]) => c === "330").map(([, v]) => v).filter(v => v !== "0");
  const known = new Set(own);
  assert(owners.every(v => known.has(v)), "every owner handle exists");
});

check("sheetExport.toDxf delegates to the writer and the page loads it first", () => {
  const text = W.sheetExport.toDxf(sheet);
  assert(text.includes("AC1015") && text.includes("SALEEM"));
  const html = require("fs").readFileSync(path.join(root, "l-section-prototype.html"), "utf8");
  assert(html.indexOf("dxf-r2000-writer.js") < html.indexOf("sheet-export-service.js"));
  assert(html.indexOf("cad-layer-standard.js") < html.indexOf("dxf-r2000-writer.js"));
});

console.log(`\n${passed} DXF export checks passed.`);
