import pool from "../config/db.js";
import { writeAudit } from "../services/audit.js";

export const createGetPublicSupportHandler = ({ db = pool } = {}) => async (_req, res, next) => {
  try {
    const [faqs, contact] = await Promise.all([
      db.query("SELECT id,question,answer,position FROM store_faqs WHERE is_published=TRUE ORDER BY position,id"),
      db.query("SELECT support_email,support_phone FROM store_support_settings WHERE id=1"),
    ]);
    res.json({ faqs: faqs.rows, contact: contact.rows[0] || { support_email: null, support_phone: null } });
  } catch (error) { next(error); }
};
export const getPublicSupport = createGetPublicSupportHandler();

export const getSupportManagement = async (_req, res, next) => {
  try {
    const [faqs, contact] = await Promise.all([
      pool.query("SELECT id,question,answer,is_published,position FROM store_faqs ORDER BY position,id"),
      pool.query("SELECT support_email,support_phone FROM store_support_settings WHERE id=1"),
    ]);
    res.json({ faqs: faqs.rows, contact: contact.rows[0] || { support_email: null, support_phone: null } });
  } catch (error) { next(error); }
};

const validFaq = (question, answer) => typeof question === "string" && question.trim().length >= 5 && question.trim().length <= 240
  && typeof answer === "string" && answer.trim().length >= 10 && answer.trim().length <= 5000;

export const createFaq = async (req, res, next) => {
  const { question, answer } = req.body;
  if (!validFaq(question, answer)) return res.status(400).json({ message: "Enter a question (5–240 characters) and answer (10–5000 characters)." });
  try {
    const result = await pool.query(
      "INSERT INTO store_faqs(question,answer,is_published,position,created_by,updated_by) VALUES($1,$2,$3,COALESCE((SELECT MAX(position)+10 FROM store_faqs),10),$4,$4) RETURNING id,question,answer,is_published,position",
      [question.trim(), answer.trim(), Boolean(req.body.is_published), req.user.id],
    );
    await writeAudit(pool, req.user.id, "support.faq_created", "faq", result.rows[0].id, { published: result.rows[0].is_published });
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
};

export const updateFaq = async (req, res, next) => {
  const { question, answer, is_published } = req.body;
  if (!validFaq(question, answer) || typeof is_published !== "boolean") return res.status(400).json({ message: "Provide a valid question, answer, and publish status." });
  try {
    const result = await pool.query("UPDATE store_faqs SET question=$1,answer=$2,is_published=$3,updated_by=$4,updated_at=NOW() WHERE id=$5 RETURNING id,question,answer,is_published,position", [question.trim(), answer.trim(), is_published, req.user.id, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ message: "FAQ entry not found." });
    await writeAudit(pool, req.user.id, "support.faq_updated", "faq", req.params.id, { published: is_published });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
};

export const reorderFaqs = async (req, res, next) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || ids.length > 500 || ids.some((id) => !Number.isInteger(Number(id))) || new Set(ids.map(Number)).size !== ids.length) return res.status(400).json({ message: "Provide a valid ordered list of FAQ IDs." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id FROM store_faqs ORDER BY id FOR UPDATE");
    const currentIds = current.rows.map((row) => Number(row.id)).sort((a, b) => a - b);
    if (currentIds.join(",") !== ids.map(Number).sort((a, b) => a - b).join(",")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Refresh the FAQ list before reordering." });
    }
    for (let index = 0; index < ids.length; index += 1) await client.query("UPDATE store_faqs SET position=$1,updated_by=$2,updated_at=NOW() WHERE id=$3", [(index + 1) * 10, req.user.id, ids[index]]);
    await writeAudit(client, req.user.id, "support.faq_reordered", "faq", "all", { count: ids.length });
    await client.query("COMMIT");
    res.json({ message: "FAQ order saved." });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); next(error); }
  finally { client.release(); }
};

export const deleteFaq = async (req, res, next) => {
  try {
    const deleted = await pool.query("DELETE FROM store_faqs WHERE id=$1 RETURNING id", [req.params.id]);
    if (!deleted.rows.length) return res.status(404).json({ message: "FAQ entry not found." });
    await writeAudit(pool, req.user.id, "support.faq_deleted", "faq", req.params.id);
    res.json({ message: "FAQ entry deleted." });
  } catch (error) { next(error); }
};

export const createUpdateSupportContactHandler = ({ db = pool, auditWriter = writeAudit } = {}) => async (req, res, next) => {
  const email = typeof req.body.support_email === "string" ? req.body.support_email.trim() : "";
  const phone = typeof req.body.support_phone === "string" ? req.body.support_phone.trim() : "";
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || phone.length > 40 || /[<>]/.test(phone)) return res.status(400).json({ message: "Enter a valid support email and phone number." });
  try {
    const result = await db.query("UPDATE store_support_settings SET support_email=$1,support_phone=$2,updated_by=$3,updated_at=NOW() WHERE id=1 RETURNING support_email,support_phone", [email || null, phone || null, req.user.id]);
    await auditWriter(db, req.user.id, "support.contact_updated", "support_settings", 1, { emailConfigured: Boolean(email), phoneConfigured: Boolean(phone) });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
};
export const updateSupportContact = createUpdateSupportContactHandler();
