(function initialiseEngineeringCanvasRenderer(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function finite(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function viewBoxOf(svg) {
    const box = svg && svg.viewBox && svg.viewBox.baseVal;
    return {
      x: finite(box && box.x, 0),
      y: finite(box && box.y, 0),
      width: Math.max(1, finite(box && box.width, 1000)),
      height: Math.max(1, finite(box && box.height, 700))
    };
  }

  function rectOf(element) {
    return {
      x: finite(element.getAttribute("x"), 0),
      y: finite(element.getAttribute("y"), 0),
      width: Math.max(0, finite(element.getAttribute("width"), 0)),
      height: Math.max(0, finite(element.getAttribute("height"), 0))
    };
  }

  function clippedRect(context, rect, task) {
    if (!(rect.width > 0 && rect.height > 0)) return;
    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();
    task();
    context.restore();
  }

  function hatchRect(context, rect, material) {
    const concrete = material === "concrete";
    const spacing = concrete ? 8 : 10;
    clippedRect(context, rect, () => {
      context.fillStyle = concrete ? "#f5f4ef" : "#f4efe5";
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.strokeStyle = concrete
        ? "rgba(93,101,107,.42)"
        : "rgba(143,116,72,.42)";
      context.lineWidth = .55;
      for (let offset = -rect.height; offset < rect.width; offset += spacing) {
        context.beginPath();
        context.moveTo(rect.x + offset, rect.y + rect.height);
        context.lineTo(rect.x + offset + rect.height, rect.y);
        context.stroke();
      }
      context.fillStyle = concrete
        ? "rgba(90,95,98,.11)"
        : "rgba(126,100,60,.08)";
      const count = Math.min(260, Math.max(10,
        Math.round(rect.width * rect.height / 520)));
      for (let index = 0; index < count; index += 1) {
        const seed = (index * 9301 + Math.round(rect.x * 13) +
          Math.round(rect.y * 29)) % 233280;
        const seed2 = (seed * 17 + 47) % 233280;
        context.beginPath();
        context.arc(
          rect.x + seed / 233280 * rect.width,
          rect.y + seed2 / 233280 * rect.height,
          .35 + (index % 3) * .18,
          0,
          Math.PI * 2
        );
        context.fill();
      }
    });
  }

  function hatchPath(context, element) {
    if (!global.Path2D) return false;
    const data = element.getAttribute("d");
    if (!data) return false;
    let path;
    try {
      path = new global.Path2D(data);
    } catch (error) {
      return false;
    }
    const box = element.getBBox();
    context.save();
    context.clip(path);
    context.fillStyle = "#f7f8f8";
    context.fillRect(box.x, box.y, box.width, box.height);
    context.strokeStyle = "rgba(24,29,33,.54)";
    context.lineWidth = .35;
    for (let offset = -box.height; offset < box.width; offset += 3) {
      context.beginPath();
      context.moveTo(box.x + offset, box.y + box.height);
      context.lineTo(box.x + offset + box.height, box.y);
      context.stroke();
    }
    context.restore();
    return true;
  }

  function hatchSteelRect(context, element) {
    const rect = rectOf(element);
    clippedRect(context, rect, () => {
      context.fillStyle = "#f7f8f8";
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.strokeStyle = "rgba(24,29,33,.54)";
      context.lineWidth = .35;
      for (let offset = -rect.height; offset < rect.width; offset += 3) {
        context.beginPath();
        context.moveTo(rect.x + offset, rect.y + rect.height);
        context.lineTo(rect.x + offset + rect.height, rect.y);
        context.stroke();
      }
    });
  }

  function clearSvgBackground(svg, box) {
    Array.from(svg.children).forEach(element => {
      if (element.tagName && element.tagName.toLowerCase() === "rect") {
        const rect = rectOf(element);
        const coversSheet =
          rect.x <= box.x + 5 &&
          rect.y <= box.y + 5 &&
          rect.width >= box.width - 10 &&
          rect.height >= box.height - 10;
        if (coversSheet) element.setAttribute("fill", "none");
      }
    });
    svg.querySelectorAll(".sheet-border").forEach(element =>
      element.setAttribute("fill", "none"));
  }

  function render(canvas, svg, options) {
    if (!canvas || !svg) return false;
    const context = canvas.getContext("2d");
    if (!context) return false;
    if (windpost.drawingConsistencyEngine) {
      windpost.drawingConsistencyEngine.stamp(svg, canvas);
    }
    const box = viewBoxOf(svg);
    const ratio = Math.max(1, Math.min(2, finite(global.devicePixelRatio, 1)));
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    canvas.dataset.renderer = "canvas2d-engineering-fill";
    context.setTransform(ratio, 0, 0, ratio, -box.x * ratio, -box.y * ratio);
    context.fillStyle = "#fff";
    context.fillRect(box.x, box.y, box.width, box.height);

    svg.querySelectorAll("[data-canvas-fill]").forEach(element => {
      hatchRect(context, rectOf(element),
        element.getAttribute("data-canvas-fill"));
      element.setAttribute("fill", "none");
      element.dataset.svgOverlay = "linework";
    });

    if (!options || options.steel !== false) {
      svg.querySelectorAll(".section-fill,.blank-fill").forEach(element => {
        const tagName = (element.tagName || "").toLowerCase();
        const rendered = tagName === "path"
          ? hatchPath(context, element)
          : (hatchSteelRect(context, element), true);
        if (rendered) {
          element.setAttribute("fill", "none");
          element.dataset.svgOverlay = "linework";
        }
      });
    }
    clearSvgBackground(svg, box);
    svg.dataset.renderEngine = "canvas+svg";
    return true;
  }

  function enhance(host, options) {
    if (!host || !host.querySelector) return false;
    if (host.querySelector(".engineering-hybrid-stage")) return true;
    const svg = host.querySelector("svg");
    if (!svg || svg.getAttribute("data-render-mode") === "lines") return false;
    const box = viewBoxOf(svg);
    const stage = global.document.createElement("div");
    const canvas = global.document.createElement("canvas");
    stage.className = "engineering-hybrid-stage";
    stage.dataset.renderEngine = "canvas+svg";
    stage.style.aspectRatio = `${box.width} / ${box.height}`;
    canvas.className = "engineering-fill-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.insertBefore(stage, svg);
    stage.appendChild(canvas);
    stage.appendChild(svg);
    const ok = render(canvas, svg, options || {});
    if (!ok) {
      host.insertBefore(svg, stage);
      stage.remove();
    }
    return ok;
  }

  windpost.engineeringCanvasRenderer = Object.freeze({ enhance, render });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.engineeringCanvasRenderer;
  }
})(typeof window !== "undefined" ? window : globalThis);
