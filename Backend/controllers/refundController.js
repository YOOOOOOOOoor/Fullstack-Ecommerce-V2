import pool from "../config/db.js";
import { writeAudit } from "../services/audit.js";
import { isWithinRefundWindow, REFUND_TRANSITIONS } from "../services/workflowRules.js";

const validRefundReasons = new Set(["damaged", "defective", "incorrect"]);

export const createRefundRequest = async (req, res, next) => {
  const reason = String(req.body.reason || "");
  const description = String(req.body.description || "").trim();
  if (!validRefundReasons.has(reason) || description.length < 10 || description.length > 3000) {
    return res.status(400).json({ message: "Choose an eligible reason and describe the issue in at least 10 characters." });
  }
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderResult = await client.query(
        `SELECT id, order_status, delivered_at, total_price, shipping_fee, payment_status FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE`,
        [req.params.orderId, req.user.id],
      );
      const order = orderResult.rows[0];
      if (!order || order.order_status !== "delivered" || order.payment_status !== "successful" || !order.delivered_at) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Refund requests are available only for orders delivered through the current delivery system." });
      }
      if (!isWithinRefundWindow(order.delivered_at)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "The three-day refund request period has ended." });
      }
      let requestedItems;
      try { requestedItems = typeof req.body.items === "string" ? JSON.parse(req.body.items) : req.body.items; } catch { requestedItems = null; }
      if (!Array.isArray(requestedItems) || !requestedItems.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Select at least one affected order item." });
      }
      const orderItems = await client.query("SELECT id,quantity,price_at_purchase FROM order_items WHERE order_id=$1", [order.id]);
      const selected = [];
      for (const requested of requestedItems) {
        const item = orderItems.rows.find((row) => row.id === Number(requested.order_item_id));
        const quantity = Number(requested.quantity);
        if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > Number(item.quantity)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Selected items or quantities are invalid for this order." });
        }
        selected.push({ order_item_id: item.id, quantity, unit_price: Number(item.price_at_purchase) });
      }
      if (new Set(selected.map((item) => item.order_item_id)).size !== selected.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "An order item cannot be selected more than once." });
      }
      const attachments = (req.files || []).slice(0, 3).map((file) => file.path);
      const created = await client.query(
        `INSERT INTO refund_requests (order_id, customer_id, reason, description, attachments, return_delivery_responsibility,refund_items)
         VALUES ($1,$2,$3,$4,$5::jsonb,'store',$6::jsonb) RETURNING id, status, requested_at`,
        [order.id, req.user.id, reason, description, JSON.stringify(attachments), JSON.stringify(selected)],
      );
      for (const item of selected) {
        await client.query("INSERT INTO refund_request_items(refund_request_id,order_item_id,quantity,item_amount) VALUES($1,$2,$3,$4)", [created.rows[0].id, item.order_item_id, item.quantity, Math.round(item.unit_price * item.quantity * 100) / 100]);
      }
      await writeAudit(client, req.user.id, "refund.requested", "refund", created.rows[0].id, { orderId: order.id, reason, attachmentCount: attachments.length });
      await client.query("COMMIT");
      res.status(201).json({ message: "Refund request submitted for admin review.", refund: created.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error.code === "23505") return res.status(409).json({ message: "A refund request already exists for this order." });
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

export const listRefundRequests = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT r.*, o.total_price, o.shipping_fee, o.payment_method, o.payment_status, o.order_status, o.created_at AS order_created_at,
              COALESCE(r.requested_amount,(SELECT SUM(ri.item_amount) FROM refund_request_items ri WHERE ri.refund_request_id=r.id)+o.shipping_fee,o.total_price) AS eligible_refund_amount,
              u.name AS customer_name, u.email AS customer_email,
              COALESCE(r.original_payment_reference, paid_payment.tx_ref) AS original_payment_reference,
              COALESCE(delivery.history, '[]'::json) AS delivery_history,
              COALESCE(refund_history.events, '[]'::json) AS refund_history
       FROM refund_requests r JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=r.customer_id
       LEFT JOIN LATERAL (
         SELECT tx_ref FROM payments WHERE order_id=o.id AND status IN ('successful','refunded')
         ORDER BY paid_at DESC NULLS LAST LIMIT 1
       ) paid_payment ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('attempt_number',d.attempt_number,'driver_name',du.name,'status',d.status,
                  'started_at',d.started_at,'completed_at',d.completed_at,'failure_reason',d.failure_reason,'failure_notes',d.failure_notes)
                  ORDER BY d.attempt_number) AS history
         FROM delivery_attempts d JOIN users du ON du.id=d.driver_id WHERE d.order_id=o.id
       ) delivery ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('action',a.action,'created_at',a.created_at,'actor_name',actor.name,'metadata',a.metadata) ORDER BY a.created_at) AS events
         FROM operations_audit_log a LEFT JOIN users actor ON actor.id=a.actor_id
         WHERE a.entity_type='refund' AND a.entity_id=r.id::text
       ) refund_history ON TRUE
       ORDER BY CASE WHEN r.status IN ('requested','under_review') THEN 0 ELSE 1 END, r.requested_at DESC`,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

export const reviewRefundRequest = async (req, res, next) => {
  const { status } = req.body;
  const response = String(req.body.admin_response || "").trim();
  const returnRequired = status === "approved" ? req.body.return_required !== false : undefined;
  const exceptionReason = String(req.body.exception_reason || "").trim();
  if (!response || response.length < 5 || !["under_review", "approved", "rejected", "return_received", "refund_processing"].includes(status)) {
    return res.status(400).json({ message: "Provide a valid review action and explanation." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT * FROM refund_requests WHERE id=$1 FOR UPDATE`, [req.params.id]);
    const refund = result.rows[0];
    if (!refund) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Refund request not found." });
    }
    if (!REFUND_TRANSITIONS[refund.status]?.includes(status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "That refund status change is not allowed." });
    }
    const cancellationCase = refund.request_type === "pre_dispatch_cancellation";
    if (cancellationCase && !["under_review", "refund_processing", "rejected"].includes(status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Cancellation refund cases do not use delivery return or inspection steps." });
    }
    if (!cancellationCase && status === "refund_processing" && refund.status === "under_review") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Delivery-related refunds must be approved and complete any required return inspection first." });
    }
    if (!cancellationCase && status === "approved" && !returnRequired && exceptionReason.length < 10) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "A documented return-and-inspection exception reason of at least ten characters is required." });
    }
    if (!cancellationCase && status === "approved" && !returnRequired && !req.staff?.is_super_admin && !req.staff?.permissions?.includes("approve_refund_exceptions")) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Documented refund exceptions require the approve refund exceptions permission." });
    }
    let nextStatus = status;
    if (status === "approved") nextStatus = cancellationCase ? "refund_processing" : returnRequired ? "awaiting_return" : "refund_processing";
    await client.query(
      `UPDATE refund_requests SET status=$1, admin_response=$2, return_required=$3,
              reviewed_by=$4, reviewed_at=NOW(), updated_at=NOW(),
              inspection_status=CASE WHEN $6 THEN 'awaiting_return' WHEN $7 THEN 'exception_approved' ELSE inspection_status END,
              exception_reason=CASE WHEN $7 THEN $8 ELSE exception_reason END,
              exception_actor=CASE WHEN $7 THEN $4 ELSE exception_actor END,
              exception_at=CASE WHEN $7 THEN NOW() ELSE exception_at END,
              refund_decided_by=CASE WHEN $9 THEN $4 ELSE refund_decided_by END,
              refund_decided_at=CASE WHEN $9 THEN NOW() ELSE refund_decided_at END WHERE id=$5`,
      [nextStatus, response, cancellationCase ? false : status === "approved" ? returnRequired : refund.return_required, req.user.id, refund.id, !cancellationCase && status === "approved" && returnRequired, !cancellationCase && status === "approved" && !returnRequired, exceptionReason || null, status === "approved" && !cancellationCase],
    );
    await writeAudit(client, req.user.id, `refund.${nextStatus}`, "refund", refund.id, { orderId: refund.order_id, reason: response });
    await client.query("COMMIT");
    res.json({ message: `Refund request updated to ${nextStatus.replaceAll("_", " ")}.`, status: nextStatus });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const inspectRefundReturn = async (req, res, next) => {
  const outcome = req.body.outcome;
  const notes = String(req.body.notes || "").trim();
  if (!["accepted", "rejected"].includes(outcome) || notes.length < 10) {
    return res.status(400).json({ message: "Choose an inspection outcome and provide notes of at least ten characters." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM refund_requests WHERE id=$1 FOR UPDATE", [req.params.id]);
    const refund = result.rows[0];
    if (!refund) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Refund request not found." });
    }
    if (refund.status !== "awaiting_return" || refund.inspection_status !== "awaiting_return") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This refund is not waiting for returned-item inspection." });
    }
    const nextStatus = outcome === "accepted" ? "return_received" : "rejected";
    await client.query(
      `UPDATE refund_requests SET status=$1,inspection_status=$2,inspection_notes=$3,
       inspected_by=$4,inspected_at=NOW(),admin_response=$3,refund_decided_by=CASE WHEN $5 THEN $4 ELSE refund_decided_by END,
       refund_decided_at=CASE WHEN $5 THEN NOW() ELSE refund_decided_at END,updated_at=NOW() WHERE id=$6`,
      [nextStatus, outcome, notes, req.user.id, outcome === "rejected", refund.id],
    );
    await writeAudit(client, req.user.id, `refund.return_inspected_${outcome}`, "refund", refund.id, { orderId: refund.order_id, notes });
    await client.query("COMMIT");
    res.json({ message: outcome === "accepted" ? "Return received and inspected." : "Refund request rejected after return inspection.", status: nextStatus });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const completeRefund = async (req, res, next) => {
  const amount = Number(req.body.amount);
  const method = String(req.body.method || "");
  const reference = String(req.body.reference || "").trim();
  if (!Number.isFinite(amount) || amount <= 0 || reference.length < 3) {
    return res.status(400).json({ message: "Enter the confirmed refund amount and payment reference." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT r.*, o.total_price, o.shipping_fee, o.payment_method, o.payment_status,
              COALESCE(r.requested_amount,(SELECT SUM(ri.item_amount) FROM refund_request_items ri WHERE ri.refund_request_id=r.id)+o.shipping_fee,o.total_price) AS eligible_refund_amount
       FROM refund_requests r
       JOIN orders o ON o.id=r.order_id WHERE r.id=$1 FOR UPDATE OF r,o`,
      [req.params.id],
    );
    const refund = result.rows[0];
    if (!refund) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Refund request not found." });
    }
    if (refund.status !== "refund_processing" || refund.payment_status !== "successful" || !["cash", "bank_transfer", "chapa_manual"].includes(method)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This refund is not ready for confirmed processing." });
    }
    if (refund.payment_method === "chapa" && method !== "chapa_manual") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Chapa refunds require the documented manual confirmation flow." });
    }
    if (refund.payment_method === "cod" && method === "chapa_manual") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Choose cash or bank transfer for a Cash on Delivery refund." });
    }
    const expected = Number(refund.eligible_refund_amount);
    if (Math.round(amount * 100) !== Math.round(expected * 100)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Refund amount must match the recorded order total." });
    }
    await client.query(
      `UPDATE refund_requests SET status='refunded', refund_method=$1, refund_amount=$2,
              payment_reference=$3, refunded_at=NOW(), reviewed_by=$4, updated_at=NOW() WHERE id=$5`,
      [method, amount, reference, req.user.id, refund.id],
    );
    await client.query("UPDATE orders SET payment_status='refunded', updated_at=NOW() WHERE id=$1", [refund.order_id]);
    await client.query("UPDATE payments SET status='refunded' WHERE order_id=$1 AND status='successful'", [refund.order_id]);
    await writeAudit(client, req.user.id, "refund.confirmed", "refund", refund.id, { orderId: refund.order_id, method, amount, paymentReference: reference });
    await client.query("COMMIT");
    res.json({ message: "Refund recorded as completed with the supplied confirmation reference." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const recordRefundFailure = async (req, res, next) => {
  const reason = String(req.body.reason || "").trim();
  const reference = String(req.body.reference || "").trim();
  if (reason.length < 5 || reason.length > 1000 || reference.length > 255) {
    return res.status(400).json({ message: "Provide a failure reason (5–1000 characters) and an optional reference of at most 255 characters." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT r.id,r.order_id,r.status,r.request_type,o.payment_status
       FROM refund_requests r JOIN orders o ON o.id=r.order_id WHERE r.id=$1 FOR UPDATE OF r,o`,
      [req.params.id],
    );
    const refund = result.rows[0];
    if (!refund) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Refund case not found." });
    }
    if (refund.status !== "refund_processing" || refund.payment_status !== "successful") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Only an active manual refund can be marked as failed." });
    }
    await client.query(
      `UPDATE refund_requests SET status='refund_failed',refund_failure_reason=$1,
       refund_failure_reference=$2,refund_failed_at=NOW(),admin_response=$1,reviewed_by=$3,
       reviewed_at=NOW(),updated_at=NOW() WHERE id=$4`,
      [reason, reference || null, req.user.id, refund.id],
    );
    await writeAudit(client, req.user.id, "refund.failed", "refund", refund.id, {
      orderId: refund.order_id,
      requestType: refund.request_type,
      failureReason: reason,
      failureReference: reference || null,
    });
    await client.query("COMMIT");
    return res.json({ message: "Refund failure recorded. Payment remains successful until a refund is confirmed.", status: "refund_failed" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};
