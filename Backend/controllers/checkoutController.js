import dotenv from "dotenv";
import pool from "../config/db.js";
import axios from "axios";
import { getShippingFee, isCodEnabled } from "../services/checkoutConfig.js";
import { writeAudit } from "../services/audit.js";
import { expireOrderIfDue } from "../services/orderExpiry.js";
import { releaseReservedInventory } from "../services/inventory.js";
import { chapaInitializationErrorDetails } from "../services/chapaInitializationError.js";
dotenv.config();

const chapaCheckoutUrl = (responseData) => {
  const rawUrl = responseData?.data?.checkout_url || responseData?.checkout_url;
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.hostname === "checkout.chapa.co" ? url.toString() : null;
  } catch {
    return null;
  }
};

const createChapaCheckout = async ({ tx_ref, amount, name, email }) => {
  const response = await axios.post(
    "https://api.chapa.co/v1/transaction/initialize",
    {
      amount,
      currency: "ETB",
      email,
      first_name: name,
      tx_ref,
      return_url: `${(process.env.CLIENT_URL || "").split(",")[0].trim().replace(/\/$/, "")}/success?tx_ref=${encodeURIComponent(tx_ref)}`,
      customization: { title: "My Store", description: "Order Payment" },
      meta: { hide_receipt: "true" },
    },
    { headers: { Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}` }, timeout: 15000 },
  );
  const checkout_url = chapaCheckoutUrl(response.data);
  if (response.data?.status !== "success" || !checkout_url) {
    throw Object.assign(new Error("Chapa did not return a valid checkout link."), { status: 502 });
  }
  return checkout_url;
};

const classifyChapaVerification = (response, tx_ref, amount) => {
  const body = response?.data || {};
  const data = body.data || {};
  const returnedRef = data.tx_ref ?? data.reference;
  if (body.status === "success" && data.status === "success") {
    const matches = returnedRef === tx_ref && Number.isFinite(Number(data.amount))
      && Math.abs(Number(data.amount) - Number(amount)) <= 0.01
      && String(data.currency || "").toUpperCase() === "ETB";
    return matches ? "paid" : "uncertain";
  }
  if (body.status === "success" && data.status === "failed" && returnedRef === tx_ref) return "failed";
  const message = String(body.message || "").toLowerCase();
  if (response?.status === 404 && /transaction (was )?not found|invalid transaction/.test(message)) return "not_found";
  return "uncertain";
};

const findChapaCheckoutForKey = async (client, userId, key) => {
  const result = await client.query(
    `SELECT o.id,o.payment_method,o.tx_ref,o.order_status,o.payment_status,p.checkout_url
     FROM orders o LEFT JOIN LATERAL (
       SELECT checkout_url FROM payments WHERE order_id=o.id AND method='chapa' ORDER BY created_at DESC,id DESC LIMIT 1
     ) p ON TRUE
     WHERE o.user_id=$1 AND o.checkout_key=$2 FOR UPDATE OF o`,
    [userId, key],
  );
  return result.rows[0] || null;
};

const findCheckoutForKey = async (client, userId, key) => {
  const result = await client.query(
    `SELECT o.id,o.payment_method,o.tx_ref,o.order_status,o.payment_status,p.checkout_url
     FROM orders o LEFT JOIN LATERAL (
       SELECT tx_ref,checkout_url FROM payments WHERE order_id=o.id ORDER BY created_at DESC,id DESC LIMIT 1
     ) p ON TRUE
     WHERE o.user_id=$1 AND o.checkout_key=$2 FOR UPDATE OF o`,
    [userId, key],
  );
  return result.rows[0] || null;
};

const respondWithExistingCheckout = (res, order) => {
  if (order.payment_method && order.payment_method !== "chapa") {
    return res.status(409).json({ message: "This checkout key is already associated with another payment method.", order_id: order.id });
  }
  if (order.payment_status === "successful") {
    return res.status(409).json({ message: "This checkout has already been paid.", order_id: order.id });
  }
  if (order.order_status !== "awaiting_payment" || !order.tx_ref) {
    return res.status(409).json({ message: "This checkout is no longer available. Start a new checkout.", order_id: order.id });
  }
  if (order.checkout_url && chapaCheckoutUrl({ checkout_url: order.checkout_url })) {
    return res.json({ status: "success", data: { checkout_url: order.checkout_url, tx_ref: order.tx_ref, order_id: order.id } });
  }
  return res.status(202).json({ message: "Resuming the existing payment attempt.", order_id: order.id, tx_ref: order.tx_ref });
};

export const createTotalAmountHandler = ({ db = pool, shippingFeeReader = getShippingFee } = {}) => async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const cart = await db.query(
      `
      SELECT id
      FROM carts
      WHERE user_id = $1
      `,
      [user_id],
    );

    if (cart.rows.length === 0) {
      return res.status(404).json({
        message: "Cart not found",
      });
    }

    const cart_id = cart.rows[0].id;

    const totalAmount = await db.query(
      `
      SELECT COALESCE(SUM(products.price * cart_items.quantity), 0) AS total
      FROM cart_items
      JOIN products
        ON cart_items.product_id = products.id
      WHERE cart_items.cart_id = $1
      `,
      [cart_id],
    );

    const shipping_fee = await shippingFeeReader(db);
    res.status(200).json({ ...totalAmount.rows[0], shipping_fee, payable_total: Number(totalAmount.rows[0].total) + shipping_fee });
  } catch (error) {
    return next(error);
  }
};

export const TotalAmount = createTotalAmountHandler();

export const createCheckoutOptionsHandler = ({ db = pool, shippingFeeReader = getShippingFee, codEnabledReader = isCodEnabled } = {}) => async (_req, res, next) => {
  try {
    const cod_enabled = await codEnabledReader(db);
    try {
      const shipping_fee = await shippingFeeReader(db);
      return res.json({ currency: "ETB", shipping_fee, shipping_configured: true, cod_enabled });
    } catch (error) {
      if (error.status !== 503) throw error;
      return res.json({
        currency: "ETB",
        shipping_fee: null,
        shipping_configured: false,
        cod_enabled,
        configuration_message: error.message,
      });
    }
  } catch (error) {
    return next(error);
  }
};

export const checkoutOptions = createCheckoutOptionsHandler();
export const showCart = async (req, res, next) => {
  try {
    const user_id = req.user.id;

    // Get user's cart
    const cart = await pool.query(
      `
      SELECT id
      FROM carts
      WHERE user_id = $1
      `,
      [user_id],
    );

    if (cart.rows.length === 0) {
      return res.status(404).json({
        message: "Cart not found",
      });
    }

    const cart_id = cart.rows[0].id;

    // Get cart items
    const cartItems = await pool.query(
      `
      SELECT
        cart_items.id,
        cart_items.quantity,
        products.stock,
        products.id AS product_id,
        products.title,
        products.description,
        products.price,
        products.image_url
      FROM cart_items
      JOIN products
        ON cart_items.product_id = products.id
      WHERE cart_items.cart_id = $1
      ORDER BY cart_items.id ASC
      `,
      [cart_id],
    );

    if (cartItems.rows.length === 0) {
      return res.status(404).json({
        message: "Cart is empty",
      });
    }

    res.status(200).json(cartItems.rows);
  } catch (error) {
    return next(error);
  }
};

export const createCodCheckoutHandler = ({ db = pool, shippingFeeReader = getShippingFee, codEnabledReader = isCodEnabled, auditWriter = writeAudit } = {}) => async (req, res, next) => {
  if (req.body.payment_method !== undefined && req.body.payment_method !== "cod") {
    return res.status(400).json({ message: "The selected payment method does not match this checkout endpoint." });
  }
  const checkoutKey = String(req.get?.("Idempotency-Key") || req.headers?.["idempotency-key"] || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(checkoutKey)) {
    return res.status(400).json({ message: "A valid Idempotency-Key header is required to place this order." });
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const existingCheckout = await findCheckoutForKey(client, req.user.id, checkoutKey);
    if (existingCheckout) {
      await client.query("COMMIT");
      if (existingCheckout.payment_method === "cod" && existingCheckout.order_status !== "cancelled") {
        return res.status(200).json({ message: "This Cash on Delivery order was already placed.", order_id: existingCheckout.id });
      }
      return res.status(409).json({ message: "This checkout key is already associated with another order." });
    }
    if (!await codEnabledReader(db)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Cash on Delivery is not available." });
    }
    const { receiver_name, phone, city, sub_city, address, notes } = req.body;
    if (![receiver_name, phone, city, sub_city, address].every((value) => String(value || "").trim())) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Please fill in all shipping information." });
    }
    const shippingFee = await shippingFeeReader(db);
    if (!await codEnabledReader(client)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Cash on Delivery is not available." });
    }
    const cartResult = await client.query("SELECT id FROM carts WHERE user_id=$1 FOR UPDATE", [req.user.id]);
    if (!cartResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Your cart is empty." });
    }
    const repeatedCheckout = await findCheckoutForKey(client, req.user.id, checkoutKey);
    if (repeatedCheckout) {
      await client.query("COMMIT");
      if (repeatedCheckout.payment_method === "cod" && repeatedCheckout.order_status !== "cancelled") {
        return res.status(200).json({ message: "This Cash on Delivery order was already placed.", order_id: repeatedCheckout.id });
      }
      return res.status(409).json({ message: "This checkout key is already associated with another order." });
    }
    const cartId = cartResult.rows[0].id;
    const items = await client.query(
      `SELECT ci.product_id, ci.quantity, p.price, p.stock, p.status FROM cart_items ci
       JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=$1 ORDER BY ci.id FOR UPDATE OF ci, p`,
      [cartId],
    );
    if (!items.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Your cart is empty." });
    }
    if (items.rows.some((item) => item.status !== "published" || Number(item.stock) < Number(item.quantity))) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "One or more items are unavailable or no longer available in the requested quantity." });
    }
    const subtotal = items.rows.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const total = Math.round((subtotal + shippingFee) * 100) / 100;
    if (!Number.isFinite(total) || subtotal <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Cart total is invalid." });
    }
    const addressResult = await client.query(
      `INSERT INTO addresses (user_id, receiver_name, phone, city, sub_city, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [req.user.id, receiver_name.trim(), phone.trim(), city.trim(), sub_city.trim(), address.trim()],
    );
    const orderResult = await client.query(
      `INSERT INTO orders (user_id,address_id,payment_method,payment_status,order_status,total_price,shipping_fee,notes,inventory_state,checkout_key)
       VALUES ($1,$2,'cod','pending','processing',$3,$4,$5,'reserved',$6) RETURNING id`,
      [req.user.id, addressResult.rows[0].id, total, shippingFee, String(notes || "").trim() || null, checkoutKey],
    );
    const orderId = orderResult.rows[0].id;
    for (const item of items.rows) {
      await client.query(
        `INSERT INTO order_items (order_id,product_id,quantity,price_at_purchase) VALUES ($1,$2,$3,$4)`,
        [orderId, item.product_id, item.quantity, item.price],
      );
      const reserved = await client.query(
        "UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1 RETURNING id",
        [item.quantity, item.product_id],
      );
      if (!reserved.rows.length) throw Object.assign(new Error("One or more items are no longer available."), { status: 409 });
    }
    const paymentRef = `cod-order-${orderId}`;
    await client.query(
      `INSERT INTO payments (order_id,method,provider,status,tx_ref) VALUES ($1,'cod','cash_on_delivery','pending',$2)`,
      [orderId, paymentRef],
    );
    await client.query("DELETE FROM cart_items WHERE cart_id=$1", [cartId]);
    await auditWriter(client, req.user.id, "order.cod_created", "order", orderId, { subtotal, shippingFee, total, currency: "ETB" });
    await client.query("COMMIT");
    res.status(201).json({ message: "Cash on Delivery order placed.", order_id: orderId, subtotal, shipping_fee: shippingFee, total });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};

export const codCheckout = createCodCheckoutHandler();

export const displayInfo = async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const user = await pool.query(
      `
      SELECT
        name,
        email,
        phone
      FROM users
      WHERE id = $1
      `,
      [user_id],
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json(user.rows[0]);
  } catch (error) {
    return next(error);
  }
};

//chapa payment
export const chapaPayment = async (req, res) => {
  let tx_ref;
  let order_id;
  let amount;
  let email;
  let name;
  try {
    const checkoutKey = String(req.get?.("Idempotency-Key") || req.headers?.["idempotency-key"] || "").trim();
    if (!/^[A-Za-z0-9._:-]{8,100}$/.test(checkoutKey)) {
      return res.status(400).json({ message: "A valid Idempotency-Key header is required to start checkout." });
    }
    if (req.body.payment_method !== undefined && req.body.payment_method !== "chapa") {
      return res.status(400).json({ message: "The selected payment method does not match this checkout endpoint." });
    }
    const user_id = req.user.id;
    const { receiver_name, phone, city, sub_city, address, notes } = req.body;
    if (![receiver_name, phone, city, sub_city, address].every((value) => String(value || "").trim())) return res.status(400).json({ message: "Please fill in all shipping information." });
    if (!process.env.CHAPA_SECRET_KEY) return res.status(503).json({ message: "Online payment is not configured" });
    const shipping_fee = await getShippingFee(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingCheckout = await findChapaCheckoutForKey(client, user_id, checkoutKey);
      if (existingCheckout) {
        await client.query("COMMIT");
        return respondWithExistingCheckout(res, existingCheckout);
      }
      const userResult = await client.query("SELECT name,email FROM users WHERE id=$1", [user_id]);
      if (!userResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "User not found" });
      }
      ({ name, email } = userResult.rows[0]);
      const cart = await client.query("SELECT id FROM carts WHERE user_id=$1 FOR UPDATE", [user_id]);
      if (!cart.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Cart is empty" });
      }
      // Another request using this key may have completed while this request
      // waited for the cart lock, so check again before making an order.
      const repeatedCheckout = await findChapaCheckoutForKey(client, user_id, checkoutKey);
      if (repeatedCheckout) {
        await client.query("COMMIT");
        return respondWithExistingCheckout(res, repeatedCheckout);
      }
      const items = await client.query(
        `SELECT ci.product_id,ci.quantity,p.price,p.stock,p.status FROM cart_items ci
         JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=$1 ORDER BY p.id FOR UPDATE OF ci,p`,
        [cart.rows[0].id],
      );
      if (!items.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Cart is empty" });
      }
      if (items.rows.some((item) => item.status !== "published" || Number(item.stock) < Number(item.quantity))) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "One or more items are unavailable or no longer available in the requested quantity." });
      }
      const subtotal = items.rows.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
      amount = Math.round((subtotal + shipping_fee) * 100) / 100;
      if (!Number.isFinite(amount) || subtotal <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Cart total is invalid" });
      }
      const savedAddress = await client.query(
        `INSERT INTO addresses(user_id,receiver_name,phone,city,sub_city,address) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [user_id, receiver_name.trim(), phone.trim(), city.trim(), sub_city.trim(), address.trim()],
      );
      tx_ref = `order-${user_id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const order = await client.query(
        `INSERT INTO orders(user_id,address_id,payment_method,payment_status,order_status,total_price,shipping_fee,notes,tx_ref,expires_at,inventory_state,checkout_key)
         VALUES($1,$2,'chapa','pending','awaiting_payment',$3,$4,$5,$6,NOW()+INTERVAL '30 minutes','reserved',$7) RETURNING id`,
        [user_id, savedAddress.rows[0].id, amount, shipping_fee, String(notes || "").trim() || null, tx_ref, checkoutKey],
      );
      order_id = order.rows[0].id;
      for (const item of items.rows) {
        const reserved = await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1 RETURNING id", [item.quantity, item.product_id]);
        if (!reserved.rows.length) throw Object.assign(new Error("One or more items are no longer available."), { status: 409 });
        await client.query("INSERT INTO order_items(order_id,product_id,quantity,price_at_purchase) VALUES($1,$2,$3,$4)", [order_id, item.product_id, item.quantity, item.price]);
      }
      await client.query("INSERT INTO payments(order_id,method,status,tx_ref) VALUES($1,'chapa','pending',$2)", [order_id, tx_ref]);
      await client.query("UPDATE orders SET expires_at=(SELECT created_at+INTERVAL '30 minutes' FROM payments WHERE tx_ref=$1) WHERE id=$2", [tx_ref, order_id]);
      await writeAudit(client, user_id, "order.chapa_created", "order", order_id, { subtotal, shippingFee: shipping_fee, total: amount, currency: "ETB" });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    // Persist the trusted hosted URL against this exact payment and order before redirecting.
    const checkout_url = await createChapaCheckout({ tx_ref, amount, name, email });
    const saved = await pool.query(
      `UPDATE payments SET checkout_url=$1 WHERE tx_ref=$2 AND order_id=$3 AND method='chapa' AND status='pending' RETURNING id`,
      [checkout_url, tx_ref, order_id],
    );
    if (!saved.rows.length) throw Object.assign(new Error("The payment record could not be updated."), { status: 503 });
    res.json({ status: "success", data: { checkout_url, tx_ref, order_id } });
  } catch (error) {
    console.error("Payment initialization failed", chapaInitializationErrorDetails(error));
    res.status(error.status || 502).json({ message: "Payment initialization could not be confirmed. The order remains pending until its server-side expiry; contact support if the provider charged you.", order_id: order_id || undefined, tx_ref: tx_ref || undefined });
  }
};

export const continueChapaPayment = async (req, res, next) => {
  let client;
  let advisoryLock = false;
  let transactionStarted = false;
  let verifyPaidTxRef;
  try {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return res.status(400).json({ message: "Invalid order." });
    if (!process.env.CHAPA_SECRET_KEY) return res.status(503).json({ message: "Chapa payment is temporarily unavailable. Please try again later." });

    // A session-scoped lock serializes the provider retry as well as its database writes.
    // A transaction lock alone would be released before the remote initialization completes.
    client = await pool.connect();
    await client.query("SELECT pg_advisory_lock(781204, $1)", [orderId]);
    advisoryLock = true;
    await expireOrderIfDue(orderId, req.user.id);
    await client.query("BEGIN");
    transactionStarted = true;
    const result = await client.query(
      `SELECT o.id,o.user_id,o.payment_method,o.payment_status,o.order_status,o.total_price,o.expires_at,
              o.tx_ref AS order_tx_ref,NOW() AS server_now,
              GREATEST(0,EXTRACT(EPOCH FROM (o.expires_at-NOW()))*1000)::bigint AS remaining_ms,
              u.name,u.email,p.id AS payment_id,p.tx_ref AS payment_tx_ref,p.status AS attempt_status,p.checkout_url
       FROM orders o JOIN users u ON u.id=o.user_id
       LEFT JOIN LATERAL (
         SELECT id,tx_ref,status,checkout_url FROM payments
         WHERE order_id=o.id AND method='chapa' ORDER BY created_at DESC,id DESC LIMIT 1
       ) p ON TRUE
       WHERE o.id=$1 AND o.user_id=$2 FOR UPDATE OF o`,
      [orderId, req.user.id],
    );
    const order = result.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ message: "Order not found." });
    }
    if (order.payment_method !== "chapa") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ message: "This order does not use Chapa payment." });
    }
    if (order.payment_status === "successful") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ message: "Payment is already confirmed. Refresh the order to see its latest status." });
    }
    if (order.order_status === "expired" || (order.expires_at && Number(order.remaining_ms) <= 0)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ message: "The 30-minute payment window has expired. Place a new order to continue.", order_status: "expired" });
    }
    if (!order.expires_at) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ message: "This order has no valid payment deadline. Contact support before attempting payment again." });
    }
    if (order.order_status !== "awaiting_payment" || order.payment_status !== "pending") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ message: "This order is no longer awaiting payment." });
    }
    if (order.checkout_url && chapaCheckoutUrl({ checkout_url: order.checkout_url })) {
      await client.query("COMMIT");
      transactionStarted = false;
      return res.json({ checkout_url: order.checkout_url, expires_at: order.expires_at, server_now: order.server_now, remaining_ms: Number(order.remaining_ms) });
    }

    const previousTxRef = order.payment_tx_ref || order.order_tx_ref;
    if (!previousTxRef) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(503).json({ message: "This order has no recoverable Chapa payment reference. Contact support for help with this order." });
    }
    let verification;
    try {
      verification = await axios.get(
        `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(previousTxRef)}`,
        { headers: { Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}` }, timeout: 15000, validateStatus: () => true },
      );
    } catch {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(503).json({ message: "Chapa could not confirm the existing payment attempt. Try again shortly; no new payment attempt was started." });
    }
    const providerState = classifyChapaVerification(verification, previousTxRef, order.total_price);
    if (providerState === "paid") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      verifyPaidTxRef = previousTxRef;
    } else if (providerState === "uncertain") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ message: "Chapa still reports an active or unconfirmed payment attempt, but its checkout link is unavailable. No second attempt was started. Please contact support with this order number." });
    } else {
      if (order.payment_id) {
        await client.query("UPDATE payments SET status='failed' WHERE id=$1 AND status='pending'", [order.payment_id]);
      }
      const nextTxRef = `order-${order.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await client.query(
        "INSERT INTO payments(order_id,method,status,tx_ref) VALUES($1,'chapa','pending',$2)",
        [order.id, nextTxRef],
      );
      await client.query("COMMIT");
      transactionStarted = false;

      // Chapa rejects reused references. A new attempt gets its own reference but remains
      // attached to the existing order and inherits that order's original expiry deadline.
      const checkout_url = await createChapaCheckout({
        tx_ref: nextTxRef,
        amount: order.total_price,
        name: order.name,
        email: order.email,
      });
      const saved = await client.query(
        `UPDATE payments SET checkout_url=$1 WHERE tx_ref=$2 AND order_id=$3 AND method='chapa' AND status='pending' RETURNING id`,
        [checkout_url, nextTxRef, order.id],
      );
      if (!saved.rows.length) return res.status(503).json({ message: "Chapa created a payment session, but it could not be saved to this order. Please try again shortly; do not place a duplicate order." });
      return res.json({ checkout_url, expires_at: order.expires_at, server_now: order.server_now, remaining_ms: Number(order.remaining_ms) });
    }
  } catch (error) {
    if (transactionStarted) await client?.query("ROLLBACK").catch(() => {});
    if (error.response || error.code === "ECONNABORTED") {
      return res.status(503).json({ message: "Chapa is temporarily unavailable. Please try again shortly; your order has not been duplicated." });
    }
    if (error.status) return res.status(error.status).json({ message: error.message || "Could not create a Chapa payment session for this order." });
    return next(error);
  } finally {
    if (transactionStarted) await client?.query("ROLLBACK").catch(() => {});
    if (advisoryLock) await client?.query("SELECT pg_advisory_unlock(781204, $1)", [Number(req.params.id)]).catch(() => {});
    client?.release();
  }
  if (verifyPaidTxRef) {
    return verifyPayment({ ...req, params: { ...req.params, tx_ref: verifyPaidTxRef } }, res);
  }
};
export const verifyPayment = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const { tx_ref } = req.params;
    if (!tx_ref || tx_ref.length > 100 || !process.env.CHAPA_SECRET_KEY) {
      return res.status(400).json({ success: false, message: "Invalid payment reference" });
    }

    const orderLookup = await pool.query(
      `SELECT o.id,o.user_id,o.total_price,o.shipping_fee,o.payment_status,o.order_status,o.expires_at,o.late_payment_review_required
       FROM orders o LEFT JOIN payments p ON p.order_id=o.id AND p.tx_ref=$1
       WHERE (p.tx_ref=$1 AND p.method='chapa') OR (p.id IS NULL AND o.tx_ref=$1)`,
      [tx_ref],
    );
    const orderData = orderLookup.rows[0];
    if (!orderData || orderData.user_id !== req.user.id) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (orderData.payment_status === "successful") {
      if (orderData.late_payment_review_required) {
        return res.status(202).json({ success: false, needs_review: true, message: "This verified payment is awaiting store review because its order had already expired." });
      }
      return res.json({ success: true, message: "Payment already verified", order_id: orderData.id });
    }
    if (orderData.payment_status !== "pending" && !(orderData.payment_status === "failed" && orderData.order_status === "expired")) {
      return res.status(409).json({
        success: false,
        message: "This order is no longer awaiting payment. Contact support if you completed a payment.",
      });
    }

    const response = await axios.get(
      `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(tx_ref)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
        },
        timeout: 15000,
      },
    );

    const payment = response.data;

    const providerData = payment.data;
    const providerRef = providerData?.tx_ref ?? providerData?.reference;
    const providerAmount = Number(providerData?.amount);
    const expectedAmount = Number(orderData.total_price);

    if (payment.status !== "success" || providerData?.status !== "success") {
      return res.status(409).json({
        success: false,
        message: "Payment not completed",
      });
    }

    if (
      providerRef !== tx_ref ||
      !Number.isFinite(providerAmount) ||
      Math.abs(providerAmount - expectedAmount) > 0.01 ||
      String(providerData.currency || "").toUpperCase() !== "ETB"
    ) {
      return res.status(409).json({ success: false, message: "Payment details could not be matched to this order" });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const existingOrder = await client.query(
      `
      SELECT o.id,o.payment_status,o.user_id,o.total_price,o.order_status,o.late_payment_review_required,
        o.shipping_fee,o.inventory_state,o.expires_at,(o.expires_at <= NOW()) AS expiry_due
      FROM orders o LEFT JOIN payments p ON p.order_id=o.id AND p.tx_ref=$1
      WHERE (p.tx_ref=$1 AND p.method='chapa') OR (p.id IS NULL AND o.tx_ref=$1)
      FOR UPDATE OF o
      `,
      [tx_ref],
    );

    if (existingOrder.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        message: "Order not found",
      });
    }

    const lockedOrder = existingOrder.rows[0];
    if (lockedOrder.user_id !== req.user.id) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Already completed

    if (lockedOrder.payment_status === "successful") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      if (lockedOrder.late_payment_review_required) {
        return res.status(202).json({ success: false, needs_review: true, message: "This verified payment is awaiting store review because its order had already expired.", order_id: lockedOrder.id });
      }

      return res.json({
        success: true,
        message: "Payment already verified",
        order_id: orderData.id,
      });
    }
    const expiredNow = lockedOrder.order_status === "awaiting_payment" && lockedOrder.expiry_due;
    if (expiredNow) {
      const inventoryReleased = await releaseReservedInventory(client, lockedOrder.id);
      await client.query("UPDATE orders SET order_status='expired',payment_status='failed',updated_at=NOW() WHERE id=$1 AND order_status='awaiting_payment'", [lockedOrder.id]);
      await client.query("UPDATE payments SET status='failed' WHERE tx_ref=$1 AND status='pending'", [tx_ref]);
      await writeAudit(client, null, "order.expired", "order", lockedOrder.id, { inventoryReleased });
    }
    if (lockedOrder.order_status === "expired" && lockedOrder.inventory_state === "reserved") {
      await releaseReservedInventory(client, lockedOrder.id);
    }
    if (lockedOrder.order_status === "cancelled" && lockedOrder.inventory_state === "reserved") {
      await releaseReservedInventory(client, lockedOrder.id);
    }
    if (["expired", "cancelled"].includes(lockedOrder.order_status) || expiredNow) {
      await client.query(
        "UPDATE payments SET status='successful', transaction_id=$2, paid_at=NOW() WHERE tx_ref=$1 AND status <> 'successful'",
        [tx_ref, String(providerRef)],
      );
      await client.query(
        "UPDATE orders SET payment_status='successful', late_payment_review_required=TRUE, updated_at=NOW() WHERE id=$1 AND payment_status IN ('pending','failed')",
        [lockedOrder.id],
      );
      await client.query(
        `INSERT INTO late_payment_reviews(order_id,tx_ref,amount,currency,provider_reference)
         VALUES($1,$2,$3,'ETB',$4) ON CONFLICT(tx_ref) DO NOTHING`,
        [lockedOrder.id, tx_ref, providerAmount, String(providerRef)],
      );
      await writeAudit(client, req.user.id, "payment.late_verified", "order", lockedOrder.id, { amount: providerAmount, currency: "ETB" });
      await client.query("COMMIT");
      transactionStarted = false;
      return res.status(202).json({ success: false, needs_review: true, message: "Payment was verified after this order closed. The store has been notified to review fulfillment or a manual refund; inventory was not reserved again.", order_id: lockedOrder.id });
    }
    if (lockedOrder.order_status !== "awaiting_payment") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "Order is no longer awaiting payment" });
    }

    const orderItems = await client.query(
      `SELECT oi.product_id, oi.quantity, oi.price_at_purchase, p.stock
       FROM order_items oi JOIN products p ON p.id=oi.product_id
       WHERE oi.order_id=$1 FOR UPDATE OF p`,
      [lockedOrder.id],
    );
    const snapshotAmount = orderItems.rows.reduce(
      (sum, item) => sum + Number(item.price_at_purchase) * Number(item.quantity),
      0,
    );
    if (
      orderItems.rows.length === 0 ||
      Math.abs(snapshotAmount + Number(lockedOrder.shipping_fee || 0) - Number(lockedOrder.total_price)) > 0.01 ||
      (lockedOrder.inventory_state !== "reserved" && orderItems.rows.some((item) => Number(item.stock) < Number(item.quantity)))
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "Payment was received, but order inventory needs support review",
      });
    }

    const order = await client.query(
      `
      UPDATE orders
      SET
        payment_status='successful',
        order_status='processing',
        inventory_state='committed'
      WHERE tx_ref=$1 AND user_id=$2 AND payment_status='pending'
        AND order_status='awaiting_payment'
      RETURNING id
      `,
      [tx_ref, req.user.id],
    );

    if (order.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "Order is no longer awaiting payment" });
    }

    const order_id = order.rows[0].id;

    // 4. Update payments table

    await client.query(
      `
      UPDATE payments
      SET
        status='successful',
        paid_at=NOW()
      WHERE tx_ref=$1
      `,
      [tx_ref],
    );

    if (lockedOrder.inventory_state !== "reserved") {
      for (const item of orderItems.rows) {
        const reserved = await client.query(
          "UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1 RETURNING id",
          [item.quantity, item.product_id],
        );
        if (!reserved.rows.length) {
          await client.query("ROLLBACK");
          transactionStarted = false;
          return res.status(409).json({ success: false, message: "Payment was received, but inventory needs staff review." });
        }
      }
    }

    // Clear the paid items only; later cart additions are preserved.
    const cart = await client.query("SELECT id FROM carts WHERE user_id=$1", [req.user.id]);
    if (cart.rows.length) {
      await client.query(
        `DELETE FROM cart_items ci USING order_items oi
         WHERE ci.cart_id=$1 AND ci.product_id=oi.product_id AND oi.order_id=$2
           AND ci.quantity=oi.quantity`,
        [cart.rows[0].id, order_id],
      );
    }

    // Finish transaction

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      message: "Payment verified",
      order_id,
    });
  } catch (error) {
    if (client && transactionStarted) await client.query("ROLLBACK");

    console.error("Payment verification failed", error.response?.status || "internal error");

    res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  } finally {
    client?.release();
  }
};
