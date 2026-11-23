import { bottomNav, SCRIPT_HELPERS, templateDocument, type MiniAppTemplate } from "./types";

const GERICHTE = [
  { tag: "Montag", name: "Kartoffelsuppe mit Bockwurst", beschreibung: "Hausgemacht, mit frischem Brot", preis: "6,90", vegetarisch: false },
  { tag: "Montag", name: "Gemüsepfanne mit Reis", beschreibung: "Saisonales Gemüse aus der Region", preis: "7,50", vegetarisch: true },
  { tag: "Dienstag", name: "Schnitzel mit Bratkartoffeln", beschreibung: "Dazu Gurkensalat", preis: "9,90", vegetarisch: false },
  { tag: "Mittwoch", name: "Müritz-Fisch mit Petersilienkartoffeln", beschreibung: "Fang des Tages", preis: "11,50", vegetarisch: false },
  { tag: "Donnerstag", name: "Käsespätzle", beschreibung: "Mit Röstzwiebeln und Salat", preis: "8,50", vegetarisch: true },
  { tag: "Freitag", name: "Matjes nach Hausfrauenart", beschreibung: "Mit Pellkartoffeln", preis: "9,50", vegetarisch: false },
];

const BETRIEB = {
  name: "Gasthaus am Hafen",
  oeffnungszeiten: "Mo–Fr 11:30–14:00 Uhr",
  telefon: "+49 39931 00000",
  adresse: "Hafenstraße 1, 17207 Röbel/Müritz",
  hinweis: "Alle Gerichte auch zum Mitnehmen.",
};

const TAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const body = `
<main class="mx-auto max-w-md p-4 pb-[calc(5rem+var(--safe-bottom))]">
  <section data-screen="karte" data-title="Wochenkarte" data-states="geladen,leer" class="active">
    <p id="betrieb-name" class="text-xs font-medium text-muted-foreground"></p>
    <h1 class="font-heading text-xl font-bold">Wochenkarte</h1>
    <div id="tage" class="mt-4 flex gap-2 overflow-x-auto pb-1"></div>
    <label class="mt-3 flex min-h-[44px] items-center gap-2 text-sm"><input id="veggie" type="checkbox" class="h-4 w-4 accent-[var(--primary)]"> Nur vegetarisch</label>
    <div id="gerichte" class="mt-2 space-y-3"></div>
  </section>
  <section data-screen="info" data-title="Info">
    <h1 class="font-heading text-xl font-bold">So findest du uns</h1>
    <div class="mt-4 space-y-3 rounded border border-border bg-card p-4 text-sm">
      <div><p class="text-xs text-muted-foreground">Öffnungszeiten</p><p id="oeffnung"></p></div>
      <div><p class="text-xs text-muted-foreground">Adresse</p><p id="adresse"></p></div>
      <p id="hinweis" class="text-muted-foreground"></p>
    </div>
    <button id="anrufen" class="mt-4 w-full rounded bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Anrufen und vorbestellen</button>
    <button id="karte-teilen" class="mt-3 w-full rounded border border-border px-4 py-2.5 text-sm text-foreground">Wochenkarte teilen</button>
  </section>
</main>
${bottomNav(
  [
    { screen: "karte", label: "Wochenkarte" },
    { screen: "info", label: "Info" },
  ],
  "karte",
)}`;

const script = `
${SCRIPT_HELPERS}
const TAGE = ${JSON.stringify(TAGE)};
const DEFAULT_GERICHTE = ${JSON.stringify(GERICHTE)};
const DEFAULT_BETRIEB = ${JSON.stringify(BETRIEB)};
let gerichte = DEFAULT_GERICHTE;
let betrieb = DEFAULT_BETRIEB;
let tag = TAGE[(new Date().getDay() + 6) % 7];
let nurVeggie = false;

function render() {
  const tageMitEssen = TAGE.filter((t) => gerichte.some((g) => g.tag === t));
  if (!tageMitEssen.includes(tag)) tag = tageMitEssen[0] || tag;
  $("betrieb-name").textContent = betrieb.name || "";
  $("tage").innerHTML = tageMitEssen.map((t) => '<button data-tag="' + esc(t) + '" class="min-h-[36px] shrink-0 rounded-full border border-border px-3 text-xs font-medium ' + (t === tag ? 'bg-primary text-primary-foreground' : 'text-foreground') + '">' + esc(t.slice(0, 2)) + '</button>').join("");
  const liste = gerichte.filter((g) => g.tag === tag && (!nurVeggie || g.vegetarisch));
  $("gerichte").innerHTML = liste.length
    ? liste.map((g) => '<article class="rounded border border-border bg-card p-4"><div class="flex items-start justify-between gap-3"><div><h2 class="font-heading text-base font-semibold">' + esc(g.name) + '</h2><p class="mt-0.5 text-sm text-muted-foreground">' + esc(g.beschreibung) + '</p>' + (g.vegetarisch ? '<span class="mt-2 inline-block rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">vegetarisch</span>' : '') + '</div><p class="shrink-0 font-mono text-base font-semibold tabular-nums">' + esc(g.preis) + ' €</p></div></article>').join("")
    : '<div class="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Für diesen Tag steht noch nichts auf der Karte.</div>';
  $("oeffnung").textContent = betrieb.oeffnungszeiten || "";
  $("adresse").textContent = betrieb.adresse || "";
  $("hinweis").textContent = betrieb.hinweis || "";
  $("anrufen").hidden = !betrieb.telefon;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tag]");
  if (t) { tag = t.dataset.tag; sdk.track("tag_waehlen", { tag }); render(); }
});
$("veggie").addEventListener("change", (e) => { nurVeggie = e.target.checked; render(); });
$("anrufen").addEventListener("click", async () => {
  sdk.track("anrufen");
  try { await sdk.actions.openUrl("tel:" + String(betrieb.telefon).replace(/\\s+/g, "")); } catch {}
});
$("karte-teilen").addEventListener("click", async () => {
  try { await sdk.actions.share({ text: "Die Wochenkarte von " + (betrieb.name || "uns") }); } catch {}
});

async function init() {
  if (pv && pv.screen) showScreen(pv.screen);
  if (pv && pv.state) {
    if (pv.state === "leer") gerichte = [];
    render();
    sdk.actions.ready().catch(() => {});
    return;
  }
  render();
  sdk.actions.ready().catch(() => {});
  const [g, b] = await Promise.all([content("gerichte", DEFAULT_GERICHTE), content("betrieb", DEFAULT_BETRIEB)]);
  gerichte = Array.isArray(g) ? g : DEFAULT_GERICHTE;
  betrieb = b && typeof b === "object" ? b : DEFAULT_BETRIEB;
  render();
}
init();
`;

export const wochenkarte: MiniAppTemplate = {
  id: "wochenkarte",
  title: "Wochenkarte",
  summary: "Mittagstisch für Gasthaus, Kantine oder Imbiss: Gerichte pro Tag, vegetarischer Filter, Anrufen zum Vorbestellen.",
  group: "betrieb",
  recommended: true,
  manifest: {
    name: "Wochenkarte",
    description: "Unser Mittagstisch für die ganze Woche.",
    category: "utility",
    tags: ["mittagstisch", "essen", "gastronomie"],
    permissions: ["share"],
  },
  cms: [
    { key: "gerichte", beschreibung: "Gerichte der Woche (Tag, Name, Beschreibung, Preis, vegetarisch)", beispiel: GERICHTE },
    { key: "betrieb", beschreibung: "Name, Öffnungszeiten, Telefon, Adresse, Hinweis", beispiel: BETRIEB },
  ],
  suggestions: ["Füge Fotos zu den Gerichten hinzu", "Zeige Allergene an", "Füge eine Getränkekarte hinzu"],
  thumbnailSvg: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="180" fill="#FFF4CD"/><rect x="96" y="26" width="128" height="128" rx="12" fill="#fff"/><rect x="112" y="42" width="64" height="10" rx="5" fill="#051433"/><g fill="#E5ECF3"><rect x="112" y="66" width="96" height="18" rx="6"/><rect x="112" y="92" width="96" height="18" rx="6"/><rect x="112" y="118" width="96" height="18" rx="6"/></g><g fill="#00498B"><rect x="186" y="71" width="16" height="8" rx="4"/><rect x="186" y="97" width="16" height="8" rx="4"/><rect x="186" y="123" width="16" height="8" rx="4"/></g><circle cx="232" cy="46" r="18" fill="#FDC705"/><path d="M224 46h16M232 38v16" stroke="#051433" stroke-width="3" stroke-linecap="round"/></svg>`,
  html: templateDocument({
    title: "Wochenkarte",
    body,
    script,
    notes: "Vorlage Wochenkarte: Gerichte pro Wochentag mit Vegetarisch-Filter, Info-Seite mit Anrufen und Teilen. Inhalte „gerichte“ und „betrieb“ sind im Dashboard pflegbar.",
  }),
};
