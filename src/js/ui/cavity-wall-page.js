(function initialiseCavityWallPage(global) {
  "use strict";

  const windpost = global.Windpost;
  const STORAGE_KEY = "windpost.cavityAssembly.v1";

  const page = {
    model: null,
    drawings: null,
    activeView: "plan",
    importedBaseplate: null,

    init() {
      this.sectionSelect = document.getElementById("assembly-section");
      this.form = document.getElementById("assembly-form");
      this.status = document.getElementById("assembly-status");
      this.populateSections();
      this.applyImportedPayload();
      this.renderer = windpost.cavityWall3d.create(
        document.getElementById("assembly-canvas")
      );
      this.bindEvents();
      this.render();
      global.setTimeout(() => this.renderer.resize(), 0);
    },

    populateSections() {
      const sections = windpost.lSectionDatabase.sections;
      this.sectionSelect.innerHTML = sections.map(section =>
        `<option value="${this.escape(section.name)}">${this.escape(section.name)}</option>`
      ).join("");
      if (sections.some(section => section.name === "LP 125x70x4")) {
        this.sectionSelect.value = "LP 125x70x4";
      }
    },

    storedPayload() {
      try {
        const value = global.localStorage.getItem(STORAGE_KEY);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        return null;
      }
    },

    queryPayload() {
      const params = new URLSearchParams(global.location.search);
      if (!params.has("section") && !params.has("height")) return null;
      let baseplate = null;
      if (params.has("bp")) {
        try { baseplate = JSON.parse(params.get("bp")); } catch (error) { baseplate = null; }
      }
      return {
        sectionName: params.get("section"),
        length_mm: Number(params.get("height")),
        supportCondition: params.get("support"),
        loadType: params.get("load") || undefined,
        finalCapacity_kN: params.has("capacity") ? Number(params.get("capacity")) : undefined,
        wall: {
          innerLeafThickness_mm: Number(params.get("inner")),
          cavityWidth_mm: Number(params.get("cavity")),
          outerLeafThickness_mm: Number(params.get("outer"))
        },
        baseplate
      };
    },

    applyImportedPayload() {
      const payload = this.queryPayload() || this.storedPayload();
      // An older link without the plate in the URL: the stored payload for
      // the same design still supplies it.
      if (payload && !payload.baseplate) {
        const stored = this.storedPayload();
        if (stored && stored.sectionName === payload.sectionName &&
            Number(stored.length_mm) === Number(payload.length_mm) &&
            stored.supportCondition === payload.supportCondition) {
          payload.baseplate = stored.baseplate || null;
        }
      }
      if (!payload || (payload.type && payload.type !== "L")) return;
      const sections = windpost.lSectionDatabase.sections;
      const name = payload.sectionName ||
        (payload.section && payload.section.name);
      if (sections.some(section => section.name === name)) {
        this.sectionSelect.value = name;
      }
      if (Number(payload.length_mm) > 0) {
        document.getElementById("assembly-height").value = payload.length_mm;
      }
      if (payload.supportCondition === "cantilever" ||
          payload.supportCondition === "simplySupported") {
        document.getElementById("assembly-support").value = payload.supportCondition;
      }
      const wall = payload.wall || {};
      if (Number(wall.innerLeafThickness_mm) > 0) {
        document.getElementById("assembly-inner").value = wall.innerLeafThickness_mm;
      }
      if (Number(wall.cavityWidth_mm) > 0) {
        document.getElementById("assembly-cavity").value = wall.cavityWidth_mm;
      }
      if (Number(wall.outerLeafThickness_mm) > 0) {
        document.getElementById("assembly-outer").value = wall.outerLeafThickness_mm;
      }
      this.importedBaseplate = payload.baseplate || null;
    },

    bindEvents() {
      this.form.addEventListener("submit", event => {
        event.preventDefault();
        this.render();
      });
      this.form.querySelectorAll("input, select").forEach(input => {
        input.addEventListener("change", () => {
          this.importedBaseplate = null;
        });
      });
      document.getElementById("reset-view").addEventListener("click", () =>
        this.renderer.reset()
      );
      document.getElementById("save-view").addEventListener("click", () =>
        this.saveCanvas()
      );
      document.querySelectorAll("[data-layer]").forEach(input => {
        input.addEventListener("change", () =>
          this.renderer.setVisibility(input.dataset.layer, input.checked)
        );
      });
      document.querySelectorAll('[role="tab"][data-view]').forEach(tab => {
        tab.addEventListener("click", () => this.selectView(tab.dataset.view));
        tab.addEventListener("keydown", event => this.onTabKeydown(event));
      });
      document.getElementById("download-active-svg").addEventListener("click", () =>
        this.downloadActiveSvg()
      );
      document.getElementById("print-drawings").addEventListener("click", () =>
        global.print()
      );
    },

    onTabKeydown(event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = [...document.querySelectorAll('[role="tab"][data-view]')];
      const current = tabs.indexOf(event.currentTarget);
      let next = current;
      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      tabs[next].focus();
      this.selectView(tabs[next].dataset.view);
      event.preventDefault();
    },

    selectedSection() {
      return windpost.lSectionDatabase.sections.find(
        section => section.name === this.sectionSelect.value
      );
    },

    readInput() {
      return {
        section: this.selectedSection(),
        supportCondition: document.getElementById("assembly-support").value,
        length_mm: Number(document.getElementById("assembly-height").value),
        wall: {
          innerLeafThickness_mm: Number(document.getElementById("assembly-inner").value),
          cavityWidth_mm: Number(document.getElementById("assembly-cavity").value),
          outerLeafThickness_mm: Number(document.getElementById("assembly-outer").value)
        },
        baseplate: this.importedBaseplate
      };
    },

    render() {
      try {
        const model = windpost.cavityWallAssemblyEngine.build(this.readInput());
        if (!model.valid) throw new Error(model.reason);
        this.model = model;
        this.drawings = windpost.cavityWallDrawingService.drawAll(model);
        this.renderer.setModel(model);
        Object.entries(this.drawings).forEach(([name, svg]) => {
          document.querySelector(`[data-drawing="${name}"]`).innerHTML = svg;
        });
        this.renderMetrics();
        this.renderSpecification();
        this.status.textContent = "Assembly updated from the shared geometry model.";
        this.status.classList.remove("error");
        this.persistCurrent();
      } catch (error) {
        this.status.textContent = error.message;
        this.status.classList.add("error");
      }
    },

    renderMetrics() {
      const model = this.model;
      const metrics = [
        ["L-post placement", "90 mm inner embedment"],
        ["Cavity projection", `${this.number(model.post.cavityProjection_mm, 0)} mm`],
        ["Paired tie levels", `${model.tieSchedule.count} no.`],
        ["Outer tie", model.wallTie.outerTie],
        ["Clear outer gap", `${this.number(model.wallTie.outerGap_mm, 1)} mm`],
        ["Outer embedment", `${this.number(model.wallTie.outerEmbedment_mm, 1)} mm`],
        ["First tie", "225 mm"],
        ["Further spacing", "225 mm c/c"]
      ];
      document.getElementById("metric-grid").innerHTML = metrics.map(item =>
        `<div class="metric"><span>${this.escape(item[0])}</span><strong>${this.escape(item[1])}</strong></div>`
      ).join("");
    },

    renderSpecification() {
      const model = this.model;
      const plate = model.baseplate && model.baseplate.design
        ? model.baseplate.design : {};
      const rows = [
        ["Section", model.section.name],
        ["Overall height", `${this.number(model.length_mm, 0)} mm`],
        ["Wall", `${this.number(model.wall.innerLeafThickness_mm, 0)} / ${this.number(model.wall.cavityWidth_mm, 0)} / ${this.number(model.wall.outerLeafThickness_mm, 1)} mm`],
        ["Shear ties", `${model.tieSchedule.count} × 168 mm two-way`],
        ["EDC ties", `${model.tieSchedule.count} × ${model.wallTie.outerTie}`],
        ["Base plate", plate.B && plate.tp
          ? `${this.number((Number(plate.leftPortion) || 0) + (Number(plate.plateLen) || 0), 0)} × ${this.number(plate.B, 0)} × ${this.number(plate.tp, 0)} mm`
          : "From selected connection"]
      ];
      document.getElementById("assembly-spec").innerHTML = rows.map(row =>
        `<div><dt>${this.escape(row[0])}</dt><dd>${this.escape(row[1])}</dd></div>`
      ).join("");
    },

    persistCurrent() {
      if (!this.model) return;
      const payload = {
        version: 1,
        type: "L",
        sectionName: this.model.section.name,
        length_mm: this.model.length_mm,
        supportCondition: this.model.supportCondition,
        wall: this.model.wall,
        baseplate: this.model.baseplate
      };
      try {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        // The page remains fully usable when storage is unavailable.
      }
    },

    selectView(name) {
      if (!this.drawings || !this.drawings[name]) return;
      this.activeView = name;
      document.querySelectorAll('[role="tab"][data-view]').forEach(tab => {
        const selected = tab.dataset.view === name;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      document.querySelectorAll("[data-drawing]").forEach(panel => {
        panel.classList.toggle("hidden", panel.dataset.drawing !== name);
      });
    },

    downloadActiveSvg() {
      if (!this.drawings || !this.drawings[this.activeView]) return;
      const blob = new Blob([this.drawings[this.activeView]], {
        type: "image/svg+xml;charset=utf-8"
      });
      this.downloadBlob(
        blob,
        `l-windpost-cavity-wall-${this.activeView}.svg`
      );
    },

    saveCanvas() {
      const canvas = document.getElementById("assembly-canvas");
      canvas.toBlob(blob => {
        if (blob) this.downloadBlob(blob, "l-windpost-cavity-wall-3d.png");
      }, "image/png");
    },

    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },

    number(value, decimals) {
      const number = Number(value);
      return Number.isFinite(number) ? number.toFixed(decimals == null ? 1 : decimals) : "—";
    },

    escape(value) {
      return String(value == null ? "" : value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  };

  global.cavityWallPage = page;
  global.addEventListener("DOMContentLoaded", () => page.init());
})(window);
