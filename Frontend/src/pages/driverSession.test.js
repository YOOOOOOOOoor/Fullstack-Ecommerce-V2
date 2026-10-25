import test from "node:test";
import assert from "node:assert/strict";
import { logoutDriver } from "./driverSession.js";

test("driver logout clears frontend identity and replaces protected history only after API success", async () => {
  const calls = [];
  await logoutDriver({
    api: { async post(path) { calls.push(["post", path]); } },
    setUser(value) { calls.push(["user", value]); },
    navigate(path, options) { calls.push(["navigate", path, options]); },
  });
  assert.deepEqual(calls, [["post", "/auth/logout"], ["user", null], ["navigate", "/driver/login", { replace: true }]]);

  const failedCalls = [];
  await assert.rejects(logoutDriver({
    api: { async post() { throw new Error("network error"); } },
    setUser(value) { failedCalls.push(["user", value]); },
    navigate() { failedCalls.push(["navigate"]); },
  }));
  assert.deepEqual(failedCalls, []);
});
