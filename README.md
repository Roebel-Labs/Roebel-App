# Roebel App

Open-Source Civic-Technology-Plattform fuer Roebel/Mueritz, Mecklenburg-Vorpommern -- eine Blaupause fuer Kleinstaedte, die digitale Buergerinfrastruktur aufbauen wollen.

Teil der **Roebel Solarpunk 2035** Vision: Eine kleine Seenstadt in Deutschlands erstes Solarpunk Smart Village verwandeln.

## Was steckt drin

Dieses [Turborepo](https://turbo.build/repo)-Monorepo enthaelt:

### Apps

| App | Beschreibung | Stack |
|-----|-------------|-------|
| **[apps/web](apps/web/)** | Roebel Webseite | Next.js 15, Tailwind CSS, thirdweb v5 |
| **[apps/expo](apps/expo/)** | Roebel Mobile App (iOS + Android) | Expo SDK 55, React Native, thirdweb v5 |

### Pakete

| Paket | Beschreibung |
|-------|-------------|
| **[packages/config](packages/config/)** | Geteilte ESLint- und TypeScript-Konfigurationen |
| **[packages/blockchain](packages/blockchain/)** | Contract ABIs, Adressen, thirdweb-Utilities |
| **[packages/design-tokens](packages/design-tokens/)** | Geteilte Farben, Abstaende, Typografie-Tokens |

### Smart Contracts

| Contract | Beschreibung |
|----------|-------------|
| **[contracts/governor-contract](contracts/governor-contract/)** | Hardhat Smart Contracts (OpenZeppelin v4.9.6) |

## Erste Schritte

### Voraussetzungen

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (fuer die Mobile App)

### Einrichtung

```bash
# Repository klonen
git clone https://github.com/roebel-app/roebel.git
cd roebel

# Abhaengigkeiten installieren
pnpm install

# Umgebungsvariablen kopieren
cp apps/web/.env.example apps/web/.env.local
cp apps/expo/.env.example apps/expo/.env

# API-Keys in den .env-Dateien eintragen, dann:

# Web-App starten
pnpm dev:web

# Mobile App starten
pnpm dev:expo
```

## Architektur

- **Blockchain**: Base L2 + Thirdweb Smart Wallets (unsichtbares Web3 -- Nutzer sehen kein Wallet)
- **Backend**: Supabase (Postgres, Auth, Realtime, Edge Functions)
- **Governance**: Soulbound NFT Voting + MACI Privacy-Preserving Voting
- **KI**: Claude API fuer den Mecky-Chatbot-Assistenten

## Fork fuer deine Stadt

Diese Plattform ist dafuer gemacht, von jeder Kleinstadt geforkt zu werden:

1. Dieses Repository forken
2. Branding anpassen (Farben, Schriften, Maskottchen) in `packages/design-tokens/`
3. Eigenes Supabase-Projekt deployen
4. Web auf Vercel deployen, Mobile mit EAS bauen
5. Governance Contracts auf Base deployen

Siehe [docs/FORKING_GUIDE.md](docs/FORKING_GUIDE.md) fuer die vollstaendige Anleitung.

## Mitmachen

Wir freuen uns ueber Beitraege! Siehe [CONTRIBUTING.md](CONTRIBUTING.md) fuer Richtlinien.

## Lizenz

[AGPL-3.0](LICENSE) -- nach dem Vorbild von [Decidim](https://decidim.org/) fuer offene Civic Technology.
