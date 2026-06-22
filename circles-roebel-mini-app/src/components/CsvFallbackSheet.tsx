// Last-resort CSV delivery for hosts that block downloads AND the share sheet
// (locked-down iframes). Pure DOM — copy to clipboard + an always-selectable
// preview — so the data can always get out, whatever the host allows.
import { useState } from "react";
import { copyText } from "../lib/csv";
import { Copy, Check } from "./icons";

export default function CsvFallbackSheet({
  filename,
  csv,
  onClose,
}: {
  filename: string;
  csv: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const rows = csv ? csv.trimEnd().split(/\r?\n/).length - 1 : 0;

  const copy = async () => {
    const ok = await copyText(csv);
    if (ok) {
      setCopied(true);
      setManual(false);
      setTimeout(() => setCopied(false), 1800);
    } else {
      // Clipboard blocked too — guide the user to select + copy manually.
      setManual(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div className="rc-rise relative z-10 w-full max-w-xl rounded-t-[20px] border border-border bg-card p-4 shadow-2xl sm:rounded-[18px]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />

        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Get your CSV</h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {filename} · {rows} {rows === 1 ? "row" : "rows"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-[8px] px-2 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Close
          </button>
        </div>

        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
          {manual
            ? "Tap the data below, select all, and copy it manually."
            : "Direct downloads are blocked inside the mini-app — copy the data and paste it into a spreadsheet or file."}
        </p>

        <button
          onClick={copy}
          className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#194383] px-3 py-2.5 text-[13px] font-semibold text-white transition active:scale-[0.99]"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied to clipboard" : "Copy CSV"}
        </button>

        <textarea
          readOnly
          value={csv}
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
          className="h-44 w-full resize-none rounded-[10px] border border-border bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-foreground outline-none focus:border-[#194383]"
        />
      </div>
    </div>
  );
}
