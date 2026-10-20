(function initialiseRenderSchedulerEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function create(task, requestedDelay_ms) {
    const delay_ms = Math.max(0, Number(requestedDelay_ms) || 0);
    let timer = null;
    let pending = false;

    const execute = () => {
      timer = null;
      if (!pending) return;
      pending = false;
      task();
    };

    return Object.freeze({
      schedule() {
        pending = true;
        if (timer !== null) global.clearTimeout(timer);
        timer = global.setTimeout(execute, delay_ms);
      },
      flush() {
        if (timer !== null) global.clearTimeout(timer);
        execute();
      },
      cancel() {
        if (timer !== null) global.clearTimeout(timer);
        timer = null;
        pending = false;
      },
      isPending() {
        return pending;
      }
    });
  }

  windpost.renderSchedulerEngine = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
