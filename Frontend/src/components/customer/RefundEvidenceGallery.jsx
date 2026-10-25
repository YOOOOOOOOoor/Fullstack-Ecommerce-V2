import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const sourceFor = (image) => typeof image === "string" ? image : image?.src || image?.url || "";
const labelFor = (image, index) => typeof image === "string" ? `Evidence image ${index + 1}` : image?.name || `Evidence image ${index + 1}`;

const RefundEvidenceGallery = ({ images = [], onRemove, label = "Customer evidence" }) => {
  const [activeIndex, setActiveIndex] = useState(null);
  const [failedSources, setFailedSources] = useState(() => new Set());
  const activeImage = Number.isInteger(activeIndex) ? images[activeIndex] : null;

  const markFailed = (source) => setFailedSources((previous) => new Set(previous).add(source));
  const move = (direction) => setActiveIndex((index) => (index + direction + images.length) % images.length);

  if (!images.length) return null;
  return <>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label={label}>
      {images.map((image, index) => {
        const src = sourceFor(image);
        const failed = !src || failedSources.has(src);
        return <figure key={src || `missing-${index}`} className="group relative min-w-0 overflow-hidden rounded-xl border bg-muted/30">
          <button type="button" className="block aspect-square w-full focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring" aria-label={`Open ${labelFor(image, index)}`} onClick={() => setActiveIndex(index)}>
            {failed ? <span className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-xs text-muted-foreground"><ImageOff aria-hidden="true" className="size-5" />Preview unavailable</span> : <img src={src} alt={labelFor(image, index)} loading="lazy" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" onError={() => markFailed(src)} />}
          </button>
          {(image?.name || onRemove) && <figcaption className="flex min-w-0 items-center justify-between gap-2 border-t bg-card px-2.5 py-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">{image?.name || `Image ${index + 1}`}{image?.sizeLabel && <span className="ml-1">· {image.sizeLabel}</span>}</span>
            {onRemove && <button type="button" aria-label={`Remove ${labelFor(image, index)}`} className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onRemove(index)}><X aria-hidden="true" className="size-4" /></button>}
          </figcaption>}
        </figure>;
      })}
    </div>

    <Dialog open={Boolean(activeImage)} onOpenChange={(open) => { if (!open) setActiveIndex(null); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="pr-8"><DialogTitle>{labelFor(activeImage, activeIndex || 0)}</DialogTitle><DialogDescription>Image {Number(activeIndex) + 1} of {images.length}</DialogDescription></DialogHeader>
        <div className="relative flex min-h-48 items-center justify-center rounded-xl bg-muted/30 p-2 sm:min-h-72">
          {activeImage && failedSources.has(sourceFor(activeImage)) ? <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><ImageOff aria-hidden="true" className="size-7" />This evidence image could not be loaded.</div> : activeImage && <img src={sourceFor(activeImage)} alt={labelFor(activeImage, activeIndex || 0)} className="max-h-[65dvh] max-w-full rounded-lg object-contain" onError={() => markFailed(sourceFor(activeImage))} />}
          {images.length > 1 && <>
            <Button type="button" variant="outline" size="icon" className="absolute left-3 top-1/2 -translate-y-1/2 bg-background/90" aria-label="Previous evidence image" onClick={() => move(-1)}><ChevronLeft /></Button>
            <Button type="button" variant="outline" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 bg-background/90" aria-label="Next evidence image" onClick={() => move(1)}><ChevronRight /></Button>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
};

export default RefundEvidenceGallery;
