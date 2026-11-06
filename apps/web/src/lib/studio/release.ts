// Ortis Studio desktop downloads. The newest GitHub release tagged `ortis-studio-v<version>` of the
// public repo is picked up automatically (re-checked every 5 minutes); the constants below are the
// fallback while GitHub is unreachable. The app's update button reads the same data via
// /studio/latest.json.

const REPO = "Roebel-Labs/Roebel-App";
const TAG_PREFIX = "ortis-studio-v";

export type StudioDownload = {
  os: "mac" | "win";
  label: string;
  requirements: string;
  url: string;
  sha256: string | null;
};

export type StudioRelease = { version: string; downloads: StudioDownload[] };

const META: Record<StudioDownload["os"], { label: string; requirements: string; file: (v: string) => string }> = {
  mac: {
    label: "Für macOS laden",
    requirements: "macOS 13 oder neuer, Mac mit Apple-Chip (M1 und neuer)",
    file: (v) => `Ortis-Studio-${v}-mac-arm64.dmg`,
  },
  win: {
    label: "Für Windows laden",
    requirements: "Windows 10 oder 11, 64 Bit",
    file: (v) => `Ortis-Studio-${v}-win-x64.exe`,
  },
};

const assetUrl = (version: string, file: string) =>
  `https://github.com/${REPO}/releases/download/${TAG_PREFIX}${version}/${file}`;

const download = (os: StudioDownload["os"], version: string, sha256: string | null): StudioDownload => ({
  os,
  label: META[os].label,
  requirements: META[os].requirements,
  url: assetUrl(version, META[os].file(version)),
  sha256,
});

export const FALLBACK_RELEASE: StudioRelease = {
  version: "0.1.0",
  downloads: [
    download("mac", "0.1.0", "6709a431cae2b70506408bfdd7c18ae5a423efbe2fbe12b52f5c0eabd106793e"),
    download("win", "0.1.0", "25797bd42a032a41f89f3380b5af6bff2f93ae2a10e68503fcf2d8d8844c3529"),
  ],
};

type GhAsset = { name: string; digest?: string | null };
type GhRelease = { tag_name: string; draft: boolean; prerelease: boolean; assets: GhAsset[] };

const numeric = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
const newer = (a: string, b: string) => {
  const x = numeric(a);
  const y = numeric(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/** Newest published studio release that carries both installers. */
export function pickRelease(releases: GhRelease[]): StudioRelease | null {
  let best: StudioRelease | null = null;
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(TAG_PREFIX)) continue;
    const version = r.tag_name.slice(TAG_PREFIX.length);
    if (!/^\d+(\.\d+)*$/.test(version)) continue;
    const downloads: StudioDownload[] = [];
    for (const os of ["mac", "win"] as const) {
      const asset = r.assets.find((a) => a.name === META[os].file(version));
      if (!asset) break;
      const sha = asset.digest?.startsWith("sha256:") ? asset.digest.slice(7) : null;
      downloads.push(download(os, version, sha));
    }
    if (downloads.length !== 2) continue;
    if (!best || newer(version, best.version)) best = { version, downloads };
  }
  return best;
}

async function listReleases(): Promise<GhRelease[] | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, {
      headers: { accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
    });
    return res.ok ? ((await res.json()) as GhRelease[]) : null;
  } catch {
    return null;
  }
}

/** Interface update (OTA) as the app expects it; signed on the publishing machine, verified in the app. */
export type StudioOta = { version: string; runtime: number; url: string; sha256: string; signature: string };
const OTA_PREFIX = "ortis-studio-ota-v";

/** Newest published OTA release that carries its signed ota.json. */
export async function getStudioOta(): Promise<StudioOta | null> {
  const releases = await listReleases();
  if (!releases) return null;
  let best: string | null = null;
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(OTA_PREFIX)) continue;
    const v = r.tag_name.slice(OTA_PREFIX.length);
    if (!/^\d+(\.\d+)*$/.test(v) || !r.assets.some((a) => a.name === "ota.json")) continue;
    if (!best || newer(v, best)) best = v;
  }
  if (!best) return null;
  try {
    const res = await fetch(`https://github.com/${REPO}/releases/download/${OTA_PREFIX}${best}/ota.json`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const o = (await res.json()) as StudioOta;
    return o && o.version === best ? o : null;
  } catch {
    return null;
  }
}

export async function getStudioRelease(): Promise<StudioRelease> {
  try {
    const releases = await listReleases();
    if (!releases) return FALLBACK_RELEASE;
    const picked = pickRelease(releases);
    return picked && !newer(FALLBACK_RELEASE.version, picked.version) ? picked : FALLBACK_RELEASE;
  } catch {
    return FALLBACK_RELEASE;
  }
}
