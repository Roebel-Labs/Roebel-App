/**
 * Native Intent Handler
 *
 * Maps incoming web URLs (universal links / app links) from roebel.app
 * to the corresponding Expo Router paths. Without this mapping, URLs like
 * https://roebel.app/events/123 would fail because the Expo route is /event/123.
 *
 * IMPORTANT: expo-router passes the FULL URL (e.g. "https://roebel.app/app/posts/123")
 * to this function as `options.path`, not just the path component. We must strip the
 * scheme and host before applying route mappings.
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

/**
 * Extract the pathname from a value that may be a full URL or already a path.
 *
 * Examples:
 *   "https://roebel.app/app/posts/123?ref=share" → "/app/posts/123?ref=share"
 *   "https://www.roebel.app/events/abc"           → "/events/abc"
 *   "/app/posts/123"                               → "/app/posts/123"
 *   "roebel://events/123"                          → "/events/123"
 */
function extractPath(input: string): string {
  if (input.startsWith('/')) {
    return input;
  }

  try {
    const url = new URL(input);
    return url.pathname + url.search + url.hash;
  } catch {
    // Fallback: strip everything before the first "/" after "://"
    const slashIndex = input.indexOf('/', input.indexOf('://') + 3);
    if (slashIndex !== -1) {
      return input.slice(slashIndex);
    }
    return '/';
  }
}

export function redirectSystemPath(options: { path: string; initial: boolean }): string {
  const raw = options.path;

  // Step 1: Extract just the path from the input (handles full URLs)
  let path = extractPath(raw);

  // Step 2: Strip /app/ prefix (web authenticated routes use /app/events/123, expo uses /event/123)
  if (path.startsWith('/app/')) {
    path = path.slice(4); // "/app/events/123" → "/events/123"
  }

  // Step 3: Split off query string and fragment before mapping
  let suffix = '';
  const queryIndex = path.indexOf('?');
  const hashIndex = path.indexOf('#');
  const splitIndex =
    queryIndex !== -1 && hashIndex !== -1
      ? Math.min(queryIndex, hashIndex)
      : queryIndex !== -1
        ? queryIndex
        : hashIndex;

  if (splitIndex !== -1) {
    suffix = path.slice(splitIndex);
    path = path.slice(0, splitIndex);
  }

  // Step 4: Apply route mappings
  for (const [pattern, replacement] of ROUTE_MAPPINGS) {
    if (pattern.test(path)) {
      path = path.replace(pattern, replacement);
      break;
    }
  }

  const result = path + suffix;

  if (__DEV__) {
    console.log(`[native-intent] "${raw}" → "${result}"`);
  }

  return result;
}
