(function initialiseDesignTransferEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const VERSION = 1;
  const STORAGE_KEY = "windpost.detailing.snapshot.v1";

  const finite = (value, fallback = null) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  function selectorFileName(locationObject) {
    const raw = decodeURIComponent(
      (locationObject && locationObject.pathname) || ""
    );
    const current = raw.split("/").filter(Boolean).pop() || "index.html";
    return /^Windpost-Selector-Full\.html$/i.test(current)
      ? "Windpost-Selector-Full.html"
      : "index.html";
  }

  function snapshot(design, baseplate, locationObject, connections) {
    const selected = design && design.selected;
    const section = selected && selected.section;
    const inputs = design && design.inputs;
    if (!section || !inputs) return null;
    const defaults = design.designDefaults || {};
    const wall = selected.wall || {};
    const baseplateSnapshot = baseplate && baseplate.ok
      ? {
          ok: true,
          standard: Boolean(baseplate.standard),
          connectionType: baseplate.connectionType || "",
          postType: baseplate.postType || section.type,
          moment_kNm: finite(baseplate.moment),
          design: { ...(baseplate.design || {}) }
        }
      : null;
    return {
      version: VERSION,
      source: "selector",
      returnFile: selectorFileName(locationObject),
      sectionName: section.name,
      postType: section.type,
      length_mm: finite(inputs.length_mm),
      supportCondition: inputs.supportCondition,
      loadType: inputs.loadType,
      finalCapacity_kN: finite(selected.finalCapacity_kN),
      slotSchedule: {
        firstCentre_mm: finite(defaults.firstTieSpacing, 225),
        spacing_mm: finite(defaults.standardTieSpacing, 225)
      },
      wall: {
        innerLeafThickness_mm: finite(wall.innerLeafThickness_mm, 100),
        cavityWidth_mm: finite(wall.cavityWidth_mm, 100),
        outerLeafThickness_mm: finite(wall.outerLeafThickness_mm, 100)
      },
      baseplate: baseplateSnapshot,
      // the chosen fixings, so the sheet can draw a connection that has its
      // own detail (L-T1, DU-T2, DU-B2)
      headCode: connections && connections.head && connections.head.applicable ? String(connections.head.code || "") : "",
      baseCode: connections && connections.base ? String(connections.base.code || "") : ""
    };
  }

  function validate(value) {
    if (!value || value.version !== VERSION || value.source !== "selector") {
      return null;
    }
    if (typeof value.sectionName !== "string" || !value.sectionName.trim()) {
      return null;
    }
    if (!["L", "U", "DU"].includes(value.postType)) return null;
    if (!["cantilever", "simplySupported"].includes(value.supportCondition)) {
      return null;
    }
    if (!["udl", "tipPointLoad"].includes(value.loadType)) return null;
    if (!(finite(value.length_mm, 0) >= 300 &&
          finite(value.length_mm, 0) <= 12000)) return null;
    return value;
  }

  function serialize(value) {
    const valid = validate(value);
    return valid ? JSON.stringify(valid) : "";
  }

  function deserialize(text) {
    try {
      return validate(JSON.parse(String(text || "")));
    } catch (error) {
      return null;
    }
  }

  function store(value, storage) {
    const text = serialize(value);
    if (!text || !storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(STORAGE_KEY, text);
      return true;
    } catch (error) {
      return false;
    }
  }

  function restore(storage) {
    if (!storage || typeof storage.getItem !== "function") return null;
    try {
      return deserialize(storage.getItem(STORAGE_KEY));
    } catch (error) {
      return null;
    }
  }

  function toQuery(value) {
    const valid = validate(value);
    if (!valid) return "";
    return new URLSearchParams({
      source: "selector",
      version: String(VERSION),
      section: valid.sectionName,
      length: String(valid.length_mm),
      support: valid.supportCondition,
      load: valid.loadType,
      firstSlot: String(valid.slotSchedule.firstCentre_mm),
      slotSpacing: String(valid.slotSchedule.spacing_mm),
      inner: String(valid.wall.innerLeafThickness_mm),
      cavity: String(valid.wall.cavityWidth_mm),
      outer: String(valid.wall.outerLeafThickness_mm),
      capacity: String(valid.finalCapacity_kN || ""),
      head: String(valid.headCode || ""),
      base: String(valid.baseCode || ""),
      return: valid.returnFile
    }).toString();
  }

  // The built Selector ships beside the built Detailing page, the split
  // source pages beside each other, so the target follows the file the
  // Selector is running as.
  function detailingFileName(value) {
    const valid = validate(value);
    return valid && valid.returnFile === "Windpost-Selector-Full.html"
      ? "Windpost-Detailing-Full.html"
      : "l-section-prototype.html";
  }

  function href(value) {
    const query = toQuery(value);
    return query ? `./${detailingFileName(value)}?${query}` : "";
  }

  windpost.designTransferEngine = Object.freeze({
    VERSION,
    STORAGE_KEY,
    selectorFileName,
    detailingFileName,
    snapshot,
    validate,
    serialize,
    deserialize,
    store,
    restore,
    toQuery,
    href
  });
})(typeof window !== "undefined" ? window : globalThis);
