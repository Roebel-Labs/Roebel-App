-- NSP-13 outbox: per-object sequence number and person-signed flag.
-- seq is assigned by a BEFORE INSERT trigger under a per-object advisory lock,
-- so concurrent inserts for the same object never collide or skip.
-- Idempotent: safe to re-run.
ALTER TABLE public.nostr_outbox
  ADD COLUMN IF NOT EXISTS seq integer,
  ADD COLUMN IF NOT EXISTS person_signed boolean NOT NULL DEFAULT false;

-- Backfill existing rows (id order per object) BEFORE the unique index exists.
UPDATE public.nostr_outbox o
SET seq = r.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY object_type, object_id ORDER BY id)::integer AS rn
  FROM public.nostr_outbox
) r
WHERE o.id = r.id AND o.seq IS NULL;

CREATE OR REPLACE FUNCTION public.nostr_outbox_assign_seq() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.object_type || ':' || NEW.object_id::text));
  SELECT coalesce(max(seq), 0) + 1 INTO NEW.seq
  FROM public.nostr_outbox
  WHERE object_type = NEW.object_type AND object_id = NEW.object_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS nostr_outbox_seq ON public.nostr_outbox;
CREATE TRIGGER nostr_outbox_seq BEFORE INSERT ON public.nostr_outbox
  FOR EACH ROW EXECUTE FUNCTION public.nostr_outbox_assign_seq();

CREATE UNIQUE INDEX IF NOT EXISTS nostr_outbox_object_seq_uidx
  ON public.nostr_outbox (object_type, object_id, seq);

-- NOT NULL once backfilled; guarded so re-runs are no-ops.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'nostr_outbox'
               AND column_name = 'seq' AND is_nullable = 'YES') THEN
    ALTER TABLE public.nostr_outbox ALTER COLUMN seq SET NOT NULL;
  END IF;
END $$;

-- Read-only helper: the seq the next row for this object would get.
CREATE OR REPLACE FUNCTION public.next_outbox_seq(p_object_type text, p_object_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(max(seq), 0) + 1
  FROM public.nostr_outbox
  WHERE object_type = p_object_type AND object_id = p_object_id;
$$;

REVOKE ALL ON FUNCTION public.nostr_outbox_assign_seq() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_outbox_seq(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_outbox_seq(text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
