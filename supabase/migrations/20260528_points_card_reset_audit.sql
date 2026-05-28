-- Watchdog for roebel_points_card "reset to zero" events.
--
-- 2026-05-28: a user's row was found at points_balance=0, total_earned=0,
-- total_spent=0, streak_days=0 despite a healthy ledger and a successful
-- daily check-in at the same microsecond. We couldn't attribute the wipe
-- because Postgres logs don't carry per-statement actor info for normal
-- UPDATEs. This trigger captures the exact pattern (positive → all-zero)
-- so the next occurrence is fully attributable: who/what session, which
-- application, and the current_query() text.

CREATE TABLE IF NOT EXISTS public.points_card_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  old_balance   integer,
  old_earned    integer,
  old_spent     integer,
  old_streak    integer,
  new_balance   integer,
  new_earned    integer,
  new_spent     integer,
  new_streak    integer,
  triggered_by  text,
  application   text,
  query_text    text,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.log_points_card_reset()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.points_balance > 0 OR OLD.total_earned > 0 OR OLD.streak_days > 0)
     AND NEW.points_balance = 0 AND NEW.total_earned = 0
     AND NEW.total_spent = 0 AND NEW.streak_days = 0
  THEN
    INSERT INTO public.points_card_audit
      (wallet_address, old_balance, old_earned, old_spent, old_streak,
       new_balance, new_earned, new_spent, new_streak,
       triggered_by, application, query_text)
    VALUES
      (OLD.wallet_address, OLD.points_balance, OLD.total_earned, OLD.total_spent, OLD.streak_days,
       NEW.points_balance, NEW.total_earned, NEW.total_spent, NEW.streak_days,
       current_user, current_setting('application_name', true), current_query());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_points_card_reset ON public.roebel_points_card;
CREATE TRIGGER trg_log_points_card_reset
BEFORE UPDATE ON public.roebel_points_card
FOR EACH ROW EXECUTE FUNCTION public.log_points_card_reset();
