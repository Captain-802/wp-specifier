(function initialiseDesignDataEngine(global) {
  "use strict";

  // Editable design data, laid out like the workbook sheets:
  //
  //   Ties         one capacity per tie product (EDC25-100 ... EDC25-375,
  //                Shear Tie, EDC25-U Tie), as the Ties sheet lists them.
  //                A tie level is a chain wind -> outer leaf -> EDC tie ->
  //                post -> inner tie -> inner leaf, so the level capacity is
  //                the weaker of the two ties. A DU carries two ties per
  //                level; its capacity is counted per level, as the approved
  //                workbook does, so the catalogue figures reproduce exactly:
  //                U / DU 1.713 (governed by the U tie), L / I 2.250.
  //   Constants    the design assumptions (fy, E, secant curve, tie spacing).
  //   Bolts A      anchor capacities (family / anchor / SKU / shear / tension).
  //   Bolts C      bolt SKUs with the quantity under every connection code.
  //   Connections  the SKU each connection uses per bolt family.
  //
  // The catalogue never changes; edits live in an override store that the
  // engines read through. Edits persist in this browser (localStorage, when
  // available) and travel inside the project JSON, and every edited figure
  // is reported so a saved calculation is never mistaken for catalogue values.
  // Pure data engine: no DOM.

  const windpost = global.Windpost = global.Windpost || {};
  const VERSION = 1;
  const STORAGE_KEY = "windpost.designData.v1";

  const config = windpost.config || {};
  const P = (windpost.parameters && windpost.parameters.design) || {};
  const DB = windpost.connectionsDatabase || { connections: [], anchors: [], boltSkus: [] };
  const FAMILY_STRENGTH = config.DEFAULT_TIE_STRENGTH_KN || { U: 1.713, L: 2.25, DU: 1.713, I: 2.25 };

  const BOLT_FAMILIES = Object.freeze(["Stainless Steel Bolts", "RGM BOLTS", "FAZ II BOLTS", "FAZ II PLUS BOLTS"]);
  const ANCHOR_FAMILIES = Object.freeze(["RGM", "FAZ II", "FAZ II PLUS"]);

  // ---- catalogue ------------------------------------------------------------

  // Outer ties: the selection engine's list when loaded, else the Ties sheet.
  const TIES_SHEET = Object.freeze([
    [100, 108], [125, 133], [150, 158], [175, 183], [200, 208], [225, 233],
    [250, 258], [275, 283], [300, 308], [325, 333], [350, 358], [375, 383]
  ]);

  function outerTieList() {
    const engine = windpost.outerTieSelectionEngine;
    if (engine && Array.isArray(engine.TIE_LIST) && engine.TIE_LIST.length) {
      return engine.TIE_LIST.map(t => ({ name: t.name, nominal_mm: t.nominal_mm, actual_mm: t.actual_mm }));
    }
    return TIES_SHEET.map(([nominal, actual]) => ({ name: `EDC25-${nominal}`, nominal_mm: nominal, actual_mm: actual }));
  }

  // The catalogue tie rows. Capacities: the EDC (outer) ties carry the
  // stronger family figure, the U tie the U figure and the shear tie the L
  // figure, so min(inner, outer) gives the published level strengths.
  const OUTER_DEFAULT_KN = Math.max(Number(FAMILY_STRENGTH.U) || 0, Number(FAMILY_STRENGTH.L) || 0);
  const INNER_TIES = Object.freeze([
    { name: "U tie", label: "EDC25-U Tie", kind: "inner", posts: "U, DU", nominal_mm: null, actual_mm: 84, width_mm: 21, thickness_mm: 1.2, catalogue_kN: Number(FAMILY_STRENGTH.U) },
    { name: "Shear tie", label: "Shear Tie", kind: "inner", posts: "L, I", nominal_mm: null, actual_mm: 240, width_mm: 21, thickness_mm: 1.2, catalogue_kN: Number(FAMILY_STRENGTH.L) }
  ]);

  function catalogueTies() {
    const outer = outerTieList().map(t => ({
      name: t.name, label: t.name, kind: "outer", posts: "U, L, DU",
      nominal_mm: t.nominal_mm, actual_mm: t.actual_mm, width_mm: 21,
      thickness_mm: t.nominal_mm >= 325 ? 1.5 : 1.2, catalogue_kN: OUTER_DEFAULT_KN
    }));
    return outer.concat(INNER_TIES.map(t => ({ ...t })));
  }

  const DESIGN_SPEC = Object.freeze([
    { key: "fy", label: "Allowable stress", hint: "fy in bending = 210 / 1.1 / 1.5", unit: "N/mm²", decimals: 2, min: 1, max: 2000, value: P.fy ?? 127.27 },
    { key: "e", label: "Initial E", hint: "Young's modulus", unit: "kN/mm²", decimals: 0, min: 1, max: 1000, value: P.e ?? 200 },
    { key: "secantFy", label: "Secant fy", hint: "Ramberg-Osgood 0.2 % proof stress", unit: "N/mm²", decimals: 2, min: 1, max: 2000, value: P.secantFy ?? 210 },
    { key: "secantN", label: "Secant exponent", hint: "Ramberg-Osgood n", unit: "", decimals: 2, min: 1, max: 100, value: P.secantN ?? 7 },
    { key: "firstTieSpacing", label: "First tie spacing", hint: "base to first tie", unit: "mm", decimals: 0, min: 1, max: 5000, value: P.firstTieSpacing ?? 225 },
    { key: "standardTieSpacing", label: "Standard tie spacing", hint: "tie to tie", unit: "mm", decimals: 0, min: 1, max: 5000, value: P.standardTieSpacing ?? 225 },
    { key: "apply10mmLimit", label: "10 mm deflection cap", hint: "cap the deflection limit at 10 mm", type: "boolean", value: false }
  ]);

  function catalogueAnchors() {
    return (DB.anchors || []).map(a => ({ family: a.family, name: a.name, sku: a.sku, shear: Number(a.shear), tension: Number(a.tension) }));
  }

  function catalogueBoltSkus() {
    return (DB.boltSkus || []).map(r => ({ sku: r.sku, description: r.description || "", counts: { ...(r.counts || {}) } }));
  }

  // Connection codes in the workbook's column order: every code that carries
  // a quantity, then any connection the library adds.
  function boltCodes() {
    const seen = [];
    const add = code => { if (code && !seen.includes(code)) seen.push(code); };
    (DB.boltSkus || []).forEach(r => Object.keys(r.counts || {}).forEach(add));
    (DB.connections || []).forEach(c => add(c.code));
    return seen;
  }

  // ---- override store -------------------------------------------------------

  const empty = () => ({
    version: VERSION,
    ties: {}, design: {},
    anchors: {}, anchorsAdded: [], anchorsRemoved: [],
    boltSkus: {}, boltSkusAdded: [], boltSkusRemoved: [],
    connectionBolts: {}
  });

  let store = empty();
  let storage = null;
  const listeners = new Set();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function notify() {
    if (storage) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (error) { /* storage blocked */ }
    }
    listeners.forEach(fn => { try { fn(); } catch (error) { /* listener error */ } });
  }

  // ---- ties -----------------------------------------------------------------

  function tieRows() {
    return catalogueTies().map(row => {
      const edited = Object.prototype.hasOwnProperty.call(store.ties, row.name);
      return { ...row, capacity_kN: edited ? store.ties[row.name] : row.catalogue_kN, edited };
    });
  }

  function tieCapacity(name) {
    if (Object.prototype.hasOwnProperty.call(store.ties, name)) return store.ties[name];
    const row = catalogueTies().find(t => t.name === name);
    return row ? row.catalogue_kN : null;
  }

  function setTieCapacity(name, value) {
    const row = catalogueTies().find(t => t.name === name);
    if (!row) return false;
    const n = finite(value);
    if (n === null || n < 0 || n > 1000) return false;
    if (Math.abs(n - row.catalogue_kN) < 1e-12) delete store.ties[name];
    else store.ties[name] = n;
    notify();
    return true;
  }

  function innerTieName(type) {
    return type === "L" || type === "I" ? "Shear tie" : "U tie";
  }

  // The level capacity for a post: the weaker of its inner tie and the
  // outer tie the wall selected. Counted per level for every family (a DU's
  // second tie is shown on the schedule, not added to the capacity), as the
  // approved workbook does.
  function levelCapacity(type, innerTie, outerTie) {
    const inner = tieCapacity(innerTieName(type));
    if (type === "I" || !outerTie || outerTie === "None") return inner;
    const outer = tieCapacity(outerTie);
    return outer === null ? inner : Math.min(inner, outer);
  }

  // Without a wall (no outer tie known yet): the catalogue level strength.
  function familyCapacity(type) {
    const inner = tieCapacity(innerTieName(type));
    if (type === "I") return inner;
    const outers = tieRows().filter(t => t.kind === "outer").map(t => t.capacity_kN);
    return outers.length ? Math.min(inner, Math.max(...outers)) : inner;
  }

  // ---- design assumptions ---------------------------------------------------

  function designSpec() {
    return DESIGN_SPEC.map(d => {
      const edited = Object.prototype.hasOwnProperty.call(store.design, d.key);
      return { ...d, catalogue: d.value, current: edited ? store.design[d.key] : d.value, edited };
    });
  }

  function designValues() {
    const out = {};
    DESIGN_SPEC.forEach(d => {
      out[d.key] = Object.prototype.hasOwnProperty.call(store.design, d.key) ? store.design[d.key] : d.value;
    });
    return out;
  }

  function setDesign(key, value) {
    const spec = DESIGN_SPEC.find(d => d.key === key);
    if (!spec) return false;
    let v;
    if (spec.type === "boolean") v = Boolean(value);
    else {
      v = finite(value);
      if (v === null || v < spec.min || v > spec.max) return false;
    }
    if (v === spec.value) delete store.design[key];
    else store.design[key] = v;
    notify();
    return true;
  }

  // ---- anchors --------------------------------------------------------------

  function anchors() {
    const rows = catalogueAnchors()
      .filter(a => !store.anchorsRemoved.includes(a.sku))
      .map(a => {
        const o = store.anchors[a.sku];
        return { ...a, catalogue: { shear: a.shear, tension: a.tension },
          shear: o && o.shear != null ? o.shear : a.shear,
          tension: o && o.tension != null ? o.tension : a.tension,
          edited: Boolean(o), added: false };
      });
    store.anchorsAdded.forEach(a => rows.push({ ...clone(a), catalogue: null, edited: true, added: true }));
    return rows;
  }

  function setAnchor(sku, values) {
    const added = store.anchorsAdded.find(a => a.sku === sku);
    const target = added || catalogueAnchors().find(a => a.sku === sku);
    if (!target) return false;
    const shear = values.shear == null ? null : finite(values.shear);
    const tension = values.tension == null ? null : finite(values.tension);
    if ((values.shear != null && (shear === null || shear < 0)) || (values.tension != null && (tension === null || tension < 0))) return false;
    if (added) {
      if (shear !== null) added.shear = shear;
      if (tension !== null) added.tension = tension;
    } else {
      const o = { ...(store.anchors[sku] || {}) };
      if (shear !== null) o.shear = shear;
      if (tension !== null) o.tension = tension;
      if (o.shear === target.shear) delete o.shear;
      if (o.tension === target.tension) delete o.tension;
      if (Object.keys(o).length) store.anchors[sku] = o; else delete store.anchors[sku];
    }
    notify();
    return true;
  }

  function addAnchor(row) {
    const sku = String(row && row.sku || "").trim();
    const family = String(row && row.family || "").trim();
    const shear = finite(row && row.shear), tension = finite(row && row.tension);
    if (!sku || !ANCHOR_FAMILIES.includes(family) || shear === null || tension === null || shear < 0 || tension < 0) return false;
    if (anchors().some(a => a.sku === sku)) return false;
    const removedIndex = store.anchorsRemoved.indexOf(sku);
    if (removedIndex >= 0) store.anchorsRemoved.splice(removedIndex, 1);
    store.anchorsAdded.push({ family, name: String(row.name || sku).trim(), sku, shear, tension });
    notify();
    return true;
  }

  function removeAnchor(sku) {
    const addedIndex = store.anchorsAdded.findIndex(a => a.sku === sku);
    if (addedIndex >= 0) store.anchorsAdded.splice(addedIndex, 1);
    else if (catalogueAnchors().some(a => a.sku === sku)) {
      if (!store.anchorsRemoved.includes(sku)) store.anchorsRemoved.push(sku);
      delete store.anchors[sku];
    } else return false;
    notify();
    return true;
  }

  // ---- bolt SKUs and quantities --------------------------------------------

  function boltSkus() {
    const rows = catalogueBoltSkus()
      .filter(r => !store.boltSkusRemoved.includes(r.sku))
      .map(r => {
        const o = store.boltSkus[r.sku];
        const counts = { ...r.counts, ...((o && o.counts) || {}) };
        return { sku: r.sku, description: o && o.description != null ? o.description : r.description,
          counts, catalogue: { description: r.description, counts: r.counts },
          edited: Boolean(o), added: false };
      });
    store.boltSkusAdded.forEach(r => rows.push({ ...clone(r), catalogue: null, edited: true, added: true }));
    return rows;
  }

  function boltSku(sku) {
    return boltSkus().find(r => r.sku === sku) || null;
  }

  function setBoltSku(sku, values) {
    const added = store.boltSkusAdded.find(r => r.sku === sku);
    const base = added || catalogueBoltSkus().find(r => r.sku === sku);
    if (!base) return false;
    if (added) {
      if (values.description != null) added.description = String(values.description);
      if (values.counts) Object.keys(values.counts).forEach(code => {
        const n = finite(values.counts[code]);
        if (n !== null && n >= 0) added.counts[code] = Math.round(n);
      });
    } else {
      const o = store.boltSkus[sku] ? clone(store.boltSkus[sku]) : { counts: {} };
      if (values.description != null) {
        if (String(values.description) === base.description) delete o.description;
        else o.description = String(values.description);
      }
      if (values.counts) Object.keys(values.counts).forEach(code => {
        const n = finite(values.counts[code]);
        if (n === null || n < 0) return;
        const rounded = Math.round(n);
        if (rounded === (Number(base.counts[code]) || 0)) delete o.counts[code];
        else o.counts[code] = rounded;
      });
      if (o.description == null && !Object.keys(o.counts).length) delete store.boltSkus[sku];
      else store.boltSkus[sku] = o;
    }
    notify();
    return true;
  }

  function addBoltSku(row) {
    const sku = String(row && row.sku || "").trim();
    if (!sku || boltSkus().some(r => r.sku === sku)) return false;
    const removedIndex = store.boltSkusRemoved.indexOf(sku);
    if (removedIndex >= 0) store.boltSkusRemoved.splice(removedIndex, 1);
    const counts = {};
    Object.keys((row && row.counts) || {}).forEach(code => {
      const n = finite(row.counts[code]);
      if (n !== null && n >= 0) counts[code] = Math.round(n);
    });
    store.boltSkusAdded.push({ sku, description: String(row && row.description || ""), counts });
    notify();
    return true;
  }

  function removeBoltSku(sku) {
    const addedIndex = store.boltSkusAdded.findIndex(r => r.sku === sku);
    if (addedIndex >= 0) store.boltSkusAdded.splice(addedIndex, 1);
    else if (catalogueBoltSkus().some(r => r.sku === sku)) {
      if (!store.boltSkusRemoved.includes(sku)) store.boltSkusRemoved.push(sku);
      delete store.boltSkus[sku];
    } else return false;
    notify();
    return true;
  }

  // ---- the bolt each connection uses ----------------------------------------

  function connectionBoltRows() {
    return (DB.connections || []).map(c => {
      const o = store.connectionBolts[c.code] || {};
      const bolts = {};
      BOLT_FAMILIES.forEach(f => { bolts[f] = f in o ? o[f] : ((c.bolts && c.bolts[f]) || "N/A"); });
      return { code: c.code, description: c.description, family: c.family, position: c.position,
        materialClass: c.materialClass, postBolt: c.postBolt, anchorRole: c.anchorRole || "",
        bolts, catalogue: { ...(c.bolts || {}) }, edited: Object.keys(o).length > 0 };
    });
  }

  function connectionBolt(code, family) {
    const o = store.connectionBolts[code];
    if (o && family in o) return o[family];
    const c = (DB.connections || []).find(x => x.code === code);
    return c && c.bolts ? (c.bolts[family] || "N/A") : "N/A";
  }

  function setConnectionBolt(code, family, sku) {
    const c = (DB.connections || []).find(x => x.code === code);
    if (!c || !BOLT_FAMILIES.includes(family)) return false;
    const value = String(sku || "N/A").trim() || "N/A";
    const catalogueValue = (c.bolts && c.bolts[family]) || "N/A";
    const o = { ...(store.connectionBolts[code] || {}) };
    if (value === catalogueValue) delete o[family]; else o[family] = value;
    if (Object.keys(o).length) store.connectionBolts[code] = o; else delete store.connectionBolts[code];
    notify();
    return true;
  }

  // ---- summary, persistence -------------------------------------------------

  function edits() {
    const lines = [];
    const fmt = (v, d = 3) => Number(v).toFixed(d);
    tieRows().filter(t => t.edited).forEach(t => lines.push(`${t.label} capacity ${fmt(t.catalogue_kN)} -> ${fmt(t.capacity_kN)} kN`));
    designSpec().filter(d => d.edited).forEach(d => lines.push(`${d.label} ${d.type === "boolean" ? (d.catalogue ? "on" : "off") : fmt(d.catalogue, d.decimals)} -> ${d.type === "boolean" ? (d.current ? "on" : "off") : fmt(d.current, d.decimals)}${d.unit ? " " + d.unit : ""}`));
    anchors().forEach(a => {
      if (a.added) lines.push(`Anchor ${a.name} (${a.sku}) added: shear ${fmt(a.shear, 1)}, tension ${fmt(a.tension, 1)} kN`);
      else if (a.edited) lines.push(`Anchor ${a.name} shear ${fmt(a.catalogue.shear, 1)} -> ${fmt(a.shear, 1)}, tension ${fmt(a.catalogue.tension, 1)} -> ${fmt(a.tension, 1)} kN`);
    });
    store.anchorsRemoved.forEach(sku => lines.push(`Anchor ${sku} removed`));
    boltSkus().forEach(r => {
      if (r.added) lines.push(`Bolt ${r.sku} added${Object.keys(r.counts).length ? " (" + Object.keys(r.counts).filter(c => r.counts[c] > 0).map(c => `${c}: ${r.counts[c]}`).join(", ") + ")" : ""}`);
      else if (r.edited) {
        const o = store.boltSkus[r.sku] || {};
        if (o.description != null) lines.push(`Bolt ${r.sku} description edited`);
        Object.keys(o.counts || {}).forEach(code => lines.push(`Bolt ${r.sku} quantity under ${code} ${Number(r.catalogue.counts[code]) || 0} -> ${o.counts[code]}`));
      }
    });
    store.boltSkusRemoved.forEach(sku => lines.push(`Bolt ${sku} removed`));
    Object.keys(store.connectionBolts).forEach(code => {
      Object.keys(store.connectionBolts[code]).forEach(family => {
        const c = (DB.connections || []).find(x => x.code === code);
        lines.push(`${code} ${family}: ${(c && c.bolts && c.bolts[family]) || "N/A"} -> ${store.connectionBolts[code][family]}`);
      });
    });
    return {
      count: lines.length,
      lines,
      byArea: {
        ties: Object.keys(store.ties).length,
        design: Object.keys(store.design).length,
        anchors: Object.keys(store.anchors).length + store.anchorsAdded.length + store.anchorsRemoved.length,
        boltSkus: Object.keys(store.boltSkus).length + store.boltSkusAdded.length + store.boltSkusRemoved.length,
        connectionBolts: Object.keys(store.connectionBolts).length
      }
    };
  }

  function reset(area) {
    const fresh = empty();
    if (!area) store = fresh;
    else if (area === "ties") store.ties = {};
    else if (area === "design") store.design = {};
    else if (area === "anchors") { store.anchors = {}; store.anchorsAdded = []; store.anchorsRemoved = []; }
    else if (area === "boltSkus") { store.boltSkus = {}; store.boltSkusAdded = []; store.boltSkusRemoved = []; }
    else if (area === "connectionBolts") store.connectionBolts = {};
    else return false;
    notify();
    return true;
  }

  function serialize() {
    return clone(store);
  }

  // Accepts a serialized store (or null to clear). Unknown keys and bad
  // values are dropped, so a hand-edited file cannot break the engines.
  function restore(value) {
    const fresh = empty();
    if (value && typeof value === "object") {
      const src = value;
      const ties = catalogueTies();
      Object.keys(src.ties || {}).forEach(name => {
        const n = finite(src.ties[name]);
        if (ties.some(t => t.name === name) && n !== null && n >= 0) fresh.ties[name] = n;
      });
      Object.keys(src.design || {}).forEach(key => {
        const spec = DESIGN_SPEC.find(d => d.key === key);
        if (!spec) return;
        if (spec.type === "boolean") fresh.design[key] = Boolean(src.design[key]);
        else { const n = finite(src.design[key]); if (n !== null && n >= spec.min && n <= spec.max) fresh.design[key] = n; }
      });
      Object.keys(src.anchors || {}).forEach(sku => {
        const o = src.anchors[sku] || {}; const out = {};
        if (finite(o.shear) !== null) out.shear = finite(o.shear);
        if (finite(o.tension) !== null) out.tension = finite(o.tension);
        if (Object.keys(out).length) fresh.anchors[sku] = out;
      });
      (src.anchorsAdded || []).forEach(a => {
        if (a && a.sku && ANCHOR_FAMILIES.includes(a.family) && finite(a.shear) !== null && finite(a.tension) !== null) {
          fresh.anchorsAdded.push({ family: a.family, name: String(a.name || a.sku), sku: String(a.sku), shear: finite(a.shear), tension: finite(a.tension) });
        }
      });
      (src.anchorsRemoved || []).forEach(sku => { if (typeof sku === "string") fresh.anchorsRemoved.push(sku); });
      Object.keys(src.boltSkus || {}).forEach(sku => {
        const o = src.boltSkus[sku] || {}; const out = { counts: {} };
        if (o.description != null) out.description = String(o.description);
        Object.keys(o.counts || {}).forEach(code => { const n = finite(o.counts[code]); if (n !== null && n >= 0) out.counts[code] = Math.round(n); });
        if (out.description != null || Object.keys(out.counts).length) fresh.boltSkus[sku] = out;
      });
      (src.boltSkusAdded || []).forEach(r => {
        if (!r || !r.sku) return;
        const counts = {};
        Object.keys(r.counts || {}).forEach(code => { const n = finite(r.counts[code]); if (n !== null && n >= 0) counts[code] = Math.round(n); });
        fresh.boltSkusAdded.push({ sku: String(r.sku), description: String(r.description || ""), counts });
      });
      (src.boltSkusRemoved || []).forEach(sku => { if (typeof sku === "string") fresh.boltSkusRemoved.push(sku); });
      Object.keys(src.connectionBolts || {}).forEach(code => {
        const o = src.connectionBolts[code] || {}; const out = {};
        BOLT_FAMILIES.forEach(f => { if (typeof o[f] === "string" && o[f].trim()) out[f] = o[f].trim(); });
        if (Object.keys(out).length) fresh.connectionBolts[code] = out;
      });
    }
    store = fresh;
    notify();
    return true;
  }

  // Bind a Storage (localStorage): reads any saved edits now, writes on
  // every change. Missing or blocked storage is fine.
  function load(target) {
    storage = target && typeof target.getItem === "function" ? target : null;
    if (!storage) return false;
    try {
      const text = storage.getItem(STORAGE_KEY);
      if (!text) return false;
      const parsed = JSON.parse(text);
      const saved = storage;
      storage = null;              // restore() must not write back while loading
      restore(parsed);
      storage = saved;
      return true;
    } catch (error) {
      return false;
    }
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  windpost.designData = Object.freeze({
    VERSION, STORAGE_KEY, BOLT_FAMILIES, ANCHOR_FAMILIES,
    tieRows, tieCapacity, setTieCapacity, innerTieName, levelCapacity, familyCapacity,
    designSpec, designValues, setDesign,
    anchors, setAnchor, addAnchor, removeAnchor,
    boltSkus, boltSku, setBoltSku, addBoltSku, removeBoltSku, boltCodes,
    connectionBoltRows, connectionBolt, setConnectionBolt,
    edits, reset, serialize, restore, load, subscribe
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.designData;
  }
})(typeof window !== "undefined" ? window : globalThis);
