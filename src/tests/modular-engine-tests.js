"use strict";

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
global.window = global;
global.Windpost = {};
global.addEventListener = () => {};

[
  "js/data/windpost-parameters.js",
  "js/config.js",
  "js/data/l-section-database.js",
  "js/data/u-section-database.js",
  "js/engines/baseplate-config.js",
  "js/engines/baseplate-bolt-engine.js",
  "js/engines/baseplate-leff-engine.js",
  "js/engines/baseplate-tstub-engine.js",
  "js/engines/baseplate-stiffener-engine.js",
  "js/engines/baseplate-shear-engine.js",
  "js/engines/baseplate-check-engine.js",
  "js/engines/baseplate-sizer-engine.js",
  "js/engines/baseplate-design-engine.js",
  "js/engines/simply-u-baseplate-standard-engine.js",
  "js/engines/simply-l-baseplate-standard-engine.js",
  "js/engines/workflow/design-transfer-engine.js",
  "js/engines/workflow/task-cache-engine.js",
  "js/engines/workflow/render-scheduler-engine.js",
  "js/engines/workflow/safe-execution-engine.js",
  "js/engines/selector/selector-baseplate-routing-engine.js",
  "js/engines/selector/baseplate-drawing-routing-engine.js"
].forEach(file => require(path.join(root, file)));

const W = global.Windpost;
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

async function checkAsync(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

check("JSON design-transfer snapshots validate and round-trip", () => {
  const design = {
    inputs: {
      length_mm: 2675,
      supportCondition: "cantilever",
      loadType: "udl"
    },
    selected: {
      section: { name: "LP 150x70x4", type: "L" },
      finalCapacity_kN: 9.25,
      wall: {
        innerLeafThickness_mm: 100,
        cavityWidth_mm: 125,
        outerLeafThickness_mm: 102.5
      }
    }
  };
  const snapshot = W.designTransferEngine.snapshot(
    design,
    null,
    { pathname: "/copy/Windpost-Selector-Full.html" }
  );
  const storage = new Map();
  const session = {
    setItem: (key, value) => storage.set(key, value),
    getItem: key => storage.get(key)
  };
  assert.strictEqual(W.designTransferEngine.store(snapshot, session), true);
  assert.deepStrictEqual(
    W.designTransferEngine.restore(session),
    snapshot
  );
  const query = new URL(
    W.designTransferEngine.href(snapshot),
    "http://local/"
  ).searchParams;
  assert.strictEqual(query.get("section"), "LP 150x70x4");
  assert.strictEqual(query.get("length"), "2675");
  assert.strictEqual(query.get("return"), "Windpost-Selector-Full.html");
});

check("bounded task cache evicts the least-recently-used item", () => {
  const cache = W.taskCacheEngine.create(2);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.strictEqual(cache.get("a"), 1);
  cache.set("c", 3);
  assert.strictEqual(cache.get("b"), null);
  assert.strictEqual(cache.get("c"), 3);
  assert.strictEqual(cache.size(), 2);
});

check("safe execution records an engine failure and returns its fallback", () => {
  const result = W.safeExecutionEngine.run(
    "test-engine",
    () => {
      throw new Error("expected test error");
    },
    "fallback"
  );
  assert.strictEqual(result, "fallback");
  assert.strictEqual(W.safeExecutionEngine.last().scope, "test-engine");
  assert.strictEqual(W.safeExecutionEngine.last().message, "expected test error");
});

check("selector routing preserves simply-supported fixed standards", () => {
  const uSection = W.uSectionDatabase.sections.find(
    section => section.name === "UP 60x60x4"
  );
  const lSection = W.lSectionDatabase.sections.find(
    section => section.name === "LP 150x70x4"
  );
  const simpleU = W.selectorBaseplateRoutingEngine.design({
    inputs: { supportCondition: "simplySupported" },
    selected: { section: uSection, finalCapacity_kN: 1 }
  });
  const simpleL = W.selectorBaseplateRoutingEngine.design({
    inputs: { supportCondition: "simplySupported" },
    selected: { section: lSection, finalCapacity_kN: 1 }
  });
  assert.strictEqual(simpleU.connectionType, "simply-supported-u");
  assert.strictEqual(simpleU.design.B, 150);
  assert.strictEqual(simpleL.connectionType, "simply-supported-l");
  assert.strictEqual(simpleL.design.B, 150);
});

check("selector routing preserves cantilever load effects and 220 mm plate width", () => {
  const section = W.lSectionDatabase.sections.find(
    item => item.name === "LP 150x70x4"
  );
  const udl = W.selectorBaseplateRoutingEngine.design({
    inputs: {
      supportCondition: "cantilever",
      loadType: "udl",
      length_mm: 2000
    },
    selected: { section, finalCapacity_kN: 6 }
  });
  const point = W.selectorBaseplateRoutingEngine.design({
    inputs: {
      supportCondition: "cantilever",
      loadType: "tipPointLoad",
      length_mm: 2000
    },
    selected: { section, finalCapacity_kN: 6 }
  });
  assert.strictEqual(udl.moment, 6);
  assert.strictEqual(point.moment, 12);
  assert.strictEqual(udl.design.B, 220);
  assert.strictEqual(point.design.B, 220);
});

check("drawing routing selects the exact service for each connection type", () => {
  const services = {
    simplyUBaseplateDrawing: {},
    simplyLBaseplateDrawing: {},
    uBaseplateDrawing: {},
    baseplateDrawing: {}
  };
  Object.assign(W, services);
  assert.strictEqual(
    W.baseplateDrawingRoutingEngine.serviceFor({
      connectionType: "simply-supported-u"
    }),
    services.simplyUBaseplateDrawing
  );
  assert.strictEqual(
    W.baseplateDrawingRoutingEngine.serviceFor({
      connectionType: "simply-supported-l"
    }),
    services.simplyLBaseplateDrawing
  );
  assert.strictEqual(
    W.baseplateDrawingRoutingEngine.serviceFor({
      section: { type: "U" }
    }),
    services.uBaseplateDrawing
  );
  assert.strictEqual(
    W.baseplateDrawingRoutingEngine.serviceFor({
      section: { type: "L" }
    }),
    services.baseplateDrawing
  );
});

async function finish() {
  await checkAsync(
    "render scheduling collapses rapid changes into one task",
    async () => {
      let executions = 0;
      const scheduler = W.renderSchedulerEngine.create(() => {
        executions += 1;
      }, 10);
      scheduler.schedule();
      scheduler.schedule();
      scheduler.schedule();
      assert.strictEqual(scheduler.isPending(), true);
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.strictEqual(executions, 1);
      assert.strictEqual(scheduler.isPending(), false);
    }
  );
  console.log(`\n${passed} modular engine checks passed.`);
}

finish()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
