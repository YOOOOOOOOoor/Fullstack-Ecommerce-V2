-- Apply once to an existing database after taking a backup.
-- Existing user roles remain customer/admin; driver access is an independently
-- revocable profile so a promoted customer keeps their storefront history.

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready_for_dispatch';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'assigned_to_driver';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'delivery_failed';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'out_for_delivery';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'returned';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  promoted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  promoted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_assignments (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMP,
  unassigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  change_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_one_active_assignment
  ON delivery_assignments(order_id) WHERE unassigned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_driver_active
  ON delivery_assignments(driver_id, assigned_at DESC) WHERE unassigned_at IS NULL;

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  assignment_id BIGINT NOT NULL REFERENCES delivery_assignments(id) ON DELETE RESTRICT,
  driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status VARCHAR(24) NOT NULL CHECK (status IN ('out_for_delivery','delivered','failed','exception_delivered')),
  code_hash CHAR(64),
  code_expires_at TIMESTAMP,
  code_sent_at TIMESTAMP,
  code_send_count INTEGER NOT NULL DEFAULT 0,
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  failure_reason VARCHAR(40),
  failure_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (failure_reason IS NULL OR failure_reason IN ('customer_unavailable','could_not_contact','incorrect_address','customer_declined','other'))
);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_order ON delivery_attempts(order_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS cod_collections (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expected_amount NUMERIC(10,2) NOT NULL CHECK (expected_amount >= 0),
  collected_amount NUMERIC(10,2) NOT NULL CHECK (collected_amount >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'ETB',
  status VARCHAR(16) NOT NULL CHECK (status IN ('collected','discrepancy')),
  collected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refund_requests (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason VARCHAR(16) NOT NULL CHECK (reason IN ('damaged','defective','incorrect')),
  description TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','under_review','approved','rejected','awaiting_return','return_received','refund_processing','refunded')),
  admin_response TEXT,
  return_required BOOLEAN NOT NULL DEFAULT FALSE,
  return_delivery_responsibility VARCHAR(16) NOT NULL DEFAULT 'store' CHECK (return_delivery_responsibility IN ('store','customer')),
  refund_method VARCHAR(16),
  refund_amount NUMERIC(10,2),
  payment_reference VARCHAR(255),
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  refunded_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS operations_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operations_audit_entity ON operations_audit_log(entity_type, entity_id, created_at DESC);
