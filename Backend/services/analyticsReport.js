import {
  ANALYTICS_TIME_ZONE,
  analyticsQueries,
  buildCategoryPerformance,
  calculateComparison,
  getProductRankingQuery,
  normalizeAnalyticsSummary,
  normalizeIsoDate,
  normalizeRankedProducts,
  normalizeSecondaryMetrics,
  resolveAnalyticsPeriod,
} from "./analytics.js";

const INTERVAL_STEPS = { day: "1 day", month: "1 month", year: "1 year" };
const dateRows = (result, metric) => result.rows.map((row) => ({
  date: normalizeIsoDate(row.period_key),
  periodKey: normalizeIsoDate(row.period_key),
  [metric]: Number(row[metric]) || 0,
}));

const emptySummary = normalizeAnalyticsSummary({ revenue: 0, orders: 0, average_order: 0, customers: 0 });

export async function fetchAnalyticsReport(pool, query, {
  includeComparisonSeries = false,
  includeStoreName = false,
  includeExportData = false,
} = {}) {
  if (query.sort !== undefined && typeof query.sort !== "string") throw new TypeError("Sort must be a single value");
  const productSort = query.sort ?? "units";
  const productQuery = getProductRankingQuery(productSort);
  const boundsResult = await pool.query(analyticsQueries.bounds, [ANALYTICS_TIME_ZONE]);
  const bounds = boundsResult.rows[0];
  const period = resolveAnalyticsPeriod(query, bounds.business_today, bounds.first_order_date);
  const report = {
    ...emptySummary,
    revenueByCategory: [],
    secondaryMetrics: {
      ...normalizeSecondaryMetrics(),
      shippingRevenue: 0,
      netRevenue: 0,
    },
    ordersFrequency: [],
    revenueTrend: [],
    bestSellingProducts: [],
    period: {
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      displayEndDate: period.displayEndDate,
      interval: period.interval,
      comparison: period.comparison ? { ...period.comparison } : null,
    },
    availableDateRange: {
      startDate: bounds.first_order_date && normalizeIsoDate(bounds.first_order_date) <= normalizeIsoDate(bounds.business_today)
        ? normalizeIsoDate(bounds.first_order_date)
        : normalizeIsoDate(bounds.business_today),
      endDate: bounds.business_today,
    },
    comparison: null,
    comparisonUnavailable: false,
    newCustomers: 0,
    newCustomersComparison: null,
    comparisonSeries: null,
    paymentPerformance: {
      successfulOrders: 0, pendingOrders: 0, pendingAmount: 0,
      expiredUnpaidChapaOrders: 0, latePaymentReviewOrders: 0,
      paymentSuccessRate: null,
      paymentSuccessRateUnavailableReason: "The payment table does not distinguish initialized provider attempts from locally created records.",
      methods: [],
    },
    orderStatusBreakdown: [],
    refundSummary: { confirmedCount: 0, confirmedAmount: 0, pendingCount: 0, approvedNotCompletedCount: 0 },
    lowStockProducts: [],
    productSort,
    storeName: null,
    exportRevenueTrend: [],
    orderDetails: [],
  };
  if (includeStoreName) {
    const storeResult = await pool.query("SELECT store_name FROM settings ORDER BY id ASC LIMIT 1");
    report.storeName = storeResult.rows[0]?.store_name ?? null;
  }
  const lowStockResult = await pool.query(analyticsQueries.lowStock);
  report.lowStockProducts = lowStockResult.rows.map((row) => ({
    ...row,
    stock: Number(row.stock),
    low_stock_threshold: Number(row.low_stock_threshold),
  }));
  const customerResult = query.range === "all" || !period.startDate
    ? await pool.query(analyticsQueries.customerAccountsAllTime, [period.endDate])
    : await pool.query(analyticsQueries.customerAccounts, [period.startDate, period.endDate]);
  report.newCustomers = Number(customerResult.rows[0]?.customers) || 0;
  if (!period.startDate) return report;

  const currentParams = [period.startDate, period.endDate];
  const seriesParams = [period.startDate, period.endDate, period.interval, period.endDate, INTERVAL_STEPS[period.interval]];
  const [summaryResult, secondaryResult, categoriesResult, ordersResult, revenueResult, productsResult,
    revenueComponentsResult, refundResult, paymentResult, methodResult, statusResult,
    exportTrendResult, orderDetailsResult] = await Promise.all([
    pool.query(analyticsQueries.summary, currentParams),
    pool.query(analyticsQueries.secondaryMetrics, currentParams),
    pool.query(analyticsQueries.categories, currentParams),
    pool.query(analyticsQueries.ordersByPeriod, seriesParams),
    pool.query(analyticsQueries.revenueByPeriod, seriesParams),
    pool.query(productQuery, currentParams),
    pool.query(analyticsQueries.revenueComponents, currentParams),
    pool.query(analyticsQueries.refundSummary, currentParams),
    pool.query(analyticsQueries.paymentPerformance, currentParams),
    pool.query(analyticsQueries.paymentMethods, currentParams),
    pool.query(analyticsQueries.orderStatusBreakdown, currentParams),
    includeExportData
      ? pool.query(analyticsQueries.exportRevenueComponentsByPeriod, seriesParams)
      : Promise.resolve(null),
    includeExportData
      ? pool.query(analyticsQueries.exportOrderDetails, currentParams)
      : Promise.resolve(null),
  ]);
  const summary = normalizeAnalyticsSummary(summaryResult.rows[0]);
  if (!secondaryResult.rows[0]) throw new TypeError("Analytics secondary metrics are unavailable");
  const secondaryMetrics = normalizeSecondaryMetrics(secondaryResult.rows[0], summary);
  let previousSummary = null;
  let previousCategories = [];
  let comparisonSeries = null;
  let newCustomersComparison = null;
  let comparisonUnavailable = false;
  if (period.comparison) {
    const comparisonParams = [period.comparison.startDate, period.comparison.endDate];
    try {
      const [comparisonResult, previousCategoriesResult, previousCustomersResult] = await Promise.all([
        pool.query(analyticsQueries.comparison, comparisonParams),
        pool.query(analyticsQueries.categories, comparisonParams),
        pool.query(analyticsQueries.customerAccounts, comparisonParams),
      ]);
      if (!comparisonResult.rows[0] || !previousCategoriesResult.rows) throw new Error("Comparison results are incomplete");
      previousSummary = normalizeAnalyticsSummary(comparisonResult.rows[0]);
      previousCategories = previousCategoriesResult.rows;
      const previousCustomers = Number(previousCustomersResult.rows[0]?.customers) || 0;
      newCustomersComparison = {
        current: report.newCustomers,
        previous: previousCustomers,
        change: previousCustomers === 0 ? null : ((report.newCustomers - previousCustomers) / previousCustomers) * 100,
        baselineAvailable: previousCustomers !== 0,
        comparisonAvailable: true,
        label: period.comparison.label,
      };
      if (includeComparisonSeries) {
        const previousSeriesParams = [period.comparison.startDate, period.comparison.endDate, period.interval, period.comparison.endDate, INTERVAL_STEPS[period.interval]];
        const [previousOrders, previousRevenue] = await Promise.all([
          pool.query(analyticsQueries.ordersByPeriod, previousSeriesParams),
          pool.query(analyticsQueries.revenueByPeriod, previousSeriesParams),
        ]);
        comparisonSeries = {
          orders: dateRows(previousOrders, "orders"),
          revenue: dateRows(previousRevenue, "revenue"),
        };
      }
    } catch {
      previousSummary = null;
      previousCategories = [];
      comparisonSeries = null;
      newCustomersComparison = { current: report.newCustomers, previous: null, change: null, baselineAvailable: false, comparisonAvailable: false, label: period.comparison.label };
      comparisonUnavailable = true;
    }
  }

  const refundRow = refundResult.rows[0] || {};
  const refundSummary = {
    confirmedCount: Number(refundRow.confirmed_count) || 0,
    confirmedAmount: Number(refundRow.confirmed_amount) || 0,
    pendingCount: Number(refundRow.pending_count) || 0,
    approvedNotCompletedCount: Number(refundRow.approved_not_completed_count) || 0,
  };
  const paymentRow = paymentResult.rows[0] || {};
  const paymentPerformance = {
    successfulOrders: Number(paymentRow.successful_orders) || 0,
    pendingOrders: Number(paymentRow.pending_orders) || 0,
    pendingAmount: Number(paymentRow.pending_amount) || 0,
    expiredUnpaidChapaOrders: Number(paymentRow.expired_unpaid_chapa_orders) || 0,
    latePaymentReviewOrders: Number(paymentRow.late_payment_review_orders) || 0,
    paymentSuccessRate: null,
    paymentSuccessRateUnavailableReason: "The payment table does not distinguish initialized provider attempts from locally created records.",
    methods: methodResult.rows.map((row) => ({
      method: row.payment_method,
      orders: Number(row.orders) || 0,
      paidOrders: Number(row.paid_orders) || 0,
      pendingOrders: Number(row.pending_orders) || 0,
      paidAmount: Number(row.paid_amount) || 0,
    })),
  };
  const shippingRevenue = Number(revenueComponentsResult.rows[0]?.shipping_revenue) || 0;

  Object.assign(report, summary, {
    revenueByCategory: buildCategoryPerformance(categoriesResult.rows, previousCategories),
    secondaryMetrics,
    ordersFrequency: dateRows(ordersResult, "orders"),
    revenueTrend: dateRows(revenueResult, "revenue"),
    bestSellingProducts: normalizeRankedProducts(productsResult.rows),
    exportRevenueTrend: exportTrendResult ? exportTrendResult.rows.map((row) => ({
      periodKey: normalizeIsoDate(row.period_key),
      orders: Number(row.orders) || 0,
      grossRevenue: Number(row.gross_revenue) || 0,
      confirmedRefunds: Number(row.confirmed_refunds) || 0,
      netRevenue: Number(row.net_revenue) || 0,
      itemRevenue: Number(row.item_revenue) || 0,
      shippingRevenue: Number(row.shipping_revenue) || 0,
      averageOrderValue: Number(row.average_order_value) || 0,
    })) : [],
    orderDetails: orderDetailsResult ? orderDetailsResult.rows.map((row) => ({
      ...row,
      item_subtotal: Number(row.item_subtotal) || 0,
      shipping_amount: Number(row.shipping_amount) || 0,
      gross_order_total: Number(row.gross_order_total) || 0,
      confirmed_refunds: Number(row.confirmed_refunds) || 0,
      net_revenue: row.net_revenue === null ? null : Number(row.net_revenue) || 0,
      item_count: Number(row.item_count) || 0,
    })) : [],
    comparison: previousSummary ? calculateComparison(summary, previousSummary, period.comparison.label) : null,
    comparisonUnavailable,
    newCustomersComparison,
    comparisonSeries,
    paymentPerformance,
    orderStatusBreakdown: statusResult.rows.map((row) => ({ status: row.order_status, orders: Number(row.orders) || 0 })),
    refundSummary: {
      ...refundSummary,
      netRevenue: summary.revenue - refundSummary.confirmedAmount,
    },
    secondaryMetrics: {
      ...secondaryMetrics,
      shippingRevenue,
      netRevenue: summary.revenue - refundSummary.confirmedAmount,
    },
  });
  return report;
}

