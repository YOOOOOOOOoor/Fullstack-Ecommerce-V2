const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const isTrustedBrowserWrite = (req, allowedOrigins) => {
  if (!unsafeMethods.has(req.method)) return true;
  const hasAuthCookie = Boolean(req.cookies?.token);
  const origin = req.get?.("origin") || req.headers?.origin;
  const fetchSite = req.get?.("sec-fetch-site") || req.headers?.["sec-fetch-site"];

  // Browsers include Origin on these writes. Keep non-browser clients working
  // when they do not use the application's cookie session.
  if (!origin) return !hasAuthCookie && fetchSite !== "cross-site";
  return origin !== "null" && allowedOrigins.includes(origin);
};

export const createCsrfGuard = (getAllowedOrigins = () =>
  (process.env.CLIENT_URL || "").split(",").map((value) => value.trim()).filter(Boolean)) =>
  (req, res, next) => {
    if (isTrustedBrowserWrite(req, getAllowedOrigins())) return next();
    return res.status(403).json({ message: "This request could not be verified. Refresh the page and try again." });
  };

export default createCsrfGuard();
