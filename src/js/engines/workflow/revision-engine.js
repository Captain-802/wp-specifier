(function initialiseRevisionEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  const MAX_HISTORY = 8;

  function clean(value, maximum) {
    return String(value || "").trim().slice(0, maximum || 64);
  }

  function entry(value) {
    const source = value || {};
    return {
      revision: clean(source.revision || "P1", 12),
      issue: clean(source.issue || "FIRST ISSUE", 48),
      date: clean(source.date, 16),
      by: clean(source.by, 24)
    };
  }

  function validate(value) {
    const item = entry(value);
    return item.revision && item.date ? item : null;
  }

  function record(history, value) {
    const item = validate(value);
    if (!item) return Array.isArray(history) ? history.slice() : [];
    const previous = Array.isArray(history) ? history.slice() : [];
    const filtered = previous.filter(existing =>
      existing.revision !== item.revision);
    return [...filtered, item].slice(-MAX_HISTORY);
  }

  function latest(history, fallback) {
    const values = Array.isArray(history) ? history : [];
    return values.length ? values[values.length - 1] : entry(fallback);
  }

  windpost.revisionEngine = Object.freeze({
    MAX_HISTORY,
    entry,
    validate,
    record,
    latest
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.revisionEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
