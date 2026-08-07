(function initialiseDrawingLayoutEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function intersects(a, b, clearance) {
    const gap = Number(clearance) || 0;
    return !(
      a.right + gap <= b.left ||
      b.right + gap <= a.left ||
      a.bottom + gap <= b.top ||
      b.bottom + gap <= a.top
    );
  }

  function visible(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return false;
    }
    const style = global.getComputedStyle
      ? global.getComputedStyle(element)
      : { display: "", visibility: "" };
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function rect(element) {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height
    };
  }

  function candidateTexts(root) {
    if (!root || !root.querySelectorAll) return [];
    return Array.from(root.querySelectorAll(
      ".dimension-text,[data-cad=\"dim\"] text,text[data-cad=\"dim\"]"
    )).filter(visible);
  }

  function translated(base, dx, dy) {
    const prefix = dx || dy ? `translate(${dx} ${dy}) ` : "";
    return prefix + (base || "");
  }

  function resolve(root, options) {
    const settings = options || {};
    const texts = candidateTexts(root);
    const accepted = [];
    let moved = 0;
    texts.forEach(text => {
      const base = text.dataset.layoutBaseTransform ??
        (text.getAttribute("transform") || "");
      text.dataset.layoutBaseTransform = base;
      const rotated = /rotate\s*\(\s*-?90/i.test(base);
      const step = Number(settings.step) || 3.2;
      const offsets = [0, -step, step, -2 * step, 2 * step,
        -3 * step, 3 * step];
      let chosen = 0;
      for (const offset of offsets) {
        text.setAttribute("transform", translated(
          base,
          rotated ? offset : 0,
          rotated ? 0 : offset
        ));
        const box = rect(text);
        if (!accepted.some(previous => intersects(box, previous, .75))) {
          chosen = offset;
          break;
        }
      }
      const finalBox = rect(text);
      accepted.push(finalBox);
      if (chosen) moved += 1;
      text.dataset.layoutShift = String(chosen);
    });
    const report = inspect(root);
    root.dataset.layoutEngine = "automatic-lanes-v1";
    root.dataset.layoutMoved = String(moved);
    root.dataset.layoutCollisions = String(report.textCollisions);
    return { moved, ...report };
  }

  function inspect(root) {
    const texts = candidateTexts(root);
    let textCollisions = 0;
    const boxes = texts.map(rect);
    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        const sameDimension =
          texts[first].closest(".dimension") &&
          texts[first].closest(".dimension") ===
            texts[second].closest(".dimension");
        if (!sameDimension && intersects(boxes[first], boxes[second], .25)) {
          textCollisions += 1;
        }
      }
    }
    const unbrokenExtensions = root && root.querySelectorAll
      ? root.querySelectorAll(
          '[data-extension-break-count="0"][data-requires-break="true"]'
        ).length
      : 0;
    return {
      ok: textCollisions === 0 && unbrokenExtensions === 0,
      textCount: texts.length,
      textCollisions,
      unbrokenExtensions
    };
  }

  windpost.drawingLayoutEngine = Object.freeze({
    intersects,
    candidateTexts,
    resolve,
    inspect
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.drawingLayoutEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
