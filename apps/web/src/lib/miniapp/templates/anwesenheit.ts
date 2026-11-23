import { bottomNav, SCRIPT_HELPERS, templateDocument, type MiniAppTemplate } from "./types";
import { THUMBS } from "./thumbs";

const EINHEITEN = [
  { id: "jugend-di", titel: "Training Jugend", wochentag: 2, von: "17:00", bis: "18:30", ort: "Sporthalle" },
  { id: "jugend-do", titel: "Training Jugend", wochentag: 4, von: "17:00", bis: "18:30", ort: "Sporthalle" },
  { id: "erwachsene-mi", titel: "Training Erwachsene", wochentag: 3, von: "19:00", bis: "20:30", ort: "Sporthalle" },
];

const REGELN = {
  name: "SV Röbel Anwesenheit",
  code: "",
  vorherMinuten: 30,
  text: "Melde dich beim Training mit „Ich bin da“ an. Wer regelmäßig dabei ist, bekommt am Saisonende ein Abzeichen.",
};

const body = `
<main class="mx-auto max-w-md p-4 pb-[calc(5rem+var(--safe-bottom))]">
  <section data-screen="heute" data-title="Heute" data-states="offen,angemeldet,keins" class="active">
    <p id="verein" class="text-xs font-medium text-muted-foreground"></p>
    <h1 class="font-heading text-xl font-bold">Anwesenheit</h1>
    <div id="karte" class="mt-4"></div>
  </section>
  <section data-screen="verlauf" data-title="Mein Verlauf" data-states="gefuellt,leer">
    <h1 class="font-heading text-xl font-bold">Mein Verlauf</h1>
    <div class="mt-4 rounded border border-border bg-card p-4">
      <p class="text-xs text-muted-foreground">Dabei in den letzten 90 Tagen</p>
      <p class="font-mono text-3xl font-semibold tabular-nums"><span id="anzahl">0</span>×</p>
    </div>
    <div id="liste" class="mt-4 space-y-2"></div>
  </section>
  <section data-screen="info" data-title="Info">
    <h1 class="font-heading text-xl font-bold">So funktioniert’s</h1>
    <p id="regeln" class="mt-4 rounded border border-border bg-card p-4 text-sm"></p>
    <div id="plan" class="mt-4 space-y-2"></div>
  </section>
</main>
${bottomNav(
  [
    { screen: "heute", label: "Heute" },
    { screen: "verlauf", label: "Verlauf" },
    { screen: "info", label: "Info" },
  ],
  "heute",
)}`;

const script = `
${SCRIPT_HELPERS}
const DEFAULT_EINHEITEN = ${JSON.stringify(EINHEITEN)};
const DEFAULT_REGELN = ${JSON.stringify(REGELN)};
const TAGE = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const checkins = sdk.data.collection("anwesenheit");
let einheiten = DEFAULT_EINHEITEN;
let regeln = DEFAULT_REGELN;
let meine = [];
let demo = null;

const pad = (n) => String(n).padStart(2, "0");
const isoTag = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const toMin = (s) => Number(String(s).split(":")[0]) * 60 + Number(String(s).split(":")[1] || 0);

/** The unit that is open right now (from "vorherMinuten" before start until the end), or the next one today. */
function aktuelle() {
  const now = new Date();
  const wt = ((now.getDay() + 6) % 7) + 1;
  const m = now.getHours() * 60 + now.getMinutes();
  const heute = einheiten.filter((e) => Number(e.wochentag) === wt);
  const offen = heute.find((e) => m >= toMin(e.von) - (regeln.vorherMinuten || 30) && m <= toMin(e.bis));
  if (offen) return { einheit: offen, offen: true };
  const spaeter = heute.filter((e) => toMin(e.von) > m).sort((a, b) => toMin(a.von) - toMin(b.von))[0];
  return spaeter ? { einheit: spaeter, offen: false } : null;
}
const keyFor = (e) => e.id + "|" + isoTag(new Date());

function renderHeute() {
  $("verein").textContent = regeln.name || "";
  const a = demo || aktuelle();
  if (!a) {
    $("karte").innerHTML = '<div class="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Heute ist kein Training mehr. Den Plan findest du unter „Info“.</div>';
    return;
  }
  const e = a.einheit;
  const dabei = meine.some((r) => r.key && r.key.startsWith(keyFor(e)));
  let aktion;
  if (dabei) aktion = '<p class="mt-4 rounded bg-success/10 px-4 py-3 text-sm font-medium text-success">✓ Du bist angemeldet. Viel Spaß!</p>';
  else if (!a.offen) aktion = '<p class="mt-4 text-sm text-muted-foreground">Die Anmeldung öffnet ' + (regeln.vorherMinuten || 30) + " Minuten vor Beginn.</p>";
  else aktion = (regeln.code ? '<label class="mt-4 block text-sm">Code vom Training<input id="code" inputmode="numeric" class="mt-1 min-h-[44px] w-full rounded border border-border bg-background px-3 text-sm" maxlength="12" /></label>' : "") +
    '<label class="mt-3 block text-sm">Dein Name<input id="name" class="mt-1 min-h-[44px] w-full rounded border border-border bg-background px-3 text-sm" maxlength="60" /></label>' +
    '<p id="fehler" class="mt-2 hidden text-sm text-destructive"></p>' +
    '<button id="dabei" class="mt-4 w-full rounded bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">Ich bin da</button>';
  $("karte").innerHTML = '<article class="rounded-lg border border-border bg-card p-5"><p class="text-xs text-muted-foreground">' + (a.offen ? "Jetzt" : "Heute") + " · " + esc(e.von) + "–" + esc(e.bis) + " Uhr · " + esc(e.ort || "") + '</p><h2 class="mt-1 font-heading text-lg font-semibold">' + esc(e.titel) + "</h2>" + aktion + "</article>";
  const n = $("name");
  if (n && window.__name) n.value = window.__name;
}
function renderVerlauf() {
  const grenze = isoTag(new Date(Date.now() - 90 * 86400000));
  const liste = meine.filter((r) => String(r.key).split("|")[1] >= grenze);
  $("anzahl").textContent = liste.length;
  $("liste").innerHTML = liste.length
    ? liste.map((r) => { const p = String(r.key).split("|"); const e = einheiten.find((x) => x.id === p[0]); return '<div class="flex justify-between rounded border border-border bg-card px-4 py-3 text-sm"><span>' + esc(e ? e.titel : p[0]) + '</span><span class="text-muted-foreground">' + esc(new Date(p[1] + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "short" })) + "</span></div>"; }).join("")
    : '<div class="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Noch keine Anmeldung. Beim nächsten Training einfach „Ich bin da“ tippen.</div>';
}
function renderInfo() {
  $("regeln").textContent = regeln.text || "";
  $("plan").innerHTML = einheiten.slice().sort((a, b) => a.wochentag - b.wochentag || toMin(a.von) - toMin(b.von)).map((e) => '<div class="rounded border border-border bg-card px-4 py-3 text-sm"><p class="font-medium">' + esc(e.titel) + '</p><p class="text-muted-foreground">' + esc(TAGE[e.wochentag] || "") + " · " + esc(e.von) + "–" + esc(e.bis) + " Uhr · " + esc(e.ort || "") + "</p></div>").join("");
}
function render() { renderHeute(); renderVerlauf(); renderInfo(); }

async function laden() {
  try {
    const r = await checkins.list({ mine: true, order: "newest", limit: 200 });
    meine = r.rows;
  } catch { meine = []; }
  render();
}

document.addEventListener("click", async (ev) => {
  if (!ev.target.closest("#dabei")) return;
  const a = aktuelle();
  const fehler = (t) => { $("fehler").textContent = t; $("fehler").classList.remove("hidden"); };
  if (!a || !a.offen) return fehler("Die Anmeldung ist gerade nicht offen.");
  if (regeln.code && String($("code").value).trim() !== String(regeln.code)) return fehler("Der Code stimmt nicht. Frag beim Training nach.");
  const name = $("name").value.trim();
  if (!name) return fehler("Bitte gib deinen Namen an.");
  const btn = $("dabei");
  btn.disabled = true;
  try {
    // One check-in per person and unit: the key carries a random part, "mine" is checked first.
    if (meine.some((r) => r.key && r.key.startsWith(keyFor(a.einheit)))) { await laden(); return; }
    await checkins.add({ key: keyFor(a.einheit) + "|" + crypto.randomUUID().slice(0, 8), data: { einheit: a.einheit.id, tag: isoTag(new Date()) }, privateData: { name } });
    try { sdk.haptics.notification("success"); } catch {}
    sdk.track("eingecheckt", { einheit: a.einheit.id });
    await laden();
  } catch (err) {
    btn.disabled = false;
    fehler(err && err.code === "unauthorized" ? "Bitte melde dich in der Röbel App an." : err && err.code === "unsupported" ? "Das geht mit der aktuellen Röbel App." : "Das hat nicht geklappt. Bitte versuch es noch einmal.");
  }
});

async function init() {
  if (pv && pv.screen) showScreen(pv.screen);
  if (pv && pv.state) {
    const e = einheiten[0];
    if (pv.state === "offen" || pv.state === "angemeldet") demo = { einheit: e, offen: true };
    if (pv.state === "keins") einheiten = [];
    if (pv.state === "angemeldet" || pv.state === "gefuellt") meine = [{ key: keyFor(e) + "|demo" }];
    render();
    sdk.actions.ready().catch(() => {});
    return;
  }
  render();
  sdk.actions.ready().catch(() => {});
  try { const ctx = await sdk.getContext(); if (ctx.user && ctx.user.displayName) window.__name = ctx.user.displayName; } catch {}
  const [e, r] = await Promise.all([content("einheiten", DEFAULT_EINHEITEN), content("regeln", DEFAULT_REGELN)]);
  einheiten = Array.isArray(e) ? e : DEFAULT_EINHEITEN;
  regeln = r && typeof r === "object" ? Object.assign({}, DEFAULT_REGELN, r) : DEFAULT_REGELN;
  await laden();
}
init();
`;

export const anwesenheit: MiniAppTemplate = {
  id: "anwesenheit",
  title: "Anwesenheit",
  summary: "Check-in für Training, Kurs oder Ehrenamt: Mitglieder tippen „Ich bin da“, sehen ihren Verlauf, die Leitung sieht in Studio, wer da war. Grundlage für Abzeichen.",
  group: "verein",
  manifest: {
    name: "Anwesenheit",
    description: "Beim Training anmelden und den eigenen Verlauf sehen.",
    category: "community",
    tags: ["verein", "training", "anwesenheit"],
    permissions: [],
  },
  cms: [
    { key: "einheiten", beschreibung: "Trainings / Kurse (id, Titel, Wochentag 1–7, von, bis, Ort)", beispiel: EINHEITEN },
    { key: "regeln", beschreibung: "Name, optionaler Check-in-Code, Minuten vor Beginn, Erklärtext", beispiel: REGELN },
  ],
  suggestions: ["Zeige die Anwesenheit der ganzen Gruppe", "Nur Mitglieder dürfen sich anmelden", "Füge einen Code hinzu, den die Trainerin zeigt"],
  thumbnailSvg: THUMBS.anwesenheit,
  html: templateDocument({
    title: "Anwesenheit",
    body,
    script,
    notes: "Vorlage Anwesenheit: Trainings als Inhalte (Wochentag, Zeiten, optionaler Code), Check-in in der geteilten Sammlung „anwesenheit“ mit dem Namen nur für Person und Leitung sichtbar, eigener Verlauf der letzten 90 Tage.",
  }),
};
