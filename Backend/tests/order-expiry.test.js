import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import pool from "../config/db.js";
import { expireOrderIfDue } from "../services/orderExpiry.js";
import { continueChapaPayment } from "../controllers/checkoutController.js";

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

const setupContinue = (t, order) => {
  const oldSecret = process.env.CHAPA_SECRET_KEY;
  process.env.CHAPA_SECRET_KEY = "test-secret";
  t.after(() => { if (oldSecret === undefined) delete process.env.CHAPA_SECRET_KEY; else process.env.CHAPA_SECRET_KEY = oldSecret; });
  const statements = [];
  const client = {
    async query(sql) {
      const query = sql.replace(/\s+/g, " ").trim();
      statements.push(query);
      if (query.startsWith("SELECT id FROM orders")) return { rows: [] };
      if (query.startsWith("SELECT o.id,o.user_id")) return { rows: order ? [order] : [] };
      if (query.includes("UPDATE payments SET checkout_url")) return { rows: [{ id: 18 }] };
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  return { statements };
};

const pendingOrder = (overrides = {}) => ({
  id: 91, user_id: 21, payment_method: "chapa", payment_status: "pending", order_status: "awaiting_payment",
  total_price: "25.00", expires_at: new Date(Date.now() + 120000).toISOString(), server_now: new Date().toISOString(),
  remaining_ms: "120000", name: "Customer", email: "customer@example.test", order_tx_ref: "order-91-old",
  payment_id: 18, payment_tx_ref: "order-91-old", attempt_status: "pending", checkout_url: null, ...overrides,
});

test("an expired Chapa order releases a reservation once and records expiry", async (t) => {
  const statements = [];
  const client = {
    async query(sql) {
      const query = sql.replace(/\s+/g, " ").trim();
      statements.push(query);
      if (query.startsWith("SELECT id FROM orders")) return { rows: [{ id: 91 }] };
      if (query.startsWith("UPDATE orders SET inventory_state='released'")) return { rows: [{ id: 91 }] };
      if (query.startsWith("SELECT product_id,quantity")) return { rows: [{ product_id: 4, quantity: 2 }] };
      if (query.startsWith("UPDATE orders SET order_status='expired'")) return { rows: [{ id: 91 }] };
      return { rows: [] };
    },
    release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  assert.equal(await expireOrderIfDue(91), true);
  assert.equal(statements.filter((sql) => sql.startsWith("UPDATE products SET stock=stock+" )).length, 1);
  assert.ok(statements.some((sql) => sql.startsWith("INSERT INTO operations_audit_log")));
  assert.equal(statements.at(-1), "COMMIT");
});

test("continuing payment returns the saved Chapa URL for the same order", async (t) => {
  const { statements } = setupContinue(t, pendingOrder({ checkout_url: "https://checkout.chapa.co/checkout/test" }));
  t.mock.method(axios, "get", async () => { throw new Error("A saved URL should not need verification."); });
  const res = response();
  await continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.checkout_url, "https://checkout.chapa.co/checkout/test");
  assert.ok(statements.some((sql) => sql.includes("pg_advisory_lock")));
  assert.ok(statements.some((sql) => sql === "COMMIT"));
});

test("continuing payment cannot expose another customer's checkout URL", async (t) => {
  setupContinue(t, null);
  const res = response();
  await continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, res, assert.fail);
  assert.equal(res.statusCode, 404);
});

test("continuing payment rejects an expired order and does not return the old URL", async (t) => {
  setupContinue(t, pendingOrder({ remaining_ms: "0", checkout_url: "https://checkout.chapa.co/checkout/old" }));
  const res = response();
  await continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, res, assert.fail);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.order_status, "expired");
  assert.equal(res.body.checkout_url, undefined);
});

test("a missing URL safely creates a fresh Chapa attempt on the same order after the old attempt failed", async (t) => {
  const { statements } = setupContinue(t, pendingOrder());
  let initialized;
  t.mock.method(axios, "get", async () => ({ status: 200, data: { status: "success", data: { tx_ref: "order-91-old", status: "failed" } } }));
  t.mock.method(axios, "post", async (_url, payload) => {
    initialized = payload;
    return { data: { status: "success", data: { checkout_url: "https://checkout.chapa.co/checkout/retry" } } };
  });
  const res = response();
  await continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.checkout_url, "https://checkout.chapa.co/checkout/retry");
  assert.equal(initialized.amount, "25.00");
  assert.notEqual(initialized.tx_ref, "order-91-old");
  assert.ok(statements.some((sql) => sql.includes("INSERT INTO payments(order_id,method,status,tx_ref)")));
  assert.ok(statements.some((sql) => sql === "COMMIT"));
});

test("a missing URL with an active or uncertain provider attempt does not create another charge", async (t) => {
  setupContinue(t, pendingOrder());
  let initializeCalls = 0;
  t.mock.method(axios, "get", async () => ({ status: 200, data: { status: "success", data: { tx_ref: "order-91-old", status: "pending" } } }));
  t.mock.method(axios, "post", async () => { initializeCalls += 1; throw new Error("must not initialize"); });
  const res = response();
  await continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, res, assert.fail);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /No second attempt was started/);
  assert.equal(initializeCalls, 0);
});

test("a provider-confirmed successful old attempt is sent through normal server-side payment verification", async (t) => {
  setupContinue(t, pendingOrder());
  let initializeCalls = 0;
  t.mock.method(axios, "get", async () => ({ status: 200, data: { status: "success", data: { tx_ref: "order-91-old", status: "success", amount: "25.00", currency: "ETB" } } }));
  t.mock.method(axios, "post", async () => { initializeCalls += 1; throw new Error("must not initialize"); });
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 91, user_id: 21, payment_status: "successful", order_status: "processing", late_payment_review_required: false }] }));
  const res = response();
  await continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, res, assert.fail);
  assert.equal(initializeCalls, 0);
  assert.equal(res.body.success, true);
  assert.equal(res.body.order_id, 91);
});

test("an already-paid order cannot start another payment attempt", async (t) => {
  setupContinue(t, pendingOrder({ payment_status: "successful", order_status: "processing" }));
  let providerCalls = 0;
  t.mock.method(axios, "get", async () => { providerCalls += 1; throw new Error("must not verify again"); });
  t.mock.method(axios, "post", async () => { providerCalls += 1; throw new Error("must not initialize"); });
  const res = response();
  await continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, res, assert.fail);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /already confirmed/i);
  assert.equal(providerCalls, 0);
});

test("a temporary Chapa verification failure leaves the order unchanged and starts no attempt", async (t) => {
  const { statements } = setupContinue(t, pendingOrder());
  t.mock.method(axios, "get", async () => { throw Object.assign(new Error("network unavailable"), { code: "ECONNRESET" }); });
  let initializeCalls = 0;
  t.mock.method(axios, "post", async () => { initializeCalls += 1; });
  const res = response();
  await continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, res, assert.fail);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.message, /no new payment attempt was started/i);
  assert.equal(initializeCalls, 0);
  assert.equal(statements.some((sql) => sql.startsWith("INSERT INTO payments")), false);
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE payments SET status='failed'")), false);
});

test("concurrent Continue Payment calls serialize and create only one retry attempt", async (t) => {
  const oldSecret = process.env.CHAPA_SECRET_KEY;
  process.env.CHAPA_SECRET_KEY = "test-secret";
  t.after(() => { if (oldSecret === undefined) delete process.env.CHAPA_SECRET_KEY; else process.env.CHAPA_SECRET_KEY = oldSecret; });
  let lockTail = Promise.resolve();
  let activeOrder = pendingOrder();
  let initCalls = 0;
  const makeClient = () => {
    let unlock;
    return {
      async query(sql, values) {
        const query = sql.replace(/\s+/g, " ").trim();
        if (query.startsWith("SELECT pg_advisory_lock")) {
          const previous = lockTail;
          lockTail = new Promise((resolve) => { unlock = resolve; });
          await previous;
          return { rows: [] };
        }
        if (query.startsWith("SELECT pg_advisory_unlock")) { unlock?.(); return { rows: [] }; }
        if (query.startsWith("SELECT id FROM orders")) return { rows: [] };
        if (query.startsWith("SELECT o.id,o.user_id")) return { rows: [{ ...activeOrder }] };
        if (query.includes("UPDATE payments SET checkout_url")) {
          activeOrder = { ...activeOrder, checkout_url: values[0] };
          return { rows: [{ id: 19 }] };
        }
        return { rows: [] };
      },
      async release() {},
    };
  };
  const clients = [];
  t.mock.method(pool, "connect", async () => { const c = makeClient(); clients.push(c); return c; });
  t.mock.method(axios, "get", async () => ({ status: 200, data: { status: "success", data: { tx_ref: "order-91-old", status: "failed" } } }));
  t.mock.method(axios, "post", async () => {
    initCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { data: { status: "success", data: { checkout_url: "https://checkout.chapa.co/checkout/one" } } };
  });
  const first = response();
  const second = response();
  await Promise.all([
    continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, first, assert.fail),
    continueChapaPayment({ params: { id: "91" }, user: { id: 21 } }, second, assert.fail),
  ]);
  assert.equal(initCalls, 1);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
});
