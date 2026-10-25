import assert from "node:assert/strict";
import test from "node:test";
import { allowedPushEndpoint, isWebPushConfigured, sendDriverAssignmentPush } from "../services/driverPush.js";

const env = { WEB_PUSH_PUBLIC_KEY: "A".repeat(87), WEB_PUSH_PRIVATE_KEY: "B".repeat(43), WEB_PUSH_SUBJECT: "mailto:push@example.test" };

test("push credentials require both valid VAPID keys and a contact subject", () => {
  assert.equal(isWebPushConfigured(env), true);
  assert.equal(isWebPushConfigured({ ...env, WEB_PUSH_PRIVATE_KEY: "" }), false);
  assert.equal(isWebPushConfigured({ ...env, WEB_PUSH_SUBJECT: "" }), false);
});

test("push endpoints accept supported HTTPS providers and reject SSRF targets", () => {
  assert.equal(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/token"), true);
  assert.equal(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/token"), true);
  assert.equal(allowedPushEndpoint("https://127.0.0.1/admin"), false);
  assert.equal(allowedPushEndpoint("http://fcm.googleapis.com/fcm/send/token"), false);
  assert.equal(allowedPushEndpoint("https://fcm.googleapis.com.evil.test/token"), false);
});

test("assignment push is scoped to the active offered assignment and uses privacy-safe content", async () => {
  const queries = [];
  const sent = [];
  const db = { async query(sql, values) {
    queries.push({ sql, values });
    if (sql.includes("SELECT 1 FROM delivery_assignments")) return { rows: [{ ok: 1 }] };
    if (sql.includes("SELECT id,subscription")) return { rows: [{ id: 2, subscription: { endpoint: "https://fcm.googleapis.com/push/a" } }] };
    return { rows: [] };
  } };
  const pushClient = {
    setVapidDetails(subject, publicKey, privateKey) { assert.equal(subject, env.WEB_PUSH_SUBJECT); assert.equal(publicKey, env.WEB_PUSH_PUBLIC_KEY); assert.equal(privateKey, env.WEB_PUSH_PRIVATE_KEY); },
    async sendNotification(subscription, payload, options) { sent.push({ subscription, payload: JSON.parse(payload), options }); },
  };
  const result = await sendDriverAssignmentPush({ driverId: 17, assignmentId: 28, orderId: 39, db, pushClient, env });
  assert.deepEqual(result, { sent: 1, retryable: false });
  assert.deepEqual(queries[0].values, [28, 17, 39]);
  assert.match(queries[0].sql, /da\.driver_id=\$2/);
  assert.match(queries[0].sql, /da\.unassigned_at IS NULL/);
  assert.match(queries[0].sql, /dp\.status='active'/);
  assert.deepEqual(sent[0].payload, {
    title: "New delivery assignment",
    body: "A delivery has been assigned to you. Open the driver portal to review it.",
    assignmentId: "28", orderId: "39", path: "/driver/deliveries/39",
  });
  assert.equal(JSON.stringify(sent[0].payload).includes("phone"), false);
  assert.equal(sent[0].options.TTL, 90);
});

test("stale assignments are not pushed and expired subscriptions are deleted", async () => {
  let readSubscriptions = false;
  const db = { async query(sql) {
    if (sql.includes("SELECT 1 FROM delivery_assignments")) return { rows: [] };
    if (sql.includes("SELECT id,subscription")) { readSubscriptions = true; return { rows: [] }; }
    return { rows: [] };
  } };
  const pushClient = { setVapidDetails() {}, async sendNotification() {} };
  assert.deepEqual(await sendDriverAssignmentPush({ driverId: 1, assignmentId: 2, orderId: 3, db, pushClient, env }), { sent: 0, skipped: "assignment_no_longer_active" });
  assert.equal(readSubscriptions, false);

  const deletes = [];
  const failingDb = { async query(sql, values) {
    if (sql.includes("SELECT 1 FROM delivery_assignments")) return { rows: [{}] };
    if (sql.includes("SELECT id,subscription")) return { rows: [{ id: 9, subscription: {} }] };
    if (sql.startsWith("DELETE FROM driver_push_subscriptions")) deletes.push(values[0]);
    return { rows: [] };
  } };
  const gonePushClient = { setVapidDetails() {}, async sendNotification() { throw Object.assign(new Error("gone"), { statusCode: 410 }); } };
  assert.deepEqual(await sendDriverAssignmentPush({ driverId: 1, assignmentId: 2, orderId: 3, db: failingDb, pushClient: gonePushClient, env }), { sent: 0, retryable: false });
  assert.deepEqual(deletes, [9]);
});
