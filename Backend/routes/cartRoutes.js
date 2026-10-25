import express from "express";
import dotenv from "dotenv";
import protect from "../middleware/auth.js";

import {
  createCart,
  showCart,
  deleteCart,
  editProuct,
  ALLCART,
} from "../controllers/cartContollers.js";

dotenv.config();

const router = express.Router();

router.post("/", protect, createCart);
router.get("/", protect, showCart);
router.delete("/:product_id", protect, deleteCart);
router.patch("/:product_id", protect, editProuct);
router.get("/all", protect, ALLCART);

export default router;
