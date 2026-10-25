import assert from "node:assert/strict";
import test from "node:test";
import { decodeVapidPublicKey, getDriverPushState, isDriverPushRegistered, setDriverPushRegistered } from "./driverPushNotifications.js";

test("background notification setup reports unsupported, unconfigured, denied, granted, and enabled states", () => {
  assert.equal(getDriverPushState({ supported: false, configured: true, permission: "default", registered: false }), "unsupported");
  assert.equal(getDriverPushState({ supported: true, configured: false, permission: "default", registered: false }), "unavailable");
  assert.equal(getDriverPushState({ supported: true, configured: true, permission: "denied", registered: false }), "denied");
  assert.equal(getDriverPushState({ supported: true, configured: true, permission: "granted", registered: false }), "granted");
  assert.equal(getDriverPushState({ supported: true, configured: true, permission: "granted", registered: true }), "enabled");
  assert.equal(getDriverPushState({ supported: true, configured: true, permission: "default", registered: false }), "not_enabled");
});

test("background push preference is scoped to the signed-in driver", () => {
  const originalWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } };
  try {
    setDriverPushRegistered(12, true);
    assert.equal(isDriverPushRegistered(12), true);
    assert.equal(isDriverPushRegistered(13), false);
    setDriverPushRegistered(12, false);
    assert.equal(isDriverPushRegistered(12), false);
  } finally { globalThis.window = originalWindow; }
});

test("VAPID public key is decoded from URL-safe base64 without padding", () => {
  assert.deepEqual([...decodeVapidPublicKey("AQIDBA")], [1, 2, 3, 4]);
});
