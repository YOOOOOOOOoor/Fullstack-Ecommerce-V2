import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

const CustomerAccordion = ({ title, children, defaultOpen = false, id }) => {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section id={id} className="overflow-hidden rounded-2xl border bg-card">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-4 text-left font-semibold transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-5"
        >
          <span>{title}</span>
          <ChevronDown aria-hidden="true" className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </h2>
      <div id={panelId} className={`customer-accordion-grid ${open ? "is-open" : ""}`} aria-hidden={!open} inert={!open}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-5 pt-1 sm:px-5">{children}</div>
        </div>
      </div>
    </section>
  );
};

export default CustomerAccordion;
