import test from "node:test";
import assert from "node:assert/strict";
import { formatCategoryName } from "./categoryDisplay.js";

test("formats category names for display while preserving word casing after the first", () => {
  assert.equal(formatCategoryName("electronics"), "Electronics");
  assert.equal(formatCategoryName("mobile phones"), "Mobile phones");
  assert.equal(formatCategoryName("MEN'S FASHION"), "Men's fashion");
});

test("handles absent and blank category names safely", () => {
  assert.equal(formatCategoryName(null), "");
  assert.equal(formatCategoryName(undefined), "");
  assert.equal(formatCategoryName("  "), "");
});
