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
      this.form.querySelectorAll('input[type="number"], input[type="checkbox"], select').forEach((input) => {
        input.addEventListener("input", () => this.invalidateResult());
        input.addEventListener("change", () => this.invalidateResult());
      });
      ["head", "base"].forEach((end) => {
        document.getElementById(`${end}-fixing`).addEventListener("change", () => this.populateBoltFamilies(end));
        document.getElementById(`special-${end}`).addEventListener("change", () => this.updateSpecialRows());
      });
      this.populateSpecialSkus();
      this.updateSpecialRows();
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
      this.restoreConnectionInputs(options.connections || {});
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
      const mode = this.selectedValue("designMode");
      const pointInput = document.querySelector('input[name="loadType"][value="tipPointLoad"]');
      const pointChoice = document.getElementById("point-load-choice");
      const cantileverInput = document.querySelector('input[name="supportCondition"][value="cantilever"]');
      const cantileverChoice = document.getElementById("cantilever-choice");
      const cantileverAllowed = windpost.sectionProfileEngine.supportsCantilever(type);
      cantileverInput.disabled = !cantileverAllowed;
      if (cantileverChoice) cantileverChoice.classList.toggle("is-disabled", !cantileverAllowed);
      if (!cantileverAllowed && cantileverInput.checked) {
        document.querySelector('input[name="supportCondition"][value="simplySupported"]').checked = true;
      }
      const support = this.selectedValue("supportCondition");

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
      this.populateFixings(type, support);
    },

    // ---- connections form ------------------------------------------------
    populateFixings(type, support) {
      const engine = windpost.connectionSelectionEngine;
      if (!engine) return;
      const fill = (select, items, keepValue) => {
        const previous = keepValue ? select.value : "";
        select.innerHTML = items.map((item) =>
          `<option value="${this.escape(item.value)}">${this.escape(item.label)}</option>`).join("");
        if (items.some((item) => item.value === previous)) select.value = previous;
      };
      const head = document.getElementById("head-fixing");
      const base = document.getElementById("base-fixing");
      const headNote = document.getElementById("head-fixing-note");
      const baseNote = document.getElementById("base-fixing-note");
      if (support === "cantilever") {
        fill(head, [{ value: "", label: engine.NOT_APPLICABLE }], false);
        fill(base, [{ value: "", label: engine.CANTILEVER_BASE_AUTO }], false);
        head.disabled = true; base.disabled = true;
        headNote.textContent = "A cantilever post has no head connection.";
        baseNote.textContent = "Standard plate type (U-A to U-G / L-A to L-G) chosen by the base moment; anchors RGM 12.";
      } else {
        const heads = engine.listFixings(type, support, "top");
        const bases = engine.listFixings(type, support, "bottom");
        fill(head, heads.map((c) => ({ value: c.description, label: `${c.description.trim()}  (${c.code})` })), true);
        fill(base, bases.map((c) => ({ value: c.description, label: `${c.description.trim()}  (${c.code})` })), true);
        head.disabled = false; base.disabled = false;
        headNote.textContent = type === "I" ? "I-post connections are copies of the U-post library pending confirmation." : "";
        baseNote.textContent = type === "I" ? "I-post connections are copies of the U-post library pending confirmation." : "";
      }
      this.populateBoltFamilies("head");
      this.populateBoltFamilies("base");
    },

    populateBoltFamilies(end) {
      const engine = windpost.connectionSelectionEngine;
      const type = this.selectedValue("windpostType");
      const support = this.selectedValue("supportCondition");
      const select = document.getElementById(`${end}-bolt-family`);
      const previous = select.value;
      let families = [];
      if (support === "cantilever") {
        families = end === "head" ? [] : [engine.BOLT_FAMILIES.RGM];
      } else {
        const fixing = document.getElementById(`${end}-fixing`).value;
        const connection = engine.findConnection(type, support, end === "head" ? "top" : "bottom", fixing);
        families = connection ? engine.boltFamiliesFor(connection.materialClass) : [];
      }
      select.innerHTML = families.map((f) => `<option value="${this.escape(f)}">${this.escape(f)}</option>`).join("") ||
        `<option value="">${end === "head" ? "Not applicable" : "RGM BOLTS"}</option>`;
      if (families.includes(previous)) select.value = previous;
      select.disabled = families.length <= 1;
    },

    populateSpecialSkus() {
      const db = windpost.connectionsDatabase;
      const skus = (db && db.boltSkus ? db.boltSkus : []).map((row) => row.sku);
      ["special-head-sku", "special-base-sku"].forEach((id) => {
        const select = document.getElementById(id);
        select.innerHTML = skus.map((sku) => `<option value="${this.escape(sku)}">${this.escape(sku)}</option>`).join("");
      });
    },

    updateSpecialRows() {
      ["head", "base"].forEach((end) => {
        const on = document.getElementById(`special-${end}`).checked;
        document.getElementById(`special-${end}-row`).classList.toggle("is-off", !on);
      });
    },

    readConnectionInputs() {
      const value = (id) => document.getElementById(id).value;
      const number = (id) => Number(document.getElementById(id).value);
      const checked = (id) => document.getElementById(id).checked;
      return {
        headFixing: value("head-fixing"),
        baseFixing: value("base-fixing"),
        headBoltFamily: value("head-bolt-family"),
        baseBoltFamily: value("base-bolt-family"),
        postsCount: number("posts-count"),
        deliveries: number("deliveries"),
        debondingSleeve: value("debonding-sleeve") === "yes",
        special: {
          head: { enabled: checked("special-head"), weight_kg: number("special-head-weight"), material: value("special-head-material"), sku: value("special-head-sku"), bolts: number("special-head-bolts") },
          base: { enabled: checked("special-base"), weight_kg: number("special-base-weight"), material: value("special-base-material"), sku: value("special-base-sku"), bolts: number("special-base-bolts") }
        }
      };
    },

    restoreConnectionInputs(c) {
      const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
      set("head-fixing", c.headFixing); set("base-fixing", c.baseFixing);
      this.populateBoltFamilies("head"); this.populateBoltFamilies("base");
      set("head-bolt-family", c.headBoltFamily); set("base-bolt-family", c.baseBoltFamily);
      set("posts-count", c.postsCount); set("deliveries", c.deliveries);
      set("debonding-sleeve", c.debondingSleeve === false ? "no" : "yes");
      const special = c.special || {};
      ["head", "base"].forEach((end) => {
        const sp = special[end] || {};
        document.getElementById(`special-${end}`).checked = Boolean(sp.enabled);
        set(`special-${end}-weight`, sp.weight_kg); set(`special-${end}-material`, sp.material);
        set(`special-${end}-sku`, sp.sku); set(`special-${end}-bolts`, sp.bolts);
      });
      this.updateSpecialRows();
    },

    selectConnections(design) {
      const engine = windpost.connectionSelectionEngine;
      if (!engine || !design || !design.selected) return null;
      const selected = design.selected;
      return engine.select({
        ...this.readConnectionInputs(),
        type: design.inputs.type,
        supportCondition: design.inputs.supportCondition,
        loadType: design.inputs.loadType,
        length_mm: design.inputs.length_mm,
        section: selected.section,
        finalCapacity_kN: selected.finalCapacity_kN,
        numberOfTies: selected.calculation.numberOfTies
      });
    },

    connectionsBlockHtml(c) {
      if (!c) return "";
      const n = (v, d = 3) => this.number(v, d);
      const e = (v) => this.escape(v);
      const row = (label, head, base) => `<tr><td>${label}</td><td>${head}</td><td>${base}</td></tr>`;
      const headNa = !c.head.applicable;
      const plate = c.base.plate;
      const plateRows = plate && Number.isFinite(plate.capacity_kNm)
        ? `<div><dt>Base moment (${e(plate.loadModel)})</dt><dd>${n(c.base.moment_kNm, 3)} kNm &le; ${n(plate.capacity_kNm, 3)} kNm</dd></div>
           <div><dt>Plate type ${e(plate.code)}</dt><dd>${n(plate.plateLength_mm, 0)} &times; ${plate.plateWid_mm} &times; ${plate.plateThk_mm} mm, stiffener ${plate.stiffThk_mm} mm</dd></div>
           <div><dt>Plate + stiffener weight</dt><dd>${n(plate.plateKg, 2)} + ${n(plate.stiffKg, 2)} = ${n(plate.totalKg, 2)} kg</dd></div>`
        : (plate ? `<div><dt>Base plate</dt><dd>Special design (moment ${n(c.base.moment_kNm, 3)} kNm beyond the standard types)</dd></div>` : "");
      const warnings = c.warnings.length ? `<p style="color:#b3261e;margin:6px 0 0;font-size:12px">${c.warnings.map(e).join(" ")}</p>` : "";
      const notes = (c.notes || []).length ? `<p style="color:#8a5a00;margin:6px 0 0;font-size:12px">${c.notes.map(e).join(" ")}</p>` : "";
      return `<section class="result-block">
          <h3>Connections and bolts</h3>
          <table class="conn-table">
            <thead><tr><th></th><th>Head</th><th>Base</th></tr></thead>
            <tbody>
              ${row("Fixing", headNa ? "Not applicable (cantilever)" : e(c.head.description.trim()), e(c.base.description.trim()))}
              ${row("Connection code", headNa ? "&mdash;" : e(c.head.code), e(c.base.code || "&mdash;"))}
              ${row("Post bolts", headNa ? "&mdash;" : e(c.head.postBolt), e(c.base.postBolt))}
              ${row("Connection bolts", headNa ? "&mdash;" : `${e(c.head.boltSku)}${c.head.special ? " (special)" : ""}`, `${e(c.base.boltSku)}${c.base.special ? " (special)" : ""}`)}
              ${row("Bolt family", headNa ? "&mdash;" : e(c.head.boltFamily), e(c.base.boltFamily))}
              ${row("No. of bolts", headNa ? "&mdash;" : n(c.head.boltCount, 0), n(c.base.boltCount, 0))}
              ${row("Connection weight", headNa ? "&mdash;" : n(c.head.weight_kg, 3) + " kg", n(c.base.weight_kg, 3) + " kg")}
            </tbody>
          </table>
          ${plateRows ? `<dl class="result-list">${plateRows}</dl>` : ""}
          ${warnings}${notes}
        </section>
        <section class="result-block">
          <h3>Weights</h3>
          <dl class="result-list">
            <div><dt>Fold (blank) width</dt><dd>${n(c.post.blankWidth_mm, 2)} mm</dd></div>
            <div><dt>Windpost self weight (${n(c.post.kgPerMetre, 3)} kg/m)</dt><dd>${n(c.post.weight_kg, 3)} kg</dd></div>
            <div><dt>Head connection${c.head.special ? " (special)" : ""}</dt><dd>${n(c.head.weight_kg, 3)} kg</dd></div>
            <div><dt>Base connection${c.base.special ? " (special)" : ""}</dt><dd>${n(c.base.weight_kg, 3)} kg</dd></div>
            <div><dt>Ties per post</dt><dd>${n(c.ties.innerCount, 0)} inner${c.ties.outerCount ? ` + ${n(c.ties.outerCount, 0)} outer` : ""}${c.ties.debondingSleeves ? ` + ${n(c.ties.debondingSleeves, 0)} sleeves` : ""}</dd></div>
          </dl>
          <div class="weight-total"><span>Total weight per post</span><span>${n(c.totalWeightPerPost_kg, 3)} kg</span></div>
          <div class="weight-total" style="border-top:0;padding-top:2px;font-weight:600"><span>${n(c.postsCount, 0)} posts &middot; ${n(c.deliveries, 0)} deliveries</span><span>${n(c.totalWeightAllPosts_kg, 3)} kg</span></div>
        </section>`;
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
        },
        connections: this.readConnectionInputs()
      };
    },

    selectorFileName() {
      return windpost.designTransferEngine.selectorFileName(global.location);
    },

    detailingHref(design) {
      const snapshot = windpost.designTransferEngine.snapshot(
        design,
        this.lastBaseplate,
        global.location,
        this.lastConnections
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
      const drawable = section && (section.type === "U" || section.type === "L" || section.type === "DU");
      const engine = windpost.designTransferEngine;
      const transferable = Boolean(drawable && engine && engine.validate(
        engine.snapshot(design, this.lastBaseplate, global.location, this.lastConnections)
      ));
      this.detailingTab.disabled = !transferable;
      this.detailingTab.title = transferable
        ? `Open production drawings for ${section.name}`
        : drawable
          ? "Production drawings cover post heights of 300 to 12000 mm"
          : (section ? "Production drawings are available for U, L and DU posts" : "Run a successful windpost selection first");
    },

    openDetailing() {
      const href = this.detailingHref(this.lastDesign);
      if (!href) return;
      // Lets the Detailing page's "Back to Selector" use history.back() only
      // when it really was reached from here (an iframe shares the joint
      // session history with its host page).
      try { global.sessionStorage.setItem("windpost.detailing.fromSelector", "1"); } catch (error) { /* storage blocked */ }
      global.location.href = href;
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
      this.lastConnections = null;
      this.setDetailingAvailable(false);
      document.getElementById("result-content").classList.add("hidden");
      document.getElementById("result-placeholder").classList.remove("hidden");
      document.getElementById("detailed-section").classList.add("hidden");
    },

    renderSuccess(design) {
      const selected = design.selected;
      const { section, calculation, wall } = selected;
      const isAutomatic = design.mode === "automatic";
      // Connections first: the drawn base plate depends on the base fixing.
      const connections = this.selectConnections(design);
      this.lastConnections = connections;
      const bp = this.designBasePlate(design, connections);
      this.lastBaseplate = bp;
      this.setDetailingAvailable(true);
      const perLevel = (windpost.config.TIES_PER_LEVEL || {})[section.type] || 1;
      const isIPost = section.type === "I";
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
            <div class="result-shape"><span class="shape-icon shape-${section.type.toLowerCase()}">${section.type === "DU" ? "<i></i><i></i>" : "<i></i>"}</span></div>
            <div><h2>${this.escape(section.name)}</h2><p>${this.escape(this.familyLabel(section.type))} · ${this.supportLabel(design.inputs.supportCondition)} · ${this.number(design.inputs.length_mm, 0)} mm</p></div>
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
              <div class="tie-card"><span>Inner leaf</span><strong>${this.number(calculation.numberOfTies * perLevel, 0)} no. ${this.escape(wall.innerTie)}</strong><small>${this.escape(wall.innerTieNote || "")}</small></div>
              <div class="tie-card"><span>Outer leaf</span><strong>${isIPost ? "None" : `${this.number(calculation.numberOfTies * perLevel, 0)} no. ${this.escape(wall.outerTie)}`}</strong><small>${isIPost ? "post within the inner leaf" : `${this.number(wall.outerEmbedment_mm, 1)} mm embedment`}</small></div>
            </div>
            <dl class="result-list">
              <div><dt>Clear gap to outer leaf</dt><dd>${isIPost ? "n/a" : `${this.number(wall.outerGap_mm, 1)} mm`}</dd></div>
              <div><dt>Post placement</dt><dd>${this.escape(wall.placementDescription)}</dd></div>
              <div><dt>Wall construction</dt><dd>${this.number(wall.innerLeafThickness_mm, 0)} / ${this.number(wall.cavityWidth_mm, 0)} / ${this.number(wall.outerLeafThickness_mm, 0)} mm</dd></div>
            </dl>
          </section>
          ${alternatives}
          ${this.connectionsBlockHtml(connections)}
          ${this.duConnectionDrawingsHtml(section, connections)}
          ${bp ? this.basePlateBlockHtml(bp) : this.basePlateHintHtml(design, connections)}
          ${bp && bp.ok ? this.basePlateDrawingHtml(bp) : ""}
          <div class="result-actions">
            ${section.type === "L" ? `<a class="secondary-button" href="${this.cavityWallPage()}" target="_blank" rel="noopener" id="open-cavity-wall">Open cavity-wall assembly</a>` : ""}
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
      this.bindDuConnectionDownloads(section, connections);
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
      document.getElementById("detailed-report").innerHTML = buildReport(design, connections) + (bp ? this.basePlateReportHtml(bp) : "") + this.duConnectionReportHtml(section, connections);
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
      // Inside a sandboxed embed (the Google Sites page) window.print() is
      // ignored, so the report opens in its own tab, which is not sandboxed,
      // and prints from there.
      if (this.isEmbedded()) {
        this.printInNewTab();
        return;
      }
      global.print();
    },

    isEmbedded() {
      try { return global.self !== global.top; } catch (error) { return true; }
    },

    printInNewTab() {
      const report = document.getElementById("detailed-section");
      if (!report) return;
      const styles = Array.from(document.querySelectorAll("style"))
        .map(style => style.textContent).join("\n");
      const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">` +
        `<title>${this.escape(document.title)}</title><style>${styles}</style>` +
        `<style>body{background:#fff;margin:0;padding:16px}.detailed-section{display:block}</style></head>` +
        `<body>${report.outerHTML}` +
        `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})<\/script>` +
        `</body></html>`;
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const popup = global.open(url, "_blank");
      if (!popup) global.print();
      global.setTimeout(() => URL.revokeObjectURL(url), 60000);
    },

    scrollResultIntoView() {
      if (global.matchMedia("(max-width: 1080px)").matches) {
        document.getElementById("result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },

    designBasePlate(design, connections) {
      return windpost.selectorBaseplateRoutingEngine.design(design, connections);
    },

    basePlateHintHtml(design, connections) {
      const inputs = design.inputs || {};
      const section = design.selected && design.selected.section;
      if (inputs.supportCondition === "cantilever" && section &&
          (section.type === "L" || section.type === "U")) return "";
      const base = connections && connections.base;
      if (base && base.code && inputs.supportCondition === "simplySupported" && section &&
          (section.type === "L" || section.type === "U") && !base.standardPlate) {
        const plateFixing = section.type === "U" ? "U POST TO CONCRETE TOP (U-B3)" : "L POST TO CONCRETE TOP (L-B2)";
        return `<section class="result-block"><h3>Base plate</h3>
          <p style="color:#5b636c;margin:0">The selected base fixing <strong>${this.escape(base.description || base.code)} (${this.escape(base.libraryCode || base.code)})</strong> has no drawn base-plate detail; its weight and bolts are listed under Connections. The standard concrete-top plate (${this.escape(section.type === "U" ? "U-B3A / U-B3B" : "L-B2A / L-B2B")}) is drawn when <strong>${this.escape(plateFixing)}</strong> is selected as the base fixing.</p></section>`;
      }
      if (section && (section.type === "DU" || section.type === "I")) {
        return `<section class="result-block"><h3>Base plate</h3>
          <p style="color:#5b636c;margin:0">The simply-supported ${this.escape(section.type)} post uses the standard base plate of the connection library (weight shown under Connections). No drawn plate is generated for this family.</p></section>`;
      }
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
              ${d.typeCode ? `<div><dt>Standard type</dt><dd>${this.escape(d.typeCode)} — ${this.escape(d.typeTitle || "")}</dd></div>` : ""}
              <div><dt>Base plate</dt><dd>${overall} × ${d.B} × ${d.tp} mm</dd></div>
              ${d.edgeConstant ? `<div><dt>Concrete edge to bolts (B)</dt><dd>${d.edgeConstant} − ${this.number(bp.section.a_mm, 0)} = ${d.anchorFromConcreteEdge} mm</dd></div>` : ""}
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
            <div><dt>Basis</dt><dd>${this.escape(this.basePlateBasisText(bp))}</dd></div>
            <div><dt>Base plate</dt><dd>${d.plateLen} × ${d.B} × ${d.tp} mm</dd></div>
            <div><dt>Anchors — RGM 12</dt><dd>${d.nRow} rows × ${d.nCol} cols (${d.nRow * d.nCol} no.) · edge ${d.edge} · pitch ${d.pitch}</dd></div>
            <div><dt>Stiffener (triangular)</dt><dd>${d.tw} mm thick × ${d.hUp} mm high${bp.stiffenerRaisedFrom_mm ? ` (standard ${bp.stiffenerRaisedFrom_mm} mm raised)` : ""}</dd></div>
            <div><dt>Governing check</dt><dd>${this.escape(this.basePlateGovName(r.util))} — ${this.number(r.govUtil * 100, 1)}%</dd></div>
            ${this.basePlateStandardRowHtml(bp)}
          </dl>
        </section>`;
    },

    basePlateBasisText(bp) {
      if (!bp) return "";
      if (bp.basis === "standard") return `Standard plate type ${bp.standardType} verified by the full check set`;
      if (bp.basis === "standard (stiffener raised)") return `Standard plate type ${bp.standardType}; stiffener raised to pass the base + stiffener bending check`;
      if (bp.basis && bp.basis.startsWith("auto (standard")) return `Auto-sized: standard type ${bp.standardType} fails a check (see below)`;
      if (bp.basis === "auto (beyond standard types)") return "Auto-sized: moment beyond the standard plate types (special design)";
      return "Auto-sized";
    },

    basePlateStandardRowHtml(bp) {
      const s = bp && bp.standardComparison;
      if (!s || !s.design) return "";
      const sd = s.design, sr = s.results;
      const same = bp.basis === "standard";
      const status = sr.pass ? "PASS" : `FAIL — ${this.escape(this.basePlateGovName(sr.util))} ${this.number(sr.govUtil * 100, 0)}%`;
      return `<div><dt>Standard type ${this.escape(s.code)} (≤ ${this.number(s.capacity_kNm, 3)} kNm)</dt><dd>${sd.plateLen} × ${sd.B} × ${sd.tp} mm · ${sd.nRow * sd.nCol} bolts · stiffener ${sd.tw} × ${sd.hUp} — ${same ? "adopted" : status}</dd></div>`;
    },

    duConnectionReportHtml(section, connections) {
      const codes = this.duConnectionCodes(section, connections);
      if (!codes.length) return "";
      return codes.map(code => {
        let svg = "";
        try { svg = this.connectionDrawingSvg(code, section); } catch (err) { return ""; }
        const what = "DU post to concrete slab face";
        return `<section class="report-section"><h3>Connection ${this.escape(code)} — ${what}</h3><div style="background:#fff">${svg}</div></section>`;
      }).join("");
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
          <p style="font-size:.85em;color:#5b636c">Hybrid method: CED own logic + EC3-1-8 equivalent T-stub (SCI P291). Base moment M = ${this.escape(bp.loadModel)} = ${this.number(bp.W, 2)} kN × ${this.number(bp.H, 3)} m = <strong>${this.number(bp.moment, 3)} kNm</strong>. Plate ${d.plateLen}×${d.B}×${d.tp}, stiffener ${d.tw}×${d.hUp} (triangular), ${d.nRow * d.nCol} × RGM 12 (edge ${d.edge}, pitch ${d.pitch}). ${this.escape(this.basePlateBasisText(bp))}.${bp.standardComparison && bp.standardComparison.design ? ` Standard type ${this.escape(bp.standardComparison.code)}: ${bp.standardComparison.design.plateLen}×${bp.standardComparison.design.B}×${bp.standardComparison.design.tp}, ${bp.standardComparison.design.nRow * 2} bolts, stiffener ${bp.standardComparison.design.tw}×${bp.standardComparison.design.hUp} — ${bp.standardComparison.results.pass ? "passes" : "fails " + this.escape(this.basePlateGovName(bp.standardComparison.results.util)) + " at " + this.number(bp.standardComparison.results.govUtil * 100, 0) + "%"}.` : ""}</p>
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

    // Connections with their own detail sheets are drawn whenever they are
    // the selected head or base fixing: DU-T2 / DU-B2 (slab face).
    connectionDrawingServices() {
      return {
        "DU-T2": windpost.duSlabFaceDrawing,
        "DU-B2": windpost.duSlabFaceDrawing
      };
    },

    duConnectionCodes(section, connections) {
      if (!section || !connections) return [];
      const services = this.connectionDrawingServices();
      return [connections.head, connections.base]
        .filter(c => c && c.applicable && services[c.code])
        .map(c => c.code);
    },

    connectionDrawingSvg(code, section) {
      return this.connectionDrawingServices()[code].draw(code, section).svg;
    },

    duConnectionDrawingsHtml(section, connections) {
      const codes = this.duConnectionCodes(section, connections);
      if (!codes.length) return "";
      return codes.map(code => {
        let svg = "";
        try { svg = this.connectionDrawingSvg(code, section); }
        catch (err) { return `<section class="result-block"><h3>${this.escape(code)} drawing</h3><p>Drawing unavailable: ${this.escape(err.message)}</p></section>`; }
        const which = /-T/.test(code) ? "Head" : "Base";
        const what = "DU post to concrete slab face";
        return `<section class="result-block">
          <h3>${which} connection ${this.escape(code)} — ${what}</h3>
          <div id="du-drawing-${this.escape(code)}" class="du-connection-drawing" style="overflow-x:auto;border:1px solid #e2e6ea;border-radius:8px;background:#fff;padding:6px">${svg}</div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="secondary-button" type="button" data-du-download="svg" data-du-code="${this.escape(code)}">Download ${this.escape(code)} (SVG)</button>
            <button class="secondary-button" type="button" data-du-download="dxf" data-du-code="${this.escape(code)}">Download ${this.escape(code)} (DXF)</button>
          </div>
        </section>`;
      }).join("");
    },

    bindDuConnectionDownloads(section, connections) {
      const codes = this.duConnectionCodes(section, connections);
      if (!codes.length) return;
      document.querySelectorAll("[data-du-download]").forEach(button => {
        button.addEventListener("click", () => {
          const code = button.getAttribute("data-du-code");
          const kind = button.getAttribute("data-du-download");
          const name = `${code}-${String(section.name || "DU").replace(/\s+/g, "-")}`;
          if (kind === "svg") {
            const svg = this.connectionDrawingSvg(code, section);
            this.saveBlob(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
            return;
          }
          const holder = document.getElementById(`du-drawing-${code}`);
          const root = holder && holder.querySelector("svg");
          if (!root || !windpost.sheetExport) return;
          try {
            const sheet = windpost.sheetExport.flatten(root);
            const text = windpost.sheetExport.toDxf(sheet);
            const bytes = new Uint8Array(text.length);
            for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
            this.saveBlob(new Blob([bytes], { type: "image/vnd.dxf" }), `${name}.dxf`);
          } catch (err) {
            this.reportStatus(`The DXF could not be written: ${err.message}`);
          }
        });
      });
    },

    saveBlob(blob, filename) {
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
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

    reportStatus(message) {
      const status = document.getElementById("project-file-status");
      if (status) status.textContent = message;
      else console.error(message);
    },

    // The assembly page ships under its built name beside the built Selector.
    cavityWallPage() {
      return this.selectorFileName() === "Windpost-Selector-Full.html"
        ? "./Windpost-CavityWall-Full.html"
        : "./cavity-wall-assembly.html";
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
      // Everything the page needs travels in the URL: the new tab may not
      // share this frame's localStorage (storage is partitioned inside an
      // embedded page), so the designed plate must not depend on it.
      const query = new URLSearchParams({
        section: section.name,
        height: String(payload.length_mm),
        support: payload.supportCondition,
        load: String(payload.loadType || ""),
        capacity: String(payload.finalCapacity_kN || ""),
        inner: String(payload.wall.innerLeafThickness_mm),
        cavity: String(payload.wall.cavityWidth_mm),
        outer: String(payload.wall.outerLeafThickness_mm)
      });
      if (baseplate) query.set("bp", JSON.stringify(baseplate));
      return `${this.cavityWallPage()}?${query.toString()}`;
    },

    supportLabel(value) {
      return value === "cantilever" ? "Cantilever" : "Simply supported";
    },

    familyLabel(type) {
      const families = windpost.sectionProfileEngine.FAMILIES || {};
      return families[type] ? families[type].label : `${type}-shaped windpost`;
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
