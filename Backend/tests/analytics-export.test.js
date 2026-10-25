import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import router from "../routes/Trueanalytics.js";
import protect from "../middleware/auth.js";
import admin from "../middleware/admin.js";
import pool from "../config/db.js";
import { exportAnalytics } from "../controllers/TrueanalyticsController.js";
import { createAnalyticsWorkbook, spreadsheetText } from "../services/analyticsWorkbook.js";
import { analyticsQueries, resolveAnalyticsPeriod } from "../services/analytics.js";
import { fetchAnalyticsReport } from "../services/analyticsReport.js";

const today = "2024-05-15";

const addPeriod = (value, interval) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (interval === "day") date.setUTCDate(date.getUTCDate() + 1);
  if (interval === "month") date.setUTCMonth(date.getUTCMonth() + 1);
  if (interval === "year") date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
};
const truncate = (value, interval) => {
  if (interval === "year") return `${value.slice(0, 4)}-01-01`;
  if (interval === "month") return `${value.slice(0, 7)}-01`;
  return value;
};

function makePool() {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === analyticsQueries.bounds) return { rows: [{ business_today: today, first_order_date: "2020-01-01" }] };
      if (sql === analyticsQueries.customerAccounts) return { rows: [{ customers: params[0] === "2024-05-09" ? "3" : "1" }] };
      if (sql === analyticsQueries.customerAccountsAllTime) return { rows: [{ customers: "9" }] };
      if (sql.includes("SELECT store_name FROM settings")) return { rows: [{ store_name: "Sample Store" }] };
      if (sql === analyticsQueries.lowStock) return { rows: [] };
      if (sql === analyticsQueries.revenueComponents) return { rows: [{ shipping_revenue: "0" }] };
      if (sql === analyticsQueries.refundSummary) return { rows: [{ confirmed_count: 0, confirmed_amount: "0", pending_count: 0, approved_not_completed_count: 0 }] };
      if (sql === analyticsQueries.paymentPerformance) return { rows: [{ successful_orders: 1, pending_orders: 0, pending_amount: "0", expired_unpaid_chapa_orders: 0, late_payment_review_orders: 0 }] };
      if (sql === analyticsQueries.paymentMethods) return { rows: [] };
      if (sql === analyticsQueries.orderStatusBreakdown) return { rows: [] };
      if (sql === analyticsQueries.exportRevenueComponentsByPeriod) {
        const rows = [];
        for (let date = truncate(params[0], params[2]); date <= truncate(params[3], params[2]); date = addPeriod(date, params[2])) rows.push({
          period_key: date, orders: 0, gross_revenue: "0", confirmed_refunds: "0", net_revenue: "0",
          item_revenue: "0", shipping_revenue: "0", average_order_value: "0",
        });
        return { rows };
      }
      if (sql === analyticsQueries.exportOrderDetails) return { rows: [] };
      if (sql === analyticsQueries.summary || sql === analyticsQueries.comparison) {
        return { rows: [{ revenue: "24.50", orders: "1", average_order: "24.50", customers: "1" }] };
      }
      if (sql === analyticsQueries.secondaryMetrics) return { rows: [{ items_sold: "2", item_revenue: "24.50", placed_orders: "1", cancelled_orders: "0", returning_customers: "0", repeat_orders: "0" }] };
      if (sql === analyticsQueries.categories) return { rows: [{ category_id: 1, name: "Books", revenue: "24.50", units_sold: "2", orders: "1" }] };
      if (sql.includes("FROM generate_series") && sql.includes("AS orders")) {
        const rows = [];
        for (let date = truncate(params[0], params[2]); date <= truncate(params[3], params[2]); date = addPeriod(date, params[2])) rows.push({ period_key: date, orders: 0 });
        return { rows };
      }
      if (sql.includes("FROM generate_series") && sql.includes("AS revenue")) {
        const rows = [];
        for (let date = truncate(params[0], params[2]); date <= truncate(params[3], params[2]); date = addPeriod(date, params[2])) rows.push({ period_key: date, revenue: "0" });
        return { rows };
      }
      if (sql.includes("WITH product_sales")) return { rows: [] };
      throw new Error(`Unexpected analytics query: ${sql.slice(0, 80)}`);
    },
  };
}

test("backend analytics and Excel export routes require cookie auth, admin role, and report permission", async () => {
  const analyticsRoutes = router.stack.filter((layer) => layer.route);
  for (const path of ["/", "/export"]) {
    const route = analyticsRoutes.find((layer) => layer.route.path === path).route;
    assert.deepEqual(route.stack.slice(0, 2).map((layer) => layer.handle), [protect, admin]);
  }
  const response = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  protect({ cookies: {} }, response, () => assert.fail("Unauthenticated request passed"));
  assert.equal(response.statusCode, 401);
  admin({ user: { role: "customer" } }, response, () => assert.fail("Non-admin request passed"));
  assert.equal(response.statusCode, 403);
});

test("dashboard and export share backend report resolution and qualifying sales aggregates", async () => {
  const pool = makePool();
  const query = { range: "7", sort: "revenue" };
  const dashboard = await fetchAnalyticsReport(pool, query);
  const exported = await fetchAnalyticsReport(pool, query, { includeComparisonSeries: true });
  assert.equal(dashboard.period.startDate, "2024-05-09");
  assert.deepEqual(dashboard.availableDateRange, { startDate: "2020-01-01", endDate: today });
  assert.equal(exported.period.startDate, dashboard.period.startDate);
  assert.equal(exported.revenue, dashboard.revenue);
  assert.equal(exported.orders, dashboard.orders);
  assert.equal(dashboard.newCustomers, 3);
  assert.deepEqual(dashboard.newCustomersComparison, {
    current: 3, previous: 1, change: 200, baselineAvailable: true, comparisonAvailable: true, label: "Previous 7 days",
  });
  assert.equal(exported.productSort, "revenue");
  assert.equal(exported.bestSellingProducts.length, 0);
  assert.equal(exported.revenueTrend.length, 7);
  assert.equal(exported.ordersFrequency.length, 7);
  assert.ok(exported.revenueTrend.every((row) => row.revenue === 0));
  assert.ok(exported.ordersFrequency.every((row) => row.orders === 0));
  assert.equal(pool.calls.some(({ sql, params }) => sql === analyticsQueries.summary && params[0] === "2024-05-09" && params[1] === today), true);
  assert.match(pool.calls.find(({ sql }) => sql.includes("WITH product_sales")).sql, /price_at_purchase/);
});

test("all-time report uses customer account creation counts and has no invented comparison", async () => {
  const pool = makePool();
  pool.query = async (sql, params = []) => {
    if (sql === analyticsQueries.bounds) return { rows: [{ business_today: today, first_order_date: null }] };
    if (sql === analyticsQueries.lowStock) return { rows: [] };
    if (sql === analyticsQueries.customerAccountsAllTime) return { rows: [{ customers: "17" }] };
    throw new Error(`Unexpected all-time query: ${sql.slice(0, 80)} ${params}`);
  };
  const report = await fetchAnalyticsReport(pool, { range: "all" });
  assert.equal(report.newCustomers, 17);
  assert.equal(report.newCustomersComparison, null);
  assert.equal(report.comparison, null);
  assert.equal(report.revenue, 0);
  assert.equal(report.revenueTrend.length, 0);
});

test("all-time new customers include accounts created before the first order", async () => {
  const pool = makePool();
  const report = await fetchAnalyticsReport(pool, { range: "all" });
  assert.equal(report.newCustomers, 9);
  assert.equal(pool.calls.some(({ sql }) => sql === analyticsQueries.customerAccountsAllTime), true);
  assert.equal(pool.calls.some(({ sql }) => sql === analyticsQueries.customerAccounts), false);
});

test("two successful assigned and delivered orders produce paid total, count, and average independently of a zero baseline", async () => {
  const pool = makePool();
  const originalQuery = pool.query.bind(pool);
  pool.query = async (sql, params = []) => {
    if (sql === analyticsQueries.summary || sql === analyticsQueries.comparison) {
      pool.calls.push({ sql, params });
      if (params[0] === "2024-05-01") {
        return { rows: [{ revenue: "16509", orders: "2", average_order: "8254.5", customers: "1" }] };
      }
      return { rows: [{ revenue: "0", orders: "0", average_order: "0", customers: "0" }] };
    }
    return originalQuery(sql, params);
  };
  const report = await fetchAnalyticsReport(pool, { period: "custom", startDate: "2024-05-01", endDate: "2024-05-02" });
  assert.deepEqual([report.revenue, report.orders, report.averageOrder], [16509, 2, 8254.5]);
  assert.equal(report.comparison.metrics.revenue.change, null);
  assert.equal(report.comparison.metrics.revenue.comparisonAvailable, true);
  assert.equal(report.comparison.metrics.revenue.baselineAvailable, false);
  assert.match(analyticsQueries.summary, /o\.payment_status IN \('successful','refunded'\)/);
  assert.match(analyticsQueries.summary, /SUM\(o\.total_price\)/);
  assert.doesNotMatch(analyticsQueries.summary, /order_status/);
});

test("report treats confirmed refunds as deductions and keeps comparison failures unavailable", async () => {
  const pool = makePool();
  const originalQuery = pool.query.bind(pool);
  pool.query = async (sql, params = []) => {
    if (sql === analyticsQueries.refundSummary) return { rows: [{ confirmed_count: 1, confirmed_amount: "400", pending_count: 2, approved_not_completed_count: 1 }] };
    if (sql === analyticsQueries.revenueComponents) return { rows: [{ shipping_revenue: "500" }] };
    if (sql === analyticsQueries.summary && params[0] === "2024-05-01") return { rows: [{ revenue: "1000", orders: "1", average_order: "1000", customers: "1" }] };
    if (sql === analyticsQueries.secondaryMetrics) return { rows: [{ items_sold: "2", item_revenue: "300", placed_orders: "1", cancelled_orders: "0", returning_customers: "0", repeat_orders: "0" }] };
    if (sql === analyticsQueries.comparison && params[0] === "2024-04-29") throw new Error("temporary comparison query failure");
    return originalQuery(sql, params);
  };
  const report = await fetchAnalyticsReport(pool, { period: "custom", startDate: "2024-05-01", endDate: "2024-05-02" });
  assert.equal(report.revenue, 1000);
  assert.equal(report.refundSummary.confirmedAmount, 400);
  assert.equal(report.refundSummary.netRevenue, 600);
  assert.equal(report.secondaryMetrics.shippingRevenue, 500);
  assert.equal(report.secondaryMetrics.netRevenue, 600);
  assert.equal("otherOrderAdjustments" in report.secondaryMetrics, false);
  assert.equal(report.comparison, null);
  assert.equal(report.comparisonUnavailable, true);
});

test("dashboard chart ranges preserve seven days, thirty days, and rolling 365 days", async () => {
  for (const [range, days, interval] of [["7", 7, "day"], ["30", 30, "day"], ["365", 365, "month"]]) {
    const report = await fetchAnalyticsReport(makePool(), { range });
    assert.equal(report.period.interval, interval);
    assert.equal(report.period.endDate, today);
    if (range !== "365") assert.equal(report.revenueTrend.length, days);
    else assert.ok(report.revenueTrend.length >= 12 && report.revenueTrend.length <= 13);
  }
});

test("selected custom, monthly, quarterly, and yearly filters define report and trend periods", async () => {
  const cases = [
    [{ period: "custom", startDate: "2024-04-01", endDate: "2024-04-03" }, ["2024-04-01", "2024-04-03", "day"]],
    [{ period: "month", month: "4", year: "2024" }, ["2024-04-01", "2024-04-30", "day"]],
    [{ period: "quarter", quarter: "2", year: "2024", interval: "monthly" }, ["2024-04-01", "2024-05-15", "month"]],
    [{ period: "quarter", quarter: "1", year: "2024", interval: "daily" }, ["2024-01-01", "2024-03-31", "day"]],
    [{ period: "year", year: "2023" }, ["2023-01-01", "2023-12-31", "month"]],
  ];
  for (const [query, expected] of cases) {
    const period = resolveAnalyticsPeriod(query, today);
    const report = await fetchAnalyticsReport(makePool(), query, { includeComparisonSeries: true });
    assert.deepEqual([report.period.startDate, report.period.endDate, report.period.interval], expected);
    assert.equal(report.revenueTrend.length, period.interval === "day"
      ? Math.round((Date.parse(`${period.endDate}T00:00:00Z`) - Date.parse(`${period.startDate}T00:00:00Z`)) / 86400000) + 1
      : period.interval === "month"
        ? (Number(period.endDate.slice(0, 4)) - Number(period.startDate.slice(0, 4))) * 12 + Number(period.endDate.slice(5, 7)) - Number(period.startDate.slice(5, 7)) + 1
        : Number(period.endDate.slice(0, 4)) - Number(period.startDate.slice(0, 4)) + 1);
    assert.ok(report.comparison);
    assert.ok(report.comparisonSeries);
  }
});

test("partial quarter comparison dates and label describe an equivalent elapsed period", () => {
  const period = resolveAnalyticsPeriod({ period: "quarter", quarter: "4", year: "2026", interval: "monthly" }, "2026-10-25");
  assert.deepEqual([period.startDate, period.endDate], ["2026-10-01", "2026-10-25"]);
  assert.deepEqual([period.comparison.startDate, period.comparison.endDate], ["2026-07-01", "2026-07-25"]);
  assert.equal(period.comparison.label, "Equivalent elapsed period in previous quarter (Q3 2026)");
});

test("Excel workbook has required sheets, metrics, zero intervals, category and product columns", async () => {
  const report = await fetchAnalyticsReport(makePool(), { period: "custom", startDate: "2024-05-01", endDate: "2024-05-02" }, { includeComparisonSeries: true, includeExportData: true });
  report.storeName = "=HYPERLINK(\"https://example.invalid\")";
  report.revenueByCategory[0].name = "@SUM(A1)";
  report.bestSellingProducts = [{ title: "+cmd|x", sold: 2, revenue: 24.5, itemRevenueShare: 100 }];
  report.exportRevenueTrend.reverse();
  const buffer = await createAnalyticsWorkbook(report, new Date("2024-05-16T00:00:00.000Z"));
  assert.ok(Buffer.from(buffer).subarray(0, 2).equals(Buffer.from("PK")));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Overview", "Revenue Trend", "Products", "Categories", "Order Details", "Definitions & Metadata"]);
  assert.equal(workbook.getWorksheet("Overview").getCell("B15").value, 24.5);
  assert.equal(workbook.getWorksheet("Overview").getCell("B15").numFmt, '"ETB" #,##0.00;[Red]("ETB" #,##0.00)');
  assert.equal(workbook.getWorksheet("Revenue Trend").getCell("A5").value instanceof Date, true);
  assert.equal(workbook.getWorksheet("Revenue Trend").getCell("A5").value.toISOString().slice(0, 10), "2024-05-01");
  assert.equal(workbook.getWorksheet("Revenue Trend").getCell("A6").value.toISOString().slice(0, 10), "2024-05-02");
  assert.equal(Object.hasOwn(workbook.getWorksheet("Revenue Trend").tables, "RevenueTrend"), true);
  assert.equal(workbook.getWorksheet("Revenue Trend").getCell("C5").value, 0);
  assert.equal(workbook.getWorksheet("Revenue Trend").getCell("C5").numFmt, '"ETB" #,##0.00;[Red]("ETB" #,##0.00)');
  assert.equal(workbook.getWorksheet("Definitions & Metadata").getCell("B6").value, "'=HYPERLINK(\"https://example.invalid\")");
  assert.equal(workbook.getWorksheet("Categories").getCell("B5").value, "'@SUM(A1)");
  assert.equal(workbook.getWorksheet("Products").getCell("C5").value, "'+cmd|x");
  assert.equal(workbook.getWorksheet("Overview").getCell("B17").value, 1);
  assert.equal(workbook.getWorksheet("Overview").getCell("B17").numFmt, "#,##0");
});

test("workbook maps nine orders and ten items as counts, not ETB currency", async () => {
  const report = await fetchAnalyticsReport(makePool(), { period: "custom", startDate: "2024-05-01", endDate: "2024-05-02" });
  report.orders = 9;
  report.secondaryMetrics.itemsSold = 10;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await createAnalyticsWorkbook(report, new Date("2024-05-16T00:00:00.000Z")));
  const overview = workbook.getWorksheet("Overview");
  assert.equal(overview.getCell("B17").value, 9);
  assert.equal(overview.getCell("B17").numFmt, "#,##0");
  assert.equal(overview.getCell("B20").value, 10);
  assert.equal(overview.getCell("B20").numFmt, "#,##0");
  assert.equal(overview.getCell("B18").numFmt, '"ETB" #,##0.00;[Red]("ETB" #,##0.00)');
});

test("order detail export reconciles gross, confirmed refund, and net values without converting IDs", async () => {
  const db = makePool();
  const baseQuery = db.query.bind(db);
  let orderDetailParams;
  db.query = async (sql, params = []) => {
    if (sql === analyticsQueries.summary || sql === analyticsQueries.comparison) return { rows: [{ revenue: "100", orders: "1", average_order: "100", customers: "1" }] };
    if (sql === analyticsQueries.secondaryMetrics) return { rows: [{ items_sold: "10", item_revenue: "80", placed_orders: "1", cancelled_orders: "0", returning_customers: "0", repeat_orders: "0" }] };
    if (sql === analyticsQueries.revenueComponents) return { rows: [{ shipping_revenue: "20" }] };
    if (sql === analyticsQueries.refundSummary) return { rows: [{ confirmed_count: 1, confirmed_amount: "10", pending_count: 0, approved_not_completed_count: 0 }] };
    if (sql === analyticsQueries.exportRevenueComponentsByPeriod) return { rows: [{
      period_key: "2024-05-01", orders: 1, gross_revenue: "100", confirmed_refunds: "10", net_revenue: "90",
      item_revenue: "80", shipping_revenue: "20", average_order_value: "100",
    }] };
    if (sql === analyticsQueries.exportOrderDetails) { orderDetailParams = params; return { rows: [{
      order_id: "0007", order_date: "2024-05-01", order_timestamp: "2024-05-01 09:30:00",
      order_status: "delivered", payment_status: "successful", item_subtotal: "80", shipping_amount: "20",
      gross_order_total: "100", confirmed_refunds: "10", net_revenue: "90", item_count: 10,
    }] }; }
    return baseQuery(sql, params);
  };
  const report = await fetchAnalyticsReport(db, { period: "custom", startDate: "2024-05-01", endDate: "2024-05-02" }, { includeExportData: true });
  assert.equal(report.secondaryMetrics.netRevenue, report.revenue - report.refundSummary.confirmedAmount);
  assert.equal(report.orderDetails[0].net_revenue, 90);
  assert.deepEqual(orderDetailParams, ["2024-05-01", "2024-05-02"]);
  assert.doesNotMatch(analyticsQueries.exportOrderDetails, /\b(address|phone|email|password|token|tx_ref)\b/i);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await createAnalyticsWorkbook(report));
  const trend = workbook.getWorksheet("Revenue Trend");
  assert.equal(trend.getCell("C5").value, 100);
  assert.equal(trend.getCell("D5").value, 10);
  assert.equal(trend.getCell("E5").value, 90);
  const orders = workbook.getWorksheet("Order Details");
  assert.equal(orders.getCell("A5").value, "0007");
  assert.equal(typeof orders.getCell("A5").value, "string");
  assert.equal(orders.getCell("B5").value instanceof Date, true);
  assert.equal(orders.getCell("C5").value instanceof Date, true);
  assert.equal(orders.getCell("J5").value, 90);
  assert.equal(orders.getCell("K5").numFmt, "#,##0");
});

test("empty all-time datasets return a valid metadata workbook and text cannot inject formulas", async () => {
  const pool = makePool();
  pool.query = async (sql) => {
    if (sql === analyticsQueries.bounds) return { rows: [{ business_today: today, first_order_date: null }] };
    if (sql === analyticsQueries.customerAccountsAllTime) return { rows: [{ customers: 0 }] };
    if (sql.includes("SELECT store_name FROM settings")) return { rows: [] };
    if (sql === analyticsQueries.lowStock) return { rows: [] };
    throw new Error("Unexpected query for empty history");
  };
  const report = await fetchAnalyticsReport(pool, { range: "all" });
  assert.equal(report.period.startDate, null);
  assert.deepEqual(report.availableDateRange, { startDate: today, endDate: today });
  assert.equal(report.revenueTrend.length, 0);
  assert.equal(spreadsheetText("=1+1"), "'=1+1");
  assert.equal(spreadsheetText("\u0000@SUM(A1)"), "'@SUM(A1)");
  assert.equal(spreadsheetText("  =SUM(A1)"), "'  =SUM(A1)");
  assert.equal(spreadsheetText("Normal"), "Normal");
  const buffer = await createAnalyticsWorkbook(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets.length, 6);
  assert.equal(workbook.getWorksheet("Revenue Trend").rowCount, 4);
  assert.equal(workbook.getWorksheet("Order Details").rowCount, 4);
});

test("export endpoint returns a real workbook for exact filters and safe errors for invalid filters or query failures", async () => {
  const originalQuery = pool.query;
  const headers = {};
  const res = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(values) { Object.assign(headers, values); return this; },
    send(buffer) { this.body = buffer; return this; },
    json(body) { this.body = body; return this; },
  };
  try {
    const mock = makePool();
    pool.query = mock.query.bind(mock);
    await exportAnalytics({ query: { period: "custom", startDate: "2024-05-01", endDate: "2024-05-02", sort: "revenue" } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(headers["Content-Type"], /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    assert.match(headers["Content-Disposition"], /store-analytics-2024-05-01-to-2024-05-02\.xlsx/);
    assert.ok(Buffer.from(res.body).subarray(0, 2).equals(Buffer.from("PK")));
    assert.ok(mock.calls.some(({ sql, params }) => sql === analyticsQueries.summary && params[0] === "2024-05-01" && params[1] === "2024-05-02"));

    res.body = null;
    await exportAnalytics({ query: { range: "7", period: "today" } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Filter parameters do not match the selected report period");

    pool.query = async () => { throw new Error("database credential details must not escape"); };
    await exportAnalytics({ query: { range: "7" } }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Analytics export could not be generated" });
  } finally {
    pool.query = originalQuery;
  }
});

