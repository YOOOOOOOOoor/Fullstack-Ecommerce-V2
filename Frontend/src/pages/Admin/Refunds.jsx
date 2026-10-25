import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Grid2X2, List, Search, X } from "lucide-react";
import API from "../../../API/api.js";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterRefundCases, getRefundStatusCounts, paginateRefundCases, readRefundView, REFUND_PAGE_SIZE } from "./refundManagementState.js";

const money = (value) => `ETB ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (value) => value ? new Date(value).toLocaleString() : "Not available";
const readable = (value) => String(value || "Unknown").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const badgeVariant = (status) => status === "refunded" ? "success" : status === "rejected" ? "destructive" : status === "refund_failed" ? "warning" : ["requested", "under_review"].includes(status) ? "warning" : "secondary";

function RefundViewButton({ label, active, icon: Icon, onClick }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant={active ? "secondary" : "ghost"} size="icon-sm" aria-label={label} aria-pressed={active} onClick={onClick}><Icon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function RefundGridCard({ refund, onView }) {
  const reason = refund.cancellation_reason || refund.description || readable(refund.reason);
  return <Card className="flex h-full min-w-0 flex-col transition-colors hover:bg-muted/20">
    <CardHeader className="gap-3 pb-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="text-base">Refund #{refund.id}</CardTitle><CardDescription className="mt-1">Order #{refund.order_id}</CardDescription></div><Badge variant={badgeVariant(refund.status)} className="capitalize">{readable(refund.status)}</Badge></div>
      <div className="space-y-1 text-sm"><p className="truncate font-medium">{refund.customer_name || refund.customer_email || "Customer"}</p><p className="text-muted-foreground">{when(refund.requested_at)}</p></div>
    </CardHeader>
    <CardContent className="flex flex-1 flex-col gap-4 pt-0"><p className="line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{reason || "No reason or description provided."}</p><div className="mt-auto flex items-end justify-between gap-3 border-t pt-3"><div><p className="text-xs text-muted-foreground">Amount for review</p><p className="font-semibold tabular-nums">{money(refund.requested_amount ?? refund.eligible_refund_amount)}</p></div><Button type="button" size="sm" onClick={() => onView(refund.id)}>View Details</Button></div></CardContent>
  </Card>;
}

const Refunds = () => {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const search = searchParams.get("q") || "";
  const statusFilter = searchParams.get("status") || "all";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const view = readRefundView(searchParams);

  useEffect(() => {
    let active = true;
    API.get("/refunds/admin").then(({ data }) => { if (active) { setRefunds(Array.isArray(data) ? data : []); setLoadError(""); } })
      .catch((error) => { if (active) { setLoadError(error.response?.data?.message || "Could not load refund cases."); toast.error(error.response?.data?.message || "Could not load refund cases."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => filterRefundCases(refunds, search, statusFilter), [refunds, search, statusFilter]);
  const counts = useMemo(() => getRefundStatusCounts(refunds), [refunds]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / REFUND_PAGE_SIZE));
  const effectivePage = Math.min(page, pageCount);
  const visible = useMemo(() => paginateRefundCases(filtered, effectivePage, REFUND_PAGE_SIZE), [filtered, effectivePage]);
  const updateParams = (changes, resetPage = false) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: true });
  };
  const viewCase = (refundId) => navigate(`/admin/refunds/${refundId}${location.search}`, { state: { returnTo: `${location.pathname}${location.search}` } });
  const clearFilters = () => setSearchParams(view === "grid" ? new URLSearchParams() : new URLSearchParams({ view }), { replace: true });

  const countCards = [["Needs review", counts.needsReview], ["In progress", counts.inProgress], ["Completed", counts.completed], ["Rejected / failed", counts.failed]];
  return <main className="space-y-6">
    <header><p className="text-sm font-medium text-primary">Operations</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Refund management</h1><p className="mt-1 text-muted-foreground">Review customer claims and paid cancellations. Manual refunds are recorded only after confirmation.</p></header>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Refund case summary">{countCards.map(([label, count]) => <article key={label} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{count}</p></article>)}</section>
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><div className="grid flex-1 gap-3 md:grid-cols-[minmax(15rem,1fr)_14rem]"><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => updateParams({ q: event.target.value }, true)} placeholder="Search refund, order, customer, email" aria-label="Search refund cases" /></div><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => updateParams({ status: event.target.value === "all" ? "" : event.target.value }, true)} aria-label="Filter cases by status"><option value="all">All statuses</option>{[...new Set(refunds.map((refund) => refund.status))].sort().map((status) => <option key={status} value={status}>{readable(status)}</option>)}</select></div><div className="flex items-center justify-between gap-3 sm:justify-end"><Button type="button" variant="outline" size="sm" onClick={clearFilters} disabled={!search && statusFilter === "all"}><X aria-hidden="true" className="mr-1 size-4" />Clear filters</Button><div role="group" aria-label="Refund list view" className="flex items-center rounded-lg border p-1"><RefundViewButton label="Grid view" active={view === "grid"} icon={Grid2X2} onClick={() => updateParams({ view: "" })} /><RefundViewButton label="Table view" active={view === "table"} icon={List} onClick={() => updateParams({ view: "table" })} /></div></div></section>
    <div className="flex items-center justify-between text-sm text-muted-foreground" aria-live="polite"><span>{filtered.length} {filtered.length === 1 ? "case" : "cases"} found</span><span>Page {effectivePage} of {pageCount}</span></div>
    {loading ? <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">Loading refund cases…</p> : loadError && !refunds.length ? <section className="rounded-xl border bg-card p-8 text-center"><p>{loadError}</p><Button className="mt-4" onClick={() => { setLoading(true); API.get("/refunds/admin").then(({ data }) => { setRefunds(data); setLoadError(""); }).catch((error) => setLoadError(error.response?.data?.message || "Could not load refund cases.")).finally(() => setLoading(false)); }}>Try again</Button></section> : !visible.length ? <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{refunds.length ? "No cases match these filters." : "No refund cases yet."}</p> : view === "grid" ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">{visible.map((refund) => <RefundGridCard key={refund.id} refund={refund} onView={viewCase} />)}</div> : <div className="overflow-x-auto rounded-xl border bg-card"><Table className="min-w-[820px]"><TableHeader><TableRow className="bg-muted/50"><TableHead>Case / order</TableHead><TableHead>Customer</TableHead><TableHead>Reason</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Requested</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{visible.map((refund) => <TableRow key={refund.id}><TableCell><p className="font-semibold">Refund #{refund.id}</p><p className="text-muted-foreground">Order #{refund.order_id}</p></TableCell><TableCell><p className="max-w-48 truncate font-medium">{refund.customer_name}</p><p className="max-w-48 truncate text-xs text-muted-foreground">{refund.customer_email}</p></TableCell><TableCell className="max-w-48 truncate">{refund.cancellation_reason || refund.description || readable(refund.reason)}</TableCell><TableCell className="whitespace-nowrap font-medium tabular-nums">{money(refund.requested_amount ?? refund.eligible_refund_amount)}</TableCell><TableCell><Badge variant={badgeVariant(refund.status)} className="capitalize">{readable(refund.status)}</Badge></TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{when(refund.requested_at)}</TableCell><TableCell className="text-right"><Button size="sm" onClick={() => viewCase(refund.id)}>View Details</Button></TableCell></TableRow>)}</TableBody></Table></div>}
    {!loading && visible.length > 0 && <nav className="flex justify-end gap-2" aria-label="Refund case pages"><Button variant="outline" disabled={effectivePage <= 1} onClick={() => updateParams({ page: effectivePage - 1 })}>Previous</Button><Button variant="outline" disabled={effectivePage >= pageCount} onClick={() => updateParams({ page: effectivePage + 1 })}>Next</Button></nav>}
  </main>;
};

export default Refunds;
