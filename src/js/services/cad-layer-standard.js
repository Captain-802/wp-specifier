(function initialiseCadLayerStandard(global) {
  "use strict";

  // CED windpost/baseplate CAD layer standard.
  //
  // DXF R12 cannot store lineweights, so the printed thickness is carried by
  // the AutoCAD Colour Index, assigned BYLAYER, and reproduced by a plot style
  // table. Every entity is written with no colour of its own; the layer decides
  // both what it is and how thick it plots:
  //
  //   ACI 1  0.50 mm  section-cut windpost and baseplate outlines
  //   ACI 2  0.35 mm  main visible windpost, baseplate and section outlines
  //   ACI 3  0.25 mm  bolts, holes, welds, concrete outlines, secondary detail
  //   ACI 4  0.18 mm  dimensions, text, leaders, hidden lines, centrelines
  //   ACI 5  0.13 mm  steel and concrete hatching
  //   ACI 8  0.09 mm  construction and light reference lines
  //
  // On screen the same colours are used so the drawing reads like the CAD file,
  // but darkened where the raw ACI hue would be unreadable on white paper
  // (ACI 2 yellow above all). Monochrome switches every layer to black and
  // leaves the thickness hierarchy to carry the meaning.
  const windpost = global.Windpost = global.Windpost || {};

  const PEN = Object.freeze([
    Object.freeze({ aci: 1, weight: 0.50, screen: "#d21f1f",
      use: "Section-cut windpost and baseplate outlines" }),
    Object.freeze({ aci: 2, weight: 0.35, screen: "#b8860b",
      use: "Main visible windpost, baseplate and section outlines" }),
    Object.freeze({ aci: 3, weight: 0.25, screen: "#1f8a1f",
      use: "Bolts, holes, welds, concrete outlines and secondary detail" }),
    Object.freeze({ aci: 4, weight: 0.18, screen: "#0e7c86",
      use: "Dimensions, text, leaders, hidden lines and centrelines" }),
    Object.freeze({ aci: 5, weight: 0.13, screen: "#1f4ed8",
      use: "Steel and concrete hatching" }),
    Object.freeze({ aci: 8, weight: 0.09, screen: "#8a8a8a",
      use: "Construction and light reference lines" })
  ]);

  const penOf = aci => PEN.find(pen => pen.aci === aci) || PEN[2];

  // role -> layer. Roles are what the drawing engines tag; layers are what CAD
  // receives. Ordered as they should appear in the layer table.
  const LAYERS = Object.freeze([
    ["steelCut", "S-STEEL-CUT", 1, "CONTINUOUS"],
    ["steel", "S-STEEL-OUTLINE", 2, "CONTINUOUS"],
    ["sectionMark", "S-SECTION-MARKS", 2, "PHANTOM"],
    ["concreteCut", "S-CONCRETE-CUT", 2, "CONTINUOUS"],
    ["hole", "S-HOLES", 3, "CONTINUOUS"],
    ["weld", "S-WELDS", 3, "CONTINUOUS"],
    ["concrete", "S-CONCRETE-OUTLINE", 3, "CONTINUOUS"],
    ["masonry", "S-MASONRY", 3, "CONTINUOUS"],
    ["view3d", "S-3D-VIEW", 3, "CONTINUOUS"],
    ["dim", "S-DIMENSIONS", 4, "CONTINUOUS"],
    ["text", "S-TEXT", 4, "CONTINUOUS"],
    ["leader", "S-LEADERS", 4, "CONTINUOUS"],
    ["hidden", "S-HIDDEN", 4, "HIDDEN"],
    ["centre", "S-CENTRE", 4, "CENTER"],
    ["steelHatch", "S-STEEL-HATCH", 5, "CONTINUOUS"],
    ["concreteHatch", "S-CONCRETE-HATCH", 5, "CONTINUOUS"],
    ["construction", "S-CONSTRUCTION", 8, "CONTINUOUS"]
  ].map(([role, name, aci, linetype]) => Object.freeze({
    role, name, aci, linetype,
    weight: penOf(aci).weight,
    screen: penOf(aci).screen
  })));

  const BY_ROLE = Object.freeze(LAYERS.reduce((map, layer) => {
    map[layer.role] = layer;
    return map;
  }, Object.create(null)));

  const DEFAULT_ROLE = "steel";

  function layerFor(role) {
    return BY_ROLE[role] || BY_ROLE[DEFAULT_ROLE];
  }

  // Screen colour for a role: the layer colour, or black in monochrome.
  function colourFor(role, monochrome) {
    return monochrome ? "#000000" : layerFor(role).screen;
  }

  // Linetype patterns, in millimetres — the sheet is paper space, so the dashes
  // are already the size they plot at.
  const LINETYPES = Object.freeze([
    Object.freeze({ name: "CONTINUOUS", description: "Solid line", pattern: [] }),
    Object.freeze({ name: "HIDDEN", description: "Hidden __ __ __ __",
      pattern: [2.5, -1.25] }),
    Object.freeze({ name: "CENTER", description: "Centre ____ _ ____ _",
      pattern: [6, -1.5, 1.5, -1.5] }),
    Object.freeze({ name: "PHANTOM", description: "Phantom ____ _ _ ____",
      pattern: [8, -1.5, 1.5, -1.5, 1.5, -1.5] })
  ]);

  // The orthographic views carry their meaning in CSS classes rather than a
  // data-cad tag, so those classes map to the same roles. Shared with the
  // exporter so screen and CAD can never disagree about what a line is.
  const CLASS_ROLES = Object.freeze({
    "section-fill": "steelCut",
    "blank-fill": "steelCut",
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

  // The table that lets anyone rebuild the plot style table by hand.
  function penTableLines() {
    return [
      "CED WINDPOST / BASEPLATE - DXF R12 COLOUR TO LINEWEIGHT MAPPING",
      "All entity colours are BYLAYER. Plot every colour black at the width",
      "below (plot style table: CED-WINDPOST-R12.ctb).",
      ""
    ].concat(PEN.map(pen =>
      `  ACI ${String(pen.aci).padEnd(3)} ${pen.weight.toFixed(2)} mm   ${pen.use}`
    )).concat([
      "",
      "LAYERS"
    ]).concat(LAYERS.map(layer =>
      `  ${layer.name.padEnd(20)} ACI ${String(layer.aci).padEnd(3)}` +
      ` ${layer.weight.toFixed(2)} mm  ${layer.linetype}`
    ));
  }

  windpost.cadLayers = Object.freeze({
    PEN, LAYERS, LINETYPES, CLASS_ROLES, DEFAULT_ROLE,
    layerFor, colourFor, paletteCss, penTableLines
  });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.cadLayers;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
