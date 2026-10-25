import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, CreditCard, Package, UserRound } from "lucide-react";
import API from "../../../API/api.js";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import RefundEvidenceGallery from "@/components/customer/RefundEvidenceGallery.jsx";
import { canManageRefundCase, cancellationRefundActions, isCancellationRefundCase } from "./refundCaseState.js";

const money = (value) => `ETB ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (value) => value ? new Date(value).toLocaleString() : "Not available";
const readable = (value) => String(value || "Unknown").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
const badgeVariant = (status) => status === "refunded" ? "success" : status === "rejected" ? "destructive" : status === "refund_failed" ? "warning" : ["requested", "under_review"].includes(status) ? "warning" : "secondary";

function Info({ label, children, className = "" }) { return <div className={className}><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{children || "Not available"}</dd></div>; }

const RefundDetails = () => {
  const { refundId } = useParams();
  const { user } = useOutletContext();
  const canManage = canManageRefundCase(user);
  const canApproveException = Boolean(user?.is_super_admin || user?.permissions?.includes("approve_refund_exceptions"));
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || "/admin/refunds";
  const [refund, setRefund] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [response, setResponse] = useState("");
  const [returnRequired, setReturnRequired] = useState(true);
  const [exceptionReason, setExceptionReason] = useState("");
  const [form, setForm] = useState({});
  const [processing, setProcessing] = useState(false);

  const loadCase = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await API.get("/refunds/admin");
      const match = Array.isArray(data) ? data.find((item) => String(item.id) === String(refundId)) : null;
      if (!match) { setRefund(null); setError("This refund case could not be found."); return; }
      setRefund(match);
    } catch (requestError) {
      setRefund(null);
      setError(requestError.response?.data?.message || "Could not load this refund case.");
    } finally { setLoading(false); }
  }, [refundId]);

  useEffect(() => {
    let active = true;
    API.get("/refunds/admin").then(({ data }) => {
      if (!active) return;
      const match = Array.isArray(data) ? data.find((item) => String(item.id) === String(refundId)) : null;
      setRefund(match || null);
      setError(match ? "" : "This refund case could not be found.");
    }).catch((requestError) => {
      if (active) { setRefund(null); setError(requestError.response?.data?.message || "Could not load this refund case."); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refundId]);

  const runAction = async (operation, successMessage) => {
    if (!canManage || processing) return;
    setProcessing(true);
    try { await operation(); toast.success(successMessage); await loadCase(); }
    catch (requestError) { toast.error(requestError.response?.data?.message || "Could not update this refund case."); }
    finally { setProcessing(false); }
  };
  const review = (status) => {
    const cancellation = isCancellationRefundCase(refund);
    const message = (response || "").trim() || (cancellation && status === "refund_processing" ? "Manual refund processing started by staff." : "");
    if (status === "rejected" && !window.confirm("Reject this refund case?")) return;
    void runAction(() => API.patch(`/refunds/${refund.id}/review`, { status, admin_response: message, return_required: cancellation ? false : returnRequired }), "Refund request updated.");
  };
  const approveReviewed = () => void runAction(() => API.patch(`/refunds/${refund.id}/review`, { status: "approved", admin_response: response || "", return_required: returnRequired, exception_reason: exceptionReason }), "Refund decision recorded.");
  const complete = () => {
    if (!window.confirm("Confirm the external/manual refund has completed?")) return;
    void runAction(() => API.post(`/refunds/${refund.id}/complete`, { method: form.method || (refund.payment_method === "chapa" ? "chapa_manual" : "cash"), amount: Number(form.amount ?? refund.eligible_refund_amount), reference: form.reference }), "Refund completion recorded.");
  };
  const failAttempt = () => void runAction(() => API.post(`/refunds/${refund.id}/failure`, { reason: response || "", reference: form.reference || "" }), "Failed refund attempt recorded. Payment remains successful.");
  const setFormValue = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  if (loading) return <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground" role="status">Loading refund case…</div>;
  if (!refund) return <section className="space-y-4 rounded-xl border bg-card p-8 text-center"><h1 className="text-xl font-semibold">Refund case unavailable</h1><p className="text-muted-foreground">{error || "This refund case could not be found."}</p><div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => navigate(returnTo)}>Back to Refunds</Button><Button onClick={() => void loadCase()}>Try again</Button></div></section>;

  const cancellation = isCancellationRefundCase(refund);
  const caseActions = cancellationRefundActions(refund);
  const showActions = canManage && !["rejected", "refunded"].includes(refund.status);
  const history = Array.isArray(refund.refund_history) ? refund.refund_history : [];

  return <main className="space-y-6">
    <header className="space-y-4"><Link to={returnTo} className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"><ArrowLeft aria-hidden="true" className="size-4" />Back to Refunds</Link>
      <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm text-muted-foreground">Refund case #{refund.id} · Order #{refund.order_id}</p><h1 className="mt-1 text-2xl font-bold">{cancellation ? "Cancellation refund review" : "Customer refund request"}</h1><p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock aria-hidden="true" className="size-4" />Requested {when(refund.requested_at)}</p></div><Badge variant={badgeVariant(refund.status)} className="w-fit px-3 py-1.5 capitalize">{readable(refund.status)}</Badge></div>
    </header>
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.85fr)]">
      <div className="min-w-0 space-y-5">
        <Card><CardHeader><CardTitle className="text-lg">Refund request details</CardTitle><CardDescription>Customer-provided information and requested outcome.</CardDescription></CardHeader><CardContent><dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2"><Info label="Request ID">#{refund.id}</Info><Info label="Related order">#{refund.order_id}</Info><Info label="Request date">{when(refund.requested_at)}</Info><Info label="Current case status"><span className="capitalize">{readable(refund.status)}</span></Info><Info label="Refund reason">{cancellation ? "Pre-dispatch cancellation" : readable(refund.reason)}</Info><Info label="Requested amount">{money(refund.requested_amount ?? refund.eligible_refund_amount)}</Info><Info label="Approved / recorded amount">{refund.refund_amount == null ? "Not recorded" : money(refund.refund_amount)}</Info>{refund.cancellation_at && <Info label="Cancellation date">{when(refund.cancellation_at)}</Info>}<Info label="Customer description" className="sm:col-span-2"><span className="whitespace-pre-wrap font-normal">{refund.description || refund.cancellation_reason || "No description provided."}</span></Info>{refund.cancellation_reason && !refund.description && <Info label="Cancellation reason" className="sm:col-span-2"><span className="whitespace-pre-wrap font-normal">{refund.cancellation_reason}</span></Info>}</dl>{refund.refund_items?.length > 0 && <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Requested items</h3><ul className="mt-2 space-y-2 text-sm">{refund.refund_items.map((item) => <li key={item.order_item_id} className="flex flex-wrap justify-between gap-2"><span>Order item #{item.order_item_id} × {item.quantity}</span><span className="font-medium">{money(Number(item.unit_price) * Number(item.quantity))}</span></li>)}</ul></div>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">Evidence</CardTitle><CardDescription>Images supplied with the customer request.</CardDescription></CardHeader><CardContent>{refund.attachments?.length ? <RefundEvidenceGallery images={refund.attachments} label="Refund case evidence" /> : <div className="rounded-lg border border-dashed p-7 text-center text-sm text-muted-foreground">No evidence images were submitted for this case.</div>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">Refund history</CardTitle><CardDescription>Recorded staff and workflow events in chronological order.</CardDescription></CardHeader><CardContent>{history.length ? <details><summary className="cursor-pointer text-sm font-medium">Show {history.length} recorded {history.length === 1 ? "event" : "events"}</summary><ol className="mt-4 space-y-4 border-l pl-4">{history.map((event, index) => { const metadata = event.metadata || {}; const detail = metadata.reason || metadata.notes || metadata.failureReason; const reference = metadata.paymentReference || metadata.failureReference; return <li key={`${event.created_at}-${index}`} className="relative text-sm"><span className="absolute -left-[1.32rem] top-1.5 size-2 rounded-full bg-primary" /><p className="font-medium">{readable(event.action)}{event.actor_name ? ` · ${event.actor_name}` : ""}</p>{detail && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{detail}</p>}{reference && <p className="mt-1 break-all font-mono text-xs">Reference: {reference}</p>}<time className="mt-1 block text-xs text-muted-foreground">{when(event.created_at)}</time></li>; })}</ol></details> : <p className="text-sm text-muted-foreground">No refund audit events are recorded yet.</p>}{refund.refund_failed_at && <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><p className="font-medium">Latest failed attempt · {when(refund.refund_failed_at)}</p><p className="mt-1">{refund.refund_failure_reason || "No failure reason recorded."}</p>{refund.refund_failure_reference && <p className="mt-1 break-all font-mono text-xs">Reference: {refund.refund_failure_reference}</p>}</div>}{refund.refunded_at && <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">Refund completion recorded {when(refund.refunded_at)}{refund.payment_reference ? ` · Reference ${refund.payment_reference}` : ""}</p>}</CardContent></Card>
      </div>
      <aside className="min-w-0 space-y-5">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UserRound aria-hidden="true" className="size-5 text-primary" />Customer and order</CardTitle></CardHeader><CardContent><dl className="space-y-4"><Info label="Customer">{refund.customer_name || refund.customer_email || "Unknown customer"}</Info><Info label="Email">{refund.customer_email || "Not available"}</Info><Info label="Order status">{readable(refund.order_status)}</Info><Info label="Order date">{when(refund.order_created_at)}</Info><Info label="Order total">{money(refund.total_price)}</Info></dl></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CreditCard aria-hidden="true" className="size-5 text-primary" />Payment information</CardTitle></CardHeader><CardContent><dl className="space-y-4"><Info label="Payment method">{readable(refund.payment_method)}</Info><Info label="Payment status">{readable(refund.payment_status)}</Info><Info label="Original payment reference"><span className="break-all font-mono text-xs">{refund.original_payment_reference || "Not available"}</span></Info>{refund.payment_reference && <Info label="Recorded refund reference"><span className="break-all font-mono text-xs">{refund.payment_reference}</span></Info>}<p className="rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">A refund is marked complete only after a manual/external refund is confirmed. No automatic provider transfer is initiated.</p></dl></CardContent></Card>
        {!cancellation && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Package aria-hidden="true" className="size-5 text-primary" />Delivery information</CardTitle></CardHeader><CardContent>{refund.delivery_history?.length ? <ol className="space-y-3">{refund.delivery_history.map((attempt) => <li key={`${attempt.attempt_number}-${attempt.started_at}`} className="border-b pb-3 text-sm last:border-0 last:pb-0"><p className="font-medium">Attempt {attempt.attempt_number} · {readable(attempt.status)}</p><p className="mt-1 text-xs text-muted-foreground">{attempt.driver_name} · {when(attempt.started_at)}</p>{attempt.failure_reason && <p className="mt-1 text-xs text-destructive">{readable(attempt.failure_reason)}{attempt.failure_notes ? `: ${attempt.failure_notes}` : ""}</p>}</li>)}</ol> : <p className="text-sm text-muted-foreground">No delivery attempts recorded.</p>}{refund.return_delivery_responsibility && <p className="mt-3 border-t pt-3 text-sm"><span className="text-muted-foreground">Return shipping: </span>{readable(refund.return_delivery_responsibility)}</p>}{refund.inspection_status && <p className="mt-2 text-sm"><span className="text-muted-foreground">Inspection: </span>{readable(refund.inspection_status)}{refund.inspection_notes ? ` · ${refund.inspection_notes}` : ""}</p>}</CardContent></Card>}
        <Card><CardHeader><CardTitle className="text-lg">Case status and actions</CardTitle><CardDescription>Current state: <span className="font-medium capitalize text-foreground">{readable(refund.status)}</span></CardDescription></CardHeader><CardContent className="space-y-4">{showActions ? <>
          <label className="block space-y-1 text-sm font-medium">Admin explanation, return instructions, or decision<textarea className={field} rows={3} value={response} onChange={(event) => setResponse(event.target.value)} /></label>
          {refund.status === "requested" && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={processing || response.trim().length < 5} onClick={() => review("under_review")}>Start review</Button><Button disabled={processing || response.trim().length < 5} onClick={() => review("approved")}>Approve</Button><Button variant="destructive" disabled={processing || response.trim().length < 5} onClick={() => review("rejected")}>Reject</Button></div>}
          {cancellation && caseActions.beginManualRefund && <div className="flex flex-wrap gap-2"><Button disabled={processing} onClick={() => review("refund_processing")}>Begin manual refund</Button><Button variant="destructive" disabled={processing || response.trim().length < 5} onClick={() => review("rejected")}>Reject case</Button></div>}
          {refund.status === "under_review" && !cancellation && <div className="space-y-3">{canApproveException && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={returnRequired} onChange={(event) => setReturnRequired(event.target.checked)} />Require return and inspection before refund</label>}{canApproveException && !returnRequired && <textarea className={field} value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} placeholder="Documented exception reason (10+ characters)" />}{canApproveException && !returnRequired && <Button disabled={processing || exceptionReason.trim().length < 10 || response.trim().length < 5} onClick={approveReviewed}>Approve without return</Button>}<div className="flex flex-wrap gap-2">{(returnRequired || !canApproveException) && <Button disabled={processing || response.trim().length < 5} onClick={approveReviewed}>Approve and request return</Button>}<Button variant="destructive" disabled={processing || response.trim().length < 5} onClick={() => review("rejected")}>Reject</Button></div></div>}
          {refund.status === "awaiting_return" && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={processing || response.trim().length < 10} onClick={() => void runAction(() => API.post(`/refunds/${refund.id}/inspection`, { outcome: "accepted", notes: response }), "Return inspected and accepted.")}>Received and inspection passed</Button><Button variant="destructive" disabled={processing || response.trim().length < 10} onClick={() => void runAction(() => API.post(`/refunds/${refund.id}/inspection`, { outcome: "rejected", notes: response }), "Inspection result recorded.")}>Reject after inspection</Button></div>}
          {refund.status === "return_received" && <Button disabled={processing || (!cancellation && response.trim().length < 5)} onClick={() => review("refund_processing")}>Start manual refund processing</Button>}
          {refund.status === "refund_processing" && <><div className="space-y-2"><label className="block space-y-1 text-xs text-muted-foreground">Refund method<select className={field} value={form.method || (refund.payment_method === "chapa" ? "chapa_manual" : "cash")} onChange={(event) => setFormValue("method", event.target.value)}>{refund.payment_method === "chapa" ? <option value="chapa_manual">Chapa manual refund</option> : <><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option></>}</select></label><label className="block space-y-1 text-xs text-muted-foreground">Refund amount<Input type="number" min="0.01" step="0.01" value={form.amount ?? refund.eligible_refund_amount} onChange={(event) => setFormValue("amount", event.target.value)} /></label><label className="block space-y-1 text-xs text-muted-foreground">External payment/refund reference<Input value={form.reference || ""} onChange={(event) => setFormValue("reference", event.target.value)} placeholder="Reference from payment provider or receipt" /></label></div><p className="text-xs leading-5 text-muted-foreground">Only confirm completion after the actual external/manual refund succeeds.</p><div className="flex flex-wrap gap-2"><Button disabled={processing || String(form.reference || "").trim().length < 3} onClick={complete}>Confirm refund completed</Button>{caseActions.recordOutcome && <Button variant="destructive" disabled={processing || response.trim().length < 5} onClick={failAttempt}>Record failed attempt</Button>}</div></>}
          {caseActions.retryManualRefund && <Button disabled={processing} onClick={() => review("refund_processing")}>Retry manual refund</Button>}
        </> : <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground"><p>{canManage ? "No further actions are available for this case state." : "Your account can view this case but cannot change its refund outcome."}</p>{refund.admin_response && <p><span className="font-medium text-foreground">Latest staff response: </span>{refund.admin_response}</p>}</div>}</CardContent></Card>
      </aside>
    </div>
  </main>;
};

export default RefundDetails;
