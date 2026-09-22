// SSRF guard: a source/reference image URL is only fetched server-side when it
// is a public storage object on the project's own Supabase host.
export function isAllowedReferenceUrl(url: string, supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false;
  try {
    const u = new URL(url);
    const base = new URL(supabaseUrl);
    return (
      u.protocol === "https:" &&
      u.host === base.host &&
      u.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}
