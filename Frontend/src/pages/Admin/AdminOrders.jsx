import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Grid2X2, List, Package, SearchIcon, Truck } from "lucide-react";
import API from "../../../API/api.js";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import OrderDriverAssignmentDialog from "./OrderDriverAssignmentDialog.jsx";
import { selectNumericId, toSelectItems } from "@/lib/selectOptions.js";
import {
  applyDriverAssignment,
  buildOrdersQuery,
  canAssignOrder,
  createAssignmentSubmitter,
  createOrderAssignmentRequest,
  orderAssignmentLabel,
  readOrdersView,
  writeOrdersView,
} from "./adminOrdersState.js";

const PAGE_SIZE = 6;
const orderStatuses = ["awaiting_payment", "processing", "delivered", "cancelled", "expired"];
const paymentStatuses = ["pending", "successful", "failed", "refunded"];

function statusLabel(value = "unknown") {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function orderStatusVariant(status) {
  if (status === "delivered") return "success";
  if (["processing", "assigned_to_driver", "out_for_delivery"].includes(status)) return "secondary";
  if (["cancelled", "delivery_failed"].includes(status)) return "destructive";
  return "warning";
}

function paymentStatusVariant(status) {
  if (status === "successful") return "success";
  if (status === "failed") return "destructive";
  if (status === "refunded") return "warning";
  return "secondary";
}

function orderDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function OrderBadges({ order }) {
  return <div className="flex flex-wrap items-center gap-1.5"><Badge variant={orderStatusVariant(order.order_status)}>{statusLabel(order.order_status)}</Badge><Badge variant={paymentStatusVariant(order.payment_status)}>{statusLabel(order.payment_status)}</Badge>{order.late_payment_review_required && <Badge variant="warning">Payment review required</Badge>}</div>;
}

function OrderActions({ order, onView, onAssign, canAssignDrivers, canPrepareOrders }) {
  return <div className="flex flex-wrap items-center gap-2">
    {canAssignDrivers && canAssignOrder(order, { canPrepareOrders }) && <Button type="button" size="sm" variant="outline" onClick={() => onAssign(order)}><Truck />{orderAssignmentLabel(order)}</Button>}
    <Button type="button" size="sm" variant="secondary" onClick={() => onView(order.id)}><Eye />View</Button>
  </div>;
}

function OrderGridCard({ order, onView, onAssign, canAssignDrivers, canPrepareOrders }) {
  return <Card className="h-full transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring/50">
    <CardHeader className="gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><CardTitle className="truncate">Order #{order.id}</CardTitle><CardDescription className="mt-1">{orderDate(order.created_at)}</CardDescription></div>
        <span className="shrink-0 font-semibold tabular-nums">{Number(order.total_price).toLocaleString()} ETB</span>
      </div>
      <OrderBadges order={order} />
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/40 p-3">
        {order.image_url ? <img src={order.image_url} alt="" loading="lazy" className="size-12 shrink-0 rounded-md border object-cover" /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground"><Package className="size-5" aria-hidden="true" /></span>}
        <div className="min-w-0"><p className="truncate text-sm font-medium">{order.display_title || order.title || "Order items"}</p><p className="mt-0.5 text-xs text-muted-foreground">{order.item_count} item(s)</p></div>
      </div>
      <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        <p className="truncate"><span className="text-muted-foreground">Customer: </span>{order.name}</p>
        {order.current_driver_name && <p className="truncate"><span className="text-muted-foreground">Driver: </span>{order.current_driver_name}</p>}
      </div>
      <div className="border-t pt-3"><OrderActions order={order} onView={onView} onAssign={onAssign} canAssignDrivers={canAssignDrivers} canPrepareOrders={canPrepareOrders} /></div>
    </CardContent>
  </Card>;
}

const AdminOrders = ({ user }) => {
  const [form, setForm] = useState({ search: "", order_status: "", payment_status: "" });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [view, setView] = useState(() => readOrdersView());
  const [assignmentOrder, setAssignmentOrder] = useState(null);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const assignmentBusyRef = useRef(false);
  const navigate = useNavigate();
  const canAssignDrivers = Boolean(user?.is_super_admin || user?.permissions?.includes("assign_drivers"));
  const canPrepareOrders = Boolean(user?.is_super_admin || user?.permissions?.includes("prepare_orders"));
  const assignmentRequest = useMemo(() => createOrderAssignmentRequest({
    prepareOrder: (orderId) => API.patch(`/orders/admin/orders/${orderId}`, { order_status: "ready_for_dispatch" }),
    assignDriver: ({ orderId, driverId, reason }) => API.post(`/admin/delivery/orders/${orderId}/assign`, { driverId: selectNumericId(driverId), reason }),
  }), []);
  const assignSubmitter = useMemo(() => createAssignmentSubmitter(assignmentRequest), [assignmentRequest]);

  useEffect(() => { writeOrdersView(view); }, [view]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    API.get("/orders/admin/orders", { params: buildOrdersQuery(form, page, PAGE_SIZE), signal: controller.signal })
      .then(({ data }) => {
        if (!active) return;
        setError("");
        setOrders(Array.isArray(data?.orders) ? data.orders : []);
        setTotalPages(Math.max(1, Number(data?.totalPages) || 1));
      })
      .catch((requestError) => {
        if (!active || requestError.code === "ERR_CANCELED") return;
        setError(requestError.response?.data?.message || "Orders could not be loaded. Check your connection and try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [form, page, refreshVersion]);

  const setFilter = useCallback((name, value) => {
    setLoading(true);
    setError("");
    setForm((current) => ({ ...current, [name]: value === "all" ? "" : value }));
  }, []);
  const openAssignment = (order) => setAssignmentOrder(order);

  const saveAssignment = async ({ driver, reason }) => {
    if (!assignmentOrder || assignmentBusyRef.current) return;
    assignmentBusyRef.current = true;
    setAssignmentBusy(true);
    try {
      const result = await assignSubmitter({ orderId: assignmentOrder.id, driverId: driver.user_id, reason, prepare: assignmentOrder.order_status === "processing" });
      if (result.status === "success") {
        setOrders((current) => applyDriverAssignment(current, assignmentOrder.id, driver));
        toast.success(assignmentOrder.current_driver_id ? "Driver reassigned successfully." : "Driver assigned successfully.");
        setAssignmentOrder(null);
      } else if (result.status === "error") {
        toast.error(result.error.response?.data?.message || "Could not change the driver assignment. Refresh the orders and try again.");
        if (assignmentOrder.order_status === "processing" || result.error.response?.status === 409) {
          setAssignmentOrder(null);
          setLoading(true);
          setRefreshVersion((version) => version + 1);
        }
      }
    } finally {
      assignmentBusyRef.current = false;
      setAssignmentBusy(false);
    }
  };

  const goToPage = (nextPage) => {
    setLoading(true);
    setError("");
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  };
  const viewOrder = (id) => navigate(`/admin/orders/${id}`);

  return <div className="mx-auto min-h-screen w-full max-w-[1500px] space-y-5 bg-background p-4 sm:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-medium text-primary">Order management</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Orders</h1><p className="mt-2 text-sm text-muted-foreground">Review customer orders, payments, and delivery assignments.</p></div>
    </header>

    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Search and filter orders</CardTitle><CardDescription>Filter by order number, customer, product, order status, or payment status.</CardDescription></CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_220px_220px]">
        <InputGroup className="h-10 rounded-xl">
          <InputGroupAddon><SearchIcon className="size-4" aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput aria-label="Search orders" placeholder="Search order, customer, product…" value={form.search} onChange={(event) => setFilter("search", event.target.value)} />
        </InputGroup>
        <Select value={form.order_status || "all"} onValueChange={(value) => setFilter("order_status", value)} items={toSelectItems([{ value: "all", label: "All orders" }, ...orderStatuses.map((value) => ({ value, label: statusLabel(value) }))])}>
          <SelectTrigger aria-label="Filter by order status" className="h-10 w-full rounded-xl"><SelectValue placeholder="Order status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All orders</SelectItem>{orderStatuses.map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={form.payment_status || "all"} onValueChange={(value) => setFilter("payment_status", value)} items={toSelectItems([{ value: "all", label: "All payments" }, ...paymentStatuses.map((value) => ({ value, label: statusLabel(value) }))])}>
          <SelectTrigger aria-label="Filter by payment status" className="h-10 w-full rounded-xl"><SelectValue placeholder="Payment status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All payments</SelectItem>{paymentStatuses.map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}</SelectContent>
        </Select>
      </CardContent>
    </Card>

    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-2 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><CardTitle>Order list</CardTitle><CardDescription className="mt-1">{loading ? "Loading orders…" : `${orders.length} orders on this page · Page ${page} of ${totalPages}`}</CardDescription></div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="text-xs text-muted-foreground">View</span>
          <div className="inline-flex w-fit items-center gap-1 rounded-lg border bg-muted/40 p-1" role="group" aria-label="Order view">
            <Button type="button" size="icon-sm" variant={view === "table" ? "secondary" : "ghost"} title="Table view" aria-label="Table view" aria-pressed={view === "table"} onClick={() => setView("table")}><List aria-hidden="true" /></Button>
            <Button type="button" size="icon-sm" variant={view === "grid" ? "secondary" : "ghost"} title="Grid view" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 aria-hidden="true" /></Button>
          </div>
        </div>
      </CardHeader>
      {loading ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner className="size-8" /><span className="sr-only">Loading orders</span></div> : error ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center" role="alert"><p className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" onClick={() => { setLoading(true); setError(""); setForm((current) => ({ ...current })); }}>Retry</Button></div>
      ) : orders.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-6 text-center"><Package className="size-8 text-muted-foreground" aria-hidden="true" /><p className="font-medium">No orders found</p><p className="text-sm text-muted-foreground">Try adjusting the search or filters.</p></div>
      ) : view === "table" ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[940px]">
            <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>Customer</TableHead><TableHead>Product</TableHead><TableHead>Total</TableHead><TableHead>Payment</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{orders.map((order) => <TableRow key={order.id} className="transition-colors hover:bg-muted/60 focus-within:bg-muted/60">
              <TableCell><div className="min-w-0"><p className="font-semibold">{order.name}</p><p className="max-w-48 truncate text-sm text-muted-foreground">{order.email}</p></div></TableCell>
              <TableCell><div className="flex items-center gap-3"><div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">{order.image_url ? <img src={order.image_url} alt="" loading="lazy" className="size-full object-cover" /> : <Package className="size-5 text-muted-foreground" aria-hidden="true" />}</div><div className="min-w-0"><p className="max-w-60 truncate font-medium">{order.display_title || order.title}</p><p className="text-xs text-muted-foreground">{order.item_count} item(s)</p></div></div></TableCell>
              <TableCell className="whitespace-nowrap font-semibold tabular-nums">{Number(order.total_price).toLocaleString()} ETB</TableCell>
              <TableCell><Badge variant={paymentStatusVariant(order.payment_status)}>{statusLabel(order.payment_status)}</Badge></TableCell>
              <TableCell><div className="space-y-1"><OrderBadges order={order} />{order.current_driver_name && <p className="text-xs text-muted-foreground">Driver: {order.current_driver_name}</p>}</div></TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{orderDate(order.created_at)}</TableCell>
              <TableCell><div className="flex justify-end"><OrderActions order={order} onView={viewOrder} onAssign={openAssignment} canAssignDrivers={canAssignDrivers} canPrepareOrders={canPrepareOrders} /></div></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
      ) : <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">{orders.map((order) => <OrderGridCard key={order.id} order={order} onView={viewOrder} onAssign={openAssignment} canAssignDrivers={canAssignDrivers} canPrepareOrders={canPrepareOrders} />)}</div>}

      {!loading && !error && totalPages > 1 && <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p><Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem><PaginationPrevious href="#" aria-disabled={page <= 1} onClick={(event) => { event.preventDefault(); goToPage(page - 1); }} /></PaginationItem>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <PaginationItem key={number}><PaginationLink href="#" isActive={page === number} aria-label={`Page ${number}`} onClick={(event) => { event.preventDefault(); goToPage(number); }}>{number}</PaginationLink></PaginationItem>)}
          <PaginationItem><PaginationNext href="#" aria-disabled={page >= totalPages} onClick={(event) => { event.preventDefault(); goToPage(page + 1); }} /></PaginationItem>
        </PaginationContent>
      </Pagination></footer>}
    </Card>

    {assignmentOrder && <OrderDriverAssignmentDialog key={assignmentOrder.id} order={assignmentOrder} user={user} open onOpenChange={(open) => { if (!open) setAssignmentOrder(null); }} onAssign={saveAssignment} busy={assignmentBusy} />}
    <span className="sr-only" aria-live="polite">{loading ? "Loading orders" : `${orders.length} orders shown on page ${page} of ${totalPages}`}</span>
  </div>;
};

export default AdminOrders;
