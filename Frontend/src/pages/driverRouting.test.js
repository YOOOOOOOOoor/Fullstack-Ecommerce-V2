import test from "node:test";
import assert from "node:assert/strict";
import { getPostLoginDestination, isActiveDriver } from "./driverRouting.js";

test("active drivers are sent to the driver portal even though their base account role remains customer", () => {
  const driver = { role: "customer", driver_status: "active" };
  assert.equal(isActiveDriver(driver), true);
  assert.equal(getPostLoginDestination(driver), "/driver/dashboard");
});

test("staff go to an authorized section or a clear restricted page", () => {
  assert.equal(getPostLoginDestination({ role: "admin", staff_status: "active" }), "/admin/restricted");
  assert.equal(getPostLoginDestination({ role: "admin", staff_status: "active", permissions: ["view_reports"] }), "/admin/analytics");
  assert.equal(getPostLoginDestination({ role: "admin", staff_status: "active", is_super_admin: true }), "/admin");
  assert.equal(getPostLoginDestination({ role: "customer", driver_status: "suspended" }), "/");
});
