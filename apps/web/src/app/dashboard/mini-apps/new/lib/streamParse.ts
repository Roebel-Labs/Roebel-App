/**
 * Tolerant partial-JSON parsing for the streaming file-plan.
 *
 * `streamObject().toTextStreamResponse()` streams a growing JSON string. We want
 * to render files/manifest as they arrive, so we repair the incomplete tail into
 * valid JSON and parse it. This is intentionally forgiving: on any failure we
 * return the last good parse.
 */

export interface PartialFile {
  path?: string;
  content?: string;
}

export interface PartialPlan {
  files?: PartialFile[];
  manifest?: Record<string, unknown>;
  notes?: string;
}

/**
 * Best-effort repair of a truncated JSON string: close open strings, arrays, and
 * objects so JSON.parse can consume the prefix.
 */
function repairJson(raw: string): string | null {
  let s = raw.trimEnd();
  if (!s) return null;

  // Track structure while respecting strings/escapes.
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    }
  }

  // Close an open string.
  if (inString) {
    if (escaped) s = s.slice(0, -1); // drop a dangling escape
    s += '"';
  }

  // Remove a trailing comma or dangling key like `,"pa` handled by the close above.
  s = s.replace(/,\s*$/, "");

  // Close open containers in reverse.
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === "{" ? "}" : "]";
  }

  return s;
}

/** Parse whatever prefix of the stream we have so far. Returns null if unusable. */
export function parsePartialPlan(raw: string): PartialPlan | null {
  if (!raw) return null;
  // Fast path: it's already valid.
  try {
    return JSON.parse(raw) as PartialPlan;
  } catch {
    /* fall through to repair */
  }
  const repaired = repairJson(raw);
  if (!repaired) return null;
  try {
    return JSON.parse(repaired) as PartialPlan;
  } catch {
    return null;
  }
}

/** Only files that have both a path and (some) content are worth showing/previewing. */
export function usableFiles(plan: PartialPlan | null): PartialFile[] {
  if (!plan?.files) return [];
  return plan.files.filter(
    (f): f is PartialFile => !!f && typeof f.path === "string" && f.path.length > 0,
  );
}
