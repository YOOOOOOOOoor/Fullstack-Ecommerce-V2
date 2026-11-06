import { useCallback, useEffect, useState } from "react";
import API from "../../../API/api.js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  return <main className="space-y-6">
    <header><h1 className="text-3xl font-bold">Staff Permissions</h1><p className="mt-1 text-muted-foreground">Super Admin controls staff activation and least-privilege access.</p></header>
    <form onSubmit={appoint} className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-end">
      <div className="grid min-w-0 content-start gap-1.5"><label htmlFor="staff-account-search" className="block text-sm font-medium leading-5">Find customer</label>
        <Input id="staff-account-search" type="search" value={accountSearch} onChange={(event) => { setAccountSearch(event.target.value); setUserId(""); }} placeholder="Search by name or email" autoComplete="off" />
      </div>
      <div className="grid min-w-0 content-start gap-1.5"><label htmlFor="staff-account-select" className="block text-sm font-medium leading-5">Customer account</label>
        <Select value={userId || null} onValueChange={(value) => setUserId(value || "")} disabled={accountsLoading}>
          <SelectTrigger id="staff-account-select" className="w-full"><SelectValue placeholder={accountsLoading ? "Loading accounts…" : availableAccounts.length ? "Choose an account" : "No matching customer accounts"} /></SelectTrigger>
          <SelectContent>{availableAccounts.length ? availableAccounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name} — {account.email}</SelectItem>) : <SelectItem value="no-accounts" disabled>{accountsLoading ? "Loading accounts…" : "No matching customer accounts"}</SelectItem>}</SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={busy || accountsLoading || !userId}>{busy ? "Granting access…" : "Grant staff access"}</Button>
    </form>
    {staff.filter((member) => !member.is_super_admin).map((member) => {
      const draft = drafts[member.id] || { status: member.status || "active", permissions: [] };
      return <article key={member.id} className="space-y-4 rounded-xl border bg-card p-5">
        <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{member.name}</h2><p className="text-sm text-muted-foreground">{member.email} · Account #{member.id}</p></div><Select value={draft.status} onValueChange={(value) => change(member.id, { status: value })}><SelectTrigger className="w-full sm:w-44" aria-label={`Status for ${member.name}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="deactivated">Deactivated</SelectItem></SelectContent></Select></header>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{permissionOptions.map((permission) => <label key={permission} className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={draft.permissions.includes(permission)} onChange={(event) => change(member.id, { permissions: event.target.checked ? [...draft.permissions, permission] : draft.permissions.filter((item) => item !== permission) })} /><span>{permission.replaceAll("_", " ")}</span></label>)}</div>
        <Button type="button" disabled={busy} onClick={() => save(member)}>{busy ? "Saving…" : "Save access"}</Button>
      </article>;
    })}
    {!staff.some((member) => !member.is_super_admin) && <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No staff accounts yet.</p>}
  </main>;
};
export default Staff;
