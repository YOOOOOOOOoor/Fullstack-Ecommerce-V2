import test from "node:test";
import assert from "node:assert/strict";
import { createUpdateAccountTypeHandler } from "../controllers/adminCustomerController.js";
import { STAFF_PERMISSIONS } from "../controllers/staffController.js";
import pool from "../config/db.js";

const response = () => ({ statusCode: 200, body: null, count: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; this.count += 1; return this; } });

const makeDb = ({ target = { id: 7, role: "customer", email: "person@example.test", staff_status: null, is_super_admin: false, driver_status: null }, activeAssignments = false } = {}) => {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      queries.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      if (sql.includes("SELECT u.id,u.role,u.email")) return { rows: [target] };
      if (sql.includes("SELECT 1 FROM delivery_assignments")) return { rows: activeAssignments ? [{ one: 1 }] : [] };
      return { rows: [] };
    },
    release() {},
  };
  return { queries, db: { connect: async () => client } };
};

const makeReq = (type, extra = {}) => ({ params: { id: "7" }, user: { id: 16 }, body: { type, reason: "Owner approved account update", ...(type === "staff" ? { permissions: ["view_orders"] } : {}), ...extra } });

test("Super Admin promotion creates an active driver profile and audits the change", async () => {
  const { db, queries } = makeDb();
  const audit = [];
  const handler = createUpdateAccountTypeHandler({ db, auditWriter: async (...args) => audit.push(args) });
  const res = response();
  await handler(makeReq("driver"), res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.ok(queries.some(({ sql }) => sql.includes("INSERT INTO driver_profiles") && sql.includes("'active'")));
  assert.ok(queries.some(({ sql, values }) => sql.includes("UPDATE users SET role=$1") && values[0] === "customer"));
  assert.equal(audit[0][2], "customer.account_type_changed");
  assert.equal(audit[0][5].accountType, "driver");
  assert.ok(queries.some(({ sql }) => sql === "COMMIT"));
});

test("driver promotion reactivates a suspended historical driver profile", async () => {
  const { db, queries } = makeDb({ target: { id: 7, role: "customer", email: "person@example.test", staff_status: null, is_super_admin: false, driver_status: "suspended" } });
  const handler = createUpdateAccountTypeHandler({ db, auditWriter: async () => {} });
  const res = response();
  await handler(makeReq("driver"), res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.ok(queries.some(({ sql }) => sql.includes("ON CONFLICT(user_id) DO UPDATE SET status='active'")));
});

test("Staff promotion requires and stores explicit allowed permissions", async () => {
  const { db, queries } = makeDb();
  const audit = [];
  const handler = createUpdateAccountTypeHandler({ db, auditWriter: async (...args) => audit.push(args) });
  const denied = response();
  await handler(makeReq("staff", { permissions: ["all_access"] }), denied, assert.fail);
  assert.equal(denied.statusCode, 400);
  assert.equal(denied.count, 1);
  assert.equal(queries.length, 0);

  const res = response();
  await handler(makeReq("staff"), res, assert.fail);
  const update = queries.find(({ sql }) => sql.includes("INSERT INTO staff_profiles"));
  assert.equal(JSON.parse(update.values[1]).join(","), "view_orders");
  assert.ok(queries.some(({ sql, values }) => sql.includes("UPDATE users SET role=$1") && values[0] === "admin"));
  assert.deepEqual(audit[0][5].permissions, ["view_orders"]);
});

test("returning an assigned driver to customer is refused without changing access", async () => {
  const { db, queries } = makeDb({ target: { id: 7, role: "customer", email: "person@example.test", staff_status: null, is_super_admin: false, driver_status: "active" }, activeAssignments: true });
  const handler = createUpdateAccountTypeHandler({ db, auditWriter: async () => {} });
  const res = response();
  await handler(makeReq("customer"), res, assert.fail);
  assert.equal(res.statusCode, 409);
  assert.equal(res.count, 1);
  assert.equal(queries.some(({ sql }) => sql.startsWith("UPDATE users")), false);
});

test("account change cannot demote or mutate the owner account", async () => {
  const { db, queries } = makeDb({ target: { id: 16, role: "admin", email: "admin@example.com", staff_status: "active", is_super_admin: true, driver_status: null } });
  const handler = createUpdateAccountTypeHandler({ db, auditWriter: async () => {} });
  const res = response();
  await handler({ ...makeReq("customer"), params: { id: "16" }, user: { id: 2 } }, res, assert.fail);
  assert.equal(res.statusCode, 403);
  assert.equal(queries.some(({ sql }) => sql.startsWith("UPDATE users")), false);
});

test("account changes cannot be self-assigned by an ordinary staff or customer account", async () => {
  const { db } = makeDb();
  const handler = createUpdateAccountTypeHandler({ db });
  const res = response();
  await handler({ ...makeReq("staff"), user: { id: 7 } }, res, assert.fail);
  assert.equal(res.statusCode, 400);
});

test("Super Admin account-management action may omit a reason and records it as null", async () => {
  const { db } = makeDb();
  const audit = [];
  const handler = createUpdateAccountTypeHandler({ db, auditWriter: async (...args) => audit.push(args) });
  const req = { ...makeReq("customer", { reason: "" }), staff: { status: "active", is_super_admin: true } };
  const res = response();
  await handler(req, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(audit[0][5].reason, null);
});

test("non-Super-Admin account mutation does not bypass required reason validation", async () => {
  const { db, queries } = makeDb();
  const handler = createUpdateAccountTypeHandler({ db, auditWriter: async () => {} });
  const res = response();
  await handler(makeReq("customer", { reason: "" }), res, assert.fail);
  assert.equal(res.statusCode, 400);
  assert.equal(queries.length, 0);
});

test("staff permission names in the API remain the existing explicit permission model", () => {
  assert.ok(STAFF_PERMISSIONS.includes("assign_drivers"));
  assert.ok(STAFF_PERMISSIONS.includes("reconcile_cod"));
  assert.ok(STAFF_PERMISSIONS.includes("manage_customers"));
});

test("local development database has exactly one Super Admin and all staff roles have profiles", async (t) => {
  if (process.env.DATABASE_URL || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST) || process.env.DB_NAME !== "ecommerce_db") {
    t.skip("Safe local ecommerce_db is not configured; production databases are never inspected by this test.");
    return;
  }
  const identity = await pool.query("SELECT current_database() AS db,inet_server_addr() AS addr");
  assert.equal(identity.rows[0].db, "ecommerce_db");
  assert.ok(["::1", "127.0.0.1"].includes(identity.rows[0].addr));
  const result = await pool.query(`SELECT u.role,u.email='admin@example.com' AS owner,sp.status,sp.is_super_admin,dp.status AS driver_status
    FROM users u LEFT JOIN staff_profiles sp ON sp.user_id=u.id LEFT JOIN driver_profiles dp ON dp.user_id=u.id`);
  const owners = result.rows.filter((row) => row.owner);
  const superAdmins = result.rows.filter((row) => row.is_super_admin);
  assert.equal(owners.length, 1);
  assert.equal(owners[0].role, "admin");
  assert.equal(owners[0].status, "active");
  assert.equal(owners[0].is_super_admin, true);
  assert.equal(superAdmins.length, 1);
  assert.ok(result.rows.filter((row) => !row.owner).every((row) => !row.is_super_admin));
  assert.ok(result.rows.filter((row) => !row.owner && row.role === "admin").every((row) => row.status !== null));
});
