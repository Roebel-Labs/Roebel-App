// ─── Types ───────────────────────────────────────────────────

export type ZodiacElement = 'Feuer' | 'Erde' | 'Luft' | 'Wasser';

export type ZodiacSign = {
  id: string;
  name: string;
  symbol: string;
  dateRange: string;
  element: ZodiacElement;
  trait: string;
  horoscopes: string[];
};

export type DailyHoroscope = {
  text: string;
  liebe: number;   // 1-5
  beruf: number;    // 1-5
  gesundheit: number; // 1-5
};

// ─── Element Colors ──────────────────────────────────────────

export const ELEMENT_COLORS: Record<ZodiacElement, string> = {
  Feuer: '#E53935',
  Erde: '#6D4C41',
  Luft: '#42A5F5',
  Wasser: '#26C6DA',
};

// ─── Zodiac Data (12 Signs) ─────────────────────────────────

export const ZODIAC_SIGNS: ZodiacSign[] = [
  {
    id: 'aries',
    name: 'Widder',
    symbol: '♈',
    dateRange: '21.03 – 20.04',
    element: 'Feuer',
    trait: 'Dynamisch & willensstark',
    horoscopes: [
      'Die Sterne stehen günstig für mutige Entscheidungen. Dein Tatendrang wird heute belohnt — nutze die Energie, um lang aufgeschobene Projekte anzupacken. In der Liebe wartet eine überraschende Begegnung.',
      'Heute spürst du eine besondere innere Kraft. Lass dich nicht von Kleinigkeiten bremsen — dein Feuergeist will lodern! Im Beruf eröffnen sich neue Wege, wenn du den ersten Schritt wagst.',
      'Deine Leidenschaft ist ansteckend! Heute ziehst du Menschen magisch an. Achte auf deine Gesundheit und gönne dir eine kreative Pause — dein Körper braucht den Ausgleich.',
      'Ein unerwarteter Impuls bringt Schwung in deinen Alltag. Folge deiner Intuition, auch wenn der Weg ungewöhnlich erscheint. Die Sterne versprechen Glück in der Liebe.',
      'Dein Pioniergeist ist heute gefragt! Wage etwas Neues und verlasse deine Komfortzone. Beruflich stehen die Zeichen auf Erfolg — zeige, was in dir steckt.',
    ],
  },
  {
    id: 'taurus',
    name: 'Stier',
    symbol: '♉',
    dateRange: '21.04 – 21.05',
    element: 'Erde',
    trait: 'Verlässlich & sinnlich',
    horoscopes: [
      'Heute ist ein Tag der Genüsse. Verwöhne dich und deine Liebsten — die Sterne belohnen deine Treue. Im Beruf zahlt sich deine Beständigkeit aus.',
      'Deine Bodenständigkeit ist heute dein größter Trumpf. Vertraue auf das, was du aufgebaut hast. In der Liebe wartet ein tiefer, bedeutungsvoller Moment.',
      'Die Sterne laden dich ein, deine kreative Seite zu entdecken. Gönn dir etwas Schönes und lass die Seele baumeln. Gesundheitlich fühlst du dich besonders stark.',
      'Finanzielle Angelegenheiten klären sich heute wie von selbst. Deine geduldige Art wird belohnt. In der Partnerschaft herrscht tiefe Harmonie.',
      'Ein Tag voller sinnlicher Freuden erwartet dich. Die Natur ruft — ein Spaziergang bringt neue Klarheit. Beruflich erntest du die Früchte harter Arbeit.',
    ],
  },
  {
    id: 'gemini',
    name: 'Zwillinge',
    symbol: '♊',
    dateRange: '22.05 – 21.06',
    element: 'Luft',
    trait: 'Kommunikativ & vielseitig',
    horoscopes: [
      'Deine Worte haben heute besondere Kraft. Nutze dein Kommunikationstalent, um Brücken zu bauen. Ein spannendes Gespräch könnte dein Leben verändern.',
      'Die Sterne beflügeln deine Neugier! Lerne etwas Neues, lies ein Buch oder führe ein tiefgründiges Gespräch. In der Liebe sorgt dein Charme für Schmetterlinge.',
      'Deine Vielseitigkeit ist heute gefragt. Jongliere geschickt zwischen verschiedenen Aufgaben — du schaffst das spielend. Ein Freund braucht deinen guten Rat.',
      'Heute funken die Ideen nur so! Schreib sie auf, bevor sie verfliegen. Beruflich öffnet sich eine Tür, die du lange gesucht hast. Bleib offen für Überraschungen.',
      'Soziale Kontakte bringen heute Glück. Triff alte Freunde oder knüpfe neue Verbindungen. Deine geistige Beweglichkeit beeindruckt alle um dich herum.',
    ],
  },
  {
    id: 'cancer',
    name: 'Krebs',
    symbol: '♋',
    dateRange: '22.06 – 22.07',
    element: 'Wasser',
    trait: 'Einfühlsam & fürsorglich',
    horoscopes: [
      'Deine emotionale Tiefe ist heute deine Superkraft. Höre auf dein Herz und folge deinen Gefühlen. Familie und Zuhause stehen unter einem besonders guten Stern.',
      'Die Mondenergie stärkt heute deine Intuition. Vertraue deinem Bauchgefühl bei wichtigen Entscheidungen. Ein liebevoller Moment mit einem Nahestehenden erwartet dich.',
      'Heute darfst du fürsorglich sein — vor allem zu dir selbst. Gönn dir Ruhe und Geborgenheit. Beruflich zahlst du auf ein langfristiges Konto ein.',
      'Deine Empathie berührt heute die Menschen um dich herum. Ein ehrliches Gespräch kann eine Beziehung vertiefen. Gesundheitlich profitierst du von Wasser — trinke viel!',
      'Kreative Energie durchströmt dich! Egal ob Kochen, Malen oder Schreiben — drücke deine Gefühle aus. In der Liebe zeigt sich wahre Verbundenheit.',
    ],
  },
  {
    id: 'leo',
    name: 'Löwe',
    symbol: '♌',
    dateRange: '23.07 – 23.08',
    element: 'Feuer',
    trait: 'Charismatisch & großzügig',
    horoscopes: [
      'Heute gehört die Bühne dir! Dein Charisma strahlt heller als je zuvor. Nutze diese Energie, um andere zu inspirieren. In der Liebe bist du unwiderstehlich.',
      'Die Sonne lacht dir ins Gesicht. Deine Großzügigkeit wird heute tausendfach zurückkommen. Beruflich stehst du im Rampenlicht — und du verdienst es!',
      'Dein Löwenherz schlägt heute besonders stark. Steh für das ein, was dir wichtig ist. Ein kreativer Durchbruch wartet nur darauf, entdeckt zu werden.',
      'Heute magst du der Mittelpunkt sein — aber vergiss nicht die leisen Töne. Ein herzliches Wort kann heute Wunder wirken. Gesundheitlich: Sonne tanken!',
      'Dein königlicher Auftritt beeindruckt heute alle. Führe mit Herz und Verstand. In Beziehungen zeigt sich, wer wirklich zu dir steht.',
    ],
  },
  {
    id: 'virgo',
    name: 'Jungfrau',
    symbol: '♍',
    dateRange: '24.08 – 23.09',
    element: 'Erde',
    trait: 'Analytisch & perfektionistisch',
    horoscopes: [
      'Dein scharfer Verstand löst heute jedes Rätsel. Nutze deine analytischen Fähigkeiten für wichtige Entscheidungen. In der Liebe darfst du auch mal unperfekt sein.',
      'Die Sterne fördern deine Detailarbeit. Was andere übersehen, entdeckst du. Beruflich bringt dich diese Gabe einen großen Schritt weiter. Gesundheit: Ordnung schaffen befreit!',
      'Heute ist der perfekte Tag, um Dinge in Ordnung zu bringen. Dein Organisationstalent wird bewundert. In Beziehungen zeigt sich: Fürsorge ist deine Sprache der Liebe.',
      'Dein pragmatischer Blick hilft heute jemandem aus der Patsche. Vergiss dabei nicht, auch auf dich selbst zu achten. Ein ruhiger Abend tut Körper und Seele gut.',
      'Kreative Lösungen fallen dir heute leicht. Verbinde Logik mit Intuition — das Ergebnis wird dich überraschen. Die Sterne stehen günstig für Gesundheitsvorhaben.',
    ],
  },
  {
    id: 'libra',
    name: 'Waage',
    symbol: '♎',
    dateRange: '24.09 – 23.10',
    element: 'Luft',
    trait: 'Diplomatisch & harmoniebedürftig',
    horoscopes: [
      'Heute findest du die perfekte Balance. Dein Sinn für Harmonie bringt Frieden in aufgewühlte Situationen. In der Liebe erlebst du einen magischen Gleichklang.',
      'Deine diplomatische Ader ist heute besonders gefragt. Vermittle zwischen verschiedenen Standpunkten — du findest den goldenen Mittelweg. Beruflich zahlt sich Teamarbeit aus.',
      'Ästhetik und Schönheit berühren heute dein Herz. Umgib dich mit schönen Dingen und Menschen, die dich inspirieren. Gesundheitlich: Gleichgewicht in allem!',
      'Die Venus schenkt dir heute besonderen Charme. Nutze ihn weise in Verhandlungen und in der Liebe. Ein kulturelles Erlebnis bereichert deinen Tag.',
      'Entscheidungen fallen dir heute leichter als sonst. Vertraue deinem Gefühl für das Richtige. In Partnerschaften herrscht eine wunderbare Harmonie.',
    ],
  },
  {
    id: 'scorpio',
    name: 'Skorpion',
    symbol: '♏',
    dateRange: '24.10 – 22.11',
    element: 'Wasser',
    trait: 'Tiefgründig & leidenschaftlich',
    horoscopes: [
      'Deine intensive Ausstrahlung ist heute unwiderstehlich. Tauche tief ein in das, was dich bewegt — die Wahrheit liegt unter der Oberfläche. Leidenschaftliche Begegnungen warten!',
      'Die Sterne enthüllen heute ein Geheimnis. Dein Spürsinn führt dich zur richtigen Antwort. Beruflich kannst du mit deiner Durchsetzungskraft Berge versetzen.',
      'Transformation liegt in der Luft! Lass Altes hinter dir und begrüße das Neue. In der Liebe öffnet sich eine Tür zu tieferer Verbundenheit.',
      'Deine emotionale Stärke trägt dich heute durch jede Herausforderung. Vertraue deiner Intuition — sie trügt nicht. Gesundheitlich: Wasser ist dein Element, nutze es!',
      'Heute spürst du die verborgenen Strömungen um dich herum. Nutze dieses Wissen weise. Ein leidenschaftliches Projekt verdient deine volle Aufmerksamkeit.',
    ],
  },
  {
    id: 'sagittarius',
    name: 'Schütze',
    symbol: '♐',
    dateRange: '23.11 – 21.12',
    element: 'Feuer',
    trait: 'Abenteuerlustig & optimistisch',
    horoscopes: [
      'Das Abenteuer ruft! Heute ist der perfekte Tag für neue Erfahrungen. Dein Optimismus steckt alle an. In der Liebe wartet ein spontanes, unvergessliches Erlebnis.',
      'Dein philosophischer Geist findet heute tiefe Einsichten. Ein Gespräch über den Sinn des Lebens bringt dich weiter. Beruflich eröffnen sich internationale Möglichkeiten.',
      'Freiheit ist dein höchstes Gut — und heute spürst du sie besonders intensiv. Plane eine Reise oder entdecke einen neuen Ort in deiner Nähe. Gesundheit: Bewegung tut gut!',
      'Die Sterne unterstützen deine Großherzigkeit. Teile dein Wissen und deine Begeisterung. Ein spontaner Ausflug bringt neue Perspektiven und Glücksmomente.',
      'Dein Pfeil trifft heute ins Schwarze! Setze dir ein ambitioniertes Ziel und verfolge es. In Beziehungen bringt Ehrlichkeit euch näher zusammen.',
    ],
  },
  {
    id: 'capricorn',
    name: 'Steinbock',
    symbol: '♑',
    dateRange: '22.12 – 20.01',
    element: 'Erde',
    trait: 'Ehrgeizig & diszipliniert',
    horoscopes: [
      'Dein Ehrgeiz zahlt sich heute aus. Ein lang ersehntes Ziel rückt in greifbare Nähe. Bleib dran — die Sterne belohnen deine Disziplin. In der Liebe: Zeige deine weiche Seite.',
      'Struktur und Ordnung bringen heute Klarheit. Nutze den Tag für wichtige Planungen. Beruflich erntest du Respekt für deine Leistung. Gesundheit: Regelmäßigkeit ist der Schlüssel.',
      'Die Sterne stärken deine Führungsqualitäten. Übernimm Verantwortung — andere vertrauen deinem Urteil. Ein Familienmoment bringt Wärme in deinen Tag.',
      'Geduld ist deine Stärke, und heute wird sie besonders belohnt. Was langsam wächst, hält lange. In Beziehungen zeigt sich die Tiefe wahrer Verbundenheit.',
      'Heute schaffst du Fundamente für die Zukunft. Dein praktischer Sinn findet Lösungen, wo andere aufgeben. Ein finanzieller Lichtblick am Horizont!',
    ],
  },
  {
    id: 'aquarius',
    name: 'Wassermann',
    symbol: '♒',
    dateRange: '21.01 – 19.02',
    element: 'Luft',
    trait: 'Visionär & unkonventionell',
    horoscopes: [
      'Deine visionären Ideen sind heute gefragt! Denke groß und lass dich nicht einschränken. In der Liebe überrascht dich jemand mit einer unerwarteten Geste.',
      'Die Sterne fördern deinen Erfindungsgeist. Eine unkonventionelle Lösung liegt in der Luft. Beruflich profitierst du von Networking und frischen Kontakten.',
      'Heute bist du deiner Zeit voraus. Teile deine Visionen mit Gleichgesinnten — gemeinsam könnt ihr Großes bewegen. Gesundheitlich: Frische Luft belebt den Geist!',
      'Dein Freiheitsgeist leuchtet heute besonders hell. Brich mit Routinen und probiere etwas Unerwartetes. In Freundschaften zeigt sich wahre Loyalität.',
      'Innovation ist dein Motto des Tages. Eine technische oder kreative Idee verdient es, verfolgt zu werden. Die Sterne begünstigen humanitäre Vorhaben.',
    ],
  },
  {
    id: 'pisces',
    name: 'Fische',
    symbol: '♓',
    dateRange: '20.02 – 20.03',
    element: 'Wasser',
    trait: 'Kreativ & spirituell',
    horoscopes: [
      'Deine Kreativität fließt heute wie ein stiller Strom. Lass dich von deinen Träumen leiten — sie tragen eine wichtige Botschaft. In der Liebe erlebst du eine tiefe seelische Verbindung.',
      'Die Sterne verstärken deine spirituelle Seite. Meditation oder ein Moment der Stille offenbaren dir neue Einsichten. Beruflich führt dein Einfühlungsvermögen zum Erfolg.',
      'Heute bist du besonders empfänglich für die Stimmungen um dich herum. Schütze deine Energie und umgib dich mit positiven Menschen. Kunst und Musik heilen die Seele.',
      'Dein mitfühlendes Herz berührt heute andere tief. Eine helfende Geste wird vielfach zurückkommen. Gesundheitlich: Wasser in jeder Form tut dir gut — Baden, Trinken, Meer!',
      'Die mystische Seite des Lebens ruft dich. Folge deiner Intuition und vertraue dem Universum. Ein kreativer Durchbruch wartet hinter der nächsten Ecke.',
    ],
  },
];

// ─── Daily Horoscope Logic ──────────────────────────────────

function hashDate(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function getDailyHoroscope(signId: string): DailyHoroscope {
  const sign = ZODIAC_SIGNS.find(s => s.id === signId);
  if (!sign) {
    return { text: 'Sternzeichen nicht gefunden.', liebe: 3, beruf: 3, gesundheit: 3 };
  }

  const today = getTodayString();
  const hash = hashDate(today + signId);
  const textIndex = hash % sign.horoscopes.length;

  // Generate deterministic ratings (1-5) based on date + sign
  const liebeHash = hashDate(today + signId + 'liebe');
  const berufHash = hashDate(today + signId + 'beruf');
  const gesundheitHash = hashDate(today + signId + 'gesundheit');

  return {
    text: sign.horoscopes[textIndex],
    liebe: (liebeHash % 5) + 1,
    beruf: (berufHash % 5) + 1,
    gesundheit: (gesundheitHash % 5) + 1,
  };
}

export function getZodiacById(signId: string): ZodiacSign | undefined {
  return ZODIAC_SIGNS.find(s => s.id === signId);
}
