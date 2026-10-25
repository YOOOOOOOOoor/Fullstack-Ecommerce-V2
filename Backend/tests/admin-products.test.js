import test from "node:test";
import assert from "node:assert/strict";
import pool from "../config/db.js";
import { getProducts } from "../controllers/productController.js";

test("admin product endpoint applies supported price and stock filters to rows and count", async () => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params: [...params] });
    return sql.includes("COUNT(*)")
      ? { rows: [{ total: "1" }] }
      : { rows: [{ id: 7, title: "Desk", price: "500.00", stock: 4, status: "archived" }] };
  };

  try {
    const response = { body: null, json(body) { this.body = body; return this; } };
    await getProducts({ query: {
      category: "2", search: "desk", color: "Green", status: "archived",
      minPrice: "100", price: "500", stockStatus: "low_stock", page: "2", limit: "5",
    } }, response, (error) => { throw error; });

    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.sql, /products\.price >= \$6/);
      assert.match(call.sql, /products\.price <= \$5/);
      assert.match(call.sql, /products\.stock BETWEEN 1 AND 10/);
      assert.doesNotMatch(call.sql, /low_stock/);
      assert.deepEqual(call.params.slice(0, 6), ["2", "%desk%", "Green", "archived", "500", "100"]);
    }
    assert.deepEqual(calls[1].params.slice(6), [5, 5]);
    assert.deepEqual(response.body, {
      products: [{ id: 7, title: "Desk", price: "500.00", stock: 4, status: "archived" }],
      total: 1, page: 2, totalPages: 1,
    });
  } finally {
    pool.query = originalQuery;
  }
});

test("unsupported stock-filter values cannot inject SQL", async () => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push(sql);
    return sql.includes("COUNT(*)") ? { rows: [{ total: "0" }] } : { rows: [] };
  };

  try {
    const response = { json(body) { this.body = body; return this; } };
    await getProducts({ query: { stockStatus: "all); DROP TABLE products;--" } }, response, (error) => { throw error; });
    assert.equal(calls.every((sql) => !sql.includes("DROP TABLE")), true);
  } finally {
    pool.query = originalQuery;
  }
});
