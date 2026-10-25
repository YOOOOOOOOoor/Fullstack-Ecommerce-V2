import pool from "../config/db.js";
import { v2 as cloudinary } from "cloudinary";
import { writeAudit } from "../services/audit.js";

export const createProduct = async (req, res, next) => {
  try {
    const {
      title,
      description,
      price,
      color,
      category_id,
      stock,
      status,
      featured,
    } = req.body;

    if (
      !title ||
      !description ||
      !price ||
      !category_id ||
      stock === undefined ||
      !status ||
      !color
    ) {
      return res.status(400).json({ message: "Please fill all the fields" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Image is required" });
    }
    const image_url = req.file.path;
    const image_public_id = req.file.filename;

    const product = await pool.query(
      `insert into products 
(title,description,price,color,category_id,stock,status,featured,image_url,image_public_id) 
values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        title,
        description,
        Number(price),
        color,
        category_id,
        Number(stock),
        status,
        featured === "true",
        image_url,
        image_public_id,
      ],
    );

    const created = product.rows[0];
    await writeAudit(pool, req.user.id, "product.created", "product", created.id, {
      title: created.title, price: Number(created.price), stock: Number(created.stock),
      status: created.status, categoryId: created.category_id,
    });

    return res.json(created);
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getColor = async (req, res, next) => {
  try {
    const result = await pool.query(
      `select distinct color,id from products where stock > 0 and status = 'published'`,
    );
    return res.json(result.rows);
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getProducts = async (req, res, next) => {
  try {
    const {
      category,
      search,
      color,
      status,
      price,
      minPrice,
      stockStatus,
      page = 1,
      limit = 5,
    } = req.query;

    const currentPage = Number(page);
    const pageLimit = Number(limit);
    const offset = (currentPage - 1) * pageLimit;

    let query = `
      SELECT
        products.*,
        categories.name AS category_name
      FROM products
      LEFT JOIN categories
        ON categories.id = products.category_id
      WHERE 1=1
    `;

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM products
      LEFT JOIN categories
        ON categories.id = products.category_id
      WHERE 1=1
    `;

    const values = [];

    // Category
    if (category && category !== "all") {
      values.push(category);
      query += ` AND products.category_id = $${values.length}`;
      countQuery += ` AND products.category_id = $${values.length}`;
    }

    // Search by title
    if (search) {
      values.push(`%${search}%`);
      query += ` AND products.title ILIKE $${values.length}`;
      countQuery += ` AND products.title ILIKE $${values.length}`;
    }

    // Color
    if (color && color !== "all") {
      values.push(color);
      query += ` AND products.color ILIKE $${values.length}`;
      countQuery += ` AND products.color ILIKE $${values.length}`;
    }

    // Status (Admin only)
    if (status && status !== "all") {
      values.push(status);
      query += ` AND products.status = $${values.length}`;
      countQuery += ` AND products.status = $${values.length}`;
    }

    // Price
    if (price && price !== "all") {
      values.push(price);
      query += ` AND products.price <= $${values.length}`;
      countQuery += ` AND products.price <= $${values.length}`;
    }

    if (minPrice !== undefined && minPrice !== "") {
      values.push(minPrice);
      query += ` AND products.price >= $${values.length}`;
      countQuery += ` AND products.price >= $${values.length}`;
    }

    const stockFilters = {
      in_stock: "products.stock > 0",
      low_stock: "products.stock BETWEEN 1 AND 10",
      out_of_stock: "products.stock = 0",
    };
    if (stockStatus && stockStatus !== "all" && stockFilters[stockStatus]) {
      query += ` AND ${stockFilters[stockStatus]}`;
      countQuery += ` AND ${stockFilters[stockStatus]}`;
    }

    query += `
      ORDER BY products.created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `;

    const totalResult = await pool.query(countQuery, values);

    values.push(pageLimit, offset);

    const result = await pool.query(query, values);

    res.json({
      products: result.rows,
      total: Number(totalResult.rows[0].total),
      page: currentPage,
      totalPages: Math.ceil(Number(totalResult.rows[0].total) / pageLimit) || 1,
    });
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getProductsCustomer = async (req, res, next) => {
  try {
    const { category, search, color, price, page = 1, limit = 5 } = req.query;

    const currentPage = Number(page);
    const pageLimit = Number(limit);
    const offset = (currentPage - 1) * pageLimit;

    let query = `
      SELECT
        products.*,
        categories.name AS category_name
      FROM products
      LEFT JOIN categories
        ON categories.id = products.category_id
      WHERE products.status = 'published' and products.stock > 0
    `;

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM products
      LEFT JOIN categories
        ON categories.id = products.category_id
      WHERE products.status = 'published' and products.stock > 0
    `;

    const values = [];

    // Category
    if (category && category !== "all") {
      values.push(category);
      query += ` AND products.category_id = $${values.length}`;
      countQuery += ` AND products.category_id = $${values.length}`;
    }

    // Search by title
    if (search) {
      values.push(`%${search}%`);
      query += ` AND products.title ILIKE $${values.length}`;
      countQuery += ` AND products.title ILIKE $${values.length}`;
    }

    // Color
    if (color && color !== "all") {
      values.push(color);
      query += ` AND products.color ILIKE $${values.length}`;
      countQuery += ` AND products.color ILIKE $${values.length}`;
    }

    // Price
    if (price && price !== "all") {
      values.push(price);
      query += ` AND products.price <= $${values.length}`;
      countQuery += ` AND products.price <= $${values.length}`;
    }

    query += `
      ORDER BY products.created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `;

    const totalResult = await pool.query(countQuery, values);

    values.push(pageLimit, offset);

    const result = await pool.query(query, values);

    res.json({
      products: result.rows,
      total: Number(totalResult.rows[0].total),
      page: currentPage,
      totalPages: Math.ceil(Number(totalResult.rows[0].total) / pageLimit) || 1,
    });
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT products.*,
      categories.name as category_name
      from products
      left join categories on categories.id = products.category_id
       WHERE products.id = $1 `,
      [Number(id)],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getProductCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT products.id as product_id, products.title,products.description,products.price,products.color,products.stock,products.image_url,products.created_at,
      categories.name as category_name
      from products
      left join categories on categories.id = products.category_id
       WHERE products.id = $1 `,
      [Number(id)],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      price,
      color,
      category_id,
      stock,
      status,
      featured,
    } = req.body;
    const checkProduct = await pool.query(
      `select * from products where id=$1`,
      [id],
    );
    if (checkProduct.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    const product = checkProduct.rows[0];
    let imageUrl = product.image_url;
    let imagePublicId = product.image_public_id;

    if (req.file) {
      await cloudinary.uploader.destroy(product.image_public_id);
      imageUrl = req.file.path;
      imagePublicId = req.file.filename;
    }
    const result = await pool.query(
      `
   update products 
set 
title=$1,
description=$2,
price=$3,
color=$4,
category_id=$5,
stock=$6,
status=$7,
featured=$8,
image_url=$9,
image_public_id=$10,
updated_at = NOW()
where id=$11
returning *`,
      [
        title,
        description,
        price,
        color,
        category_id,
        stock,
        status,
        featured === "true",
        imageUrl,
        imagePublicId,
        id,
      ],
    );
    const updated = result.rows[0];
    await writeAudit(pool, req.user.id, "product.updated", "product", id, {
      title: updated.title, price: Number(updated.price), stock: Number(updated.stock),
      status: updated.status, categoryId: updated.category_id,
      previousTitle: product.title, previousPrice: Number(product.price), previousCategoryId: product.category_id,
      previousStatus: product.status, previousStock: Number(product.stock),
    });
    return res.json(updated);
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const checkProduct = await pool.query(
      `select * from products where id=$1`,
      [id],
    );
    if (checkProduct.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    const product = checkProduct.rows[0];
    const imagepublicid = product.image_public_id;
    await cloudinary.uploader.destroy(imagepublicid);
    await pool.query(`delete from products where id=$1`, [id]);
    await writeAudit(pool, req.user.id, "product.deleted", "product", id, { title: product.title });
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getFeaturedProducts = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        products.*,
        categories.name AS category_name
      FROM products
      LEFT JOIN categories
      ON categories.id = products.category_id
      WHERE products.featured=true
      AND products.status='published'
      AND products.stock > 0
      ORDER BY products.created_at DESC
      LIMIT 8
      `,
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
    res.status(500).json({
      message: "Server error",
    });
  }
};

export const getRecommendations = async (req, res) => {
  try {
    const { id } = req.params;

    // Check product exists
    const product = await pool.query(
      `
      SELECT category_id
      FROM products
      WHERE id=$1
      `,
      [id],
    );

    if (product.rows.length === 0) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const category_id = product.rows[0].category_id;

    /*
      1. Customers also bought
      Find products that appear in orders
      containing this product
    */

    const boughtTogether = await pool.query(
      `
      SELECT 
          p.id,
          p.title,
          p.price,
          p.image_url,
          c.name AS category_name,
          COUNT(*) AS purchase_count

      FROM order_items oi1


      JOIN orders o
      ON o.id = oi1.order_id


      JOIN order_items oi2
      ON oi2.order_id = o.id


      JOIN products p
      ON p.id = oi2.product_id


      JOIN categories c
      ON c.id = p.category_id


      WHERE 
          oi1.product_id = $1
          AND oi2.product_id != $1
          AND p.status='published'


      GROUP BY 
          p.id,
          c.name


      ORDER BY purchase_count DESC


      LIMIT 5

      `,
      [id],
    );

    let recommendations = boughtTogether.rows;

    /*
      2. If not enough results,
         add category recommendations
    */

    if (recommendations.length < 5) {
      const needed = 5 - recommendations.length;

      const existingIds = recommendations.map((item) => item.id);

      const categoryProducts = await pool.query(
        `
        SELECT 
            p.id,
            p.title,
            p.price,
            p.image_url,
            c.name AS category_name


        FROM products p


        JOIN categories c
        ON c.id=p.category_id


        WHERE
            p.category_id=$1
            AND p.id != $2
            AND p.status='published'
            ${
              existingIds.length
                ? `AND p.id NOT IN (${existingIds.join(",")})`
                : ""
            }


        ORDER BY RANDOM()


        LIMIT $3

        `,
        [category_id, id, needed],
      );

      recommendations = [...recommendations, ...categoryProducts.rows];
    }

    res.json(recommendations);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
export const getMaxPrice = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT MAX(price) AS max_price FROM products`,
    );

    res.json({
      maxPrice: Number(result.rows[0].max_price) || 0,
    });
  } catch (error) {
    next(error);
  }
};
