import dotenv from "dotenv";
import jwt from "jsonwebtoken";
dotenv.config();
import pool from "../config/db.js";

const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ msg: "Not authorized, no token" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await pool.query("select * from users where id=$1", [
      decoded.id,
    ]);
    if (user.rows.length === 0) {
      return res.status(401).json({ msg: "Not authorized, user not found" });
    }
    req.user = user.rows[0];
    next();
  } catch (error) {
    res.status(401).json({ msg: "Not authorized, token failed" });
  }
};

export default protect;
