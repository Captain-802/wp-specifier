(function initialiseDesignDataEditor(global) {
  "use strict";

  // The design-data editor: the workbook's Ties, Constants, Bolts (anchors +
  // SKU quantities) and Connections (bolt per family) tables, editable in
  // place. Talks only to windpost.designData; the page re-runs the
  // selection through onChange. No inline handlers (CSP-safe).

  const windpost = global.Windpost = global.Windpost || {};

  const TABS = Object.freeze([
    { key: "ties", label: "Ties", area: "ties" },
    { key: "design", label: "Design constants", area: "design" },
    { key: "anchors", label: "Anchors", area: "anchors" },
    { key: "boltSkus", label: "Bolt SKUs & quantities", area: "boltSkus" },
    { key: "connectionBolts", label: "Connection bolts", area: "connectionBolts" }
  ]);

  const escape = value => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const num = (value, decimals) => Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : "";

  function mount(host, options) {
    const data = windpost.designData;
    if (!host || !data) return null;
    const onChange = options && typeof options.onChange === "function" ? options.onChange : () => {};
    let active = "ties";
    let notice = "";

    function tiesPanel() {
      const rows = data.tieRows();
      const line = t => `<tr class="${t.edited ? "is-edited" : ""}">
        <td class="dd-name">${escape(t.label)}</td>
        <td>${escape(t.posts)}</td>
        <td class="num">${t.nominal_mm == null ? "—" : escape(t.nominal_mm)}</td>
        <td class="num">${escape(t.actual_mm)}</td>
        <td class="num">${escape(t.width_mm)}</td>
        <td class="num">${escape(t.thickness_mm)}</td>
        <td class="num"><input type="number" step="0.001" min="0" value="${num(t.capacity_kN, 3)}" data-area="ties" data-key="${escape(t.name)}" aria-label="${escape(t.label)} capacity kN"></td>
        <td class="num dd-catalogue">${num(t.catalogue_kN, 3)}</td>
      </tr>`;
      return `<div class="dd-table-wrap"><table class="dd-table">
        <thead><tr><th>Tie</th><th>Used by</th><th>Nominal (mm)</th><th>Actual length (mm)</th><th>Width (mm)</th><th>Thk (mm)</th><th>Capacity (kN)</th><th>Catalogue (kN)</th></tr></thead>
        <tbody>${rows.filter(t => t.kind === "outer").map(line).join("")}
        <tr class="dd-group"><td colspan="8">Inner-leaf ties</td></tr>
        ${rows.filter(t => t.kind === "inner").map(line).join("")}</tbody></table></div>
        <p class="dd-note">A tie level is only as strong as its weaker tie: level capacity = min(inner tie, outer tie selected for the wall). A DU carries two ties per level; its capacity is counted per level, as the approved workbook does. Catalogue: U / DU 1.713 kN (U tie governs), L / I 2.250 kN.</p>`;
    }

    function designPanel() {
      const rows = data.designSpec().map(d => `<tr class="${d.edited ? "is-edited" : ""}">
        <td class="dd-name">${escape(d.label)}<small>${escape(d.hint)}</small></td>
        <td class="num">${d.type === "boolean"
          ? `<input type="checkbox" ${d.current ? "checked" : ""} data-area="design" data-key="${escape(d.key)}" aria-label="${escape(d.label)}">`
          : `<input type="number" step="any" min="${d.min}" max="${d.max}" value="${num(d.current, d.decimals)}" data-area="design" data-key="${escape(d.key)}" aria-label="${escape(d.label)}">`}</td>
        <td>${escape(d.unit)}</td>
        <td class="num dd-catalogue">${d.type === "boolean" ? (d.catalogue ? "on" : "off") : num(d.catalogue, d.decimals)}</td>
      </tr>`).join("");
      return `<div class="dd-table-wrap"><table class="dd-table dd-narrow">
        <thead><tr><th>Constant</th><th>Value</th><th>Unit</th><th>Catalogue</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function anchorsPanel() {
      const rows = data.anchors().map(a => `<tr class="${a.edited ? "is-edited" : ""}${a.added ? " is-added" : ""}">
        <td>${escape(a.family)}</td>
        <td class="dd-name">${escape(a.name)}</td>
        <td>${escape(a.sku)}</td>
        <td class="num"><input type="number" step="0.1" min="0" value="${num(a.shear, 1)}" data-area="anchors" data-key="${escape(a.sku)}" data-field="shear" aria-label="${escape(a.name)} shear kN"></td>
        <td class="num"><input type="number" step="0.1" min="0" value="${num(a.tension, 1)}" data-area="anchors" data-key="${escape(a.sku)}" data-field="tension" aria-label="${escape(a.name)} tension kN"></td>
        <td class="num dd-catalogue">${a.catalogue ? `${num(a.catalogue.shear, 1)} / ${num(a.catalogue.tension, 1)}` : "added"}</td>
        <td><button type="button" class="dd-remove" data-action="remove-anchor" data-key="${escape(a.sku)}" title="Remove this anchor">&times;</button></td>
      </tr>`).join("");
      const families = data.ANCHOR_FAMILIES.map(f => `<option value="${escape(f)}">${escape(f)}</option>`).join("");
      return `<div class="dd-table-wrap"><table class="dd-table">
        <thead><tr><th>Family</th><th>Anchor</th><th>SKU</th><th>Shear (kN)</th><th>Tension (kN)</th><th>Catalogue shear / tension</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        <div class="dd-add" data-form="anchor">
          <select data-add="family" aria-label="New anchor family">${families}</select>
          <input type="text" data-add="name" placeholder="Anchor (e.g. RGM 20)" aria-label="New anchor name">
          <input type="text" data-add="sku" placeholder="SKU" aria-label="New anchor SKU">
          <input type="number" step="0.1" min="0" data-add="shear" placeholder="Shear kN" aria-label="New anchor shear">
          <input type="number" step="0.1" min="0" data-add="tension" placeholder="Tension kN" aria-label="New anchor tension">
          <button type="button" class="secondary-button" data-action="add-anchor">Add anchor</button>
        </div>
        <p class="dd-note">Anchors are chosen by load: the smallest anchor of the selected family whose capacity (tension or shear, per the connection) satisfies final ULS capacity / 2 &le; 2 &times; capacity. The size in the SKU name (M10, M12 ...) sets the M12-minimum rule for slotted plates.</p>`;
    }

    function boltSkusPanel() {
      const codes = data.boltCodes();
      const rows = data.boltSkus().map(r => `<tr class="${r.edited ? "is-edited" : ""}${r.added ? " is-added" : ""}">
        <th class="dd-sticky dd-name">${escape(r.sku)}</th>
        <td class="dd-desc"><input type="text" value="${escape(r.description)}" data-area="boltSkus" data-key="${escape(r.sku)}" data-field="description" aria-label="${escape(r.sku)} description"></td>
        ${codes.map(code => `<td class="num"><input type="number" step="1" min="0" value="${Number(r.counts[code]) || 0}" data-area="boltSkus" data-key="${escape(r.sku)}" data-field="count" data-code="${escape(code)}" aria-label="${escape(r.sku)} quantity under ${escape(code)}"></td>`).join("")}
        <td><button type="button" class="dd-remove" data-action="remove-bolt" data-key="${escape(r.sku)}" title="Remove this bolt">&times;</button></td>
      </tr>`).join("");
      return `<div class="dd-table-wrap dd-matrix-wrap"><table class="dd-table dd-matrix">
        <thead><tr><th class="dd-sticky">SKU</th><th>Description</th>${codes.map(c => `<th class="dd-code">${escape(c)}</th>`).join("")}<th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        <div class="dd-add" data-form="bolt">
          <input type="text" data-add="sku" placeholder="SKU (e.g. KM12/120  M12X120 Set Screw)" aria-label="New bolt SKU">
          <input type="text" data-add="description" placeholder="Description" aria-label="New bolt description">
          <button type="button" class="secondary-button" data-action="add-bolt">Add bolt</button>
        </div>
        <p class="dd-note">Quantity of each SKU supplied under every connection code, as the workbook's Bolts sheet. A new SKU starts at 0 everywhere: type its quantities, then choose it for a connection under <em>Connection bolts</em>. Anchors (RG / FAZ) take their quantity from here too when it is listed, else 2.</p>`;
    }

    function connectionBoltsPanel() {
      const skus = data.boltSkus().map(r => r.sku);
      const families = data.BOLT_FAMILIES;
      const optionsFor = (current) => {
        const list = ["N/A", "WELD", ...skus];
        if (current && !list.includes(current)) list.push(current);
        return list.map(v => `<option value="${escape(v)}" ${v === current ? "selected" : ""}>${escape(v)}</option>`).join("");
      };
      const rows = data.connectionBoltRows().map(c => `<tr class="${c.edited ? "is-edited" : ""}">
        <th class="dd-sticky dd-name">${escape(c.code)}</th>
        <td>${escape(c.description)}<small>${escape(c.family)} · ${escape(c.position)}${c.materialClass ? " · " + escape(c.materialClass) : ""}${c.anchorRole ? " · anchor by " + escape(c.anchorRole) : ""}</small></td>
        <td>${escape(c.postBolt || "")}</td>
        ${families.map(f => `<td><select data-area="connectionBolts" data-key="${escape(c.code)}" data-field="${escape(f)}" aria-label="${escape(c.code)} ${escape(f)}">${optionsFor(c.bolts[f])}</select>${c.catalogue[f] && c.catalogue[f] !== c.bolts[f] ? `<small class="dd-catalogue">was ${escape(c.catalogue[f])}</small>` : ""}</td>`).join("")}
      </tr>`).join("");
      return `<div class="dd-table-wrap dd-matrix-wrap"><table class="dd-table dd-matrix">
        <thead><tr><th class="dd-sticky">Code</th><th>Fixing</th><th>Post bolt</th>${families.map(f => `<th>${escape(f)}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody></table></div>
        <p class="dd-note">The SKU a connection is supplied with under each bolt family. Connections into concrete pick their anchor by load from the Anchors table instead (the RGM / FAZ columns then only need to be different from N/A to offer that family).</p>`;
    }

    function render() {
      const edits = data.edits();
      const tabs = TABS.map(t => {
        const count = edits.byArea[t.area] || 0;
        return `<button type="button" role="tab" class="dd-tab ${t.key === active ? "is-active" : ""}" data-action="tab" data-key="${t.key}" aria-selected="${t.key === active}">${escape(t.label)}${count ? ` <b class="badge is-edited">${count}</b>` : ""}</button>`;
      }).join("");
      const panel = { ties: tiesPanel, design: designPanel, anchors: anchorsPanel, boltSkus: boltSkusPanel, connectionBolts: connectionBoltsPanel }[active]();
      host.innerHTML = `<div class="dd-tabs" role="tablist">${tabs}</div>
        <div class="dd-toolbar">
          <span class="dd-status">${edits.count ? `${edits.count} value${edits.count === 1 ? "" : "s"} edited` : "Catalogue values"}</span>
          <button type="button" class="secondary-button" data-action="reset-table">Reset this table</button>
          <button type="button" class="secondary-button" data-action="reset-all">Reset all to catalogue</button>
        </div>
        ${notice ? `<p class="dd-notice" role="alert">${escape(notice)}</p>` : ""}
        <div class="dd-panel" data-panel="${active}">${panel}</div>`;
      notice = "";
    }

    function readAdd(form, name) {
      const el = host.querySelector(`[data-form="${form}"] [data-add="${name}"]`);
      return el ? el.value : "";
    }

    function applyChange(target) {
      const area = target.dataset.area, key = target.dataset.key, field = target.dataset.field;
      let ok = true;
      if (area === "ties") ok = data.setTieCapacity(key, target.value);
      else if (area === "design") ok = data.setDesign(key, target.type === "checkbox" ? target.checked : target.value);
      else if (area === "anchors") ok = data.setAnchor(key, { [field]: target.value });
      else if (area === "boltSkus") ok = field === "description"
        ? data.setBoltSku(key, { description: target.value })
        : data.setBoltSku(key, { counts: { [target.dataset.code]: target.value } });
      else if (area === "connectionBolts") ok = data.setConnectionBolt(key, field, target.value);
      else return;
      if (!ok) notice = "That value was not accepted (out of range or unknown row); the previous value is kept.";
      render();
      onChange();
    }

    function applyAction(button) {
      const action = button.dataset.action, key = button.dataset.key;
      if (action === "tab") { active = key; render(); return; }
      if (action === "reset-table") { data.reset(TABS.find(t => t.key === active).area); render(); onChange(); return; }
      if (action === "reset-all") { data.reset(); render(); onChange(); return; }
      if (action === "remove-anchor") { data.removeAnchor(key); render(); onChange(); return; }
      if (action === "remove-bolt") { data.removeBoltSku(key); render(); onChange(); return; }
      if (action === "add-anchor") {
        const ok = data.addAnchor({ family: readAdd("anchor", "family"), name: readAdd("anchor", "name"), sku: readAdd("anchor", "sku"), shear: readAdd("anchor", "shear"), tension: readAdd("anchor", "tension") });
        if (!ok) notice = "Give the new anchor a unique SKU, a family and its shear and tension capacities.";
        render(); onChange(); return;
      }
      if (action === "add-bolt") {
        const ok = data.addBoltSku({ sku: readAdd("bolt", "sku"), description: readAdd("bolt", "description") });
        if (!ok) notice = "Give the new bolt a unique SKU.";
        render(); onChange();
      }
    }

    host.addEventListener("change", event => {
      const target = event.target;
      if (target && target.dataset && target.dataset.area) applyChange(target);
    });
    host.addEventListener("click", event => {
      const button = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
      if (button && host.contains(button)) applyAction(button);
    });

    render();
    return Object.freeze({ refresh: render, show: key => { if (TABS.some(t => t.key === key)) { active = key; render(); } } });
  }

  windpost.designDataEditor = Object.freeze({ mount, TABS });
})(typeof window !== "undefined" ? window : globalThis);
