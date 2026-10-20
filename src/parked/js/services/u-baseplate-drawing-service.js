(function (global) {
  "use strict";
  // U-baseplate drawing facade. Structural sizing/checks remain in the shared
  // baseplate engine; this service changes only the connection geometry left
  // of the inner-leaf / concrete datum and the U-post representation.
  const windpost = global.Windpost = global.Windpost || {};

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    ["./baseplate-svg-engine.js", "./u-baseplate-geometry-engine.js",
     "./u-baseplate-plan-engine.js", "./u-baseplate-section-engine.js"].forEach(require);
  }

  const DEFS =
    `<defs>` +
    `<pattern id="bpHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#b7b0a2" stroke-width="0.5"/></pattern>` +
    `<pattern id="bpMason" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="#c9b48f" stroke-width="0.5"/></pattern>` +
    `</defs>`;

  function draw(design, section) {
    const svg = windpost.baseplateSvg;
    const ctx = windpost.uBaseplateGeom.layout(design, section);
    // Each view is wrapped in its own group so a sheet composer can lift the
    // plan and the side view out independently (paper-space viewports).
    const body =
      `<g id="bp-plan" data-view="plan">` +
      windpost.uBaseplatePlan.drawPlan(ctx, svg).join("") + `</g>` +
      `<g id="bp-side" data-view="side">` +
      windpost.uBaseplateSection.drawSection(ctx, svg).join("") + `</g>`;
    const n2 = svg.n2;
    const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(ctx.vbW)} ${n2(ctx.vbH)}" width="100%" ` +
      `style="max-width:${Math.round(ctx.vbW * 1.7)}px;height:auto;background:#fff" font-family="Arial,Helvetica,sans-serif">` +
      DEFS + `<rect x="0" y="0" width="${n2(ctx.vbW)}" height="${n2(ctx.vbH)}" fill="#fff"/>` +
      body + `</svg>`;
    return {
      svg: out,
      width: ctx.vbW,
      height: ctx.vbH,
      geometry: ctx,
      views: Object.freeze({
        plan: Object.freeze([
          0,
          Math.max(0, ctx.planTop - 40),
          ctx.vbW,
          ctx.planEndY - Math.max(0, ctx.planTop - 40) + 8
        ]),
        side: Object.freeze([
          0,
          ctx.sectTitleY + 10,
          ctx.vbW,
          Math.max(80, ctx.vbH - ctx.sectTitleY - 22)
        ])
      })
    };
  }

  windpost.uBaseplateDrawing = Object.freeze({
    draw, postProfile: windpost.uBaseplateGeom.postProfile
  });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.uBaseplateDrawing;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
