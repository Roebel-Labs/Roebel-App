-- Deliberate debates test env: content-addressed argument texts + thread linkage.
-- Applied to prod via Supabase MCP on 2026-09-02 (migration name: deliberate_debates).
-- The chain stores contentURI = sha-256 of the UTF-8 text; this table stores the plaintext
-- and cannot hold content that does not hash to its key.
create table if not exists public.debate_contents (
  digest text primary key check (digest ~ '^[0-9a-f]{64}$'),
  content text not null check (octet_length(content) between 1 and 1024),
  created_at timestamptz not null default now(),
  constraint debate_contents_digest_matches check (digest = encode(sha256(convert_to(content, 'UTF8')), 'hex'))
);
alter table public.debate_contents enable row level security;
create policy debate_contents_select on public.debate_contents for select using (true);
create policy debate_contents_insert on public.debate_contents for insert with check (true);

alter table public.forum_threads
  add column if not exists debate_id bigint,
  add column if not exists debate_created_by text;

create or replace function public.attach_debate_to_thread(p_thread_id uuid, p_wallet text, p_debate_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update forum_threads
     set debate_id = p_debate_id, debate_created_by = lower(p_wallet)
   where id = p_thread_id
     and status = 'published'
     and debate_id is null
     and lower(wallet_address) = lower(p_wallet);
  if not found then
    raise exception 'thread not found, not owned, or already has a debate';
  end if;
end $$;
