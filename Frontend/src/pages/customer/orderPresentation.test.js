import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerOrderState, getOrderLabel, getRefundLabel } from "./orderPresentation.js";

test("delivery and payment order states have customer labels without merging payment status", () => {
  assert.equal(getOrderLabel("ready_for_dispatch"), "Processing");
  assert.equal(getOrderLabel("out_for_delivery"), "Out for delivery");
  assert.equal(getOrderLabel("payment_under_review"), "Payment under review");
  assert.deepEqual(getCustomerOrderState({ order_status: "cancelled", payment_status: "successful" }), {
    order: "Cancelled", payment: "Paid", refund: null,
  });
});

test("representative order states remain distinct from their payment and refund states", () => {
  const scenarios = [
    [{ order_status: "processing", payment_status: "successful" }, "Processing", "Paid", null],
    [{ order_status: "out_for_delivery", payment_status: "successful" }, "Out for delivery", "Paid", null],
    [{ order_status: "cancelled", payment_status: "failed" }, "Cancelled", "Payment failed", null],
    [{ order_status: "cancelled", payment_status: "successful" }, "Cancelled", "Paid", null],
    [{ order_status: "cancelled", payment_status: "successful", refund_request: { status: "under_review" } }, "Cancelled", "Paid", "Refund under review"],
    [{ order_status: "cancelled", payment_status: "successful", refund_request: { status: "refund_failed" } }, "Cancelled", "Paid", "Refund needs follow-up"],
    [{ order_status: "cancelled", payment_status: "refunded", refund_request: { status: "refunded" } }, "Cancelled", "Refunded", "Refunded"],
  ];
  for (const [order, orderLabel, paymentLabel, refundLabel] of scenarios) {
    assert.deepEqual(getCustomerOrderState(order), { order: orderLabel, payment: paymentLabel, refund: refundLabel });
  }
});

test("refund labels distinguish review, processing, failed and confirmed outcomes", () => {
  assert.equal(getRefundLabel("under_review"), "Refund under review");
  assert.equal(getRefundLabel("refund_processing"), "Refund processing");
  assert.equal(getRefundLabel("refund_failed"), "Refund needs follow-up");
  assert.equal(getRefundLabel("refunded"), "Refunded");
  assert.equal(getCustomerOrderState({ order_status: "cancelled", payment_status: "successful", refund_request: { status: "refunded" } }).refund, "Refunded");
});
