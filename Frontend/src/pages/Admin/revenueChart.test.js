import test from "node:test";
import assert from "node:assert/strict";
import { loadRevenueChart, REVENUE_CHART_RANGES, selectRevenueChartRange } from "./revenueChart.js";

const createState = (range = "30") => {
  const state = { range, loading: false, error: "old error" };
  state.setRange = (value) => { state.range = value; };
  state.setLoading = (value) => { state.loading = value; };
  state.setError = (value) => { state.error = value; };
  return state;
};

test("chart options show clear labels while retaining backend range values", () => {
  assert.deepEqual(REVENUE_CHART_RANGES, [
    { value: "7", label: "7 days" },
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
    { value: "all", label: "All time" },
  ]);
});

test("selecting a different range updates selection and loads that range", async () => {
  const state = createState("30");
  const changed = selectRevenueChartRange("7", state.range, state);
  assert.equal(changed, true);
  assert.equal(state.range, "7");
  assert.equal(state.loading, true);
  assert.equal(state.error, "");
  let requested;
  let loaded;
  await loadRevenueChart({
    range: state.range,
    request: async (config) => { requested = config.params.range; return { range: config.params.range }; },
    isCurrent: () => true,
    onSuccess: (report) => { loaded = report; },
    onError: () => assert.fail("request should succeed"),
    onSettled: () => state.setLoading(false),
  });
  assert.equal(requested, "7");
  assert.deepEqual(loaded, { range: "7" });
  assert.equal(state.loading, false);
});

test("selecting the active range is a no-op and cannot strand loading", () => {
  const state = createState("30");
  const changed = selectRevenueChartRange("30", state.range, state);
  assert.equal(changed, false);
  assert.equal(state.range, "30");
  assert.equal(state.loading, false);
  assert.equal(state.error, "old error");
});

test("successful request uses the selected range and clears loading", async () => {
  const state = createState();
  let loaded;
  let config;
  state.setLoading(true);
  await loadRevenueChart({
    range: "365",
    request: async (value) => { config = value; return { revenueTrend: [1] }; },
    isCurrent: () => true,
    onSuccess: (report) => { loaded = report; },
    onError: () => assert.fail("success must not report an error"),
    onSettled: () => state.setLoading(false),
  });
  assert.deepEqual(config, { params: { range: "365" } });
  assert.deepEqual(loaded, { revenueTrend: [1] });
  assert.equal(state.loading, false);
});

test("failed request clears loading and exposes a retryable error", async () => {
  const state = createState();
  let errorText = "";
  state.setLoading(true);
  await loadRevenueChart({
    range: "30",
    request: async () => { throw new Error("network unavailable"); },
    isCurrent: () => true,
    onSuccess: () => assert.fail("failed request must not succeed"),
    onError: () => { errorText = "Revenue chart could not be loaded."; state.setError(errorText); },
    onSettled: () => state.setLoading(false),
  });
  assert.equal(state.loading, false);
  assert.equal(state.error, "Revenue chart could not be loaded.");
  assert.match(errorText, /could not be loaded/);
});

test("rapid range changes ignore stale responses and settle the newest request", async () => {
  let currentRange = "30";
  const received = [];
  let settled = 0;
  let resolveOld;
  let resolveCurrent;
  const first = loadRevenueChart({
    range: "7",
    request: () => new Promise((resolve) => { resolveOld = resolve; }),
    isCurrent: () => currentRange === "7",
    onSuccess: (report) => received.push(report),
    onError: () => assert.fail("stale error should be ignored"),
    onSettled: () => { settled += 1; },
  });
  currentRange = "365";
  const latest = loadRevenueChart({
    range: "365",
    request: () => new Promise((resolve) => { resolveCurrent = resolve; }),
    isCurrent: () => currentRange === "365",
    onSuccess: (report) => received.push(report),
    onError: () => assert.fail("latest request should succeed"),
    onSettled: () => { settled += 1; },
  });
  resolveCurrent({ range: "365" });
  await latest;
  resolveOld({ range: "7" });
  await first;
  assert.deepEqual(received, [{ range: "365" }]);
  assert.equal(settled, 1);
});

test("cancelled request clears its active loading state without showing an error", async () => {
  let loading = true;
  let errorShown = false;
  await loadRevenueChart({
    range: "7",
    request: async () => { const error = new Error("cancelled"); error.code = "ERR_CANCELED"; throw error; },
    isCurrent: () => true,
    onSuccess: () => assert.fail("cancelled request must not succeed"),
    onError: () => { errorShown = true; },
    onSettled: () => { loading = false; },
  });
  assert.equal(loading, false);
  assert.equal(errorShown, false);
});
