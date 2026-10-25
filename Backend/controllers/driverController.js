import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import pool from "../config/db.js";
import { writeAudit } from "../services/audit.js";
import { canStartDeliveryAttempt, codAmountMatches, dispatchPaymentEligible } from "../services/workflowRules.js";
import { encryptDeliveryCode } from "../services/deliveryCodeCrypto.js";

const MAX_CODE_TRIES = 5;
const MAX_DELIVERY_ATTEMPTS = 3;
const codeDigest = (orderId, attemptId, code) =>
  createHmac("sha256", process.env.JWT_SECRET).update(`${orderId}:${attemptId}:${code}`).digest("hex");

export const getDriverDashboard = async (req, res, next) => {
  try {
    const [assignments, stats] = await Promise.all([
      pool.query(
        `SELECT o.id, o.order_status, o.payment_method, o.payment_status, o.total_price, o.shipping_fee,
                CASE WHEN da.response_status='accepted' THEN a.receiver_name END AS receiver_name,
                CASE WHEN da.response_status='accepted' THEN a.phone END AS phone,
                CASE WHEN da.response_status='accepted' THEN a.city END AS city,
                CASE WHEN da.response_status='accepted' THEN a.sub_city END AS sub_city,
                da.id AS assignment_id, da.assigned_at,
                da.response_status, da.responded_at, da.rejection_reason,
                da.unassigned_at,
                latest.status AS latest_attempt_status,
                latest.attempt_number AS latest_attempt_number,
                latest.completed_at AS latest_attempt_completed_at,
                latest.failure_reason AS latest_failure_reason
         FROM delivery_assignments da
         JOIN orders o ON o.id=da.order_id
         LEFT JOIN addresses a ON a.id=o.address_id
         LEFT JOIN LATERAL (
           SELECT status, attempt_number, completed_at, failure_reason
           FROM delivery_attempts WHERE assignment_id=da.id
           ORDER BY attempt_number DESC LIMIT 1
         ) latest ON TRUE
         WHERE da.driver_id=$1
         ORDER BY da.assigned_at DESC, da.id DESC`,
        [req.user.id],
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status='delivered')::int AS completed,
                COUNT(*) FILTER (WHERE status='failed')::int AS failed
         FROM delivery_attempts WHERE driver_id=$1`,
        [req.user.id],
      ),
    ]);
    const deliveries = assignments.rows.filter((item) => !item.unassigned_at &&
      !["delivered", "cancelled", "returned"].includes(item.order_status));
    const history = assignments.rows.filter((item) => !deliveries.includes(item));
    const codOutstanding = deliveries
      .filter((order) => order.payment_method === "cod" && order.payment_status !== "successful")
      .reduce((sum, order) => sum + Number(order.total_price), 0);
    res.json({ deliveries, history, completed: stats.rows[0].completed, failed: stats.rows[0].failed, codOutstanding });
  } catch (error) {
    next(error);
  }
};

export const getDriverDelivery = async (req, res, next) => {
  try {
    const orderResult = await pool.query(
      `SELECT o.id, o.order_status, o.payment_method, o.payment_status, o.total_price, o.shipping_fee,
              o.created_at, da.response_status, da.responded_at,
              CASE WHEN da.response_status='accepted' THEN a.receiver_name END AS receiver_name,
              CASE WHEN da.response_status='accepted' THEN a.phone END AS phone,
              CASE WHEN da.response_status='accepted' THEN a.city END AS city,
              CASE WHEN da.response_status='accepted' THEN a.sub_city END AS sub_city,
              CASE WHEN da.response_status='accepted' THEN a.address END AS address,
              da.id AS assignment_id, da.assigned_at, da.unassigned_at
       FROM orders o
       JOIN delivery_assignments da ON da.order_id=o.id AND da.driver_id=$1
       LEFT JOIN addresses a ON a.id=o.address_id
       WHERE o.id=$2
       ORDER BY da.assigned_at DESC, da.id DESC LIMIT 1`,
      [req.user.id, req.params.id],
    );
    if (!orderResult.rows.length) return res.status(404).json({ message: "Assigned delivery not found." });
    if (orderResult.rows[0].response_status !== "accepted") {
      return res.json({ ...orderResult.rows[0], items: [], attempts: [], cod_collection: null });
    }
    const [items, attempts, collection] = await Promise.all([
      pool.query(`SELECT oi.product_id, oi.quantity, oi.price_at_purchase, p.title FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 ORDER BY oi.id`, [req.params.id]),
      pool.query(`SELECT id, attempt_number, status, started_at, completed_at, failure_reason, failure_notes FROM delivery_attempts WHERE order_id=$1 AND driver_id=$2 ORDER BY attempt_number DESC`, [req.params.id, req.user.id]),
      pool.query(`SELECT expected_amount, collected_amount, status, collected_at FROM cod_collections WHERE order_id=$1`, [req.params.id]),
    ]);
    res.json({ ...orderResult.rows[0], items: items.rows, attempts: attempts.rows, cod_collection: collection.rows[0] || null });
  } catch (error) {
    next(error);
  }
};

export const startDelivery = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const assignment = await client.query(
      `SELECT da.id, da.driver_id, o.id AS order_id, o.user_id, o.order_status, o.payment_status, o.payment_method
       FROM delivery_assignments da
       JOIN orders o ON o.id=da.order_id
       JOIN driver_profiles dp ON dp.user_id=da.driver_id AND dp.status='active'
       WHERE da.order_id=$1 AND da.driver_id=$2 AND da.unassigned_at IS NULL AND da.response_status='accepted'
       FOR UPDATE OF da, o, dp`,
      [req.params.id, req.user.id],
    );
    const order = assignment.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Assigned delivery not found." });
    }
    const paymentEligible = dispatchPaymentEligible(order);
    if (!paymentEligible || order.order_status !== "assigned_to_driver") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This order is not eligible to go out for delivery." });
    }
    const existingAttempt = await client.query(
      `SELECT id FROM delivery_attempts WHERE order_id=$1 AND driver_id=$2 AND status='out_for_delivery' FOR UPDATE`,
      [order.order_id, req.user.id],
    );
    if (existingAttempt.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This delivery is already out for delivery." });
    }
    const countResult = await client.query("SELECT COUNT(*)::int AS count FROM delivery_attempts WHERE order_id=$1", [order.order_id]);
    const attemptNumber = countResult.rows[0].count + 1;
    if (!canStartDeliveryAttempt(attemptNumber - 1, MAX_DELIVERY_ATTEMPTS)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "The delivery attempt limit has been reached. Contact an admin." });
    }
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const attempt = await client.query(
      `INSERT INTO delivery_attempts (order_id, assignment_id, driver_id, attempt_number, status, code_hash, code_ciphertext, code_expires_at)
       SELECT $1, da.id, $2, $3, 'out_for_delivery', $4, $5, NOW() + INTERVAL '30 minutes'
       FROM delivery_assignments da WHERE da.id=$6 RETURNING id`,
      [order.order_id, req.user.id, attemptNumber, codeDigest(order.order_id, "pending", code), encryptDeliveryCode(code), assignment.rows[0].id],
    );
    const attemptId = attempt.rows[0].id;
    await client.query(
      `UPDATE delivery_attempts SET code_hash=$1 WHERE id=$2`,
      [codeDigest(order.order_id, attemptId, code), attemptId],
    );
    await client.query("UPDATE orders SET order_status='out_for_delivery', updated_at=NOW() WHERE id=$1", [order.order_id]);
    await writeAudit(client, req.user.id, "delivery.started", "order", order.order_id, { attemptNumber });
    await client.query("COMMIT");
    res.json({ message: "Delivery started. The code is now available on the customer's order details page." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const respondToAssignment = async (req, res, next) => {
  const response = req.body.response;
  const reason = String(req.body.reason || "").trim();
  if (!["accept", "reject"].includes(response) || (response === "reject" && reason.length < 5)) {
    return res.status(400).json({ message: "Accept the assignment or provide a rejection reason of at least five characters." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT da.id,da.response_status,da.unassigned_at,da.offer_expires_at,o.id AS order_id,o.order_status
       FROM delivery_assignments da JOIN orders o ON o.id=da.order_id
       JOIN driver_profiles dp ON dp.user_id=da.driver_id AND dp.status='active'
       WHERE da.id=$1 AND da.driver_id=$2 FOR UPDATE OF da,o,dp`,
      [req.params.assignmentId, req.user.id],
    );
    const assignment = result.rows[0];
    if (!assignment || assignment.unassigned_at || assignment.response_status !== "offered" || assignment.order_status !== "assigned_to_driver") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This assignment offer is no longer valid." });
    }
    if (assignment.offer_expires_at && new Date(assignment.offer_expires_at) <= new Date()) {
      await client.query("UPDATE delivery_assignments SET response_status='withdrawn',unassigned_at=NOW(),change_reason='Offer expired' WHERE id=$1", [assignment.id]);
      await client.query("UPDATE orders SET order_status='ready_for_dispatch',updated_at=NOW() WHERE id=$1 AND order_status='assigned_to_driver'", [assignment.order_id]);
      await writeAudit(client, req.user.id, "delivery.offer_expired", "order", assignment.order_id, { assignmentId: assignment.id });
      await client.query("COMMIT");
      return res.status(409).json({ message: "This assignment offer expired and was returned to staff for manual reassignment." });
    }
    if (response === "accept") {
      await client.query("UPDATE delivery_assignments SET response_status='accepted',responded_at=NOW() WHERE id=$1", [assignment.id]);
      await writeAudit(client, req.user.id, "delivery.offer_accepted", "order", assignment.order_id, { assignmentId: assignment.id });
    } else {
      await client.query("UPDATE delivery_assignments SET response_status='rejected',responded_at=NOW(),rejection_reason=$2,unassigned_at=NOW(),unassigned_by=$3,change_reason=$2 WHERE id=$1", [assignment.id, reason, req.user.id]);
      await client.query("UPDATE orders SET order_status='ready_for_dispatch',updated_at=NOW() WHERE id=$1 AND order_status='assigned_to_driver'", [assignment.order_id]);
      await writeAudit(client, req.user.id, "delivery.offer_rejected", "order", assignment.order_id, { assignmentId: assignment.id, reason });
    }
    await client.query("COMMIT");
    res.json({ message: response === "accept" ? "Assignment accepted." : "Assignment declined and returned to staff for manual reassignment." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const completeDelivery = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const code = String(req.body.code || "").trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the six-digit customer verification code." });
    await client.query("BEGIN");
    const attemptResult = await client.query(
      `SELECT d.*, o.payment_method, o.payment_status FROM delivery_attempts d
       JOIN delivery_assignments da ON da.id=d.assignment_id AND da.order_id=d.order_id AND da.driver_id=$2 AND da.unassigned_at IS NULL
       JOIN orders o ON o.id=d.order_id AND o.order_status='out_for_delivery'
       JOIN driver_profiles dp ON dp.user_id=$2 AND dp.status='active'
       WHERE d.order_id=$1 AND d.driver_id=$2 AND d.status='out_for_delivery'
       ORDER BY d.attempt_number DESC LIMIT 1 FOR UPDATE OF d, o, da, dp`,
      [req.params.id, req.user.id],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) {
      const completedAttempt = await client.query(
        `SELECT d.id FROM delivery_attempts d
         JOIN delivery_assignments da ON da.id=d.assignment_id AND da.order_id=d.order_id AND da.driver_id=$2
         JOIN orders o ON o.id=d.order_id AND o.order_status='delivered'
         WHERE d.order_id=$1 AND d.driver_id=$2 AND d.status='delivered'
         LIMIT 1`,
        [req.params.id, req.user.id],
      );
      await client.query("ROLLBACK");
      if (completedAttempt.rows.length) {
        return res.status(409).json({ message: "This delivery has already been completed." });
      }
      return res.status(404).json({ message: "Active delivery attempt not found." });
    }
    if (attempt.payment_method === "cod") {
      const collection = await client.query(
        "SELECT id FROM cod_collections WHERE order_id=$1 AND driver_id=$2 AND status <> 'resolved' FOR UPDATE",
        [attempt.order_id, req.user.id],
      );
      if (!collection.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Record the Cash on Delivery amount separately before completing delivery." });
      }
    }
    if (attempt.verification_attempts >= MAX_CODE_TRIES || !attempt.code_hash || new Date(attempt.code_expires_at) <= new Date()) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "The verification code expired or the attempt limit was reached. Request a new code." });
    }
    const supplied = Buffer.from(codeDigest(attempt.order_id, attempt.id, code));
    const expected = Buffer.from(attempt.code_hash);
    const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected);
    if (!matches) {
      await client.query("UPDATE delivery_attempts SET verification_attempts=verification_attempts+1 WHERE id=$1", [attempt.id]);
      await writeAudit(client, req.user.id, "delivery.verification_failed", "order", attempt.order_id, { attemptNumber: attempt.attempt_number });
      await client.query("COMMIT");
      return res.status(400).json({ message: "That code is incorrect." });
    }
    await client.query(
      `UPDATE delivery_attempts SET status='delivered', code_hash=NULL, code_ciphertext=NULL, completed_at=NOW() WHERE id=$1`,
      [attempt.id],
    );
    await client.query(`UPDATE orders SET order_status='delivered', delivered_at=NOW(), updated_at=NOW() WHERE id=$1`, [attempt.order_id]);
    await client.query("UPDATE delivery_assignments SET unassigned_at=NOW(),unassigned_by=$2,change_reason='Delivery completed' WHERE id=$1 AND unassigned_at IS NULL", [attempt.assignment_id, req.user.id]);
    await writeAudit(client, req.user.id, "delivery.verified", "order", attempt.order_id, { attemptNumber: attempt.attempt_number });
    await client.query("COMMIT");
    res.json({ message: "Delivery confirmed." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const failDelivery = async (req, res, next) => {
  const allowedReasons = ["customer_unavailable", "could_not_contact", "incorrect_address", "customer_declined", "other"];
  const { reason, notes } = req.body;
  if (!allowedReasons.includes(reason) || (reason === "other" && !String(notes || "").trim())) {
    return res.status(400).json({ message: "Choose a reason and explain other delivery failures." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const attempt = await client.query(
      `SELECT d.id, d.attempt_number, o.id AS order_id FROM delivery_attempts d
       JOIN orders o ON o.id=d.order_id
       JOIN delivery_assignments da ON da.id=d.assignment_id AND da.driver_id=$2 AND da.unassigned_at IS NULL
       AND o.order_status='out_for_delivery'
       JOIN driver_profiles dp ON dp.user_id=$2 AND dp.status='active'
       WHERE d.order_id=$1 AND d.driver_id=$2 AND d.status='out_for_delivery'
       ORDER BY d.attempt_number DESC LIMIT 1 FOR UPDATE OF d, o, dp`,
      [req.params.id, req.user.id],
    );
    if (!attempt.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Active delivery attempt not found." });
    }
    await client.query(
      `UPDATE delivery_attempts SET status='failed', code_hash=NULL, code_ciphertext=NULL, completed_at=NOW(), failure_reason=$1, failure_notes=$2 WHERE id=$3`,
      [reason, String(notes || "").trim() || null, attempt.rows[0].id],
    );
    await client.query("UPDATE orders SET order_status='delivery_failed', updated_at=NOW() WHERE id=$1", [req.params.id]);
    await writeAudit(client, req.user.id, "delivery.failed", "order", req.params.id, { attemptNumber: attempt.rows[0].attempt_number, reason });
    await client.query("COMMIT");
    res.json({ message: "Failed delivery attempt recorded for staff review." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const recordCodCollection = async (req, res, next) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ message: "Enter a valid collection amount." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT o.id, o.total_price, o.shipping_fee, o.payment_method, o.payment_status
       FROM orders o JOIN delivery_assignments da ON da.order_id=o.id AND da.driver_id=$2 AND da.unassigned_at IS NULL
       JOIN driver_profiles dp ON dp.user_id=$2 AND dp.status='active'
       WHERE o.id=$1 AND o.order_status='out_for_delivery' FOR UPDATE OF o, dp`,
      [req.params.id, req.user.id],
    );
    const order = result.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Active assigned delivery not found." });
    }
    if (order.payment_method !== "cod" || order.payment_status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This order has no outstanding cash-on-delivery amount." });
    }
    const expected = Number(order.total_price);
    const exact = codAmountMatches(expected, amount);
    const collectionStatus = exact ? "pending_review" : amount < expected ? "short" : "overpaid";
    const collection = await client.query(
      `INSERT INTO cod_collections (order_id, driver_id, expected_amount, collected_amount, status)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, status`,
      [order.id, req.user.id, expected, amount, collectionStatus],
    );
    await writeAudit(client, req.user.id, exact ? "cod.collection_submitted" : "cod.discrepancy", "order", order.id, { expectedAmount: expected, collectedAmount: amount, currency: "ETB" });
    await client.query("COMMIT");
    res.status(exact ? 201 : 202).json({ message: exact ? "Collection submitted for staff reconciliation; the order remains unpaid until reviewed." : "Amount recorded for staff reconciliation.", collection: collection.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") return res.status(409).json({ message: "A collection has already been recorded for this order." });
    next(error);
  } finally {
    client.release();
  }
};
