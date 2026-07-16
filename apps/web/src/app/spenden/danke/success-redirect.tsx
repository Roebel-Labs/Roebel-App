"use client";

import { useEffect } from "react";

interface Props {
  returnTo: string;
}

/**
 * Fires the roebel:// deeplink after a short delay so the user sees the
 * thank-you card before bouncing back into the app. Isolated so the parent
 * stays a server component (mirrors /roebel-card/success).
 */
export function SuccessRedirect({ returnTo }: Props) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = returnTo;
    }, 1200);
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
