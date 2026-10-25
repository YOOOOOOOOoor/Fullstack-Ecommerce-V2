import webpush from "web-push";
import pool from "../config/db.js";

const readVapidConfig = (env = process.env) => ({
  publicKey: String(env.WEB_PUSH_PUBLIC_KEY || "").trim(),
  privateKey: String(env.WEB_PUSH_PRIVATE_KEY || "").trim(),
  subject: String(env.WEB_PUSH_SUBJECT || "").trim(),
});

export const isWebPushConfigured = (env = process.env) => {
  const config = readVapidConfig(env);
  const validSubject = /^mailto:.+@.+\..+$|^https:\/\/.+/.test(config.subject);
  return /^[A-Za-z0-9_-]{80,100}$/.test(config.publicKey) && /^[A-Za-z0-9_-]{40,60}$/.test(config.privateKey) && validSubject;
};

export const getWebPushPublicKey = (env = process.env) => isWebPushConfigured(env) ? readVapidConfig(env).publicKey : null;

export async function sendDriverAssignmentPush({ driverId, assignmentId, orderId, db = pool, pushClient = webpush, env = process.env }) {
  if (!isWebPushConfigured(env)) return { sent: 0, skipped: "not_configured" };
  const config = readVapidConfig(env);
  pushClient.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  const active = await db.query(
    `SELECT 1 FROM delivery_assignments da JOIN orders o ON o.id=da.order_id
     JOIN driver_profiles dp ON dp.user_id=da.driver_id AND dp.status='active'
     WHERE da.id=$1 AND da.driver_id=$2 AND da.order_id=$3 AND da.unassigned_at IS NULL
       AND da.response_status IN ('offered','accepted') AND o.order_status IN ('assigned_to_driver','out_for_delivery')`,
    [assignmentId, driverId, orderId],
  );
  if (!active.rows.length) return { sent: 0, skipped: "assignment_no_longer_active" };

  const subscriptions = await db.query("SELECT id,subscription FROM driver_push_subscriptions WHERE driver_id=$1", [driverId]);
  if (!subscriptions.rows.length) return { sent: 0, skipped: "no_subscription" };
  const payload = JSON.stringify({
    title: "New delivery assignment",
    body: "A delivery has been assigned to you. Open the driver portal to review it.",
    assignmentId: String(assignmentId),
    orderId: String(orderId),
    path: `/driver/deliveries/${encodeURIComponent(String(orderId))}`,
  });
  let sent = 0;
  let retryable = false;
  for (const subscription of subscriptions.rows) {
    try {
      await pushClient.sendNotification(subscription.subscription, payload, { TTL: 90, urgency: "high" });
      sent += 1;
    } catch (error) {
      if ([404, 410].includes(Number(error.statusCode))) {
        await db.query("DELETE FROM driver_push_subscriptions WHERE id=$1", [subscription.id]);
      } else {
        retryable = true;
        console.error("Driver push delivery failed", { status: Number(error.statusCode) || null, code: /^[A-Za-z0-9_-]{1,40}$/.test(String(error.code || "")) ? error.code : "unknown" });
      }
    }
  }
  return { sent, retryable };
}

export const allowedPushEndpoint = (endpoint) => {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com" || host === "push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com")
      || host === "web.push.apple.com" || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com");
  } catch { return false; }
};
