import pool from "../config/db.js";
import { recordVisitorPageView, VISITOR_PAGE_KEYS } from "../services/visitorAnalytics.js";

const VISITOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACKING_FIELDS = new Set(["visitorId", "pageKey"]);

export function validateVisitorEvent(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const fields = Object.keys(body);
  if (fields.length !== TRACKING_FIELDS.size || fields.some((field) => !TRACKING_FIELDS.has(field))) return false;
  return typeof body.visitorId === "string"
    && VISITOR_ID_PATTERN.test(body.visitorId)
    && typeof body.pageKey === "string"
    && VISITOR_PAGE_KEYS.includes(body.pageKey);
}

export const createVisitorEventHandler = ({ record = recordVisitorPageView, db = pool } = {}) => async (req, res, next) => {
  if (!validateVisitorEvent(req.body)) {
    return res.status(400).json({ message: "Visitor event is invalid." });
  }
  try {
    await record(db, { visitorId: req.body.visitorId.toLowerCase(), pageKey: req.body.pageKey });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};

export const trackVisitorEvent = createVisitorEventHandler();
