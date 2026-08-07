(function initialiseSafeExecutionEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};
  let lastError = null;

  function record(scope, error) {
    lastError = Object.freeze({
      scope: String(scope || "application"),
      message: error && error.message ? error.message : String(error),
      time: new Date().toISOString()
    });
    if (global.console && typeof global.console.error === "function") {
      global.console.error(`[${lastError.scope}]`, error);
    }
    return lastError;
  }

  function run(scope, task, fallback) {
    try {
      return task();
    } catch (error) {
      record(scope, error);
      return fallback;
    }
  }

  function last() {
    return lastError;
  }

  if (typeof global.addEventListener === "function") {
    global.addEventListener("error", event => {
      if (event && event.error) record("unhandled error", event.error);
    });
    global.addEventListener("unhandledrejection", event => {
      record("unhandled promise rejection", event && event.reason);
    });
  }

  windpost.safeExecutionEngine = Object.freeze({ run, record, last });
})(typeof window !== "undefined" ? window : globalThis);
