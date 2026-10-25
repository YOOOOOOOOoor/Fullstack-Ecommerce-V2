import pool from "../config/db.js";

export const hasStaffPermission = (staff, permission) => Boolean(
  staff && staff.status === "active" && (staff.is_super_admin || staff.permissions.includes(permission)),
);

export const requirePermission = (permission) => async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Staff access is required." });
    const result = await pool.query("SELECT status,is_super_admin,permissions FROM staff_profiles WHERE user_id=$1", [req.user.id]);
    const staff = result.rows[0];
    if (!staff || staff.status !== "active") return res.status(403).json({ message: "Active staff access is required." });
    req.staff = staff;
    if (hasStaffPermission(staff, permission)) return next();
    return res.status(403).json({ message: `The ${permission.replaceAll("_", " ")} permission is required.` });
  } catch (error) {
    next(error);
  }
};

export const requireAnyPermission = (...permissions) => async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Staff access is required." });
    const result = await pool.query("SELECT status,is_super_admin,permissions FROM staff_profiles WHERE user_id=$1", [req.user.id]);
    const staff = result.rows[0];
    if (!staff || staff.status !== "active") return res.status(403).json({ message: "Active staff access is required." });
    req.staff = staff;
    if (staff.is_super_admin || permissions.some((permission) => staff.permissions.includes(permission))) return next();
    return res.status(403).json({ message: `One of these permissions is required: ${permissions.join(", ")}.` });
  } catch (error) { next(error); }
};

export const createRequireSuperAdmin = ({ db = pool } = {}) => async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Super Admin access is required." });
    const result = await db.query("SELECT status,is_super_admin FROM staff_profiles WHERE user_id=$1", [req.user.id]);
    if (!result.rows[0] || result.rows[0].status !== "active" || !result.rows[0].is_super_admin) {
      return res.status(403).json({ message: "Only the active Super Admin can manage staff privileges." });
    }
    req.staff = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
};

export const requireSuperAdmin = createRequireSuperAdmin();
