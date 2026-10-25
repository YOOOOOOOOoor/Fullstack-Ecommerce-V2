import express from "express";
import protect from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/permissions.js";
import { createStaff, listStaff, updateStaff } from "../controllers/staffController.js";

const router = express.Router();
router.use(protect, requireSuperAdmin);
router.get("/", listStaff);
router.post("/:userId", createStaff);
router.put("/:userId", updateStaff);
export default router;
