import pool from "../config/db.js";

export const createDriverOnly = ({ db = pool } = {}) => async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT status FROM driver_profiles WHERE user_id=$1`,
      [req.user.id],
    );
    if (!result.rows.length || result.rows[0].status !== "active") {
      return res.status(403).json({ message: "Active driver access is required." });
    }
    req.driverStatus = result.rows[0].status;
    next();
  } catch (error) {
    next(error);
  }
};

const driverOnly = createDriverOnly();
export default driverOnly;
