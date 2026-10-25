import test from "node:test";
import assert from "node:assert/strict";
import { getComparisonDisplay, makeCustomerComparison } from "./dashboardComparison.js";

const label = "same dates last month";
const comparison = (current, previous) => ({ current, previous, comparisonAvailable: true });

test("positive previous value displays the normal percentage increase", () => {
  assert.deepEqual(getComparisonDisplay(comparison(150, 100), label, "revenue"), {
    type: "change", change: 50, label,
  });
});

test("positive previous value displays the normal percentage decrease", () => {
  assert.deepEqual(getComparisonDisplay(comparison(50, 100), label, "orders"), {
    type: "change", change: -50, label,
  });
});

test("zero previous value with positive current value uses concise metric-specific labels", () => {
  assert.match(getComparisonDisplay(comparison(25, 0), label, "revenue").text, /^New revenue this period/);
  assert.match(getComparisonDisplay(comparison(2, 0), label, "orders").text, /^New orders this period/);
  assert.match(getComparisonDisplay(comparison(12.5, 0), label, "averageOrder").text, /^First recorded average this period/);
  assert.match(getComparisonDisplay(comparison(1, 0), label, "customers").text, /^New customers this period/);
});

test("average order value with no prior paid orders avoids a percentage", () => {
  const display = getComparisonDisplay(comparison(8254.5, 0), label, "averageOrder");
  assert.equal(display.type, "message");
  assert.match(display.text, /First recorded average this period/);
  assert.equal("change" in display, false);
});

test("both current and previous values at zero show a neutral metric-specific state", () => {
  assert.match(getComparisonDisplay(comparison(0, 0), label, "revenue").text, /No revenue in either period/);
  assert.match(getComparisonDisplay(comparison(0, 0), label, "averageOrder").text, /No average order value in either period/);
});

test("missing, unavailable, and invalid previous-period data remain unavailable", () => {
  assert.match(getComparisonDisplay(null, label).text, /^Comparison unavailable/);
  assert.match(getComparisonDisplay({ current: 1, previous: 0 }, label).text, /^Comparison unavailable/);
  assert.match(getComparisonDisplay({ ...comparison(1, 0), comparisonAvailable: false }, label).text, /^Comparison unavailable/);
  assert.match(getComparisonDisplay(comparison(1, null), label).text, /^Comparison unavailable/);
  assert.match(getComparisonDisplay(comparison("not numeric", 2), label).text, /^Comparison unavailable/);
  assert.match(getComparisonDisplay(comparison(1, Number.NaN), label).text, /^Comparison unavailable/);
});

test("all-time reports explicitly omit percentage comparisons", () => {
  assert.deepEqual(getComparisonDisplay(null, "All time", "revenue"), {
    type: "message", text: "No previous-period comparison for all time",
  });
});

test("new-customer current count survives missing previous-period data", () => {
  const missing = makeCustomerComparison(1, null, label);
  assert.equal(missing.current, 1);
  assert.equal(missing.previous, null);
  assert.equal(missing.comparisonAvailable, false);
  assert.match(getComparisonDisplay(missing, label, "customers").text, /^Comparison unavailable/);
  const zeroBaseline = makeCustomerComparison(1, 0, label);
  assert.equal(zeroBaseline.current, 1);
  assert.equal(zeroBaseline.comparisonAvailable, true);
  assert.match(getComparisonDisplay(zeroBaseline, label, "customers").text, /^New customers this period/);
});
