import pool from "../config/db.js";
import { writeAudit } from "../services/audit.js";

export const createGetShippingConfigHandler = ({ db = pool, environmentFee = () => process.env.SHIPPING_FEE_ETB } = {}) => async (_req, res, next) => {
  try {
    const result = await db.query("SELECT default_fee,updated_at FROM shipping_config WHERE id=1");
    if (result.rows[0]?.default_fee !== undefined) {
      return res.json({ currency: "ETB", default_fee: Number(result.rows[0].default_fee), configured: true, updated_at: result.rows[0].updated_at, source: "database" });
    }
    const envFee = environmentFee();
    const fee = envFee === undefined || envFee.trim() === "" ? null : Number(envFee);
    if (fee === null || !Number.isFinite(fee) || fee < 0 || Math.round(fee * 100) !== fee * 100) {
      return res.json({ currency: "ETB", default_fee: null, configured: false, updated_at: null, source: null });
    }
    return res.json({ currency: "ETB", default_fee: fee, configured: true, updated_at: null, source: "environment" });
  } catch (error) { return next(error); }
};

export const getShippingConfig = createGetShippingConfigHandler();

export const createUpdateShippingConfigHandler = ({ db = pool, auditWriter = writeAudit } = {}) => async (req, res, next) => {
  const rawFee = req.body.default_fee;
  const feeText = typeof rawFee === "number" ? String(rawFee) : typeof rawFee === "string" ? rawFee.trim() : "";
  const fee = feeText === "" ? NaN : Number(feeText);
  const reason = String(req.body.reason || "").trim();
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(feeText) || !Number.isFinite(fee) || fee < 0 || (!req.staff?.is_super_admin && reason.length < 10)) {
    return res.status(400).json({ message: "Enter a non-negative fee to two decimal places and a reason of at least ten characters." });
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const previous = await client.query("SELECT default_fee FROM shipping_config WHERE id=1 FOR UPDATE");
    const oldFee = previous.rows[0] ? Number(previous.rows[0].default_fee) : null;
    await client.query(
      `INSERT INTO shipping_config(id,default_fee,updated_by,updated_at) VALUES(1,$1,$2,NOW())
       ON CONFLICT(id) DO UPDATE SET default_fee=EXCLUDED.default_fee,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [fee, req.user.id],
    );
    await auditWriter(client, req.user.id, "shipping.default_fee_changed", "shipping_config", "1", { previousFee: oldFee, newFee: fee, reason: reason || null, currency: "ETB" });
    await client.query("COMMIT");
    res.json({ currency: "ETB", default_fee: fee, message: "Default shipping fee updated. Existing order totals were not changed." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
};

export const updateShippingConfig = createUpdateShippingConfigHandler();

export const overrideOrderShippingFee = async (req, res, next) => {
  const fee = Number(req.body.shipping_fee);
  const reason = String(req.body.reason || "").trim();
  if (!Number.isFinite(fee) || fee < 0 || Math.round(fee * 100) !== fee * 100 || (!req.staff?.is_super_admin && reason.length < 10)) {
    return res.status(400).json({ message: "Enter a non-negative fee to two decimal places and a reason of at least ten characters." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query(
      `SELECT id,order_status,payment_method,payment_status,shipping_fee,total_price FROM orders WHERE id=$1 FOR UPDATE`,
      [req.params.orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found." });
    }
    if (order.payment_method !== "cod" || order.payment_status !== "pending" || !["processing", "ready_for_dispatch"].includes(order.order_status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Shipping overrides are allowed only for unpaid COD orders before driver assignment." });
    }
    const subtotalResult = await client.query("SELECT COALESCE(SUM(quantity*price_at_purchase),0) AS subtotal FROM order_items WHERE order_id=$1", [order.id]);
    const subtotal = Number(subtotalResult.rows[0].subtotal);
    const previousFee = Number(order.shipping_fee || 0);
    const total = Math.round((subtotal + fee) * 100) / 100;
    await client.query("UPDATE orders SET shipping_fee=$1,total_price=$2,updated_at=NOW() WHERE id=$3", [fee, total, order.id]);
    await client.query("INSERT INTO order_shipping_fee_changes(order_id,actor_id,previous_fee,new_fee,reason) VALUES($1,$2,$3,$4,$5)", [order.id, req.user.id, previousFee, fee, reason || "Super Admin action; reason omitted."]);
    await writeAudit(client, req.user.id, "shipping.order_fee_overridden", "order", order.id, { previousFee, newFee: fee, previousTotal: Number(order.total_price), newTotal: total, reason: reason || null });
    await client.query("COMMIT");
    res.json({ message: "Order shipping fee updated.", shipping_fee: fee, total_price: total });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
};
