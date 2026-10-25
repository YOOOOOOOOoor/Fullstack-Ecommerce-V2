import test from "node:test";
import assert from "node:assert/strict";
import { findNewAssignmentIds, getDeliveryPage, getDeliverySummary, getDriverDeliveries, matchesDeliveryFilter, playAssignmentSound, shouldPlayAssignmentSound } from "./driverPortalUtils.js";

const delivery = (values) => ({ response_status: "accepted", order_status: "assigned_to_driver", ...values });

test("driver delivery filters follow real assignment and order outcomes", () => {
  assert.equal(matchesDeliveryFilter(delivery({ response_status: "offered" }), "new"), true);
  assert.equal(matchesDeliveryFilter(delivery({ order_status: "out_for_delivery" }), "active"), true);
  assert.equal(matchesDeliveryFilter(delivery({ order_status: "delivery_failed", latest_attempt_status: "failed" }), "failed"), true);
  assert.equal(matchesDeliveryFilter(delivery({ order_status: "delivery_failed" }), "active"), false);
  assert.equal(matchesDeliveryFilter(delivery({ order_status: "delivered", latest_attempt_status: "delivered" }), "delivered"), true);
  assert.equal(matchesDeliveryFilter(delivery({ order_status: "cancelled" }), "cancelled"), true);
  assert.equal(matchesDeliveryFilter(delivery({ order_status: "returned" }), "returned"), true);
  assert.equal(matchesDeliveryFilter(delivery({ response_status: "rejected" }), "all"), true);
});

test("all deliveries combines current assignments and retained assignment history", () => {
  const current = [{ assignment_id: 1 }];
  const history = [{ assignment_id: 2 }];
  assert.deepEqual(getDriverDeliveries({ deliveries: current, history }), [...current, ...history]);
});

test("delivery summary counts each order once in its current category", () => {
  const deliveries = getDriverDeliveries({ deliveries: [
    delivery({ id: 1, response_status: "offered" }),
    delivery({ id: 2, order_status: "out_for_delivery" }),
    delivery({ id: 3, order_status: "delivered", latest_attempt_status: "delivered" }),
    delivery({ id: 4, order_status: "delivery_failed", latest_attempt_status: "failed" }),
  ], history: [delivery({ id: 1, response_status: "offered" }), delivery({ id: 4, order_status: "delivery_failed" })] });
  assert.equal(deliveries.length, 4);
  assert.deepEqual(getDeliverySummary(deliveries), { new: 1, active: 1, delivered: 1, failed: 1, cancelled: 0, returned: 0 });
});

test("delivery lists reveal five at a time with independent tab counts and live updates", () => {
  const deliveries = Array.from({ length: 12 }, (_, index) => delivery({ id: index + 1, assignment_id: index + 1, response_status: "offered" }));
  const initialNew = getDeliveryPage(deliveries, "new", 5);
  assert.equal(initialNew.visible.length, 5);
  assert.equal(initialNew.remaining, 7);
  const expandedNew = getDeliveryPage(deliveries, "new", 10);
  assert.equal(expandedNew.visible.length, 10);
  assert.equal(expandedNew.remaining, 2);
  assert.equal(getDeliveryPage(deliveries, "all", 5).visible.length, 5);
  const withNewAssignment = [...deliveries, delivery({ id: 13, assignment_id: 13, response_status: "offered" })];
  assert.equal(getDeliveryPage(withNewAssignment, "new", 10).remaining, 3);
  assert.equal(getDeliveryPage(deliveries, "new", 20).remaining, 0);
});

test("new assignment detection ignores initial load, history, and previously alerted assignments", () => {
  const firstLoad = [{ assignment_id: 1, order_status: "assigned_to_driver" }];
  assert.deepEqual(findNewAssignmentIds(firstLoad, null, new Set()), []);
  const current = [
    { assignment_id: 1, order_status: "assigned_to_driver" },
    { assignment_id: 2, order_status: "assigned_to_driver" },
    { assignment_id: 3, order_status: "delivered" },
    { assignment_id: 4, order_status: "assigned_to_driver", unassigned_at: "2026-01-01" },
  ];
  assert.deepEqual(findNewAssignmentIds(current, new Set(["1"]), new Set()), ["2"]);
  assert.deepEqual(findNewAssignmentIds(current, new Set(["1"]), new Set(["2"])), []);
});

test("assignment sound respects the toggle and degrades safely when browser playback is blocked", async () => {
  assert.equal(shouldPlayAssignmentSound(false, 1), false);
  assert.equal(shouldPlayAssignmentSound(true, 0), false);
  assert.equal(shouldPlayAssignmentSound(true, 1), true);

  let close;
  const frequencies = [];
  const peaks = [];
  class AvailableAudioContext {
    constructor() { this.currentTime = 0; this.destination = {}; }
    async resume() {}
    createOscillator() { const node = { frequency: { set value(value) { frequencies.push(value); } }, connect() {}, start() {}, stop() {} }; return node; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime(value) { peaks.push(value); } }, connect() {} }; }
    async close() { close = true; }
  }
  assert.equal(await playAssignmentSound(AvailableAudioContext, { volume: 25, sound: "double-beep" }, (callback) => { callback(); }), true);
  assert.equal(close, true);
  assert.deepEqual(frequencies, [659, 659]);
  assert.ok(peaks.includes(0.12 * 25 / 45));

  class BlockedAudioContext extends AvailableAudioContext {
    async resume() { throw new Error("Audio activation required"); }
  }
  assert.equal(await playAssignmentSound(BlockedAudioContext, (callback) => { callback(); }), false);

  frequencies.length = 0;
  await playAssignmentSound(AvailableAudioContext, { volume: 50, sound: "clear-alert" }, (callback) => { callback(); });
  assert.deepEqual(frequencies, [523, 659, 784, 659]);
  frequencies.length = 0;
  peaks.length = 0;
  await playAssignmentSound(AvailableAudioContext, { volume: 100, sound: "loud-alert" }, (callback) => { callback(); });
  assert.deepEqual(frequencies, [659, 880, 1046, 880]);
  assert.ok(peaks.some((peak) => peak > 0.25));
});
