import test from "node:test";
import assert from "node:assert/strict";
import { canManageRefundCase, cancellationRefundActions, isCancellationRefundCase } from "./refundCaseState.js";

test("paid cancellation creates a pending manual refund review state", () => {
  const reviewCase = { request_type: "pre_dispatch_cancellation", status: "under_review", requested_amount: "120.00" };
  assert.equal(isCancellationRefundCase(reviewCase), true);
  assert.deepEqual(cancellationRefundActions(reviewCase), {
    beginManualRefund: true, retryManualRefund: false, recordOutcome: false, completed: false,
  });
});

test("manual cancellation refund exposes failed, retry, and completed states separately", () => {
  assert.equal(cancellationRefundActions({ request_type: "pre_dispatch_cancellation", status: "refund_failed" }).retryManualRefund, true);
  assert.equal(cancellationRefundActions({ request_type: "pre_dispatch_cancellation", status: "refund_processing" }).recordOutcome, true);
  assert.equal(cancellationRefundActions({ request_type: "pre_dispatch_cancellation", status: "refunded" }).completed, true);
  assert.equal(isCancellationRefundCase({ request_type: "delivery_claim", status: "under_review" }), false);
});

test("only active authorized staff see refund update actions", () => {
  assert.equal(canManageRefundCase({ role: "admin", staff_status: "active", permissions: ["view_refunds", "approve_refunds"] }), true);
  assert.equal(canManageRefundCase({ role: "admin", staff_status: "active", permissions: ["view_refunds"] }), false);
  assert.equal(canManageRefundCase({ role: "admin", staff_status: "suspended", is_super_admin: true }), false);
  assert.equal(canManageRefundCase({ role: "customer", permissions: ["approve_refunds"] }), false);
});
