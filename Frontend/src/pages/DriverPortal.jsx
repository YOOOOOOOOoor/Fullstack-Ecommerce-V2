import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import API from "../../API/api.js";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, Bell, BellOff, MapPin, PackageCheck, Truck } from "lucide-react";
import { deliveryFilterKeys, findNewAssignmentIds, getDeliveryPage, getDeliverySummary, getDriverDeliveries, matchesDeliveryFilter, playAssignmentSound, shouldPlayAssignmentSound } from "./driverPortalUtils.js";
import { useDriverPreferences } from "./driverPreferences.js";
import DriverHeader from "../components/driver/DriverHeader.jsx";
import { isDriverPushRegistered } from "./driverPushNotifications.js";

const money = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "0");

const DriverPortal = ({ user, setUser }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [deliveryError, setDeliveryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("customer_unavailable");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState("all");
  const [visibleCounts, setVisibleCounts] = useState(() => Object.fromEntries(deliveryFilterKeys.map((key) => [key, 5])));
  const [loadError, setLoadError] = useState("");
  const [connection, setConnection] = useState("Connecting…");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [newAssignmentIds, setNewAssignmentIds] = useState([]);
  const [preferences, updatePreferences] = useDriverPreferences(user?.id);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const previousAssignmentIds = useRef(null);
  const alertedAssignmentIds = useRef(new Set());
  const preferencesRef = useRef(preferences);
  const dashboardRequestInFlight = useRef(false);

  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);

  const load = useCallback(async () => {
    try {
      if (id) {
        const result = await API.get(`/driver/deliveries/${id}`);
        setDelivery(result.data);
        setDeliveryError("");
      } else {
        dashboardRequestInFlight.current = true;
        const result = await API.get("/driver");
        setDashboard(result.data);
        setLastUpdated(new Date());
        setLoadError("");
      }
      setConnection("Connected");
    } catch (error) {
      if (error.response?.status === 401) {
        setUser(null);
        navigate("/driver/login", { replace: true });
        return;
      }
      const message = error.response?.data?.message || "Could not load driver deliveries.";
      if (id) setDeliveryError(error.response?.status === 404 ? "This delivery is no longer available to your account." : "Could not load this delivery. Check your connection and try again.");
      setLoadError(message);
      setConnection("Reconnecting");
      if (id) toast.error(message);
    } finally {
      if (!id) dashboardRequestInFlight.current = false;
      setLoading(false);
    }
  }, [id, navigate, setUser]);

  useEffect(() => {
    let cancelled = false;
    let timer;
    let activeController;
    previousAssignmentIds.current = null;
    alertedAssignmentIds.current = new Set();
    dashboardRequestInFlight.current = false;
    setNewAssignmentIds([]);
    setDashboard(null);
    setDelivery(null);
    setDeliveryError("");
    setLoading(true);
    setLoadError("");
    if (id) {
      activeController = new AbortController();
      API.get(`/driver/deliveries/${id}`, { signal: activeController.signal }).then((result) => {
        if (!cancelled) { setDelivery(result.data); setDeliveryError(""); setConnection("Connected"); }
      }).catch((error) => {
        if (!cancelled && error.response?.status === 401) {
          cancelled = true;
          setUser(null);
          navigate("/driver/login", { replace: true });
          return;
        }
        if (!cancelled) { setDeliveryError(error.response?.status === 404 ? "This delivery is no longer available to your account." : "Could not load this delivery. Check your connection and try again."); setConnection("Reconnecting"); }
      }).finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; activeController?.abort(); };
    }

    const poll = async () => {
      if (dashboardRequestInFlight.current) {
        if (!cancelled) timer = window.setTimeout(poll, 1000);
        return;
      }
      dashboardRequestInFlight.current = true;
      try {
        activeController = new AbortController();
        const result = await API.get("/driver", { signal: activeController.signal });
        if (cancelled) return;
        const data = result.data;
        const currentIds = new Set((data.deliveries || []).map((item) => String(item.assignment_id)));
        const previousIds = previousAssignmentIds.current;
        if (previousIds) {
          const freshAlerts = findNewAssignmentIds(data.deliveries || [], previousIds, alertedAssignmentIds.current);
          if (freshAlerts.length) {
            freshAlerts.forEach((assignmentId) => alertedAssignmentIds.current.add(assignmentId));
            setNewAssignmentIds((current) => [...new Set([...current, ...freshAlerts])]);
            toast.info(freshAlerts.length === 1 ? "A new delivery was assigned to you." : `${freshAlerts.length} new deliveries were assigned to you.`);
            const foregroundVisible = document.visibilityState === "visible" && document.hasFocus();
            const fallbackSoundEnabled = foregroundVisible || !isDriverPushRegistered(user?.id);
            if (fallbackSoundEnabled && shouldPlayAssignmentSound(preferencesRef.current.enabled, freshAlerts.length)) {
              const AudioContextClass = window.AudioContext || window.webkitAudioContext;
              playAssignmentSound(AudioContextClass, preferencesRef.current).then((played) => { if (!played && !cancelled) setSoundBlocked(true); });
            }
          }
        }
        previousAssignmentIds.current = currentIds;
        setDashboard(data);
        setLastUpdated(new Date());
        setLoadError("");
        setConnection("Connected");
      } catch (error) {
        if (!cancelled) {
          if (error.response?.status === 401) {
            cancelled = true;
            setUser(null);
            navigate("/driver/login", { replace: true });
            return;
          }
          setConnection("Reconnecting");
          setLoadError((current) => current || error.response?.data?.message || "Updates are temporarily unavailable. Retrying automatically.");
        }
      } finally {
        dashboardRequestInFlight.current = false;
        if (!cancelled) {
          setLoading(false);
          timer = window.setTimeout(poll, 15000);
        }
      }
    };
    poll();
    return () => { cancelled = true; window.clearTimeout(timer); activeController?.abort(); };
  }, [id, navigate, setUser, user?.id]);

  useEffect(() => {
    if (id || !navigator.serviceWorker) return undefined;
    const handlePushMessage = (event) => {
      const data = event.data;
      if (data?.type !== "driver-assignment-push" || !/^\d+$/.test(String(data.assignmentId))) return;
      const assignmentId = String(data.assignmentId);
      if (alertedAssignmentIds.current.has(assignmentId)) return;
      alertedAssignmentIds.current.add(assignmentId);
      setNewAssignmentIds((current) => [...new Set([...current, assignmentId])]);
      toast.info("A new delivery was assigned to you.");
      if (document.visibilityState === "visible" && shouldPlayAssignmentSound(preferencesRef.current.enabled, 1)) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        playAssignmentSound(AudioContextClass, preferencesRef.current).then((played) => { if (!played) setSoundBlocked(true); });
      }
      void load();
    };
    navigator.serviceWorker.addEventListener("message", handlePushMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handlePushMessage);
  }, [id, load]);

  const toggleSound = () => {
    updatePreferences({ enabled: !preferences.enabled });
    setSoundBlocked(false);
  };

  const runAction = async (path, payload = {}, successMessage) => {
    try {
      setBusy(true);
      const result = await API.post(path, payload);
      toast.success(result.data.message || successMessage);
      setCode("");
      if (path.endsWith("/complete")) {
        navigate("/driver/dashboard", { replace: true });
        return;
      }
      await load();
    } catch (error) {
      if (error.response?.status === 401) {
        setUser(null);
        navigate("/driver/login", { replace: true });
        return;
      }
      toast.error(error.response?.data?.message || "Action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><Spinner className="size-8" /></div>;

  const panel = "rounded-2xl border bg-card p-5 shadow-sm";
  const input = "min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-foreground";
  const button = "min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50";

  if (!id) {
    const deliveries = getDriverDeliveries(dashboard);
    const filteredDeliveries = deliveries.filter((item) => matchesDeliveryFilter(item, filter));
    const visibleCount = visibleCounts[filter] || 5;
    const deliveryPage = getDeliveryPage(deliveries, filter, visibleCount);
    const visibleDeliveries = deliveryPage.visible;
    const remainingDeliveries = deliveryPage.remaining;
    const summary = getDeliverySummary(deliveries);
    const summaryCards = [["new", "New offers", summary.new], ["active", "Active deliveries", summary.active], ["delivered", "Delivered", summary.delivered], ["failed", "Failed", summary.failed], ["cancelled", "Cancelled", summary.cancelled], ["returned", "Returned", summary.returned]];
    const filterLabels = { all: "All deliveries", new: "New offers", active: "Active", delivered: "Delivered", failed: "Failed", cancelled: "Cancelled", returned: "Returned" };
    return (
      <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
        <div className="mx-auto max-w-4xl space-y-5">
          <DriverHeader user={user} setUser={setUser} />
          <header className="flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">Driver portal</p><h1 className="text-3xl font-bold">Your deliveries</h1></div>
            <Truck aria-hidden="true" className="size-8 text-primary" />
          </header>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map(([key, label, count]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`${panel} min-w-0 p-4 transition hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary/5`}><p className="text-2xl font-bold">{count}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></button>)}
          </div>
          <div className={panel}><p className="text-sm text-muted-foreground">Outstanding COD to collect</p><p className="text-2xl font-bold">ETB {money(dashboard?.codOutstanding)}</p></div>
          <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">All deliveries</h2><p className="text-xs text-muted-foreground">{connection}{lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString()}` : ""}</p></div><div className="flex items-center gap-2"><span className="text-sm">{preferences.volume}%</span><button type="button" onClick={toggleSound} aria-pressed={preferences.enabled} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium">{preferences.enabled ? <Bell size={16} /> : <BellOff size={16} />}{preferences.enabled ? "Sound on" : "Sound off"}</button></div></div>
            <p className="text-xs text-muted-foreground">{soundBlocked ? "Sound was blocked. Interact with this page once, then new assignment alerts can play." : "Your browser may require one interaction with this page before alert sounds can play."}</p>
            {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"><span>{loadError} {dashboard && "The last loaded deliveries are still shown; retrying automatically."}</span><button type="button" onClick={() => void load()} className="min-h-10 rounded-lg border px-3 font-medium">Refresh now</button></div>}
            {newAssignmentIds.length > 0 && <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm" role="status"><strong>New assignment:</strong> {newAssignmentIds.length} delivery{newAssignmentIds.length === 1 ? "" : "ies"} assigned to you. <button type="button" onClick={() => setNewAssignmentIds([])} className="ml-2 underline">Dismiss</button></div>}
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter deliveries">{Object.entries(filterLabels).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium ${filter === key ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{label}</button>)}</div>
          {visibleDeliveries.length ? visibleDeliveries.map((item) => (
            <Link key={item.assignment_id} to={`/driver/deliveries/${item.id}`} className={`${panel} block transition hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${newAssignmentIds.includes(String(item.assignment_id)) ? "border-primary ring-1 ring-primary/40" : ""}`}>
              {newAssignmentIds.includes(String(item.assignment_id)) && <span className="mb-2 inline-block rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">New assignment</span>}
              <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Order #{item.id}</h2><p className="mt-1 text-sm text-muted-foreground">{item.response_status === "accepted" ? `${item.receiver_name} · ${item.city}` : `${item.city} · Respond to offer`}</p><p className="mt-1 text-xs capitalize text-primary">{item.response_status} · {item.order_status.replaceAll("_", " ")} · {item.payment_method.toUpperCase()}</p></div><span className="font-semibold">ETB {money(item.total_price)}</span></div>
            </Link>
          )) : <div className={`${panel} text-center text-muted-foreground`}><p className="font-medium">{filter === "new" ? "You’re all caught up." : "No deliveries found."}</p><p className="mt-1 text-sm">{filter === "new" ? "No new deliveries right now. New assignments will appear here automatically." : "Try another filter to see more deliveries."}</p></div>}
          {remainingDeliveries > 0 && <button type="button" onClick={() => setVisibleCounts((counts) => ({ ...counts, [filter]: (counts[filter] || 5) + 5 }))} className="min-h-11 w-full rounded-xl border bg-card px-4 font-semibold transition-colors hover:border-primary hover:bg-muted/50">Show more ({remainingDeliveries} remaining)</button>}
          {visibleCount > 5 && filteredDeliveries.length > 5 && <button type="button" onClick={() => setVisibleCounts((counts) => ({ ...counts, [filter]: 5 }))} className="min-h-10 w-full rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Show less</button>}
          </section>
        </div>
      </main>
    );
  }

  if (!delivery) return <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6"><div className="mx-auto max-w-2xl space-y-4"><DriverHeader user={user} setUser={setUser} /><section className={panel}><h1 className="text-xl font-bold">{deliveryError.includes("no longer available") ? "Delivery unavailable" : "Couldn't load delivery"}</h1><p className="mt-2 text-sm text-muted-foreground">{deliveryError || "This delivery could not be loaded."}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-11 rounded-lg border px-4">Try again</button><Link to="/driver/dashboard" className="ml-3 inline-flex min-h-11 items-center text-primary underline">Back to deliveries</Link></section></div></main>;
  const isCodDue = delivery.payment_method === "cod" && delivery.payment_status !== "successful";
  const isRespondableOffer = delivery.response_status === "offered" && !delivery.unassigned_at && delivery.order_status === "assigned_to_driver";
  return (
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <DriverHeader user={user} setUser={setUser} />
        <Link to="/driver/dashboard" className="inline-flex min-h-11 items-center gap-2 text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><ArrowLeft size={18} /> All deliveries</Link>
        <section className={`${panel} min-w-0 break-words`}>
          <p className="text-sm text-muted-foreground">Order #{delivery.id}</p>
          <h1 className="mt-1 text-2xl font-bold">{isRespondableOffer ? "Delivery assignment offer" : delivery.receiver_name || `Order #${delivery.id}`}</h1>
          {isRespondableOffer ? <div className="mt-4 space-y-3"><p className="text-sm text-muted-foreground">Accept to view the customer's delivery details, or reject with a reason. Rejected orders return to staff for manual reassignment.</p><textarea className={input} value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="Rejection reason" placeholder="Reason if rejecting (at least 5 characters)" /><div className="flex gap-3"><button className={`${button} flex-1`} disabled={busy} onClick={() => runAction(`/driver/assignments/${delivery.assignment_id}/respond`, { response: "accept" }, "Assignment accepted.")}>Accept offer</button><button className="min-h-11 flex-1 rounded-lg border px-4 font-semibold" disabled={busy || notes.trim().length < 5} onClick={() => runAction(`/driver/assignments/${delivery.assignment_id}/respond`, { response: "reject", reason: notes }, "Offer declined.")}>Reject offer</button></div></div> : <>
          <p className="mt-2 flex gap-2 text-muted-foreground"><MapPin size={18} /> {delivery.address}, {delivery.sub_city}, {delivery.city}</p>
          <a href={`tel:${delivery.phone}`} className="mt-2 inline-block min-h-11 py-2 text-primary underline">Call {delivery.phone}</a>
          <div className="mt-4 space-y-2 border-t pt-4">{delivery.items.map((item) => <p key={item.product_id} className="flex justify-between gap-4"><span>{item.quantity} × {item.title}</span><span>ETB {money(Number(item.price_at_purchase) * Number(item.quantity))}</span></p>)}</div>
          <p className="mt-4 flex justify-between border-t pt-4 text-lg font-bold"><span>Total</span><span>ETB {money(delivery.total_price)}</span></p>
          <p className="mt-2 text-sm">Payment: {delivery.payment_method.toUpperCase()} · {delivery.payment_status}</p>
          </>}
        </section>

        {delivery.order_status === "assigned_to_driver" && <section className={panel}><button className={`${button} w-full`} disabled={busy} onClick={() => runAction(`/driver/deliveries/${id}/start`, {}, "Delivery started. The code is available on the customer's order details page.")}>Start delivery</button><p className="mt-3 text-xs text-muted-foreground">The customer can view their delivery code on this order's details page.</p></section>}

        {delivery.order_status === "out_for_delivery" && <>
          {isCodDue && <section className={`${panel} space-y-3`}><h2 className="font-semibold">Cash on Delivery collection</h2><p className="text-sm text-muted-foreground">Collect ETB {money(delivery.total_price)}. Payment collection does not confirm delivery.</p><input className={input} inputMode="decimal" aria-label="Amount collected" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount collected (ETB)" /><button className={`${button} w-full`} disabled={busy || !amount} onClick={() => runAction(`/driver/deliveries/${id}/cod-collection`, { amount: Number(amount) }, "Collection recorded.")}>Record collection</button></section>}
          <section className={`${panel} space-y-3`}><h2 className="font-semibold">Confirm delivery</h2><p className="text-sm text-muted-foreground">Enter the one-time code provided by the customer when the order arrives.</p><input className={input} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="Customer verification code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" /><button className={`${button} w-full`} disabled={busy || code.length !== 6} onClick={() => runAction(`/driver/deliveries/${id}/complete`, { code }, "Delivery verified.")}>Confirm delivery</button><p className="text-xs text-muted-foreground">The customer can view the active code on their order details page.</p></section>
          <section className={`${panel} space-y-3`}><h2 className="font-semibold">Record failed attempt</h2><select className={input} value={reason} onChange={(event) => setReason(event.target.value)}><option value="customer_unavailable">Customer unavailable</option><option value="could_not_contact">Could not contact</option><option value="incorrect_address">Incorrect or incomplete address</option><option value="customer_declined">Customer declined</option><option value="other">Other</option></select>{reason === "other" && <textarea className={input} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Explain the issue" />}<button className="min-h-11 w-full rounded-lg border border-destructive px-4 py-2 text-destructive" disabled={busy || (reason === "other" && notes.trim().length < 5)} onClick={() => runAction(`/driver/deliveries/${id}/fail`, { reason, notes }, "Attempt recorded.")}>Record failed attempt</button></section>
        </>}

        {delivery.attempts?.length > 0 && <section className={panel}><h2 className="mb-3 font-semibold">Your attempts</h2>{delivery.attempts.map((attempt) => <p key={attempt.id} className="border-t py-2 text-sm">Attempt {attempt.attempt_number}: {attempt.status.replaceAll("_", " ")} · {new Date(attempt.started_at).toLocaleString()}{attempt.failure_reason ? ` · ${attempt.failure_reason.replaceAll("_", " ")}` : ""}</p>)}</section>}
        {delivery.cod_collection && <section className={`${panel} flex items-center gap-3`}><PackageCheck className="text-primary" /><span>COD {delivery.cod_collection.status}: ETB {money(delivery.cod_collection.collected_amount)}</span></section>}
      </div>
    </main>
  );
};

export default DriverPortal;
