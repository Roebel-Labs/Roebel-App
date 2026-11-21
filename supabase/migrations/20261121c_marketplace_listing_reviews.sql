-- Reviews / comments on Marktplatz listings (Expo listing detail: "Bewertungen").
-- Same trust model as post_comments: wallet-keyed rows, readable when
-- published, insert/update open to the app (no Supabase auth session).
-- One review per person and listing; stars are optional (a comment without
-- a rating is allowed, e.g. the seeded neutral reviews below).

create table if not exists public.marketplace_listing_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  stars smallint check (stars between 1 and 5),
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  -- AI-authored (Mecky) — the client shows the "KI-Assistent" tag (AI Act Art. 50).
  is_ai boolean not null default false,
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, wallet_address)
);

create index if not exists marketplace_listing_reviews_listing_idx
  on public.marketplace_listing_reviews (listing_id, created_at desc);

alter table public.marketplace_listing_reviews enable row level security;

drop policy if exists "Listing reviews are viewable by all" on public.marketplace_listing_reviews;
create policy "Listing reviews are viewable by all"
  on public.marketplace_listing_reviews for select
  using (status = 'published');

drop policy if exists "Users can create listing reviews" on public.marketplace_listing_reviews;
create policy "Users can create listing reviews"
  on public.marketplace_listing_reviews for insert
  with check (is_ai = false);

drop policy if exists "Users can update their listing reviews" on public.marketplace_listing_reviews;
create policy "Users can update their listing reviews"
  on public.marketplace_listing_reviews for update
  using (true)
  with check (is_ai = false);

grant select, insert, update on public.marketplace_listing_reviews to anon, authenticated;

-- Seed: one neutral Mecky review + one neutral review from MaxBrych on every
-- active listing. Neither claims to have used the offer.
insert into public.marketplace_listing_reviews (listing_id, wallet_address, content, is_ai)
select l.id, 'mecky_bot',
  case
    when l.listing_type = 'service' then
      'Schön, dass es „' || l.title || '“ jetzt auch hier in Röbel gibt. So ein Angebot direkt vor Ort macht unsere Stadt ein Stück lebendiger. Bei Fragen einfach den Anbieter direkt anschreiben.'
    else
      'Schön, dass „' || l.title || '“ hier auf dem Röbeler Marktplatz zu finden ist. Lokal kaufen hält Wege kurz und die Stadt lebendig. Bei Fragen einfach direkt anschreiben.'
  end,
  true
from public.marketplace_listings l
where l.status = 'active'
on conflict (listing_id, wallet_address) do nothing;

insert into public.marketplace_listing_reviews (listing_id, wallet_address, content)
select l.id, u.wallet_address,
  'Das ist eine sehr schöne Ergänzung des Angebotes in unserer Stadt. Sehr toll!'
from public.marketplace_listings l
join public.users u on u.username = 'MaxBrych'
where l.status = 'active'
on conflict (listing_id, wallet_address) do nothing;
