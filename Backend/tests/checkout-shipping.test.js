import test from "node:test";
import assert from "node:assert/strict";
import { createCodCheckoutHandler, createTotalAmountHandler } from "../controllers/checkoutController.js";
import { createGetShippingConfigHandler, createUpdateShippingConfigHandler } from "../controllers/shippingController.js";
import { createRequireSuperAdmin } from "../middleware/permissions.js";
import { getShippingFee } from "../services/checkoutConfig.js";
import { createAllCartHandler } from "../controllers/cartContollers.js";

const responseRecorder = () => ({
  statusCode: 200,
  responseCount: 0,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.responseCount += 1; this.body = body; return this; },
});

const dbWithFee = (fee) => ({
  async query(sql) {
    if (sql.includes("FROM carts")) return { rows: [{ id: 7 }] };
    if (sql.includes("COALESCE(SUM(products.price")) return { rows: [{ total: "23.50" }] };
    if (sql.includes("FROM shipping_config")) return { rows: fee === undefined ? [] : [{ default_fee: fee }] };
    if (sql.includes("FROM settings")) return { rows: [{ shipping_fee: null }] };
    throw new Error(`Unexpected query: ${sql}`);
  },
});

const runTotalHandler = async (handler) => {
  const res = responseRecorder();
  let nextCalls = 0;
  const next = (error) => {
    nextCalls += 1;
    if (error) res.status(error.status || 500).json({ message: error.message });
  };
  await handler({ user: { id: 42 } }, res, next);
  return { res, nextCalls };
};

test("COD checkout rejects draft products before creating an order or reserving stock", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      const query = sql.replace(/\s+/g, " ").trim();
      statements.push(query);
      if (query.startsWith("SELECT id FROM carts")) return { rows: [{ id: 7 }] };
      if (query.startsWith("SELECT ci.product_id")) return { rows: [{ product_id: 12, quantity: 1, price: "10.00", stock: 5, status: "draft" }] };
      return { rows: [] };
    },
    release() {},
  };
  const db = { connect: async () => client };
  const handler = createCodCheckoutHandler({ db, shippingFeeReader: async () => 5, codEnabledReader: async () => true, auditWriter: async () => assert.fail("audit must not be written") });
  const res = responseRecorder();
  await handler({ get: () => "draft-rejection-1234", user: { id: 9 }, body: { receiver_name: "Buyer", phone: "123", city: "A", sub_city: "B", address: "C" } }, res, assert.fail);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /unavailable/);
  assert.ok(statements.includes("ROLLBACK"));
  assert.equal(statements.some((query) => query.startsWith("INSERT INTO orders")), false);
  assert.equal(statements.some((query) => query.startsWith("UPDATE products SET stock=stock-")), false);
});

test("repeated COD checkout key returns the existing order after a lost response", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      const query = sql.replace(/\s+/g, " ").trim();
      statements.push(query);
      if (query.includes("o.checkout_key=$2")) {
        return { rows: [{ id: 52, payment_method: "cod", order_status: "processing", payment_status: "pending" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const handler = createCodCheckoutHandler({ db: { connect: async () => client } });
  const res = responseRecorder();
  await handler({ get: () => "cod-idempotency-1234", user: { id: 9 }, body: {} }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.order_id, 52);
  assert.equal(statements.includes("COMMIT"), true);
  assert.equal(statements.some((query) => query.startsWith("INSERT INTO orders")), false);
});

test("checkout total combines cart prices and the saved default ETB fee", async () => {
  const previousFee = process.env.SHIPPING_FEE_ETB;
  process.env.SHIPPING_FEE_ETB = "";
  try {
    const handler = createTotalAmountHandler({ db: dbWithFee("8.25") });
    const { res, nextCalls } = await runTotalHandler(handler);
    assert.equal(nextCalls, 0);
    assert.equal(res.responseCount, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total, "23.50");
    assert.equal(res.body.shipping_fee, 8.25);
    assert.equal(res.body.payable_total, 31.75);
  } finally {
    if (previousFee === undefined) delete process.env.SHIPPING_FEE_ETB;
    else process.env.SHIPPING_FEE_ETB = previousFee;
  }
});

test("missing shipping configuration is exposed as a safe 503", async () => {
  const previousFee = process.env.SHIPPING_FEE_ETB;
  process.env.SHIPPING_FEE_ETB = "";
  try {
    const handler = createTotalAmountHandler({ db: dbWithFee(undefined) });
    const { res, nextCalls } = await runTotalHandler(handler);
    assert.equal(nextCalls, 1);
    assert.equal(res.responseCount, 1);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.message, "A valid default shipping fee must be configured before checkout.");
  } finally {
    if (previousFee === undefined) delete process.env.SHIPPING_FEE_ETB;
    else process.env.SHIPPING_FEE_ETB = previousFee;
  }
});

test("invalid saved shipping fee is rejected with 503 rather than used", async () => {
  await assert.rejects(getShippingFee(dbWithFee("not-a-number")), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.expose, true);
    assert.equal(error.message, "A valid default shipping fee must be configured before checkout.");
    return true;
  });
});

test("checkout controller delegates shipping errors and emits no second response", async () => {
  const previousFee = process.env.SHIPPING_FEE_ETB;
  process.env.SHIPPING_FEE_ETB = "";
  try {
    const handler = createTotalAmountHandler({ db: dbWithFee(undefined) });
    const { res, nextCalls } = await runTotalHandler(handler);
    assert.equal(nextCalls, 1);
    assert.equal(res.responseCount, 1);
    assert.equal(res.statusCode, 503);
  } finally {
    if (previousFee === undefined) delete process.env.SHIPPING_FEE_ETB;
    else process.env.SHIPPING_FEE_ETB = previousFee;
  }
});

test("ordinary admin cannot reach default shipping fee mutation", async () => {
  let saveReached = false;
  const guard = createRequireSuperAdmin({ db: { query: async () => ({ rows: [{ status: "active", is_super_admin: false }] }) } });
  const res = responseRecorder();
  let nextCalls = 0;
  await guard({ user: { id: 42, role: "admin" } }, res, () => { nextCalls += 1; saveReached = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.responseCount, 1);
  assert.equal(nextCalls, 0);
  assert.equal(saveReached, false);
});

test("Super Admin shipping fee save persists to the existing config and checkout reads it", async () => {
  let savedFee = null;
  const client = {
    async query(sql, values) {
      if (sql.includes("SELECT default_fee FROM shipping_config")) return { rows: savedFee === null ? [] : [{ default_fee: savedFee }] };
      if (sql.includes("INSERT INTO shipping_config")) { savedFee = values[0]; return { rows: [] }; }
      return { rows: [] };
    },
    release() {},
  };
  const db = {
    connect: async () => client,
    query: async () => ({ rows: savedFee === null ? [] : [{ default_fee: savedFee }] }),
  };
  const handler = createUpdateShippingConfigHandler({ db, auditWriter: async () => {} });
  const res = responseRecorder();
  let nextError;
  await handler({ body: { default_fee: 12.5, reason: "Updated local delivery pricing" }, user: { id: 1 } }, res, (error) => { nextError = error; });
  assert.equal(nextError, undefined);
  assert.equal(res.responseCount, 1);
  assert.equal(res.body.currency, "ETB");
  assert.equal(res.body.default_fee, 12.5);
  assert.equal(await getShippingFee(db), 12.5);
});

test("shipping settings can be read and the first fee saved while checkout has no fee", async () => {
  let savedFee = null;
  let committed = false;
  let rolledBack = false;
  const audit = [];
  const client = {
    async query(sql, values) {
      if (sql === "BEGIN") return { rows: [] };
      if (sql.includes("SELECT default_fee FROM shipping_config")) return { rows: savedFee === null ? [] : [{ default_fee: savedFee }] };
      if (sql.includes("INSERT INTO shipping_config")) { savedFee = values[0]; return { rows: [] }; }
      if (sql === "COMMIT") { committed = true; return { rows: [] }; }
      if (sql === "ROLLBACK") { rolledBack = true; savedFee = null; return { rows: [] }; }
      return { rows: [] };
    }, release() {},
  };
  const db = { connect: async () => client, query: async () => ({ rows: savedFee === null ? [] : [{ default_fee: savedFee, updated_at: null }] }) };
  const get = createGetShippingConfigHandler({ db, environmentFee: () => "" });
  const initial = responseRecorder();
  await get({}, initial, assert.fail);
  assert.equal(initial.body.configured, false);
  assert.equal(initial.body.default_fee, null);

  const save = createUpdateShippingConfigHandler({ db, auditWriter: async (...args) => audit.push(args) });
  const res = responseRecorder();
  await save({ body: { default_fee: "7.25", reason: "Initial local fee setup" }, user: { id: 16 } }, res, assert.fail);
  assert.equal(res.body.default_fee, 7.25);
  assert.equal(committed, true);
  assert.equal(rolledBack, false);
  assert.equal(audit[0][2], "shipping.default_fee_changed");
  assert.deepEqual(audit[0][5], { previousFee: null, newFee: 7.25, reason: "Initial local fee setup", currency: "ETB" });
  assert.equal(await getShippingFee(db), 7.25);
});

test("shipping fee save rejects missing, malformed, negative, and over-precision amounts before opening a transaction", async () => {
  let connects = 0;
  const handler = createUpdateShippingConfigHandler({ db: { connect: async () => { connects += 1; throw new Error("must not connect"); } } });
  for (const default_fee of [undefined, "", "abc", "-1", "1.234"]) {
    const res = responseRecorder();
    await handler({ body: { default_fee, reason: "Validly long reason" }, user: { id: 16 } }, res, assert.fail);
    assert.equal(res.statusCode, 400);
    assert.equal(res.responseCount, 1);
  }
  assert.equal(connects, 0);
});

test("failed shipping audit rolls back the first fee and never reports success", async () => {
  let savedFee = null;
  let rollback = false;
  const client = {
    async query(sql, values) {
      if (sql.includes("INSERT INTO shipping_config")) savedFee = values[0];
      if (sql === "ROLLBACK") { rollback = true; savedFee = null; }
      return { rows: [] };
    }, release() {},
  };
  const handler = createUpdateShippingConfigHandler({ db: { connect: async () => client }, auditWriter: async () => { throw new Error("audit unavailable"); } });
  const res = responseRecorder();
  let error;
  await handler({ body: { default_fee: 5, reason: "Initial fee configuration" }, user: { id: 16 } }, res, (value) => { error = value; });
  assert.equal(rollback, true);
  assert.equal(savedFee, null);
  assert.equal(res.responseCount, 0);
  assert.match(error.message, /audit unavailable/);
});

test("cart total separates subtotal, configured shipping, and payable total", async () => {
  const db = { query: async (sql) => sql.includes("FROM carts") ? { rows: [{ id: 3 }] } : { rows: [{ total: "40.00" }] } };
  const handler = createAllCartHandler({ db, shippingFeeReader: async () => 6.5 });
  const res = responseRecorder();
  await handler({ user: { id: 42 } }, res, assert.fail);
  assert.deepEqual(res.body, { total: 40, subtotal: 40, shipping_fee: 6.5, payable_total: 46.5, shipping_configured: true });
});

test("uninitialized cart returns empty totals using the configured shipping fee", async () => {
  const db = { query: async () => ({ rows: [] }) };
  const handler = createAllCartHandler({ db, shippingFeeReader: async () => 0 });
  const res = responseRecorder();
  await handler({ user: { id: 42 } }, res, assert.fail);
  assert.deepEqual(res.body, { total: 0, subtotal: 0, shipping_fee: 0, payable_total: 0, shipping_configured: true });
});

test("uninitialized cart still applies a nonzero configured shipping fee", async () => {
  const db = { query: async () => ({ rows: [] }) };
  const handler = createAllCartHandler({ db, shippingFeeReader: async () => 8.25 });
  const res = responseRecorder();
  await handler({ user: { id: 42 } }, res, assert.fail);
  assert.equal(res.body.subtotal, 0);
  assert.equal(res.body.shipping_fee, 8.25);
  assert.equal(res.body.payable_total, 8.25);
});

test("cart remains readable and reports an unconfigured fee without hiding the subtotal", async () => {
  const db = { query: async (sql) => sql.includes("FROM carts") ? { rows: [{ id: 3 }] } : { rows: [{ total: "40.00" }] } };
  const handler = createAllCartHandler({ db, shippingFeeReader: async () => { throw Object.assign(new Error("A valid default shipping fee must be configured before checkout."), { status: 503 }); } });
  const res = responseRecorder();
  await handler({ user: { id: 42 } }, res, assert.fail);
  assert.equal(res.body.subtotal, 40);
  assert.equal(res.body.shipping_fee, null);
  assert.equal(res.body.payable_total, null);
  assert.equal(res.body.shipping_configured, false);
});
