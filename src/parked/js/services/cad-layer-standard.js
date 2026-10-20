(function initialiseCadLayerStandard(global) {
  "use strict";

  // CED windpost / baseplate CAD layer standard — the same drawing standard
  // as the office beam, column, wall and foundation detailer (measured from
  // BEAM DETAILING.dwg, COLUMN.dxf, LIFT ELEVATOR.dxf, FOUNDATION PLAN.dxf):
  //
  //   * every layer carries an ACI colour AND an explicit lineweight
  //     (1/100 mm), so AutoCAD shows and plots the line hierarchy directly
  //     (LWDISPLAY on) — no plot style table is needed;
  //   * the firm's own layer names are used wherever the windpost drawing has
  //     the same kind of line (STEEL, 5 FB concrete, DR-SEC dimensions, Text,
  //     leader, HATCH, grid line); windpost-only lines get names in the same
  //     plain style;
  //   * text style Standard = arial.ttf; dimension style SALEEM with the
  //     firm's grey dimension lines (253), white text (7) and oblique ticks;
  //   * steel sections are hatched ANSI31 on HATCH, as the column sections.
  //
  // On screen the same colours are used so the drawing reads like the CAD
  // file, darkened where the raw ACI hue would be unreadable on white paper
  // (ACI 50 yellow above all). Monochrome switches every layer to black and
  // leaves the thickness hierarchy to carry the meaning.
  const windpost = global.Windpost = global.Windpost || {};

  // Lineweight codes: -3 ByDefault, 5 = 0.05 mm, 9 = 0.09, 13 = 0.13,
  // 18 = 0.18, 25 = 0.25, 35 = 0.35 (as the detailer's LayerDef table).
  const PEN = Object.freeze([
    Object.freeze({ lineweight: 35, weight: 0.35, use: "Section-cut windpost and baseplate outlines; schedule borders" }),
    Object.freeze({ lineweight: 25, weight: 0.25, use: "Main visible steel and concrete outlines, callout text" }),
    Object.freeze({ lineweight: 18, weight: 0.18, use: "Concrete and masonry outlines, hatching" }),
    Object.freeze({ lineweight: 13, weight: 0.13, use: "Holes, welds, section marks, grid and centre lines" }),
    Object.freeze({ lineweight: 9, weight: 0.09, use: "Dimensions, leaders, hidden lines, 3D view" }),
    Object.freeze({ lineweight: 5, weight: 0.05, use: "Construction and light reference lines" })
  ]);

  // role -> layer. Roles are what the drawing engines tag; layers are what
  // CAD receives. Ordered as they should appear in the layer table.
  //   [role, name, ACI colour, lineweight 1/100 mm, linetype, screen colour,
  //    description, which of the firm's drawings the layer comes from]
  const LAYERS = Object.freeze([
    ["steelCut", "STEEL CUT", 1, 35, "Continuous", "#d21f1f",
      "Section-cut windpost and baseplate outlines (hatched)", "windpost (Rein: red 0.35)"],
    // steel seen face-on (plate in plan, unfolded blank): same heavy line, no hatch
    ["steelFace", "STEEL CUT", 1, 35, "Continuous", "#d21f1f",
      "Plate in plan and unfolded blank outlines", "windpost"],
    ["steel", "STEEL", 50, 25, "Continuous", "#b8860b",
      "Visible windpost, baseplate and section outlines", "long section"],
    ["sectionMark", "SECTION MARK", 10, 13, "PHANTOM2", "#c0392b",
      "Section cut marks", "windpost (Text-3: 10)"],
    ["concreteCut", "5 FB", 124, 25, "Continuous", "#007f5f",
      "Concrete cut outlines", "beam"],
    ["concrete", "Con. Sections", 30, 18, "Continuous", "#d2691e",
      "Concrete outlines in elevation", "wall"],
    ["hole", "HOLES", 4, 13, "Continuous", "#0e7c86",
      "Bolt and anchor holes, slots", "windpost (cyan: 4)"],
    ["weld", "WELDS", 30, 13, "Continuous", "#d2691e",
      "Weld symbols and fillets", "windpost"],
    ["masonry", "MASONRY", 21, 18, "Continuous", "#c77b5c",
      "Brick and block outlines", "windpost (WALL LIFT: 21)"],
    ["view3d", "3D VIEW", 5, 9, "Continuous", "#1f4ed8",
      "Isometric and 3D view lines", "windpost (2 column: 5 0.09)"],
    ["dim", "DR-SEC", 253, 9, "Continuous", "#7a7a7a",
      "Dimensions: grey lines, white text (SALEEM)", "beam"],
    ["text", "Text", 115, 25, "Continuous", "#3f7f5f",
      "Callouts, titles and notes", "beam"],
    ["leader", "leader", 3, 9, "Continuous", "#1f8a1f",
      "Leaders and their arrowheads", "long section"],
    ["hidden", "HIDDEN", 8, 9, "HIDDEN2", "#8a8a8a",
      "Hidden lines", "windpost"],
    ["centre", "grid line", 8, 13, "DASHDOT2", "#8a8a8a",
      "Centre, bend and grid lines", "foundation plan"],
    ["steelHatch", "HATCH", 252, 18, "Continuous", "#666666",
      "ANSI31 hatch inside cut steel", "long section"],
    ["concreteHatch", "HATCH", 252, 18, "Continuous", "#666666",
      "Hatch inside cut concrete", "long section"],
    ["construction", "0", 7, 5, "Continuous", "#555555",
      "Construction and reference lines, sheet border", "beam"]
  ].map(([role, name, aci, lineweight, linetype, screen, description, source]) =>
    Object.freeze({
      role, name, aci, lineweight, linetype, screen, description, source,
      weight: lineweight > 0 ? lineweight / 100 : 0.25
    })));

  const BY_ROLE = Object.freeze(LAYERS.reduce((map, layer) => {
    map[layer.role] = layer;
    return map;
  }, Object.create(null)));

  // The distinct layer records (HATCH is shared by two roles).
  const LAYER_TABLE = Object.freeze(LAYERS.filter((layer, index) =>
    LAYERS.findIndex(other => other.name === layer.name) === index));

  const DEFAULT_ROLE = "steel";

  function layerFor(role) {
    return BY_ROLE[role] || BY_ROLE[DEFAULT_ROLE];
  }

  // Screen colour for a role: the layer colour, or black in monochrome.
  function colourFor(role, monochrome) {
    return monochrome ? "#000000" : layerFor(role).screen;
  }

  // Linetype patterns, in millimetres — the sheet is paper space, so the
  // dashes are already the size they plot at. Named as AutoCAD's ISO set.
  const LINETYPES = Object.freeze([
    Object.freeze({ name: "Continuous", description: "Solid line", pattern: [] }),
    Object.freeze({ name: "HIDDEN2", description: "Hidden (.5x) __ __ __ __",
      pattern: [3.175, -1.5875] }),
    Object.freeze({ name: "DASHDOT2", description: "Dash dot (.5x) __ . __ . __",
      pattern: [6.35, -3.175, 0, -3.175] }),
    Object.freeze({ name: "PHANTOM2", description: "Phantom (.5x) ____ _ _ ____",
      pattern: [15.875, -3.175, 3.175, -3.175, 3.175, -3.175] })
  ]);

  // Text styles: the detailer writes Standard and Writing, both Arial.
  const TEXT_STYLES = Object.freeze([
    Object.freeze({ name: "Standard", font: "arial.ttf" }),
    Object.freeze({ name: "Writing", font: "arial.ttf" })
  ]);

  // Dimension style SALEEM, in sheet millimetres (the detailer's inch values
  // scaled to the A4 paper sheet), oblique ticks, grey lines, white text.
  const DIMSTYLE = Object.freeze({
    name: "SALEEM",
    dimtxt: 2.5, dimasz: 1.2, dimexe: 1.0, dimexo: 0.6, dimgap: 0.6,
    dimtad: 1, dimtih: 0, dimtoh: 0, dimdec: 0, dimlunit: 2,
    dimclrd: 253, dimclre: 253, dimclrt: 7,
    arrow: "_OBLIQUE", textStyle: "Standard"
  });

  // Section hatching, as the column sections: ANSI31 at 45 degrees. Spacing
  // in sheet millimetres — 1.0 mm reads clearly inside a 4-8 mm plate at A4.
  const HATCH = Object.freeze({
    pattern: "ANSI31", angle: 45, spacing_mm: 1.0, roles: ["steelCut"]
  });

  // The orthographic views carry their meaning in CSS classes rather than a
  // data-cad tag, so those classes map to the same roles. Shared with the
  // exporter so screen and CAD can never disagree about what a line is.
  const CLASS_ROLES = Object.freeze({
    "section-fill": "steelCut",
    "blank-fill": "steelFace",
    "elevation-fill": "steel",
    "slot-cutout": "hole",
    "fold-tangent": "steel",
    "bend-line": "centre",
    "dimension-line": "dim",
    "extension": "dim",
    "dimension-text": "dim",
    "view-title": "text",
    "section-size": "text",
    "sheet-title": "text",
    "sheet-subtitle": "text",
    "sheet-border": "construction",
    "projection-lines": "construction"
  });

  // Stylesheet that paints every drawing by CAD layer — the same colours CAD
  // will show — or all black in monochrome, leaving thickness to carry the
  // hierarchy. Only stroke and text fill are set, so hatch patterns and plate
  // fills are left alone.
  function paletteCss(monochrome) {
    const rules = [];
    // !important because each A4 viewport carries its own id-scoped copy of the
    // source stylesheet, which would otherwise outrank these by specificity.
    // Only colour is forced; stroke WIDTH stays with the drawing.
    const paint = (selector, colour) => {
      rules.push(`${selector},${selector} *{stroke:${colour}!important}`);
      rules.push(`${selector} text,${selector} tspan,text${selector}` +
        `{fill:${colour}!important;stroke:none!important}`);
    };
    LAYERS.forEach(layer => {
      const colour = monochrome ? "#000000" : layer.screen;
      paint(`[data-cad="${layer.role}"]`, colour);
      Object.keys(CLASS_ROLES)
        .filter(name => CLASS_ROLES[name] === layer.role)
        .forEach(name => paint(`.${name}`, colour));
    });
    const leader = monochrome ? "#000000" : layerFor("leader").screen;
    rules.push(`[data-cad="leader"] polygon{fill:${leader}!important}`);
    return rules.join("");
  }

  // The layer key, written into the DXF as comments so the standard travels
  // with every drawing.
  function penTableLines() {
    return [
      "CED WINDPOST / BASEPLATE - DXF LAYER STANDARD (as the beam and column detailer)",
      "Every layer carries its colour and lineweight; entities are ByLayer.",
      "Text style Standard = arial.ttf. Dimension style SALEEM (oblique ticks,",
      "grey 253 lines, white 7 text). Cut steel hatched ANSI31 on HATCH.",
      "",
      "LAYERS  (name / ACI colour / lineweight mm / linetype / use)"
    ].concat(LAYER_TABLE.map(layer =>
      `  ${layer.name.padEnd(14)} ${String(layer.aci).padEnd(4)}` +
      ` ${layer.weight.toFixed(2)} mm  ${layer.linetype.padEnd(11)} ${layer.description}`
    ));
  }

  windpost.cadLayers = Object.freeze({
    PEN, LAYERS, LAYER_TABLE, LINETYPES, TEXT_STYLES, DIMSTYLE, HATCH,
    CLASS_ROLES, DEFAULT_ROLE,
    layerFor, colourFor, paletteCss, penTableLines
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.cadLayers;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
