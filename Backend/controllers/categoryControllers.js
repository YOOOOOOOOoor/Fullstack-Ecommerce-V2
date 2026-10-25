import dotenv from "dotenv";
import pool from "../config/db.js";
import { writeAudit } from "../services/audit.js";

dotenv.config();

//adding

export const Add = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ msg: "Please fill all the fields" });
    }
    if (name.trim().length === 0) {
      return res.status(400).json({ msg: "Please fill all the fields" });
    }
    const checkCategory = await pool.query(
      "select * from categories where name=$1",
      [name.toLowerCase().trim()],
    );
    if (checkCategory.rows.length > 0) {
      return res.status(400).json({ msg: "Category already exists" });
    }
    const category = await pool.query(
      "insert into categories(name) values($1) returning id,name",
      [name.toLowerCase().trim()],
    );
    await writeAudit(pool, req.user.id, "category.created", "category", category.rows[0].id, { name: category.rows[0].name });
    res
      .status(200)
      .json({ msg: "Category added successfully", category: category.rows[0] });
  } catch (error) {
    next(error);
    res.status(500).json({ msg: "Server error" });
  }
};

//get all categories
export const getAll = async (req, res, next) => {
  try {
    const categories = await pool.query(
      "select * from categories order by name",
    );
    res.status(200).json(categories.rows);
  } catch (error) {
    next(error);
    res.status(500).json({ msg: "Server error" });
  }
};
//get one
export const One = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ msg: "Category id is required" });
    }
    const category = await pool.query("select * from categories where id=$1", [
      id,
    ]);
    if (category.rows.length === 0) {
      return res.status(400).json({ msg: "Category not found" });
    }
    res.status(200).json(category.rows[0]);
  } catch (error) {
    next(error);
    res.status(500).json({ msg: "Server error" });
  }
};

//edit
export const Edit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!id) {
      return res.status(400).json({ msg: "Category id is required" });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ msg: "Please fill all the fields" });
    }
    const checkCategory = await pool.query(
      "select * from categories where name=$1",
      [name.toLowerCase().trim()],
    );
    if (checkCategory.rows.length > 0) {
      return res.status(400).json({ msg: "Category already exists" });
    }
    const category = await pool.query(
      "update categories set name=$1 where id=$2 returning id,name",
      [name.toLowerCase().trim(), id],
    );
    await writeAudit(pool, req.user.id, "category.updated", "category", id, { name: category.rows[0]?.name || name.toLowerCase().trim() });
    res.status(200).json({
      msg: "Category updated successfully",
      category: category.rows[0],
    });
  } catch (error) {
    next(error);
    res.status(500).json({ msg: "Server error" });
  }
};

//delete
export const Delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ msg: "Category id is required" });
    }
    const checkCategory = await pool.query(
      "select * from categories where id=$1",
      [id],
    );
    if (checkCategory.rows.length === 0) {
      return res.status(400).json({ msg: "Category not found" });
    }

    const archivedProducts = await pool.query(
      `
      UPDATE products
      SET 
        status = 'draft',
        category_id = NULL,
        updated_at = NOW()
      WHERE category_id = $1
      `,
      [id],
    );
    await pool.query("delete from categories where id=$1", [id]);
    await writeAudit(pool, req.user.id, "category.deleted", "category", id, { name: checkCategory.rows[0].name, archivedProductCount: archivedProducts.rowCount });

    res.status(200).json({ msg: "Category deleted successfully" });
  } catch (error) {
    next(error);
  }
};
