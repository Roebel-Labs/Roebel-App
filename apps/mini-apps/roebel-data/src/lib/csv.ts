// Tiny dependency-free CSV builder + robust delivery that works inside the
// Circles mini-app iframe / mobile webview (where a plain <a download> is blocked).

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\r\n");
  return `${head}\r\n${body}`;
}

/** Today as YYYY-MM-DD for filenames. */
export const todayStamp = () => new Date().toISOString().slice(0, 10);

/** True when running inside a (cross-origin) iframe — i.e. the Circles host. */
function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin access throws → we're definitely framed
  }
}

export type ExportResult =
  | "shared" // delivered via the native share sheet
  | "downloaded" // delivered via a real browser download
  | "cancelled" // user dismissed the share sheet — nothing more to do
  | "fallback"; // host blocked both → caller must show the copy/preview sheet

/**
 * Deliver a CSV to the user across every host environment:
 *   1. Web Share API with a File — native share sheet on mobile (→ Save to Files).
 *   2. Classic anchor-click download — reliable in a normal top-level browser tab.
 *   3. "fallback" — caller opens an in-app sheet (copy / select) that can't be blocked.
 */
export async function exportCsv(filename: string, csv: string): Promise<ExportResult> {
  // 1. Web Share with a real file — best UX inside the miniapp webview.
  try {
    const file = new File([csv], filename, { type: "text/csv" });
    if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    }
  } catch (err) {
    // User dismissed the sheet → done; don't pop a second UI at them.
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // Any other error (host didn't delegate web-share, etc.) → fall through.
  }

  // 2. Classic download — works in a normal top-level tab, blocked in sandboxed iframes.
  if (!inIframe()) {
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "downloaded";
    } catch {
      /* fall through to the in-app fallback */
    }
  }

  // 3. Nothing could auto-deliver — caller shows the copy/preview sheet.
  return "fallback";
}

/** Copy text to the clipboard; returns false if every clipboard path is blocked. */
export async function copyText(text: string): Promise<boolean> {
  // Modern async clipboard (needs clipboard-write permission to be delegated).
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  // Legacy execCommand — works in more iframe configurations.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
