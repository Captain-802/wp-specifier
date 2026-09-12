(function initialiseWindpostApprovalDrawingService(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const PAGE = Object.freeze({ width_mm: 420, height_mm: 297 });

  function finite(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function number(value) {
    const rounded = Math.round(Number(value) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function escapeXml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  // A view is lifted out of a bigger drawing by pointing a viewBox at it.
  // "meet" letterboxes that window inside the target rectangle, and a browser
  // does NOT honour overflow="hidden" on an <image> resource root — so
  // whatever the source drew beside the window paints into the letterbox
  // margin. (That is how the outer-leaf elevation used to leak into the left
  // of the vertical section.) An explicit clip is what actually keeps a view
  // to itself. The rendered size is declared too, so the resource has an
  // intrinsic size rather than being sized from the default object box.
  const CROP_CLIP_ID = "approval-crop-window";

  function croppedSvg(source, viewBox) {
    const [cropX, cropY, cropW, cropH] = viewBox.map(Number);
    const box = viewBox.map(number).join(" ");
    const clip = `<clipPath id="${CROP_CLIP_ID}">`
      + `<rect x="${number(cropX)}" y="${number(cropY)}" `
      + `width="${number(cropW)}" height="${number(cropH)}"/></clipPath>`;
    const opened = String(source || "").replace(
      /<svg\b([^>]*)>/i,
      (match, attributes) => {
        const cleaned = attributes
          .replace(/\s(?:width|height)="[^"]*"/gi, "")
          .replace(/\sviewBox="[^"]*"/i, "")
          .replace(/\spreserveAspectRatio="[^"]*"/i, "")
          .replace(/\soverflow="[^"]*"/i, "");
        return `<svg${cleaned} width="${number(cropW)}" `
          + `height="${number(cropH)}" viewBox="${box}" `
          + `preserveAspectRatio="xMidYMid meet" overflow="hidden">`
          + clip + `<g clip-path="url(#${CROP_CLIP_ID})">`;
      }
    );
    // One root <svg> per source, so the final close is the one to wrap.
    return opened.replace(/<\/svg>(\s*)$/i, "</g></svg>$1");
  }

  function dataUri(svg) {
    return "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(String(svg || "")).replaceAll("'", "%27");
  }

  // Photo mode inlines the view as a nested <svg> instead of an <image>:
  // an SVG loaded as an image is re-rasterised by the browser on every
  // paint, which with lit-texture filters stalls the page, whereas inline
  // filters render once. Ids are suffixed so two crops of one source cannot
  // collide, and the source's own root <svg> and <style> are kept inside.
  function localise(html, tag) {
    const ids = [];
    html.replace(/\sid="([^"]+)"/g, (match, id) => { ids.push(id); return match; });
    let out = html;
    ids.forEach(id => {
      const quoted = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out
        .replace(new RegExp(`id="${quoted}"`, "g"), `id="${id}-${tag}"`)
        .replace(new RegExp(`url\\(#${quoted}\\)`, "g"), `url(#${id}-${tag})`)
        .replace(new RegExp(`href="#${quoted}"`, "g"), `href="#${id}-${tag}"`);
    });
    return out;
  }

  // A <style> inside an inline SVG is document-wide, so every selector of the
  // copied view's stylesheet is prefixed with the view's id: the view keeps
  // its own look and leaks nothing onto the sheet or the page.
  function scopeStyles(html, id) {
    return html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (match, attributes, css) => {
      const scoped = css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selectors, body) => {
        if (/^\s*@/.test(selectors)) return rule;
        const prefixed = selectors.split(",").map(selector => {
          const trimmed = selector.trim();
          return trimmed ? `#${id} ${trimmed}` : trimmed;
        }).filter(Boolean).join(",");
        return `${prefixed}{${body}}`;
      });
      return `<style${attributes}>${scoped}</style>`;
    });
  }

  function inlineView(source, crop, rect, label, id) {
    const [cropX, cropY, cropW, cropH] = crop.map(Number);
    const inner = String(source || "")
      .replace(/^[\s\S]*?<svg\b[^>]*>/i, "")
      .replace(/<\/svg>\s*$/i, "");
    const clipId = `${id}-clip`;
    return `<svg
      id="${escapeXml(id)}"
      data-view="${escapeXml(id)}"
      data-inline="photo"
      aria-label="${escapeXml(label)}"
      x="${number(rect.x)}"
      y="${number(rect.y)}"
      width="${number(rect.width)}"
      height="${number(rect.height)}"
      viewBox="${crop.map(number).join(" ")}"
      preserveAspectRatio="xMidYMid meet"
      overflow="hidden"
    ><clipPath id="${clipId}"><rect x="${number(cropX)}" y="${number(cropY)}" width="${number(cropW)}" height="${number(cropH)}"/></clipPath>
      <g clip-path="url(#${clipId})">${scopeStyles(localise(inner, id), id)}</g>
    </svg>`;
  }

  function sourceImage(source, crop, rect, label, id, inline) {
    if (inline) return inlineView(source, crop, rect, label, id);
    return `<image
      id="${escapeXml(id)}"
      data-view="${escapeXml(id)}"
      aria-label="${escapeXml(label)}"
      x="${number(rect.x)}"
      y="${number(rect.y)}"
      width="${number(rect.width)}"
      height="${number(rect.height)}"
      preserveAspectRatio="xMidYMid meet"
      href="${dataUri(croppedSvg(source, crop))}"
    />`;
  }

  function baseplateCrop(baseplate, view) {
    const saved = baseplate && baseplate.drawingViews &&
      baseplate.drawingViews[view];
    if (Array.isArray(saved) && saved.length === 4 &&
        saved.every(value => Number.isFinite(Number(value)))) {
      return saved.map(Number);
    }
    const width = finite(baseplate && baseplate.drawingWidth, 800);
    const height = finite(baseplate && baseplate.drawingHeight, 900);
    return view === "side"
      ? [0, height * .46, width, height * .54]
      : [0, 0, width, height * .48];
  }

  function baseplateSourceImage(baseplate, view, rect, label, id) {
    const source = baseplate && baseplate.svg;
    if (!source) {
      return `<text class="note" x="${number(rect.x + rect.width / 2)}"
        y="${number(rect.y + rect.height / 2)}" text-anchor="middle">
        BASEPLATE VIEW NOT AVAILABLE
      </text>`;
    }
    return sourceImage(
      source,
      baseplateCrop(baseplate, view),
      rect,
      label,
      id
    );
  }

  function panel(x, y, width, height, title) {
    return `<g class="approval-panel">
      <rect x="${number(x)}" y="${number(y)}" width="${number(width)}"
        height="${number(height)}" rx="1"/>
      <text class="view-title" x="${number(x + 3)}"
        y="${number(y + 5.5)}">${escapeXml(title)}</text>
    </g>`;
  }

  function uOnlyApproval(orthographic, baseplate, section, length_mm) {
    const source = orthographic.svg;
    const body = [
      panel(10, 30, 400, 72, "WINDPOST SECTION — PLAN / TOP VIEW"),
      sourceImage(
        source,
        [15, 10, 200, 70],
        { x: 14, y: 37, width: 392, height: 60 },
        "Windpost plan view",
        "approval-section-plan"
      ),
      panel(10, 110, 190, 177, "BASEPLATE PLAN"),
      baseplateSourceImage(
        baseplate,
        "plan",
        { x: 14, y: 118, width: 182, height: 164 },
        "Calculated baseplate plan",
        "approval-baseplate-plan"
      ),
      panel(210, 110, 200, 177, "BASEPLATE SIDE VIEW"),
      baseplateSourceImage(
        baseplate,
        "side",
        { x: 214, y: 118, width: 192, height: 164 },
        "Calculated baseplate side view",
        "approval-baseplate-side"
      )
    ].join("");
    return {
      svg: wrap(
        `${orthographic.postType || "WINDPOST"} APPROVAL ARRANGEMENT`,
        `${section.name} · ${number(length_mm)} mm HIGH`,
        body,
        orthographic.drawingMode
      ),
      wallModel: null,
      assemblyIncluded: false
    };
  }

  function wrap(title, subtitle, body, mode) {
    return `<svg
      id="windpost-approval-sheet"
      xmlns="http://www.w3.org/2000/svg"
      width="${PAGE.width_mm}mm"
      height="${PAGE.height_mm}mm"
      viewBox="0 0 ${PAGE.width_mm} ${PAGE.height_mm}"
      role="img"
      aria-label="${escapeXml(title)}"
      data-sheet-purpose="client-approval"
      data-render-mode="${mode === "lines" ? "lines" : mode === "photo" ? "photo" : "hatch"}"
    >
      <style>
        #windpost-approval-sheet > .sheet{fill:#fff;stroke:#111;stroke-width:.35}
        #windpost-approval-sheet > .approval-panel > rect{fill:#fff;stroke:#9aa6ae;stroke-width:.22}
        #windpost-approval-sheet > text,#windpost-approval-sheet > .approval-panel > text{font-family:"Arial Narrow",Arial,Helvetica,sans-serif;fill:#111}
        #windpost-approval-sheet > .sheet-title{font-size:5px;font-weight:700;letter-spacing:.18px}
        #windpost-approval-sheet > .sheet-subtitle{font-size:3px}
        #windpost-approval-sheet > .approval-panel > .view-title{font-size:3.2px;font-weight:700;letter-spacing:.12px}
        #windpost-approval-sheet > .note{font-size:2.8px}
        #windpost-approval-sheet > .rule{stroke:#9aa6ae;stroke-width:.22}
      </style>
      <rect class="sheet" x="5" y="5" width="410" height="287" rx="1"/>
      <text class="sheet-title" x="10" y="16">${escapeXml(title)}</text>
      <text class="sheet-subtitle" x="10" y="22">${escapeXml(subtitle)}</text>
      <line class="rule" x1="10" y1="25" x2="410" y2="25"/>
      ${body}
    </svg>`;
  }

  function build(input) {
    const values = input || {};
    const orthographic = values.orthographic;
    const baseplate = values.baseplate;
    const section = values.section;
    const length_mm = finite(values.length_mm, orthographic && orthographic.length_mm);
    if (!orthographic || !section) {
      throw new Error("Approval drawing requires a section and orthographic source.");
    }

    // Both post types get the full cavity-wall arrangement. The cut-down
    // sheet remains only for when the wall engines are not on the page.
    if ((section.type !== "L" && section.type !== "U") ||
        !windpost.tieWallSetup ||
        !windpost.tieWallDrawing) {
      return uOnlyApproval(orthographic, baseplate, section, length_mm);
    }

    const wall = values.wall || {};
    const model = windpost.tieWallSetup.build({
      sectionName: section.name,
      innerThickness_mm: finite(wall.innerLeafThickness_mm, 100),
      cavityWidth_mm: finite(wall.cavityWidth_mm, 100),
      outerThickness_mm: finite(wall.outerLeafThickness_mm, 100),
      innerMaterial: wall.innerMaterial || "aeratedBlock",
      outerMaterial: wall.outerMaterial || "brick",
      wallLength_mm: finite(wall.wallLength_mm, 900),
      wallHeight_mm: finite(wall.wallHeight_mm, 450),
      elevationHeight_mm: length_mm
    });
    const photo = values.mode === "photo";
    const wallDrawing = windpost.tieWallDrawing.draw(model, {
      mode: values.mode === "lines" ? "lines" : photo ? "photo" : "hatch"
    });
    const wallSource = wallDrawing.svg;
    const planEndY = 100 + model.totalThickness_mm * .92;
    const elevationY = Math.max(470, planEndY + 102);
    const wallSectionCropHeight = Math.max(
      120,
      Math.min(650, 1200 - elevationY)
    );

    // The wall build-up, windpost and tie text repeated the sheet subtitle and
    // the drawn dimensions, so the vertical section takes that column instead.
    const planPanel = { x: 10, y: 30, width: 400, height: 88 };
    const basePlanPanel = { x: 10, y: 125, width: 188, height: 77 };
    const baseSidePanel = { x: 10, y: 208, width: 188, height: 79 };
    const wallPanel = { x: 204, y: 125, width: 206, height: 162 };

    const body = [
      panel(planPanel.x, planPanel.y, planPanel.width, planPanel.height,
        "CAVITY-WALL PLAN AT PAIRED TIE LEVEL"),
      sourceImage(
        wallSource,
        // Wide enough to reach the end of the external-face datum note at
        // x 1267; the clip would otherwise cut the label mid-word.
        [120, 88, 1155, Math.max(170, planEndY - 58)],
        { x: 14, y: 37, width: 392, height: 76 },
        "Cavity wall plan with windpost, inner shear tie and outer EDC tie",
        "approval-wall-plan",
        photo
      ),
      panel(
        basePlanPanel.x,
        basePlanPanel.y,
        basePlanPanel.width,
        basePlanPanel.height,
        "BASEPLATE PLAN"
      ),
      baseplateSourceImage(
        baseplate,
        "plan",
        { x: 14, y: 132, width: 180, height: 66 },
        "Calculated baseplate plan",
        "approval-baseplate-plan"
      ),
      panel(
        baseSidePanel.x,
        baseSidePanel.y,
        baseSidePanel.width,
        baseSidePanel.height,
        "BASEPLATE SIDE VIEW"
      ),
      baseplateSourceImage(
        baseplate,
        "side",
        { x: 14, y: 215, width: 180, height: 68 },
        "Calculated baseplate side view",
        "approval-baseplate-side"
      ),
      panel(wallPanel.x, wallPanel.y, wallPanel.width, wallPanel.height,
        "VERTICAL CAVITY-WALL SECTION / ELEVATION"),
      sourceImage(
        wallSource,
        [700, elevationY, 480, wallSectionCropHeight],
        { x: 208, y: 133, width: 198, height: 149 },
        "Full-height cavity wall section with windpost, baseplate and paired ties",
        "approval-wall-section",
        photo
      )
    ].join("");

    const subtitle = `${section.name} · ${number(length_mm)} mm HIGH · ` +
      `${number(model.inner.thickness_mm)} / ` +
      `${number(model.cavity.thickness_mm)} / ` +
      `${number(model.outer.thickness_mm)} mm WALL · ` +
      `${escapeXml(model.connection.edcTie.name)} OUTER TIE`;

    return {
      svg: wrap(
        `${section.type}-WINDPOST CAVITY-WALL APPROVAL ARRANGEMENT`,
        subtitle,
        body,
        values.mode
      ),
      wallModel: model,
      assemblyIncluded: true
    };
  }

  windpost.windpostApprovalDrawing = Object.freeze({
    PAGE,
    build
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.windpostApprovalDrawing;
  }
})(typeof window !== "undefined" ? window : globalThis);
