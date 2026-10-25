export const QUICK_ANALYTICS_RANGES = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["7", "Last 7 Days"],
  ["30", "Last 30 Days"], ["90", "Last 90 Days"], ["this_week", "This Week"],
  ["last_week", "Last Week"], ["this_month", "This Month"], ["last_month", "Last Month"],
  ["this_year", "This Year"], ["last_year", "Last Year"],
];

const QUARTER_MONTH_RANGES = ["January–March", "April–June", "July–September", "October–December"];

export function getQuarterLabel(quarter) {
  const number = Number(quarter);
  if (!Number.isInteger(number) || number < 1 || number > 4) throw new RangeError("Quarter must be 1 through 4");
  return `Q${number} · ${QUARTER_MONTH_RANGES[number - 1]}`;
}

export function buildAnalyticsParams(activeFilter, productSort) {
  const params = new URLSearchParams();
  if (activeFilter.kind === "preset") {
    if (["7", "30", "90", "all"].includes(activeFilter.value)) params.set("range", activeFilter.value);
    else params.set("period", activeFilter.value);
  } else {
    params.set("period", activeFilter.kind);
    Object.entries(activeFilter.values).forEach(([key, value]) => {
      if (activeFilter.kind === "month" && key === "month") {
        const month = Number(value);
        if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError("Month must be 1 through 12");
        params.set(key, String(month));
      } else {
        params.set(key, value);
      }
    });
  }
  params.set("sort", productSort);
  return params;
}

export function getMonthName(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError("Month must be 1 through 12");
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(2024, month - 1, 1)));
}

const isIsoCalendarDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export function getReportingYears(availableDateRange, businessToday) {
  const today = isIsoCalendarDate(businessToday) ? businessToday : null;
  if (!today) throw new TypeError("Expected a valid business date");
  const suppliedStart = availableDateRange?.startDate;
  const firstDate = isIsoCalendarDate(suppliedStart) && suppliedStart <= today ? suppliedStart : today;
  const firstYear = Number(firstDate.slice(0, 4));
  const lastYear = Number(today.slice(0, 4));
  return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index);
}

export function adjustCustomRangeStart(startDate, endDate) {
  return { startDate, endDate: endDate < startDate ? startDate : endDate };
}

export function getChartTickInterval(pointCount, targetTicks = 7) {
  if (!Number.isInteger(pointCount) || pointCount < 0) throw new RangeError("Point count must be a nonnegative integer");
  if (!Number.isInteger(targetTicks) || targetTicks < 1) throw new RangeError("Target tick count must be a positive integer");
  return Math.max(0, Math.ceil(pointCount / targetTicks) - 1);
}
