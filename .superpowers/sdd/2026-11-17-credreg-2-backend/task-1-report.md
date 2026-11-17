# Task 1 report
Built: supabase/migrations/20261117cra_credential_register.sql (7 tables, RLS on, no policies, REVOKE ALL from anon/authenticated, unique live-root index, 3 invitation indexes, accounts.credentials_members_public, two app_settings rows, commented RESET block) and apps/web/tests/credentials-migration.test.ts.
RED: test failed with ENOENT (file missing). GREEN: 11/11 pass.
Not applied; Supabase MCP not used.
Deviations: credential_delegates.active and label given `not null default true` / nullable (brief listed bare names). events and accounts have no CREATE TABLE in the migrations that start from 005; accounts.id uuid and events.id uuid confirmed via other migrations' FKs (events created outside migrations/). app_settings key column is `key text`. 
Concerns: none. credential_actions.account_id has no FK (as briefed).
