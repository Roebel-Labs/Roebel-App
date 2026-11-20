-- The assistant's address is shared (mecky@<domain>, like duke@town.com); inbound
-- mail is routed by the verified sender, so the alias no longer needs to be unique.
ALTER TABLE public.chat_agent_profiles DROP CONSTRAINT IF EXISTS chat_agent_profiles_mail_alias_key;
UPDATE public.chat_agent_profiles SET mail_alias = 'mecky' WHERE mail_alias ~ '^mecky-[0-9a-f]{5}$';
CREATE INDEX IF NOT EXISTS chat_agent_profiles_owner_email_idx ON public.chat_agent_profiles (owner_email);
