import pool from "../config/db.js";

export const add = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { product_id } = req.body;

    await pool.query(
      `insert into wishlists(user_id) values($1) on conflict (user_id) do nothing`,
      [user_id],
    );

    // 2. Get user's cart id
    const wishlist = await pool.query(
      `SELECT id FROM wishlists
        WHERE user_id = $1`,
      [user_id],
    );

    const wishlistsId = wishlist.rows[0].id;

    await pool.query(
      `INSERT INTO wishlist_items (wishlist_id, product_id)
        VALUES ($1, $2)
        ON CONFLICT (wishlist_id, product_id)
        DO NOTHING`,
      [wishlistsId, product_id],
    );

    res.status(201).json({
      message: "Product added to wishlists",
    });
  } catch (error) {
    next(error);
  }
};

export const show = async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const wishlist = await pool.query(
      `SELECT id FROM wishlists
        WHERE user_id = $1`,
      [user_id],
    );

    if (wishlist.rows.length === 0) {
      return res.status(200).json([]);
    }

    const wishlistsId = wishlist.rows[0].id;

    const wishlistsItems = await pool.query(
      `SELECT wishlist_items.id, products.stock,products.id AS product_id,   products.title, products.description, products.price, products.image_url
        FROM wishlist_items
        JOIN products ON wishlist_items.product_id = products.id
        WHERE wishlist_items.wishlist_id = $1 ORDER BY wishlist_items.id ASC`,
      [wishlistsId],
    );

    if (wishlistsItems.rows.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(wishlistsItems.rows);
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { product_id } = req.params;

    const wishlist = await pool.query(
      `SELECT id FROM wishlists
        WHERE user_id = $1`,
      [user_id],
    );

    const wishlist_id = wishlist.rows[0].id;

    await pool.query(
      `DELETE FROM wishlist_items
        WHERE wishlist_id = $1 AND product_id = $2`,
      [wishlist_id, product_id],
    );

    res.json({ message: "Product removed from wishlists" });
  } catch (error) {
    next(error);
  }
};
