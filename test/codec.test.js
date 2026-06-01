import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeRawValue,
  formatSelector,
  normalizeSelector,
  splitAlignedAnswers,
} from "../src/codec.js";
import { InvalidSelectorError, ResponseAlignmentError } from "../src/errors.js";

test("formatSelector builds six-character selector keys", () => {
  assert.equal(formatSelector(0x3002, 0x01), "300201");
});

test("normalizeSelector accepts raw and pair formats", () => {
  assert.deepEqual(normalizeSelector("300201"), { key: "300201", index: 0x3002, subindex: 0x01 });
  assert.deepEqual(normalizeSelector({ index: 0x3002, subindex: 1 }), { key: "300201", index: 0x3002, subindex: 1, meta: null });
});

test("normalizeSelector rejects malformed selectors", () => {
  assert.throws(() => normalizeSelector("3002"), InvalidSelectorError);
});

test("splitAlignedAnswers decodes fixed-width and X markers", () => {
  const selectors = [normalizeSelector("300201"), normalizeSelector("300301"), normalizeSelector("300302")];
  const answers = splitAlignedAnswers(selectors, "1B520080X00010080");
  assert.deepEqual(answers.map((answer) => answer.raw), ["1B520080", "X", "00010080"]);
});

test("splitAlignedAnswers reports trailing data", () => {
  const selectors = [normalizeSelector("300201")];
  assert.throws(() => splitAlignedAnswers(selectors, "1B520080FFFF"), ResponseAlignmentError);
});

test("decodeRawValue exposes the legacy data helpers", () => {
  const decoded = decodeRawValue("1B520080");
  assert.equal(decoded.uint16Word1, 6994);
  assert.equal(decoded.uint16Word0, 128);
  assert.equal(decoded.int16Word1, 6994);
  assert.deepEqual(decoded.bytes, [128, 0, 82, 27]);
});