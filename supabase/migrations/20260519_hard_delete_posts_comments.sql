-- Hard-delete policies for posts, post_comments, proposal_comments, event_experiences.
-- Auth model: anon key + client-side wallet check. Policies are permissive at the DB
-- level; the application layer narrows each delete query with .eq('wallet_address', wallet).

DROP POLICY IF EXISTS "Anyone can delete posts" ON public.posts;
CREATE POLICY "Anyone can delete posts" ON public.posts
  FOR DELETE USING (true);

DROP POLICY IF EXISTS "Anyone can delete post comments" ON public.post_comments;
CREATE POLICY "Anyone can delete post comments" ON public.post_comments
  FOR DELETE USING (true);

DROP POLICY IF EXISTS "Anyone can delete proposal comments" ON public.proposal_comments;
CREATE POLICY "Anyone can delete proposal comments" ON public.proposal_comments
  FOR DELETE USING (true);

DROP POLICY IF EXISTS "Anyone can delete event experiences" ON public.event_experiences;
CREATE POLICY "Anyone can delete event experiences" ON public.event_experiences
  FOR DELETE USING (true);
