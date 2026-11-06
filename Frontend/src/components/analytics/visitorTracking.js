const PAGE_KEYS = new Map([
  ["/", "home"],
  ["/products", "products"],
  ["/about", "about"],
  ["/faq", "faq"],
  ["/support", "support"],
]);

export function canonicalVisitorPage(pathname) {
  if (typeof pathname !== "string") return null;
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (PAGE_KEYS.has(normalized)) return PAGE_KEYS.get(normalized);
  if (/^\/products\/[^/]+$/.test(normalized)) return "product_detail";
  return null;
}

export function getOrCreateVisitorId(storage, cryptoApi) {
  try {
    const existing = storage.getItem("store_visitor_id");
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) return existing;
    const id = cryptoApi.randomUUID();
    storage.setItem("store_visitor_id", id);
    return id;
  } catch {
    return null;
  }
}

export function createVisitorPathTracker({ getVisitorId, send }) {
  let previousPath = null;
  return (pathname) => {
    if (pathname === previousPath) return;
    previousPath = pathname;
    const pageKey = canonicalVisitorPage(pathname);
    if (!pageKey) return;
    const visitorId = getVisitorId();
    if (visitorId) void Promise.resolve(send({ visitorId, pageKey })).catch(() => {});
  };
}
