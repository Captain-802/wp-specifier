(function initialiseProductionValidationEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function check(id, label, pass, severity, detail) {
    return {
      id,
      label,
      pass: Boolean(pass),
      severity: severity || "error",
      detail: String(detail || "")
    };
  }

  function finite(value) {
    return Number.isFinite(Number(value));
  }

  function validate(context) {
    const source = context || {};
    const section = source.section || {};
    const orthographic = source.orthographic || {};
    const baseplate = source.baseplate || {};
    const a4 = source.a4Root || null;
    const roots = (source.roots || []).filter(Boolean);
    const stages = (source.stages || []).filter(Boolean);
    const checks = [];
    const length = Number(orthographic.length_mm);
    const placement = orthographic.slotPlacement || {};
    const levels = Array.isArray(placement.levels_mm)
      ? placement.levels_mm
      : [];

    checks.push(check(
      "section",
      "Standard section selected",
      Boolean(section.name && finite(section.t_mm)),
      "error",
      section.name || "No section"
    ));
    checks.push(check(
      "length",
      "Windpost length is within drawing range",
      finite(length) && length >= 300 && length <= 12000,
      "error",
      finite(length) ? `${length} mm` : "Invalid length"
    ));
    checks.push(check(
      "slots",
      "All slot centres fit within the post",
      levels.every(level => Number(level) >= 0 && Number(level) <= length),
      "error",
      `${levels.length} slot level${levels.length === 1 ? "" : "s"}`
    ));
    checks.push(check(
      "baseplate",
      "Baseplate route completed",
      Boolean(baseplate.ok && baseplate.design),
      "error",
      baseplate.ok ? "Design/detail available" :
        (baseplate.reason || "No baseplate detail")
    ));

    if (baseplate.ok && baseplate.design) {
      const d = baseplate.design;
      checks.push(check(
        "plate-geometry",
        "Baseplate dimensions are positive",
        [d.B, d.tp, d.plateLen].every(value => finite(value) && value > 0),
        "error",
        `B ${d.B || "—"} · t ${d.tp || "—"} · L ${d.plateLen || "—"} mm`
      ));
    }

    checks.push(check(
      "a4",
      "A4 production sheet is complete",
      Boolean(
        a4 &&
        a4.getAttribute("viewBox") === "0 0 210 297" &&
        a4.querySelector("#production-title-block") &&
        a4.querySelector("#production-signoff")
      ),
      "error",
      a4 ? "210 × 297 mm sheet" : "Sheet not generated"
    ));

    roots.forEach((root, index) => {
      const layout = windpost.drawingLayoutEngine
        ? windpost.drawingLayoutEngine.inspect(root)
        : { ok: true, textCollisions: 0, unbrokenExtensions: 0 };
      checks.push(check(
        `layout-${index + 1}`,
        `Drawing ${index + 1} annotation lanes`,
        layout.ok,
        "warning",
        `${layout.textCollisions} text collision(s), ` +
          `${layout.unbrokenExtensions} unbroken extension(s)`
      ));
    });

    stages.forEach((stage, index) => {
      const result = windpost.drawingConsistencyEngine
        ? windpost.drawingConsistencyEngine.validate(stage)
        : { ok: true, geometryCount: 0 };
      checks.push(check(
        `consistency-${index + 1}`,
        `Canvas/SVG geometry ${index + 1}`,
        result.ok,
        "error",
        result.ok
          ? `${result.geometryCount} shared fill geometries`
          : "Preview layers do not share the same geometry signature"
      ));
    });

    const invalidMarkup = roots.concat(a4 ? [a4] : []).some(root =>
      /(?:NaN|Infinity|undefined)/.test(root.outerHTML || "")
    );
    checks.push(check(
      "numeric-markup",
      "No invalid drawing coordinates",
      !invalidMarkup,
      "error",
      invalidMarkup ? "Invalid numeric token found" : "Coordinates valid"
    ));

    const errors = checks.filter(item =>
      !item.pass && item.severity === "error");
    const warnings = checks.filter(item =>
      !item.pass && item.severity === "warning");
    return {
      ok: errors.length === 0,
      checks,
      errors,
      warnings,
      checkedAt: new Date().toISOString()
    };
  }

  function escape(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderHtml(report) {
    const result = report || { ok: false, checks: [], errors: [], warnings: [] };
    const state = result.ok
      ? (result.warnings.length ? "warning" : "pass")
      : "fail";
    const title = result.ok
      ? (result.warnings.length
          ? "Drawing is valid with advisory warnings"
          : "Production drawing validated")
      : "Production drawing requires attention";
    return `<div class="validation-summary is-${state}">`
      + `<strong>${escape(title)}</strong>`
      + `<span>${result.errors.length} error(s) · `
      + `${result.warnings.length} warning(s)</span></div>`
      + `<ul class="validation-checks">`
      + result.checks.map(item =>
          `<li class="${item.pass ? "is-pass" : `is-${item.severity}`}">`
          + `<span aria-hidden="true">${item.pass ? "✓" :
              (item.severity === "warning" ? "!" : "×")}</span>`
          + `<div><strong>${escape(item.label)}</strong>`
          + `<small>${escape(item.detail)}</small></div></li>`
        ).join("")
      + `</ul>`;
  }

  windpost.productionValidationEngine = Object.freeze({
    validate,
    renderHtml
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.productionValidationEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
