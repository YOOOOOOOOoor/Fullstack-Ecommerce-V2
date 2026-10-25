import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_ORDERS_VIEW_KEY,
  applyDriverAssignment,
  buildOrdersQuery,
  canAssignOrder,
  createAssignmentSubmitter,
  createOrderAssignmentRequest,
  driverOptionLabel,
  getInitialDriverSelection,
  readOrdersView,
  orderAssignmentLabel,
  writeOrdersView,
} from "./adminOrdersState.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("eligible processing orders expose assignment only to admins who can prepare them", () => {
  const unassigned = { order_status: "processing" };
  const assigned = { order_status: "processing", current_driver_id: 22, current_driver_name: "Aster" };
  assert.equal(canAssignOrder(unassigned), false);
  assert.equal(canAssignOrder(unassigned, { canPrepareOrders: true }), true);
  assert.equal(orderAssignmentLabel(unassigned), "Assign Driver");
  assert.equal(canAssignOrder(assigned, { canPrepareOrders: true }), true);
  assert.equal(orderAssignmentLabel(assigned), "Reassign");
});

test("dispatch assignment eligibility excludes delivery states the backend rejects", () => {
  for (const status of ["ready_for_dispatch", "delivery_failed", "assigned_to_driver"]) {
    assert.equal(canAssignOrder({ order_status: status }), true);
  }
  for (const status of ["out_for_delivery", "delivered", "cancelled"]) {
    assert.equal(canAssignOrder({ order_status: status }), false);
  }
});

test("driver selector identifies current eligible driver and formats options", () => {
  const drivers = [{ user_id: 12, name: "Aster", email: "aster@example.test", active_deliveries: 2 }];
  assert.equal(getInitialDriverSelection({ current_driver_id: 12 }, drivers), "12");
  assert.equal(getInitialDriverSelection({ current_driver_id: 99 }, drivers), "");
  assert.equal(driverOptionLabel(drivers[0]), "Aster · aster@example.test · 2 active");
});

test("successful assignment updates only the matching order after confirmation", () => {
  const orders = [{ id: 1, order_status: "ready_for_dispatch" }, { id: 2, order_status: "processing" }];
  const updated = applyDriverAssignment(orders, "1", { user_id: 8, name: "Mekdes" });
  assert.deepEqual(updated[0], { id: 1, order_status: "assigned_to_driver", current_driver_id: 8, current_driver_name: "Mekdes" });
  assert.equal(updated[1], orders[1]);
  const reassigned = applyDriverAssignment(updated, 1, { user_id: 9, name: "Liya" });
  assert.equal(reassigned[0].current_driver_id, 9);
  assert.equal(reassigned[0].current_driver_name, "Liya");
});

test("processing assignment uses authorized ready transition before the existing assignment API", async () => {
  const calls = [];
  const request = createOrderAssignmentRequest({
    prepareOrder: async (orderId) => { calls.push(["prepare", orderId]); },
    assignDriver: async (payload) => { calls.push(["assign", payload.orderId, payload.driverId]); return { status: 201 }; },
  });
  const response = await request({ orderId: 41, driverId: 22, reason: "", prepare: true });
  assert.equal(response.status, 201);
  assert.deepEqual(calls, [["prepare", 41], ["assign", 41, 22]]);

  const deniedRequest = createOrderAssignmentRequest({
    prepareOrder: async () => { throw new Error("Not authorized"); },
    assignDriver: async () => assert.fail("Assignment must not bypass preparation authorization"),
  });
  await assert.rejects(deniedRequest({ orderId: 41, driverId: 22, prepare: true }), /Not authorized/);
});

test("reassignment and request failures are surfaced without duplicate submissions", async () => {
  let resolveRequest;
  let calls = 0;
  const submit = createAssignmentSubmitter(() => {
    calls += 1;
    return new Promise((resolve) => { resolveRequest = resolve; });
  });
  const first = submit({ orderId: 1, driverId: 9 });
  assert.deepEqual(await submit({ orderId: 1, driverId: 9 }), { status: "duplicate" });
  assert.equal(calls, 1);
  resolveRequest({ status: 201 });
  assert.deepEqual(await first, { status: "success", data: { status: 201 } });

  const failed = createAssignmentSubmitter(async () => { throw new Error("offline"); });
  const result = await failed({ orderId: 2, driverId: 9 });
  assert.equal(result.status, "error");
  assert.equal(result.error.message, "offline");
});

test("Table/Grid preference defaults to grid and preserves a saved table selection", () => {
  const storage = memoryStorage();
  assert.equal(readOrdersView(storage), "grid");
  writeOrdersView("table", storage);
  assert.equal(storage.getItem(ADMIN_ORDERS_VIEW_KEY), "table");
  assert.equal(readOrdersView(storage), "table");
  assert.equal(readOrdersView(memoryStorage({ [ADMIN_ORDERS_VIEW_KEY]: "compact" })), "grid");
});

test("view switching keeps the same filtered page query for Table and Grid", () => {
  const filters = { search: "lamp", order_status: "processing", payment_status: "successful" };
  const tableQuery = buildOrdersQuery(filters, 3, 6);
  const gridQuery = buildOrdersQuery(filters, 3, 6);
  assert.deepEqual(gridQuery, tableQuery);
  assert.deepEqual(tableQuery, { search: "lamp", order_status: "processing", payment_status: "successful", page: 3, limit: 6 });
});
