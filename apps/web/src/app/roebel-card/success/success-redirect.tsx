"use client";

import { useEffect } from "react";

interface Props {
  returnTo: string;
}

/**
 * Tiny client component that fires the deeplink after a short delay so
 * the user sees the confirmation card before being bounced to the app.
 * Kept isolated so the parent can remain a server component.
 */
export function SuccessRedirect({ returnTo }: Props) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = returnTo;
    }, 600);
    return () => clearTimeout(t);
  }, [returnTo]);

  return (
    <a
      href={returnTo}
      className="inline-flex items-center justify-center rounded-full bg-[#00498B] text-white px-5 py-3 text-sm font-semibold"
    >
      Zurück zur App
    </a>
  );
}
