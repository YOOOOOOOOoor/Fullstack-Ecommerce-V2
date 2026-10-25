import pool from "../config/db.js";
import { allowedPushEndpoint, getWebPushPublicKey, isWebPushConfigured } from "../services/driverPush.js";

const validKey = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value);

export const getDriverPushConfig = (req, res) => {
  const publicKey = getWebPushPublicKey();
  res.json({ supported: Boolean(publicKey), publicKey });
};

export const registerDriverPushSubscription = async (req, res, next) => {
  const subscription = req.body;
  const endpoint = subscription?.endpoint;
  if (!allowedPushEndpoint(endpoint) || !validKey(subscription?.keys?.p256dh) || !validKey(subscription?.keys?.auth)) {
    return res.status(400).json({ message: "A valid browser push subscription is required." });
  }
  if (!isWebPushConfigured()) return res.status(503).json({ message: "Background notifications are not configured on this server." });
  try {
    await pool.query(
      `INSERT INTO driver_push_subscriptions(driver_id,endpoint,subscription)
       VALUES($1,$2,$3::jsonb)
       ON CONFLICT(endpoint) DO UPDATE SET driver_id=EXCLUDED.driver_id,subscription=EXCLUDED.subscription,updated_at=NOW()`,
      [req.user.id, endpoint, JSON.stringify({ endpoint, expirationTime: subscription.expirationTime ?? null, keys: subscription.keys })],
    );
    res.status(201).json({ registered: true });
  } catch (error) { next(error); }
};

export const getDriverPushSubscriptionStatus = async (req, res, next) => {
  const endpoint = req.body?.endpoint;
  if (!allowedPushEndpoint(endpoint)) return res.status(400).json({ message: "A valid browser push subscription is required." });
  try {
    const result = await pool.query("SELECT 1 FROM driver_push_subscriptions WHERE driver_id=$1 AND endpoint=$2", [req.user.id, endpoint]);
    res.json({ registered: Boolean(result.rows.length) });
  } catch (error) { next(error); }
};

export const removeDriverPushSubscription = async (req, res, next) => {
  const endpoint = req.body?.endpoint;
  if (!allowedPushEndpoint(endpoint)) return res.status(400).json({ message: "A valid browser push subscription is required." });
  try {
    await pool.query("DELETE FROM driver_push_subscriptions WHERE driver_id=$1 AND endpoint=$2", [req.user.id, endpoint]);
    res.json({ removed: true });
  } catch (error) { next(error); }
};
