"use strict";

// Cold-formed U / L section property calculator (build-tool copy).
//
// This is a faithful CommonJS port of the browser engine
//   js/engines/custom-section-properties-engine.js
// used by the manual Windpost Calculator. It has been verified to reproduce
// every value in the current U and L section databases to < 5e-7 (i.e. exact
// to the 6 decimal places the databases are stored at).
//
// Inputs are the outer dimensions a (height), b (width), t (thickness) and the
// INNER fold radius r. Rounded corners are the standard manufactured form;
// sharpEdges = true models zero-radius square corners.
//
// Returns { valid, area, ixx, zxx, ybar, zTop, zBottom } in mm units, OR
// { valid:false, error } when the geometry is impossible.

function invalidResult(error) {
  return { valid: false, error, area: 0, ixx: 0, zxx: 0, ybar: 0, zTop: 0, zBottom: 0 };
}

function calculateGeometrySection(shape, aInput, bInput, tInput, rInput, sharpEdges) {
  const a = parseFloat(aInput);
  const b = parseFloat(bInput);
  const t = parseFloat(tInput);
  const r = parseFloat(rInput) || 0;

  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(t) || !Number.isFinite(r) ||
      a <= 0 || b <= 0 || t <= 0 || r < 0) {
    return invalidResult("Invalid geometry.");
  }

  if (shape === "U") {
    if (sharpEdges) {
      if (a <= 2 * t || b <= t) return invalidResult("Invalid sharp U-section geometry.");
      const Aw = a * t; const yw = a / 2; const Ixw = t * Math.pow(a, 3) / 12;
      const wf = b - t; const Af = wf * t; const yTop = a - t / 2; const yBottom = t / 2; const Ixf = wf * Math.pow(t, 3) / 12;
      const area = Aw + 2 * Af; const ybar = a / 2;
      const ixx = Ixw + Aw * Math.pow(yw - ybar, 2) + Ixf + Af * Math.pow(yTop - ybar, 2) + Ixf + Af * Math.pow(yBottom - ybar, 2);
      const zTop = ixx / (a - ybar); const zBottom = ixx / ybar;
      return { valid: true, area, ixx, zxx: Math.min(zTop, zBottom), ybar, zTop, zBottom };
    }
    const R = r + t;
    if (2 * R >= a || b <= R) return invalidResult("Invalid rounded U-section geometry.");
    const hw = a - 2 * R; const Aw = hw * t; const yw = a / 2; const Ixw = t * Math.pow(hw, 3) / 12;
    const wf = b - R; const Af = wf * t; const yTop = a - t / 2; const yBottom = t / 2; const Ixf = wf * Math.pow(t, 3) / 12;
    const Ac = (Math.PI / 4) * (Math.pow(R, 2) - Math.pow(r, 2));
    const rbar = (4 / (3 * Math.PI)) * (Math.pow(R, 3) - Math.pow(r, 3)) / (Math.pow(R, 2) - Math.pow(r, 2));
    const Ibase = (Math.PI / 16) * (Math.pow(R, 4) - Math.pow(r, 4)); const Ic = Ibase - Ac * Math.pow(rbar, 2);
    const ycBottom = R - rbar; const ycTop = a - ycBottom;
    const area = Aw + 2 * Af + 2 * Ac; const ybar = a / 2;
    const ixx = Ixw + Aw * Math.pow(yw - ybar, 2) + Ixf + Af * Math.pow(yTop - ybar, 2) + Ixf + Af * Math.pow(yBottom - ybar, 2) + Ic + Ac * Math.pow(ycTop - ybar, 2) + Ic + Ac * Math.pow(ycBottom - ybar, 2);
    const zTop = ixx / (a - ybar); const zBottom = ixx / ybar;
    return { valid: true, area, ixx, zxx: Math.min(zTop, zBottom), ybar, zTop, zBottom };
  }

  if (shape === "L") {
    if (sharpEdges) {
      if (a <= t || b <= t) return invalidResult("Invalid sharp L-section geometry.");
      const Av = a * t; const yv = a / 2; const Ixv = t * Math.pow(a, 3) / 12;
      const wh = b - t; const Ah = wh * t; const yh = t / 2; const Ixh = wh * Math.pow(t, 3) / 12;
      const area = Av + Ah; const ybar = (Av * yv + Ah * yh) / area;
      const ixx = Ixv + Av * Math.pow(yv - ybar, 2) + Ixh + Ah * Math.pow(yh - ybar, 2);
      const zTop = ixx / (a - ybar); const zBottom = ixx / ybar;
      return { valid: true, area, ixx, zxx: Math.min(zTop, zBottom), ybar, zTop, zBottom };
    }
    const R = r + t;
    if (a <= R || b <= R) return invalidResult("Invalid rounded L-section geometry.");
    const hv = a - R; const Av = hv * t; const yv = R + hv / 2; const Ixv = t * Math.pow(hv, 3) / 12;
    const wh = b - R; const Ah = wh * t; const yh = t / 2; const Ixh = wh * Math.pow(t, 3) / 12;
    const Ac = (Math.PI / 4) * (Math.pow(R, 2) - Math.pow(r, 2));
    const rbar = (4 / (3 * Math.PI)) * (Math.pow(R, 3) - Math.pow(r, 3)) / (Math.pow(R, 2) - Math.pow(r, 2));
    const Ibase = (Math.PI / 16) * (Math.pow(R, 4) - Math.pow(r, 4)); const Ic = Ibase - Ac * Math.pow(rbar, 2);
    const yc = R - rbar;
    const area = Av + Ah + Ac; const ybar = (Av * yv + Ah * yh + Ac * yc) / area;
    const ixx = Ixv + Av * Math.pow(yv - ybar, 2) + Ixh + Ah * Math.pow(yh - ybar, 2) + Ic + Ac * Math.pow(yc - ybar, 2);
    const zTop = ixx / (a - ybar); const zBottom = ixx / ybar;
    return { valid: true, area, ixx, zxx: Math.min(zTop, zBottom), ybar, zTop, zBottom };
  }

  return invalidResult("Unsupported section type.");
}

module.exports = { calculateGeometrySection };
