// Ortis Studio desktop downloads: the one place for version, file names and checksums.
// Files live on the GitHub release `ortis-studio-v<version>` of the public repo.

export const STUDIO_VERSION = "0.1.0";

const RELEASE_BASE = `https://github.com/Roebel-Labs/Roebel-App/releases/download/ortis-studio-v${STUDIO_VERSION}`;

export type StudioDownload = {
  os: "mac" | "win";
  label: string;
  requirements: string;
  url: string;
  // Filled in when the release is published; hidden while null.
  sha256: string | null;
};

export const STUDIO_DOWNLOADS: StudioDownload[] = [
  {
    os: "mac",
    label: "Für macOS laden",
    requirements: "macOS 13 oder neuer, Mac mit Apple-Chip (M1 und neuer)",
    url: `${RELEASE_BASE}/Ortis-Studio-${STUDIO_VERSION}-mac-arm64.dmg`,
    sha256: null,
  },
  {
    os: "win",
    label: "Für Windows laden",
    requirements: "Windows 10 oder 11, 64 Bit",
    url: `${RELEASE_BASE}/Ortis-Studio-${STUDIO_VERSION}-win-x64.exe`,
    sha256: null,
  },
];
