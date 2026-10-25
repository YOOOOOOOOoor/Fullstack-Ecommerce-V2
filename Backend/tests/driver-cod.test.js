import test from "node:test";
import assert from "node:assert/strict";
import { createCodCheckoutHandler, createCheckoutOptionsHandler } from "../controllers/checkoutController.js";
import { chapaPayment } from "../controllers/checkoutController.js";
import axios from "axios";
import { getDriverDashboard, getDriverDelivery, respondToAssignment, failDelivery } from "../controllers/driverController.js";
import { assignDelivery, reconcileCodCollection } from "../controllers/adminDeliveryController.js";
import { createDriverOnly } from "../middleware/driver.js";
import { dispatchPaymentEligible } from "../services/workflowRules.js";
import { hasStaffPermission } from "../middleware/permissions.js";
import pool from "../config/db.js";

const makeResponse = () => ({
  statusCode: 200,
  body: undefined,
  count: 0,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; this.count += 1; return this; },
});

const nextRecorder = () => {
  const result = { error: undefined, count: 0 };
  result.next = (error) => { result.error = error; result.count += 1; };
  return result;
};

test("active driver gate admits active profile and denies suspended profile", async () => {
  const activeGate = createDriverOnly({ db: { query: async () => ({ rows: [{ status: "active" }] }) } });
  const activeRes = makeResponse();
  const activeNext = nextRecorder();
  await activeGate({ user: { id: 21 } }, activeRes, activeNext.next);
  assert.equal(activeNext.count, 1);
  assert.equal(activeRes.count, 0);

  const suspendedGate = createDriverOnly({ db: { query: async () => ({ rows: [{ status: "suspended" }] }) } });
  const suspendedRes = makeResponse();
  const suspendedNext = nextRecorder();
  await suspendedGate({ user: { id: 21 } }, suspendedRes, suspendedNext.next);
  assert.equal(suspendedNext.count, 0);
  assert.equal(suspendedRes.statusCode, 403);
});

test("checkout options report COD availability independently from missing shipping configuration", async () => {
  const handler = createCheckoutOptionsHandler({
    db: {},
    codEnabledReader: async () => true,
    shippingFeeReader: async () => { throw Object.assign(new Error("A valid default shipping fee must be configured before checkout."), { status: 503 }); },
  });
  const res = makeResponse();
  const next = nextRecorder();
  await handler({}, res, next.next);
  assert.equal(next.count, 0);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.cod_enabled, true);
  assert.equal(res.body.shipping_configured, false);
  assert.equal(res.body.shipping_fee, null);
});

test("COD checkout creates a reserved, unpaid COD order without a Chapa request", async () => {
  const statements = [];
  let released = false;
  const client = {
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT id FROM carts")) return { rows: [{ id: 7 }] };
      if (sql.includes("SELECT ci.product_id")) return { rows: [{ product_id: 4, quantity: 2, price: "10.00", stock: 5, status: "published" }] };
      if (sql.includes("INSERT INTO addresses")) return { rows: [{ id: 12 }] };
      if (sql.includes("INSERT INTO orders")) return { rows: [{ id: 90 }] };
      if (sql.includes("UPDATE products SET stock")) return { rows: [{ id: 4 }] };
      return { rows: [] };
    },
    release() { released = true; },
  };
  const db = { connect: async () => client };
  const handler = createCodCheckoutHandler({
    db,
    shippingFeeReader: async () => 5.5,
    codEnabledReader: async () => true,
    auditWriter: async () => {},
  });
  const res = makeResponse();
  const next = nextRecorder();
  await handler({ get: () => "cod-checkout-test-1234", user: { id: 21 }, body: {
    payment_method: "cod", receiver_name: "Receiver", phone: "0911000000", city: "Addis Ababa", sub_city: "Bole", address: "Test address",
  } }, res, next.next);

  assert.equal(next.count, 0);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.order_id, 90);
  assert.equal(res.body.total, 25.5);
  assert.equal(released, true);
  const orderInsert = statements.find((sql) => sql.includes("INSERT INTO orders"));
  const paymentInsert = statements.find((sql) => sql.includes("INSERT INTO payments"));
  assert.match(orderInsert, /'cod','pending','processing'/);
  assert.match(orderInsert, /'reserved'/);
  assert.match(paymentInsert, /'cod','cash_on_delivery','pending'/);
  assert.ok(statements.some((sql) => sql.includes("UPDATE products SET stock=stock-$1")));
  assert.ok(!statements.some((sql) => sql.toLowerCase().includes("chapa")));
  assert.equal(statements.some((sql) => /email|notification_outbox/i.test(sql)), false);
});

test("COD checkout rejects mismatched payment method and disabled COD", async () => {
  let connects = 0;
  const db = { connect: async () => { connects += 1; return { query: async () => ({ rows: [] }), release() {} }; } };
  const handler = createCodCheckoutHandler({ db, codEnabledReader: async () => false });

  const invalidMethodRes = makeResponse();
  await handler({ user: { id: 21 }, body: { payment_method: "chapa" } }, invalidMethodRes, () => {});
  assert.equal(invalidMethodRes.statusCode, 400);
  assert.equal(connects, 0);

  const disabledRes = makeResponse();
  await handler({ get: () => "cod-disabled-test-1234", user: { id: 21 }, body: {} }, disabledRes, () => {});
  assert.equal(disabledRes.statusCode, 403);
  assert.equal(connects, 1);
});

test("Chapa checkout creates a pending order without requiring customer email delivery", async (t) => {
  const oldSecret = process.env.CHAPA_SECRET_KEY;
  const oldShippingFee = process.env.SHIPPING_FEE_ETB;
  process.env.CHAPA_SECRET_KEY = "test-chapa-key";
  process.env.SHIPPING_FEE_ETB = "5.50";
  const clientQueries = [];
  const poolQueries = [];
  const client = {
    async query(sql) {
      clientQueries.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("o.checkout_key=$2")) return { rows: [] };
      if (sql.includes("SELECT name,email FROM users")) return { rows: [{ name: "Customer", email: "customer@example.test" }] };
      if (sql.includes("SELECT id FROM carts")) return { rows: [{ id: 7 }] };
      if (sql.includes("SELECT ci.product_id")) return { rows: [{ product_id: 4, quantity: 1, price: "10.00", stock: 3, status: "published" }] };
      if (sql.includes("INSERT INTO addresses")) return { rows: [{ id: 12 }] };
      if (sql.includes("INSERT INTO orders")) return { rows: [{ id: 91 }] };
      if (sql.includes("UPDATE products SET stock")) return { rows: [{ id: 4 }] };
      return { rows: [] };
    },
    release() {},
  };
  t.mock.method(pool, "query", async (sql, values) => { poolQueries.push({ sql: sql.replace(/\s+/g, " ").trim(), values }); return { rows: [{ default_fee: "5.50" }] }; });
  t.mock.method(pool, "connect", async () => client);
  let chapaPayload;
  t.mock.method(axios, "post", async (_url, payload) => {
    chapaPayload = payload;
    return { data: { status: "success", data: { checkout_url: "https://checkout.chapa.co/checkout/test" } } };
  });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("No email transport is configured."); };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldSecret === undefined) delete process.env.CHAPA_SECRET_KEY; else process.env.CHAPA_SECRET_KEY = oldSecret;
    if (oldShippingFee === undefined) delete process.env.SHIPPING_FEE_ETB; else process.env.SHIPPING_FEE_ETB = oldShippingFee;
  });

  const res = makeResponse();
  await chapaPayment({ get: () => "checkout-test-key-1234", user: { id: 21 }, body: {
    payment_method: "chapa", receiver_name: "Receiver", phone: "0911000000", city: "Addis Ababa", sub_city: "Bole", address: "Test address",
  } }, res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.equal(chapaPayload.email, "customer@example.test");
  assert.equal(clientQueries.some((sql) => sql.includes("notification_outbox")), false);
  assert.ok(clientQueries.some((sql) => sql.includes("'chapa','pending','awaiting_payment'")));
  assert.ok(clientQueries.some((sql) => sql.includes("created_at+INTERVAL '30 minutes'")));
  const savedCheckout = poolQueries.find(({ sql }) => sql.includes("UPDATE payments SET checkout_url"));
  assert.ok(savedCheckout);
  assert.match(savedCheckout.sql, /order_id=\$3.*RETURNING id/);
  assert.equal(savedCheckout.values[0], "https://checkout.chapa.co/checkout/test");
  assert.equal(savedCheckout.values[1], res.body.data.tx_ref);
  assert.equal(savedCheckout.values[2], 91);
  assert.equal(res.body.data.checkout_url, "https://checkout.chapa.co/checkout/test");
  assert.equal(clientQueries.some((sql) => /payment_status='successful'/.test(sql)), false);
});

test("dispatch eligibility allows unpaid COD separately from unpaid Chapa", () => {
  assert.equal(dispatchPaymentEligible({ payment_method: "cod", payment_status: "pending" }), true);
  assert.equal(dispatchPaymentEligible({ payment_method: "chapa", payment_status: "pending" }), false);
  assert.equal(dispatchPaymentEligible({ payment_method: "bitcoin", payment_status: "pending" }), false);
});

test("drivers cannot access staff-only payment reconciliation permission", () => {
  assert.equal(hasStaffPermission({ status: "active", is_super_admin: false, permissions: [] }, "reconcile_cod"), false);
});

test("driver delivery details are scoped to the assigned driver and omit verification secrets", async (t) => {
  const queries = [];
  t.mock.method(pool, "query", async (sql, values) => {
    queries.push({ sql, values });
    if (sql.includes("FROM orders o") && sql.includes("delivery_assignments da")) {
      return values[0] === 21 ? { rows: [{ id: 90, response_status: "accepted", receiver_name: "Receiver", phone: "0911000000", address: "Test address", order_status: "out_for_delivery", assignment_id: 33 }] } : { rows: [] };
    }
    if (sql.includes("FROM order_items")) return { rows: [{ product_id: 4, quantity: 1, price_at_purchase: 10, title: "Item" }] };
    if (sql.includes("FROM delivery_attempts")) return { rows: [{ id: 1, status: "out_for_delivery" }] };
    if (sql.includes("FROM cod_collections")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  const res = makeResponse();
  const next = nextRecorder();
  await getDriverDelivery({ user: { id: 21 }, params: { id: "90" } }, res, next.next);
  assert.equal(res.statusCode, 200);
  assert.equal(queries[0].values[0], 21);
  assert.equal(queries[0].values[1], "90");
  assert.match(queries[0].sql, /da\.driver_id=\$1/);
  assert.doesNotMatch(JSON.stringify(res.body), /code_hash|verification_code|customer_code/);
  assert.doesNotMatch(queries[0].sql, /code_hash|verification_code/);

  const otherDriverRes = makeResponse();
  await getDriverDelivery({ user: { id: 22 }, params: { id: "90" } }, otherDriverRes, next.next);
  assert.equal(otherDriverRes.statusCode, 404);
});

test("driver dashboard returns only that driver's active assignments and retained history", async (t) => {
  const assignments = [
    { id: 90, assignment_id: 33, order_status: "assigned_to_driver", response_status: "offered", unassigned_at: null, payment_method: "cod", payment_status: "pending", total_price: "45.00" },
    { id: 91, assignment_id: 34, order_status: "delivered", response_status: "accepted", unassigned_at: new Date(), latest_attempt_status: "delivered", payment_method: "chapa", payment_status: "successful", total_price: "25.00" },
    { id: 92, assignment_id: 35, order_status: "delivery_failed", response_status: "accepted", unassigned_at: null, latest_attempt_status: "failed", payment_method: "chapa", payment_status: "successful", total_price: "15.00" },
  ];
  const calls = [];
  t.mock.method(pool, "query", async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("FROM delivery_assignments da")) return { rows: assignments };
    if (sql.includes("COUNT(*) FILTER")) return { rows: [{ completed: 1, failed: 2 }] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  const res = makeResponse();
  await getDriverDashboard({ user: { id: 21 } }, res, assert.fail);
  assert.deepEqual(calls.map((call) => call.values), [[21], [21]]);
  assert.match(calls[0].sql, /WHERE da\.driver_id=\$1/);
  assert.match(calls[0].sql, /CASE WHEN da\.response_status='accepted' THEN a\.phone END/);
  assert.match(calls[0].sql, /CASE WHEN da\.response_status='accepted' THEN a\.city END/);
  assert.deepEqual(res.body.deliveries.map((item) => item.assignment_id), [33, 35]);
  assert.deepEqual(res.body.history.map((item) => item.assignment_id), [34]);
  assert.equal(res.body.completed, 1);
  assert.equal(res.body.failed, 2);
  assert.equal(res.body.codOutstanding, 45);
});

test("driver can accept or reject only a valid offer; rejection returns it to staff", async (t) => {
  const statements = [];
  t.mock.method(pool, "connect", async () => ({
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT da.id,da.response_status")) return { rows: [{ id: 33, response_status: "offered", unassigned_at: null, offer_expires_at: new Date(Date.now() + 60000), order_id: 90, order_status: "assigned_to_driver" }] };
      return { rows: [] };
    },
    release() {},
  }));
  const accepted = makeResponse();
  await respondToAssignment({ user: { id: 21 }, params: { assignmentId: "33" }, body: { response: "accept" } }, accepted, () => {});
  assert.equal(accepted.statusCode, 200);
  assert.ok(statements.some((sql) => sql.includes("response_status='accepted'")));

  statements.length = 0;
  const rejected = makeResponse();
  await respondToAssignment({ user: { id: 21 }, params: { assignmentId: "33" }, body: { response: "reject", reason: "Unable to take this delivery" } }, rejected, () => {});
  assert.equal(rejected.statusCode, 200);
  assert.ok(statements.some((sql) => sql.includes("response_status='rejected'")));
  assert.ok(statements.some((sql) => sql.includes("SET order_status='ready_for_dispatch'")));
  assert.ok(!statements.some((sql) => sql.includes("INSERT INTO delivery_assignments")));
});

test("driver failed attempt records reason and marks the order for staff review", async (t) => {
  const statements = [];
  t.mock.method(pool, "connect", async () => ({
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT d.id, d.attempt_number")) return { rows: [{ id: 3, attempt_number: 1, order_id: 90 }] };
      return { rows: [] };
    },
    release() {},
  }));
  const res = makeResponse();
  await failDelivery({ user: { id: 21 }, params: { id: "90" }, body: { reason: "customer_unavailable", notes: "" } }, res, () => {});
  assert.equal(res.statusCode, 200);
  assert.ok(statements.some((sql) => sql.includes("failure_reason=$1")));
  assert.ok(statements.some((sql) => sql.includes("SET order_status='delivery_failed'")));
});

test("driver COD collection stays unpaid until authorized staff reconciliation", async (t) => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT c.*, o.total_price")) return { rows: [{ id: 5, order_id: 90, total_price: 25.5, payment_method: "cod", payment_status: "pending", status: "pending_review", collected_amount: 25.5 }] };
      return { rows: [] };
    },
    release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();
  await reconcileCodCollection({ user: { id: 2 }, params: { collectionId: "5" }, body: { confirmed_amount: 25.5, reason: "Cash counted against receipt" } }, res, () => {});
  assert.equal(res.statusCode, 200);
  assert.ok(statements.some((sql) => sql.includes("UPDATE orders SET payment_status='successful'")));
  assert.ok(statements.some((sql) => sql.includes("UPDATE payments SET status='successful'")));
});

test("staff assignment accepts only active drivers and audits the initial assignment", async (t) => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT id,user_id,total_price,order_status")) return { rows: [{ id: 90, user_id: 8, total_price: 25.5, order_status: "ready_for_dispatch", payment_method: "cod", payment_status: "pending" }] };
      if (sql.includes("SELECT status FROM driver_profiles")) return { rows: [{ status: "active" }] };
      if (sql.includes("SELECT id, driver_id FROM delivery_assignments")) return { rows: [] };
      if (sql.includes("INSERT INTO delivery_assignments")) return { rows: [{ id: 33 }] };
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();
  await assignDelivery({ user: { id: 16 }, params: { orderId: "90" }, body: { driverId: 21, reason: "Dispatch to active driver" } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.ok(statements.some((sql) => sql.includes("INSERT INTO delivery_assignments")));
  assert.ok(statements.some((sql) => sql.includes("operations_audit_log")));
  assert.ok(statements.some((sql) => sql.includes("UPDATE orders SET order_status='assigned_to_driver'")));
});

test("driver reassignment requires and records a manual reason", async (t) => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT id,user_id,total_price,order_status")) return { rows: [{ id: 90, user_id: 8, total_price: 25.5, order_status: "assigned_to_driver", payment_method: "cod", payment_status: "pending" }] };
      if (sql.includes("SELECT status FROM driver_profiles")) return { rows: [{ status: "active" }] };
      if (sql.includes("SELECT id, driver_id FROM delivery_assignments")) return { rows: [{ id: 33, driver_id: 21 }] };
      if (sql.includes("INSERT INTO delivery_assignments")) return { rows: [{ id: 34 }] };
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();
  await assignDelivery({ user: { id: 16 }, params: { orderId: "90" }, body: { driverId: 22, reason: "Customer requested a different delivery window" } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.ok(statements.some((sql) => sql.includes("UPDATE delivery_assignments SET unassigned_at=NOW()")));
  assert.ok(statements.filter((sql) => sql.includes("operations_audit_log")).length >= 2);
  assert.ok(statements.some((sql) => sql.includes("UPDATE delivery_assignments SET unassigned_at=NOW()")));
});

test("Super Admin can manually reassign without a reason while preserving assignment workflow", async (t) => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT id,user_id,total_price,order_status")) return { rows: [{ id: 90, user_id: 8, total_price: 25.5, order_status: "assigned_to_driver", payment_method: "cod", payment_status: "pending" }] };
      if (sql.includes("SELECT status FROM driver_profiles")) return { rows: [{ status: "active" }] };
      if (sql.includes("SELECT id, driver_id FROM delivery_assignments")) return { rows: [{ id: 33, driver_id: 21 }] };
      if (sql.includes("INSERT INTO delivery_assignments")) return { rows: [{ id: 34 }] };
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();
  await assignDelivery({ user: { id: 16 }, staff: { status: "active", is_super_admin: true, permissions: [] }, params: { orderId: "90" }, body: { driverId: 22 } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.ok(statements.some((sql) => sql.includes("UPDATE delivery_assignments SET unassigned_at=NOW()")));
});

test("cancelled, expired, and delivered orders cannot be assigned even for Super Admin", async (t) => {
  for (const order_status of ["cancelled", "expired", "delivered"]) {
    const statements = [];
    const client = { async query(sql) {
      statements.push(sql);
      if (sql.includes("SELECT id,user_id,total_price,order_status")) return { rows: [{ id: 90, user_id: 8, total_price: 25.5, order_status, payment_method: "cod", payment_status: "pending" }] };
      return { rows: [] };
    }, release() {} };
    t.mock.method(pool, "connect", async () => client);
    const res = makeResponse();
    await assignDelivery({ user: { id: 16 }, staff: { status: "active", is_super_admin: true, permissions: [] }, params: { orderId: "90" }, body: { driverId: 22 } }, res, assert.fail);
    assert.equal(res.statusCode, 409);
    assert.equal(res.count, 1);
    assert.equal(statements.some((sql) => sql.includes("INSERT INTO delivery_assignments")), false);
    assert.equal(statements.some((sql) => sql.includes("operations_audit_log")), false);
    t.mock.reset();
  }
});
