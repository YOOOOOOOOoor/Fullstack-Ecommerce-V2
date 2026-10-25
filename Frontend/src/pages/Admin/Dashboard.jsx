import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  Eye,
  Package,
  Plus,
  ShoppingBag,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import API from "../../../API/api.js";
import { getComparisonDisplay } from "./dashboardComparison.js";
import { loadRevenueChart, REVENUE_CHART_RANGES, selectRevenueChartRange } from "./revenueChart.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const EMPTY_SERIES = [];
const money = (value) => `ETB ${Number(value || 0).toLocaleString("en-ET", { maximumFractionDigits: 2 })}`;
const compactMoney = (value) => {
  const amount = Number(value) || 0;
  return `ETB ${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(amount)}`;
};
const percent = (value) => `${Math.abs(Number(value)).toLocaleString("en", { maximumFractionDigits: 1 })}%`;
const dayLabel = (value) => {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en", { month: "short", day: "numeric" });
};
const monthLabel = (value) => {
  const [year, month] = String(value).slice(0, 7).split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en", { month: "short", year: "2-digit" });
};
const yearLabel = (value) => String(value).slice(0, 4);
const dateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
};
const titleCaseStatus = (value = "unknown") => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const getStatusVariant = (status = "") => {
  if (["delivered", "paid", "refunded", "successful"].includes(status)) return "success";
  if (["cancelled", "expired", "failed", "delivery_failed"].includes(status)) return "destructive";
  if (["awaiting_payment", "payment_under_review", "pending"].includes(status)) return "warning";
  if (["processing", "shipped", "out_for_delivery", "assigned_to_driver"].includes(status)) return "secondary";
  return "outline";
};

const MetricSkeleton = () => (
  <Card className="min-w-0">
    <CardHeader className="space-y-2 pb-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-32" /></CardHeader>
    <CardContent className="flex items-end justify-between gap-2"><Skeleton className="h-8 w-28" /><Skeleton className="h-10 w-20" /></CardContent>
  </Card>
);

const Trend = ({ comparison, label, metric }) => {
  const display = getComparisonDisplay(comparison, label, metric);
  if (display.type === "message") {
    return <span className="text-xs text-muted-foreground">{display.text}</span>;
  }
  const change = display.change;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : null;
  const color = change > 0 ? "text-emerald-700 dark:text-emerald-300" : change < 0 ? "text-destructive" : "text-muted-foreground";
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>{Icon && <Icon size={14} aria-hidden="true" />}{change === 0 ? "No change" : `${change > 0 ? "+" : "−"}${percent(change)}`}<span className="font-normal text-muted-foreground">· {label}</span></span>;
};

const MetricCard = ({ title, value, icon: Icon, comparison, comparisonMetric, compareLabel, trendLabel, trend = [], dataKey, tooltip, emptyLabel }) => (
  <Card className="min-w-0">
    <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
      <div className="flex min-w-0 items-start gap-2">
        <Icon size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
          <CardDescription className="truncate">{compareLabel}</CardDescription>
        </div>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><button type="button" aria-label={`About ${title}`} className="rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><CircleHelp size={15} /></button></TooltipTrigger>
          <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </CardHeader>
    <CardContent className="flex min-w-0 items-end justify-between gap-2">
      <div className="min-w-0 space-y-2">
        <p className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
        <Trend comparison={comparison} label={comparison?.label || trendLabel || (compareLabel.toLowerCase().includes("all time") ? "All time" : compareLabel)} metric={comparisonMetric} />
        {emptyLabel && <p className="text-xs text-muted-foreground">{emptyLabel}</p>}
      </div>
      <div aria-hidden="true" className="h-11 w-20 shrink-0">
        {trend.length > 1 && <ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><Line type="monotone" dataKey={dataKey} stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>}
      </div>
    </CardContent>
  </Card>
);

const loadDashboardData = async () => {
  const [stats, revenue, stock, orders] = await Promise.all([
    API.get("/admin/analytics/stats"),
    API.get("/admin/analytics/revenue"),
    API.get("/admin/analytics/low-stock"),
    API.get("/admin/analytics/recent-orders"),
  ]);
  const requiredMetrics = [revenue.data?.today, revenue.data?.this_week, revenue.data?.this_month, revenue.data?.this_year, revenue.data?.total_revenue];
  if (requiredMetrics.some((value) => value === null || value === undefined || !Number.isFinite(Number(value)))) {
    throw new Error("Dashboard response is missing required analytics data");
  }
  return {
    stats: stats.data,
    revenue: revenue.data,
    lowStock: stock.data || [],
    recentOrders: orders.data || [],
  };
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [chartRange, setChartRange] = useState("30");
  const [chartReport, setChartReport] = useState(null);
  const [chartReportRange, setChartReportRange] = useState("");
  const [chartRequestVersion, setChartRequestVersion] = useState(0);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState("");

  useEffect(() => {
    let active = true;
    loadDashboardData().then((data) => {
      if (!active) return;
      setStats(data.stats);
      setRevenue(data.revenue);
      setLowStock(data.lowStock);
      setRecentOrders(data.recentOrders);
      setDashboardError("");
    }).catch(() => {
      if (active) setDashboardError("Dashboard data could not be loaded. Check your connection and try again.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void loadRevenueChart({
      range: chartRange,
      request: ({ params }) => API.get("/trueanalytics", { params, signal: controller.signal }).then(({ data }) => data),
      isCurrent: () => active && !controller.signal.aborted,
      onSuccess: (data) => { setChartReport(data); setChartReportRange(chartRange); setChartError(""); },
      onError: () => setChartError("Revenue chart could not be loaded."),
      onSettled: () => setChartLoading(false),
    });
    return () => { active = false; controller.abort(); };
  }, [chartRange, chartRequestVersion]);

  const retryDashboard = async () => {
    setLoading(true);
    setDashboardError("");
    try {
      const data = await loadDashboardData();
      setStats(data.stats);
      setRevenue(data.revenue);
      setLowStock(data.lowStock);
      setRecentOrders(data.recentOrders);
    } catch {
      setDashboardError("Dashboard data could not be loaded. Check your connection and try again.");
    } finally { setLoading(false); }
  };

  const activeChartReport = chartReportRange === chartRange ? chartReport : null;
  const selectedChartRange = REVENUE_CHART_RANGES.find(({ value }) => value === chartRange);
  const chartRangeLabel = selectedChartRange?.label || "Selected period";
  const metricComparisonLabel = chartRange === "all" ? "All time · paid orders" : chartRangeLabel + " · paid orders";
  const dateRange = activeChartReport?.period?.startDate && activeChartReport?.period?.endDate
    ? `${dayLabel(activeChartReport.period.startDate)} – ${dayLabel(activeChartReport.period.endDate)}` : "";
  const chartRevenue = Number(activeChartReport?.revenue) || 0;
  const chartData = activeChartReport?.revenueTrend || [];
  const chartInterval = activeChartReport?.period?.interval || "day";
  const chartIsCoarse = chartInterval !== "day";
  const chartTickLabel = chartInterval === "year" ? yearLabel : chartInterval === "month" ? monthLabel : dayLabel;
  const operations = [
    { title: "Products", value: stats?.total_products, icon: Package, to: "/admin/products" },
    { title: "Total customers", value: stats?.total_customers, icon: Users, to: "/admin/customers" },
    { title: "All orders", value: stats?.total_orders, icon: ShoppingBag, to: "/admin/orders" },
    { title: "Revenue today", value: money(revenue?.today), icon: Wallet },
    { title: "Low stock", value: stats?.low_stock_products, icon: AlertTriangle, to: "/admin/products", warning: Number(stats?.low_stock_products) > 0 },
    { title: "Out of stock", value: stats?.out_of_stock_products, icon: XCircle, to: "/admin/products", warning: Number(stats?.out_of_stock_products) > 0 },
  ];
  const quickActions = [
    { title: "Add Product", description: "Create a product listing", icon: Plus, path: "/admin/products/add" },
    { title: "View Orders", description: "Review and process orders", icon: Eye, path: "/admin/orders" },
    { title: "Manage Inventory", description: "Update products and stock", icon: ClipboardList, path: "/admin/products" },
    { title: "View Customers", description: "Manage customer accounts", icon: Users, path: "/admin/customers" },
  ];

  if (loading) return <DashboardSkeleton />;
  if (dashboardError && !stats) return <div className="mx-auto w-full max-w-7xl space-y-5"><div><p className="text-sm font-medium text-primary">Store overview</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1></div><div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><span>{dashboardError}</span><Button variant="outline" onClick={retryDashboard}>Retry</Button></div></div>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-primary">Store overview</p><h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Sales performance and today’s store activity.</p></div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1"><CalendarDays size={14} />{activeChartReport?.period?.label || chartRangeLabel}</Badge>
      </header>

      {dashboardError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><span>{dashboardError}</span><Button variant="outline" onClick={retryDashboard}>Retry</Button></div>}

      <section aria-label="Sales performance" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-semibold">Sales performance</h2><p className="text-sm text-muted-foreground">Revenue, paid orders, average order value, and new customer accounts.</p></div>
          <div className="grid w-full grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1 sm:flex sm:w-auto" role="group" aria-label="Analytics time range">
            {REVENUE_CHART_RANGES.map(({ value, label }) => <Button key={value} type="button" size="sm" variant={chartRange === value ? "secondary" : "ghost"} aria-pressed={chartRange === value} onClick={() => selectRevenueChartRange(value, chartRange, { setRange: setChartRange, setLoading: setChartLoading, setError: setChartError })} className="min-h-10 px-3 transition-colors">{label}</Button>)}
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
          <MetricCard title="Revenue" value={activeChartReport ? money(activeChartReport.revenue) : chartLoading ? "Updating…" : "—"} icon={Wallet} comparison={activeChartReport?.comparison?.metrics?.revenue} comparisonMetric="revenue" compareLabel={metricComparisonLabel} trendLabel={activeChartReport?.comparison?.label} trend={activeChartReport?.revenueTrend || EMPTY_SERIES} dataKey="revenue" tooltip="Gross paid-order revenue for the selected period, including orders later refunded. Uses the store’s Addis Ababa business calendar." />
          <MetricCard title="Orders" value={activeChartReport ? Number(activeChartReport.orders).toLocaleString() : chartLoading ? "Updating…" : "—"} icon={ShoppingBag} comparison={activeChartReport?.comparison?.metrics?.orders} comparisonMetric="orders" compareLabel={metricComparisonLabel} trendLabel={activeChartReport?.comparison?.label} trend={activeChartReport?.ordersFrequency || EMPTY_SERIES} dataKey="orders" tooltip="Paid orders created in this period. Refunded orders remain included because they were paid when placed." />
          <MetricCard title="Average order value" value={activeChartReport ? money(activeChartReport.averageOrder) : chartLoading ? "Updating…" : "—"} icon={BadgeCheck} comparison={activeChartReport?.comparison?.metrics?.averageOrder} comparisonMetric="averageOrder" compareLabel={metricComparisonLabel} trendLabel={activeChartReport?.comparison?.label} tooltip="Paid-order revenue divided by the number of paid orders in the same selected period. Shows ETB 0.00 when no paid orders qualify." />
          <MetricCard title="New customers" value={activeChartReport ? Number(activeChartReport.newCustomers).toLocaleString() : chartLoading ? "Updating…" : "—"} icon={Users} comparison={activeChartReport?.newCustomersComparison} comparisonMetric="customers" compareLabel={chartRange === "all" ? "Customer accounts registered · All time" : "Customer accounts registered · " + chartRangeLabel} trendLabel={activeChartReport?.newCustomersComparison?.label} tooltip="Distinct customer accounts created during the selected period. Driver accounts are excluded; this does not count returning buyers as new." />
        </div>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle>Revenue</CardTitle><CardDescription className="mt-1">{dateRange ? `${dateRange} · ${chartRangeLabel}` : `Paid-order revenue · ${chartRangeLabel}`}</CardDescription></div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xl font-semibold">{chartLoading ? "Updating…" : money(chartRevenue)}</p>{chartLoading && <span role="status" className="text-xs text-muted-foreground">Updating chart…</span>}</div>
            {chartError ? <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 text-center"><p className="text-sm text-muted-foreground">{chartError}</p><Button variant="outline" size="sm" onClick={() => { setChartLoading(true); setChartError(""); setChartRequestVersion((version) => version + 1); }}>Retry analytics</Button></div> : (!activeChartReport || chartRevenue === 0) && !chartLoading ? <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">No paid revenue in this period.</div> : <div className={`h-64 min-w-0 transition-opacity sm:h-72 ${chartLoading ? "opacity-60" : "opacity-100"}`}>
              {chartData.length > 0 && <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 12, left: 2, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="periodKey" tickFormatter={chartTickLabel} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={chartIsCoarse ? "preserveStartEnd" : chartRange === "7" ? 0 : 4} minTickGap={16} />
                <YAxis width={74} tickFormatter={compactMoney} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <RechartsTooltip labelFormatter={chartTickLabel} formatter={(value) => [money(value), "Revenue"]} contentStyle={{ borderRadius: 12, borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }} />
                <Line type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart></ResponsiveContainer>}
            </div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quick actions</CardTitle><CardDescription>Common store tasks</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {quickActions.map(({ title, description, icon: Icon, path }) => <Button key={title} type="button" variant="outline" className="h-auto min-h-[68px] w-full justify-start whitespace-normal p-3 text-left" onClick={() => navigate(path)}><Icon className="size-5 shrink-0 text-primary" /><span className="min-w-0"><span className="block font-semibold">{title}</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">{description}</span></span><ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" /></Button>)}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Revenue summary">
        <div className="mb-3"><h2 className="text-lg font-semibold">Revenue summary</h2><p className="text-sm text-muted-foreground">Paid orders, calculated on the store’s business calendar.</p></div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[["This Week", revenue?.this_week], ["This Month", revenue?.this_month], ["This Year", revenue?.this_year], ["Total", revenue?.total_revenue]].map(([label, value]) => <Card key={label} size="sm"><CardContent className="flex items-center justify-between gap-2 py-3"><span className="text-sm text-muted-foreground">{label}</span><span className="text-right font-semibold">{money(value)}</span></CardContent></Card>)}</div>
      </section>

      <section aria-label="Store operations">
        <div className="mb-3"><h2 className="text-lg font-semibold">Store operations</h2><p className="text-sm text-muted-foreground">Current inventory, customer, and order totals.</p></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{operations.map(({ title, value, icon: Icon, to, warning }) => <Card key={title} className="min-w-0"><CardContent className="flex min-w-0 items-center gap-3 py-4"><div className={`rounded-lg p-2 ${warning ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary"}`}><Icon size={18} /></div><div className="min-w-0">{to ? <Link to={to} className="block truncate text-xs text-muted-foreground underline-offset-4 hover:underline">{title}</Link> : <p className="truncate text-xs text-muted-foreground">{title}</p>}<p className="mt-1 truncate text-lg font-semibold">{value == null ? "—" : typeof value === "string" ? value : Number(value).toLocaleString()}</p></div></CardContent></Card>)}</div>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Low stock products</CardTitle><CardDescription className="mt-1">Products with 5 or fewer units</CardDescription></div>{lowStock.length > 5 && <Button render={<Link to="/admin/products" />} variant="ghost" size="sm">View inventory<ArrowRight /></Button>}</CardHeader>
          <CardContent>
            {lowStock.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No low-stock products right now.</p> : <div className="space-y-2">{lowStock.slice(0, 5).map((product) => <Link key={product.id} to={`/admin/products/${product.id}`} className="flex min-w-0 items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-muted"><Package className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden="true" />{product.image_url && <img src={product.image_url} alt="" loading="lazy" className="relative size-full object-cover" onError={(event) => event.currentTarget.remove()} />}</div>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{product.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{money(product.price)}</span></span>
              <Badge variant={Number(product.stock) === 0 ? "destructive" : "warning"}>{Number(product.stock)} left</Badge>
            </Link>)}</div>}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Recent orders</CardTitle><CardDescription className="mt-1">Latest orders by placement date</CardDescription></div>{recentOrders.length > 5 && <Button render={<Link to="/admin/orders" />} variant="ghost" size="sm">View all orders<ArrowRight /></Button>}</CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No orders have been placed yet.</p> : <>
              <div className="space-y-3 sm:hidden">{recentOrders.slice(0, 5).map((order) => <div key={order.id} className="min-w-0 rounded-xl border p-3"><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><Link to={`/admin/orders/${order.id}`} className="font-medium underline-offset-4 hover:underline">Order #{order.id}</Link><p className="truncate text-sm text-muted-foreground">{order.name}</p></div><span className="shrink-0 text-sm font-semibold">{money(order.total_price)}</span></div><div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{dateTime(order.created_at)}</span><Badge variant={getStatusVariant(order.order_status)}>{titleCaseStatus(order.order_status)}</Badge></div></div>)}</div>
              <div className="hidden overflow-x-auto sm:block"><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{recentOrders.slice(0, 5).map((order) => <TableRow key={order.id}><TableCell><Link to={`/admin/orders/${order.id}`} className="font-medium underline-offset-4 hover:underline">#{order.id}</Link></TableCell><TableCell className="max-w-32 truncate">{order.name}</TableCell><TableCell className="whitespace-nowrap text-xs">{dateTime(order.created_at)}</TableCell><TableCell><Badge variant={getStatusVariant(order.order_status)}>{titleCaseStatus(order.order_status)}</Badge></TableCell><TableCell className="whitespace-nowrap text-right font-medium">{money(order.total_price)}</TableCell></TableRow>)}</TableBody></Table></div>
            </>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

function DashboardSkeleton() {
  return <div className="mx-auto w-full max-w-7xl space-y-7" aria-label="Loading dashboard"><header className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-48" /><Skeleton className="h-4 w-64" /></header><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <MetricSkeleton key={item} />)}</div><div className="grid gap-5 xl:grid-cols-3"><Card className="xl:col-span-2"><CardHeader><Skeleton className="h-5 w-36" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card><Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-3">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</CardContent></Card></div><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div></div>;
}

export default Dashboard;
