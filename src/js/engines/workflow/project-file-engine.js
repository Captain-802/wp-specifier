(function initialiseProjectFileEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const SCHEMA = "windpost-project";
  const VERSION = 1;
  const MAX_BYTES = 4 * 1024 * 1024;
  const DRAFT_KEY = "windpost.project.draft.v1";

  function clone(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  }

  function create(kind, data, metadata) {
    if (!["selector", "detailing"].includes(kind)) {
      throw new Error("Project kind must be selector or detailing.");
    }
    return {
      schema: SCHEMA,
      version: VERSION,
      application: "Windpost + Baseplate Designer",
      createdAt: new Date().toISOString(),
      kind,
      metadata: clone(metadata || {}),
      data: clone(data || {})
    };
  }

  function validate(project) {
    if (!project || project.schema !== SCHEMA ||
        project.version !== VERSION ||
        !["selector", "detailing"].includes(project.kind) ||
        !project.data || typeof project.data !== "object" ||
        Array.isArray(project.data)) {
      return null;
    }
    return project;
  }

  function serialize(project) {
    const valid = validate(project);
    return valid ? JSON.stringify(valid, null, 2) : "";
  }

  function deserialize(text) {
    const source = String(text || "");
    if (!source || source.length > MAX_BYTES) return null;
    try {
      return validate(JSON.parse(source));
    } catch (error) {
      return null;
    }
  }

  function safeName(value) {
    return String(value || "windpost-project")
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "windpost-project";
  }

  function download(project, filename) {
    const text = serialize(project);
    if (!text || !global.document || !global.URL || !global.Blob) return false;
    const link = global.document.createElement("a");
    link.href = global.URL.createObjectURL(new global.Blob(
      [text],
      { type: "application/json;charset=utf-8" }
    ));
    link.download = `${safeName(filename)}.windpost.json`;
    global.document.body.appendChild(link);
    link.click();
    const url = link.href;
    link.remove();
    global.setTimeout(() => global.URL.revokeObjectURL(url), 0);
    return true;
  }

  async function readFile(file) {
    if (!file || finiteSize(file.size) > MAX_BYTES) return null;
    try {
      const text = typeof file.text === "function"
        ? await file.text()
        : await new Promise((resolve, reject) => {
            const reader = new global.FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
          });
      return deserialize(text);
    } catch (error) {
      return null;
    }
  }

  function finiteSize(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function storeDraft(project, storage) {
    const text = serialize(project);
    if (!text || !storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(DRAFT_KEY, text);
      return true;
    } catch (error) {
      return false;
    }
  }

  function restoreDraft(storage) {
    if (!storage || typeof storage.getItem !== "function") return null;
    try {
      return deserialize(storage.getItem(DRAFT_KEY));
    } catch (error) {
      return null;
    }
  }

  windpost.projectFileEngine = Object.freeze({
    SCHEMA,
    VERSION,
    MAX_BYTES,
    DRAFT_KEY,
    create,
    validate,
    serialize,
    deserialize,
    download,
    readFile,
    storeDraft,
    restoreDraft,
    safeName
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.projectFileEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
