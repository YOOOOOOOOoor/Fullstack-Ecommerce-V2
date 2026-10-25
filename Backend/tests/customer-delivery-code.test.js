import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import pool from "../config/db.js";
import { getOrder } from "../controllers/orderController.js";
import { completeDelivery, getDriverDelivery, startDelivery } from "../controllers/driverController.js";
import { encryptDeliveryCode } from "../services/deliveryCodeCrypto.js";

const response = () => ({ statusCode: 200, body: null, jsonCount: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; this.jsonCount += 1; return this; } });

test("only the owning customer gets the active decrypted delivery code", async (t) => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "customer-code-test-secret-is-long-enough";
  const cipher = encryptDeliveryCode("014286");
  const queries = [];
  t.mock.method(pool, "query", async (sql, values) => {
    queries.push({ sql, values });
    if (sql.includes("FROM orders o")) return { rows: [{ id: 91, order_status: "out_for_delivery", delivery_code_status: "active", code_ciphertext: cipher, created_at: new Date(), refund_id: null }] };
    return { rows: [] };
  });
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });

  const res = response();
  await getOrder({ user: { id: 17 }, params: { id: "91" } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.delivery_code, "014286");
  assert.equal(res.body.delivery_code_status, "active");
  assert.doesNotMatch(JSON.stringify(res.body), /code_ciphertext/);
  assert.deepEqual(queries[0].values, [17, "91"]);
  assert.match(queries[0].sql, /WHERE o\.user_id = \$1\s+AND o\.id = \$2/);
  assert.match(queries[0].sql, /delivery_attempt\.code_expires_at<=NOW\(\)/);
  assert.match(queries[0].sql, /SELECT d\.code_ciphertext, d\.code_expires_at FROM delivery_attempts d/);
  assert.match(queries[0].sql, /o\.order_status='out_for_delivery'/);
});

test("customer order database errors are forwarded once without sending a response", async (t) => {
  const databaseError = new Error("database unavailable");
  t.mock.method(pool, "query", async () => { throw databaseError; });
  const res = response();
  let forwarded;
  await getOrder({ user: { id: 17 }, params: { id: "91" } }, res, (error) => { forwarded = error; });
  assert.equal(forwarded, databaseError);
  assert.equal(res.body, null);
});

test("customer order lookup hides codes from a different account", async (t) => {
  let valuesSeen;
  t.mock.method(pool, "query", async (_sql, values) => { valuesSeen = values; return { rows: [] }; });
  const res = response();
  await getOrder({ user: { id: 999 }, params: { id: "91" } }, res, assert.fail);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(valuesSeen, [999, "91"]);
  assert.doesNotMatch(JSON.stringify(res.body), /014286|code_ciphertext/);
});

test("starting delivery activates a code without external email delivery", async (t) => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT da.id, da.driver_id")) return { rows: [{ id: 8, order_id: 91, user_id: 17, order_status: "assigned_to_driver", payment_status: "successful", payment_method: "chapa" }] };
      if (sql.includes("SELECT id FROM delivery_attempts")) return { rows: [] };
      if (sql.includes("SELECT COUNT(*)::int")) return { rows: [{ count: 0 }] };
      if (sql.includes("INSERT INTO delivery_attempts")) return { rows: [{ id: 300 }] };
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  const res = response();
  await startDelivery({ user: { id: 22 }, params: { id: "91" } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /available on the customer's order details page/);
  assert.ok(statements.some((sql) => sql.includes("INSERT INTO delivery_attempts") && sql.includes("code_ciphertext")));
  assert.ok(statements.some((sql) => sql.includes("operations_audit_log")));
  assert.ok(statements.some((sql) => sql.includes("out_for_delivery")));
  assert.equal(statements.some((sql) => sql.includes("notification_outbox")), false);
});

test("driver order details do not retrieve either stored form of the code", async (t) => {
  t.mock.method(pool, "query", async (sql, values) => {
    if (sql.includes("FROM orders o") && sql.includes("delivery_assignments da")) return { rows: [{ id: 91, response_status: "accepted", order_status: "out_for_delivery", assignment_id: 8 }] };
    if (sql.includes("FROM order_items")) return { rows: [] };
    if (sql.includes("FROM delivery_attempts")) return { rows: [{ id: 300, status: "out_for_delivery" }] };
    if (sql.includes("FROM cod_collections")) return { rows: [] };
    assert.fail(`Unexpected query: ${sql} ${values}`);
  });
  const res = response();
  await getDriverDelivery({ user: { id: 22 }, params: { id: "91" } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(JSON.stringify(res.body), /code_hash|code_ciphertext|delivery_code/);
});

test("the assigned driver can still verify the customer's code and finish delivery", async (t) => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "customer-code-test-secret-is-long-enough";
  const digest = createHmac("sha256", process.env.JWT_SECRET).update("91:300:014286").digest("hex");
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT d.*, o.payment_method")) return { rows: [{ id: 300, order_id: 91, assignment_id: 8, driver_id: 22, status: "out_for_delivery", code_hash: digest, code_expires_at: new Date(Date.now() + 60_000), verification_attempts: 0, payment_method: "chapa", payment_status: "successful" }] };
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  const res = response();
  await completeDelivery({ user: { id: 22 }, params: { id: "91" }, body: { code: "014286" } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonCount, 1);
  assert.match(res.body.message, /confirmed/);
  assert.ok(statements.some((sql) => sql.includes("SET status='delivered', code_hash=NULL, code_ciphertext=NULL")));
  assert.ok(statements.some((sql) => sql.includes("UPDATE orders SET order_status='delivered'")));
  assert.ok(statements.some((sql) => sql.includes("UPDATE delivery_assignments SET unassigned_at=NOW()")));
  assert.ok(statements.includes("COMMIT"));
  assert.equal(statements.some((sql) => /email|notification_outbox/i.test(sql)), false);
});

test("repeated completion is reported as already completed only to the owning driver", async (t) => {
  const statements = [];
  t.mock.method(pool, "connect", async () => ({
    async query(sql, values = []) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT d.*, o.payment_method")) return { rows: [] };
      if (sql.includes("SELECT d.id FROM delivery_attempts d")) return { rows: values[1] === 22 ? [{ id: 300 }] : [] };
      return { rows: [] };
    },
    release() {},
  }));

  const repeated = response();
  await completeDelivery({ user: { id: 22 }, params: { id: "91" }, body: { code: "014286" } }, repeated, assert.fail);
  assert.equal(repeated.statusCode, 409);
  assert.equal(repeated.jsonCount, 1);
  assert.match(repeated.body.message, /already been completed/);

  const otherDriver = response();
  await completeDelivery({ user: { id: 23 }, params: { id: "91" }, body: { code: "014286" } }, otherDriver, assert.fail);
  assert.equal(otherDriver.statusCode, 404);
  assert.equal(otherDriver.jsonCount, 1);
  assert.match(otherDriver.body.message, /not found/);
  assert.ok(statements.some((sql) => sql.includes("da.order_id=d.order_id") && sql.includes("da.driver_id=$2")));
});

test("incorrect and expired delivery codes are rejected without completing the order", async (t) => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "customer-code-test-secret-is-long-enough";
  const digest = createHmac("sha256", process.env.JWT_SECRET).update("91:300:014286").digest("hex");
  const statements = [];
  let expired = false;
  const client = {
    async query(sql) {
      statements.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT d.*, o.payment_method")) return { rows: [{ id: 300, order_id: 91, assignment_id: 8, driver_id: 22, status: "out_for_delivery", code_hash: digest, code_expires_at: new Date(Date.now() + (expired ? -60_000 : 60_000)), verification_attempts: 0, payment_method: "chapa", payment_status: "successful" }] };
      return { rows: [] };
    }, release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  const wrongCode = response();
  await completeDelivery({ user: { id: 22 }, params: { id: "91" }, body: { code: "999999" } }, wrongCode, assert.fail);
  assert.equal(wrongCode.statusCode, 400);
  assert.ok(statements.some((sql) => sql.includes("verification_attempts=verification_attempts+1")));
  expired = true;
  const expiredCode = response();
  await completeDelivery({ user: { id: 22 }, params: { id: "91" }, body: { code: "014286" } }, expiredCode, assert.fail);
  assert.equal(expiredCode.statusCode, 409);
  assert.equal(statements.some((sql) => sql.includes("SET status='delivered'")), false);
});
