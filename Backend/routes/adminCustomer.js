import express from "express";

import {
  getCustomers,
  createUpdateAccountTypeHandler,
  deleteUser,
} from "../controllers/adminCustomerController.js";

import protect from "../middleware/auth.js";
import adminOnly from "../middleware/admin.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireSuperAdmin } from "../middleware/permissions.js";

const router = express.Router();

router.use(protect, adminOnly, requirePermission("manage_customers"));

router.get("/", getCustomers);

router.put("/:id/account-type", requireSuperAdmin, createUpdateAccountTypeHandler());

router.delete("/:id", deleteUser);

export default router;
