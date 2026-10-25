BEGIN;

CREATE TABLE IF NOT EXISTS driver_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_push_subscriptions_driver
  ON driver_push_subscriptions(driver_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS driver_push_outbox (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL UNIQUE REFERENCES delivery_assignments(id) ON DELETE RESTRICT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','skipped','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMP NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMP,
  last_error_code VARCHAR(40),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_push_outbox_pending
  ON driver_push_outbox(status,available_at,id)
  WHERE status IN ('pending','failed','processing');

COMMIT;
