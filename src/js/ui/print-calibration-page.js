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

  document.addEventListener("DOMContentLoaded", () => {
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
