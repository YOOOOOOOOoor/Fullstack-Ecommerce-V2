import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import pool from "../config/db.js";
import { verifyPayment } from "../controllers/checkoutController.js";

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("a genuinely verified payment after expiry is recorded for review without fulfillment or refund", async (t) => {
  const oldSecret = process.env.CHAPA_SECRET_KEY;
  process.env.CHAPA_SECRET_KEY = "test-secret";
  t.after(() => { if (oldSecret === undefined) delete process.env.CHAPA_SECRET_KEY; else process.env.CHAPA_SECRET_KEY = oldSecret; });
  const statements = [];
  const orderRow = { id: 91, user_id: 21, total_price: "25.00", shipping_fee: "5.00", payment_status: "failed", order_status: "expired", expires_at: "2026-10-24T10:00:00Z", late_payment_review_required: false };
  const client = {
    async query(sql) {
      const query = sql.replace(/\s+/g, " ").trim();
      statements.push(query);
      if (query.includes("p.tx_ref=$1") && query.includes("FOR UPDATE")) return { rows: [{ ...orderRow, inventory_state: "released", expiry_due: false }] };
      return { rows: [] };
    },
    release() {},
  };
  t.mock.method(pool, "query", async () => ({ rows: [{ ...orderRow }] }));
  t.mock.method(pool, "connect", async () => client);
  t.mock.method(axios, "get", async () => ({ data: { status: "success", data: { status: "success", tx_ref: "order-91", amount: "25.00", currency: "ETB" } } }));
  const res = response();
  await verifyPayment({ params: { tx_ref: "order-91" }, user: { id: 21 } }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.needs_review, true);
  assert.equal(res.body.order_id, 91);
  assert.ok(statements.some((sql) => sql.includes("INSERT INTO late_payment_reviews")));
  assert.ok(statements.some((sql) => sql.includes("late_payment_review_required=TRUE")));
  assert.equal(statements.some((sql) => sql.includes("order_status='processing'")), false);
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE products SET stock=stock-")), false);
  assert.equal(statements.some((sql) => /refund/i.test(sql) && sql.startsWith("UPDATE")), false);
});

test("a repeated verification of a late payment does not call Chapa or add another review", async (t) => {
  const oldSecret = process.env.CHAPA_SECRET_KEY;
  process.env.CHAPA_SECRET_KEY = "test-secret";
  t.after(() => { if (oldSecret === undefined) delete process.env.CHAPA_SECRET_KEY; else process.env.CHAPA_SECRET_KEY = oldSecret; });
  let paid = false;
  let providerCalls = 0;
  let reviewRows = 0;
  const orderRow = () => ({ id: 91, user_id: 21, total_price: "25.00", shipping_fee: "5.00", payment_status: paid ? "successful" : "failed", order_status: "expired", expires_at: "2026-10-24T10:00:00Z", late_payment_review_required: paid });
  const client = {
    async query(sql) {
      const query = sql.replace(/\s+/g, " ").trim();
      if (query.includes("p.tx_ref=$1") && query.includes("FOR UPDATE")) return { rows: [{ ...orderRow(), inventory_state: "released", expiry_due: false }] };
      if (query.includes("late_payment_review_required=TRUE")) paid = true;
      if (query.includes("INSERT INTO late_payment_reviews")) reviewRows += 1;
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "query", async () => ({ rows: [orderRow()] }));
  t.mock.method(pool, "connect", async () => client);
  t.mock.method(axios, "get", async () => { providerCalls += 1; return { data: { status: "success", data: { status: "success", tx_ref: "order-91", amount: "25.00", currency: "ETB" } } }; });
  const first = response();
  await verifyPayment({ params: { tx_ref: "order-91" }, user: { id: 21 } }, first);
  const second = response();
  await verifyPayment({ params: { tx_ref: "order-91" }, user: { id: 21 } }, second);
  assert.equal(first.statusCode, 202);
  assert.equal(second.statusCode, 202);
  assert.equal(providerCalls, 1);
  assert.equal(reviewRows, 1);
});
