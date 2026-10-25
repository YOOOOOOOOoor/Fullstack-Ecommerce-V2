import test from "node:test";
import assert from "node:assert/strict";
import { filterRefundCases, getRefundStatusCounts, paginateRefundCases, readRefundView } from "./refundManagementState.js";

const cases = [
  { id: 1, order_id: 101, customer_name: "Aster", customer_email: "aster@example.test", status: "requested" },
  { id: 2, order_id: 102, customer_name: "Bekele", customer_email: "bekele@example.test", status: "refund_processing" },
  { id: 3, order_id: 103, customer_name: "Sara", customer_email: "sara@example.test", status: "refunded" },
  { id: 4, order_id: 104, customer_name: "Dawit", customer_email: "dawit@example.test", status: "refund_failed" },
];

test("refund case search matches order, case, customer name, and email with status filtering", () => {
  assert.equal(filterRefundCases(cases, "102", "refund_processing")[0].id, 2);
  assert.equal(filterRefundCases(cases, "ASTER").length, 1);
  assert.equal(filterRefundCases(cases, "sara@example.test")[0].id, 3);
  assert.equal(filterRefundCases(cases, "999", "refunded").length, 0);
});

test("refund summary counts represent each workflow bucket and paging slices safely", () => {
  assert.deepEqual(getRefundStatusCounts(cases), { needsReview: 1, inProgress: 1, completed: 1, failed: 1 });
  assert.deepEqual(paginateRefundCases(cases, 2, 2), cases.slice(2));
  assert.deepEqual(paginateRefundCases(cases, 0, 2), cases.slice(0, 2));
});

test("refund list defaults to Grid and honors a Table view URL preference", () => {
  assert.equal(readRefundView(new URLSearchParams()), "grid");
  assert.equal(readRefundView(new URLSearchParams("view=table")), "table");
  assert.equal(readRefundView(new URLSearchParams("view=unknown")), "grid");
});
