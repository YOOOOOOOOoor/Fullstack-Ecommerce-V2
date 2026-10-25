import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationDismissHandlers } from "../controllers/notificationController.js";

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("individual dismissal is restricted to staff activity records", async () => {
  let query;
  const handlers = createNotificationDismissHandlers({ db: { async query(sql, values) { query = { sql, values }; return { rowCount: 1, rows: [{ id: 5 }] }; } } });
  const res = response();
  await handlers.dismissNotification({ params: { id: "5" } }, res, assert.fail);
  assert.equal(res.body.dismissed, 1);
  assert.match(query.sql, /event_type='admin_activity'/);
  assert.doesNotMatch(query.sql, /status\s*[<>]=?/);
});

test("Clear all dismisses staff activity and leaves historical email rows untouched", async () => {
  let query;
  const handlers = createNotificationDismissHandlers({ db: { async query(sql) { query = sql; return { rowCount: 3 }; } } });
  const res = response();
  await handlers.dismissAllNotifications({}, res, assert.fail);
  assert.equal(res.body.dismissed, 3);
  assert.match(query, /event_type='admin_activity'/);
  assert.doesNotMatch(query, /status\s*[<>]=?/);
});
