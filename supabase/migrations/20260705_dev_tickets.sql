-- Dev-Tickets: AI bug-fix ticket board (admin dashboard).
-- "dev_tickets" (not "tickets") because tickets = Stripe event tickets in this repo.

CREATE TABLE IF NOT EXISTS dev_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'bug' CHECK (type IN ('bug', 'feature', 'task', 'improvement')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'backlog', 'in_progress', 'in_review', 'done', 'rejected')),
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'mecky', 'feedback_form')),
  source_feedback_id UUID REFERENCES feedback(id) ON DELETE SET NULL,
  ai_analysis JSONB,
  github_branch TEXT,
  github_pr_number INTEGER,
  github_pr_url TEXT,
  fix_status TEXT NOT NULL DEFAULT 'none' CHECK (fix_status IN ('none', 'queued', 'running', 'pr_open', 'failed', 'merged')),
  fix_dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One ticket per feedback row (triage idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_tickets_source_feedback
  ON dev_tickets(source_feedback_id) WHERE source_feedback_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dev_tickets_status_position ON dev_tickets(status, position);

CREATE TABLE IF NOT EXISTS dev_ticket_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES dev_tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('admin', 'ai', 'system')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_ticket_activity_ticket
  ON dev_ticket_activity(ticket_id, created_at);

-- RLS on, NO policies: only the service-role key (admin API routes) may access.
ALTER TABLE dev_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_ticket_activity ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_dev_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_dev_tickets_updated_at ON dev_tickets;
CREATE TRIGGER set_dev_tickets_updated_at
  BEFORE UPDATE ON dev_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_dev_tickets_updated_at();

-- feedback: where did the report come from + has AI triage seen it
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app_form';
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_source_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_source_check
  CHECK (source IN ('app_form', 'web_form', 'mecky'));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ;

COMMENT ON TABLE dev_tickets IS 'Admin dev-ticket board (bugs/features/tasks). AI-triaged from feedback; AI fixes dispatched via GitHub Actions.';
COMMENT ON COLUMN feedback.triaged_at IS 'Set when AI triage has processed this row (regardless of outcome).';
