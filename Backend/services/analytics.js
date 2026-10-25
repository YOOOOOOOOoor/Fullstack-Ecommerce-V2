// Stored order timestamps are timezone-naive; retain their calendar dates.
// This timezone is used to determine today's business date, not to shift history.
export const ANALYTICS_TIME_ZONE = "Africa/Addis_Ababa";
export const SUPPORTED_ANALYTICS_RANGES = ["7", "30", "90", "365", "all"];
export const SUPPORTED_ANALYTICS_PERIODS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "last_year",
  "month",
  "quarter",
  "year",
  "custom",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function normalizeIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new TypeError("Expected a YYYY-MM-DD date");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TypeError("Invalid calendar date");
  }
  return value;
}

const dateAt = (year, monthIndex, day = 1) =>
  new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
const parts = (value) => value.split("-").map(Number);
const addDays = (value, amount) => {
  const [year, month, day] = parts(value);
  return dateAt(year, month - 1, day + amount);
};
const addMonths = (value, amount) => {
  const [year, month] = parts(value);
  return dateAt(year, month - 1 + amount, 1);
};
const monthStart = (value) => {
  const [year, month] = parts(value);
  return dateAt(year, month - 1, 1);
};
const monthEnd = (value) => addDays(addMonths(monthStart(value), 1), -1);
const yearStart = (year) => dateAt(year, 0, 1);
const yearEnd = (year) => dateAt(year, 11, 31);
const previousYearSameDay = (value) => {
  const [year, month, day] = parts(value);
  const candidate = dateAt(year - 1, month - 1, day);
  return candidate.slice(0, 7) === dateAt(year - 1, month - 1, 1).slice(0, 7)
    ? candidate
    : monthEnd(dateAt(year - 1, month - 1, 1));
};
const weekStart = (value) => {
  const [year, month, day] = parts(value);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(value, -((weekday + 6) % 7));
};
const daysBetween = (start, end) => (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS + 1;
const clampEnd = (end, today) => (end > today ? today : end);
const monthLabel = (year, month) =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1))) + ` ${year}`;

function validateYear(value) {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) throw new TypeError("Year must be YYYY");
  const year = Number(value);
  if (year < 1970 || year > 9999) throw new RangeError("Year is out of supported range");
  return year;
}

function makePeriod({ startDate, endDate, displayEndDate = endDate, label, interval, previousStartDate, previousEndDate, comparisonLabel }) {
  return {
    startDate,
    endDate,
    displayEndDate,
    label,
    interval,
    comparison: previousStartDate
      ? { startDate: previousStartDate, endDate: previousEndDate, label: comparisonLabel }
      : null,
  };
}

export function resolveAnalyticsPeriod(query, businessToday, firstOrderDate = null) {
  const today = normalizeIsoDate(businessToday);
  const period = query.period;
  if (query.range !== undefined) {
    if (period !== undefined) throw new TypeError("Use either range or period, not both");
    if (typeof query.range !== "string") throw new TypeError("Range must be a single value");
    const range = query.range;
    if (!SUPPORTED_ANALYTICS_RANGES.includes(range)) throw new RangeError("Unsupported analytics range");
    if (range === "all") {
      const startDate = firstOrderDate ? normalizeIsoDate(firstOrderDate) : null;
      if (!startDate) return { ...makePeriod({ startDate: null, endDate: today, label: "All Time", interval: "month" }), comparison: null };
      const span = daysBetween(startDate, today);
      const interval = span > 730 ? "year" : "month";
      return { ...makePeriod({ startDate, endDate: today, label: "All Time", interval }), comparison: null };
    }
    const days = Number(range);
    const startDate = addDays(today, 1 - days);
    return makePeriod({
      startDate, endDate: today, label: `Last ${days} Days`, interval: days >= 365 ? "month" : "day",
      previousStartDate: addDays(startDate, -days), previousEndDate: addDays(startDate, -1),
      comparisonLabel: `Previous ${days} days`,
    });
  }

  if (typeof period !== "string" || !SUPPORTED_ANALYTICS_PERIODS.includes(period)) {
    throw new RangeError("Unsupported analytics period");
  }

  if (period === "today") {
    return makePeriod({ startDate: today, endDate: today, label: "Today", interval: "day", previousStartDate: addDays(today, -1), previousEndDate: addDays(today, -1), comparisonLabel: "Yesterday" });
  }
  if (period === "yesterday") {
    const day = addDays(today, -1);
    return makePeriod({ startDate: day, endDate: day, label: "Yesterday", interval: "day", previousStartDate: addDays(day, -1), previousEndDate: addDays(day, -1), comparisonLabel: "Previous day" });
  }
  if (period === "this_week" || period === "last_week") {
    const currentWeekStart = weekStart(today);
    const startDate = period === "this_week" ? currentWeekStart : addDays(currentWeekStart, -7);
    const endDate = period === "this_week" ? today : addDays(currentWeekStart, -1);
    const previousStartDate = addDays(startDate, -7);
    const previousEndDate = period === "this_week"
      ? addDays(previousStartDate, daysBetween(startDate, endDate) - 1)
      : addDays(startDate, -1);
    return makePeriod({ startDate, endDate, displayEndDate: period === "this_week" ? today : endDate, label: period === "this_week" ? "This Week" : "Last Week", interval: "day", previousStartDate, previousEndDate, comparisonLabel: "Equivalent days previous week" });
  }
  if (period === "this_month" || period === "last_month") {
    const currentStart = monthStart(today);
    const startDate = period === "this_month" ? currentStart : addMonths(currentStart, -1);
    const endDate = period === "this_month" ? today : addDays(currentStart, -1);
    const previousStartDate = addMonths(startDate, -1);
    const previousEndDate = period === "this_month"
      ? clampEnd(addDays(previousStartDate, parts(today)[2] - 1), addDays(startDate, -1))
      : addDays(startDate, -1);
    return makePeriod({ startDate, endDate, displayEndDate: period === "this_month" ? monthEnd(today) : endDate, label: period === "this_month" ? "This Month" : "Last Month", interval: "day", previousStartDate, previousEndDate, comparisonLabel: period === "this_month" ? "Same dates last month" : "Previous month" });
  }
  if (period === "this_year" || period === "last_year") {
    const year = parts(today)[0] - (period === "last_year" ? 1 : 0);
    const startDate = yearStart(year);
    const endDate = period === "this_year" ? today : yearEnd(year);
    return makePeriod({ startDate, endDate, displayEndDate: yearEnd(year), label: period === "this_year" ? `This Year (${year})` : `Last Year (${year})`, interval: "month", previousStartDate: yearStart(year - 1), previousEndDate: period === "this_year" ? previousYearSameDay(today) : yearEnd(year - 1), comparisonLabel: "Previous year" });
  }

  const year = period === "custom" ? null : validateYear(query.year);
  if (period === "month") {
    if (typeof query.month !== "string" || !/^\d{1,2}$/.test(query.month)) throw new TypeError("Month must be 1 through 12");
    const month = Number(query.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new TypeError("Month must be 1 through 12");
    const startDate = dateAt(year, month - 1, 1);
    if (startDate > monthStart(today)) throw new RangeError("Future periods are not supported");
    const fullEnd = monthEnd(startDate);
    const endDate = clampEnd(fullEnd, today);
    const previousStartDate = addMonths(startDate, -1);
    const previousEndDate = endDate < fullEnd
      ? clampEnd(addDays(previousStartDate, parts(endDate)[2] - 1), addDays(startDate, -1))
      : addDays(startDate, -1);
    return makePeriod({ startDate, endDate, displayEndDate: fullEnd, label: monthLabel(year, month), interval: "day", previousStartDate, previousEndDate, comparisonLabel: `Same dates in ${monthLabel(parts(previousStartDate)[0], parts(previousStartDate)[1])}` });
  }
  if (period === "quarter") {
    if (typeof query.quarter !== "string" || !/^\d$/.test(query.quarter)) throw new TypeError("Quarter must be 1 through 4");
    const quarter = Number(query.quarter);
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new TypeError("Quarter must be 1 through 4");
    const startDate = dateAt(year, (quarter - 1) * 3, 1);
    if (startDate > monthStart(today)) throw new RangeError("Future periods are not supported");
    const fullEnd = addDays(addMonths(startDate, 3), -1);
    const endDate = clampEnd(fullEnd, today);
    const previousStartDate = addMonths(startDate, -3);
    const previousEndDate = endDate < fullEnd
      ? clampEnd(addDays(previousStartDate, daysBetween(startDate, endDate) - 1), addDays(startDate, -1))
      : addDays(startDate, -1);
    const interval = query.interval === "daily" ? "day" : "month";
    if (query.interval !== undefined && typeof query.interval !== "string") throw new TypeError("Quarter interval must be a single value");
    if (query.interval !== undefined && !["daily", "monthly"].includes(String(query.interval))) throw new TypeError("Quarter interval must be daily or monthly");
    const previousQuarterLabel = `Q${quarter === 1 ? 4 : quarter - 1} ${quarter === 1 ? year - 1 : year}`;
    const comparisonLabel = endDate < fullEnd
      ? `Equivalent elapsed period in previous quarter (${previousQuarterLabel})`
      : `Previous quarter (${previousQuarterLabel})`;
    return makePeriod({ startDate, endDate, displayEndDate: fullEnd, label: `Q${quarter} ${year}`, interval, previousStartDate, previousEndDate, comparisonLabel });
  }
  if (period === "year") {
    if (year > parts(today)[0]) throw new RangeError("Future periods are not supported");
    const endDate = clampEnd(yearEnd(year), today);
    return makePeriod({ startDate: yearStart(year), endDate, displayEndDate: yearEnd(year), label: String(year), interval: "month", previousStartDate: yearStart(year - 1), previousEndDate: endDate < yearEnd(year) ? previousYearSameDay(today) : yearEnd(year - 1), comparisonLabel: `Previous year (${year - 1})` });
  }
  if (period === "custom") {
    const startDate = normalizeIsoDate(query.startDate);
    const endDate = normalizeIsoDate(query.endDate);
    if (startDate > endDate) throw new RangeError("Start date must be on or before end date");
    if (endDate > today) throw new RangeError("Future dates are not supported");
    const duration = daysBetween(startDate, endDate);
    const interval = duration <= 90 ? "day" : duration <= 730 ? "month" : "year";
    return makePeriod({ startDate, endDate, label: `${startDate} to ${endDate}`, interval, previousStartDate: addDays(startDate, -duration), previousEndDate: addDays(startDate, -1), comparisonLabel: `Previous ${duration} days` });
  }
  throw new RangeError("Unsupported analytics period");
}

export function buildDailySeries(startDate, endDate, rows, valueKey) {
  if (!startDate) return [];
  const byDate = new Map(rows.map((row) => [normalizeIsoDate(row.date), Number(row[valueKey]) || 0]));
  const series = [];
  const lastDate = normalizeIsoDate(endDate);
  let date = normalizeIsoDate(startDate);
  while (date <= lastDate) {
    series.push({ date, periodKey: date, [valueKey]: byDate.get(date) ?? 0 });
    date = addDays(date, 1);
  }
  return series;
}

export function normalizeAnalyticsSummary(row = {}) {
  const readMetric = (value, name) => {
    if (value === null || value === undefined || value === "") throw new TypeError(`Analytics ${name} is unavailable`);
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`Analytics ${name} is invalid`);
    return number;
  };
  const revenue = readMetric(row.revenue, "revenue");
  const orders = readMetric(row.orders, "order count");
  const customers = readMetric(row.customers, "customer count");
  const averageOrder = orders > 0 ? readMetric(row.average_order, "average order") : 0;
  return { revenue, orders, averageOrder, customers };
}

export function calculateComparison(current, previous, label) {
  const changes = {};
  for (const key of ["revenue", "orders", "averageOrder", "customers"]) {
    const parseValue = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };
    const currentValue = parseValue(current?.[key]);
    const previousValue = parseValue(previous?.[key]);
    const comparisonAvailable = currentValue !== null && previousValue !== null;
    changes[key] = {
      current: currentValue,
      previous: previousValue,
      change: !comparisonAvailable || previousValue === 0 ? null : ((currentValue - previousValue) / Math.abs(previousValue)) * 100,
      baselineAvailable: comparisonAvailable && previousValue !== 0,
      comparisonAvailable,
    };
  }
  return { label, metrics: changes };
}

export function normalizeSecondaryMetrics(row = {}, summary = {}) {
  const itemsSold = Number(row.items_sold) || 0;
  const itemRevenue = Number(row.item_revenue) || 0;
  const placedOrders = Number(row.placed_orders) || 0;
  const cancelledOrders = Number(row.cancelled_orders) || 0;
  const customers = Number(summary.customers) || 0;
  return {
    itemsSold,
    revenuePerCustomer: customers > 0 ? (Number(summary.revenue) || 0) / customers : 0,
    cancellationRate: placedOrders > 0 ? (cancelledOrders / placedOrders) * 100 : null,
    cancelledOrders,
    placedOrders,
    returningCustomers: Number(row.returning_customers) || 0,
    repeatOrders: Number(row.repeat_orders) || 0,
    itemRevenue,
  };
}

export function buildCategoryPerformance(currentRows, previousRows = []) {
  const keyFor = (row) => row.category_id == null ? "uncategorized" : String(row.category_id);
  const currentByKey = new Map(currentRows.map((row) => [keyFor(row), row]));
  const previousByKey = new Map(previousRows.map((row) => [keyFor(row), row]));
  const revenueTotal = currentRows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
  const keys = new Set([...currentByKey.keys(), ...previousByKey.keys()]);

  return [...keys].map((key) => {
    const current = currentByKey.get(key) ?? {
      ...(previousByKey.get(key) ?? {}),
      revenue: 0,
      units_sold: 0,
      orders: 0,
    };
    const previous = previousByKey.get(key) ?? { revenue: 0, units_sold: 0, orders: 0 };
    const revenue = Number(current.revenue) || 0;
    const previousRevenue = Number(previous.revenue) || 0;
    return {
      ...current,
      revenue,
      unitsSold: Number(current.units_sold) || 0,
      orders: Number(current.orders) || 0,
      revenueShare: revenueTotal > 0 ? (revenue / revenueTotal) * 100 : 0,
      previousRevenue,
      revenueChange: previousRevenue > 0 ? ((revenue - previousRevenue) / previousRevenue) * 100 : null,
      previousUnitsSold: Number(previous.units_sold) || 0,
      previousOrders: Number(previous.orders) || 0,
    };
  }).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}

export function getProductRankingQuery(sort = "units") {
  if (!['units', 'revenue'].includes(sort)) throw new RangeError("Sort must be units or revenue");
  const ordering = sort === "revenue"
    ? "item_revenue DESC, units_sold DESC, title ASC, id ASC"
    : "units_sold DESC, item_revenue DESC, title ASC, id ASC";
  return `
    WITH product_sales AS (
      SELECT p.id, p.category_id, c.name AS category_name, p.image_url, p.title,
        SUM(oi.quantity)::int AS units_sold,
        SUM(oi.quantity * oi.price_at_purchase) AS item_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${PAID_ORDER_FILTER}
        AND ${ORDER_DATE_FILTER}
      GROUP BY p.id, p.category_id, c.name, p.image_url, p.title
    ), ranked_products AS (
      SELECT product_sales.*, COALESCE(SUM(item_revenue) OVER (), 0) AS total_item_revenue
      FROM product_sales
    )
    SELECT id, category_id, category_name, image_url, title, units_sold AS sold, item_revenue AS revenue,
      total_item_revenue
    FROM ranked_products
    ORDER BY ${ordering}
    LIMIT 5
  `;
}

export function normalizeRankedProducts(rows = []) {
  return rows.map((row) => {
    const revenue = Number(row.revenue) || 0;
    const totalItemRevenue = Number(row.total_item_revenue) || 0;
    return {
      ...row,
      sold: Number(row.sold) || 0,
      revenue,
      itemRevenueShare: totalItemRevenue > 0 ? (revenue / totalItemRevenue) * 100 : 0,
    };
  });
}

// Refunded orders were successfully paid before the refund. Retain them in gross
// order sales and deduct only confirmed refund amounts in the net-sales metric.
const PAID_ORDER_FILTER = "o.payment_status IN ('successful','refunded')";
const ORDER_DATE_FILTER =
  "o.created_at >= $1::date::timestamp AND o.created_at < ($2::date + 1)::timestamp";

export const analyticsQueries = {
  bounds: `
    SELECT
      ((CURRENT_TIMESTAMP AT TIME ZONE $1::text)::date)::text AS business_today,
      (MIN(created_at)::date)::text AS first_order_date
    FROM orders
  `,
  customerAccounts: `
    SELECT COUNT(*)::int AS customers
    FROM users u
    WHERE u.role='customer'
      AND NOT EXISTS (SELECT 1 FROM driver_profiles dp WHERE dp.user_id=u.id)
      AND u.created_at >= $1::date::timestamp
      AND u.created_at < ($2::date + 1)::timestamp
  `,
  customerAccountsAllTime: `
    SELECT COUNT(*)::int AS customers
    FROM users u
    WHERE u.role='customer'
      AND NOT EXISTS (SELECT 1 FROM driver_profiles dp WHERE dp.user_id=u.id)
      AND u.created_at < ($1::date + 1)::timestamp
  `,
  summary: `
    SELECT
      COALESCE(SUM(o.total_price), 0) AS revenue,
      COUNT(o.id)::int AS orders,
      COALESCE(AVG(o.total_price), 0) AS average_order,
      COUNT(DISTINCT o.user_id)::int AS customers
    FROM orders o
    WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
  `,
  revenueComponents: `
    SELECT COALESCE(SUM(o.shipping_fee), 0) AS shipping_revenue
    FROM orders o
    WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
  `,
  refundSummary: `
    SELECT
      COUNT(*) FILTER (WHERE r.status='refunded' AND r.refunded_at IS NOT NULL)::int AS confirmed_count,
      COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status='refunded' AND r.refunded_at IS NOT NULL),0) AS confirmed_amount,
      COUNT(*) FILTER (WHERE r.status IN ('requested','under_review'))::int AS pending_count,
      COUNT(*) FILTER (WHERE r.status IN ('approved','awaiting_return','return_received','refund_processing'))::int AS approved_not_completed_count
    FROM refund_requests r JOIN orders o ON o.id=r.order_id
    WHERE ${ORDER_DATE_FILTER}
  `,
  paymentPerformance: `
    SELECT
      COUNT(*) FILTER (WHERE o.payment_status IN ('successful','refunded'))::int AS successful_orders,
      COUNT(*) FILTER (WHERE o.payment_status='pending')::int AS pending_orders,
      COALESCE(SUM(o.total_price) FILTER (WHERE o.payment_status='pending'),0) AS pending_amount,
      COUNT(*) FILTER (WHERE o.payment_method='chapa' AND o.order_status='expired' AND o.payment_status IN ('pending','failed'))::int AS expired_unpaid_chapa_orders,
      COUNT(*) FILTER (WHERE o.late_payment_review_required)::int AS late_payment_review_orders
    FROM orders o WHERE ${ORDER_DATE_FILTER}
  `,
  paymentMethods: `
    SELECT o.payment_method,COUNT(*)::int AS orders,
      COUNT(*) FILTER (WHERE o.payment_status IN ('successful','refunded'))::int AS paid_orders,
      COUNT(*) FILTER (WHERE o.payment_status='pending')::int AS pending_orders,
      COALESCE(SUM(o.total_price) FILTER (WHERE o.payment_status IN ('successful','refunded')),0) AS paid_amount
    FROM orders o WHERE ${ORDER_DATE_FILTER}
    GROUP BY o.payment_method ORDER BY o.payment_method
  `,
  orderStatusBreakdown: `
    SELECT o.order_status,COUNT(*)::int AS orders
    FROM orders o WHERE ${ORDER_DATE_FILTER}
    GROUP BY o.order_status ORDER BY o.order_status
  `,
  lowStock: `
    SELECT id,title,stock,10::int AS low_stock_threshold
    FROM products WHERE stock <= 10
    ORDER BY stock,title,id LIMIT 10
  `,
  categories: `
    SELECT
      c.id AS category_id,
      COALESCE(c.name, 'Uncategorized') AS name,
      SUM(oi.quantity * oi.price_at_purchase) AS revenue,
      SUM(oi.quantity)::int AS units_sold,
      COUNT(DISTINCT o.id)::int AS orders
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
    GROUP BY c.id, c.name
    ORDER BY revenue DESC
  `,
  secondaryMetrics: `
    WITH period_orders AS (
      SELECT id, user_id, order_status
      FROM orders o
      WHERE ${ORDER_DATE_FILTER}
    ), successful_period_customers AS (
      SELECT user_id, COUNT(*) AS order_count
      FROM orders o
      WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
      GROUP BY user_id
    )
    SELECT
      COALESCE((
        SELECT SUM(oi.quantity)
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
      ), 0)::int AS items_sold,
      COALESCE((
        SELECT SUM(oi.quantity * oi.price_at_purchase)
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
      ), 0) AS item_revenue,
      COUNT(*)::int AS placed_orders,
      COUNT(*) FILTER (WHERE order_status = 'cancelled')::int AS cancelled_orders,
      COALESCE((
        SELECT SUM(order_count - 1) FROM successful_period_customers WHERE order_count > 1
      ), 0)::int AS repeat_orders,
      COALESCE((
        SELECT COUNT(*)
        FROM successful_period_customers sp
        WHERE EXISTS (
          SELECT 1 FROM orders older
          WHERE older.user_id = sp.user_id
            AND older.payment_status IN ('successful','refunded')
            AND older.created_at < $1::date::timestamp
        )
      ), 0)::int AS returning_customers
    FROM period_orders
  `,
  ordersByPeriod: `
    WITH periods AS (
      SELECT period::date AS period_key
      FROM generate_series(
        date_trunc($3::text, $1::date::timestamp),
        date_trunc($3::text, $4::date::timestamp),
        $5::interval
      ) AS series(period)
    ), totals AS (
      SELECT date_trunc($3::text, o.created_at)::date AS period_key,
        COUNT(*)::int AS orders
      FROM orders o
      WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
      GROUP BY date_trunc($3::text, o.created_at)::date
    )
    SELECT periods.period_key::text AS period_key, COALESCE(totals.orders, 0)::int AS orders
    FROM periods
    LEFT JOIN totals USING (period_key)
    ORDER BY periods.period_key
  `,
  revenueByPeriod: `
    WITH periods AS (
      SELECT period::date AS period_key
      FROM generate_series(
        date_trunc($3::text, $1::date::timestamp),
        date_trunc($3::text, $4::date::timestamp),
        $5::interval
      ) AS series(period)
    ), totals AS (
      SELECT date_trunc($3::text, o.created_at)::date AS period_key,
        SUM(o.total_price) AS revenue
      FROM orders o
      WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
      GROUP BY date_trunc($3::text, o.created_at)::date
    )
    SELECT periods.period_key::text AS period_key, COALESCE(totals.revenue, 0)::numeric AS revenue
    FROM periods
    LEFT JOIN totals USING (period_key)
    ORDER BY periods.period_key
  `,
  exportRevenueComponentsByPeriod: `
    WITH periods AS (
      SELECT period::date AS period_key
      FROM generate_series(
        date_trunc($3::text, $1::date::timestamp),
        date_trunc($3::text, $4::date::timestamp),
        $5::interval
      ) AS series(period)
    ), paid_orders AS (
      SELECT o.id, date_trunc($3::text, o.created_at)::date AS period_key,
        o.total_price, o.shipping_fee
      FROM orders o
      WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
    ), item_totals AS (
      SELECT oi.order_id, SUM(oi.quantity * oi.price_at_purchase) AS item_revenue
      FROM order_items oi JOIN paid_orders po ON po.id=oi.order_id
      GROUP BY oi.order_id
    ), refund_totals AS (
      SELECT r.order_id, SUM(r.refund_amount) AS confirmed_refunds
      FROM refund_requests r JOIN paid_orders po ON po.id=r.order_id
      WHERE r.status='refunded' AND r.refunded_at IS NOT NULL
      GROUP BY r.order_id
    ), totals AS (
      SELECT po.period_key, COUNT(*)::int AS orders,
        SUM(po.total_price) AS gross_revenue,
        SUM(COALESCE(it.item_revenue, 0)) AS item_revenue,
        SUM(po.shipping_fee) AS shipping_revenue,
        SUM(COALESCE(rt.confirmed_refunds, 0)) AS confirmed_refunds
      FROM paid_orders po
      LEFT JOIN item_totals it ON it.order_id=po.id
      LEFT JOIN refund_totals rt ON rt.order_id=po.id
      GROUP BY po.period_key
    )
    SELECT periods.period_key::text AS period_key,
      COALESCE(totals.orders, 0)::int AS orders,
      COALESCE(totals.gross_revenue, 0)::numeric AS gross_revenue,
      COALESCE(totals.confirmed_refunds, 0)::numeric AS confirmed_refunds,
      (COALESCE(totals.gross_revenue, 0) - COALESCE(totals.confirmed_refunds, 0))::numeric AS net_revenue,
      COALESCE(totals.item_revenue, 0)::numeric AS item_revenue,
      COALESCE(totals.shipping_revenue, 0)::numeric AS shipping_revenue,
      CASE WHEN COALESCE(totals.orders, 0) > 0
        THEN COALESCE(totals.gross_revenue, 0) / totals.orders ELSE 0 END::numeric AS average_order_value
    FROM periods LEFT JOIN totals USING (period_key)
    ORDER BY periods.period_key
  `,
  exportOrderDetails: `
    WITH period_orders AS (
      SELECT o.id, o.created_at, o.order_status, o.payment_status,
        o.total_price, o.shipping_fee
      FROM orders o WHERE ${ORDER_DATE_FILTER}
    ), item_totals AS (
      SELECT oi.order_id, SUM(oi.quantity * oi.price_at_purchase) AS item_subtotal,
        SUM(oi.quantity)::int AS item_count
      FROM order_items oi JOIN period_orders po ON po.id=oi.order_id
      GROUP BY oi.order_id
    ), refund_totals AS (
      SELECT r.order_id, SUM(r.refund_amount) AS confirmed_refunds
      FROM refund_requests r JOIN period_orders po ON po.id=r.order_id
      WHERE r.status='refunded' AND r.refunded_at IS NOT NULL
      GROUP BY r.order_id
    )
    SELECT po.id::text AS order_id, po.created_at::date::text AS order_date,
      to_char(po.created_at, 'YYYY-MM-DD HH24:MI:SS') AS order_timestamp,
      po.order_status, po.payment_status,
      COALESCE(it.item_subtotal, 0)::numeric AS item_subtotal,
      po.shipping_fee::numeric AS shipping_amount,
      po.total_price::numeric AS gross_order_total,
      COALESCE(rt.confirmed_refunds, 0)::numeric AS confirmed_refunds,
      CASE WHEN po.payment_status IN ('successful','refunded')
        THEN po.total_price - COALESCE(rt.confirmed_refunds, 0) ELSE NULL END::numeric AS net_revenue,
      COALESCE(it.item_count, 0)::int AS item_count
    FROM period_orders po
    LEFT JOIN item_totals it ON it.order_id=po.id
    LEFT JOIN refund_totals rt ON rt.order_id=po.id
    ORDER BY po.created_at, po.id
  `,
  comparison: `
    SELECT
      COALESCE(SUM(o.total_price), 0) AS revenue,
      COUNT(o.id)::int AS orders,
      COALESCE(AVG(o.total_price), 0) AS average_order,
      COUNT(DISTINCT o.user_id)::int AS customers
    FROM orders o
    WHERE ${PAID_ORDER_FILTER} AND ${ORDER_DATE_FILTER}
  `,
};
