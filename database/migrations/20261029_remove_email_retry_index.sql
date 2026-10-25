-- Email delivery retries have been removed. Keep notification_outbox history and activity rows.
DROP INDEX IF EXISTS idx_notification_outbox_retry;
