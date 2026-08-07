(function initialiseTiePrototypePage(global) {
  "use strict";

  const windpost = global.Windpost;

  const page = {
    mode: "hatch",

    init() {
      this.profileSelect = document.getElementById("tie-profile");
      this.drawingHost = document.getElementById("tie-drawing");
      this.canvas = document.getElementById("tie-3d-canvas");
      this.renderer = windpost.tiePrototype3d.create(this.canvas);
      this.wallDrawingHost = document.getElementById("tie-wall-drawing");
      this.wallRenderer = windpost.tieWall3d.create(
        document.getElementById("tie-wall-3d-canvas")
      );
      this.wallSectionSelect =
        document.getElementById("wall-windpost-section");
      windpost.lSectionDatabase.sections.forEach(section => {
        const option = document.createElement("option");
        option.value = section.name;
        option.textContent = section.name;
        this.wallSectionSelect.appendChild(option);
      });
      this.wallSectionSelect.value =
        windpost.tieWallSetup.DEFAULTS.sectionName;

      windpost.tieProfiles.profiles.forEach(profile => {
        const option = document.createElement("option");
        option.value = profile.name;
        option.textContent = profile.name;
        this.profileSelect.appendChild(option);
      });
      const requested = new URLSearchParams(global.location.search).get(
        "profile"
      );
      if (windpost.tieProfiles.profiles.some(
        profile => profile.name === requested
      )) {
        this.profileSelect.value = requested;
      }

      this.profileSelect.addEventListener("change", () => {
        const params = new URLSearchParams(global.location.search);
        params.set("profile", this.profileSelect.value);
        global.history.replaceState(
          null,
          "",
          `${global.location.pathname}?${params.toString()}`
        );
        this.render();
      });
      document.getElementById("tie-mode-hatch").addEventListener("click", () => {
        this.setMode("hatch");
      });
      document.getElementById("tie-mode-lines").addEventListener("click", () => {
        this.setMode("lines");
      });
      document.getElementById("tie-reset-view").addEventListener("click", () => {
        this.renderer.reset();
      });
      document.getElementById("tie-download-svg").addEventListener("click", () => {
        this.downloadSvg();
      });
      [
        "wall-windpost-section",
        "wall-outer-thickness",
        "wall-cavity-width",
        "wall-inner-thickness",
        "wall-elevation-height"
      ].forEach(id => {
        const element = document.getElementById(id);
        element.addEventListener(
          element.tagName === "SELECT" ? "change" : "input",
          () => {
          this.renderWall();
          }
        );
      });
      [
        ["wall-outer-material", "wall-outer-thickness"],
        ["wall-inner-material", "wall-inner-thickness"]
      ].forEach(([materialId, thicknessId]) => {
        document.getElementById(materialId).addEventListener("change", () => {
          const material =
            windpost.tieWallSetup.MATERIALS[
              document.getElementById(materialId).value
            ];
          document.getElementById(thicknessId).value =
            material.defaultThickness_mm;
          this.renderWall();
        });
      });
      document.getElementById("wall-reset-view").addEventListener(
        "click",
        () => this.wallRenderer.reset()
      );
      this.render();
      this.renderWall();
    },

    profile() {
      return windpost.tieProfiles.get(this.profileSelect.value);
    },

    setMode(mode) {
      this.mode = mode;
      document.getElementById("tie-mode-hatch").classList.toggle(
        "is-active",
        mode === "hatch"
      );
      document.getElementById("tie-mode-lines").classList.toggle(
        "is-active",
        mode === "lines"
      );
      this.render();
      this.renderWall();
    },

    render() {
      const profile = this.profile();
      const isShear = profile.family === "SHEAR";
      const drawing = windpost.tiePrototypeDrawing.draw(profile, {
        mode: this.mode
      });
      this.lastDrawing = drawing;
      this.drawingHost.innerHTML = drawing.svg;
      this.renderer.setGeometry(drawing.geometry);
      document.getElementById("tie-name").textContent = profile.name;
      document.getElementById("tie-size").textContent =
        `${profile.overallLength_mm} × ${profile.width_mm} × ${profile.thickness_mm} mm`;
      document.getElementById("tie-length").textContent =
        `${profile.overallLength_mm} mm`;
      document.getElementById("tie-width").textContent =
        `${profile.width_mm} mm`;
      document.getElementById("tie-thickness").textContent =
        `${profile.thickness_mm} mm`;
      document.getElementById("tie-notch").textContent =
        `${profile.engagementNotchLength_mm} mm`;
      document.getElementById("tie-tail-label").textContent = isShear
        ? "Mirrored engagement"
        : "End portion";
      document.getElementById("tie-tail").textContent =
        `${isShear
          ? profile.mirroredEngagement_mm
          : profile.tailBeyondNotch_mm} mm`;
      document.getElementById("tie-drops-label").textContent = isShear
        ? "Assumed side-notch depth"
        : "Assumed notch drops";
      document.getElementById("tie-drops").textContent =
        isShear
          ? `${profile.assumedSideNotchDepth_mm} mm`
          : `${profile.assumedNotchDropEach_mm} + ${profile.assumedNotchDropEach_mm} mm`;
      document.getElementById("tie-holes").textContent = isShear
        ? "4 × 10 × 6 mm · R3"
        : "Not shown";
      document.getElementById("tie-description").textContent = isShear
        ? "Two-way inner-leaf shear tie with four elongated openings and a mirrored centre engagement for the windpost slot."
        : "Outer-leaf EDC tie. Holes are intentionally omitted; the drawing uses the confirmed overall dimensions and authorised assumed notch drops.";
      document.getElementById("tie-status").textContent = isShear
        ? "Confirmed size · assumed centre depth"
        : "Confirmed size · assumed drops";
    },

    wallInput() {
      return {
        sectionName:
          document.getElementById("wall-windpost-section").value,
        outerMaterial:
          document.getElementById("wall-outer-material").value,
        outerThickness_mm:
          document.getElementById("wall-outer-thickness").value,
        cavityWidth_mm:
          document.getElementById("wall-cavity-width").value,
        innerMaterial:
          document.getElementById("wall-inner-material").value,
        innerThickness_mm:
          document.getElementById("wall-inner-thickness").value,
        elevationHeight_mm:
          document.getElementById("wall-elevation-height").value,
        wallLength_mm: 900,
        wallHeight_mm: 450
      };
    },

    format(value) {
      const rounded = Math.round(Number(value) * 10) / 10;
      return Number.isInteger(rounded)
        ? String(rounded)
        : rounded.toFixed(1);
    },

    renderWall() {
      const model = windpost.tieWallSetup.build(this.wallInput());
      this.wallModel = model;
      const canvasMasonry =
        this.mode === "hatch" &&
        Boolean(windpost.tieWallCanvasRenderer);
      const drawing = windpost.tieWallDrawing.draw(model, {
        mode: this.mode,
        canvasMasonry
      });
      if (canvasMasonry) {
        this.wallDrawingHost.innerHTML =
          `<div class="wall-hybrid-stage">
            <canvas class="wall-masonry-canvas" aria-label="Clipped realistic masonry texture"></canvas>
            ${drawing.svg}
          </div>`;
        const rendered = windpost.tieWallCanvasRenderer.render(
          this.wallDrawingHost.querySelector(".wall-masonry-canvas"),
          this.wallDrawingHost.querySelector("svg")
        );
        if (!rendered) {
          this.wallDrawingHost.innerHTML =
            windpost.tieWallDrawing.draw(model, {
              mode: this.mode
            }).svg;
        }
      } else {
        this.wallDrawingHost.innerHTML = drawing.svg;
      }
      this.wallRenderer.setModel(model);
      document.getElementById("wall-outer-zone").textContent =
        `${this.format(model.outer.start_mm)}–${this.format(model.outer.end_mm)} mm`;
      document.getElementById("wall-cavity-zone").textContent =
        `${this.format(model.cavity.start_mm)}–${this.format(model.cavity.end_mm)} mm`;
      document.getElementById("wall-inner-zone").textContent =
        `${this.format(model.inner.start_mm)}–${this.format(model.inner.end_mm)} mm`;
      document.getElementById("wall-total-thickness").textContent =
        `${this.format(model.totalThickness_mm)} mm`;
      document.getElementById("wall-section-name").textContent =
        model.connection.section.name;
      document.getElementById("wall-edc-name").textContent =
        model.connection.edcTie.name;
    },

    downloadSvg() {
      if (!this.lastDrawing) return;
      const blob = new Blob([this.lastDrawing.svg], {
        type: "image/svg+xml"
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${this.profile().name}-prototype.svg`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  };

  global.tiePrototypePage = page;
  global.addEventListener("DOMContentLoaded", () => page.init());
})(typeof window !== "undefined" ? window : globalThis);
