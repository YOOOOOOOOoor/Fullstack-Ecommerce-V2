export const REFUND_PAGE_SIZE = 10;

export const readRefundView = (searchParams) => searchParams.get("view") === "table" ? "table" : "grid";

const normalized = (value) => String(value ?? "").trim().toLocaleLowerCase();

export function filterRefundCases(refunds, query, status = "all") {
  const needle = normalized(query);
  return refunds.filter((refund) => {
    if (status !== "all" && refund.status !== status) return false;
    if (!needle) return true;
    return [refund.id, refund.order_id, refund.customer_name, refund.customer_email]
      .some((value) => normalized(value).includes(needle));
  });
}

export function getRefundStatusCounts(refunds) {
  return refunds.reduce((counts, refund) => {
    if (["requested", "under_review"].includes(refund.status)) counts.needsReview += 1;
    else if (["approved", "awaiting_return", "return_received", "refund_processing"].includes(refund.status)) counts.inProgress += 1;
    else if (refund.status === "refunded") counts.completed += 1;
    else if (["rejected", "refund_failed"].includes(refund.status)) counts.failed += 1;
    return counts;
  }, { needsReview: 0, inProgress: 0, completed: 0, failed: 0 });
}

export function paginateRefundCases(refunds, page, pageSize = REFUND_PAGE_SIZE) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeSize = Math.max(1, Math.floor(Number(pageSize) || REFUND_PAGE_SIZE));
  return refunds.slice((safePage - 1) * safeSize, safePage * safeSize);
}
