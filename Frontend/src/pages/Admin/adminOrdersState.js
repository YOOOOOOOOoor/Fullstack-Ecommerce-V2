export const ADMIN_ORDERS_VIEW_KEY = "admin-orders-view";

const ASSIGNABLE_ORDER_STATUSES = new Set([
  "ready_for_dispatch",
  "delivery_failed",
  "assigned_to_driver",
]);

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readOrdersView(storage = browserStorage()) {
  try {
    const saved = storage?.getItem(ADMIN_ORDERS_VIEW_KEY);
    return saved === "table" ? "table" : "grid";
  } catch {
    return "grid";
  }
}

export function writeOrdersView(view, storage = browserStorage()) {
  try {
    storage?.setItem(ADMIN_ORDERS_VIEW_KEY, view);
  } catch {
    // View persistence is optional when browser storage is unavailable.
  }
}

export function canAssignOrder(order, { canPrepareOrders = false } = {}) {
  return ASSIGNABLE_ORDER_STATUSES.has(order?.order_status)
    || (order?.order_status === "processing" && canPrepareOrders);
}

export function orderAssignmentLabel(order) {
  return order?.current_driver_id ? "Reassign" : "Assign Driver";
}

export function buildOrdersQuery(filters, page, limit) {
  return { ...filters, page, limit };
}

export function getInitialDriverSelection(order, drivers) {
  if (!order?.current_driver_id) return "";
  return drivers.some((driver) => String(driver.user_id) === String(order.current_driver_id))
    ? String(order.current_driver_id)
    : "";
}

export function driverOptionLabel(driver) {
  return `${driver.name} · ${driver.email} · ${Number(driver.active_deliveries) || 0} active`;
}

export function applyDriverAssignment(orders, orderId, driver) {
  return orders.map((order) => String(order.id) === String(orderId)
    ? { ...order, order_status: "assigned_to_driver", current_driver_id: driver.user_id, current_driver_name: driver.name }
    : order);
}

export function createAssignmentSubmitter(request) {
  let pending = false;
  return async (payload) => {
    if (pending) return { status: "duplicate" };
    pending = true;
    try {
      return { status: "success", data: await request(payload) };
    } catch (error) {
      return { status: "error", error };
    } finally {
      pending = false;
    }
  };
}

export function createOrderAssignmentRequest({ prepareOrder, assignDriver }) {
  return async ({ orderId, driverId, reason, prepare }) => {
    if (prepare) await prepareOrder(orderId);
    return assignDriver({ orderId, driverId, reason });
  };
}
