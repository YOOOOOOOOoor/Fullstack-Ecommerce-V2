import express from "express";

import {
  canReview,
  createReview,
  getProductReviews,
  updateReview,
  deleteReview,
} from "../controllers/reviewController.js";

import protect from "../middleware/auth.js";

const router = express.Router();

// Get all reviews for product
router.get("/:productId", getProductReviews);

// Check if user can review
router.get("/:productId/can-review", protect, canReview);

// Create review
router.post("/", protect, createReview);

// Update review
router.put("/:id", protect, updateReview);

// Delete review
router.delete("/:id", protect, deleteReview);

export default router;
