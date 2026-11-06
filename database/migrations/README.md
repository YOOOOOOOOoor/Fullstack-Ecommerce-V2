# Delivery and refund migration

The backend expects the existing `database/schema.sql` database plus the additive migrations in order. Apply them to a confirmed target PostgreSQL database before deploying the updated backend:

```sh
psql "$DATABASE_URL" -f database/migrations/20261023_delivery_refund_workflows.sql
psql "$DATABASE_URL" -f database/migrations/20261024_operations_integrity.sql
psql "$DATABASE_URL" -f database/migrations/20261025_support_admin_activity.sql
# Historical filename: this adds the encrypted delivery-code column used by the customer order page.
psql "$DATABASE_URL" -f database/migrations/20261026_delivery_code_email_retry.sql
psql "$DATABASE_URL" -f database/migrations/20261027_delivery_code_website_faq.sql
psql "$DATABASE_URL" -f database/migrations/20261028_notification_dismissals.sql
psql "$DATABASE_URL" -f database/migrations/20261029_remove_email_retry_index.sql
psql "$DATABASE_URL" -f database/migrations/20261030_staff_activity_chapa_continuation.sql
psql "$DATABASE_URL" -f database/migrations/20261031_checkout_idempotency.sql
psql "$DATABASE_URL" -f database/migrations/20261101_pre_dispatch_cancellation_refunds.sql
psql "$DATABASE_URL" -f database/migrations/20261102_driver_web_push.sql
psql "$DATABASE_URL" -f database/migrations/20261103_google_accounts_nullable_password.sql
psql "$DATABASE_URL" -f database/migrations/20261105_visitor_analytics.sql
```

`20261103_google_accounts_nullable_password.sql` allows Google-authenticated users to have a `NULL` local password. Apply it to an existing database before deploying Google account registration that stores passwordless accounts. It does not alter existing user rows or provider values.

`20261105_visitor_analytics.sql` creates anonymous visitor, session, and page-view tables. Visitor records inactive for 13 months and page-view/session records older than 13 months are removed by the backend retention worker. The visitor endpoint reports the earliest retained page-view date and marks ranges before that date as partial.

`20261101_pre_dispatch_cancellation_refunds.sql` adds the pre-dispatch cancellation refund-review fields and safely backfills prior successful customer cancellations using their `order.customer_cancelled` audit entries. It does not contact Chapa or change payment statuses.

`20261102_driver_web_push.sql` adds per-driver Web Push subscriptions. Apply this migration to the target database before enabling Web Push on the deployed API. Do not apply migrations to production until the target connection has been confirmed.

For a local database, use the equivalent connection flags from `Backend/.env` instead of `DATABASE_URL`. The repository has no automatic migration runner.

Configure the default shipping fee through the Super Admin shipping screen. `SHIPPING_FEE_ETB` is an optional bootstrap fallback; checkout returns a configuration error if neither an environment nor database fee exists. COD uses the existing `settings.cod_enabled` value when `COD_ENABLED` is unset (and defaults to enabled if the settings table has no row). Set `COD_ENABLED=false` to disable it at the environment level.

The application does not send customer email or use an external email provider. Delivery confirmation codes are shown on the authenticated customer's order details page. The notification outbox remains for staff activity and retained historical records; it is no longer used for email delivery.

Delivery verification codes expire after 30 minutes and allow five guesses. Delivery attempts are capped at three per order. Chapa refunds are manual because the existing integration only initializes and verifies payments; no provider refund capability is configured. Admins must perform the refund through the appropriate channel and enter its confirmation reference before recording completion.

The second migration adds inventory state, driver offer responses, permission profiles, notification tracking, COD review states, shipping configuration and overrides, refund inspection fields, and late-payment review records. The repository has no automatic migration runner; check the target schema and migration history before applying it. Production Neon has not been migrated or tested.
