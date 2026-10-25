CREATE TABLE IF NOT EXISTS store_faqs (
  id BIGSERIAL PRIMARY KEY,
  question VARCHAR(240) NOT NULL CHECK (length(trim(question)) BETWEEN 5 AND 240),
  answer TEXT NOT NULL CHECK (length(trim(answer)) BETWEEN 10 AND 5000),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_faqs_public_order ON store_faqs(is_published, position, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_faqs_question_ci ON store_faqs(lower(question));

CREATE TABLE IF NOT EXISTS store_support_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  support_email VARCHAR(254),
  support_phone VARCHAR(40),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (support_email IS NULL OR support_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
INSERT INTO store_support_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO store_faqs(question, answer, is_published, position) VALUES
 ('How do I place an order?', 'Add available products to your cart, continue to checkout, provide your delivery details, and choose an available payment method. The final total includes the configured shipping fee.', TRUE, 10),
 ('What do my order statuses mean?', 'Processing means the order is being prepared. Ready for dispatch means it can be assigned to a driver. Out for delivery means a driver is bringing it to you. Delivered means delivery was verified. Cancelled or delivery failed means the order will not proceed without staff review.', TRUE, 20),
 ('Can I cancel an order?', 'You can cancel an eligible order from its details page before dispatch. Once it has been dispatched, normal cancellation is unavailable; contact the store for assistance.', TRUE, 30),
 ('How does delivery work?', 'After dispatch, the store assigns a driver. You can follow delivery updates in your order details and contact the assigned driver when contact details are shown.', TRUE, 40),
 ('How do I use the delivery verification code?', 'When your order is out for delivery, open that order’s details page in your account. Give the active code to the driver only after your order arrives. The code expires and can be used once.', TRUE, 50),
 ('Which payment methods are available?', 'Checkout displays the payment methods currently available for your order. Chapa payments are confirmed online. Cash on Delivery orders are paid to the driver at delivery when the option is available.', TRUE, 60),
 ('How does Cash on Delivery work?', 'Pay the driver the amount due when your order arrives. The driver records the amount collected, and store staff separately review and reconcile the cash.', TRUE, 70),
 ('How do returns and refunds work?', 'Submit a refund request from the order details page when eligible. The store reviews the request and will share any return or inspection steps. Refund status is shown in your account.', TRUE, 80),
 ('How do I contact support?', 'Use the support email or phone shown below when configured. For an order already dispatched, contact the store for help because normal cancellation is unavailable.', TRUE, 90)
ON CONFLICT DO NOTHING;

ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_event_type_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_event_type_check
  CHECK (event_type IN ('order_confirmation','driver_assigned','out_for_delivery','delivery_completed','refund_update','delivery_code','admin_activity'));

CREATE OR REPLACE FUNCTION enqueue_admin_activity_from_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor_name TEXT;
  actor_role TEXT;
  staff_status TEXT;
  is_super_admin BOOLEAN;
  driver_status TEXT;
  actor_reason TEXT;
BEGIN
  IF NEW.action NOT IN (
    'order.processing','order.ready_for_dispatch','order.cancelled',
    'delivery.assigned','delivery.reassigned_from','delivery.retry_scheduled','delivery.failed','delivery.started',
    'delivery.admin_exception','delivery.offer_rejected','delivery.offer_accepted','delivery.code_resent','delivery.verified',
    'cod.collection_submitted','cod.discrepancy','cod.reconciled','refund.awaiting_return','refund.refund_processing','refund.return_received','refund.rejected','refund.confirmed',
    'refund.return_inspected_accepted','refund.return_inspected_rejected','refund.completed',
    'staff.created','staff.permissions_updated','customer.account_type_changed',
    'driver.active','driver.suspended','driver.revoked','shipping.default_fee_changed','shipping.order_fee_overridden',
    'payment.late_review_fulfill','payment.late_review_refund_confirmed'
  ) THEN RETURN NEW; END IF;

  SELECT u.name,u.role,sp.status,sp.is_super_admin,dp.status
    INTO actor_name,actor_role,staff_status,is_super_admin,driver_status
    FROM users u LEFT JOIN staff_profiles sp ON sp.user_id=u.id
    LEFT JOIN driver_profiles dp ON dp.user_id=u.id WHERE u.id=NEW.actor_id;
  IF NOT COALESCE((actor_role='admin' AND staff_status='active' AND NOT COALESCE(is_super_admin,FALSE)) OR driver_status='active',FALSE) THEN
    RETURN NEW;
  END IF;

  actor_reason := NULLIF(NEW.metadata->>'reason','');
  BEGIN
    INSERT INTO notification_outbox(order_id,event_key,event_type,recipient,payload)
    SELECT CASE WHEN NEW.entity_type='order' AND NEW.entity_id ~ '^[0-9]+$' THEN NEW.entity_id::integer ELSE NULL END,
           'admin-audit:'||NEW.id||':'||u.id,'admin_activity',u.email,
           jsonb_build_object('actorName',COALESCE(actor_name,'Staff member'),'action',NEW.action,
             'entityType',NEW.entity_type,'entityId',NEW.entity_id,'reason',actor_reason)
      FROM users u JOIN staff_profiles sp ON sp.user_id=u.id
      WHERE u.role='admin' AND sp.status='active' AND sp.is_super_admin=TRUE
    ON CONFLICT(event_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Admin activity outbox enqueue failed for audit event % (SQLSTATE %)', NEW.id, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS operations_audit_admin_activity ON operations_audit_log;
CREATE TRIGGER operations_audit_admin_activity AFTER INSERT ON operations_audit_log
FOR EACH ROW EXECUTE FUNCTION enqueue_admin_activity_from_audit();
