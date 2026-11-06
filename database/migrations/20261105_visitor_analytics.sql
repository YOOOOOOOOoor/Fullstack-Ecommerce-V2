BEGIN;

CREATE TABLE IF NOT EXISTS web_visitors (
  visitor_id UUID PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (last_seen_at >= first_seen_at)
);

CREATE TABLE IF NOT EXISTS web_visitor_sessions (
  id BIGSERIAL PRIMARY KEY,
  visitor_id UUID NOT NULL REFERENCES web_visitors(visitor_id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (last_seen_at >= started_at)
);

CREATE TABLE IF NOT EXISTS web_page_views (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES web_visitor_sessions(id) ON DELETE CASCADE,
  page_key VARCHAR(32) NOT NULL CHECK (page_key IN ('home','products','product_detail','about','faq','support')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_web_visitor_sessions_visitor_activity
  ON web_visitor_sessions(visitor_id, last_seen_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_web_visitors_last_seen_at
  ON web_visitors(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_web_visitor_sessions_started_at
  ON web_visitor_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_web_visitor_sessions_last_seen_at
  ON web_visitor_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_web_page_views_occurred_session
  ON web_page_views(occurred_at, session_id);

COMMIT;
