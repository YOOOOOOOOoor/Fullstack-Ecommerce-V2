import express from "express";
import protect from "../middleware/auth.js";
import adminOnly from "../middleware/admin.js";
import { requirePermission } from "../middleware/permissions.js";
import { dismissAllNotifications, dismissNotification, listAdminActivities, getAdminActivityDetails } from "../controllers/notificationController.js";

const router = express.Router();
router.get("/activities", protect, adminOnly, requirePermission("view_notifications"), listAdminActivities);
router.get("/activities/:id", protect, adminOnly, requirePermission("view_notifications"), getAdminActivityDetails);
router.patch("/:id/dismiss", protect, adminOnly, requirePermission("view_notifications"), dismissNotification);
router.post("/dismiss-all", protect, adminOnly, requirePermission("view_notifications"), dismissAllNotifications);
export default router;
