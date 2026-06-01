import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { ElektronikonClient } from "../src/client.js";

const runIntegration = process.env.ELEKTRONIKON_RUN_INTEGRATION === "1";
const integration = runIntegration ? test : test.skip;
const host = process.env.ELEKTRONIKON_HOST ?? "192.168.100.100";

integration("few direct selectors return stable decoded shapes", async () => {
  const client = new ElektronikonClient({ host, timeoutMs: 10000 });
  const result = await client.query({ selectors: ["300201", "300301", "300701"] });

  assert.equal(result.directResults.length, 3);

  const pressure = result.directResults.find((entry) => entry.selector === "300201");
  assert.ok(pressure);
  assert.ok(pressure.decoded.int16Word1 > 5000);
  assert.ok(pressure.decoded.int16Word1 < 9000);

  const digitalInput = result.directResults.find((entry) => entry.selector === "300301");
  assert.ok(digitalInput);
  assert.ok([0, 1].includes(digitalInput.decoded.uint16Word1));

  const runningHours = result.directResults.find((entry) => entry.selector === "300701");
  assert.ok(runningHours);
  assert.ok(runningHours.decoded.uint32 > 100000000);
});

integration("discover reproduces the active family surface", async () => {
  const client = new ElektronikonClient({ host, timeoutMs: 10000 });
  const catalog = await client.discover();

  assert.ok(catalog.familyCounts.analogInputs >= 4);
  assert.ok(catalog.familyCounts.digitalInputs >= 3);
  assert.ok(catalog.familyCounts.digitalOutputs >= 6);
  assert.ok(catalog.familyCounts.counters >= 6);
  assert.ok(catalog.familyCounts.specialProtections >= 4);
  assert.ok(catalog.pointsById.has("analogInputs:compressor-outlet"));
});

integration("query all returns decoded analogs and machine state", async () => {
  const client = new ElektronikonClient({ host, timeoutMs: 10000 });
  const result = await client.query({ allDiscovered: true });

  assert.ok(result.pointResults.length >= 20);

  const compressorOutlet = result.pointResults.find((point) => point.id === "analogInputs:compressor-outlet");
  assert.ok(compressorOutlet);
  assert.equal(compressorOutlet.normalized.unit, "bar");
  assert.ok(compressorOutlet.normalized.value > 5);
  assert.ok(compressorOutlet.normalized.value < 9);

  const machineState = result.pointResults.find((point) => point.id === "machineState:current");
  assert.ok(machineState);
  assert.ok(typeof machineState.primaryLabel === "string" || machineState.primaryLabel === null);
});

integration("mixed requests can combine raw selectors, point ids, and full families", async () => {
  const client = new ElektronikonClient({ host, timeoutMs: 10000 });
  const result = await client.query({
    selectors: ["300201"],
    points: ["analogInputs:compressor-outlet"],
    families: ["digitalOutputs"],
  });

  assert.equal(result.directResults.length, 1);
  assert.ok(result.pointResults.some((point) => point.id === "analogInputs:compressor-outlet"));
  assert.equal(result.pointResults.filter((point) => point.family === "digitalOutputs").length, 6);
});

integration("cli query emits valid JSON for a single selector", () => {
  const child = spawnSync(process.execPath, ["./src/cli.js", "query", "--selector", "300201"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, ELEKTRONIKON_HOST: host },
    encoding: "utf8",
  });

  assert.equal(child.status, 0, child.stderr);
  const payload = JSON.parse(child.stdout);
  assert.equal(payload.selectorCount, 1);
  assert.equal(payload.directResults[0].selector, "300201");
});