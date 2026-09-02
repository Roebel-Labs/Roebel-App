-- Let an org experience mirror into the home feed.
--
-- Two things blocked it:
--   1. posts_post_type_check did not allow 'org_experience'.
--   2. posts.linked_experience_id FKs to event_experiences(id), so it cannot
--      point at an account_experiences row. A separate nullable column carries
--      the org instead, leaving the events link untouched.
--
-- FeedList special-cases only 'event_experience' and 'repost'; every other
-- type renders as a standard post card, so this needs no feed change.

alter table public.posts add column if not exists linked_account_id uuid
  references public.accounts(id) on delete set null;

comment on column public.posts.linked_account_id is
  'The organisation an org_experience post is about. Not the posting account — that is account_id.';

alter table public.posts drop constraint if exists posts_post_type_check;
alter table public.posts add constraint posts_post_type_check
  check (post_type = any (array[
    'user', 'mecky', 'event_share', 'marketplace_share',
    'event_experience', 'repost', 'quote', 'mini_app_share',
    'org_experience'
  ]));

create index if not exists posts_linked_account_idx
  on public.posts (linked_account_id) where linked_account_id is not null;
