import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import API from "../../../API/api.js";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { paymentRemainingFromDeadline, paymentServerOffset } from "./paymentCountdown.js";
import CustomerAccordion from "@/components/customer/CustomerAccordion.jsx";
import { getCustomerOrderState, getRefundLabel } from "./orderPresentation.js";
import { ArrowLeft, CheckCircle2, CreditCard, ImagePlus, MapPin, PackageCheck } from "lucide-react";
import RefundEvidenceGallery from "@/components/customer/RefundEvidenceGallery.jsx";
import { addRefundEvidenceFiles, MAX_REFUND_EVIDENCE_FILES } from "./refundEvidence.js";
import { Button } from "@/components/ui/button";

const money = (value) => `ETB ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = (value) => value ? new Date(value).toLocaleString() : "Not available";

const statusTone = (status) => status === "delivered" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  : status === "cancelled" || status === "expired" ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-primary/25 bg-primary/10 text-primary";
const OrderDetails = () => {
  const { id } = useParams();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [refundReason, setRefundReason] = useState("damaged");
  const [refundDescription, setRefundDescription] = useState("");
  const [refundPhotos, setRefundPhotos] = useState([]);
  const [refundEvidenceError, setRefundEvidenceError] = useState("");
  const [refundSelection, setRefundSelection] = useState({});
  const [refundLoading, setRefundLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [paymentRemainingMs, setPaymentRemainingMs] = useState(0);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [continuingPayment, setContinuingPayment] = useState(false);
  const expiryRefreshOrderId = useRef(null);
  const refundPhotoInput = useRef(null);
  const refundPreviewUrls = useRef(new Set());

  useEffect(() => () => {
    refundPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    refundPreviewUrls.current.clear();
  }, []);

  const applyServerOrder = useCallback((data) => {
    const offset = paymentServerOffset(data.server_now);
    setOrder(data);
    setServerOffsetMs(offset);
    setPaymentRemainingMs(paymentRemainingFromDeadline(data.expires_at, offset));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchOrder = async () => {
      try {
        const res = await API.get(`/orders/${id}`);
        if (cancelled) return;
        applyServerOrder(res.data);
        setLoading(false);
        setLoadError("");
        setRefundSelection((current) => Object.keys(current).length
          ? current
          : Object.fromEntries((res.data.items || []).map((item) => [item.order_item_id, item.quantity])));
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setLoadError(error.response?.data?.message || "Could not load this order. Please try again.");
        }
      }
    };

    const initializeOrderView = async () => {
      setOrder(null);
      setRefundSelection({});
      setLoading(true);
      setLoadError("");
      await fetchOrder();
    };
    void initializeOrderView();
    const refreshTimer = window.setInterval(() => { void fetchOrder(); }, 15000);
    return () => { cancelled = true; window.clearInterval(refreshTimer); };
  }, [id, retryCount, applyServerOrder]);

  useEffect(() => {
    if (!order || order.payment_method !== "chapa" || order.payment_status !== "pending" || order.order_status !== "awaiting_payment" || paymentRemainingMs <= 0) return undefined;
    const updateRemaining = () => setPaymentRemainingMs(paymentRemainingFromDeadline(order.expires_at, serverOffsetMs));
    const timer = window.setInterval(updateRemaining, 1000);
    updateRemaining();
    return () => window.clearInterval(timer);
  }, [order, serverOffsetMs, paymentRemainingMs]);

  useEffect(() => {
    if (paymentRemainingMs !== 0 || order?.order_status !== "awaiting_payment" || order.payment_method !== "chapa" || order.payment_status !== "pending") return;
    if (expiryRefreshOrderId.current === order.id) return;
    expiryRefreshOrderId.current = order.id;
    void API.get(`/orders/${id}`).then((res) => applyServerOrder(res.data)).catch(() => {});
  }, [id, order, paymentRemainingMs, applyServerOrder]);

  useEffect(() => {
    const refreshOnResume = () => {
      if (document.visibilityState === "visible") void API.get(`/orders/${id}`).then((res) => applyServerOrder(res.data)).catch(() => {});
    };
    document.addEventListener("visibilitychange", refreshOnResume);
    return () => document.removeEventListener("visibilitychange", refreshOnResume);
  }, [id, applyServerOrder]);

  const continuePayment = async () => {
    if (continuingPayment) return;
    setContinuingPayment(true);
    try {
      const response = await API.post(`/checkout/continue/${id}`);
      window.location.assign(response.data.checkout_url);
    } catch (error) {
      if (error.response?.status === 409 && error.response.data.order_status === "expired") {
        try {
          const updated = await API.get(`/orders/${id}`);
          applyServerOrder(updated.data);
        } catch { /* The expiry response remains the source of truth if refresh is unavailable. */ }
      }
      toast.error(error.response?.data?.message || "Could not continue payment.");
    } finally { setContinuingPayment(false); }
  };

  const requestRefund = async () => {
    try {
      setRefundLoading(true);
      const form = new FormData();
      form.append("reason", refundReason);
      form.append("description", refundDescription);
      form.append("items", JSON.stringify(Object.entries(refundSelection).filter(([, quantity]) => Number(quantity) > 0).map(([order_item_id, quantity]) => ({ order_item_id: Number(order_item_id), quantity: Number(quantity) }))));
      refundPhotos.forEach(({ file }) => form.append("photos", file));
      await API.post(`/refunds/${id}`, form);
      const updated = await API.get(`/orders/${id}`);
      setOrder(updated.data);
      refundPhotos.forEach(({ previewUrl }) => {
        if (previewUrl) { URL.revokeObjectURL(previewUrl); refundPreviewUrls.current.delete(previewUrl); }
      });
      setRefundPhotos([]);
      setRefundEvidenceError("");
      if (refundPhotoInput.current) refundPhotoInput.current.value = "";
      toast.success("Your refund request was sent for review.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not submit the refund request.");
    } finally {
      setRefundLoading(false);
    }
  };

  const addRefundPhotos = (event) => {
    const selected = Array.from(event.target.files || []);
    const result = addRefundEvidenceFiles(refundPhotos, selected);
    const nextFiles = result.files.map((entry) => {
      if (entry.previewUrl) return entry;
      const previewUrl = URL.createObjectURL(entry.file);
      refundPreviewUrls.current.add(previewUrl);
      return { ...entry, previewUrl };
    });
    setRefundPhotos(nextFiles);
    setRefundEvidenceError(result.errors.join(" "));
    event.target.value = "";
  };

  const removeRefundPhoto = (index) => {
    const photo = refundPhotos[index];
    if (photo?.previewUrl) {
      URL.revokeObjectURL(photo.previewUrl);
      refundPreviewUrls.current.delete(photo.previewUrl);
    }
    setRefundPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  };

  const cancelOrder = async () => {
    if (!window.confirm("Cancel this order before dispatch?")) return;
    const reason = window.prompt("Cancellation reason (optional):");
    if (reason === null) return;
    try {
      setCancelLoading(true);
      const result = await API.post(`/orders/${id}/cancel`, { reason: reason.trim() });
      const updated = await API.get(`/orders/${id}`);
      setOrder(updated.data);
      toast.success(result.data.message);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not cancel this order.");
    } finally {
      setCancelLoading(false);
    }
  };

  if (!order) {
    if (!loading) {
      return (
        <div className="min-h-screen bg-background px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center shadow-sm">
            <h1 className="text-2xl font-semibold">Could not load this order</h1>
            <p className="mt-3 text-muted-foreground">{loadError || "Please try again."}</p>
            <button
              type="button"
              className="mt-6 rounded-md bg-primary px-5 py-2 text-primary-foreground"
              onClick={() => { setLoading(true); setRetryCount((count) => count + 1); }}
            >
              Try again
            </button>
          </div>
        </div>

      );
    }
    return (
      <div
        className="
      min-h-screen
      bg-background
      px-4
      sm:px-6
      py-8
      sm:py-12
      "
      >
        <div className="max-w-5xl mx-auto">
          {/* Header Skeleton */}
          <div className="flex justify-between items-center mb-8">
            <div className="space-y-3">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>

            <Skeleton className="h-8 w-28 rounded-full" />
          </div>

          {/* Order Information Skeleton */}
          <div
            className="
          bg-card
          border
          rounded-2xl
          shadow-sm
          p-5
          sm:p-7
          mb-8
          "
          >
            <Skeleton className="h-6 w-48 mb-6" />

            <div className="grid sm:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-32" />
              </div>

              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-32" />
              </div>

              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-32" />
              </div>
            </div>
          </div>

          {/* Items Skeleton */}
          <div
            className="
          bg-card
          border
          rounded-2xl
          shadow-sm
          p-5
          sm:p-7
          "
          >
            <Skeleton className="h-6 w-40 mb-6" />

            <div className="space-y-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="
                flex
                gap-4
                border-b
                pb-5
                "
                >
                  <Skeleton className="w-24 h-24 rounded-xl" />

                  <div className="space-y-3 flex-1">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-40" />
                  </div>

                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>

            {/* Total Skeleton */}
            <div
              className="
            mt-8
            border-t
            pt-6
            flex
            justify-between
            "
            >
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="min-w-0">
            <Link to="/orders" className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              <ArrowLeft aria-hidden="true" className="size-4" /> Back to Orders
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="break-all text-3xl font-bold tracking-tight sm:text-4xl">Order #{order.id}</h1>
              <span className={"rounded-full border px-3 py-1.5 text-sm font-semibold " + statusTone(order.order_status)} role="status">{getCustomerOrderState(order).order}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Placed {dateTime(order.created_at)}</p>
          </div>
          {order.can_cancel && <button type="button" onClick={cancelOrder} disabled={cancelLoading} className="min-h-11 w-full shrink-0 rounded-lg border border-destructive/40 px-4 font-semibold text-destructive transition hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 sm:w-auto">{cancelLoading ? "Cancelling…" : "Cancel order"}</button>}
        </header>

        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="order-summary-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-sm font-medium text-muted-foreground">Order summary</p><h2 id="order-summary-heading" className="mt-1 text-2xl font-bold sm:text-3xl">{money(order.total_price)}</h2></div>
            {order.refund_request && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:text-amber-200">{getRefundLabel(order.refund_request.status)}</span>}
          </div>
          <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-3">
            <div><dt className="text-sm text-muted-foreground">Order status</dt><dd className="mt-1 font-semibold">{getCustomerOrderState(order).order}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Order date</dt><dd className="mt-1 font-semibold">{new Date(order.created_at).toLocaleDateString()}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Items</dt><dd className="mt-1 font-semibold">{order.items.length} {order.items.length === 1 ? "item" : "items"}</dd></div>
          </dl>
        </section>

        {order.payment_method === "chapa" && order.payment_status === "pending" && order.order_status === "awaiting_payment" && <section className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" aria-live="polite">
          <div><h2 className="font-semibold">Complete your Chapa payment</h2><p className="mt-1 text-sm text-muted-foreground">Payment window remaining: <strong className="tabular-nums text-foreground">{Math.floor(paymentRemainingMs / 60000)}:{String(Math.floor((paymentRemainingMs % 60000) / 1000)).padStart(2, "0")}</strong></p><p className="mt-1 text-sm text-muted-foreground">If the payment window expires, this order will close and you can place a new order.</p></div>
          <button type="button" onClick={continuePayment} disabled={continuingPayment || paymentRemainingMs <= 0} className="min-h-11 shrink-0 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">{continuingPayment ? "Opening Chapa…" : "Continue payment"}</button>
        </section>}
        {order.order_status === "expired" && order.payment_method === "chapa" && order.payment_status !== "successful" && <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5" role="status"><h2 className="font-semibold">Payment window expired</h2><p className="mt-1 text-sm text-muted-foreground">This unpaid order has closed. Place a new order to try again.</p><Link className="mt-3 inline-flex font-medium text-primary underline underline-offset-4" to="/products">Shop products</Link></section>}
        {order.late_payment_review_required && <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5" role="status"><h2 className="font-semibold">Your verified payment is under review</h2><p className="mt-1 text-sm text-muted-foreground">This payment arrived after the order expired. The store will review it and contact you about the next step. The order will not be fulfilled or refunded automatically.</p></section>}
        {!order.can_cancel && !["cancelled", "delivered", "expired", "returned"].includes(order.order_status) && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">This order has been dispatched, so normal cancellation is unavailable. <Link className="font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to="/support">Contact the store for help</Link>.</p>}

        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.85fr)]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="items-heading">
              <div className="mb-5 flex items-end justify-between gap-3 border-b pb-4"><div><p className="text-sm font-medium text-muted-foreground">Your purchase</p><h2 id="items-heading" className="mt-1 text-xl font-bold">Items ordered</h2></div><span className="text-sm text-muted-foreground">{order.items.length} {order.items.length === 1 ? "item" : "items"}</span></div>
              <ul className="divide-y">
                {order.items.map((item) => <li key={item.order_item_id} className="flex min-w-0 gap-4 py-5 first:pt-0 last:pb-0">
                  {item.image_url ? <img src={item.image_url} alt="" className="size-20 shrink-0 rounded-xl border bg-muted object-cover sm:size-24" /> : <div className="grid size-20 shrink-0 place-items-center rounded-xl border bg-muted text-xs text-muted-foreground sm:size-24">No image</div>}
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-semibold leading-6">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Quantity: {item.quantity}</p>
                    <p className="text-sm text-muted-foreground">Unit price: {money(item.price_at_purchase)}</p>
                  </div>
                  <p className="shrink-0 text-right font-semibold tabular-nums">{money(Number(item.quantity) * Number(item.price_at_purchase))}</p>
                </li>)}
              </ul>
              <dl className="mt-5 space-y-3 border-t pt-5 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-medium tabular-nums">{money(order.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price_at_purchase), 0))}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Shipping</dt><dd className="font-medium tabular-nums">{money(order.shipping_fee)}</dd></div>
                <div className="flex justify-between gap-4 border-t pt-3 text-base"><dt className="font-semibold">Total</dt><dd className="font-bold tabular-nums">{money(order.total_price)}</dd></div>
              </dl>
            </section>

            <CustomerAccordion title="Delivery details">
              <div className="space-y-5">
                <div className="flex gap-3"><PackageCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div><h3 className="font-semibold">Delivery status</h3><p className="mt-1 text-sm text-muted-foreground">{getCustomerOrderState(order).order}</p>{order.driver && <p className="mt-1 text-sm text-muted-foreground">A delivery partner has been assigned to this order.</p>}</div></div>
                {order.shipping_address && <div className="flex gap-3 border-t pt-5"><MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><h3 className="font-semibold">Shipping address</h3><p className="mt-1 break-words text-sm">{order.shipping_address.receiver_name} · {order.shipping_address.phone}</p><p className="break-words text-sm leading-6 text-muted-foreground">{[order.shipping_address.address, order.shipping_address.sub_city, order.shipping_address.city].filter(Boolean).join(", ")}</p></div></div>}
                {order.delivery_code_status === "active" && order.delivery_code && <div className="border-t pt-5"><div className="flex gap-3"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div><h3 className="font-semibold">Delivery confirmation code</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Give this code to your driver when your order arrives. Do not share it before receiving your order.</p></div></div><p className="mt-4 rounded-xl border bg-muted/40 px-4 py-4 text-center font-mono text-3xl font-bold tracking-[0.3em] sm:text-4xl" aria-label={"Delivery confirmation code " + order.delivery_code}>{order.delivery_code}</p></div>}
              </div>
            </CustomerAccordion>

            <CustomerAccordion title="Order timeline">
              {(order.timeline || []).length ? <ol className="space-y-5">{order.timeline.map((event, index) => <li key={event.event + event.timestamp + index} className="relative flex gap-4 pl-1"><span aria-hidden="true" className="relative mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10"><span className="size-2 rounded-full bg-primary" />{index < order.timeline.length - 1 && <span className="absolute left-1/2 top-5 h-[calc(100%+1.25rem)] w-px -translate-x-1/2 bg-border" />}</span><div className="min-w-0 flex-1"><p className="break-words font-medium">{event.event}</p><time className="mt-1 block text-sm leading-5 text-muted-foreground">{dateTime(event.timestamp)}</time></div></li>)}</ol> : <p className="text-sm text-muted-foreground">No order updates are available yet.</p>}
            </CustomerAccordion>
          </div>

          <aside className="min-w-0 space-y-6 lg:sticky lg:top-6">
            <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="payment-heading">
              <div className="flex items-start gap-3"><CreditCard aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><h2 id="payment-heading" className="text-lg font-bold">Payment details</h2><p className="mt-1 text-sm text-muted-foreground">Payment method: {order.payment_method === "chapa" ? "Chapa" : "Cash on delivery"}</p></div></div>
              <dl className="mt-5 space-y-4 border-t pt-5 text-sm">
                <div><dt className="text-muted-foreground">Payment status</dt><dd className="mt-1 font-semibold">{getCustomerOrderState(order).payment}</dd></div>
                {order.payment_reference && <div className="min-w-0"><dt className="text-muted-foreground">Payment reference</dt><dd className="mt-1 break-all font-mono text-xs leading-5">{order.payment_reference}</dd></div>}
                {order.refund_request && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                  <dt className="font-semibold">Refund status</dt><dd className="mt-1 font-semibold">{getRefundLabel(order.refund_request.status)}</dd>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{order.refund_request.request_type === "pre_dispatch_cancellation" ? "A manual refund review was opened for this cancelled order. No refund is sent automatically; payment stays successful until a refund is confirmed." : order.refund_request.description || "Your refund request is being handled by the store."}</p>
                  {order.refund_request.request_type === "pre_dispatch_cancellation" && <dl className="mt-3 space-y-2 text-sm"><div><dt className="text-muted-foreground">Review amount</dt><dd className="font-medium">{money(order.refund_request.requested_amount)}</dd></div><div><dt className="text-muted-foreground">Original payment reference</dt><dd className="break-all font-mono text-xs">{order.refund_request.original_payment_reference || "Not available"}</dd></div>{order.refund_request.cancellation_reason && <div><dt className="text-muted-foreground">Cancellation reason</dt><dd className="break-words">{order.refund_request.cancellation_reason}</dd></div>}{order.refund_request.cancellation_at && <div><dt className="text-muted-foreground">Cancelled</dt><dd>{dateTime(order.refund_request.cancellation_at)}</dd></div>}</dl>}
                  {order.refund_request.refund_failure_reason && <p className="mt-3 text-sm text-destructive">Latest refund attempt: {order.refund_request.refund_failure_reason}</p>}
                  {order.refund_request.status === "refunded" && <p className="mt-3 text-sm font-medium">Refund of {money(order.refund_request.refund_amount)} recorded {order.refund_request.refunded_at ? "on " + new Date(order.refund_request.refunded_at).toLocaleDateString() : "as completed"}.</p>}
                </div>}
                {!order.refund_request && order.payment_status === "successful" && order.order_status === "cancelled" && <p className="rounded-xl border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">The order is cancelled and payment remains successful. No refund case is recorded for this order.</p>}
              </dl>
            </section>

            {order.payment_status && (order.refund_request || order.refund_eligible || order.order_status === "delivered") && <CustomerAccordion title={order.refund_request ? "Refund request details" : "Refund options"} defaultOpen={Boolean(order.refund_request)}>
              {order.refund_request ? <div className="space-y-3 text-sm">
                {order.refund_request.reason && <p><span className="text-muted-foreground">Request reason:</span> <span className="font-medium">{order.refund_request.reason}</span></p>}
                {order.refund_request.attachments?.length > 0 && <div className="space-y-2"><h3 className="font-semibold">Submitted evidence</h3><RefundEvidenceGallery images={order.refund_request.attachments} label="Previously submitted refund evidence" /></div>}
                {order.refund_request.return_required && <div className="rounded-xl border bg-muted/40 p-4"><h3 className="font-semibold">Return instructions</h3><p className="mt-1 leading-6 text-muted-foreground">Return delivery is covered by the store. Follow the instructions provided by the store team.</p></div>}
                {order.refund_request.refund_failure_reference && <p className="break-words"><span className="text-muted-foreground">Refund attempt reference:</span> {order.refund_request.refund_failure_reference}</p>}
                {order.refund_request.payment_reference && <p className="break-all"><span className="text-muted-foreground">Recorded refund reference:</span> <span className="font-mono text-xs">{order.refund_request.payment_reference}</span></p>}
                {order.refund_request.status === "refunded" && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 font-medium text-emerald-800 dark:text-emerald-200">Refund completed.</p>}
                {order.refund_request.status === "refund_failed" && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 font-medium">The latest refund attempt failed. The store will follow up.</p>}
              </div> : order.refund_eligible ? <div className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">Request within 3 days of delivery for damaged, defective, or incorrect items. The store covers return delivery for eligible claims.</p>
                <div className="space-y-2">{order.items.map((item) => <label key={item.order_item_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={Number(refundSelection[item.order_item_id] || 0) > 0} onChange={(event) => setRefundSelection((previous) => ({ ...previous, [item.order_item_id]: event.target.checked ? 1 : 0 }))} /><span className="break-words">{item.title} <span className="text-muted-foreground">(purchased {item.quantity})</span></span></span>{Number(refundSelection[item.order_item_id] || 0) > 0 && <select aria-label={"Refund quantity for " + item.title} className="min-h-10 rounded-lg border bg-background px-2" value={refundSelection[item.order_item_id]} onChange={(event) => setRefundSelection((previous) => ({ ...previous, [item.order_item_id]: Number(event.target.value) }))}>{Array.from({ length: item.quantity }, (_, index) => index + 1).map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}</select>}</label>)}</div>
                <label className="block space-y-2 text-sm font-medium">Reason<select className="min-h-11 w-full rounded-lg border bg-background px-3" value={refundReason} onChange={(event) => setRefundReason(event.target.value)}><option value="damaged">Damaged item</option><option value="defective">Defective item</option><option value="incorrect">Incorrect item</option></select></label>
                <label className="block space-y-2 text-sm font-medium">Describe the issue<textarea className="w-full rounded-lg border bg-background px-3 py-2 font-normal" value={refundDescription} onChange={(event) => setRefundDescription(event.target.value)} placeholder="Describe the issue" rows={4} /></label>
                <div className="space-y-3">
                  <div><h3 className="text-sm font-semibold">Optional photos</h3><p className="text-sm text-muted-foreground">Add up to {MAX_REFUND_EVIDENCE_FILES} JPEG, PNG, or WebP images, 5 MB each. You can preview or remove them before sending.</p></div>
                  <input ref={refundPhotoInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addRefundPhotos} aria-label="Choose refund evidence images" />
                  <Button type="button" variant="outline" onClick={() => refundPhotoInput.current?.click()} disabled={refundPhotos.length >= MAX_REFUND_EVIDENCE_FILES}><ImagePlus aria-hidden="true" className="mr-2 size-4" />Add evidence images</Button>
                  <p className="text-xs text-muted-foreground">{refundPhotos.length} of {MAX_REFUND_EVIDENCE_FILES} images selected</p>
                  {refundEvidenceError && <p role="alert" className="text-sm text-destructive">{refundEvidenceError}</p>}
                  <RefundEvidenceGallery images={refundPhotos.map(({ file, previewUrl }) => ({ src: previewUrl, name: file.name, sizeLabel: `${(file.size / 1024 / 1024).toFixed(2)} MB` }))} onRemove={removeRefundPhoto} label="Selected refund evidence" />
                </div>
                <button type="button" disabled={refundLoading || refundDescription.trim().length < 10} onClick={requestRefund} className="min-h-11 w-full rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">{refundLoading ? "Submitting…" : "Request refund"}</button>
              </div> : order.order_status === "delivered" ? <p className="text-sm leading-6 text-muted-foreground">The three-day refund request period has ended or this order has no verified delivery timestamp.</p> : <p className="text-sm text-muted-foreground">Refund options are not available for this order.</p>}
            </CustomerAccordion>}
          </aside>
        </div>
      </div>
    </main>
  );
};

export default OrderDetails;
