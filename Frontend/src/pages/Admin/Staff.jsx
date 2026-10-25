import { useCallback, useEffect, useState } from "react";
import API from "../../../API/api.js";
import { toast } from "sonner";

const Staff = () => {
  const [staff, setStaff] = useState([]);
  const [permissionOptions, setPermissionOptions] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [userId, setUserId] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
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
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setAccountsLoading(true);
      try {
        const result = await API.get("/admin/customers", {
          params: { page: 1, limit: 100, search: accountSearch, role: "customer" },
        });
        if (active) {
          setAvailableAccounts((result.data.users || []).filter((account) => account.account_type === "customer"));
        }
      } catch (error) {
        if (active) toast.error(error.response?.data?.message || "Could not load customer accounts.");
      } finally {
        if (active) setAccountsLoading(false);
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accountSearch]);
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
      setAvailableAccounts((accounts) => accounts.filter((account) => String(account.id) !== userId));
      toast.success("Staff account created with no permissions. Grant only the access it needs.");
      await load();
    } catch (error) { toast.error(error.response?.data?.message || "Could not appoint this staff account."); }
    finally { setBusy(false); }
  };
  const change = (id, patch) => setDrafts((previous) => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  const field = "min-h-11 rounded-lg border bg-background px-3 py-2 text-sm";
  return <main className="space-y-6">
    <header><h1 className="text-3xl font-bold">Staff Permissions</h1><p className="mt-1 text-muted-foreground">Super Admin controls staff activation and least-privilege access.</p></header>
    <form onSubmit={appoint} className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-end">
      <label htmlFor="staff-account-search" className="space-y-1.5 text-sm font-medium">Find customer
        <input id="staff-account-search" type="search" className={"w-full " + field} value={accountSearch} onChange={(event) => { setAccountSearch(event.target.value); setUserId(""); }} placeholder="Search by name or email" autoComplete="off" />
      </label>
      <label htmlFor="staff-account-select" className="space-y-1.5 text-sm font-medium">Customer account
        <select id="staff-account-select" className={"w-full " + field} value={userId} onChange={(event) => setUserId(event.target.value)} required disabled={accountsLoading}>
          <option value="" disabled>{accountsLoading ? "Loading accounts…" : availableAccounts.length ? "Choose an account" : "No matching customer accounts"}</option>
          {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {account.email}</option>)}
        </select>
      </label>
      <button className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50" disabled={busy || accountsLoading || !userId}>Grant staff access</button>
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
