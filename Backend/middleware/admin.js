import dotenv from "dotenv";
dotenv.config();

const admin = async (req, res, next) => {
  if (req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "Staff access is required." });
  }
};

export default admin;
