"use client";

import { useEffect, useState } from "react";
import { STUDIO_DOWNLOADS, type StudioDownload } from "@/lib/studio/release";

function detectOs(): StudioDownload["os"] | null {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "win";
  if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac";
  return null;
}

// One primary button for the visitor's system (macOS before detection runs), the other system as a link.
export function DownloadButtons() {
  const [os, setOs] = useState<StudioDownload["os"] | null>(null);
  useEffect(() => setOs(detectOs()), []);

  const primary = STUDIO_DOWNLOADS.find((d) => d.os === (os ?? "mac")) ?? STUDIO_DOWNLOADS[0];
  const others = STUDIO_DOWNLOADS.filter((d) => d !== primary);

  return (
    <div className="mt-8 flex flex-col items-start gap-3">
      <a
        href={primary.url}
        className="inline-flex items-center rounded-[4px] bg-[#00498B] px-6 py-3 text-base font-semibold text-white hover:bg-[#003D75]"
      >
        {primary.label}
      </a>
      <p className="text-sm text-muted-foreground">{primary.requirements}</p>
      {others.map((d) => (
        <a key={d.os} href={d.url} className="text-sm font-semibold text-[#00498B] underline dark:text-[#7ABBF2]">
          {d.label}
        </a>
      ))}
    </div>
  );
}
