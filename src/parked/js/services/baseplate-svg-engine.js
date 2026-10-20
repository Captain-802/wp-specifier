(function (global) {
  "use strict";
  // Tiny SVG primitive builder (mm coordinate space): colours, escaping, and the
  // line / rect / circle / poly / text / dimension helpers used by the drawing.
  const windpost = global.Windpost = global.Windpost || {};

  const C = Object.freeze({
    INK: "#1b1e22", STEELE: "#6f767d", PLATEF: "#dfe3e8", STEEL: "#b9c0c8",
    STIFF: "#aeb6bf", DIM: "#394049", RED: "#b3261e", BLUE: "#123a63",
    WELDC: "#8a6a2f", MASON: "#a98f66", HOLEF: "#ffffff"
  });
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const n2 = v => Math.round(v * 10) / 10;

  // CAD role tag. Everything an export needs to know about what a line IS
  // travels with the geometry, so the layer is decided once, here, rather than
  // guessed later from colours and dash patterns.
  const tag = role => role ? ` data-cad="${role}"` : "";
  // Group a block of markup onto one role.
  const cad = (role, markup) => `<g${tag(role)}>${markup}</g>`;

  const line = (x1, y1, x2, y2, c, sw, dash) =>
    `<line x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}" stroke="${c || C.INK}" stroke-width="${sw || 0.5}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const rect = (x, y, w, h, fill, c, sw, dash) =>
    `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${fill || "none"}" stroke="${c || C.INK}" stroke-width="${sw || 0.5}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  // rect with a raw (pattern-url) fill, e.g. hatches
  const rawRect = (x, y, w, h, fillUrl, stroke, sw, dash) => {
    const canvasMaterial = /bpHatch/.test(fillUrl)
      ? "concrete"
      : /bpMason/.test(fillUrl)
        ? "masonry"
        : "";
    return `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${fillUrl}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}${canvasMaterial ? ` data-canvas-fill="${canvasMaterial}"` : ""}/>`;
  };
  const circle = (cx, cy, r, fill, c, sw, role) =>
    `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" fill="${fill || "none"}" stroke="${c || C.INK}" stroke-width="${sw || 0.5}"${tag(role || "hole")}/>`;
  const poly = (pts, fill, c, sw, detail) =>
    `<polygon points="${pts.map(p => n2(p[0]) + "," + n2(p[1])).join(" ")}" fill="${fill || "none"}" stroke="${c || C.INK}" stroke-width="${sw || 0.5}"${detail ? ` data-detail="${esc(detail)}"` : ""}/>`;
  const polyline = (pts, c, sw, detail) =>
    `<polyline points="${pts.map(p => n2(p[0]) + "," + n2(p[1])).join(" ")}" fill="none" stroke="${c || C.INK}" stroke-width="${sw || 0.5}"${detail ? ` data-detail="${esc(detail)}"` : ""}/>`;
  const text = (x, y, s, size, c, anchor, bold, rot, role) =>
    `<text x="${n2(x)}" y="${n2(y)}" font-size="${size || 8}" fill="${c || C.INK}" text-anchor="${anchor || "start"}"` +
    `${bold ? ` font-weight="700"` : ""}${rot ? ` transform="rotate(${rot} ${n2(x)} ${n2(y)})"` : ""}` +
    `${tag(role || "text")}>${esc(s)}</text>`;

  // Multi-line callout as ONE <text> with em-based line spacing, so the block
  // still reads correctly if a composed sheet rescales the font — fixed line
  // gaps collapse into each other as soon as the text is enlarged.
  const textLines = (x, y, lines, size, c, anchor, boldLines) => {
    const bold = boldLines || [];
    const spans = lines.map((s, i) =>
      `<tspan x="${n2(x)}"${i ? ` dy="1.25em"` : ""}` +
      `${bold.indexOf(i) >= 0 ? ` font-weight="700"` : ""}>${esc(s)}</tspan>`
    ).join("");
    return `<text x="${n2(x)}" y="${n2(y)}" font-size="${size || 8}" ` +
      `fill="${c || C.INK}" text-anchor="${anchor || "start"}"${tag("text")}>${spans}</text>`;
  };

  function hdim(x1, x2, y, label, col) {
    col = col || C.DIM; const t = 3;
    return cad("dim",
      line(x1, y, x2, y, col, 0.4) + line(x1, y - t, x1, y + t, col, 0.5) + line(x2, y - t, x2, y + t, col, 0.5) +
      text((x1 + x2) / 2, y - 4, label, 7.5, col, "middle", false, 0, "dim"));
  }
  function vdim(y1, y2, x, label, col) {
    col = col || C.DIM; const t = 3;
    const mid = (y1 + y2) / 2;
    const compact = Math.abs(y2 - y1) < 18;
    const labelMarkup = compact
      // A rotated label cannot fit inside an 6 or 8 mm plate-thickness
      // dimension. Put it just outside the ticks instead.
      ? text(x + 5.5, mid + 2.5, label, 7.5, col,
        "start", false, 0, "dim")
      : text(x - 4, mid, label, 7.5, col,
        "middle", false, -90, "dim");
    return cad("dim",
      line(x, y1, x, y2, col, 0.4) + line(x - t, y1, x + t, y1, col, 0.5) + line(x - t, y2, x + t, y2, col, 0.5) +
      labelMarkup);
  }
  // Extension lines can pass several stacked dimension lanes.  They are split
  // at those lanes so an extension never reads as part of a lower dimension.
  // Existing callers may omit breakYs and receive the original single line.
  const ext = (x1, y1, x2, y2, breakYs) => {
    const gap = 1.2;
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    const breaks = (Array.isArray(breakYs) ? breakYs : [])
      .map(Number)
      .filter(value => Number.isFinite(value) && value > lo + gap && value < hi - gap)
      .sort((a, b) => a - b);
    if (!breaks.length || Math.abs(x2 - x1) > 0.01) {
      return `<g${tag("dim")} data-extension-break-count="0">${line(x1, y1, x2, y2, "#9aa0a6", 0.3)}</g>`;
    }
    const forward = y2 >= y1;
    const ordered = forward ? breaks : breaks.slice().reverse();
    let cursor = y1;
    const segments = [];
    ordered.forEach(value => {
      const before = value + (forward ? -gap : gap);
      const after = value + (forward ? gap : -gap);
      segments.push(line(x1, cursor, x2, before, "#9aa0a6", 0.3));
      cursor = after;
    });
    segments.push(line(x1, cursor, x2, y2, "#9aa0a6", 0.3));
    return `<g${tag("dim")} data-extension-break-count="${breaks.length}">${segments.join("")}</g>`;
  };

  // leader line from the text side (x1,y1) to a feature (x2,y2) with a filled
  // arrowhead at the feature end — for annotating plate / stiffener / holes.
  function leader(x1, y1, x2, y2, col) {
    col = col || C.INK;
    const ang = Math.atan2(y2 - y1, x2 - x1), ah = 4, aw = 1.7;
    const bx = x2 - ah * Math.cos(ang), by = y2 - ah * Math.sin(ang);
    return cad("leader", line(x1, y1, x2, y2, col, 0.4) +
      `<polygon points="${n2(x2)},${n2(y2)} ${n2(bx - aw * Math.sin(ang))},${n2(by + aw * Math.cos(ang))} ${n2(bx + aw * Math.sin(ang))},${n2(by - aw * Math.cos(ang))}" fill="${col}"/>`);
  }

  windpost.baseplateSvg = Object.freeze({ C, esc, n2, tag, cad, line, rect, rawRect, circle, poly, polyline, text, textLines, hdim, vdim, ext, leader });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateSvg;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
