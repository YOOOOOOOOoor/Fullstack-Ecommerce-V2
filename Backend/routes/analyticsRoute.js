import express from "express";

import protect from "../middleware/auth.js";
import admin from "../middleware/admin.js";
import { requireAnyPermission } from "../middleware/permissions.js";

import {
  getDashboardStats,
  getLowStockProducts,
  getRecentOrders,
  getRevenue,
  getRevenueChart,
} from "../controllers/analyticsController.js";

const router = express.Router();

router.get("/stats", protect, admin, requireAnyPermission("view_dashboard"), getDashboardStats);

router.get("/revenue", protect, admin, requireAnyPermission("view_dashboard"), getRevenue);

router.get("/low-stock", protect, admin, requireAnyPermission("view_dashboard"), getLowStockProducts);

router.get("/recent-orders", protect, admin, requireAnyPermission("view_dashboard"), getRecentOrders);

router.get("/revenue-chart", protect, admin, requireAnyPermission("view_dashboard"), getRevenueChart);

export default router;
