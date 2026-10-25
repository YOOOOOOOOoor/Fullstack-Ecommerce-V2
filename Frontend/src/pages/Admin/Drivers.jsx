import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import API from "../../../API/api.js";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";

const AdminDrivers = () => {
  const { user } = useOutletContext();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const [drivers, setDrivers] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await API.get("/admin/delivery/drivers", { params: { search, status } });
      setDrivers(result.data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load drivers.");
    }
  }, [search, status]);
  useEffect(() => {
    let cancelled = false;
    API.get("/admin/delivery/drivers", { params: { search, status } })
      .then((result) => { if (!cancelled) setDrivers(result.data); })
      .catch((error) => { if (!cancelled) toast.error(error.response?.data?.message || "Could not load drivers."); });
    return () => { cancelled = true; };
  }, [search, status]);

  const changeStatus = async (driver, nextStatus) => {
    try {
      setBusyId(driver.user_id);
      await API.patch(`/admin/delivery/drivers/${driver.user_id}/status`, { status: nextStatus, reason });
      toast.success(nextStatus === "revoked" ? "Driver offboarded. Delivery history remains available." : `Driver ${nextStatus}.`);
      setReason("");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update driver.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-3xl font-bold">Driver Management</h1><p className="mt-1 text-muted-foreground">Promoted customer accounts and delivery history</p></div>
        <div className="flex flex-col gap-2 sm:flex-row"><input className="rounded-lg border bg-background px-3 py-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone" /><select className="rounded-lg border bg-background px-3 py-2" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Offboarded</option></select></div>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {drivers.map((driver) => (
          <article key={driver.user_id} className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{driver.name}</h2><p className="text-sm text-muted-foreground">{driver.email} · {driver.phone || "No phone"}</p><p className="mt-1 text-xs text-muted-foreground">Promoted {new Date(driver.promoted_at).toLocaleDateString()}</p></div><span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">{driver.status}</span></div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm"><p className="rounded-lg bg-muted p-2"><strong className="block">{driver.active_deliveries}</strong>Active</p><p className="rounded-lg bg-muted p-2"><strong className="block">{driver.completed_deliveries}</strong>Completed</p><p className="rounded-lg bg-muted p-2"><strong className="block">{driver.failed_deliveries}</strong>Failed</p></div>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {(isSuperAdmin || user?.permissions?.includes("view_delivery_history")) && <Link className="inline-flex min-h-10 items-center rounded-lg border px-3 text-sm" to={`/admin/drivers/${driver.user_id}/history`}>View History</Link>}
            {(isSuperAdmin || user?.permissions?.includes("assign_drivers")) && driver.status !== "revoked" && <>
              {driver.status === "suspended" && <button className="min-h-10 rounded-lg bg-primary px-3 text-sm text-primary-foreground" disabled={busyId === driver.user_id} onClick={() => changeStatus(driver, "active")}>Reactivate</button>}
              {driver.status === "active" && <AlertDialog><AlertDialogTrigger className="min-h-10 rounded-lg border px-3 text-sm">Suspend</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Suspend {driver.name}?</AlertDialogTitle><AlertDialogDescription>The driver will immediately lose driver portal access. Active delivery assignments will be closed for admin reassignment.</AlertDialogDescription></AlertDialogHeader>{!isSuperAdmin && <textarea className="w-full rounded-lg border bg-background p-3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for suspension" />}<AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busyId === driver.user_id || (!isSuperAdmin && reason.trim().length < 5)} onClick={() => changeStatus(driver, "suspended")}>Suspend driver</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
              <AlertDialog><AlertDialogTrigger className="min-h-10 rounded-lg border border-destructive px-3 text-sm text-destructive">Offboard</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Offboard {driver.name}?</AlertDialogTitle><AlertDialogDescription>This permanently removes delivery access. Historical delivery records will be retained, and active assignments will need reassignment.</AlertDialogDescription></AlertDialogHeader>{!isSuperAdmin && <textarea className="w-full rounded-lg border bg-background p-3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for offboarding" />}<AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busyId === driver.user_id || (!isSuperAdmin && reason.trim().length < 5)} onClick={() => changeStatus(driver, "revoked")}>Offboard driver</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </>}
            </div>
          </article>
        ))}
      </div>
      {!drivers.length && <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No drivers match this filter.</p>}
    </div>
  );
};

export default AdminDrivers;
