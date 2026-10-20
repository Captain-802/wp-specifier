(function initialiseSelectorApplication(global) {
  "use strict";

  const windpost = global.Windpost;
  const { getSections } = windpost.sectionProfileEngine;
  const { runDesign } = windpost.automaticSelectionEngine;
  const { buildReport } = windpost.designReportService;

  const app = {
    lastDesign: null,

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
      // Quantities (number of posts, deliveries, sleeves) do not change the
      // design, so they re-run the supply figures live; anything else hides
      // the result until it is run again.
      const QUANTITY_INPUTS = ["posts-count", "deliveries", "debonding-sleeve"];
      this.form.querySelectorAll('input[type="number"], input[type="checkbox"], select').forEach((input) => {
        const react = () => {
          if (QUANTITY_INPUTS.includes(input.id) && this.lastDesign) { this.calculate(); return; }
          this.invalidateResult();
        };
        input.addEventListener("input", react);
        input.addEventListener("change", react);
      });
      ["head", "base"].forEach((end) => {
        document.getElementById(`${end}-fixing`).addEventListener("change", () => this.populateBoltFamilies(end));
        document.getElementById(`special-${end}`).addEventListener("change", () => this.updateSpecialRows());
      });
      ["custom-a", "custom-b", "custom-t", "custom-r", "custom-sharp"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("input", () => this.updateCustomFields());
        el.addEventListener("change", () => this.updateCustomFields());
      });
      this.populateSpecialSkus();
      this.updateSpecialRows();
      document.getElementById("close-details").addEventListener("click", () => this.hideDetails());
      document.getElementById("print-report").addEventListener("click", () => this.downloadPdf());
      // The detailing tab is switched off for this release, so it may be absent.
      if (this.detailingTab) {
        this.detailingTab.addEventListener("click", () => this.openDetailing());
      }
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
      this.initDesignData();
    },

    // The editable design data (tie capacities, constants, anchors, bolts):
    // edits saved in this browser are read back, the editor is mounted, and
    // any change re-runs the current selection.
    initDesignData() {
      const data = windpost.designData;
      if (!data) return;
      try { data.load(global.localStorage); } catch (error) { /* storage blocked */ }
      const host = document.getElementById("design-data-editor");
      if (host && windpost.designDataEditor) {
        this.designDataEditor = windpost.designDataEditor.mount(host, {
          onChange: () => this.onDesignDataChange()
        });
      }
      this.updateDesignDataBadge();
    },

    onDesignDataChange() {
      this.updateDesignDataBadge();
      this.populateSpecialSkus();
      if (this.lastDesign) this.calculate();
      else this.invalidateResult();
    },

    updateDesignDataBadge() {
      const badge = document.getElementById("design-data-badge");
      const data = windpost.designData;
      if (!badge || !data) return;
      const edits = data.edits();
      // Nothing is shown while the values are the catalogue ones; the badge
      // only appears once something has been edited.
      badge.textContent = edits.count
        ? `${edits.count} value${edits.count === 1 ? "" : "s"} edited`
        : "";
      badge.hidden = !edits.count;
      badge.classList.toggle("is-edited", Boolean(edits.count));
      badge.classList.toggle("is-edited", edits.count > 0);
    },

    designDataNoteHtml() {
      const data = windpost.designData;
      const edits = data ? data.edits() : null;
      if (!edits || !edits.count) return "";
      return `<section class="result-block design-data-note">
          <h3>Design data edited <span class="badge is-edited">${edits.count}</span></h3>
          <ul>${edits.lines.slice(0, 12).map(line => `<li>${this.escape(line)}</li>`).join("")}${edits.lines.length > 12 ? `<li>… and ${edits.lines.length - 12} more (see the calculation record)</li>` : ""}</ul>
        </section>`;
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
        hasSuccessfulDesign: Boolean(this.lastDesign),
        designData: windpost.designData ? windpost.designData.serialize() : null
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
      // the design data the project was calculated with (catalogue when absent)
      if (windpost.designData) {
        windpost.designData.restore(project.data.designData || null);
        if (this.designDataEditor) this.designDataEditor.refresh();
        this.updateDesignDataBadge();
        this.populateSpecialSkus();
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
      document.getElementById("custom-input").classList.toggle("hidden", mode !== "custom");
      this.updateCustomFields();
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
      const rows = windpost.designData ? windpost.designData.boltSkus() : (db && db.boltSkus ? db.boltSkus : []);
      const skus = rows.map((row) => row.sku);
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
        custom: this.readCustomGeometry(),
        wall: {
          innerLeafThickness_mm: Number(document.getElementById("inner-leaf").value),
          cavityWidth_mm: Number(document.getElementById("cavity").value),
          outerLeafThickness_mm: Number(document.getElementById("outer-leaf").value)
        },
        connections: this.readConnectionInputs()
      };
    },

    readCustomGeometry() {
      const value = (id) => Number(document.getElementById(id).value);
      return {
        a_mm: value("custom-a"),
        b_mm: value("custom-b"),
        t_mm: value("custom-t"),
        r_mm: value("custom-r"),
        sharpEdges: document.getElementById("custom-sharp").checked,
        name: document.getElementById("custom-name").value
      };
    },

    // An I post is a flat plate, so it has no width or fold radius; a sharp
    // U/L has no radius either. Hide what does not apply and show the
    // properties as they are typed.
    updateCustomFields() {
      const engine = windpost.customSectionPropertiesEngine;
      const type = this.selectedValue("windpostType");
      const isFlat = type === "I";
      const sharp = document.getElementById("custom-sharp").checked;
      document.getElementById("custom-b-field").classList.toggle("hidden", isFlat);
      document.getElementById("custom-sharp-field").classList.toggle("hidden", isFlat);
      document.getElementById("custom-r-field").classList.toggle("hidden", isFlat || sharp);
      const nameField = document.getElementById("custom-name");
      if (nameField) {
        const g0 = this.readCustomGeometry();
        nameField.placeholder = isFlat
          ? `Custom I ${g0.a_mm || "a"}x${g0.t_mm || "t"}`
          : `Custom ${type} ${g0.a_mm || "a"}x${g0.b_mm || "b"}x${g0.t_mm || "t"}`;
      }
      const host = document.getElementById("custom-properties");
      if (!host || !engine) return;
      const g = this.readCustomGeometry();
      const props = engine.calculate(type, g.a_mm, g.b_mm, g.t_mm, g.r_mm, g.sharpEdges);
      if (!props.valid) {
        host.classList.add("is-invalid");
        host.innerHTML = `<strong>${this.escape(props.error || "Invalid geometry.")}</strong>`;
        return;
      }
      host.classList.remove("is-invalid");
      host.innerHTML = `<dl>
        <div><dt>Area</dt><dd>${this.number(props.area, 2)} mm&sup2;</dd></div>
        <div><dt>Ixx</dt><dd>${this.number(props.ixx, 2)} mm&#8308;</dd></div>
        <div><dt>Zxx min</dt><dd>${this.number(props.zxx, 2)} mm&sup3;</dd></div>
        <div><dt>Ybar</dt><dd>${this.number(props.ybar, 2)} mm</dd></div>
      </dl>`;
    },

    detailingHref(design) {
      // No base plate travels with the design while that feature is parked.
      const snapshot = windpost.designTransferEngine.snapshot(
        design,
        null,
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
        engine.snapshot(design, null, global.location, this.lastConnections)
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
      // The engine still works out the weights the report needs; the fixing
      // and bolt schedule itself is switched off for this release.
      const connections = this.selectConnections(design);
      this.lastConnections = connections;
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
          ${this.designDataNoteHtml()}
          ${alternatives}
          <div class="result-actions">
            <button class="secondary-button" type="button" id="view-calculation">View calculations</button>
            <button class="primary-button small" type="button" id="download-pdf">Download PDF</button>
          </div>
        </div>`;
      document.getElementById("view-calculation").addEventListener("click", () => this.showDetails());
      document.getElementById("download-pdf").addEventListener("click", () => this.downloadPdf());
      document.getElementById("detailed-report").innerHTML = buildReport(design, connections);
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
