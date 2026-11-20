// Ready-made routines ("Entdecken") and the helpers that turn a template, a
// suggestion or a free-form routine into a real chat routine with its own thread.
import { nextRunAt } from "../schedule";
import * as chatStore from "../store";
import type { BotRow } from "../store";
import type { ChatRoutine, RoutineSchedule } from "../types";

export interface RoutineTemplate {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  icon: "inbox" | "mail" | "calendar" | "search" | "list" | "sun" | "news" | "radar" | "people" | "chart" | "handshake" | "bell";
  color: string;
  schedule: RoutineSchedule;
  requires: "google"[];
  prompt: string;
}

const tz = "Europe/Berlin" as const;
const daily = (hour: number, minute = 0): RoutineSchedule => ({ kind: "daily", hour, minute, tz });
const weekly = (weekday: number, hour: number, minute = 0): RoutineSchedule => ({ kind: "weekly", weekday, hour, minute, tz });

export const ROUTINE_CATEGORIES = [
  { id: "inbox", label: "Postfach" },
  { id: "calendar", label: "Kalender" },
  { id: "meetings", label: "Termine vorbereiten" },
  { id: "informed", label: "Informiert bleiben" },
  { id: "relationships", label: "Kontakte pflegen" },
  { id: "operations", label: "Abläufe" },
] as const;

const DRAFT_ONLY = "Sende nichts selbst. Lege Antworten höchstens als Entwurf an und sag, wo er liegt.";

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: "morning-briefing", title: "Morgen-Überblick", tagline: "Starte den Tag und weiß, was zählt.", category: "informed", icon: "sun", color: "#E0A82E",
    schedule: daily(7, 30), requires: ["google"],
    description: "Jeden Morgen: Termine des Tages, die Mails, die heute eine Antwort brauchen, und die drei wichtigsten Dinge aus deinen Zielen.",
    prompt: "Erstelle meinen Morgen-Überblick. Lies zuerst im Wiki die Seite goals. Schau dann in meinen Google-Kalender (heute) und in Gmail (letzte 24 Stunden, nur Mails von Personen). Schreib kurz: 1) Termine heute mit Uhrzeit, 2) Mails, die heute eine Antwort brauchen, mit einem Satz warum, 3) die drei wichtigsten Dinge für heute aus meinen Zielen. Höchstens 12 Zeilen, keine Einleitung.",
  },
  {
    id: "weekly-briefing", title: "Wochen-Überblick", tagline: "Starte die Woche mit klarem Blick.", category: "informed", icon: "calendar", color: "#E0A82E",
    schedule: weekly(1, 7, 0), requires: ["google"],
    description: "Jeden Montag: dein Kalender der Woche auf einen Blick, Mails, die Aufmerksamkeit brauchen, und ein paar vorgeschlagene Aufgaben.",
    prompt: "Erstelle meinen Wochen-Überblick. Lies im Wiki goals und projects. Liste die Termine dieser Woche aus dem Google-Kalender (Mo bis So), nenne Überschneidungen und Tage ohne Luft. Such in Gmail offene Fäden der letzten 7 Tage, auf die ich noch nicht geantwortet habe. Schlag am Ende 3 Aufgaben vor, die diese Woche meine Ziele voranbringen.",
  },
  {
    id: "loose-ends", title: "Offene Enden", tagline: "Alles, was du noch schuldest, vor Feierabend.", category: "inbox", icon: "list", color: "#E8742C",
    schedule: daily(17, 0), requires: ["google"],
    description: "Jeden Werktag am späten Nachmittag: Zusagen und unbeantwortete Fragen aus deinen Mails von heute, sortiert nach Dringlichkeit.",
    prompt: `Finde meine offenen Enden von heute. Durchsuche Gmail: gesendete Mails von heute mit Zusagen („ich schicke“, „ich melde mich“, „bis morgen“) und eingegangene Mails von Personen, die eine Frage an mich enthalten und unbeantwortet sind. Liste: „Kann nicht warten“ und „Noch offen“, je mit Person, Thema und nächstem Schritt. Wenn nichts offen ist, sag das in einem Satz. ${DRAFT_ONLY}`,
  },
  {
    id: "meeting-briefing", title: "Termin-Vorbereitung", tagline: "Vorbereitet in jedes Gespräch.", category: "meetings", icon: "search", color: "#3FA65B",
    schedule: daily(7, 0), requires: ["google"],
    description: "Jeden Morgen für die Termine des Tages mit anderen Personen: wer kommt, worum es zuletzt ging, was offen ist.",
    prompt: "Bereite meine heutigen Termine vor. Hol die Termine von heute aus dem Google-Kalender. Für jeden Termin mit anderen Teilnehmenden: lies deren Wiki-Seite (wiki_search nach dem Namen), such in Gmail den letzten Austausch mit ihnen und schreib 3 bis 5 Stichpunkte: wer, letzter Stand, offene Punkte, was ich ansprechen sollte. Termine ohne andere Personen nur als Zeile nennen.",
  },
  {
    id: "schedule-optimizer", title: "Wochenplan-Check", tagline: "Bessere Wochen, weniger Termine am Stück.", category: "calendar", icon: "calendar", color: "#3BA7C9",
    schedule: weekly(0, 18, 0), requires: ["google"],
    description: "Jeden Sonntagabend: schaut die kommenden zwei Wochen an, zeigt Termin-Ketten ohne Pause und schlägt Fokuszeiten vor.",
    prompt: "Prüfe meinen Google-Kalender der nächsten 14 Tage. Nenne Tage mit Terminen direkt hintereinander, Überschneidungen und Tage ganz ohne freie Blöcke. Schlag konkrete Fokuszeiten vor (Tag, Uhrzeit, wofür, passend zu meinen Zielen im Wiki). Ändere nichts im Kalender, mach nur Vorschläge.",
  },
  {
    id: "auto-inbox", title: "Postfach-Sortierung", tagline: "Dein Postfach, geordnet ohne Arbeit.", category: "inbox", icon: "inbox", color: "#4C7BE8",
    schedule: daily(12, 0), requires: ["google"],
    description: "Jeden Mittag: teilt die neuen Mails in „Antwort nötig“, „Zur Kenntnis“ und „Kann weg“ ein und nennt pro Mail den nächsten Schritt.",
    prompt: "Sortiere meine Mails der letzten 24 Stunden aus Gmail in drei Gruppen: „Antwort nötig“ (von Personen, mit Frage oder Bitte), „Zur Kenntnis“ und „Kann weg“ (Werbung, automatische Meldungen ohne Handlungsbedarf). Pro Mail eine Zeile: Absender, Thema, nächster Schritt. Fasse wiederholte automatische Meldungen (zum Beispiel fehlgeschlagene Zahlungen oder Builds) zu einer Zeile mit Anzahl zusammen.",
  },
  {
    id: "decline-cold-outreach", title: "Kaltakquise abfangen", tagline: "Hält ungebetene Angebote aus dem Weg.", category: "inbox", icon: "mail", color: "#4C7BE8",
    schedule: daily(16, 0), requires: ["google"],
    description: "Jeden Nachmittag: findet unaufgeforderte Verkaufs-Mails von Unbekannten und bereitet höfliche Absagen als Entwurf vor.",
    prompt: `Such in Gmail die Mails der letzten 24 Stunden von Absendern, denen ich noch nie geschrieben habe und die mir etwas verkaufen wollen (Agenturen, Software, Dienstleistungen). Liste sie mit Absender und Angebot in einer Zeile. Biete für jede eine kurze, höfliche Absage in meinem Stil an. ${DRAFT_ONLY}`,
  },
  {
    id: "delegation-chaser", title: "Nachfass-Liste", tagline: "Nichts, was du abgegeben hast, versandet.", category: "operations", icon: "list", color: "#A8551E",
    schedule: weekly(4, 9, 0), requires: ["google"],
    description: "Jeden Donnerstag: was du anderen übergeben oder angefragt hast, was zurückkam und wo eine Erinnerung fällig ist.",
    prompt: `Bau die Liste der Dinge, die ich abgegeben oder angefragt habe. Durchsuche meine gesendeten Mails der letzten 21 Tage nach Bitten und Aufträgen an andere. Markiere, was beantwortet wurde. Für alles, was seit mehr als 4 Tagen ohne Antwort ist: Person, Thema, Datum und ein kurzer Erinnerungstext in meinem Stil. ${DRAFT_ONLY}`,
  },
  {
    id: "relationship-reconnect", title: "Wieder melden", tagline: "Bleib in Kontakt mit den Richtigen.", category: "relationships", icon: "people", color: "#E69A2E",
    schedule: weekly(2, 9, 0), requires: ["google"],
    description: "Jeden Dienstag: Kontakte aus deinem Wiki, bei denen länger Funkstille ist, mit einem persönlichen Vorschlag für eine Nachricht.",
    prompt: `Lies die Personen-Seiten in meinem Wiki. Finde bis zu 3 Personen, mit denen es einen offenen Faden gab und bei denen der letzte Austausch in Gmail länger als 3 Wochen her ist. Schlag pro Person eine kurze, persönliche Nachricht in meinem Stil vor, die an den letzten Stand anknüpft. ${DRAFT_ONLY}`,
  },
  {
    id: "partner-reengagement", title: "Partner-Fäden aufnehmen", tagline: "Eingeschlafene Gespräche wieder anstoßen.", category: "relationships", icon: "handshake", color: "#2F4FD0",
    schedule: weekly(2, 10, 0), requires: ["google"],
    description: "Jeden Dienstag: Kooperations- und Förder-Gespräche, die nach gutem Start still wurden, mit einem Entwurf zum Wiederaufnehmen.",
    prompt: `Finde in Gmail Gespräche der letzten 90 Tage zu Kooperationen, Förderung, Sponsoring oder Vorstellungen, die nach mindestens zwei Nachrichten hin und her seit über 14 Tagen still sind. Pro Faden: Partner, letzter Stand, wer am Zug ist, und ein Entwurf zum Wiederaufnehmen in meinem Stil. ${DRAFT_ONLY}`,
  },
  {
    id: "newsletter-digest", title: "Newsletter-Auszug", tagline: "Das Wichtige aus deinen Newslettern.", category: "informed", icon: "news", color: "#E0A82E",
    schedule: weekly(5, 16, 0), requires: ["google"],
    description: "Jeden Freitag: die Newsletter der Woche in fünf Punkten, passend zu deinen Projekten.",
    prompt: "Such in Gmail die Newsletter der letzten 7 Tage (Mails mit Abmelde-Link). Fasse das Wichtigste in höchstens 5 Punkten zusammen und heb hervor, was zu meinen Projekten im Wiki passt. Nenne zu jedem Punkt den Absender.",
  },
  {
    id: "service-warnings", title: "Konto- und Dienst-Warnungen", tagline: "Zahlungs- und Speicher-Warnungen im Blick.", category: "operations", icon: "bell", color: "#B0766C",
    schedule: weekly(1, 8, 0), requires: ["google"],
    description: "Jeden Montag: eine kurze Liste der Warnungen zu Zahlungen, Speicher, Sicherheit und Ausfällen aus deinem Postfach.",
    prompt: "Such in Gmail die automatischen Warnungen der letzten 7 Tage: fehlgeschlagene Zahlungen, volle Speicher, Sicherheitswarnungen, Kündigungen, auslaufende Tarife, fehlgeschlagene Builds oder Deployments. Gruppiere nach Dienst, nenne Anzahl und letzte Meldung und sag pro Dienst in einem Satz, was zu tun ist. Dringendes zuerst.",
  },
  {
    id: "funding-radar", title: "Förder-Radar", tagline: "Passende Programme und Fristen finden.", category: "informed", icon: "radar", color: "#D0527A",
    schedule: weekly(3, 9, 0), requires: [],
    description: "Jeden Mittwoch: sucht im Netz nach Förderprogrammen, Wettbewerben und Acceleratoren, die zu deinen Projekten passen, mit Frist.",
    prompt: "Lies im Wiki projects und goals. Such im Netz nach Förderprogrammen, Wettbewerben und Acceleratoren in Deutschland und der EU, die zu meinen Projekten passen und deren Frist in den nächsten 90 Tagen liegt. Höchstens 5 Treffer: Name, wer fördert, Summe, Frist, warum es passt, Link. Nenne nur, was du auf der Seite des Programms nachgeprüft hast.",
  },
  {
    id: "roebel-week", title: "Röbel diese Woche", tagline: "Was in Röbel ansteht, passend zu dir.", category: "informed", icon: "news", color: "#00498B",
    schedule: weekly(1, 8, 30), requires: [],
    description: "Jeden Montag: Veranstaltungen, Neuigkeiten und Abstimmungen aus der Röbel App, ausgewählt nach deinen Interessen und Vereinen.",
    prompt: "Schau in die Röbel-App: Veranstaltungen der nächsten 7 Tage, neue Beiträge meiner Organisationen und laufende Abstimmungen. Wähl aus, was zu meinen Interessen und Vereinen passt (Wiki und Profil), höchstens 8 Punkte mit Datum und Link in die App.",
  },
];

export function templateById(id: string): RoutineTemplate | null {
  return ROUTINE_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** The bot that runs suggestions and routines: Mecky (the preset with connectors, memory and the smart model), else the first preset. */
export async function workBot(): Promise<BotRow> {
  const res = await chatStore.db().from("chat_bots").select("*").eq("is_preset", true).order("sort");
  if (res.error) throw new Error(`[chat/persona] presets: ${res.error.message}`);
  const rows = res.data as BotRow[];
  const bot = rows.find((b) => b.slug === "mecky") ?? rows.find((b) => (b.tools ?? []).includes("connectors")) ?? rows[0];
  if (!bot) throw new Error("[chat/persona] no preset bot");
  return bot;
}

export async function installedTemplateIds(wallet: string): Promise<Set<string>> {
  const res = await chatStore.db().from("chat_routines").select("template_id").eq("owner_wallet", wallet).not("template_id", "is", null);
  if (res.error) throw new Error(`[chat/persona] installed: ${res.error.message}`);
  return new Set((res.data as { template_id: string }[]).map((r) => r.template_id));
}

/** Creates a routine in its own thread (named after the routine). */
export async function createRoutineWithThread(wallet: string, input: {
  title: string; prompt: string; schedule: RoutineSchedule; templateId?: string | null;
}): Promise<{ routine: ChatRoutine; threadId: string }> {
  const bot = await workBot();
  const thread = await chatStore.createThread(wallet, [bot]);
  const title = input.title.trim().slice(0, 60);
  await chatStore.setThreadTopic(thread.id, title);
  const routine = await chatStore.createRoutine(wallet, {
    threadId: thread.id, botId: bot.id, title, prompt: input.prompt.trim().slice(0, 1000), schedule: input.schedule,
    nextRunAt: nextRunAt(input.schedule).toISOString(),
  });
  if (input.templateId) {
    const res = await chatStore.db().from("chat_routines").update({ template_id: input.templateId }).eq("id", routine.id).eq("owner_wallet", wallet);
    if (res.error) console.error("[chat/persona] template id", res.error.message);
  }
  return { routine, threadId: thread.id };
}

/** A fresh thread for a one-off suggestion; the client sends the prompt as the first message. */
export async function createTaskThread(wallet: string, title: string): Promise<string> {
  const bot = await workBot();
  const thread = await chatStore.createThread(wallet, [bot]);
  await chatStore.setThreadTopic(thread.id, title.trim().slice(0, 60));
  return thread.id;
}
