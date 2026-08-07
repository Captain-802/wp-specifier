(function initialisePrintCalibrationService(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function sheet() {
    const weights = [.13, .18, .25, .35, .5, .7];
    const samples = weights.map((weight, index) => {
      const y = 170 + index * 10;
      return `<line x1="24" y1="${y}" x2="130" y2="${y}" `
        + `stroke="#000" stroke-width="${weight}"/>`
        + `<text x="137" y="${y + 1}" font-size="3.2">${weight} mm</text>`;
    }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" `
      + `viewBox="0 0 210 297" role="img" data-print-calibration="v1" `
      + `font-family="Arial,Helvetica,sans-serif">`
      + `<defs><pattern id="cal-hatch" width="6" height="6" `
      + `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
      + `<line x1="0" y1="0" x2="0" y2="6" stroke="#777" stroke-width=".25"/>`
      + `</pattern></defs>`
      + `<rect width="210" height="297" fill="#fff"/>`
      + `<rect x="4" y="4" width="202" height="289" fill="none" `
      + `stroke="#000" stroke-width=".35"/>`
      + `<text x="15" y="17" font-size="5" font-weight="700">`
      + `WINDPOST PRINT CALIBRATION — A4 PORTRAIT</text>`
      + `<text x="15" y="24" font-size="3.2">Print at 100% / Actual size. `
      + `Disable “Fit to page”.</text>`
      + `<rect x="20" y="34" width="100" height="100" fill="none" `
      + `stroke="#000" stroke-width=".35" data-calibration-square-mm="100"/>`
      + `<line x1="20" y1="84" x2="120" y2="84" stroke="#777" `
      + `stroke-width=".18" stroke-dasharray="3 2"/>`
      + `<line x1="70" y1="34" x2="70" y2="134" stroke="#777" `
      + `stroke-width=".18" stroke-dasharray="3 2"/>`
      + `<text x="70" y="141" text-anchor="middle" font-size="3.5" `
      + `font-weight="700">100 × 100 mm CHECK SQUARE</text>`
      + `<rect x="137" y="34" width="48" height="48" fill="url(#cal-hatch)" `
      + `stroke="#000" stroke-width=".25"/>`
      + `<text x="161" y="89" text-anchor="middle" font-size="3.2">`
      + `0.25 mm CAD hatch</text>`
      + `<text x="20" y="158" font-size="4" font-weight="700">LINEWEIGHT TEST</text>`
      + samples
      + `<text x="20" y="240" font-size="2.4">2.4 mm text — minor annotations</text>`
      + `<text x="20" y="248" font-size="3.2">3.2 mm text — drawing annotations</text>`
      + `<text x="20" y="258" font-size="4.5" font-weight="700">`
      + `4.5 mm text — production headings</text>`
      + `<text x="20" y="276" font-size="3.1">Measured square: ______ mm × ______ mm</text>`
      + `<text x="20" y="283" font-size="3.1">Printer / settings: __________________________</text>`
      + `</svg>`;
  }

  windpost.printCalibrationService = Object.freeze({ sheet });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.printCalibrationService;
  }
})(typeof window !== "undefined" ? window : globalThis);
