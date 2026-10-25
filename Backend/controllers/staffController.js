import pool from "../config/db.js";
import { writeAudit } from "../services/audit.js";

export const STAFF_PERMISSIONS = Object.freeze([
  "view_dashboard", "view_orders", "prepare_orders", "assign_drivers", "view_delivery_history",
  "reconcile_cod", "view_refunds", "approve_refunds", "approve_refund_exceptions", "approve_delivery_exceptions",
  "override_shipping", "view_reports", "view_notifications", "manage_products", "manage_customers",
]);

export const listStaff = async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id,u.name,u.email,u.created_at,sp.status,sp.is_super_admin,sp.permissions,sp.updated_at
       FROM users u LEFT JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.role='admin'
       ORDER BY sp.is_super_admin DESC NULLS LAST,u.created_at`,
    );
    res.json({ permissions: STAFF_PERMISSIONS, staff: result.rows });
  } catch (error) { next(error); }
};

export const createStaff = async (req, res, next) => {
  const reason = String(req.body.reason || "").trim();
  if (!req.staff?.is_super_admin && reason.length < 5) return res.status(400).json({ message: "Provide a staff appointment reason of at least five characters." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT id,role FROM users WHERE id=$1 FOR UPDATE", [req.params.userId]);
    if (!user.rows.length || user.rows[0].role === "admin") {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Choose an existing non-admin account that does not already have staff access." });
    }
    await client.query("UPDATE users SET role='admin',updated_at=NOW() WHERE id=$1", [req.params.userId]);
    const profile = await client.query(
      `INSERT INTO staff_profiles(user_id,permissions,updated_by) VALUES($1,'[]'::jsonb,$2)
       ON CONFLICT(user_id) DO UPDATE SET status='active',permissions='[]'::jsonb,updated_by=$2,updated_at=NOW()
       RETURNING user_id,status,permissions`,
      [req.params.userId, req.user.id],
    );
    await writeAudit(client, req.user.id, "staff.created", "user", req.params.userId, { reason: reason || null });
    await client.query("COMMIT");
    res.status(201).json(profile.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
};

export const updateStaff = async (req, res, next) => {
  const { status, permissions } = req.body;
  const reason = String(req.body.reason || "").trim();
  if (!Array.isArray(permissions) || permissions.some((permission) => !STAFF_PERMISSIONS.includes(permission)) || !["active", "suspended", "deactivated"].includes(status) || (!req.staff?.is_super_admin && reason.length < 5)) {
    return res.status(400).json({ message: "Choose valid permissions and status and provide a reason of at least five characters." });
  }
  if (Number(req.params.userId) === req.user.id) return res.status(400).json({ message: "You cannot change your own staff permissions or status." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT is_super_admin FROM staff_profiles WHERE user_id=$1 FOR UPDATE", [req.params.userId]);
    if (!result.rows.length || result.rows[0].is_super_admin) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Staff account not found." });
    }
    const updated = await client.query(
      `UPDATE staff_profiles SET status=$1,permissions=$2::jsonb,updated_by=$3,updated_at=NOW()
       WHERE user_id=$4 RETURNING user_id,status,permissions,updated_at`,
      [status, JSON.stringify([...new Set(permissions)]), req.user.id, req.params.userId],
    );
    await writeAudit(client, req.user.id, "staff.permissions_updated", "user", req.params.userId, { status, permissions: [...new Set(permissions)], reason: reason || null });
    await client.query("COMMIT");
    res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
};
