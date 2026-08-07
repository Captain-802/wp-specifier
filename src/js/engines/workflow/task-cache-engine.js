(function initialiseTaskCacheEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function create(requestedLimit) {
    const limit = Math.max(1, Math.round(Number(requestedLimit) || 8));
    const entries = new Map();

    return Object.freeze({
      get(key) {
        if (!entries.has(key)) return null;
        const value = entries.get(key);
        entries.delete(key);
        entries.set(key, value);
        return value;
      },
      set(key, value) {
        if (entries.has(key)) entries.delete(key);
        entries.set(key, value);
        while (entries.size > limit) {
          entries.delete(entries.keys().next().value);
        }
        return value;
      },
      clear() {
        entries.clear();
      },
      size() {
        return entries.size;
      }
    });
  }

  windpost.taskCacheEngine = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
