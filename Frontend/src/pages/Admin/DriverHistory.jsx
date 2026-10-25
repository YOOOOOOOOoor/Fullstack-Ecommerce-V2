import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import API from "../../../API/api.js";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;
const eventLabel = (event) => event.type.replaceAll("_", " ").replaceAll(".", " ");

export default function DriverHistory() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (nextOffset) => {
    setLoading(true);
    setError("");
    try {
      const response = await API.get(`/admin/delivery/drivers/${userId}/history`, { params: { limit: PAGE_SIZE, offset: nextOffset } });
      setData(response.data);
      setOffset(nextOffset);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Driver history could not be loaded.");
    } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => {
    const timer = window.setTimeout(() => load(0), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading && !data) return <div className="rounded-xl border bg-card p-8 text-muted-foreground">Loading driver history…</div>;
  if (error && !data) return <section className="space-y-4 rounded-xl border bg-card p-6"><p role="alert">{error}</p><Button onClick={() => load(0)}>Retry</Button></section>;
  return <div className="space-y-6">
    <header className="space-y-2">
      <Link to="/admin/drivers" className="text-sm text-primary hover:underline">← Driver management</Link>
      <h1 className="text-3xl font-bold">Driver History</h1>
      {data?.driver && <div className="rounded-xl border bg-card p-4"><h2 className="font-semibold">{data.driver.name}</h2><p className="text-sm text-muted-foreground">{data.driver.email} · Account #{data.driver.user_id}</p><p className="mt-2 text-sm">Current status: <span className="font-medium capitalize">{data.driver.status}</span> · Promoted {new Date(data.driver.promoted_at).toLocaleString()}</p></div>}
    </header>
    {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {loading && <p className="text-sm text-muted-foreground">Updating history…</p>}
    {!data?.events?.length ? <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No recorded activity for this driver.</p> : <ol className="space-y-3">
      {data.events.map((event, index) => <li key={`${event.type}-${event.order_id}-${event.occurred_at}-${index}`} className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold capitalize text-accent-foreground">{eventLabel(event)}</span>{event.outcome && <span className="ml-2 text-sm capitalize">{String(event.outcome).replaceAll("_", " ")}</span>}</div><time className="text-sm text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</time></div>
        {event.order_id && <p className="mt-3 text-sm">Order <Link className="font-medium text-primary hover:underline" to={`/admin/orders/${event.order_id}`}>#{event.order_id}</Link></p>}
        {(event.actor_name || event.unassigned_by_name) && <p className="mt-1 text-sm text-muted-foreground">Recorded by {event.actor_name || event.unassigned_by_name}</p>}
        {event.unassigned_at && <p className="mt-1 text-sm text-muted-foreground">Unassigned {new Date(event.unassigned_at).toLocaleString()}{event.unassigned_by_name ? ` by ${event.unassigned_by_name}` : ""}</p>}
        {event.details && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{event.details}</p>}
      </li>)}
    </ol>}
    <footer className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Showing {data?.events?.length || 0} of {data?.total || 0} recorded events</p><div className="flex gap-2"><Button variant="outline" disabled={loading || offset === 0} onClick={() => load(Math.max(0, offset - PAGE_SIZE))}>Newer</Button><Button variant="outline" disabled={loading || offset + PAGE_SIZE >= (data?.total || 0)} onClick={() => load(offset + PAGE_SIZE)}>Older</Button></div></footer>
  </div>;
}
