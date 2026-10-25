import express from "express";
import dotenv from "dotenv";
import protect from "../middleware/auth.js";
import admin from "../middleware/admin.js";
import { requirePermission } from "../middleware/permissions.js";
import {
  Add,
  Edit,
  getAll,
  Delete,
  One,
} from "../controllers/categoryControllers.js";

dotenv.config();

const router = express.Router();

router.post("/", protect, admin, requirePermission("manage_products"), Add);
router.get("/", getAll);
router.get("/:id", One);
router.put("/:id", protect, admin, requirePermission("manage_products"), Edit);
router.delete("/:id", protect, admin, requirePermission("manage_products"), Delete);

export default router;
