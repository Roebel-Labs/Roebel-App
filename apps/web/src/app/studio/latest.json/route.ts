// What Ortis Studio's updater reads: { version, downloads: [{ os, url, sha256 }], ota: StudioOta | null }.
import { NextResponse } from "next/server";
import { getStudioOta, getStudioRelease } from "@/lib/studio/release";

export const revalidate = 300;

export async function GET() {
  const [r, ota] = await Promise.all([getStudioRelease(), getStudioOta()]);
  return NextResponse.json({
    version: r.version,
    downloads: r.downloads.map(({ os, url, sha256 }) => ({ os, url, sha256 })),
    ota,
  });
}
