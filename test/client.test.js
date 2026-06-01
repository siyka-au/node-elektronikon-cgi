import test from "node:test";
import assert from "node:assert/strict";

import { ElektronikonClient } from "../src/client.js";
import { ElektronikonHttpError, UnknownFamilyError, UnknownPointError } from "../src/errors.js";

test("queryRaw surfaces HTTP errors with context", async () => {
  const client = new ElektronikonClient({
    host: "example.invalid",
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "",
    }),
  });

  await assert.rejects(
    () => client.queryRaw(["300201"]),
    (error) => {
      assert.ok(error instanceof ElektronikonHttpError);
      assert.equal(error.context.status, 503);
      return true;
    },
  );
});

test("query rejects unknown point ids", async () => {
  const client = new ElektronikonClient({
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });

  client.discover = async () => ({
    families: { analogInputs: [] },
    familyCounts: { analogInputs: 0 },
    pointsById: new Map(),
    languageMap: new Map(),
  });

  await assert.rejects(() => client.query({ points: ["analogInputs:not-real"] }), UnknownPointError);
});

test("query rejects unknown family names", async () => {
  const client = new ElektronikonClient({
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });

  client.discover = async () => ({
    families: { analogInputs: [] },
    familyCounts: { analogInputs: 0 },
    pointsById: new Map(),
    languageMap: new Map(),
  });

  await assert.rejects(() => client.query({ families: ["not-a-family"] }), UnknownFamilyError);
});