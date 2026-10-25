import express from "express";

import protect from "../middleware/auth.js";
import admin from "../middleware/admin.js";
import { requireAnyPermission } from "../middleware/permissions.js";

import { exportAnalytics, getAnalytics } from "../controllers/TrueanalyticsController.js";

const router = express.Router();

router.get("/export", protect, admin, requireAnyPermission("view_reports"), exportAnalytics);
router.get("/", protect, admin, requireAnyPermission("view_reports", "view_dashboard"), getAnalytics);

export default router;
