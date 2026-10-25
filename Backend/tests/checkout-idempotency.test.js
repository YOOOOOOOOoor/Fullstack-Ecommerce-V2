import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import pool from "../config/db.js";
import { chapaPayment } from "../controllers/checkoutController.js";

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("repeated Chapa checkout key returns the existing payment URL without another order", async (t) => {
  const oldSecret = process.env.CHAPA_SECRET_KEY;
  const oldShippingFee = process.env.SHIPPING_FEE_ETB;
  process.env.CHAPA_SECRET_KEY = "test-secret";
  process.env.SHIPPING_FEE_ETB = "5";
  t.after(() => {
    if (oldSecret === undefined) delete process.env.CHAPA_SECRET_KEY; else process.env.CHAPA_SECRET_KEY = oldSecret;
    if (oldShippingFee === undefined) delete process.env.SHIPPING_FEE_ETB; else process.env.SHIPPING_FEE_ETB = oldShippingFee;
  });

  const statements = [];
  const client = {
    async query(sql) {
      const query = sql.replace(/\s+/g, " ").trim();
      statements.push(query);
      if (query.includes("o.checkout_key=$2")) return { rows: [{ id: 71, tx_ref: "order-71", order_status: "awaiting_payment", payment_status: "pending", checkout_url: "https://checkout.chapa.co/checkout/existing" }] };
      return { rows: [] };
    },
    release() {},
  };
  t.mock.method(pool, "query", async () => ({ rows: [] }));
  t.mock.method(pool, "connect", async () => client);
  t.mock.method(axios, "post", async () => assert.fail("duplicate checkout must not initialize a second payment"));

  const res = response();
  await chapaPayment({
    get: () => "retry-key-123456",
    user: { id: 8 },
    body: { receiver_name: "Buyer", phone: "123", city: "A", sub_city: "B", address: "C" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.checkout_url, "https://checkout.chapa.co/checkout/existing");
  assert.equal(res.body.data.order_id, 71);
  assert.equal(statements.includes("COMMIT"), true);
  assert.equal(statements.some((query) => query.startsWith("INSERT INTO orders")), false);
});
