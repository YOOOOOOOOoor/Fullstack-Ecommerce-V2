import express from "express";
import protect from "../middleware/auth.js";
import {
  showCart,
  TotalAmount,
  displayInfo,
  chapaPayment,
  verifyPayment,
  continueChapaPayment,
  checkoutOptions,
  codCheckout,
} from "../controllers/checkoutController.js";

const router = express.Router();

router.get("/total", protect, TotalAmount);
router.get("/options", protect, checkoutOptions);
router.get("/cart", protect, showCart);
router.post("/chapa", protect, chapaPayment);
router.post("/continue/:id", protect, continueChapaPayment);
router.post("/cod", protect, codCheckout);
router.get("/info", protect, displayInfo);
router.get("/verify/:tx_ref", protect, verifyPayment);

export default router;
