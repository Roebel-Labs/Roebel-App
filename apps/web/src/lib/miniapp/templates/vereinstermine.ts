import { bottomNav, SCRIPT_HELPERS, templateDocument, type MiniAppTemplate } from "./types";

const TERMINE = [
  { id: "t1", titel: "Training Jugend", datum: "2026-12-01", uhrzeit: "17:00", ort: "Sporthalle Röbel", gruppe: "Jugend", hinweis: "Hallenschuhe mitbringen" },
  { id: "t2", titel: "Training Erwachsene", datum: "2026-12-01", uhrzeit: "19:00", ort: "Sporthalle Röbel", gruppe: "Erwachsene", hinweis: "" },
  { id: "t3", titel: "Weihnachtsfeier", datum: "2026-12-13", uhrzeit: "18:00", ort: "Vereinsheim", gruppe: "Alle", hinweis: "Bitte Salat oder Kuchen mitbringen" },
  { id: "t4", titel: "Jahreshauptversammlung", datum: "2027-01-17", uhrzeit: "15:00", ort: "Vereinsheim", gruppe: "Alle", hinweis: "Tagesordnung folgt" },
];

const VEREIN = {
  name: "SV Röbel 1920",
  text: "Training, Treffen und alles, was im Verein ansteht.",
  kontakt: "Vorstand: vorstand@sv-roebel.example",
};

const body = `
<main class="mx-auto max-w-md p-4 pb-[calc(5rem+var(--safe-bottom))]">
  <section data-screen="termine" data-title="Termine" data-states="geladen,leer" class="active">
    <h1 id="verein-name" class="font-heading text-xl font-bold">Termine</h1>
    <p id="verein-text" class="mt-1 text-sm text-muted-foreground"></p>
    <div id="filter" class="mt-4 flex gap-2 overflow-x-auto pb-1"></div>
    <div id="liste" class="mt-3 space-y-3"></div>
  </section>
  <section data-screen="merkliste" data-title="Merkliste" data-states="gefuellt,leer">
    <h1 class="font-heading text-xl font-bold">Meine Termine</h1>
    <p class="mt-1 text-sm text-muted-foreground">Termine, die du dir gemerkt hast.</p>
    <div id="gemerkt" class="mt-4 space-y-3"></div>
  </section>
  <section data-screen="verein" data-title="Verein">
    <h1 class="font-heading text-xl font-bold">Über uns</h1>
    <div class="mt-4 rounded border border-border bg-card p-4">
      <p id="info-name" class="font-heading text-lg font-semibold"></p>
      <p id="info-text" class="mt-1 text-sm text-muted-foreground"></p>
      <p id="info-kontakt" class="mt-3 text-sm"></p>
    </div>
    <button id="teilen" class="mt-4 w-full rounded border border-border px-4 py-2.5 text-sm text-foreground">App teilen</button>
  </section>
</main>
${bottomNav(
  [
    { screen: "termine", label: "Termine" },
    { screen: "merkliste", label: "Merkliste" },
    { screen: "verein", label: "Verein" },
  ],
  "termine",
)}`;

const script = `
${SCRIPT_HELPERS}
const DEFAULT_TERMINE = ${JSON.stringify(TERMINE)};
const DEFAULT_VEREIN = ${JSON.stringify(VEREIN)};
let termine = DEFAULT_TERMINE;
let verein = DEFAULT_VEREIN;
let gemerkt = [];
let gruppe = "Alle";

function datumText(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" });
}
function karte(t) {
  const on = gemerkt.includes(t.id);
  return '<article class="rounded border border-border bg-card p-4">' +
    '<div class="flex items-start justify-between gap-3"><div>' +
    '<p class="text-xs text-muted-foreground">' + esc(datumText(t.datum)) + ' · ' + esc(t.uhrzeit) + ' Uhr</p>' +
    '<h2 class="mt-0.5 font-heading text-base font-semibold">' + esc(t.titel) + '</h2>' +
    '<p class="text-sm text-muted-foreground">' + esc(t.ort) + (t.gruppe && t.gruppe !== "Alle" ? ' · ' + esc(t.gruppe) : '') + '</p>' +
    (t.hinweis ? '<p class="mt-2 text-sm">' + esc(t.hinweis) + '</p>' : '') +
    '</div><button data-merken="' + esc(t.id) + '" aria-pressed="' + on + '" class="min-h-[44px] shrink-0 rounded border border-border px-3 text-xs font-medium ' + (on ? 'bg-primary text-primary-foreground' : 'text-foreground') + '">' + (on ? 'Gemerkt' : 'Merken') + '</button></div></article>';
}
function leer(text) {
  return '<div class="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">' + esc(text) + '</div>';
}
function render() {
  $("verein-name").textContent = verein.name || "Termine";
  $("verein-text").textContent = verein.text || "";
  $("info-name").textContent = verein.name || "";
  $("info-text").textContent = verein.text || "";
  $("info-kontakt").textContent = verein.kontakt || "";
  const gruppen = ["Alle"].concat(Array.from(new Set(termine.map((t) => t.gruppe).filter((g) => g && g !== "Alle"))));
  $("filter").innerHTML = gruppen.map((g) => '<button data-gruppe="' + esc(g) + '" class="min-h-[36px] shrink-0 rounded-full border border-border px-3 text-xs font-medium ' + (g === gruppe ? 'bg-primary text-primary-foreground' : 'text-foreground') + '">' + esc(g) + '</button>').join("");
  const heute = new Date().toISOString().slice(0, 10);
  const sichtbar = termine
    .filter((t) => t.datum >= heute || pv)
    .filter((t) => gruppe === "Alle" || t.gruppe === gruppe || t.gruppe === "Alle")
    .sort((a, b) => (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit));
  $("liste").innerHTML = sichtbar.length ? sichtbar.map(karte).join("") : leer("Gerade stehen keine Termine an.");
  const meine = termine.filter((t) => gemerkt.includes(t.id));
  $("gemerkt").innerHTML = meine.length ? meine.map(karte).join("") : leer("Tippe bei einem Termin auf „Merken“, dann findest du ihn hier.");
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-gruppe]");
  if (g) { gruppe = g.dataset.gruppe; render(); return; }
  const m = e.target.closest("[data-merken]");
  if (m) {
    const id = m.dataset.merken;
    gemerkt = gemerkt.includes(id) ? gemerkt.filter((x) => x !== id) : gemerkt.concat(id);
    try { sdk.haptics.selection(); } catch {}
    sdk.track("termin_merken", { id });
    saveUser("merkliste", gemerkt);
    render();
  }
});
$("teilen").addEventListener("click", async () => {
  try { await sdk.actions.share({ text: (verein.name || "Unser Verein") + ": alle Termine in einer App" }); } catch {}
});

async function init() {
  if (pv && pv.screen) showScreen(pv.screen);
  if (pv && pv.state) {
    if (pv.state === "leer") termine = [];
    if (pv.state === "gefuellt") gemerkt = DEFAULT_TERMINE.slice(0, 2).map((t) => t.id);
    render();
    sdk.actions.ready().catch(() => {});
    return;
  }
  render();
  sdk.actions.ready().catch(() => {});
  const [t, v, g] = await Promise.all([content("termine", DEFAULT_TERMINE), content("verein", DEFAULT_VEREIN), userState("merkliste", [])]);
  termine = Array.isArray(t) ? t : DEFAULT_TERMINE;
  verein = v && typeof v === "object" ? v : DEFAULT_VEREIN;
  gemerkt = Array.isArray(g) ? g : [];
  render();
}
init();
`;

export const vereinstermine: MiniAppTemplate = {
  id: "vereinstermine",
  title: "Termine & Training",
  summary: "Trainingszeiten, Feiern und Versammlungen deines Vereins an einem Ort. Mitglieder filtern nach Gruppe und merken sich Termine.",
  group: "verein",
  recommended: true,
  manifest: {
    name: "Vereinstermine",
    description: "Alle Termine, Trainings und Treffen unseres Vereins.",
    category: "community",
    tags: ["verein", "termine", "training"],
    permissions: ["share"],
  },
  cms: [
    { key: "termine", beschreibung: "Alle Termine (Titel, Datum JJJJ-MM-TT, Uhrzeit, Ort, Gruppe, Hinweis)", beispiel: TERMINE },
    { key: "verein", beschreibung: "Name, Kurztext und Kontakt des Vereins", beispiel: VEREIN },
  ],
  suggestions: [
    "Füge eine Zusage-Funktion hinzu",
    "Zeige die Termine als Monatskalender",
    "Ändere die Gruppen auf unsere Mannschaften",
  ],
  thumbnailSvg: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="180" fill="#E5ECF3"/><rect x="100" y="34" width="120" height="116" rx="12" fill="#fff"/><rect x="100" y="34" width="120" height="28" rx="12" fill="#00498B"/><rect x="100" y="50" width="120" height="12" fill="#00498B"/><rect x="124" y="24" width="8" height="20" rx="4" fill="#051433"/><rect x="188" y="24" width="8" height="20" rx="4" fill="#051433"/><g fill="#BCDDF9"><rect x="114" y="76" width="18" height="16" rx="4"/><rect x="140" y="76" width="18" height="16" rx="4"/><rect x="166" y="76" width="18" height="16" rx="4"/><rect x="192" y="76" width="14" height="16" rx="4"/><rect x="114" y="100" width="18" height="16" rx="4"/><rect x="166" y="100" width="18" height="16" rx="4"/><rect x="192" y="100" width="14" height="16" rx="4"/><rect x="114" y="124" width="18" height="16" rx="4"/><rect x="140" y="124" width="18" height="16" rx="4"/></g><rect x="140" y="100" width="18" height="16" rx="4" fill="#FDC705"/></svg>`,
  html: templateDocument({
    title: "Vereinstermine",
    body,
    script,
    notes: "Vorlage Termine & Training: Termine mit Gruppenfilter, Merkliste pro Mitglied, Vereinsinfo. Inhalte „termine“ und „verein“ sind im Dashboard pflegbar.",
  }),
};
