import test from "node:test";
import assert from "node:assert/strict";
import { clearNotifications, countNotifications, dismissNotification } from "./notificationWarningsState.js";

test("dismissing one staff activity synchronizes the visible notification count", () => {
  const current = { activities: [{ id: 1 }, { id: 2 }] };
  const next = dismissNotification(current, "2");
  assert.deepEqual(next, { activities: [{ id: 1 }] });
  assert.equal(countNotifications(next), 1);
});

test("Clear all empties staff activity and its visible count", () => {
  const next = clearNotifications();
  assert.deepEqual(next, { activities: [] });
  assert.equal(countNotifications(next), 0);
});
