-- Forum Anhänge: images + files on threads and replies, one carousel per discussion.
-- Spec: docs/superpowers/specs/2026-09-16-forum-attachments-design.md §3

CREATE TABLE IF NOT EXISTS public.forum_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  reply_id       uuid REFERENCES public.forum_replies(id) ON DELETE CASCADE,
  wallet_address text NOT NULL REFERENCES public.users(wallet_address),
  account_id     uuid REFERENCES public.accounts(id),
  kind           text NOT NULL CHECK (kind IN ('image', 'pdf', 'file')),
  url            text NOT NULL,
  mime_type      text NOT NULL,
  file_name      text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  size_bytes     integer,
  width          integer,
  height         integer,
  status         text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'deleted')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_attachments_thread_idx ON public.forum_attachments (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS forum_attachments_reply_idx  ON public.forum_attachments (reply_id);

ALTER TABLE public.forum_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forum_attachments_select ON public.forum_attachments;
CREATE POLICY forum_attachments_select ON public.forum_attachments
  FOR SELECT USING (status = 'published');
DROP POLICY IF EXISTS forum_attachments_insert ON public.forum_attachments;
CREATE POLICY forum_attachments_insert ON public.forum_attachments
  FOR INSERT WITH CHECK (status = 'published');
-- No update/delete policies: removal goes through the owner-checked RPC below.
GRANT SELECT, INSERT ON public.forum_attachments TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_owned_forum_attachment(p_attachment_id uuid, p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.forum_attachments SET status = 'deleted'
   WHERE id = p_attachment_id
     AND lower(wallet_address) = lower(p_wallet)
     AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'attachment not found or not owned by %', p_wallet; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.delete_owned_forum_attachment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_owned_forum_attachment(uuid, text) TO anon, authenticated;

-- Storage: public read, client insert, 25 MB, allow-listed types. Append-only
-- like the images bucket (no update/delete policies for clients).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('forum-attachments', 'forum-attachments', true, 26214400, ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv'
])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS forum_attachments_public_read ON storage.objects;
CREATE POLICY forum_attachments_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'forum-attachments');
DROP POLICY IF EXISTS forum_attachments_public_insert ON storage.objects;
CREATE POLICY forum_attachments_public_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'forum-attachments');

NOTIFY pgrst, 'reload schema';
