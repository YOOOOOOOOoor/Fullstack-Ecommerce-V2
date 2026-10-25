export const releaseReservedInventory = async (client, orderId) => {
  const released = await client.query(
    `UPDATE orders SET inventory_state='released', updated_at=NOW()
     WHERE id=$1 AND inventory_state='reserved' RETURNING id`,
    [orderId],
  );
  if (!released.rows.length) return false;
  const items = await client.query("SELECT product_id,quantity FROM order_items WHERE order_id=$1", [orderId]);
  for (const item of items.rows) {
    await client.query("UPDATE products SET stock=stock+$1 WHERE id=$2", [item.quantity, item.product_id]);
  }
  return true;
};

// Pre-dispatch cancellation may happen after a successful payment has changed
// the reservation to committed. In both cases stock was deducted and should be
// returned exactly once when the locked order is cancelled.
export const releaseCancellableInventory = async (client, orderId) => {
  const released = await client.query(
    `UPDATE orders SET inventory_state='released', updated_at=NOW()
     WHERE id=$1 AND inventory_state IN ('reserved','committed') RETURNING id`,
    [orderId],
  );
  if (!released.rows.length) return false;
  const items = await client.query("SELECT product_id,quantity FROM order_items WHERE order_id=$1", [orderId]);
  for (const item of items.rows) {
    await client.query("UPDATE products SET stock=stock+$1 WHERE id=$2", [item.quantity, item.product_id]);
  }
  return true;
};
