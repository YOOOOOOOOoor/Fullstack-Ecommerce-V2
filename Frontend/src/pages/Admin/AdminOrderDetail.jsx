import { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import API from "../../../API/api";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  ArrowLeft,
  Package,
  User,
  CreditCard,
  CalendarDays,
} from "lucide-react";
import { selectNumericId, toSelectItems } from "@/lib/selectOptions.js";

const AdminOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useOutletContext();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const canAssignDrivers = Boolean(user?.is_super_admin || user?.permissions?.includes("assign_drivers"));
  const canViewDeliveryHistory = Boolean(user?.is_super_admin || user?.permissions?.includes("view_delivery_history"));

  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [deliveryHistory, setDeliveryHistory] = useState({ assignments: [], attempts: [], codCollection: null, audit: [] });
  const [selectedDriver, setSelectedDriver] = useState("");
  const [deliveryReason, setDeliveryReason] = useState("");
  const [confirmedCollectionAmount, setConfirmedCollectionAmount] = useState("");
  const [overrideFee, setOverrideFee] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [confirmDriverAssignment, setConfirmDriverAssignment] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await API.get(`/orders/admin/orders/${id}`);

        setOrder(res.data);
        setStatus(res.data.order_status);
        const [driverResult, historyResult] = await Promise.allSettled([
          canAssignDrivers ? API.get("/admin/delivery/drivers", { params: { status: "active" } }) : Promise.resolve({ data: [] }),
          canViewDeliveryHistory ? API.get(`/admin/delivery/orders/${id}/history`) : Promise.resolve({ data: { assignments: [], attempts: [], codCollection: null, audit: [] } }),
        ]);
        if (driverResult.status === "fulfilled") setDrivers(driverResult.value.data);
        if (historyResult.status === "fulfilled") setDeliveryHistory(historyResult.value.data);
      } catch (error) {
        console.error(error);
      }
    };

    fetchOrder();
  }, [id, canAssignDrivers, canViewDeliveryHistory]);

  const updateStatus = async () => {
    const reason = status === "cancelled" && !isSuperAdmin ? window.prompt("Reason for cancelling this order (at least 10 characters):") : undefined;
    if (status === "cancelled" && !window.confirm(`Confirm cancellation of order #${id}?`)) return;
    if (status === "cancelled" && !isSuperAdmin && (!reason || reason.trim().length < 10)) return toast.error("Enter a cancellation reason of at least ten characters.");
    try {
      setLoading(true);

      await API.patch(`/orders/admin/orders/${id}`, {
        order_status: status,
        reason: reason?.trim(),
      });

      setOrder((prev) => ({
        ...prev,

        order_status: status,
      }));

      const refreshed = await API.get(`/orders/admin/orders/${id}`);
      setOrder(refreshed.data);
      toast.success("Order updated successfully.");
    } catch (error) {
      console.error(error);

      toast.error(error.response?.data?.message || "Failed to update order.");
    } finally {
      setLoading(false);
    }
  };

  const assignDriver = async () => {
    try {
      setLoading(true);
      await API.post(`/admin/delivery/orders/${id}/assign`, { driverId: selectNumericId(selectedDriver), reason: deliveryReason });
      const [refreshed, history] = await Promise.all([API.get(`/orders/admin/orders/${id}`), API.get(`/admin/delivery/orders/${id}/history`)]);
      setOrder(refreshed.data);
      setStatus(refreshed.data.order_status);
      setDeliveryHistory(history.data);
      setConfirmDriverAssignment(false);
      toast.success("Delivery assigned.");
    } catch (error) { toast.error(error.response?.data?.message || "Could not assign driver."); }
    finally { setLoading(false); }
  };

  const runDeliveryException = async () => {
    try {
      setLoading(true);
      await API.post(`/admin/delivery/orders/${id}/delivery-exception`, { reason: deliveryReason });
      const refreshed = await API.get(`/orders/admin/orders/${id}`);
      setOrder(refreshed.data);
      setStatus(refreshed.data.order_status);
      toast.success("Delivery exception recorded.");
    } catch (error) { toast.error(error.response?.data?.message || "Could not record exception."); }
    finally { setLoading(false); }
  };

  const reconcileCollection = async () => {
    try {
      setLoading(true);
      await API.post(`/admin/delivery/collections/${deliveryHistory.codCollection.id}/reconcile`, { reason: deliveryReason, confirmed_amount: Number(confirmedCollectionAmount || deliveryHistory.codCollection.expected_amount) });
      const history = await API.get(`/admin/delivery/orders/${id}/history`);
      setDeliveryHistory(history.data);
      toast.success("COD discrepancy reconciled.");
    } catch (error) { toast.error(error.response?.data?.message || "Could not reconcile collection."); }
    finally { setLoading(false); }
  };

  const saveShippingOverride = async () => {
    try {
      setLoading(true);
      await API.patch(`/admin/shipping/orders/${id}`, { shipping_fee: Number(overrideFee), reason: overrideReason });
      const refreshed = await API.get(`/orders/admin/orders/${id}`);
      setOrder(refreshed.data);
      setOverrideFee(""); setOverrideReason("");
      toast.success("Shipping fee override saved.");
    } catch (error) { toast.error(error.response?.data?.message || "Could not override the shipping fee."); }
    finally { setLoading(false); }
  };

  const statusColor = (value) => {
    switch (value) {
      case "delivered":
        return "bg-green-100 text-green-700";

      case "cancelled":
        return "bg-red-100 text-red-700";

      case "processing":
        return "bg-blue-100 text-blue-700";

      case "shipped":
        return "bg-purple-100 text-purple-700";

      default:
        return "bg-orange-100 text-orange-700";
    }
  };

  const paymentColor = (value) => {
    switch (value) {
      case "successful":
        return "bg-green-100 text-green-700";

      case "failed":
        return "bg-red-100 text-red-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between">
            <div className="space-y-3">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-5 w-80" />
            </div>

            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>

          {/* Summary Cards */}
          <div
            className="
          grid
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
                p-5
                shadow-sm
                space-y-4
              "
              >
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-28" />
              </div>
            ))}
          </div>

          {/* Update Order Skeleton */}
          <div
            className="
            bg-white
            rounded-xl
            border
            shadow-sm
            p-6
            space-y-5
          "
          >
            <Skeleton className="h-7 w-40" />

            <div className="flex gap-4">
              <Skeleton className="h-10 w-60 rounded-md" />
              <Skeleton className="h-10 w-36 rounded-md" />
            </div>
          </div>

          {/* Customer Skeleton */}
          <div
            className="
            bg-white
            rounded-xl
            border
            shadow-sm
            p-6
            space-y-5
          "
          >
            <Skeleton className="h-7 w-56" />

            <div className="space-y-3">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-5 w-72" />
            </div>
          </div>

          {/* Products Skeleton */}
          <div
            className="
            bg-white
            rounded-xl
            border
            shadow-sm
            p-6
            space-y-6
          "
          >
            <Skeleton className="h-7 w-52" />

            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="
                flex
                items-center
                gap-5
                border
                rounded-xl
                p-4
              "
              >
                <Skeleton className="w-24 h-24 rounded-lg" />

                <div className="flex-1 space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-28" />
                </div>

                <div className="space-y-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const selectableOrderStatuses = [...new Set(["processing", "ready_for_dispatch", "cancelled", ...(status && !["processing", "ready_for_dispatch", "cancelled"].includes(status) ? [status] : [])])];

  return (
    <div
      className="
      min-h-screen
      bg-gray-100
      p-8
    "
    >
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Order #{order.id}
            </h1>

            <p className="text-gray-500 mt-1">
              Manage order details and delivery status
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="
            gap-2
            hover:bg-green-50
            hover:border-green-600
            hover:text-green-700
          "
          >
            <ArrowLeft size={18} />
            Back
          </Button>
        </div>

        {order.late_payment_review_required && <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4" role="status"><h2 className="font-semibold">Verified payment received after expiry</h2><p className="mt-1 text-sm text-muted-foreground">This order is flagged for staff review. It will not be fulfilled or refunded automatically; review the verified payment and decide the appropriate next action.</p></section>}

        {/* Top Summary */}

        <div
          className="
          grid
          md:grid-cols-4
          gap-5
        "
        >
          <div
            className="
            bg-white
            rounded-xl
            border
            p-5
            shadow-sm
          "
          >
            <CreditCard className="mb-3 text-green-600" />

            <p className="text-gray-500 text-sm">Payment</p>

            <span
              className={`
              inline-block
              mt-2
              px-3
              py-1
              rounded-full
              text-sm
              ${paymentColor(order.payment_status)}
            `}
            >
              {order.payment_status}
            </span>
          </div>

          <div
            className="
            bg-white
            rounded-xl
            border
            p-5
            shadow-sm
          "
          >
            <Package className="mb-3 text-green-600" />

            <p className="text-gray-500 text-sm">Status</p>

            <span
              className={`
              inline-block
              mt-2
              px-3
              py-1
              rounded-full
              text-sm
              ${statusColor(order.order_status)}
            `}
            >
              {order.order_status.replace("_", " ")}
            </span>
          </div>

          <div
            className="
            bg-white
            rounded-xl
            border
            p-5
            shadow-sm
          "
          >
            <p className="text-gray-500 text-sm">Total</p>

            <p className="text-2xl font-bold mt-2">
              {Number(order.total_price).toLocaleString()} ETB
            </p>
          </div>

          <div
            className="
            bg-white
            rounded-xl
            border
            p-5
            shadow-sm
          "
          >
            <CalendarDays className="mb-3 text-green-600" />

            <p className="text-gray-500 text-sm">Created</p>

            <p className="font-semibold mt-2">
              {new Date(order.created_at).toLocaleDateString("en-GB")}
            </p>
          </div>
        </div>

        {/* Order Management */}

        <div
          className="
          bg-white
          rounded-xl
          border
          shadow-sm
          p-6
          space-y-5
        "
        >
          <h2 className="text-xl font-bold">Update Order</h2>

          <div
            className="
            flex
            flex-col
            md:flex-row
            gap-4
            items-center
          "
          >
            <Select value={status} onValueChange={setStatus} items={toSelectItems(selectableOrderStatuses.map((value) => ({ value, label: value.replaceAll("_", " ") })))}>
              <SelectTrigger className="w-full md:w-60">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {!(["processing", "ready_for_dispatch", "cancelled"].includes(status)) && (
                  <SelectItem value={status} disabled>{status.replaceAll("_", " ")}</SelectItem>
                )}
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="ready_for_dispatch">Ready for Dispatch</SelectItem>

                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={updateStatus}
              disabled={loading || status === order.order_status}
              className="
              bg-green-600
              hover:bg-green-700
              disabled:opacity-50
            "
            >
              {loading ? "Updating..." : "Update Status"}
            </Button>
          </div>
        </div>

        <section className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
          <div><h2 className="text-xl font-bold">Delivery management</h2><p className="text-sm text-muted-foreground">Assign eligible orders, review attempts, and record audited exceptions.</p></div>
          <p className="text-sm">Shipping fee: ETB {Number(order.shipping_fee || 0).toLocaleString()} · Dispatch status: {order.order_status.replaceAll("_", " ")}</p>
          {order.shipping_address && <p className="text-sm text-muted-foreground">Ship to: {order.shipping_address.receiver_name} · {order.shipping_address.phone} · {order.shipping_address.address}, {order.shipping_address.sub_city}, {order.shipping_address.city}</p>}
          {order.payment_method === "cod" && order.payment_status === "pending" && ["processing", "ready_for_dispatch"].includes(order.order_status) && (user?.is_super_admin || user?.permissions?.includes("override_shipping")) && <div className={`grid gap-2 border-t pt-3 ${isSuperAdmin ? "sm:grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_2fr_auto]"}`}><input className="min-h-11 rounded-lg border bg-background px-3" type="number" min="0" step="0.01" value={overrideFee} onChange={(event) => setOverrideFee(event.target.value)} placeholder="Override shipping fee (ETB)" />{!isSuperAdmin && <input className="min-h-11 rounded-lg border bg-background px-3" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Reason (10+ characters)" />}<Button disabled={loading || overrideFee === "" || (!isSuperAdmin && overrideReason.trim().length < 10)} onClick={saveShippingOverride}>Save fee</Button></div>}
          {canViewDeliveryHistory && deliveryHistory.assignments?.map((assignment) => <p key={assignment.id} className="border-t pt-2 text-sm">{assignment.driver_name} ({assignment.driver_email}) · Assigned {new Date(assignment.assigned_at).toLocaleString()}{assignment.unassigned_at ? ` · reassigned ${new Date(assignment.unassigned_at).toLocaleString()} — ${assignment.change_reason || "No reason"}` : " · current"}</p>)}
          {canAssignDrivers && ["ready_for_dispatch", "delivery_failed", "assigned_to_driver"].includes(order.order_status) && <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><select aria-label="Select active driver" className="min-h-11 rounded-lg border bg-background px-3" value={String(selectedDriver)} onChange={(event) => setSelectedDriver(String(event.target.value))}><option value="">Select active driver</option>{drivers.map((driver) => <option key={driver.user_id} value={String(driver.user_id)}>{driver.name} · {driver.email}</option>)}</select>{!isSuperAdmin && (order.order_status === "delivery_failed" || deliveryHistory.assignments?.some((item) => !item.unassigned_at)) && <input className="min-h-11 rounded-lg border bg-background px-3" value={deliveryReason} onChange={(event) => setDeliveryReason(event.target.value)} placeholder={order.order_status === "delivery_failed" ? "Retry or reassignment reason" : "Reassignment reason if changing driver"} />}<Button disabled={loading || !selectedDriver || (!isSuperAdmin && (order.order_status === "delivery_failed" || deliveryHistory.assignments?.some((item) => !item.unassigned_at)) && deliveryReason.trim().length < 5)} onClick={() => setConfirmDriverAssignment(true)}>Assign / Reassign</Button></div>}
          {canViewDeliveryHistory && deliveryHistory.attempts?.map((attempt) => <p key={attempt.id} className="border-t pt-2 text-sm">Attempt {attempt.attempt_number} · {attempt.driver_name} · {attempt.status.replaceAll("_", " ")} · {new Date(attempt.started_at).toLocaleString()}{attempt.failure_reason ? ` · ${attempt.failure_reason.replaceAll("_", " ")}: ${attempt.failure_notes || ""}` : ""}</p>)}
          {canViewDeliveryHistory && deliveryHistory.audit?.length > 0 && <details className="border-t pt-3"><summary className="cursor-pointer font-medium">Operational audit history</summary><div className="mt-2 space-y-2">{deliveryHistory.audit.map((entry) => <p key={entry.id} className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()} · {entry.action.replaceAll(".", " ")} · actor #{entry.actor_id || "system"} · {JSON.stringify(entry.metadata)}</p>)}</div></details>}
          {["pending_review", "discrepancy", "short", "overpaid"].includes(deliveryHistory.codCollection?.status) && <div className="space-y-2 rounded-lg border border-destructive p-3"><p className="font-semibold">COD discrepancy · expected ETB {Number(deliveryHistory.codCollection.expected_amount).toLocaleString()}, reported ETB {Number(deliveryHistory.codCollection.collected_amount).toLocaleString()}</p><p className="text-sm text-muted-foreground">Only reconcile after confirming the full amount has actually been collected.</p><input className="min-h-11 w-full rounded-lg border bg-background px-3" inputMode="decimal" value={confirmedCollectionAmount || deliveryHistory.codCollection.expected_amount} onChange={(event) => setConfirmedCollectionAmount(event.target.value)} placeholder="Confirmed amount" />{!isSuperAdmin && <input className="min-h-11 w-full rounded-lg border bg-background px-3" value={deliveryReason} onChange={(event) => setDeliveryReason(event.target.value)} placeholder="Reason to reconcile" />}<Button disabled={loading || (!isSuperAdmin && deliveryReason.trim().length < 10)} onClick={reconcileCollection}>Reconcile collection</Button></div>}
          {["assigned_to_driver", "out_for_delivery", "delivery_failed"].includes(order.order_status) && <div className="space-y-2 border-t pt-3">{!isSuperAdmin && <label className="text-sm font-medium" htmlFor="delivery-exception">Admin delivery exception reason (minimum 10 characters)</label>}{!isSuperAdmin && <textarea id="delivery-exception" className="w-full rounded-lg border bg-background p-3" value={deliveryReason} onChange={(event) => setDeliveryReason(event.target.value)} />}<Button variant="outline" disabled={loading || (!isSuperAdmin && deliveryReason.trim().length < 10)} onClick={runDeliveryException}>Record delivery exception</Button></div>}
        </section>

        {order.refund_request && <section className="space-y-2 rounded-xl border bg-card p-6"><h2 className="text-xl font-bold">Refund request</h2><p>Status: {order.refund_request.status}</p><p>Open the <a className="text-primary underline" href="/admin/refunds">Refund Management</a> section to review and process the request.</p></section>}

        {/* Customer */}

        <div
          className="
          bg-white
          rounded-xl
          border
          shadow-sm
          p-6
        "
        >
          <div className="flex items-center gap-2 mb-5">
            <User className="text-green-600" />

            <h2 className="text-xl font-bold">Customer Information</h2>
          </div>

          <div className="space-y-3">
            <p>
              <strong>Name:</strong> {order.name}
            </p>

            <p>
              <strong>Email:</strong> {order.email}
            </p>
          </div>
        </div>

        {/* Products */}

        <div
          className="
          bg-white
          rounded-xl
          border
          shadow-sm
          p-6
        "
        >
          <h2 className="text-xl font-bold mb-6">Ordered Products</h2>

          <div className="space-y-5">
            {order.items.map((item) => (
              <div
                key={item.product_id}
                className="
                flex
                items-center
                gap-5
                border
                rounded-xl
                p-4
                transition
                hover:bg-green-50
              "
              >
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="
                  w-24
                  h-24
                  rounded-lg
                  object-cover
                "
                />

                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{item.title}</h3>

                  <p className="text-gray-500">Quantity: {item.quantity}</p>

                  <p className="font-semibold mt-2">
                    {Number(item.price_at_purchase).toLocaleString()} ETB
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm text-gray-500">Subtotal</p>

                  <p className="font-bold text-lg">
                    {Number(
                      item.price_at_purchase * item.quantity,
                    ).toLocaleString()}{" "}
                    ETB
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDriverAssignment} onOpenChange={setConfirmDriverAssignment}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm driver assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Assign order #{order.id} to {drivers.find((driver) => String(driver.user_id) === String(selectedDriver))?.name || "the selected active driver"}? Any current assignment will be ended and recorded for manual reassignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={loading} onClick={assignDriver}>{loading ? "Assigning..." : "Confirm assignment"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminOrderDetail;
