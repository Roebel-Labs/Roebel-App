import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────────────

export type FortuneCategory = 'liebe' | 'kraft' | 'weisheit' | 'glueck' | 'wandel';

export type FortuneCard = {
  id: number;
  name: string;
  emoji: string;
  category: FortuneCategory;
  spruch: string;
  beschreibung: string;
  farbe: string;
};

// ─── Card Data (30 German Fortune Cards) ─────────────────────

export const FORTUNE_CARDS: FortuneCard[] = [
  // === LIEBE (Love) ===
  {
    id: 1,
    name: 'Liebe',
    emoji: '❤️',
    category: 'liebe',
    spruch: 'Die Liebe ist heute dein stärkster Begleiter. Öffne dein Herz und lass sie hinein.',
    beschreibung: 'Heute strahlt die Energie der Liebe besonders stark. Ob in der Partnerschaft, Familie oder Freundschaft — zeige den Menschen um dich herum, wie viel sie dir bedeuten.',
    farbe: '#E91E63',
  },
  {
    id: 2,
    name: 'Treue',
    emoji: '🤝',
    category: 'liebe',
    spruch: 'Wahre Treue zeigt sich nicht in großen Gesten, sondern in den kleinen Momenten des Alltags.',
    beschreibung: 'Beständigkeit ist ein Geschenk. Heute darfst du erkennen, wer wirklich zu dir steht — und wem du selbst ein Fels in der Brandung bist.',
    farbe: '#C2185B',
  },
  {
    id: 3,
    name: 'Verbundenheit',
    emoji: '🔗',
    category: 'liebe',
    spruch: 'Du bist nicht allein. Unsichtbare Fäden verbinden dich mit den Menschen, die dich lieben.',
    beschreibung: 'Spüre die tiefe Verbindung zu deinen Liebsten. Ein Anruf, eine Nachricht oder ein Lächeln kann heute Wunder wirken.',
    farbe: '#AD1457',
  },
  {
    id: 4,
    name: 'Harmonie',
    emoji: '☯️',
    category: 'liebe',
    spruch: 'Suche heute das Gleichgewicht — in dir selbst und in deinen Beziehungen.',
    beschreibung: 'Harmonie entsteht, wenn du Verständnis zeigst und Kompromisse eingehst. Heute ist ein guter Tag, um Frieden zu stiften.',
    farbe: '#880E4F',
  },
  {
    id: 5,
    name: 'Mitgefühl',
    emoji: '🕊️',
    category: 'liebe',
    spruch: 'Dein Mitgefühl ist eine Superkraft. Nutze sie heute großzügig.',
    beschreibung: 'Wenn du die Welt mit den Augen anderer siehst, öffnen sich neue Türen. Deine Empathie wird heute jemandem den Tag verschönern.',
    farbe: '#F06292',
  },
  {
    id: 6,
    name: 'Geborgenheit',
    emoji: '🏡',
    category: 'liebe',
    spruch: 'Heute findest du Geborgenheit dort, wo du sie am wenigsten erwartest.',
    beschreibung: 'Sicherheit kommt nicht immer von außen. Manchmal reicht es, bei sich selbst anzukommen und sich zu Hause zu fühlen — egal wo du bist.',
    farbe: '#EC407A',
  },

  // === KRAFT (Strength) ===
  {
    id: 7,
    name: 'Mut',
    emoji: '🦁',
    category: 'kraft',
    spruch: 'Heute ist der Tag, an dem du über dich hinauswächst. Trau dich!',
    beschreibung: 'Mut bedeutet nicht, keine Angst zu haben. Es bedeutet, trotz der Angst einen Schritt nach vorne zu machen. Du schaffst das!',
    farbe: '#FF6D00',
  },
  {
    id: 8,
    name: 'Kraft',
    emoji: '💪',
    category: 'kraft',
    spruch: 'In dir steckt mehr Kraft, als du ahnst. Nutze sie weise.',
    beschreibung: 'Deine innere Stärke wird heute auf die Probe gestellt — und du wirst bestehen. Vertraue auf deine Fähigkeiten.',
    farbe: '#E65100',
  },
  {
    id: 9,
    name: 'Entschlossenheit',
    emoji: '🎯',
    category: 'kraft',
    spruch: 'Setze dir heute ein Ziel und verfolge es mit voller Entschlossenheit.',
    beschreibung: 'Fokus ist der Schlüssel zum Erfolg. Lass dich nicht ablenken und halte an deiner Vision fest. Der Weg wird sich zeigen.',
    farbe: '#BF360C',
  },
  {
    id: 10,
    name: 'Ausdauer',
    emoji: '🏔️',
    category: 'kraft',
    spruch: 'Auch der längste Weg beginnt mit einem einzigen Schritt. Bleib dran!',
    beschreibung: 'Geduld und Beharrlichkeit werden heute belohnt. Was sich langsam aufbaut, hat ein starkes Fundament.',
    farbe: '#D84315',
  },
  {
    id: 11,
    name: 'Leidenschaft',
    emoji: '🔥',
    category: 'kraft',
    spruch: 'Lass dein inneres Feuer heute hell brennen. Deine Leidenschaft steckt andere an!',
    beschreibung: 'Begeisterung ist ansteckend. Was auch immer dich heute bewegt — tu es mit vollem Herzen und lass deine Energie fließen.',
    farbe: '#FF3D00',
  },
  {
    id: 12,
    name: 'Schutz',
    emoji: '🛡️',
    category: 'kraft',
    spruch: 'Du bist stärker, als du denkst. Heute bist du dein eigener Schutzschild.',
    beschreibung: 'Grenzen setzen ist kein Zeichen von Schwäche, sondern von Stärke. Schütze deine Energie und investiere sie dort, wo es sich lohnt.',
    farbe: '#DD2C00',
  },

  // === WEISHEIT (Wisdom) ===
  {
    id: 13,
    name: 'Weisheit',
    emoji: '🦉',
    category: 'weisheit',
    spruch: 'Höre auf deine innere Stimme — sie kennt den Weg.',
    beschreibung: 'Weisheit kommt nicht nur aus Büchern. Deine Lebenserfahrung ist ein Schatz, der dich heute sicher durch den Tag führt.',
    farbe: '#5C6BC0',
  },
  {
    id: 14,
    name: 'Klarheit',
    emoji: '💎',
    category: 'weisheit',
    spruch: 'Heute lichten sich die Nebel. Was vorher unklar war, wird jetzt deutlich.',
    beschreibung: 'Ein Moment der Klarheit erwartet dich. Nutze ihn, um wichtige Entscheidungen zu treffen und deinen Weg neu auszurichten.',
    farbe: '#3F51B5',
  },
  {
    id: 15,
    name: 'Intuition',
    emoji: '🔮',
    category: 'weisheit',
    spruch: 'Dein Bauchgefühl lügt nicht. Vertraue ihm heute besonders.',
    beschreibung: 'Manchmal weiß das Herz mehr als der Kopf. Lass dich heute von deiner Intuition leiten — sie führt dich zum richtigen Ort.',
    farbe: '#7C4DFF',
  },
  {
    id: 16,
    name: 'Geduld',
    emoji: '🌱',
    category: 'weisheit',
    spruch: 'Gute Dinge brauchen Zeit. Heute ist Geduld deine größte Stärke.',
    beschreibung: 'Nicht alles muss sofort passieren. Wie ein Samenkorn, das langsam keimt, reifen auch deine Pläne im Stillen heran.',
    farbe: '#304FFE',
  },
  {
    id: 17,
    name: 'Stille',
    emoji: '🧘',
    category: 'weisheit',
    spruch: 'In der Stille findest du die Antworten, die du suchst.',
    beschreibung: 'Gönne dir heute einen Moment der Ruhe. Im Schweigen offenbart sich oft mehr als in tausend Worten.',
    farbe: '#6200EA',
  },
  {
    id: 18,
    name: 'Erkenntnis',
    emoji: '💡',
    category: 'weisheit',
    spruch: 'Ein Geistesblitz erwartet dich heute. Sei offen für neue Einsichten!',
    beschreibung: 'Manchmal reicht ein einziger Gedanke, um alles in ein neues Licht zu rücken. Halte die Augen offen für Aha-Momente.',
    farbe: '#651FFF',
  },

  // === GLÜCK (Fortune/Joy) ===
  {
    id: 19,
    name: 'Freude',
    emoji: '☀️',
    category: 'glueck',
    spruch: 'Ein Lächeln kann heute Berge versetzen. Teile deine Freude!',
    beschreibung: 'Die Sonne scheint in deinem Herzen. Lass diese Wärme heute nach außen strahlen und stecke andere mit deiner guten Laune an.',
    farbe: '#FFB300',
  },
  {
    id: 20,
    name: 'Dankbarkeit',
    emoji: '🙏',
    category: 'glueck',
    spruch: 'Dankbarkeit verwandelt das, was du hast, in genug.',
    beschreibung: 'Nimm dir heute einen Moment, um die kleinen Dinge zu schätzen. Das warme Frühstück, ein freundliches Wort, ein Dach über dem Kopf.',
    farbe: '#FFA000',
  },
  {
    id: 21,
    name: 'Fülle',
    emoji: '🍀',
    category: 'glueck',
    spruch: 'Das Glück ist näher, als du denkst. Heute öffnen sich neue Türen!',
    beschreibung: 'Fülle zeigt sich in vielen Formen — nicht nur materiell. Achte auf die reichen Momente des Tages.',
    farbe: '#FF8F00',
  },
  {
    id: 22,
    name: 'Leichtigkeit',
    emoji: '🎈',
    category: 'glueck',
    spruch: 'Lass los, was dich beschwert. Heute darfst du leicht sein.',
    beschreibung: 'Nicht jedes Problem muss sofort gelöst werden. Manchmal hilft es, die Dinge mit Humor und Leichtigkeit zu nehmen.',
    farbe: '#F57F17',
  },
  {
    id: 23,
    name: 'Segen',
    emoji: '✨',
    category: 'glueck',
    spruch: 'Heute steht ein besonderer Segen über deinem Tag. Nimm ihn an!',
    beschreibung: 'Manche Tage haben eine besondere Magie. Heute ist so ein Tag — genieße jeden Augenblick.',
    farbe: '#FFD600',
  },
  {
    id: 24,
    name: 'Sonnenschein',
    emoji: '🌻',
    category: 'glueck',
    spruch: 'Du bist der Sonnenschein im Leben anderer. Strahle heute besonders hell!',
    beschreibung: 'Deine positive Energie ist ein Geschenk für alle um dich herum. Heute wirst du jemandem den Tag retten, ohne es zu wissen.',
    farbe: '#FFAB00',
  },

  // === WANDEL (Change) ===
  {
    id: 25,
    name: 'Veränderung',
    emoji: '🦋',
    category: 'wandel',
    spruch: 'Veränderung ist der Wind des Fortschritts. Lass dich tragen.',
    beschreibung: 'Wie die Raupe zum Schmetterling wird, durchläufst auch du eine Verwandlung. Vertraue dem Prozess.',
    farbe: '#00897B',
  },
  {
    id: 26,
    name: 'Neubeginn',
    emoji: '🌅',
    category: 'wandel',
    spruch: 'Jeder Sonnenaufgang ist eine Einladung, neu zu beginnen.',
    beschreibung: 'Egal was gestern war — heute ist ein neuer Tag mit neuen Möglichkeiten. Nutze die frische Energie des Neubeginns.',
    farbe: '#00796B',
  },
  {
    id: 27,
    name: 'Loslassen',
    emoji: '🍂',
    category: 'wandel',
    spruch: 'Manchmal muss man loslassen, um Platz für Neues zu schaffen.',
    beschreibung: 'Wie der Baum im Herbst seine Blätter abwirft, darfst auch du heute Altes gehen lassen. Es macht Platz für neues Wachstum.',
    farbe: '#00695C',
  },
  {
    id: 28,
    name: 'Überraschung',
    emoji: '🎁',
    category: 'wandel',
    spruch: 'Das Leben hat heute eine Überraschung für dich! Bleib offen.',
    beschreibung: 'Die schönsten Momente sind oft die unerwarteten. Lass dich heute überraschen und freue dich auf das Unbekannte.',
    farbe: '#26A69A',
  },
  {
    id: 29,
    name: 'Abenteuer',
    emoji: '🧭',
    category: 'wandel',
    spruch: 'Heute ruft das Abenteuer! Wage etwas Neues und staune.',
    beschreibung: 'Verlasse deine Komfortzone — nur einen kleinen Schritt. Du wirst überrascht sein, welche Schätze jenseits des Bekannten auf dich warten.',
    farbe: '#009688',
  },
  {
    id: 30,
    name: 'Wachstum',
    emoji: '🌳',
    category: 'wandel',
    spruch: 'Du wächst mit jeder Erfahrung. Heute bist du stärker als gestern.',
    beschreibung: 'Jeder Tag bringt eine neue Lektion. Sieh Herausforderungen als Chancen, über dich hinauszuwachsen und dein bestes Selbst zu werden.',
    farbe: '#00BFA5',
  },
];

// ─── Category Colors (for card back gradient) ────────────────

export const CATEGORY_COLORS: Record<FortuneCategory, [string, string]> = {
  liebe: ['#E91E63', '#AD1457'],
  kraft: ['#FF6D00', '#BF360C'],
  weisheit: ['#7C4DFF', '#304FFE'],
  glueck: ['#FFB300', '#F57F17'],
  wandel: ['#26A69A', '#00695C'],
};

// ─── Daily Card Logic ────────────────────────────────────────

const STORAGE_KEY = '@fortune_card_today';

function hashDate(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function getDailyCardIndex(): number {
  const today = getTodayString();
  return hashDate(today) % FORTUNE_CARDS.length;
}

export function getDailyCard(): FortuneCard {
  return FORTUNE_CARDS[getDailyCardIndex()];
}

export async function getOrSetDailyCard(): Promise<FortuneCard> {
  const today = getTodayString();
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.date === today) {
        return FORTUNE_CARDS[parsed.cardId - 1] ?? getDailyCard();
      }
    }
  } catch {}

  const card = getDailyCard();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, cardId: card.id }));
  } catch {}
  return card;
}

// ─── Mecky Speech Lines ──────────────────────────────────────

export const MECKY_LINES = {
  idle: 'Wische kräftig, um\ndein Glück zu finden!',
  spinning: 'Ohhh, spannend! 🎉',
  stopped: 'Tippe auf die Karte!',
  revealed: [
    'Was für eine tolle Karte! ✨',
    'Das passt perfekt zu dir! 🌟',
    'Ein wundervoller Tag! 💫',
    'Mecky ist begeistert! 🎊',
    'Das Glück ist auf deiner Seite! 🍀',
  ],
};

export function getRandomRevealLine(): string {
  return MECKY_LINES.revealed[Math.floor(Math.random() * MECKY_LINES.revealed.length)];
}
