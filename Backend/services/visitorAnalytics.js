import pool from "../config/db.js";
import { ANALYTICS_TIME_ZONE, resolveAnalyticsPeriod } from "./analytics.js";

export const VISITOR_RETENTION_MONTHS = 13;
export const VISITOR_SESSION_TIMEOUT_MINUTES = 30;
export const VISITOR_PAGE_KEYS = Object.freeze([
  "home",
  "products",
  "product_detail",
  "about",
  "faq",
  "support",
]);

const CHART_STEPS = Object.freeze({ day: "1 day", month: "1 month", year: "1 year" });
const RETENTION_LOCK_KEYS = [7261105, 13];

export async function recordVisitorPageView(db, { visitorId, pageKey }) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const timestampResult = await client.query("SELECT clock_timestamp()::text AS event_at");
    const eventAt = timestampResult.rows[0]?.event_at;
    if (typeof eventAt !== "string") throw new Error("Visitor event timestamp is unavailable");

    // The conflicting-row update serializes writes for this visitor until commit.
    // It prevents two simultaneous tabs from both deciding to start a session.
    await client.query(
      `INSERT INTO web_visitors(visitor_id,first_seen_at,last_seen_at)
       VALUES ($1,$2::timestamptz,$2::timestamptz)
       ON CONFLICT(visitor_id) DO UPDATE
         SET last_seen_at=GREATEST(web_visitors.last_seen_at, $2::timestamptz)
       RETURNING visitor_id`,
      [visitorId, eventAt],
    );

    const latest = await client.query(
      `SELECT id,
              last_seen_at > $2::timestamptz - ($3::int * INTERVAL '1 minute') AS active
       FROM web_visitor_sessions
       WHERE visitor_id=$1
       ORDER BY last_seen_at DESC,id DESC
       LIMIT 1
       FOR UPDATE`,
      [visitorId, eventAt, VISITOR_SESSION_TIMEOUT_MINUTES],
    );

    let sessionId;
    if (latest.rows[0]?.active) {
      sessionId = latest.rows[0].id;
      await client.query(
        `UPDATE web_visitor_sessions
         SET last_seen_at=GREATEST(last_seen_at, $2::timestamptz)
         WHERE id=$1`,
        [sessionId, eventAt],
      );
    } else {
      const created = await client.query(
        `INSERT INTO web_visitor_sessions(visitor_id,started_at,last_seen_at)
         VALUES ($1,$2::timestamptz,$2::timestamptz)
         RETURNING id`,
        [visitorId, eventAt],
      );
      sessionId = created.rows[0].id;
    }

    await client.query(
      `INSERT INTO web_page_views(session_id,page_key,occurred_at)
       VALUES ($1,$2,$3::timestamptz)`,
      [sessionId, pageKey, eventAt],
    );
    await client.query("COMMIT");
    return { sessionId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const visitorBoundsQuery = `
  SELECT
    ((CURRENT_TIMESTAMP AT TIME ZONE $1::text)::date)::text AS business_today,
    (SELECT MIN(first_seen_at AT TIME ZONE $1::text)::date::text FROM web_visitors) AS first_visitor_date,
    (SELECT MIN(occurred_at AT TIME ZONE $1::text)::date::text FROM web_page_views) AS history_start_date
`;

const visitorSummaryQuery = `
  WITH bounds AS (
    SELECT
      ($1::date::timestamp AT TIME ZONE $3::text) AS start_at,
      (($2::date + 1)::timestamp AT TIME ZONE $3::text) AS end_at
  ), active_visitors AS (
    SELECT DISTINCT s.visitor_id
    FROM web_page_views p
    JOIN web_visitor_sessions s ON s.id=p.session_id
    CROSS JOIN bounds b
    WHERE p.occurred_at >= b.start_at AND p.occurred_at < b.end_at
  ), visitor_totals AS (
    SELECT
      COUNT(*)::int AS total_visitors,
      COUNT(*) FILTER (WHERE v.first_seen_at >= b.start_at AND v.first_seen_at < b.end_at)::int AS new_visitors,
      COUNT(*) FILTER (WHERE v.first_seen_at < b.start_at)::int AS returning_visitors
    FROM active_visitors a
    JOIN web_visitors v ON v.visitor_id=a.visitor_id
    CROSS JOIN bounds b
  ), session_totals AS (
    SELECT COUNT(*)::int AS total_sessions
    FROM web_visitor_sessions s
    CROSS JOIN bounds b
    WHERE s.started_at >= b.start_at AND s.started_at < b.end_at
  ), page_view_totals AS (
    SELECT COUNT(*)::int AS page_views
    FROM web_page_views p
    CROSS JOIN bounds b
    WHERE p.occurred_at >= b.start_at AND p.occurred_at < b.end_at
  )
  SELECT
    visitor_totals.total_visitors,
    visitor_totals.new_visitors,
    visitor_totals.returning_visitors,
    session_totals.total_sessions,
    page_view_totals.page_views
  FROM visitor_totals
  CROSS JOIN session_totals
  CROSS JOIN page_view_totals
`;

const visitorTrendQuery = `
  WITH chart_bounds AS (
    SELECT
      date_trunc($3::text,$1::date::timestamp) AS first_bucket,
      date_trunc($3::text,$2::date::timestamp) AS last_bucket,
      ($1::date::timestamp AT TIME ZONE $5::text) AS start_at,
      (($2::date + 1)::timestamp AT TIME ZONE $5::text) AS end_at
  ), buckets AS (
    SELECT generate_series(first_bucket,last_bucket,$4::interval) AS bucket_start
    FROM chart_bounds
  )
  SELECT b.bucket_start::date::text AS period_key,
         COUNT(DISTINCT s.visitor_id)::int AS visitors
  FROM buckets b
  CROSS JOIN chart_bounds bounds
  LEFT JOIN web_page_views p
    ON p.occurred_at >= bounds.start_at AND p.occurred_at < bounds.end_at
   AND date_trunc($3::text,p.occurred_at AT TIME ZONE $5::text)=b.bucket_start
  LEFT JOIN web_visitor_sessions s ON s.id=p.session_id
  GROUP BY b.bucket_start
  ORDER BY b.bucket_start
`;

const emptyMetrics = () => ({
  totalVisitors: 0,
  newVisitors: 0,
  returningVisitors: 0,
  totalSessions: 0,
  pageViews: 0,
});

export async function fetchVisitorStatistics(db, query) {
  const boundsResult = await db.query(visitorBoundsQuery, [ANALYTICS_TIME_ZONE]);
  const bounds = boundsResult.rows[0];
  if (!bounds?.business_today) throw new TypeError("Visitor reporting date is unavailable");

  const period = resolveAnalyticsPeriod(query, bounds.business_today, bounds.first_visitor_date);
  const availableFrom = bounds.history_start_date;
  const partial = Boolean(period.startDate && (!availableFrom || period.startDate < availableFrom));
  const response = {
    period: {
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      interval: period.interval,
    },
    history: {
      availableFrom: availableFrom ?? null,
      availableThrough: bounds.business_today,
      retentionMonths: VISITOR_RETENTION_MONTHS,
      partial,
    },
    metrics: emptyMetrics(),
    trend: [],
  };

  if (!period.startDate || !availableFrom) return response;

  const chartStart = period.startDate < availableFrom ? availableFrom : period.startDate;
  if (chartStart > period.endDate) return response;

  const [summaryResult, trendResult] = await Promise.all([
    db.query(visitorSummaryQuery, [period.startDate, period.endDate, ANALYTICS_TIME_ZONE]),
    db.query(visitorTrendQuery, [
      chartStart,
      period.endDate,
      period.interval,
      CHART_STEPS[period.interval],
      ANALYTICS_TIME_ZONE,
    ]),
  ]);

  const summary = summaryResult.rows[0] ?? {};
  response.metrics = {
    totalVisitors: Number(summary.total_visitors) || 0,
    newVisitors: Number(summary.new_visitors) || 0,
    returningVisitors: Number(summary.returning_visitors) || 0,
    totalSessions: Number(summary.total_sessions) || 0,
    pageViews: Number(summary.page_views) || 0,
  };
  response.trend = trendResult.rows.map((row) => ({
    periodKey: row.period_key,
    visitors: Number(row.visitors) || 0,
  }));
  return response;
}

export async function cleanupExpiredVisitorData(db = pool) {
  const client = await db.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    const lockResult = await client.query(
      "SELECT pg_try_advisory_xact_lock($1,$2) AS acquired",
      RETENTION_LOCK_KEYS,
    );
    if (!lockResult.rows[0]?.acquired) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return false;
    }
    await client.query(
      `DELETE FROM web_page_views
       WHERE occurred_at < clock_timestamp() - ($1::int * INTERVAL '1 month')`,
      [VISITOR_RETENTION_MONTHS],
    );
    await client.query(
      `DELETE FROM web_visitor_sessions
       WHERE last_seen_at < clock_timestamp() - ($1::int * INTERVAL '1 month')`,
      [VISITOR_RETENTION_MONTHS],
    );
    await client.query(
      `DELETE FROM web_visitors
       WHERE last_seen_at < clock_timestamp() - ($1::int * INTERVAL '1 month')`,
      [VISITOR_RETENTION_MONTHS],
    );
    await client.query("COMMIT");
    inTransaction = false;
    return true;
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function startVisitorRetentionWorker(db = pool) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupExpiredVisitorData(db);
    } catch (error) {
      console.error("Visitor retention cleanup failed", { code: error.code ?? "unknown" });
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref?.();
  return timer;
}
