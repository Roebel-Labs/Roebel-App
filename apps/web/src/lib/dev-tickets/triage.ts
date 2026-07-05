// AI triage: unprocessed feedback rows → dev tickets (or duplicate/noise).
// One generateObject call per feedback row; open-ticket list passed for dedup.
import "server-only";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTicket, addActivity } from "@/lib/dev-tickets/db";

// NOTE: no .min()/.max() — Anthropic structured outputs reject the
// minimum/maximum JSON-schema keywords (see api/cron/mecky/prompt.ts).
const TriageSchema = z.object({
  actionable: z
    .boolean()
    .describe(
      "true, wenn ein Entwickler daraus eine konkrete Aufgabe ableiten kann. Spam, Grüße, reine Meinungen, Unverständliches: false"
    ),
  duplicate_of_ticket_id: z
    .string()
    .describe(
      'Exakte Ticket-ID aus der Liste offener Tickets, wenn dieses Feedback dasselbe Problem beschreibt — sonst "none"'
    ),
  title: z.string().describe("Deutscher Ticket-Titel, max. 80 Zeichen"),
  description: z
    .string()
    .describe(
      'Markdown mit Abschnitten "## Problem" und "## Erwartetes Verhalten"'
    ),
  type: z.enum(["bug", "feature", "task", "improvement"]),
  priority: z
    .enum(["low", "medium", "high", "urgent"])
    .describe("urgent NUR bei Crash, Datenverlust oder Sicherheitsproblem"),
  ai_analysis: z.object({
    repro_steps: z.array(z.string()).describe("Schritte zur Reproduktion"),
    suspected_area: z
      .string()
      .describe(
        "Vermuteter Monorepo-Bereich, z.B. 'apps/expo (Mecky-Chat)' oder 'apps/web (Admin-Dashboard)'"
      ),
    severity_rationale: z.string().describe("Warum diese Priorität"),
    dedup_notes: z.string().describe("Kurz: geprüfte ähnliche Tickets"),
  }),
});

const TRIAGE_SYSTEM = `Du bist der Triage-Assistent für das Dev-Ticket-Board der Röbel-App
(Turborepo: apps/web = Next.js-Website, apps/expo = React-Native-App,
Supabase-Backend, Solidity-Contracts). Du bekommst EINEN Nutzerfeedback-Eintrag
und die Liste offener Tickets. Entscheide, ob daraus ein umsetzbares
Entwickler-Ticket wird, ob es ein Duplikat ist, oder ob es nicht umsetzbar ist.
Schreibe Titel und Beschreibung auf Deutsch. Erfinde keine Details, die nicht
im Feedback stehen.`;

type FeedbackRow = {
  id: string;
  feedback_type: string;
  subject: string;
  message: string;
  source: string;
  device_info: Record<string, unknown> | null;
  created_at: string;
};

export async function triageNewFeedback(limit = 5): Promise<{
  processed: number;
  created: number;
  duplicates: number;
  not_actionable: number;
}> {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from("feedback")
    .select("id, feedback_type, subject, message, source, device_info, created_at")
    .eq("status", "new")
    .is("triaged_at", null)
    .in("feedback_type", ["bug_report", "feature_request", "improvement"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const summary = { processed: 0, created: 0, duplicates: 0, not_actionable: 0 };
  if (!rows?.length) return summary;

  const { data: openTickets, error: otError } = await supabase
    .from("dev_tickets")
    .select("id, title, type")
    .not("status", "in", "(done,rejected)");
  if (otError) throw otError;

  const openList =
    (openTickets ?? [])
      .map((t) => `- ${t.id} [${t.type}] ${t.title}`)
      .join("\n") || "(keine offenen Tickets)";

  for (const row of rows as FeedbackRow[]) {
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: TriageSchema,
      system: TRIAGE_SYSTEM,
      prompt: `## Feedback-Eintrag
Typ: ${row.feedback_type}
Quelle: ${row.source}
Betreff: ${row.subject}
Nachricht:
${row.message}

Gerät: ${JSON.stringify(row.device_info ?? {})}
Eingegangen: ${row.created_at}

## Offene Tickets (für Duplikat-Prüfung)
${openList}`,
    });
    summary.processed++;

    const markTriaged = (status?: "in_review") =>
      supabase
        .from("feedback")
        .update({
          triaged_at: new Date().toISOString(),
          ...(status ? { status } : {}),
        })
        .eq("id", row.id);

    if (!object.actionable) {
      // Stays status=new for human triage in the old feedback page,
      // but triaged_at prevents re-processing every cron run.
      await markTriaged();
      summary.not_actionable++;
      continue;
    }

    const dupId = object.duplicate_of_ticket_id;
    if (dupId !== "none" && (openTickets ?? []).some((t) => t.id === dupId)) {
      await addActivity(
        dupId,
        "ai",
        `Weiteres Feedback zum selben Problem eingegangen (Feedback ${row.id.slice(0, 8)}, Quelle: ${row.source})`
      );
      await markTriaged("in_review");
      summary.duplicates++;
      continue;
    }

    // New tickets go to the TOP of the Inbox column.
    const { data: minRow } = await supabase
      .from("dev_tickets")
      .select("position")
      .eq("status", "inbox")
      .order("position", { ascending: true })
      .limit(1);
    const position = minRow?.length ? minRow[0].position - 1024 : 1024;

    const ticket = await createTicket({
      title: object.title.slice(0, 200),
      description: object.description,
      type: object.type,
      priority: object.priority,
      status: "inbox",
      position,
      source: row.source === "mecky" ? "mecky" : "feedback_form",
      source_feedback_id: row.id,
      ai_analysis: object.ai_analysis,
    });
    await addActivity(
      ticket.id,
      "ai",
      `Von KI aus Feedback erstellt (${row.feedback_type}, Quelle: ${row.source})`
    );
    await markTriaged("in_review");
    summary.created++;
  }

  return summary;
}
