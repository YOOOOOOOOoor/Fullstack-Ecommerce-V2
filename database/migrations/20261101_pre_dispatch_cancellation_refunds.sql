BEGIN;

ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS request_type VARCHAR(32) NOT NULL DEFAULT 'delivery_claim',
  ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS original_payment_reference VARCHAR(255),
  ADD COLUMN IF NOT EXISTS requested_amount NUMERIC(10,2) CHECK (requested_amount IS NULL OR requested_amount >= 0),
  ADD COLUMN IF NOT EXISTS cancellation_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_failure_reference VARCHAR(255),
  ADD COLUMN IF NOT EXISTS refund_failed_at TIMESTAMP;

ALTER TABLE refund_requests DROP CONSTRAINT IF EXISTS refund_requests_reason_check;
ALTER TABLE refund_requests ADD CONSTRAINT refund_requests_reason_check
  CHECK (reason IN ('damaged','defective','incorrect','cancellation'));

ALTER TABLE refund_requests DROP CONSTRAINT IF EXISTS refund_requests_status_check;
ALTER TABLE refund_requests ADD CONSTRAINT refund_requests_status_check
  CHECK (status IN ('requested','under_review','approved','rejected','awaiting_return','return_received','refund_processing','refund_failed','refunded'));

ALTER TABLE refund_requests DROP CONSTRAINT IF EXISTS refund_requests_request_type_check;
ALTER TABLE refund_requests ADD CONSTRAINT refund_requests_request_type_check
  CHECK (request_type IN ('delivery_claim','pre_dispatch_cancellation'));

CREATE INDEX IF NOT EXISTS idx_refund_requests_type_status
  ON refund_requests(request_type,status,requested_at DESC);

-- Backfill previously completed paid customer cancellations. The cancellation
-- audit row is the source of truth so admin cancellations after dispatch are
-- not incorrectly classified as customer pre-dispatch refunds.
INSERT INTO refund_requests
  (order_id,customer_id,reason,description,request_type,status,return_required,
   payment_id,original_payment_reference,requested_amount,cancellation_at,cancellation_reason)
SELECT o.id,o.user_id,'cancellation','Customer cancelled before dispatch; manual refund review required.',
       'pre_dispatch_cancellation','under_review',FALSE,p.id,p.tx_ref,o.total_price,a.created_at,
       NULLIF(a.metadata->>'cancellationReason','')
FROM orders o
JOIN LATERAL (
  SELECT id,tx_ref FROM payments WHERE order_id=o.id AND status='successful'
  ORDER BY paid_at DESC NULLS LAST,id DESC LIMIT 1
) p ON TRUE
JOIN LATERAL (
  SELECT created_at,metadata FROM operations_audit_log
  WHERE entity_type='order' AND entity_id=o.id::text AND action='order.customer_cancelled'
    AND metadata->>'paymentStatus'='successful'
  ORDER BY created_at DESC,id DESC LIMIT 1
) a ON TRUE
WHERE o.order_status='cancelled' AND o.payment_status='successful'
  AND NOT EXISTS (SELECT 1 FROM refund_requests r WHERE r.order_id=o.id)
ON CONFLICT (order_id) DO NOTHING;

COMMIT;
