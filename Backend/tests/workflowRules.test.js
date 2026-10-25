import test from "node:test";
import assert from "node:assert/strict";
import {
  canStartDeliveryAttempt,
  canCustomerCancelOrder,
  canTransitionAdminOrderStatus,
  codAmountMatches,
  dispatchPaymentEligible,
  isWithinRefundWindow,
  REFUND_TRANSITIONS,
} from "../services/workflowRules.js";
import { hasStaffPermission } from "../middleware/permissions.js";
import { releaseReservedInventory } from "../services/inventory.js";

test("dispatch eligibility keeps Chapa verification and COD separate", () => {
  assert.equal(dispatchPaymentEligible({ payment_method: "chapa", payment_status: "successful" }), true);
  assert.equal(dispatchPaymentEligible({ payment_method: "chapa", payment_status: "pending" }), false);
  assert.equal(dispatchPaymentEligible({ payment_method: "cod", payment_status: "pending" }), true);
  assert.equal(dispatchPaymentEligible({ payment_method: "cod", payment_status: "failed" }), false);
});

test("refund window uses server delivery time and expires at 72 hours", () => {
  const deliveredAt = Date.parse("2026-01-01T12:00:00Z");
  assert.equal(isWithinRefundWindow(deliveredAt, deliveredAt), true);
  assert.equal(isWithinRefundWindow(deliveredAt, deliveredAt + 72 * 60 * 60 * 1000), true);
  assert.equal(isWithinRefundWindow(deliveredAt, deliveredAt + 72 * 60 * 60 * 1000 + 1), false);
  assert.equal(isWithinRefundWindow("invalid", deliveredAt), false);
});

test("COD matching uses cents and rejects non-finite values", () => {
  assert.equal(codAmountMatches("105.00", 105), true);
  assert.equal(codAmountMatches(105, 104.99), false);
  assert.equal(codAmountMatches(105, Infinity), false);
});

test("delivery attempts are capped and refund transitions stay controlled", () => {
  assert.equal(canStartDeliveryAttempt(0), true);
  assert.equal(canStartDeliveryAttempt(2), true);
  assert.equal(canStartDeliveryAttempt(3), false);
  assert.deepEqual(REFUND_TRANSITIONS.return_received, ["refund_processing"]);
  assert.equal(REFUND_TRANSITIONS.refunded, undefined);
});

test("customer cancellation stops at dispatch and admin transitions cannot move orders backwards", () => {
  assert.equal(canCustomerCancelOrder("processing"), true);
  assert.equal(canCustomerCancelOrder("ready_for_dispatch"), true);
  assert.equal(canCustomerCancelOrder("assigned_to_driver"), false);
  assert.equal(canCustomerCancelOrder("out_for_delivery"), false);
  assert.equal(canTransitionAdminOrderStatus("processing", "ready_for_dispatch"), true);
  assert.equal(canTransitionAdminOrderStatus("ready_for_dispatch", "processing"), false);
  assert.equal(canTransitionAdminOrderStatus("out_for_delivery", "ready_for_dispatch"), false);
  assert.equal(canTransitionAdminOrderStatus("out_for_delivery", "cancelled"), true);
  assert.equal(canTransitionAdminOrderStatus("delivered", "cancelled"), false);
});

test("staff permission checks enforce active least privilege and Super Admin bypass", () => {
  assert.equal(hasStaffPermission({ status: "active", is_super_admin: false, permissions: ["view_orders"] }, "view_orders"), true);
  assert.equal(hasStaffPermission({ status: "active", is_super_admin: false, permissions: ["view_orders"] }, "reconcile_cod"), false);
  assert.equal(hasStaffPermission({ status: "suspended", is_super_admin: true, permissions: [] }, "reconcile_cod"), false);
  assert.equal(hasStaffPermission({ status: "active", is_super_admin: true, permissions: [] }, "reconcile_cod"), true);
});

test("inventory release restores stock at most once per order reservation", async () => {
  let state = "reserved";
  const restored = [];
  const client = { query: async (sql, values) => {
    if (sql.includes("UPDATE orders SET inventory_state='released'")) {
      if (state !== "reserved") return { rows: [] };
      state = "released";
      return { rows: [{ id: values[0] }] };
    }
    if (sql.includes("SELECT product_id,quantity FROM order_items")) return { rows: [{ product_id: 8, quantity: 2 }] };
    if (sql.includes("UPDATE products SET stock=stock+")) restored.push(values);
    return { rows: [] };
  } };
  assert.equal(await releaseReservedInventory(client, 31), true);
  assert.equal(await releaseReservedInventory(client, 31), false);
  assert.deepEqual(restored, [[2, 8]]);
});
