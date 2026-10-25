import pool from "../config/db.js";
import { writeAudit } from "../services/audit.js";
import { STAFF_PERMISSIONS } from "./staffController.js";

export const getCustomers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 8;

    const search = req.query.search || "";

    const role = req.query.role || "all";

    const offset = (page - 1) * limit;

    let queryParams = [`%${search}%`];

    let roleFilter = "";

    if (role !== "all") {
      roleFilter = `
        AND u.role=$2
      `;

      queryParams.push(role);
    }

    const customers = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.avatar,
        u.role,
        u.created_at,
        dp.status AS driver_status,
        dp.promoted_at,
        sp.status AS staff_status,
        sp.is_super_admin,
        sp.permissions,
        CASE WHEN sp.is_super_admin THEN 'super_admin'
             WHEN sp.status='active' THEN 'staff'
             WHEN dp.status='active' THEN 'driver'
             ELSE 'customer' END AS account_type

      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id=u.id
      LEFT JOIN staff_profiles sp ON sp.user_id=u.id

      WHERE
        (
          u.name ILIKE $1
          OR u.email ILIKE $1
        )

      ${roleFilter}

      ORDER BY u.created_at DESC

      LIMIT $${queryParams.length + 1}

      OFFSET $${queryParams.length + 2}

      `,
      [...queryParams, limit, offset],
    );

    const total = await pool.query(
      `
      SELECT COUNT(*)

      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id=u.id
      LEFT JOIN staff_profiles sp ON sp.user_id=u.id

      WHERE
        (
          u.name ILIKE $1
          OR u.email ILIKE $1
        )

      ${roleFilter}

      `,
      queryParams,
    );

    res.json({
      users: customers.rows,

      total: Number(total.rows[0].count),

      page,

      pages: Math.ceil(Number(total.rows[0].count) / limit),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

export const createUpdateAccountTypeHandler = ({ db = pool, auditWriter = writeAudit } = {}) => async (req, res, next) => {
  const { id } = req.params;
  const { type, permissions } = req.body;
  const reason = String(req.body.reason || "").trim();
  if (!["customer", "driver", "staff"].includes(type) || (!req.staff?.is_super_admin && reason.length < 5)) {
    return res.status(400).json({ message: "Choose Customer, Driver, or Staff and provide a reason of at least five characters." });
  }
  if (type === "staff" && (!Array.isArray(permissions) || permissions.length === 0 || permissions.some((permission) => !STAFF_PERMISSIONS.includes(permission)))) {
    return res.status(400).json({ message: "Select one or more valid staff permissions." });
  }
  if (Number(id) === req.user.id) return res.status(400).json({ message: "You cannot change your own account type." });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query(
      `SELECT u.id,u.role,u.email,sp.status AS staff_status,sp.is_super_admin,sp.permissions,
              dp.status AS driver_status
       FROM users u LEFT JOIN staff_profiles sp ON sp.user_id=u.id
       LEFT JOIN driver_profiles dp ON dp.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u`,
      [id],
    );
    if (!target.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Account not found." });
    }
    const current = target.rows[0];
    if (current.email.toLowerCase() === "admin@example.com" || current.is_super_admin) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "The Super Admin account is protected from customer account management." });
    }
    if (current.id === req.user.id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "You cannot change your own account type." });
    }

    if (current.driver_status === "active" && type !== "driver") {
      const assignments = await client.query("SELECT 1 FROM delivery_assignments WHERE driver_id=$1 AND unassigned_at IS NULL LIMIT 1 FOR UPDATE", [id]);
      if (assignments.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Reassign or close this driver's active delivery before changing their account type." });
      }
    }

    const nextRole = type === "staff" ? "admin" : "customer";
    await client.query("UPDATE users SET role=$1,updated_at=NOW() WHERE id=$2", [nextRole, id]);
    if (type === "driver") {
      if (current.driver_status === "revoked") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "This driver was permanently offboarded and cannot be reactivated." });
      }
      await client.query(
        `INSERT INTO driver_profiles(user_id,promoted_by,status) VALUES($1,$2,'active')
         ON CONFLICT(user_id) DO UPDATE SET status='active',updated_at=NOW()`,
        [id, req.user.id],
      );
      if (current.staff_status) await client.query("UPDATE staff_profiles SET status='deactivated',permissions='[]'::jsonb,updated_by=$1,updated_at=NOW() WHERE user_id=$2", [req.user.id, id]);
    } else {
      if (current.driver_status && current.driver_status !== "revoked") await client.query("UPDATE driver_profiles SET status='suspended',updated_at=NOW() WHERE user_id=$1", [id]);
      if (type === "staff") {
        await client.query(
          `INSERT INTO staff_profiles(user_id,status,is_super_admin,permissions,updated_by,updated_at)
           VALUES($1,'active',FALSE,$2::jsonb,$3,NOW())
           ON CONFLICT(user_id) DO UPDATE SET status='active',is_super_admin=FALSE,permissions=EXCLUDED.permissions,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
          [id, JSON.stringify([...new Set(permissions)]), req.user.id],
        );
      } else if (current.staff_status) {
        await client.query("UPDATE staff_profiles SET status='deactivated',is_super_admin=FALSE,permissions='[]'::jsonb,updated_by=$1,updated_at=NOW() WHERE user_id=$2", [req.user.id, id]);
      }
    }
    const selectedPermissions = type === "staff" ? [...new Set(permissions)] : [];
    await auditWriter(client, req.user.id, "customer.account_type_changed", "customer", id, {
      previousRole: current.role,
      previousStaffStatus: current.staff_status || null,
      previousDriverStatus: current.driver_status || null,
      previousPermissions: current.permissions || [],
      accountType: type,
      permissions: selectedPermissions,
      reason: reason || null,
    });
    await client.query("COMMIT");
    return res.json({ message: `Account updated to ${type}.`, type, permissions: selectedPermissions });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === req.user.id) {
      return res.status(400).json({
        message: "You cannot delete your own account.",
      });
    }

    const driver = await pool.query("SELECT 1 FROM driver_profiles WHERE user_id=$1", [id]);
    if (driver.rows.length) {
      return res.status(409).json({
        message: "Driver accounts must be offboarded from Driver Management. The user and delivery history cannot be deleted.",
      });
    }
    const staff = await pool.query("SELECT 1 FROM staff_profiles WHERE user_id=$1", [id]);
    if (staff.rows.length) {
      return res.status(409).json({ message: "Staff accounts must be deactivated through Super Admin staff controls." });
    }

    const deleted = await pool.query(
      `
      DELETE FROM users
      WHERE id=$1
      RETURNING *
      `,
      [id],
    );

    if (deleted.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      message: "User deleted successfully.",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
