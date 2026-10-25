import test from "node:test";
import assert from "node:assert/strict";
import { createRequireSuperAdmin } from "../middleware/permissions.js";
import { createFaq, createGetPublicSupportHandler, createUpdateSupportContactHandler } from "../controllers/supportController.js";
import pool from "../config/db.js";

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("FAQ management authorization rejects non-admin accounts", async () => {
  let databaseReads = 0;
  const protect = createRequireSuperAdmin({ db: { query: async () => { databaseReads += 1; return { rows: [{ status: "active", is_super_admin: false }] }; } } });
  const denied = response();
  await protect({ user: { id: 8, role: "customer" } }, denied, assert.fail);
  assert.equal(denied.statusCode, 403);
  assert.equal(databaseReads, 0);

  const driverDenied = response();
  await protect({ user: { id: 10, role: "driver" } }, driverDenied, assert.fail);
  assert.equal(driverDenied.statusCode, 403);
  assert.equal(databaseReads, 0);

  const staffDenied = response();
  await protect({ user: { id: 9, role: "admin" } }, staffDenied, assert.fail);
  assert.equal(staffDenied.statusCode, 403);
  assert.equal(databaseReads, 1);
});

test("FAQ create rejects invalid public content before persistence", async () => {
  const res = response();
  let nextCalls = 0;
  await createFaq({ body: { question: "Help?", answer: "Short" }, user: { id: 1 } }, res, () => { nextCalls += 1; });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /question/);
  assert.equal(nextCalls, 0);
});

test("public support returns persisted FAQs and configured contact without draft entries", async () => {
  const queries = [];
  const db = { async query(sql) {
    queries.push(sql);
    if (sql.includes("FROM store_faqs")) return { rows: [{ id: 1, question: "How are orders delivered?", answer: "A driver brings the order to your address.", position: 10 }] };
    return { rows: [{ support_email: "help@example.test", support_phone: null }] };
  } };
  const res = response();
  await createGetPublicSupportHandler({ db })({}, res, assert.fail);
  assert.deepEqual(res.body.faqs.map(({ id }) => id), [1]);
  assert.equal(res.body.contact.support_email, "help@example.test");
  assert.ok(queries[0].includes("is_published=TRUE"));
});

test("support contact validates email and saves only public contact data", async () => {
  const saved = [];
  const db = { async query(sql, values) { saved.push({ sql, values }); return { rows: [{ support_email: values[0], support_phone: values[1] }] }; } };
  const handler = createUpdateSupportContactHandler({ db, auditWriter: async () => {} });
  const invalid = response();
  await handler({ body: { support_email: "not-an-email", support_phone: "" }, user: { id: 1 } }, invalid, assert.fail);
  assert.equal(invalid.statusCode, 400);
  assert.equal(saved.length, 0);
  const valid = response();
  await handler({ body: { support_email: "help@example.test", support_phone: "+251 911 000 000" }, user: { id: 16 } }, valid, assert.fail);
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(saved[0].values, ["help@example.test", "+251 911 000 000", 16]);
  assert.equal(valid.body.support_email, "help@example.test");
});

test("local audit trigger enqueues one admin activity event transactionally", async (t) => {
  if (process.env.DATABASE_URL || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST) || process.env.DB_NAME !== "ecommerce_db") {
    t.skip("Safe local ecommerce_db is not configured."); return;
  }
  const client = await pool.connect();
  try {
    const identity = await client.query("SELECT current_database() AS db,inet_server_addr() AS addr,to_regprocedure('enqueue_admin_activity_from_audit()') AS trigger_fn");
    if (identity.rows[0].db !== "ecommerce_db" || !["127.0.0.1", "::1"].includes(identity.rows[0].addr) || !identity.rows[0].trigger_fn) {
      t.skip("Local admin activity migration is not available."); return;
    }
    const actor = await client.query("SELECT sp.user_id FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.is_super_admin=FALSE AND u.role='admin' ORDER BY sp.user_id LIMIT 1");
    if (!actor.rows.length) { t.skip("No ordinary staff account exists for an isolated outbox check."); return; }
    await client.query("BEGIN");
    await client.query("UPDATE staff_profiles SET status='active' WHERE user_id=$1", [actor.rows[0].user_id]);
    const audit = await client.query("INSERT INTO operations_audit_log(actor_id,action,entity_type,entity_id,metadata) VALUES($1,'order.ready_for_dispatch','test','activity-smoke','{\"reason\":\"isolated test\"}'::jsonb) RETURNING id", [actor.rows[0].user_id]);
    const queued = await client.query("SELECT payload FROM notification_outbox WHERE event_key LIKE $1", [`admin-audit:${audit.rows[0].id}:%`]);
    assert.equal(queued.rows.length, 1);
    assert.equal(queued.rows[0].payload.reason, "isolated test");
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
});

