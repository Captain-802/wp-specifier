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

  // Supply for all similar posts: every per-post quantity times the number
  // of posts, as ordered.
  function supplyTable(c) {
    const s = c.supply;
    if (!s) return "";
    const posts = `${format(s.posts, 0)} post${s.posts === 1 ? "" : "s"}`;
    const headNa = !c.head.applicable;
    return `<table class="supply-table">
            <tr><th></th><th>Per post</th><th>${posts}</th></tr>
            <tr><td>Windpost self weight</td><td>${format(c.post.weight_kg, 3)} kg</td><td>${format(s.postWeight_kg, 3)} kg</td></tr>
            <tr><td>Head connection</td><td>${format(c.head.weight_kg, 3)} kg</td><td>${format(s.headWeight_kg, 3)} kg</td></tr>
            <tr><td>Base connection</td><td>${format(c.base.weight_kg, 3)} kg</td><td>${format(s.baseWeight_kg, 3)} kg</td></tr>
            <tr><td>Head connection bolts${headNa ? "" : ` (${escapeHtml(c.head.boltSku)})`}</td><td>${headNa ? "&mdash;" : format(c.head.boltCount, 0)}</td><td>${headNa ? "&mdash;" : format(s.headBolts, 0)}</td></tr>
            <tr><td>Base connection bolts (${escapeHtml(c.base.boltSku)})</td><td>${format(c.base.boltCount, 0)}</td><td>${format(s.baseBolts, 0)}</td></tr>
            <tr><td>Inner-leaf ties</td><td>${format(c.ties.innerCount, 0)}</td><td>${format(s.innerTies, 0)}</td></tr>
            ${c.ties.outerCount ? `<tr><td>Outer-leaf ties (EDC)</td><td>${format(c.ties.outerCount, 0)}</td><td>${format(s.outerTies, 0)}</td></tr>` : ""}
            ${c.ties.debondingSleeves ? `<tr><td>Debonding sleeves</td><td>${format(c.ties.debondingSleeves, 0)}</td><td>${format(s.debondingSleeves, 0)}</td></tr>` : ""}
            <tr><td><strong>Total weight</strong></td><td><strong>${format(c.totalWeightPerPost_kg, 3)} kg</strong></td><td><strong>${format(s.totalWeight_kg, 3)} kg</strong></td></tr>
          </table>`;
  }

  function connectionsSection(c) {
    if (!c) return "";
    const headNa = !c.head.applicable;
    const cell = (v) => escapeHtml(v);
    const plate = c.base.plate;
    const plateLines = plate && Number.isFinite(plate.capacity_kNm)
      ? `<div class="calc-line"><span>Base moment M = ${cell(plate.loadModel)}</span><strong>${format(c.base.moment_kNm, 3)} kNm &le; ${format(plate.capacity_kNm, 3)} kNm &rarr; plate type ${cell(plate.code)}</strong></div>
         <div class="calc-line"><span>Plate ${format(plate.plateLength_mm, 0)} &times; ${plate.plateWid_mm} &times; ${plate.plateThk_mm} + stiffener ${plate.stiffThk_mm} mm</span><strong>${format(plate.plateKg, 2)} + ${format(plate.stiffKg, 2)} = ${format(plate.totalKg, 2)} kg</strong></div>`
      : (plate ? `<div class="calc-line"><span>Base moment</span><strong>${format(c.base.moment_kNm, 3)} kNm &mdash; special design plate</strong></div>` : "");
    return `
        <section class="report-section">
          <h3>5. Connections, bolts and weights</h3>
          <table>
            <tr><td>Head fixing</td><td>${headNa ? "Not applicable (cantilever)" : cell(c.head.description.trim())}</td><td>Head connection</td><td>${headNa ? "&mdash;" : cell(c.head.code)}</td></tr>
            <tr><td>Head post bolts</td><td>${headNa ? "&mdash;" : cell(c.head.postBolt)}</td><td>Head connection bolts</td><td>${headNa ? "&mdash;" : `${format(c.head.boltCount, 0)} no. ${cell(c.head.boltSku)}${c.head.special ? " (special)" : ""}`}</td></tr>
            <tr><td>Base fixing</td><td>${cell(c.base.description.trim())}</td><td>Base connection</td><td>${cell(c.base.code || "&mdash;")}</td></tr>
            <tr><td>Base post bolts</td><td>${cell(c.base.postBolt)}</td><td>Base connection bolts</td><td>${format(c.base.boltCount, 0)} no. ${cell(c.base.boltSku)}${c.base.special ? " (special)" : ""}</td></tr>
            <tr><td>Ties per post</td><td>${format(c.ties.innerCount, 0)} inner${c.ties.outerCount ? ` / ${format(c.ties.outerCount, 0)} outer` : ""}</td><td>Debonding sleeves per post</td><td>${format(c.ties.debondingSleeves, 0)}</td></tr>
          </table>
          ${supplyTable(c)}
          <div class="calculation-grid compact">
            <div class="calc-line"><span>Post weight = blank &times; t &times; L &times; &rho;</span><strong>${format(c.post.blankWidth_mm, 2)} &times; L &times; ${format(c.post.kgPerMetre, 3)} kg/m &rarr; ${format(c.post.weight_kg, 3)} kg</strong></div>
            ${plateLines}
            <div class="calc-line"><span>Head connection weight</span><strong>${format(c.head.weight_kg, 3)} kg</strong></div>
            <div class="calc-line"><span>Base connection weight</span><strong>${format(c.base.weight_kg, 3)} kg</strong></div>
            <div class="calc-line"><span>Total weight per post</span><strong>${format(c.totalWeightPerPost_kg, 3)} kg</strong></div>
            <div class="calc-line"><span>${format(c.postsCount, 0)} similar posts, ${format(c.deliveries, 0)} deliveries</span><strong>${format(c.totalWeightAllPosts_kg, 3)} kg</strong></div>
          </div>
        </section>`;
  }

  // Every figure the engineer changed in the design-data editor, so the
  // record never passes edited values off as catalogue ones.
  function designDataSection() {
    const data = windpost.designData;
    const edits = data ? data.edits() : null;
    if (!edits || !edits.count) return "";
    return `<section class="report-section report-edits">
          <h3>Design data edited for this calculation</h3>
          <p>${edits.count} value${edits.count === 1 ? "" : "s"} differ from the catalogue (tie capacities, design constants, anchors, bolts or the bolt a connection uses):</p>
          <ul>${edits.lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        </section>`;
  }

  function buildReport(design, connections) {
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
    const perLevel = (windpost.config.TIES_PER_LEVEL || {})[section.type] || 1;
    const isIPost = section.type === "I";
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
            <tr><td>Windpost family</td><td>${escapeHtml((windpost.sectionProfileEngine.FAMILIES || {})[section.type] ? windpost.sectionProfileEngine.FAMILIES[section.type].label : section.type + " shape")}</td><td>Support condition</td><td>${supportLabel(inputs.supportCondition)}</td></tr>
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
            <tr><td>Tie strength</td><td>${format((calculation.tieStrength ?? windpost.config.DEFAULT_TIE_STRENGTH_KN[section.type]), 3)} kN/tie</td><td>Tie spacing</td><td>${format(designDefaults.standardTieSpacing, 0)} mm c/c</td></tr>
          </table>
        </section>

        ${designDataSection()}

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
            <tr><td>Inner-leaf tie</td><td>${format(calculation.numberOfTies * perLevel, 0)} no. ${escapeHtml(wall.innerTie)}</td><td>Outer-leaf tie</td><td>${isIPost ? "None (post within the inner leaf)" : `${format(calculation.numberOfTies * perLevel, 0)} no. ${escapeHtml(wall.outerTie)}`}</td></tr>
            ${innerTieGeometryRow}
            <tr><td>Outer embedment</td><td>${format(wall.outerEmbedment_mm, 1)} mm</td><td>Number of tie levels</td><td>${format(calculation.numberOfTies, 0)}</td></tr>
          </table>
          <div class="calculation-grid compact">
            ${isIPost ? "" : `<div class="calc-line"><span>g = cavity − post position/projection</span><strong>g = ${format(wall.outerGap_mm, 1)} mm</strong></div>
            <div class="calc-line"><span>E<sub>mb</sub> = L<sub>actual</sub> − 18.77 − g</span><strong>${format(wall.actualTieLength_mm, 0)} − 18.77 − ${format(wall.outerGap_mm, 1)} = ${format(wall.outerEmbedment_mm, 1)} mm</strong></div>`}
            ${innerTieCalculation}
            <div class="calc-line"><span>${tieEquation}</span><strong>${tieSubstitution}</strong></div>
            <div class="calc-line"><span>Ultimate tie capacity</span><strong>${format(calculation.numberOfTies, 0)} × ${format((calculation.tieStrength ?? windpost.config.DEFAULT_TIE_STRENGTH_KN[section.type]), 3)} = ${format(calculation.totalTiesCapacity, 3)} kN</strong></div>
          </div>
        </section>

        ${connectionsSection(connections)}

        <section class="report-conclusion">
          <span>Final usable ULS capacity</span>
          <strong>${format(selected.finalCapacity_kN, 3)} kN</strong>
          <em>${escapeHtml(calculation.ultimateGoverningCriteriaStatus)}</em>
        </section>
      </article>`;
  }

  windpost.designReportService = Object.freeze({ buildReport });
})(window);
