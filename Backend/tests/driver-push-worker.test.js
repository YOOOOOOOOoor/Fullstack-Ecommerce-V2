import test from "node:test";
import assert from "node:assert/strict";
import { processDriverPushOutbox } from "../services/driverPushWorker.js";

const makeDb = (rows = [{ id: 1, assignment_id: 2, order_id: 3, driver_id: 4, attempt_count: 1 }]) => {
  const calls = [];
  return { calls, async query(sql, params = []) { calls.push({ sql, params }); return { rows: calls.length === 1 ? rows : [] }; } };
};

test("outbox skips push when assignment is no longer active", async () => {
  const db = makeDb();
  let sends = 0;
  assert.deepEqual(await processDriverPushOutbox({ db, configured: () => true, sender: async () => { sends += 1; return { skipped: "assignment_no_longer_active" }; } }), { claimed: 1 });
  assert.equal(sends, 1);
  assert.match(db.calls[1].sql, /status='skipped'/);
});

test("outbox schedules a retryable provider failure", async () => {
  const db = makeDb();
  await processDriverPushOutbox({ db, configured: () => true, sender: async () => ({ sent: 0, retryable: true }) });
  assert.match(db.calls[1].sql, /status='failed'/);
  assert.equal(db.calls[1].params[1], 15);
});

test("outbox does not claim work while Web Push is unconfigured", async () => {
  const db = makeDb();
  assert.deepEqual(await processDriverPushOutbox({ db, configured: () => false }), { claimed: 0 });
  assert.equal(db.calls.length, 0);
});
