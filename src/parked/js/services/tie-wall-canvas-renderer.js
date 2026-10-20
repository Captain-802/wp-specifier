(function initialiseTieWallCanvasRenderer(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function rectOf(element) {
    return {
      x: finite(element.getAttribute("x"), 0),
      y: finite(element.getAttribute("y"), 0),
      width: Math.max(0, finite(element.getAttribute("width"), 0)),
      height: Math.max(0, finite(element.getAttribute("height"), 0))
    };
  }

  function seedFor(rect, salt) {
    const value =
      Math.round(rect.x * 17) ^
      Math.round(rect.y * 31) ^
      Math.round(rect.width * 43) ^
      Math.round(rect.height * 59) ^
      salt;
    return (value >>> 0) || 1;
  }

  function randomSource(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function clipped(ctx, rect, task) {
    if (rect.width <= 0 || rect.height <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    task();
    ctx.restore();
  }

  function drawMortar(ctx, rect, material) {
    const brick = material === "brick";
    const random = randomSource(seedFor(rect, brick ? 71 : 53));
    clipped(ctx, rect, () => {
      ctx.fillStyle = brick ? "#aaa49a" : "#8d8e89";
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      const count = Math.min(
        700,
        Math.max(18, Math.round(rect.width * rect.height / 340))
      );
      for (let index = 0; index < count; index += 1) {
        const light = random() > .58;
        ctx.fillStyle = light
          ? "rgba(245,243,237,.26)"
          : "rgba(55,57,56,.16)";
        const radius = .45 + random() * 1.25;
        ctx.beginPath();
        ctx.arc(
          rect.x + random() * rect.width,
          rect.y + random() * rect.height,
          radius,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    });
  }

  function drawBrick(ctx, rect) {
    const random = randomSource(seedFor(rect, 173));
    clipped(ctx, rect, () => {
      const gradient = ctx.createLinearGradient(
        rect.x,
        rect.y,
        rect.x,
        rect.y + rect.height
      );
      gradient.addColorStop(0, "#a74c35");
      gradient.addColorStop(.34, "#bf6548");
      gradient.addColorStop(.68, "#a74631");
      gradient.addColorStop(1, "#8f3d2c");
      ctx.fillStyle = gradient;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

      const bands = Math.max(4, Math.round(rect.height / 6));
      ctx.lineWidth = .7;
      for (let index = 0; index < bands; index += 1) {
        const bandY =
          rect.y + (index + .45 + random() * .35) *
          rect.height / bands;
        ctx.strokeStyle = random() > .5
          ? "rgba(245,173,137,.25)"
          : "rgba(83,29,24,.24)";
        ctx.beginPath();
        ctx.moveTo(rect.x - 2, bandY);
        ctx.lineTo(rect.x + rect.width + 2, bandY + random() * 2 - 1);
        ctx.stroke();
      }

      const speckles = Math.min(
        520,
        Math.max(18, Math.round(rect.width * rect.height / 155))
      );
      for (let index = 0; index < speckles; index += 1) {
        ctx.fillStyle = random() > .64
          ? "rgba(238,157,120,.35)"
          : "rgba(70,31,26,.27)";
        const radius = .35 + random() * 1.15;
        ctx.beginPath();
        ctx.arc(
          rect.x + random() * rect.width,
          rect.y + random() * rect.height,
          radius,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    });
  }

  function drawBlock(ctx, rect) {
    const random = randomSource(seedFor(rect, 257));
    clipped(ctx, rect, () => {
      const gradient = ctx.createLinearGradient(
        rect.x,
        rect.y,
        rect.x + rect.width,
        rect.y + rect.height
      );
      gradient.addColorStop(0, "#c9cac6");
      gradient.addColorStop(.52, "#b8bab6");
      gradient.addColorStop(1, "#d0d1cd");
      ctx.fillStyle = gradient;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

      const aggregate = Math.min(
        720,
        Math.max(24, Math.round(rect.width * rect.height / 120))
      );
      for (let index = 0; index < aggregate; index += 1) {
        const tone = random();
        ctx.fillStyle = tone > .72
          ? "rgba(250,250,247,.58)"
          : tone > .34
            ? "rgba(105,109,107,.25)"
            : "rgba(68,72,71,.16)";
        const radius = .35 + random() * 1.35;
        ctx.beginPath();
        ctx.arc(
          rect.x + random() * rect.width,
          rect.y + random() * rect.height,
          radius,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(111,116,113,.14)";
      ctx.lineWidth = .65;
      const scratches = Math.max(3, Math.round(rect.width / 34));
      for (let index = 0; index < scratches; index += 1) {
        const startX = rect.x + random() * rect.width;
        const startY = rect.y + random() * rect.height;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(
          startX + 8 + random() * 18,
          startY - 6 - random() * 10
        );
        ctx.stroke();
      }
    });
  }

  function render(canvas, svgRoot) {
    if (!canvas || !svgRoot) return false;
    const context = canvas.getContext("2d");
    if (!context) return false;

    const viewBox = svgRoot.viewBox && svgRoot.viewBox.baseVal;
    const width = Math.max(1, finite(viewBox && viewBox.width, 1280));
    const height = Math.max(1, finite(viewBox && viewBox.height, 1200));
    const ratio = Math.max(
      1,
      Math.min(2, finite(global.devicePixelRatio, 1))
    );
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.dataset.renderer = "canvas2d-masonry";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);

    svgRoot.querySelectorAll("[data-canvas-mortar]").forEach(element => {
      drawMortar(
        context,
        rectOf(element),
        element.getAttribute("data-canvas-mortar")
      );
    });
    svgRoot.querySelectorAll(".outer-elevation-mortar").forEach(
      element => drawMortar(context, rectOf(element), "brick")
    );
    svgRoot.querySelectorAll(".inner-elevation-mortar").forEach(
      element => drawMortar(context, rectOf(element), "block")
    );
    svgRoot.querySelectorAll(".outer-plan-unit,.outer-unit").forEach(
      element => drawBrick(context, rectOf(element))
    );
    svgRoot.querySelectorAll(".inner-plan-unit,.inner-unit").forEach(
      element => drawBlock(context, rectOf(element))
    );
    return true;
  }

  windpost.tieWallCanvasRenderer = Object.freeze({ render });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.tieWallCanvasRenderer;
  }
})(typeof window !== "undefined" ? window : globalThis);
