export const getShippingFee = async (db) => {
  const raw = process.env.SHIPPING_FEE_ETB;
  let configured = raw === undefined || raw.trim() === "" ? null : Number(raw);
  if (db) {
    const result = await db.query("SELECT default_fee FROM shipping_config WHERE id=1");
    if (result.rows[0]?.default_fee !== null && result.rows[0]?.default_fee !== undefined) {
      configured = Number(result.rows[0].default_fee);
    } else {
      const legacy = await db.query("SELECT shipping_fee FROM settings ORDER BY id LIMIT 1");
      if (legacy.rows[0]?.shipping_fee !== null && legacy.rows[0]?.shipping_fee !== undefined) configured = Number(legacy.rows[0].shipping_fee);
    }
  }
  const fee = configured;
  if (!Number.isFinite(fee) || fee < 0) {
    const error = new Error("A valid default shipping fee must be configured before checkout.");
    error.status = 503;
    error.expose = true;
    throw error;
  }
  return Math.round(fee * 100) / 100;
};

export const isCodEnabled = async (db) => {
  if (process.env.COD_ENABLED === "false") return false;
  if (process.env.COD_ENABLED === "true") return true;
  const result = await db.query("SELECT cod_enabled FROM settings ORDER BY id LIMIT 1");
  return result.rows[0]?.cod_enabled ?? true;
};
