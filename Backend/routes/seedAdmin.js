import pool from "../config/db.js";
import bcrypt from "bcryptjs";

const seedAdmin = async () => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  // Provisioning is opt-in; never create or log a known default credential.
  if (!email || !password) return;
  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters long");
  }

  let result = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
  if (!result.rows.length) {
    const hashedPassword = await bcrypt.hash(password, 12);
    result = await pool.query(
      "INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4) RETURNING id",
      ["Admin", email, hashedPassword, "admin"],
    );
    console.log("Initial admin account provisioned from environment configuration.");
  }
  await pool.query(
    `INSERT INTO staff_profiles(user_id,is_super_admin)
     SELECT $1,NOT EXISTS(SELECT 1 FROM staff_profiles WHERE is_super_admin)
     ON CONFLICT(user_id) DO NOTHING`,
    [result.rows[0].id],
  );
};

export default seedAdmin;
