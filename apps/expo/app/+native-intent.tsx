/**
 * Native Intent Handler
 *
 * Maps incoming web URLs (universal links / app links) from roebel.app
 * to the corresponding Expo Router paths. Without this mapping, URLs like
 * https://roebel.app/events/123 would fail because the Expo route is /event/123.
 */

// Route mappings: web path prefix → expo path prefix
const ROUTE_MAPPINGS: [RegExp, string][] = [
  // Plural → singular (web uses plural, expo uses singular)
  [/^\/events\//, '/event/'],
  [/^\/posts\//, '/post/'],
  [/^\/proposals\//, '/proposal/'],

  // German → English (web uses German route names, expo uses English)
  [/^\/gewerbe\//, '/business/'],
  [/^\/angebote\//, '/deals/'],
  [/^\/marktplatz\//, '/marketplace/'],

  // Segment rename
  [/^\/profile\//, '/user/'],
];

export function redirectSystemPath(options: { path: string; initial: boolean }) {
  let path = options.path;

  // Strip /app/ prefix (web authenticated routes use /app/events/123, expo uses /event/123)
  if (path.startsWith('/app/')) {
    path = path.slice(4); // "/app/events/123" → "/events/123"
  }

  // Apply route mappings
  for (const [pattern, replacement] of ROUTE_MAPPINGS) {
    if (pattern.test(path)) {
      path = path.replace(pattern, replacement);
      break;
    }
  }

  return path;
}
