-- Röbeltaler pilot state. Does NOT touch roebel_points_card / roebel_points_ledger.
create table if not exists roebeltaler_members (
  wallet_address    text primary key,              -- the user's Base/login wallet (existing id)
  gnosis_address    text not null,                 -- derived Gnosis Safe smart-account address
  circles_status    text not null default 'none',  -- none | invited | registered
  group_member      boolean not null default false,
  pilot_cohort      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists roebeltaler_members_gnosis_uidx
  on roebeltaler_members (gnosis_address);
