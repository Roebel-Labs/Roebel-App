/**
 * Paths that carry a secret (invite tokens) must never reach a log line or analytics.
 * `/invite/ausweis/<token>` and `/invite/<token>` keep their shape, the token becomes `[token]`;
 * anything after it (query, fragment) is dropped. Other paths come back unchanged.
 */
const SECRET_PATHS: RegExp[] = [/(\/invite\/ausweis\/)[^/?#]+.*$/, /(\/invite\/)(?!ausweis(?:[/?#]|$))[^/?#]+.*$/];

export function redactSecretPath(path: string): string {
  for (const re of SECRET_PATHS) {
    if (re.test(path)) return path.replace(re, '$1[token]');
  }
  return path;
}
