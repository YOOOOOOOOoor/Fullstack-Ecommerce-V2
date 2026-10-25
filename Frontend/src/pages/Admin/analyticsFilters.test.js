import test from "node:test";
import assert from "node:assert/strict";
import { adjustCustomRangeStart, buildAnalyticsParams, getChartTickInterval, getMonthName, getQuarterLabel, getReportingYears, QUICK_ANALYTICS_RANGES } from "./analyticsFilters.js";

test("quick range option values stay stable while labels remain human-readable", () => {
  assert.deepEqual(QUICK_ANALYTICS_RANGES, [
    ["today", "Today"], ["yesterday", "Yesterday"], ["7", "Last 7 Days"],
    ["30", "Last 30 Days"], ["90", "Last 90 Days"], ["this_week", "This Week"],
    ["last_week", "Last Week"], ["this_month", "This Month"], ["last_month", "Last Month"],
    ["this_year", "This Year"], ["last_year", "Last Year"],
  ]);
});

test("quick ranges use the existing range/period query contract", () => {
  for (const value of ["7", "30", "90", "all"]) {
    assert.equal(buildAnalyticsParams({ kind: "preset", value }, "units").toString(), `range=${value}&sort=units`);
  }
  for (const value of ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_year", "last_year"]) {
    assert.equal(buildAnalyticsParams({ kind: "preset", value }, "revenue").toString(), `period=${value}&sort=revenue`);
  }
});

test("month, quarter, year and custom modes submit only their selected period parameters", () => {
  assert.equal(buildAnalyticsParams({ kind: "month", values: { year: "2026", month: "10" } }, "units").toString(), "period=month&year=2026&month=10&sort=units");
  assert.equal(buildAnalyticsParams({ kind: "quarter", values: { year: "2026", quarter: "3", interval: "daily" } }, "revenue").toString(), "period=quarter&year=2026&quarter=3&interval=daily&sort=revenue");
  assert.equal(buildAnalyticsParams({ kind: "year", values: { year: "2024" } }, "units").toString(), "period=year&year=2024&sort=units");
  assert.equal(buildAnalyticsParams({ kind: "custom", values: { startDate: "2026-10-01", endDate: "2026-10-23" } }, "units").toString(), "period=custom&startDate=2026-10-01&endDate=2026-10-23&sort=units");
});

test("month filters preserve one-based API month values and the selected year", () => {
  for (const [month, expectedStart] of [["01", "01"], ["07", "07"], ["10", "10"], ["12", "12"]]) {
    const params = buildAnalyticsParams({ kind: "month", values: { year: "2025", month: String(Number(month)) } }, "units");
    assert.equal(params.get("year"), "2025");
    assert.equal(params.get("month"), String(Number(expectedStart)));
    assert.equal(params.get("period"), "month");
  }
});

test("month selector labels stay human-readable and reject invalid month indexes", () => {
  assert.deepEqual(Array.from({ length: 12 }, (_, index) => getMonthName(index + 1)), [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]);
  assert.throws(() => getMonthName(0), /Month must be 1 through 12/);
  assert.throws(() => getMonthName(13), /Month must be 1 through 12/);
});

test("quarter labels preserve each quarter value and show its month range", () => {
  assert.deepEqual([1, 2, 3, 4].map(getQuarterLabel), [
    "Q1 · January–March", "Q2 · April–June", "Q3 · July–September", "Q4 · October–December",
  ]);
  assert.throws(() => getQuarterLabel(0), /Quarter must be 1 through 4/);
  assert.throws(() => getQuarterLabel(5), /Quarter must be 1 through 4/);
});

test("year choices begin at the earliest real order date and fall back safely when it is absent", () => {
  assert.deepEqual(getReportingYears({ startDate: "2019-07-23" }, "2026-10-24"), [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
  assert.deepEqual(getReportingYears({ startDate: null }, "2026-10-24"), [2026]);
  assert.deepEqual(getReportingYears({ startDate: "2029-01-01" }, "2026-10-24"), [2026]);
});

test("custom range start adjusts an earlier end date forward without invalid ranges", () => {
  assert.deepEqual(adjustCustomRangeStart("2024-02-29", "2024-02-01"), {
    startDate: "2024-02-29", endDate: "2024-02-29",
  });
  assert.deepEqual(adjustCustomRangeStart("2024-02-01", "2024-02-29"), {
    startDate: "2024-02-01", endDate: "2024-02-29",
  });
});

test("chart tick intervals adapt to short, daily, monthly, and yearly series sizes", () => {
  assert.equal(getChartTickInterval(0), 0);
  assert.equal(getChartTickInterval(7), 0);
  assert.equal(getChartTickInterval(31), 4);
  assert.equal(getChartTickInterval(13), 1);
  assert.equal(getChartTickInterval(120), 17);
});
