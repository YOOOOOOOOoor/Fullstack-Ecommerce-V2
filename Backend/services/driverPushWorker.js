import pool from "../config/db.js";
import { isWebPushConfigured, sendDriverAssignmentPush } from "./driverPush.js";

let interval;
let processing = false;

export async function processDriverPushOutbox({ db = pool, sender = sendDriverAssignmentPush, configured = isWebPushConfigured } = {}) {
  if (!configured() || processing) return { claimed: 0 };
  processing = true;
  try {
    const result = await db.query(
      `WITH claimable AS (
         SELECT id FROM driver_push_outbox
         WHERE (status IN ('pending','failed') AND available_at<=NOW())
            OR (status='processing' AND locked_at<NOW()-INTERVAL '2 minutes')
         ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED
       )
       UPDATE driver_push_outbox q SET status='processing',attempt_count=q.attempt_count+1,
         locked_at=NOW(),updated_at=NOW()
       FROM claimable WHERE q.id=claimable.id
       RETURNING q.id,q.assignment_id,q.order_id,q.driver_id,q.attempt_count`,
    );
    for (const row of result.rows) {
      try {
        const outcome = await sender({ driverId: row.driver_id, assignmentId: row.assignment_id, orderId: row.order_id, db });
        if (outcome.skipped) {
          await db.query("UPDATE driver_push_outbox SET status='skipped',locked_at=NULL,updated_at=NOW() WHERE id=$1", [row.id]);
        } else if (outcome.retryable) {
          const delaySeconds = Math.min(3600, 15 * (2 ** Math.min(8, Math.max(0, row.attempt_count - 1))));
          await db.query(
            `UPDATE driver_push_outbox SET status='failed',locked_at=NULL,available_at=NOW()+($2 * INTERVAL '1 second'),
               last_error_code='provider_unavailable',updated_at=NOW() WHERE id=$1`,
            [row.id, delaySeconds],
          );
        } else {
          await db.query("UPDATE driver_push_outbox SET status='sent',locked_at=NULL,last_error_code=NULL,sent_at=NOW(),updated_at=NOW() WHERE id=$1", [row.id]);
        }
      } catch (error) {
        const delaySeconds = Math.min(3600, 15 * (2 ** Math.min(8, Math.max(0, row.attempt_count - 1))));
        await db.query(
          `UPDATE driver_push_outbox SET status='failed',locked_at=NULL,available_at=NOW()+($2 * INTERVAL '1 second'),
             last_error_code=$3,updated_at=NOW() WHERE id=$1`,
          [row.id, delaySeconds, /^[A-Za-z0-9_-]{1,40}$/.test(String(error.code || "")) ? error.code : "internal_error"],
        );
      }
    }
    return { claimed: result.rows.length };
  } finally { processing = false; }
}

export function startDriverPushWorker() {
  if (!isWebPushConfigured() || interval) return;
  void processDriverPushOutbox().catch((error) => console.error("Driver push worker failed", { code: /^[A-Za-z0-9_-]{1,40}$/.test(String(error.code || "")) ? error.code : "internal_error" }));
  interval = setInterval(() => {
    void processDriverPushOutbox().catch((error) => console.error("Driver push worker failed", { code: /^[A-Za-z0-9_-]{1,40}$/.test(String(error.code || "")) ? error.code : "internal_error" }));
  }, 15000);
  interval.unref?.();
}
