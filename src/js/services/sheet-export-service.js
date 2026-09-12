(function initialiseSheetExportService(global) {
  "use strict";

  // Export the composed A4 sheet to DXF and PDF.
  //
  // Both writers run off ONE flattening pass that walks the live sheet SVG and
  // resolves every nested viewport transform into plain sheet millimetres, so
  // the two formats cannot drift apart. The sheet is paper space: the geometry
  // comes out at the size it prints, and each viewport keeps its own scale
  // (stated in that zone's caption).
  const windpost = global.Windpost = global.Windpost || {};

  const PT_PER_MM = 72 / 25.4;

  function styleOf(element) {
    const computed = global.getComputedStyle(element);
    return {
      display: computed.display,
      visibility: computed.visibility,
      stroke: computed.stroke,
      fill: computed.fill,
      strokeWidth: parseFloat(computed.strokeWidth) || 0,
      fontSize: parseFloat(computed.fontSize) || 0,
      bold: (parseInt(computed.fontWeight, 10) || 400) >= 600
    };
  }

  // "rgb(r, g, b)" / "none" -> [r,g,b] 0-1, or null when nothing is painted.
  function colourOf(value) {
    if (!value || value === "none" || value === "transparent") return null;
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return [0, 0, 0];
    const parts = match[1].split(",").map(Number);
    if (parts.length > 3 && parts[3] === 0) return null;
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }

  function zoneOf(element) {
    let node = element;
    while (node && node.getAttribute) {
      const zone = node.getAttribute("data-zone");
      if (zone) return zone;
      node = node.parentNode;
    }
    return "SHEET";
  }

  // Class-to-role map lives with the layer standard, so screen and CAD agree.
  const classRoles = () =>
    (windpost.cadLayers && windpost.cadLayers.CLASS_ROLES) || {};

  // What a piece of geometry IS, for layering. An explicit data-cad tag on the
  // element or any ancestor wins; otherwise the orthographic classes decide;
  // otherwise fall back on the element type.
  function roleOf(element) {
    const roles = classRoles();
    let node = element;
    while (node && node.getAttribute) {
      const role = node.getAttribute("data-cad");
      if (role) return role;
      const classes = node.getAttribute("class");
      if (classes) {
        const match = classes.split(/\s+/).find(name => roles[name]);
        if (match) return roles[match];
      }
      node = node.parentNode;
    }
    const tag = element.tagName.toLowerCase();
    if (tag === "text" || tag === "tspan") return "text";
    if (tag === "circle") return "hole";
    // an untagged dashed line is a hidden line, never a continuous steel edge
    const dash = element.getAttribute("stroke-dasharray");
    if (dash && dash !== "none" && dash !== "0") return "hidden";
    return windpost.cadLayers ? windpost.cadLayers.DEFAULT_ROLE : "steel";
  }

  // A path built only from straight-line commands is read back from those
  // commands, so the export keeps the profile's own vertices. Sampling such a
  // path by arc length would replace a clean outline with hundreds of 0.35 mm
  // fragments, which is what makes a section read as a dotted line in CAD.
  // Returns null when the path holds curves, which still have to be sampled.
  // Every subpath (each M after the first, or anything after a Z) is its own
  // outline: a DU plan holds two channel loops in one path and a broken
  // extension line holds two strokes, and neither may be bridged.
  function straightPathPoints(d) {
    if (!d || /[aAcCqQsStT]/.test(d)) return null;
    const tokens = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
    const subpaths = [];
    let points = [];
    let closed = false;
    const flush = () => {
      if (points.length > 1) subpaths.push({ points, closed });
      points = [];
      closed = false;
    };
    let x = 0, y = 0, startX = 0, startY = 0, command = "";
    let index = 0;
    const next = () => Number(tokens[index++]);
    while (index < tokens.length) {
      const token = tokens[index];
      if (/[MmLlHhVvZz]/.test(token)) {
        command = token;
        index++;
        if (command === "Z" || command === "z") {
          closed = true;
          x = startX; y = startY;
          flush();
          continue;
        }
        if ((command === "M" || command === "m") && points.length) flush();
      }
      if (index >= tokens.length) break;
      if (command === "M" || command === "L") { x = next(); y = next(); }
      else if (command === "m" || command === "l") { x += next(); y += next(); }
      else if (command === "H") x = next();
      else if (command === "h") x += next();
      else if (command === "V") y = next();
      else if (command === "v") y += next();
      else return null;                       // unknown command, play it safe
      if (command === "M" || command === "m") {
        startX = x; startY = y;
        // an implicit lineto follows a moveto's first pair
        command = command === "M" ? "L" : "l";
      }
      points.push([x, y]);
    }
    flush();
    return subpaths.length ? subpaths : null;
  }

  // The subpaths of a curved path, each as its own path data, so that curves
  // are sampled one outline at a time as well.
  function splitSubpaths(d) {
    const parts = String(d || "").match(/[Mm][^Mm]*/g) || [];
    return parts.length > 1 ? parts.map(part => part.trim()) : [String(d || "")];
  }

  function flatten(root) {
    const rootMatrix = root.getScreenCTM();
    if (!rootMatrix) {
      throw new Error("The sheet must be rendered on screen before it is exported.");
    }
    const inverse = rootMatrix.inverse();
    const probe = root.ownerSVGElement || root;
    const point = probe.createSVGPoint();
    const viewBox = (root.getAttribute("viewBox") || "0 0 210 297").split(/\s+/).map(Number);
    const width_mm = viewBox[2], height_mm = viewBox[3];
    const items = [];

    const toSheet = (matrix, x, y) => {
      point.x = x; point.y = y;
      const mapped = point.matrixTransform(matrix);
      return [mapped.x, mapped.y];
    };
    const scaleOf = matrix =>
      Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) || 1;

    const pushShape = (element, style, matrix, points, closed) => {
      if (points.length < 2) return;
      items.push({
        kind: "poly",
        zone: zoneOf(element),
        role: roleOf(element),
        points,
        closed: Boolean(closed),
        stroke: colourOf(style.stroke),
        fill: colourOf(style.fill),
        width: style.strokeWidth * scaleOf(matrix)
      });
    };

    const emitText = (node, owner, matrix, style) => {
      const content = (node.textContent || "").trim();
      if (!content || typeof node.getStartPositionOfChar !== "function") return;
      let start;
      try { start = node.getStartPositionOfChar(0); } catch (error) { return; }
      const [x, y] = toSheet(matrix, start.x, start.y);
      items.push({
        kind: "text",
        zone: zoneOf(owner),
        role: roleOf(owner),
        text: content,
        x, y,
        size: style.fontSize * scaleOf(matrix),
        // Baseline direction in a y-up space, so both writers can use it as is.
        rotation: Math.atan2(-matrix.b, matrix.a) * 180 / Math.PI,
        bold: style.bold,
        fill: colourOf(style.fill) || [0, 0, 0]
      });
    };

    root.querySelectorAll("*").forEach(element => {
      const tag = element.tagName.toLowerCase();
      if (tag === "defs" || element.closest("defs")) return;
      // Screen-only furniture (zone frames) is a reading aid, not drawing, so
      // it is left out of every export.
      if (element.closest('[data-export="screen"]')) return;
      const style = styleOf(element);
      if (style.display === "none" || style.visibility === "hidden") return;
      if (tag === "text") {
        const matrix = inverse.multiply(element.getScreenCTM());
        const spans = element.querySelectorAll("tspan");
        if (spans.length) {
          spans.forEach(span => emitText(span, element, matrix, styleOf(span)));
        } else {
          emitText(element, element, matrix, style);
        }
        return;
      }
      if (["line", "rect", "circle", "polygon", "polyline", "path"].indexOf(tag) < 0) return;
      const matrix = inverse.multiply(element.getScreenCTM());
      const number = name => Number(element.getAttribute(name)) || 0;

      if (tag === "line") {
        pushShape(element, style, matrix, [
          toSheet(matrix, number("x1"), number("y1")),
          toSheet(matrix, number("x2"), number("y2"))
        ], false);
      } else if (tag === "rect") {
        const x = number("x"), y = number("y");
        const w = number("width"), h = number("height");
        pushShape(element, style, matrix, [
          toSheet(matrix, x, y), toSheet(matrix, x + w, y),
          toSheet(matrix, x + w, y + h), toSheet(matrix, x, y + h)
        ], true);
      } else if (tag === "circle") {
        const [cx, cy] = toSheet(matrix, number("cx"), number("cy"));
        items.push({
          kind: "circle",
          zone: zoneOf(element),
          role: roleOf(element),
          cx, cy,
          r: number("r") * scaleOf(matrix),
          stroke: colourOf(style.stroke),
          fill: colourOf(style.fill),
          width: style.strokeWidth * scaleOf(matrix)
        });
      } else if (tag === "polygon" || tag === "polyline") {
        const raw = (element.getAttribute("points") || "")
          .trim().split(/[\s,]+/).map(Number);
        const points = [];
        for (let i = 0; i + 1 < raw.length; i += 2) {
          points.push(toSheet(matrix, raw[i], raw[i + 1]));
        }
        pushShape(element, style, matrix, points, tag === "polygon");
      } else {
        const d = (element.getAttribute("d") || "").trim();
        const exact = straightPathPoints(d);
        if (exact) {
          // Straight-line outlines: keep their own vertices, one shape per
          // subpath.
          exact.forEach(sub => {
            const points = sub.points.map(([px, py]) => toSheet(matrix, px, py));
            if (sub.closed && points.length > 1) {
              const first = points[0], last = points[points.length - 1];
              if (Math.abs(first[0] - last[0]) < 1e-9 &&
                  Math.abs(first[1] - last[1]) < 1e-9) points.pop();
            }
            pushShape(element, style, matrix, points, sub.closed);
          });
          return;
        }
        // Curves are sampled with the browser's own path maths, at a step fine
        // enough that the result is smooth at sheet size; a path with several
        // subpaths is sampled subpath by subpath so none are bridged.
        const scale = scaleOf(matrix);
        splitSubpaths(d).forEach(part => {
          let probePath = element;
          if (part !== d) {
            probePath = element.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
            probePath.setAttribute("d", part);
          }
          const closed = /z$/i.test(part);
          const length = probePath.getTotalLength ? probePath.getTotalLength() : 0;
          if (!length) return;
          const steps = Math.max(8, Math.min(600, Math.ceil(length * scale / 0.35)));
          const points = [];
          for (let i = 0; i <= steps; i += 1) {
            const at = probePath.getPointAtLength(length * i / steps);
            points.push(toSheet(matrix, at.x, at.y));
          }
          if (closed) points.pop();
          pushShape(element, style, matrix, points, closed);
        });
      }
    });

    return { width_mm, height_mm, items };
  }

  // ---- DXF ----------------------------------------------------------------

  function dxfLayerName(role) {
    const standard = windpost.cadLayers;
    if (standard) return standard.layerFor(role).name;
    return "0";
  }

  // AutoCAD 2000 DXF through the R2000 writer: the office detailer's layer
  // standard (colour + lineweight on every layer), LWPOLYLINE outlines,
  // ANSI31 hatch in cut steel, Arial text style and the SALEEM dimension
  // style. See dxf-r2000-writer.js.
  function toDxf(sheet) {
    const writer = windpost.dxfR2000Writer;
    const standard = windpost.cadLayers;
    if (!writer || !standard) {
      throw new Error("The DXF writer and CAD layer standard must be loaded before the sheet is exported.");
    }
    return writer.write(sheet, standard).text;
  }

  // ---- PDF (single A4 page, vector, base-14 Helvetica) --------------------

  // The sheet's text is ASCII plus a few typographic characters; map those to
  // WinAnsi octal escapes so the file stays single-byte and the xref offsets
  // computed from string length remain correct.
  const WIN_ANSI = { "×": "\\327", "·": "\\267", "—": "\\227", "–": "\\226",
    "Ø": "\\330", "°": "\\260", "“": "\\223", "”": "\\224", "’": "\\222" };

  function pdfString(text) {
    let out = "";
    for (const character of String(text)) {
      if (WIN_ANSI[character]) { out += WIN_ANSI[character]; continue; }
      const code = character.charCodeAt(0);
      if (character === "(" || character === ")" || character === "\\") {
        out += "\\" + character;
      } else if (code < 32 || code > 126) {
        out += code < 256 ? "\\" + code.toString(8) : "?";
      } else {
        out += character;
      }
    }
    return out;
  }

  function toPdf(sheet, options) {
    const settings = options || {};
    const pageWidth = sheet.width_mm * PT_PER_MM;
    const pageHeight = sheet.height_mm * PT_PER_MM;
    const n = value => Number(value).toFixed(3);
    const X = x => n(x * PT_PER_MM);
    const Y = y => n((sheet.height_mm - y) * PT_PER_MM);
    const body = [];
    let strokeColour = null, fillColour = null, lineWidth = null;

    const setStroke = colour => {
      const key = colour.join(",");
      if (strokeColour !== key) {
        body.push(`${n(colour[0])} ${n(colour[1])} ${n(colour[2])} RG`);
        strokeColour = key;
      }
    };
    const setFill = colour => {
      const key = colour.join(",");
      if (fillColour !== key) {
        body.push(`${n(colour[0])} ${n(colour[1])} ${n(colour[2])} rg`);
        fillColour = key;
      }
    };
    const setWidth = width => {
      const value = Math.max(0.05, width * PT_PER_MM);
      if (lineWidth !== value) { body.push(`${n(value)} w`); lineWidth = value; }
    };

    body.push("1 J", "1 j");
    sheet.items.forEach(item => {
      if (item.kind === "poly") {
        if (!item.stroke && !item.fill) return;
        const points = item.points;
        if (points.length < 2) return;
        body.push(`${X(points[0][0])} ${Y(points[0][1])} m`);
        for (let i = 1; i < points.length; i += 1) {
          body.push(`${X(points[i][0])} ${Y(points[i][1])} l`);
        }
        if (item.closed) body.push("h");
        if (item.fill) setFill(item.fill);
        if (item.stroke) { setStroke(item.stroke); setWidth(item.width); }
        body.push(item.fill && item.stroke ? "B" : item.fill ? "f" : "S");
      } else if (item.kind === "circle") {
        if (!(item.r > 0) || (!item.stroke && !item.fill)) return;
        const k = 0.5522847498 * item.r;
        const cx = item.cx, cy = item.cy, r = item.r;
        body.push(`${X(cx + r)} ${Y(cy)} m`);
        body.push(`${X(cx + r)} ${Y(cy - k)} ${X(cx + k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c`);
        body.push(`${X(cx - k)} ${Y(cy - r)} ${X(cx - r)} ${Y(cy - k)} ${X(cx - r)} ${Y(cy)} c`);
        body.push(`${X(cx - r)} ${Y(cy + k)} ${X(cx - k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c`);
        body.push(`${X(cx + k)} ${Y(cy + r)} ${X(cx + r)} ${Y(cy + k)} ${X(cx + r)} ${Y(cy)} c`);
        body.push("h");
        if (item.fill) setFill(item.fill);
        if (item.stroke) { setStroke(item.stroke); setWidth(item.width); }
        body.push(item.fill && item.stroke ? "B" : item.fill ? "f" : "S");
      } else if (item.kind === "text") {
        if (!(item.size > 0)) return;
        setFill(item.fill);
        const size = n(item.size * PT_PER_MM);
        const radians = item.rotation * Math.PI / 180;
        const cos = n(Math.cos(radians)), sin = n(Math.sin(radians));
        body.push("BT", `/${item.bold ? "F2" : "F1"} ${size} Tf`);
        body.push(`${cos} ${sin} ${-sin} ${cos} ${X(item.x)} ${Y(item.y)} Tm`);
        body.push(`(${pdfString(item.text)}) Tj`, "ET");
      }
    });

    const content = body.join("\n");
    const objects = [
      "<</Type/Catalog/Pages 2 0 R>>",
      "<</Type/Pages/Kids[3 0 R]/Count 1>>",
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${n(pageWidth)} ${n(pageHeight)}]` +
        `/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>`,
      `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
      "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
      "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>"
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach(offset => {
      pdf += String(offset).padStart(10, "0") + " 00000 n \n";
    });
    pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\n` +
      `startxref\n${xref}\n%%EOF\n`;
    void settings;
    return pdf;
  }

  windpost.sheetExport = Object.freeze({ flatten, toDxf, toPdf, dxfLayerName });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.sheetExport;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
