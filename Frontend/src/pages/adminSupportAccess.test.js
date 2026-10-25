import test from "node:test";
import assert from "node:assert/strict";
import { canManageAdminSupport } from "./adminSupportAccess.js";

test("admin support management is limited to the active Super Admin", () => {
  assert.equal(canManageAdminSupport({ role: "admin", staff_status: "active", is_super_admin: true }), true);
  assert.equal(canManageAdminSupport({ role: "admin", staff_status: "active", is_super_admin: false }), false);
  assert.equal(canManageAdminSupport({ role: "customer", staff_status: null, is_super_admin: false }), false);
  assert.equal(canManageAdminSupport({ role: "driver", driver_status: "active" }), false);
  assert.equal(canManageAdminSupport(null), false);
});
