export const REVENUE_CHART_RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

export function selectRevenueChartRange(nextRange, activeRange, { setRange, setLoading, setError }) {
  if (nextRange === activeRange) return false;
  setError("");
  setLoading(true);
  setRange(nextRange);
  return true;
}

const isCancellation = (error) => error?.name === "AbortError"
  || error?.name === "CanceledError"
  || error?.code === "ERR_CANCELED";

export async function loadRevenueChart({ range, request, isCurrent, onSuccess, onError, onSettled }) {
  try {
    const report = await request({ params: { range } });
    if (isCurrent()) onSuccess(report);
  } catch (error) {
    if (isCurrent() && !isCancellation(error)) onError(error);
  } finally {
    if (isCurrent()) onSettled();
  }
}
