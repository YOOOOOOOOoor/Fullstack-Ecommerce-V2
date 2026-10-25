import pool from "../config/db.js";

const isVisibleNotification = (id) => Number.isSafeInteger(Number(id)) && Number(id) > 0;

export const createNotificationDismissHandlers = ({ db }) => ({
  dismissNotification: async (req, res, next) => {
    if (!isVisibleNotification(req.params.id)) return res.status(400).json({ message: "A valid notification ID is required." });
    try {
      const result = await db.query("UPDATE notification_outbox SET dismissed_at=NOW(),updated_at=NOW() WHERE id=$1 AND dismissed_at IS NULL AND event_type='admin_activity' RETURNING id", [req.params.id]);
      if (!result.rowCount) return res.status(404).json({ message: "This notification is no longer available." });
      return res.json({ dismissed: 1 });
    } catch (error) { return next(error); }
  },
  dismissAllNotifications: async (_req, res, next) => {
    try {
      const result = await db.query("UPDATE notification_outbox SET dismissed_at=NOW(),updated_at=NOW() WHERE dismissed_at IS NULL AND event_type='admin_activity'");
      return res.json({ dismissed: result.rowCount });
    } catch (error) { return next(error); }
  },
});

const dismissHandlers = createNotificationDismissHandlers({ db: pool });
export const dismissNotification = dismissHandlers.dismissNotification;
export const dismissAllNotifications = dismissHandlers.dismissAllNotifications;

export const listAdminActivities = async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT n.id,n.payload,n.created_at,a.id AS audit_id,a.action,a.entity_type,a.entity_id
       FROM notification_outbox n
       LEFT JOIN operations_audit_log a ON a.id=CASE WHEN split_part(n.event_key,':',2) ~ '^[0-9]+$' THEN split_part(n.event_key,':',2)::bigint ELSE NULL END
       WHERE n.event_type='admin_activity' AND n.dismissed_at IS NULL ORDER BY n.created_at DESC LIMIT 200`,
    );
    res.json(result.rows);
  } catch (error) { next(error); }
};

const SAFE_METADATA_KEYS = new Set([
  "title", "previousTitle", "price", "previousPrice", "stock", "status", "previousStatus", "previousStock", "newStatus",
  "categoryId", "previousCategoryId", "driverId", "assignmentId", "attemptNumber", "collectionId", "orderId",
  "amount", "currency", "expectedAmount", "collectedAmount", "reportedAmount", "confirmedAmount",
  "previousFee", "newFee", "previousTotal", "newTotal", "inventoryReleased", "attachmentCount",
  "published", "count", "method", "reasonCode", "permissions", "archivedProductCount",
  "previousRole", "previousStaffStatus", "previousDriverStatus", "accountType", "previousPermissions",
]);

const safeMetadata = (metadata) => Object.fromEntries(Object.entries(metadata || {}).filter(([key]) => SAFE_METADATA_KEYS.has(key)));
const can = (staff, permission) => staff?.is_super_admin || staff?.permissions?.includes(permission);

export const getAdminActivityDetails = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: "A valid activity ID is required." });
    const result = await pool.query(
      `SELECT a.id,a.actor_id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,
              u.name AS actor_name
       FROM notification_outbox n
       JOIN operations_audit_log a ON a.id=CASE WHEN split_part(n.event_key,':',2) ~ '^[0-9]+$' THEN split_part(n.event_key,':',2)::bigint ELSE NULL END
       LEFT JOIN users u ON u.id=a.actor_id
       WHERE n.id=$1 AND n.event_type='admin_activity'`,
      [id],
    );
    const activity = result.rows[0];
    if (!activity) return res.status(404).json({ message: "Activity record not found." });
    const permissions = req.staff;
    const metadata = activity.metadata || {};
    let resourceUrl = null;
    const resourceId = encodeURIComponent(String(activity.entity_id));
    if (activity.entity_type === "order" && /^\d+$/.test(String(activity.entity_id)) && can(permissions, "view_orders")) resourceUrl = `/admin/orders/${resourceId}`;
    if (activity.entity_type === "refund" && can(permissions, "view_refunds")) resourceUrl = "/admin/refunds";
    if (activity.entity_type === "product" && /^\d+$/.test(String(activity.entity_id)) && can(permissions, "manage_products")) resourceUrl = `/admin/products/${resourceId}`;
    if (activity.entity_type === "category" && can(permissions, "manage_products")) resourceUrl = "/admin/category";
    if (activity.entity_type === "faq" && permissions?.is_super_admin) resourceUrl = "/admin/support";
    if (activity.entity_type === "customer" && (can(permissions, "manage_customers") || permissions?.is_super_admin)) resourceUrl = "/admin/customers";
    if (activity.entity_type === "user" && permissions?.is_super_admin) resourceUrl = "/admin/staff";
    if (activity.entity_type === "user" && metadata.accountType === "staff" && permissions?.is_super_admin) resourceUrl = "/admin/staff";
    return res.json({
      id: activity.id,
      actor: { id: activity.actor_id, name: activity.actor_name || "System" },
      action: activity.action,
      entity: { type: activity.entity_type, id: activity.entity_id },
      created_at: activity.created_at,
      details: safeMetadata(metadata),
      resource_url: resourceUrl,
    });
  } catch (error) { return next(error); }
};
