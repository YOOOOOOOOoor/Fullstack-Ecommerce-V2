import { useEffect, useState } from "react";
import API from "../../../API/api.js";
import { toast } from "sonner";

const ShippingSettings = () => {
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    API.get("/admin/shipping/default").then((result) => { if (active) setFee(result.data.default_fee == null ? "" : String(result.data.default_fee)); })
      .catch((error) => { if (active) toast.error(error.response?.data?.message || "Could not load shipping settings."); });
    return () => { active = false; };
  }, []);
  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy(true);
      const result = await API.put("/admin/shipping/default", { default_fee: Number(fee) });
      setFee(String(result.data.default_fee));
      toast.success(result.data.message);
    } catch (error) { toast.error(error.response?.data?.message || "Could not save shipping fee."); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-2xl space-y-6">
    <header><h1 className="text-3xl font-bold">Shipping Configuration</h1><p className="mt-1 text-muted-foreground">Set the default ETB delivery fee for new orders. Existing order totals remain unchanged.</p>{fee === "" && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">No default fee is configured yet. Enter the initial fee to enable checkout.</p>}</header>
    <form onSubmit={save} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <label className="block space-y-2 text-sm font-medium">Default shipping fee (ETB)<input className="min-h-11 w-full rounded-lg border bg-background px-3" type="number" min="0" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} required /></label>
      <button className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground" disabled={busy}>{busy ? "Saving…" : "Save shipping fee"}</button>
    </form>
  </main>;
};
export default ShippingSettings;
