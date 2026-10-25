import test from "node:test";
import assert from "node:assert/strict";
import { readDriverPreferences, saveDriverPreferences } from "./driverPreferences.js";

test("driver alert preferences persist by driver account and clamp the chosen volume", () => {
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    dispatchEvent() {},
  };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  try {
    saveDriverPreferences(42, { enabled: false, volume: 125, sound: "loud-alert" });
    assert.deepEqual(readDriverPreferences(42), { enabled: false, volume: 100, sound: "loud-alert" });
    assert.deepEqual(readDriverPreferences(43), { enabled: true, volume: 45, sound: "chime" });
    saveDriverPreferences(42, { enabled: true, volume: -2, sound: "invalid" });
    assert.deepEqual(readDriverPreferences(42), { enabled: true, volume: 0, sound: "chime" });
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent; else globalThis.CustomEvent = previousCustomEvent;
  }
});
