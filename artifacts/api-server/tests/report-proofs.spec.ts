import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, hashReportPayload } from "../src/lib/report-proof-canonical";

test("canonical JSON sorts object keys recursively and preserves array order", () => {
  const left = { z: 1, nested: { b: "é", a: true }, list: [2, 1] };
  const right = { list: [2, 1], nested: { a: true, b: "é" }, z: 1 };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(hashReportPayload(left), hashReportPayload(right));
  assert.notEqual(hashReportPayload(left), hashReportPayload({ ...right, list: [1, 2] }));
});

test("canonical JSON rejects non-JSON values", () => {
  assert.throws(() => canonicalJson({ bad: Number.NaN }));
});
