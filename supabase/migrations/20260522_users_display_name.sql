-- Split the visible name from the URL slug. `username` keeps its unique slug
-- form (e.g. "maxbrych") used in /user/[username] routes; `display_name`
-- holds the formatted version ("Max Brych").
alter table public.users add column if not exists display_name text;

update public.users
   set display_name = username
 where display_name is null and username is not null;
