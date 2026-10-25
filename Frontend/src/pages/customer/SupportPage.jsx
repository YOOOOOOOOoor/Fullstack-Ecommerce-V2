import { useCallback, useEffect, useState } from "react";
import API from "../../../API/api.js";
import { toast } from "sonner";

const blankFaq = { question: "", answer: "", is_published: false };
const inputClass = "min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-foreground";

const SupportPage = ({ adminMode = false }) => {
  const [faqs, setFaqs] = useState([]);
  const [contact, setContact] = useState({ support_email: "", support_phone: "" });
  const [draft, setDraft] = useState(blankFaq);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await API.get(adminMode ? "/support/manage" : "/support");
      setFaqs(response.data.faqs || []);
      setContact({ support_email: response.data.contact?.support_email || "", support_phone: response.data.contact?.support_phone || "" });
    } catch (error) { toast.error(error.response?.data?.message || "Could not load support information."); }
    finally { setLoading(false); }
  }, [adminMode]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const saveFaq = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) await API.put(`/support/faqs/${editing}`, draft);
      else await API.post("/support/faqs", draft);
      toast.success(editing ? "FAQ updated." : "FAQ added.");
      setDraft(blankFaq); setEditing(null); await load();
    } catch (error) { toast.error(error.response?.data?.message || "Could not save FAQ."); }
    finally { setSaving(false); }
  };

  const saveContact = async (event) => {
    event.preventDefault(); setSaving(true);
    try { const result = await API.put("/support/contact", contact); setContact({ support_email: result.data.support_email || "", support_phone: result.data.support_phone || "" }); toast.success("Support contact saved."); }
    catch (error) { toast.error(error.response?.data?.message || "Could not save support contact."); }
    finally { setSaving(false); }
  };

  const moveFaq = async (index, offset) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= faqs.length || saving) return;
    const reordered = [...faqs]; [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setSaving(true); setFaqs(reordered);
    try { await API.put("/support/faqs/reorder", { ids: reordered.map((faq) => faq.id) }); toast.success("FAQ order saved."); }
    catch (error) { toast.error(error.response?.data?.message || "Could not reorder FAQs."); await load(); }
    finally { setSaving(false); }
  };

  const editFaq = (faq) => { setEditing(faq.id); setDraft({ question: faq.question, answer: faq.answer, is_published: faq.is_published }); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const deleteFaq = async (faq) => {
    if (!window.confirm(`Delete “${faq.question}”?`)) return;
    try { await API.delete(`/support/faqs/${faq.id}`); setFaqs((items) => items.filter((item) => item.id !== faq.id)); toast.success("FAQ deleted."); }
    catch (error) { toast.error(error.response?.data?.message || "Could not delete FAQ."); }
  };

  const toggleFaq = async (faq) => {
    try { const result = await API.put(`/support/faqs/${faq.id}`, { question: faq.question, answer: faq.answer, is_published: !faq.is_published }); setFaqs((items) => items.map((item) => item.id === faq.id ? { ...item, ...result.data } : item)); }
    catch (error) { toast.error(error.response?.data?.message || "Could not update FAQ."); }
  };

  return <main className="mx-auto max-w-4xl space-y-8">
    <header><p className="text-sm font-semibold uppercase tracking-wider text-primary">Yordi Store</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">FAQ & Support</h1><p className="mt-3 text-muted-foreground">Answers about orders, delivery, payments, returns, and getting help.</p></header>
    {adminMode && <section className="space-y-6 rounded-2xl border bg-card p-5 sm:p-7">
      <div><h2 className="text-xl font-semibold">Manage customer support</h2><p className="mt-1 text-sm text-muted-foreground">Changes are saved to the store database and shown to customers.</p></div>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveContact}>
        <label className="space-y-1 text-sm">Support email<input className={inputClass} type="email" maxLength={254} value={contact.support_email} onChange={(event) => setContact({ ...contact, support_email: event.target.value })} /></label>
        <label className="space-y-1 text-sm">Support phone<input className={inputClass} type="tel" maxLength={40} value={contact.support_phone} onChange={(event) => setContact({ ...contact, support_phone: event.target.value })} /></label>
        <button disabled={saving} className="min-h-10 w-fit rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">Save contact</button>
      </form>
      <form className="space-y-3 border-t pt-5" onSubmit={saveFaq}>
        <h3 className="font-semibold">{editing ? "Edit FAQ" : "Add FAQ"}</h3>
        <input className={inputClass} required minLength={5} maxLength={240} placeholder="Question" value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} />
        <textarea className={`${inputClass} min-h-28`} required minLength={10} maxLength={5000} placeholder="Answer" value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} />
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_published} onChange={(event) => setDraft({ ...draft, is_published: event.target.checked })} />Published to customers</label>
        <div className="flex gap-2"><button disabled={saving} className="min-h-10 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">{editing ? "Save changes" : "Add FAQ"}</button>{editing && <button type="button" className="min-h-10 rounded-lg border px-4" onClick={() => { setEditing(null); setDraft(blankFaq); }}>Cancel</button>}</div>
      </form>
      <div className="space-y-2 border-t pt-5">{faqs.map((faq, index) => <div key={faq.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{faq.question}</p><p className="text-xs text-muted-foreground">{faq.is_published ? "Published" : "Draft"}</p></div><div className="flex flex-wrap gap-2"><button disabled={saving || index === 0} className="rounded border px-2 py-1 text-sm disabled:opacity-40" aria-label="Move FAQ up" onClick={() => moveFaq(index, -1)}>↑</button><button disabled={saving || index === faqs.length - 1} className="rounded border px-2 py-1 text-sm disabled:opacity-40" aria-label="Move FAQ down" onClick={() => moveFaq(index, 1)}>↓</button><button className="rounded border px-3 py-1 text-sm" onClick={() => toggleFaq(faq)}>{faq.is_published ? "Unpublish" : "Publish"}</button><button className="rounded border px-3 py-1 text-sm" onClick={() => editFaq(faq)}>Edit</button><button className="rounded border border-destructive px-3 py-1 text-sm text-destructive" onClick={() => deleteFaq(faq)}>Delete</button></div></div>)}</div>
    </section>}
    <section aria-labelledby="faq-list-heading"><h2 id="faq-list-heading" className="mb-4 text-xl font-semibold">Frequently asked questions</h2>{loading ? <p className="rounded-xl border bg-card p-6 text-muted-foreground">Loading support information…</p> : faqs.length ? <div className="space-y-3">{faqs.map((faq) => <details key={faq.id} className="group rounded-xl border bg-card p-5"><summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"><span>{faq.question}</span><span aria-hidden="true" className="customer-faq-chevron shrink-0 text-muted-foreground transition-transform duration-200">⌄</span></summary><div className="customer-faq-panel"><div className="min-h-0 overflow-hidden"><p className="whitespace-pre-wrap pt-3 text-sm leading-6 text-muted-foreground">{faq.answer}</p></div></div></details>)}</div> : <p className="rounded-xl border bg-card p-6 text-muted-foreground">Support information is temporarily unavailable.</p>}</section>
    <section className="rounded-2xl border bg-card p-5 sm:p-7"><h2 className="text-xl font-semibold">Contact the store</h2><p className="mt-2 text-sm text-muted-foreground">For help with your order, contact us using the details configured by the store.</p><div className="mt-4 flex flex-wrap gap-4 text-sm">{contact.support_email && <a className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={`mailto:${contact.support_email}`}>{contact.support_email}</a>}{contact.support_phone && <a className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={`tel:${contact.support_phone}`}>{contact.support_phone}</a>}{!contact.support_email && !contact.support_phone && <p className="text-muted-foreground">Contact details have not been configured yet.</p>}</div></section>
  </main>;
};

export default SupportPage;
