import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import cloudinary from "../config/cloudinary.js";

export const edit = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { name, email, phone } = req.body;

    const { currentPassword, newPassword } = req.body;

    const checkUser = await pool.query(`select * from users where id=$1`, [
      user_id,
    ]);
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = checkUser.rows[0];
    const updatedName = name ?? user.name;
    const updatedEmail = email ? email.toLowerCase().trim() : user.email;
    const updatedPhone = phone ?? user.phone;
    const existingEmail = await pool.query(
      `SELECT id FROM users
   WHERE email = $1
   AND id != $2`,
      [updatedEmail, user_id],
    );

    if (existingEmail.rows.length > 0) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }
    let hashedPassword = user.password;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          message: "Current password is required",
        });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);

      if (!isMatch) {
        return res.status(400).json({
          message: "Invalid current password",
        });
      }

      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    let avatar = user.avatar;
    let avatar_public_id = user.avatar_public_id;

    if (req.file) {
      if (user.avatar_public_id) {
        await cloudinary.uploader.destroy(user.avatar_public_id);
      }

      avatar = req.file.path;
      avatar_public_id = req.file.filename;
    }
    const result = await pool.query(
      `
   update users 
set 
name=$1,
email=$2,
password=$3,
phone=$4,
avatar=$5,
avatar_public_id=$6
where id=$7
RETURNING id, name, email, phone, avatar`,
      [
        updatedName,
        updatedEmail,
        hashedPassword,
        updatedPhone,
        avatar,
        avatar_public_id,
        user_id,
      ],
    );
    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

export const get = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const result = await pool.query(
      `select id,name,email,phone,avatar from users where id=$1`,
      [user_id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};
