import { bottomNav, SCRIPT_HELPERS, templateDocument, type MiniAppTemplate } from "./types";
import { THUMBS } from "./thumbs";

const RAEUME = [
  { id: "gruppenraum", name: "Gruppenraum", beschreibung: "Für Treffen, Workshops und Hausaufgabenhilfe", plaetze: 12 },
  { id: "musikraum", name: "Musikraum", beschreibung: "Schlagzeug, Verstärker, Mikrofone", plaetze: 6 },
  { id: "kueche", name: "Küche", beschreibung: "Zum gemeinsamen Kochen und Backen", plaetze: 8 },
];

const ZEITEN = {
  von: "14:00",
  bis: "20:00",
  dauerMinuten: 60,
  wochentage: [1, 2, 3, 4, 5],
  tageImVoraus: 14,
};

const HAUS = {
  name: "Jugendhaus Röbel",
  regeln: "Bitte hinterlasse den Raum so, wie du ihn vorgefunden hast. Kannst du nicht kommen, storniere deine Buchung, damit andere den Raum nutzen können.",
  kontakt: "Fragen? Sprich uns im Haus an oder schreib an jugendhaus@example.de.",
};

const body = `
<main class="mx-auto max-w-md p-4 pb-[calc(5rem+var(--safe-bottom))]">
  <section data-screen="buchen" data-title="Buchen" data-states="frei,belegt,gebucht" class="active">
    <p id="haus-name" class="text-xs font-medium text-muted-foreground"></p>
    <h1 class="font-heading text-xl font-bold">Raum buchen</h1>
    <div id="raeume" class="mt-4 flex gap-2 overflow-x-auto pb-1"></div>
    <p id="raum-info" class="mt-2 text-sm text-muted-foreground"></p>
    <div id="tage" class="mt-4 flex gap-2 overflow-x-auto pb-1"></div>
    <div id="slots" class="mt-4 grid grid-cols-3 gap-2"></div>
    <p id="hinweis" class="mt-3 text-sm text-muted-foreground"></p>
  </section>
  <section data-screen="meine" data-title="Meine Buchungen" data-states="gefuellt,leer">
    <h1 class="font-heading text-xl font-bold">Meine Buchungen</h1>
    <div id="meine-liste" class="mt-4 space-y-3"></div>
  </section>
  <section data-screen="haus" data-title="Hausregeln">
    <h1 class="font-heading text-xl font-bold">Gut zu wissen</h1>
    <p id="regeln" class="mt-4 rounded border border-border bg-card p-4 text-sm"></p>
    <p id="kontakt" class="mt-3 text-sm text-muted-foreground"></p>
  </section>
</main>
<div id="sheet" class="pb-safe fixed inset-x-0 bottom-0 hidden rounded-t-lg border-t border-border bg-card p-4">
  <div class="mx-auto max-w-md">
    <p id="sheet-titel" class="font-heading text-lg font-semibold"></p>
    <label class="mt-3 block text-sm">Dein Name<input id="f-name" class="mt-1 min-h-[44px] w-full rounded border border-border bg-background px-3 text-sm" maxlength="60" /></label>
    <label class="mt-3 block text-sm">Wofür? (optional)<input id="f-zweck" class="mt-1 min-h-[44px] w-full rounded border border-border bg-background px-3 text-sm" maxlength="120" placeholder="z. B. Bandprobe" /></label>
    <p id="sheet-fehler" class="mt-2 hidden text-sm text-destructive"></p>
    <div class="mt-4 flex gap-2">
      <button id="abbrechen" class="flex-1 rounded border border-border px-4 py-2.5 text-sm text-foreground">Abbrechen</button>
      <button id="bestaetigen" class="flex-1 rounded bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Verbindlich buchen</button>
    </div>
  </div>
</div>
${bottomNav(
  [
    { screen: "buchen", label: "Buchen" },
    { screen: "meine", label: "Meine" },
    { screen: "haus", label: "Hausregeln" },
  ],
  "buchen",
)}`;

const script = `
${SCRIPT_HELPERS}
const DEFAULT_RAEUME = ${JSON.stringify(RAEUME)};
const DEFAULT_ZEITEN = ${JSON.stringify(ZEITEN)};
const DEFAULT_HAUS = ${JSON.stringify(HAUS)};
const buchungen = sdk.data.collection("buchungen");
let raeume = DEFAULT_RAEUME;
let zeiten = DEFAULT_ZEITEN;
let haus = DEFAULT_HAUS;
let raum = DEFAULT_RAEUME[0].id;
let tag = null;
let belegt = [];
let meine = [];
let gewaehlt = null;

const pad = (n) => String(n).padStart(2, "0");
const isoTag = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
function tageListe() {
  const out = [];
  const d = new Date();
  for (let i = 0; out.length < 10 && i < (zeiten.tageImVoraus || 14); i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    if ((zeiten.wochentage || [1, 2, 3, 4, 5]).includes(((x.getDay() + 6) % 7) + 1)) out.push(x);
  }
  return out;
}
function slots() {
  const toMin = (s) => Number(s.split(":")[0]) * 60 + Number(s.split(":")[1] || 0);
  const out = [];
  for (let m = toMin(zeiten.von); m + zeiten.dauerMinuten <= toMin(zeiten.bis); m += zeiten.dauerMinuten) out.push(pad(Math.floor(m / 60)) + ":" + pad(m % 60));
  return out;
}
const slotKey = (r, t, z) => r + "|" + t + "|" + z;
const raumName = (id) => (raeume.find((r) => r.id === id) || {}).name || id;
function tagText(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}

function renderBuchen() {
  $("haus-name").textContent = haus.name || "";
  $("raeume").innerHTML = raeume.map((r) => '<button data-raum="' + esc(r.id) + '" class="min-h-[36px] shrink-0 rounded-full border border-border px-3 text-xs font-medium ' + (r.id === raum ? "bg-primary text-primary-foreground" : "text-foreground") + '">' + esc(r.name) + "</button>").join("");
  const r = raeume.find((x) => x.id === raum);
  $("raum-info").textContent = r ? r.beschreibung + (r.plaetze ? " · bis " + r.plaetze + " Personen" : "") : "";
  const tage = tageListe();
  if (!tag || !tage.some((d) => isoTag(d) === tag)) tag = tage.length ? isoTag(tage[0]) : null;
  $("tage").innerHTML = tage.map((d) => { const t = isoTag(d); return '<button data-tag="' + t + '" class="min-h-[44px] shrink-0 rounded border border-border px-3 text-xs font-medium ' + (t === tag ? "bg-primary text-primary-foreground" : "text-foreground") + '">' + esc(tagText(t)) + "</button>"; }).join("");
  const jetzt = new Date();
  $("slots").innerHTML = tag ? slots().map((z) => {
    const b = belegt.find((x) => x.key === slotKey(raum, tag, z));
    const vorbei = new Date(tag + "T" + z + ":00") < jetzt;
    let cls = "border-border text-foreground";
    let label = z;
    if (b && b.mine) { cls = "border-primary bg-primary text-primary-foreground"; label = z + " · deins"; }
    else if (b) { cls = "border-border bg-card text-muted-foreground line-through"; }
    else if (vorbei) { cls = "border-border text-muted-foreground opacity-50"; }
    return '<button data-slot="' + z + '" ' + (b || vorbei ? "disabled" : "") + ' class="min-h-[48px] rounded border text-sm font-medium tabular-nums ' + cls + '">' + esc(label) + "</button>";
  }).join("") : "";
  $("hinweis").textContent = tag ? "Durchgestrichene Zeiten sind schon gebucht." : "In den nächsten Tagen ist das Haus geschlossen.";
}
function renderMeine() {
  const liste = meine.slice().sort((a, b) => String(a.key).localeCompare(String(b.key)));
  $("meine-liste").innerHTML = liste.length
    ? liste.map((b) => { const p = String(b.key).split("|"); return '<article class="flex items-center justify-between gap-3 rounded border border-border bg-card p-4"><div><p class="font-heading text-base font-semibold">' + esc(raumName(p[0])) + '</p><p class="text-sm text-muted-foreground">' + esc(tagText(p[1])) + " · " + esc(p[2]) + " Uhr" + (b.privateData && b.privateData.zweck ? " · " + esc(b.privateData.zweck) : "") + '</p></div><button data-storno="' + esc(b.id) + '" class="min-h-[44px] shrink-0 rounded border border-border px-3 text-xs font-medium text-destructive">Stornieren</button></article>'; }).join("")
    : '<div class="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Du hast gerade keine Buchung. Wähle unter „Buchen“ einen Raum und eine Zeit.</div>';
}
function renderHaus() {
  $("regeln").textContent = haus.regeln || "";
  $("kontakt").textContent = haus.kontakt || "";
}
function render() { renderBuchen(); renderMeine(); renderHaus(); }

async function laden() {
  if (!tag) return;
  try {
    const r = await buchungen.list({ keyPrefix: raum + "|" + tag + "|", order: "key", limit: 200 });
    belegt = r.rows;
  } catch { belegt = []; }
  try {
    const m = await buchungen.list({ mine: true, order: "key", limit: 100 });
    const heute = isoTag(new Date());
    meine = m.rows.filter((b) => String(b.key).split("|")[1] >= heute);
  } catch { meine = []; }
  render();
}

function sheet(open) {
  $("sheet").classList.toggle("hidden", !open);
  $("sheet-fehler").classList.add("hidden");
  if (open) $("sheet-titel").textContent = raumName(raum) + " · " + tagText(tag) + " · " + gewaehlt + " Uhr";
}
document.addEventListener("click", async (e) => {
  const r = e.target.closest("[data-raum]");
  if (r) { raum = r.dataset.raum; await laden(); return; }
  const t = e.target.closest("[data-tag]");
  if (t) { tag = t.dataset.tag; await laden(); return; }
  const s = e.target.closest("[data-slot]");
  if (s && !s.disabled) { gewaehlt = s.dataset.slot; sheet(true); $("f-name").focus(); return; }
  const st = e.target.closest("[data-storno]");
  if (st) {
    st.disabled = true;
    try { await buchungen.remove(st.dataset.storno); sdk.track("storniert"); } catch {}
    await laden();
  }
});
$("abbrechen").addEventListener("click", () => sheet(false));
$("bestaetigen").addEventListener("click", async () => {
  const name = $("f-name").value.trim();
  if (!name) { $("sheet-fehler").textContent = "Bitte gib deinen Namen an."; $("sheet-fehler").classList.remove("hidden"); return; }
  const btn = $("bestaetigen");
  btn.disabled = true;
  try {
    await buchungen.add({
      key: slotKey(raum, tag, gewaehlt),
      data: { raum, tag, zeit: gewaehlt },
      privateData: { name, zweck: $("f-zweck").value.trim() },
    });
    try { sdk.haptics.notification("success"); } catch {}
    sdk.track("gebucht", { raum });
    sheet(false);
  } catch (err) {
    const code = err && err.code;
    $("sheet-fehler").textContent = code === "conflict" ? "Diese Zeit wurde gerade gebucht. Wähle bitte eine andere."
      : code === "unauthorized" ? "Bitte melde dich in der Röbel App an, um zu buchen."
      : code === "unsupported" ? "Buchen geht mit der aktuellen Röbel App."
      : "Das hat nicht geklappt. Bitte versuch es noch einmal.";
    $("sheet-fehler").classList.remove("hidden");
  } finally {
    btn.disabled = false;
    await laden();
  }
});

async function init() {
  if (pv && pv.screen) showScreen(pv.screen);
  if (pv && pv.state) {
    tag = isoTag(tageListe()[0] || new Date());
    const z = slots();
    if (pv.state === "belegt" || pv.state === "gebucht") belegt = [{ key: slotKey(raum, tag, z[1]), mine: false }, { key: slotKey(raum, tag, z[3]), mine: pv.state === "gebucht" }];
    if (pv.state === "gefuellt") meine = [{ id: "demo", key: slotKey(raum, tag, z[2]), privateData: { zweck: "Bandprobe" } }];
    render();
    sdk.actions.ready().catch(() => {});
    return;
  }
  render();
  sdk.actions.ready().catch(() => {});
  try {
    const ctx = await sdk.getContext();
    if (ctx.user && ctx.user.displayName && !$("f-name").value) $("f-name").value = ctx.user.displayName;
  } catch {}
  const [r, z, h] = await Promise.all([content("raeume", DEFAULT_RAEUME), content("zeiten", DEFAULT_ZEITEN), content("haus", DEFAULT_HAUS)]);
  raeume = Array.isArray(r) && r.length ? r : DEFAULT_RAEUME;
  zeiten = z && typeof z === "object" ? Object.assign({}, DEFAULT_ZEITEN, z) : DEFAULT_ZEITEN;
  haus = h && typeof h === "object" ? h : DEFAULT_HAUS;
  if (!raeume.some((x) => x.id === raum)) raum = raeume[0].id;
  await laden();
}
init();
`;

export const raumbuchung: MiniAppTemplate = {
  id: "raumbuchung",
  title: "Raumbuchung",
  summary: "Räume, Geräte oder Termine buchen, zum Beispiel im Jugendhaus: freie Zeiten sehen, verbindlich buchen, stornieren. Doppelbuchungen verhindert der Server.",
  group: "gemeinde",
  recommended: true,
  manifest: {
    name: "Raumbuchung",
    description: "Freie Räume sehen und direkt buchen.",
    category: "utility",
    tags: ["buchung", "räume", "jugendhaus"],
    permissions: [],
  },
  cms: [
    { key: "raeume", beschreibung: "Buchbare Räume (id, Name, Beschreibung, Plätze)", beispiel: RAEUME },
    { key: "zeiten", beschreibung: "Buchbare Zeiten: von, bis, Dauer in Minuten, Wochentage (1 = Montag), Tage im Voraus", beispiel: ZEITEN },
    { key: "haus", beschreibung: "Name, Hausregeln, Kontakt", beispiel: HAUS },
  ],
  suggestions: ["Erlaube Buchungen nur für Mitglieder", "Zeige der Leitung eine Tagesübersicht", "Füge Geräte zum Ausleihen hinzu"],
  thumbnailSvg: THUMBS.raumbuchung,
  html: templateDocument({
    title: "Raumbuchung",
    body,
    script,
    notes: "Vorlage Raumbuchung: Räume und Zeiten als Inhalte, Buchungen in der geteilten Sammlung „buchungen“ (Schlüssel Raum|Tag|Zeit, damit keine Doppelbuchung), Name und Zweck nur für Buchende und Betreiber:in sichtbar, Stornieren unter „Meine“.",
  }),
};
