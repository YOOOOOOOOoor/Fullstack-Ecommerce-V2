import { useEffect, useState } from "react";
import API from "../../../API/api.js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { driverOptionLabel, getInitialDriverSelection } from "./adminOrdersState.js";
import { toSelectItems } from "@/lib/selectOptions.js";

function OrderDriverAssignmentDialog({ order, user, open, onOpenChange, onAssign, busy }) {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const isReassignment = Boolean(order?.current_driver_id);
  const reasonRequired = !isSuperAdmin && (isReassignment || order?.order_status === "delivery_failed");

  useEffect(() => {
    if (!open || !order) return undefined;
    const controller = new AbortController();
    let active = true;
    API.get("/admin/delivery/drivers", { params: { status: "active" }, signal: controller.signal })
      .then(({ data }) => {
        if (!active) return;
        const eligibleDrivers = Array.isArray(data) ? data : [];
        setDrivers(eligibleDrivers);
        setSelectedDriver(getInitialDriverSelection(order, eligibleDrivers));
      })
      .catch((requestError) => {
        if (!active || requestError.code === "ERR_CANCELED") return;
        setError(requestError.response?.data?.message || "Could not load active drivers.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [open, order, reloadVersion]);

  const selectedDriverRecord = drivers.find((driver) => String(driver.user_id) === selectedDriver);
  const sameDriverRetry = order?.order_status === "delivery_failed" && String(order.current_driver_id) === selectedDriver;
  const canSubmit = Boolean(selectedDriverRecord)
    && (!isReassignment || selectedDriver !== String(order.current_driver_id) || sameDriverRetry)
    && (!reasonRequired || reason.trim().length >= 5)
    && !busy && !loading;

  const submit = () => {
    if (!canSubmit) return;
    onAssign({ driver: selectedDriverRecord, reason: reason.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isReassignment ? "Reassign driver" : "Assign driver"} · Order #{order?.id}</DialogTitle>
          <DialogDescription>
            {order?.current_driver_name ? `Currently assigned to ${order.current_driver_name}. Choose an active driver.` : "Choose an active driver for this eligible order."}
          </DialogDescription>
        </DialogHeader>

        {order?.order_status === "processing" && <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">Confirming will first move this order to Ready for Dispatch through the existing order workflow, then assign the selected driver. Payment eligibility and staff permissions are checked by the server.</p>}

        {loading ? <p className="py-4 text-sm text-muted-foreground" role="status">Loading active drivers…</p> : error ? (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={() => { setLoading(true); setError(""); setDrivers([]); setSelectedDriver(""); setReloadVersion((value) => value + 1); }}>Retry loading drivers</Button>
          </div>
        ) : drivers.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No active drivers are currently available.</p>
        ) : (
          <div className="space-y-4">
            <label className="block space-y-2 text-sm font-medium" htmlFor="order-driver-select">
              Active driver
              <Select value={selectedDriver} onValueChange={setSelectedDriver} items={toSelectItems(drivers.map((driver) => ({ value: driver.user_id, label: driverOptionLabel(driver) })))}>
                <SelectTrigger id="order-driver-select" className="h-10 w-full"><SelectValue placeholder="Choose a driver" /></SelectTrigger>
                <SelectContent>{drivers.map((driver) => <SelectItem key={driver.user_id} value={String(driver.user_id)}>{driverOptionLabel(driver)}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            {reasonRequired && <label className="block space-y-2 text-sm font-medium" htmlFor="assignment-reason">
              Reason for reassignment
              <Input id="assignment-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} placeholder="At least five characters" />
              <span className="block text-xs font-normal text-muted-foreground">The delivery workflow requires a reason of at least five characters.</span>
            </label>}
            {isReassignment && selectedDriver === String(order.current_driver_id) && !sameDriverRetry && <p className="text-sm text-muted-foreground">Choose a different driver to reassign this order.</p>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!canSubmit} onClick={submit}>{busy ? "Assigning…" : isReassignment ? "Confirm reassignment" : "Assign driver"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrderDriverAssignmentDialog;
