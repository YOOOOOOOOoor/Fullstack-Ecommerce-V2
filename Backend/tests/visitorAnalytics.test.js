import assert from "node:assert/strict";
import test from "node:test";
import { validateVisitorEvent } from "../controllers/visitorAnalyticsController.js";
import router from "../routes/Trueanalytics.js";
import {
  cleanupExpiredVisitorData,
  fetchVisitorStatistics,
  recordVisitorPageView,
} from "../services/visitorAnalytics.js";

const visitorId = "3b241101-e2bb-4255-8caf-4136c566a962";

test("visitor routes keep tracking public and protect reporting with admin middleware", () => {
  const routes = router.stack.filter((layer) => layer.route).map((layer) => layer.route);
  const tracking = routes.find((route) => route.path === "/events");
  const reporting = routes.find((route) => route.path === "/visitors");
  assert.equal(tracking.methods.post, true);
  assert.equal(tracking.stack.length, 2);
  assert.equal(reporting.methods.get, true);
  assert.equal(reporting.stack.length, 4);
});

test("tracking accepts only UUID and allowlisted page key fields", () => {
  assert.equal(validateVisitorEvent({ visitorId, pageKey: "home" }), true);
  assert.equal(validateVisitorEvent({ visitorId: "bad", pageKey: "home" }), false);
  assert.equal(validateVisitorEvent({ visitorId, pageKey: "checkout" }), false);
  assert.equal(validateVisitorEvent({ visitorId, pageKey: "home", email: "private" }), false);
});

function makeRecordingDb(eventTimes) {
  const calls = [];
  const visitors = new Map();
  const sessions = [];
  const pageViews = [];
  let eventIndex = 0;
  let nextSessionId = 1;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("SELECT clock_timestamp()::text AS event_at")) {
        return { rows: [{ event_at: eventTimes[eventIndex++] }] };
      }
      if (sql.includes("INSERT INTO web_visitors")) {
        const [id, timestamp] = params;
        const prior = visitors.get(id);
        visitors.set(id, prior
          ? { ...prior, lastSeenAt: timestamp }
          : { firstSeenAt: timestamp, lastSeenAt: timestamp });
        return { rows: [{ visitor_id: id }] };
      }
      if (sql.includes("SELECT id,")) {
        const [id, eventAt, timeoutMinutes] = params;
        const latest = sessions.filter((session) => session.visitorId === id).at(-1);
        if (!latest) return { rows: [] };
        const active = Date.parse(latest.lastSeenAt) > Date.parse(eventAt) - timeoutMinutes * 60_000;
        return { rows: [{ id: latest.id, active }] };
      }
      if (sql.includes("UPDATE web_visitor_sessions")) {
        const [id, timestamp] = params;
        const session = sessions.find((candidate) => candidate.id === id);
        session.lastSeenAt = timestamp;
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO web_visitor_sessions")) {
        const [id, timestamp] = params;
        const session = { id: nextSessionId++, visitorId: id, startedAt: timestamp, lastSeenAt: timestamp };
        sessions.push(session);
        return { rows: [{ id: session.id }] };
      }
      if (sql.includes("INSERT INTO web_page_views")) {
        const [sessionId, pageKey, timestamp] = params;
        pageViews.push({ sessionId, pageKey, occurredAt: timestamp });
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() { calls.push({ sql: "RELEASE", params: [] }); },
  };
  return { db: { connect: async () => client }, calls, visitors, sessions, pageViews };
}

test("one database timestamp is reused for visitor, session, and page-view writes", async () => {
  const eventAt = "2026-11-05 09:00:00.123456+03";
  const fixture = makeRecordingDb([eventAt]);
  await recordVisitorPageView(fixture.db, { visitorId, pageKey: "home" });

  assert.deepEqual(fixture.visitors.get(visitorId), { firstSeenAt: eventAt, lastSeenAt: eventAt });
  assert.deepEqual(fixture.sessions[0], { id: 1, visitorId, startedAt: eventAt, lastSeenAt: eventAt });
  assert.deepEqual(fixture.pageViews[0], { sessionId: 1, pageKey: "home", occurredAt: eventAt });
  assert.ok(fixture.calls.some(({ sql, params }) => sql.includes("INSERT INTO web_visitors") && params[1] === eventAt));
});

for (const { label, gap, expectedSessions } of [
  { label: "29 minutes and 59 seconds reuses the session", gap: "09:29:59", expectedSessions: 1 },
  { label: "exactly 30 minutes starts a new session", gap: "09:30:00", expectedSessions: 2 },
  { label: "more than 30 minutes starts a new session", gap: "09:30:01", expectedSessions: 2 },
]) {
  test(label, async () => {
    const fixture = makeRecordingDb([
      "2026-11-05 09:00:00.000000+03",
      `2026-11-05 ${gap}.000000+03`,
    ]);
    await recordVisitorPageView(fixture.db, { visitorId, pageKey: "home" });
    await recordVisitorPageView(fixture.db, { visitorId, pageKey: "products" });
    assert.equal(fixture.sessions.length, expectedSessions);
    assert.equal(fixture.pageViews.length, 2);
  });
}

test("a failed page-view insert rolls back the visitor and session transaction", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql.trim());
      if (sql.includes("SELECT clock_timestamp()::text")) return { rows: [{ event_at: "2026-11-05 09:00:00+03" }] };
      if (sql.includes("SELECT id,")) return { rows: [] };
      if (sql.includes("INSERT INTO web_visitor_sessions")) return { rows: [{ id: 1 }] };
      if (sql.includes("INSERT INTO web_page_views")) throw new Error("page-view insert failed");
      return { rows: [] };
    },
    release() { statements.push("RELEASE"); },
  };
  await assert.rejects(recordVisitorPageView({ connect: async () => client }, { visitorId, pageKey: "home" }), /page-view insert failed/);
  assert.ok(statements.includes("ROLLBACK"));
  assert.ok(!statements.includes("COMMIT"));
});

function makeVisitorStatsDb({ sessions, pageViews }) {
  const statements = [];
  return {
    statements,
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes("business_today")) {
        return { rows: [{ business_today: "2026-11-05", first_visitor_date: "2026-11-04", history_start_date: "2026-11-04" }] };
      }
      if (sql.includes("active_visitors")) {
        const [startDate, endDate] = params;
        const selectedViews = pageViews.filter((view) => view.date >= startDate && view.date <= endDate);
        const activeVisitorIds = new Set(selectedViews.map((view) => view.visitorId));
        const totalSessions = sessions.filter((session) => session.startedDate >= startDate && session.startedDate <= endDate).length;
        return { rows: [{
          total_visitors: activeVisitorIds.size,
          new_visitors: 0,
          returning_visitors: activeVisitorIds.size,
          total_sessions: totalSessions,
          page_views: selectedViews.length,
        }] };
      }
      return { rows: [] };
    },
  };
}

test("a session started before the period does not count even when it has page views in-period", async () => {
  const db = makeVisitorStatsDb({
    sessions: [{ id: 1, startedDate: "2026-11-04" }],
    pageViews: [{ sessionId: 1, visitorId, date: "2026-11-05" }],
  });
  const report = await fetchVisitorStatistics(db, { period: "today" });
  const summaryQuery = db.statements.find(({ sql }) => sql.includes("active_visitors")).sql;
  assert.match(summaryQuery, /FROM web_visitor_sessions s\s+CROSS JOIN bounds b\s+WHERE s\.started_at >= b\.start_at AND s\.started_at < b\.end_at/);
  assert.equal(report.metrics.totalSessions, 0);
});

test("a session started in the selected period counts", async () => {
  const db = makeVisitorStatsDb({
    sessions: [{ id: 1, startedDate: "2026-11-05" }],
    pageViews: [{ sessionId: 1, visitorId, date: "2026-11-05" }],
  });
  const report = await fetchVisitorStatistics(db, { period: "today" });
  assert.equal(report.metrics.totalSessions, 1);
});

test("a session continuing into the next period is counted only where it started", async () => {
  const fixture = {
    sessions: [{ id: 1, startedDate: "2026-11-04" }],
    pageViews: [
      { sessionId: 1, visitorId, date: "2026-11-04" },
      { sessionId: 1, visitorId, date: "2026-11-05" },
    ],
  };
  const priorDay = await fetchVisitorStatistics(makeVisitorStatsDb(fixture), { period: "yesterday" });
  const currentDay = await fetchVisitorStatistics(makeVisitorStatsDb(fixture), { period: "today" });
  assert.equal(priorDay.metrics.totalSessions, 1);
  assert.equal(currentDay.metrics.totalSessions, 0);
});

test("visitor statistics aggregate each metric against local bounds without correlated aggregate references", async () => {
  const db = makeVisitorStatsDb({ sessions: [], pageViews: [] });
  await fetchVisitorStatistics(db, { range: "30" });

  const summarySql = db.statements.find(({ sql }) => sql.includes("active_visitors")).sql;
  assert.match(summarySql, /visitor_totals AS \([\s\S]*?FROM active_visitors a[\s\S]*?CROSS JOIN bounds b/);
  assert.match(summarySql, /session_totals AS \([\s\S]*?FROM web_visitor_sessions s\s+CROSS JOIN bounds b\s+WHERE s\.started_at >= b\.start_at AND s\.started_at < b\.end_at/);
  assert.match(summarySql, /page_view_totals AS \([\s\S]*?FROM web_page_views p\s+CROSS JOIN bounds b\s+WHERE p\.occurred_at >= b\.start_at AND p\.occurred_at < b\.end_at/);
  assert.match(summarySql, /FROM visitor_totals\s+CROSS JOIN session_totals\s+CROSS JOIN page_view_totals/);
  assert.doesNotMatch(summarySql, /\(SELECT COUNT\([\s\S]*?b\.start_at/);

  const trendSql = db.statements.find(({ sql }) => sql.includes("generate_series(first_bucket" )).sql;
  assert.match(trendSql, /COUNT\(DISTINCT s\.visitor_id\)::int AS visitors/);
});

function makeCleanupClient({ lockAcquired = true, failOnDelete = false } = {}) {
  const statements = [];
  let lockHeld = false;
  const client = {
    async query(sql) {
      statements.push(sql.trim());
      if (sql === "BEGIN") return { rows: [] };
      if (sql.includes("pg_try_advisory_xact_lock")) {
        if (lockAcquired) lockHeld = true;
        return { rows: [{ acquired: lockAcquired }] };
      }
      if (failOnDelete && sql.includes("DELETE FROM web_visitor_sessions")) throw new Error("cleanup failed");
      if (sql === "COMMIT" || sql === "ROLLBACK") lockHeld = false;
      return { rows: [] };
    },
    release() { statements.push("RELEASE"); },
  };
  return { client, statements, isLockHeld: () => lockHeld };
}

test("retention lock is acquired after BEGIN and successful cleanup commits and releases it", async () => {
  const fixture = makeCleanupClient();
  assert.equal(await cleanupExpiredVisitorData({ connect: async () => fixture.client }), true);
  assert.ok(fixture.statements.indexOf("BEGIN") < fixture.statements.findIndex((sql) => sql.includes("pg_try_advisory_xact_lock")));
  assert.ok(fixture.statements.includes("COMMIT"));
  assert.equal(fixture.isLockHeld(), false);
  assert.equal(fixture.statements.some((sql) => sql.includes("pg_advisory_unlock")), false);
});

test("retention cleanup skips deletes and rolls back when another worker holds the lock", async () => {
  const fixture = makeCleanupClient({ lockAcquired: false });
  assert.equal(await cleanupExpiredVisitorData({ connect: async () => fixture.client }), false);
  assert.ok(fixture.statements.includes("ROLLBACK"));
  assert.equal(fixture.statements.some((sql) => sql.startsWith("DELETE FROM")), false);
  assert.equal(fixture.isLockHeld(), false);
});

test("retention lock is released by rollback when cleanup fails", async () => {
  const fixture = makeCleanupClient({ failOnDelete: true });
  await assert.rejects(cleanupExpiredVisitorData({ connect: async () => fixture.client }), /cleanup failed/);
  assert.ok(fixture.statements.includes("ROLLBACK"));
  assert.equal(fixture.isLockHeld(), false);
  assert.equal(fixture.statements.some((sql) => sql.includes("pg_advisory_unlock")), false);
});
