import express from "express";

import protect from "../middleware/auth.js";
import { show, add, remove } from "../controllers/wishlistController.js";

const router = express.Router();

router.get("/", protect, show);
router.post("/", protect, add);
router.delete("/:product_id", protect, remove);

export default router;
