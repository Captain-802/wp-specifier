(function initialiseLSectionPrototypePage(global) {
  "use strict";

  const windpost = global.Windpost;

  const page = {
    init() {
      this.sectionSelect = document.getElementById("prototype-section");
      this.postTypeSelect = document.getElementById("prototype-post-type");
      this.supportSelect = document.getElementById("prototype-support");
      this.paletteSelect = document.getElementById("prototype-palette");
      this.lengthInput = document.getElementById("prototype-length");
      this.slotOffsetInput = document.getElementById("prototype-slot-offset");
      this.firstSlotInput = document.getElementById("prototype-first-slot");
      this.slotSpacingInput = document.getElementById("prototype-slot-spacing");
      this.loadTypeSelect = document.getElementById("prototype-load-type");
      this.backToSelector = document.getElementById("back-to-selector");
      this.drawing = document.getElementById("orthographic-drawing");
      this.baseplateDrawing = document.getElementById(
        "cantilever-baseplate-drawing"
      );
      this.a4Sheet = document.getElementById("combined-a4-sheet");
      this.productionForm = document.getElementById("production-details-form");
      this.productionDateInput = document.getElementById("production-date");
      this.validationResults = document.getElementById(
        "production-validation-results"
      );
      if (this.productionDateInput && !this.productionDateInput.value) {
        const today = new Date();
        const localToday = new Date(
          today.getTime() - today.getTimezoneOffset() * 60000
        );
        this.productionDateInput.value = localToday.toISOString().slice(0, 10);
      }
      this.renderCache = windpost.taskCacheEngine.create(12);
      this.productionSheetScheduler = windpost.renderSchedulerEngine.create(
        () => this.updateProductionSheet(),
        200
      );
      this.drawingMode = "hatch";
      this.populateSections();
      this.applyUrlParameters();
      this.renderer = windpost.cavityWall3d.create(
        document.getElementById("prototype-canvas")
      );
      document.getElementById("prototype-form").addEventListener("submit", event => {
        event.preventDefault();
        this.render();
      });
      this.productionForm.addEventListener("submit", event =>
        event.preventDefault()
      );
      this.productionForm.addEventListener("input", () =>
        this.productionSheetScheduler.schedule()
      );
      this.postTypeSelect.addEventListener("change", () => {
        this.populateSections();
        this.render();
      });
      this.supportSelect.addEventListener("change", () => this.render());
      this.paletteSelect.addEventListener("change", () => {
        this.applyPalette();
        this.render();          // the sheet embeds the palette, so rebuild it
      });
      this.applyPalette();
      this.sectionSelect.addEventListener("change", () => this.render());
      this.lengthInput.addEventListener("change", () => this.render());
      this.slotOffsetInput.addEventListener("change", () => this.render());
      this.firstSlotInput.addEventListener("change", () => this.render());
      this.slotSpacingInput.addEventListener("change", () => this.render());
      this.loadTypeSelect.addEventListener("change", () => this.render());
      document.getElementById("reset-view").addEventListener("click", () =>
        this.renderer.reset()
      );
      document.getElementById("view-mode-orbit").addEventListener("click", () =>
        this.setViewInteractionMode("orbit")
      );
      document.getElementById("view-mode-pan").addEventListener("click", () =>
        this.setViewInteractionMode("pan")
      );
      document.getElementById("download-drawing").addEventListener("click", () =>
        this.downloadDrawing()
      );
      document.getElementById("download-a4-sheet").addEventListener(
        "click",
        () => this.downloadA4Sheet()
      );
      document.getElementById("download-a4-dxf").addEventListener(
        "click",
        () => this.downloadA4Export("dxf")
      );
      document.getElementById("download-a4-pdf").addEventListener(
        "click",
        () => this.downloadA4Export("pdf")
      );
      document.getElementById("drawing-mode-hatch").addEventListener("click", () =>
        this.setDrawingMode("hatch")
      );
      document.getElementById("drawing-mode-lines").addEventListener("click", () =>
        this.setDrawingMode("lines")
      );
      this.render();
      global.setTimeout(() => this.renderer.resize(), 0);
    },

    setViewInteractionMode(mode) {
      const selected = mode === "pan" ? "pan" : "orbit";
      this.renderer.setInteractionMode(selected);
      document.getElementById("view-mode-orbit").setAttribute(
        "aria-pressed",
        String(selected === "orbit")
      );
      document.getElementById("view-mode-pan").setAttribute(
        "aria-pressed",
        String(selected === "pan")
      );
    },

    // ?section=UP 90x60x4&length=2000 opens the page on a given post, so a
    // particular sheet can be linked to or captured directly.
    applyUrlParameters() {
      const params = new URLSearchParams(global.location.search);
      if (params.get("visual") === "1") {
        this.visualRegression = true;
        if (this.productionDateInput) {
          this.productionDateInput.value = "2026-07-26";
        }
      }
      let storage = null;
      try { storage = global.sessionStorage; } catch (error) { storage = null; }
      const stored = params.get("source") === "selector"
        ? windpost.designTransferEngine.restore(storage)
        : null;
      this.selectorSnapshot = stored;
      const value = (name, fallback) =>
        params.has(name) ? params.get(name) : fallback;
      const returnTarget = value("return", stored && stored.returnFile);
      if (this.backToSelector &&
          /^(?:index|Windpost-Selector-Full)\.html$/i.test(returnTarget || "")) {
        this.backToSelector.href = `./${returnTarget}`;
      }
      if (this.backToSelector && params.get("source") === "selector") {
        this.backToSelector.addEventListener("click", event => {
          if (global.history.length <= 1) return;
          event.preventDefault();
          global.history.back();
        });
      }
      const support = value(
        "support",
        stored && stored.supportCondition
      );
      if (support === "cantilever" || support === "simplySupported") {
        this.supportSelect.value = support;
      }
      const wanted = value("section", stored && stored.sectionName);
      const match = wanted && this.allSections()
        .find(section => section.name === wanted);
      if (match) {
        // The post type follows the named section, so the list holds it.
        this.postTypeSelect.value = match.type === "U" ? "U" : "L";
        this.populateSections();
        this.sectionSelect.value = match.name;
      }
      const length = Number(value("length", stored && stored.length_mm));
      if (length > 0) this.lengthInput.value = length;
      const firstSlot = Number(value(
        "firstSlot",
        stored && stored.slotSchedule && stored.slotSchedule.firstCentre_mm
      ));
      if (firstSlot > 0) this.firstSlotInput.value = firstSlot;
      const slotSpacing = Number(value(
        "slotSpacing",
        stored && stored.slotSchedule && stored.slotSchedule.spacing_mm
      ));
      if (slotSpacing > 0) this.slotSpacingInput.value = slotSpacing;
      const load = value("load", stored && stored.loadType);
      if (load === "udl" || load === "tipPointLoad") this.loadTypeSelect.value = load;
      const storedWall = stored && stored.wall;
      this.wallParameters = {
        innerLeafThickness_mm: Number(value(
          "inner",
          storedWall && storedWall.innerLeafThickness_mm
        )) || 100,
        cavityWidth_mm: Number(value(
          "cavity",
          storedWall && storedWall.cavityWidth_mm
        )) || 100,
        outerLeafThickness_mm: Number(value(
          "outer",
          storedWall && storedWall.outerLeafThickness_mm
        )) || 100
      };
      const palette = params.get("palette");
      if (palette === "colour" || palette === "mono") {
        this.paletteSelect.value = palette;
        this.applyPalette();
      }
    },

    // Both post types are offered, grouped by shape. An L is built into the
    // inner leaf; a U stands clear in the cavity — they differ enough that the
    // orthographic and baseplate services are chosen per section.
    allSections() {
      const l = (windpost.lSectionDatabase && windpost.lSectionDatabase.sections) || [];
      const u = (windpost.uSectionDatabase && windpost.uSectionDatabase.sections) || [];
      return l.concat(u);
    },

    monochrome() {
      return this.paletteSelect && this.paletteSelect.value === "mono";
    },

    // The CAD palette is a document-level stylesheet, so it repaints every
    // drawing on the page at once — and because the PDF exporter reads computed
    // styles, the same switch carries straight through to the PDF.
    applyPalette() {
      if (!windpost.cadLayers) return;
      let style = document.getElementById("cad-palette");
      if (!style) {
        style = document.createElement("style");
        style.id = "cad-palette";
        document.head.appendChild(style);
      }
      style.textContent = windpost.cadLayers.paletteCss(this.monochrome());
    },

    postType() {
      return this.postTypeSelect && this.postTypeSelect.value === "U" ? "U" : "L";
    },

    supportCondition() {
      return this.supportSelect && this.supportSelect.value === "simplySupported"
        ? "simplySupported"
        : "cantilever";
    },

    productionDetails() {
      const value = id => {
        const input = document.getElementById(id);
        return input ? input.value.trim() : "";
      };
      const rawQuantity = Math.round(Number(value("production-quantity")) || 1);
      const quantity = Math.max(1, Math.min(999, rawQuantity));
      const rawDate = value("production-date");
      const dateParts = rawDate.split("-");
      const date = dateParts.length === 3
        ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
        : rawDate;
      return {
        merchant: value("production-merchant"),
        weight: value("production-weight"),
        customer: value("production-customer"),
        detailer: value("production-detailer"),
        engineer: value("production-engineer"),
        checkedBy: value("production-checked-by"),
        drawingNumber: value("production-drawing-number"),
        schedule: value("production-schedule"),
        date,
        ksso: value("production-ksso"),
        manufacturedSite: value("production-manufactured-site"),
        quantity,
        revision: value("production-revision") || "P1",
        revisionIssue: value("production-revision-issue") || "FIRST ISSUE"
      };
    },

    updateProductionSheet() {
      if (!this.a4Sheet || !this.cantileverBaseplate ||
          !this.cantileverBaseplate.ok) return;
      this.a4Sheet.innerHTML = this.withFabricationDrawing(
        () => this.buildA4Sheet()
      );
      const root = this.a4Sheet.querySelector("svg");
      if (root && windpost.drawingLayoutEngine) {
        windpost.drawingLayoutEngine.resolve(root, { step: 1.2 });
      }
      this.updateValidation();
    },

    validationContext() {
      const a4Root = this.a4Sheet && this.a4Sheet.querySelector("svg");
      const roots = [
        this.drawing && this.drawing.querySelector("svg"),
        this.baseplateDrawing && this.baseplateDrawing.querySelector("svg"),
        a4Root
      ].filter(Boolean);
      return {
        section: this.selectedSection(),
        orthographic: this.orthographic,
        baseplate: this.cantileverBaseplate,
        a4Root,
        roots,
        stages: Array.from(document.querySelectorAll(
          ".engineering-hybrid-stage"
        ))
      };
    },

    updateValidation() {
      if (!windpost.productionValidationEngine) {
        return null;
      }
      this.lastValidation = windpost.productionValidationEngine.validate(
        this.validationContext()
      );
      if (this.validationResults) {
        this.validationResults.innerHTML =
          windpost.productionValidationEngine.renderHtml(this.lastValidation);
      }
      return this.lastValidation;
    },

    productionReady() {
      const report = this.updateValidation();
      if (!report || report.ok) return true;
      global.alert(
        "The production drawing has validation errors and cannot be exported."
      );
      return false;
    },

    // The section list follows the post-type dropdown, keeping the current
    // section if it still belongs to the chosen type.
    populateSections() {
      const type = this.postType();
      const sections = this.allSections()
        .filter(section => (section.type === "U") === (type === "U"));
      if (!sections.length) return;
      const previous = this.sectionSelect.value;
      this.sectionSelect.innerHTML = sections.map(section =>
        `<option value="${this.escape(section.name)}">${this.escape(section.name)}</option>`
      ).join("");
      const preferred =
        sections.find(section => section.name === previous) ||
        sections.find(section =>
          section.name === (type === "U" ? "UP 90x60x4" : "LP 150x70x4")) ||
        sections[0];
      this.sectionSelect.value = preferred.name;
      const label = document.getElementById("section-label");
      if (label) label.textContent = `${type} section`;
    },

    selectedSection() {
      return this.allSections().find(
        section => section.name === this.sectionSelect.value
      );
    },

    // The orthographic service for the selected post type.
    orthographicService(section) {
      return section && section.type === "U"
        ? windpost.uSectionOrthographic
        : windpost.lSectionOrthographic;
    },

    render() {
      const section = this.selectedSection();
      const isU = section.type === "U";
      const length = Number(this.lengthInput.value);
      // The L's offset is user-set, a U's is fixed at 25 — so the U's value is
      // never read back into the L when switching between the two.
      if (!this.showingU) this.lSlotOffset = Number(this.slotOffsetInput.value);
      this.showingU = isU;
      const firstSlot = Number(this.firstSlotInput.value);
      const slotSpacing = Number(this.slotSpacingInput.value);
      const supportCondition = this.supportCondition();
      const cacheKey = JSON.stringify([
        section.name,
        length,
        supportCondition,
        this.loadTypeSelect.value,
        this.drawingMode,
        isU ? 25 : this.lSlotOffset,
        firstSlot,
        slotSpacing
      ]);
      const cached = this.renderCache.get(cacheKey);
      if (cached) {
        this.orthographic = cached.orthographic;
        this.cantileverBaseplate = cached.baseplate;
      } else {
        this.orthographic = this.orthographicService(section).generate(
          section,
          length,
          {
            mode: this.drawingMode,
            slotOffsetFromOuterEdge_mm: this.lSlotOffset,
            firstSlotFromBase_mm: firstSlot,
            slotVerticalSpacing_mm: slotSpacing
          }
        );
        this.cantileverBaseplate =
          windpost.lCantileverBaseplatePrototype.design(
            section,
            length,
            this.loadTypeSelect.value,
            { mode: this.drawingMode, supportCondition }
          );
        this.renderCache.set(cacheKey, {
          orthographic: this.orthographic,
          baseplate: this.cantileverBaseplate
        });
      }
      const placement = this.orthographic.slotPlacement;
      this.slotOffsetInput.min = placement.minimumOffsetFromOuterEdge_mm;
      this.slotOffsetInput.max = placement.maximumOffsetFromOuterEdge_mm;
      this.slotOffsetInput.value = placement.offsetFromOuterEdge_mm;
      this.firstSlotInput.min = placement.minimumFirstCentreFromBase_mm;
      this.firstSlotInput.max = placement.maximumFirstCentreFromBase_mm;
      this.firstSlotInput.value = placement.firstCentreFromBase_mm;
      this.slotSpacingInput.min = placement.minimumVerticalSpacing_mm;
      this.slotSpacingInput.max = placement.maximumVerticalSpacing_mm;
      this.slotSpacingInput.value = placement.verticalSpacing_mm;
      // The normal viewport temporarily carries the fabrication source while
      // the A4 sheet is measured. It is replaced synchronously by the client
      // approval arrangement before the browser paints.
      this.renderFabricationDrawing();
      // A simply-supported base is a fixed detail, so there is no load model
      // to choose.
      this.loadTypeSelect.disabled = supportCondition === "simplySupported";
      // A U is fixed at 25 mm from each flange tip, so the control is shown
      // read-only rather than pretending to be adjustable.
      const slotLabel = document.getElementById("slot-offset-label");
      if (slotLabel) {
        slotLabel.textContent = isU
          ? "Slot centre from flange tip (fixed)"
          : "Slot centre from long-leg outer edge";
      }
      this.slotOffsetInput.disabled = isU;
      this.renderer.setSection(
        section,
        length,
        placement,
        this.cantileverBaseplate.ok
          ? this.cantileverBaseplate.design
          : null
      );
      this.baseplateDrawing.innerHTML = this.cantileverBaseplate.ok
        ? this.cantileverBaseplate.svg
        : `<p class="drawing-error">${this.escape(
            this.cantileverBaseplate.reason
          )}</p>`;
      const baseplateRoot = this.baseplateDrawing.querySelector("svg");
      if (baseplateRoot && windpost.drawingLayoutEngine) {
        windpost.drawingLayoutEngine.resolve(baseplateRoot);
      }
      this.resolvedBaseplateSvg = baseplateRoot
        ? baseplateRoot.outerHTML
        : (this.cantileverBaseplate.svg || "");
      if (this.drawingMode === "hatch" &&
          this.cantileverBaseplate.ok &&
          windpost.engineeringCanvasRenderer) {
        windpost.engineeringCanvasRenderer.enhance(
          this.baseplateDrawing,
          { steel: false }
        );
      }
      this.a4Sheet.innerHTML = this.cantileverBaseplate.ok
        ? this.buildA4Sheet()
        : "";
      const a4Root = this.a4Sheet.querySelector("svg");
      if (a4Root && windpost.drawingLayoutEngine) {
        windpost.drawingLayoutEngine.resolve(a4Root, { step: 1.2 });
      }
      this.renderApprovalDrawing(section, length);
      this.updateValidation();
      if (this.visualRegression) {
        document.body.classList.add("visual-regression");
      }
    },

    renderFabricationDrawing() {
      this.drawing.innerHTML = this.orthographic.svg;
      const root = this.drawing.querySelector("svg");
      if (root && windpost.drawingLayoutEngine) {
        windpost.drawingLayoutEngine.resolve(root);
      }
      if (this.drawingMode === "hatch" &&
          windpost.engineeringCanvasRenderer) {
        windpost.engineeringCanvasRenderer.enhance(
          this.drawing,
          { steel: true }
        );
      }
    },

    renderApprovalDrawing(section, length) {
      this.approvalDrawing = windpost.windpostApprovalDrawing.build({
        orthographic: this.orthographic,
        baseplate: Object.assign({}, this.cantileverBaseplate, {
          svg: this.resolvedBaseplateSvg ||
            (this.cantileverBaseplate && this.cantileverBaseplate.svg)
        }),
        section: section || this.selectedSection(),
        length_mm: Number(length || this.lengthInput.value),
        wall: this.wallParameters,
        mode: this.drawingMode
      });
      this.drawing.innerHTML = this.approvalDrawing.svg;
      const root = this.drawing.querySelector("svg");
      if (root && windpost.drawingLayoutEngine) {
        windpost.drawingLayoutEngine.resolve(root);
      }
      this.resolvedOrthographicSvg = root
        ? root.outerHTML
        : this.approvalDrawing.svg;
    },

    withFabricationDrawing(task) {
      const approvalMarkup = this.drawing.innerHTML;
      this.renderFabricationDrawing();
      try {
        return task();
      } finally {
        this.drawing.innerHTML = approvalMarkup;
      }
    },

    setDrawingMode(mode) {
      this.drawingMode = mode === "lines" ? "lines" : "hatch";
      document.getElementById("drawing-mode-hatch").setAttribute(
        "aria-pressed",
        String(this.drawingMode === "hatch")
      );
      document.getElementById("drawing-mode-lines").setAttribute(
        "aria-pressed",
        String(this.drawingMode === "lines")
      );
      this.render();
    },

    downloadDrawing() {
      if (!this.orthographic) return;
      const blob = new Blob([
        this.resolvedOrthographicSvg || this.orthographic.svg
      ], {
        type: "image/svg+xml;charset=utf-8"
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download =
        `${this.orthographic.sectionName.replaceAll(" ", "-")}` +
        "-approval-arrangement.svg";
      document.body.appendChild(link);
      link.click();
      link.remove();
      global.setTimeout(() => URL.revokeObjectURL(link.href), 0);
    },

    downloadBaseplateDrawing() {
      if (!this.cantileverBaseplate || !this.cantileverBaseplate.ok) return;
      const blob = new Blob([
        this.resolvedBaseplateSvg || this.cantileverBaseplate.svg
      ], {
        type: "image/svg+xml;charset=utf-8"
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download =
        `${this.cantileverBaseplate.section.name.replaceAll(" ", "-")}` +
        "-cantilever-baseplate.svg";
      document.body.appendChild(link);
      link.click();
      const url = link.href;
      link.remove();
      global.setTimeout(() => URL.revokeObjectURL(url), 0);
    },

    // Compose every 2D view onto one A4 portrait sheet as paper-space ZONES.
    // Each zone is an independent viewport (AutoCAD model): a view is lifted out
    // of its source drawing and zoomed to suit its own zone, so every detail is
    // legible instead of everything sharing one sheet-wide scale. Zone map:
    //
    //   TITLE AND DETAILS ................................. full width (blank)
    //   WIND POST SECTION (TOP VIEW) | TOP CONNECTIONS ......... right (blank)
    //   BLANK | LONG LEG | SHORT LEG | BASE PLATE PLAN
    //          elevations             | BASE PLATE SIDE VIEW
    //
    // The three elevations share one scale (same object, side by side) and the
    // two base plate views share another; the top view takes its own.
    buildA4Sheet() {
      const ortho = this.orthographic, bp = this.cantileverBaseplate;
      if (!ortho || !bp || !bp.ok) return "";
      const oRoot = this.drawing.querySelector("svg");
      const bRoot = this.baseplateDrawing.querySelector("svg");
      if (!oRoot || !bRoot) return "";

      // Each view is measured live, so its own caption is hidden for the whole
      // composition and put back afterwards whatever happens.
      const pick = (root, id, drop) => {
        const el = root.querySelector("#" + id);
        return el ? { el, defs: root, restore: this.prepareView(el, drop) } : null;
      };
      // The three elevation zones come from whichever orthographic service drew
      // the sheet, so an L reads long/short leg and a U reads web/flange.
      const sheetViews = (ortho.sheetViews || [])
        .filter(view => view.enabled !== false);
      const elev = sheetViews.map(view => {
        const picked = pick(oRoot, view.id);
        return picked && Object.assign(picked, { label: view.label });
      });
      const v = {
        top: pick(oRoot, "plan-view"),
        plan: pick(bRoot, "bp-plan", [
          "CONNECTION — PLAN", "U-POST BASE — PLAN",
          "SIMPLY-SUPPORTED L-POST BASE — PLAN",
          "SIMPLY-SUPPORTED U-POST BASE — PLAN",
          "~BASE PLATE", "~mm stiffener"
        ]),
        side: pick(bRoot, "bp-side", [
          "CONNECTION — SIDE VIEW", "U-POST BASE — SIDE VIEW",
          "SIMPLY-SUPPORTED L-POST BASE — SIDE VIEW",
          "SIMPLY-SUPPORTED U-POST BASE — SIDE VIEW",
          "~BASE PLATE", "~mm thk stiffener"
        ])
      };
      // The section detail must remain readable when a very long post forces
      // the orthographic elevations onto a smaller model-space scale. Give
      // this A4-only detail the same paper size as the identical profile in
      // the baseplate plan and keep its label close below it. The live
      // orthographic drawing itself remains true to its selected sheet scale
      // because every temporary attribute is restored afterwards.
      if (v.top) {
        const topDetail = this.prepareA4TopSection(v.top.el);
        const restoreTopView = v.top.restore;
        v.top.detail = topDetail;
        v.top.restore = () => {
          topDetail.restore();
          restoreTopView();
        };
      }
      const found = [v.top, v.plan, v.side, ...elev].filter(Boolean);
      try {
        return found.length === 3 + sheetViews.length && sheetViews.length
          ? this.composeA4(v, elev, ortho)
          : "";
      } finally {
        found.forEach(view => view.restore());
      }
    },

    // Lay the extracted views out on the zone grid.
    composeA4(v, elev, ortho) {
      // Fixed production-paper grid based on the approved A4 portrait
      // fabrication template.  The header and main left/right bands never
      // move when the section or length changes; only each viewport scale is
      // recalculated to fit its reserved drawing area.
      const f = n => Number(n.toFixed(2));
      const G = 1.5, PAD = 1.2, CAP = 5.2;
      const CAPTION_GAP = 2.4;
      const x0 = 7, x1 = 203, y0 = 7, y1 = 290;
      const headerH = 64;
      const notesH = 14;
      const bodyY = y0 + headerH + notesH;
      const leftX = 14, leftW = 84;
      const rX = 101, rightW = x1 - rX;
      const elevY = bodyY, elevFooterH = 5, elevH = y1 - elevY - elevFooterH;
      const topViewH = 42, topConnH = 59;
      const ORTHO = {
        font: 3.2,
        stroke: 0.25,
        paperStroke: 0.14,
        unit: ortho.scaleDenominator
      };
      const TOP = {
        font: 3.6,
        stroke: 0.5,
        unit: ortho.scaleDenominator,
        paperFont: 1.3
      };
      const BP = { font: 7.5, stroke: 0.4, unit: 1, paperFont: 1.8 };

      const elevLabels = elev.map(view => view.label);
      const elevationWidthAvailable =
        leftW - Math.max(0, elev.length - 1) * G;
      let elevZoneWidths = elev.map(() =>
        elevationWidthAvailable / elev.length);
      let elevCaps = elevLabels.map((label, i) =>
        this.zoneCaption(label, elevZoneWidths[i], PAD));
      let eFit = null;
      for (let pass = 0; pass < 3; pass++) {
        const datumCaptionHeight = Math.max(...elevCaps.map(cap => cap.height));
        eFit = this.fitGroup(elev, ORTHO, () =>
          elev.map((view, i) => ({
            w: elevZoneWidths[i] - 2 * PAD,
            h: elevH - datumCaptionHeight - CAPTION_GAP - PAD
          })));
        if (pass < 2) {
          const totalMeasuredWidth =
            eFit.bbs.reduce((sum, box) => sum + box.width, 0);
          elevZoneWidths = eFit.bbs.map(box =>
            elevationWidthAvailable * box.width / totalMeasuredWidth);
        }
        elevCaps = elevLabels.map((label, i) =>
          this.zoneCaption(label, elevZoneWidths[i], PAD));
      }
      const elevationDatumY =
        elevY + Math.max(...elevCaps.map(cap => cap.height)) + CAPTION_GAP;

      let elevationX = leftX;
      const elevZones = elev.map((view, i) => {
        const zone = {
          x: elevationX,
          y: elevY,
          w: elevZoneWidths[i],
          h: elevH
        };
        elevationX += elevZoneWidths[i] + G;
        return zone;
      });

      const topConnY = bodyY + topViewH + G;
      const bpY = topConnY + topConnH + G, bpBandH = y1 - bpY;

      const bFit = this.fitGroup([v.plan, v.side], BP, bbs => {
        const rat = bbs.map(b => b.height / b.width);
        const sum = rat.reduce((t, r) => t + r, 0);
        const band = bpBandH - G - 2 * (CAP + CAPTION_GAP + PAD);
        return rat.map(r => ({ w: rightW - 2 * PAD, h: band * r / sum }));
      });
      const topAllocation = () =>
        [{ w: rightW - 2 * PAD, h: topViewH - CAP - CAPTION_GAP - PAD }];
      const topDetail = v.top.detail;
      let tFit;
      if (topDetail && topDetail.box) {
        // The orthographic profile was drawn at 1:scaleDenominator. Restore
        // its full millimetre geometry, then display it with the exact same
        // paper-space scale already chosen for the baseplate plan.
        topDetail.setScale(Number(ortho.scaleDenominator) || 1);
        topDetail.setLabelPaperGap(bFit.s, TOP.paperFont);
        const fontK = TOP.paperFont / (TOP.font * bFit.s);
        tFit = {
          views: [v.top],
          bbs: [this.measureView(v.top.el, fontK)],
          rects: topAllocation(),
          s: bFit.s,
          fontK,
          // The profile itself is transformed back from the orthographic
          // sheet scale, which also multiplies SVG stroke width.
          strokeK: 0.22 / (TOP.stroke * bFit.s * topDetail.scale)
        };
      } else {
        tFit = this.fitGroup([v.top], TOP, topAllocation);
      }
      const zones = [
        { z: { x: rX, y: bodyY, w: rightW, h: topViewH },
          label: "WIND POST SECTION (TOP VIEW)", fit: tFit, i: 0, ref: TOP },
        ...elevZones.map((z, i) => ({
          z, label: elevLabels[i], cap: elevCaps[i], fit: eFit, i, ref: ORTHO,
          contentTop: elevationDatumY
        })),
        { z: { x: rX, y: bpY, w: rightW, h: bFit.rects[0].h + CAP + CAPTION_GAP + PAD },
          label: "BASE PLATE PLAN", fit: bFit, i: 0, ref: BP },
        { z: { x: rX, y: bpY + bFit.rects[0].h + CAP + CAPTION_GAP + PAD + G, w: rightW,
               h: bFit.rects[1].h + CAP + CAPTION_GAP + PAD },
          label: "BASE PLATE SIDE VIEW", fit: bFit, i: 1, ref: BP }
      ];

      const src = { o: this.defsOf(v.top.defs), b: this.defsOf(v.plan.defs) };
      const viewBody = zones.map((entry, n) => {
        const z = entry.z;
        const cap = entry.cap || this.zoneCaption(entry.label, z.w, PAD);
        if (!entry.fit) return cap.draw(z.x, z.y);
        const fit = entry.fit, view = fit.views[entry.i];
        const top = entry.contentTop ?? z.y + cap.height + CAPTION_GAP;
        return cap.draw(z.x, z.y) + this.viewport(
          entry.ref === BP ? src.b : src.o,
          this.serialize(view.el), fit.bbs[entry.i],
          { x: z.x + PAD, y: top, w: z.w - 2 * PAD, h: z.h - (top - z.y) - PAD },
          fit.s, `vp${n}`, fit.fontK, fit.strokeK, entry.label
        );
      }).join("");

      const production = this.productionDetails();
      const header = this.productionHeader(ortho, this.cantileverBaseplate, {
        x: x0,
        y: y0,
        w: x1 - x0,
        h: headerH
      }, production);
      const notesY = y0 + headerH + 3.6;
      const productionNotes =
        `<g id="production-notes" data-cad="text">`
        + `<text x="${x0 + 2}" y="${f(notesY)}" font-size="2.65" font-weight="700">`
        + `MEASUREMENT TOLERANCE: ± 2 mm</text>`
        + `<text x="${x0 + 2}" y="${f(notesY + 3.8)}" font-size="2.65" font-weight="700">`
        + `SLOTS / HOLES: ± 1 mm</text>`
        + `<text x="${x1 - 2}" y="${f(notesY + 1.5)}" text-anchor="end" `
        + `font-size="4.6" font-weight="700">${production.quantity} NO.</text>`
        + `<text x="9" y="286" transform="rotate(-90 9 286)" `
        + `font-size="3.1" font-weight="700">*** STAINLESS STEEL — GRADE 304 ***</text>`
        + `<text x="${f(elevZones[0].x + elevZones[0].w / 2)}" y="288.3" `
        + `text-anchor="middle" font-size="2.7" font-weight="700">FOLD UP</text>`
        + `</g>`;
      const d = (this.cantileverBaseplate && this.cantileverBaseplate.design) || {};
      const plateOverall = Math.round(
        (Number(d.leftPortion_mm ?? d.leftPortion) || 0) +
        (Number(d.plateLen) || 0)
      );
      const plateMeta = [
        plateOverall && d.B && d.tp
          ? `${plateOverall} × ${Math.round(Number(d.B))} × ${Math.round(Number(d.tp))} mm BASE PLATE`
          : "",
        d.tw ? `${Math.round(Number(d.tw))} mm STIFFENER` : ""
      ].filter(Boolean).join(" · ");
      const sideY = bpY + bFit.rects[0].h + CAP + CAPTION_GAP + PAD + G;
      const plateHeadingX = rX + PAD + 0.7;
      const plateMetaGap = 3;
      const plateMetaFont = 2.15;
      const plateMetaX = label =>
        plateHeadingX + this.textWidth(label, 3.2, true) + plateMetaGap;
      const baseplateMeta = plateMeta
        ? `<g id="production-baseplate-meta" data-cad="text">`
          + `<text x="${f(plateMetaX("BASE PLATE PLAN"))}" y="${f(bpY + 5.1)}" `
          + `font-size="${plateMetaFont}" font-weight="700">${this.escape(plateMeta)}</text>`
          + `<text x="${f(plateMetaX("BASE PLATE SIDE VIEW"))}" y="${f(sideY + 5.1)}" `
          + `font-size="${plateMetaFont}" font-weight="700">${this.escape(plateMeta)}</text>`
          + `</g>`
        : "";
      const signoffX = 183.5;
      const signoffY = 253;
      const signoffW = 19;
      const signoffH = 8.4;
      const signoffGap = 1.1;
      const productionSignoff =
        `<g id="production-signoff" aria-label="Production sign-off boxes">`
        + ["CUT", "MARK", "WELD", "CHECK"].map((label, i) => {
          const y = signoffY + i * (signoffH + signoffGap);
          return `<text x="${f(signoffX - 2)}" y="${f(y + 5.5)}" `
            + `text-anchor="end" font-size="2.35" font-weight="700" `
            + `fill="#000">${label}</text>`
            + `<rect x="${signoffX}" y="${f(y)}" width="${signoffW}" `
            + `height="${signoffH}" fill="#fff" stroke="#000" `
            + `stroke-width="0.35"/>`;
        }).join("")
        + `</g>`;
      const monochrome = this.monochrome();
      const productionColour = monochrome ? "monochrome" : "cad-layers";

      return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" `
        + `viewBox="0 0 210 297" role="img" `
        + `data-sheet-standard="keystone-production-a4" `
        + `data-section-length-mm="${this.escape(ortho.length_mm)}" `
        + `data-production-colour="${productionColour}" `
        + `style="width:100%;max-width:794px;height:auto;background:#fff" `
        + `font-family="Arial Narrow,Arial,Helvetica,sans-serif">`
        + (windpost.cadLayers
            ? `<style>${windpost.cadLayers.paletteCss(monochrome)}</style>`
            : "")
        + `<style>[data-cad="dim"] text,text[data-cad="dim"]{`
        + `paint-order:stroke;stroke:#fff!important;stroke-width:1.2px!important;`
        + `stroke-linejoin:round}</style>`
        + `<rect x="0" y="0" width="210" height="297" fill="#fff"/>`
        + `<rect x="4" y="4" width="202" height="289" fill="none" stroke="#000" stroke-width="0.4"/>`
        + header
        + productionNotes
        + baseplateMeta
        + viewBody
        + productionSignoff
        + `</svg>`;
    },

    productionHeader(ortho, bp, box, production) {
      const f = n => Number(n.toFixed(2));
      const x = box.x, y = box.y, w = box.w, h = box.h;
      const rowTop = y + 28;
      const rowH = 9;
      const details = production || {};
      const dateText = details.date || "";
      const revision = details.revision || "P1";
      const revisionIssue = details.revisionIssue || "FIRST ISSUE";
      const section = ortho.sectionName || "WINDPOST";
      const length = Math.round(Number(ortho.length_mm) || 0);
      const specification = `${section} WINDPOST @ ${length} mm`;
      const text = (tx, ty, label, value, size) =>
        `<text x="${f(tx)}" y="${f(ty)}" font-size="${size || 2.45}" `
        + `fill="#000" data-cad="text"><tspan font-weight="700">`
        + `${this.escape(label)}</tspan><tspan dx="3">${this.escape(value || "")}</tspan></text>`;
      const line = (x1, y1, x2, y2, width) =>
        `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" `
        + `stroke="#000" stroke-width="${width || 0.25}" data-cad="construction"/>`;

      const rows = [
        line(x, rowTop, x + w, rowTop, 0.35),
        line(x, rowTop + rowH, x + w, rowTop + rowH),
        line(x, rowTop + 2 * rowH, x + w, rowTop + 2 * rowH),
        line(x, rowTop + 3 * rowH, x + w, rowTop + 3 * rowH),
        line(x, rowTop + 4 * rowH, x + w, rowTop + 4 * rowH, 0.35),
        line(x + 66, rowTop, x + 66, rowTop + 2 * rowH),
        line(x + 135, rowTop, x + 135, rowTop + 2 * rowH),
        line(x + 42, rowTop + 2 * rowH, x + 42, rowTop + 3 * rowH),
        line(x + 94, rowTop + 2 * rowH, x + 94, rowTop + 3 * rowH),
        line(x + 140, rowTop + 2 * rowH, x + 140, rowTop + 3 * rowH),
        line(x + 104, rowTop + 3 * rowH, x + 104, rowTop + 4 * rowH)
      ].join("");

      return `<g id="production-title-block">`
        + `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" `
        + `fill="#fff" stroke="#000" stroke-width="0.35" data-cad="construction"/>`
        + `<g data-cad="text">`
        + `<text x="${f(x + 4)}" y="${f(y + 7)}" font-size="2.6" font-weight="700">PRODUCTION DRAWING</text>`
        + `<text x="${f(x + 4)}" y="${f(y + 11)}" font-size="2.3" font-weight="700">`
        + `REV ${this.escape(revision)} · ${this.escape(revisionIssue)}</text>`
        + `<text x="${f(x + 4)}" y="${f(y + 15)}" font-size="2.6" font-weight="700">DATE ${dateText}</text>`
        + `<g transform="translate(${f(x + 43)} ${f(y + 4)})" fill="#000">`
        + `<path d="M0 15 L4 2 L8 2 L6 15 Z"/>`
        + `<path d="M8 15 L10 0 L15 0 L14 15 Z"/>`
        + `<path d="M15 15 L18 3 L22 4 L21 15 Z"/>`
        + `</g>`
        + `<text x="${f(x + 68)}" y="${f(y + 17)}" font-size="15.5" `
        + `font-weight="700" letter-spacing="-0.7">Keystone</text>`
        + `<text x="${f(x + 160)}" y="${f(y + 24)}" font-size="5.2" `
        + `letter-spacing="1">LINTELS</text>`
        + `</g>`
        + rows
        + text(x + 2, rowTop + 5.8, "MERCHANT:", details.merchant)
        + text(x + 68, rowTop + 5.8, "PRODUCT WEIGHT:", details.weight)
        + text(x + 137, rowTop + 5.8, "CUSTOMER:", details.customer)
        + text(x + 2, rowTop + rowH + 5.8, "DETAILER:", details.detailer)
        + text(x + 68, rowTop + rowH + 5.8, "ENGINEER:", details.engineer)
        + text(x + 137, rowTop + rowH + 5.8, "CHECKED BY:", details.checkedBy)
        + text(x + 2, rowTop + 2 * rowH + 5.8, "DWG NO.:", details.drawingNumber)
        + text(x + 44, rowTop + 2 * rowH + 5.8, "SCHEDULE:", details.schedule)
        + text(x + 96, rowTop + 2 * rowH + 5.8, "DATE:", dateText)
        + text(x + 142, rowTop + 2 * rowH + 5.8, "KSSO:", details.ksso)
        + text(x + 2, rowTop + 3 * rowH + 5.8, "SPECIFICATION:", specification, 2.35)
        + text(x + 106, rowTop + 3 * rowH + 5.8,
          "MANUFACTURED SITE:", details.manufacturedSite)
        + `</g>`;
    },

    // Prepare the production-sheet top section for paper-space matching. Its
    // final size is solved in composeA4 against the post profile shown inside
    // the baseplate plan, so both representations are always identical.
    prepareA4TopSection(el) {
      const profile = el.querySelector(".section-fill");
      const label = el.querySelector(".section-size");
      if (!profile || !label) {
        return {
          box: null,
          scale: 1,
          setScale() {},
          setLabelPaperGap() {},
          restore() {}
        };
      }

      const attrs = [];
      const box = profile.getBBox();
      const centreX = box.x + box.width / 2;
      const centreY = box.y + box.height / 2;
      const detail = {
        box,
        scale: 1,
        labelOffset: 2.3,
        setScale(nextScale) {
          const factor = Math.max(0.05, Number(nextScale) || 1);
          const fixedBottom =
            centreY + (box.y + box.height - centreY) * factor;
          detail.scale = factor;
          profile.setAttribute("transform",
            `translate(${centreX} ${centreY}) scale(${factor}) ` +
            `translate(${-centreX} ${-centreY})`);
          label.setAttribute("x", String(centreX));
          label.setAttribute("y", String(fixedBottom + detail.labelOffset));
          label.setAttribute("text-anchor", "middle");
        },
        setLabelPaperGap(viewScale, paperFont) {
          const scale = Number(viewScale) || 1;
          const font = Number(paperFont) || 1.3;
          // Baseline offset = 0.7 mm clear gap + approximate font ascent.
          detail.labelOffset = (0.7 + 0.82 * font) / scale;
          detail.setScale(detail.scale);
        },
        restore() {
          attrs.reverse().forEach(([node, attr, previous]) => {
            if (previous === null) node.removeAttribute(attr);
            else node.setAttribute(attr, previous);
          });
        }
      };
      ["transform"].forEach(attr =>
        attrs.push([profile, attr, profile.getAttribute(attr)]));
      ["x", "y", "text-anchor"].forEach(attr =>
        attrs.push([label, attr, label.getAttribute(attr)]));
      detail.setScale(1);
      return detail;
    },

    // Put a view into sheet form on the live drawing, so what is measured is
    // exactly what gets drawn. The view's own caption goes (the sheet labels
    // every zone itself), the surroundings the sheet does not want — wall,
    // concrete — go with it, and anything tagged to close up the gap they
    // leave is shifted. Returns a function that puts it all back.
    prepareView(el, dropTexts) {
      const attrs = [], cut = [];
      const set = (node, attr, value) => {
        attrs.push([node, attr, node.getAttribute(attr)]);
        node.setAttribute(attr, value);
      };
      // Taken out of the tree rather than hidden, so they are absent from both
      // the measurement and the file the sheet writes.
      const drop = node => {
        cut.push([node, node.parentNode, node.nextSibling]);
        node.parentNode.removeChild(node);
      };
      el.querySelectorAll("[data-a4-shift]").forEach(node => {
        const [dx, dy] = node.getAttribute("data-a4-shift").split(/[\s,]+/).map(Number);
        set(node, "transform", `translate(${dx || 0} ${dy || 0})`);
      });
      el.querySelectorAll("text").forEach(node => {
        const label = (node.textContent || "").trim();
        const shouldDrop = (dropTexts || []).some(item =>
          item && item.charAt(0) === "~"
            ? label.indexOf(item.slice(1)) >= 0
            : label === item
        );
        if (node.classList.contains("view-title") ||
            shouldDrop) {
          const leader = node.nextElementSibling;
          drop(node);
          if (leader && leader.getAttribute("data-cad") === "leader") drop(leader);
        }
      });
      el.querySelectorAll("[data-a4-hide]").forEach(drop);
      return () => {
        cut.reverse().forEach(([node, parent, next]) => parent.insertBefore(node, next));
        attrs.forEach(([node, attr, prev]) => {
          if (prev === null) node.removeAttribute(attr);
          else node.setAttribute(attr, prev);
        });
      };
    },

    // Measure a view with its annotation at the size it will be drawn on the
    // sheet. Font size can come from a stylesheet, so the used value is read
    // back and overridden inline, then restored.
    measureView(el, fontK) {
      if (!(fontK > 0) || Math.abs(fontK - 1) < 0.005) return el.getBBox();
      const touched = [];
      el.querySelectorAll("text").forEach(node => {
        const used = parseFloat(global.getComputedStyle(node).fontSize);
        if (!used) return;
        touched.push([node, node.style.fontSize]);
        node.style.fontSize = (used * fontK) + "px";
      });
      const box = el.getBBox();
      touched.forEach(([node, prev]) => { node.style.fontSize = prev; });
      return box;
    },

    // Fit views that must share one scale into their zones. Measuring is
    // repeated with the annotation boost applied, because boosted callouts run
    // wider than the source and would otherwise spill past the zone and be
    // clipped at its edge.
    fitGroup(views, ref, allocate) {
      const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
      const measure = k => {
        const bbs = views.map(view => this.measureView(view.el, k));
        const rects = allocate(bbs);
        const s = Math.min(...bbs.map((b, i) =>
          Math.min(rects[i].w / b.width, rects[i].h / b.height)));
        return { bbs, rects, s };
      };
      let fontK = 1, out = measure(1);
      for (let pass = 0; pass < 4; pass++) {
        const paperFont = Number(ref.paperFont) || 2.5;
        const next = clamp(paperFont / (ref.font * out.s), 0.45, 3.5);
        if (Math.abs(next - fontK) < 0.01) break;
        fontK = next;
        out = measure(fontK);
      }
      return Object.assign({ views, fontK,
        strokeK: clamp((ref.paperStroke || 0.22) /
          (ref.stroke * out.s), 0.35, 4) }, out);
    },

    // A zone caption: the label auto-fitted to the zone, wrapped onto a second
    // line when the zone is narrow, with the viewport scale tucked to the right
    // of the last line. Room for the scale is always reserved, so a caption can
    // be laid out before its scale is known.
    zoneCaption(label, zoneW, pad) {
      const avail = zoneW - 2 * pad - 1.4;
      let size = 3.2, lines = [label];
      if (this.textWidth(label, size, true) > avail) {
        lines = this.splitLabel(label);
        const widest = s => Math.max(...lines.map(l => this.textWidth(l, s, true)));
        let guard = 0;
        while (guard++ < 20 && size > 2.2 && widest(size) > avail) size -= 0.12;
      }
      const lead = size + 0.8, page = this;
      return {
        height: 1.2 + lines.length * lead + 1,
        draw(x, y) {
          const f = n => Number(n.toFixed(2));
          return lines.map((line, i) =>
            `<text x="${f(x + pad + 0.7)}" y="${f(y + 1.2 + (i + 1) * lead)}" ` +
            `font-size="${f(size)}" font-weight="700" fill="#123a63" ` +
            `data-cad="text">${page.escape(line)}</text>`).join("");
        }
      };
    },

    // Break a label into two lines of the most even width.
    splitLabel(label) {
      const words = label.split(" ");
      if (words.length < 2) return [label];
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
        const score = Math.abs(this.textWidth(a, 10, true) - this.textWidth(b, 10, true));
        if (!best || score < best.score) best = { score, lines: [a, b] };
      }
      return best.lines;
    },

    textWidth(text, size, bold) {
      const ctx = this.measureCtx ||
        (this.measureCtx = document.createElement("canvas").getContext("2d"));
      ctx.font = `${bold ? "700 " : ""}${size}px Arial,Helvetica,sans-serif`;
      return ctx.measureText(text).width;
    },

    // Serialise a view for the sheet. Every pattern fill is dropped to white:
    // section hatching reads as noise at sheet scale, and the sheet is meant to
    // be linework.
    serialize(el) {
      return new XMLSerializer().serializeToString(el)
        .replace(/fill="url\(#[^")]*\)"/g, 'fill="#fff"')
        .replace(/fill:\s*url\(#[^)]*\)/g, "fill:#fff");
    },

    // The source drawing's <defs> (patterns, markers) and its stylesheet, kept
    // apart so each viewport can carry its own boosted, scoped copy.
    defsOf(root) {
      const el = root.querySelector("defs");
      if (!el) return { defs: "", css: "" };
      const clone = el.cloneNode(true);
      const style = clone.querySelector("style");
      const css = style ? style.textContent.replace(/fill:\s*url\(#[^)]*\)/g, "fill:#fff") : "";
      if (style) style.remove();
      return { defs: new XMLSerializer().serializeToString(clone), css };
    },

    // Place a view in its zone at exactly `s` mm of paper per drawing unit,
    // centred on its own bounding box — an AutoCAD viewport with a set zoom.
    // Annotation is normalised to a constant PAPER size, so text and line
    // weights read the same in every zone whatever that zone's scale happens
    // to be.
    viewport(src, frag, bb, r, s, tag, fontK, strokeK, zone) {
      const f = n => Number(n.toFixed(2));
      const css = src.css
        ? `<style>${this.scopeCss(this.boost(src.css, fontK, strokeK), "#" + tag)}</style>`
        : "";
      const inner = this.localise(
        this.boost(src.defs, fontK, strokeK) + css + this.boost(frag, fontK, strokeK),
        tag
      );
      const vw = r.w / s, vh = r.h / s;
      const cx = bb.x + bb.width / 2;
      // Centred across, anchored to the TOP down the page: any spare height in
      // a zone falls below the drawing, so the gap under the caption is the
      // same in every zone instead of varying with how much slack there is.
      return `<svg id="${tag}" data-zone="${this.escape(zone || tag)}" `
        + `x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" `
        + `viewBox="${f(cx - vw / 2)} ${f(bb.y)} ${f(vw)} ${f(vh)}">${inner}</svg>`;
    },

    // Suffix every id and its url(#id) references so the nested copies never
    // collide with the source drawings, which stay live on the same page.
    localise(html, tag) {
      let out = html;
      const ids = [];
      html.replace(/\sid="([^"]+)"/g, (m, id) => { ids.push(id); return m; });
      ids.forEach(id => {
        const q = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        out = out
          .replace(new RegExp(`id="${q}"`, "g"), `id="${id}-${tag}"`)
          .replace(new RegExp(`url\\(#${q}\\)`, "g"), `url(#${id}-${tag})`);
      });
      return out;
    },

    // Confine a stylesheet to one viewport. SVG <style> is document-wide, so
    // without this the copies would fight each other and the source drawings.
    scopeCss(css, prefix) {
      return css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, rules) => {
        const scoped = sel.split(",")
          .map(part => part.trim())
          .filter(Boolean)
          .map(part => `${prefix} ${part}`)
          .join(",");
        return scoped ? `${scoped}{${rules}}` : "";
      });
    },

    // Rescale every font-size / stroke-width number in an SVG string. Factors
    // may be below 1: a view placed at a large scale needs its annotation
    // brought DOWN as much as a small one needs it brought up.
    boost(svg, fontK, strokeK) {
      const fk = n => Number((Number(n) * fontK).toFixed(2));
      const sk = n => Number((Number(n) * strokeK).toFixed(3));
      return svg
        .replace(/font-size="([\d.]+)"/g, (m, n) => `font-size="${fk(n)}"`)
        .replace(/font-size:\s*([\d.]+)/g, (m, n) => `font-size:${fk(n)}`)
        // the CSS `font:` shorthand, e.g. font:700 4px "Arial Narrow"
        .replace(/font:([^;}"']*?)([\d.]+)px/g, (m, pre, n) => `font:${pre}${fk(n)}px`)
        .replace(/stroke-width="([\d.]+)"/g, (m, n) => `stroke-width="${sk(n)}"`)
        .replace(/stroke-width:\s*([\d.]+)/g, (m, n) => `stroke-width:${sk(n)}`);
    },

    // DXF / PDF of the A4 sheet. Both come from the SAME flattening of the
    // rendered sheet, so what is exported is exactly what is on screen.
    downloadA4Export(format) {
      this.productionSheetScheduler.flush();
      if (!this.productionReady()) return;
      const root = this.a4Sheet && this.a4Sheet.querySelector("svg");
      if (!root || !windpost.sheetExport) return;
      const name = `${this.orthographic.sectionName.replaceAll(" ", "-")}-A4-all-views`;
      try {
        const sheet = windpost.sheetExport.flatten(root);
        const isDxf = format === "dxf";
        this.saveFile(
          isDxf ? windpost.sheetExport.toDxf(sheet) : windpost.sheetExport.toPdf(sheet),
          `${name}.${isDxf ? "dxf" : "pdf"}`,
          isDxf ? "image/vnd.dxf" : "application/pdf"
        );
      } catch (error) {
        global.alert(`The sheet could not be exported: ${error.message}`);
      }
    },

    saveFile(text, filename, mime) {
      // Latin-1 so the PDF's byte offsets match the string offsets it was
      // built from; the DXF is plain ASCII either way.
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      const url = link.href;
      link.remove();
      global.setTimeout(() => URL.revokeObjectURL(url), 0);
    },

    downloadA4Sheet() {
      this.productionSheetScheduler.flush();
      if (!this.productionReady()) return;
      const svg = this.a4Sheet && this.a4Sheet.innerHTML;
      if (!svg) return;
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download =
        `${this.orthographic.sectionName.replaceAll(" ", "-")}-A4-all-views.svg`;
      document.body.appendChild(link);
      link.click();
      const url = link.href;
      link.remove();
      global.setTimeout(() => URL.revokeObjectURL(url), 0);
    },

    escape(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }
  };

  global.addEventListener("DOMContentLoaded", () => page.init());
})(window);
