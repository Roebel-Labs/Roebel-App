"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./Footer";

// Routes where the footer should be hidden
const HIDDEN_FOOTER_ROUTES = [
  "/landesmeisterschaft",
  "/admin",
  "/app",
  "/proposals/timeline",
];

export function ConditionalFooter() {
  const pathname = usePathname();

  // Check if current path starts with any of the hidden routes
  const shouldHideFooter = HIDDEN_FOOTER_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (shouldHideFooter) {
    return null;
  }

  return <Footer />;
}
