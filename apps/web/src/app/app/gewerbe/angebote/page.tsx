import { redirect } from "next/navigation";

/**
 * The Anzeigen-Manager moved into /dashboard/ads (its own layout, no
 * citizen chrome). This route stays as a redirect for any existing
 * bookmarks / inbound links.
 */
export default function GewerbeAngeboteRedirect() {
  redirect("/dashboard/ads");
}
