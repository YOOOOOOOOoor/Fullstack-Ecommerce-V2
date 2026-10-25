import test from "node:test";
import assert from "node:assert/strict";
import { paymentRemainingFromDeadline, paymentServerOffset } from "./paymentCountdown.js";

test("payment countdown uses the server deadline and corrects client clock skew", () => {
  const clientNow = Date.parse("2026-10-24T12:00:00Z");
  const serverNow = "2026-10-24T12:05:00Z";
  const offset = paymentServerOffset(serverNow, clientNow);
  assert.equal(paymentRemainingFromDeadline("2026-10-24T12:20:00Z", offset, clientNow), 15 * 60 * 1000);
});

test("payment countdown recalculates after an inactive tab and clamps at zero", () => {
  const deadline = "2026-10-24T12:30:00Z";
  const offset = 0;
  assert.equal(paymentRemainingFromDeadline(deadline, offset, Date.parse("2026-10-24T12:00:00Z")), 30 * 60 * 1000);
  assert.equal(paymentRemainingFromDeadline(deadline, offset, Date.parse("2026-10-24T12:30:05Z")), 0);
});

test("invalid server timestamps do not produce an unbounded timer", () => {
  assert.equal(paymentServerOffset("invalid", 1000), 0);
  assert.equal(paymentRemainingFromDeadline("invalid", 0, 1000), 0);
});
