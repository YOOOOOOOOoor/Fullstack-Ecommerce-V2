import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationDismissHandlers } from "../controllers/notificationController.js";

const makeResponse = () => ({
  statusCode: 200, body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("individual dismissal persists only for staff activity records", async () => {
  let query;
  const handlers = createNotificationDismissHandlers({ db: { query: async (...args) => { query = args; return { rowCount: 1, rows: [{ id: 18 }] }; } } });
  const response = makeResponse();
  let nextError;
  await handlers.dismissNotification({ params: { id: "18" } }, response, (error) => { nextError = error; });
  assert.equal(nextError, undefined);
  assert.deepEqual(response.body, { dismissed: 1 });
  assert.match(query[0], /dismissed_at=NOW\(\)/);
  assert.deepEqual(query[1], ["18"]);
  assert.match(query[0], /event_type='admin_activity'/);
  assert.doesNotMatch(query[0], /status\s*[<>]=?/);
});

test("individual dismissal rejects invalid or no-longer-visible records", async () => {
  let calls = 0;
  const handlers = createNotificationDismissHandlers({ db: { query: async () => { calls += 1; return { rowCount: 0, rows: [] }; } } });
  const invalidResponse = makeResponse();
  await handlers.dismissNotification({ params: { id: "-2" } }, invalidResponse, assert.fail);
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(calls, 0);
  const missingResponse = makeResponse();
  await handlers.dismissNotification({ params: { id: "4" } }, missingResponse, assert.fail);
  assert.equal(missingResponse.statusCode, 404);
});

test("Clear all dismisses staff activity without changing retained delivery history", async () => {
  let sql;
  const handlers = createNotificationDismissHandlers({ db: { query: async (statement) => { sql = statement; return { rowCount: 5, rows: [] }; } } });
  const response = makeResponse();
  await handlers.dismissAllNotifications({}, response, assert.fail);
  assert.deepEqual(response.body, { dismissed: 5 });
  assert.match(sql, /dismissed_at IS NULL/);
  assert.match(sql, /event_type='admin_activity'/);
  assert.doesNotMatch(sql, /status\s*[<>]=?/);
});

test("database failures are forwarded and are not reported as successful dismissals", async () => {
  const dbError = new Error("database unavailable");
  const handlers = createNotificationDismissHandlers({ db: { query: async () => { throw dbError; } } });
  const response = makeResponse();
  let nextError;
  await handlers.dismissAllNotifications({}, response, (error) => { nextError = error; });
  assert.equal(nextError, dbError);
  assert.equal(response.body, undefined);
});


