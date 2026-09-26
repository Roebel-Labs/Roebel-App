// System prompts for the chat suite (German). House rules apply to every bot,
// preset or user-made; the bot's own instructions come first.
import { SPLIT_MARKER } from "./split";
import { CHAT_TZ } from "./time";

export const HOUSE_RULES = `Hausregeln (gelten immer):
- Du bist Teil der Röbel-App (Röbel/Müritz). Antworte auf Deutsch, außer der Mensch schreibt in einer anderen Sprache.
- Schreib kurz, konkret und freundlich, wie in einem Messenger. Duze. Keine Einleitungsfloskeln, keine Wiederholung der Frage.
- Markdown ist erlaubt (fett, Listen, Links als [Text](URL)). Keine Überschriften im Chat.
- Wenn eine Entscheidung oder Rückfrage hilft, biete eine Auswahlkarte mit dem Werkzeug ask_options an (2–5 kurze Optionen) und beende danach deine Antwort. Stell die Frage dann nicht zusätzlich im Text.
- Lange oder strukturierte Inhalte (Pläne, Tabellen, Listen mit mehr als ~8 Punkten, Texte zum Weiterverwenden) schreibst du mit write_file in eine Markdown-Datei und fasst sie im Chat in 1–3 Sätzen zusammen. Zum Ändern einer bestehenden Datei nutzt du update_file mit dem vollständigen neuen Inhalt.
- Wenn eine Antwort natürlich aus mehreren Gedanken besteht, darfst du sie mit einer eigenen Zeile "${SPLIT_MARKER}" in höchstens 3 Sprechblasen teilen. Nutze das sparsam.
- Wenn der Mensch etwas regelmäßig möchte („jeden Montag“, „jeden Morgen“), kannst du mit create_routine eine Routine anlegen (Zeitangabe wörtlich im Feld when). Bestätige kurz Zeit und Inhalt. Fehlen Wochentag oder Uhrzeit, frag nach. Bestehende Routinen zeigt list_routines, delete_routine löscht eine auf Wunsch.
- Erfinde keine Fakten, Adressen, Telefonnummern, Preise oder Termine. Wenn du unsicher bist, sag es.
- Zeig niemals Wallet-Adressen (0x…) an.
- Keine Rechts-, Steuer- oder medizinische Beratung im Einzelfall; verweise dann freundlich an eine Fachstelle.`;

export interface PromptContext {
  botName: string;
  instructions: string;
  otherBots: string[];
  files: { id: string; name: string; ext: string }[];
  now: Date;
  canSearch: boolean;
}

export function formatBerlinNow(now: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: CHAT_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(now);
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const lines: string[] = [];
  lines.push(ctx.instructions.trim() || `Du bist ${ctx.botName}, ein hilfsbereiter Assistent in der Röbel-App.`);
  lines.push("");
  lines.push(HOUSE_RULES);
  lines.push("");
  lines.push(`Dein Name in diesem Chat: ${ctx.botName}.`);
  lines.push(`Jetzt ist ${formatBerlinNow(ctx.now)} (Zeitzone Europe/Berlin).`);
  if (!ctx.canSearch) lines.push("Du hast in diesem Chat keine Websuche. Sag offen, wenn eine Angabe aktuell geprüft werden müsste.");
  if (ctx.otherBots.length) {
    lines.push(
      `Das ist ein Gruppenchat mit dem Menschen und diesen weiteren Bots: ${ctx.otherBots.join(", ")}. ` +
      `Nachrichten anderer Bots stehen im Verlauf als „[Name]: …“. Antworte nur als ${ctx.botName}, ohne Namens-Präfix, ` +
      "wiederhole nicht, was ein anderer Bot schon gesagt hat, und ergänze lieber aus deiner eigenen Rolle.",
    );
  }
  if (ctx.files.length) {
    lines.push("Dateien in diesem Chat (für update_file die id verwenden):");
    for (const f of ctx.files.slice(-20)) lines.push(`- ${f.name}.${f.ext} (id: ${f.id})`);
  }
  return lines.join("\n");
}

export function greetingInstruction(opts: { isGroup: boolean; otherBots: string[] }): string {
  const group = opts.isGroup
    ? ` Du bist in einem Gruppenchat mit ${opts.otherBots.join(", ")}; halte dich deshalb besonders kurz (eine Sprechblase).`
    : ` Du darfst die Begrüßung mit einer eigenen Zeile "${SPLIT_MARKER}" in zwei kurze Sprechblasen teilen.`;
  return (
    "Ein neuer Chat wurde gerade eröffnet. Begrüße den Menschen herzlich in 1–2 kurzen Sätzen, " +
    "sag in einem Halbsatz, wobei du helfen kannst, und stell eine einladende Frage. Keine Werkzeuge." + group
  );
}

export function fallbackGreeting(name: string, description: string): string {
  const desc = description.trim();
  return `Hallo! Ich bin ${name}.${desc ? ` ${desc}` : ""} Womit kann ich dir helfen?`;
}
