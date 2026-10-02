-- NSP-13 Vorhaben record: an outbox the node publisher drains to Nostr.
-- Spec: docs/superpowers/specs/2026-10-02-nsp13-vorhaben-record-design.md §3.1
CREATE TABLE IF NOT EXISTS public.nostr_outbox (
  id            bigserial PRIMARY KEY,
  object_type   text NOT NULL CHECK (object_type IN ('proposal','task','tally','payout')),
  object_id     uuid NOT NULL,
  proposal_id   uuid NOT NULL,
  action        text NOT NULL,
  from_status   text,
  to_status     text NOT NULL,
  actor_wallet  text,
  actor_role    text NOT NULL,
  body          text,
  extra         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  signed_event  jsonb,
  event_id      text,
  published_at  timestamptz,
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text
);
CREATE INDEX IF NOT EXISTS nostr_outbox_unpublished_idx ON public.nostr_outbox (id) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS nostr_outbox_object_idx ON public.nostr_outbox (object_type, object_id, id);

CREATE TABLE IF NOT EXISTS public.nostr_stage_ledger (
  proposal_id  uuid NOT NULL,
  nsp12_stage  text NOT NULL,
  event_id     text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, nsp12_stage)
);

ALTER TABLE public.nostr_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nostr_stage_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nostr_outbox, public.nostr_stage_ledger FROM anon, authenticated;
GRANT ALL ON public.nostr_outbox, public.nostr_stage_ledger TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.nostr_outbox_id_seq TO service_role;

-- task_activity → task actions (comments are never published)
CREATE OR REPLACE FUNCTION public.nostr_outbox_task_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_proposal uuid; v_creator text; v_action text; v_role text;
BEGIN
  IF NEW.kind = 'comment' THEN RETURN NEW; END IF;
  SELECT proposal_id, lower(created_by_wallet) INTO v_proposal, v_creator FROM proposal_tasks WHERE id = NEW.task_id;
  IF v_proposal IS NULL THEN RETURN NEW; END IF;
  v_action := CASE
    WHEN NEW.kind = 'proof' THEN 'proof_added'
    WHEN NEW.to_status = 'vergeben' THEN 'task_assigned'
    WHEN NEW.to_status = 'in_arbeit' AND NEW.from_status = 'vergeben' THEN 'task_started'
    WHEN NEW.to_status = 'in_arbeit' AND NEW.from_status = 'eingereicht' THEN 'changes_requested'
    WHEN NEW.to_status = 'eingereicht' THEN 'task_submitted'
    WHEN NEW.to_status = 'abgenommen' THEN 'task_approved'
    WHEN NEW.to_status = 'abgebrochen' THEN 'task_cancelled'
    ELSE NULL END;
  IF v_action IS NULL THEN RETURN NEW; END IF;
  v_role := CASE
    WHEN NEW.actor_wallet = 'system' THEN 'system'
    WHEN v_action IN ('task_approved','changes_requested') THEN 'attester'
    WHEN v_action IN ('task_assigned','task_cancelled') THEN
      CASE WHEN lower(NEW.actor_wallet) = v_creator THEN 'proposer' ELSE 'attester' END
    ELSE 'assignee' END;
  INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, from_status, to_status, actor_wallet, actor_role, body, extra, occurred_at)
  VALUES ('task', NEW.task_id, v_proposal, v_action, NEW.from_status, COALESCE(NEW.to_status, (SELECT status FROM proposal_tasks WHERE id = NEW.task_id)),
          NULLIF(lower(NEW.actor_wallet), 'system'), v_role, NEW.body, jsonb_build_object('attachments', NEW.attachments), NEW.created_at);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_task_activity ON public.task_activity;
CREATE TRIGGER nostr_outbox_task_activity AFTER INSERT ON public.task_activity FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_task_activity();

-- proposal_tasks → task_created / task_paid
CREATE OR REPLACE FUNCTION public.nostr_outbox_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, to_status, actor_wallet, actor_role, occurred_at)
    VALUES ('task', NEW.id, NEW.proposal_id, 'task_created', NEW.status, lower(NEW.created_by_wallet), 'proposer', NEW.created_at);
  ELSIF NEW.status = 'ausgezahlt' AND OLD.status IS DISTINCT FROM 'ausgezahlt' THEN
    INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, from_status, to_status, actor_role)
    VALUES ('task', NEW.id, NEW.proposal_id, 'task_paid', OLD.status, 'ausgezahlt', 'system');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_task ON public.proposal_tasks;
CREATE TRIGGER nostr_outbox_task AFTER INSERT OR UPDATE OF status ON public.proposal_tasks FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_task();

-- proposal_stage_events → stage_changed
CREATE OR REPLACE FUNCTION public.nostr_outbox_stage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, from_status, to_status, actor_role, occurred_at)
  VALUES ('proposal', NEW.proposal_id, NEW.proposal_id, 'stage_changed', NEW.from_stage, NEW.to_stage, 'system', NEW.created_at);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_stage ON public.proposal_stage_events;
CREATE TRIGGER nostr_outbox_stage AFTER INSERT ON public.proposal_stage_events FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_stage();

-- proposal_wahlhelfer → tally_confirmed
CREATE OR REPLACE FUNCTION public.nostr_outbox_wahlhelfer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL THEN
    INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, to_status, actor_wallet, actor_role, extra, occurred_at)
    VALUES ('tally', NEW.proposal_id, NEW.proposal_id, 'tally_confirmed', 'bestaetigt', NEW.attester_wallet, 'wahlhelfer',
            jsonb_build_object('message', NEW.message, 'signature', NEW.signature, 'result_hash', NEW.result_hash,
                               'attester_wallet', NEW.attester_wallet, 'wahlhelfer_id', NEW.id),
            NEW.confirmed_at);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_wahlhelfer ON public.proposal_wahlhelfer;
CREATE TRIGGER nostr_outbox_wahlhelfer AFTER UPDATE OF confirmed_at ON public.proposal_wahlhelfer FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_wahlhelfer();

-- proposals → meinungsbild_published (window opened = tally on-chain)
CREATE OR REPLACE FUNCTION public.nostr_outbox_meinungsbild() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tally_confirm_opened_at IS NOT NULL AND OLD.tally_confirm_opened_at IS NULL AND NEW.vorhaben_enabled THEN
    INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, to_status, actor_role, occurred_at)
    VALUES ('tally', NEW.id, NEW.id, 'meinungsbild_published', 'veroeffentlicht', 'system', NEW.tally_confirm_opened_at);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_meinungsbild ON public.proposals;
CREATE TRIGGER nostr_outbox_meinungsbild AFTER UPDATE OF tally_confirm_opened_at ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_meinungsbild();

-- proposal_payout_lines → payout_* (only published states; sendend/gesendet skipped)
CREATE OR REPLACE FUNCTION public.nostr_outbox_payout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'payout_planned';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status WHEN 'vorgeschlagen' THEN 'payout_proposed' WHEN 'bestaetigt' THEN 'payout_confirmed'
      WHEN 'fehlgeschlagen' THEN 'payout_failed' WHEN 'unklar' THEN 'payout_unclear' ELSE NULL END;
  END IF;
  IF v_action IS NULL THEN RETURN NEW; END IF;
  INSERT INTO nostr_outbox (object_type, object_id, proposal_id, action, from_status, to_status, actor_role, extra)
  VALUES ('payout', NEW.id, NEW.proposal_id, v_action, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, 'system',
          jsonb_strip_nulls(jsonb_build_object('tx', NEW.tx_hash, 'safe_tx', NEW.safe_tx_hash)));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nostr_outbox_payout ON public.proposal_payout_lines;
CREATE TRIGGER nostr_outbox_payout AFTER INSERT OR UPDATE OF status ON public.proposal_payout_lines FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_payout();

REVOKE ALL ON FUNCTION public.nostr_outbox_task_activity(), public.nostr_outbox_task(), public.nostr_outbox_stage(),
  public.nostr_outbox_wahlhelfer(), public.nostr_outbox_meinungsbild(), public.nostr_outbox_payout() FROM PUBLIC, anon, authenticated;

-- Backfill: proposals already in the vorhaben system get their tasks/lines/confirmations as first actions.
INSERT INTO public.nostr_outbox (object_type, object_id, proposal_id, action, to_status, actor_wallet, actor_role, occurred_at)
SELECT 'task', t.id, t.proposal_id, 'task_created', t.status, lower(t.created_by_wallet), 'proposer', t.created_at
FROM public.proposal_tasks t
WHERE NOT EXISTS (SELECT 1 FROM public.nostr_outbox o WHERE o.object_type = 'task' AND o.object_id = t.id AND o.action = 'task_created');

NOTIFY pgrst, 'reload schema';
