import test from "node:test";
import assert from "node:assert/strict";
import {
  analyticsQueries,
  buildDailySeries,
  buildCategoryPerformance,
  calculateComparison,
  getProductRankingQuery,
  normalizeAnalyticsSummary,
  normalizeRankedProducts,
  normalizeSecondaryMetrics,
  resolveAnalyticsPeriod,
} from "../services/analytics.js";

const businessToday = "2024-03-01";

test("legacy quick ranges retain inclusive daily boundaries and comparisons", () => {
  for (const [range, days] of [["7", 7], ["30", 30], ["90", 90]]) {
    const period = resolveAnalyticsPeriod({ range }, businessToday);
    const expectedStart = new Date(Date.UTC(2024, 2, 1 - days + 1)).toISOString().slice(0, 10);
    assert.equal(period.startDate, expectedStart);
    assert.equal(period.endDate, businessToday);
    assert.equal(period.interval, "day");
    assert.equal(period.comparison.endDate, new Date(Date.UTC(2024, 2, 1 - days)).toISOString().slice(0, 10));
  }
  assert.equal(resolveAnalyticsPeriod({ range: "all" }, businessToday, "2021-01-01").interval, "year");
  assert.equal(resolveAnalyticsPeriod({ range: "all" }, businessToday, "2023-01-01").interval, "month");
  assert.equal(resolveAnalyticsPeriod({ range: "all" }, businessToday, null).startDate, null);
});

test("365-day dashboard range returns a rolling period with monthly zero-filled buckets", () => {
  const period = resolveAnalyticsPeriod({ range: "365" }, businessToday);
  assert.equal(period.startDate, "2023-03-03");
  assert.equal(period.endDate, businessToday);
  assert.equal(period.interval, "month");
  assert.equal(period.comparison.startDate, "2022-03-03");
  assert.equal(period.comparison.endDate, "2023-03-02");
});

test("October 24 Addis business date remains October 24 and uses an exclusive next-day boundary", () => {
  const period = resolveAnalyticsPeriod({ period: "this_month" }, "2026-10-24");
  assert.deepEqual([period.startDate, period.endDate, period.displayEndDate], ["2026-10-01", "2026-10-24", "2026-10-31"]);
  assert.deepEqual([period.comparison.startDate, period.comparison.endDate], ["2026-09-01", "2026-09-24"]);
  assert.match(analyticsQueries.bounds, /business_today[\s\S]*::text/);
  assert.match(analyticsQueries.revenueByPeriod, /period_key::text AS period_key/);
  assert.match(analyticsQueries.ordersByPeriod, /period_key::text AS period_key/);
});

test("quick presets cover single days, Monday-based weeks, and calendar months", () => {
  assert.deepEqual(
    (({ startDate, endDate }) => [startDate, endDate])(resolveAnalyticsPeriod({ period: "today" }, businessToday)),
    [businessToday, businessToday],
  );
  assert.deepEqual(
    (({ startDate, endDate }) => [startDate, endDate])(resolveAnalyticsPeriod({ period: "yesterday" }, businessToday)),
    ["2024-02-29", "2024-02-29"],
  );
  const week = resolveAnalyticsPeriod({ period: "this_week" }, businessToday);
  assert.deepEqual([week.startDate, week.endDate], ["2024-02-26", businessToday]);
  const lastWeek = resolveAnalyticsPeriod({ period: "last_week" }, businessToday);
  assert.deepEqual([lastWeek.startDate, lastWeek.endDate], ["2024-02-19", "2024-02-25"]);
  const lastMonth = resolveAnalyticsPeriod({ period: "last_month" }, businessToday);
  assert.deepEqual([lastMonth.startDate, lastMonth.endDate], ["2024-02-01", "2024-02-29"]);
});

test("monthly selection handles leap February and compares equivalent prior-month dates", () => {
  const period = resolveAnalyticsPeriod({ period: "month", month: "2", year: "2024" }, businessToday);
  assert.deepEqual([period.startDate, period.endDate, period.displayEndDate, period.interval], [
    "2024-02-01", "2024-02-29", "2024-02-29", "day",
  ]);
  assert.deepEqual([period.comparison.startDate, period.comparison.endDate], ["2024-01-01", "2024-01-31"]);
  const currentMonth = resolveAnalyticsPeriod({ period: "month", month: "3", year: "2024" }, businessToday);
  assert.equal(currentMonth.endDate, businessToday);
  assert.equal(currentMonth.displayEndDate, "2024-03-31");
  assert.equal(resolveAnalyticsPeriod({ period: "this_month" }, "2023-03-31").comparison.endDate, "2023-02-28");
});

test("January, July, October, and December retain one-based month names and boundaries", () => {
  const expected = [
    ["1", "January", "2024-01-01", "2024-01-31"],
    ["7", "July", "2024-07-01", "2024-07-31"],
    ["10", "October", "2024-10-01", "2024-10-31"],
    ["12", "December", "2024-12-01", "2024-12-31"],
  ];
  for (const [month, name, start, end] of expected) {
    const period = resolveAnalyticsPeriod({ period: "month", month, year: "2024" }, "2025-01-15");
    assert.equal(period.label, `${name} 2024`);
    assert.deepEqual([period.startDate, period.displayEndDate], [start, end]);
    assert.equal(period.comparison.startDate, month === "1" ? "2023-12-01" : `2024-${String(Number(month) - 1).padStart(2, "0")}-01`);
  }
});

test("quarters use monthly buckets by default and support daily detail", () => {
  const q1 = resolveAnalyticsPeriod({ period: "quarter", quarter: "1", year: "2024" }, "2024-05-01");
  assert.deepEqual([q1.startDate, q1.endDate, q1.displayEndDate, q1.interval], [
    "2024-01-01", "2024-03-31", "2024-03-31", "month",
  ]);
  assert.deepEqual([q1.comparison.startDate, q1.comparison.endDate], ["2023-10-01", "2023-12-31"]);
  assert.equal(resolveAnalyticsPeriod({ period: "quarter", quarter: "1", year: "2024", interval: "daily" }, "2024-05-01").interval, "day");
  const currentQuarter = resolveAnalyticsPeriod({ period: "quarter", quarter: "1", year: "2024" }, businessToday);
  assert.equal(currentQuarter.comparison.endDate, "2023-11-30");
});

test("year analysis produces twelve monthly periods and handles year transitions", () => {
  const period = resolveAnalyticsPeriod({ period: "year", year: "2023" }, businessToday);
  assert.deepEqual([period.startDate, period.endDate, period.displayEndDate, period.interval], [
    "2023-01-01", "2023-12-31", "2023-12-31", "month",
  ]);
  assert.equal(period.comparison.startDate, "2022-01-01");
  const current = resolveAnalyticsPeriod({ period: "year", year: "2024" }, businessToday);
  assert.equal(current.displayEndDate, "2024-12-31");
  assert.equal(current.endDate, businessToday);
  assert.equal(current.comparison.endDate, "2023-03-01");
});

test("custom intervals adapt to duration and compare an equal immediately preceding range", () => {
  const daily = resolveAnalyticsPeriod({ period: "custom", startDate: "2024-02-20", endDate: businessToday }, businessToday);
  assert.equal(daily.interval, "day");
  assert.deepEqual([daily.comparison.startDate, daily.comparison.endDate], ["2024-02-09", "2024-02-19"]);
  assert.equal(resolveAnalyticsPeriod({ period: "custom", startDate: "2023-01-01", endDate: "2023-04-01" }, businessToday).interval, "month");
  assert.equal(resolveAnalyticsPeriod({ period: "custom", startDate: "2020-01-01", endDate: "2024-01-01" }, businessToday).interval, "year");
});

test("invalid types, malformed dates, future selections, and inverted ranges are rejected", () => {
  assert.throws(() => resolveAnalyticsPeriod({ range: "31" }, businessToday), RangeError);
  assert.throws(() => resolveAnalyticsPeriod({ range: "7", period: "today" }, businessToday), TypeError);
  assert.throws(() => resolveAnalyticsPeriod({ period: "month", month: "13", year: "2024" }, businessToday), TypeError);
  assert.throws(() => resolveAnalyticsPeriod({ period: "quarter", quarter: "5", year: "2024" }, businessToday), TypeError);
  assert.throws(() => resolveAnalyticsPeriod({ period: "month", month: "4", year: "2024" }, businessToday), RangeError);
  assert.throws(() => resolveAnalyticsPeriod({ period: "year", year: "2025" }, businessToday), RangeError);
  assert.throws(() => resolveAnalyticsPeriod({ period: "custom", startDate: "2024-02-30", endDate: businessToday }, businessToday), TypeError);
  assert.throws(() => resolveAnalyticsPeriod({ period: "custom", startDate: "2024-03-01", endDate: "2024-02-29" }, businessToday), RangeError);
  assert.throws(() => resolveAnalyticsPeriod({ period: "custom", startDate: "2024-02-01", endDate: "2024-03-02" }, businessToday), RangeError);
});

test("daily zero-filled helper remains chronological and leap-day safe", () => {
  assert.deepEqual(
    buildDailySeries("2024-02-28", "2024-03-01", [
      { date: "2024-02-28", orders: "2" }, { date: "2024-03-01", orders: "1" },
    ], "orders"),
    [
      { date: "2024-02-28", periodKey: "2024-02-28", orders: 2 },
      { date: "2024-02-29", periodKey: "2024-02-29", orders: 0 },
      { date: "2024-03-01", periodKey: "2024-03-01", orders: 1 },
    ],
  );
});

test("comparison percentages use raw values and safely mark zero baselines", () => {
  const current = normalizeAnalyticsSummary({ revenue: "100", orders: "2", average_order: "50", customers: "2" });
  const previous = normalizeAnalyticsSummary({ revenue: "0", orders: "1", average_order: "25", customers: "1" });
  const comparison = calculateComparison(current, previous, "Yesterday");
  assert.equal(comparison.metrics.revenue.change, null);
  assert.equal(comparison.metrics.revenue.baselineAvailable, false);
  assert.equal(comparison.metrics.revenue.comparisonAvailable, true);
  assert.equal(comparison.metrics.orders.change, 100);
  assert.equal(comparison.metrics.averageOrder.change, 100);
  assert.equal(comparison.metrics.customers.change, 100);
});

test("comparison distinguishes missing and invalid values from a zero baseline", () => {
  for (const previous of [null, undefined, "not-a-number"]) {
    const result = calculateComparison({ revenue: 5 }, { revenue: previous }, "Prior").metrics.revenue;
    assert.equal(result.comparisonAvailable, false);
    assert.equal(result.change, null);
  }
  const unavailable = calculateComparison({}, {}, "Prior").metrics.revenue;
  assert.equal(unavailable.comparisonAvailable, false);
  assert.throws(() => normalizeAnalyticsSummary({ revenue: null, orders: 0, customers: 0 }), /unavailable/);
});

test("secondary metrics handle zero denominators and use the declared repeat-customer definitions", () => {
  assert.deepEqual(normalizeSecondaryMetrics({}, normalizeAnalyticsSummary({ revenue: 0, orders: 0, average_order: 0, customers: 0 })), {
    itemsSold: 0,
    revenuePerCustomer: 0,
    cancellationRate: null,
    cancelledOrders: 0,
    placedOrders: 0,
    returningCustomers: 0,
    repeatOrders: 0,
    itemRevenue: 0,
  });
  const metrics = normalizeSecondaryMetrics({
    items_sold: "7", item_revenue: "24.50", placed_orders: "4", cancelled_orders: "1",
    returning_customers: "1", repeat_orders: "2",
  }, { revenue: 30, customers: 3 });
  assert.equal(metrics.itemsSold, 7);
  assert.equal(metrics.revenuePerCustomer, 10);
  assert.equal(metrics.cancellationRate, 25);
  assert.equal(metrics.returningCustomers, 1);
  assert.equal(metrics.repeatOrders, 2);
});

test("category shares use total historical item revenue and preserve uncategorized performance", () => {
  const categories = buildCategoryPerformance([
    { category_id: 1, name: "Books", revenue: "60", units_sold: "3", orders: "1" },
    { category_id: null, name: "Uncategorized", revenue: "40", units_sold: "2", orders: "1" },
  ], [
    { category_id: 1, name: "Books", revenue: "30", units_sold: "2", orders: "1" },
    { category_id: null, name: "Uncategorized", revenue: "0", units_sold: "0", orders: "0" },
  ]);
  assert.equal(categories[0].revenueShare, 60);
  assert.equal(categories[0].revenueChange, 100);
  assert.equal(categories[0].unitsSold, 3);
  assert.equal(categories[0].orders, 1);
  assert.equal(categories[1].name, "Uncategorized");
  assert.equal(categories[1].revenueShare, 40);

  const noActivity = buildCategoryPerformance([], []);
  assert.deepEqual(noActivity, []);
  assert.equal(buildCategoryPerformance([{ category_id: 2, name: "Zero", revenue: 0 }])[0].revenueShare, 0);
});

test("product ranking is validated, deterministic, and based on purchase-time item prices", () => {
  const byUnits = getProductRankingQuery("units");
  const byRevenue = getProductRankingQuery("revenue");
  assert.match(byUnits, /ORDER BY units_sold DESC, item_revenue DESC, title ASC, id ASC/);
  assert.match(byRevenue, /ORDER BY item_revenue DESC, units_sold DESC, title ASC, id ASC/);
  assert.match(byUnits, /oi\.quantity \* oi\.price_at_purchase/);
  assert.doesNotMatch(byUnits, /p\.price/);
  assert.match(byUnits, /SUM\(item_revenue\) OVER \(\)/);
  assert.match(byUnits, /o\.payment_status IN \('successful','refunded'\)/);
  assert.match(byUnits, /o\.created_at >= \$1::date::timestamp/);
  assert.match(byUnits, /o\.created_at < \(\$2::date \+ 1\)::timestamp/);
  assert.throws(() => getProductRankingQuery("current_price"), RangeError);
  assert.deepEqual(normalizeRankedProducts([]), []);
  assert.equal(normalizeRankedProducts([{ sold: "2", revenue: "5", total_item_revenue: "0" }])[0].itemRevenueShare, 0);
  assert.equal(normalizeRankedProducts([{ sold: "2", revenue: "5", total_item_revenue: "20" }])[0].itemRevenueShare, 25);
});

test("sales aggregates share the paid-order date rules without multiplying order totals", () => {
  for (const name of ["summary", "categories", "secondaryMetrics", "ordersByPeriod", "revenueByPeriod", "comparison"]) {
    assert.match(analyticsQueries[name], /o\.payment_status IN \('successful','refunded'\)/, name);
    assert.match(analyticsQueries[name], /o\.created_at >= \$1::date::timestamp/, name);
    assert.match(analyticsQueries[name], /o\.created_at < \(\$2::date \+ 1\)::timestamp/, name);
  }
  assert.match(analyticsQueries.summary, /SUM\(o\.total_price\)/);
  assert.match(analyticsQueries.summary, /COUNT\(DISTINCT o\.user_id\)/);
  assert.doesNotMatch(analyticsQueries.summary, /order_status/);
  assert.match(analyticsQueries.revenueByPeriod, /SUM\(o\.total_price\)/);
  assert.match(analyticsQueries.secondaryMetrics, /oi\.quantity \* oi\.price_at_purchase/);
  assert.match(analyticsQueries.secondaryMetrics, /order_status = 'cancelled'/);
  assert.match(analyticsQueries.secondaryMetrics, /order_count > 1/);
  assert.match(analyticsQueries.secondaryMetrics, /SUM\(order_count - 1\).*repeat_orders/s);
  assert.match(analyticsQueries.refundSummary, /status='refunded' AND r\.refunded_at IS NOT NULL/);
  assert.match(analyticsQueries.paymentPerformance, /late_payment_review_required/);
  assert.match(analyticsQueries.lowStock, /stock <= 10/);
  assert.match(analyticsQueries.secondaryMetrics, /older\.created_at < \$1::date::timestamp/);
  assert.match(analyticsQueries.categories, /COUNT\(DISTINCT o\.id\)/);
  assert.match(analyticsQueries.categories, /COALESCE\(c\.name, 'Uncategorized'\)/);
  assert.match(analyticsQueries.summary, /COUNT\(o\.id\)/);
  assert.match(analyticsQueries.categories, /oi\.quantity \* oi\.price_at_purchase/);
  assert.doesNotMatch(analyticsQueries.categories, /JOIN payments/);
  assert.match(analyticsQueries.ordersByPeriod, /generate_series/i);
  assert.match(analyticsQueries.ordersByPeriod, /LEFT JOIN totals/i);
  assert.match(analyticsQueries.revenueByPeriod, /LEFT JOIN totals/i);
  assert.match(analyticsQueries.categories, /LEFT JOIN categories/i);
});
