(function initialisePrintCalibrationPage(global) {
  "use strict";

  const windpost = global.Windpost;

  function download() {
    const svg = windpost.printCalibrationService.sheet();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "windpost-a4-print-calibration.svg";
    document.body.appendChild(link);
    link.click();
    const url = link.href;
    link.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // The page opens in its own tab from the Detailing page, so "Back" closes
  // the tab (or steps back) rather than loading a fresh Detailing page that
  // would show the default design instead of the handed-over one.
  function bindBackLink() {
    const back = document.querySelector(".calibration-actions a");
    if (!back) return;
    if (/Windpost-PrintCalibration-Full\.html$/i.test(
      decodeURIComponent((global.location && global.location.pathname) || ""))) {
      back.href = "./Windpost-Detailing-Full.html";
    }
    back.addEventListener("click", event => {
      event.preventDefault();
      if (global.history.length > 1) {
        global.history.back();
        return;
      }
      global.close();
      global.setTimeout(() => {
        if (!global.closed) global.location.href = back.getAttribute("href");
      }, 300);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindBackLink();
    document.getElementById("calibration-sheet").innerHTML =
      windpost.printCalibrationService.sheet();
    document.getElementById("print-calibration").addEventListener(
      "click", () => global.print()
    );
    document.getElementById("download-calibration").addEventListener(
      "click", download
    );
  });
})(typeof window !== "undefined" ? window : globalThis);
