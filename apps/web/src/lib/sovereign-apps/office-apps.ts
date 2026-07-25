export interface OfficeApp {
  key: string
  name: string
  description: string
  url: string
}

interface CatalogEntry {
  key: string
  name: string
  description: string
  urlEnv: string
}

// The office apps the launcher can surface. Add rows here as more apps come online.
const CATALOG: CatalogEntry[] = [
  {
    key: 'nextcloud',
    name: 'Dateien & Dokumente',
    description: 'Deine Dateien, Dokumente und Kalender',
    urlEnv: 'NEXT_PUBLIC_NEXTCLOUD_URL',
  },
]

// Pure: build the visible list from an env map. An app whose URL is unset/blank is hidden,
// so the launcher renders nothing until the app is actually deployed and configured.
export function buildOfficeApps(env: Record<string, string | undefined>): OfficeApp[] {
  return CATALOG
    .map((e) => ({ key: e.key, name: e.name, description: e.description, url: (env[e.urlEnv] ?? '').trim() }))
    .filter((a) => a.url.length > 0)
}

export function getOfficeApps(): OfficeApp[] {
  return buildOfficeApps({ NEXT_PUBLIC_NEXTCLOUD_URL: process.env.NEXT_PUBLIC_NEXTCLOUD_URL })
}
