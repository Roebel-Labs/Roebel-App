import { NextResponse } from "next/server";
import { personaStatus } from "@/lib/chat/persona/build";
import * as persona from "@/lib/chat/persona/store";
import type { Suggestion, SuggestionSectionKey } from "@/lib/chat/persona/types";
import { handleError, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const ORDER: SuggestionSectionKey[] = ["projects", "collab", "improve", "peers"];
const SECTION_TITLES: Record<SuggestionSectionKey, string> = { projects: "", collab: "Zusammenarbeit", improve: "Ortis verbessern", peers: "" };

/** GET /api/chat/persona/suggestions → {sections, groups, status}. `groups` is the flat list older clients read. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const [rows, status] = await Promise.all([persona.listSuggestionRows(wallet), personaStatus(wallet)]);
    type Group = { title: string; items: Suggestion[] };
    const groups: Group[] = [];
    const sections: { key: SuggestionSectionKey; title: string; groups: Group[] }[] = [];
    const into = (list: Group[], title: string, item: Suggestion) => {
      let g = list.find((x) => x.title === title);
      if (!g) { g = { title, items: [] }; list.push(g); }
      g.items.push(item);
    };
    for (const r of rows) {
      const item = persona.toSuggestion(r);
      const key = r.section ?? "projects";
      into(groups, key === "projects" ? r.group_title : SECTION_TITLES[key] || r.group_title, item);
      let sec = sections.find((x) => x.key === key);
      if (!sec) { sec = { key, title: key === "peers" ? r.section_title || "Für Menschen wie dich" : SECTION_TITLES[key], groups: [] }; sections.push(sec); }
      into(sec.groups, r.group_title, item);
    }
    // "Allgemein" reads best at the end.
    const last = (a: Group, b: Group) => Number(a.title === "Allgemein") - Number(b.title === "Allgemein");
    groups.sort(last);
    sections.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
    sections.find((x) => x.key === "projects")?.groups.sort(last);
    return NextResponse.json({ sections, groups, status });
  } catch (err) {
    return handleError(err, "persona/suggestions");
  }
}
