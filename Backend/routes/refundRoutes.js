import express from "express";
import protect from "../middleware/auth.js";
import adminOnly from "../middleware/admin.js";
import { requirePermission } from "../middleware/permissions.js";
import upload from "../middleware/refundUpload.js";
import {
  completeRefund,
  createRefundRequest,
  listRefundRequests,
  inspectRefundReturn,
  recordRefundFailure,
  reviewRefundRequest,
} from "../controllers/refundController.js";

const router = express.Router();
router.post("/:orderId", protect, upload.array("photos", 3), createRefundRequest);
router.get("/admin", protect, adminOnly, requirePermission("view_refunds"), listRefundRequests);
router.patch("/:id/review", protect, adminOnly, requirePermission("approve_refunds"), reviewRefundRequest);
router.post("/:id/inspection", protect, adminOnly, requirePermission("approve_refunds"), inspectRefundReturn);
router.post("/:id/complete", protect, adminOnly, requirePermission("approve_refunds"), completeRefund);
router.post("/:id/failure", protect, adminOnly, requirePermission("approve_refunds"), recordRefundFailure);

export default router;
