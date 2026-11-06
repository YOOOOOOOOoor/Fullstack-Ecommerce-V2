import express from "express";

import protect from "../middleware/auth.js";
import admin from "../middleware/admin.js";
import { requireAnyPermission } from "../middleware/permissions.js";
import rateLimit from "express-rate-limit";

import { exportAnalytics, getAnalytics, getVisitorStatistics } from "../controllers/TrueanalyticsController.js";
import { trackVisitorEvent } from "../controllers/visitorAnalyticsController.js";

const router = express.Router();

const visitorEventLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { message: "Visitor tracking limit reached. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/export", protect, admin, requireAnyPermission("view_reports"), exportAnalytics);
router.post("/events", visitorEventLimiter, trackVisitorEvent);
router.get("/visitors", protect, admin, requireAnyPermission("view_reports"), getVisitorStatistics);
router.get("/", protect, admin, requireAnyPermission("view_reports", "view_dashboard"), getAnalytics);

export default router;
