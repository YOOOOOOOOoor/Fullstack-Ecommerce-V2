-- Persist Chapa's existing hosted checkout link so a customer can continue the
-- same payment attempt without creating another order or reusing tx_ref to initialize.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_url TEXT;

CREATE INDEX IF NOT EXISTS idx_operations_audit_created
  ON operations_audit_log(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_visible_activity_created
  ON notification_outbox(created_at DESC,id DESC)
  WHERE event_type='admin_activity' AND dismissed_at IS NULL;

-- Staff activity is a dismissible view over the immutable operations audit log.
-- Extend the existing whitelist without rewriting or deleting historical entries.
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
    'support.faq_created','support.faq_updated','support.faq_reordered','support.faq_deleted',
    'product.created','product.updated','product.deleted',
    'category.created','category.updated','category.deleted',
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
           jsonb_build_object('auditId',NEW.id,'actorName',COALESCE(actor_name,'Staff member'),'action',NEW.action,
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
