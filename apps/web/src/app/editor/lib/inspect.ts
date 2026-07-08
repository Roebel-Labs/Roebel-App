// Preview-time augmentation of the generated document: an inspector (click an
// element to target the next edit at it — Lovable-style "Bearbeiten" mode) and
// a runtime-error reporter feeding the "Fehler beheben" chip.
//
// The script is injected ONLY into the editor preview srcdoc — published HTML
// (mini_app_versions.html) stays clean.

export interface InspectedElement {
  selector: string;
  tag: string;
  text: string;
  classes: string;
  html: string;
  screen: string | null;
}

export interface RuntimeError {
  message: string;
  source: string;
}

const INSPECT_SCRIPT = `<script>
(function () {
  var INSPECT_ON = false;
  var hoverEl = null;
  var prevOutline = "";
  var prevOffset = "";

  function post(payload) {
    try { parent.postMessage(payload, "*"); } catch (e) {}
  }

  // ---- runtime error reporting (always on) ----
  var reported = {};
  function reportError(message, source) {
    var key = String(message).slice(0, 200);
    if (reported[key]) return;
    reported[key] = true;
    post({ type: "netizen:runtime-error", message: String(message).slice(0, 600), source: source });
  }
  window.addEventListener("error", function (e) {
    reportError(e.message + (e.filename ? "" : "") + (e.lineno ? " (Zeile " + e.lineno + ")" : ""), "error");
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    var msg = r && r.message ? r.message : (typeof r === "object" ? JSON.stringify(r) : String(r));
    // Bridge rejections (user_rejected etc.) are normal app flow, not bugs.
    try { if (r && r.code && r.message) return; } catch (err) {}
    reportError("Unbehandelte Promise-Ablehnung: " + msg, "promise");
  });
  var origConsoleError = console.error;
  console.error = function () {
    try {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        parts.push(a && a.stack ? a.message : typeof a === "object" ? JSON.stringify(a) : String(a));
      }
      reportError(parts.join(" "), "console");
    } catch (e) {}
    return origConsoleError.apply(console, arguments);
  };

  // ---- inspector ----
  function cssPath(el) {
    if (el.id) return "#" + el.id;
    var path = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body && path.length < 6) {
      var seg = node.tagName.toLowerCase();
      if (node.id) { path.unshift("#" + node.id); break; }
      var parent = node.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
        if (same.length > 1) seg += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      var screen = node.getAttribute && node.getAttribute("data-screen");
      if (screen) { path.unshift("[data-screen=\\"" + screen + "\\"]"); break; }
      path.unshift(seg);
      node = parent;
    }
    return path.join(" > ");
  }

  function clearHover() {
    if (hoverEl) {
      hoverEl.style.outline = prevOutline;
      hoverEl.style.outlineOffset = prevOffset;
      hoverEl = null;
    }
  }

  function onMove(e) {
    if (!INSPECT_ON) return;
    var el = e.target;
    if (el === hoverEl || el === document.body || el === document.documentElement) return;
    clearHover();
    hoverEl = el;
    prevOutline = el.style.outline;
    prevOffset = el.style.outlineOffset;
    el.style.outline = "2px solid #00498B";
    el.style.outlineOffset = "1px";
  }

  function onClick(e) {
    if (!INSPECT_ON) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    var section = el.closest ? el.closest("[data-screen]") : null;
    post({
      type: "netizen:inspect:pick",
      element: {
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().slice(0, 80),
        classes: (typeof el.className === "string" ? el.className : "").slice(0, 300),
        html: (el.outerHTML || "").slice(0, 1500),
        screen: section ? section.getAttribute("data-screen") : null
      }
    });
    clearHover();
  }

  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "netizen:inspect") return;
    INSPECT_ON = !!e.data.enabled;
    if (!INSPECT_ON) clearHover();
    document.documentElement.style.cursor = INSPECT_ON ? "crosshair" : "";
  });
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
})();
</script>`;

/** Inject the inspector/error script into a generated document (preview only). */
export function augmentPreviewHtml(html: string): string {
  const idx = html.lastIndexOf("</body>");
  if (idx >= 0) return html.slice(0, idx) + INSPECT_SCRIPT + html.slice(idx);
  return html + INSPECT_SCRIPT;
}

/** Short human label for the "Ausgewählt" chip. */
export function elementLabel(el: InspectedElement): string {
  const text = el.text ? ` „${el.text.slice(0, 32)}${el.text.length > 32 ? "…" : ""}“` : "";
  return `<${el.tag}>${text}`;
}

/** Context block prepended (server-bound only) to the edit request. */
export function buildElementContext(el: InspectedElement): string {
  return (
    `[Ausgewähltes Element — beziehe die folgende Änderung GEZIELT hierauf]\n` +
    `Screen: ${el.screen ?? "unbekannt"} · Selektor: ${el.selector}\n` +
    `HTML: ${el.html}\n\n`
  );
}

/** Fix request sent when the user clicks "Fehler beheben". */
export function buildErrorFixPrompt(errors: RuntimeError[]): string {
  const list = errors
    .slice(0, 5)
    .map((e, i) => `${i + 1}. [${e.source}] ${e.message}`)
    .join("\n");
  return `In der Vorschau sind Laufzeitfehler aufgetreten. Analysiere die Ursache und behebe sie, ohne Funktionen zu entfernen:\n${list}`;
}
