(function initialiseSelectorApplication(global) {
  "use strict";

  const windpost = global.Windpost;
  const { getSections } = windpost.sectionProfileEngine;
  const { runDesign } = windpost.automaticSelectionEngine;
  const { buildReport } = windpost.designReportService;

  const app = {
    lastDesign: null,
    lastBaseplate: null,

    init() {
      this.form = document.getElementById("design-form");
      this.detailingTab = document.getElementById("detailing-tab");
      this.form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.calculate();
      });
      document.querySelectorAll('input[name="windpostType"], input[name="supportCondition"], input[name="loadType"], input[name="designMode"]')
        .forEach((input) => input.addEventListener("change", () => {
          this.updateConditionalInputs();
          this.invalidateResult();
        }));
      this.form.querySelectorAll('input[type="number"], select').forEach((input) => {
        input.addEventListener("input", () => this.invalidateResult());
        input.addEventListener("change", () => this.invalidateResult());
      });
      document.getElementById("close-details").addEventListener("click", () => this.hideDetails());
      document.getElementById("print-report").addEventListener("click", () => this.downloadPdf());
      this.detailingTab.addEventListener("click", () => this.openDetailing());
      this.projectFileInput = document.getElementById("project-json-file");
      this.projectStatus = document.getElementById("project-file-status");
      document.getElementById("save-project-json").addEventListener(
        "click", () => this.saveProject()
      );
      document.getElementById("open-project-json").addEventListener(
        "click", () => this.projectFileInput.click()
      );
      this.projectFileInput.addEventListener("change", async () => {
        const file = this.projectFileInput.files &&
          this.projectFileInput.files[0];
        await this.openProject(file);
        this.projectFileInput.value = "";
      });
      this.setDetailingAvailable(false);
      this.updateConditionalInputs();
      this.initTieStrengthEditor();
    },

    // --- Tie strength editor ------------------------------------------
    // Values are per tie LEVEL. Everything reads through config.tieStrength,
    // so applying an edit here changes the capacity, the detailed report and
    // the baseplate check together.

    initTieStrengthEditor() {
      this.tieDialog = document.getElementById("tie-strength-dialog");
      const openButton = document.getElementById("edit-tie-strengths");
      if (!this.tieDialog || !openButton) return;
      this.tieRows = document.getElementById("tie-strength-rows");
      this.tieError = document.getElementById("tie-strength-error");

      openButton.addEventListener("click", () => this.openTieStrengthEditor());
      document.getElementById("tie-strength-cancel")
        .addEventListener("click", () => this.tieDialog.close());
      document.getElementById("tie-strength-apply")
        .addEventListener("click", () => this.applyTieStrengths());
      document.getElementById("tie-strength-reset").addEventListener("click", () => {
        windpost.config.resetTieStrengths();
        this.renderTieStrengthRows();
        this.afterTieStrengthChange();
      });
      // Enter in any field applies rather than silently dismissing the dialog.
      document.getElementById("tie-strength-form").addEventListener("submit", (event) => {
        event.preventDefault();
        this.applyTieStrengths();
      });

      this.refreshTieStrengthReadouts();
    },

    openTieStrengthEditor() {
      this.renderTieStrengthRows();
      this.setTieStrengthError("");
      if (typeof this.tieDialog.showModal === "function") this.tieDialog.showModal();
      else this.tieDialog.setAttribute("open", "");
      const first = this.tieRows.querySelector("input");
      if (first) { first.focus(); first.select(); }
    },

    renderTieStrengthRows() {
      this.tieRows.innerHTML = windpost.config.listTieStrengths().map((tie) => {
        const note = tie.derived
          ? `Following the U tie (2 × ${this.number(windpost.config.tieStrength("U"), 3)})`
          : `${tie.type} post · catalogue ${this.number(tie.defaultValue, 3)} kN`;
        return `
          <div class="tie-row">
            <label for="tie-strength-${tie.type}">
              <span class="tie-row-name">${this.escape(tie.label)}</span>
              <span class="tie-row-meta">${this.escape(note)}</span>
            </label>
            <span class="tie-row-input">
              <input id="tie-strength-${tie.type}" data-tie-type="${tie.type}" type="number"
                     step="0.001" min="0" value="${this.number(tie.value, 3)}">
              <span class="tie-row-unit">kN</span>
            </span>
          </div>`;
      }).join("");
    },

    setTieStrengthError(message) {
      this.tieError.textContent = message;
      this.tieError.classList.toggle("hidden", !message);
    },

    applyTieStrengths() {
      const inputs = [...this.tieRows.querySelectorAll("input[data-tie-type]")];
      const bad = inputs.filter((input) => {
        const value = Number(input.value);
        const ok = input.value.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= 1000;
        input.classList.toggle("is-invalid", !ok);
        return !ok;
      });
      if (bad.length) {
        this.setTieStrengthError("Enter a tie strength between 0 and 1000 kN.");
        bad[0].focus();
        return;
      }

      inputs.forEach((input) => {
        const type = input.dataset.tieType;
        const value = Number(input.value);
        // Writing back the catalogue value clears the override rather than
        // pinning it, so DU can resume following U and the badge clears.
        if (value === windpost.config.DEFAULT_TIE_STRENGTH_KN[type]) windpost.config.clearTieStrength(type);
        else windpost.config.setTieStrength(type, value);
      });

      this.setTieStrengthError("");
      this.tieDialog.close();
      this.afterTieStrengthChange();
    },

    afterTieStrengthChange() {
      this.refreshTieStrengthReadouts();
      // A displayed capacity computed on the old strengths would now be wrong,
      // so recompute it if one is on screen; otherwise just clear it.
      const showing = !document.getElementById("result-content").classList.contains("hidden");
      if (showing) this.calculate();
      else this.invalidateResult();
    },

    refreshTieStrengthReadouts() {
      windpost.config.listTieStrengths().forEach((tie) => {
        const cell = document.querySelector(`[data-tie-readout="${tie.type}"]`);
        if (!cell) return;
        cell.textContent = `${this.number(tie.value, 3)} kN`;
        cell.classList.toggle("is-custom", tie.custom);
      });
      const flag = document.getElementById("tie-strength-flag");
      if (flag) flag.classList.toggle("hidden", !windpost.config.isTieStrengthCustom());
    },

    setProjectStatus(message, failed) {
      if (!this.projectStatus) return;
      this.projectStatus.textContent = message || "";
      this.projectStatus.style.color = failed ? "#b3261e" : "";
    },

    saveProject() {
      const engine = windpost.projectFileEngine;
      if (!engine) return;
      const options = this.readOptions();
      const project = engine.create("selector", {
        options,
        hasSuccessfulDesign: Boolean(this.lastDesign)
      }, {
        sectionName: this.lastDesign && this.lastDesign.selected &&
          this.lastDesign.selected.section &&
          this.lastDesign.selected.section.name
      });
      const name = this.lastDesign && this.lastDesign.selected
        ? this.lastDesign.selected.section.name
        : options.selectedSectionName || "windpost-selector";
      engine.download(project, name);
      try { engine.storeDraft(project, global.localStorage); } catch (error) {}
      this.setProjectStatus("Project JSON saved.");
    },

    async openProject(file) {
      const engine = windpost.projectFileEngine;
      const project = engine && await engine.readFile(file);
      if (!project || project.kind !== "selector") {
        this.setProjectStatus(
          "This is not a valid selector project file.", true
        );
        return;
      }
      const options = project.data && project.data.options;
      if (!options) {
        this.setProjectStatus("The project contains no selector inputs.", true);
        return;
      }
      const choose = (name, value) => {
        const input = document.querySelector(
          `input[name="${name}"][value="${String(value)}"]`
        );
        if (input) input.checked = true;
      };
      choose("windpostType", options.type);
      choose("supportCondition", options.supportCondition);
      choose("loadType", options.loadType);
      choose("designMode", options.mode);
      document.getElementById("height").value = options.length_mm;
      document.getElementById("required-load").value =
        options.requiredLoad_kN == null ? "" : options.requiredLoad_kN;
      const wall = options.wall || {};
      document.getElementById("inner-leaf").value =
        wall.innerLeafThickness_mm || 100;
      document.getElementById("cavity").value =
        wall.cavityWidth_mm || 150;
      document.getElementById("outer-leaf").value =
        wall.outerLeafThickness_mm || 100;
      this.updateConditionalInputs();
      const select = document.getElementById("section-select");
      if (Array.from(select.options).some(option =>
          option.value === options.selectedSectionName)) {
        select.value = options.selectedSectionName;
      }
      this.setProjectStatus("Project opened and recalculated.");
      this.calculate();
    },

    selectedValue(name) {
      const selected = document.querySelector(`input[name="${name}"]:checked`);
      return selected ? selected.value : "";
    },

    updateConditionalInputs() {
      const type = this.selectedValue("windpostType");
      const support = this.selectedValue("supportCondition");
      const mode = this.selectedValue("designMode");
      const pointInput = document.querySelector('input[name="loadType"][value="tipPointLoad"]');
      const pointChoice = document.getElementById("point-load-choice");

      pointInput.disabled = support !== "cantilever";
      pointChoice.classList.toggle("is-disabled", support !== "cantilever");
      if (support !== "cantilever" && pointInput.checked) {
        document.querySelector('input[name="loadType"][value="udl"]').checked = true;
      }

      const loadType = this.selectedValue("loadType");
      document.getElementById("required-load-label").innerHTML = loadType === "tipPointLoad"
        ? "Required ULS top point load <b>*</b>"
        : "Required total ULS UDL load <b>*</b>";
      document.getElementById("automatic-input").classList.toggle("hidden", mode !== "automatic");
      document.getElementById("manual-input").classList.toggle("hidden", mode !== "manual");
      this.populateSections(type, support);
    },

    populateSections(type, support) {
      const select = document.getElementById("section-select");
      const previous = select.value;
      const sections = getSections(type, support);
      select.innerHTML = sections.map((section) =>
        `<option value="${this.escape(section.name)}">${this.escape(section.name)}</option>`
      ).join("");
      if (sections.some((section) => section.name === previous)) select.value = previous;
    },

    readOptions() {
      const mode = this.selectedValue("designMode");
      return {
        type: this.selectedValue("windpostType"),
        supportCondition: this.selectedValue("supportCondition"),
        loadType: this.selectedValue("loadType"),
        mode,
        length_mm: Number(document.getElementById("height").value),
        requiredLoad_kN: mode === "automatic" ? Number(document.getElementById("required-load").value) : null,
        selectedSectionName: document.getElementById("section-select").value,
        wall: {
          innerLeafThickness_mm: Number(document.getElementById("inner-leaf").value),
          cavityWidth_mm: Number(document.getElementById("cavity").value),
          outerLeafThickness_mm: Number(document.getElementById("outer-leaf").value)
        }
      };
    },

    selectorFileName() {
      return windpost.designTransferEngine.selectorFileName(global.location);
    },

    detailingHref(design) {
      const snapshot = windpost.designTransferEngine.snapshot(
        design,
        this.lastBaseplate,
        global.location
      );
      let storage = null;
      try { storage = global.sessionStorage; } catch (error) { storage = null; }
      windpost.designTransferEngine.store(snapshot, storage);
      return windpost.designTransferEngine.href(snapshot);
    },

    setDetailingAvailable(available) {
      if (!this.detailingTab) return;
      const design = available ? this.lastDesign : null;
      const selected = design && design.selected;
      const section = selected && selected.section;
      // A DU selects and calculates, but the baseplate detail and the folded
      // drawings for a welded pair do not exist yet, so Detailing stays shut
      // rather than opening onto a sheet it cannot draw.
      const detailingReady = section && section.type !== "DU";
      this.detailingTab.disabled = !detailingReady;
      this.detailingTab.title = !section
        ? "Run a successful windpost selection first"
        : section.type === "DU"
          ? "Production drawings are not available for DU posts yet — " +
            "the baseplate detail is still to be defined"
          : `Open production drawings for ${section.name}`;
    },

    openDetailing() {
      const href = this.detailingHref(this.lastDesign);
      if (href) global.location.href = href;
    },

    calculate() {
      const button = document.getElementById("calculate-button");
      button.disabled = true;
      button.querySelector("span").textContent = "Calculating…";
      try {
        const design = runDesign(this.readOptions());
        this.lastDesign = design.valid ? design : null;
        if (design.valid) this.renderSuccess(design);
        else this.renderFailure(design);
      } catch (error) {
        this.renderFailure({ message: `The calculation could not be completed: ${error.message}` });
      } finally {
        button.disabled = false;
        button.querySelector("span").textContent = "Run windpost selection";
      }
    },

    invalidateResult() {
      if (!this.lastDesign && document.getElementById("result-content").classList.contains("hidden")) return;
      this.lastDesign = null;
      this.lastBaseplate = null;
      this.setDetailingAvailable(false);
      document.getElementById("result-content").classList.add("hidden");
      document.getElementById("result-placeholder").classList.remove("hidden");
      document.getElementById("detailed-section").classList.add("hidden");
    },

    renderSuccess(design) {
      const selected = design.selected;
      const { section, calculation, wall } = selected;
      const isAutomatic = design.mode === "automatic";
      const bp = this.designBasePlate(design);
      this.lastBaseplate = bp;
      this.setDetailingAvailable(true);
      const utilisation = isAutomatic ? selected.utilizationPercent : null;
      const utilisationWidth = utilisation === null ? 100 : Math.min(100, Math.max(0, utilisation));
      const alternatives = design.alternatives.length
        ? `<div class="alternatives"><span>Next suitable sections</span>${design.alternatives.map((item) =>
            `<div class="alternative-row"><strong>${this.escape(item.section.name)}</strong><span>${this.number(item.finalCapacity_kN, 2)} kN</span></div>`
          ).join("")}</div>`
        : "";
      const capacityMeta = isAutomatic
        ? `<span>Required: <strong>${this.number(selected.requiredLoad_kN, 2)} kN</strong></span><span>Utilisation: <strong>${this.number(utilisation, 1)}%</strong></span>`
        : `<span>Maximum calculated ULS capacity</span><span>Exact height: <strong>${this.number(design.inputs.length_mm, 0)} mm</strong></span>`;

      document.getElementById("result-placeholder").classList.add("hidden");
      const result = document.getElementById("result-content");
      result.classList.remove("hidden");
      result.innerHTML = `
        <div class="result-top">
          <div class="status-row"><span class="result-status">${isAutomatic ? "Suitable" : "Calculated"}</span><span class="result-mode">${isAutomatic ? "Automatic selection" : "Selected-section check"}</span></div>
          <div class="result-section-name">
            <div class="result-shape"><span class="shape-icon shape-${section.type.toLowerCase()}"><i></i>${section.type === "DU" ? "<b></b>" : ""}</span></div>
            <div><h2>${this.escape(section.name)}</h2><p>${section.type}-shaped windpost · ${this.supportLabel(design.inputs.supportCondition)} · ${this.number(design.inputs.length_mm, 0)} mm</p></div>
          </div>
        </div>
        <div class="capacity-hero">
          <span>Final governing ULS capacity</span>
          <div class="capacity-number"><strong>${this.number(selected.finalCapacity_kN, 2)}</strong><b>kN</b></div>
          <div class="capacity-meta">${capacityMeta}</div>
          <div class="utilisation-track"><i style="width:${utilisationWidth}%"></i></div>
        </div>
        <div class="result-body">
          <section class="result-block">
            <h3>Windpost result</h3>
            <dl class="result-list">
              <div><dt>Governing criterion</dt><dd>${this.escape(calculation.ultimateGoverningCriteriaStatus)}</dd></div>
              <div><dt>Deflection capacity</dt><dd>${this.number(calculation.ultimateLoadDeflectionBased, 2)} kN</dd></div>
              <div><dt>Bending capacity</dt><dd>${this.number(calculation.ultimateLoadBendingMomentBased, 2)} kN</dd></div>
              <div><dt>Tie capacity</dt><dd>${this.number(calculation.totalTiesCapacity, 2)} kN</dd></div>
              <div><dt>Scheduled tie levels</dt><dd>${this.number(calculation.numberOfTies, 0)}</dd></div>
            </dl>
          </section>
          <section class="result-block">
            <h3>Supply with this post</h3>
            <div class="tie-callout">
              <div class="tie-card"><span>Inner leaf</span><strong>${this.number(calculation.numberOfTies * (wall.tieSetsPerLevel || 1), 0)} no. ${this.escape(wall.innerTie)}</strong><small>${this.escape(wall.innerTieNote || "")}</small></div>
              <div class="tie-card"><span>Outer leaf</span><strong>${this.number(calculation.numberOfTies * (wall.tieSetsPerLevel || 1), 0)} no. ${this.escape(wall.outerTie)}</strong><small>${this.number(wall.outerEmbedment_mm, 1)} mm embedment</small></div>
            </div>
            <dl class="result-list">
              <div><dt>Clear gap to outer leaf</dt><dd>${this.number(wall.outerGap_mm, 1)} mm</dd></div>
              <div><dt>Post placement</dt><dd>${this.escape(wall.placementDescription)}</dd></div>
              <div><dt>Wall construction</dt><dd>${this.number(wall.innerLeafThickness_mm, 0)} / ${this.number(wall.cavityWidth_mm, 0)} / ${this.number(wall.outerLeafThickness_mm, 0)} mm</dd></div>
            </dl>
          </section>
          ${alternatives}
          ${bp ? this.basePlateBlockHtml(bp) : this.basePlateHintHtml(design)}
          ${bp && bp.ok ? this.basePlateDrawingHtml(bp) : ""}
          <div class="result-actions">
            ${section.type === "L" ? `<a class="secondary-button" href="./cavity-wall-assembly.html" target="_blank" rel="noopener" id="open-cavity-wall">Open cavity-wall assembly</a>` : ""}
            <button class="secondary-button" type="button" id="view-calculation">View calculations</button>
            <button class="primary-button small" type="button" id="download-pdf">Download PDF</button>
          </div>
        </div>`;
      const cavityButton = document.getElementById("open-cavity-wall");
      if (cavityButton) {
        cavityButton.addEventListener("click", () => {
          cavityButton.href = this.openCavityWallAssembly(design, bp);
        });
      }
      document.getElementById("view-calculation").addEventListener("click", () => this.showDetails());
      document.getElementById("download-pdf").addEventListener("click", () => this.downloadPdf());
      const svgBtn = document.getElementById("download-bp-svg");
      if (svgBtn) svgBtn.addEventListener("click", () => this.downloadSvg());
      const baseplatePreview = document.getElementById("baseplate-drawing-preview");
      if (baseplatePreview && windpost.drawingLayoutEngine) {
        const root = baseplatePreview.querySelector("svg");
        if (root) windpost.drawingLayoutEngine.resolve(root);
      }
      if (baseplatePreview && windpost.engineeringCanvasRenderer) {
        windpost.engineeringCanvasRenderer.enhance(baseplatePreview, {
          steel: false
        });
      }
      document.getElementById("detailed-report").innerHTML = buildReport(design) + (bp ? this.basePlateReportHtml(bp) : "");
      document.getElementById("detailed-section").classList.add("hidden");
      this.scrollResultIntoView();
    },

    renderFailure(design) {
      this.setDetailingAvailable(false);
      document.getElementById("result-placeholder").classList.add("hidden");
      const result = document.getElementById("result-content");
      result.classList.remove("hidden");
      const strongest = design.strongest
        ? `<div class="failure-detail">The strongest calculated catalogue capacity was ${this.number(design.strongest.finalCapacity_kN, 2)} kN for ${this.escape(design.strongest.section.name)}. Its wall status was: ${this.escape(design.strongest.wall.reason)}</div>`
        : "";
      result.innerHTML = `<div class="failure-result"><div class="failure-icon">!</div><p class="eyebrow">No specification issued</p><h2>No suitable result was found.</h2><p>${this.escape(design.message || "Check the entered values and try again.")}</p>${strongest}</div>`;
      document.getElementById("detailed-section").classList.add("hidden");
      this.scrollResultIntoView();
    },

    showDetails(scroll = true) {
      if (!this.lastDesign) return;
      const section = document.getElementById("detailed-section");
      section.classList.remove("hidden");
      if (scroll) section.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    hideDetails() {
      document.getElementById("detailed-section").classList.add("hidden");
    },

    downloadPdf() {
      if (!this.lastDesign) return;
      // Reveal the report, then open the browser's print dialog. Choosing
      // "Save as PDF" there produces the A4 report (see the print stylesheet).
      this.showDetails(false);
      global.print();
    },

    scrollResultIntoView() {
      if (global.matchMedia("(max-width: 1080px)").matches) {
        document.getElementById("result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },

    designBasePlate(design) {
      return windpost.selectorBaseplateRoutingEngine.design(design);
    },

    basePlateHintHtml(design) {
      const inputs = design.inputs || {};
      const section = design.selected && design.selected.section;
      if (inputs.supportCondition === "cantilever" && section &&
          (section.type === "L" || section.type === "U")) return "";
      return `<section class="result-block"><h3>Base plate design</h3>
          <p style="color:#5b636c;margin:0">Fixed standard base‑plate details are generated for <strong>simply-supported U‑ and L‑posts</strong>. Automatic designed baseplates are generated for <strong>cantilever U‑ and L‑posts</strong>.</p></section>`;
    },

    basePlateGovName(util) {
      const names = {
        boltGroup: "Bolt-group moment", plateLocal: "Plate local bending",
        tstub: "Bolt tension (T-stub)", stiffener: "Base + stiffener bending",
        shearBolt: "Bolt shear", shearPlate: "Plate shear", rigid: "Plate rigidity"
      };
      let key = "boltGroup", max = -Infinity;
      for (const k in util) if (util[k] > max) { max = util[k]; key = k; }
      return names[key] || key;
    },

    basePlateBlockHtml(bp) {
      if (bp && bp.standard) {
        if (!bp.ok) {
          return `<section class="result-block"><h3>Simply-supported ${this.escape(bp.postType || "")}-post base plate</h3><p>${this.escape(bp.reason || "The standard detail is not available.")}</p></section>`;
        }
        const d = bp.design, r = bp.results;
        const isL = bp.connectionType === "simply-supported-l";
        const left = isL ? d.leftPortion : 12 + Number(bp.section.a_mm);
        const overall = left + d.plateLen;
        const leftFormula = isL
          ? `6 + (${this.number(bp.section.a_mm, 0)} − 90) = ${left} mm`
          : `6 + ${this.number(bp.section.a_mm, 0)} + 6 = ${left} mm`;
        const colour = r.pass ? "#137a3e" : "#b3261e";
        return `<section class="result-block">
            <h3>Simply-supported ${this.escape(bp.postType)}-post base plate <span style="float:right;font-size:.8em;color:${colour}">${r.pass ? "PASS" : "FAIL"}</span></h3>
            <dl class="result-list">
              <div><dt>Base plate</dt><dd>${overall} × ${d.B} × ${d.tp} mm</dd></div>
              <div><dt>Left portion</dt><dd>${leftFormula}</dd></div>
              <div><dt>Right portion</dt><dd>${d.anchorFromConcreteEdge} mm to anchor line + ${d.rightEndDistance} mm to plate end = ${d.plateLen} mm</dd></div>
              <div><dt>Anchors — RGM 12</dt><dd>2 no. · Ø${d.holeDia} holes · ${d.w} mm c/c · ${d.sideEdge} mm side edges</dd></div>
              <div><dt>Edge-spacing check</dt><dd>minimum provided ${r.minimumProvided} mm ≥ ${r.minimumRequired} mm required — ${r.pass ? "PASS" : "FAIL"}</dd></div>
            </dl>
          </section>`;
      }
      if (!bp || !bp.ok) {
        return `<section class="result-block"><h3>Base plate design</h3><p>${this.escape((bp && bp.reason) || "Not available for this selection.")}</p></section>`;
      }
      const d = bp.design, r = bp.results, pass = r.pass;
      const colour = pass ? "#137a3e" : "#b3261e";
      return `<section class="result-block">
          <h3>Base plate design <span style="float:right;font-size:.8em;color:${colour}">${pass ? "PASS" : "FAIL"} · ${this.number(r.govUtil * 100, 1)}%</span></h3>
          <dl class="result-list">
            <div><dt>Base moment (${this.escape(bp.loadModel)})</dt><dd>${this.number(bp.moment, 2)} kNm</dd></div>
            <div><dt>Base plate</dt><dd>${d.plateLen} × ${d.B} × ${d.tp} mm</dd></div>
            <div><dt>Anchors — RGM 12</dt><dd>${d.nRow} rows × ${d.nCol} cols (${d.nRow * d.nCol} no.) · edge ${d.edge} · pitch ${d.pitch}</dd></div>
            <div><dt>Stiffener (triangular)</dt><dd>${d.tw} mm thick × ${d.hUp} mm high</dd></div>
            <div><dt>Governing check</dt><dd>${this.escape(this.basePlateGovName(r.util))} — ${this.number(r.govUtil * 100, 1)}%</dd></div>
          </dl>
        </section>`;
    },

    basePlateReportHtml(bp) {
      if (bp && bp.standard) {
        if (!bp.ok) return "";
        const d = bp.design, r = bp.results;
        const isL = bp.connectionType === "simply-supported-l";
        const left = isL ? d.leftPortion : 12 + Number(bp.section.a_mm);
        const overall = left + d.plateLen;
        const leftFormula = isL
          ? `6 + (${this.number(bp.section.a_mm, 0)} − 90) = ${left} mm`
          : `6 + ${this.number(bp.section.a_mm, 0)} + 6 = ${left} mm`;
        return `<section class="report-block" style="margin-top:1.5rem">
            <h3>Base plate standard detail — simply-supported ${this.escape(bp.postType)}-post</h3>
            <p style="font-size:.85em;color:#5b636c">This is a fixed standard arrangement and does not use structural baseplate analysis. Plate ${overall} × ${d.B} × ${d.tp} mm: left portion ${leftFormula}; right portion ${d.plateLen} mm. Two RGM 12 anchors use Ø${d.holeDia} holes at ${d.anchorFromConcreteEdge} mm from the concrete edge, ${d.rightEndDistance} mm from the plate end and ${d.w} mm c/c across the width.</p>
            <table style="width:100%;border-collapse:collapse;font-size:.9em">
              <thead><tr style="border-bottom:2px solid #333"><th style="text-align:left">Check</th><th style="text-align:left">Provided</th><th style="text-align:left">Required</th><th style="text-align:right">Status</th></tr></thead>
              <tbody><tr><td>Minimum anchor edge distance</td><td>${r.minimumProvided} mm</td><td>≥ ${r.minimumRequired} mm</td><td style="text-align:right;color:${r.pass ? "#137a3e" : "#b3261e"}">${r.pass ? "PASS" : "FAIL"}</td></tr></tbody>
            </table>
          </section>`;
      }
      if (!bp || !bp.ok) return "";
      const d = bp.design, r = bp.results, u = r.util, kNm = 1e6, kN = 1e3;
      const row = (name, detail, util) =>
        `<tr><td>${name}</td><td>${detail}</td><td style="text-align:right">${this.number(util * 100, 1)}%</td><td style="text-align:right;color:${util <= 1 ? "#137a3e" : "#b3261e"}">${util <= 1 ? "PASS" : "FAIL"}</td></tr>`;
      return `<section class="report-block" style="margin-top:1.5rem">
          <h3>Base plate design — cantilever ${this.escape(bp.postType || "")}-post (RGM 12)</h3>
          <p style="font-size:.85em;color:#5b636c">Hybrid method: CED own logic + EC3-1-8 equivalent T-stub (SCI P291). Base moment M = ${this.escape(bp.loadModel)} = ${this.number(bp.W, 2)} kN × ${this.number(bp.H, 3)} m = <strong>${this.number(bp.moment, 3)} kNm</strong>. Plate ${d.plateLen}×${d.B}×${d.tp}, stiffener ${d.tw}×${d.hUp} (triangular), ${d.nRow * d.nCol} × RGM 12 (edge ${d.edge}, pitch ${d.pitch}).</p>
          <table style="width:100%;border-collapse:collapse;font-size:.9em">
            <thead><tr style="border-bottom:2px solid #333"><th style="text-align:left">Check</th><th style="text-align:left">Detail</th><th style="text-align:right">Util.</th><th style="text-align:right">Status</th></tr></thead>
            <tbody>
              ${row("Bolt-group moment", `M_r = ${d.nCol}·${this.number(bp.input.FtRd_N / kN, 1)}·Σarms = ${this.number(r.Mr / kNm, 3)} kNm`, u.boltGroup)}
              ${row("Plate local bending", `M_Ed = F_t,Ed·m = ${this.number(r.Mlocal / kNm, 3)} kNm vs M_pl ${this.number(r.Mpl / kNm, 3)}`, u.plateLocal)}
              ${row("Plate rigidity", `t_req = ${this.number(r.treqRigid, 2)} mm ≤ ${d.tp} mm`, u.rigid)}
              ${row("Bolt tension (Modes 1/2/3)", `min(${this.number(r.mode1 / kN, 1)}, ${this.number(r.mode2 / kN, 1)}, ${this.number(r.mode3 / kN, 1)}) = ${this.number(r.tstubGov / kN, 2)} kN vs F_t,Ed ${this.number(r.FtEd / kN, 2)}`, u.tstub)}
              ${row("Base + stiffener bending", `M_R = Z·f_y/γ_M0 = ${this.number(r.stiffMr / kNm, 3)} kNm (Z=${this.number(r.stiffZ, 0)})`, u.stiffener)}
              ${row("Bolt shear", `V_Ed ${this.number(bp.input.V_Ed / kN, 1)} kN vs ${this.number(r.shBolt / kN, 1)} kN`, u.shearBolt)}
              ${row("Plate shear", `V_pl,Rd = ${this.number(r.Vpl / kN, 1)} kN`, u.shearPlate)}
            </tbody>
          </table>
        </section>`;
    },

    basePlateDrawingService(bp) {
      return windpost.baseplateDrawingRoutingEngine.serviceFor(bp);
    },

    basePlateDrawingHtml(bp) {
      const drawingService = this.basePlateDrawingService(bp);
      if (!bp || !bp.ok || !drawingService) return "";
      let svg = "";
      try { svg = drawingService.draw(bp.design, bp.section).svg; }
      catch (err) { return `<section class="result-block"><h3>Base plate drawing</h3><p>Drawing unavailable: ${this.escape(err.message)}</p></section>`; }
      const title = bp.standard
        ? "Simply-supported " + bp.postType + "-post standard base plate drawing"
        : ((bp.section && bp.section.type) || "") + "-post base plate drawing";
      return `<section class="result-block">
          <h3>${this.escape(title)}</h3>
          <div id="baseplate-drawing-preview" style="overflow-x:auto;border:1px solid #e2e6ea;border-radius:8px;background:#fff;padding:6px">${svg}</div>
          <div style="margin-top:8px"><button class="secondary-button" type="button" id="download-bp-svg">Download drawing (SVG)</button></div>
        </section>`;
    },

    downloadSvg() {
      const bp = this.lastBaseplate;
      const drawingService = this.basePlateDrawingService(bp);
      if (!bp || !bp.ok || !drawingService) return;
      const svg = drawingService.draw(bp.design, bp.section).svg;
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url;
      a.download = "baseplate-" + String((bp.section && bp.section.name) || "design").replace(/\s+/g, "-") + ".svg";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    },

    openCavityWallAssembly(design, bp) {
      const selected = design && design.selected;
      const section = selected && selected.section;
      if (!section || section.type !== "L") return;
      const wall = selected.wall || {};
      const baseplate = bp && bp.ok ? {
        ok: true,
        standard: Boolean(bp.standard),
        connectionType: bp.connectionType || "",
        postType: "L",
        design: { ...(bp.design || {}) },
        results: bp.results ? { ...bp.results } : null
      } : null;
      const payload = {
        version: 1,
        type: "L",
        sectionName: section.name,
        section: {
          type: section.type,
          name: section.name,
          a_mm: section.a_mm,
          b_mm: section.b_mm,
          t_mm: section.t_mm,
          innerRadius_mm: section.innerRadius_mm,
          outerRadius_mm: section.outerRadius_mm
        },
        length_mm: Number(design.inputs.length_mm),
        supportCondition: design.inputs.supportCondition,
        loadType: design.inputs.loadType,
        finalCapacity_kN: Number(selected.finalCapacity_kN),
        wall: {
          innerLeafThickness_mm: Number(wall.innerLeafThickness_mm),
          cavityWidth_mm: Number(wall.cavityWidth_mm),
          outerLeafThickness_mm: Number(wall.outerLeafThickness_mm)
        },
        tieSchedule: {
          count: Number(selected.calculation.numberOfTies),
          firstCentre_mm: 225,
          spacing_mm: 225
        },
        baseplate
      };
      try {
        global.localStorage.setItem(
          "windpost.cavityAssembly.v1",
          JSON.stringify(payload)
        );
      } catch (error) {
        // Query parameters below still transfer the essential geometry.
      }
      const query = new URLSearchParams({
        section: section.name,
        height: String(payload.length_mm),
        support: payload.supportCondition,
        inner: String(payload.wall.innerLeafThickness_mm),
        cavity: String(payload.wall.cavityWidth_mm),
        outer: String(payload.wall.outerLeafThickness_mm)
      });
      return `./cavity-wall-assembly.html?${query.toString()}`;
    },

    supportLabel(value) {
      return value === "cantilever" ? "Cantilever" : "Simply supported";
    },

    number(value, decimals = 2) {
      const number = Number(value);
      return Number.isFinite(number) ? number.toFixed(decimals) : "—";
    },

    escape(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  };

  global.windpostSelectorApp = app;
  global.addEventListener("DOMContentLoaded", () => app.init());
})(window);
