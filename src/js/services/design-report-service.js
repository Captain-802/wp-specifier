(function initialiseDesignReportService(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const format = (value, decimals = 2) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(decimals) : "—";
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function supportLabel(value) {
    return value === "cantilever" ? "Cantilever" : "Simply supported";
  }

  function loadLabel(value) {
    return value === "tipPointLoad" ? "ULS point load at free top end" : "Total ULS uniformly distributed load";
  }

  function equationSet(inputs) {
    const length = Number(inputs.length_mm);
    if (inputs.supportCondition === "cantilever" && inputs.loadType === "tipPointLoad") {
      return {
        action: "M<sub>Ed</sub> = P<sub>Ed</sub>L",
        bendingCapacity: "P<sub>Rd</sub> = M<sub>Rd</sub>/L",
        deflection: "δ = PL³/(3E<sub>s</sub>I)"
      };
    }
    if (inputs.supportCondition === "cantilever") {
      return {
        action: "M<sub>Ed</sub> = W<sub>Ed</sub>L/2",
        bendingCapacity: "W<sub>Rd</sub> = 2M<sub>Rd</sub>/L",
        deflection: "δ = W L³/(8E<sub>s</sub>I)"
      };
    }
    return {
      action: "M<sub>Ed</sub> = W<sub>Ed</sub>L/8",
      bendingCapacity: "W<sub>Rd</sub> = 8M<sub>Rd</sub>/L",
      deflection: "δ = 5W L³/(384E<sub>s</sub>I)"
    };
  }

  function buildReport(design) {
    if (!design || !design.selected) return "";
    const { selected, inputs, demandActions, designDefaults } = design;
    const { section, properties, calculation, wall } = selected;
    const details = calculation.calculationDetails || {};
    const equations = equationSet(inputs);
    const isParapet = inputs.supportCondition === "cantilever";
    const tieEquation = isParapet
      ? `N<sub>ties</sub> = floor[(L − c<sub>top</sub>)/s]`
      : `N<sub>ties</sub> = floor[(L − s₁)/s]`;
    const tieSubstitution = isParapet
      ? `floor[(${format(inputs.length_mm, 0)} − ${format(windpost.config.PARAPET_TOP_TIE_CLEARANCE_MM, 0)})/${format(designDefaults.standardTieSpacing, 0)}] = ${format(calculation.numberOfTies, 0)}`
      : `floor[(${format(inputs.length_mm, 0)} − ${format(designDefaults.firstTieSpacing, 0)})/${format(designDefaults.standardTieSpacing, 0)}] = ${format(calculation.numberOfTies, 0)}`;
    const requiredLoad = selected.requiredLoad_kN;
    const reportDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const resultStatus = design.mode === "automatic" ? "SUITABLE" : "CAPACITY CALCULATED";
    const loadComparison = design.mode === "automatic"
      ? `<tr><td>Required ULS load</td><td>${format(requiredLoad)} kN</td><td>Utilisation</td><td>${format(selected.utilizationPercent, 1)}%</td></tr>`
      : `<tr><td>Calculation mode</td><td>Selected section capacity</td><td>Utilisation</td><td>Not applicable</td></tr>`;
    const appliedAction = design.mode === "automatic"
      ? `<div class="calc-line"><span>${equations.action}</span><strong>${format(demandActions.maximumMoment_kNm, 3)} kN·m</strong></div>`
      : "";
    const innerTieGeometryRow = section.type === "U"
      ? `<tr><td>U-tie actual length</td><td>${format(wall.innerTieActualLength_mm, 2)} mm</td><td>Inner-leaf embedment</td><td>${format(wall.innerTieEmbedment_mm, 2)} mm</td></tr>`
      : "";
    const innerTieCalculation = section.type === "U"
      ? `<div class="calc-line"><span>U-tie inner embedment shown on connection detail</span><strong>${format(wall.innerTieActualLength_mm, 2)} − ${format(wall.innerTieActualLength_mm - wall.innerTieEmbedment_mm, 2)} = ${format(wall.innerTieEmbedment_mm, 2)} mm</strong></div>`
      : "";

    return `
      <article class="calculation-sheet">
        <header class="report-header">
          <div>
            <p class="report-kicker">Windpost selection calculation</p>
            <h2>${escapeHtml(section.name)} at ${format(inputs.length_mm, 0)} mm</h2>
            <p>Automatic calculation using the existing windpost design engines and locked design assumptions.</p>
          </div>
          <div>
            <div class="report-status">${resultStatus}</div>
            <p class="report-date">${reportDate}</p>
          </div>
        </header>

        <section class="report-section">
          <h3>1. Design summary</h3>
          <table>
            <tr><td>Windpost family</td><td>${escapeHtml(section.type)} shape</td><td>Support condition</td><td>${supportLabel(inputs.supportCondition)}</td></tr>
            <tr><td>Load type</td><td>${loadLabel(inputs.loadType)}</td><td>Exact post height</td><td>${format(inputs.length_mm, 0)} mm</td></tr>
            ${loadComparison}
            <tr><td>Final governing capacity</td><td>${format(selected.finalCapacity_kN, 3)} kN</td><td>Governing check</td><td>${escapeHtml(calculation.ultimateGoverningCriteriaStatus)}</td></tr>
          </table>
        </section>

        <section class="report-section">
          <h3>2. Section properties and design assumptions</h3>
          <table>
            <tr><td>Section</td><td>${escapeHtml(section.name)}</td><td>Area, A</td><td>${format(properties.crossSectionalArea_mm2, 2)} mm²</td></tr>
            <tr><td>I<sub>xx</sub></td><td>${format(properties.ixx_mm4, 2)} mm⁴</td><td>Z<sub>xx</sub></td><td>${format(properties.zxx_mm3, 2)} mm³</td></tr>
            <tr><td>Allowable stress, f<sub>y</sub></td><td>${format(designDefaults.fy)} N/mm²</td><td>Initial E</td><td>${format(designDefaults.e, 0)} kN/mm²</td></tr>
            <tr><td>Secant proof strength</td><td>${format(designDefaults.secantFy)} N/mm²</td><td>Ramberg–Osgood n</td><td>${format(designDefaults.secantN, 0)}</td></tr>
            <tr><td>Tie strength</td><td>${format(windpost.config.tieStrength(section.type), 3)} kN/tie</td><td>Tie spacing</td><td>${format(designDefaults.standardTieSpacing, 0)} mm c/c</td></tr>
          </table>
        </section>

        <section class="report-section">
          <h3>3. Structural analysis</h3>
          <div class="calculation-grid">
            ${appliedAction}
            <div class="calc-line"><span>${equations.deflection}</span><strong>δ<sub>lim</sub> = ${format(calculation.allowableDeflectionLimit, 3)} mm</strong></div>
            <div class="calc-line"><span>Ramberg–Osgood secant solution</span><strong>E<sub>s</sub> = ${format(details.secantModulusNmm2, 2)} N/mm²</strong></div>
            <div class="calc-line"><span>Deflection-based ultimate capacity</span><strong>1.5 × ${format(calculation.safeLoadDeflectionBased, 3)} = ${format(calculation.ultimateLoadDeflectionBased, 3)} kN</strong></div>
            <div class="calc-line"><span>M<sub>Rd</sub> = f<sub>y</sub>Z<sub>xx</sub></span><strong>${format(details.allowableMomentKnM, 3)} kN·m</strong></div>
            <div class="calc-line"><span>${equations.bendingCapacity}</span><strong>1.5 × ${format(calculation.safeLoadBendingMomentBased, 3)} = ${format(calculation.ultimateLoadBendingMomentBased, 3)} kN</strong></div>
          </div>
        </section>

        <section class="report-section">
          <h3>4. Wall placement and supplied ties</h3>
          <table>
            <tr><td>Inner leaf</td><td>${format(wall.innerLeafThickness_mm, 0)} mm</td><td>Cavity</td><td>${format(wall.cavityWidth_mm, 0)} mm</td></tr>
            <tr><td>Outer leaf</td><td>${format(wall.outerLeafThickness_mm, 0)} mm</td><td>Post placement</td><td>${escapeHtml(wall.placementDescription)}</td></tr>
            <tr><td>Post projection into cavity</td><td>${format(wall.postProjectionIntoCavity_mm, 1)} mm</td><td>Clear outer gap, g</td><td>${format(wall.outerGap_mm, 1)} mm</td></tr>
            <tr><td>Inner-leaf tie</td><td>${format(calculation.numberOfTies * (wall.tieSetsPerLevel || 1), 0)} no. ${escapeHtml(wall.innerTie)}</td><td>Outer-leaf tie</td><td>${format(calculation.numberOfTies * (wall.tieSetsPerLevel || 1), 0)} no. ${escapeHtml(wall.outerTie)}</td></tr>
            ${innerTieGeometryRow}
            <tr><td>Outer embedment</td><td>${format(wall.outerEmbedment_mm, 1)} mm</td><td>Number of tie levels</td><td>${format(calculation.numberOfTies, 0)}</td></tr>
          </table>
          <div class="calculation-grid compact">
            <div class="calc-line"><span>g = cavity − post position/projection</span><strong>g = ${format(wall.outerGap_mm, 1)} mm</strong></div>
            <div class="calc-line"><span>E<sub>mb</sub> = L<sub>actual</sub> − 18.77 − g</span><strong>${format(wall.actualTieLength_mm, 0)} − 18.77 − ${format(wall.outerGap_mm, 1)} = ${format(wall.outerEmbedment_mm, 1)} mm</strong></div>
            ${innerTieCalculation}
            <div class="calc-line"><span>${tieEquation}</span><strong>${tieSubstitution}</strong></div>
            <div class="calc-line"><span>Ultimate tie capacity</span><strong>${format(calculation.numberOfTies, 0)} × ${format(windpost.config.tieStrength(section.type), 3)} = ${format(calculation.totalTiesCapacity, 3)} kN</strong></div>
          </div>
        </section>

        <section class="report-conclusion">
          <span>Final usable ULS capacity</span>
          <strong>${format(selected.finalCapacity_kN, 3)} kN</strong>
          <em>${escapeHtml(calculation.ultimateGoverningCriteriaStatus)}</em>
        </section>
      </article>`;
  }

  windpost.designReportService = Object.freeze({ buildReport });
})(window);
