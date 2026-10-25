import pool from "../config/db.js";
import { writeAudit } from "../services/audit.js";
import { releaseCancellableInventory, releaseReservedInventory } from "../services/inventory.js";
import { canCustomerCancelOrder, canTransitionAdminOrderStatus } from "../services/workflowRules.js";
import { decryptDeliveryCode } from "../services/deliveryCodeCrypto.js";
import { expireOrderIfDue } from "../services/orderExpiry.js";

export const cancelCustomerOrder = async (req, res, next) => {
  let client;
  try {
    const cancellationReason = String(req.body?.reason || "").trim();
    if (cancellationReason.length > 500) return res.status(400).json({ message: "Cancellation reason must be 500 characters or fewer." });
    await expireOrderIfDue(req.params.id, req.user.id);
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id,order_status,payment_status,payment_method,inventory_state,total_price
       FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [req.params.id, req.user.id],
    );
    const order = result.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }
    if (order.order_status === "cancelled") {
      const priorCase = await client.query(
        `SELECT id,status,requested_amount FROM refund_requests
         WHERE order_id=$1 AND request_type='pre_dispatch_cancellation'`,
        [order.id],
      );
      await client.query("COMMIT");
      return res.status(200).json({
        message: "This order was already cancelled.",
        order_status: "cancelled",
        payment_status: order.payment_status,
        refund_case: priorCase.rows[0] || null,
      });
    }
    if (!canCustomerCancelOrder(order.order_status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This order is already dispatched. Contact the store for help; normal cancellation is no longer available." });
    }
    let refundCase = null;
    if (order.payment_status === "successful") {
      const payment = await client.query(
        `SELECT id,tx_ref FROM payments WHERE order_id=$1 AND status='successful'
         ORDER BY paid_at DESC NULLS LAST,id DESC LIMIT 1 FOR UPDATE`,
        [order.id],
      );
      if (!payment.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "The successful payment record could not be matched. Contact the store before cancelling this order." });
      }
      const created = await client.query(
        `INSERT INTO refund_requests
           (order_id,customer_id,reason,description,request_type,status,return_required,
            payment_id,original_payment_reference,requested_amount,cancellation_at,cancellation_reason)
         VALUES ($1,$2,'cancellation',$3,'pre_dispatch_cancellation','under_review',FALSE,$4,$5,$6,NOW(),$7)
         RETURNING id,status,requested_amount,cancellation_at`,
        [order.id, req.user.id, cancellationReason || "Customer cancelled before dispatch; manual refund review required.", payment.rows[0].id, payment.rows[0].tx_ref, order.total_price, cancellationReason || null],
      );
      refundCase = created.rows[0];
      await writeAudit(client, req.user.id, "refund.cancellation_review_created", "refund", refundCase.id, {
        orderId: order.id,
        paymentId: payment.rows[0].id,
        originalPaymentReference: payment.rows[0].tx_ref,
        requestedAmount: order.total_price,
        cancellationReason: cancellationReason || null,
      });
    }
    await client.query(
      `UPDATE orders SET order_status='cancelled',
         payment_status=CASE WHEN payment_status='pending' THEN 'failed' ELSE payment_status END,
         updated_at=NOW() WHERE id=$1`,
      [order.id],
    );
    const inventoryReleased = await releaseCancellableInventory(client, order.id);
    await client.query("UPDATE payments SET status='failed' WHERE order_id=$1 AND status='pending'", [order.id]);
    await writeAudit(client, req.user.id, "order.customer_cancelled", "order", order.id, {
      inventoryReleased,
      paymentStatus: order.payment_status,
      cancellationReason: cancellationReason || null,
      refundCaseId: refundCase?.id || null,
    });
    await client.query("COMMIT");
    res.json({
      message: order.payment_status === "successful"
        ? "Order cancelled before dispatch. A manual refund review case was created; no refund has been sent."
        : "Order cancelled before dispatch.",
      order_status: "cancelled",
      payment_status: order.payment_status === "pending" ? "failed" : order.payment_status,
      refund_case: refundCase,
    });
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client?.release();
  }
};

export const getOrders = async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const orders = await pool.query(
      `
     SELECT
    o.id,
    o.total_price,
    o.payment_status,
    o.order_status,
    o.created_at,
    o.delivered_at,
    o.shipping_fee,
    rr.status AS refund_status,

    p.title,
    p.image_url,

    (
        SELECT COUNT(*)
        FROM order_items
        WHERE order_id = o.id
    ) AS item_count

FROM orders o

LEFT JOIN refund_requests rr ON rr.order_id=o.id

JOIN order_items oi
ON oi.id = (
    SELECT MIN(id)
    FROM order_items
    WHERE order_id = o.id
)

JOIN products p
ON p.id = oi.product_id

WHERE o.user_id = $1

ORDER BY o.created_at DESC;
      `,
      [user_id],
    );

    const formattedOrders = orders.rows.map((order) => ({
      ...order,
      display_title:
        Number(order.item_count) > 1
          ? `${order.title} +${Number(order.item_count) - 1} more item${Number(order.item_count) - 1 > 1 ? "s" : ""}`
          : order.title,
    }));

    res.status(200).json(formattedOrders);
  } catch (error) {
    next(error);
    res.status(500).json({
      message: "Server error",
    });
  }
};

//single order
export const getOrder = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const order_id = req.params.id;

    await expireOrderIfDue(order_id, user_id);

    const order = await pool.query(
      `
      SELECT
        o.id,
        o.total_price,
        o.payment_status,
        o.order_status,
        o.late_payment_review_required,
        o.payment_method,
        o.created_at,
        o.delivered_at,
        o.shipping_fee,
        o.expires_at AT TIME ZONE current_setting('TIMEZONE') AS expires_at,
        NOW() AS server_now,
        CASE WHEN o.payment_method='chapa' AND o.payment_status='pending' AND o.order_status='awaiting_payment'
          THEN GREATEST(0,EXTRACT(EPOCH FROM (o.expires_at-NOW()))*1000)::bigint ELSE 0 END AS payment_remaining_ms,
        delivery_attempt.code_ciphertext,
        delivery_attempt.code_expires_at,
        CASE
          WHEN o.order_status IN ('cancelled','delivered','returned','expired','delivery_failed') THEN 'inactive'
          WHEN o.order_status='out_for_delivery' AND delivery_attempt.code_expires_at<=NOW() THEN 'expired'
          WHEN o.order_status='out_for_delivery' AND delivery_attempt.code_ciphertext IS NOT NULL THEN 'active'
          WHEN o.order_status='out_for_delivery' AND delivery_attempt.code_expires_at>NOW() THEN 'unavailable'
          WHEN o.order_status='out_for_delivery' THEN 'expired'
          WHEN o.order_status='assigned_to_driver' THEN 'pending'
          ELSE 'not_started'
        END AS delivery_code_status,
        (o.order_status IN ('awaiting_payment','processing','ready_for_dispatch')) AS can_cancel,
        driver.name AS driver_name,
        driver.phone AS driver_phone,
        (o.order_status='delivered' AND o.payment_status='successful' AND o.delivered_at IS NOT NULL
          AND NOW() <= o.delivered_at + INTERVAL '3 days' AND rr.id IS NULL) AS refund_eligible,
        rr.id AS refund_id,
        rr.status AS refund_status,
        rr.reason AS refund_reason,
        rr.description AS refund_description,
        rr.attachments AS refund_attachments,
        rr.admin_response AS refund_admin_response,
        rr.return_required,
        rr.return_delivery_responsibility,
        rr.refund_method,
        rr.refund_amount,
        rr.payment_reference,
        rr.refunded_at,
        rr.request_type,
        rr.requested_amount,
        rr.payment_id AS original_payment_id,
        rr.original_payment_reference,
        rr.cancellation_at,
        rr.cancellation_reason,
        rr.refund_failure_reason,
        rr.refund_failure_reference,
        rr.refund_failed_at,

        a.receiver_name,
        a.phone AS shipping_phone,
        a.city,
        a.sub_city,
        a.address AS shipping_address,

        p.id AS product_id,
        p.title,
        p.image_url,

        oi.quantity,
        oi.id AS order_item_id,
        oi.price_at_purchase

      FROM orders o

      LEFT JOIN refund_requests rr ON rr.order_id=o.id
      LEFT JOIN addresses a ON a.id=o.address_id
      LEFT JOIN LATERAL (
        SELECT u.name,u.phone FROM delivery_assignments da JOIN users u ON u.id=da.driver_id
        WHERE da.order_id=o.id AND da.unassigned_at IS NULL AND da.response_status='accepted'
          AND o.order_status NOT IN ('delivered','cancelled','returned')
        ORDER BY da.assigned_at DESC LIMIT 1
      ) driver ON TRUE
      LEFT JOIN LATERAL (
        SELECT d.code_ciphertext, d.code_expires_at FROM delivery_attempts d
        WHERE d.order_id=o.id AND d.status='out_for_delivery' AND o.order_status='out_for_delivery'
        ORDER BY d.attempt_number DESC LIMIT 1
      ) delivery_attempt ON TRUE

      JOIN order_items oi
        ON o.id = oi.order_id

      JOIN products p
        ON oi.product_id = p.id

      WHERE o.user_id = $1
      AND o.id = $2

      ORDER BY oi.id;
      `,
      [user_id, order_id],
    );

    if (order.rows.length === 0) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const first = order.rows[0];
    const [auditEvents, paymentEvent, refundEvent, refundAudit] = await Promise.all([
      pool.query(
        `SELECT action,created_at FROM operations_audit_log WHERE entity_type='order' AND entity_id=$1
         AND action IN ('order.ready_for_dispatch','order.customer_cancelled','order.cancelled','order.expired',
           'delivery.assigned','delivery.offer_accepted','delivery.offer_rejected','delivery.started',
           'delivery.failed','delivery.verified','delivery.admin_exception','cod.collection_submitted','cod.discrepancy','cod.reconciled')
         ORDER BY created_at`,
        [String(order_id)],
      ),
      pool.query("SELECT paid_at,status,tx_ref FROM payments WHERE order_id=$1 AND status IN ('successful','refunded') ORDER BY paid_at DESC NULLS LAST LIMIT 1", [order_id]),
      pool.query("SELECT status,requested_at,updated_at,refunded_at FROM refund_requests WHERE order_id=$1", [order_id]),
      first.refund_id ? pool.query("SELECT action,created_at FROM operations_audit_log WHERE entity_type='refund' AND entity_id=$1 ORDER BY created_at", [String(first.refund_id)]) : Promise.resolve({ rows: [] }),
    ]);
    const eventLabels = {
      "order.ready_for_dispatch": "Ready for dispatch", "order.customer_cancelled": "Cancelled before dispatch",
      "order.cancelled": "Cancelled", "order.expired": "Payment window expired", "delivery.assigned": "Driver assigned",
      "delivery.offer_accepted": "Driver accepted assignment", "delivery.offer_rejected": "Assignment returned to store",
      "delivery.started": "Out for delivery", "delivery.failed": "Delivery attempt failed",
      "delivery.verified": "Delivery completed", "delivery.admin_exception": "Delivery completed by staff exception",
      "cod.collection_submitted": "COD collection submitted for review", "cod.discrepancy": "COD discrepancy recorded",
      "cod.reconciled": "COD collection reconciled",
    };
    const timeline = [
      { event: "Order placed", timestamp: first.created_at },
      ...auditEvents.rows.map((event) => ({ event: eventLabels[event.action] || "Order update", timestamp: event.created_at })),
    ];
    if (paymentEvent.rows[0]?.paid_at) timeline.push({ event: "Payment confirmed", timestamp: paymentEvent.rows[0].paid_at });
    if (first.delivered_at && !auditEvents.rows.some((event) => ["delivery.verified", "delivery.admin_exception"].includes(event.action))) timeline.push({ event: "Delivery completed", timestamp: first.delivered_at });
    if (refundEvent.rows[0]) {
      const seenRequested = refundAudit.rows.some((event) => event.action === "refund.requested");
      if (!seenRequested) timeline.push({ event: "Refund requested", timestamp: refundEvent.rows[0].requested_at });
      const refundEventLabels = {
        "refund.under_review": "Refund under review", "refund.approved": "Refund approved",
        "refund.rejected": "Refund request declined", "refund.awaiting_return": "Return requested",
        "refund.return_received": "Return received", "refund.refund_processing": "Refund processing",
        "refund.failed": "Refund attempt failed", "refund.confirmed": "Refund confirmed",
      };
      for (const event of refundAudit.rows) {
        if (event.action === "refund.requested" || event.action === "refund.confirmed") continue;
        timeline.push({ event: refundEventLabels[event.action] || "Refund update", timestamp: event.created_at });
      }
      if (refundEvent.rows[0].refunded_at) timeline.push({ event: "Refund confirmed", timestamp: refundEvent.rows[0].refunded_at });
    }
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.status(200).json({
      id: first.id,
      total_price: first.total_price,
      payment_status: first.payment_status,
      order_status: first.order_status,
      late_payment_review_required: first.late_payment_review_required,
      payment_method: first.payment_method,
      expires_at: first.expires_at,
      server_now: first.server_now,
      payment_remaining_ms: Number(first.payment_remaining_ms || 0),
      created_at: first.created_at,
      delivered_at: first.delivered_at,
      delivery_code: first.delivery_code_status === "active" && first.code_ciphertext ? decryptDeliveryCode(first.code_ciphertext) : null,
      delivery_code_status: first.delivery_code_status,
      shipping_fee: first.shipping_fee,
      can_cancel: first.can_cancel,
      driver: first.driver_name ? { name: first.driver_name, phone: first.driver_phone } : null,
      timeline,
      refund_eligible: first.refund_eligible,
      payment_reference: paymentEvent.rows[0]?.tx_ref || null,
      refund_request: first.refund_id ? {
        id: first.refund_id,
        status: first.refund_status,
        reason: first.refund_reason,
        description: first.refund_description,
        attachments: first.refund_attachments,
        admin_response: first.refund_admin_response,
        return_required: first.return_required,
        return_delivery_responsibility: first.return_delivery_responsibility,
        refund_method: first.refund_method,
        refund_amount: first.refund_amount,
        payment_reference: first.payment_reference,
        refunded_at: first.refunded_at,
        request_type: first.request_type,
        requested_amount: first.requested_amount,
        original_payment_id: first.original_payment_id,
        original_payment_reference: first.original_payment_reference,
        cancellation_at: first.cancellation_at,
        cancellation_reason: first.cancellation_reason,
        refund_failure_reason: first.refund_failure_reason,
        refund_failure_reference: first.refund_failure_reference,
        refund_failed_at: first.refund_failed_at,
      } : null,

      items: order.rows.map((item) => ({
        product_id: item.product_id,
        title: item.title,
        image_url: item.image_url,
        quantity: item.quantity,
        order_item_id: item.order_item_id,
        price_at_purchase: item.price_at_purchase,
      })),
    shipping_address: { receiver_name: first.receiver_name, phone: first.shipping_phone, city: first.city, sub_city: first.sub_city, address: first.shipping_address },
    });
  } catch (error) {
    return next(error);
  }
};

//admin order_processing
export const updateOrderStatus = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { order_status } = req.body;
    const order_id = req.params.id;
    const allowedStatuses = ["processing", "ready_for_dispatch", "cancelled"];

    if (!allowedStatuses.includes(order_status)) {
      return res.status(400).json({
        message: "Invalid order status",
      });
    }
    const reason = String(req.body.reason || "").trim();
    if (order_status === "cancelled" && !req.staff?.is_super_admin && reason.length < 10) {
      return res.status(400).json({ message: "Provide a cancellation reason of at least ten characters." });
    }
    await expireOrderIfDue(order_id);
    await client.query("BEGIN");
    const locked = await client.query(`SELECT id, order_status, payment_status, payment_method, inventory_state FROM orders WHERE id=$1 FOR UPDATE`, [order_id]);
    const order = locked.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found" });
    }
    const paymentEligible = order.payment_method === "chapa"
      ? order.payment_status === "successful"
      : order.payment_method === "cod" && ["pending", "successful"].includes(order.payment_status);
    if (!canTransitionAdminOrderStatus(order.order_status, order_status) ||
        (order_status === "cancelled" && !["pending", "failed"].includes(order.payment_status)) ||
        (["processing", "ready_for_dispatch"].includes(order_status) && !paymentEligible)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "That order status transition is not allowed." });
    }
    if (order_status === "ready_for_dispatch" && order.order_status !== "processing" && order.order_status !== "ready_for_dispatch") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Only a processing order can be marked ready for dispatch." });
    }
    if (order.order_status === "ready_for_dispatch" && order_status === "processing") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "An order ready for dispatch cannot return to processing." });
    }
    if (order_status !== "cancelled" && ["assigned_to_driver", "out_for_delivery", "delivery_failed"].includes(order.order_status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Use delivery reassignment controls for an assigned order." });
    }
    await client.query("UPDATE orders SET order_status=$2, updated_at=NOW() WHERE id=$1", [order_id, order_status]);
    const inventoryReleased = order_status === "cancelled"
      ? await releaseReservedInventory(client, order_id)
      : false;
    if (order_status === "cancelled") {
      await client.query(
        `UPDATE delivery_attempts SET status='failed', code_hash=NULL, code_ciphertext=NULL, completed_at=NOW(),
                failure_reason='other', failure_notes='Order cancelled by admin'
         WHERE order_id=$1 AND status='out_for_delivery'`,
        [order_id],
      );
      await client.query(
        `UPDATE delivery_assignments SET unassigned_at=NOW(), unassigned_by=$2, change_reason='Order cancelled by admin'
         WHERE order_id=$1 AND unassigned_at IS NULL`,
        [order_id, req.user.id],
      );
    }
    await writeAudit(client, req.user.id, `order.${order_status}`, "order", order_id, { reason: reason || null, inventoryReleased });
    await client.query("COMMIT");
    res.status(200).json({ message: "Order changed successfully" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

//admin get all
export const getOrdersAdmin = async (req, res, next) => {
  try {
    const {
      search = "",
      order_status = "",
      payment_status = "",
      page = 1,
      limit = 5,
    } = req.query;

    const currentPage = Number(page);
    const pageLimit = Number(limit);
    const offset = (currentPage - 1) * pageLimit;

    const values = [];
    const conditions = [];

    // Search
    if (search) {
      values.push(`%${search}%`);

      conditions.push(`
        (
          CAST(o.id AS TEXT) ILIKE $${values.length}
          OR u.name ILIKE $${values.length}
          OR u.email ILIKE $${values.length}
          OR p.title ILIKE $${values.length}
        )
      `);
    }

    // Order status filter
    if (order_status && order_status !== "all") {
      values.push(order_status);

      conditions.push(`o.order_status = $${values.length}`);
    }

    // Payment status filter
    if (payment_status && payment_status !== "all") {
      values.push(payment_status);

      conditions.push(`o.payment_status = $${values.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Add pagination values
    values.push(pageLimit);
    const limitIndex = values.length;

    values.push(offset);
    const offsetIndex = values.length;

    const orders = await pool.query(
      `
      SELECT
        o.id,
        o.total_price,
        o.payment_status,
        o.order_status,
        o.late_payment_review_required,
        o.created_at,

        u.name,
        u.email,

        p.title,
        p.image_url,
        active_assignment.driver_id AS current_driver_id,
        active_assignment.driver_name AS current_driver_name,
        (
          SELECT COUNT(*)
          FROM order_items
          WHERE order_id = o.id
        ) AS item_count

      FROM orders o

      JOIN users u
      ON o.user_id = u.id

      JOIN order_items oi
      ON oi.id = (
        SELECT MIN(id)
        FROM order_items
        WHERE order_id = o.id
      )

      JOIN products p
      ON p.id = oi.product_id

      LEFT JOIN LATERAL (
        SELECT da.driver_id, u.name AS driver_name
        FROM delivery_assignments da JOIN users u ON u.id=da.driver_id
        WHERE da.order_id=o.id AND da.unassigned_at IS NULL
        ORDER BY da.assigned_at DESC LIMIT 1
      ) active_assignment ON TRUE
      ${whereClause}


      ORDER BY o.created_at DESC

      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
      `,
      values,
    );

    const formattedOrders = orders.rows.map((order) => ({
      ...order,
      display_title:
        Number(order.item_count) > 1
          ? `${order.title} +${Number(order.item_count) - 1} more item${
              Number(order.item_count) - 1 > 1 ? "s" : ""
            }`
          : order.title,
    }));

    const countResult = await pool.query(
      `
  SELECT COUNT(DISTINCT o.id)
  FROM orders o

  JOIN users u
  ON o.user_id = u.id

  JOIN order_items oi
  ON oi.order_id = o.id

  JOIN products p
  ON p.id = oi.product_id

  ${whereClause}
  `,
      values.slice(0, values.length - 2),
    );

    const totalOrders = countResult.rows[0].count;
    const totalPages = Math.ceil(totalOrders / pageLimit);

    res.status(200).json({
      orders: formattedOrders,
      page: currentPage,
      limit: pageLimit,
      totalPages,
    });
  } catch (error) {
    next(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

export const getOrderAdmin = async (req, res, next) => {
  try {
    const order_id = req.params.id;

    await expireOrderIfDue(order_id);

    const order = await pool.query(
      `
      SELECT
    o.id,
    o.total_price,
    o.payment_status,
    o.order_status,
    o.payment_method,
    o.late_payment_review_required,
    o.created_at,
    o.delivered_at,
    o.shipping_fee,
    a.receiver_name,
    a.phone AS shipping_phone,
    a.city,
    a.sub_city,
    a.address AS shipping_address,
    rr.id AS refund_id,
    rr.status AS refund_status,

    u.name,
    u.email,

    p.id AS product_id,
    p.title,
    p.image_url,

    oi.quantity,
    oi.price_at_purchase

FROM orders o

LEFT JOIN refund_requests rr ON rr.order_id=o.id
LEFT JOIN addresses a ON a.id=o.address_id

JOIN users u
ON o.user_id = u.id

JOIN order_items oi
ON o.id = oi.order_id

JOIN products p
ON oi.product_id = p.id

WHERE o.id = $1

ORDER BY oi.id;
      `,
      [order_id],
    );

    if (order.rows.length === 0) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const first = order.rows[0];

    res.status(200).json({
      id: first.id,
      total_price: first.total_price,
      payment_status: first.payment_status,
      order_status: first.order_status,
      payment_method: first.payment_method,
      late_payment_review_required: first.late_payment_review_required,
      created_at: first.created_at,
      delivered_at: first.delivered_at,
      shipping_fee: first.shipping_fee,
      shipping_address: { receiver_name: first.receiver_name, phone: first.shipping_phone, city: first.city, sub_city: first.sub_city, address: first.shipping_address },
      refund_request: first.refund_id ? { id: first.refund_id, status: first.refund_status } : null,

      name: first.name,
      email: first.email,

      items: order.rows.map((item) => ({
        product_id: item.product_id,
        title: item.title,
        image_url: item.image_url,
        quantity: item.quantity,
        price_at_purchase: item.price_at_purchase,
      })),
    });
  } catch (error) {
    next(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
