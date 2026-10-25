import express from "express";

import { edit, get } from "../controllers/settingsController.js";

import protect from "../middleware/auth.js";
import upload from "../middleware/upload.js";

const router = express.Router();

router.put("/", protect, upload.single("avatar"), edit);
router.get("/", protect, get);

export default router;
