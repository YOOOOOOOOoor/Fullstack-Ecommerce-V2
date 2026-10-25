export const deliveryFilterKeys = ["all", "new", "active", "delivered", "failed", "cancelled", "returned"];

export function getDeliveryCategory(delivery) {
  if (delivery.order_status === "cancelled") return "cancelled";
  if (delivery.order_status === "returned") return "returned";
  if (["delivered", "exception_delivered"].includes(delivery.latest_attempt_status) || delivery.order_status === "delivered") return "delivered";
  if (delivery.order_status === "delivery_failed" || delivery.latest_attempt_status === "failed") return "failed";
  const isNew = delivery.response_status === "offered" && !delivery.unassigned_at && delivery.order_status === "assigned_to_driver";
  if (isNew) return "new";
  const isActive = delivery.response_status === "accepted" &&
    ["assigned_to_driver", "out_for_delivery"].includes(delivery.order_status);
  return isActive ? "active" : "other";
}

export function matchesDeliveryFilter(delivery, filter) {
  return filter === "all" || getDeliveryCategory(delivery) === filter;
}

export function getDeliveryPage(deliveries, filter, visibleCount = 5) {
  const matching = deliveries.filter((delivery) => matchesDeliveryFilter(delivery, filter));
  const visible = matching.slice(0, Math.max(0, visibleCount));
  return { visible, remaining: Math.max(0, matching.length - visible.length), total: matching.length };
}

export function getDriverDeliveries(dashboard) {
  const unique = new Map();
  for (const delivery of [...(dashboard?.deliveries || []), ...(dashboard?.history || [])]) {
    const key = String(delivery.assignment_id ?? delivery.id ?? delivery.order_id);
    if (!unique.has(key)) unique.set(key, delivery);
  }
  return [...unique.values()];
}

export function getDeliverySummary(deliveries) {
  return deliveries.reduce((summary, delivery) => {
    const category = getDeliveryCategory(delivery);
    if (category !== "other") summary[category] += 1;
    return summary;
  }, { new: 0, active: 0, delivered: 0, failed: 0, cancelled: 0, returned: 0 });
}

export function findNewAssignmentIds(currentDeliveries, previousIds, alertedIds) {
  if (!previousIds) return [];
  return currentDeliveries
    .filter((item) => item.assignment_id != null && !item.unassigned_at &&
      !["delivered", "cancelled", "returned"].includes(item.order_status))
    .map((item) => String(item.assignment_id))
    .filter((id) => !previousIds.has(id) && !alertedIds.has(id));
}

export function shouldPlayAssignmentSound(enabled, newAssignmentCount) {
  return enabled && newAssignmentCount > 0;
}

export async function playAssignmentSound(AudioContextClass, { volume = 45, sound = "chime" } = {}, scheduleClose = setTimeout) {
  let context;
  try {
    if (!AudioContextClass) return false;
    context = new AudioContextClass();
    await context.resume();
    const patterns = {
      chime: { notes: [880, 1174], peak: 0.12, spacing: 0.16 },
      "double-beep": { notes: [659, 659], peak: 0.12, spacing: 0.16 },
      "clear-alert": { notes: [523, 659, 784, 659], peak: 0.19, spacing: 0.14 },
      "loud-alert": { notes: [659, 880, 1046, 880], peak: 0.28, spacing: 0.12, type: "square" },
    };
    const pattern = patterns[sound] || patterns.chime;
    const notes = pattern.notes;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = pattern.type || "sine";
      oscillator.frequency.value = frequency;
      const start = context.currentTime + index * pattern.spacing;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, pattern.peak * Math.min(100, Math.max(0, volume)) / 45), start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    });
    scheduleClose(() => context.close().catch(() => {}), 900);
    return true;
  } catch {
    if (context) context.close().catch(() => {});
    return false;
  }
}
