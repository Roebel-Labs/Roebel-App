import { bottomNav, SCRIPT_HELPERS, templateDocument, type MiniAppTemplate } from "./types";
import { THUMBS } from "./thumbs";

const THEMEN = [
  { kategorie: "Abfall", frage: "Wann wird der Sperrmüll abgeholt?", antwort: "Sperrmüll holt der Entsorger auf Anmeldung ab. Die Karte liegt dem Abfallkalender bei oder wird online bestellt." },
  { kategorie: "Abfall", frage: "Wo bekomme ich gelbe Säcke?", antwort: "Gelbe Säcke gibt es im Bürgerbüro und in vielen Geschäften der Stadt." },
  { kategorie: "Bürgerbüro", frage: "Wie beantrage ich einen Personalausweis?", antwort: "Persönlich im Bürgerbüro mit biometrischem Passfoto und dem alten Ausweis. Bitte vorher einen Termin vereinbaren." },
  { kategorie: "Bürgerbüro", frage: "Wie melde ich meinen Wohnsitz um?", antwort: "Innerhalb von zwei Wochen nach dem Umzug im Bürgerbüro, mit Ausweis und Wohnungsgeberbestätigung." },
  { kategorie: "Kita & Schule", frage: "Wie melde ich mein Kind in der Kita an?", antwort: "Den Antrag auf einen Kita-Platz stellt man beim Landkreis, die Kita selbst hilft gern weiter." },
];

const AMT = {
  name: "Bürgerinfo Röbel",
  oeffnungszeiten: "Di 9–12 und 14–18 Uhr, Do 9–12 Uhr",
  telefon: "+49 39931 00000",
  email: "buergerbuero@example.de",
  adresse: "Marktplatz 1, 17207 Röbel/Müritz",
};

const body = `
<main class="mx-auto max-w-md p-4 pb-[calc(5rem+var(--safe-bottom))]">
  <section data-screen="fragen" data-title="Fragen" data-states="alle,keine-treffer" class="active">
    <h1 id="amt-name" class="font-heading text-xl font-bold"></h1>
    <p class="mt-1 text-sm text-muted-foreground">Antworten auf häufige Fragen.</p>
    <input id="suche" type="search" placeholder="Suchen, z. B. Ausweis" class="mt-4 min-h-[44px] w-full rounded border border-border bg-background px-3 text-sm" />
    <div id="kategorien" class="mt-3 flex gap-2 overflow-x-auto pb-1"></div>
    <div id="liste" class="mt-3 space-y-2"></div>
  </section>
  <section data-screen="kontakt" data-title="Kontakt">
    <h1 class="font-heading text-xl font-bold">Kontakt</h1>
    <div class="mt-4 space-y-3 rounded border border-border bg-card p-4 text-sm">
      <div><p class="text-xs text-muted-foreground">Öffnungszeiten</p><p id="oeffnung"></p></div>
      <div><p class="text-xs text-muted-foreground">Adresse</p><p id="adresse"></p></div>
    </div>
    <button id="anrufen" class="mt-4 w-full rounded bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Anrufen</button>
    <button id="mailen" class="mt-3 w-full rounded border border-border px-4 py-2.5 text-sm text-foreground">E-Mail schreiben</button>
  </section>
</main>
${bottomNav(
  [
    { screen: "fragen", label: "Fragen" },
    { screen: "kontakt", label: "Kontakt" },
  ],
  "fragen",
)}`;

const script = `
${SCRIPT_HELPERS}
const DEFAULT_THEMEN = ${JSON.stringify(THEMEN)};
const DEFAULT_AMT = ${JSON.stringify(AMT)};
let themen = DEFAULT_THEMEN;
let amt = DEFAULT_AMT;
let kategorie = "Alle";
let suche = "";

function render() {
  $("amt-name").textContent = amt.name || "Bürgerinfo";
  const kats = ["Alle"].concat(Array.from(new Set(themen.map((t) => t.kategorie).filter(Boolean))));
  $("kategorien").innerHTML = kats.map((k) => '<button data-kat="' + esc(k) + '" class="min-h-[36px] shrink-0 rounded-full border border-border px-3 text-xs font-medium ' + (k === kategorie ? 'bg-primary text-primary-foreground' : 'text-foreground') + '">' + esc(k) + '</button>').join("");
  const q = suche.trim().toLowerCase();
  const liste = themen.filter((t) => (kategorie === "Alle" || t.kategorie === kategorie) && (!q || (t.frage + " " + t.antwort).toLowerCase().includes(q)));
  $("liste").innerHTML = liste.length
    ? liste.map((t) => '<details class="rounded border border-border bg-card p-4"><summary class="cursor-pointer list-none text-sm font-semibold">' + esc(t.frage) + '</summary><p class="mt-2 text-sm text-muted-foreground">' + esc(t.antwort) + '</p></details>').join("")
    : '<div class="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Dazu haben wir noch keine Antwort. Ruf uns gern an oder schreib uns.</div>';
  $("oeffnung").textContent = amt.oeffnungszeiten || "";
  $("adresse").textContent = amt.adresse || "";
  $("anrufen").hidden = !amt.telefon;
  $("mailen").hidden = !amt.email;
}
document.addEventListener("click", (e) => {
  const k = e.target.closest("[data-kat]");
  if (k) { kategorie = k.dataset.kat; render(); }
});
document.addEventListener("toggle", (e) => {
  if (e.target.tagName === "DETAILS" && e.target.open) sdk.track("frage_geoeffnet");
}, true);
let timer = null;
$("suche").addEventListener("input", (e) => {
  suche = e.target.value;
  render();
  clearTimeout(timer);
  timer = setTimeout(() => { if (suche.trim()) sdk.track("suche", { q: suche.trim().slice(0, 40) }); }, 800);
});
$("anrufen").addEventListener("click", async () => { try { await sdk.actions.openUrl("tel:" + String(amt.telefon).replace(/\\s+/g, "")); } catch {} });
$("mailen").addEventListener("click", async () => { try { await sdk.actions.openUrl("mailto:" + amt.email); } catch {} });

async function init() {
  if (pv && pv.screen) showScreen(pv.screen);
  if (pv && pv.state) {
    if (pv.state === "keine-treffer") { suche = "Hundesteuer"; $("suche").value = suche; }
    render();
    sdk.actions.ready().catch(() => {});
    return;
  }
  render();
  sdk.actions.ready().catch(() => {});
  const [t, a] = await Promise.all([content("themen", DEFAULT_THEMEN), content("amt", DEFAULT_AMT)]);
  themen = Array.isArray(t) ? t : DEFAULT_THEMEN;
  amt = a && typeof a === "object" ? a : DEFAULT_AMT;
  render();
}
init();
`;

export const buergerinfo: MiniAppTemplate = {
  id: "buergerinfo",
  title: "Bürgerinfo",
  summary: "Häufige Fragen ans Amt mit Suche und Kategorien, dazu Öffnungszeiten, Anrufen und E-Mail. Passt auch für Kita, Schule oder Verein.",
  group: "gemeinde",
  manifest: {
    name: "Bürgerinfo",
    description: "Antworten auf häufige Fragen und der direkte Draht zu uns.",
    category: "utility",
    tags: ["amt", "fragen", "kontakt"],
    permissions: [],
  },
  cms: [
    { key: "themen", beschreibung: "Fragen und Antworten mit Kategorie", beispiel: THEMEN },
    { key: "amt", beschreibung: "Name, Öffnungszeiten, Telefon, E-Mail, Adresse", beispiel: AMT },
  ],
  suggestions: ["Füge Formulare zum Herunterladen hinzu", "Zeige wichtige Termine wie die Müllabfuhr", "Mach daraus eine Elterninfo für die Kita"],
  thumbnailSvg: THUMBS.buergerinfo,
  html: templateDocument({
    title: "Bürgerinfo",
    body,
    script,
    notes: "Vorlage Bürgerinfo: häufige Fragen mit Suche und Kategorien, Kontaktseite mit Anrufen und E-Mail. Inhalte „themen“ und „amt“ sind im Dashboard pflegbar.",
  }),
};
