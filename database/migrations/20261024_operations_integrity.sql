-- Additive operational integrity fields. Existing order and delivery records are retained.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2) CHECK (shipping_fee IS NULL OR shipping_fee >= 0);
CREATE TABLE IF NOT EXISTS shipping_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id=1),
  default_fee NUMERIC(10,2) NOT NULL CHECK (default_fee >= 0),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS inventory_state VARCHAR(16) NOT NULL DEFAULT 'none'
    CHECK (inventory_state IN ('none','reserved','committed','released')),
  ADD COLUMN IF NOT EXISTS late_payment_review_required BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE orders SET inventory_state='committed'
  WHERE payment_status='successful' AND inventory_state='none';
UPDATE orders SET inventory_state='reserved'
  WHERE payment_method='cod' AND payment_status='pending'
    AND order_status NOT IN ('cancelled','expired','delivered','returned') AND inventory_state='none';

ALTER TABLE delivery_assignments
  ADD COLUMN IF NOT EXISTS response_status VARCHAR(16) NOT NULL DEFAULT 'accepted'
    CHECK (response_status IN ('offered','accepted','rejected','withdrawn')),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMP;

ALTER TABLE cod_collections DROP CONSTRAINT IF EXISTS cod_collections_status_check;
ALTER TABLE cod_collections ADD CONSTRAINT cod_collections_status_check
  CHECK (status IN ('pending_review','collected','discrepancy','short','overpaid','resolved'));
ALTER TABLE cod_collections ADD COLUMN IF NOT EXISTS resolution_reason TEXT;

ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS inspection_status VARCHAR(20) NOT NULL DEFAULT 'not_started'
    CHECK (inspection_status IN ('not_started','awaiting_return','received','accepted','rejected','exception_approved')),
  ADD COLUMN IF NOT EXISTS inspection_notes TEXT,
  ADD COLUMN IF NOT EXISTS inspected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS exception_reason TEXT,
  ADD COLUMN IF NOT EXISTS exception_actor INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exception_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS refund_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS refund_decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_decided_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deactivated')),
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions)='array'),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_super_admin ON staff_profiles(is_super_admin) WHERE is_super_admin;
INSERT INTO staff_profiles(user_id,is_super_admin)
SELECT u.id,TRUE FROM users u WHERE u.role='admin'
  AND NOT EXISTS (SELECT 1 FROM staff_profiles WHERE is_super_admin)
ORDER BY u.id LIMIT 1
ON CONFLICT (user_id) DO UPDATE SET is_super_admin=TRUE,updated_at=NOW();
INSERT INTO staff_profiles(user_id,is_super_admin)
SELECT u.id,FALSE FROM users u WHERE u.role='admin'
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_key VARCHAR(120) NOT NULL UNIQUE,
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('order_confirmation','driver_assigned','out_for_delivery','delivery_completed','refund_update','delivery_code')),
  recipient VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_retry ON notification_outbox(status,updated_at) WHERE status IN ('pending','failed','sending');

CREATE TABLE IF NOT EXISTS late_payment_reviews (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  tx_ref VARCHAR(100) NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(8) NOT NULL,
  provider_reference VARCHAR(255),
  status VARCHAR(16) NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review','fulfill','refund_manual','resolved')),
  reason TEXT NOT NULL DEFAULT 'Provider confirmed payment after order expiry.',
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_late_payment_reviews_status ON late_payment_reviews(status,created_at);
ALTER TABLE late_payment_reviews
  ADD COLUMN IF NOT EXISTS review_action VARCHAR(20),
  ADD COLUMN IF NOT EXISTS resolution_reference VARCHAR(255),
  ADD COLUMN IF NOT EXISTS resolved_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS resolution_reason TEXT;

CREATE TABLE IF NOT EXISTS refund_request_items (
  id BIGSERIAL PRIMARY KEY,
  refund_request_id BIGINT NOT NULL REFERENCES refund_requests(id) ON DELETE RESTRICT,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  item_amount NUMERIC(10,2) NOT NULL CHECK (item_amount >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(refund_request_id,order_item_id)
);
CREATE TABLE IF NOT EXISTS order_shipping_fee_changes (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  previous_fee NUMERIC(10,2) NOT NULL CHECK (previous_fee >= 0),
  new_fee NUMERIC(10,2) NOT NULL CHECK (new_fee >= 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
