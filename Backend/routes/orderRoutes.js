import express from "express";
import protect from "../middleware/auth.js";
import Admin from "../middleware/admin.js";
import { requirePermission } from "../middleware/permissions.js";
import {
  getOrderAdmin,
  getOrdersAdmin,
  getOrders,
  getOrder,
  updateOrderStatus,
  cancelCustomerOrder,
} from "../controllers/orderController.js";

const router = express.Router();

router.get("/", protect, getOrders);
router.get("/:id", protect, getOrder);
router.post("/:id/cancel", protect, cancelCustomerOrder);
router.get("/admin/orders/:id", protect, Admin, requirePermission("view_orders"), getOrderAdmin);
router.get("/admin/orders/", protect, Admin, requirePermission("view_orders"), getOrdersAdmin);
router.patch("/admin/orders/:id", protect, Admin, requirePermission("prepare_orders"), updateOrderStatus);

export default router;
