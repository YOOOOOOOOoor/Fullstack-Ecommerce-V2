import express from "express";
import dotenv from "dotenv";
import pool from "../config/db.js";
import { getShippingFee } from "../services/checkoutConfig.js";

dotenv.config();

//creating one
export const createCart = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { product_id, quantity } = req.body;

    // 1. Create cart if it doesn't exist
    await pool.query(
      `INSERT INTO carts (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING`,
      [user_id],
    );

    // 2. Get user's cart id
    const cart = await pool.query(
      `SELECT id FROM carts
        WHERE user_id = $1`,
      [user_id],
    );

    const cart_id = cart.rows[0].id;

    //stocks

    const product = await pool.query(
      `
      select stock from products where products.id=$1`,
      [product_id],
    );

    const stock = product.rows[0].stock;

    const cart_item = await pool.query(
      `select quantity from cart_items where cart_id=$1 and product_id=$2`,
      [cart_id, product_id],
    );

    const currentQ = cart_item.rows.length > 0 ? cart_item.rows[0].quantity : 0;

    if (currentQ + quantity > stock) {
      return res.status(400).json({
        message: `You can only add up to ${stock} of this product to your cart`,
      });
    }

    // 3. Add product to cart_items

    await pool.query(
      `INSERT INTO cart_items (cart_id, product_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (cart_id, product_id)
        DO UPDATE SET quantity = cart_items.quantity + $3`,
      [cart_id, product_id, quantity],
    );

    res.status(201).json({
      message: "Product added to cart",
    });
  } catch (error) {
    next(error);
    res.status(500).json({
      message: "Server error",
    });
  }
};

//Showing
export const showCart = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    // 1. Get user's cart id
    const cart = await pool.query(
      `SELECT id FROM carts
        WHERE user_id = $1`,
      [user_id],
    );

    if (cart.rows.length === 0) return res.status(200).json({ total: 0, subtotal: 0, shipping_fee: null, payable_total: null, shipping_configured: false });
    const cart_id = cart.rows[0].id;

    // 2. Get cart items
    const cartItems = await pool.query(
      `SELECT cart_items.id, cart_items.quantity,products.stock,products.id AS product_id,   products.title, products.description, products.price, products.image_url
        FROM cart_items
        JOIN products ON cart_items.product_id = products.id
        WHERE cart_items.cart_id = $1 ORDER BY cart_items.id ASC`,
      [cart_id],
    );
    if (cartItems.rows.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(cartItems.rows);
  } catch (error) {
    next(error);
  }
};

//delete

export const deleteCart = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { product_id } = req.params;

    const cart = await pool.query(
      `SELECT id FROM carts
        WHERE user_id = $1`,
      [user_id],
    );
    const cart_id = cart.rows[0].id;

    await pool.query(
      `DELETE FROM cart_items
        WHERE cart_id = $1 AND product_id = $2`,
      [cart_id, product_id],
    );

    res.status(200).json({
      message: "Product removed from cart",
    });
  } catch (error) {
    next(error);
  }
};

//edit

export const editProuct = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { product_id } = req.params;
    const { quantity } = req.body;

    const cart = await pool.query(
      `
      select id from carts where user_id=$1`,
      [user_id],
    );

    const cart_id = cart.rows[0].id;

    const product = await pool.query(
      `
      select stock from products where id=$1`,
      [product_id],
    );

    const stock = product.rows[0].stock;
    if (quantity === 0) {
      await pool.query(
        `delete from cart_items where cart_id=$1 and product_id=$2`,
        [cart_id, product_id],
      );
      return res.status(200).json({
        message: "Product removed from cart",
      });
    }

    if (quantity > stock) {
      return res.status(400).json({
        message: `You can only add ${stock} items`,
      });
    }

    await pool.query(
      `update cart_items set quantity=$3 where cart_id=$1 and product_id=$2`,
      [cart_id, product_id, quantity],
    );
    res.status(200).json({
      message: "Product quantity updated",
    });
  } catch (error) {
    next(error);
  }
};

export const createAllCartHandler = ({ db = pool, shippingFeeReader = getShippingFee } = {}) => async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const cart = await db.query(
      `SELECT id FROM carts
        WHERE user_id = $1`,
      [user_id],
    );
    let subtotal = 0;
    if (cart.rows.length > 0) {
      const totalAmount = await db.query(
        `select COALESCE(sum(price*quantity), 0) as total from cart_items join products on cart_items.product_id=products.id where cart_id=$1`,
        [cart.rows[0].id],
      );
      subtotal = Number(totalAmount.rows[0].total);
    }
    try {
      const shipping_fee = await shippingFeeReader(db);
      return res.status(200).json({ total: subtotal, subtotal, shipping_fee, payable_total: Math.round((subtotal + shipping_fee) * 100) / 100, shipping_configured: true });
    } catch (error) {
      if (error.status !== 503) throw error;
      return res.status(200).json({ total: subtotal, subtotal, shipping_fee: null, payable_total: null, shipping_configured: false, configuration_message: error.message });
    }
  } catch (error) {
    return next(error);
  }
};

export const ALLCART = createAllCartHandler();
