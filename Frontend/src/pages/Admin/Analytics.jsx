import { useEffect, useState } from "react";
import API from "../../../API/api.js";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, Minus, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card as UiCard, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { adjustCustomRangeStart, buildAnalyticsParams, getChartTickInterval, getMonthName, getQuarterLabel, getReportingYears, QUICK_ANALYTICS_RANGES } from "./analyticsFilters.js";
import { toSelectItems } from "@/lib/selectOptions.js";

const ANALYTICS_TIME_ZONE = "Africa/Addis_Ababa";
const todayInBusinessZone = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const formatAnalyticsDate = (date, options) =>
  new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: ANALYTICS_TIME_ZONE,
  }).format(new Date(`${date}T12:00:00Z`));

const formatPeriodLabel = (periodKey, interval, long = false) => {
  const year = Number(periodKey.slice(0, 4));
  const month = Number(periodKey.slice(5, 7));
  if (interval === "year") return String(year);
  if (interval === "month") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: long ? "long" : "short",
      year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }
  return formatAnalyticsDate(periodKey, long
    ? { weekday: "long", year: "numeric", month: "long", day: "numeric" }
    : { month: "short", day: "numeric" });
};

const PERIOD_TYPES = [
  ["quick", "Quick Range"], ["month", "Month"], ["quarter", "Quarter"],
  ["year", "Year"], ["custom", "Custom Range"], ["all", "All Time"],
];
const INITIAL_FILTER = { kind: "preset", value: "30" };

const formatETB = (value) =>
  `ETB ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const AnalyticsSelect = ({ id, value, onChange, options, className = "" }) => (
  <Select value={String(value)} onValueChange={onChange} items={toSelectItems(options)}>
    <SelectTrigger id={id} className={`h-11 w-full rounded-xl bg-background ${className}`}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map((option) => (
      <SelectItem key={option.value} value={String(option.value)} disabled={option.disabled}>{option.label}</SelectItem>
    ))}</SelectContent>
  </Select>
);

const InfoTooltip = ({ label, children }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Info aria-hidden="true" size={15} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" arrowClassName="bg-popover fill-popover" className="max-w-xs whitespace-normal rounded-lg border border-border bg-popover px-3 py-2 text-left text-popover-foreground shadow-lg">
        {children}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const ComparisonIndicator = ({ metric, label, currency = false, metricName = "activity" }) => {
  if (!metric) return null;
  if (!metric.comparisonAvailable) return <p className="mt-2 text-xs text-muted-foreground">Comparison unavailable</p>;
  const prior = currency ? formatETB(metric.previous) : Number(metric.previous).toLocaleString();
  if (!metric.baselineAvailable) {
    const currentPositive = Number(metric.current) > 0;
    return <p className="mt-2 text-xs text-muted-foreground">{currentPositive ? `New ${metricName} this period` : "No activity in either period"} | previous: {prior}</p>;
  }
  const change = Number(metric.change);
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const description = change > 0 ? "increased" : change < 0 ? "decreased" : "no change";
  const color = change > 0 ? "text-green-700" : change < 0 ? "text-red-700" : "text-gray-600";
  return (
    <p className="mt-2 flex items-center gap-1 text-xs text-gray-600" aria-label={`Compared with ${label}: previous value ${prior}; ${description} by ${Math.abs(change).toFixed(1)} percent`}>
      <span>vs {label}: {prior}</span>
      <span className={`inline-flex items-center gap-0.5 font-semibold ${color}`}>
        <Icon aria-hidden="true" size={14} />
        <span className="sr-only">{description} </span>
        {change > 0 ? "+" : ""}{change.toFixed(1)}%
      </span>
    </p>
  );
};

const CategoryTooltip = ({ active, payload, comparisonAvailable, comparisonUnavailable }) => {
  const category = payload?.[0]?.payload;
  if (!active || !category) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
      <p className="mb-1 font-semibold">{category.name}</p>
      <p>{formatETB(category.revenue)} item revenue ({category.revenueShare.toFixed(1)}% of item revenue)</p>
      <p>{category.unitsSold.toLocaleString()} units | {category.orders.toLocaleString()} distinct orders</p>
      {comparisonAvailable && category.revenueChange !== null && <p>vs previous period: {category.revenueChange > 0 ? "+" : ""}{category.revenueChange.toFixed(1)}%</p>}
      {comparisonUnavailable && <p>Comparison unavailable</p>}
      {comparisonAvailable && category.revenueChange === null && <p>No previous revenue baseline</p>}
    </div>
  );
};

const Analytics = () => {
  const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
  const businessToday = todayInBusinessZone();
  const currentYear = Number(businessToday.slice(0, 4));
  const currentMonth = businessToday.slice(0, 7);
  const currentQuarter = Math.floor((Number(currentMonth.slice(5, 7)) - 1) / 3) + 1;
  const [filterMode, setFilterMode] = useState("quick");
  const [activeFilter, setActiveFilter] = useState(INITIAL_FILTER);
  const [periodPending, setPeriodPending] = useState(false);
  const [quickRange, setQuickRange] = useState("30");
  const [monthValue, setMonthValue] = useState(currentMonth);
  const [quarterValue, setQuarterValue] = useState(String(currentQuarter));
  const [yearValue, setYearValue] = useState(String(currentYear));
  const [yearlyValue, setYearlyValue] = useState(String(currentYear));
  const [customStart, setCustomStart] = useState(businessToday);
  const [customEnd, setCustomEnd] = useState(businessToday);
  const [quarterInterval, setQuarterInterval] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState({
    revenue: 0,
    orders: 0,
    averageOrder: 0,
    customers: 0,
    revenueByCategory: [],
    secondaryMetrics: {
      itemsSold: 0,
      revenuePerCustomer: 0,
      cancellationRate: null,
      cancelledOrders: 0,
      placedOrders: 0,
      returningCustomers: 0,
      repeatOrders: 0,
      itemRevenue: 0,
      shippingRevenue: 0,
      netRevenue: 0,
    },
    ordersFrequency: [],
    revenueTrend: [],
    bestSellingProducts: [],
    comparison: null,
    comparisonUnavailable: false,
    paymentPerformance: { successfulOrders: 0, pendingOrders: 0, pendingAmount: 0, expiredUnpaidChapaOrders: 0, latePaymentReviewOrders: 0, methods: [] },
    refundSummary: { confirmedCount: 0, confirmedAmount: 0, pendingCount: 0, approvedNotCompletedCount: 0 },
    orderStatusBreakdown: [],
    lowStockProducts: [],
    availableDateRange: { startDate: businessToday, endDate: businessToday },
    productSort: "units",
  });
  const [productSort, setProductSort] = useState("units");
  const requestParams = buildAnalyticsParams(activeFilter, productSort).toString();
  const activateFilter = (nextFilter) => {
    if (buildAnalyticsParams(nextFilter, productSort).toString() !== requestParams) {
      setLoading(true);
      setDataLoaded(false);
      setError("");
    }
    setActiveFilter(nextFilter);
  };
  const updateProductSort = (nextSort) => {
    if (nextSort !== productSort) {
      setLoading(true);
      setDataLoaded(false);
      setError("");
      setProductSort(nextSort);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await API.get(`/trueanalytics?${requestParams}`, {
          signal: controller.signal,
        });
        if (!active) return;
        const data = response.data;
        setAnalytics({
          ...data,
          revenueByCategory: data.revenueByCategory.map((item) => ({ ...item, revenue: Number(item.revenue) })),
          revenueTrend: data.revenueTrend.map((item) => ({
            ...item,
            dateLabel: formatPeriodLabel(item.periodKey, data.period.interval),
            revenue: Number(item.revenue),
          })),
          ordersFrequency: data.ordersFrequency.map((item) => ({
            ...item,
            dateLabel: formatPeriodLabel(item.periodKey, data.period.interval),
            orders: Number(item.orders),
          })),
          bestSellingProducts: data.bestSellingProducts.map((item) => ({
            ...item,
            sold: Number(item.sold),
            revenue: Number(item.revenue),
            itemRevenueShare: Number(item.itemRevenueShare),
          })),
        });
        setDataLoaded(true);
      } catch (requestError) {
        if (requestError.code !== "ERR_CANCELED" && active) {
          setError("Analytics could not be loaded. Please try again.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestParams, requestVersion]);

  const earliestDate = analytics.availableDateRange?.startDate ?? businessToday;
  const yearOptions = getReportingYears(analytics.availableDateRange, businessToday);
  const earliestYear = yearOptions.at(-1);
  const earliestMonth = Number(earliestDate.slice(5, 7));
  const minQuarter = (year) => year === earliestYear ? Math.ceil(earliestMonth / 3) : 1;
  const maxQuarter = (year) => year === currentYear ? currentQuarter : 4;

  const updateMonthPeriod = (value) => {
    const [year, month] = value.split("-").map(Number);
    const minMonth = year === earliestYear ? earliestMonth : 1;
    const maxMonth = year === currentYear ? Number(currentMonth.slice(5, 7)) : 12;
    const safeMonth = Math.min(Math.max(month, minMonth), maxMonth);
    const nextValue = `${year}-${String(safeMonth).padStart(2, "0")}`;
    setMonthValue(nextValue);
    activateFilter({ kind: "month", values: { year: String(year), month: String(safeMonth) } });
    setPeriodPending(false);
  };

  const updateQuarterPeriod = (yearValueNext, quarterValueNext, interval = quarterInterval) => {
    const year = Number(yearValueNext);
    const quarter = Math.min(Math.max(Number(quarterValueNext), minQuarter(year)), maxQuarter(year));
    const nextYear = String(year);
    const nextQuarter = String(quarter);
    setYearValue(nextYear);
    setQuarterValue(nextQuarter);
    activateFilter({ kind: "quarter", values: { year: nextYear, quarter: nextQuarter, interval } });
    setPeriodPending(false);
  };

  const updateYearPeriod = (value) => {
    setYearlyValue(value);
    activateFilter({ kind: "year", values: { year: value } });
    setPeriodPending(false);
  };

  const exportAnalytics = async () => {
    if (exporting || loading) return;
    setExporting(true);
    setExportError("");
    try {
      const params = buildAnalyticsParams(activeFilter, productSort);
      const response = await API.get(`/trueanalytics/export?${params.toString()}`, { responseType: "blob" });
      const contentType = response.headers["content-type"]?.split(";")[0].trim().toLowerCase();
      const blob = response.data;
      if (contentType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        || !(blob instanceof Blob) || blob.size < 4 || (await blob.slice(0, 2).text()) !== "PK") {
        const body = blob instanceof Blob ? await blob.text() : "";
        let message = "The server returned an invalid Excel file.";
        try { message = JSON.parse(body).message || message; } catch { /* Keep the safe fallback. */ }
        throw new Error(message);
      }
      const suppliedName = response.headers["content-disposition"]?.match(/filename="([^"]+)"/)?.[1];
      const filename = (suppliedName || "store-analytics.xlsx").replace(/[^\w.-]/g, "-").replace(/\.{2,}/g, ".");
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename.endsWith(".xlsx") ? filename : "store-analytics.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (requestError) {
      if (requestError.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await requestError.response.data.text());
          setExportError(payload.message || "Excel export could not be generated. Please try again.");
        } catch {
          setExportError("Excel export could not be generated. Please try again.");
        }
      } else {
        setExportError(requestError.message || "Excel export could not be generated. Please try again.");
      }
    } finally {
      setExporting(false);
    }
  };

  const selectPeriodType = (mode) => {
    setFilterMode(mode);
    setPeriodPending(mode === "custom");
    if (mode === "quick") activateFilter({ kind: "preset", value: quickRange });
    if (mode === "all") activateFilter({ kind: "preset", value: "all" });
    if (mode === "month") {
      const [year, month] = monthValue.split("-");
      activateFilter({ kind: "month", values: { year, month: String(Number(month)) } });
    }
    if (mode === "quarter") activateFilter({ kind: "quarter", values: { year: yearValue, quarter: quarterValue, interval: quarterInterval } });
    if (mode === "year") activateFilter({ kind: "year", values: { year: yearlyValue } });
  };

  const selectQuickRange = (value) => {
    setPeriodPending(false);
    setQuickRange(value);
    activateFilter({ kind: "preset", value });
  };

  const moveYear = (amount) => {
    const nextYear = Math.min(Math.max(Number(yearlyValue) + amount, earliestYear), currentYear);
    updateYearPeriod(String(nextYear));
  };

  const monthParts = monthValue.split("-").map(Number);
  const customRangeError = !customStart || !customEnd
    ? "Choose both a start date and an end date."
    : customStart < earliestDate || customEnd < earliestDate
      ? "Choose dates on or after the store's earliest recorded order."
    : customStart > customEnd
      ? "Start date must be on or before the end date."
      : customEnd > businessToday
        ? "Future dates are not available for analytics."
        : "";

  const applyFilter = () => {
    if (filterMode === "custom" && !customRangeError) {
      activateFilter({ kind: "custom", values: { startDate: customStart, endDate: customEnd } });
      setPeriodPending(false);
    }
  };

  const retryAnalytics = () => {
    setLoading(true);
    setDataLoaded(false);
    setError("");
    setRequestVersion((version) => version + 1);
  };

  const metricComparison = (key, options = {}) => analytics.comparison
    ? <ComparisonIndicator metric={analytics.comparison.metrics[key]} label={analytics.comparison.label} {...options} />
    : analytics.comparisonUnavailable
      ? <p className="mt-2 text-xs text-muted-foreground">Comparison unavailable</p>
      : null;

  if (!loading && error && !dataLoaded) {
    return <div className="space-y-4 p-4 sm:p-6"><h1 className="text-2xl font-semibold">Store Analytics</h1><Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{error}<Button variant="outline" onClick={retryAnalytics}>Try again</Button></AlertDescription></Alert></div>;
  }

  if (loading) {
    return (
      <div className="p-6 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="space-y-3">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-5 w-64" />
          </div>

          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>

        {/* Summary Cards */}
        <div
          className="
        grid
        grid-cols-1
        md:grid-cols-4
        gap-5
        "
        >
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="
            bg-white
            rounded-xl
            border
            shadow
            p-5
            space-y-4
            "
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>

        {/* Pie + Bar Charts */}
        <div
          className="
        grid
        grid-cols-1
        lg:grid-cols-2
        gap-6
        "
        >
          {[1, 2].map((item) => (
            <div
              key={item}
              className="
            bg-white
            rounded-xl
            border
            shadow
            p-6
            "
            >
              <Skeleton className="h-6 w-44 mb-6" />

              <Skeleton
                className="
              h-[350px]
              w-full
              rounded-xl
              "
              />
            </div>
          ))}
        </div>

        {/* Revenue Trend */}
        <div
          className="
        bg-white
        rounded-xl
        border
        shadow
        p-6
        "
        >
          <Skeleton className="h-6 w-40 mb-6" />

          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>

        {/* Best Products Table */}
        <div
          className="
        bg-white
        rounded-xl
        border
        shadow
        p-6
        "
        >
          <Skeleton className="h-7 w-56 mb-6" />

          <div className="space-y-5">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="
              flex
              items-center
              gap-4
              "
              >
                <Skeleton className="h-12 w-12 rounded-md" />

                <Skeleton className="h-5 w-48" />

                <Skeleton className="h-5 w-24 ml-auto" />

                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="
      p-4 sm:p-6
      space-y-8
    "
    >
      {/* HEADER */}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex-1">
          <h1
            className="
            text-3xl
            font-bold
          "
          >
            Admin Analytics
          </h1>

          <p
            className="
            text-gray-500
          "
          >
            Detailed store performance
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Paid orders by order creation date (Africa/Addis_Ababa); totals include shipping and are shown before confirmed refunds
          </p>
        </div>

        <section aria-label="Analytics reporting period" className="w-full max-w-3xl space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(14rem,1.2fr)] sm:items-start">
            <div>
              <label htmlFor="analytics-period-type" className="mb-1.5 block text-sm font-semibold text-foreground">Reporting period</label>
              <Select value={filterMode} onValueChange={selectPeriodType}>
                <SelectTrigger id="analytics-period-type" className="h-11 w-full rounded-xl bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>{PERIOD_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {filterMode === "quick" && (
              <div>
                <label htmlFor="analytics-quick-range" className="mb-1.5 block text-sm font-medium text-foreground">Quick range</label>
                <Select value={quickRange} onValueChange={selectQuickRange} items={toSelectItems(QUICK_ANALYTICS_RANGES.map(([value, label]) => ({ value, label })))}>
                  <SelectTrigger id="analytics-quick-range" className="h-11 w-full rounded-xl bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>{QUICK_ANALYTICS_RANGES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {filterMode === "month" && (
              <div className="grid min-w-0 grid-cols-2 items-end gap-3">
                <div className="min-w-0"><label htmlFor="analytics-month" className="mb-1.5 block text-sm font-medium text-foreground">Month</label>
                  <AnalyticsSelect id="analytics-month" value={String(monthParts[1]).padStart(2, "0")} onChange={(month) => updateMonthPeriod(`${monthParts[0]}-${month}`)}
                    options={Array.from({ length: 12 }, (_, index) => {
                      const month = index + 1;
                      const min = monthParts[0] === earliestYear ? earliestMonth : 1;
                      const max = monthParts[0] === currentYear ? Number(currentMonth.slice(5, 7)) : 12;
                      return { value: String(month).padStart(2, "0"), label: getMonthName(month), disabled: month < min || month > max };
                    })} />
                </div>
                <div className="min-w-0"><label htmlFor="analytics-month-year" className="mb-1.5 block text-sm font-medium text-foreground">Year</label>
                  <AnalyticsSelect id="analytics-month-year" value={monthParts[0]} onChange={(year) => updateMonthPeriod(`${year}-${String(monthParts[1]).padStart(2, "0")}`)} options={yearOptions.map((year) => ({ value: year, label: year }))} />
                </div>
              </div>
            )}

            {filterMode === "quarter" && (
              <div className="grid min-w-0 grid-cols-2 items-end gap-3">
                <div className="col-span-2 min-w-0"><label htmlFor="analytics-quarter" className="mb-1.5 block text-sm font-medium text-foreground">Quarter</label>
                  <AnalyticsSelect id="analytics-quarter" value={quarterValue} onChange={(quarter) => updateQuarterPeriod(yearValue, quarter)} options={[1, 2, 3, 4].map((quarter) => ({ value: String(quarter), label: getQuarterLabel(quarter), disabled: quarter < minQuarter(Number(yearValue)) || quarter > maxQuarter(Number(yearValue)) }))} />
                </div>
                <div className="min-w-0"><label htmlFor="analytics-quarter-year" className="mb-1.5 block text-sm font-medium text-foreground">Year</label>
                  <AnalyticsSelect id="analytics-quarter-year" value={yearValue} onChange={(year) => updateQuarterPeriod(year, quarterValue)} options={yearOptions.map((year) => ({ value: year, label: year }))} />
                </div>
                <div className="min-w-0"><label htmlFor="analytics-quarter-interval" className="mb-1.5 block text-sm font-medium text-foreground">Chart interval</label>
                  <AnalyticsSelect id="analytics-quarter-interval" value={quarterInterval} onChange={(interval) => { setQuarterInterval(interval); updateQuarterPeriod(yearValue, quarterValue, interval); }} options={[{ value: "monthly", label: "Monthly" }, { value: "daily", label: "Daily detail" }]} />
                </div>
              </div>
            )}

            {filterMode === "year" && (
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2">
                <Button type="button" variant="outline" size="icon" aria-label="Previous year" onClick={() => moveYear(-1)} disabled={Number(yearlyValue) <= earliestYear}><ChevronLeft /></Button>
                <div className="min-w-0"><label htmlFor="analytics-year" className="mb-1.5 block text-sm font-medium text-foreground">Year</label>
                  <AnalyticsSelect id="analytics-year" value={yearlyValue} onChange={updateYearPeriod} options={yearOptions.map((year) => ({ value: year, label: year }))} />
                </div>
                <Button type="button" variant="outline" size="icon" aria-label="Next year" onClick={() => moveYear(1)} disabled={Number(yearlyValue) >= currentYear}><ChevronRight /></Button>
              </div>
            )}

            {filterMode === "custom" && (
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="analytics-start" className="mb-1.5 block text-sm font-medium text-foreground">Start date</label>
                  <Input id="analytics-start" type="date" min={earliestDate} max={businessToday} value={customStart} onChange={(event) => {
                    const start = event.target.value;
                    const adjusted = adjustCustomRangeStart(start, customEnd);
                    setCustomStart(adjusted.startDate);
                    setCustomEnd(adjusted.endDate);
                    setPeriodPending(true);
                  }} aria-invalid={Boolean(customRangeError)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <div>
                  <label htmlFor="analytics-end" className="mb-1.5 block text-sm font-medium text-foreground">End date</label>
                  <Input id="analytics-end" type="date" min={customStart || earliestDate} max={businessToday} value={customEnd} onChange={(event) => { setPeriodPending(true); setCustomEnd(event.target.value); }} aria-invalid={Boolean(customRangeError)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                {customRangeError && <p className="sm:col-span-2 text-sm text-destructive" role="alert">{customRangeError}</p>}
                <p className="sm:col-span-2 text-sm text-muted-foreground">Selected: {customStart || "Not set"} to {customEnd || "Not set"}</p>
                <Button type="button" onClick={applyFilter} disabled={Boolean(customRangeError)} className="sm:col-start-2 sm:justify-self-end">Apply custom range</Button>
              </div>
            )}

            {filterMode === "all" && <p className="rounded-xl bg-muted px-4 py-3 text-sm font-medium text-foreground">All Time | Adaptive monthly or yearly aggregation</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm text-muted-foreground" aria-live="polite">
            <span>Showing <strong className="font-semibold text-foreground">{analytics.period?.label ?? "Last 30 Days"}</strong>{analytics.period?.interval && ` | ${analytics.period.interval} view`}</span>
          </div>
        </section>
        <div className="flex flex-col gap-2 xl:pt-1">
          <Button type="button" onClick={exportAnalytics} disabled={loading || exporting || periodPending}
            aria-busy={exporting}
            className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary focus-visible:ring-offset-2">
            {exporting ? "Preparing Excel..." : "Export Excel"}
          </Button>
          <p role="status" aria-live="polite" className="sr-only">{exporting ? "Preparing analytics Excel workbook" : ""}</p>
          {periodPending && <p className="max-w-56 text-xs text-muted-foreground">Apply the custom date range before exporting.</p>}
          {exportError && <p role="alert" className="max-w-56 text-sm text-red-700">{exportError}</p>}
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <span>{error}</span>{" "}
        <button type="button" onClick={retryAnalytics} className="ml-2 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700">Try again</button>
      </div>}

      <AnalyticsCharts analytics={analytics} colors={COLORS} />
      <AnalyticsPerformanceTables analytics={analytics} productSort={productSort} setProductSort={updateProductSort} />

      <section aria-label="Core KPI cards" className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Core KPIs</h2>
      <div
        className="
        grid
        grid-cols-1
        md:grid-cols-4
        gap-5
      "
      >
        <Card
          title="Gross Revenue"
          value={formatETB(analytics.revenue)}
          comparison={metricComparison("revenue", { currency: true, metricName: "revenue" })}
        />

        <Card title="Paid Orders" value={analytics.orders}
          comparison={metricComparison("orders", { metricName: "orders" })} />

        <Card
          title="Average Order Value"
          value={formatETB(analytics.averageOrder)}
          comparison={metricComparison("averageOrder", { currency: true, metricName: "average order value" })}
        />

        <Card title="Customers with Paid Orders" value={analytics.customers}
          comparison={metricComparison("customers", { metricName: "customers" })} />
      </div>

      <section aria-label="Additional period metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SecondaryMetric title="Items Sold" value={analytics.secondaryMetrics.itemsSold.toLocaleString()}
          tooltip="Total quantity of items in qualifying successful orders during the selected period." />
        <SecondaryMetric title="Average Items per Paid Order" value={analytics.orders > 0 ? (analytics.secondaryMetrics.itemsSold / analytics.orders).toFixed(1) : "Not available"}
          tooltip="Items sold divided by qualifying paid order count; refunded orders remain in that paid-order cohort." />
        <SecondaryMetric title="Revenue per Customer" value={formatETB(analytics.secondaryMetrics.revenuePerCustomer)}
          tooltip="Gross paid-order totals, including shipping and before confirmed refunds, divided by distinct customers with paid orders in this period." />
        <SecondaryMetric title="Cancellation Rate" value={analytics.secondaryMetrics.cancellationRate === null ? "Unavailable" : `${analytics.secondaryMetrics.cancellationRate.toFixed(1)}%`}
          detail={`${analytics.secondaryMetrics.cancelledOrders.toLocaleString()} cancelled of ${analytics.secondaryMetrics.placedOrders.toLocaleString()} placed`}
          tooltip="Cancelled orders divided by all orders placed in this period. This does not indicate whether a refund was issued." />
        <SecondaryMetric title="Returning Customers" value={analytics.secondaryMetrics.returningCustomers.toLocaleString()}
          detail={`${analytics.secondaryMetrics.repeatOrders.toLocaleString()} repeat orders in period`}
          tooltip="Returning customers placed a paid order before this period and at least one paid order in it. Repeat orders count paid orders beyond each customer's first paid order during this period." />
      </section>
      </section>

      <section aria-label="Sales summary" className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Sales Summary</h2>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <span>Gross sales: <strong className="text-foreground">{formatETB(analytics.revenue)}</strong></span>
        <span>Shipping: <strong className="text-foreground">{formatETB(analytics.secondaryMetrics.shippingRevenue)}</strong></span>
        <span>Item sales: <strong className="text-foreground">{formatETB(analytics.secondaryMetrics.itemRevenue)}</strong></span>
        <span>Confirmed refunds: <strong className="text-foreground">{formatETB(analytics.refundSummary.confirmedAmount)}</strong></span>
        <span>Net sales: <strong className="text-foreground">{formatETB(analytics.secondaryMetrics.netRevenue)}</strong></span>
        <Badge variant="secondary">Discounts not tracked</Badge>
        <InfoTooltip label="Revenue metric definitions">
          Gross sales sum orders.total_price for successful or later-refunded orders, including shipping. Net sales subtract confirmed refund amounts. Item sales use historical order-item quantity multiplied by price_at_purchase and are shown before refunds. Discounts are not represented separately in the current schema.
        </InfoTooltip>
      </div>
      </section>

      <section aria-label="Payments, orders, refunds, and inventory" className="grid gap-4 xl:grid-cols-2">
        <UiCard>
          <CardHeader><CardTitle>Payment performance</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CompactMetric title="Paid orders" value={analytics.paymentPerformance.successfulOrders.toLocaleString()} />
              <CompactMetric title="Pending" value={analytics.paymentPerformance.pendingOrders.toLocaleString()} detail={formatETB(analytics.paymentPerformance.pendingAmount)} />
              <CompactMetric title="Expired Chapa" value={analytics.paymentPerformance.expiredUnpaidChapaOrders.toLocaleString()} />
              <CompactMetric title="Late payment review" value={analytics.paymentPerformance.latePaymentReviewOrders.toLocaleString()} />
            </div>
            <p className="text-xs text-muted-foreground">Payment success rate unavailable: the stored payment rows do not distinguish initialized provider attempts from locally created records.</p>
            <div className="flex flex-wrap gap-2">{analytics.paymentPerformance.methods.map((method) => <Badge key={method.method ?? "unknown"} variant="outline">{String(method.method ?? "Unspecified").replaceAll("_", " ")}: {method.paidOrders}/{method.orders} paid | {formatETB(method.paidAmount)}</Badge>)}</div>
          </CardContent>
        </UiCard>
        <UiCard>
          <CardHeader><CardTitle>Order status breakdown</CardTitle><p className="text-sm text-muted-foreground">Current status of orders created in this period.</p></CardHeader>
          <CardContent className="flex flex-wrap gap-2">{analytics.orderStatusBreakdown.length ? analytics.orderStatusBreakdown.map((entry) => <Badge key={entry.status} variant="secondary">{String(entry.status).replaceAll("_", " ")}: {entry.orders.toLocaleString()}</Badge>) : <p className="text-sm text-muted-foreground">No orders in this period.</p>}</CardContent>
        </UiCard>
        <UiCard>
          <CardHeader><CardTitle>Refund summary</CardTitle><p className="text-sm text-muted-foreground">Refund records are scoped by order creation date.</p></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CompactMetric title="Confirmed" value={analytics.refundSummary.confirmedCount.toLocaleString()} detail={formatETB(analytics.refundSummary.confirmedAmount)} />
            <CompactMetric title="Pending" value={analytics.refundSummary.pendingCount.toLocaleString()} />
            <CompactMetric title="Approved, incomplete" value={analytics.refundSummary.approvedNotCompletedCount.toLocaleString()} />
            <CompactMetric title="Net sales" value={formatETB(analytics.secondaryMetrics.netRevenue)} />
          </CardContent>
        </UiCard>
        <UiCard>
          <CardHeader><CardTitle>Low stock</CardTitle><p className="text-sm text-muted-foreground">Existing inventory rule: 10 units or fewer.</p></CardHeader>
          <CardContent className="space-y-2">{analytics.lowStockProducts.length ? analytics.lowStockProducts.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"><span className="truncate">{product.title}</span><Badge variant={product.stock === 0 ? "destructive" : "secondary"}>{product.stock === 0 ? "Out of stock" : `${product.stock} left`}</Badge></div>) : <p className="text-sm text-muted-foreground">No products are at or below the low-stock threshold.</p>}</CardContent>
        </UiCard>
      </section>


    </div>
  );
};

const Card = ({ title, value, comparison }) => {
  return (
    <UiCard>
      <CardHeader className="pb-0"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {comparison && <div className="mt-2">{comparison}</div>}
      </CardContent>
    </UiCard>
  );
};

const SecondaryMetric = ({ title, value, detail, tooltip }) => (
  <div className="rounded-xl border border-border bg-card p-3 text-card-foreground">
    <div className="flex items-center gap-1">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <InfoTooltip label={`${title} definition`}>{tooltip}</InfoTooltip>
    </div>
    <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    {detail && <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>}
  </div>
);

const CompactMetric = ({ title, value, detail }) => (
  <div className="min-w-0 space-y-1">
    <p className="text-xs font-medium text-muted-foreground">{title}</p>
    <p className="break-words text-lg font-semibold tracking-tight text-foreground">{value}</p>
    {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
  </div>
);

const AnalyticsCharts = ({ analytics, colors }) => {
  const categoryData = analytics.revenueByCategory.filter((category) => category.revenue > 0);
  const busiestOrderPeriod = analytics.ordersFrequency.reduce((busiest, point) =>
    !busiest || point.orders > busiest.orders ? point : busiest, null);
  const averageOrdersPerInterval = analytics.ordersFrequency.length > 0
    ? analytics.orders / analytics.ordersFrequency.length
    : 0;
  const trendRevenueTotal = analytics.revenueTrend.reduce((sum, point) => sum + Number(point.revenue || 0), 0);
  const intervalLabel = analytics.period?.interval ?? "day";

  return (
    <div className="space-y-5" aria-label="Analytics charts">
      <section className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2" aria-label="Revenue and order trends">
        <div className="chart-card">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="chart-title analytics-trend-title mb-1">Revenue Trend</h2><p className="text-[0.8125rem] text-muted-foreground">{analytics.period?.label} | {intervalLabel} intervals</p></div>
            <p className="text-[0.8125rem] font-medium text-foreground">Gross sales: {formatETB(analytics.revenue)}</p>
          </div>
          <p className="mb-3 text-[0.6875rem] text-muted-foreground">Chart total {formatETB(trendRevenueTotal)} | summary total {formatETB(analytics.revenue)}</p>
          {analytics.revenueTrend.length === 0 ? <div className="flex h-[320px] items-center justify-center rounded-lg bg-muted/40 text-[0.8125rem] text-muted-foreground">No revenue periods to chart.</div> : (
            <ResponsiveContainer width="100%" height={320} minWidth={0}>
              <AreaChart data={analytics.revenueTrend} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                <defs><linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.8} /><stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateLabel" interval={getChartTickInterval(analytics.revenueTrend.length)} minTickGap={24} tickMargin={9} height={36} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis width={88} tickMargin={8} minTickGap={22} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(value) => `ETB ${Number(value).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`} />
                <ChartTooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.periodKey ? formatPeriodLabel(payload[0].payload.periodKey, intervalLabel, true) : ""} formatter={(value) => [formatETB(value), "Gross sales"]} contentStyle={{ fontSize: 12 }} itemStyle={{ fontSize: 12 }} labelStyle={{ fontSize: 12 }} />
                <Area isAnimationActive={false} type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={3} fill="url(#colorRevenue)" connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {analytics.revenueTrend.length > 0 && trendRevenueTotal === 0 && <p className="mt-2 text-center text-[0.8125rem] text-muted-foreground">No paid revenue in this period.</p>}
        </div>

        <div className="chart-card">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="chart-title analytics-trend-title mb-1">Orders Frequency</h2><p className="text-[0.8125rem] text-muted-foreground">{analytics.period?.label} | {intervalLabel} intervals</p></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-muted-foreground">
              <span>Total <strong className="text-foreground">{analytics.orders.toLocaleString()}</strong></span>
              <span>Average <strong className="text-foreground">{averageOrdersPerInterval.toFixed(1)}</strong> per interval</span>
              <span>Busiest <strong className="text-foreground">{busiestOrderPeriod?.orders > 0 ? `${formatPeriodLabel(busiestOrderPeriod.periodKey, intervalLabel)} (${busiestOrderPeriod.orders})` : "No orders"}</strong></span>
            </div>
          </div>
          {analytics.ordersFrequency.length === 0 ? <div className="flex h-[320px] items-center justify-center rounded-lg bg-muted/40 text-[0.8125rem] text-muted-foreground">No order periods to chart.</div> : (
            <ResponsiveContainer width="100%" height={320} minWidth={0}>
              <BarChart data={analytics.ordersFrequency} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateLabel" interval={getChartTickInterval(analytics.ordersFrequency.length)} minTickGap={24} tickMargin={9} height={36} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis width={48} allowDecimals={false} tickMargin={8} minTickGap={22} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <ChartTooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.periodKey ? formatPeriodLabel(payload[0].payload.periodKey, intervalLabel, true) : ""} formatter={(value) => [Number(value).toLocaleString(), "Paid orders"]} contentStyle={{ fontSize: 12 }} itemStyle={{ fontSize: 12 }} labelStyle={{ fontSize: 12 }} />
                <Bar dataKey="orders" isAnimationActive={false} fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {analytics.ordersFrequency.length > 0 && analytics.orders === 0 && <p className="mt-2 text-center text-[0.8125rem] text-muted-foreground">No paid orders in this period.</p>}
        </div>
      </section>

      <div className="chart-card">
        <h2 className="chart-title mb-1">Item Revenue by Category</h2>
        <p className="mb-2 text-sm text-muted-foreground">{analytics.period?.label} | historical item sales by each product's current category</p>
        {categoryData.length === 0 ? <div className="flex h-[280px] items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">No category item sales in this period.</div> : (
          <ResponsiveContainer width="100%" height={320} minWidth={0}>
            <PieChart>
              <Pie isAnimationActive={false} data={categoryData} dataKey="revenue" nameKey="name" cx="50%" cy="50%" innerRadius={68} outerRadius={112} paddingAngle={3} label={false}>
                {categoryData.map((entry, index) => <Cell key={entry.category_id ?? `category-${index}`} fill={colors[index % colors.length]} />)}
              </Pie>
              <ChartTooltip content={<CategoryTooltip comparisonAvailable={Boolean(analytics.comparison)} comparisonUnavailable={analytics.comparisonUnavailable} />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

const AnalyticsPerformanceTables = ({ analytics, productSort, setProductSort }) => (
  <div className="space-y-5" aria-label="Category and product performance">
    <UiCard>
      <CardHeader><CardTitle>Category Performance</CardTitle><p className="text-sm text-muted-foreground">Historical item revenue follows each product's current category. An order can appear in multiple category order counts.</p></CardHeader>
      <CardContent><Table className="min-w-[760px]"><TableHeader><TableRow>
        <TableHead>Category</TableHead><TableHead>Item Revenue</TableHead><TableHead>Units Sold</TableHead>
        <TableHead>Distinct Orders</TableHead><TableHead>Item Revenue Share</TableHead><TableHead>{analytics.comparison ? `vs ${analytics.comparison.label}` : "Comparison"}</TableHead>
      </TableRow></TableHeader>
        <TableBody>
          {analytics.revenueByCategory.length === 0 ? <TableRow><TableCell colSpan="6" className="h-24 text-center text-muted-foreground">No category sales in this period.</TableCell></TableRow> : analytics.revenueByCategory.map((category) => (
            <TableRow key={category.category_id ?? "uncategorized"}>
              <TableCell className="font-medium">{category.name}</TableCell><TableCell>{formatETB(category.revenue)}</TableCell>
              <TableCell>{category.unitsSold.toLocaleString()}</TableCell><TableCell>{category.orders.toLocaleString()}</TableCell>
              <TableCell>{category.revenueShare.toFixed(1)}%</TableCell>
              <TableCell>{analytics.comparisonUnavailable ? "Comparison unavailable" : !analytics.comparison ? "Not available for All Time" : category.revenueChange === null ? "No previous baseline" : `${category.revenueChange > 0 ? "+" : ""}${category.revenueChange.toFixed(1)}%`}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></CardContent>
    </UiCard>

    <UiCard>
      <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
        <div><CardTitle>Best Selling Products</CardTitle><p className="text-sm text-muted-foreground">{analytics.period?.label} | ranked by {productSort === "units" ? "units sold" : "item revenue"}</p></div>
        <div className="flex items-center gap-2"><label htmlFor="product-ranking" className="text-sm font-medium text-foreground">Sort by</label><AnalyticsSelect id="product-ranking" value={productSort} onChange={setProductSort} options={[{ value: "units", label: "Units Sold" }, { value: "revenue", label: "Item Revenue" }]} /></div>
      </CardHeader>
      <CardContent><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Product</TableHead><TableHead>Units Sold</TableHead><TableHead>Item Revenue</TableHead><TableHead>Share of Item Revenue</TableHead></TableRow></TableHeader>
        <TableBody>
          {analytics.bestSellingProducts.length === 0 ? <TableRow><TableCell colSpan="5" className="h-24 text-center text-muted-foreground">No products sold in this period.</TableCell></TableRow> : analytics.bestSellingProducts.map((product, index) => (
            <TableRow key={product.id}>
              <TableCell>#{index + 1}</TableCell>
              <TableCell><div className="flex min-w-0 items-center gap-3"><img src={product.image_url} alt="" className="size-12 shrink-0 rounded-md object-cover" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /><span className="truncate">{product.title}</span></div></TableCell>
              <TableCell>{product.sold.toLocaleString()}</TableCell><TableCell>{formatETB(product.revenue)}</TableCell><TableCell>{product.itemRevenueShare.toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></CardContent>
    </UiCard>
  </div>
);

export default Analytics;
