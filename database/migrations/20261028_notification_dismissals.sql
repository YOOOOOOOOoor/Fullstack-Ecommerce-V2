ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_visible_admin
  ON notification_outbox(event_type, dismissed_at, updated_at DESC)
  WHERE dismissed_at IS NULL;
