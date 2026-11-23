import { bottomNav, SCRIPT_HELPERS, templateDocument, type MiniAppTemplate } from "./types";
import { THUMBS } from "./thumbs";

const PROGRAMM = [
  { id: "p1", tag: "Samstag", beginn: "10:00", ende: "11:00", titel: "Eröffnung", ort: "Hauptbühne", beschreibung: "Begrüßung durch die Bürgermeisterin" },
  { id: "p2", tag: "Samstag", beginn: "11:30", ende: "13:00", titel: "Kinderprogramm", ort: "Wiese am Hafen", beschreibung: "Basteln, Schminken, Hüpfburg" },
  { id: "p3", tag: "Samstag", beginn: "14:00", ende: "15:30", titel: "Blasorchester", ort: "Hauptbühne", beschreibung: "Bekannte Melodien zum Mitsingen" },
  { id: "p4", tag: "Samstag", beginn: "20:00", ende: "23:00", titel: "Tanz in den Abend", ort: "Festzelt", beschreibung: "Live-Band und DJ" },
  { id: "p5", tag: "Sonntag", beginn: "10:00", ende: "12:00", titel: "Frühschoppen", ort: "Festzelt", beschreibung: "Mit regionalen Spezialitäten" },
];

const FEST = {
  name: "Hafenfest Röbel",
  datum: "13.–14. Juni",
  infos: "Eintritt frei. Toiletten am Hafenbüro, Erste Hilfe am Festzelt. Parken an der Seebadstraße.",
};

const body = `
<main class="mx-auto max-w-md p-4 pb-[calc(5rem+var(--safe-bottom))]">
  <section data-screen="programm" data-title="Programm" data-states="geladen,jetzt" class="active">
    <p id="fest-datum" class="text-xs font-medium text-muted-foreground"></p>
    <h1 id="fest-name" class="font-heading text-xl font-bold"></h1>
    <div id="jetzt" class="mt-4 hidden rounded-lg bg-primary p-4 text-primary-foreground"></div>
    <div id="tage" class="mt-4 flex gap-2"></div>
    <div id="liste" class="mt-3 space-y-3"></div>
  </section>
  <section data-screen="mein" data-title="Mein Plan" data-states="gefuellt,leer">
    <h1 class="font-heading text-xl font-bold">Mein Plan</h1>
    <p class="mt-1 text-sm text-muted-foreground">Programmpunkte mit Stern.</p>
    <div id="meine" class="mt-4 space-y-3"></div>
  </section>
  <section data-screen="infos" data-title="Infos">
    <h1 class="font-heading text-xl font-bold">Gut zu wissen</h1>
    <p id="fest-infos" class="mt-4 whitespace-pre-line rounded border border-border bg-card p-4 text-sm"></p>
    <button id="teilen" class="mt-4 w-full rounded border border-border px-4 py-2.5 text-sm text-foreground">Programm teilen</button>
  </section>
</main>
${bottomNav(
  [
    { screen: "programm", label: "Programm" },
    { screen: "mein", label: "Mein Plan" },
    { screen: "infos", label: "Infos" },
  ],
  "programm",
)}`;

const script = `
${SCRIPT_HELPERS}
const DEFAULT_PROGRAMM = ${JSON.stringify(PROGRAMM)};
const DEFAULT_FEST = ${JSON.stringify(FEST)};
let programm = DEFAULT_PROGRAMM;
let fest = DEFAULT_FEST;
let stars = [];
let tag = null;
let jetztDemo = false;

function minuten(hhmm) { const p = String(hhmm).split(":"); return Number(p[0]) * 60 + Number(p[1] || 0); }
function karte(p) {
  const on = stars.includes(p.id);
  return '<article class="flex gap-3 rounded border border-border bg-card p-4"><div class="w-14 shrink-0 font-mono text-sm font-semibold tabular-nums">' + esc(p.beginn) + '</div><div class="min-w-0 flex-1"><h2 class="font-heading text-base font-semibold">' + esc(p.titel) + '</h2><p class="text-sm text-muted-foreground">' + esc(p.ort) + (p.ende ? ' · bis ' + esc(p.ende) : '') + '</p>' + (p.beschreibung ? '<p class="mt-1 text-sm">' + esc(p.beschreibung) + '</p>' : '') + '</div><button data-star="' + esc(p.id) + '" aria-label="Merken" aria-pressed="' + on + '" class="h-11 w-11 shrink-0 rounded text-xl ' + (on ? 'text-warning' : 'text-muted-foreground') + '">' + (on ? '★' : '☆') + '</button></article>';
}
function render() {
  const tage = Array.from(new Set(programm.map((p) => p.tag)));
  if (!tage.includes(tag)) tag = tage[0];
  $("fest-name").textContent = fest.name || "Programm";
  $("fest-datum").textContent = fest.datum || "";
  $("fest-infos").textContent = fest.infos || "";
  $("tage").innerHTML = tage.length > 1 ? tage.map((t) => '<button data-tag="' + esc(t) + '" class="min-h-[36px] rounded-full border border-border px-3 text-xs font-medium ' + (t === tag ? 'bg-primary text-primary-foreground' : 'text-foreground') + '">' + esc(t) + '</button>').join("") : "";
  const liste = programm.filter((p) => p.tag === tag).sort((a, b) => minuten(a.beginn) - minuten(b.beginn));
  $("liste").innerHTML = liste.map(karte).join("");
  const meine = programm.filter((p) => stars.includes(p.id));
  $("meine").innerHTML = meine.length ? meine.map(karte).join("") : '<div class="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Tippe beim Programm auf den Stern, dann erscheint der Punkt hier.</div>';
  const now = new Date();
  const heuteName = now.toLocaleDateString("de-DE", { weekday: "long" });
  const m = now.getHours() * 60 + now.getMinutes();
  const laeuft = jetztDemo ? programm[0] : programm.find((p) => p.tag === heuteName && minuten(p.beginn) <= m && m < minuten(p.ende || p.beginn));
  $("jetzt").classList.toggle("hidden", !laeuft);
  if (laeuft) $("jetzt").innerHTML = '<p class="text-xs font-medium opacity-80">Läuft gerade</p><p class="mt-0.5 font-heading text-lg font-semibold">' + esc(laeuft.titel) + '</p><p class="text-sm opacity-90">' + esc(laeuft.ort) + ' · bis ' + esc(laeuft.ende) + '</p>';
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tag]");
  if (t) { tag = t.dataset.tag; render(); return; }
  const s = e.target.closest("[data-star]");
  if (s) {
    const id = s.dataset.star;
    stars = stars.includes(id) ? stars.filter((x) => x !== id) : stars.concat(id);
    try { sdk.haptics.selection(); } catch {}
    sdk.track("programm_merken", { id });
    saveUser("plan", stars);
    render();
  }
});
$("teilen").addEventListener("click", async () => {
  try { await sdk.actions.share({ text: "Das Programm: " + (fest.name || "unser Fest") }); } catch {}
});

async function init() {
  if (pv && pv.screen) showScreen(pv.screen);
  if (pv && pv.state) {
    if (pv.state === "jetzt") jetztDemo = true;
    if (pv.state === "gefuellt") stars = ["p1", "p3"];
    render();
    sdk.actions.ready().catch(() => {});
    return;
  }
  render();
  sdk.actions.ready().catch(() => {});
  const [p, f, s] = await Promise.all([content("programm", DEFAULT_PROGRAMM), content("fest", DEFAULT_FEST), userState("plan", [])]);
  programm = Array.isArray(p) ? p : DEFAULT_PROGRAMM;
  fest = f && typeof f === "object" ? f : DEFAULT_FEST;
  stars = Array.isArray(s) ? s : [];
  render();
}
init();
`;

export const festprogramm: MiniAppTemplate = {
  id: "festprogramm",
  title: "Festprogramm",
  summary: "Programm für Stadtfest, Turnier oder Konzertabend: Zeitplan pro Tag, „Läuft gerade“, eigener Plan mit Stern und alle Infos vor Ort.",
  group: "veranstaltung",
  manifest: {
    name: "Festprogramm",
    description: "Das ganze Programm mit Zeiten, Orten und deinem eigenen Plan.",
    category: "culture",
    tags: ["fest", "programm", "veranstaltung"],
    permissions: ["share"],
  },
  cms: [
    { key: "programm", beschreibung: "Programmpunkte (Tag, Beginn, Ende, Titel, Ort, Beschreibung)", beispiel: PROGRAMM },
    { key: "fest", beschreibung: "Name, Datum und Infos vor Ort", beispiel: FEST },
  ],
  suggestions: ["Füge einen Lageplan hinzu", "Schicke eine Erinnerung vor gemerkten Punkten", "Füge Sponsoren hinzu"],
  thumbnailSvg: THUMBS.festprogramm,
  html: templateDocument({
    title: "Festprogramm",
    body,
    script,
    notes: "Vorlage Festprogramm: Zeitplan pro Tag mit „Läuft gerade“, eigener Plan mit Stern, Infos vor Ort. Inhalte „programm“ und „fest“ sind im Dashboard pflegbar.",
  }),
};
