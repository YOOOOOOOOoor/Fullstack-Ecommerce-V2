import pool from "../config/db.js";

// Check if user can review product
export const canReview = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { productId } = req.params;

    // Check if user bought and received the product
    const purchased = await pool.query(
      `
      SELECT 1
      FROM orders o
      JOIN order_items oi
      ON oi.order_id = o.id

      WHERE 
        o.user_id = $1
        AND oi.product_id = $2
        AND o.order_status = 'delivered'

      LIMIT 1
      `,
      [user_id, productId],
    );

    // Check if already reviewed
    const reviewed = await pool.query(
      `
      SELECT 1
      FROM reviews

      WHERE 
        user_id=$1
        AND product_id=$2

      LIMIT 1
      `,
      [user_id, productId],
    );

    res.status(200).json({
      canReview: purchased.rows.length > 0 && reviewed.rows.length === 0,

      hasReviewed: reviewed.rows.length > 0,
    });
  } catch (error) {
    next(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Create review
export const createReview = async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const { product_id, rating, title, comment } = req.body;

    // Validation

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5",
      });
    }

    if (!comment) {
      return res.status(400).json({
        message: "Comment is required",
      });
    }

    // Check purchase

    const purchased = await pool.query(
      `
SELECT 1
FROM orders o

JOIN order_items oi
ON oi.order_id=o.id

WHERE
o.user_id=$1
AND oi.product_id=$2
AND o.order_status='delivered'

LIMIT 1
`,
      [user_id, product_id],
    );

    if (purchased.rows.length === 0) {
      return res.status(403).json({
        message: "You can only review products you purchased",
      });
    }

    // Insert review

    const review = await pool.query(
      `
INSERT INTO reviews
(
user_id,
product_id,
rating,
title,
comment
)

VALUES
($1,$2,$3,$4,$5)

RETURNING *
`,
      [user_id, product_id, rating, title, comment],
    );

    res.status(201).json({
      message: "Review created successfully",

      review: review.rows[0],
    });
  } catch (error) {
    next(error);

    // duplicate review error

    if (error.code === "23505") {
      return res.status(409).json({
        message: "You already reviewed this product",
      });
    }

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Get product reviews
export const getProductReviews = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const reviews = await pool.query(
      `
SELECT

r.id,
r.user_id,
r.rating,
r.title,
r.comment,
r.created_at,
r.updated_at,

u.name,
u.avatar


FROM reviews r

JOIN users u
ON r.user_id=u.id


WHERE r.product_id=$1


ORDER BY r.created_at DESC

`,
      [productId],
    );

    const stats = await pool.query(
      `
SELECT

COALESCE(
ROUND(AVG(rating),1),
0
) AS average_rating,

COUNT(*) AS total_reviews


FROM reviews

WHERE product_id=$1

`,
      [productId],
    );

    res.json({
      average_rating: Number(stats.rows[0].average_rating),

      total_reviews: Number(stats.rows[0].total_reviews),

      reviews: reviews.rows,
    });
  } catch (error) {
    next(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Update review
export const updateReview = async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const { id } = req.params;

    const { rating, title, comment } = req.body;

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        message: "Invalid rating",
      });
    }

    const result = await pool.query(
      `
UPDATE reviews

SET

rating=$1,
title=$2,
comment=$3,
updated_at=NOW()


WHERE
id=$4
AND user_id=$5


RETURNING *

`,
      [rating, title, comment, id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Review not found",
      });
    }

    res.json({
      message: "Review updated",

      review: result.rows[0],
    });
  } catch (error) {
    next(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Delete review
export const deleteReview = async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const { id } = req.params;

    const result = await pool.query(
      `
DELETE FROM reviews

WHERE
id=$1
AND user_id=$2


RETURNING id

`,
      [id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Review not found",
      });
    }

    res.json({
      message: "Review deleted",
    });
  } catch (error) {
    next(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
