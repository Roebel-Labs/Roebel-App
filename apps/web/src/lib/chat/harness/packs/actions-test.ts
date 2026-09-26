// Test-only gated tool to exercise approvals end-to-end (bot.tools key
// 'actions_test'; enabled for no bot by default). Risk 'public' but writes
// nothing external: the note only lands in agent_actions.result.
import { z } from "zod";
import type { HarnessTool, ToolRegistry } from "../types";

const input = z.object({
  note: z.string().min(1).max(500).describe("Die Notiz an das Röbel-Team"),
});

export const noteToTeam: HarnessTool<z.infer<typeof input>> = {
  name: "note_to_team",
  pack: "actions",
  risk: "public",
  description:
    "Schickt eine kurze Notiz an das Röbel-Team (Testwerkzeug für Freigaben). Braucht die Freigabe des Menschen.",
  inputSchema: input,
  summarize: ({ note }) => `Notiz an das Röbel-Team senden: „${note.length > 80 ? `${note.slice(0, 79)}…` : note}“`,
  preview: ({ note }) => ({ kind: "text", fields: [{ label: "An", value: "Röbel-Team" }], body: note }),
  execute: async ({ note }) => ({ ok: true, logged: note, info: "Notiz im Aktivitätsprotokoll gespeichert." }),
};

export function register(registry: ToolRegistry): void {
  registry.registerTool(noteToTeam);
}
