BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_key VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_checkout_key
  ON orders(user_id, checkout_key)
  WHERE checkout_key IS NOT NULL;

COMMIT;
