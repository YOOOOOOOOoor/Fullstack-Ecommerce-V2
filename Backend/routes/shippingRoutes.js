import express from "express";
import protect from "../middleware/auth.js";
import { requirePermission, requireSuperAdmin } from "../middleware/permissions.js";
import { getShippingConfig, overrideOrderShippingFee, updateShippingConfig } from "../controllers/shippingController.js";

const router = express.Router();
router.get("/default", protect, requireSuperAdmin, getShippingConfig);
router.put("/default", protect, requireSuperAdmin, updateShippingConfig);
router.patch("/orders/:orderId", protect, requirePermission("override_shipping"), overrideOrderShippingFee);
export default router;
