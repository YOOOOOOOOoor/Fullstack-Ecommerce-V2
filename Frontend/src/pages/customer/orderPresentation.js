const orderLabels = {
  awaiting_payment: "Payment pending",
  payment_under_review: "Payment under review",
  paid: "Processing",
  processing: "Processing",
  ready_for_dispatch: "Processing",
  shipped: "Shipped",
  assigned_to_driver: "Shipped",
  out_for_delivery: "Out for delivery",
  delivery_failed: "Delivery issue",
  delivered: "Delivered",
  cancelled: "Cancelled",
  expired: "Payment window expired",
  returned: "Returned",
};

const paymentLabels = {
  pending: "Payment pending",
  successful: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};

const refundLabels = {
  requested: "Refund under review",
  under_review: "Refund under review",
  approved: "Refund approved",
  awaiting_return: "Return requested",
  return_received: "Return received",
  refund_processing: "Refund processing",
  refund_failed: "Refund needs follow-up",
  refunded: "Refunded",
  rejected: "Refund request declined",
};

export const getOrderLabel = (status) => orderLabels[status] || "Order update";
export const getPaymentLabel = (status) => paymentLabels[status] || "Payment status unavailable";
export const getRefundLabel = (status) => refundLabels[status] || "Refund status unavailable";

export const getCustomerOrderState = (order) => ({
  order: getOrderLabel(order?.order_status),
  payment: getPaymentLabel(order?.payment_status),
  refund: order?.refund_request ? getRefundLabel(order.refund_request.status) : null,
});
