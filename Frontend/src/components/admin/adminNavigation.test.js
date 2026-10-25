import test from "node:test";
import assert from "node:assert/strict";
import { hasAdminNavigationAccess } from "./adminNavigation.js";

const originalAdminSections = [
  { title: "Dashboard", permission: "view_dashboard" },
  { title: "Products", permission: "manage_products" },
  { title: "Categories", permission: "manage_products" },
  { title: "Orders", permission: "view_orders" },
  { title: "Analytics", permission: "view_reports" },
  { title: "Customers", permission: "manage_customers" },
];
const operationsSections = [
  { title: "Drivers", anyPermissions: ["assign_drivers", "view_delivery_history"] },
  { title: "Refunds", permission: "view_refunds" },
  { title: "Staff Permissions", superAdmin: true },
  { title: "Shipping Settings", superAdmin: true },
  { title: "Notification Warnings", permission: "view_notifications" },
  { title: "Support", superAdmin: true },
  { title: "Support", superAdmin: true },
];
const allItems = [...originalAdminSections, ...operationsSections];
const visibleTitles = (user) => allItems.filter((item) => hasAdminNavigationAccess(user, item)).map((item) => item.title);

test("Super Admin sees every admin section, including owner-only settings", () => {
  assert.deepEqual(visibleTitles({ is_super_admin: true, permissions: [] }), allItems.map((item) => item.title));
});

test("staff see original sections only when their exact permissions allow them", () => {
  assert.deepEqual(visibleTitles({ is_super_admin: false, permissions: ["view_dashboard", "manage_products", "view_orders", "view_reports", "manage_customers"] }), originalAdminSections.map((item) => item.title));
  assert.deepEqual(visibleTitles({ is_super_admin: false, permissions: ["view_reports"] }), ["Analytics"]);
  assert.deepEqual(visibleTitles({ is_super_admin: false, permissions: ["view_delivery_history"] }), ["Drivers"]);
  assert.deepEqual(visibleTitles({ is_super_admin: false, permissions: [] }), []);
});
