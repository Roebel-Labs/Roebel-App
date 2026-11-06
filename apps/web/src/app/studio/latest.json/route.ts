// What the Ortis Studio update button reads: { version, downloads: [{ os, url, sha256 }] }.
import { NextResponse } from "next/server";
import { getStudioRelease } from "@/lib/studio/release";

export const revalidate = 300;

export async function GET() {
  const r = await getStudioRelease();
  return NextResponse.json({
    version: r.version,
    downloads: r.downloads.map(({ os, url, sha256 }) => ({ os, url, sha256 })),
  });
}
