import pool from "../config/db.js";
import { writeAudit } from "../services/audit.js";
import { dispatchPaymentEligible } from "../services/workflowRules.js";
import { processDriverPushOutbox } from "../services/driverPushWorker.js";

export const listDrivers = async (req, res, next) => {
  try {
    const search = `%${String(req.query.search || "").trim()}%`;
    const status = req.query.status || "all";
    const result = await pool.query(
      `SELECT dp.user_id, dp.status, dp.promoted_at, dp.updated_at, u.name, u.email, u.phone,
              COUNT(DISTINCT da.order_id) FILTER (WHERE da.unassigned_at IS NULL AND o.order_status NOT IN ('delivered','cancelled','returned'))::int AS active_deliveries,
              COALESCE(json_agg(DISTINCT jsonb_build_object('id',o.id,'status',o.order_status)) FILTER (WHERE da.unassigned_at IS NULL AND o.order_status NOT IN ('delivered','cancelled','returned')), '[]'::json) AS active_delivery_orders,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status='delivered')::int AS completed_deliveries,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status='failed')::int AS failed_deliveries
       FROM driver_profiles dp JOIN users u ON u.id=dp.user_id
       LEFT JOIN delivery_assignments da ON da.driver_id=dp.user_id
       LEFT JOIN orders o ON o.id=da.order_id
       LEFT JOIN delivery_attempts d ON d.driver_id=dp.user_id
       WHERE ($1='all' OR dp.status=$1)
         AND (u.name ILIKE $2 OR u.email ILIKE $2 OR COALESCE(u.phone,'') ILIKE $2)
       GROUP BY dp.user_id, dp.status, dp.promoted_at, dp.updated_at, u.name, u.email, u.phone
       ORDER BY dp.promoted_at DESC`,
      [status, search],
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

export const getDriverHistory = async (req, res, next) => {
  try {
    const driverId = Number(req.params.userId);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const profile = await pool.query(
      `SELECT dp.user_id,dp.status,dp.promoted_at,u.name,u.email
       FROM driver_profiles dp JOIN users u ON u.id=dp.user_id WHERE dp.user_id=$1`,
      [driverId],
    );
    if (!profile.rows.length) return res.status(404).json({ message: "Driver not found." });
    const events = await pool.query(
      `SELECT * FROM (
        SELECT 'assignment'::text AS type, da.assigned_at AS occurred_at, da.order_id,
          da.driver_id, da.assigned_by AS actor_id, actor.name AS actor_name,
          da.change_reason AS details, da.response_status AS outcome,
          da.unassigned_at, da.unassigned_by, unassigner.name AS unassigned_by_name
        FROM delivery_assignments da
        LEFT JOIN users actor ON actor.id=da.assigned_by
        LEFT JOIN users unassigner ON unassigner.id=da.unassigned_by
        WHERE da.driver_id=$1
        UNION ALL
        SELECT 'delivery_' || d.status AS type, COALESCE(d.completed_at,d.started_at) AS occurred_at,
          d.order_id,d.driver_id,NULL::integer,NULL::text,
          concat_ws(' — ', d.failure_reason, d.failure_notes) AS details,d.status AS outcome,
          NULL::timestamp,NULL::integer,NULL::text
        FROM delivery_attempts d WHERE d.driver_id=$1
        UNION ALL
        SELECT a.action AS type,a.created_at AS occurred_at,
          CASE WHEN a.entity_type='order' THEN a.entity_id::integer ELSE NULL END AS order_id,
          $1::integer AS driver_id,a.actor_id,actor.name AS actor_name,
          COALESCE(a.metadata->>'reason',a.metadata->>'status') AS details,NULL::text,
          NULL::timestamp,NULL::integer,NULL::text
        FROM operations_audit_log a LEFT JOIN users actor ON actor.id=a.actor_id
        WHERE a.entity_type='user' AND a.entity_id=$1::text
          AND a.action LIKE 'driver.%'
        UNION ALL
        SELECT a.action AS type,a.created_at AS occurred_at,a.entity_id::integer AS order_id,
          $1::integer AS driver_id,a.actor_id,actor.name AS actor_name,
          a.metadata->>'reason' AS details,NULL::text,NULL::timestamp,NULL::integer,NULL::text
        FROM operations_audit_log a LEFT JOIN users actor ON actor.id=a.actor_id
        WHERE a.entity_type='order' AND (
          a.metadata->>'driverId'=$1::text OR a.metadata->>'previousDriverId'=$1::text
          OR EXISTS (SELECT 1 FROM delivery_assignments da WHERE da.driver_id=$1 AND da.order_id=a.entity_id::integer)
        )
      ) history ORDER BY occurred_at DESC, order_id DESC NULLS LAST, type LIMIT $2 OFFSET $3`,
      [driverId, limit, offset],
    );
    const count = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM delivery_assignments WHERE driver_id=$1) +
        (SELECT COUNT(*) FROM delivery_attempts WHERE driver_id=$1) +
        (SELECT COUNT(*) FROM operations_audit_log WHERE entity_type='user' AND entity_id=$1::text AND action LIKE 'driver.%') +
        (SELECT COUNT(*) FROM operations_audit_log a WHERE entity_type='order' AND (
          metadata->>'driverId'=$1::text OR metadata->>'previousDriverId'=$1::text
          OR EXISTS (SELECT 1 FROM delivery_assignments da WHERE da.driver_id=$1 AND da.order_id=a.entity_id::integer)
        )) AS total`,
      [driverId],
    );
    res.json({ driver: profile.rows[0], events: events.rows, total: Number(count.rows[0].total), limit, offset });
  } catch (error) { next(error); }
};

export const promoteCustomerToDriver = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customer = await client.query("SELECT id, role FROM users WHERE id=$1 FOR UPDATE", [req.params.userId]);
    if (!customer.rows.length || customer.rows[0].role !== "customer") {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Customer not found or not eligible for driver promotion." });
    }
    const profile = await client.query(
      `INSERT INTO driver_profiles (user_id, promoted_by) VALUES ($1,$2)
       ON CONFLICT (user_id) DO NOTHING RETURNING user_id`,
      [req.params.userId, req.user.id],
    );
    if (!profile.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This customer already has a driver profile." });
    }
    await writeAudit(client, req.user.id, "driver.promoted", "user", req.params.userId);
    await client.query("COMMIT");
    res.status(201).json({ message: "Customer promoted to driver. Their customer account remains active." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const updateDriverStatus = async (req, res, next) => {
  const { status } = req.body;
  const reason = String(req.body.reason || "").trim();
  if (!["active", "suspended", "revoked"].includes(status) || (status !== "active" && !req.staff?.is_super_admin && reason.length < 5)) {
    return res.status(400).json({ message: "Choose a valid status and provide a reason for suspension or offboarding." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT status FROM driver_profiles WHERE user_id=$1 FOR UPDATE", [req.params.userId]);
    if (!current.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Driver not found." });
    }
    if (current.rows[0].status === "revoked" || (status === "revoked" && current.rows[0].status === "revoked")) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Offboarded drivers cannot be reactivated." });
    }
    await client.query("UPDATE driver_profiles SET status=$1, updated_at=NOW() WHERE user_id=$2", [status, req.params.userId]);
    if (status !== "active") {
      const activeAttempts = await client.query(
          `UPDATE delivery_attempts SET status='failed', code_hash=NULL, code_ciphertext=NULL, completed_at=NOW(),
                failure_reason='other', failure_notes=$2
         WHERE driver_id=$1 AND status='out_for_delivery' RETURNING order_id`,
        [req.params.userId, `Driver ${status}: ${reason || "Super Admin action; reason omitted."}`],
      );
      await client.query(
        `UPDATE orders o SET order_status='delivery_failed', updated_at=NOW()
         WHERE o.id = ANY($1::int[]) AND o.order_status='out_for_delivery'`,
        [activeAttempts.rows.map((row) => row.order_id)],
      );
      const ended = await client.query(
        `UPDATE delivery_assignments da SET unassigned_at=NOW(), unassigned_by=$2, change_reason=$3
         FROM orders o WHERE da.order_id=o.id AND da.driver_id=$1 AND da.unassigned_at IS NULL
           AND o.order_status NOT IN ('delivered','cancelled','returned') RETURNING da.order_id`,
        [req.params.userId, req.user.id, reason || null],
      );
      for (const assignment of ended.rows) {
        await writeAudit(client, req.user.id, "delivery.unassigned_driver_deactivated", "order", assignment.order_id, { driverId: Number(req.params.userId), status, reason });
      }
    }
    await writeAudit(client, req.user.id, `driver.${status}`, "user", req.params.userId, { reason: reason || null });
    await client.query("COMMIT");
    res.json({ message: status === "revoked" ? "Driver offboarded; historical delivery records were retained." : `Driver ${status}.` });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const assignDelivery = async (req, res, next) => {
  const reason = String(req.body.reason || "").trim();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query(
      `SELECT id,user_id,total_price,order_status,payment_status,payment_method FROM orders WHERE id=$1 FOR UPDATE`,
      [req.params.orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }
    const allowedPayment = dispatchPaymentEligible(order);
    if (!allowedPayment || !["ready_for_dispatch", "delivery_failed", "assigned_to_driver"].includes(order.order_status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This order is not eligible for dispatch." });
    }
    const driver = await client.query("SELECT status FROM driver_profiles WHERE user_id=$1 FOR UPDATE", [req.body.driverId]);
    if (!driver.rows.length || driver.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Select an active driver." });
    }
    const active = await client.query("SELECT id, driver_id FROM delivery_assignments WHERE order_id=$1 AND unassigned_at IS NULL FOR UPDATE", [order.id]);
    if (active.rows[0]?.driver_id === Number(req.body.driverId)) {
      if (order.order_status !== "delivery_failed" || (!req.staff?.is_super_admin && reason.length < 5)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "This order is already assigned. A failed delivery retry needs a reason of at least five characters." });
      }
      await client.query("UPDATE orders SET order_status='assigned_to_driver', updated_at=NOW() WHERE id=$1", [order.id]);
      await writeAudit(client, req.user.id, "delivery.retry_scheduled", "order", order.id, { driverId: Number(req.body.driverId), reason });
      await client.query("COMMIT");
      return res.json({ message: "Another delivery attempt was scheduled for this driver." });
    }
    if (active.rows.length && order.order_status === "out_for_delivery") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "An order out for delivery must be recorded as failed before reassignment." });
    }
    if (active.rows.length) {
      if (!req.staff?.is_super_admin && reason.length < 5) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Provide a reason when reassigning a delivery." });
      }
      await client.query(
        `UPDATE delivery_assignments SET unassigned_at=NOW(), unassigned_by=$2, change_reason=$3 WHERE id=$1`,
        [active.rows[0].id, req.user.id, reason],
      );
      await writeAudit(client, req.user.id, "delivery.reassigned_from", "order", order.id, { previousDriverId: active.rows[0].driver_id, reason });
    }
    const created = await client.query(
      `INSERT INTO delivery_assignments (order_id, driver_id, assigned_by, change_reason, response_status,offer_expires_at)
       VALUES ($1,$2,$3,$4,'offered',NOW()+INTERVAL '30 minutes') RETURNING id`,
      [order.id, req.body.driverId, req.user.id, reason || null],
    );
    await client.query("UPDATE orders SET order_status='assigned_to_driver', updated_at=NOW() WHERE id=$1", [order.id]);
    await writeAudit(client, req.user.id, "delivery.assigned", "order", order.id, { driverId: Number(req.body.driverId), assignmentId: created.rows[0].id, reason: reason || null });
    await client.query(
      "INSERT INTO driver_push_outbox (assignment_id,order_id,driver_id) VALUES ($1,$2,$3) ON CONFLICT (assignment_id) DO NOTHING",
      [created.rows[0].id, order.id, req.body.driverId],
    );
    await client.query("COMMIT");
    void processDriverPushOutbox()
      .catch((error) => console.error("Driver assignment notification queue failed", { code: /^[A-Za-z0-9_-]{1,40}$/.test(String(error.code || "")) ? error.code : "internal_error" }));
    res.status(201).json({ message: "Delivery assigned.", assignmentId: created.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const getDeliveryHistory = async (req, res, next) => {
  try {
    const [assignments, attempts, collection, audit] = await Promise.all([
      pool.query(`SELECT da.*, u.name AS driver_name, u.email AS driver_email FROM delivery_assignments da JOIN users u ON u.id=da.driver_id WHERE da.order_id=$1 ORDER BY da.assigned_at`, [req.params.orderId]),
      pool.query(`SELECT d.id, d.driver_id, u.name AS driver_name, d.attempt_number, d.status, d.started_at, d.completed_at, d.failure_reason, d.failure_notes FROM delivery_attempts d JOIN users u ON u.id=d.driver_id WHERE d.order_id=$1 ORDER BY d.attempt_number`, [req.params.orderId]),
      pool.query(`SELECT * FROM cod_collections WHERE order_id=$1`, [req.params.orderId]),
      pool.query(`SELECT id, actor_id, action, metadata, created_at FROM operations_audit_log WHERE entity_type='order' AND entity_id=$1 ORDER BY created_at`, [String(req.params.orderId)]),
    ]);
    res.json({ assignments: assignments.rows, attempts: attempts.rows, codCollection: collection.rows[0] || null, audit: audit.rows });
  } catch (error) {
    next(error);
  }
};

export const markDeliveryException = async (req, res, next) => {
  const reason = String(req.body.reason || "").trim();
  if (!req.staff?.is_super_admin && reason.length < 10) return res.status(400).json({ message: "A detailed reason is required for a delivery exception." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query(`SELECT id, order_status, payment_method, payment_status FROM orders WHERE id=$1 FOR UPDATE`, [req.params.orderId]);
    if (!order.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }
    if (!["assigned_to_driver", "out_for_delivery", "delivery_failed"].includes(order.rows[0].order_status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This order cannot be delivered through an exception." });
    }
    await client.query(
        `UPDATE delivery_attempts SET status='exception_delivered', code_hash=NULL, code_ciphertext=NULL, completed_at=NOW(), failure_notes=$2
       WHERE id=(SELECT id FROM delivery_attempts WHERE order_id=$1 AND status='out_for_delivery' ORDER BY attempt_number DESC LIMIT 1)`,
      [req.params.orderId, `Admin delivery exception: ${reason || "Super Admin action; reason omitted."}`],
    );
    await client.query(`UPDATE orders SET order_status='delivered', delivered_at=NOW(), updated_at=NOW() WHERE id=$1`, [req.params.orderId]);
    await client.query("UPDATE delivery_assignments SET unassigned_at=NOW(),unassigned_by=$2,change_reason=$3 WHERE order_id=$1 AND unassigned_at IS NULL", [req.params.orderId, req.user.id, reason ? `Admin delivery exception: ${reason}` : "Super Admin action; reason omitted."]);
    await writeAudit(client, req.user.id, "delivery.admin_exception", "order", req.params.orderId, { reason });
    await client.query("COMMIT");
    res.json({ message: "Delivery recorded as verified by admin exception." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const reconcileCodCollection = async (req, res, next) => {
  const explanation = String(req.body.reason || "").trim();
  if (!req.staff?.is_super_admin && explanation.length < 10) return res.status(400).json({ message: "Provide a reason for reconciling this collection." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT c.*, o.total_price, o.shipping_fee, o.payment_status, o.payment_method
       FROM cod_collections c JOIN orders o ON o.id=c.order_id
       WHERE c.id=$1 FOR UPDATE OF c,o`,
      [req.params.collectionId],
    );
    const collection = result.rows[0];
    if (!collection) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Collection not found." });
    }
    const expected = Number(collection.total_price);
    const confirmedAmount = Number(req.body.confirmed_amount);
    if (!["pending_review", "discrepancy", "short", "overpaid"].includes(collection.status) || collection.payment_method !== "cod" || collection.payment_status !== "pending" || !Number.isFinite(confirmedAmount) || Math.round(confirmedAmount * 100) !== Math.round(expected * 100)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Admin confirmation must match the outstanding order total exactly." });
    }
    await client.query("UPDATE cod_collections SET status='collected', collected_amount=$3, reviewed_by=$1, reviewed_at=NOW(),resolution_reason=$4 WHERE id=$2", [req.user.id, collection.id, confirmedAmount, explanation || null]);
    await client.query("UPDATE orders SET payment_status='successful', updated_at=NOW() WHERE id=$1 AND payment_method='cod' AND payment_status='pending'", [collection.order_id]);
    await client.query(
      `UPDATE payments SET status='successful', transaction_id=$1, paid_at=NOW()
       WHERE order_id=$2 AND method='cod'`,
      [`cod-admin-reconciled-${collection.id}`, collection.order_id],
    );
    await writeAudit(client, req.user.id, "cod.reconciled", "order", collection.order_id, { collectionId: collection.id, reportedAmount: Number(collection.collected_amount), confirmedAmount, reason: explanation });
    await client.query("COMMIT");
    res.json({ message: "COD discrepancy reconciled and payment recorded." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};
