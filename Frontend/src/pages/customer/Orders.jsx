import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import API from "../../../API/api.js";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toSelectItems } from "@/lib/selectOptions.js";
import { getCustomerOrderState } from "./orderPresentation.js";
import { ArrowRight, Package } from "lucide-react";

const orderStatuses = [
  ["payment_pending", "Payment pending", ["awaiting_payment"]],
  ["payment_under_review", "Payment under review", ["payment_under_review"]],
  ["processing", "Processing", ["paid", "processing", "ready_for_dispatch"]],
  ["shipped", "Shipped", ["shipped", "assigned_to_driver"]],
  ["out_for_delivery", "Out for delivery", ["out_for_delivery"]],
  ["delivery_failed", "Delivery issue", ["delivery_failed"]],
  ["delivered", "Delivered", ["delivered"]],
  ["cancelled", "Cancelled", ["cancelled"]],
  ["expired", "Payment window expired", ["expired"]],
  ["returned", "Returned", ["returned"]],
];

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return orders.filter((order) => {
      const selectedStatuses = orderStatuses.find(([value]) => value === statusFilter)?.[2] || [];
      const matchesStatus = statusFilter === "all" || selectedStatuses.includes(order.order_status);
      const matchesSearch = !query || String(order.id).includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);

  const filtersActive = statusFilter !== "all" || search.trim() !== "";
  const resetFilters = () => { setStatusFilter("all"); setSearch(""); };

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);

        const res = await API.get("/orders/");
        setOrders(res.data);
      } catch (error) {
        console.log(error.response?.data);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  return (
    <div
      className="
    min-h-screen
    bg-background
    px-4
    sm:px-6
    py-8
    sm:py-10
    "
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}

        <div className="mb-8">
          <h1
            className="
          text-3xl
          sm:text-4xl
          font-bold
          "
          >
            My Orders
          </h1>

          <p
            className="
          text-muted-foreground
          mt-2
          "
          >
            Track your purchases and order history
          </p>
        </div>

        <section aria-label="Filter orders" className="mb-6 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
            <div className="space-y-2">
              <label htmlFor="order-status-filter" className="text-sm font-medium">Order status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter} items={toSelectItems([{ value: "all", label: "All orders" }, ...orderStatuses.map(([value, label]) => ({ value, label }))])}>
                <SelectTrigger id="order-status-filter" className="h-11 w-full rounded-xl">
                  <SelectValue placeholder="All orders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All orders</SelectItem>
                  {orderStatuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="order-search" className="text-sm font-medium">Search by order number</label>
              <Input id="order-search" inputMode="numeric" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Enter an order number" className="h-11 rounded-xl" />
            </div>
            <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={!filtersActive} onClick={resetFilters}>Reset filters</Button>
          </div>
          {!loading && orders.length > 0 && <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">Showing {filteredOrders.length} of {orders.length} orders</p>}
        </section>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner className="size-8" />
          </div>
        ) : orders.length === 0 ? (
          <div
            className="
          bg-card
          rounded-3xl
          border
          shadow-sm
          p-10
          text-center
          "
          >
            <div
              className="
            w-16
            h-16
            mx-auto
            rounded-full
            bg-secondary
            flex
            items-center
            justify-center
            text-3xl
            mb-5
            "
            >
              📦
            </div>

            <h2
              className="
            text-2xl
            font-semibold
            "
            >
              No orders yet
            </h2>

            <p
              className="
            text-muted-foreground
            mt-2
            "
            >
              Your purchased products will appear here.
            </p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-3xl border bg-card p-10 text-center shadow-sm sm:p-14">
            <h2 className="text-2xl font-semibold">No matching orders</h2>
            <p className="mt-2 text-muted-foreground">Try another status or search term.</p>
            <Button type="button" variant="outline" className="mt-5 rounded-xl" onClick={resetFilters}>Show all orders</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredOrders.map((order) => {
              const state = getCustomerOrderState(order);
              const refundState = order.refund_status ? getCustomerOrderState({ ...order, refund_request: { status: order.refund_status } }).refund : null;
              return <article key={order.id} aria-label={`Order ${order.id}, ${order.display_title}`} className="group space-y-5 rounded-3xl border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order number</p><h2 className="mt-1 text-xl font-bold">#{order.id}</h2><p className="mt-1 text-sm text-muted-foreground">Placed {new Date(order.created_at).toLocaleDateString()}</p></div>
                  <span className="rounded-full bg-primary/10 px-3.5 py-1.5 text-sm font-semibold text-primary">{state.order}</span>
                </div>
                <div className="flex flex-col gap-4 rounded-2xl bg-muted/40 p-4 sm:flex-row sm:items-center sm:p-5">
                  {order.image_url ? <img src={order.image_url} alt="" className="size-16 shrink-0 rounded-xl border bg-card object-cover sm:size-[4.5rem]" /> : <span className="flex size-16 shrink-0 items-center justify-center rounded-xl border bg-card text-muted-foreground sm:size-[4.5rem]"><Package aria-hidden="true" /></span>}
                  <div className="min-w-0 flex-1"><p className="break-words font-semibold sm:text-lg">{order.display_title}</p><p className="mt-1 text-sm text-muted-foreground">{Number(order.item_count) === 1 ? "1 item" : `${order.item_count} items`}</p></div>
                  <div className="sm:min-w-36 sm:text-right"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order total</p><p className="mt-1 text-xl font-bold tabular-nums">ETB {Number(order.total_price).toLocaleString()}</p></div>
                </div>
                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-lg border px-3 py-1.5"><span className="text-muted-foreground">Payment:</span> {state.payment}</span>{order.order_status !== "cancelled" && <span className="rounded-lg border px-3 py-1.5"><span className="text-muted-foreground">Delivery:</span> {state.order}</span>}{refundState && <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">{refundState}</span>}</div>
                  <Link to={`/order/${order.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">View details <ArrowRight aria-hidden="true" size={17} /></Link>
                </div>
              </article>;
            })}
          </div>        )}
      </div>
    </div>
  );
};

export default Orders;
