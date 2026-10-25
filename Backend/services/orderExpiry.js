import pool from "../config/db.js";
import { releaseReservedInventory } from "./inventory.js";
import { writeAudit } from "./audit.js";

export const expireOrderIfDue = async (orderId, ownerId = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const due = await client.query(
      `SELECT id FROM orders WHERE id=$1 AND ($2::integer IS NULL OR user_id=$2)
       AND payment_method='chapa' AND payment_status='pending'
       AND order_status='awaiting_payment' AND expires_at <= NOW() FOR UPDATE`,
      [orderId, ownerId],
    );
    if (!due.rows.length) {
      await client.query("COMMIT");
      return false;
    }
    const released = await releaseReservedInventory(client, orderId);
    const changed = await client.query(
      `UPDATE orders SET order_status='expired',payment_status='failed',updated_at=NOW()
       WHERE id=$1 AND payment_status='pending' AND order_status='awaiting_payment' RETURNING id`,
      [orderId],
    );
    if (changed.rows.length) {
      await client.query("UPDATE payments SET status='failed' WHERE order_id=$1 AND status='pending'", [orderId]);
      await writeAudit(client, null, "order.expired", "order", orderId, { inventoryReleased: released });
    }
    await client.query("COMMIT");
    return changed.rows.length > 0;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const expirePendingOrders = async (batchSize = 50) => {
  const client = await pool.connect();
  let expiredCount = 0;
  try {
    await client.query("BEGIN");
    const due = await client.query(
      `SELECT id FROM orders
       WHERE payment_method='chapa' AND payment_status='pending'
         AND order_status='awaiting_payment' AND expires_at <= NOW()
       ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [batchSize],
    );
    for (const { id } of due.rows) {
      const released = await releaseReservedInventory(client, id);
      const changed = await client.query(
        `UPDATE orders SET order_status='expired',payment_status='failed',updated_at=NOW()
         WHERE id=$1 AND payment_status='pending' AND order_status='awaiting_payment' RETURNING id`,
        [id],
      );
      if (!changed.rows.length) continue;
      await client.query("UPDATE payments SET status='failed' WHERE order_id=$1 AND status='pending'", [id]);
      await writeAudit(client, null, "order.expired", "order", id, { inventoryReleased: released });
      expiredCount += 1;
    }
    await client.query("COMMIT");
    return expiredCount;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const startOrderExpiryWorker = () => {
  const run = () => expirePendingOrders().catch((error) => {
    const databaseUrl = process.env.DATABASE_URL;
    const databaseUrlPresent = Boolean(databaseUrl);
    const connectionMethod = databaseUrlPresent ? "DATABASE_URL" : "DB_*";
    let databaseHostname = null;
    let databasePort = null;

    if (databaseUrlPresent) {
      try {
        const parsedUrl = new URL(databaseUrl);
        databaseHostname = parsedUrl.hostname || null;
        databasePort = parsedUrl.port || "5432";
      } catch {
        // Keep malformed connection strings out of logs; report endpoint as unavailable.
      }
    } else {
      const configuredHost = process.env.DB_HOST || "localhost";
      databaseHostname = /^[A-Za-z0-9.-]+$/.test(configuredHost) || /^[0-9A-Fa-f:]+$/.test(configuredHost)
        ? configuredHost
        : null;
      const configuredPort = process.env.DB_PORT || "5432";
      databasePort = /^\d{1,5}$/.test(configuredPort) && Number(configuredPort) <= 65535
        ? configuredPort
        : null;
    }

    let errorMessage = typeof error?.message === "string" ? error.message : null;
    if (errorMessage && databaseUrl) {
      errorMessage = errorMessage.split(databaseUrl).join("[redacted database connection string]");
    }
    if (errorMessage) {
      errorMessage = errorMessage.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database connection string]");
    }

    const errorDetails = {};
    for (const key of ["code", "message", "syscall", "address", "port"]) {
      const value = key === "message" ? errorMessage : error?.[key];
      if (value !== undefined && value !== null) errorDetails[key] = value;
    }

    console.error("DATABASE_DIAGNOSTIC", {
      databaseUrlPresent,
      connectionMethod,
      databaseHostname,
      databasePort,
      error: errorDetails,
    });
  });
  void run();
  const timer = setInterval(run, 60_000);
  timer.unref?.();
  return timer;
};
