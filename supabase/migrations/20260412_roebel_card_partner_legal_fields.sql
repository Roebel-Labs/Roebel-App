-- 20260412_roebel_card_partner_legal_fields.sql
-- Adds Rechtsform, USt-IdNr, and audit-trail metadata to partner registration.
-- Session 2: Partner registration wizard.
--
-- All existing rows (if any) get NULL for these fields — no backfill needed.

begin;

alter table roebel_card_partners
  add column rechtsform text
    check (rechtsform in (
      'einzelunternehmen',
      'gbr',
      'ug',
      'gmbh',
      'gmbh_co_kg',
      'ag',
      'ev',
      'ek',
      'ohg',
      'kg',
      'sonstige'
    )),
  add column vat_id text,
  add column agreement_metadata jsonb;

commit;
