"use strict";

global.Windpost = {};

require("../js/engines/workflow/project-file-engine.js");
require("../js/engines/workflow/revision-engine.js");
require("../js/engines/workflow/production-validation-engine.js");
require("../js/services/print-calibration-service.js");

let passed = 0;
function check(name, task) {
  task();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

check("selector and detailing projects use one versioned JSON schema", () => {
  const engine = Windpost.projectFileEngine;
  const project = engine.create("selector", {
    options: { type: "L", length_mm: 6000 }
  });
  const restored = engine.deserialize(engine.serialize(project));
  assert(restored && restored.kind === "selector", "selector did not restore");
  assert(restored.data.options.length_mm === 6000, "length changed");
  assert(engine.deserialize("{broken") === null, "invalid JSON accepted");
});

check("revision history replaces a repeated revision and stays bounded", () => {
  const engine = Windpost.revisionEngine;
  let history = [];
  for (let index = 0; index < 12; index += 1) {
    history = engine.record(history, {
      revision: `P${index}`,
      issue: "ISSUE",
      date: "26/07/2026",
      by: "TEST"
    });
  }
  assert(history.length === engine.MAX_HISTORY, "history is not bounded");
  const revised = engine.record(history, {
    revision: "P11",
    issue: "REVISED",
    date: "27/07/2026",
    by: "CHECK"
  });
  assert(revised.length === engine.MAX_HISTORY, "duplicate revision appended");
  assert(revised[revised.length - 1].issue === "REVISED",
    "revision was not replaced");
});

check("calibration sheet contains an exact 100 mm reference square", () => {
  const svg = Windpost.printCalibrationService.sheet();
  assert(svg.includes('data-calibration-square-mm="100"'),
    "calibration marker missing");
  assert(svg.includes('width="100" height="100"'),
    "100 mm geometry missing");
  assert(svg.includes('width="210mm" height="297mm"'),
    "A4 physical size missing");
});

check("production validation rejects missing drawings and accepts valid basics", () => {
  const invalid = Windpost.productionValidationEngine.validate({});
  assert(!invalid.ok && invalid.errors.length >= 3,
    "missing production geometry was accepted");
  const a4 = {
    getAttribute(name) { return name === "viewBox" ? "0 0 210 297" : ""; },
    querySelector(selector) {
      return selector === "#production-title-block" ||
        selector === "#production-signoff" ? {} : null;
    },
    outerHTML: '<svg viewBox="0 0 210 297"></svg>'
  };
  const valid = Windpost.productionValidationEngine.validate({
    section: { name: "LP 150x70x4", t_mm: 4 },
    orthographic: {
      length_mm: 6000,
      slotPlacement: { levels_mm: [225, 450, 675] }
    },
    baseplate: {
      ok: true,
      design: { B: 220, tp: 8, plateLen: 175 }
    },
    a4Root: a4
  });
  assert(valid.ok, "valid production basics were rejected");
});

console.log(`\n${passed} production workflow checks passed.`);
