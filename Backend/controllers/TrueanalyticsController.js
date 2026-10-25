import pool from "../config/db.js";
import { fetchAnalyticsReport } from "../services/analyticsReport.js";
import { createAnalyticsWorkbook } from "../services/analyticsWorkbook.js";

const EXPORT_QUERY_KEYS = new Set(["range", "period", "month", "quarter", "year", "startDate", "endDate", "interval", "sort"]);

const validateExportQuery = (query) => {
  for (const [key, value] of Object.entries(query)) {
    if (!EXPORT_QUERY_KEYS.has(key)) throw new TypeError("Unsupported analytics export filter");
    if (typeof value !== "string") throw new TypeError("Analytics filters must be single values");
  }
  const common = new Set(["sort"]);
  let allowed = common;
  if (query.range !== undefined) {
    allowed = new Set([...common, "range"]);
  } else if (["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_year", "last_year"].includes(query.period)) {
    allowed = new Set([...common, "period"]);
  } else if (query.period === "month") {
    allowed = new Set([...common, "period", "month", "year"]);
  } else if (query.period === "quarter") {
    allowed = new Set([...common, "period", "quarter", "year", "interval"]);
  } else if (query.period === "year") {
    allowed = new Set([...common, "period", "year"]);
  } else if (query.period === "custom") {
    allowed = new Set([...common, "period", "startDate", "endDate"]);
  }
  if (Object.keys(query).some((key) => !allowed.has(key))) {
    throw new TypeError("Filter parameters do not match the selected report period");
  }
  if (query.interval !== undefined && query.period !== "quarter") {
    throw new TypeError("Interval is only supported for quarter reports");
  }
};

const safeFilenameDate = (value) => String(value ?? "all-time").replace(/[^\w-]/g, "-");

export const getAnalytics = async (req, res, next) => {
  try {
    const dashboardReport = { ...await fetchAnalyticsReport(pool, req.query) };
    delete dashboardReport.comparisonSeries;
    delete dashboardReport.storeName;
    return res.status(200).json(dashboardReport);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
};

export const exportAnalytics = async (req, res) => {
  let report;
  try {
    validateExportQuery(req.query);
    report = await fetchAnalyticsReport(pool, req.query, {
      includeComparisonSeries: true,
      includeStoreName: true,
      includeExportData: true,
    });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Analytics export failed");
    return res.status(500).json({ message: "Analytics export could not be generated" });
  }

  try {
    const buffer = await createAnalyticsWorkbook(report);
    const start = safeFilenameDate(report.period.startDate);
    const end = safeFilenameDate(report.period.endDate);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="store-analytics-${start}-to-${end}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return res.status(200).send(Buffer.from(buffer));
  } catch {
    console.error("Analytics export failed");
    return res.status(500).json({ message: "Analytics export could not be generated" });
  }
};
