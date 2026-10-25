import test from "node:test";
import assert from "node:assert/strict";
import pool from "../config/db.js";
import { cancelCustomerOrder } from "../controllers/orderController.js";
import { completeRefund, recordRefundFailure, reviewRefundRequest } from "../controllers/refundController.js";
import { requirePermission } from "../middleware/permissions.js";

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

const expiryClient = {
  async query(sql) {
    if (sql.includes("payment_method='chapa' AND payment_status='pending'")) return { rows: [] };
    return { rows: [] };
  }, release() {},
};

const setupCancellation = (t, { order, payment, priorCase, failCaseInsert = false } = {}) => {
  const statements = [];
  const cancellationClient = {
    async query(sql, values) {
      const query = sql.replace(/\s+/g, " ").trim();
      statements.push({ query, values });
      if (query.includes("WHERE id=$1 AND user_id=$2 FOR UPDATE")) return { rows: order ? [order] : [] };
      if (query.includes("request_type='pre_dispatch_cancellation'")) return { rows: priorCase ? [priorCase] : [] };
      if (query.startsWith("SELECT id,tx_ref FROM payments")) return { rows: payment ? [payment] : [] };
      if (query.startsWith("INSERT INTO refund_requests")) {
        if (failCaseInsert) throw new Error("refund storage unavailable");
        return { rows: [{ id: 400, status: "under_review", requested_amount: order.total_price, cancellation_at: "2026-10-25T12:00:00Z" }] };
      }
      if (query.startsWith("UPDATE orders SET inventory_state='released'")) return { rows: [{ id: order.id }] };
      if (query.startsWith("SELECT product_id,quantity FROM order_items")) return { rows: [{ product_id: 9, quantity: 2 }] };
      return { rows: [] };
    },
    release() {},
  };
  const clients = [expiryClient, cancellationClient];
  t.mock.method(pool, "connect", async () => clients.shift());
  return statements;
};

const runCancellation = async (id = 80, userId = 21, reason = "Changed my mind") => {
  const res = response();
  let error;
  await cancelCustomerOrder({ params: { id: String(id) }, user: { id: userId }, body: { reason } }, res, (value) => { error = value; });
  return { res, error };
};

test("paid pre-dispatch cancellation atomically creates a full-amount case and preserves payment success", async (t) => {
  const statements = setupCancellation(t, {
    order: { id: 80, order_status: "processing", payment_status: "successful", payment_method: "chapa", inventory_state: "committed", total_price: "125.50" },
    payment: { id: 90, tx_ref: "original-tx-ref" },
  });
  const { res, error } = await runCancellation();
  assert.equal(error, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.payment_status, "successful");
  assert.equal(res.body.refund_case.status, "under_review");
  assert.match(res.body.message, /no refund has been sent/i);
  const create = statements.find(({ query }) => query.startsWith("INSERT INTO refund_requests"));
  assert.equal(create.values[3], 90);
  assert.equal(create.values[4], "original-tx-ref");
  assert.equal(create.values[5], "125.50");
  assert.ok(statements.some(({ query }) => query.startsWith("UPDATE orders SET order_status='cancelled'")));
  assert.equal(statements.some(({ query }) => query.startsWith("UPDATE orders SET payment_status='refunded'")), false);
  assert.ok(statements.some(({ query }) => query.startsWith("UPDATE payments SET status='failed'") && query.includes("status='pending'")));
  assert.ok(statements.some(({ query }) => query.startsWith("UPDATE products SET stock=stock+")));
  assert.ok(statements.some(({ query }) => query === "COMMIT"));
});

test("unpaid cancellation creates no refund case and records failed payment state", async (t) => {
  const statements = setupCancellation(t, {
    order: { id: 80, order_status: "awaiting_payment", payment_status: "pending", payment_method: "chapa", inventory_state: "reserved", total_price: "125.50" },
  });
  const { res, error } = await runCancellation(80, 21, "No longer needed");
  assert.equal(error, undefined);
  assert.equal(res.body.payment_status, "failed");
  assert.equal(res.body.refund_case, null);
  assert.equal(statements.some(({ query }) => query.startsWith("INSERT INTO refund_requests")), false);
  assert.ok(statements.some(({ query }) => query.startsWith("UPDATE payments SET status='failed'")));
});

test("repeated cancellation returns the existing review case without releasing stock again", async (t) => {
  const statements = setupCancellation(t, {
    order: { id: 80, order_status: "cancelled", payment_status: "successful", payment_method: "chapa", inventory_state: "released", total_price: "125.50" },
    priorCase: { id: 400, status: "under_review", requested_amount: "125.50" },
  });
  const { res, error } = await runCancellation();
  assert.equal(error, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.refund_case.id, 400);
  assert.equal(statements.some(({ query }) => query.startsWith("INSERT INTO refund_requests")), false);
  assert.equal(statements.some(({ query }) => query.startsWith("UPDATE products SET stock=stock+")), false);
});

test("another customer's order cannot be cancelled or create a refund case", async (t) => {
  const statements = setupCancellation(t, { order: null });
  const { res, error } = await runCancellation(80, 999);
  assert.equal(error, undefined);
  assert.equal(res.statusCode, 404);
  assert.equal(statements.some(({ query }) => query.startsWith("INSERT INTO refund_requests")), false);
  assert.equal(statements.some(({ query }) => query.startsWith("UPDATE orders SET order_status='cancelled'")), false);
});

test("refund case creation failure rolls back and leaves cancellation unapplied", async (t) => {
  const statements = setupCancellation(t, {
    order: { id: 80, order_status: "processing", payment_status: "successful", payment_method: "chapa", inventory_state: "committed", total_price: "125.50" },
    payment: { id: 90, tx_ref: "original-tx-ref" },
    failCaseInsert: true,
  });
  const { res, error } = await runCancellation();
  assert.equal(error.message, "refund storage unavailable");
  assert.ok(statements.some(({ query }) => query === "ROLLBACK"));
  assert.equal(statements.some(({ query }) => query.startsWith("UPDATE orders SET order_status='cancelled'")), false);
  assert.equal(statements.some(({ query }) => query.startsWith("UPDATE products SET stock=stock+")), false);
  assert.equal(res.body, null);
});

test("authorized review can begin manual processing and a failed attempt leaves payment successful", async (t) => {
  let refundStatus = "under_review";
  const statements = [];
  const client = {
    async query(sql) {
      const query = sql.replace(/\s+/g, " ").trim();
      statements.push(query);
      if (query.startsWith("SELECT * FROM refund_requests")) return { rows: [{ id: 400, order_id: 80, request_type: "pre_dispatch_cancellation", status: refundStatus, return_required: false }] };
      if (query.startsWith("UPDATE refund_requests SET status=$1")) { refundStatus = "refund_processing"; return { rows: [] }; }
      if (query.startsWith("SELECT r.id,r.order_id")) return { rows: [{ id: 400, order_id: 80, status: refundStatus, request_type: "pre_dispatch_cancellation", payment_status: "successful" }] };
      if (query.startsWith("UPDATE refund_requests SET status='refund_failed'")) { refundStatus = "refund_failed"; return { rows: [] }; }
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  const approved = response();
  await reviewRefundRequest({ params: { id: "400" }, body: { status: "refund_processing", admin_response: "Manual refund started" }, user: { id: 7 }, staff: { permissions: ["approve_refunds"] } }, approved, assert.fail);
  assert.equal(approved.body.status, "refund_processing");
  const failed = response();
  await recordRefundFailure({ params: { id: "400" }, body: { reason: "Provider rejected transfer", reference: "case-err-1" }, user: { id: 7 } }, failed, assert.fail);
  assert.equal(failed.body.status, "refund_failed");
  assert.equal(refundStatus, "refund_failed");
  assert.equal(statements.some((query) => query.startsWith("UPDATE orders SET payment_status='refunded'")), false);
  assert.equal(statements.some((query) => query.startsWith("UPDATE payments SET status='refunded'")), false);
  assert.ok(statements.some((query) => query.startsWith("INSERT INTO operations_audit_log")));
});

test("completed manual refund records its reference and only then marks payment refunded", async (t) => {
  const statements = [];
  const client = {
    async query(sql) {
      const query = sql.replace(/\s+/g, " ").trim();
      statements.push(query);
      if (query.includes("JOIN orders o ON o.id=r.order_id WHERE r.id=$1 FOR UPDATE OF r,o")) {
        return { rows: [{ id: 400, order_id: 80, status: "refund_processing", total_price: "125.50", payment_method: "chapa", payment_status: "successful", eligible_refund_amount: "125.50" }] };
      }
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  const res = response();
  await completeRefund({ params: { id: "400" }, body: { amount: 125.5, method: "chapa_manual", reference: "manual-ref-1" }, user: { id: 7 } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.ok(statements.some((query) => query.startsWith("UPDATE orders SET payment_status='refunded'")));
  assert.ok(statements.some((query) => query.startsWith("UPDATE payments SET status='refunded'")));
  assert.ok(statements.includes("COMMIT"));
});

test("refund updates require the explicit approve_refunds staff permission", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ status: "active", is_super_admin: false, permissions: ["view_refunds"] }] }));
  const guard = requirePermission("approve_refunds");
  const res = response();
  let reached = false;
  await guard({ user: { id: 42, role: "admin" } }, res, () => { reached = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(reached, false);
});
