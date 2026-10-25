import express from "express";
import protect from "../middleware/auth.js";
import adminOnly from "../middleware/admin.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissions.js";
import {
  assignDelivery,
  getDeliveryHistory,
  getDriverHistory,
  listDrivers,
  markDeliveryException,
  promoteCustomerToDriver,
  reconcileCodCollection,
  updateDriverStatus,
} from "../controllers/adminDeliveryController.js";

const router = express.Router();
router.use(protect, adminOnly);
router.get("/drivers", requireAnyPermission("assign_drivers", "view_delivery_history"), listDrivers);
router.get("/drivers/:userId/history", requirePermission("view_delivery_history"), getDriverHistory);
router.post("/drivers/:userId/promote", requirePermission("assign_drivers"), promoteCustomerToDriver);
router.patch("/drivers/:userId/status", requirePermission("assign_drivers"), updateDriverStatus);
router.post("/orders/:orderId/assign", requirePermission("assign_drivers"), assignDelivery);
router.get("/orders/:orderId/history", requirePermission("view_delivery_history"), getDeliveryHistory);
router.post("/orders/:orderId/delivery-exception", requirePermission("approve_delivery_exceptions"), markDeliveryException);
router.post("/collections/:collectionId/reconcile", requirePermission("reconcile_cod"), reconcileCodCollection);

export default router;
