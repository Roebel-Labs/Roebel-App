"use client";

import { useEffect } from "react";

/** Opens Ortis Studio again (ortis-studio:// is registered by the desktop app, installer ≥ 0.2.1). */
export function BackToStudio({ result }: { result: string }) {
  const href = `ortis-studio://connected?google=${encodeURIComponent(result)}`;
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = href;
    }, 400);
    return () => clearTimeout(t);
  }, [href]);
  return (
    <div className="mt-6 flex flex-col gap-2">
      <a href={href} className="rounded bg-[#00498B] px-4 py-3 text-center font-semibold text-white">
        Zurück zu Ortis Studio
      </a>
      <p className="text-sm text-gray-500">Du kannst dieses Fenster danach schließen.</p>
    </div>
  );
}
