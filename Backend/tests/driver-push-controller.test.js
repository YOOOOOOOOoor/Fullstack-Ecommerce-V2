import assert from "node:assert/strict";
import test from "node:test";
import pool from "../config/db.js";
import { getDriverPushConfig, getDriverPushSubscriptionStatus, registerDriverPushSubscription, removeDriverPushSubscription } from "../controllers/driverPushController.js";

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/valid-token", expirationTime: null, keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } };

test("push config returns only the public key and reports incomplete setup safely", (t) => {
  const previous = { publicKey: process.env.WEB_PUSH_PUBLIC_KEY, privateKey: process.env.WEB_PUSH_PRIVATE_KEY, subject: process.env.WEB_PUSH_SUBJECT };
  process.env.WEB_PUSH_PUBLIC_KEY = "A".repeat(87); process.env.WEB_PUSH_PRIVATE_KEY = "B".repeat(43); process.env.WEB_PUSH_SUBJECT = "mailto:push@example.test";
  t.after(() => { for (const [key, value] of Object.entries({ WEB_PUSH_PUBLIC_KEY: previous.publicKey, WEB_PUSH_PRIVATE_KEY: previous.privateKey, WEB_PUSH_SUBJECT: previous.subject })) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const res = response(); getDriverPushConfig({}, res);
  assert.deepEqual(res.body, { supported: true, publicKey: "A".repeat(87) });
  assert.equal(JSON.stringify(res.body).includes("PRIVATE"), false);
});

test("subscription writes require a supported push endpoint and valid encryption keys", async (t) => {
  const previous = { publicKey: process.env.WEB_PUSH_PUBLIC_KEY, privateKey: process.env.WEB_PUSH_PRIVATE_KEY, subject: process.env.WEB_PUSH_SUBJECT };
  process.env.WEB_PUSH_PUBLIC_KEY = "A".repeat(87); process.env.WEB_PUSH_PRIVATE_KEY = "B".repeat(43); process.env.WEB_PUSH_SUBJECT = "mailto:push@example.test";
  t.after(() => { for (const [key, value] of Object.entries({ WEB_PUSH_PUBLIC_KEY: previous.publicKey, WEB_PUSH_PRIVATE_KEY: previous.privateKey, WEB_PUSH_SUBJECT: previous.subject })) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const calls = [];
  t.mock.method(pool, "query", async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; });
  const res = response();
  await registerDriverPushSubscription({ user: { id: 26 }, body: subscription }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.registered, true);
  assert.equal(calls[0].values[0], 26);
  assert.equal(calls[0].values[1], subscription.endpoint);
  assert.match(calls[0].sql, /ON CONFLICT\(endpoint\) DO UPDATE/);

  calls.length = 0;
  const rejected = response();
  await registerDriverPushSubscription({ user: { id: 26 }, body: { ...subscription, endpoint: "https://127.0.0.1/secret" } }, rejected, assert.fail);
  assert.equal(rejected.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("subscription status and removal are scoped to the authenticated driver", async (t) => {
  const calls = [];
  t.mock.method(pool, "query", async (sql, values) => { calls.push({ sql, values }); return { rows: [{ ok: 1 }] }; });
  const status = response();
  await getDriverPushSubscriptionStatus({ user: { id: 8 }, body: { endpoint: subscription.endpoint } }, status, assert.fail);
  assert.deepEqual(status.body, { registered: true });
  assert.deepEqual(calls[0].values, [8, subscription.endpoint]);
  assert.match(calls[0].sql, /driver_id=\$1 AND endpoint=\$2/);

  const removed = response();
  await removeDriverPushSubscription({ user: { id: 8 }, body: { endpoint: subscription.endpoint } }, removed, assert.fail);
  assert.match(calls[1].sql, /DELETE FROM driver_push_subscriptions WHERE driver_id=\$1 AND endpoint=\$2/);
  assert.deepEqual(calls[1].values, [8, subscription.endpoint]);
});
