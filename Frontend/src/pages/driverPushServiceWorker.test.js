import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const workerSource = fs.readFileSync(new URL("../../public/driver-push-sw.js", import.meta.url), "utf8");

function createWorker({ windows = [] } = {}) {
  const handlers = new Map();
  const shown = [];
  const self = {
    location: { origin: "https://store.example" },
    clients: { async matchAll() { return windows; }, async openWindow(url) { return { opened: url }; } },
    registration: { async showNotification(title, options) { shown.push({ title, options }); } },
    addEventListener(type, listener) { handlers.set(type, listener); },
  };
  vm.runInNewContext(workerSource, { self, URL, Promise, encodeURIComponent });
  return { handlers, shown, self };
}

const assignment = { title: "New delivery assignment", assignmentId: "33", orderId: "39", path: "/driver/deliveries/39" };

test("focused driver dashboard receives the push message instead of a duplicate system notification", async () => {
  const messages = [];
  const { handlers, shown } = createWorker({ windows: [{ url: "https://store.example/driver/dashboard", focused: true, postMessage: (message) => messages.push(message) }] });
  let completed;
  handlers.get("push")({ data: { json: () => assignment }, waitUntil: (promise) => { completed = promise; } });
  await completed;
  assert.equal(shown.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), { type: "driver-assignment-push", assignmentId: "33", orderId: "39" });
});

test("background push shows privacy-safe, duplicate-tagged system notifications", async () => {
  const { handlers, shown } = createWorker();
  let completed;
  handlers.get("push")({ data: { json: () => assignment }, waitUntil: (promise) => { completed = promise; } });
  await completed;
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, "New delivery assignment");
  assert.equal(shown[0].options.tag, "driver-assignment-33");
  assert.equal(shown[0].options.renotify, false);
  assert.equal(shown[0].options.data.path, "/driver/deliveries/39");
  assert.doesNotMatch(shown[0].options.body, /address|phone|customer/i);
});

test("clicking the notification opens the scoped driver delivery", async () => {
  const calls = [];
  const existing = { url: "https://store.example/", async navigate(url) { calls.push(["navigate", url]); }, async focus() { calls.push(["focus"]); } };
  const { handlers } = createWorker({ windows: [existing] });
  let completed;
  let closed = false;
  handlers.get("notificationclick")({ notification: { data: { path: "/driver/deliveries/39" }, close() { closed = true; } }, waitUntil: (promise) => { completed = promise; } });
  await completed;
  assert.equal(closed, true);
  assert.deepEqual(calls, [["navigate", "https://store.example/driver/deliveries/39"], ["focus"]]);
});
