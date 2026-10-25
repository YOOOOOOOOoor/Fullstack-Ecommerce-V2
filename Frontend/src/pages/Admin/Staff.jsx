import { useCallback, useEffect, useState } from "react";
import API from "../../../API/api.js";
import { toast } from "sonner";

const Staff = () => {
  const [staff, setStaff] = useState([]);
  const [permissionOptions, setPermissionOptions] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await API.get("/admin/staff");
    setStaff(result.data.staff);
    setPermissionOptions(result.data.permissions);
    setDrafts(Object.fromEntries(result.data.staff.map((member) => [member.id, { status: member.status || "active", permissions: member.permissions || [] }])));
  }, []);
  useEffect(() => {
    let active = true;
    API.get("/admin/staff").then((result) => {
      if (!active) return;
      setStaff(result.data.staff);
      setPermissionOptions(result.data.permissions);
      setDrafts(Object.fromEntries(result.data.staff.map((member) => [member.id, { status: member.status || "active", permissions: member.permissions || [] }])));
    }).catch((error) => { if (active) toast.error(error.response?.data?.message || "Could not load staff permissions."); });
    return () => { active = false; };
  }, []);
  const save = async (member) => {
    try {
      setBusy(true);
      await API.put(`/admin/staff/${member.id}`, drafts[member.id]);
      toast.success("Staff access updated.");
      await load();
    } catch (error) { toast.error(error.response?.data?.message || "Could not update staff access."); }
    finally { setBusy(false); }
  };
  const appoint = async (event) => {
    event.preventDefault();
    try {
      setBusy(true);
      await API.post(`/admin/staff/${userId}`, {});
      setUserId("");
      toast.success("Staff account created with no permissions. Grant only the access it needs.");
      await load();
    } catch (error) { toast.error(error.response?.data?.message || "Could not appoint this staff account."); }
    finally { setBusy(false); }
  };
  const change = (id, patch) => setDrafts((previous) => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  const field = "min-h-11 rounded-lg border bg-background px-3 py-2 text-sm";
  return <main className="space-y-6">
    <header><h1 className="text-3xl font-bold">Staff Permissions</h1><p className="mt-1 text-muted-foreground">Super Admin controls staff activation and least-privilege access.</p></header>
    <form onSubmit={appoint} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_2fr_auto]">
      <input className={field} value={userId} onChange={(event) => setUserId(event.target.value)} required inputMode="numeric" aria-label="Existing customer account ID" placeholder="Existing account ID" />
      <button className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground" disabled={busy}>Appoint staff</button>
      <p className="text-xs text-muted-foreground sm:col-span-3">Appointing changes the existing account to the admin login role; the new staff member receives no operational permissions until you grant them.</p>
    </form>
    {staff.filter((member) => !member.is_super_admin).map((member) => {
      const draft = drafts[member.id] || { status: member.status || "active", permissions: [] };
      return <article key={member.id} className="space-y-4 rounded-xl border bg-card p-5">
        <header className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{member.name}</h2><p className="text-sm text-muted-foreground">{member.email} · Account #{member.id}</p></div><select className={field} value={draft.status} onChange={(event) => change(member.id, { status: event.target.value })}><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select></header>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{permissionOptions.map((permission) => <label key={permission} className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={draft.permissions.includes(permission)} onChange={(event) => change(member.id, { permissions: event.target.checked ? [...draft.permissions, permission] : draft.permissions.filter((item) => item !== permission) })} /><span>{permission.replaceAll("_", " ")}</span></label>)}</div>
        <button type="button" className="min-h-10 rounded-lg bg-primary px-4 font-semibold text-primary-foreground" disabled={busy} onClick={() => save(member)}>Save access</button>
      </article>;
    })}
    {!staff.some((member) => !member.is_super_admin) && <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No staff accounts yet.</p>}
  </main>;
};
export default Staff;
