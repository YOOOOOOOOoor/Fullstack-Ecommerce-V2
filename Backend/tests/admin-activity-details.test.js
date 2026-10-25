import test from "node:test";
import assert from "node:assert/strict";
import pool from "../config/db.js";
import { getAdminActivityDetails } from "../controllers/notificationController.js";

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("audit details use the persisted actor, filter sensitive metadata, and gate resource links", async (t) => {
  t.mock.method(pool, "query", async (_sql, values) => {
    assert.deepEqual(values, [8]);
    return { rows: [{
      id: 3, actor_id: 12, actor_name: "Staff Name", action: "product.updated", entity_type: "product", entity_id: "44",
      metadata: { status: "published", email: "private@example.test", reason: "free-form private text", stock: 4 }, created_at: "2026-10-24T10:00:00Z",
    }] };
  });
  const res = response();
  await getAdminActivityDetails({ params: { id: "8" }, staff: { is_super_admin: false, permissions: ["view_notifications", "manage_products"] } }, res, assert.fail);
  assert.equal(res.body.actor.id, 12);
  assert.equal(res.body.actor.name, "Staff Name");
  assert.deepEqual(res.body.details, { status: "published", stock: 4 });
  assert.equal(res.body.resource_url, "/admin/products/44");
});

test("activity detail omits resource links when the viewer lacks that resource permission", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 3, actor_id: null, actor_name: null, action: "order.expired", entity_type: "order", entity_id: "91", metadata: {}, created_at: "2026-10-24T10:00:00Z" }] }));
  const res = response();
  await getAdminActivityDetails({ params: { id: "8" }, staff: { is_super_admin: false, permissions: ["view_notifications"] } }, res, assert.fail);
  assert.equal(res.body.resource_url, null);
  assert.equal(res.body.actor.name, "System");
});
