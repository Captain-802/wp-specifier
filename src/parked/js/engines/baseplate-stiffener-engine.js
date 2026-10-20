(function (global) {
  "use strict";
  // Base + stiffener T-section (flange = plate B×tf, web = upstand tw×h):
  // elastic modulus, moment resistance, and the height (multiple of step) needed
  // to resist the full base moment.
  const windpost = global.Windpost = global.Windpost || {};

  function teeZ(B, tf, h, tw) {
    const Af = B * tf, yf = tf / 2, Aw = tw * h, yw = tf + h / 2, A = Af + Aw;
    const yb = (Af * yf + Aw * yw) / A;
    const I = (B * Math.pow(tf, 3) / 12 + Af * Math.pow(yb - yf, 2)) +
              (tw * Math.pow(h, 3) / 12 + Aw * Math.pow(yw - yb, 2));
    const H = tf + h, cmax = Math.max(yb, H - yb);
    return { Z: I / cmax, I, yb, H, cmax };
  }
  const teeMr = (B, tf, h, tw, fy, gM0) => teeZ(B, tf, h, tw).Z * fy / gM0;   // N·mm

  function height(B, tp, M_Nmm, tw, fy, gM0, step) {
    for (let h = step; h <= 600; h += step) {
      if (teeMr(B, tp, h, tw, fy, gM0) >= M_Nmm) return h;
    }
    return null;
  }

  windpost.baseplateStiffener = Object.freeze({ teeZ, teeMr, height });
  if (typeof module !== "undefined" && module.exports) module.exports = windpost.baseplateStiffener;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
