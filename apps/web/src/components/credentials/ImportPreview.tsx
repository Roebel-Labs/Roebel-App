"use client";

/** people_preview result (server: PeoplePreview in lib/credentials/batch.ts). No email addresses. */
export type PeoplePreviewView = {
  app: number;
  link: number;
  skipped: number;
  rejected: { row: number; reason: string }[];
  rows: { displayName: string; channel: "app" | "link" | "mail" }[];
};

const CHANNEL_LABEL: Record<PeoplePreviewView["rows"][number]["channel"], string> = {
  app: "Nachricht in der App",
  mail: "Persönlicher Link per E-Mail",
  link: "Persönlicher Link oder Brief",
};

/** "65 Personen: 40 bekommen eine Nachricht in der App, 25 einen persönlichen Link oder Brief." */
export function previewHeadline(p: Pick<PeoplePreviewView, "app" | "link">): string {
  const total = p.app + p.link;
  return `${total} ${total === 1 ? "Person" : "Personen"}: ${p.app} ${p.app === 1 ? "bekommt" : "bekommen"} eine Nachricht in der App, ${p.link} einen persönlichen Link oder Brief.`;
}

export function ImportPreview({ preview }: { preview: PeoplePreviewView }) {
  return (
    <div className="space-y-3 rounded-lg border border-[#B4B8C1] bg-card p-4">
      <p className="text-sm font-medium text-foreground">{previewHeadline(preview)}</p>
      {preview.rejected.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            {preview.rejected.length} {preview.rejected.length === 1 ? "Zeile" : "Zeilen"} übersprungen:
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
            {preview.rejected.map((r) => (
              <li key={`${r.row}-${r.reason}`}>
                Zeile {r.row}: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.skipped > 0 && (
        <p className="text-sm text-[#6B7280]">
          {preview.skipped} {preview.skipped === 1 ? "hat" : "haben"} schon einen gültigen Ausweis
        </p>
      )}
      {preview.rows.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-md border border-[#B4B8C1]">
          <table className="w-full text-sm">
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i} className="border-b border-[#B4B8C1] last:border-0">
                  <td className="px-3 py-1.5 text-foreground">{r.displayName}</td>
                  <td className="px-3 py-1.5 text-right text-[#6B7280]">{CHANNEL_LABEL[r.channel]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
