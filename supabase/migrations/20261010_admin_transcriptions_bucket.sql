-- Private bucket for the admin "Transkription" tool. The browser uploads via a
-- signed URL minted by an admin-gated server action (bypasses Vercel's 4.5 MB
-- body limit); the transcribe route reads the file with the service role and
-- deletes it afterwards. No storage.objects policies: anon/authenticated get
-- no access at all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-transcriptions',
  'admin-transcriptions',
  false,
  26214400,
  array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/m4a','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/flac','video/mp4','video/webm']
)
on conflict (id) do nothing;
