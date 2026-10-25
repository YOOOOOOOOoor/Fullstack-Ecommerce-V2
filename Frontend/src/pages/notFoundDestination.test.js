import test from "node:test";
import assert from "node:assert/strict";
import { getNotFoundDestination } from "./notFoundDestination.js";

test("not-found return destinations follow the current portal path", () => {
  assert.equal(getNotFoundDestination("/driver/support"), "/driver/dashboard");
  assert.equal(getNotFoundDestination("/driver/unknown/nested"), "/driver/dashboard");
  assert.equal(getNotFoundDestination("/admin/unknown/nested"), "/admin");
  assert.equal(getNotFoundDestination("/unknown/nested"), "/");
});
