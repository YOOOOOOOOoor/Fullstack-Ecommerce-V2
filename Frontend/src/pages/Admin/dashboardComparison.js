const message = (text) => ({ type: "message", text });

const readMetric = (value) => {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const zeroBaselineLabels = {
  revenue: "New revenue this period",
  orders: "New orders this period",
  averageOrder: "First recorded average this period",
  customers: "New customers this period",
};

const emptyPeriodLabels = {
  revenue: "No revenue in either period",
  orders: "No orders in either period",
  averageOrder: "No average order value in either period",
  customers: "No new customers in either period",
};

export function getComparisonDisplay(comparison, label, metric = "value") {
  if (!comparison && label === "All time") return message("No previous-period comparison for all time");
  if (!comparison || comparison.comparisonAvailable !== true) {
    return message(`Comparison unavailable · ${label}`);
  }

  const current = readMetric(comparison.current);
  const previous = readMetric(comparison.previous);
  if (current === null || previous === null) return message(`Comparison unavailable · ${label}`);
  if (previous === 0) {
    return message(current === 0
      ? `${emptyPeriodLabels[metric] || "No activity in either period"} · ${label}`
      : zeroBaselineLabels[metric] || `New activity this period · ${label}`);
  }

  const change = ((current - previous) / previous) * 100;
  if (!Number.isFinite(change)) return message(`Comparison unavailable · ${label}`);
  return { type: "change", change, label };
}

export function makeCustomerComparison(currentValue, previousValue, label) {
  const current = readMetric(currentValue);
  const previous = readMetric(previousValue);
  const comparisonAvailable = previous !== null;
  return {
    current,
    previous,
    change: comparisonAvailable && current !== null && previous !== 0 ? ((current - previous) / previous) * 100 : null,
    baselineAvailable: comparisonAvailable && previous !== 0,
    comparisonAvailable,
    label,
  };
}
