export const dispatchPaymentEligible = ({ payment_method, payment_status }) =>
  payment_method === "chapa"
    ? payment_status === "successful"
    : payment_method === "cod" && ["pending", "successful"].includes(payment_status);

export const isWithinRefundWindow = (deliveredAt, now = Date.now()) => {
  const deliveredTime = new Date(deliveredAt).getTime();
  return Number.isFinite(deliveredTime) && now >= deliveredTime && now <= deliveredTime + 3 * 24 * 60 * 60 * 1000;
};

export const codAmountMatches = (expected, collected) =>
  Number.isFinite(Number(expected)) && Number.isFinite(Number(collected)) &&
  Math.round(Number(expected) * 100) === Math.round(Number(collected) * 100);

export const canStartDeliveryAttempt = (attemptCount, maxAttempts = 3) =>
  Number.isInteger(attemptCount) && attemptCount >= 0 && attemptCount < maxAttempts;

export const canCustomerCancelOrder = (orderStatus) =>
  ["awaiting_payment", "processing", "ready_for_dispatch"].includes(orderStatus);

export const canTransitionAdminOrderStatus = (currentStatus, nextStatus) => {
  if (!["processing", "ready_for_dispatch", "cancelled"].includes(nextStatus)) return false;
  if (["delivered", "cancelled", "returned", "expired"].includes(currentStatus)) return false;
  if (currentStatus === "ready_for_dispatch" && nextStatus === "processing") return false;
  if (["assigned_to_driver", "out_for_delivery", "delivery_failed"].includes(currentStatus) && nextStatus !== "cancelled") return false;
  return true;
};

export const REFUND_TRANSITIONS = Object.freeze({
  requested: ["under_review", "approved", "rejected"],
  under_review: ["approved", "refund_processing", "rejected"],
  awaiting_return: ["return_received"],
  return_received: ["refund_processing"],
  refund_processing: ["refund_failed"],
  refund_failed: ["refund_processing"],
});
