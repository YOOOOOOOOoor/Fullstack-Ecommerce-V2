export const isCancellationRefundCase = (refund) => refund?.request_type === "pre_dispatch_cancellation";

export const canManageRefundCase = (user) => Boolean(
  user?.role === "admin" && user.staff_status === "active" &&
  (user.is_super_admin || user.permissions?.includes("approve_refunds")),
);

export const cancellationRefundActions = (refund) => ({
  beginManualRefund: isCancellationRefundCase(refund) && refund.status === "under_review",
  retryManualRefund: isCancellationRefundCase(refund) && refund.status === "refund_failed",
  recordOutcome: isCancellationRefundCase(refund) && refund.status === "refund_processing",
  completed: isCancellationRefundCase(refund) && refund.status === "refunded",
});
