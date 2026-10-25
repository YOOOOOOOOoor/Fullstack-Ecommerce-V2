import express from "express";
import protect from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/permissions.js";
import { createFaq, deleteFaq, getPublicSupport, getSupportManagement, reorderFaqs, updateFaq, updateSupportContact } from "../controllers/supportController.js";

const router = express.Router();
router.get("/", getPublicSupport);
router.get("/manage", protect, requireSuperAdmin, getSupportManagement);
router.post("/faqs", protect, requireSuperAdmin, createFaq);
router.put("/faqs/reorder", protect, requireSuperAdmin, reorderFaqs);
router.put("/faqs/:id", protect, requireSuperAdmin, updateFaq);
router.delete("/faqs/:id", protect, requireSuperAdmin, deleteFaq);
router.put("/contact", protect, requireSuperAdmin, updateSupportContact);
export default router;
