import test from "node:test";
import assert from "node:assert/strict";
import { addRefundEvidenceFiles, MAX_REFUND_EVIDENCE_BYTES } from "./refundEvidence.js";

const file = (name, options = {}) => ({ name, size: options.size ?? 100, type: options.type ?? "image/jpeg", lastModified: options.lastModified ?? 1 });

test("evidence selection accepts supported files and keeps existing selections", () => {
  const first = file("front.jpg");
  const result = addRefundEvidenceFiles([{ file: first, previewUrl: "blob:front" }], [file("back.webp", { type: "image/webp" })]);
  assert.equal(result.files.length, 2);
  assert.deepEqual(result.errors, []);
  assert.equal(result.files[0].previewUrl, "blob:front");
});

test("evidence selection rejects unsupported or oversized images and duplicate files", () => {
  const first = file("front.jpg");
  const result = addRefundEvidenceFiles([{ file: first, previewUrl: "blob:front" }], [file("front.jpg"), file("document.gif", { type: "image/gif" }), file("large.png", { type: "image/png", size: MAX_REFUND_EVIDENCE_BYTES + 1 })]);
  assert.equal(result.files.length, 1);
  assert.equal(result.errors.length, 2);
});

test("evidence selection caps the combined selection at three files", () => {
  const result = addRefundEvidenceFiles([{ file: file("one.jpg"), previewUrl: "one" }, { file: file("two.jpg"), previewUrl: "two" }], [file("three.jpg"), file("four.jpg")]);
  assert.equal(result.files.length, 3);
  assert.match(result.errors.join(" "), /up to 3 images/);
});
