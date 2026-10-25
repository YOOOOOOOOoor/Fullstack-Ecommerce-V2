import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Bell, ExternalLink, X } from "lucide-react";
import API from "../../../API/api.js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clearNotifications, countNotifications, dismissNotification } from "./notificationWarningsState.js";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const readableAction = (action = "staff activity") => action.replaceAll(".", " ").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

const NotificationWarnings = () => {
  const [notifications, setNotifications] = useState({ activities: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [activityDetails, setActivityDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    API.get("/admin/notifications/activities")
      .then((result) => { if (active) setNotifications({ activities: Array.isArray(result.data) ? result.data : [] }); })
      .catch((error) => { if (active) toast.error(error.response?.data?.message || "Could not load staff activity."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const dismissOne = async (item) => {
    if (busyId !== null) return;
    setBusyId(item.id);
    try {
      await API.patch(`/admin/notifications/${item.id}/dismiss`);
      setNotifications((current) => dismissNotification(current, item.id));
      toast.success("Notification dismissed.");
    } catch (error) { toast.error(error.response?.data?.message || "Could not dismiss this notification."); }
    finally { setBusyId(null); }
  };

  const showActivityDetails = async (item) => {
    setSelectedActivity(item);
    setActivityDetails(null);
    setDetailsLoading(true);
    try {
      const response = await API.get(`/admin/notifications/activities/${item.id}`);
      setActivityDetails(response.data);
    } catch (error) { toast.error(error.response?.data?.message || "Could not load the audit record."); }
    finally { setDetailsLoading(false); }
  };

  const dismissAll = async () => {
    if (clearingAll || countNotifications(notifications) === 0) return;
    setClearingAll(true);
    try {
      await API.post("/admin/notifications/dismiss-all");
      setNotifications(clearNotifications());
      setConfirmClearAll(false);
      toast.success("All notifications cleared.");
    } catch (error) { toast.error(error.response?.data?.message || "Could not clear notifications."); }
    finally { setClearingAll(false); }
  };

  const { activities } = notifications;
  const count = countNotifications(notifications);
  const dismissButton = (item) => <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss staff activity notification" title="Dismiss notification" disabled={busyId !== null || clearingAll} onClick={() => dismissOne(item)}><X aria-hidden="true" className="size-4" /></Button>;

  return <main className="space-y-8">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2"><Bell className="size-6 text-primary" aria-hidden="true" /><h1 className="text-3xl font-bold">Notifications</h1><Badge variant={count ? "destructive" : "secondary"} aria-label={`${count} active notifications`}>{count}</Badge></div><p className="mt-1 text-muted-foreground">Review and dismiss staff activity notifications. Audit records remain available for review.</p></div>
      {count > 0 && <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setConfirmClearAll(true)} disabled={clearingAll || busyId !== null}>Clear all</Button>}
    </header>
    <section className="space-y-3"><div className="flex items-center gap-2"><Activity className="size-5 text-primary" aria-hidden="true" /><h2 className="text-xl font-semibold">Staff activity</h2><Badge variant="secondary">{activities.length}</Badge></div>
      {activities.map((item) => <article key={item.id} className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><button type="button" className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" onClick={() => showActivityDetails(item)} aria-label={`View details: ${item.payload.actorName || "Staff member"}, ${readableAction(item.action || item.payload.action)}`}><h3 className="font-semibold">{item.payload.actorName || "Staff member"} · {readableAction(item.action || item.payload.action)}</h3><p className="mt-2 text-sm text-muted-foreground">{item.entity_type || item.payload.entityType}{(item.entity_id || item.payload.entityId) ? ` #${item.entity_id || item.payload.entityId}` : ""} · {new Date(item.created_at).toLocaleString()}</p><span className="mt-2 inline-block text-xs text-primary">View audit details</span></button>{dismissButton(item)}</div></article>)}
      {!loading && activities.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">No staff activity notifications to show.</p>}
    </section>
    {loading && <p role="status" className="sr-only">Loading notifications</p>}
    <AlertDialog open={confirmClearAll} onOpenChange={(open) => { if (!clearingAll) setConfirmClearAll(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Clear all notifications?</AlertDialogTitle><AlertDialogDescription>This hides visible staff activity notifications. The underlying audit records are retained.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={clearingAll}>Cancel</AlertDialogCancel><AlertDialogAction disabled={clearingAll} onClick={dismissAll}>{clearingAll ? "Clearing…" : "Clear all"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(selectedActivity)} onOpenChange={(open) => { if (!open) { setSelectedActivity(null); setActivityDetails(null); } }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Staff activity details</DialogTitle><DialogDescription>Details from the persistent audit record. Dismissing this notification never deletes that record.</DialogDescription></DialogHeader>
      {detailsLoading && <p role="status" className="text-sm text-muted-foreground">Loading audit details…</p>}
      {activityDetails && <div className="space-y-4 text-sm"><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2"><dt className="text-muted-foreground">Staff member</dt><dd>{activityDetails.actor.name} <span className="text-muted-foreground">(ID {activityDetails.actor.id ?? "system"})</span></dd><dt className="text-muted-foreground">Action</dt><dd>{readableAction(activityDetails.action)}</dd><dt className="text-muted-foreground">Resource</dt><dd className="capitalize">{activityDetails.entity.type}{activityDetails.entity.id ? ` #${activityDetails.entity.id}` : ""}</dd><dt className="text-muted-foreground">When</dt><dd>{new Date(activityDetails.created_at).toLocaleString()}</dd></dl>
        {Object.keys(activityDetails.details || {}).length > 0 && <div className="border-t pt-3"><h3 className="mb-2 font-medium">Recorded changes</h3><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">{Object.entries(activityDetails.details).map(([key, value]) => <div key={key} className="contents"><dt className="capitalize text-muted-foreground">{key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</dt><dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd></div>)}</dl></div>}
        {activityDetails.resource_url && <Link className="inline-flex items-center gap-2 font-medium text-primary underline underline-offset-4" to={activityDetails.resource_url} onClick={() => setSelectedActivity(null)}>Open related record <ExternalLink aria-hidden="true" className="size-4" /></Link>}
      </div>}
      {!detailsLoading && selectedActivity && !activityDetails && <p className="text-sm text-muted-foreground">The audit detail is unavailable.</p>}
    </DialogContent></Dialog>
  </main>;
};

export default NotificationWarnings;
