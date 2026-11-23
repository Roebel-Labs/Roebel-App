import { SCRIPT_HELPERS, templateDocument, type MiniAppTemplate } from "./types";

const FRAGEN = [
  { frage: "An welchem See liegt Röbel?", antworten: ["Plauer See", "Müritz", "Tollensesee", "Kölpinsee"], richtig: 1, erklaerung: "Röbel liegt am Südwestufer der Müritz, dem größten Binnensee Deutschlands." },
  { frage: "In welchem Bundesland liegt Röbel/Müritz?", antworten: ["Brandenburg", "Mecklenburg-Vorpommern", "Schleswig-Holstein", "Niedersachsen"], richtig: 1, erklaerung: "Röbel liegt in Mecklenburg-Vorpommern, mitten in der Seenplatte." },
  { frage: "Zu welchem Landkreis gehört Röbel?", antworten: ["Vorpommern-Greifswald", "Ludwigslust-Parchim", "Mecklenburgische Seenplatte", "Rostock"], richtig: 2, erklaerung: "Röbel gehört zum Landkreis Mecklenburgische Seenplatte, dem flächengrößten Landkreis Deutschlands." },
];

const QUIZ = {
  titel: "Röbel-Quiz",
  text: "Wie gut kennst du deine Stadt? Drei Fragen, eine Röbel-Münze.",
};

const body = `
<main class="mx-auto max-w-md p-4 pb-[calc(1.5rem+var(--safe-bottom))]">
  <section data-screen="start" data-title="Start" class="active">
    <div class="mt-6 rounded-lg bg-primary p-6 text-primary-foreground">
      <p class="text-xs font-medium opacity-80">Quiz</p>
      <h1 id="quiz-titel" class="mt-1 font-heading text-2xl font-bold"></h1>
      <p id="quiz-text" class="mt-2 text-sm opacity-90"></p>
    </div>
    <div class="mt-4 rounded border border-border bg-card p-4">
      <p class="text-xs text-muted-foreground">Dein Bestwert</p>
      <p class="font-mono text-2xl font-semibold tabular-nums"><span id="best">0</span> / <span id="anzahl">0</span></p>
    </div>
    <button id="los" class="mt-4 w-full rounded bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Quiz starten</button>
  </section>
  <section data-screen="frage" data-title="Frage" data-states="offen,richtig,falsch">
    <p id="fortschritt" class="text-xs font-medium text-muted-foreground"></p>
    <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-card"><div id="balken" class="h-full bg-primary transition-all"></div></div>
    <h1 id="frage-text" class="mt-5 font-heading text-xl font-bold"></h1>
    <div id="antworten" class="mt-4 space-y-2"></div>
    <p id="erklaerung" class="mt-4 hidden rounded border border-border bg-card p-3 text-sm"></p>
    <button id="weiter" class="mt-4 hidden w-full rounded bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Weiter</button>
  </section>
  <section data-screen="ergebnis" data-title="Ergebnis" data-states="geschafft,nochmal">
    <div class="mt-6 text-center">
      <p class="text-xs text-muted-foreground">Dein Ergebnis</p>
      <p class="mt-1 font-mono text-5xl font-semibold tabular-nums"><span id="punkte">0</span> / <span id="max">0</span></p>
      <p id="urteil" class="mt-3 text-sm text-muted-foreground"></p>
    </div>
    <button id="muenze" class="mt-6 hidden w-full rounded bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">1 Röbel-Münze abholen</button>
    <p id="muenze-info" class="mt-2 text-center text-xs text-muted-foreground"></p>
    <button id="nochmal" class="mt-3 w-full rounded border border-border px-4 py-2.5 text-sm text-foreground">Noch einmal spielen</button>
  </section>
</main>`;

const script = `
${SCRIPT_HELPERS}
const DEFAULT_FRAGEN = ${JSON.stringify(FRAGEN)};
const DEFAULT_QUIZ = ${JSON.stringify(QUIZ)};
let fragen = DEFAULT_FRAGEN;
let quiz = DEFAULT_QUIZ;
let best = 0;
let i = 0;
let punkte = 0;
let beantwortet = false;

function renderStart() {
  $("quiz-titel").textContent = quiz.titel || "Quiz";
  $("quiz-text").textContent = quiz.text || "";
  $("best").textContent = best;
  $("anzahl").textContent = fragen.length;
}
function renderFrage(gewaehlt) {
  const f = fragen[i];
  $("fortschritt").textContent = "Frage " + (i + 1) + " von " + fragen.length;
  $("balken").style.width = Math.round((i / fragen.length) * 100) + "%";
  $("frage-text").textContent = f.frage;
  $("antworten").innerHTML = f.antworten.map((a, n) => {
    let cls = "border-border text-foreground";
    if (gewaehlt != null) {
      if (n === f.richtig) cls = "border-success bg-success/10 text-foreground";
      else if (n === gewaehlt) cls = "border-destructive bg-destructive/10 text-foreground";
      else cls = "border-border text-muted-foreground";
    }
    return '<button data-antwort="' + n + '" ' + (gewaehlt != null ? 'disabled' : '') + ' class="min-h-[48px] w-full rounded border px-4 py-3 text-left text-sm font-medium ' + cls + '">' + esc(a) + '</button>';
  }).join("");
  $("erklaerung").classList.toggle("hidden", gewaehlt == null);
  $("weiter").classList.toggle("hidden", gewaehlt == null);
  if (gewaehlt != null) {
    $("erklaerung").textContent = (gewaehlt === f.richtig ? "Richtig! " : "Leider nicht. ") + (f.erklaerung || "");
    $("weiter").textContent = i + 1 < fragen.length ? "Weiter" : "Zum Ergebnis";
  }
}
function renderErgebnis() {
  $("punkte").textContent = punkte;
  $("max").textContent = fragen.length;
  const alles = punkte === fragen.length;
  $("urteil").textContent = alles ? "Alles richtig. Du kennst dich aus!" : "Gut gemacht. Mit allen Fragen richtig gibt es eine Röbel-Münze.";
  $("muenze").classList.toggle("hidden", !alles);
}
function start() {
  i = 0; punkte = 0; beantwortet = false;
  showScreen("frage");
  renderFrage(null);
  sdk.track("quiz_start");
}
$("los").addEventListener("click", start);
$("nochmal").addEventListener("click", start);
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-antwort]");
  if (!b || beantwortet) return;
  beantwortet = true;
  const n = Number(b.dataset.antwort);
  const ok = n === fragen[i].richtig;
  if (ok) punkte++;
  try { sdk.haptics.notification(ok ? "success" : "error"); } catch {}
  renderFrage(n);
});
$("weiter").addEventListener("click", async () => {
  if (i + 1 < fragen.length) { i++; beantwortet = false; renderFrage(null); return; }
  if (punkte > best) { best = punkte; saveUser("bestwert", best); }
  sdk.track("quiz_fertig", { punkte, max: fragen.length });
  showScreen("ergebnis");
  renderErgebnis();
});
$("muenze").addEventListener("click", async () => {
  const btn = $("muenze");
  btn.disabled = true;
  try {
    const r = await sdk.roebel.grantReward({ amount: 1, reason: "Quiz geschafft!", idempotencyKey: crypto.randomUUID() });
    if (r.granted) { btn.textContent = "✓ Abgeholt — morgen wieder"; $("muenze-info").textContent = ""; }
    else { btn.textContent = "Heute schon abgeholt"; $("muenze-info").textContent = "Morgen gibt es wieder eine Münze."; }
  } catch (err) {
    const code = err && err.code;
    btn.textContent = code === "rate_limited" ? "Heute schon abgeholt" : "Gerade nicht möglich";
    $("muenze-info").textContent = code === "rate_limited" ? "Morgen gibt es wieder eine Münze." : "Die Münze gibt es in der Röbel App.";
  }
});

async function init() {
  renderStart();
  if (pv && pv.screen) {
    showScreen(pv.screen);
    if (pv.screen === "frage") {
      i = 0;
      renderFrage(pv.state === "richtig" ? fragen[0].richtig : pv.state === "falsch" ? (fragen[0].richtig + 1) % fragen[0].antworten.length : null);
    }
    if (pv.screen === "ergebnis") { punkte = pv.state === "nochmal" ? 1 : fragen.length; renderErgebnis(); }
    sdk.actions.ready().catch(() => {});
    return;
  }
  sdk.actions.ready().catch(() => {});
  const [f, q, b] = await Promise.all([content("fragen", DEFAULT_FRAGEN), content("quiz", DEFAULT_QUIZ), userState("bestwert", 0)]);
  fragen = Array.isArray(f) && f.length ? f : DEFAULT_FRAGEN;
  quiz = q && typeof q === "object" ? q : DEFAULT_QUIZ;
  best = Number(b) || 0;
  renderStart();
}
init();
`;

export const quiz: MiniAppTemplate = {
  id: "quiz",
  title: "Quiz mit Röbel-Münze",
  summary: "Ein Quiz über euren Ort, Verein oder Betrieb. Wer alles richtig hat, bekommt eine Röbel-Münze.",
  group: "mitmachen",
  recommended: true,
  manifest: {
    name: "Röbel-Quiz",
    description: "Teste dein Wissen und hol dir eine Röbel-Münze.",
    category: "games",
    tags: ["quiz", "wissen", "belohnung"],
    permissions: ["rewards"],
  },
  cms: [
    { key: "fragen", beschreibung: "Fragen mit vier Antworten, Index der richtigen Antwort (0–3) und Erklärung", beispiel: FRAGEN },
    { key: "quiz", beschreibung: "Titel und Einleitungstext", beispiel: QUIZ },
  ],
  suggestions: ["Mach daraus ein Vereinsquiz", "Füge zu jeder Frage ein Bild hinzu", "Zeige eine Bestenliste"],
  thumbnailSvg: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="180" fill="#E4F2FF"/><rect x="92" y="30" width="136" height="120" rx="12" fill="#fff"/><rect x="108" y="46" width="80" height="10" rx="5" fill="#051433"/><rect x="108" y="68" width="104" height="16" rx="6" fill="#E5ECF3"/><rect x="108" y="90" width="104" height="16" rx="6" fill="#16A34A" opacity=".25"/><rect x="108" y="112" width="104" height="16" rx="6" fill="#E5ECF3"/><circle cx="228" cy="128" r="22" fill="#FDC705"/><circle cx="228" cy="128" r="15" fill="none" stroke="#051433" stroke-width="2.5"/><text x="228" y="133" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#051433">R</text></svg>`,
  html: templateDocument({
    title: "Röbel-Quiz",
    body,
    script,
    notes: "Vorlage Quiz: Startseite mit Bestwert, Fragen mit Erklärung, Ergebnis mit 1 Röbel-Münze bei voller Punktzahl. Inhalte „fragen“ und „quiz“ sind im Dashboard pflegbar.",
  }),
};
