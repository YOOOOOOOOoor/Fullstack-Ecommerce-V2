import express from "express";
import pool from "../config/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";

dotenv.config();

const router = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const DEFAULT_AVATAR =
  "https://res.cloudinary.com/xqjlg4ei/image/upload/v1782918066/Sample_User_Icon_yqt0wv.png";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 24 * 60 * 60 * 1000 * 5, // 5 days
  // partitioned: process.env.NODE_ENV === "production",
};

const clearCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
};

const tokenGenerate = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "5d" });
};

//register
export const register = async (req, res, next) => {
  const { name, email, password, phone, avatar } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ msg: "Please fill all the fields" });
  }

  const checkUser = await pool.query("Select * from users where email=$1", [
    email,
  ]);
  if (checkUser.rows.length > 0) {
    return res.status(400).json({ msg: "User already exists" });
  }
  const hashPass = await bcrypt.hash(password, 10);
  const user = await pool.query(
    `
  INSERT INTO users
  (name,email,password,phone,avatar,provider)
  VALUES ($1,$2,$3,$4,$5,$6)
  RETURNING id,name,email,phone,avatar,role
  `,
    [
      name,
      email.toLowerCase().trim(),
      hashPass,
      phone,
      avatar || DEFAULT_AVATAR,
      "local",
    ],
  );

  const token = tokenGenerate(user.rows[0].id, user.rows[0].role);
  res.cookie("token", token, cookieOptions);
  res.status(201).json({
    msg: "User registered successfully",
    user: {
      name: user.rows[0].name,
      email: user.rows[0].email,
      phone: user.rows[0].phone,
      avatar: user.rows[0].avatar,
      role: user.rows[0].role,
    },
  });
};

//login
export const login = async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ msg: "Please fill all the fields" });
  }
  const checkEmail = await pool.query("select * from users where email=$1", [
    email.toLowerCase().trim(),
  ]);
  if (checkEmail.rows.length === 0) {
    return res.status(400).json({ msg: "Invalid credentials" });
  }
  const user = checkEmail.rows[0];
  if (user.provider === "google") {
    return res.status(400).json({
      msg: "This account uses Google. Please continue with Google.",
    });
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ msg: "Invalid credentials" });
  }
  const token = tokenGenerate(user.id, user.role);
  const driverProfile = await pool.query("SELECT status FROM driver_profiles WHERE user_id=$1", [user.id]);
  const staffProfile = await pool.query("SELECT status,is_super_admin,permissions FROM staff_profiles WHERE user_id=$1", [user.id]);
  res.cookie("token", token, cookieOptions);
  res.status(200).json({
    msg: "User logged in successfully",
    user: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
      id: user.id,
      driver_status: driverProfile.rows[0]?.status || null,
      staff_status: staffProfile.rows[0]?.status || null,
      is_super_admin: staffProfile.rows[0]?.is_super_admin || false,
      permissions: staffProfile.rows[0]?.permissions || [],
    },
  });
};

//me
export const me = async (req, res, next) => {
  try {
    const driverProfile = await pool.query("SELECT status FROM driver_profiles WHERE user_id=$1", [req.user.id]);
    const staffProfile = await pool.query("SELECT status,is_super_admin,permissions FROM staff_profiles WHERE user_id=$1", [req.user.id]);
    res.status(200).json({
      msg: "User logged in successfully",
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        avatar: req.user.avatar,
        role: req.user.role,
        staff_status: staffProfile.rows[0]?.status || null,
        is_super_admin: staffProfile.rows[0]?.is_super_admin || false,
        permissions: staffProfile.rows[0]?.permissions || [],
        driver_status: driverProfile.rows[0]?.status || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

//logout
export const logout = async (req, res, next) => {
  res.clearCookie("token", clearCookieOptions);
  res.status(200).json({ msg: "User logged out successfully" });
};

// google login/register
export const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        msg: "Google token is required",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const { email, name, picture } = payload;

    let userResult = await pool.query("SELECT * FROM users WHERE email=$1", [
      email.toLowerCase().trim(),
    ]);

    let user;

    // user exists
    if (userResult.rows.length > 0) {
      user = userResult.rows[0];

      if (user.provider === "local") {
        return res.status(400).json({
          msg: "An account already exists with this email. Please use email login.",
        });
      }
    } else {
      // create google user

      const newUser = await pool.query(
        `
        INSERT INTO users
        (
          name,
          email,
          password,
          avatar,
          provider
        )
        VALUES
        ($1,$2,$3,$4,$5)
        RETURNING id,name,email,phone,avatar,role
        `,
        [
          name,
          email.toLowerCase().trim(),
          null,
          picture || DEFAULT_AVATAR,
          "google",
        ],
      );

      user = newUser.rows[0];
    }

    const jwtToken = tokenGenerate(user.id, user.role);
    const driverProfile = await pool.query("SELECT status FROM driver_profiles WHERE user_id=$1", [user.id]);
    const staffProfile = await pool.query("SELECT status,is_super_admin,permissions FROM staff_profiles WHERE user_id=$1", [user.id]);

    res.cookie("token", jwtToken, cookieOptions);

    res.status(200).json({
      msg: "Google login successful",
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        role: user.role,
        id: user.id,
        driver_status: driverProfile.rows[0]?.status || null,
        staff_status: staffProfile.rows[0]?.status || null,
        is_super_admin: staffProfile.rows[0]?.is_super_admin || false,
        permissions: staffProfile.rows[0]?.permissions || [],
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      msg: "Google authentication failed",
    });
  }
};
