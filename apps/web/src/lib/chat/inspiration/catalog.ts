// Inspiration catalog for the Mecky Chat suite: concrete agent tasks per audience that the
// inspiration screen recommends. Grounded in docs/future-research/2026-09-26_AGENT_INSPIRATION_FIELD_RESEARCH.md.
// Pure data + a pure ranking function (no I/O). UI copy is German, identifiers English.

export type Audience = "citizen" | "restaurant" | "verein" | "business" | "tourism" | "kommune";

export type InspirationTier = "free" | "plus" | "ultra" | "business";

export interface InspirationTask {
  id: string;
  audience: Audience[];
  /** German, ≤ 48 chars, imperative-ish. */
  title: string;
  /** German one sentence: the concrete outcome. */
  pitch: string;
  value: { kind: "money" | "time" | "good"; estimate: string };
  botSlug: "mecky" | "tagesplaner" | "recherche" | "design" | null;
  /** German prompt that kicks off the task in chat; may reference {orgName}. */
  starterPrompt: string;
  /** Harness tool names (spec 2026-09-26 §4). */
  requiredTools: string[];
  /** Data signals that make the task relevant (see SIGNALS). */
  signals: string[];
  tier: InspirationTier;
  /** Becomes a routine when the user taps "als Routine". */
  recurring?: { suggestion: string };
}

/**
 * Signal vocabulary the server derives from profile, orgs, tenant data and the calendar.
 * Documented here so producers and the catalog agree on spelling.
 */
export const SIGNALS = {
  // person
  citizen: "user.citizen",
  senior: "user.senior",
  family: "user.family",
  caregiver: "user.caregiver",
  newInTown: "user.new_in_town",
  hasCalendar: "user.has_calendar",
  hasMuenzen: "user.has_muenzen",
  orgOwner: "user.org_owner",
  // organisation
  restaurant: "org.kind=restaurant",
  cafe: "org.kind=cafe",
  verein: "org.kind=verein",
  business: "org.kind=business",
  handwerk: "org.kind=handwerk",
  retail: "org.kind=retail",
  tourism: "org.kind=tourism",
  kommune: "org.kind=kommune",
  noMenu: "org.no_menu",
  menuStale: "org.menu_stale",
  noEvents: "org.no_events",
  quietFeed: "org.no_posts_30d",
  hasTickets: "org.has_tickets",
  lowRating: "org.low_rating",
  noDeals: "org.no_deals",
  // time and place
  preSeason: "season=pre_season", // März bis Mai
  summer: "season=summer", // Juni bis August
  autumn: "season=autumn", // September bis November
  winter: "season=winter", // Dezember bis Februar
  yearEnd: "month=12",
  grantWindow: "deadline.grant_open",
  eventSoon: "event.upcoming_14d",
  proposalOpen: "proposal.open",
} as const;

const S = SIGNALS;

export const INSPIRATION_TASKS: InspirationTask[] = [
  // ─── Bürgerinnen und Bürger ────────────────────────────────────────────────
  {
    id: "citizen-weekly-briefing",
    audience: ["citizen"],
    title: "Dein Röbel-Wochenüberblick jeden Montag",
    pitch: "Jeden Montag um 7 Uhr: Termine, Abfuhr, Veranstaltungen und neue Angebote in Röbel in fünf Zeilen.",
    value: { kind: "time", estimate: "≈ 1 Std./Woche" },
    botSlug: "tagesplaner",
    starterPrompt:
      "Stell mir einen kurzen Wochenüberblick für Röbel zusammen: meine Termine, welche Tonne diese Woche rausmuss, die besten Veranstaltungen und neue Angebote. Höchstens fünf Zeilen.",
    requiredTools: ["abfallkalender", "list_events", "list_deals", "list_news", "create_routine"],
    signals: [S.citizen, S.hasCalendar],
    tier: "free",
    recurring: { suggestion: "jeden Montag 7:00" },
  },
  {
    id: "citizen-waste-reminder",
    audience: ["citizen"],
    title: "Nie wieder die Tonne vergessen",
    pitch: "Am Vorabend jeder Abfuhr eine Erinnerung, welche Tonne an die Straße muss.",
    value: { kind: "time", estimate: "≈ 30 Min./Monat" },
    botSlug: "tagesplaner",
    starterPrompt:
      "Erinnere mich am Abend vor jeder Müllabfuhr, welche Tonne raus muss. Schau im Abfallkalender nach meiner Straße und frag mich, wenn du sie nicht kennst.",
    requiredTools: ["abfallkalender", "remember", "create_routine"],
    signals: [S.citizen, S.senior],
    tier: "free",
    recurring: { suggestion: "täglich 19:00, nur vor Abfuhrtagen" },
  },
  {
    id: "citizen-care-benefit",
    audience: ["citizen"],
    title: "Pflege-Entlastungsbetrag nicht verfallen lassen",
    pitch: "Prüft mit dir, ob 131 € im Monat für Haushaltshilfe oder Betreuung ungenutzt liegen, und bereitet die Anfrage an die Pflegekasse vor.",
    value: { kind: "money", estimate: "bis 131 €/Monat" },
    botSlug: "recherche",
    starterPrompt:
      "Ich kümmere mich um einen Angehörigen mit Pflegegrad. Erklär mir, wie der Entlastungsbetrag funktioniert, bis wann alte Beträge noch nutzbar sind und welche anerkannten Anbieter es rund um Röbel gibt. Hilf mir dann, eine kurze Anfrage an die Pflegekasse zu formulieren.",
    requiredTools: ["web_search", "fetch_url", "write_file"],
    signals: [S.caregiver, S.senior, S.family],
    tier: "free",
  },
  {
    id: "citizen-benefit-check",
    audience: ["citizen"],
    title: "Prüfen, ob dir Wohngeld zusteht",
    pitch: "Geht mit dir die Voraussetzungen durch, schätzt grob ab, ob sich ein Antrag lohnt, und listet die Unterlagen fürs Amt auf.",
    value: { kind: "money", estimate: "oft 100–300 €/Monat" },
    botSlug: "recherche",
    starterPrompt:
      "Hilf mir einzuschätzen, ob sich für meinen Haushalt ein Wohngeld-Antrag lohnt. Frag mich Schritt für Schritt nach den nötigen Angaben, nutze den offiziellen Wohngeldrechner als Quelle und gib mir am Ende eine Unterlagen-Checkliste für die Wohngeldstelle im Landkreis.",
    requiredTools: ["web_search", "fetch_url", "ask_options", "write_file"],
    signals: [S.citizen, S.family, S.senior],
    tier: "free",
  },
  {
    id: "citizen-doctor-appointment",
    audience: ["citizen"],
    title: "Facharzttermin in der Region finden",
    pitch: "Sucht Praxen im Umkreis, erklärt den Weg über die 116117 und legt den Termin in deinen Kalender.",
    value: { kind: "time", estimate: "≈ 2 Std. pro Termin" },
    botSlug: "recherche",
    starterPrompt:
      "Ich brauche einen Termin bei einem Facharzt (ich sage dir gleich welcher). Such Praxen im Umkreis von Röbel, Waren und Malchow, erklär mir die Terminservicestelle 116117 und schlag mir den nächsten Schritt vor.",
    requiredTools: ["web_search", "fetch_url", "propose_calendar_event"],
    signals: [S.senior, S.caregiver, S.family],
    tier: "free",
  },
  {
    id: "citizen-letter-explained",
    audience: ["citizen"],
    title: "Behördenbrief in einfacher Sprache erklären",
    pitch: "Foto vom Brief schicken: Mecky erklärt, was drinsteht, welche Frist gilt und wer im Amt zuständig ist.",
    value: { kind: "time", estimate: "≈ 1 Std. pro Brief" },
    botSlug: "mecky",
    starterPrompt:
      "Ich schicke dir gleich ein Foto von einem Brief vom Amt. Erklär mir in einfacher Sprache, worum es geht, welche Frist gilt und wo ich nachfragen kann. Keine Rechtsberatung, nur verständlich machen.",
    requiredTools: ["search_roebel", "propose_calendar_event", "remember"],
    signals: [S.senior, S.citizen],
    tier: "free",
  },
  {
    id: "citizen-family-weekend",
    audience: ["citizen"],
    title: "Familienwochenende an der Müritz planen",
    pitch: "Ein Plan für Samstag und Sonntag mit Veranstaltungen, Schlechtwetter-Alternative und Kosten für die ganze Familie.",
    value: { kind: "good", estimate: "2 Tage ohne Planungsstress" },
    botSlug: "mecky",
    starterPrompt:
      "Plan mir ein Familienwochenende rund um Röbel: was ist los, was geht bei Regen, was kostet es ungefähr? Frag mich kurz nach dem Alter der Kinder.",
    requiredTools: ["list_events", "list_orgs", "list_deals", "web_search", "ask_options"],
    signals: [S.family, S.summer, S.eventSoon],
    tier: "free",
    recurring: { suggestion: "jeden Donnerstag 18:00" },
  },
  {
    id: "citizen-new-in-town",
    audience: ["citizen"],
    title: "Neu in Röbel: die ersten 30 Tage",
    pitch: "Eine persönliche Checkliste: Ummeldung, Müll, Kita oder Schule, Hausarzt, Vereine, die zu dir passen.",
    value: { kind: "time", estimate: "≈ 5 Std. gespart" },
    botSlug: "mecky",
    starterPrompt:
      "Ich bin neu in Röbel. Mach mir eine Checkliste für die ersten 30 Tage: Ummeldung beim Amt, Abfuhr, Ärzte, Kita oder Schule und zwei, drei Vereine, die zu meinen Interessen passen. Frag mich nach meinen Interessen.",
    requiredTools: ["search_roebel", "list_orgs", "abfallkalender", "ask_options", "write_file"],
    signals: [S.newInTown],
    tier: "free",
  },
  {
    id: "citizen-join-verein",
    audience: ["citizen"],
    title: "Den passenden Verein finden",
    pitch: "Aus allen Röbeler Vereinen die drei, die zu deiner Zeit und deinen Interessen passen, mit Ansprechperson und nächstem Termin.",
    value: { kind: "good", estimate: "neue Kontakte vor Ort" },
    botSlug: "mecky",
    starterPrompt:
      "Welche Vereine in Röbel passen zu mir? Frag mich nach Interessen und wie viel Zeit ich habe, und schlag mir drei vor, mit nächstem Termin zum Reinschnuppern.",
    requiredTools: ["list_orgs", "get_org", "list_events", "ask_options"],
    signals: [S.newInTown, S.citizen, S.senior],
    tier: "free",
  },
  {
    id: "citizen-help-neighbor",
    audience: ["citizen"],
    title: "Nachbarschaftshilfe anbieten oder finden",
    pitch: "Formuliert dein Angebot oder deine Bitte (Einkauf, Fahrt zum Arzt, Gartenhilfe) und stellt es nach deiner Freigabe auf den Marktplatz.",
    value: { kind: "good", estimate: "1 Hilfe pro Woche" },
    botSlug: "mecky",
    starterPrompt:
      "Ich möchte Nachbarschaftshilfe in Röbel anbieten oder suche selbst Hilfe. Hilf mir, eine kurze, freundliche Anzeige für den Marktplatz zu schreiben, ohne Adresse oder Telefonnummer im Text.",
    requiredTools: ["list_marketplace", "create_listing"],
    signals: [S.senior, S.citizen, S.hasMuenzen],
    tier: "free",
  },
  {
    id: "citizen-proposal-explainer",
    audience: ["citizen"],
    title: "Offenes Meinungsbild neutral erklären",
    pitch: "Fasst ein laufendes Meinungsbild mit Pro und Contra zusammen, damit du in zwei Minuten informiert abstimmst.",
    value: { kind: "good", estimate: "informierte Teilnahme" },
    botSlug: "mecky",
    starterPrompt:
      "Erklär mir das aktuell offene Meinungsbild in Röbel neutral: worum geht es, was spricht dafür, was dagegen, was kostet es? Gib keine Empfehlung, wie ich abstimmen soll.",
    requiredTools: ["list_proposals", "list_feed_posts", "get_treasury"],
    signals: [S.citizen, S.proposalOpen],
    tier: "free",
  },
  {
    id: "citizen-sell-declutter",
    audience: ["citizen"],
    title: "Keller entrümpeln, Sachen lokal verkaufen",
    pitch: "Aus Fotos werden fertige Marktplatz-Anzeigen mit fairem Preisvorschlag, veröffentlicht erst nach deiner Freigabe.",
    value: { kind: "money", estimate: "+50–200 € einmalig" },
    botSlug: "mecky",
    starterPrompt:
      "Ich will ein paar Sachen lokal in Röbel verkaufen. Ich schicke dir Fotos; schreib mir pro Gegenstand eine kurze Anzeige mit fairem Preisvorschlag für den Marktplatz.",
    requiredTools: ["list_marketplace", "web_search", "create_listing"],
    signals: [S.citizen, S.preSeason],
    tier: "plus",
  },
  {
    id: "citizen-energy-contracts",
    audience: ["citizen"],
    title: "Strom- und Handyverträge durchleuchten",
    pitch: "Vergleicht deine laufenden Verträge mit aktuellen Tarifen und erinnert dich an die Kündigungsfrist.",
    value: { kind: "money", estimate: "≈ 15–40 €/Monat" },
    botSlug: "recherche",
    starterPrompt:
      "Hilf mir, meine Verträge (Strom, Gas, Handy, Internet) zu prüfen. Ich nenne dir Anbieter, Preis und Laufzeit; du vergleichst mit aktuellen Angeboten für Röbel (PLZ 17207) und trägst mir die Kündigungsfristen in den Kalender ein.",
    requiredTools: ["web_search", "fetch_url", "write_file", "propose_calendar_event", "remember"],
    signals: [S.citizen, S.family, S.autumn],
    tier: "plus",
    recurring: { suggestion: "einmal im Quartal" },
  },
  {
    id: "citizen-meal-plan",
    audience: ["citizen"],
    title: "Wochenessen planen mit regionalen Angeboten",
    pitch: "Ein Essensplan für die Woche mit Einkaufsliste und Hofläden aus der Region.",
    value: { kind: "time", estimate: "≈ 2 Std./Woche" },
    botSlug: "tagesplaner",
    starterPrompt:
      "Plan für meinen Haushalt die Essen dieser Woche: einfach, günstig, möglichst regional (Hofläden, Fisch von der Müritz). Mit Einkaufsliste als Datei.",
    requiredTools: ["list_orgs", "list_deals", "write_file", "create_routine"],
    signals: [S.family],
    tier: "plus",
    recurring: { suggestion: "jeden Sonntag 17:00" },
  },

  // ─── Gastronomie ───────────────────────────────────────────────────────────
  {
    id: "restaurant-review-replies",
    audience: ["restaurant"],
    title: "Alle offenen Bewertungen beantworten",
    pitch: "Freundliche, persönliche Antworten auf jede Bewertung, veröffentlicht erst nach deiner Freigabe.",
    value: { kind: "time", estimate: "≈ 3 Std./Monat" },
    botSlug: "mecky",
    starterPrompt:
      "Hilf {orgName}, auf Gästebewertungen zu antworten. Ich kopiere dir die offenen Bewertungen hier rein; schreib je eine kurze, persönliche Antwort ohne Floskeln und ohne Namen oder Details über Gäste preiszugeben.",
    requiredTools: ["get_org", "recall", "write_file"],
    signals: [S.restaurant, S.cafe, S.lowRating],
    tier: "business",
    recurring: { suggestion: "jeden Montag 9:00" },
  },
  {
    id: "restaurant-menu-digital",
    audience: ["restaurant"],
    title: "Speisekarte digitalisieren inkl. Allergenen",
    pitch: "Aus einem Foto deiner Karte wird die digitale Speisekarte in der App, mit Allergen-Vorschlägen zum Prüfen.",
    value: { kind: "time", estimate: "≈ 4 Std. einmalig" },
    botSlug: "mecky",
    starterPrompt:
      "Ich schicke dir ein Foto der Speisekarte von {orgName}. Mach daraus eine saubere digitale Karte mit Preisen und schlag pro Gericht die möglichen Allergene (14 Hauptallergene) als Entwurf vor. Markiere klar, dass ich die Allergene mit meinen Rezepturen prüfen muss.",
    requiredTools: ["get_menu", "get_org", "write_file"],
    signals: [S.restaurant, S.cafe, S.noMenu],
    tier: "business",
  },
  {
    id: "restaurant-allergen-matrix",
    audience: ["restaurant"],
    title: "Allergen-Mappe für Kontrolle und Service",
    pitch: "Eine schriftliche Allergen-Dokumentation pro Gericht, die Service und Lebensmittelkontrolle jederzeit vorgelegt werden kann.",
    value: { kind: "money", estimate: "Bußgeldrisiko senken" },
    botSlug: "recherche",
    starterPrompt:
      "Erstelle für {orgName} eine Allergen-Mappe nach LMIV: pro Gericht die Zutaten und die 14 Hauptallergene als Tabelle, dazu ein kurzer Hinweistext für den Service. Frag mich nach den Rezepturen, und kennzeichne alles als Entwurf zur Prüfung.",
    requiredTools: ["get_menu", "ask_options", "write_file"],
    signals: [S.restaurant, S.cafe, S.menuStale],
    tier: "business",
  },
  {
    id: "restaurant-google-profile",
    audience: ["restaurant", "business", "tourism"],
    title: "Google-Profil vor der Saison aufräumen",
    pitch: "Checkliste für Öffnungszeiten, Saisonzeiten, Fotos und Beschreibung, damit Urlauber dich an der Müritz finden.",
    value: { kind: "money", estimate: "+5–10 % Anfragen" },
    botSlug: "recherche",
    starterPrompt:
      "Prüf, wie {orgName} online auftritt (Google-Profil, Website, Röbel-App), und gib mir eine priorisierte Checkliste für die Saison: Öffnungszeiten, Fotos, Beschreibung, Menülink, Reservierung. Schreib mir die neue Beschreibung gleich mit.",
    requiredTools: ["get_org", "web_search", "fetch_url", "write_file"],
    signals: [S.restaurant, S.cafe, S.tourism, S.preSeason],
    tier: "business",
  },
  {
    id: "restaurant-weekly-special",
    audience: ["restaurant"],
    title: "Mittagstisch der Woche posten",
    pitch: "Jeden Montag ein fertiger Beitrag mit Bild für den Röbel-Feed, du gibst nur frei.",
    value: { kind: "money", estimate: "+10–20 Gäste/Woche" },
    botSlug: "design",
    starterPrompt:
      "Frag mich nach dem Mittagstisch dieser Woche von {orgName} und mach daraus einen kurzen Feed-Beitrag mit appetitlichem Bildvorschlag. Veröffentlichen erst nach meiner Freigabe.",
    requiredTools: ["get_menu", "create_feed_post", "create_routine"],
    signals: [S.restaurant, S.cafe, S.quietFeed],
    tier: "business",
    recurring: { suggestion: "jeden Montag 8:30" },
  },
  {
    id: "restaurant-no-show",
    audience: ["restaurant"],
    title: "No-Shows am Wochenende senken",
    pitch: "Ein Erinnerungs- und Stornotext für Reservierungen plus Regeln für große Tische, die leere Tische nachweislich reduzieren.",
    value: { kind: "money", estimate: "+200–800 €/Wochenende" },
    botSlug: "recherche",
    starterPrompt:
      "Bei {orgName} erscheinen reservierte Gäste am Wochenende oft nicht. Entwickle mit mir einen einfachen Ablauf: Bestätigung, Erinnerung am Vortag, Absage-Link, Regeln ab 6 Personen. Mit fertigen Textvorlagen für Telefon, E-Mail und WhatsApp.",
    requiredTools: ["web_search", "write_file", "ask_options"],
    signals: [S.restaurant, S.summer, S.preSeason],
    tier: "business",
  },
  {
    id: "restaurant-price-check",
    audience: ["restaurant"],
    title: "Preise nachkalkulieren nach Wareneinsatz",
    pitch: "Rechnet pro Gericht Wareneinsatz und Marge durch und zeigt, wo die 7 % auf Speisen bisher nicht ankommen.",
    value: { kind: "money", estimate: "+300–900 €/Monat" },
    botSlug: "recherche",
    starterPrompt:
      "Hilf mir, die Karte von {orgName} nachzukalkulieren. Ich nenne dir pro Gericht Einkaufspreise der Zutaten; du rechnest Wareneinsatz, Kalkulationsfaktor und Marge, getrennt nach 7 % Speisen und 19 % Getränke, und zeigst mir die fünf Gerichte mit dem größten Hebel. Keine Steuerberatung, nur Kalkulation.",
    requiredTools: ["get_menu", "write_file", "ask_options"],
    signals: [S.restaurant, S.cafe, S.winter],
    tier: "business",
  },
  {
    id: "restaurant-staff-ad",
    audience: ["restaurant", "tourism", "business"],
    title: "Saisonkräfte-Anzeige, die ankommt",
    pitch: "Eine ehrliche Stellenanzeige mit Unterkunft, Schichten und Lohn, dazu Plätze in der Region, wo sie gesehen wird.",
    value: { kind: "money", estimate: "1 Stelle schneller besetzt" },
    botSlug: "recherche",
    starterPrompt:
      "{orgName} sucht Personal für die Saison. Schreib mit mir eine klare Stellenanzeige (Aufgaben, Schichten, Lohn, Unterkunft, Anfahrt) und nenn mir die besten Kanäle in der Region Müritz, von Arbeitsagentur bis Feed-Beitrag in der Röbel-App.",
    requiredTools: ["web_search", "write_file", "create_feed_post", "create_listing"],
    signals: [S.restaurant, S.tourism, S.preSeason, S.winter],
    tier: "business",
  },
  {
    id: "restaurant-rainy-day",
    audience: ["restaurant", "tourism"],
    title: "Regentag-Aktion vorbereiten",
    pitch: "Sobald Regen gemeldet ist, liegt ein fertiges Angebot für Kaffee, Kuchen oder Suppe zum Freigeben bereit.",
    value: { kind: "money", estimate: "+100–300 € pro Regentag" },
    botSlug: "mecky",
    starterPrompt:
      "Wenn in Röbel für morgen Regen gemeldet ist, schlag mir am Vorabend eine kleine Aktion für {orgName} vor (z. B. Kuchen und Kaffee, Kinderecke) und bereite Feed-Beitrag und Angebot zur Freigabe vor.",
    requiredTools: ["web_search", "create_feed_post", "list_deals", "create_routine"],
    signals: [S.restaurant, S.cafe, S.summer],
    tier: "business",
    recurring: { suggestion: "täglich 18:00 in der Saison, nur bei Regen" },
  },
  {
    id: "restaurant-event-night",
    audience: ["restaurant"],
    title: "Themenabend in der Nebensaison füllen",
    pitch: "Idee, Preis, Ticket und Plakat für einen Abend wie Matjes, Wild oder Fisch von der Müritz, der die ruhige Zeit füllt.",
    value: { kind: "money", estimate: "+500–1.500 € pro Abend" },
    botSlug: "design",
    starterPrompt:
      "Plan mit mir einen Themenabend für {orgName} in der Nebensaison: Idee mit regionalem Bezug, Menü, Preis, Anzahl Plätze. Danach machen wir die Veranstaltung mit Tickets in der App und ein Plakat.",
    requiredTools: ["list_events", "create_org_event", "create_feed_post", "ask_options"],
    signals: [S.restaurant, S.autumn, S.winter, S.noEvents],
    tier: "business",
  },
  {
    id: "restaurant-tourist-languages",
    audience: ["restaurant", "tourism"],
    title: "Karte auf Englisch und Niederländisch",
    pitch: "Übersetzt Speisekarte, Öffnungszeiten und Hausregeln für Gäste aus dem Ausland, mit Allergen-Hinweis.",
    value: { kind: "time", estimate: "≈ 3 Std. einmalig" },
    botSlug: "mecky",
    starterPrompt:
      "Übersetz die Speisekarte und die wichtigsten Aushänge von {orgName} ins Englische und Niederländische. Gerichtsnamen mit regionalem Charme lassen, kurz erklären. Als Datei zum Drucken.",
    requiredTools: ["get_menu", "write_file"],
    signals: [S.restaurant, S.cafe, S.tourism, S.preSeason],
    tier: "business",
  },

  // ─── Vereine ───────────────────────────────────────────────────────────────
  {
    id: "verein-grant-finder",
    audience: ["verein"],
    title: "Fördermittel für euer Projekt finden",
    pitch: "Passende Töpfe in MV mit Frist, Höhe und Eigenanteil, von der Ehrenamtsstiftung bis LEADER.",
    value: { kind: "money", estimate: "1.000–16.000 € pro Antrag" },
    botSlug: "recherche",
    starterPrompt:
      "{orgName} plant ein Projekt (ich beschreibe es gleich). Finde passende Förderungen in Mecklenburg-Vorpommern und bundesweit: Ehrenamtsstiftung MV, LEADER-Regionalbudget Seenplatte-Müritz, Stiftungen, Sparkasse. Pro Topf: Höhe, Eigenanteil, Frist, Link. Sortiert nach Erfolgschance.",
    requiredTools: ["web_search", "fetch_url", "get_org", "write_file", "propose_calendar_event"],
    signals: [S.verein, S.grantWindow],
    tier: "business",
  },
  {
    id: "verein-grant-draft",
    audience: ["verein", "kommune"],
    title: "Förderantrag vorschreiben lassen",
    pitch: "Ein vollständiger Antragsentwurf mit Projektbeschreibung, Zeitplan und Kostenplan, den ihr nur noch prüft.",
    value: { kind: "time", estimate: "≈ 8–12 Std. pro Antrag" },
    botSlug: "recherche",
    starterPrompt:
      "Schreib für {orgName} einen Förderantrag vor. Ich nenne dir Förderprogramm und Projekt; du holst dir die Förderrichtlinie, stellst mir die fehlenden Fragen und lieferst Projektbeschreibung, Zeitplan und Kostenplan als Datei.",
    requiredTools: ["fetch_url", "web_search", "ask_options", "write_file", "start_task"],
    signals: [S.verein, S.grantWindow, S.kommune],
    tier: "business",
  },
  {
    id: "verein-protocol",
    audience: ["verein", "kommune"],
    title: "Protokoll aus Sprachnotiz schreiben",
    pitch: "Sprachaufnahme oder Stichpunkte rein, fertiges Sitzungsprotokoll mit Beschlüssen und Aufgaben raus.",
    value: { kind: "time", estimate: "≈ 2 Std. pro Sitzung" },
    botSlug: "mecky",
    starterPrompt:
      "Mach aus meinen Notizen (oder der Sprachnachricht) das Protokoll der Sitzung von {orgName}: Anwesende, Tagesordnung, Beschlüsse mit Abstimmungsergebnis, Aufgaben mit Verantwortlichen und Frist.",
    requiredTools: ["write_file", "propose_calendar_event"],
    signals: [S.verein, S.kommune],
    tier: "business",
  },
  {
    id: "verein-agm-prep",
    audience: ["verein"],
    title: "Mitgliederversammlung fristgerecht vorbereiten",
    pitch: "Einladung nach Satzungsfrist, Tagesordnung, Kassenbericht-Gerüst und Ablaufplan in einem Rutsch.",
    value: { kind: "time", estimate: "≈ 6 Std. pro Jahr" },
    botSlug: "tagesplaner",
    starterPrompt:
      "Bereite mit mir die Mitgliederversammlung von {orgName} vor. Frag mich nach Datum und Einladungsfrist laut Satzung, dann erstell Einladung, Tagesordnung, Ablaufplan und eine Checkliste mit Terminen im Kalender.",
    requiredTools: ["ask_options", "write_file", "propose_calendar_event", "create_org_event"],
    signals: [S.verein, S.winter, S.preSeason],
    tier: "business",
  },
  {
    id: "verein-event-promo",
    audience: ["verein", "business", "restaurant"],
    title: "Vereinsfest bewerben: Plakat, Beitrag, Tickets",
    pitch: "Aus drei Stichworten werden Veranstaltung in der App, Plakat und Feed-Beiträge in der Woche davor.",
    value: { kind: "money", estimate: "+30 % Besucher" },
    botSlug: "design",
    starterPrompt:
      "{orgName} macht bald eine Veranstaltung. Frag mich nach Datum, Ort und Programm, leg die Veranstaltung in der App an (mit Tickets, falls gewünscht), gestalte ein Plakat und plane zwei Erinnerungsbeiträge.",
    requiredTools: ["create_org_event", "create_feed_post", "list_events", "create_routine"],
    signals: [S.verein, S.eventSoon, S.noEvents],
    tier: "business",
  },
  {
    id: "verein-helper-shifts",
    audience: ["verein"],
    title: "Helferschichten fürs Fest verteilen",
    pitch: "Schichtplan für Aufbau, Stand und Abbau plus freundliche Nachricht an die Mitglieder, wer wann gebraucht wird.",
    value: { kind: "time", estimate: "≈ 3 Std. pro Fest" },
    botSlug: "tagesplaner",
    starterPrompt:
      "Mach für das Fest von {orgName} einen Helferschichtplan (Aufbau, Stände, Kasse, Abbau) und schreib eine kurze Nachricht an die Mitglieder, die zum Eintragen einlädt, ohne Druck.",
    requiredTools: ["write_file", "send_direct_message", "create_feed_post"],
    signals: [S.verein, S.eventSoon, S.summer],
    tier: "business",
  },
  {
    id: "verein-new-members",
    audience: ["verein"],
    title: "Neue Mitglieder und Nachwuchs gewinnen",
    pitch: "Ein Schnuppertag mit Einladung, Beitrag und Aushang, der zielgenau Zugezogene, Familien oder Ältere anspricht.",
    value: { kind: "good", estimate: "+3–10 Mitglieder/Jahr" },
    botSlug: "mecky",
    starterPrompt:
      "{orgName} braucht Nachwuchs. Entwickle mit mir einen Schnuppertag: Zielgruppe, Programm, Termin, Einladung im Röbel-Feed und ein Aushang. Schau, welche Veranstaltungen in Röbel wir nicht doppeln sollten.",
    requiredTools: ["list_events", "create_org_event", "create_feed_post", "ask_options"],
    signals: [S.verein, S.preSeason, S.autumn],
    tier: "business",
  },
  {
    id: "verein-board-handover",
    audience: ["verein"],
    title: "Vorstandsarbeit übergabefertig dokumentieren",
    pitch: "Ein Vorstands-Handbuch mit Fristen, Zugängen (ohne Passwörter), Abläufen und Ansprechpartnern, damit Nachfolger leichter Ja sagen.",
    value: { kind: "good", estimate: "Vorstand leichter besetzen" },
    botSlug: "mecky",
    starterPrompt:
      "Hilf mir, die Vorstandsarbeit von {orgName} so zu dokumentieren, dass jemand Neues sie übernehmen kann: jährliche Fristen, wiederkehrende Aufgaben, Ansprechpartner bei Amt und Bank, Abläufe. Frag mich Stück für Stück ab. Keine Passwörter in die Datei.",
    requiredTools: ["ask_options", "write_file", "remember"],
    signals: [S.verein],
    tier: "business",
  },
  {
    id: "verein-deadlines",
    audience: ["verein"],
    title: "Vereinsfristen im Blick behalten",
    pitch: "Freistellungsbescheid, Registereintrag, Versicherungen, GEMA und Förderberichte als Erinnerungen im Kalender.",
    value: { kind: "money", estimate: "Säumnisrisiko vermeiden" },
    botSlug: "tagesplaner",
    starterPrompt:
      "Sammle mit mir alle wiederkehrenden Fristen von {orgName} (Gemeinnützigkeit, Vereinsregister, Versicherungen, GEMA, Förderberichte, Mitgliederversammlung) und lege sie als Erinnerungen an.",
    requiredTools: ["ask_options", "propose_calendar_event", "create_routine", "remember"],
    signals: [S.verein, S.yearEnd],
    tier: "business",
    recurring: { suggestion: "am 1. jedes Monats 9:00" },
  },
  {
    id: "verein-sponsor-letter",
    audience: ["verein"],
    title: "Sponsoren aus Röbel ansprechen",
    pitch: "Eine Liste passender Betriebe vor Ort und persönliche Anschreiben mit klarer Gegenleistung.",
    value: { kind: "money", estimate: "+200–1.500 € pro Saison" },
    botSlug: "recherche",
    starterPrompt:
      "{orgName} sucht Unterstützer für die Saison. Such passende Betriebe in und um Röbel und schreib pro Betrieb ein kurzes, persönliches Anschreiben mit klarer Gegenleistung (Logo, Erwähnung, Stand). Versand erst nach meiner Freigabe.",
    requiredTools: ["list_orgs", "get_org", "write_file", "send_email"],
    signals: [S.verein, S.preSeason],
    tier: "business",
  },
  {
    id: "verein-treasurer-prep",
    audience: ["verein"],
    title: "Kassenprüfung vorbereiten",
    pitch: "Belege-Checkliste, Einnahmen-Ausgaben-Übersicht nach Sphären und offene Fragen, bevor die Kassenprüfer kommen.",
    value: { kind: "time", estimate: "≈ 4 Std. pro Jahr" },
    botSlug: "recherche",
    starterPrompt:
      "Hilf dem Kassenwart von {orgName}, die Kassenprüfung vorzubereiten: Checkliste der Belege, Gliederung der Einnahmen und Ausgaben nach ideellem Bereich, Zweckbetrieb und wirtschaftlichem Geschäftsbetrieb, und Fragen, die ich mit dem Steuerberater klären sollte. Keine steuerliche Beratung.",
    requiredTools: ["ask_options", "write_file"],
    signals: [S.verein, S.yearEnd, S.winter],
    tier: "business",
  },
  {
    id: "verein-yearbook",
    audience: ["verein", "kommune"],
    title: "Jahresrückblick aus Beiträgen erstellen",
    pitch: "Aus Feed-Beiträgen, Veranstaltungen und Fotos entsteht ein Rückblick für Mitglieder, Sponsoren und Förderberichte.",
    value: { kind: "good", estimate: "≈ 5 Std. gespart" },
    botSlug: "design",
    starterPrompt:
      "Erstelle einen Jahresrückblick für {orgName} aus unseren Beiträgen und Veranstaltungen in der App: Höhepunkte, Zahlen, Dank an Helfer und Sponsoren. Als Datei und als kurzer Feed-Beitrag zur Freigabe.",
    requiredTools: ["list_feed_posts", "list_events", "write_file", "create_feed_post"],
    signals: [S.verein, S.yearEnd],
    tier: "business",
  },

  // ─── Betriebe, Handwerk, Einzelhandel ──────────────────────────────────────
  {
    id: "business-quote-draft",
    audience: ["business"],
    title: "Angebot aus Notizen und Fotos schreiben",
    pitch: "Aus Baustellenfotos und Stichworten ein sauberes Angebot mit Positionen, das du nur noch bepreist und abschickst.",
    value: { kind: "time", estimate: "≈ 6 Std./Monat" },
    botSlug: "mecky",
    starterPrompt:
      "Ich schicke dir Stichworte und Fotos von einer Anfrage für {orgName}. Mach daraus einen Angebotsentwurf mit klaren Positionen, Leistungsbeschreibung und offenen Fragen an den Kunden. Preise trage ich selbst ein.",
    requiredTools: ["write_file", "remember", "recall"],
    signals: [S.handwerk, S.business],
    tier: "business",
  },
  {
    id: "business-inbox-triage",
    audience: ["business", "tourism", "restaurant"],
    title: "Anfragen-Postfach jeden Morgen sortieren",
    pitch: "Jeden Morgen: welche Anfragen dringend sind, fertige Antwortentwürfe und was liegen bleiben darf.",
    value: { kind: "time", estimate: "≈ 5 Std./Monat" },
    botSlug: "tagesplaner",
    starterPrompt:
      "Geh jeden Morgen die neuen Anfragen von {orgName} durch, sortier nach dringend, heute und kann warten, und schreib mir Antwortentwürfe. Gesendet wird nur, was ich freigebe.",
    requiredTools: ["mcp_google_gmail_search", "write_file", "send_email", "create_routine"],
    signals: [S.business, S.tourism, S.orgOwner],
    tier: "business",
    recurring: { suggestion: "werktags 7:30" },
  },
  {
    id: "business-e-invoice",
    audience: ["business", "restaurant", "tourism"],
    title: "Fit für die E-Rechnung bis 2028",
    pitch: "Prüft deinen Rechnungsweg und zeigt die einfachste Lösung, bevor die Ausstellungspflicht für dich greift.",
    value: { kind: "money", estimate: "Fehlstart vermeiden" },
    botSlug: "recherche",
    starterPrompt:
      "Erklär mir, ab wann {orgName} E-Rechnungen ausstellen muss und was wir heute schon empfangen können müssen. Frag mich nach Umsatzgröße und aktuellem Rechnungsprogramm und empfiehl zwei, drei einfache Wege. Hinweis auf Steuerberater, wo nötig.",
    requiredTools: ["web_search", "fetch_url", "ask_options", "write_file"],
    signals: [S.business, S.handwerk, S.autumn],
    tier: "business",
  },
  {
    id: "business-deal-slow-day",
    audience: ["business", "restaurant"],
    title: "Angebot für den schwächsten Wochentag",
    pitch: "Ein App-Angebot, das gezielt den ruhigsten Tag füllt, mit Laufzeit und Feed-Beitrag zur Freigabe.",
    value: { kind: "money", estimate: "+150–600 €/Monat" },
    botSlug: "mecky",
    starterPrompt:
      "Welcher Wochentag ist bei {orgName} am ruhigsten? Entwickle mit mir ein Angebot für die Röbel-App, das genau diesen Tag füllt, ohne Rabattschlacht, und bereite Angebot und Beitrag zur Freigabe vor.",
    requiredTools: ["list_deals", "get_org", "create_feed_post", "ask_options"],
    signals: [S.business, S.retail, S.restaurant, S.noDeals],
    tier: "business",
  },
  {
    id: "business-shop-window",
    audience: ["business"],
    title: "Schaufenster-Post für diese Woche",
    pitch: "Aus einem Handyfoto neuer Ware wird ein Feed-Beitrag, der Einheimische und Urlauber in den Laden holt.",
    value: { kind: "money", estimate: "+5–15 Kunden/Woche" },
    botSlug: "design",
    starterPrompt:
      "Ich schicke dir ein Foto von neuer Ware bei {orgName}. Schreib einen kurzen, lokalen Beitrag für den Röbel-Feed mit Öffnungszeiten und einem Grund, heute vorbeizukommen.",
    requiredTools: ["get_org", "create_feed_post", "create_routine"],
    signals: [S.retail, S.quietFeed],
    tier: "business",
    recurring: { suggestion: "jeden Donnerstag 9:00" },
  },
  {
    id: "business-succession",
    audience: ["business"],
    title: "Betriebsnachfolge ohne Hektik vorbereiten",
    pitch: "Eine Übersicht, was der Betrieb wert macht, welche Unterlagen fehlen und welche Nachfolgeberatung in MV kostenlos hilft.",
    value: { kind: "money", estimate: "Lebenswerk sichern" },
    botSlug: "recherche",
    starterPrompt:
      "Ich denke über die Nachfolge für {orgName} nach. Mach mir einen Fahrplan: welche Unterlagen ein Nachfolger sehen will, welche Beratungsstellen in MV helfen (Nachfolgezentrale, IHK, Handwerkskammer), und welche Fragen ich zuerst klären sollte. Keine Rechts- oder Steuerberatung.",
    requiredTools: ["web_search", "fetch_url", "write_file", "ask_options"],
    signals: [S.business, S.handwerk, S.winter],
    tier: "business",
  },
  {
    id: "business-apprentice",
    audience: ["business", "restaurant"],
    title: "Azubi finden: Ausbildungsplatz sichtbar machen",
    pitch: "Anzeige für Schulabgänger, Termine der Ausbildungsmessen in der Region und ein Beitrag, den Eltern teilen.",
    value: { kind: "money", estimate: "1 Azubi = Nachwuchs gesichert" },
    botSlug: "recherche",
    starterPrompt:
      "{orgName} bildet aus. Schreib eine Ausbildungsanzeige, die 16-Jährige anspricht, such die nächsten Ausbildungsmessen und Praktikumsbörsen rund um Röbel und Waren und bereite einen Feed-Beitrag vor.",
    requiredTools: ["web_search", "write_file", "create_feed_post", "propose_calendar_event"],
    signals: [S.business, S.handwerk, S.restaurant, S.autumn],
    tier: "business",
  },
  {
    id: "business-competitor-watch",
    audience: ["business", "restaurant", "tourism"],
    title: "Markt rund um die Müritz im Blick",
    pitch: "Einmal im Monat: neue Anbieter, Preise und Angebote in der Region, und was du daraus machen kannst.",
    value: { kind: "money", estimate: "bessere Preisentscheidungen" },
    botSlug: "recherche",
    starterPrompt:
      "Beobachte für {orgName} einmal im Monat den Markt rund um Röbel und die Müritz: neue Anbieter, Preisänderungen, Aktionen. Nur öffentlich zugängliche Informationen, mit Quellen, und drei konkrete Ideen für uns.",
    requiredTools: ["web_search", "fetch_url", "list_orgs", "list_deals", "write_file", "create_routine"],
    signals: [S.business, S.restaurant, S.tourism],
    tier: "ultra",
    recurring: { suggestion: "am 1. jedes Monats 8:00" },
  },

  // ─── Tourismus (Ferienwohnung, Bootsverleih, Aktivanbieter) ────────────────
  {
    id: "tourism-guest-guide",
    audience: ["tourism"],
    title: "Digitale Gästemappe für deine Ferienwohnung",
    pitch: "Anreise, Hausregeln, WLAN-Hinweis, Abfall, Bäcker und Ausflüge an der Müritz, als Link und zum Ausdrucken.",
    value: { kind: "time", estimate: "≈ 4 Std./Monat weniger Rückfragen" },
    botSlug: "mecky",
    starterPrompt:
      "Erstelle für {orgName} eine Gästemappe: Anreise, Check-in, Hausregeln, Mülltrennung, Einkaufen, Ärzte, Ausflüge und Veranstaltungen in Röbel. Frag mich nach den Besonderheiten der Unterkunft. Auf Deutsch und Englisch.",
    requiredTools: ["search_roebel", "list_orgs", "abfallkalender", "write_file"],
    signals: [S.tourism, S.preSeason],
    tier: "business",
  },
  {
    id: "tourism-weekly-guest-tips",
    audience: ["tourism", "restaurant"],
    title: "Wochentipps für deine Gäste",
    pitch: "Jeden Freitag eine kurze Nachricht mit den Veranstaltungen der kommenden Woche, fertig zum Weiterleiten an Gäste.",
    value: { kind: "good", estimate: "bessere Bewertungen" },
    botSlug: "mecky",
    starterPrompt:
      "Schreib für die Gäste von {orgName} jeden Freitag die fünf besten Tipps für die kommende Woche in Röbel und an der Müritz: Veranstaltungen, Schlechtwetter-Idee, ein Restaurant-Tipp. Kurz, auf Deutsch und Englisch.",
    requiredTools: ["list_events", "list_orgs", "list_deals", "write_file", "create_routine"],
    signals: [S.tourism, S.summer, S.preSeason],
    tier: "business",
    recurring: { suggestion: "jeden Freitag 10:00" },
  },
  {
    id: "tourism-direct-booking",
    audience: ["tourism"],
    title: "Mehr Direktbuchungen statt Portalprovision",
    pitch: "Stammgäste-Brief, Direktbuchungs-Hinweis und Wiederbuchungs-Angebot, die dir 12–18 % Provision pro Buchung sparen.",
    value: { kind: "money", estimate: "+80–250 € pro Direktbuchung" },
    botSlug: "recherche",
    starterPrompt:
      "{orgName} bekommt die meisten Buchungen über Portale. Entwickle mit mir einen einfachen Plan für mehr Direktbuchungen: Hinweise in der Gästemappe, Nachricht an frühere Gäste (nur mit Einwilligung), Wiederbuchungs-Angebot. Rechne mir die gesparte Provision vor.",
    requiredTools: ["web_search", "write_file", "ask_options", "send_email"],
    signals: [S.tourism, S.autumn, S.winter],
    tier: "business",
  },
  {
    id: "tourism-listing-text",
    audience: ["tourism"],
    title: "Inserat für die Nebensaison neu schreiben",
    pitch: "Ein Inserat, das Herbst und Winter an der Müritz verkauft: Kraniche, Ruhe, Sauna, Wandern.",
    value: { kind: "money", estimate: "+2–4 belegte Nächte/Monat" },
    botSlug: "recherche",
    starterPrompt:
      "Schreib das Inserat von {orgName} für Herbst und Winter neu. Betone, was die Müritz in der Nebensaison besonders macht (Kranichzug, Ruhe, Natur), und gib mir Titel, Text und Fotoliste für Portale und die eigene Seite.",
    requiredTools: ["web_search", "list_events", "write_file"],
    signals: [S.tourism, S.autumn],
    tier: "business",
  },
  {
    id: "tourism-boat-weather",
    audience: ["tourism"],
    title: "Wetterwarnung für Bootsgäste am Morgen",
    pitch: "An Tagen mit Wind oder Gewitter eine klare Nachricht für Mietboot-Gäste mit Sicherheitshinweisen und Alternativen.",
    value: { kind: "good", estimate: "sichere Gäste, weniger Schäden" },
    botSlug: "tagesplaner",
    starterPrompt:
      "Prüf jeden Morgen in der Saison das Wetter für die Müritz. Wenn Wind oder Gewitter drohen, schreib mir eine kurze Nachricht für die Bootsgäste von {orgName}: Sicherheitshinweise, ufernahe Routen, Alternativen an Land.",
    requiredTools: ["web_search", "fetch_url", "create_routine", "list_events"],
    signals: [S.tourism, S.summer],
    tier: "business",
    recurring: { suggestion: "täglich 7:00 von April bis Oktober" },
  },
  {
    id: "tourism-review-request",
    audience: ["tourism", "restaurant"],
    title: "Nach dem Aufenthalt fair um Bewertung bitten",
    pitch: "Eine Dankesnachricht, die zufriedene und unzufriedene Gäste gleich einlädt, ohne Belohnung, ganz rechtssicher.",
    value: { kind: "money", estimate: "+0,1–0,3 Sterne/Jahr" },
    botSlug: "mecky",
    starterPrompt:
      "Schreib für {orgName} eine kurze Dankesnachricht nach Abreise, die um eine ehrliche Bewertung bittet: an alle Gäste gleich, ohne Gutschein oder Gegenleistung, ohne nur Zufriedene anzusprechen.",
    requiredTools: ["write_file", "remember"],
    signals: [S.tourism, S.restaurant, S.lowRating],
    tier: "business",
  },

  // ─── Kommune und Amt ───────────────────────────────────────────────────────
  {
    id: "kommune-faq",
    audience: ["kommune"],
    title: "Häufige Bürgerfragen einmal gut beantworten",
    pitch: "Aus wiederkehrenden Anfragen wird eine geprüfte FAQ, die Mecky rund um die Uhr ausspielt.",
    value: { kind: "time", estimate: "≈ 10 Std./Monat im Amt" },
    botSlug: "recherche",
    starterPrompt:
      "Hilf {orgName}, die zehn häufigsten Bürgerfragen zu sammeln (Müll, Ummeldung, Hundesteuer, Bauantrag, Veranstaltungen anmelden). Formuliere Antworten in einfacher Sprache mit Link zur zuständigen Stelle, als Entwurf zur Freigabe durch das Amt.",
    requiredTools: ["search_roebel", "fetch_url", "write_file"],
    signals: [S.kommune],
    tier: "business",
  },
  {
    id: "kommune-council-summary",
    audience: ["kommune", "citizen"],
    title: "Stadtvertretung in fünf Sätzen",
    pitch: "Nach jeder Sitzung eine neutrale Zusammenfassung der Beschlüsse in einfacher Sprache für den Feed.",
    value: { kind: "good", estimate: "mehr Beteiligung" },
    botSlug: "recherche",
    starterPrompt:
      "Fass die letzte Sitzung der Stadtvertretung Röbel neutral in fünf Sätzen zusammen: was wurde beschlossen, was bedeutet es für Bürger, wo gibt es das Protokoll. Ich gebe dir den Link oder das Dokument. Beitrag nur nach Freigabe.",
    requiredTools: ["fetch_url", "write_file", "create_feed_post"],
    signals: [S.kommune, S.citizen],
    tier: "plus",
  },
  {
    id: "kommune-construction-notice",
    audience: ["kommune"],
    title: "Baustellen und Sperrungen verständlich melden",
    pitch: "Aus der amtlichen Bekanntmachung wird ein kurzer Feed-Beitrag mit Zeitraum, Umleitung und Ansprechpartner.",
    value: { kind: "time", estimate: "≈ 3 Std./Monat" },
    botSlug: "mecky",
    starterPrompt:
      "Mach aus dieser Bekanntmachung von {orgName} einen kurzen, verständlichen Beitrag: was ist gesperrt, von wann bis wann, welche Umleitung, wen rufe ich an. Beitrag nur nach Freigabe.",
    requiredTools: ["fetch_url", "create_feed_post"],
    signals: [S.kommune],
    tier: "business",
  },
  {
    id: "kommune-participation",
    audience: ["kommune"],
    title: "Meinungsbild zu einem Ortsthema aufsetzen",
    pitch: "Frage, neutrale Hintergrundinfos und Zeitplan für ein Meinungsbild in der App, das der Stadtvertretung eine Stimmung zeigt.",
    value: { kind: "good", estimate: "Bürgerstimme in Wochen statt Monaten" },
    botSlug: "recherche",
    starterPrompt:
      "{orgName} möchte die Meinung der Bürger zu einem Thema einholen (ich nenne es gleich). Formuliere eine neutrale Frage, zwei, drei Antwortoptionen, einen ausgewogenen Hintergrundtext und einen Zeitplan. Es ist ein Meinungsbild, keine verbindliche Abstimmung.",
    requiredTools: ["list_proposals", "search_roebel", "write_file", "ask_options"],
    signals: [S.kommune],
    tier: "business",
  },
  {
    id: "kommune-grant-radar",
    audience: ["kommune", "verein"],
    title: "Förderradar für Gemeinde und Vereine",
    pitch: "Einmal im Monat neue Förderaufrufe von Land, Bund und EU mit Frist, passend für Röbel und seine Vereine.",
    value: { kind: "money", estimate: "Fristen nicht mehr verpassen" },
    botSlug: "recherche",
    starterPrompt:
      "Stell für {orgName} einmal im Monat neue Förderaufrufe zusammen, die für Röbel und die Vereine im Amt passen: Land MV, LEADER, Bund, Stiftungen. Pro Aufruf: Frist, Höhe, Eigenanteil, wer antragsberechtigt ist, Link.",
    requiredTools: ["web_search", "fetch_url", "write_file", "create_routine"],
    signals: [S.kommune, S.verein, S.grantWindow],
    tier: "ultra",
    recurring: { suggestion: "am 1. jedes Monats 8:00" },
  },
];

const VALUE_WEIGHT: Record<InspirationTask["value"]["kind"], number> = { money: 3, time: 2, good: 1 };

/**
 * Rank the catalog for one viewer.
 *
 * - Only tasks whose `audience` includes `audience` are candidates.
 * - Score = 10 × matched signals + value weight (money > time > good) + 1 if the task can become a routine.
 * - Stable: ties keep catalog order.
 * - At most `ceil(limit / 2)` tasks per bot, so the screen shows a mix of mascots when enough candidates exist.
 */
export function rankInspiration(
  tasks: InspirationTask[],
  signals: Set<string>,
  audience: Audience,
  limit: number,
): InspirationTask[] {
  if (limit <= 0) return [];
  const scored = tasks
    .map((task, index) => {
      if (!task.audience.includes(audience)) return null;
      const matched = task.signals.reduce((n, s) => (signals.has(s) ? n + 1 : n), 0);
      const score = matched * 10 + VALUE_WEIGHT[task.value.kind] + (task.recurring ? 1 : 0);
      return { task, index, score };
    })
    .filter((x): x is { task: InspirationTask; index: number; score: number } => x !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const perBotCap = Math.max(1, Math.ceil(limit / 2));
  const perBot = new Map<string, number>();
  const picked: InspirationTask[] = [];
  const overflow: InspirationTask[] = [];
  for (const { task } of scored) {
    const key = task.botSlug ?? "none";
    const used = perBot.get(key) ?? 0;
    if (used < perBotCap) {
      perBot.set(key, used + 1);
      picked.push(task);
      if (picked.length === limit) return picked;
    } else {
      overflow.push(task);
    }
  }
  // Not enough variety: fill the remaining slots in score order.
  return picked.concat(overflow).slice(0, limit);
}
