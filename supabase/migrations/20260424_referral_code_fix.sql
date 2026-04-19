-- 20260424_referral_code_fix.sql
-- Makes ensure_referral_code() idempotent under concurrent callers: repeated
-- renders trigger multiple refresh() cycles and the old implementation could
-- race itself on the wallet_address PK and exhaust retries.
--
-- New approach:
--   1. Fast path: return the existing code if the wallet already has one.
--   2. Insert with ON CONFLICT DO NOTHING — handles both the wallet PK
--      collision (concurrent writer won) and the rare code UNIQUE collision.
--   3. Re-read the row; if it now exists, return that code. Otherwise retry
--      with a fresh random (longer, 8 hex chars = 16^8 possibilities).

begin;

create or replace function ensure_referral_code(p_wallet text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  select code into v_code from referral_codes where wallet_address = p_wallet;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    -- 8 hex chars → 4.3 billion possibilities. Including p_wallet in the
    -- hash avoids collisions between two wallets hashing at the same instant.
    v_code := 'MECKY-' || upper(
      substring(
        md5(p_wallet || random()::text || clock_timestamp()::text)
        from 1 for 8
      )
    );

    insert into referral_codes (wallet_address, code)
    values (p_wallet, v_code)
    on conflict do nothing;

    -- After ON CONFLICT DO NOTHING the row might exist because this call
    -- inserted it, or because a concurrent caller did. Either way, re-read.
    select code into v_code from referral_codes where wallet_address = p_wallet;
    if v_code is not null then
      return v_code;
    end if;

    -- If we got here, the wallet row still doesn't exist — meaning the
    -- conflict was on the `code` UNIQUE index (two wallets happened to roll
    -- the same suffix). Astronomically rare; still guard against infinite loop.
    if v_attempt > 15 then
      raise exception 'could not generate unique referral code after % attempts', v_attempt;
    end if;
  end loop;
end;
$$;

commit;
